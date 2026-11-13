/**
 * Small, dependency-free helpers shared by the storage, extraction, tool, and
 * HTTP layers. No function throws on malformed external input unless its name
 * says so; callers decide how to report a failure.
 */

import { randomUUID } from 'node:crypto'
import { copyFile, mkdir, rename, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { PLUGIN_NAME } from './constants.js'

/** Test whether a value is a plain JSON-like object. */
export function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/** Return a string field or a fallback. */
export function stringOr(value, fallback = '') {
  return typeof value === 'string' ? value : fallback
}

/** Clamp an integer into an inclusive range, falling back to the default. */
export function clampInt(value, min, max, fallback) {
  const number = typeof value === 'number' ? value : Number.parseInt(String(value), 10)
  if (!Number.isFinite(number)) return fallback
  const integer = Math.trunc(number)
  if (integer < min) return min
  if (integer > max) return max
  return integer
}

/** Return a finite non-negative number or a fallback. */
export function numberOr(value, fallback) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

/** Read a boolean field with a fallback. */
export function boolOr(value, fallback) {
  return typeof value === 'boolean' ? value : fallback
}

/** ISO timestamp for display and state files. */
export function nowIso() {
  return new Date().toISOString()
}

/** Milliseconds elapsed since an ISO timestamp, or Infinity when absent/invalid. */
export function ageMs(iso, now = Date.now()) {
  if (typeof iso !== 'string') return Number.POSITIVE_INFINITY
  const time = Date.parse(iso)
  return Number.isFinite(time) ? Math.max(0, now - time) : Number.POSITIVE_INFINITY
}

/** Truncate by Unicode code points so emoji and surrogate pairs survive. */
export function truncateChars(text, maxChars, suffix = '\n…[truncated]') {
  if (typeof text !== 'string') return ''
  const chars = Array.from(text)
  if (chars.length <= maxChars) return text
  return `${chars.slice(0, Math.max(0, maxChars - suffix.length)).join('')}${suffix}`
}

/** UTF-8 byte length without allocating a Buffer for empty strings. */
export function byteLength(text) {
  return typeof text === 'string' ? Buffer.byteLength(text, 'utf8') : 0
}

/** Normalize a line ending and strip a leading BOM. */
export function normalizeText(text) {
  return String(text).replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n')
}

/** Collapse whitespace and strip control characters from one memory entry. */
export function sanitizeEntry(text) {
  return normalizeText(text)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/\r/g, '')
    .trim()
}

/** Lowercase, punctuation-free text used for duplicate detection. */
export function normalizeForCompare(text) {
  return normalizeText(text)
    .toLowerCase()
    .replace(/[`*_#>\[\](){}:;,.!?，。！？；：、"'“”‘’\-—–/\\|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** A stable short key for one entry, used by state metadata and dedupe. */
export function textKey(text) {
  const normalized = normalizeForCompare(text)
  let hash = 2166136261
  for (let index = 0; index < normalized.length; index += 1) {
    hash ^= normalized.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return `${(hash >>> 0).toString(16)}:${normalized.length}`
}

/** Set a nested value only when the value is a plain object; used for merges. */
export function isPlainObject(value) {
  return isRecord(value)
}

/**
 * Merge editable settings without allowing unknown keys to erase defaults.
 * Arrays are replaced wholesale; plain objects merge recursively.
 */
export function mergeDeep(base, patch, depth = 0) {
  if (depth > 8 || !isRecord(patch)) return base
  const output = isRecord(base) ? { ...base } : {}
  for (const [key, value] of Object.entries(patch)) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue
    if (isRecord(value) && isRecord(output[key])) output[key] = mergeDeep(output[key], value, depth + 1)
    else if (value !== undefined) output[key] = value
  }
  return output
}

/**
 * Serialize writes per path. A failed operation still advances the chain so a
 * later write is not permanently blocked by an earlier failure.
 */
export function createPathLocks() {
  const tails = new Map()
  return function withPathLock(key, operation) {
    const previous = tails.get(key) ?? Promise.resolve()
    const run = previous.then(operation, operation)
    const settled = run.catch(() => {})
    tails.set(key, settled)
    settled.finally(() => {
      if (tails.get(key) === settled) tails.delete(key)
    })
    return run
  }
}

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms))

/**
 * Write a file atomically inside its directory. Windows can reject `rename`
 * over an existing file; that case falls back to `copyFile` + `unlink`.
 *
 * @param file - absolute target path.
 * @param content - UTF-8 content.
 * @param options - optional retries (defaults: 3 attempts, 40 ms backoff).
 */
export async function atomicWrite(file, content, options = {}) {
  const attempts = clampInt(options.attempts, 1, 10, 3)
  const backoffMs = clampInt(options.backoffMs, 0, 5000, 40)
  await mkdir(path.dirname(file), { recursive: true })
  let lastError
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const temp = `${file}.${process.pid}.${randomUUID().slice(0, 8)}.tmp`
    try {
      await writeFile(temp, content, 'utf8')
      try {
        await rename(temp, file)
      } catch (error) {
        const code = error && typeof error === 'object' ? error.code : undefined
        if (code === 'EEXIST' || code === 'EPERM' || code === 'EACCES' || code === 'EISDIR') {
          await copyFile(temp, file)
          await unlink(temp).catch(() => {})
        } else {
          throw error
        }
      }
      return
    } catch (error) {
      lastError = error
      await unlink(temp).catch(() => {})
      if (attempt + 1 < attempts) await sleep(backoffMs * (attempt + 1))
    }
  }
  throw lastError instanceof Error ? lastError : new Error(`Failed to write ${file}`)
}

/** Parse a JSON file body without throwing; returns `undefined` on bad input. */
export function parseJsonSafe(text) {
  if (typeof text !== 'string' || text.trim().length === 0) return undefined
  try {
    return JSON.parse(text)
  } catch {
    // The caller decides whether malformed JSON is recoverable.
    return undefined
  }
}

/** Log through the Host logger when present, otherwise the process console. */
export function makeLogger(logger, prefix = `[${PLUGIN_NAME}]`) {
  const warn = typeof logger?.warn === 'function' ? logger.warn.bind(logger) : console.warn
  const error = typeof logger?.error === 'function' ? logger.error.bind(logger) : console.error
  return {
    info(message) {
      try {
        if (typeof logger?.info === 'function') logger.info(`${prefix} ${message}`)
        else console.log(`${prefix} ${message}`)
      } catch {
        // Logging must never break plugin behavior.
      }
    },
    warn(message, errorValue) {
      try {
        if (errorValue === undefined) warn(`${prefix} ${message}`)
        else warn(`${prefix} ${message}`, errorValue)
      } catch {
        // Logging must never break plugin behavior.
      }
    },
    error(message, errorValue) {
      try {
        if (errorValue === undefined) error(`${prefix} ${message}`)
        else error(`${prefix} ${message}`, errorValue)
      } catch {
        // Logging must never break plugin behavior.
      }
    },
  }
}

/** Describe an unknown failure in one short line. */
export function messageOf(error) {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  try {
    return JSON.stringify(error)
  } catch {
    return String(error)
  }
}

/** Extract readable text from one content block list. */
export function textFromContent(content) {
  if (!Array.isArray(content)) return ''
  return content
    .filter(block => block && block.type === 'text' && typeof block.text === 'string')
    .map(block => block.text)
    .join('\n')
    .trim()
}
