/**
 * Model-facing memory tools.
 *
 * Every schema here is a raw JSON Schema object with a single string `type` per
 * node and a string `description`, because tool schemas cross the provider
 * boundary and a malformed keyword can fail a request. The output schemas are
 * intentionally open objects: the tools return small, bounded JSON documents,
 * and the renderers below are defensive against unexpected values.
 */

import { FILE_DEFS, FILE_IDS, LIMITS } from './constants.js'
import { isRecord, makeLogger, messageOf } from './util.js'

const FILE_ENUM = [...FILE_IDS, ...FILE_IDS.map(id => FILE_DEFS[id].name)]

const FILE_DESCRIPTION = `One memory file: ${FILE_IDS.map(id => `${id} (${FILE_DEFS[id].name})`).join(', ')}.`

const TIER_ENUM = ['core', 'important', 'general']

const OUTPUT_SCHEMA = Object.freeze({ type: 'object', additionalProperties: true })

/** Build one tool definition with a safe output renderer. */
function define(name, description, parameters, execute, render, presentCall) {
  return {
    name,
    description,
    parameters,
    output: {
      schema: OUTPUT_SCHEMA,
      render(_args, value) {
        try {
          return [{ type: 'text', text: render(value) }]
        } catch (error) {
          return [{ type: 'text', text: `${name} completed, but its result could not be formatted: ${messageOf(error)}` }]
        }
      },
    },
    execute,
    ...presentCall === undefined ? {} : { presentCall },
  }
}

/** Read a required string argument. */
function requireString(args, key, label = key) {
  if (!isRecord(args) || typeof args[key] !== 'string' || args[key].trim().length === 0) {
    throw new Error(`${label} must be a non-empty string`)
  }
  return args[key].trim()
}

/** Read an optional string argument. */
function optionalString(args, key) {
  return isRecord(args) && typeof args[key] === 'string' ? args[key].trim() : ''
}

/** Read an optional boolean argument. */
function optionalBoolean(args, key, fallback = false) {
  return isRecord(args) && typeof args[key] === 'boolean' ? args[key] : fallback
}

/** Build the common file parameter schema. */
function fileParameter() {
  return {
    type: 'string',
    enum: FILE_ENUM,
    description: FILE_DESCRIPTION,
  }
}

/** Format one search result line. */
function formatResult(result) {
  const tier = typeof result.tier === 'string' ? ` / ${result.tier}` : ''
  const line = Number.isFinite(result.line) ? ` (line ${result.line})` : ''
  return `- ${result.fileTitle}${tier}${line} [score ${result.score}]\n  ${String(result.snippet)}`
}

/**
 * Register the memory tools on the Host tool registry.
 *
 * @param ctx - plugin context.
 * @param store - memory store.
 * @returns nothing; registration failures are logged, never thrown.
 */
