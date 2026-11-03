# VirtuAI IDE (Desktop)

Electrobun desktop app for VirtuAI: local workdir IDE + chat over
`POST /v1/chat/completions` (surface `ide`). This repository is the product
tree for **VirtuAI Desktop** (IDE). The Tauri connector app remains at
[VirtuAiRepo/virtuaiDesktop](https://github.com/VirtuAiRepo/virtuaiDesktop)
and is not replaced by this repo.

Based on [ThinkRail](https://github.com/JetBrains/thinkrail) (Apache-2.0); see
`LICENSE` and `NOTICE`.

## Beta

Product bar, VirtuAI **session** rules (copyable IDE session id, agent-switch
keeps Plan / clears Completions binding), QA script, and bug template live in
the VirtuAI monorepo: `docs/workitems/desktop-beta.md`.

Composer shows a **Beta** badge and a truncated session id (click to copy).
Plan remains local-only under `.virtuai/context/todos/<sessionId>.json`.

## Dogfood (dev)

```bash
bun install
bun run desktop:dev          # VirtuAI-dev, channel defaults to https://dev.imvirtuai.com
bun run desktop:build        # package:dev → apps/desktop/build/dev-macos-arm64/VirtuAI-dev.app
```

## Stable package

```bash
# Stamp version/channel in packages/shared/src/version.ts, then:
bun run desktop:package:stable
```

Release CI (`.github/workflows/release-desktop.yml`) builds, signs, and
notarizes on tag `v*`. **Required before Gatekeeper-clean beta:** copy Apple
signing secrets from `virtuaiDesktop` into this repo’s Actions secrets
(`APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`, `APPLE_API_KEY_P8`,
`APPLE_API_KEY`, `APPLE_API_ISSUER`), then tag `v*` or run **Release desktop**.

Updater feed (verified):  
`https://github.com/VirtuAiRepo/virtuai-ide/releases/download/desktop-updates/stable-macos-arm64-update.json`

## Server

Requires a VirtuAI origin with Completions IDE surface and CLI user-token mint.
Default channels: packaging `dev`/`canary` → `https://dev.imvirtuai.com`;
`stable` → `https://app.imvirtuai.com`.

Multichannel connector (Slack, etc.) is the CLI: `virtuai run`, not this app.
