/**
 * Shared constants for dsh-hybrid-memory.
 *
 * The storage format is deliberately plain Markdown so a user can open every
 * file in Notepad and edit it. Only the small settings/state sidecars are JSON.
 */

/** Stable plugin id used in logs, credential-free storage paths, and HTTP routes. */
export const PLUGIN_NAME = 'dsh-hybrid-memory'

/** Same-origin HTTP API consumed by the Web settings section. */
export const API_PREFIX = '/hybrid-memory/api'

/** Every HTTP endpoint registered by this bundle. */
export const API = Object.freeze({
  state: `${API_PREFIX}/state`,
  config: `${API_PREFIX}/config`,
  fileRead: `${API_PREFIX}/file/read`,
  fileWrite: `${API_PREFIX}/file/write`,
  search: `${API_PREFIX}/search`,
  extract: `${API_PREFIX}/extract`,
  heartbeat: `${API_PREFIX}/heartbeat`,
  reindex: `${API_PREFIX}/reindex`,
})

/** Sidecar files that must never be exposed through the Markdown file API. */
export const SIDECAR_FILES = Object.freeze(['settings.json', 'state.json'])

/** Default per-file loading behavior. */
export const FILE_DEFAULTS = Object.freeze({
  soul: Object.freeze({ enabled: true, inject: true }),
  user: Object.freeze({ enabled: true, inject: true }),
  agent: Object.freeze({ enabled: true, inject: true }),
  agents: Object.freeze({ enabled: true, inject: true }),
  memory: Object.freeze({ enabled: true, inject: false }),
  heartbeat: Object.freeze({ enabled: true, inject: false }),
})

/**
 * The file registry. Order is prompt order, list order, and search tie-break
 * order. `tiered` marks the one file whose `## Core` / `## Important` /
 * `## General` sections are parsed into ranked memory entries.
 */
export const FILE_DEFS = Object.freeze({
  soul: Object.freeze({
    id: 'soul',
    name: 'SOUL.md',
    title: 'Soul',
    titleZh: '人格底色',
    description: 'Agent identity, values, voice, and boundaries. Injected as a system prompt by default.',
    descriptionZh: 'Agent 的身份、价值观、语气和边界。默认作为系统提示词注入。',
    injectDefault: true,
    tiered: false,
    order: 10,
    maxBytes: 65536,
  }),
  user: Object.freeze({
    id: 'user',
    name: 'USER.md',
    title: 'User',
    titleZh: '用户画像',
    description: 'User profile, preferences, and boundaries. Injected by default and updated in the background.',
    descriptionZh: '用户画像、偏好和边界。默认注入，并由后台增量更新。',
    injectDefault: true,
    tiered: false,
    order: 20,
    maxBytes: 65536,
  }),
  agent: Object.freeze({
    id: 'agent',
    name: 'AGENT.md',
    title: 'Agent',
    titleZh: 'Agent 规则',
    description: 'Operating rules and self-model for this agent. Injected by default.',
    descriptionZh: '当前 Agent 的工作规则与自我模型。默认注入。',
    injectDefault: true,
    tiered: false,
    order: 30,
    maxBytes: 65536,
  }),
  agents: Object.freeze({
    id: 'agents',
    name: 'AGENTS.md',
    title: 'Agents',
    titleZh: '协作约定',
    description: 'Multi-agent and team collaboration conventions. Injected by default.',
    descriptionZh: '多 Agent / 团队协作约定。默认注入。',
    injectDefault: true,
    tiered: false,
    order: 40,
    maxBytes: 65536,
  }),
  memory: Object.freeze({
    id: 'memory',
    name: 'MEMORY.md',
    title: 'Memory',
    titleZh: '长期记忆',
    description: 'Tiered long-term facts. Not injected in full; search with memory_search or read on demand.',
    descriptionZh: '分层长期事实。默认不全量注入；需要时用 memory_search 检索或 memory_read 读取。',
    injectDefault: false,
    tiered: true,
    order: 50,
    maxBytes: 262144,
  }),
  heartbeat: Object.freeze({
    id: 'heartbeat',
    name: 'HEARTBEAT.md',
    title: 'Heartbeat',
    titleZh: '心跳清单',
    description: 'Proactive checklist the agent reads when a heartbeat wakes it. Search-only by default.',
    descriptionZh: '心跳唤醒时 Agent 参考的主动工作清单。默认只参与检索。',
    injectDefault: false,
    tiered: false,
    order: 60,
    maxBytes: 65536,
  }),
})

/** File ids in display and prompt order. */
export const FILE_IDS = Object.freeze(Object.keys(FILE_DEFS))

/** Memory tiers from most to least durable. */
export const TIERS = Object.freeze(['core', 'important', 'general'])

/** Human labels used inside Markdown headings and UI badges. */
export const TIER_LABELS = Object.freeze({
  core: Object.freeze({ title: 'Core', titleZh: '核心', marker: '⭐' }),
  important: Object.freeze({ title: 'Important', titleZh: '重要', marker: '' }),
  general: Object.freeze({ title: 'General', titleZh: '一般', marker: '' }),
})

