/**
 * Browser half of dsh-hybrid-memory.
 *
 * One settings section and one optional sidebar action. The UI reads and writes
 * the same-origin `/hybrid-memory/api` routes; it never imports another
 * plugin's components, and every visible string comes from the locale service.
 */

window.__ModuleLoader__.load({
  id: '@jasper_alaric/dsh-hybrid-memory',
  factory(require) {
    const React = require('react')
    const { useCallback, useEffect, useRef, useState } = React
    const h = React.createElement
    const API_BASE = '/hybrid-memory/api/'

    const EN = {
      title: 'Hybrid memory',
      languageCode: 'en',
      versionLabel: 'v1.0.0',
      sidebarLabel: 'Memory',
      subtitle: 'Transparent Markdown memory with background extraction, tiered facts, and BM25 retrieval.',
      storage: 'Storage directory',
      close: 'Close',
      save: 'Save',
      cancel: 'Cancel',
      edit: 'Edit',
      load: 'Load',
      inject: 'Inject',
      tiered: 'Tiered',
      core: 'Core',
      important: 'Important',
      general: 'General',
      files: 'Files',
      filesHint: 'Each file is plain Markdown. Load includes a file in search; Inject adds it to the system prompt. MEMORY.md is search-only by default.',
      automation: 'Automation',
      automationHint: 'Extraction runs in the background and never blocks a conversation. The heartbeat maintains memory and can wake an idle agent.',
      search: 'Search memory',
      searchPlaceholder: 'Search facts and preferences…',
      searchButton: 'Search',
      searching: 'Searching…',
      noResults: 'No matches.',
      resultsFor: 'Results for {query}',
      extractNow: 'Extract now',
      pulseNow: 'Pulse now',
      reindex: 'Reindex',
      extracting: 'Extracting…',
      pulsing: 'Pulsing…',
      reindexing: 'Reindexing…',
      saved: 'Saved',
      lastExtract: 'Last extraction',
      lastHeartbeat: 'Last heartbeat',
      never: 'never',
      autoExtract: 'Automatic extraction',
      everyTurns: 'Extract every N turns',
      idleMinutes: 'Idle extraction (minutes)',
      heartbeat: 'Heartbeat',
      interval: 'Heartbeat interval (minutes)',
      proactive: 'Proactive wake',
      cooldown: 'Wake cooldown (minutes)',
      budgets: 'Tier budgets',
      budgetsHint: 'Core is only for important facts and explicit “remember this” requests. Overflow demotes the oldest unpinned entries; pinned core entries are never moved. The total-character cap archives the oldest General entries first.',
      totalChars: 'Total characters',
      sidebar: 'Sidebar',
      showInSidebar: 'Show a quick-access button in the sidebar',
      status: 'Status',
      trackedSessions: 'Tracked sessions',
      queued: 'Queued',
      editorTitle: 'Edit {file}',
      editorHint: 'Changes are written atomically. Keep the Markdown headings if you want tier parsing to keep working.',
      saveFile: 'Save file',
      loading: 'Loading memory…',
      loadError: 'Could not load memory',
      retry: 'Retry',
      lines: 'lines',
      bytes: 'bytes',
      tier: 'Tier',
      score: 'score',
      requestFailed: 'Request failed',
      fileSoul: 'Agent identity, values, voice, and boundaries.',
      fileUser: 'User profile, preferences, and boundaries. Updated in the background.',
      fileAgent: 'Operating rules and self-model for this agent.',
      fileAgents: 'Multi-agent and team collaboration conventions.',
      fileMemory: 'Tiered long-term facts. Not injected in full; search or read on demand.',
      fileHeartbeat: 'Proactive checklist the agent reads when a heartbeat wakes it.',
      hint: 'Everything lives in plain Markdown under the storage directory. You can edit it in Notepad at any time; the plugin watches for external changes.',
      writeFailed: 'Write failed',
      readFailed: 'Read failed',
      settingsFailed: 'Settings failed',
      pulseFailed: 'Heartbeat failed',
      extractFailed: 'Extraction failed',
      noLiveSession: 'No live session is available.',
      lastError: 'Last error',
      disable: 'Disable',
      enable: 'Enable',
      injected: 'Injected',
      searchOnly: 'Search-only',
      openSettings: 'Open settings',
      quickAccess: 'Quick memory access',
      mode: 'Mode',
      name: 'Name',
      size: 'Size',
      updated: 'Updated',
      memoryLayers: 'Memory layers',
      storagePath: 'Folder',
      heartbeatCount: 'Heartbeats',
      extractionSummary: 'Extraction',
      noSummary: 'No extraction yet.',
      emptyFile: '(empty)',
      closeEditor: 'Close editor',
      saving: 'Saving…',
      loadingState: 'Reading storage…',
      saveFailed: 'Could not save the file',
      stateFailed: 'Could not read state',
      searchFailed: 'Search failed',
      reindexFailed: 'Reindex failed',
      searchLimit: 'Top 8 results',
      description: 'Description',
      tierCounts: 'Core {core} · Important {important} · General {general}',
      bytesAndLines: '{bytes} · {lines} lines',
      extractionEvery: 'Every {n} turns',
      autoOff: 'Off',
      autoOn: 'On',
      lastExtractionAt: 'at {time}',
      sidebarEnabled: 'Sidebar button enabled',
      sidebarDisabled: 'Sidebar button hidden',
    }

    const ZH = {
      title: '混合记忆',
      languageCode: 'zh',
      versionLabel: 'v1.0.0',
      sidebarLabel: '记忆',
      subtitle: '透明 Markdown 长期记忆：后台提炼、分层事实与 BM25 检索。',
      storage: '存储目录',
      close: '关闭',
      save: '保存',
      cancel: '取消',
      edit: '编辑',
      load: '加载',
      inject: '注入',
      tiered: '分层',
      core: '核心',
      important: '重要',
      general: '一般',
      files: '文件',
      filesHint: '每个文件都是普通 Markdown。加载 = 参与检索；注入 = 加入系统提示词。MEMORY.md 默认只参与检索。',
      automation: '自动化',
      automationHint: '提炼在后台运行，不阻塞对话。心跳负责维护记忆，并可在空闲时主动唤醒 Agent。',
      search: '检索记忆',
      searchPlaceholder: '搜索事实与偏好…',
      searchButton: '搜索',
      searching: '搜索中…',
      noResults: '没有匹配结果。',
      resultsFor: '“{query}”的结果',
      extractNow: '立即提炼',
      pulseNow: '立即心跳',
      reindex: '重建索引',
      extracting: '提炼中…',
      pulsing: '心跳中…',
      reindexing: '重建中…',
      saved: '已保存',
      lastExtract: '上次提炼',
      lastHeartbeat: '上次心跳',
      never: '从未',
      autoExtract: '自动提炼',
      everyTurns: '每 N 轮提炼',
      idleMinutes: '空闲提炼（分钟）',
      heartbeat: '心跳',
      interval: '心跳间隔（分钟）',
      proactive: '主动唤醒',
      cooldown: '唤醒冷却（分钟）',
      budgets: '分层预算',
      budgetsHint: 'Core 只放重要事实和用户明确要求记住的事。超限时最旧且未置顶的条目会降级；带 ⭐ 的 Core 条目不会被自动移动。总字符上限会先归档最旧的 General 条目。',
      totalChars: '总字符上限',
      sidebar: '侧边栏',
      showInSidebar: '在侧边栏显示快捷入口',
      status: '状态',
      trackedSessions: '跟踪的会话',
      queued: '队列',
      editorTitle: '编辑 {file}',
      editorHint: '写入是原子操作。若希望分层解析继续工作，请保留 Markdown 标题结构。',
      saveFile: '保存文件',
      loading: '正在读取记忆…',
      loadError: '无法读取记忆',
      retry: '重试',
      lines: '行',
      bytes: '字节',
      tier: '层级',
      score: '得分',
      requestFailed: '请求失败',
      fileSoul: 'Agent 的身份、价值观、语气和边界。',
      fileUser: '用户画像、偏好和边界。由后台增量更新。',
      fileAgent: '当前 Agent 的工作规则与自我模型。',
      fileAgents: '多 Agent / 团队协作约定。',
      fileMemory: '分层长期事实。默认不全量注入；按需检索或读取。',
      fileHeartbeat: '心跳唤醒时 Agent 参考的主动工作清单。',
      hint: '所有内容都以普通 Markdown 保存在存储目录中，随时可用记事本编辑；插件会监听外部修改。',
      writeFailed: '写入失败',
      readFailed: '读取失败',
      settingsFailed: '设置失败',
      pulseFailed: '心跳失败',
      extractFailed: '提炼失败',
      noLiveSession: '当前没有可用会话。',
      lastError: '上次错误',
      disable: '关闭',
      enable: '开启',
      injected: '已注入',
      searchOnly: '仅检索',
      openSettings: '打开设置',
      quickAccess: '快捷记忆',
      mode: '模式',
      name: '名称',
      size: '大小',
      updated: '更新时间',
      memoryLayers: '记忆分层',
      storagePath: '目录',
      heartbeatCount: '心跳次数',
      extractionSummary: '提炼',
      noSummary: '尚未提炼。',
      emptyFile: '（空）',
      closeEditor: '关闭编辑器',
      saving: '保存中…',
      loadingState: '正在读取存储…',
      saveFailed: '无法保存文件',
      stateFailed: '无法读取状态',
      searchFailed: '搜索失败',
      reindexFailed: '重建失败',
      searchLimit: '最多 8 条结果',
      description: '描述',
      tierCounts: '核心 {core} · 重要 {important} · 一般 {general}',
      bytesAndLines: '{bytes} · {lines} 行',
      extractionEvery: '每 {n} 轮',
      autoOff: '关闭',
      autoOn: '开启',
      lastExtractionAt: '于 {time}',
      sidebarEnabled: '侧边栏入口已显示',
      sidebarDisabled: '侧边栏入口已隐藏',
    }

    const CSS = `
      .hm-root, .hm-root * { box-sizing: border-box; }
      .hm-root button:focus-visible, .hm-root input:focus-visible, .hm-root textarea:focus-visible {
        outline: 2px solid var(--dsw-alias-brand-primary);
        outline-offset: 2px;
      }
      .hm-modal-scroll { scrollbar-width: thin; }
      .hm-modal-scroll::-webkit-scrollbar { width: 8px; }
      .hm-modal-scroll::-webkit-scrollbar-thumb { background: var(--dsw-alias-border-l2); border-radius: 8px; }
    `

    const S = {
      panel: {
        display: 'flex',
        flexDirection: 'column',
        gap: '14px',
        padding: '4px 0 28px',
        color: 'var(--dsw-alias-label-primary)',
        fontSize: '0.9rem',
      },
      header: {
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: '12px',
        flexWrap: 'wrap',
      },
      titleRow: { display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' },
      title: { margin: 0, fontSize: '1.15rem', fontWeight: 650, letterSpacing: '-0.01em' },
      subtitle: { margin: '6px 0 0', color: 'var(--dsw-alias-label-secondary)', fontSize: '0.82rem', lineHeight: 1.55, maxWidth: '70ch' },
      path: {
        display: 'inline-block',
        marginTop: '8px',
        padding: '3px 8px',
        borderRadius: '6px',
        background: 'var(--dsw-alias-bg-layer-2)',
        color: 'var(--dsw-alias-label-secondary)',
        fontFamily: 'ui-monospace, SFMono-Regular, Consolas, monospace',
        fontSize: '0.72rem',
        wordBreak: 'break-all',
      },
      card: {
        background: 'var(--dsw-alias-bg-layer-1)',
        border: '1px solid var(--dsw-alias-border-l1)',
        borderRadius: '12px',
        padding: '14px',
      },
      sectionTitle: { margin: 0, fontSize: '0.95rem', fontWeight: 650 },
      sectionHint: { margin: '4px 0 12px', color: 'var(--dsw-alias-label-secondary)', fontSize: '0.78rem', lineHeight: 1.55 },
      grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(135px, 1fr))', gap: '10px' },
      stat: {
        background: 'var(--dsw-alias-bg-layer-1)',
        border: '1px solid var(--dsw-alias-border-l1)',
        borderRadius: '10px',
        padding: '12px',
      },
      statLabel: { color: 'var(--dsw-alias-label-secondary)', fontSize: '0.72rem' },
      statValue: { marginTop: '4px', fontSize: '1.35rem', fontWeight: 650, lineHeight: 1.1 },
      statFoot: { marginTop: '4px', color: 'var(--dsw-alias-label-secondary)', fontSize: '0.7rem' },
      file: {
        display: 'flex',
        flexDirection: 'column',
        gap: '9px',
        padding: '13px 0',
        borderTop: '1px solid var(--dsw-alias-border-l1)',
      },
      fileFirst: { borderTop: 'none', paddingTop: 0 },
      row: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' },
      fileMain: { flex: '1 1 260px', minWidth: 0 },
      fileTitleRow: { display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' },
      strong: { fontSize: '0.88rem', fontWeight: 650 },
      fileName: {
        fontFamily: 'ui-monospace, SFMono-Regular, Consolas, monospace',
        fontSize: '0.72rem',
        color: 'var(--dsw-alias-label-secondary)',
      },
      desc: { marginTop: '3px', color: 'var(--dsw-alias-label-secondary)', fontSize: '0.78rem', lineHeight: 1.5 },
      meta: { marginTop: '5px', color: 'var(--dsw-alias-label-secondary)', fontSize: '0.72rem' },
      controls: { display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' },
      control: { display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--dsw-alias-label-secondary)', fontSize: '0.75rem', whiteSpace: 'nowrap' },
      switch: {
        position: 'relative',
        width: '34px',
        height: '20px',
        flex: '0 0 auto',
        borderRadius: '999px',
        border: '1px solid var(--dsw-alias-border-l2)',
        background: 'var(--dsw-alias-bg-layer-2)',
        padding: 0,
        cursor: 'pointer',
        transition: 'background 120ms ease, border-color 120ms ease',
      },
      switchOn: { background: 'var(--dsw-alias-brand-primary)', borderColor: 'var(--dsw-alias-brand-primary)' },
      knob: {
        position: 'absolute',
        top: '2px',
        left: '2px',
        width: '14px',
        height: '14px',
        borderRadius: '50%',
        background: 'var(--dsw-alias-bg-base)',
        transition: 'transform 120ms ease',
      },
      knobOn: { transform: 'translateX(14px)' },
      btn: {
        appearance: 'none',
        border: '1px solid var(--dsw-alias-border-l2)',
        background: 'var(--dsw-alias-bg-layer-2)',
        color: 'var(--dsw-alias-label-primary)',
        borderRadius: '8px',
        padding: '6px 11px',
        fontSize: '0.78rem',
        fontWeight: 550,
        cursor: 'pointer',
        lineHeight: 1.2,
      },
      btnPrimary: {
        background: 'var(--dsw-alias-brand-primary)',
        borderColor: 'var(--dsw-alias-brand-primary)',
        color: 'var(--dsw-alias-bg-base)',
      },
      btnDanger: {
        color: 'var(--dsw-alias-state-error-primary)',
        borderColor: 'var(--dsw-alias-state-error-primary)',
        background: 'transparent',
      },
      btnDisabled: { opacity: 0.55, cursor: 'default' },
      autoGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '10px 18px' },
      autoRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', minHeight: '30px', color: 'var(--dsw-alias-label-secondary)', fontSize: '0.78rem' },
      number: {
        width: '76px',
        padding: '5px 7px',
        borderRadius: '7px',
        border: '1px solid var(--dsw-alias-border-l2)',
        background: 'var(--dsw-alias-bg-layer-2)',
        color: 'var(--dsw-alias-label-primary)',
        font: 'inherit',
        fontSize: '0.78rem',
      },
      actions: { display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '12px' },
      input: {
        flex: '1 1 220px',
        minWidth: 0,
        padding: '7px 9px',
        borderRadius: '8px',
        border: '1px solid var(--dsw-alias-border-l2)',
        background: 'var(--dsw-alias-bg-layer-2)',
        color: 'var(--dsw-alias-label-primary)',
        font: 'inherit',
        fontSize: '0.8rem',
      },
      searchRow: { display: 'flex', gap: '8px', flexWrap: 'wrap' },
      results: { display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '12px' },
      result: { border: '1px solid var(--dsw-alias-border-l1)', borderRadius: '9px', padding: '9px 10px', background: 'var(--dsw-alias-bg-layer-2)' },
      resultHead: { display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', fontSize: '0.75rem' },
      snippet: { marginTop: '4px', color: 'var(--dsw-alias-label-secondary)', fontSize: '0.78rem', lineHeight: 1.5 },
      badge: {
        display: 'inline-flex',
        alignItems: 'center',
        padding: '2px 7px',
        borderRadius: '999px',
        background: 'var(--dsw-alias-bg-layer-2)',
        border: '1px solid var(--dsw-alias-border-l1)',
        color: 'var(--dsw-alias-label-secondary)',
        fontSize: '0.68rem',
        lineHeight: 1.4,
      },
      badgeCore: {
        background: 'color-mix(in srgb, var(--dsw-alias-brand-primary) 14%, transparent)',
        borderColor: 'color-mix(in srgb, var(--dsw-alias-brand-primary) 36%, transparent)',
        color: 'var(--dsw-alias-brand-primary)',
      },
      errorBox: {
        border: '1px solid color-mix(in srgb, var(--dsw-alias-state-error-primary) 45%, var(--dsw-alias-border-l1))',
        background: 'color-mix(in srgb, var(--dsw-alias-state-error-primary) 9%, transparent)',
        color: 'var(--dsw-alias-state-error-primary)',
        borderRadius: '9px',
        padding: '9px 11px',
        fontSize: '0.78rem',
        lineHeight: 1.5,
        whiteSpace: 'pre-wrap',
      },
      noticeBox: {
        border: '1px solid color-mix(in srgb, var(--dsw-alias-state-success-primary) 45%, var(--dsw-alias-border-l1))',
        background: 'color-mix(in srgb, var(--dsw-alias-state-success-primary) 9%, transparent)',
        color: 'var(--dsw-alias-state-success-primary)',
        borderRadius: '9px',
        padding: '9px 11px',
        fontSize: '0.78rem',
      },
      empty: { color: 'var(--dsw-alias-label-secondary)', fontSize: '0.8rem', padding: '8px 0' },
      loading: { color: 'var(--dsw-alias-label-secondary)', fontSize: '0.85rem', padding: '24px 4px' },
      footer: { display: 'flex', gap: '12px', flexWrap: 'wrap', color: 'var(--dsw-alias-label-secondary)', fontSize: '0.72rem' },
      overlay: {
        position: 'fixed',
        inset: 0,
        zIndex: 1100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '18px',
        background: 'color-mix(in srgb, var(--dsw-alias-bg-base) 62%, transparent)',
        backdropFilter: 'blur(3px)',
      },
      modal: {
        width: 'min(900px, 100%)',
        maxHeight: '88vh',
        overflow: 'auto',
        background: 'var(--dsw-alias-bg-layer-1)',
        border: '1px solid var(--dsw-alias-border-l2)',
        borderRadius: '14px',
        padding: '16px',
        boxShadow: '0 24px 70px color-mix(in srgb, var(--dsw-alias-label-primary) 18%, transparent)',
      },
      modalHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', marginBottom: '10px' },
      modalTitle: { margin: 0, fontSize: '0.95rem', fontWeight: 650 },
      textarea: {
        width: '100%',
        minHeight: '340px',
        resize: 'vertical',
        padding: '10px',
        borderRadius: '9px',
        border: '1px solid var(--dsw-alias-border-l2)',
        background: 'var(--dsw-alias-bg-layer-2)',
        color: 'var(--dsw-alias-label-primary)',
        fontFamily: 'ui-monospace, SFMono-Regular, Consolas, monospace',
        fontSize: '0.8rem',
        lineHeight: 1.55,
      },
      editorHint: { margin: '6px 0 10px', color: 'var(--dsw-alias-label-secondary)', fontSize: '0.75rem', lineHeight: 1.5 },
      sideButton: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        padding: '4px 8px',
        borderRadius: '8px',
        border: '1px solid transparent',
        background: 'transparent',
        color: 'var(--dsw-alias-label-secondary)',
        font: 'inherit',
        fontSize: '0.78rem',
        cursor: 'pointer',
      },
      sideGlyph: { fontSize: '0.95rem', lineHeight: 1 },
      mono: { fontFamily: 'ui-monospace, SFMono-Regular, Consolas, monospace' },
    }

    /** Same-origin JSON request helper. */
    async function api(path, body) {
      const response = await fetch(`${API_BASE}${path}`, body === undefined
        ? { method: 'GET', headers: { accept: 'application/json' } }
        : {
            method: 'POST',
            headers: { 'content-type': 'application/json', accept: 'application/json' },
            body: JSON.stringify(body),
          })
      const text = await response.text()
      let value
      try {
        value = text.length > 0 ? JSON.parse(text) : undefined
      } catch {
        value = undefined
      }
      if (!response.ok) {
        const message = value && typeof value.error === 'string' ? value.error : `HTTP ${response.status}`
        throw new Error(message)
      }
      return value
    }

    /** Format bytes for a compact metadata line. */
    function formatBytes(bytes) {
      const value = Number(bytes) || 0
      if (value < 1024) return `${value} B`
      if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
      return `${(value / (1024 * 1024)).toFixed(1)} MB`
    }

    /** Format an ISO timestamp for display. */
    function formatWhen(iso, neverLabel) {
      if (typeof iso !== 'string' || iso.length === 0) return neverLabel
      const date = new Date(iso)
      if (!Number.isFinite(date.getTime())) return neverLabel
      return date.toLocaleString()
    }

    function Switch({ checked, onChange, label }) {
      return h('button', {
        type: 'button',
        role: 'switch',
        'aria-checked': checked === true,
        'aria-label': label,
        title: label,
        onClick: () => onChange(!checked),
        style: { ...S.switch, ...(checked === true ? S.switchOn : {}) },
      }, h('span', { style: { ...S.knob, ...(checked === true ? S.knobOn : {}) } }))
    }

    function Button({ children, onClick, variant, disabled, style }) {
      return h('button', {
        type: 'button',
        onClick,
        disabled: disabled === true,
        style: {
          ...S.btn,
          ...(variant === 'primary' ? S.btnPrimary : {}),
          ...(variant === 'danger' ? S.btnDanger : {}),
          ...(disabled === true ? S.btnDisabled : {}),
          ...(style || {}),
        },
      }, children)
    }

    function NumberField({ label, value, min, max, onCommit }) {
      const [draft, setDraft] = useState(String(value))
      useEffect(() => { setDraft(String(value)) }, [value])
      const commit = () => {
        const number = Number(draft)
        if (!Number.isFinite(number)) {
          setDraft(String(value))
          return
        }
        const clamped = Math.min(max, Math.max(min, Math.trunc(number)))
        setDraft(String(clamped))
        if (clamped !== value) onCommit(clamped)
      }
      return h('label', { style: S.control },
        h('span', null, label),
        h('input', {
          type: 'number',
          min,
          max,
          value: draft,
          onChange: event => setDraft(event.target.value),
          onBlur: commit,
          onKeyDown: event => { if (event.key === 'Enter') event.currentTarget.blur() },
          style: S.number,
        }),
      )
    }

    function Stat({ label, value, foot }) {
      return h('div', { style: S.stat },
        h('div', { style: S.statLabel }, label),
        h('div', { style: S.statValue }, String(value)),
        foot === undefined ? null : h('div', { style: S.statFoot }, foot),
      )
    }

    function Panel({ t, mode, onClose }) {
      const [snap, setSnap] = useState(null)
      const [error, setError] = useState('')
      const [notice, setNotice] = useState('')
      const [busy, setBusy] = useState('')
      const [editor, setEditor] = useState(null)
      const [searchQuery, setSearchQuery] = useState('')
      const [searchResults, setSearchResults] = useState(null)
      const [searching, setSearching] = useState(false)
      const alive = useRef(true)
      const noticeTimer = useRef(null)

      const refresh = useCallback(async () => {
        try {
          const data = await api('state')
          if (alive.current) {
            setSnap(data)
            setError(current => current.startsWith(t('stateFailed')) ? '' : current)
          }
        } catch (loadError) {
          if (alive.current) setError(`${t('stateFailed')}: ${loadError.message}`)
        }
      }, [t])

      useEffect(() => {
        alive.current = true
        void refresh()
        const timer = setInterval(() => { void refresh() }, 15000)
        return () => {
          alive.current = false
          clearInterval(timer)
          if (noticeTimer.current !== null) clearTimeout(noticeTimer.current)
        }
      }, [refresh])

      const flash = (message) => {
        if (!alive.current) return
        setNotice(message)
        if (noticeTimer.current !== null) clearTimeout(noticeTimer.current)
        noticeTimer.current = setTimeout(() => {
          if (alive.current) setNotice('')
        }, 3200)
      }

      const run = async (label, task) => {
        setBusy(label)
        setError('')
        try {
          await task()
        } catch (runError) {
          if (alive.current) setError(runError.message)
        } finally {
          if (alive.current) setBusy('')
        }
      }

      const updateSettings = async (patch) => {
        const next = await api('config', { patch })
        if (alive.current) setSnap(next)
        flash(t('saved'))
      }

      const toggleFile = (file, key, value) => run('file', async () => {
        await updateSettings({ files: { [file.id]: { [key]: value } } })
      })

      const openEditor = async (file) => {
        setError('')
        try {
          const data = await api('file/read', { file: file.id })
          if (alive.current) setEditor({ id: file.id, file: data.file, content: data.content, saving: false })
        } catch (readError) {
          setError(`${t('readFailed')}: ${readError.message}`)
        }
      }

      const saveEditor = async () => {
        if (!editor) return
        setEditor({ ...editor, saving: true })
        try {
          const data = await api('file/write', { file: editor.id, content: editor.content })
          if (alive.current) {
            if (data.snapshot) setSnap(data.snapshot)
            setEditor(null)
            flash(t('saved'))
          }
        } catch (writeError) {
          if (alive.current) {
            setError(`${t('saveFailed')}: ${writeError.message}`)
            setEditor({ ...editor, saving: false })
          }
        }
      }

      const runSearch = async () => {
        const query = searchQuery.trim()
        if (query.length === 0) return
        setSearching(true)
        setError('')
        try {
          const data = await api('search', { query, limit: 8 })
          if (alive.current) setSearchResults(data)
        } catch (searchError) {
          if (alive.current) setError(`${t('searchFailed')}: ${searchError.message}`)
        } finally {
          if (alive.current) setSearching(false)
        }
      }

      const extractNow = () => run('extract', async () => {
        const data = await api('extract', {})
        if (data.snapshot) setSnap(data.snapshot)
        if (data.result && data.result.error) setError(`${t('extractFailed')}: ${data.result.error}`)
        else flash(t('saved'))
      })

      const pulseNow = () => run('pulse', async () => {
        const data = await api('heartbeat', {})
        if (data.snapshot) setSnap(data.snapshot)
        flash(t('saved'))
      })

      const reindex = () => run('reindex', async () => {
        const data = await api('reindex', {})
        if (data.snapshot) setSnap(data.snapshot)
        flash(t('saved'))
      })

      if (snap === null) {
        return h('div', { className: 'hm-root', style: S.panel },
          error.length > 0 ? h('div', { style: S.errorBox }, error) : null,
          h('div', { style: S.loading }, error.length > 0 ? t('loadError') : t('loading')),
          h(Button, { onClick: () => { void refresh() } }, t('retry')),
        )
      }

      const zh = t('languageCode') === 'zh'
      const settings = snap.settings
      const heartbeat = settings.heartbeat
      const extraction = settings.extraction
      const budgets = settings.budgets
      const lastExtraction = snap.state.lastExtraction
      const files = Array.isArray(snap.files) ? snap.files : []
      const enabledFiles = files.filter(file => file.enabled).length

      const fileDescription = (file) => {
        const key = `file${file.id.charAt(0).toUpperCase()}${file.id.slice(1)}`
        const localized = t(key)
        if (localized !== key) return localized
        return zh ? file.descriptionZh : file.description
      }

      return h('div', { className: 'hm-root', style: S.panel },
        h('div', { style: S.header },
          h('div', null,
            h('div', { style: S.titleRow },
              h('h2', { style: S.title }, t('title')),
              h('span', { style: S.badge }, t('versionLabel')),
            ),
            h('p', { style: S.subtitle }, t('subtitle')),
            h('code', { style: S.path }, `${t('storage')}: ${snap.storageDir}`),
          ),
          mode === 'popup' ? h(Button, { onClick: onClose }, t('close')) : null,
        ),

        error.length > 0 ? h('div', { style: S.errorBox }, error) : null,
        notice.length > 0 ? h('div', { style: S.noticeBox }, notice) : null,

        h('div', { style: S.grid },
          h(Stat, { label: t('core'), value: snap.memory.core, foot: t('tiered') }),
          h(Stat, { label: t('important'), value: snap.memory.important }),
          h(Stat, { label: t('general'), value: snap.memory.general }),
          h(Stat, { label: t('files'), value: `${enabledFiles}/${files.length}`, foot: t('load') }),
        ),

        h('div', { style: S.card },
          h('h3', { style: S.sectionTitle }, t('files')),
          h('p', { style: S.sectionHint }, t('filesHint')),
          files.map((file, index) => h('div', {
            key: file.id,
            style: { ...S.file, ...(index === 0 ? S.fileFirst : {}) },
          },
            h('div', { style: S.row },
              h('div', { style: S.fileMain },
                h('div', { style: S.fileTitleRow },
                  h('strong', { style: S.strong }, zh ? file.titleZh : file.title),
                  h('code', { style: S.fileName }, file.name),
                  file.tiered ? h('span', { style: S.badge }, t('tiered')) : null,
                  h('span', { style: { ...S.badge, ...(file.inject ? S.badgeCore : {}) } }, file.inject ? t('injected') : t('searchOnly')),
                ),
                h('div', { style: S.desc }, fileDescription(file)),
                h('div', { style: S.meta }, t('bytesAndLines', { bytes: formatBytes(file.bytes), lines: file.lines })),
                file.counts ? h('div', { style: S.meta }, t('tierCounts', { core: file.counts.core, important: file.counts.important, general: file.counts.general })) : null,
              ),
              h('div', { style: S.controls },
                h('label', { style: S.control },
                  h(Switch, { checked: file.enabled, onChange: value => toggleFile(file, 'enabled', value), label: `${t('load')} ${file.name}` }),
                  h('span', null, t('load')),
                ),
                h('label', { style: S.control },
                  h(Switch, { checked: file.inject, onChange: value => toggleFile(file, 'inject', value), label: `${t('inject')} ${file.name}` }),
                  h('span', null, t('inject')),
                ),
                h(Button, { onClick: () => { void openEditor(file) } }, t('edit')),
              ),
            ),
          )),
        ),

        h('div', { style: S.card },
          h('h3', { style: S.sectionTitle }, t('automation')),
          h('p', { style: S.sectionHint }, t('automationHint')),
          h('div', { style: S.autoGrid },
            h('label', { style: S.autoRow },
              h('span', null, t('autoExtract')),
              h(Switch, { checked: extraction.enabled, onChange: value => run('settings', () => updateSettings({ extraction: { enabled: value } })), label: t('autoExtract') }),
            ),
            h(NumberField, {
              label: t('everyTurns'),
              value: extraction.everyTurns,
              min: 2,
              max: 100,
              onCommit: value => run('settings', () => updateSettings({ extraction: { everyTurns: value } })),
            }),
            h(NumberField, {
              label: t('idleMinutes'),
              value: extraction.idleMinutes,
              min: 1,
              max: 1440,
              onCommit: value => run('settings', () => updateSettings({ extraction: { idleMinutes: value } })),
            }),
            h('label', { style: S.autoRow },
              h('span', null, t('heartbeat')),
              h(Switch, { checked: heartbeat.enabled, onChange: value => run('settings', () => updateSettings({ heartbeat: { enabled: value } })), label: t('heartbeat') }),
            ),
            h(NumberField, {
              label: t('interval'),
              value: heartbeat.intervalMinutes,
              min: 5,
              max: 1440,
              onCommit: value => run('settings', () => updateSettings({ heartbeat: { intervalMinutes: value } })),
            }),
            h('label', { style: S.autoRow },
              h('span', null, t('proactive')),
              h(Switch, { checked: heartbeat.proactive, onChange: value => run('settings', () => updateSettings({ heartbeat: { proactive: value } })), label: t('proactive') }),
            ),
            h(NumberField, {
              label: t('cooldown'),
              value: heartbeat.wakeCooldownMinutes,
              min: 15,
              max: 1440,
              onCommit: value => run('settings', () => updateSettings({ heartbeat: { wakeCooldownMinutes: value } })),
            }),
            h('label', { style: S.autoRow },
              h('span', null, t('showInSidebar')),
              h(Switch, { checked: settings.ui.sidebar, onChange: value => run('settings', () => updateSettings({ ui: { sidebar: value } })), label: t('showInSidebar') }),
            ),
          ),
          h('div', { style: S.actions },
            h(Button, { variant: 'primary', disabled: busy !== '', onClick: extractNow }, busy === 'extract' ? t('extracting') : t('extractNow')),
            h(Button, { disabled: busy !== '', onClick: pulseNow }, busy === 'pulse' ? t('pulsing') : t('pulseNow')),
            h(Button, { disabled: busy !== '', onClick: reindex }, busy === 'reindex' ? t('reindexing') : t('reindex')),
          ),
        ),

        h('div', { style: S.card },
          h('h3', { style: S.sectionTitle }, t('budgets')),
          h('p', { style: S.sectionHint }, t('budgetsHint')),
          h('div', { style: S.autoGrid },
            h(NumberField, {
              label: t('core'),
              value: budgets.core,
              min: 5,
              max: 500,
              onCommit: value => run('settings', () => updateSettings({ budgets: { core: value } })),
            }),
            h(NumberField, {
              label: t('important'),
              value: budgets.important,
              min: 5,
              max: 500,
              onCommit: value => run('settings', () => updateSettings({ budgets: { important: value } })),
            }),
            h(NumberField, {
              label: t('general'),
              value: budgets.general,
              min: 5,
              max: 500,
              onCommit: value => run('settings', () => updateSettings({ budgets: { general: value } })),
            }),
            h(NumberField, {
              label: t('totalChars'),
              value: budgets.totalChars,
              min: 2000,
              max: 100000,
              onCommit: value => run('settings', () => updateSettings({ budgets: { totalChars: value } })),
            }),
          ),
        ),

        h('div', { style: S.card },
          h('h3', { style: S.sectionTitle }, t('search')),
          h('div', { style: S.searchRow },
            h('input', {
              type: 'search',
              value: searchQuery,
              placeholder: t('searchPlaceholder'),
              onChange: event => setSearchQuery(event.target.value),
              onKeyDown: event => { if (event.key === 'Enter') void runSearch() },
              style: S.input,
              'aria-label': t('search'),
            }),
            h(Button, { variant: 'primary', disabled: searching, onClick: () => { void runSearch() } }, searching ? t('searching') : t('searchButton')),
          ),
          searchResults === null ? null : h('div', { style: S.results },
            searchResults.results.length === 0
              ? h('div', { style: S.empty }, t('noResults'))
              : searchResults.results.map((result, index) => h('div', { key: `${result.file}:${result.line}:${index}`, style: S.result },
                h('div', { style: S.resultHead },
                  h('strong', null, result.fileTitle),
                  result.tier ? h('span', { style: { ...S.badge, ...(result.tier === 'core' ? S.badgeCore : {}) } }, result.tier) : null,
                  result.line ? h('span', { style: S.badge }, `#${result.line}`) : null,
                  h('span', { style: S.badge }, `${t('score')} ${result.score}`),
                ),
                h('div', { style: S.snippet }, result.snippet),
              )),
          ),
        ),

        h('div', { style: S.card },
          h('h3', { style: S.sectionTitle }, t('status')),
          h('div', { style: S.footer },
            h('span', null, `${t('lastExtract')}: ${formatWhen(snap.state.lastExtractAt, t('never'))}`),
            h('span', null, `${t('lastHeartbeat')}: ${formatWhen(snap.state.lastHeartbeatAt, t('never'))}`),
            h('span', null, `${t('trackedSessions')}: ${snap.state.trackedSessions}`),
            h('span', null, `${t('heartbeatCount')}: ${snap.state.heartbeatCount}`),
            h('span', null, `${t('queued')}: ${snap.status?.queued ?? 0}`),
            h('span', null, `${t('mode')}: ${snap.status?.extracting ? t('extracting') : t('autoOff')}`),
          ),
          lastExtraction
            ? h('div', { style: S.meta }, `${t('extractionSummary')}: ${lastExtraction.summary ?? ''} ${lastExtraction.at ? t('lastExtractionAt', { time: formatWhen(lastExtraction.at, t('never')) }) : ''}`)
            : h('div', { style: S.meta }, t('noSummary')),
          snap.state.lastError ? h('div', { style: { ...S.errorBox, marginTop: '10px' } }, `${t('lastError')}: ${snap.state.lastError}`) : null,
          h('p', { style: { ...S.sectionHint, marginTop: '10px', marginBottom: 0 } }, t('hint')),
        ),

        editor === null ? null : h('div', {
          style: { ...S.overlay, zIndex: 1200 },
          role: 'dialog',
          'aria-modal': 'true',
          onMouseDown: event => { if (event.target === event.currentTarget) setEditor(null) },
        },
          h('div', { style: { ...S.modal, display: 'flex', flexDirection: 'column', gap: '10px' } },
            h('div', { style: S.modalHeader },
              h('h3', { style: S.modalTitle }, t('editorTitle', { file: editor.file })),
              h(Button, { onClick: () => setEditor(null) }, t('close')),
            ),
            h('p', { style: S.editorHint }, t('editorHint')),
            h('textarea', {
              value: editor.content,
              onChange: event => setEditor({ ...editor, content: event.target.value }),
              style: S.textarea,
              spellCheck: false,
              'aria-label': t('editorTitle', { file: editor.file }),
            }),
            h('div', { style: { ...S.actions, justifyContent: 'flex-end' } },
              h(Button, { onClick: () => setEditor(null) }, t('cancel')),
              h(Button, { variant: 'primary', disabled: editor.saving, onClick: () => { void saveEditor() } }, editor.saving ? t('saving') : t('save')),
            ),
          ),
        ),
      )
    }

    function MemoryFooterAction({ t, wide }) {
      const [open, setOpen] = useState(false)
      const [enabled, setEnabled] = useState(true)
      useEffect(() => {
        let active = true
        const load = async () => {
          try {
            const data = await api('state')
            if (active) setEnabled(data.settings?.ui?.sidebar !== false)
          } catch {
            // The settings page reports transport errors; the sidebar stays hidden.
          }
        }
        void load()
        const timer = setInterval(() => { void load() }, 20000)
        return () => {
          active = false
          clearInterval(timer)
        }
      }, [])
      useEffect(() => {
        if (!open) return undefined
        const onKey = (event) => { if (event.key === 'Escape') setOpen(false) }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
      }, [open])
      if (!enabled) return null
      return h(React.Fragment, null,
        h('button', {
          type: 'button',
          onClick: () => setOpen(true),
          title: t('sidebarLabel'),
          'aria-label': t('sidebarLabel'),
          style: S.sideButton,
        },
          h('span', { style: S.sideGlyph, 'aria-hidden': true }, '◈'),
          wide ? h('span', null, t('sidebarLabel')) : null,
        ),
        open ? h('div', {
          style: S.overlay,
          role: 'dialog',
          'aria-modal': 'true',
          'aria-label': t('quickAccess'),
          onMouseDown: event => { if (event.target === event.currentTarget) setOpen(false) },
        },
          h('div', { style: { ...S.modal, display: 'flex', flexDirection: 'column', gap: '10px' } },
            h(Panel, { t, mode: 'popup', onClose: () => setOpen(false) }),
          ),
        ) : null,
      )
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        let t = (key) => key
        try {
          ctx.effect(() => ctx.locale.register('hybrid-memory', { en: EN, zh: ZH }), 'hybrid-memory dictionaries')
          t = ctx.locale.bind('hybrid-memory')
        } catch (error) {
          console.error('[dsh-hybrid-memory] locale registration failed', error)
        }
        try {
          ctx.effect(() => {
            const style = document.createElement('style')
            style.setAttribute('data-dsh-hybrid-memory', '')
            style.textContent = CSS
            document.head.appendChild(style)
            return () => style.remove()
          }, 'hybrid-memory styles')
        } catch (error) {
          console.error('[dsh-hybrid-memory] style injection failed', error)
        }
        try {
          ctx.slots.inject('settings.section', () => ctx.slots.register({
            name: 'settings.section',
            id: 'hybrid-memory',
            order: 25,
            label: () => t('title'),
          }, props => h(Panel, { ...props, t, mode: 'settings' })))
        } catch (error) {
          console.error('[dsh-hybrid-memory] settings section registration failed', error)
        }
        try {
          ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
            name: 'sidebar.footer.action',
            id: 'hybrid-memory-sidebar',
            order: 20,
            label: () => t('sidebarLabel'),
          }, props => h(MemoryFooterAction, { ...props, t })))
        } catch (error) {
          console.error('[dsh-hybrid-memory] sidebar registration failed', error)
        }
      },
    }
  },
})
