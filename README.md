# lattice-web

Real-time admin dashboard for the Lattice container-orchestration platform.

> **Appleby Cloud platform** · Next.js app · `lattice.appleby.cloud` (self-hosted via Lattice/Portainer)

---

## Overview

`lattice-web` is the browser admin console for **Lattice**, the container-orchestration platform
that runs every `appleby.cloud` service. It renders the fleet dashboard (topology graph, KPI row,
live event stream, fleet resource charts) and full CRUD + lifecycle management for workers, stacks,
containers, deployments, databases, registries, networks, volumes, backup destinations, global env
vars, templates, webhooks, users, API tokens, and instance config.

It is a **pure client of [`lattice-api`](https://github.com/aidenappl/lattice-api)** — no BFF, no
database, no business logic. Every view and mutation is an HTTP call (plus a live admin WebSocket).
Whatever an operator sees — validation, deployment mechanics, pagination — is produced by the API.

## Role in the Appleby Cloud ecosystem

- **[`lattice-api`](https://github.com/aidenappl/lattice-api)** — the backend this dashboard drives
  (`/admin/*`, `/auth/*`, `/ws/admin`). Its route table is the source of truth for every service call.
- **[`lattice-mcp`](https://github.com/aidenappl/lattice-mcp)** — the Model Context Protocol sibling
  over the *same* API, for Claude Code. This repo is the human-facing counterpart.
- **[`lattice-runner`](https://github.com/aidenappl/lattice-runner)** — agent on each worker VM;
  the "upgrade runner" / worker actions here ultimately drive it.
- **Forta** — `appleby.cloud` OAuth2 identity provider; Lattice runs its own session auth but can
  federate SSO. **Keyring** — supplies the CI build secrets (registry creds + API URL).

## Tech stack

- **Next.js 16** (App Router, `output: "standalone"`) + **React 19** + **TypeScript 5** (strict)
- **Redux Toolkit** — global state (auth, overview, workers, stacks, containers)
- **Axios** — one `fetchApi<T>` wrapper with cookie session, CSRF header, reactive + proactive refresh
- **Tailwind CSS v4** — CSS custom properties, **dark-default** (light/system toggle)
- **Custom SVG topology board + Dagre** (`dagre`) for hierarchical layout — **not** ReactFlow
- **Recharts** (metric charts) · **xterm.js** (container terminal) · **js-yaml** (compose editor)
- **Font Awesome** free-solid packages (icons; not the FA Kit)
- **React Hot Toast** (notifications) · admin **WebSocket** for real-time updates
- **Fonts:** Inter Tight + JetBrains Mono (via `next/font/google`)
- **Vitest** + Testing Library (jsdom) for tests

## Getting started

### Prerequisites

- Node 20+ and npm
- A reachable `lattice-api` instance
- For HTTPS local dev (needed for secure cross-subdomain cookies / auth): `mkcert` and a hosts entry
  for `lattice.local.appleby.cloud` — run `dev setup-local` to do all of it in one step

### Setup

```bash
npm install

# Set the API URL (never commit .env* — it is git-ignored)
echo 'NEXT_PUBLIC_LATTICE_API=http://localhost:8000' > .env.local

# One-time HTTPS setup: mkcert certs + /etc/hosts entry
dev setup-local

# Start the HTTPS dev server
npm run dev:ssl        # https://lattice.local.appleby.cloud:3030
```

Plain `npm run dev` serves HTTP on port 3000, but secure cookies won't work there, so **auth
breaks** — use `dev:ssl` for anything involving login.

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_LATTICE_API` | Yes | `lattice-api` base URL (e.g. `http://localhost:8000`). Also derives the WebSocket origin and tightens the CSP. Baked at **build time** |
| `NEXT_PUBLIC_APP_VERSION` | No | Displayed version string; defaults to `dev` |

## Development

| Command | What it does |
|---------|--------------|
| `npm run dev` | Next.js dev server, **HTTP** on port 3000 (cross-subdomain cookies won't work) |
| `npm run dev:ssl` | **HTTPS** dev server via `server.js` + mkcert on `lattice.local.appleby.cloud:3030` |
| `npm run build` | Production build (standalone output) |
| `npm start` | Run the production build |
| `npm test` | Run the Vitest suite once |
| `npm run lint` | ESLint |
| `dev dev` / `dev dev-http` | `dev` CLI: HTTPS (`dev:ssl`) / HTTP dev server |
| `dev setup-local` | One-time mkcert + `/etc/hosts` setup for local HTTPS |
| `dev check` | ESLint + Prettier check + `tsc --noEmit` |

### Features

- **Real-time dashboard** — custom SVG topology, fleet KPIs with sparklines, live event stream, fleet resource charts, anomaly/failing-stack banners
- **Dual authentication** — local email/password + SSO (OAuth2), with role-gated UI (admin/editor/viewer/pending)
- **Worker management** — live metrics (CPU/memory/disk/network), volumes, networks, tokens, reboot/upgrade
- **Stack management** — create/import, deploy, compose YAML editor, env vars, deploy tokens, dependency graph
- **Container management** — full lifecycle (start/stop/kill/restart/pause/unpause/remove/recreate), live logs, health, terminal
- **Deployment tracking** — live progress, approve/rollback
- **Databases** — managed DB instances: provision, credentials, snapshots, start/stop/restart/remove, restore
- **Registries** — configure/test Docker registries, browse repositories/tags
- **Networks, volumes, backup destinations, global env vars, templates, webhooks**
- **Users & API tokens** — user CRUD + roles; API tokens for `lattice-mcp` / AI agents (the `/ai` page)
- **Audit log**, **SSO/SMTP config**, **notification prefs**, **version checks & service updates**
- **Dark-default theme** — light/system toggle, persisted across `.appleby.cloud` subdomains

## Project structure

```
src/
  app/                  # App Router — one folder per route (dashboard, workers, stacks, containers,
                        #   deployments, databases, networks, registries, env-vars, templates,
                        #   backup-destinations, audit-log, authentication, notifications, ai,
                        #   settings, profile, login, pending, unauthorized) + api/health, api/version
  components/           # ui/ primitives (kebab-case) + dashboard/ workers/ stacks/ containers/
                        #   layout/ topology/ feature components (PascalCase)
  services/             # {entity}.service.ts — all call fetchApi<T>; api.service.ts is the client
  store/                # Redux Toolkit: 5 slices, typed hooks, singleton StoreProvider
  hooks/                # useAdminSocket, useContainerLogs, usePoll, useVersionCheck, useIdleTimeout, …
  lib/                  # utils (cn, isAdmin, canEdit, formatBytes, …), version, deployment-progress
  types/                # domain types + ApiResponse<T>
```

**Auth flow (summary):** `StoreProvider` boots the session via `/auth/self`; a 401 triggers a
deduplicated `/auth/refresh` (reactive) and there is an activity-aware proactive refresh ~60s before
expiry; `error_code 4003` → `/unauthorized`, `4004` (or role `pending`) → `/pending`; mutations send
the `lattice-csrf` cookie back as an `X-CSRF-Token` header. Full detail in [`AGENTS.md`](./AGENTS.md).

## Deployment

Not Vercel. CI (`.github/workflows/build-and-deploy.yml`) builds a multi-stage `node:20-alpine`
standalone image (non-root `nextjs` user, port 3000, `wget /api/health` healthcheck) and pushes it
to `registry.appleby.cloud/lattice-web:latest` — registry creds and `NEXT_PUBLIC_LATTICE_API` are
injected from **Keyring** via `keyring-actions`. It runs on the fleet via **Lattice/Portainer**.
Because `NEXT_PUBLIC_*` is baked at build time, changing the API URL requires a rebuild.

## Contributing & further reading

- **[`AGENTS.md`](./AGENTS.md)** — the authoritative deep reference: full page map, service map,
  Redux store shape, auth model, operations, and conventions. Read it before making changes.
- Related repos: [`lattice-api`](https://github.com/aidenappl/lattice-api) ·
  [`lattice-mcp`](https://github.com/aidenappl/lattice-mcp) ·
  [`lattice-runner`](https://github.com/aidenappl/lattice-runner)
- **Verify before "done":** `npm run build` (fix all TS errors) and `npm test` must pass. Docs ship
  with the code — update `AGENTS.md` in the same change when structure, routes, services, or the
  API contract change.
</content>
