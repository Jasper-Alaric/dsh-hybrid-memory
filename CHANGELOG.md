# Changelog

## 1.0.3 — 2026-11-13

- Add the public GitHub repository, homepage, and issue tracker metadata.
- No runtime changes.

## 1.0.2 — 2026-11-13

- Point README screenshots and diagrams at the verified jsDelivr 1.0.1 asset URLs.
- No runtime changes.

## 1.0.1 — 2026-11-13

- Use unpkg for README screenshots and diagrams so images render reliably on npm and in mirrored catalogs.
- No runtime changes.

## 1.0.0 — 2026-11-13

First public release.

- Transparent Markdown storage for `SOUL.md`, `USER.md`, `AGENT.md`, `AGENTS.md`, `MEMORY.md`, and `HEARTBEAT.md`.
- Tiered memory (`Core` / `Important` / `General`) with budgets, demotion, pinning, and automatic refinement.
- Non-blocking background extraction triggered by turn threshold, session disposal, idle timeout, or heartbeat.
- BM25 search with Chinese single-character/bigram tokenization and English word tokenization.
- Model-facing tools: `memory_read`, `memory_search`, `memory_update`, `persona_update`.
- Cached system-prompt injection for persona/profile files; `MEMORY.md` remains on-demand.
- Heartbeat maintenance with optional proactive wake and cooldown.
- DSH Web settings section and optional sidebar quick-access panel.
- Atomic writes, missing-file recovery, malformed-sidecar fallback, registration guards, and strict tool schemas.
- Keyless unit and activation tests.
