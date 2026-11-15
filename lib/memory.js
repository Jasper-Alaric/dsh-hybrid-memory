/**
 * Markdown memory parsing and editing.
 *
 * `MEMORY.md` is the only tiered file. Every entry is a Markdown bullet, with
 * optional indented continuation lines. The parser keeps line ranges so edits
 * can preserve user-authored headings, comments, and unrelated text.
 */

import { SECTION_HEADINGS } from './constants.js'
import { normalizeText, sanitizeEntry } from './util.js'

const TIER_HEADINGS = Object.freeze({
  core: ['core', '核心'],
  important: ['important', '重要'],
  general: ['general', 'notes', '一般', '其他', '其它'],
})

const PLACEHOLDERS = new Set([
  '',
  '（尚未记录）',
  '(尚未记录)',
  '(none yet)',
  'none yet',
  '(empty)',
])

/** Whether one bullet body is just a documentation placeholder. */
export function isPlaceholder(text) {
  return PLACEHOLDERS.has(String(text).trim().toLowerCase()) || /^<!--.*-->$/.test(String(text).trim())
}

/** Map a `##` heading to a memory tier, or null for a non-tier section. */
export function tierForHeading(heading) {
  const normalized = String(heading).trim().toLowerCase()
  for (const tier of ['core', 'important', 'general']) {
    if (TIER_HEADINGS[tier].some(name => normalized === name || normalized.startsWith(`${name} `))) return tier
  }
  return null
}

/** 1-based index of the heading line, or -1. */
export function findHeadingLine(lines, heading) {
  const wanted = String(heading).trim().toLowerCase()
  for (let index = 0; index < lines.length; index += 1) {
    const match = /^##\s+(.+?)\s*$/.exec(lines[index])
    if (match && match[1].trim().toLowerCase() === wanted) return index
  }
  return -1
}

/** Inclusive heading start and exclusive section end (next `##` or EOF). */
export function sectionRange(lines, heading) {
  const start = findHeadingLine(lines, heading)
  if (start < 0) return null
  let end = lines.length
  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^##\s+/.test(lines[index])) {
      end = index
      break
    }
  }
  return { start, end }
}

/** Strip a pin marker and return the clean body plus whether it was pinned. */
export function splitPin(text) {
  let body = String(text).trim()
  let pinned = false
  const prefix = /^(?:⭐|\[(?:pin|pinned)\]|\((?:pin|pinned)\))\s*/i
  while (prefix.test(body)) {
    pinned = true
    body = body.replace(prefix, '').trim()
  }
  return { text: body, pinned }
}

/** Format one entry as a bullet with optional pin marker and continuation indent. */
export function formatEntry(text, pinned = false) {
  const lines = String(text).replace(/\r\n?/g, '\n').split('\n')
  const first = `${pinned ? '⭐ ' : ''}${lines[0].trim()}`
  const rest = lines.slice(1).map(line => `  ${line.trim()}`).join('\n')
  return rest.length === 0 ? `- ${first}` : `- ${first}\n${rest}`
}

/**
 * Parse every bullet block in a file.
 *
 * @returns blocks with 0-based `start`/`end` line indexes, raw text, and body.
 */
