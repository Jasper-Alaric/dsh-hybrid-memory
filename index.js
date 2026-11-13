/**
 * dsh-hybrid-memory Host entry.
 *
 * A transparent Markdown memory store, four model-facing tools, a cached
 * system-prompt section, non-blocking session extraction, a heartbeat, and a
 * same-origin HTTP API for the Web settings page. Nothing in `apply` throws:
 * a missing optional service or a broken storage directory only disables the
 * affected capability and leaves the Host running.
 */

import os from 'node:os'
import path from 'node:path'
import { PLUGIN_NAME } from './lib/constants.js'
import { registerHttp } from './lib/http.js'
import { HybridMemoryService } from './lib/service.js'
import { HybridMemoryStore } from './lib/store.js'
import { registerTools } from './lib/tools.js'
import { makeLogger } from './lib/util.js'

/** Loader row name. */
export const name = 'hybrid-memory'

/** Every capability is optional; each one is registered through `ctx.inject`. */
export const inject = []

/**
 * Resolve the storage directory.
 *
 * The default follows the user's DSH home: `$DSH_HOME/hybrid_memory`, or
 * `~/.dsh/hybrid_memory` when the environment variable is absent. A configured
 * `storageDir` wins; relative paths resolve from the process working directory.
 *
 * @param config - patch configuration.
 * @returns absolute storage directory.
 */
export function resolveStorageDir(config) {
  const configured = config && typeof config.storageDir === 'string' ? config.storageDir.trim() : ''
  if (configured.length > 0) return path.resolve(configured)
  const home = typeof process.env.DSH_HOME === 'string' && process.env.DSH_HOME.trim().length > 0
    ? process.env.DSH_HOME.trim()
    : path.join(os.homedir(), '.dsh')
  return path.join(home, 'hybrid_memory')
}

/** Register the cached persona/profile prompt section. */
function registerPrompt(ctx, store, log) {
  ctx.inject(['systemPrompt'], (promptCtx) => {
    try {
      promptCtx.effect(() => promptCtx.systemPrompt.section({
        name: 'hybrid-memory:context',
        order: 250,
        text: () => {
          try {
            return store.renderInjection()
          } catch (error) {
            log.warn('could not render memory prompt section', error)
            return ''
          }
        },
      }), 'hybrid-memory prompt section')
    } catch (error) {
      log.error('could not register memory prompt section', error)
    }
  })
}

/** Subscribe to session and agent lifecycle events. */
function registerEvents(ctx, service, log) {
  try {
    ctx.on('session/event', (session, event) => {
      try {
        service.onSessionEvent(session, event)
      } catch (error) {
        log.warn('session event listener failed', error)
      }
    })
    ctx.on('agent/status', (payload) => {
      try {
        service.onAgentStatus(payload)
      } catch (error) {
        log.warn('agent status listener failed', error)
      }
    })
    ctx.on('session/disposed', (session) => {
      try {
        service.onSessionDisposed(session)
      } catch (error) {
        log.warn('session disposal listener failed', error)
      }
    })
    ctx.on('agent/disposed', (payload) => {
      try {
        service.onAgentDisposed(payload?.agent)
      } catch (error) {
        log.warn('agent disposal listener failed', error)
      }
    })
  } catch (error) {
    log.error('could not register lifecycle listeners', error)
  }
}

/**
 * Activate the bundle.
 *
 * @param ctx - Host plugin context.
 * @param config - patch configuration.
 */
export function apply(ctx, config) {
  const log = makeLogger(ctx.logger)
  try {
    const dir = resolveStorageDir(config)
    let service
    const store = new HybridMemoryStore({
      dir,
      config,
      logger: ctx.logger,
      onChanged: (reason) => {
        try {
          service?.onStoreChanged?.(reason)
        } catch (error) {
          log.warn('store change observer failed', error)
        }
      },
    })
    service = new HybridMemoryService(ctx, store)
    try {
      ctx.provide('hybridMemory', service)
    } catch (error) {
      log.warn('could not provide hybridMemory service', error)
    }
    ctx.effect(() => async () => {
      try {
        await service.close()
      } catch (error) {
        log.warn('memory service shutdown failed', error)
      }
      try {
        await store.close()
      } catch (error) {
        log.warn('memory store shutdown failed', error)
      }
    }, 'hybrid-memory lifecycle')
    if (typeof ctx.inject === 'function') {
      ctx.inject(['tools'], (toolCtx) => registerTools(toolCtx, store))
    } else {
      registerTools(ctx, store)
    }
    registerPrompt(ctx, store, log)
    registerEvents(ctx, service, log)
    registerHttp(ctx, store, service)
    service.start()
    void store.ensureReady().then(() => {
      if (!store.lastError) log.info(`hybrid memory ready at ${dir}`)
    }).catch((error) => {
      log.error('hybrid memory initialization failed', error)
    })
  } catch (error) {
    log.error(`${PLUGIN_NAME} activation failed`, error)
  }
}
