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
browser (login form, cookie-based session, silent SSO, proactive + reactive token refresh, CSRF
header), the component library (built from scratch), the real-time admin WebSocket consumer, and
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
| Telemetry | **`@aidenappleby/monitor-js`** | `^1.2.0` | browser + server errors, failed API calls and navigation → Monitor (see *Operations*). 1.2.0 is the first version that strips query strings from reported URLs |
| Fonts | **Inter Tight** + **JetBrains Mono** | via `next/font/google` | CSS vars `--font-inter-tight`, `--font-jetbrains-mono` |
| Tests | **Vitest** + Testing Library | `vitest ^4.1.5`, `@testing-library/react ^16.3.2`, `jsdom ^29.0.2` | jsdom env, `src/test/setup.ts` |
| Lint | **ESLint** + `eslint-config-next` | `eslint ^9`, config `16.1.6` | `npm run lint` (`eslint`) with the flat config `eslint.config.mjs` — see *Verification* for the React Compiler rules |

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
    api/monitor/route.ts    # POST /api/monitor → same-origin relay for browser telemetry; adds the Monitor key server-side
    error.tsx               # route error boundary → reports client.error.boundary, offers "Try again"
    global-error.tsx        # root-layout failure → reports client.error.global; renders its own <html> (no app CSS)
    layout.tsx              # Root layout: fonts, metadata, StoreProvider→ThemeProvider→DashboardLayout, SSR dark class from cookie
    globals.css             # Tailwind v4 import + CSS-variable theme tokens (dark default, light override)
    page.tsx                # "/" dashboard (topology, KPIs, event stream, fleet resources)
    <feature>/page.tsx      # one page per feature, dynamic segments as [id]
  components/
    ui/                     # from-scratch primitives — KEBAB-CASE files (button.tsx, badge.tsx, input.tsx, …)
    layout/                 # Sidebar, Topbar, DashboardLayout, CommandPalette, UpdateBanner, RunnerUpgradePanel, Navbar — PascalCase
    dashboard/              # dashboard widgets (DashboardKPIRow, EventStream, FleetResourcePanel, …) — PascalCase
    stacks/ workers/ containers/  # feature-scoped component groups — PascalCase; stacks/ has a barrel index.ts
    automations/            # AutomationFormModal, WebhookTokenModal, AutomationRunsTable
    topology/               # TopologyBoard.tsx + useTopologyData.ts (dagre layout)
    ThemeProvider.tsx       # light/dark/system context, cookie+localStorage persistence, cross-subdomain cookie domain
  services/                 # one {entity}.service.ts per domain; all call fetchApi<T> (see Service map)
    api.service.ts          # THE axios client + fetchApi<T> + 401/403 handling + proactive/reactive refresh + CSRF
    monitor.service.ts      # browser Monitor (posts to /api/monitor; adds route + release to every event), attachMonitor(axios) — lattice-web's own API-failure reporter, reportError/reportCaught/reportWarn/reportFetchFailure
  instrumentation-client.ts # creates the browser Monitor before hydration; client.page.load / client.navigation events
  instrumentation.ts        # onRequestError → server.request.error (Node runtime only)
  store/                    # Redux Toolkit
    index.ts                # makeStore(), RootState, AppDispatch
    hooks.ts                # useAppDispatch/useAppSelector + useAuth/useAuthStatus/useUser
    StoreProvider.tsx       # singleton store + AppInitializer (boots session via reqGetSelf, gates render)
    slices/                 # authSlice, overviewSlice, workersSlice, stacksSlice, containersSlice (+ *.test.ts)
  hooks/                    # cross-cutting hooks (usePoll, useAdminSocket, useContainerLogs, useSelection + useBulkAction for list bulk actions, …)
  lib/                      # utils.ts (cn, isAdmin, canEdit, formatBytes, dropStaleSamples, …), version.ts, deployment-progress.ts, automations.ts, ws-reconnect.ts, sso.ts (silent SSO, return_to, sign-out), bulk.ts (runBulk/summarizeBulk), dotenv.ts (.env import/export), csv.ts (toCSV/downloadText) (+ *.test.ts), monitor-server.ts (server-side Monitor)
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
| `/` | `page.tsx` | Dashboard: topology board (nodes are keyboard-operable: Tab to focus, Enter opens, Space selects), KPI row w/ sparklines, live event stream, fleet resource charts, anomaly/failing-stack banners |
| `/login` | `login/page.tsx` | Dual auth: local email/password (`reqLogin`) **+** SSO button (fetches `/auth/sso/config`, links to `login_url`), silent SSO first (`lib/sso.ts`). Redirects to `return_to` if already authed |
| `/pending` | `pending/page.tsx` | Landing for users with `role: "pending"` (account awaiting approval) |
| `/unauthorized` | `unauthorized/page.tsx` | Landing when a grant is revoked / `error_code 4003` |
| `/workers` | `workers/page.tsx` | Worker fleet list with status, live CPU / memory / disk meters (seeded from `reqGetOverview().worker_metrics`, then updated from `worker_heartbeat` payloads), search, clickable rows; bulk upgrade runner / start / stop containers / reboot (admin) / delete |
| `/workers/[id]` | `workers/[id]/page.tsx` | Worker detail: info, infra, stacks, tokens (multi-select delete), container stats (stale samples from removed containers dropped via `dropStaleSamples`), edit/reboot/upgrade |
| `/workers/[id]/metrics` | `workers/[id]/metrics/page.tsx` | Full metric charts (CPU/mem/disk/net) for one worker. The worker and its metrics load independently: a slow or failed `/metrics` call shows an inline error with Retry instead of a page-wide spinner |
| `/stacks` | `stacks/page.tsx` | Stack cards with search + status/worker filters; select cards for bulk deploy / restart / start / stop / move to worker / export / delete |
| `/stacks/new` | `stacks/new/page.tsx` | Create stack (or import compose) |
| `/stacks/[id]` | `stacks/[id]/page.tsx` | Stack detail tabs: containers, compose YAML editor, env (lock toggle per key sets `secret_env_keys` — the API masks those values as `***` for non-admins and keeps the stored value when `***` is saved back; only admins can unmark. Declared secrets and keys that look sensitive are masked in the editor until revealed), logs, deployments, deploy tokens (multi-select delete), dependency graph. Export / Save as template (modal) / Delete live in the header's `⋯` menu |
| `/containers` | `containers/page.tsx` | Global container list + lifecycle actions; bulk start / stop / restart / recreate / delete (removes from the stack config too) |
| `/containers/[id]` | `containers/[id]/page.tsx` | Container detail: details/health tabs, logs, terminal, action bar, edit form. `ulimits` (lattice-api ≥ v1.4.7) shows in Container Info via `formatUlimits` and is edited as compose-shaped JSON; the form sends it only when changed, `""` to clear. Every text field in `ContainerEditForm` goes through `changed()` the same way: `null` means "unchanged" to the API, so the old `value \|\| null` made emptying a field a silent no-op. Command/Entrypoint are shown and edited as shell strings via `formatArgv` (quotes arguments so lattice-api ≥ v1.4.9 parses back the same argv); a JSON array is accepted too. The action bar separates **Remove from Docker** (`reqRemoveContainer`, the container stays in the stack and the next deploy recreates it) from **Delete** (`reqDeleteContainer`, removes it from the stack's config; the compose file is untouched, so a compose sync can add it back) |
| `/deployments` | `deployments/page.tsx` | Deployment history. Stack/status filters go to the API (`reqGetDeployments(params)`), paged 50 at a time with "Load older"; duration column; bulk approve for `pending` |
| `/deployments/[id]` | `deployments/[id]/page.tsx` | Deployment detail + live logs, approve/rollback. Live progress only while active; finished deployments show their duration |
| `/databases` | `databases/page.tsx` | Managed database instance list with search; bulk start / stop / restart / delete |
| `/databases/new` | `databases/new/page.tsx` | Provision a database instance (live host-port availability against the chosen worker) |
| `/databases/[id]` | `databases/[id]/page.tsx` | DB instance detail: overview/snapshots/logs/history/settings tabs, failure banner, SQL console, credentials, start/stop/restart/remove-container, delete (Settings danger zone), restore |
| `/networks` | `networks/page.tsx` | Compose networks / port-mapping overview across workers; "Remove all" for orphaned networks. Global env vars (decrypted for admins) are fetched only when the Ports tab opens and a mapping references `${VAR}`; secret values are never substituted into the table |
| `/registries` | `registries/page.tsx` | Docker registry config, test, repo/tag browsing; bulk test / delete |
| `/env-vars` | `env-vars/page.tsx` | Global (cross-stack) environment variables, incl. secrets. Search, rename (create + delete: the API has no key update), `.env` import (`lib/dotenv.ts`) and export, bulk mark secret / mark plain / export / delete |
| `/templates` | `templates/page.tsx` | Stack templates: view, use (asks stack name + worker), edit (saved as a new template and the old one deleted — the API has no template update), new from JSON, import a template or stack export, bulk download / delete |
| `/automations` | `automations/page.tsx` | Automation list: trigger, step count, run-as user (flagged when deactivated), last run, enable switch, run now, edit, delete, create (form modal → show-once webhook URL); bulk enable / disable / run / delete |
| `/automations/[id]` | `automations/[id]/page.tsx` | Automation detail: trigger, run-as identity, ordered steps, polled run history with per-step results; run now / enable / disable / edit / rotate token (admin, webhook only) / delete |
| `/backup-destinations` | `backup-destinations/page.tsx` | Backup destination CRUD + test (worker picker is a modal), location (locality) shown and editable; bulk delete. Partial config edits rely on lattice-api merging `config` (see that repo's AGENTS.md) |
| `/audit-log` | `audit-log/page.tsx` | Administrative audit trail. Search, user / action / resource / date-range filters all go to the API (`reqGetAuditLog(AuditLogQuery)`, lattice-api ≥ v1.8.0), 100 per page with "Load older", CSV export of everything matching (paged 500 at a time, capped at 10 000 rows, `lib/csv.ts` escapes formulas), resource ids link to their detail page |
| `/authentication` | `authentication/page.tsx` | Tabs: SSO config (provider presets — the saved provider is detected from its authorize URL, OAuth2/OIDC endpoints, claim mapping) and **Users** (create / role / activate / approve / delete; bulk approve / role / activate / deactivate / delete — never offered on your own account) |
| `/notifications` | `notifications/page.tsx` | Email (SMTP) and desktop notification preferences |
| `/ai` | `ai/page.tsx` | **API-token management** (the tokens that power `lattice-mcp` / AI agents) — create/list/rotate (create same-name replacement, then revoke)/delete; bulk revoke |
| `/settings` | `settings/page.tsx` | Version checks + service updates + outgoing webhooks (CRUD, test, enable/disable; bulk test / enable / disable / delete) |
| `/profile` | `profile/page.tsx` | Self profile: name, password, avatar (`reqUpdateSelf`) |

Sidebar order (from `components/layout/Sidebar.tsx`): Dashboard, Deployments, Audit Log, Workers,
Stacks, Containers, Databases, Networks, Registries, Env Variables, Templates, Automations, Backups,
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
| `deployments.service.ts` | Deployments | `reqGetDeployments(params?)` (`stack_id`, `status`, `limit`, `offset` — filter server-side), `reqGetDeployment`/`reqGetDeploymentLogs`, `reqApproveDeployment`, `reqRollbackDeployment` |
| `databases.service.ts` | Managed DBs | instance CRUD, `reqDatabaseAction("start"\|"stop"\|"restart"\|"remove")` (container-only — `remove` keeps the data volume), `reqDeleteDatabaseInstance(id, force?)` (destroys container **and** volume; `force` only for an offline worker), `reqGetDatabaseConnection`, `reqRevealDatabaseCredentials` (audited — prefer over the deprecated `reqGetDatabaseCredentials`), `reqGetDatabaseEvents`/`reqGetDatabaseLogs`/`reqGetDatabaseLifecycleLogs`, `reqOpenDatabaseConsole`, `reqGetWorkerPortAvailability`/`reqCheckWorkerPort`, snapshot list/create/restore/delete |
| `registries.service.ts` | Registries | registry CRUD, `reqTestRegistry`/`reqTestRegistryInline`, `reqListRegistryRepos`/`reqListRegistryTags` |
| `networks.service.ts` | Networks | `reqListAllNetworks`, per-worker list/create/delete, `reqDeleteNetworkByID` |
| `volumes.service.ts` | Volumes | per-worker `reqListVolumes`/`reqCreateVolume`/`reqDeleteVolume` |
| `templates.service.ts` | Templates | `reqGetTemplates`, `reqCreateTemplateFromStack`, `reqCreateTemplate`, `reqDeleteTemplate` |
| `automations.service.ts` | Automations | `reqGetAutomations`/`reqGetAutomation`, `reqCreateAutomation` & `reqRotateAutomationToken` (→ `AutomationWithToken`, token once), `reqUpdateAutomation` (send `trigger`/`actions` only when changed), `reqDeleteAutomation`, `reqEnableAutomation`/`reqDisableAutomation`, `reqRunAutomation` (60 s timeout — a run has a 50 s budget), `reqGetAutomationRuns` |
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

Build-time config is `NEXT_PUBLIC_*`. The only server-side, runtime variables are the `MONITOR_*`
ones below, read by `/api/monitor` and `instrumentation.ts` — the Monitor key is the one server
secret, and it must never become `NEXT_PUBLIC_*`. Set them in `.env.local` (git-ignored). **Never create/modify `.env*` files yourself** — tell the user the
values to set (global guardrail).

| Variable | Required | Purpose |
|----------|----------|---------|
| `NEXT_PUBLIC_LATTICE_API` | **Yes** | `lattice-api` base URL (e.g. `http://localhost:8000` locally). Used for every Axios request, derives the WebSocket URL (`https→wss`), and tightens the CSP `connect-src` in `next.config.ts` |
| `NEXT_PUBLIC_APP_VERSION` | No | Version string shown in-app, served by `/api/version`, and sent as `release` on every Monitor event; defaults to `"dev"` (`lib/version.ts`). Injected as a Docker build-arg in CI |
| `MONITOR_INGEST_URL` | No | Monitor ingest endpoint (appleby zone). **Runtime, server-only.** Unset = `/api/monitor` accepts and discards, and server errors are not reported |
| `MONITOR_API_KEY` | No | Ingest-scoped key minted on the appleby zone. Runtime, server-only |
| `MONITOR_ENV` | No | `env` of server-side events (default `production`) |

The `NEXT_PUBLIC_*` values are baked at **build time**, so changing the API URL requires a rebuild;
the `MONITOR_*` values are read at runtime from the container's environment.

### Testing

Vitest with jsdom (`vitest.config.ts`, setup `src/test/setup.ts`, `@` alias mirrored). Tests are
colocated `*.test.ts(x)` files. Current coverage is the **pure logic and reducers**, not full page
rendering: `lib/utils.test.ts`, `lib/deployment-progress.test.ts`, `lib/automations.test.ts`,
`lib/ws-reconnect.test.ts`, `lib/bulk.test.ts`, `lib/dotenv.test.ts`, `lib/csv.test.ts`, `services/monitor.service.test.ts`, `services/api.service.test.ts`, and a `*.test.ts` beside each
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
  check on `/login`, `/unauthorized`, `/pending`** to avoid redirect loops. **Only 401/403 sends the
  user to `/login`.** A 5xx, a request with no response (`fetchApi` reports those as 500 with
  `error_code: -1`, shown as "No response"), any other 4xx, or a 2xx with no user shows a
  "Can't reach the Lattice API" screen with the message, status and request id, plus **Retry**
  (re-runs the bootstrap) and **Sign in again**. An outage used to bounce users to a sign-in form
  that couldn't work.
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
- **Lists: selection and bulk actions.** Every list of things you can act on has a checkbox column
  and a floating `BulkActionBar` (`components/ui/bulk-action-bar.tsx`). The pieces:
  `useSelection(visibleIds)` (shift-click ranges; the selection is always intersected with what is
  visible, so a bulk action never touches a filtered-out row), `Checkbox` (`components/ui/checkbox.tsx`
  — a real input, `label` required), and `useBulkAction().run({...})`, which confirms (naming the
  items), runs one request per item through `runBulk` (`lib/bulk.ts`, 4 at a time, never stops on a
  failure) and toasts a summary that names what failed. The API has no batch endpoints; don't add
  per-page loops — use `run`. Hide the bar and checkboxes for roles that can't act (`canEdit` /
  `isAdmin`). Row actions stay; bulk is in addition, not instead.
- **Tables:** use `.data-table` inside `.panel`. Such panels scroll sideways (`.panel:has(> .data-table)`)
  because column breakpoints are viewport-based and the sidebar eats ~260px — before that, the
  Actions column was clipped off-screen at 1280px. Rows that don't navigate get `!cursor-default`.
- **Failed loads render `LoadError` with the reason.** List pages keep `loadError` as
  `string | null` and set it with `loadErrorReason(res)` (`components/ui/load-error.tsx`): the API's
  message and status, or "No response from lattice-api" for a request that never got one
  (`error_code: -1`). Don't hard-code "Could not reach lattice-api" — the API often did answer.
  While the error shows, headers say the list is unavailable instead of counting an empty array.
- **Phone text floor.** Below 640px, `globals.css` lifts `text-[9px]`/`[10px]`/`[11px]` (and the
  event stream, stack chips, tab counts) to 12px, and uppercase labels (`.kpi-label`, `.badge`,
  table headers) to 11px with tighter tracking so they wrap instead of clipping. Desktop keeps the
  dense sizes. Inline `style={{ fontSize }}` bypasses this, so prefer the classes.
- **Clickable controls are `<button>`s.** The topology view switcher used `<div onClick>`; it is now a
  `role="group"` of `aria-pressed` buttons (`.segmented-option` resets button chrome). Use the
  same for any new segmented control.
- **Colours come from tokens, never literals.** Use `bg-primary` / `text-background` / `text-pending` /
  `bg-pending/10` etc., not `bg-white`, `text-black` or `#hex` — the light theme is real, and the
  primary `Button` was white-on-near-white there until it moved to tokens (as were the code
  editor's caret and the worker-offline banner).
- **Heavy client-only modules load on demand.** The xterm terminal is imported through
  `components/ui/terminal-lazy.tsx` (`next/dynamic`, `ssr: false`) so it isn't in the container and
  database detail bundles until a terminal opens. Do the same for anything similar.
- **Selects:** `.form-select` has a fixed height and no vertical padding so `!h-8` filter selects
  stay vertically centred. Size inputs in a filter bar with `!w-*` — `.form-input`'s `width: 100%`
  is unlayered CSS and beats plain Tailwind width utilities.

## Domain & architecture

### Request flow

Browser action → `req*` service fn → `fetchApi<T>` → `axiosApi` (baseURL
`NEXT_PUBLIC_LATTICE_API`, cookies attached) → **`lattice-api`** `/admin/*`, `/auth/*`, `/ws/*`
routes → response unwrapped to `ApiResponse<T>` → Redux slice or local component state → render.
Every call carries an `X-Request-ID` (a UUID, set by a request interceptor in `api.service.ts`)
that `lattice-api` adopts as its own request id — see *Operations → Telemetry → Monitor*.
There is **no BFF**; the browser talks to `lattice-api` directly (CORS + credentialed cookies).

### Auth model (cookie session + CSRF + dual login)

Lattice runs its **own** cookie-based session auth (this is *not* raw Forta-cookie SSO in the
browser — `lattice-api` owns the identity layer, optionally federating to an external SSO/OAuth2
provider it configures under `/auth/sso/*`).

- **Two login paths** on `/login`:
  1. **Local** — email/password → `reqLogin` → `POST /auth/login`; on success the API sets the
     session cookie and the page redirects to `return_to` (same-origin path, via `loginReturnTo()`)
     or `/`. (It used to always go to `/`.) The form is `noValidate`: empty or malformed fields are
     reported in the page's own `ErrorAlert` (`role="alert"`) rather than the browser's unstyled
     bubbles — no structural change to the shared layout.
  2. **SSO** — the page fetches the **public** `/auth/sso/config` and renders one button per
     entry in the shared `providers` array, linking to `login_url?return_to=…` (validated to
     start with `/` to prevent open-redirect / `javascript:` injection). Error codes returned on
     the redirect are mapped by `SSO_ERRORS` in `lib/sso.ts`; `login_required` is not an error.
  3. **Silent SSO** — before rendering the form, with exactly one provider, the page navigates to
     `<api><login_url>?prompt=none&return_to=…` (`startSilentSSO`). A user still signed in at the
     identity provider comes straight back signed in and never sees the form; otherwise
     `lattice-api` redirects to `/login?error=login_required` and the form renders. Skipped when
     the page has `?error=`, `?signed_out=1` or `?local=1`, and at most once a minute
     (`lattice-sso-silent-at` in `sessionStorage`) so a session that will not stick cannot loop.

     > ⚠️ **The response is accepted on `providers` OR `enabled`, and that matters.** `enabled`,
     > `button_label` and `login_url` are **legacy** fields `lattice-api` still emits beside the
     > shared contract. Gating the fetch solely on `enabled` — which this page did — is a latent
     > outage: the day the API drops it, the payload is discarded, `setSsoConfig` never fires,
     > and every SSO button vanishes from the login page while `providers` sits unread in the
     > response. `monitor-web` shipped that exact bug and locked SSO-only users out on
     > 2026-08-07. The provider derivation below already prefers `providers`; keep the gate
     > permissive so it can reach it.
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
- **SSO users have no Lattice JWTs.** `lattice-api` holds their session server-side
  (`lattice_session` cookie) and refreshes it against the identity provider, so it lives as long as
  the provider session. Proactive refresh therefore starts only for `auth_type !== "sso"`, and
  `/auth/refresh` answers 401 for SSO users.
- **CSRF:** for `POST`/`PUT`/`DELETE`, `executeRequest` reads the `lattice-csrf` cookie and sends
  it back as the **`X-CSRF-Token`** header (double-submit pattern).
- **401 handling (reactive):** on a 401, `handle401Response` calls a **singleton
  `refreshPromise`** → `POST /auth/refresh` (deduped so concurrent 401s fire one refresh), then
  retries the original request with the new bearer token. If refresh fails, it redirects to
  `/login?return_to=<path>` (`redirectToLogin`), where silent SSO usually signs the user straight
  back in. A 401 from a credential endpoint (`CREDENTIAL_ENDPOINTS`, i.e. `/auth/login`) means
  "wrong password" and is returned as-is — no refresh attempt.
- **Proactive refresh (activity-aware):** `startProactiveRefresh` (kicked off after a successful
  `reqGetSelf`) schedules a refresh **~60 s before token expiry**, but only if the user is
  **active** (mouse/key/scroll/touch within 5 min). Idle users defer refresh until their next
  interaction; returning to a hidden tab triggers an immediate expiry check
  (`visibilitychange`). `stopProactiveRefresh` tears the listeners down on unmount.
- **403 handling:** `error_code 4003` → redirect `/unauthorized` (grant revoked); `error_code
  4004` → redirect `/pending` (account not yet approved).
- **No idle timeout.** A 30-minute inactivity logout (`useIdleTimeout`) was removed: it ended
  every Lattice session the user had (logout stamps `tokens_revoked_at`), and session length
  belongs to the identity provider.
- **Logout** follows `data.redirect_url` from `POST /auth/logout` (`/login?signed_out=1` — sign-out ends only this app's session; Forta and other apps stay signed in) or lands on `/login?signed_out=1` (`finishSignOut` in `lib/sso.ts`).

**Provider presets (`/authentication`).** `PROVIDER_PRESETS` fills the OAuth2/OIDC endpoints for
Forta, Google, GitHub, Microsoft and Custom. **`issuer_url` and `logout_url` are applied
UNCONDITIONALLY** when a preset is chosen, while the other fields use the guarded `if (p.x)` form:
carrying one provider's issuer over to another would point the OIDC adapter at the wrong provider
and fail every id_token. There is no introspection field any more — revocation is enforced by the
API's server-side token refresh and back-channel logout. On load, the saved config's
`authorize_url` is matched against the presets to highlight the right card (it used to always
highlight Custom OAuth2).

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
deployments, env-vars, webhooks, SSO/SMTP, API tokens, automations) fetch **directly via services
into local component state** — Redux is reserved for the shared, frequently-re-read fleet data.

### Automation screens

An automation is one trigger (webhook or UTC cron) plus an ordered list of steps
(`redeploy_container`, named by **stack + container name** because compose edits re-create container
ids; `http_request`). The rules live in `lattice-api` (*Domain & architecture → Automations*); these
screens present them. `types/automation.types.ts` mirrors `structs/Automation.struct.go` — keep the
status unions in step, and remember a new status token needs an entry in `components/ui/badge.tsx`.
This change added `in_progress`, `succeeded`, `enabled` and `disabled` there. `in_progress` is
deliberately not `running`, which is green because it means a healthy container.

- **The run-as identity is visible, and saving can change it.** Every run is authorised against the
  automation's run-as user at run time; creating it, editing its trigger/steps, or enabling it makes
  *you* that user. So `AutomationFormModal` sends `trigger`/`actions` **only when they changed**
  (`canonicalJSON` in `lib/automations.ts`) — a rename must not silently re-bind the identity.
  Both pages flag a deactivated or missing run-as user, because every firing will be refused.
- **Admin-only pieces are hidden, not just refused.** A webhook trigger and `http_request` steps
  require the admin role, so non-admins aren't offered them. For an automation that already has
  either, a non-admin's form locks the definition and allows a rename only. The API returns 403 regardless.
  Non-admins receive `http_request` header values and bodies as `[redacted]`.
- **The webhook URL exists in the browser exactly once** — in the create/rotate response —
  and `WebhookTokenModal` shows it with a `curl --fail-with-body` recipe and the status-code contract
  (`200` succeeded/disabled · `409` skipped · `424` failed). `withoutToken` strips it before the
  automation goes into state. The detail page never has it: it renders the path with the token masked.
- **Run history is polled every 10 s** on the detail page, since runs arrive from CI and schedules,
  not from this UI. `AutomationRunsTable` expands a run into per-step results, including skipped steps
  and the reason each never ran. "Run now" is synchronous and toasts the outcome.
- **The audit log marks automated actions** with a `via automation · run #N` badge from
  `AuditLogEntry.automation_run_id`. Without it, an automated redeploy reads exactly like the run-as
  user clicking the button.

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

- **CI runners:** every GitHub Actions job runs on `[self-hosted, lattice-worker]` — a
  single-use runner started by `aidenappl/gh-runner-broker` on the CI host (`aplb-actions`,
  10.15.10.78), with the toolchain and shared Go/npm caches provisioned by
  `TeamTrailblaze/runner-setup`. Images build through the host's `lattice-builder` BuildKit
  (`builder: lattice-builder`), never `docker/setup-buildx-action`, which races other runners
  on the shared Docker daemon; its local layer cache replaces the gha cache. `setup-go` runs
  with `cache: false`. Jobs stuck in "Queued" mean the broker or the host is down — check the
  `gh-runner-broker` service in Monitor (zone `appleby`).
  **Fallback:** Lattice must build even when that host is down, since Lattice is how you fix it.
  Set the repo variable `LATTICE_CI_RUNS_ON` to `["ubuntu-latest"]` and every job runs
  GitHub-hosted, building with `docker/setup-buildx-action`; delete the variable to switch back.

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
  that route static and dependency-free. It must target `127.0.0.1`, not `localhost`: the server binds
  `0.0.0.0` (IPv4) and busybox `wget` tries `::1` first, so a `localhost` check is refused and the
  container shows `unhealthy` forever (it did, through v1.8.3).
- **Security headers** are set centrally in `next.config.ts` `headers()`: `X-Frame-Options: DENY`,
  `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`,
  `X-XSS-Protection`, `Permissions-Policy`, HSTS, and a **CSP** that tightens `connect-src` to the
  API origin + its WebSocket origin (falls back to `wss: ws: https:` if `NEXT_PUBLIC_LATTICE_API`
  is unset at build), allows FontAwesome kit hosts, and sets `frame-ancestors 'none'`. `'unsafe-eval'`
  is added to `script-src` **only in dev** (Next HMR needs it).
- **Telemetry → Monitor** (service `lattice-web`, appleby zone). The browser posts to this app's own
  `/api/monitor`, which checks the request is same-origin, caps it (512 KiB, 500 events), forces
  `service` to `lattice-web`, adds `MONITOR_API_KEY` and forwards, passing Monitor's status back so
  the SDK's retry and bad-line isolation work unchanged. Same-origin also means the CSP needs no
  new `connect-src`. Events:

  | Event | Level | Source |
  |-------|-------|--------|
  | `client.error.uncaught` / `client.error.unhandled_rejection` | error | Any uncaught error or rejection (SDK window handlers, installed before hydration) |
  | `client.error.boundary` / `client.error.global` | error | `app/error.tsx` / `app/global-error.tsx`, with the error `digest` shown to the user |
  | `api.request.server_error` / `client_error` / `network_error` | error / warn / error | Every failed `lattice-api` call via `attachMonitor` (monitor.service.ts — not the SDK's `attachAxiosMonitor`): `method`, `url` (path, no query), `status_code`, `error`, `error_message`, numeric `error_code` (axios's string code on `network_error`), `attempts`, `duration_ms`, `request_id` (the API's `X-Request-ID` echo, else the one sent) and `trace_id` (the API's `X-Trace-ID`; absent on `network_error`). Never a body. A request interceptor in `api.service.ts` sends `X-Request-ID` (a UUID) on every call and keeps it on `config.meta`, so even a `network_error` (no response) carries the id `lattice-api` logs on `http.request.end`. A GET that `fetchApi` retries reports once, on the final failure — the reporter skips failures flagged as retryable on `config.meta` |
  | `server.request.error` | error | `onRequestError` — rendering, route handlers, server actions (Node runtime) |
  | `client.page.load` / `client.navigation` | info | Every load and client-side navigation, path only |
  | `auth.refresh.failed` | warn (401/403, 429, other 4xx) / error (5xx, no response) | `doRefresh` in `api.service.ts`, once per refresh after its retry: `status_code`, `error`, `error_code` (the API's, or axios's code on a network error), `error_message`, `attempts`, and the refresh call's own `X-Request-ID` |
  | `session.bootstrap.failed` | warn (401) / error | `StoreProvider` when `reqGetSelf` fails (`status_code`, `error_code`, `request_id`), returns no user (`error: empty_self_response`), or throws (via `reportError`); before redirecting to `/login` (401/403) or showing the API-unreachable screen (everything else) |
  | `ws.reconnect` / `ws.unavailable` / `ws.reconnected` | info / warn then error / info | `useAdminSocket` via `lib/ws-reconnect.ts`: `ws.reconnect` for failures 1-4 (`attempt`, `close_code`, `was_clean`, `had_error`, `down_ms`), one `ws.unavailable` warn at 5 consecutive failures and one error at 20, then nothing until it reconnects; `ws.reconnected` (`failures`, `down_ms`) resets the count |
  | `ws.message_invalid` | warn, ≤1/min | An admin-socket frame that isn't JSON: `length` and the parse error, never the payload (`suppressed` = drops since the last one) |
  | `worker.stale` | warn, ≤1 per worker per 5 min | `useWorkerLiveness`: no heartbeat for 90 s with the admin socket up for longer than that (`worker_id`, `last_seen_ms_ago`). Not raised while the socket is down — that is `ws.*` — nor for 90 s after the tab resumes from a freeze/sleep (a staleness tick arriving >45 s late), when every worker would otherwise look silent for the length of the nap |
  | `fetch.failed` | error (no response, 5xx) / warn | The raw `fetch()` calls that bypass `fetchApi` on purpose (`reportFetchFailure`): the login page's `/auth/self` check (not for 401/403) and `/auth/sso/config` (not for 404) with an `X-Request-ID`; the restart polls in settings and `UpdateBanner`, only when they give up after 60 attempts. `feature`, `method`, `url` (no query), `status_code`, `error_message`, `attempts` |
  | `client.error.caught` | error | `reportCaught(feature, err, data)` — an exception a handler caught and recovered from (`feature` like `databases.load`). Only non-API exceptions: `fetchApi` never throws, and `!res.success` is already reported above |
  | `stack.container_action.unknown` | warn | The stack page was asked for a container action it has no request for (`action`, `stack_id`, `container_id`) |
  | `stack.env_vars_invalid`, `runner_upgrade.pending_action_invalid` | warn, ≤1 per record per 5 min | Stored JSON that fails to parse during render |

  **Every browser event** also carries `route` (the pathname as a template: `/stacks/42` →
  `/stacks/[id]`; `normaliseRoute` in monitor.service.ts) and `release` (`NEXT_PUBLIC_APP_VERSION`:
  the release tag or short SHA CI builds with; `"dev"` locally). `LatticeMonitor` merges both into
  every `emit`, the SDK's own uncaught-error events included; an event's own `data` wins.
  `server.request.error` carries `release` and Next's `route`.

  Events carry `user_id` once `StoreProvider`'s bootstrap `reqGetSelf` succeeds (`monitor.setUser`,
  re-set after profile updates); every logout path (menu, pending page) calls
  `monitor.clearUser()`. The `X-Request-ID` header needs `lattice-api`'s CORS `AllowedHeaders` to
  list it, or every preflight fails — so **deploy `lattice-api` before `lattice-web`** whenever the
  header set changes (the enrichment release included). `lattice-api` adopts the id when it is
  valid, logs it on `http.request.end`, and carries it (with a `trace_id`) on the commands it sends
  a runner, so one `request_id` search in Monitor covers the browser, the API and the runner.

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
  through this app's screens — don't add convenience `console.log`s of response bodies, and never
  pass a response body or form value to `reportError` / `monitor.*` (it goes to Monitor).
- **Never put a Monitor key in a `NEXT_PUBLIC_*` variable.** Browser telemetry goes through
  `/api/monitor`, which adds the key server-side. Report caught errors with `reportError` from
  `monitor.service.ts`; failed API calls are already reported by the axios hook.
- **`server.js` (repo root) is dev-only** — it hard-exits under `NODE_ENV=production`. Production is
  the Next.js standalone server in the Docker image.
- **Don't reorder or drop this file's sections** (global Documentation Standard). One extra focused
  section is allowed where the domain demands it.

## Verification — always before "done"

Run from the repo root; all must be green (global standard for Next.js repos: `next build` + fix TS
errors):

```bash
npm run lint       # eslint with eslint.config.mjs — MUST exit 0 (warnings allowed, errors not)
npx next build     # or: dev build — production build + TypeScript type-check; MUST pass
npm test           # or: dev test — Vitest suite (slices + lib helpers)
dev check          # optional but recommended: eslint + prettier --check + tsc --noEmit
```

- **Lint could not run at all until `eslint.config.mjs` was added.** ESLint 9 reads only a flat
  config, and the repo shipped none, so `npm run lint` exited 2 before reading a file. The config is
  `eslint-config-next`'s own flat preset (core-web-vitals + typescript). It downgrades four React
  Compiler rules to **warnings**: `react-hooks/set-state-in-effect`, `refs`, `purity` and
  `immutability`. The first flags the `useEffect` + `useState` + `req*` fetching pattern this repo
  mandates, and together they were 52 of 54 errors, all in files that predate the config. Promote
  them back to errors only together with refactoring those effects, or with adopting the React Compiler.

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
