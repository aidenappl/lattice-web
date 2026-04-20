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
- Redux Toolkit (auth state only)
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
    page.tsx                # Dashboard — topology visualization + stats
    login/page.tsx          # Email/password + Forta OAuth login
    unauthorized/page.tsx   # Grant revocation landing
    workers/
      page.tsx              # Worker list with token management
      [id]/page.tsx         # Worker detail: metrics, tokens, reboot, upgrade, stop/start all
    stacks/
      page.tsx              # Stack list with status + container health counts
      new/page.tsx          # Create new stack form
      [id]/page.tsx         # Stack detail: containers, deploy, compose YAML, env vars
    containers/
      page.tsx              # Global container list
      [id]/page.tsx         # Container detail: logs, lifecycle, health, all actions
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
      logo.tsx              # Lattice logo SVG
      worker-badge.tsx      # Worker status badge
      worker-icon.tsx       # Worker online/offline/maintenance icon
      worker-offline-banner.tsx # Warning banner for offline workers
    ThemeProvider.tsx        # Dark/light/system theme context, stores in cookie + localStorage

  services/
    api.service.ts          # fetchApi<T> wrapper: Axios, withCredentials, 401 auto-refresh, 403 redirect
    auth.service.ts         # reqGetSelf, reqLogin
    admin.service.ts        # reqGetOverview, reqGetUsers, reqCreateUser, reqUpdateUser, reqGetVersions, reqRefreshVersions, reqUpdateAPI, reqUpdateWeb
    workers.service.ts      # reqGetWorkers, reqGetWorker, reqCreateWorker, reqUpdateWorker, reqDeleteWorker, reqGetWorkerTokens, reqCreateWorkerToken, reqDeleteWorkerToken, reqGetWorkerMetrics, reqRebootWorker, reqUpgradeRunner, reqStopAllContainers, reqStartAllContainers
    stacks.service.ts       # reqGetStacks, reqGetStack, reqCreateStack, reqUpdateStack, reqDeleteStack, reqDeployStack, reqGetAllContainers, reqGetContainers, reqCreateContainer, reqUpdateContainer, reqDeleteContainer, reqGetContainerLogs, reqGetLifecycleLogs, req{Start,Stop,Kill,Restart,Pause,Unpause,Remove,Recreate}Container, reqImportCompose, reqUpdateCompose, reqSyncCompose
    deployments.service.ts  # reqGetDeployments, reqGetDeployment, reqGetDeploymentLogs, reqApproveDeployment, reqRollbackDeployment
    registries.service.ts   # reqGetRegistries, reqGetRegistry, reqCreateRegistry, reqUpdateRegistry, reqDeleteRegistry, reqTestRegistry, reqTestRegistryInline, reqListRegistryRepos, reqListRegistryTags

  store/
    index.ts                # Redux store: single auth reducer
    hooks.ts                # useAppDispatch, useAppSelector, useAuth, useAuthStatus, useUser
    StoreProvider.tsx        # Auth init from /auth/self, redirect to /login if unauthenticated
    slices/authSlice.ts     # State: is_logged, is_loading, user

  hooks/
    useVersionCheck.tsx     # Context + hook: polls /admin/versions every 5min, tracks update availability
    useAdminSocket.ts       # Singleton WebSocket to /ws/admin, shared by all subscribers, auto-reconnect
    useWorkerLiveness.ts    # Real-time worker online/offline via WebSocket + 90s heartbeat timeout

  types/
    index.ts                # Re-exports + ApiResponse<T>, ApiSuccess<T>, ApiError
    worker.types.ts         # Worker, WorkerToken, WorkerMetrics
    stack.types.ts          # Stack, Container, Registry, ContainerLog, LifecycleLog
    deployment.types.ts     # Deployment, DeploymentLog
    user.types.ts           # User (auth_type: oauth|local, role: admin|viewer)
    version.types.ts        # VersionInfo, WorkerVersionInfo

  lib/
    utils.ts                # cn(), formatDate(), timeAgo(), isWorkerOnline(), workerStaleReason()
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

## Real-Time Features

- **Admin WebSocket** (`/ws/admin`): container status, deployment progress, worker heartbeats, health status, container logs, worker connect/disconnect, worker action status
- **Version polling**: every 5 minutes via `useVersionCheck`
- **Worker liveness**: `useWorkerLiveness` tracks online/offline with 90s heartbeat timeout, periodic staleness check every 15s

## Topology Dashboard

ReactFlow-based graph on the home page with 4 view modes:
- **System**: single overview node -> workers -> stacks -> containers
- **Workers**: worker nodes -> their stacks -> containers
- **Stacks**: stack nodes -> their containers
- **Containers**: flat container view

Node scale selector (Small 0.85x / Medium 1x / Large 1.2x). Dagre for hierarchical layout. Preserves user drag positions on data refresh.

## Key Patterns

- All API functions prefixed with `req` (e.g. `reqGetWorkers`)
- `fetchApi<T>` handles auth refresh, 403 redirect, timeout (10s default, 120s for updates)
- Destructive actions use `useConfirm` hook for confirmation dialogs
- Theme stored in `forta-appearance` cookie + localStorage, `.dark` class on html
- Log viewer supports stdout/stderr/lifecycle filtering, download as .txt, session break detection
- Settings page combines user management + version checking + update triggers
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
