# Lattice Web

Management dashboard for the Lattice container orchestration platform. Connects to lattice-api via REST and WebSocket for real-time updates.

## Commands

```bash
npm run dev       # Next.js dev server (HTTP, port 3000 — cross-subdomain cookies won't work)
npm run dev:ssl   # HTTPS dev server via custom server.js + mkcert (lattice.local.appleby.cloud:3030)
npm run build     # Production build (standalone output)
npm run test      # Vitest run
npm run lint      # ESLint
```

Dev CLI (`Devfile.yaml`): `dev dev` runs HTTPS mode (`dev:ssl`); `dev dev-http` is plain HTTP.

## Tech Stack

- Next.js 16 (App Router) + React 19 + TypeScript 5
- Redux Toolkit (auth + overview + workers + stacks + containers state)
- Axios (API client with auto-refresh)
- Tailwind CSS v4 with CSS custom properties (dark-default, light/system theme)
- Custom SVG topology board + Dagre (`dagre`) for hierarchical layout (NOT ReactFlow)
- Recharts (metric charts) + xterm.js (container terminal) + js-yaml (compose editor)
- Font Awesome free-solid packages (icons; not the FA Kit)
- React Hot Toast (notifications)

## Project Structure

```
src/
  app/
    layout.tsx              # Root layout: Redux + Theme + DashboardLayout
    page.tsx                # Dashboard — topology, KPIs, event stream, fleet resources
    login/page.tsx          # Email/password + SSO login
    unauthorized/page.tsx   # Grant revocation landing (error_code 4003)
    pending/page.tsx        # Account-awaiting-approval landing (role "pending" / 4004)
    profile/page.tsx        # Self profile: name, password, avatar
    workers/
      page.tsx              # Worker list with token management
      [id]/page.tsx         # Worker detail: orchestrates sub-components
      [id]/metrics/page.tsx # Full metrics view with charts (recharts)
    stacks/
      page.tsx              # Stack list with status + container health counts
      new/page.tsx          # Create new stack form
      [id]/page.tsx         # Stack detail: orchestrates sub-components
    containers/
      page.tsx              # Global container list
      [id]/page.tsx         # Container detail: orchestrates sub-components
    deployments/
      page.tsx              # Deployment history list
      [id]/page.tsx         # Deployment detail: timeline, logs, approve/rollback
    databases/page.tsx      # Managed DB instance list
    databases/new/page.tsx  # Provision a DB instance
    databases/[id]/page.tsx # DB detail: credentials, snapshots, start/stop/restart/remove, restore
    registries/page.tsx     # Registry CRUD, test connectivity, browse repos/tags
    networks/page.tsx       # Compose networks / port mapping across workers
    env-vars/page.tsx       # Global (cross-stack) env variables, incl. secrets
    templates/page.tsx      # Stack templates (create from stack/config, delete)
    backup-destinations/page.tsx # Backup destination CRUD + test
    audit-log/page.tsx      # Audit trail viewer
    authentication/page.tsx # SSO config + SMTP config + test
    notifications/page.tsx  # Notification prefs + webhooks
    ai/page.tsx             # API-token management (tokens for lattice-mcp / AI agents)
    settings/page.tsx       # User management + version check + API/web/runner updates
    api/
      health/route.ts       # GET /api/health — Docker healthcheck
      version/route.ts      # GET /api/version — app version info

  components/
    dashboard/              # Dashboard page sub-components
      DashboardKPIRow.tsx   # Fleet health, containers, stacks, CPU/memory KPI cards
      EventStream.tsx       # Live WebSocket event stream panel
      DeploymentTimelineMini.tsx # Recent deployments sidebar
      FleetResourcePanel.tsx # Fleet resource charts with metric tabs
      RecentActivityPanel.tsx # Recent audit activity panel
      FailingStacksBanner.tsx # Warning banner for failed stacks
    workers/                # Worker detail page sub-components
      WorkerMetricsPanel.tsx # Live metrics with arc gauges, sparklines, stats
      WorkerInfoPanel.tsx   # Worker info definition list
      WorkerStacksPanel.tsx # Stacks & containers tree view
      WorkerInfraPanel.tsx  # Volumes/networks tabbed panel
      WorkerTokensPanel.tsx # Token management panel
      WorkerEditForm.tsx    # Edit worker form
    stacks/                 # Stack detail page sub-components
      StackContainersList.tsx # Container cards with action menus
      StackComposeTab.tsx   # Compose YAML editor tab
      StackEnvTab.tsx       # Environment variables tab
      StackLogsTab.tsx      # Container logs tab with selector
      StackDeployments.tsx  # Deployment history sidebar + logs
      StackEditForm.tsx     # Edit stack modal form
      CreateContainerForm.tsx # New container form
    containers/             # Container detail page sub-components
      ContainerActionBar.tsx # Action buttons (start, stop, kill, restart, etc.)
      ContainerEditForm.tsx # Edit container config form (14 fields)
      ContainerDetailsTab.tsx # Details tab (ports, volumes, env, resources)
      ContainerHealthTab.tsx # Health check tab
      ContainerInfoPanels.tsx # Container info + health summary panels
    layout/
      DashboardLayout.tsx   # Main wrapper: navbar, update banner, confirm provider, toaster
      Navbar.tsx            # Navigation, user menu, theme toggle, mobile hamburger
      UpdateBanner.tsx      # Sticky banner when API/web/runner updates available
      RunnerUpgradePanel.tsx # Per-worker upgrade UI with WebSocket status tracking
    topology/
      TopologyBoard.tsx     # Custom SVG topology graph: 4 view modes, node scale selector, drag positions
      useTopologyData.ts    # Hook: fetches workers/stacks/containers, builds nodes/edges (Dagre layout)
    ui/
      button.tsx            # Variants: primary, secondary, ghost, warning, destructive
      input.tsx             # Text input
      badge.tsx             # Status/category badges + StatusBadge
      alert.tsx             # Alert boxes
      confirm-modal.tsx     # Confirmation dialog (via React context + useConfirm hook)
      loading.tsx           # Spinner + PageLoader
      log-viewer.tsx        # Container log display: filtering, download, session breaks, auto-scroll
      code-editor.tsx       # YAML/code editor
      env-var-editor.tsx    # Key-value environment variable editor
      ResizableSplit.tsx    # Resizable split layout with drag handle
      sparkline.tsx         # SVG sparkline + meter components
      logo.tsx              # Lattice logo SVG
      terminal.tsx          # Interactive terminal (xterm.js)
      worker-badge.tsx      # Worker status badge
      worker-icon.tsx       # Worker online/offline/maintenance icon
      worker-offline-banner.tsx # Warning banner for offline workers
    ThemeProvider.tsx        # Dark/light/system theme context, stores in cookie + localStorage

  services/
    api.service.ts          # fetchApi<T> wrapper: Axios, withCredentials, GET-retry, CSRF header, 401 auto-refresh (reactive + proactive), 403 redirect
    auth.service.ts         # reqGetSelf, reqLogin, reqLogout, reqUpdateSelf
    admin.service.ts        # overview/fleet-metrics/anomalies/audit-log, user CRUD, versions + reqUpdateAPI/reqUpdateWeb, webhook CRUD+test, global env-var CRUD, SMTP get/update/test, notification prefs, SSO get/update, reqSearch, API-token CRUD
    workers.service.ts      # worker CRUD, token CRUD, reqGetWorkerMetrics, reqRebootWorker, reqUpgradeRunner, reqStopAllContainers, reqStartAllContainers, reqGetWorkerContainerStats, reqForceRemoveContainer
    stacks.service.ts       # stack CRUD, reqDeployStack, reqGetAllContainers/reqGetContainer/reqGetContainers, container CRUD, reqGetContainerLogs/reqGetLifecycleLogs/reqGetContainerMetrics, req{Start,Stop,Kill,Restart,Pause,Unpause,Remove,Recreate}Container, reqImportCompose/reqUpdateCompose/reqSyncCompose, stack start/stop/restart, reqExportStack/reqImportStackExport, deploy-token CRUD
    deployments.service.ts  # reqGetDeployments, reqGetDeployment, reqGetDeploymentLogs, reqApproveDeployment, reqRollbackDeployment
    databases.service.ts    # instance CRUD, reqDatabaseAction(start|stop|restart|remove), reqGetDatabaseCredentials, snapshot list/create/restore/delete
    registries.service.ts   # reqGetRegistries, reqGetRegistry, reqCreateRegistry, reqUpdateRegistry, reqDeleteRegistry, reqTestRegistry, reqTestRegistryInline, reqListRegistryRepos, reqListRegistryTags
    templates.service.ts    # reqGetTemplates, reqCreateTemplateFromStack, reqCreateTemplate, reqDeleteTemplate
    backup-destinations.service.ts # destination CRUD + reqTestBackupDestination
    volumes.service.ts      # reqListVolumes, reqCreateVolume, reqDeleteVolume (per worker)
    networks.service.ts     # reqListAllNetworks, per-worker list/create/delete, reqDeleteNetworkByID

  store/
    index.ts                # Redux store: auth + overview + workers + stacks + containers reducers
    hooks.ts                # useAppDispatch, useAppSelector, useAuth, useAuthStatus, useUser
    StoreProvider.tsx        # Auth init from /auth/self, redirect to /login if unauthenticated
    slices/
      authSlice.ts          # State: is_logged, is_loading, user
      overviewSlice.ts      # State: overview data, fleet metrics history, audit log
      workersSlice.ts       # State: worker list, current worker, metrics, tokens
      stacksSlice.ts        # State: stack list, current stack (+ memoized name-map selector)
      containersSlice.ts    # State: container list, stack containers

  hooks/
    useVersionCheck.tsx     # Context + hook: polls /admin/versions every 5min, tracks update availability
    useAdminSocket.ts       # Singleton WebSocket to /ws/admin, shared by all subscribers, auto-reconnect
    useWorkerLiveness.ts    # Real-time worker online/offline via WebSocket + 90s heartbeat timeout
    useNotifications.ts     # Toast notification integration
    useDesktopNotifications.ts # Browser desktop notifications
    useIdleTimeout.ts       # Auto-logout after inactivity
    useContainerActions.ts  # Container lifecycle action handlers + refresh
    useDeploymentProgress.ts # Per-deployment progress from WS events
    usePoll.ts              # Generic interval polling hook with auto-cleanup
    useContainerLogs.ts     # Container log state: fetching, filtering, WS streaming, downloading

  types/
    index.ts                # Re-exports all types + ApiResponse<T>, ApiSuccess<T>, ApiError
    worker.types.ts         # Worker, WorkerToken, WorkerMetrics
    stack.types.ts          # Stack, Container, ComposeNetwork, Registry, ContainerLog, LifecycleLog
    deployment.types.ts     # Deployment, DeploymentLog
    user.types.ts           # User (auth_type: oauth|local|sso, role: admin|editor|viewer|pending)
    version.types.ts        # VersionInfo, WorkerVersionInfo
    volume.types.ts         # DockerVolume, DockerNetwork
    admin.types.ts          # OverviewData, WorkerMetricsSummary, AuditLogEntry, FleetMetricsPoint
    network.types.ts        # PortEntry, WorkerGroup
    dashboard.types.ts      # WorkerLatestMetrics, LiveEvent, MetricKey, HealthCheckConfig

  lib/
    utils.ts                # cn(), formatDate(), timeAgo(), isWorkerOnline(), workerStaleReason(),
                            # formatDisk(), formatBytes(), formatUptime(), parseJSON(), parsePortMappings(),
                            # parseEnvVars(), parseVolumes(), parseHealthCheck(), formatTestCommand(),
                            # prettyField(), barColor(), sparkColor(), isAdmin(), canEdit()
    version.ts              # APP_VERSION from env or "dev"
```

