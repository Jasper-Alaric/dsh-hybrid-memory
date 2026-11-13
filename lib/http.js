/**
 * Same-origin HTTP surface for the Web settings section.
 *
 * The browser session is admitted through the same `connection.authorizeIndex`
 * check that protects the GUI shell. There is no CORS surface and no token in
 * the page: the route only accepts JSON from the authenticated page peer and
 * every operation is either a read or an explicit user edit.
 */

import { API, LIMITS } from './constants.js'
import { isRecord, makeLogger, messageOf } from './util.js'

/** Send one JSON response with no-store caching. */
function sendJson(res, status, value) {
  if (res.headersSent) return
  const body = JSON.stringify(value)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': String(Buffer.byteLength(body)),
  })
  res.end(body)
}

/** Send an empty method/status response. */
function sendEmpty(res, status, headers = {}) {
  if (res.headersSent) return
  res.writeHead(status, { 'cache-control': 'no-store', ...headers })
  res.end()
}

/** Read a bounded JSON request body. */
async function readJsonBody(req, maxBytes) {
  const chunks = []
  let total = 0
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    total += buffer.length
    if (total > maxBytes) {
      const error = new Error(`request body exceeds ${maxBytes} bytes`)
      error.code = 'BODY_TOO_LARGE'
      throw error
    }
    chunks.push(buffer)
  }
  const text = Buffer.concat(chunks).toString('utf8')
  if (text.trim().length === 0) return {}
  try {
    return JSON.parse(text)
  } catch {
    const error = new Error('request body must be valid JSON')
    error.code = 'BAD_JSON'
    throw error
  }
}

/** Whether the request declares a JSON body. */
function isJsonContentType(req) {
  const value = req.headers['content-type']
  return typeof value === 'string' && value.toLowerCase().includes('application/json')
}

/**
 * Register the HTTP routes when a Web server is present.
 *
 * @param ctx - plugin context.
 * @param store - memory store.
 * @param service - extraction/heartbeat service.
 */
export function registerHttp(ctx, store, service) {
  const log = makeLogger(ctx.logger)
  ctx.inject(['webServer'], (webCtx) => {
    const web = webCtx.webServer
    if (!web || typeof web.register !== 'function') {
      log.warn('webServer service is unavailable; memory UI API was not registered')
      return
    }
    try {
      webCtx.effect(function* registerRoutes() {
        const paths = Object.values(API)
        for (const path of paths) {
          yield web.register({
            kind: 'exact',
            path,
            handler: (req, res) => {
              void handleRequest(ctx, store, service, req, res, path).catch((error) => {
                log.warn(`admin route ${path} failed`, error)
                if (!res.headersSent) sendJson(res, 500, { error: messageOf(error) })
                else res.destroy()
              })
            },
          })
        }
      }, 'hybrid-memory http routes')
    } catch (error) {
      log.error('could not register memory UI API', error)
    }
  })
}

/** Dispatch one admitted request. */
async function handleRequest(ctx, store, service, req, res, path) {
  const connection = typeof ctx.get === 'function' ? ctx.get('connection') : undefined
  if (!connection || typeof connection.authorizeIndex !== 'function') {
    sendJson(res, 503, { error: 'The DSH browser connection service is unavailable' })
    return
  }
  if (!connection.authorizeIndex(req, res)) return

  if (path === API.state) {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      sendEmpty(res, 405, { allow: 'GET, HEAD' })
      return
    }
    const snapshot = await store.snapshot({ status: service.status() })
    if (req.method === 'HEAD') {
      const body = JSON.stringify(snapshot)
      res.writeHead(200, {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
        'content-length': String(Buffer.byteLength(body)),
      })
      res.end()
      return
    }
    sendJson(res, 200, snapshot)
    return
  }

  if (req.method !== 'POST') {
    sendEmpty(res, 405, { allow: 'POST' })
    return
  }
  if (!isJsonContentType(req)) {
    sendJson(res, 415, { error: 'Content-Type must be application/json' })
    return
  }
  let body
  try {
    body = await readJsonBody(req, LIMITS.maxBodyBytes)
  } catch (error) {
    sendJson(res, error.code === 'BODY_TOO_LARGE' ? 413 : 400, { error: messageOf(error) })
    return
  }
  if (!isRecord(body)) {
    sendJson(res, 400, { error: 'Request body must be an object' })
    return
  }

  try {
    if (path === API.config) {
      const patch = isRecord(body.patch) ? body.patch : body
      await store.updateSettings(patch)
      sendJson(res, 200, await store.snapshot({ status: service.status() }))
      return
    }
    if (path === API.fileRead) {
      const id = store.normalizeFileId(typeof body.file === 'string' ? body.file : '')
      const read = await store.readFile(id)
      sendJson(res, 200, {
        ok: true,
        file: read.def.name,
        path: read.path,
        content: read.content,
        bytes: read.bytes,
        updatedAt: read.updatedAt,
      })
      return
    }
    if (path === API.fileWrite) {
      const id = store.normalizeFileId(typeof body.file === 'string' ? body.file : '')
      const content = typeof body.content === 'string' ? body.content : ''
      const written = await store.writeFile(id, content, { reason: 'ui' })
      await store.ensureIndex()
      sendJson(res, 200, {
        ok: true,
        file: written.def.name,
        bytes: written.bytes,
        snapshot: await store.snapshot({ status: service.status() }),
      })
      return
    }
    if (path === API.search) {
      const query = typeof body.query === 'string' ? body.query : ''
      const limit = Number.isFinite(body.limit) ? body.limit : 5
      const file = typeof body.file === 'string' && body.file.length > 0 ? store.normalizeFileId(body.file) : undefined
      const result = await store.search(query, { limit, ...file === undefined ? {} : { file } })
      sendJson(res, 200, { ok: true, ...result })
      return
    }
    if (path === API.extract) {
      const result = await service.extractNow()
      sendJson(res, 200, { ok: true, result, snapshot: await store.snapshot({ status: service.status() }) })
      return
    }
    if (path === API.heartbeat) {
      const result = await service.pulse({ manual: true })
      sendJson(res, 200, { ok: true, result, snapshot: await store.snapshot({ status: service.status() }) })
      return
    }
    if (path === API.reindex) {
      await store.reloadAll()
      const index = await store.ensureIndex()
      sendJson(res, 200, { ok: true, documents: index.docs.length, snapshot: await store.snapshot({ status: service.status() }) })
      return
    }
    sendJson(res, 404, { error: 'Unknown memory API route' })
  } catch (error) {
    sendJson(res, 400, { error: messageOf(error) })
  }
}