export function registerTools(ctx, store) {
  const log = makeLogger(ctx.logger)
  const tools = typeof ctx.get === 'function' ? ctx.get('tools') : undefined
  if (!tools || typeof tools.register !== 'function') {
    log.warn('tool service is unavailable; memory tools were not registered')
    return
  }

  const definitions = [
    define(
      'memory_read',
      'Read one long-term memory file with line numbers. Use it when you need the exact stored content; MEMORY.md is not injected in full. Reads are bounded, so page with offset/limit for large files.',
      {
        type: 'object',
        properties: {
          file: fileParameter(),
          offset: {
            type: 'integer',
            description: '1-based first line. Default 1.',
          },
          limit: {
            type: 'integer',
            description: 'Maximum lines to return, from 1 to 400. Default 120.',
          },
        },
        required: ['file'],
        additionalProperties: false,
      },
      async (args) => {
        const id = store.normalizeFileId(requireString(args, 'file', 'file'))
        const read = await store.readFile(id)
        const lines = read.content.split('\n')
        const total = lines.length
        const offset = total === 0
          ? 0
          : Math.min(Math.max(1, Number.isFinite(args?.offset) ? Math.trunc(args.offset) : 1), total)
        const limit = Math.min(LIMITS.maxReadLines, Math.max(1, Number.isFinite(args?.limit) ? Math.trunc(args.limit) : 120))
        const selected = offset === 0 ? [] : lines.slice(offset - 1, offset - 1 + limit)
        const endLine = selected.length === 0 ? offset : offset + selected.length - 1
        const numbered = selected.map((line, index) => `${offset + index}: ${line}`).join('\n')
        const truncated = offset - 1 + selected.length < total
        return {
          file: read.def.name,
          path: read.path,
          content: numbered,
          startLine: offset,
          endLine,
          totalLines: total,
          bytes: read.bytes,
          truncated,
        }
      },
      (value) => {
        if (!isRecord(value)) return 'memory_read returned no readable value'
        const header = `${String(value.file)} (${String(value.startLine)}-${String(value.endLine)} of ${String(value.totalLines)} lines, ${String(value.bytes)} bytes)`
        const suffix = value.truncated === true ? '\n\n[more lines available; call memory_read with a larger offset]' : ''
        return `${header}\n${String(value.content ?? '')}${suffix}`
      },
      () => ({ card: 'generic', title: 'Read memory file', kind: 'read' }),
    ),

    define(
      'memory_search',
      'Search long-term memory with BM25 keyword ranking over enabled files. Use it for user preferences, durable facts, and prior decisions that are not in the current context. Returns bounded snippets with file, tier, and line.',
      {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Keywords or a short natural-language query. Chinese and English are supported.',
          },
          limit: {
            type: 'integer',
            description: 'Maximum results, from 1 to 20. Default 5.',
          },
          file: {
            type: 'string',
            enum: FILE_ENUM,
            description: `Optional file filter. ${FILE_DESCRIPTION}`,
          },
        },
        required: ['query'],
        additionalProperties: false,
      },
      async (args) => {
        const query = requireString(args, 'query', 'query').slice(0, LIMITS.maxSearchQueryChars)
        const limit = Math.min(LIMITS.maxSearchLimit, Math.max(1, Number.isFinite(args?.limit) ? Math.trunc(args.limit) : 5))
        const file = optionalString(args, 'file')
        const result = await store.search(query, {
          limit,
          ...file.length === 0 ? {} : { file: store.normalizeFileId(file) },
        })
        return { query: result.query, count: result.count, results: result.results }
      },
      (value) => {
        if (!isRecord(value) || !Array.isArray(value.results)) return 'memory_search returned no readable value'
        if (value.results.length === 0) return `No memory matches for ${JSON.stringify(value.query ?? '')}.`
        return `Memory matches for ${JSON.stringify(value.query ?? '')}:\n${value.results.map(formatResult).join('\n')}`
      },
      () => ({ card: 'generic', title: 'Search memory', kind: 'search' }),
    ),

    define(
      'memory_update',
      'Append, replace, move, or delete one durable memory entry. Use append for new facts and explicit user requests to remember. MEMORY.md tiers: core (critical facts and explicitly requested memories only), important, general. Pinned core entries are never demoted automatically.',
      {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['append', 'replace', 'delete', 'move'],
            description: 'append adds an entry; replace rewrites a unique matched entry; delete removes one; move changes a MEMORY.md entry tier.',
          },
          file: {
            type: 'string',
            enum: FILE_ENUM,
            description: `Target file. Default memory. ${FILE_DESCRIPTION}`,
          },
          content: {
            type: 'string',
            description: 'Entry text for append, or replacement text for replace. Required for those actions; maximum 600 characters.',
          },
          match: {
            type: 'string',
            description: 'Unique phrase identifying the existing entry for replace, delete, or move. Required for those actions.',
          },
          tier: {
            type: 'string',
            enum: TIER_ENUM,
            description: 'MEMORY.md tier for append, or destination tier for move. Defaults to general for append.',
          },
          pinned: {
            type: 'boolean',
            description: 'Pin a core memory so automatic tier refinement never demotes it. Use only when the user asked to remember it permanently.',
          },
          section: {
            type: 'string',
            description: 'Optional ## heading for a generic append, such as Preferences or Notes. Ignored for MEMORY.md.',
          },
        },
        required: ['action'],
        additionalProperties: false,
      },
      async (args) => {
        const action = requireString(args, 'action', 'action')
        const file = store.normalizeFileId(optionalString(args, 'file') || 'memory')
        const content = optionalString(args, 'content')
        const match = optionalString(args, 'match')
        const tier = optionalString(args, 'tier')
        const pinned = optionalBoolean(args, 'pinned', false)
        const section = optionalString(args, 'section')
        if (action === 'append') {
          if (content.length === 0) throw new Error('content is required for append')
          if (tier.length > 0 && !FILE_DEFS[file].tiered) throw new Error(`${FILE_DEFS[file].name} does not support tiers`)
          const written = await store.appendEntry(file, { content, tier: tier || 'general', pinned, section })
          return { ok: true, action, file: FILE_DEFS[file].name, tier: FILE_DEFS[file].tiered ? tier || 'general' : null, text: content, bytes: written.bytes }
        }
        if (action === 'replace') {
          if (content.length === 0) throw new Error('content is required for replace')
          if (match.length === 0) throw new Error('match is required for replace')
          const written = await store.replaceEntry(file, { match, content })
          return { ok: true, action, file: FILE_DEFS[file].name, replaced: written.replaced, text: content, bytes: written.bytes }
        }
        if (action === 'delete') {
          if (match.length === 0) throw new Error('match is required for delete')
          const written = await store.deleteEntry(file, { match })
          return { ok: true, action, file: FILE_DEFS[file].name, removed: written.removed, bytes: written.bytes }
        }
        if (action === 'move') {
          if (match.length === 0) throw new Error('match is required for move')
          if (!TIER_ENUM.includes(tier)) throw new Error('tier must be core, important, or general for move')
          const written = await store.moveEntry(file, { match, tier })
          return { ok: true, action, file: FILE_DEFS[file].name, from: written.from, to: written.to, text: written.text, bytes: written.bytes }
        }
        throw new Error(`unknown action ${JSON.stringify(action)}`)
      },
      (value) => {
        if (!isRecord(value)) return 'memory_update completed'
        if (value.action === 'delete') return `Removed: ${String(value.removed ?? '')}`
        if (value.action === 'move') return `Moved ${String(value.text ?? '')} from ${String(value.from ?? '?')} to ${String(value.to ?? '?')}.`
        if (value.action === 'replace') return `Replaced in ${String(value.file)}: ${String(value.text ?? '')}`
        return `Added to ${String(value.file)}${value.tier ? ` / ${String(value.tier)}` : ''}: ${String(value.text ?? '')}`
      },
      (args) => ({ card: 'generic', title: `Memory ${String(args?.action ?? 'update')}`, kind: 'edit' }),
    ),

    define(
      'persona_update',
      'Update SOUL.md, the agent persona and values. Replace the whole file or append a section. Changes affect future prompts; use memory_update instead for user facts.',
      {
        type: 'object',
        properties: {
          mode: {
            type: 'string',
            enum: ['replace', 'append'],
            description: 'replace rewrites SOUL.md; append adds content under section or Notes. Default append.',
          },
          content: {
            type: 'string',
            description: 'New persona text. Required; maximum 64 KiB.',
          },
          section: {
            type: 'string',
            description: 'Optional ## heading for append mode. Default Notes.',
          },
        },
        required: ['content'],
        additionalProperties: false,
      },
      async (args) => {
        const content = requireString(args, 'content', 'content')
        const mode = optionalString(args, 'mode') || 'append'
        const section = optionalString(args, 'section')
        const written = await store.updatePersona(mode, content, section)
        return { ok: true, mode, file: written.def.name, bytes: written.bytes }
      },
      (value) => {
        if (!isRecord(value)) return 'persona_update completed'
        return `Updated ${String(value.file ?? 'SOUL.md')} in ${String(value.mode ?? 'append')} mode (${String(value.bytes ?? 0)} bytes).`
      },
      (args) => ({ card: 'generic', title: `Persona ${String(args?.mode ?? 'update')}`, kind: 'edit' }),
    ),
  ]

  for (const definition of definitions) {
    try {
      if (typeof tools.get === 'function' && tools.get(definition.name) !== undefined) {
        log.warn(`tool ${definition.name} is already registered; leaving the existing definition in place`)
        continue
      }
      ctx.effect(() => tools.register(definition), `hybrid-memory tool ${definition.name}`)
    } catch (error) {
      log.error(`could not register tool ${definition.name}`, error)
    }
  }
}
