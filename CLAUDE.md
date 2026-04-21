# Lattice Web

Management dashboard for the Lattice container orchestration platform. Connects to lattice-api via REST and WebSocket for real-time updates.

## Commands

```bash
npm run dev       # Next.js dev server (HTTPS via custom server.js + mkcert)
npm run dev-http  # Next.js dev server (HTTP, port 3000)
npm run build     # Production build (standalone output)
npm run lint      # ESLint
```

Dev CLI (`Devfile.yaml`): `dev` runs HTTPS mode by default.

## Tech Stack

- Next.js 16 (App Router) + React 19 + TypeScript 5
- Redux Toolkit (auth + overview + workers + stacks + containers state)
- Axios (API client with auto-refresh)
- Tailwind CSS v4 with CSS custom properties (dark/light/system theme)
- ReactFlow 12 (@xyflow/react) + Dagre (topology visualization)
- Font Awesome (icons via FA Kit)
- React Hot Toast (notifications)

## Project Structure

```
src/
  app/
    layout.tsx              # Root layout: Redux + Theme + DashboardLayout
    page.tsx                # Dashboard — topology, KPIs, event stream, fleet resources
    login/page.tsx          # Email/password + SSO login
    unauthorized/page.tsx   # Grant revocation landing
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
    registries/page.tsx     # Registry CRUD, test connectivity, browse repos/tags
    networks/page.tsx       # Port mapping viewer (reads from container port configs)
    audit-log/page.tsx      # Audit trail viewer
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
      TopologyBoard.tsx     # ReactFlow graph with 4 view modes + node scale selector
      useTopologyData.ts    # Hook: fetches workers/stacks/containers, builds nodes/edges
      ViewModeSelector.tsx  # System/Worker/Stack/Container radio buttons
      layout.ts             # Dagre layout calculation with node dimension scaling
      types.ts              # TypeScript types for topology nodes/edges
      nodes/                # SystemNode, WorkerNode, StackNode, ContainerNode
      edges/DataFlowEdge.tsx # Animated connection edges
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
    api.service.ts          # fetchApi<T> wrapper: Axios, withCredentials, 401 auto-refresh, 403 redirect
    auth.service.ts         # reqGetSelf, reqLogin, reqLogout
    admin.service.ts        # reqGetOverview, reqGetFleetMetrics, reqGetAuditLog, reqGetUsers, reqCreateUser, reqUpdateUser, reqDeleteUser, reqGetVersions, reqRefreshVersions, reqUpdateAPI, reqUpdateWeb
    workers.service.ts      # reqGetWorkers, reqGetWorker, reqCreateWorker, reqUpdateWorker, reqDeleteWorker, reqGetWorkerTokens, reqCreateWorkerToken, reqDeleteWorkerToken, reqGetWorkerMetrics, reqRebootWorker, reqUpgradeRunner, reqStopAllContainers, reqStartAllContainers
    stacks.service.ts       # reqGetStacks, reqGetStack, reqCreateStack, reqUpdateStack, reqDeleteStack, reqDeployStack, reqGetAllContainers, reqGetContainers, reqCreateContainer, reqUpdateContainer, reqDeleteContainer, reqGetContainerLogs, reqGetLifecycleLogs, req{Start,Stop,Kill,Restart,Pause,Unpause,Remove,Recreate}Container, reqImportCompose, reqUpdateCompose, reqSyncCompose
    deployments.service.ts  # reqGetDeployments, reqGetDeployment, reqGetDeploymentLogs, reqApproveDeployment, reqRollbackDeployment
    registries.service.ts   # reqGetRegistries, reqGetRegistry, reqCreateRegistry, reqUpdateRegistry, reqDeleteRegistry, reqTestRegistry, reqTestRegistryInline, reqListRegistryRepos, reqListRegistryTags
    volumes.service.ts      # reqListVolumes, reqCreateVolume, reqDeleteVolume
    networks.service.ts     # reqListNetworks, reqCreateNetwork, reqDeleteNetwork

  store/
    index.ts                # Redux store: auth + overview + workers + stacks + containers reducers
    hooks.ts                # useAppDispatch, useAppSelector, useAuth, useAuthStatus, useUser
    StoreProvider.tsx        # Auth init from /auth/self, redirect to /login if unauthenticated
    slices/
      authSlice.ts          # State: is_logged, is_loading, user
      overviewSlice.ts      # State: overview data, fleet metrics history, audit log
      workersSlice.ts       # State: worker list, current worker, metrics, tokens
      stacksSlice.ts        # State: stack list, current stack, stack name map
      containersSlice.ts    # State: container list, stack containers

  hooks/
    useVersionCheck.tsx     # Context + hook: polls /admin/versions every 5min, tracks update availability
    useAdminSocket.ts       # Singleton WebSocket to /ws/admin, shared by all subscribers, auto-reconnect
    useWorkerLiveness.ts    # Real-time worker online/offline via WebSocket + 90s heartbeat timeout
    useNotifications.ts     # Toast notification integration
    usePoll.ts              # Generic interval polling hook with auto-cleanup
    useContainerLogs.ts     # Container log state: fetching, filtering, WS streaming, downloading

  types/
    index.ts                # Re-exports all types + ApiResponse<T>, ApiSuccess<T>, ApiError
    worker.types.ts         # Worker, WorkerToken, WorkerMetrics
    stack.types.ts          # Stack, Container, ComposeNetwork, Registry, ContainerLog, LifecycleLog
    deployment.types.ts     # Deployment, DeploymentLog
    user.types.ts           # User (auth_type: oauth|local, role: admin|editor|viewer) — SSO users identified by email
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
4. If 403 with error_code 4003: redirects to `/unauthorized`
5. Login form POSTs to `/auth/login` with email/password
6. 401 responses auto-trigger `/auth/refresh` with deduplication via singleton promise
7. Logout links to `${API_URL}/auth/logout`

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

ReactFlow-based graph on the home page with 4 view modes:
- **System**: single overview node -> workers -> stacks -> containers
- **Workers**: worker nodes -> their stacks -> containers
- **Stacks**: stack nodes -> their containers
- **Containers**: flat container view

Node scale selector (Small 0.85x / Medium 1x / Large 1.2x). Dagre for hierarchical layout. Preserves user drag positions on data refresh.

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
# Healthcheck: curl /api/health
```

## Styling

Tailwind v4 with CSS custom properties for theming. Dark and light mode supported via `.dark` class with `@custom-variant`. Colors defined as CSS variables in `globals.css` (background, surface, border, text, accent, destructive, success, warning). Font: Geist Sans + Geist Mono.

Responsive breakpoints:
- Default: 6-column KPI row, desktop sidebar
- ≤1400px: 5-column KPI row (version column hidden), reduced sparklines
- ≤1024px: 3-column KPI row, collapsed sidebar
- ≤768px: 2-column KPI row, mobile layout
- ≤480px: Smaller typography
