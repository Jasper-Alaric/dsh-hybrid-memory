/**
 * Event-driven extraction, idle closure, and heartbeat orchestration.
 *
 * The service never blocks a model turn: event listeners only update a small
 * counter or enqueue work, and a single background worker performs one LLM
 * call at a time. Failures are recorded in state.json and retried with
 * backoff. Heartbeats are a separate coarse timer that can (optionally) wake
 * an idle agent with a `hybrid-memory`-sourced follow-up.
 */

import { randomUUID } from 'node:crypto'
import { describeExtraction, extractFromSession } from './extract.js'
import { ageMs, makeLogger, messageOf, nowIso } from './util.js'

/**
 * Build one user-role message for a heartbeat wake.
 * Session format v4 refuses the retired `plugin` source kind in durable message
 * slots and admits only producer-owned kinds, so this names its owner directly
 * (the same convention `goal` and `schedule` producers use).
 * @param text - heartbeat instruction carried to the woken agent.
 * @returns the user-role message delivered through `agent.followup`.
 */
export function heartbeatMessage(text) {
  return {
    id: randomUUID(),
    role: 'user',
    content: [{ type: 'text', text }],
    source: { kind: 'hybrid-memory' },
  }
}

/** Default heartbeat instruction when the user has not supplied one. */
const DEFAULT_HEARTBEAT_PROMPT = `[Heartbeat] dsh-hybrid-memory periodic self-check.
Review HEARTBEAT.md and the recent memory. If there is a clear, low-risk action that does not need user input, take one small step. Otherwise reply with one short status line and stop. Do not start long-running work or ask the user unnecessary questions.`

/** Orchestrates extraction and heartbeat work over one store. */
export class HybridMemoryService {
  constructor(ctx, store) {
    this.ctx = ctx
    this.store = store
    this.log = makeLogger(ctx.logger)
    this.lifetime = new AbortController()
    this.closed = false
    this.heartbeatTimer = null
    this.idleTimers = new Map()
    this.queue = []
    this.activeJob = null
    this.waiters = []
    this.pulsePromise = null
    this.started = false
  }

  /** Start the coarse heartbeat timer once storage is ready. */
  start() {
    if (this.started) return
    this.started = true
    const tick = () => {
      void this.tick()
    }
    this.heartbeatTimer = setInterval(tick, 60_000)
    this.heartbeatTimer.unref?.()
    void this.store.ensureReady().then(() => {
      if (this.closed) return
      if (this.store.state.lastHeartbeatAt === null) {
        this.store.state.lastHeartbeatAt = nowIso()
        this.store.scheduleStateSave()
      }
      this.log.info('extraction and heartbeat service started')
    })
  }

  /** Whether a session should be excluded from shared long-term memory. */
  isSubagent(session) {
    if (this.store.settings.extraction.includeSubagents) return false
    try {
      return session?.header?.origin === 'subagent'
    } catch {
      return false
    }
  }

  /** Observe one committed session event. */
  onSessionEvent(session, event) {
    if (this.closed || session === undefined || event === undefined) return
    try {
      const id = String(session.id)
      if (event.type === 'turn/end') {
        const state = this.store.stateForSession(id)
        const turns = Math.min(100000, (Number(state.turns) || 0) + 1)
        this.store.touchSession(id, { turns })
        if (this.store.settings.extraction.enabled
          && turns >= this.store.settings.extraction.everyTurns
          && !this.isSubagent(session)) {
          this.enqueueExtraction(session, 'threshold')
        }
        return
      }
      if (event.type === 'user/message') {
        this.clearIdle(id)
        this.store.touchSession(id, { lastUserAt: nowIso() })
        return
      }
      if (event.type === 'session/created') {
        this.store.touchSession(id, {})
      }
    } catch (error) {
      this.log.warn('session event observer failed', error)
    }
  }

  /** Observe one agent status transition. */
  onAgentStatus(payload) {
    if (this.closed || !payload || !payload.agent) return
    const { agent, status } = payload
    const id = String(agent.id)
    if (status === 'running') {
      this.clearIdle(id)
      return
    }
    if (status !== 'idle') return
    try {
      const session = agent.session
      if (!session || this.isSubagent(session)) return
      const state = this.store.stateForSession(id)
      if (!this.store.settings.extraction.enabled || (Number(state.turns) || 0) <= 0) return
      this.scheduleIdle(session)
    } catch (error) {
      this.log.warn('agent status observer failed', error)
    }
  }