## Environment Variables

- `NEXT_PUBLIC_LATTICE_API` (required) — API base URL
- `NEXT_PUBLIC_APP_VERSION` (optional) — displayed version string

## Auth Flow

1. `StoreProvider` calls `/auth/self` on mount
2. If authenticated: sets `is_logged=true`, stores user in Redux
3. If 401: redirects to `/login`
4. If 403 error_code 4003: redirects to `/unauthorized`; error_code 4004 (or role "pending"): redirects to `/pending`
5. Login form POSTs to `/auth/login` (email/password); SSO via public `/auth/sso/config` → `login_url`
6. 401 responses auto-trigger `/auth/refresh` with deduplication via singleton promise (reactive); proactive activity-aware refresh ~60s before expiry
7. POST/PUT/DELETE send the `lattice-csrf` cookie back as `X-CSRF-Token` (double-submit)
8. Logout links to `${API_URL}/auth/logout`

## Redux State Management

The Redux store manages:
- **auth**: Login status, current user (from authSlice)
- **overview**: Dashboard overview data, fleet metrics history, audit log (from overviewSlice)
- **workers**: Worker list, current worker detail, metrics snapshots, tokens (from workersSlice)
- **stacks**: Stack list, current stack, stack name lookup map (from stacksSlice)
- **containers**: Global container list, per-stack containers (from containersSlice)