/** Default editable settings. `storageDir` comes from the patch only. */
export const DEFAULT_SETTINGS = Object.freeze({
  version: 1,
  files: Object.freeze({
    soul: Object.freeze({ enabled: true, inject: true }),
    user: Object.freeze({ enabled: true, inject: true }),
    agent: Object.freeze({ enabled: true, inject: true }),
    agents: Object.freeze({ enabled: true, inject: true }),
    memory: Object.freeze({ enabled: true, inject: false }),
    heartbeat: Object.freeze({ enabled: true, inject: false }),
  }),
  injection: Object.freeze({
    maxChars: 12000,
    order: 250,
  }),
  extraction: Object.freeze({
    enabled: true,
    everyTurns: 10,
    idleMinutes: 10,
    maxTranscriptChars: 14000,
    maxMessages: 40,
    provider: '',
    model: '',
    maxTokens: 1400,
    retryMinutes: 10,
    includeSubagents: false,
  }),
  heartbeat: Object.freeze({
    enabled: true,
    intervalMinutes: 30,
    proactive: true,
    wakeCooldownMinutes: 180,
    prompt: '',
  }),
  budgets: Object.freeze({
    core: 8,
    important: 40,
    general: 80,
    totalChars: 12000,
  }),
  ui: Object.freeze({
    sidebar: false,
  }),
})

/** Settings bounds enforced at the file and HTTP boundaries. */
export const LIMITS = Object.freeze({
  minFileBytes: 0,
  maxFileBytes: 262144,
  maxEntryChars: 300,
  maxPersonaBytes: 65536,
  maxBodyBytes: 524288,
  maxSearchQueryChars: 400,
  maxSearchLimit: 20,
  maxReadLines: 400,
  maxInjectionChars: 50000,
  minInjectionChars: 1000,
  minEveryTurns: 2,
  maxEveryTurns: 100,
  minIdleMinutes: 1,
  maxIdleMinutes: 1440,
  minHeartbeatMinutes: 5,
  maxHeartbeatMinutes: 1440,
  minWakeCooldownMinutes: 15,
  maxWakeCooldownMinutes: 1440,
  minBudget: 5,
  maxBudget: 500,
  minTotalChars: 2000,
  maxTotalChars: 100000,
})

/** Initial Markdown files. They are only written when a file is missing. */
export const DEFAULT_TEMPLATES = Object.freeze({
  soul: `# SOUL

<!-- Agent 人格底色 / Agent persona. 直接编辑本文件；保存后从下一次对话开始生效。 -->
## Identity
- 你是一个沉稳、可靠、注重结果的长期协作助手。
- 你尊重用户的时间，先给结论，再给必要的细节。

## Values
- 诚实：不确定时明确说明，不编造事实。
- 克制：不夸大、不空谈，优先完成用户真正需要的事。
- 连续：把跨会话的重要信息当作长期承诺，而不是一次性上下文。

## Voice
- 默认使用用户当前使用的语言。
- 简洁、具体、可执行；避免模板化的客套话。

## Boundaries
- 不擅自修改用户明确设定的边界。
- 涉及不可逆操作时，先确认。
`,
  user: `# USER

<!-- 用户画像 / User profile. hybrid-memory 会在后台增量补充 Preferences；你也可以直接编辑。 -->
## Profile
<!-- 姓名、称呼、时区、长期角色等稳定信息。 -->

## Preferences
<!-- 稳定的工作偏好、表达偏好、工具偏好。 -->

## Boundaries
<!-- 用户明确要求不要做的事。 -->
`,
  agent: `# AGENT

<!-- 当前 Agent 的自我模型与工作规则 / operating rules. 由你维护。 -->
## Role
- 作为 DSH 中的长期协作 Agent 工作。

## Operating rules
- 先理解目标，再执行；复杂任务先列出步骤。
- 工具失败时说明原因并尝试替代路径，不静默失败。
- 重要结论写入 MEMORY.md 或 USER.md，供后续会话使用。

## Limitations
<!-- 按需补充。 -->
`,
  agents: `# AGENTS

<!-- 多 Agent / 团队协作约定 / Collaboration conventions. -->
## Collaboration
- 尊重共享任务板与写入范围；并行写入前先划分文件。
- 子 Agent 的结果由主 Agent 汇总并复核。

## Conventions
- 文件末尾保留一个换行；使用 UTF-8。
- 不覆盖其他人正在编辑的范围。
`,
  memory: `# MEMORY

<!--
分层长期记忆 / Tiered long-term memory：
- Core：只放重要事实，以及用户明确要求记住的事。带 ⭐ 的条目不会被自动降级。
- Important：稳定的偏好、决定和关键事实。
- General：一般背景信息；容量不足时最旧的未置顶条目会归档到 MEMORY.archive.md。

hybrid-memory 会增量维护本文件；你也可以直接编辑。
-->
## Core
<!-- tier:core -->

## Important
<!-- tier:important -->

## General
<!-- tier:general -->
`,
  heartbeat: `# HEARTBEAT

<!-- 主动工作清单 / Proactive checklist. 心跳触发时，Agent 会参考这里的内容决定是否主动推进。 -->
## Checklist
- 检查是否有未闭环的任务需要跟进。
- 检查 MEMORY.md 是否有需要整理或升级为 Core 的内容。

## Log
<!-- 可选手动记录；插件不会自动写入这里。 -->
`,
})

/** Canonical headings used when the plugin appends sections. */
export const SECTION_HEADINGS = Object.freeze({
  soul: 'Notes',
  user: 'Preferences',
  agent: 'Notes',
  agents: 'Notes',
  memory: 'General',
  heartbeat: 'Log',
})
