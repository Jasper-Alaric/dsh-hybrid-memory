# Submitting to the DSH Market

The DSH Market catalog is the
[curated awesome-dsh-plugin list](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin).
Its current convention is **one YAML file per plugin** under `data/plugins/`, named
`<owner>__<repo>.yml`; both READMEs are generated from those files.

This repository's entry lives at:

```text
data/plugins/Jasper-Alaric__dsh-hybrid-memory.yml
```

```yaml
url: https://github.com/Jasper-Alaric/dsh-hybrid-memory
name: Jasper-Alaric/dsh-hybrid-memory
category: memory
description:
  en: 'Transparent Markdown long-term memory for DeepSeek Harness, combining the two ideas that work in OpenClaw and Hermes: files you own and can read, edit, diff and back up, plus a background loop that keeps them current. SOUL.md, USER.md, AGENT.md and AGENTS.md are injected as one bounded system-prompt section; MEMORY.md is split into Core / Important / General tiers and retrieved on demand through a local BM25 index (Chinese single-character and bigram tokenization, English words) instead of being pasted into every prompt. A single-concurrency async worker extracts durable preferences and facts from committed messages, dedupes them, refines the tiers, and archives overflow to MEMORY.archive.md; writes are atomic and failures are contained. Ships four strict tools (memory_read, memory_search, memory_update, persona_update), a Settings → Hybrid memory panel with per-file Load/Inject switches, budgets, search and manual extract/pulse, an optional sidebar panel, and a heartbeat that can wake an idle agent with a producer-owned message kind. Local-first, no embedding service, no vector database, no extra dependencies.'
  zh: '为 DeepSeek Harness 提供透明的 Markdown 长期记忆，把 OpenClaw 的文件透明与 Hermes 的后台闭环合在一起：文件归你所有，可读、可改、可 diff、可备份；后台循环负责持续维护。SOUL.md、USER.md、AGENT.md、AGENTS.md 作为一个有预算的系统提示片段注入；MEMORY.md 分成 Core / Important / General 三层，用本地 BM25（中文单字 + 二元组、英文单词）按需检索，而不是每轮整篇塞进上下文。单并发异步 worker 从已提交消息中提炼稳定偏好与事实，去重、分层，把溢出归档到 MEMORY.archive.md；写入原子化，失败只降级不打断对话。附带四个严格工具（memory_read、memory_search、memory_update、persona_update）、Settings → Hybrid memory 设置页（逐文件 Load/Inject 开关、预算、搜索、立即提炼/心跳）、可选侧边栏，以及可用 producer-owned message kind 唤醒空闲 Agent 的心跳。本地优先，不需要向量库或额外依赖。'
icon: https://raw.githubusercontent.com/Jasper-Alaric/dsh-hybrid-memory/main/docs/icon.png
```

Screenshots are declared in the repository itself: `screenshots.json` sits beside
`package.json`, and the catalog probe resolves each relative path against the
repository at `HEAD`. The file currently lists:

```json
[
  "docs/cover.png",
  "docs/settings-panel.png",
  "docs/tiers.png",
  "docs/architecture.png"
]
```

Before opening the PR:

1. The repository is public at `https://github.com/Jasper-Alaric/dsh-hybrid-memory`.
2. The repository has the `dsh-plugin` topic.
3. The npm package is public: `npm view @jasper_alaric/dsh-hybrid-memory`.
4. `docs/icon.png` is a GitHub-hosted raster file (512×512 PNG).
5. The repository is at least one day old.

Installing through npm does not wait for the catalog:

```sh
dsh plugin --profile web add @jasper_alaric/dsh-hybrid-memory
```