  /** Observe a disposed session and flush one final extraction. */
  onSessionDisposed(session) {
    if (this.closed || session === undefined) return
    try {
      const id = String(session.id)
      this.clearIdle(id)
      const state = this.store.stateForSession(id)
      if (this.isSubagent(session)) return
      if ((Number(state.turns) || 0) > 0 || (Number(state.lastSeq) || 0) < Number(session.seq || 0)) {
        this.enqueueExtraction(session, 'session-end')
      }
    } catch (error) {
      this.log.warn('session disposal observer failed', error)
    }
  }

  /** Observe a disposed agent and flush one final extraction. */
  onAgentDisposed(agent) {
    if (this.closed || !agent) return
    try {
      if (agent.session) this.onSessionDisposed(agent.session)
    } catch (error) {
      this.log.warn('agent disposal observer failed', error)
    }
  }

  /** Schedule one idle extraction for a live session. */
  scheduleIdle(session) {
    const id = String(session.id)
    this.clearIdle(id)
    const delay = Math.max(1, this.store.settings.extraction.idleMinutes) * 60_000
    const timer = setTimeout(() => {
      this.idleTimers.delete(id)
      if (!this.closed) this.enqueueExtraction(session, 'idle')
    }, delay)
    timer.unref?.()
    this.idleTimers.set(id, timer)
  }

  /** Cancel one scheduled idle extraction. */
  clearIdle(id) {
    const timer = this.idleTimers.get(id)
    if (timer !== undefined) clearTimeout(timer)
    this.idleTimers.delete(id)
  }

  /** Coarse 60-second maintenance tick. */
  async tick() {
    if (this.closed) return
    try {
      await this.store.ensureReady()
      if (this.closed) return
      await this.extractIdleSessions(2)
      const heartbeat = this.store.settings.heartbeat
      if (!heartbeat.enabled) return
      if (ageMs(this.store.state.lastHeartbeatAt) >= Math.max(1, heartbeat.intervalMinutes) * 60_000) {
        await this.pulse({ manual: false })
      }
    } catch (error) {
      this.store.recordError(error)
      this.log.warn('heartbeat tick failed', error)
    }
  }