export function parseBulletBlocks(content) {
  const lines = normalizeText(content).split('\n')
  const blocks = []
  for (let index = 0; index < lines.length; index += 1) {
    const match = /^(\s*)[-*]\s+(.*)$/.exec(lines[index])
    if (!match) continue
    let end = index + 1
    while (end < lines.length) {
      const line = lines[end]
      if (line.trim().length === 0) break
      if (/^\s*[-*]\s+/.test(line)) break
      if (/^#{1,6}\s+/.test(line)) break
      if (/^\s{2,}\S/.test(line) || /^\t\S/.test(line)) {
        end += 1
        continue
      }
      break
    }
    const raw = lines.slice(index, end).join('\n')
    const body = [match[2], ...lines.slice(index + 1, end).map(line => line.replace(/^\s{2,}/, ''))]
      .join('\n')
      .trim()
    const { text, pinned } = splitPin(body)
    blocks.push({ start: index, end, raw, text, pinned })
    index = end - 1
  }
  return blocks
}

/**
 * Parse `MEMORY.md` entries in tier sections.
 *
 * @returns entries with tier, clean text, pin state, and line range.
 */
export function parseMemoryEntries(content) {
  const lines = normalizeText(content).split('\n')
  const entries = []
  for (const block of parseBulletBlocks(content)) {
    let tier = null
    for (let index = block.start; index >= 0; index -= 1) {
      const match = /^##\s+(.+?)\s*$/.exec(lines[index])
      if (match) {
        tier = tierForHeading(match[1])
        break
      }
    }
    if (tier === null) continue
    if (isPlaceholder(block.text)) continue
    entries.push({ tier, ...block })
  }
  return entries
}

/** Count non-placeholder entries per tier. */
export function tierCounts(content) {
  const counts = { core: 0, important: 0, general: 0, total: 0 }
  for (const entry of parseMemoryEntries(content)) {
    counts[entry.tier] += 1
    counts.total += 1
  }
  return counts
}

/** Insert one line-group at the end of a section, before its trailing blank lines. */
function insertIntoSection(content, heading, block, fallbackSection) {
  const lines = normalizeText(content).split('\n')
  let range = sectionRange(lines, heading)
  if (range === null && fallbackSection && fallbackSection !== heading) {
    range = sectionRange(lines, fallbackSection)
  }
  if (range === null) {
    while (lines.length > 0 && lines[lines.length - 1].trim().length === 0) lines.pop()
    lines.push('', `## ${heading}`, '')
    lines.push(...block.split('\n'))
    lines.push('')
    return lines.join('\n')
  }
  let insertAt = range.end
  while (insertAt > range.start + 1 && lines[insertAt - 1].trim().length === 0) insertAt -= 1
  const before = lines.slice(0, insertAt)
  const after = lines.slice(insertAt)
  if (before.length > 0 && before[before.length - 1].trim().length !== 0) before.push('')
  before.push(...block.split('\n'))
  if (after.length > 0 && after[0].trim().length !== 0) before.push('')
  return before.concat(after).join('\n')
}

/** Append text under an arbitrary `##` heading, creating the section if absent. */
export function appendUnderHeading(content, heading, text, fallbackSection) {
  const entry = sanitizeEntry(text)
  if (entry.length === 0) throw new Error('memory entry must not be empty')
  return insertIntoSection(content, heading, formatEntry(entry), fallbackSection)
}

/** Append one tiered memory entry. */
export function appendMemoryEntry(content, tier, text, pinned = false) {
  const clean = sanitizeEntry(text)
  if (clean.length === 0) throw new Error('memory entry must not be empty')
  const heading = tier === 'core' ? 'Core' : tier === 'important' ? 'Important' : 'General'
  return insertIntoSection(content, heading, formatEntry(clean, pinned), 'General')
}

/** Rebuild a whole block from its raw text after replacing a matched substring. */
function replaceInBlock(block, match, replacement) {
  const index = block.raw.toLowerCase().indexOf(match.toLowerCase())
  if (index < 0) return null
  return `${block.raw.slice(0, index)}${replacement}${block.raw.slice(index + match.length)}`
}

/**
 * Find the unique bullet block containing `match`.
 *
 * @throws when the needle is empty, missing, or ambiguous.
 */
export function findUniqueBlock(content, match) {
  const needle = String(match ?? '').trim()
  if (needle.length === 0) throw new Error('match text is required')
  const blocks = parseBulletBlocks(content)
  const matches = blocks.filter(block => block.raw.toLowerCase().includes(needle.toLowerCase()))
  if (matches.length === 0) throw new Error(`no memory entry contains ${JSON.stringify(needle)}`)
  if (matches.length > 1) {
    throw new Error(`match ${JSON.stringify(needle)} is ambiguous (${matches.length} entries); use a longer unique phrase`)
  }
  return matches[0]
}

/** Remove one unique bullet block. */
export function removeEntry(content, match) {
  const block = findUniqueBlock(content, match)
  const lines = normalizeText(content).split('\n')
  const removed = lines.slice(block.start, block.end).join('\n')
  lines.splice(block.start, block.end - block.start)
  // Collapse a doubled blank line left behind by the removal.
  if (lines[block.start] === '' && lines[block.start - 1] === '') lines.splice(block.start, 1)
  return { content: lines.join('\n'), removed, text: block.text }
}

/** Replace a matched substring inside one unique bullet block. */
export function replaceEntry(content, match, replacement) {
  const block = findUniqueBlock(content, match)
  const nextRaw = replaceInBlock(block, String(match).trim(), String(replacement))
  if (nextRaw === null) throw new Error(`no memory entry contains ${JSON.stringify(match)}`)
  const lines = normalizeText(content).split('\n')
  const replacementLines = nextRaw.split('\n')
  lines.splice(block.start, block.end - block.start, ...replacementLines)
  return { content: lines.join('\n'), replaced: block.text, text: block.text }
}

/** Move one unique bullet block to another tier. */
export function moveEntry(content, match, tier) {
  if (!['core', 'important', 'general'].includes(tier)) throw new Error(`unknown memory tier ${JSON.stringify(tier)}`)
  const block = findUniqueBlock(content, match)
  const parsed = parseMemoryEntries(content)
  const entry = parsed.find(item => item.start === block.start)
  const pinned = entry?.pinned ?? block.pinned
  const removed = removeEntry(content, match)
  const appended = appendMemoryEntry(removed.content, tier, block.text, pinned)
  return { content: appended, from: entry?.tier ?? null, to: tier, text: block.text, pinned }
}

/** Remove the first unpinned entry in a tier, returning the residual content. */
function takeFirstUnpinned(content, tier) {
  const entry = parseMemoryEntries(content).find(item => item.tier === tier && !item.pinned)
  if (entry === undefined) return null
  const lines = normalizeText(content).split('\n')
  lines.splice(entry.start, entry.end - entry.start)
  if (lines[entry.start] === '' && lines[entry.start - 1] === '') lines.splice(entry.start, 1)
  return { content: lines.join('\n'), text: entry.text, pinned: entry.pinned }
}

/**
 * Keep each tier inside its entry budget by demoting the oldest unpinned
 * entries. Core overflow moves to Important, Important overflow moves to
 * General, and General overflow is returned in `dropped` so the caller can
 * archive it instead of losing it. Pinned entries are never demoted. The
 * optional `totalChars` cap is a last-resort guard: it archives the oldest
 * unpinned General entries first, then the oldest unpinned Important entries.
 */
export function refineMemory(content, budgets) {
  let next = normalizeText(content)
  const moved = []
  const dropped = []
  const limits = {
    core: Math.max(1, Number(budgets?.core) || 8),
    important: Math.max(1, Number(budgets?.important) || 40),
    general: Math.max(1, Number(budgets?.general) || 80),
    totalChars: Math.max(1000, Number(budgets?.totalChars) || 12000),
  }
  for (let guard = 0; guard < 500; guard += 1) {
    let counts = tierCounts(next)
    let acted = false
    if (counts.core > limits.core) {
      const taken = takeFirstUnpinned(next, 'core')
      if (taken !== null) {
        next = appendMemoryEntry(taken.content, 'important', taken.text, false)
        moved.push({ from: 'core', to: 'important', text: taken.text })
        acted = true
      }
      // When Core is entirely pinned, leave it over budget but keep checking
      // the lower tiers instead of breaking out of refinement altogether.
    }
    if (!acted) {
      counts = tierCounts(next)
      if (counts.important > limits.important) {
        const taken = takeFirstUnpinned(next, 'important')
        if (taken !== null) {
          next = appendMemoryEntry(taken.content, 'general', taken.text, false)
          moved.push({ from: 'important', to: 'general', text: taken.text })
          acted = true
        }
      }
    }
    if (!acted) {
      counts = tierCounts(next)
      if (counts.general > limits.general) {
        const taken = takeFirstUnpinned(next, 'general')
        if (taken !== null) {
          next = taken.content
          dropped.push(taken.text)
          acted = true
        }
      }
    }
    if (!acted) break
  }
  // Total-character guard: the entry budgets alone can still allow a file far
  // larger than the useful search corpus, so cap the sum of entry text too.
  for (let guard = 0; guard < 500; guard += 1) {
    const total = parseMemoryEntries(next).reduce((sum, entry) => sum + entry.text.length, 0)
    if (total <= limits.totalChars) break
    const taken = takeFirstUnpinned(next, 'general') ?? takeFirstUnpinned(next, 'important')
    if (taken === null) break
    next = taken.content
    dropped.push(taken.text)
  }
  return { content: next, moved, dropped, counts: tierCounts(next) }
}

/** Return the section heading used for a generic append. */
export function defaultSectionFor(fileId) {
  return SECTION_HEADINGS[fileId] ?? 'Notes'
}

/** Append one entry to a non-tiered file, using the caller's section when supplied. */
export function appendFileEntry(content, fileId, text, section) {
  const heading = String(section ?? '').trim() || defaultSectionFor(fileId)
  return appendUnderHeading(content, heading, text, defaultSectionFor(fileId))
}
