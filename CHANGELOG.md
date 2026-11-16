# Changelog

## 1.0.5 — 2026-11-16

- Fix: the heartbeat wake message used the retired `plugin` message-source kind, which Session format v4 refuses in durable message slots. A refused row wedges the woken Session, so every later turn in it failed with `format v4 message requires a producer-owned source kind` until the Host restarted. The message now names its own producer kind (`hybrid-memory`), matching the `goal` and `schedule` producers.
- Security: every HTTP route now calls `ctx.connection.requestRejection(req)` before dispatch, so DSH's Host/Origin fence and browser-session authentication apply. `authorizeIndex` alone authenticated the page but did not check Host/Origin.

## 1.0.4 — 2026-11-15

- Keep all `Core` entries and the newest lower-tier entries in the extraction context instead of head-truncating `MEMORY.md`.
- Archive `General` overflow to `MEMORY.archive.md` instead of dropping it silently; keep the entry in `MEMORY.md` if the archive write fails.
- Process extraction transcripts oldest-first in bounded batches, commit only the messages actually processed, and drain up to four batches per job so a long backlog is not skipped.
- Continue refining lower tiers when a tier is over budget but entirely pinned.
- Report duplicate counts separately from skipped extractions.
- Lower the default budgets to `Core 8`, `Important 40`, `General 80`, add a `12,000`-character total cap, and cap one memory entry at 300 characters.

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
