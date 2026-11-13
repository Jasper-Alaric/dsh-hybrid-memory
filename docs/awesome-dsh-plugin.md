# Submitting to the DSH Market

The DSH Market does not accept plugin publications directly. Its catalog is the
[curated awesome-dsh-plugin list](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin).
To get this plugin listed, open a PR there adding one line under the matching
category in **both** `README.md` and `README.zh.md`:

```markdown
- [dsh-hybrid-memory](https://github.com/nonenameless/dsh-hybrid-memory) — Transparent Markdown long-term memory with tiered facts, background extraction, BM25 search, persona editing, and a heartbeat.
```

```markdown
- [dsh-hybrid-memory](https://github.com/nonenameless/dsh-hybrid-memory) — 透明 Markdown 长期记忆：分层事实、后台提炼、BM25 检索、人格编辑与心跳。
```

Before opening the PR:

1. Replace `nonenameless` with the GitHub account that owns the repository.
2. Create the repository and push this package directory to it.
3. Add the `dsh-plugin` topic to the repository.
4. Make sure the npm package is public: `npm view @jasper_alaric/dsh-hybrid-memory`.
5. Optionally add the catalog-shaped JSON in `docs/registry-entry.json` to your release notes.

The market app itself reads the catalog; installing the plugin through npm is
already possible without waiting for the catalog PR:

```sh
dsh plugin --profile web add @jasper_alaric/dsh-hybrid-memory
```
