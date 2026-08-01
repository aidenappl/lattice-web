# AGENTS.md — lattice-web

> `lattice-web` is the **Next.js 16 admin dashboard for Lattice**, the container-orchestration
> platform that runs every `appleby.cloud` service. It is the human-facing counterpart to
> [`lattice-mcp`](https://github.com/aidenappl/lattice-mcp): both drive the same
> [`lattice-api`](https://github.com/aidenappl/lattice-api) admin surface, one for Claude Code and
> one for a person in a browser at `lattice.appleby.cloud`. This dashboard owns **workers, stacks,
> containers, deployments, databases, registries, networks, volumes, backup destinations, global
> env vars, templates, webhooks, users, API tokens, and instance config** — every read view and
> every mutation is an HTTP call to `lattice-api`. This file orients any agent/worker before
> touching code in this repo.
>
> **⚠️ Golden rule — keep this file current:** any change that adds/removes a page or route, adds
> or retypes a service function, changes the Redux store shape, alters the auth/refresh model, or
> drifts from `lattice-api`'s route surface MUST update this AGENTS.md in the SAME change. Stale
> context here misleads every future agent. If you finish work and haven't touched AGENTS.md,
> confirm that's actually correct. Per the global standard: **docs ship with the code, not as a
> follow-up commit.**

---

## What this repo is

A **Next.js 16 App Router** application — the browser admin console for Lattice. It renders the
fleet dashboard (topology graph, KPI row, live event stream, fleet resource charts) and full CRUD
+ lifecycle management screens for every Lattice resource. It is a **pure API client**: it holds
no orchestration logic, no database, no worker protocol. Everything an operator sees — pagination,
validation messages, deployment mechanics, container lifecycle — is produced by `lattice-api` and
merely presented here.

It **owns**: the UI, the client-side Redux cache of API data, the auth session lifecycle in the
browser (login form, cookie-based session, proactive + reactive token refresh, CSRF header, idle
timeout), the component library (built from scratch), the real-time admin WebSocket consumer, and
the local HTTPS dev harness.

It does **not** own:
- The Lattice **data model, deployment mechanics, or worker protocol** — those live in
  [`lattice-api`](https://github.com/aidenappl/lattice-api) and
  [`lattice-runner`](https://github.com/aidenappl/lattice-runner).
- **Authentication issuance** — `lattice-api` issues the session cookie/JWT and runs the SSO
  (OAuth2) flow; this app only presents the login form and manages refresh timing.
- **Any business rules.** If a mutation is rejected, the reason came from the API, not from here.

## Stack & dependencies

Versions are pinned in `package.json` (`version: 0.0.2`, `private: true`).

| Area | Choice | Version | Notes |
|------|--------|---------|-------|
| Framework | **Next.js** | `^16.2.4` | App Router only, `output: "standalone"` |
| UI runtime | **React** / react-dom | `19.2.3` (exact) | React 19 |
| Language | **TypeScript** | `^5` | `"strict": true`, `noEmit`, path alias `@/* → ./src/*` |
| State | **Redux Toolkit** + react-redux | `@reduxjs/toolkit ^2.11.2`, `react-redux ^9.2.0` | 5 slices, typed hooks |
| HTTP | **Axios** | `^1.15.1` | single `fetchApi<T>` wrapper, `validateStatus: () => true` |
| Styling | **Tailwind CSS v4** | `tailwindcss ^4`, `@tailwindcss/postcss ^4` | CSS custom properties, **dark-default** |
| Icons | **Font Awesome** | `fontawesome-svg-core ^7.2.0`, `free-solid-svg-icons ^7.2.0`, `react-fontawesome ^3.3.0` | free-solid set (not the FA Kit) |
| Charts | **Recharts** | `^3.8.1` | sparklines, fleet/worker/container metric charts |
| Topology | **dagre** + `@types/dagre` | `dagre ^0.8.5` | dependency-graph auto-layout (custom SVG board, **not** ReactFlow) |
| Terminal | **xterm** | `@xterm/xterm ^6.0.0` + addon-fit, addon-web-links | container exec/log terminal |
| YAML | **js-yaml** | `^4.1.1` | compose YAML parse/serialize in the editor |
| Toasts | **react-hot-toast** | `^2.6.0` | global `<Toaster>` in `DashboardLayout` |
| Fonts | **Inter Tight** + **JetBrains Mono** | via `next/font/google` | CSS vars `--font-inter-tight`, `--font-jetbrains-mono` |
| Tests | **Vitest** + Testing Library | `vitest ^4.1.5`, `@testing-library/react ^16.3.2`, `jsdom ^29.0.2` | jsdom env, `src/test/setup.ts` |
| Lint | **ESLint** + `eslint-config-next` | `eslint ^9`, config `16.1.6` | via `next lint` |

> **README drift note:** the current `README.md` claims **ReactFlow 12**
> (`@xyflow/react`) and **Geist** fonts. Neither matches the code — topology uses **dagre + a
> hand-rolled SVG board** (`src/components/topology/TopologyBoard.tsx` + `useTopologyData.ts`, no
> `nodes/`/`edges/` subtree), and the fonts are **Inter Tight + JetBrains Mono**. They also list a
> smaller page/service set than actually ships (no databases, backups, templates, env-vars,
> authentication, notifications, or AI pages). Treat this AGENTS.md as the source of truth.

## Project structure

Flat `src/` tree under the App Router. Path alias `@/` → `src/`.

```
src/
  app/                      # App Router — one folder per route (see Page map)
    api/health/route.ts     # GET /api/health → {status:"ok"} — Docker HEALTHCHECK hits this
    api/version/route.ts    # GET /api/version → {version} from NEXT_PUBLIC_APP_VERSION
    layout.tsx              # Root layout: fonts, metadata, StoreProvider→ThemeProvider→DashboardLayout, SSR dark class from cookie
    globals.css             # Tailwind v4 import + CSS-variable theme tokens (dark default, light override)
    page.tsx                # "/" dashboard (topology, KPIs, event stream, fleet resources)
    <feature>/page.tsx      # one page per feature, dynamic segments as [id]
  components/
    ui/                     # from-scratch primitives — KEBAB-CASE files (button.tsx, badge.tsx, input.tsx, …)
    layout/                 # Sidebar, Topbar, DashboardLayout, CommandPalette, UpdateBanner, RunnerUpgradePanel, Navbar — PascalCase
    dashboard/              # dashboard widgets (DashboardKPIRow, EventStream, FleetResourcePanel, …) — PascalCase
    stacks/ workers/ containers/  # feature-scoped component groups — PascalCase; stacks/ has a barrel index.ts
    topology/               # TopologyBoard.tsx + useTopologyData.ts (dagre layout)
    ThemeProvider.tsx       # light/dark/system context, cookie+localStorage persistence, cross-subdomain cookie domain
  services/                 # one {entity}.service.ts per domain; all call fetchApi<T> (see Service map)
    api.service.ts          # THE axios client + fetchApi<T> + 401/403 handling + proactive/reactive refresh + CSRF
  store/                    # Redux Toolkit
    index.ts                # makeStore(), RootState, AppDispatch
    hooks.ts                # useAppDispatch/useAppSelector + useAuth/useAuthStatus/useUser
    StoreProvider.tsx       # singleton store + AppInitializer (boots session via reqGetSelf, gates render)
    slices/                 # authSlice, overviewSlice, workersSlice, stacksSlice, containersSlice (+ *.test.ts)
  hooks/                    # cross-cutting hooks (usePoll, useAdminSocket, useContainerLogs, useIdleTimeout, …)
  lib/                      # utils.ts (cn, isAdmin, canEdit, formatBytes, …), version.ts, deployment-progress.ts (+ *.test.ts)
  types/                    # domain types; index.ts re-exports all + ApiResponse/ApiSuccess/ApiError/SearchResults/ApiToken
  test/setup.ts             # Vitest + jest-dom setup
```

There is **no** `context/` or `tools/` directory (the global standard lists them as optional).
Shared client helpers live in `lib/`; providers are plain components (`ThemeProvider`,
`StoreProvider`, `VersionCheckProvider`, `ConfirmProvider`).

**Component naming — two conventions coexist (both allowed by the global standard):**
- `components/ui/` primitives are **kebab-case** (`button.tsx`, `badge.tsx`, `confirm-modal.tsx`,
  `code-editor.tsx`, `log-viewer.tsx`) — with one PascalCase exception (`ResizableSplit.tsx`).
- All **feature/layout/dashboard** components are **PascalCase** matching the exported component
  (`Sidebar.tsx`, `DashboardKPIRow.tsx`, `StackComposeTab.tsx`).

### Page map (`src/app/**/page.tsx`)

Every page is a client route rendered inside `DashboardLayout`. Dynamic segments use `[id]`.

| Route | File | What it does |
|-------|------|--------------|
| `/` | `page.tsx` | Dashboard: topology board, KPI row w/ sparklines, live event stream, fleet resource charts, anomaly/failing-stack banners |
| `/login` | `login/page.tsx` | Dual auth: local email/password (`reqLogin`) **+** SSO button (fetches `/auth/sso/config`, links to `login_url`). Redirects to `/` if already authed |
| `/pending` | `pending/page.tsx` | Landing for users with `role: "pending"` (account awaiting approval) |
| `/unauthorized` | `unauthorized/page.tsx` | Landing when a grant is revoked / `error_code 4003` |
| `/workers` | `workers/page.tsx` | Worker fleet list with status + live metrics |
| `/workers/[id]` | `workers/[id]/page.tsx` | Worker detail: info, infra, stacks, tokens, container stats, edit/reboot/upgrade |
| `/workers/[id]/metrics` | `workers/[id]/metrics/page.tsx` | Full metric charts (CPU/mem/disk/net) for one worker |
| `/stacks` | `stacks/page.tsx` | Stack list with status overview |
| `/stacks/new` | `stacks/new/page.tsx` | Create stack (or import compose) |
| `/stacks/[id]` | `stacks/[id]/page.tsx` | Stack detail tabs: containers, compose YAML editor, env, logs, deployments, deploy tokens, dependency graph |
| `/containers` | `containers/page.tsx` | Global container list + lifecycle actions |
| `/containers/[id]` | `containers/[id]/page.tsx` | Container detail: details/health tabs, logs, terminal, action bar, edit form |
| `/deployments` | `deployments/page.tsx` | Deployment history |
| `/deployments/[id]` | `deployments/[id]/page.tsx` | Deployment detail + live logs, approve/rollback |
| `/databases` | `databases/page.tsx` | Managed database instance list |
| `/databases/new` | `databases/new/page.tsx` | Provision a database instance (live host-port availability against the chosen worker) |
| `/databases/[id]` | `databases/[id]/page.tsx` | DB instance detail: overview/snapshots/logs/history/settings tabs, failure banner, SQL console, credentials, start/stop/restart/remove-container, delete (Settings danger zone), restore |
| `/networks` | `networks/page.tsx` | Compose networks / port-mapping overview across workers |
| `/registries` | `registries/page.tsx` | Docker registry config, test, repo/tag browsing |
| `/env-vars` | `env-vars/page.tsx` | Global (cross-stack) environment variables, incl. secrets |
| `/templates` | `templates/page.tsx` | Stack templates (create from stack / from config, delete) |
| `/backup-destinations` | `backup-destinations/page.tsx` | Backup destination CRUD + test |
| `/audit-log` | `audit-log/page.tsx` | Administrative audit trail |
| `/authentication` | `authentication/page.tsx` | SSO config (provider presets, OAuth2/OIDC endpoints, introspection, claim mapping) + SMTP config + test |
| `/notifications` | `notifications/page.tsx` | Notification preferences + webhooks |
| `/ai` | `ai/page.tsx` | **API-token management** (the tokens that power `lattice-mcp` / AI agents) — create/list/delete |
| `/settings` | `settings/page.tsx` | User management (create/role/deactivate) + version checks + service updates |
| `/profile` | `profile/page.tsx` | Self profile: name, password, avatar (`reqUpdateSelf`) |

Sidebar order (from `components/layout/Sidebar.tsx`): Dashboard, Deployments, Audit Log, Workers,
Stacks, Containers, Databases, Networks, Registries, Env Variables, Templates, Backups,
Authentication, Notifications, AI Management, Settings — with a Profile link in the footer.

### Service map (`src/services/*.service.ts`)

Every function is a thin wrapper returning `fetchApi<T>(...)`. **The `req` prefix is mandatory.**
The `data<T>` you receive is `lattice-api`'s `data` field, already unwrapped by `fetchApi`.

| File | Domain | Representative functions |
|------|--------|--------------------------|
| `api.service.ts` | **The client itself** | `fetchApi<T>`, `startProactiveRefresh`, `stopProactiveRefresh` (no `req*` — it's the transport) |
| `auth.service.ts` | Session | `reqGetSelf`, `reqLogin`, `reqLogout`, `reqUpdateSelf` |
| `admin.service.ts` | Fleet + instance config | `reqGetOverview`, `reqGetFleetMetrics`, `reqGetAnomalies`, `reqGetAuditLog`, `reqGetUsers`/`reqCreateUser`/`reqUpdateUser`/`reqDeleteUser`, `reqGetVersions`/`reqRefreshVersions`/`reqUpdateAPI`/`reqUpdateWeb`, webhooks CRUD+test, global env-var CRUD, SMTP get/update/test, notification prefs, SSO get/update, `reqSearch`, API-token CRUD |
| `workers.service.ts` | Workers | `reqGetWorkers`/`reqGetWorker`/`reqCreateWorker`/`reqUpdateWorker`/`reqDeleteWorker`, tokens CRUD, `reqGetWorkerMetrics`, `reqRebootWorker`, `reqUpgradeRunner`, `reqStopAllContainers`/`reqStartAllContainers`, `reqGetWorkerContainerStats`, `reqForceRemoveContainer` |
| `stacks.service.ts` | Stacks + containers | stack CRUD, `reqDeployStack`, `reqGetAllContainers`/`reqGetContainer`/`reqGetContainers`, container CRUD, `reqGetContainerLogs`/`reqGetLifecycleLogs`/`reqGetContainerMetrics`, 8 lifecycle actions (`reqStart/Stop/Kill/Restart/Pause/Unpause/Remove/RecreateContainer`), `reqImportCompose`/`reqUpdateCompose`/`reqSyncCompose`, stack start/stop/restart, `reqExportStack`/`reqImportStackExport`, deploy-token CRUD |
| `deployments.service.ts` | Deployments | `reqGetDeployments`/`reqGetDeployment`/`reqGetDeploymentLogs`, `reqApproveDeployment`, `reqRollbackDeployment` |
| `databases.service.ts` | Managed DBs | instance CRUD, `reqDatabaseAction("start"\|"stop"\|"restart"\|"remove")` (container-only — `remove` keeps the data volume), `reqDeleteDatabaseInstance(id, force?)` (destroys container **and** volume; `force` only for an offline worker), `reqGetDatabaseConnection`, `reqRevealDatabaseCredentials` (audited — prefer over the deprecated `reqGetDatabaseCredentials`), `reqGetDatabaseEvents`/`reqGetDatabaseLogs`/`reqGetDatabaseLifecycleLogs`, `reqOpenDatabaseConsole`, `reqGetWorkerPortAvailability`/`reqCheckWorkerPort`, snapshot list/create/restore/delete |
| `registries.service.ts` | Registries | registry CRUD, `reqTestRegistry`/`reqTestRegistryInline`, `reqListRegistryRepos`/`reqListRegistryTags` |
| `networks.service.ts` | Networks | `reqListAllNetworks`, per-worker list/create/delete, `reqDeleteNetworkByID` |
| `volumes.service.ts` | Volumes | per-worker `reqListVolumes`/`reqCreateVolume`/`reqDeleteVolume` |
| `templates.service.ts` | Templates | `reqGetTemplates`, `reqCreateTemplateFromStack`, `reqCreateTemplate`, `reqDeleteTemplate` |
| `backup-destinations.service.ts` | Backups | destination CRUD + `reqTestBackupDestination` |

## Running, building & testing

All commands go through the custom `dev` CLI (`Devfile.yaml`) or npm directly.

| `dev` command | npm equivalent | What it does |
|---------------|----------------|--------------|
| `dev dev` | `npm run dev:ssl` (`node server.js`) | **HTTPS** dev server on `https://lattice.local.appleby.cloud:3030` — the intended way to run |
| `dev dev-http` | `npm run dev` (`next dev`) | Plain HTTP dev server — **secure cross-subdomain cookies won't work**, so auth breaks |
| `dev setup-local` | — | One-time: installs mkcert, generates certs, adds the hosts entry (composite of the next two) |
| `dev setup-ssl` | `mkcert -install && mkcert "*.local.appleby.cloud" local.appleby.cloud` | Generate the wildcard cert pair |
| `dev setup-hosts` | — | Adds `127.0.0.1 lattice.local.appleby.cloud` to `/etc/hosts` |
| `dev build` | `npm run build` (`next build`) | Production build — **must pass before "done"** |
| `dev start` | `npm start` (`next start`) | Run the production build |
| `dev test` | `npm test` (`vitest run`) | Run the Vitest suite once |
| `dev lint` / `dev lint-fix` | `eslint` / `eslint --fix` | Lint |
| `dev format` / `dev format-check` | `prettier --write .` / `--check .` | Format |
| `dev typecheck` | `npx tsc --noEmit` | Type-check only |
| `dev check` | lint + prettier-check + tsc | The full static gate |
| `dev install` | `npm install` | Deps |

### The HTTPS dev flow (`server.js`)

`server.js` is a **local-development-only** custom HTTPS server (it `process.exit(1)`s if
`NODE_ENV === "production"`). It exists because the app relies on **Secure cookies scoped to
`.appleby.cloud`**, and browsers only send those over HTTPS. Flow:

1. `mkcert "*.local.appleby.cloud" local.appleby.cloud` produces
   `_wildcard.local.appleby.cloud+1.pem` and `_wildcard.local.appleby.cloud+1-key.pem` at the repo
   root. **These `.pem` files are git-ignored (`*.pem`) and must never be committed.** `server.js`
   errors out with setup instructions if they're missing.
2. Add `127.0.0.1 lattice.local.appleby.cloud` to `/etc/hosts`.
3. `server.js` manually parses `.env.local` **before** `next()` initialises, so `NEXT_PUBLIC_*`
   vars are baked into the client bundle at compile time. It then serves Next over HTTPS on
   **hostname `lattice.local.appleby.cloud`, port `3030`**.

### Environment variables

Only `NEXT_PUBLIC_*` vars exist — this is a pure client app with no server secrets. Set them in
`.env.local` (git-ignored). **Never create/modify `.env*` files yourself** — tell the user the
values to set (global guardrail).

| Variable | Required | Purpose |
|----------|----------|---------|
| `NEXT_PUBLIC_LATTICE_API` | **Yes** | `lattice-api` base URL (e.g. `http://localhost:8000` locally). Used for every Axios request, derives the WebSocket URL (`https→wss`), and tightens the CSP `connect-src` in `next.config.ts` |
| `NEXT_PUBLIC_APP_VERSION` | No | Version string shown in-app and served by `/api/version`; defaults to `"dev"` (`lib/version.ts`). Injected as a Docker build-arg in CI |

Because these are baked at **build time**, changing the API URL requires a rebuild — there is no
runtime config.

### Testing

Vitest with jsdom (`vitest.config.ts`, setup `src/test/setup.ts`, `@` alias mirrored). Tests are
colocated `*.test.ts(x)` files. Current coverage is the **pure logic and reducers**, not full page
rendering: `lib/utils.test.ts`, `lib/deployment-progress.test.ts`, and a `*.test.ts` beside each
Redux slice (`authSlice`, `overviewSlice`, `workersSlice`, `stacksSlice`, `containersSlice`). When
you touch a slice or a `lib/` helper, extend its sibling test.

## How code is written here

- **App Router, client-heavy.** Nearly every `page.tsx` is `"use client"`. Data is fetched
  **imperatively** — `useEffect` + `useState` + a `req*` service call, or a Redux thunk dispatch.
  **No SWR, React Query, or tRPC** (global hard rule). The only server routes are the two
  `app/api/*/route.ts` handlers (`/api/health`, `/api/version`), which return static JSON.
- **One Axios client, one wrapper.** All HTTP goes through `fetchApi<T>` in
  `services/api.service.ts`. The base client sets `validateStatus: () => true` (never auto-reject),
  `withCredentials: true` (send the session cookie cross-origin), and a 10 s timeout. `fetchApi`
  normalises every response into the discriminated union `ApiResponse<T>` (`success: true` with
  `data`, or `success: false` with `error`/`error_message`/`error_code`). GET requests get up to
  **3 retries** with backoff on network/5xx. **Always narrow on `res.success` before reading
  `res.data`.**
- **Service functions are one-liners, `req`-prefixed.** `export const reqGetWorkers = () =>
  fetchApi<Worker[]>({ method: "GET", url: "/admin/workers" })`. The generic `<T>` is the shape of
  `data`. Group them by domain in the matching `*.service.ts`; `api.service.ts` holds the transport
  only. All types are centralised in `types/` — no inline type definitions in pages or services.
- **Redux Toolkit, five slices, typed hooks.** State is read via `useAppSelector` and the
  convenience hooks `useAuth`/`useAuthStatus`/`useUser` (`store/hooks.ts`). Async data uses
  `createAsyncThunk` (e.g. `fetchOverview`, `fetchWorkers`) with `extraReducers`. The store is a
  **module-level singleton** created by `getStore()` in `StoreProvider.tsx` (SSR-safe: one store
  per browser tab, never recreated).
- **`StoreProvider` boots the session.** `AppInitializer` calls `reqGetSelf()` on mount; on success
  it sets `is_logged`/`user`, starts proactive refresh, and (if `role === "pending"`) redirects to
  `/pending`. It gates the entire app behind a branded loading splash until ready, and **skips the
  check on `/login`, `/unauthorized`, `/pending`** to avoid redirect loops.
- **Role gating is client-side helpers, not middleware.** `lib/utils.ts` exposes `isAdmin(user)`
  and `canEdit(user)` (editor/admin); `viewer` and `pending` are read-only. Roles:
  `admin | editor | viewer | pending`. **This is UX gating only — the API is the real
  authority.** Never assume a hidden button means a protected endpoint.
- **Detail pages are orchestrators.** `workers/[id]`, `stacks/[id]`, `containers/[id]` load data,
  wire WebSocket events, and delegate rendering to their `components/<feature>/*` sub-components.
- **Components are built from scratch.** No shadcn/Radix/MUI/Headless UI. `components/ui/` is the
  primitive kit (`button`, `input`, `badge`, `alert`, `avatar`, `confirm-modal`, `code-editor`,
  `log-viewer`, `terminal`, `sparkline`, `loading`, …). Confirmations go through the
  `ConfirmProvider`/`useConfirm` context, not `window.confirm`.
- **Styling is Tailwind v4 + CSS variables.** `globals.css` imports Tailwind, declares
  `@custom-variant dark (&:where(.dark, .dark *))`, defines the **dark palette on `:root`** (dark
  is the default), overrides for light under `:root:not(.dark)`, and maps tokens for Tailwind v4
  via `@theme inline`. **No CSS modules, no CSS-in-JS, no styled-components.** Use `cn()` from
  `lib/utils.ts` to compose class strings.
- **Theme is dark-default, tri-state.** `ThemeProvider` supports `light | dark | system`, persisted
  to a **cookie scoped to `.appleby.cloud`** (so the choice follows the user across ecosystem
  subdomains) with a localStorage fallback. `layout.tsx` reads the cookie **server-side** and stamps
  `class="dark"` on `<html>` to avoid a flash; unset/`system` defaults to dark.
- **Icons:** Font Awesome free-solid via `<FontAwesomeIcon icon={faX} />` (this repo uses the free
  packages directly, not the FA Kit).

## Domain & architecture

### Request flow

Browser action → `req*` service fn → `fetchApi<T>` → `axiosApi` (baseURL
`NEXT_PUBLIC_LATTICE_API`, cookies attached) → **`lattice-api`** `/admin/*`, `/auth/*`, `/ws/*`
routes → response unwrapped to `ApiResponse<T>` → Redux slice or local component state → render.
There is **no BFF**; the browser talks to `lattice-api` directly (CORS + credentialed cookies).

### Auth model (cookie session + CSRF + dual login)

Lattice runs its **own** cookie-based session auth (this is *not* raw Forta-cookie SSO in the
browser — `lattice-api` owns the identity layer, optionally federating to an external SSO/OAuth2
provider it configures under `/auth/sso/*`).

- **Two login paths** on `/login`:
  1. **Local** — email/password → `reqLogin` → `POST /auth/login`; on success the API sets the
     session cookie and the page redirects to `/`.
  2. **SSO** — the page fetches the **public** `/auth/sso/config`; if `enabled`, it renders a
     button linking to `login_url` (validated to start with `/` to prevent open-redirect /
     `javascript:` injection). SSO error codes returned on the redirect (`sso_denied`,
     `sso_no_account`, `sso_state_expired`, …) are mapped to friendly messages.
  - The page uses the **shared Appleby Cloud login layout** — the same structure as
    `forta-login`, `monitor-web` and `openbucket-web`: full-screen centred `<main>`, a brand
    row (40px logo tile + product name + hairline + "Appleby Cloud"), a bordered card holding
    "Sign in to continue" → labelled fields → primary button → `or continue with` divider →
    SSO button, and a `© <year> Appleby Cloud` footer. Colours come from Lattice's own tokens
    (`--brand` green, `--surface-*`, `--border-*`); **the structure and spacing must not
    diverge** — change it in all four repos or not at all. The page-local `Field`,
    `ErrorAlert`, `Divider` and `InlineLoading` helpers exist so the login form matches that
    shared shape rather than the app-wide `ui/input` + `ui/alert` house style (uppercase
    labels, dot-marker alerts); don't "consolidate" them back.
- **Session identity** is `reqGetSelf` → `/auth/self`, returning a `User`
  (`auth_type: "oauth" | "local" | "sso"`, `role`).
- **CSRF:** for `POST`/`PUT`/`DELETE`, `executeRequest` reads the `lattice-csrf` cookie and sends
  it back as the **`X-CSRF-Token`** header (double-submit pattern).
- **401 handling (reactive):** on a 401, `handle401Response` calls a **singleton
  `refreshPromise`** → `POST /auth/refresh` (deduped so concurrent 401s fire one refresh), then
  retries the original request with the new bearer token. If refresh fails, it redirects to
  `/login`.
- **Proactive refresh (activity-aware):** `startProactiveRefresh` (kicked off after a successful
  `reqGetSelf`) schedules a refresh **~60 s before token expiry**, but only if the user is
  **active** (mouse/key/scroll/touch within 5 min). Idle users defer refresh until their next
  interaction; returning to a hidden tab triggers an immediate expiry check
  (`visibilitychange`). `stopProactiveRefresh` tears the listeners down on unmount.
- **403 handling:** `error_code 4003` → redirect `/unauthorized` (grant revoked); `error_code
  4004` → redirect `/pending` (account not yet approved).
- **Idle timeout:** `useIdleTimeout` (wired in `DashboardLayout`) logs the user out after inactivity.

**Provider presets (`/authentication`).** `PROVIDER_PRESETS` fills the OAuth2 endpoints for
Forta, Google, GitHub, Microsoft and Custom. Two rules govern it:

- **Only the Forta preset sets `introspect_url`**, because Forta is the only one of these that
  implements RFC 7662. That endpoint is what makes revocation take effect — without it a session
  survives until its token expires even after the grant is withdrawn upstream. Google, Microsoft
  and GitHub genuinely do not offer it, so their presets leave it blank rather than guessing a URL
  that would fail closed on every check.
- **`introspect_url` and `logout_url` are applied UNCONDITIONALLY** when a preset is chosen, while
  the other fields use the guarded `if (p.x)` form. The guard means "an empty preset value keeps
  what you typed", which is right for Custom and wrong for these two: switching Forta → Google
  would otherwise keep Forta's introspection URL, and every revocation check would become a
  request to the wrong provider about a token it never issued.

### Redux store shape

Five reducers registered in `store/index.ts` under `{ auth, overview, workers, stacks, containers }`.

| Slice | State fields | Thunks | Purpose |
|-------|-------------|--------|---------|
| `auth` | `is_logged`, `is_loading`, `user` | — (set via `StoreProvider`) | Session + current user; consumed via `useAuth`/`useUser` |
| `overview` | `data`, `fleetHistory`, `auditLog`, `loading`, `error` | `fetchOverview`, `fetchFleetMetrics`, `fetchAuditLog` | Dashboard fleet snapshot + metric history + audit feed |
| `workers` | `list`, `current`, `metrics`, `tokens`, `loading`, `error` | `fetchWorkers`, `fetchWorker`, `fetchWorkerMetrics`, `fetchWorkerTokens` | Worker list + focused worker detail |
| `stacks` | `list`, `current`, `loading`, `error` | `fetchStacks`, `fetchStack` | Stack list + focused stack (has a `createSelector` memoised selector) |
| `containers` | `list`, `stackContainers`, `loading`, `error` | `fetchAllContainers`, `fetchContainersByStack` | Global container list + per-stack containers |

### Managed database screens

`DatabaseStatus` and `DatabaseHealth` in `types/database.types.ts` mirror the Go
`structs.DatabaseStatus`/`DatabaseHealth` enums — **keep them in step**, and remember that any new
status token also needs an entry in `components/ui/badge.tsx`, or it silently renders as an
unstyled grey badge.

An instance in `error` or `degraded` always carries `last_error` (`code`, `message`, `occurred_at`,
`retryable`). The detail page renders it as a banner with links into the Logs and History tabs; the
list page shows it as a hover-titled warning icon.

Logs, lifecycle messages and the console all address the container by **name and worker**, not by
`containers.id` — managed databases have no row in `containers`. The console is authorised
server-side first (`reqOpenDatabaseConsole`), which returns the SQL client argv; the shared
`<Terminal>` component takes that as its `cmd` prop and the browser never handles credentials.

The create form deliberately does **not** pre-fill a host port: leaving it blank has the control
plane allocate a free one, which is why a second database on the same worker no longer collides on
3306.

**A snapshot schedule requires a backup destination, and both forms enforce it.** The control plane
only registers schedules that have somewhere to write, so a cron with no destination saves, renders
in the form, and never fires. The create wizard and the Settings tab both refuse that combination
before submitting, and *Take Snapshot* is disabled with a `title` explaining which precondition is
missing rather than firing a request the API is guaranteed to reject. The API rejects it too — that
guard is the load-bearing one, since `lattice-mcp` never goes through this app.

Note that clearing a backup field now works: the API distinguishes an explicit JSON `null` from an
omitted key, so the `|| null` the settings form already sent finally *unsets* a schedule. Before, the
handler read null as "not supplied" and the schedule kept running after the UI showed it cleared.

**Deletion protection and final snapshots.** The Danger Zone carries a *Deletion protection* toggle;
while it is on the API refuses any delete, **including a forced one** — force exists for a dead
worker, not as a way around the guard. Deleting a running database with a destination configured
first asks whether to take a final snapshot: choosing it returns with the database **still present**
(the API destroys it only once that snapshot completes), so the page reloads rather than navigating
away. A failed final snapshot means nothing is deleted.

**Schedule activity** on the Snapshots tab lists scheduled *attempts*, not just snapshots — including
slots that were skipped, with the reason. Scheduling moved to the control plane, so every slot leaves
a row whether or not it produced a snapshot; an absent snapshot is a mystery, while "the 03:00 slot
did not run because the previous one was still going" is an answer. Note this added `claimed` and
`skipped` to `components/ui/badge.tsx` — a status token missing from that map renders as an unstyled
grey badge.

**Live usage and volume size** are on the Overview tab. Both come from data the platform already
collected but could not read by instance: CPU/memory samples live in `container_metrics` with a NULL
`container_id`, and the data volume's size is reported by the worker in `db_sync`. Neither needs the
database to have a row in the `containers` table.

**Remove container ≠ Delete database, and the UI must never blur them.** The header's *Remove
container* button (`reqDatabaseAction(id, "remove")`) destroys the container and **keeps the data
volume**, so the database can be started again with its data; the instance stays in the list as
`stopped`. Deleting is the *Danger Zone* button in Settings and the list row's *Delete*
(`reqDeleteDatabaseInstance`), which destroys the container **and** the data volume. Both confirm
dialogs name the volume, the worker and the database being destroyed rather than saying "this cannot
be undone" — the two operations were previously both called "Remove"/"Delete" with wording that fit
neither, and Remove navigated back to the list on success, which read as a delete while the instance
was still very much there.

Deletion is **asynchronous**: the API answers once the worker has been asked, the instance sits in
`deleting`, and the row disappears only when the worker confirms the volume is gone
(`db_instance_deleted` over the admin socket, which both database screens listen for). So never drop
the row optimistically — reload, or a failed teardown vanishes and then reappears unexplained. A
delete against an offline worker comes back **409**; both screens then ask a second, explicit
question before retrying with `force`, because forcing abandons a container and a full data volume on
the worker.

Screens that don't map cleanly to a slice (databases, registries, networks, templates, backups,
deployments, env-vars, webhooks, SSO/SMTP, API tokens) fetch **directly via services into local
component state** — Redux is reserved for the shared, frequently-re-read fleet data.

### Real-time / live data

- **Admin WebSocket** (`hooks/useAdminSocket.ts`): a **singleton** `WebSocket` to
  `${NEXT_PUBLIC_LATTICE_API→ws(s)}/ws/admin`, shared across all consumers via a subscriber `Set`,
  with auto-reconnect (3 s backoff) while subscribers exist. Powers the dashboard event stream,
  live worker liveness, deployment progress, and container-status updates. `sendAdminMessage` pushes
  messages the other way.
- **Worker liveness** (`hooks/useWorkerLiveness.ts`): tracks online/offline from socket heartbeats
  with a staleness timeout.
- **Polling fallback** (`hooks/usePoll.ts`): generic interval polling with auto-cleanup for views
  that aren't socket-driven.
- **Container logs** (`hooks/useContainerLogs.ts`): combines a REST fetch with WebSocket streaming,
  client-side filtering (stdout/stderr/lifecycle), and download.
- **Version checking** (`hooks/useVersionCheck.tsx` + `UpdateBanner` / `RunnerUpgradePanel`):
  polls `/admin/versions` and surfaces when API/web/runner images are behind the registry.

## Ecosystem & related repos

| Repo | Relationship |
|------|--------------|
| [`lattice-api`](https://github.com/aidenappl/lattice-api) | **The backend this dashboard drives.** Its route table (`/admin/*`, `/auth/*`, `/ws/admin`) is the source of truth for every service function. Add a route there → add a `req*` service + UI here. |
| [`lattice-mcp`](https://github.com/aidenappl/lattice-mcp) | Sibling admin surface for Claude Code — 125 tools over the **same** API. When you add a mutation here, consider whether the MCP needs the matching tool (and vice-versa). The gold-standard AGENTS.md this file mirrors. |
| [`lattice-runner`](https://github.com/aidenappl/lattice-runner) | Agent on each worker VM (WebSocket back to `lattice-api`). This dashboard's "upgrade runner" / worker actions ultimately drive it. |
| [`forta-*`](https://github.com/aidenappl) / Forta | `appleby.cloud` OAuth2 identity provider. Lattice runs its own session auth but can federate SSO; Forta is the ecosystem SSO story. |
| [`keyring-*`](https://github.com/aidenappl) / Keyring | Secrets platform. In CI, `keyring-actions` injects the registry creds + `NEXT_PUBLIC_LATTICE_API` at build time. |

## Operations

- **Deployment target: self-hosted Docker, NOT Vercel.** CI
  (`.github/workflows/build-and-deploy.yml`) builds a multi-stage image and pushes it to the private
  registry (`registry.appleby.cloud/lattice-web:latest`). Version is
  resolved from the commit (`[release-patch|minor|major]` tags cut a GitHub release; otherwise the
  short SHA), injected as `NEXT_PUBLIC_APP_VERSION`. Registry creds + `NEXT_PUBLIC_LATTICE_API` come
  from **Keyring** via `keyring-actions`.
- **CI stops at the registry — it does NOT deploy.** Unlike every other web app in the ecosystem,
  this repo has **no `Deploy to Lattice` step** and there is **no Lattice-managed container** for it
  (it will not appear in `lattice_list_containers` / `lattice_search`). Do not "standardise" a deploy
  trigger in here: there is no stack or deploy token for it to call.
- **How it actually ships: Lattice self-update.** `lattice-web` is a service in the orchestrator's
  own `docker-compose.yml` (alongside `lattice-api`, at `$DOCKER_COMPOSE_DIR`, i.e. `/opt/lattice`),
  so it is part of the platform, not a workload the platform manages. Rolling it out means calling
  `POST /admin/update/web` on `lattice-api` — `routers/HandleSelfUpdate.router.go:HandleUpdateWeb`,
  which runs `docker compose pull <WEB_SERVICE_NAME>` then recreates the service. Three ways to
  trigger it: the **Updates available banner** in this dashboard, the `lattice_update_web` MCP tool,
  or the endpoint directly. `WEB_SERVICE_NAME` defaults to `lattice-web`.
  So after a green CI run the new image sits in the registry until someone triggers that update —
  a push alone changes nothing in production.
  ⚠️ Production compose **must** use `image: registry.appleby.cloud/lattice-web:latest`, not
  `build: ../lattice-web`; with `build:` the pull is a no-op and self-update silently does nothing
  (see the comment at `lattice-api/docker-compose.yml:41-43`).
- **Container:** `node:20-alpine`, two-stage build, `output: "standalone"`, non-root `nextjs`
  user (UID 1001), `EXPOSE 3000`, `PORT=3000`, `HOSTNAME=0.0.0.0`, `CMD ["node", "server.js"]` (the
  Next.js **standalone** `server.js`, distinct from the repo-root dev `server.js`).
- **Healthcheck:** Docker `HEALTHCHECK` hits `GET /api/health` (`→ {status:"ok"}`) every 30 s. Keep
  that route static and dependency-free.
- **Security headers** are set centrally in `next.config.ts` `headers()`: `X-Frame-Options: DENY`,
  `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`,
  `X-XSS-Protection`, `Permissions-Policy`, HSTS, and a **CSP** that tightens `connect-src` to the
  API origin + its WebSocket origin (falls back to `wss: ws: https:` if `NEXT_PUBLIC_LATTICE_API`
  is unset at build), allows FontAwesome kit hosts, and sets `frame-ancestors 'none'`. `'unsafe-eval'`
  is added to `script-src` **only in dev** (Next HMR needs it).
- **Common failure modes:**
  - *Everything shows a loading splash forever / bounces to `/login`* — `reqGetSelf` is failing:
    wrong `NEXT_PUBLIC_LATTICE_API`, CORS not allowing credentialed requests, or `lattice-api` down.
  - *Login works but every mutation 403s with a CSRF error* — the `lattice-csrf` cookie isn't being
    set/read (cookie domain / non-HTTPS local dev). Use `dev dev` (HTTPS), not `dev dev-http`.
  - *Auth silently breaks only in local dev* — you ran HTTP; Secure cross-subdomain cookies need the
    HTTPS server + the `lattice.local.appleby.cloud` hosts entry + mkcert certs.
  - *Live event stream / logs never populate* — the `/ws/admin` WebSocket can't connect: check the
    derived `wss://` URL and the CSP `connect-src`.
  - *API URL change didn't take effect* — `NEXT_PUBLIC_*` is baked at build; rebuild the image.

## Rules & guardrails

- **Never introduce SWR / React Query / tRPC.** Data fetching is `useEffect`+`useState`/`fetchApi`
  or Redux thunks. (Global hard rule.)
- **Never add a component library** (shadcn/Radix/MUI/Headless UI). Build primitives in
  `components/ui/`.
- **Never use CSS modules, CSS-in-JS, or styled-components.** Tailwind v4 + CSS variables only.
- **Never use the Pages Router.** App Router only.
- **Never bypass `fetchApi`.** All API access goes through the one Axios wrapper so refresh, CSRF,
  and 401/403 handling stay centralised. New endpoints get a `req*` service function.
- **Never treat role gating as security.** `isAdmin`/`canEdit` hide UI; the API enforces access.
- **Never hardcode the API URL, a token, or a hostname** — everything comes from `NEXT_PUBLIC_*`.
- **Never commit `.env*` or the `_wildcard.local.appleby.cloud*.pem` cert files** (both git-ignored;
  the certs are local-dev secrets).
- **Never log secrets.** DB credentials, env-var secret values, registry passwords, and tokens flow
  through this app's screens — don't add convenience `console.log`s of response bodies.
- **`server.js` (repo root) is dev-only** — it hard-exits under `NODE_ENV=production`. Production is
  the Next.js standalone server in the Docker image.
- **Don't reorder or drop this file's sections** (global Documentation Standard). One extra focused
  section is allowed where the domain demands it.

## Verification — always before "done"

Run from the repo root; all must be green (global standard for Next.js repos: `next build` + fix TS
errors):

```bash
npx next build     # or: dev build — production build + TypeScript type-check; MUST pass
npm test           # or: dev test — Vitest suite (slices + lib helpers)
dev check          # optional but recommended: eslint + prettier --check + tsc --noEmit
```

- **Fix every TypeScript error** — `strict` is on; the build fails on type errors.
- If you changed a **slice** or a **`lib/` helper**, its sibling `*.test.ts` must still pass (extend
  it if you changed behaviour).
- **Never report work complete on a failing build.**
- CI enforces the first two: `build-and-deploy.yml` has a **`test` job** (`npx tsc --noEmit` +
  `npm test`) that `build-and-push` depends on, so a type error or a failing test blocks the image
  entirely — nothing is published.
- **Commit messages reach the shell.** The `resolve-version` job reads the message to detect
  `[release-*]`. It takes it via a `env: MSG:` binding *on purpose*: interpolated inline as
  `MSG="${{ github.event.head_commit.message }}"`, a message containing a quote or paren is pasted
  in as shell source and the job dies at `resolve-version` with exit 127 — no image, no release, and
  a failure that looks nothing like its cause. Never move that back inline.

## Keeping this file updated

Update this AGENTS.md **in the same change** when you:

- **Add/remove/rename a page** → update the **Page map** and the Sidebar order note.
- **Add/retype a service function** → update the **Service map** (and add the matching `req*`).
- **Change the Redux store shape** (new slice, new state field, new thunk) → update **Redux store
  shape**.
- **Change the auth/refresh/CSRF model, 401/403 handling, or SSO flow** → update **Auth model**.
- **Change env vars, the Dockerfile, CI, or security headers** → update **Operations** (and
  `README.md` if setup/commands changed).
- **Change the local HTTPS dev harness** (`server.js`, ports, cert names, hosts entry) → update
  **The HTTPS dev flow**.
- **Notice `lattice-api` gained routes** this dashboard should expose → either wire them up or record
  the gap here explicitly, so the next agent knows it was a decision, not an oversight — and check
  whether `lattice-mcp` needs the parallel tool.
</content>
