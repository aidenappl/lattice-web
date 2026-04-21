# lattice-web

Management frontend for the Lattice orchestrator platform. Provides a real-time dashboard for managing workers, stacks, containers, deployments, and registries.

---

## Tech Stack

- **Next.js 16** with App Router
- **React 19** + **TypeScript 5**
- **Redux Toolkit** — state management (auth, overview, workers, stacks, containers)
- **Axios** — API client with automatic auth refresh
- **Tailwind CSS v4** — styling with CSS custom properties
- **ReactFlow 12** — topology visualization
- **WebSocket** — real-time updates via admin socket

---

## Environment Variables

| Variable                    | Required | Description                                         |
| --------------------------- | -------- | --------------------------------------------------- |
| `NEXT_PUBLIC_LATTICE_API`   | Yes      | Lattice API base URL (e.g. `http://localhost:8000`) |
| `NEXT_PUBLIC_APP_VERSION`   | No       | Displayed version string                            |

---

## Features

- **Real-time dashboard** — Topology graph, fleet KPIs with sparklines, live event stream, fleet resource charts
- **Dual authentication** — Local email/password login + SSO (OAuth2)
- **Worker management** — Live metrics (CPU, memory, disk, network), volumes, networks, tokens, upgrade/reboot
- **Stack management** — Create, configure, deploy, compose YAML editor, environment variables
- **Container management** — Full lifecycle (start, stop, kill, restart, pause, recreate, remove), live logs, health checks, terminal
- **Deployment tracking** — Live deployment progress, approve/rollback controls
- **Registry management** — Configure and test Docker registries with repository/tag browsing
- **User management** — Create local users, manage roles (admin/editor/viewer)
- **Audit log** — Track administrative actions with filtering
- **Network view** — Port mapping overview across all workers
- **Dark/light theme** — System-aware with manual toggle

---

## Quick Start

```bash
# Install dependencies
npm install

# Set environment
echo 'NEXT_PUBLIC_LATTICE_API=http://localhost:8000' > .env.local

# Start development server (HTTPS)
npm run dev

# Or start with HTTP
npm run dev-http
```

---

## Pages

| Route                   | Description                                              |
| ----------------------- | -------------------------------------------------------- |
| `/`                     | Dashboard: topology, KPIs, event stream, fleet resources |
| `/login`                | Dual auth login (local + SSO)                            |
| `/workers`              | Worker list with status and metrics                      |
| `/workers/[id]`         | Worker detail, tokens, metrics, volumes, networks        |
| `/workers/[id]/metrics` | Full metrics view with charts                            |
| `/stacks`               | Stack list with status overview                          |
| `/stacks/new`           | Create new stack                                         |
| `/stacks/[id]`          | Stack detail, containers, compose, env, logs             |
| `/containers`           | Global container list with actions                       |
| `/containers/[id]`      | Container detail, logs, health, terminal, actions        |
| `/deployments`          | Deployment history with filters                          |
| `/deployments/[id]`     | Deployment detail with live logs                         |
| `/registries`           | Docker registry management                               |
| `/networks`             | Port mapping overview across workers                     |
| `/audit-log`            | Audit trail viewer with filters                          |
| `/settings`             | User management + version checks + updates               |

---

## Architecture

### State Management

Redux Toolkit manages global state across 5 slices:
- **auth** — Login status, current user
- **overview** — Dashboard data, fleet metrics, audit log
- **workers** — Worker list, current worker, metrics, tokens
- **stacks** — Stack list, current stack
- **containers** — Global container list, per-stack containers

### Custom Hooks

- `usePoll` — Generic interval polling with auto-cleanup
- `useContainerLogs` — Log fetching, filtering, WebSocket streaming, downloading
- `useAdminSocket` — Singleton WebSocket connection with subscriber pattern
- `useWorkerLiveness` — Real-time worker online/offline detection
- `useVersionCheck` — Version polling with update detection

### Component Architecture

Detail pages (workers, stacks, containers) follow an orchestrator pattern:
- The page handles data loading, WebSocket events, and state coordination
- Sub-components in `components/{entity}/` handle rendering
- Shared UI components in `components/ui/`

---

## Version Check

The web app exposes its version via an API route:

```
GET /api/version
{"version":"v1.0.17"}
```

The dashboard displays both the web version and the API version (fetched from the backend).
