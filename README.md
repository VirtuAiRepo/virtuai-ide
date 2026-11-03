# VirtuAI IDE

**VirtuAI Desktop** is this Electrobun app: a local workdir IDE with VirtuAI
chat over Completions (`X-VirtuAI-Surface: ide`). Product repo:
[VirtuAiRepo/virtuai-ide](https://github.com/VirtuAiRepo/virtuai-ide).

The Tauri connector (web chat window + `virtuai run --desktop`) lives separately
at [VirtuAiRepo/virtuaiDesktop](https://github.com/VirtuAiRepo/virtuaiDesktop)
and is **not** archived or replaced by this tree. Multichannel agents still use
the [VirtuAI CLI](https://github.com/VirtuAiRepo/virtuai) (`virtuai run`).

This codebase is a fork of [ThinkRail](https://github.com/JetBrains/thinkrail)
(Apache-2.0). Upstream README material for the ThinkRail open-source project
remains useful for contributors; product packaging and identity are VirtuAI
(`com.virtuai.ide`). See `LICENSE` and `NOTICE`.

## Quick start

```bash
bun install
bun run desktop:dev       # VirtuAI-dev → https://dev.imvirtuai.com by default
bun run desktop:build     # apps/desktop/build/dev-macos-arm64/VirtuAI-dev.app
```

Stable / notarized builds: tag `v*` or run **Release desktop** in Actions
(requires Apple signing secrets — same names as `virtuaiDesktop`).

## Docs (monorepo)

Design and alpha notes live in the VirtuAI server repo:

- `docs/workitems/desktop-electrobun-cutover.md`
- `docs/workitems/desktop-alpha.md`
- `docs/workitems/ide-virtuai-surface.md`
