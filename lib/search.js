/**
 * Dependency-free BM25 search over small Markdown memory files.
 *
 * Tokenization handles Latin words plus Chinese single characters and
 * bigrams. The index is rebuilt lazily after a file write; for the expected
 * file sizes (a few hundred KB at most) this is cheaper than maintaining an
 * incremental posting list that could drift from user edits.
 */

import { truncateChars } from './util.js'

const STOPWORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'but', 'by', 'for', 'from', 'has', 'have', 'he', 'her',
  'his', 'i', 'in', 'is', 'it', 'its', 'me', 'my', 'of', 'on', 'or', 'our', 'she', 'so', 'that', 'the',
  'their', 'them', 'they', 'this', 'to', 'was', 'we', 'were', 'will', 'with', 'you', 'your',
  '的', '了', '和', '是', '在', '我', '你', '他', '她', '它', '们', '这', '那', '有', '就', '也', '都',
  '而', '与', '及', '或', '一个', '一些',
])

const CJK_RUN = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]+/g
const LATIN_RUN = /[a-z0-9_]+/g

/**
 * Split text into searchable terms.
 *
 * @param text - arbitrary Markdown or user query.
 * @returns unique-ish terms; duplicates are intentionally retained for queries.
 */
export function tokenize(text) {
  const normalized = String(text ?? '').toLowerCase()
  const terms = []
  for (const run of normalized.match(LATIN_RUN) ?? []) {
    if (!STOPWORDS.has(run) && run.length > 0) terms.push(run)
  }
  for (const run of normalized.match(CJK_RUN) ?? []) {
    for (let index = 0; index < run.length; index += 1) {
      const char = run[index]
      if (!STOPWORDS.has(char)) terms.push(char)
      if (index + 1 < run.length) {
        const bigram = run.slice(index, index + 2)
        if (!STOPWORDS.has(bigram)) terms.push(bigram)
      }
    }
  }
  return terms
}

/** Count terms in one document. */
function termFrequency(tokens) {
  const counts = new Map()
  for (const token of tokens) counts.set(token, (counts.get(token) ?? 0) + 1)
  return counts
}

/**
 * Build a BM25 index.
 *
 * @param documents - `{id, file, fileTitle, tier, heading, line, text}` rows.
 * @returns the searchable index; safe for an empty document list.
 */
export function buildIndex(documents) {
  const docs = []
  const documentFrequency = new Map()
  let totalLength = 0
  for (const document of Array.isArray(documents) ? documents : []) {
    const text = typeof document.text === 'string' ? document.text : ''
    const title = typeof document.heading === 'string' ? document.heading : ''
    const tokens = tokenize(`${title} ${text}`)
    if (tokens.length === 0) continue
    const frequencies = termFrequency(tokens)
    for (const term of frequencies.keys()) documentFrequency.set(term, (documentFrequency.get(term) ?? 0) + 1)
    totalLength += tokens.length
    docs.push({
      id: String(document.id ?? docs.length),
      file: document.file,
      fileTitle: document.fileTitle,
      tier: document.tier ?? null,
      heading: title,
      line: Number.isFinite(document.line) ? document.line : null,
      text,
      length: tokens.length,
      frequencies,
    })
  }
  return {
    docs,
    documentFrequency,
    averageLength: docs.length === 0 ? 0 : totalLength / docs.length,
    total: docs.length,
  }
}

/** Build a short snippet around the first matching term. */
export function snippetFor(text, terms, maxChars = 180) {
  const source = String(text ?? '').replace(/\s+/g, ' ').trim()
  if (source.length <= maxChars) return source
  const lower = source.toLowerCase()
  let at = -1
  for (const term of terms) {
    const index = lower.indexOf(term)
    if (index >= 0 && (at < 0 || index < at)) at = index
  }
  if (at < 0) return truncateChars(source, maxChars)
  const start = Math.max(0, at - Math.floor(maxChars / 3))
  const end = Math.min(source.length, start + maxChars)
  return `${start > 0 ? '…' : ''}${source.slice(start, end)}${end < source.length ? '…' : ''}`
}

/**
 * Rank documents with BM25.
 *
 * @param index - index returned by {@link buildIndex}.
 * @param query - natural-language query.
 * @param options - limit (1-20) and optional file id filter.
 * @returns scored results, highest first.
 */
export function searchIndex(index, query, options = {}) {
  const limit = Math.min(20, Math.max(1, Number(options.limit) || 5))
  const queryTerms = [...new Set(tokenize(query))]
  if (index.docs.length === 0 || queryTerms.length === 0) return []
  const filtered = options.file ? index.docs.filter(document => document.file === options.file) : index.docs
  if (filtered.length === 0) return []
  const strongTerms = queryTerms.filter(term => term.length > 1)
  const k1 = 1.2
  const b = 0.75
  const scores = []
  for (const document of filtered) {
    if (strongTerms.length > 0 && !strongTerms.some(term => (document.frequencies.get(term) ?? 0) > 0)) continue
    let score = 0
    let matched = 0
    for (const term of queryTerms) {
      const frequency = document.frequencies.get(term) ?? 0
      if (frequency === 0) continue
      matched += 1
      const df = index.documentFrequency.get(term) ?? 0
      const idf = Math.log(1 + (index.total - df + 0.5) / (df + 0.5))
      const denominator = frequency + k1 * (1 - b + b * (document.length / (index.averageLength || 1)))
      score += idf * ((frequency * (k1 + 1)) / (denominator || 1))
    }
    if (matched === 0) continue
    if (document.heading && queryTerms.some(term => document.heading.toLowerCase().includes(term))) score *= 1.35
    if (document.tier === 'core') score *= 1.15
    if (document.tier === 'important') score *= 1.05
    scores.push({
      file: document.file,
      fileTitle: document.fileTitle,
      tier: document.tier,
      heading: document.heading,
      line: document.line,
      text: document.text,
      score: Math.round(score * 1000) / 1000,
      snippet: snippetFor(document.text, queryTerms),
      matched,
    })
  }
  scores.sort((left, right) => right.score - left.score || left.file.localeCompare(right.file) || (left.line ?? 0) - (right.line ?? 0))
  return scores.slice(0, limit)
}