  /** Run one heartbeat pulse and optionally wake one idle agent. */
  async pulse(options = {}) {
    if (this.pulsePromise !== null) return this.pulsePromise
    this.pulsePromise = this.#pulse(options).finally(() => {
      this.pulsePromise = null
    })
    return this.pulsePromise
  }

  async #pulse(options) {
    await this.store.ensureReady()
    const now = nowIso()
    this.store.state.lastHeartbeatAt = now
    this.store.state.heartbeatCount = Math.min(Number.MAX_SAFE_INTEGER, (Number(this.store.state.heartbeatCount) || 0) + 1)
    this.store.scheduleStateSave()
    try {
      await this.store.refineTiers()
    } catch (error) {
      this.log.warn('heartbeat tier refinement failed', error)
    }
    const extracted = await this.extractIdleSessions(2)
    let woke = null
    const heartbeat = this.store.settings.heartbeat
    if (heartbeat.proactive) {
      woke = await this.wakeOneIdleAgent(heartbeat)
    }
    await this.store.saveState()
    return {
      at: now,
      manual: options.manual === true,
      woke,
      extracted,
      intervalMinutes: heartbeat.intervalMinutes,
    }
  }

  /** Wake one recently active, idle, non-subagent agent. */
  async wakeOneIdleAgent(heartbeat) {
    if (this.closed) return null
    if (ageMs(this.store.state.lastWakeAt) < Math.max(1, heartbeat.wakeCooldownMinutes) * 60_000) return null
    const agentsService = typeof this.ctx.get === 'function' ? this.ctx.get('agents') : undefined
    if (!agentsService || typeof agentsService.list !== 'function') return null
    let agents
    try {
      agents = agentsService.list()
    } catch (error) {
      this.log.warn('could not list agents for heartbeat', error)
      return null
    }
    const candidates = []
    for (const agent of Array.isArray(agents) ? agents : []) {
      try {
        if (agent.status !== 'idle') continue
        const session = agent.session
        if (!session || this.isSubagent(session)) continue
        const state = this.store.stateForSession(String(agent.id))
        if (ageMs(state.lastUserAt ?? state.lastActivityAt) > 24 * 60 * 60_000) continue
        candidates.push({ agent, state })
      } catch {
        // A disposed agent cannot be a wake target.
      }
    }
    if (candidates.length === 0) return null
    candidates.sort((left, right) => ageMs(right.state.lastActivityAt) - ageMs(left.state.lastActivityAt))
    const target = candidates[0]
    const custom = typeof heartbeat.prompt === 'string' ? heartbeat.prompt.trim() : ''
    try {
      target.agent.followup(heartbeatMessage(custom.length > 0 ? custom : DEFAULT_HEARTBEAT_PROMPT))
      this.store.state.lastWakeAt = nowIso()
      this.store.scheduleStateSave()
      return String(target.agent.id)
    } catch (error) {
      this.store.recordError(error)
      this.log.warn('heartbeat wake failed', error)
      return null
    }
  }

  /** Enqueue idle extractions for sessions whose activity has gone quiet. */
  async extractIdleSessions(limit = 2) {
    if (!this.store.settings.extraction.enabled) return 0
    const agentsService = typeof this.ctx.get === 'function' ? this.ctx.get('agents') : undefined
    if (!agentsService || typeof agentsService.get !== 'function') return 0
    const idleMs = Math.max(1, this.store.settings.extraction.idleMinutes) * 60_000
    let queued = 0
    for (const [id, state] of Object.entries(this.store.state.sessions)) {
      if (queued >= limit) break
      if ((Number(state.turns) || 0) <= 0) continue
      if (ageMs(state.lastActivityAt ?? state.lastUserAt) < idleMs) continue
      const agent = agentsService.get(id)
      const session = agent?.session
      if (!session || this.isSubagent(session)) continue
      this.enqueueExtraction(session, 'idle', agent)
      queued += 1
    }
    return queued
  }

  /** Enqueue one extraction job, collapsing duplicates for the same session. */
  enqueueExtraction(session, reason, agent) {
    if (this.closed || session === undefined) return
    try {
      const id = String(session.id)
      const existing = this.queue.find(job => String(job.session.id) === id)
      if (existing !== undefined) {
        existing.reason = reason
        if (agent !== undefined) existing.agent = agent
        return
      }
      this.queue.push({ session, reason, agent })
      void this.pump()
    } catch (error) {
      this.log.warn('could not enqueue extraction', error)
    }
  }

  /** Run queued jobs one at a time. */
  async pump() {
    if (this.activeJob !== null || this.closed) return
    const job = this.queue.shift()
    if (job === undefined) {
      this.resolveWaiters()
      return
    }
    this.activeJob = (async () => {
      try {
        await this.runJob(job)
      } catch (error) {
        this.store.recordError(error)
        this.log.warn('extraction job failed', error)
      } finally {
        this.activeJob = null
        if (this.closed) {
          this.resolveWaiters()
          return
        }
        void this.pump()
      }
    })()
  }

  /** Execute one extraction job and commit the through-sequence on success. */
  async runJob(job) {
    await this.store.ensureReady()
    const session = job.session
    const id = String(session.id)
    if (this.isSubagent(session)) return { skipped: true, reason: 'subagent session' }
    const extraction = this.store.settings.extraction
    if (!extraction.enabled && job.reason !== 'manual') return { skipped: true, reason: 'extraction disabled' }
    const state = this.store.stateForSession(id)
    if (job.reason !== 'manual' && Number(state.retryAt) > Date.now()) return { skipped: true, reason: 'retry backoff' }
    const llm = typeof this.ctx.get === 'function' ? this.ctx.get('llm') : undefined
    if (!llm || typeof llm.stream !== 'function') throw new Error('LLM service is unavailable')
    let summary
    let finalSummary = null
    let skippedSummary = null
    let committedSeq = Number(state.lastSeq) || 0
    const totals = { addedUser: 0, addedFacts: 0, duplicates: 0 }
    let batches = 0
    try {
      // Drain a bounded number of batches so a long backlog is not lost when
      // the session ends. Each batch commits only through its last message.
      for (let batch = 0; batch < 4; batch += 1) {
        const current = await extractFromSession({
          store: this.store,
          llm,
          session,
          agent: job.agent,
          settings: this.store.settings,
          signal: this.lifetime.signal,
        })
        batches += 1
        if (current.skipped) {
          skippedSummary = current
          break
        }
        finalSummary = current
        totals.addedUser += current.addedUser ?? 0
        totals.addedFacts += current.addedFacts ?? 0
        totals.duplicates += current.duplicates ?? 0
        committedSeq = current.throughSeq
        state.lastSeq = committedSeq
        if (current.transcriptHasMore !== true) break
      }
    } catch (error) {
      // Keep the last successfully committed batch; retry starts after it.
      state.lastSeq = committedSeq
      const attempts = Math.min(20, (Number(state.attempts) || 0) + 1)
      const delayMinutes = Math.max(1, Number(extraction.retryMinutes) || 10) * Math.min(4, attempts)
      state.attempts = attempts
      state.retryAt = Date.now() + delayMinutes * 60_000
      state.lastReason = job.reason
      this.store.recordError(error)
      await this.store.saveState()
      throw error
    }
    summary = finalSummary === null ? skippedSummary : { ...finalSummary, ...totals, batches }
    if (summary === null || summary === undefined) {
      return { skipped: true, reason: 'no extraction result', throughSeq: committedSeq }
    }
    const at = nowIso()
    if (summary.skipped) {
      state.lastSeq = summary.throughSeq
      state.turns = 0
      state.lastReason = job.reason
      state.lastActivityAt = at
      this.store.scheduleStateSave()
      return summary
    }
    state.lastSeq = summary.throughSeq
    state.turns = 0
    state.lastExtractAt = at
    state.lastReason = job.reason
    state.attempts = 0
    state.retryAt = 0
    this.store.state.lastExtractAt = at
    this.store.state.lastExtraction = {
      at,
      sessionId: id,
      reason: job.reason,
      addedUser: summary.addedUser ?? 0,
      addedFacts: summary.addedFacts ?? 0,
      skipped: summary.duplicates ?? 0,
      model: summary.route ? `${summary.route.provider}/${summary.route.model}` : null,
      summary: describeExtraction(summary),
    }
    this.store.clearError()
    await this.store.saveState()
    this.store.notify('extraction')
    return summary
  }

  /** Extract now for every live session and wait briefly for the queue. */
  async extractNow() {
    await this.store.ensureReady()
    const agentsService = typeof this.ctx.get === 'function' ? this.ctx.get('agents') : undefined
    if (!agentsService || typeof agentsService.list !== 'function') {
      return { queued: 0, completed: false, error: 'The agent service is unavailable' }
    }
    let agents
    try {
      agents = agentsService.list()
    } catch (error) {
      return { queued: 0, completed: false, error: messageOf(error) }
    }
    let queued = 0
    for (const agent of Array.isArray(agents) ? agents : []) {
      try {
        if (!agent.session || this.isSubagent(agent.session)) continue
        this.enqueueExtraction(agent.session, 'manual', agent)
        queued += 1
      } catch {
        // Skip an agent that is being disposed.
      }
    }
    if (queued === 0) return { queued: 0, completed: false, error: 'No live session is available to extract' }
    const completed = await this.waitForIdle(60_000)
    return {
      queued,
      completed,
      lastExtraction: this.store.state.lastExtraction,
      error: this.store.state.lastError ?? null,
    }
  }

  /** Resolve true when the queue and active job are empty, or false on timeout. */
  waitForIdle(timeoutMs = 60_000) {
    if (this.activeJob === null && this.queue.length === 0) return Promise.resolve(true)
    return new Promise((resolve) => {
      const waiter = { resolve: null, timer: null }
      waiter.resolve = () => {
        clearTimeout(waiter.timer)
        this.waiters = this.waiters.filter(item => item !== waiter)
        resolve(true)
      }
      waiter.timer = setTimeout(() => {
        this.waiters = this.waiters.filter(item => item !== waiter)
        resolve(false)
      }, Math.max(100, Math.min(timeoutMs, 120_000)))
      waiter.timer.unref?.()
      this.waiters.push(waiter)
    })
  }

  /** Release every waiter once the worker is idle. */
  resolveWaiters() {
    if (this.activeJob !== null || this.queue.length > 0) return
    const waiters = this.waiters
    this.waiters = []
    for (const waiter of waiters) waiter.resolve()
  }

  /** Observe a durable store change; timer-driven work reads settings live. */
  onStoreChanged(_reason) {
    // Settings are read on each tick, so no timer restart is needed. Keeping the
    // hook explicit leaves room for future derived-state work without coupling
    // the store to the service.
  }

  /** UI status fragment. */
  status() {
    return {
      extractionEnabled: this.store.settings.extraction.enabled,
      heartbeatEnabled: this.store.settings.heartbeat.enabled,
      queued: this.queue.length,
      extracting: this.activeJob !== null,
      activeSession: this.activeJob === null ? null : 'running',
      idleTimers: this.idleTimers.size,
    }
  }

  /** Stop timers and abort in-flight model work. */
  async close() {
    if (this.closed) return
    this.closed = true
    if (this.heartbeatTimer !== null) clearInterval(this.heartbeatTimer)
    this.heartbeatTimer = null
    for (const timer of this.idleTimers.values()) clearTimeout(timer)
    this.idleTimers.clear()
    this.queue = []
    this.lifetime.abort(new Error('hybrid memory service disposed'))
    this.resolveWaiters()
    const active = this.activeJob
    if (active !== null) {
      await Promise.race([active, new Promise(resolve => setTimeout(resolve, 1500))])
    }
  }
}