Each slice uses `createAsyncThunk` for API calls and exposes selectors for common access patterns. The dashboard page dispatches to Redux and uses selectors; detail pages use a mix of Redux and local state for page-specific concerns.

## Real-Time Features

- **Admin WebSocket** (`/ws/admin`): container status, deployment progress, worker heartbeats, health status, container logs, worker connect/disconnect, worker action status
- **Version polling**: every 5 minutes via `useVersionCheck`
- **Worker liveness**: `useWorkerLiveness` tracks online/offline with 90s heartbeat timeout, periodic staleness check every 15s
- **Polling**: `usePoll` hook provides generic interval polling with auto-cleanup

## Topology Dashboard

Custom SVG graph on the home page with 4 view modes:
- **System**: single overview node -> workers -> stacks -> containers
- **Workers**: worker nodes -> their stacks -> containers
- **Stacks**: stack nodes -> their containers
- **Containers**: flat container view

Node scale selector. Dagre (`dagre`) computes hierarchical layout; nodes/edges render as hand-rolled SVG (no ReactFlow). Preserves user drag positions on data refresh.

## Key Patterns

- All API functions prefixed with `req` (e.g. `reqGetWorkers`)
- All types centralized in `types/` — no inline type definitions in pages or services
- `fetchApi<T>` handles auth refresh, 403 redirect, timeout (10s default, 120s for updates)
- Shared utility functions in `lib/utils.ts` — format helpers, JSON parsers, metric color helpers
- Custom hooks extract common patterns: `usePoll` (intervals), `useContainerLogs` (log state)
- Detail pages are orchestrators: they handle data loading, WS events, and delegate rendering to sub-components
- Destructive actions use `useConfirm` hook for confirmation dialogs
- Theme stored in `lattice-appearance` cookie + localStorage, `.dark` class on html
- Log viewer supports stdout/stderr/lifecycle filtering, download as .txt, session break detection
- Container detail page has full action bar: start, stop, kill, restart, pause, unpause, remove, recreate

