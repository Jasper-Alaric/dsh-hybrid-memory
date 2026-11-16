/**
 * Keyless Host activation smoke test with a minimal fake Cordis context.
 * This catches registration-shape mistakes that unit tests of pure helpers miss.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { apply } from '../index.js'
import { registerHttp } from '../lib/http.js'

function makeFakeContext(state) {
  const services = {}
  const context = {
    logger: {
      info(message) { state.logs.push(String(message)) },
      warn(message) { state.logs.push(String(message)) },
      error(message) { state.logs.push(String(message)) },
    },
    get(name) {
      if (name === 'tools') {
        return {
          get: () => undefined,
          register(definition) {
            state.tools.push(definition)
            return () => {}
          },
        }
      }
      if (name === 'llm') return { stream: async function* stream() {} }
      if (name === 'agents') return { list: () => [], get: () => undefined }
      if (name === 'webServer') {
        services.webServer ??= {
          register(route) {
            state.routes.push(route)
            return () => {}
          },
        }
        return services.webServer
      }
      if (name === 'systemPrompt') {
        services.systemPrompt ??= {
          section(section) {
            state.promptSections.push(section)
            return () => {}
          },
        }
        return services.systemPrompt
      }
      if (name === 'connection') {
        services.connection ??= { requestRejection: () => state.rejection }
        return services.connection
      }
      return undefined
    },
    inject(names, callback) {
      callback(context)
    },
    effect(callback, label) {
      let result
      if (callback.constructor && callback.constructor.name === 'GeneratorFunction') {
        const generator = callback()
        let step = generator.next()
        while (!step.done) {
          if (typeof step.value === 'function') state.cleanups.push(step.value)
          step = generator.next()
        }
        result = step.value
      } else {
        result = callback()
      }
      if (typeof result === 'function') state.cleanups.push(result)
      state.effects.push(label)
      return result
    },
    on(name, listener) {
      state.listeners.set(name, listener)
      return () => {}
    },
    provide(name, value) {
      state.provided.set(name, value)
    },
  }
  Object.defineProperty(context, 'webServer', { get: () => context.get('webServer') })
  Object.defineProperty(context, 'systemPrompt', { get: () => context.get('systemPrompt') })
  return context
}

test('apply registers tools, prompt, routes, listeners, and storage', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'dsh-hybrid-apply-'))
  const previousHome = process.env.DSH_HOME
  process.env.DSH_HOME = dir
  const state = {
    tools: [],
    routes: [],
    logs: [],
    effects: [],
    cleanups: [],
    listeners: new Map(),
    provided: new Map(),
    promptSections: [],
  }
  try {
    apply(makeFakeContext(state), {})
    await new Promise(resolve => setTimeout(resolve, 120))
    assert.equal(state.tools.length, 4)
    assert.equal(state.routes.length, 8)
    assert.equal(state.promptSections.length, 1)
    assert.equal(state.promptSections[0].name, 'hybrid-memory:context')
    assert.equal(state.listeners.has('session/event'), true)
    assert.equal(state.listeners.has('agent/status'), true)
    assert.equal(state.listeners.has('session/disposed'), true)
    assert.equal(state.listeners.has('agent/disposed'), true)
    assert.equal(state.provided.has('hybridMemory'), true)
    const snapshot = await state.provided.get('hybridMemory').store.snapshot()
    assert.equal(snapshot.files.length, 6)
    // Exercise the listener path with a synthetic turn end; no live agent/LLM is
    // needed because the threshold is 10 and this is one turn.
    state.listeners.get('session/event')({ id: 'fake-session', seq: 2, header: {} }, { type: 'turn/end', seq: 1, data: { turn: 1 } })
    assert.equal(state.provided.get('hybridMemory').store.state.sessions['fake-session'].turns, 1)
  } finally {
    for (const cleanup of state.cleanups.reverse()) {
      try {
        await cleanup()
      } catch {
        // Cleanup is best-effort in this smoke test.
      }
    }
    if (previousHome === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = previousHome
    await rm(dir, { recursive: true, force: true })
  }
})

test('HTTP routes reject before dispatch when requestRejection refuses', async () => {
  const routes = []
  const web = {
    register(route) {
      routes.push(route)
      return () => {}
    },
  }
  const ctx = {
    logger: { info() {}, warn() {}, error() {} },
    get(name) {
      return name === 'connection' ? { requestRejection: () => 403 } : undefined
    },
    inject(names, callback) {
      callback(ctx)
    },
    effect(callback) {
      const generator = callback()
      let step = generator.next()
      while (!step.done) step = generator.next()
      return () => {}
    },
  }
  Object.defineProperty(ctx, 'webServer', { get: () => web })
  registerHttp(ctx, {}, { status: () => ({}) })
  assert.equal(routes.length, 8)

  const res = {
    headersSent: false,
    writeHead(status, headers) {
      this.statusCode = status
      this.headers = headers
      this.headersSent = true
    },
    end() {},
    destroy() {},
  }
  routes[0].handler({ method: 'GET', url: routes[0].path, headers: { host: 'evil.example' } }, res)
  await new Promise(resolve => setTimeout(resolve, 20))
  assert.equal(res.statusCode, 403)
  assert.equal(res.headers['cache-control'], 'no-store')
})
