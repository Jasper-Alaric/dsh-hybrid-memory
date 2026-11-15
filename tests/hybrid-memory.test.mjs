/**
 * Keyless unit tests for the storage, tier, search, and extraction primitives.
 * Run with: node --test tests/hybrid-memory.test.mjs
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {
  appendMemoryEntry,
  parseMemoryEntries,
  refineMemory,
  removeEntry,
  replaceEntry,
  tierCounts,
} from '../lib/memory.js'
import { buildIndex, searchIndex, tokenize } from '../lib/search.js'
import { buildExistingMemoryDigest, collectTranscript, isDuplicateEntry, parseExtractionResponse } from '../lib/extract.js'
import { HybridMemoryStore } from '../lib/store.js'
import { registerTools } from '../lib/tools.js'

async function withStore(run) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'dsh-hybrid-memory-'))
  const store = new HybridMemoryStore({ dir })
  try {
    await store.ensureReady()
    await run(store, dir)
  } finally {
    await store.close()
    await rm(dir, { recursive: true, force: true })
  }
}

test('store creates all Markdown files and default settings on first use', async () => {
  await withStore(async (store, dir) => {
    for (const name of ['SOUL.md', 'USER.md', 'AGENT.md', 'AGENTS.md', 'MEMORY.md', 'HEARTBEAT.md']) {
      const content = await readFile(path.join(dir, name), 'utf8')
      assert.ok(content.length > 0, `${name} should be created`)
    }
    const memory = await store.readFile('memory')
    assert.equal(memory.def.name, 'MEMORY.md')
    assert.deepEqual(tierCounts(memory.content), { core: 0, important: 0, general: 0, total: 0 })
    const snapshot = await store.snapshot()
    assert.equal(snapshot.files.length, 6)
    assert.equal(snapshot.settings.heartbeat.enabled, true)
    assert.equal(snapshot.settings.files.memory.inject, false)
    assert.deepEqual(snapshot.settings.budgets, { core: 8, important: 40, general: 80, totalChars: 12000 })
  })
})

test('memory entries append, replace, delete, and keep line ranges', async () => {
  let content = '# MEMORY\n\n## Core\n\n## Important\n\n## General\n'
  content = appendMemoryEntry(content, 'core', '用户明确要求永久记住：回答要简洁。', true)
  content = appendMemoryEntry(content, 'important', '项目使用 TypeScript。')
  content = appendMemoryEntry(content, 'general', '用户常在工作日晚上工作。')
  const entries = parseMemoryEntries(content)
  assert.equal(entries.length, 3)
  assert.equal(entries[0].tier, 'core')
  assert.equal(entries[0].pinned, true)
  assert.match(entries[0].text, /永久记住/)
  assert.ok(entries[0].start >= 2)

  const replaced = replaceEntry(content, 'TypeScript', 'TypeScript 与 Node.js')
  assert.match(replaced.content, /TypeScript 与 Node\.js/)
  const removed = removeEntry(replaced.content, '工作日晚上')
  assert.doesNotMatch(removed.content, /工作日晚上/)
  assert.equal(tierCounts(removed.content).total, 2)
})

test('tier refinement demotes the oldest unpinned entry and protects pins', () => {
  let content = '# MEMORY\n\n## Core\n\n## Important\n\n## General\n'
  content = appendMemoryEntry(content, 'core', 'pinned fact', true)
  content = appendMemoryEntry(content, 'core', 'unpinned one', false)
  content = appendMemoryEntry(content, 'core', 'unpinned two', false)
  const result = refineMemory(content, { core: 1, important: 120, general: 300 })
  assert.equal(result.counts.core, 1)
  assert.equal(result.counts.important, 2)
  assert.equal(result.moved.length, 2)
  assert.match(result.content, /⭐ pinned fact/)
  assert.doesNotMatch(result.content.split('## Important')[0], /unpinned one/)
})

test('BM25 search finds Chinese and English entries with tier boost', () => {
  const documents = [
    { id: 'a', file: 'memory', fileTitle: 'MEMORY.md', tier: 'core', heading: 'MEMORY.md / Core', line: 3, text: '用户偏好中文交流，喜欢简洁回答。' },
    { id: 'b', file: 'user', fileTitle: 'USER.md', tier: null, heading: 'USER.md / Preferences', line: 6, text: 'The user prefers short answers and dark mode.' },
    { id: 'c', file: 'memory', fileTitle: 'MEMORY.md', tier: 'general', heading: 'MEMORY.md / General', line: 20, text: 'A random background note about deployment.' },
  ]
  const index = buildIndex(documents)
  const chinese = searchIndex(index, '中文 交流', { limit: 3 })
  assert.equal(chinese[0].file, 'memory')
  assert.match(chinese[0].snippet, /中文/)
  const english = searchIndex(index, 'dark mode', { limit: 3 })
  assert.equal(english[0].file, 'user')
  assert.ok(tokenize('用户 preferences').includes('用户'))
  const noiseIndex = buildIndex([{ id: 'n', file: 'memory', fileTitle: 'MEMORY.md', tier: 'general', heading: 'MEMORY.md', line: 1, text: '这是一个中间的文句，没有相邻的两个字。' }])
  assert.deepEqual(searchIndex(noiseIndex, '中文', { limit: 3 }), [])
})

test('extraction parser tolerates fences, prose, and alternative keys', () => {
  const parsed = parseExtractionResponse(`Here is the result:
\`\`\`json
{
  "preferences": [{"text": "用户喜欢中文回复", "importance": 4, "pinned": false}],
  "facts": [{"text": "项目名是 Hybrid Memory", "tier": "important", "importance": 3}]
}
\`\`\``)
  assert.equal(parsed.error, null)
  assert.equal(parsed.preferences.length, 1)
  assert.equal(parsed.facts.length, 1)
  assert.equal(parsed.facts[0].tier, 'important')
  assert.equal(parsed.facts[0].importance, 3)
})

test('extraction parser rejects malformed JSON without inventing entries', () => {
  const parsed = parseExtractionResponse('not json at all')
  assert.equal(parsed.preferences.length, 0)
  assert.equal(parsed.facts.length, 0)
  assert.match(parsed.error, /invalid JSON/)
})

test('transcript includes only human and assistant messages and detects remember hints', () => {
  const transcript = collectTranscript([
    { type: 'user/message', seq: 1, data: { source: { kind: 'user' }, content: [{ type: 'text', text: '请记住：我喜欢深色模式。' }] } },
    { type: 'assistant/message', seq: 2, data: { message: { content: [{ type: 'text', text: '好的，我会记住。' }] } } },
    { type: 'user/message', seq: 3, data: { source: { kind: 'plugin', plugin: 'heartbeat' }, content: [{ type: 'text', text: '系统通知' }] } },
    { type: 'tool/call', seq: 4, data: { name: 'read' } },
  ], { maxMessages: 10, maxChars: 4000 })
  assert.equal(transcript.messageCount, 2)
  assert.equal(transcript.remembers.length, 1)
  assert.match(transcript.text, /ASSISTANT: 好的/)
  assert.doesNotMatch(transcript.text, /系统通知/)
})

test('extraction items are capped at the entry character limit', () => {
  const parsed = parseExtractionResponse(JSON.stringify({ facts: [{ text: '长'.repeat(500), tier: 'general' }] }))
  assert.equal(parsed.facts[0].text.length, 300)
})

test('duplicate detection is case and punctuation tolerant', () => {
  assert.equal(isDuplicateEntry('用户喜欢简洁回答。', ['用户喜欢简洁回答']), true)
  assert.equal(isDuplicateEntry('用户喜欢中文回复', ['用户喜欢简洁回答']), false)
})

test('existing-memory digest keeps Core and the newest non-Core entries', () => {
  let content = '# MEMORY\n\n## Core\n\n## Important\n\n## General\n'
  content = appendMemoryEntry(content, 'core', '身份：阿夙', true)
  content = appendMemoryEntry(content, 'important', `旧条目${'旧'.repeat(80)}`)
  content = appendMemoryEntry(content, 'important', '最新的重要条目')
  content = appendMemoryEntry(content, 'general', '最新的一般条目')
  const digest = buildExistingMemoryDigest(content, 120)
  assert.match(digest, /身份：阿夙/)
  assert.match(digest, /最新的重要条目/)
  assert.match(digest, /最新的一般条目/)
  assert.doesNotMatch(digest, /旧旧旧/)
  assert.match(digest, /older non-core entries omitted/)
})

test('transcript batches from the oldest message and reports a safe lastSeq', () => {
  const events = Array.from({ length: 11 }, (_, index) => ({
    type: 'user/message',
    seq: index + 1,
    data: { source: { kind: 'user' }, content: [{ type: 'text', text: `消息${index + 1}` }] },
  }))
  const first = collectTranscript(events, { maxMessages: 5, maxChars: 4000 })
  assert.equal(first.messageCount, 5)
  assert.equal(first.firstSeq, 1)
  assert.equal(first.lastSeq, 5)
  assert.equal(first.hasMore, true)
  assert.doesNotMatch(first.text, /消息6/)
  const second = collectTranscript(events.slice(5), { maxMessages: 5, maxChars: 4000 })
  assert.equal(second.firstSeq, 6)
  assert.equal(second.lastSeq, 10)
  assert.equal(second.hasMore, true)
})

test('all-pinned Core overflow still lets lower tiers refine', () => {
  let content = '# MEMORY\n\n## Core\n\n## Important\n\n## General\n'
  content = appendMemoryEntry(content, 'core', 'pin a', true)
  content = appendMemoryEntry(content, 'core', 'pin b', true)
  content = appendMemoryEntry(content, 'important', 'imp a')
  content = appendMemoryEntry(content, 'important', 'imp b')
  const result = refineMemory(content, { core: 1, important: 1, general: 300 })
  assert.equal(result.counts.core, 2)
  assert.equal(result.counts.important, 1)
  assert.equal(result.counts.general, 1)
  assert.match(result.content, /⭐ pin a/)
})

test('General overflow is archived before it leaves MEMORY.md', async () => {
  await withStore(async (store, dir) => {
    await store.updateSettings({ budgets: { general: 5 } })
    for (let index = 1; index <= 6; index += 1) {
      await store.appendEntry('memory', { content: `一般条目${index}`, tier: 'general' })
    }
    const result = await store.refineTiers()
    assert.equal(result.changed, true)
    assert.equal(result.counts.general, 5)
    assert.equal(result.dropped.length, 1)
    assert.equal(result.archived, true)
    const archive = await readFile(path.join(dir, 'MEMORY.archive.md'), 'utf8')
    assert.match(archive, /一般条目1/)
    assert.match(archive, /ARCHIVE/)
  })
})

test('total character budget archives the oldest General entries', () => {
  let content = '# MEMORY\n\n## Core\n\n## Important\n\n## General\n'
  content = appendMemoryEntry(content, 'general', `旧${'字'.repeat(599)}`)
  content = appendMemoryEntry(content, 'general', `新${'字'.repeat(599)}`)
  const result = refineMemory(content, { core: 8, important: 40, general: 80, totalChars: 1000 })
  assert.equal(result.counts.general, 1)
  assert.equal(result.dropped.length, 1)
  assert.match(result.content, /新/)
  assert.doesNotMatch(result.content, /旧/)
})

test('store round-trips settings, state, and search', async () => {
  await withStore(async (store) => {
    await store.appendEntry('memory', { content: '用户偏好中文交流。', tier: 'core', pinned: true })
    await store.appendEntry('user', { content: '用户喜欢简洁的回答。', section: 'Preferences' })
    const result = await store.search('中文', { limit: 5 })
    assert.ok(result.results.length >= 1)
    assert.equal(result.results[0].file, 'memory')
    const next = await store.updateSettings({ extraction: { everyTurns: 6 } })
    assert.equal(next.extraction.everyTurns, 6)
    const longPersona = '长人格条目'.repeat(120)
    await store.updatePersona('append', longPersona, 'Notes')
    assert.match((await store.readFile('soul')).content, /长人格条目/)
    store.touchSession('session-test', { turns: 2 })
    await store.saveState()
    const stateRaw = JSON.parse(await readFile(path.join(store.dir, 'state.json'), 'utf8'))
    assert.equal(stateRaw.sessions['session-test'].turns, 2)
  })
})

test('all tool schemas use string types/descriptions and compile without throwing', async () => {
  await withStore(async (store) => {
    const definitions = []
    const fakeCtx = {
      logger: { warn() {}, error() {} },
      get(name) {
        if (name !== 'tools') return undefined
        return {
          get() { return undefined },
          register(definition) {
            definitions.push(definition)
            return () => {}
          },
        }
      },
      effect(callback) {
        const disposer = callback()
        return typeof disposer === 'function' ? disposer : () => {}
      },
    }
    registerTools(fakeCtx, store)
    assert.deepEqual(definitions.map(definition => definition.name).sort(), [
      'memory_read',
      'memory_search',
      'memory_update',
      'persona_update',
    ])
    const walk = (node, pathName) => {
      assert.ok(node !== null && typeof node === 'object', `${pathName} must be an object`)
      if (Object.hasOwn(node, 'type')) assert.equal(typeof node.type, 'string', `${pathName}.type must be a string`)
      assert.notEqual(Array.isArray(node.type), true, `${pathName}.type must not be an array`)
      if (Object.hasOwn(node, 'description')) assert.equal(typeof node.description, 'string', `${pathName}.description must be a string`)
      if (Object.hasOwn(node, 'required')) {
        assert.equal(Array.isArray(node.required), true, `${pathName}.required must be an array`)
        assert.equal(node.required.every(value => typeof value === 'string'), true)
      }
      if (node.properties) {
        for (const [key, child] of Object.entries(node.properties)) walk(child, `${pathName}.properties.${key}`)
      }
      if (node.items) walk(node.items, `${pathName}.items`)
    }
    for (const definition of definitions) {
      assert.equal(typeof definition.description, 'string')
      assert.equal(typeof definition.execute, 'function')
      walk(definition.parameters, `${definition.name}.parameters`)
      walk(definition.output.schema, `${definition.name}.output.schema`)
      assert.equal(typeof definition.output.render, 'function')
    }
  })
})