## Build

```dockerfile
# Multi-stage: node:20-alpine, output: standalone
# Build args: NEXT_PUBLIC_LATTICE_API, NEXT_PUBLIC_APP_VERSION
# Runs as nextjs user (UID 1001), port 3000
# Healthcheck: wget /api/health
```

Deploy target: CI (`.github/workflows/build-and-deploy.yml`) builds and pushes the image to
`registry.appleby.cloud/lattice-web:latest` (Keyring-injected creds), run via Lattice/Portainer —
NOT Vercel. See `AGENTS.md` for the full operations detail.

## Styling

Tailwind v4 with CSS custom properties for theming. Dark-default (dark tokens on `:root`); light via `.dark`-absence with `@custom-variant dark (&:where(.dark, .dark *))` and `@theme inline` token mapping. Colors defined as CSS variables in `globals.css` (background, surface, border, text, accent, destructive, success, warning). Fonts: Inter Tight + JetBrains Mono (via `next/font/google`).

Responsive breakpoints:
- Default: 6-column KPI row, desktop sidebar
- ≤1400px: 5-column KPI row (version column hidden), reduced sparklines
- ≤1024px: 3-column KPI row, collapsed sidebar
- ≤768px: 2-column KPI row, mobile layout
- ≤480px: Smaller typography
