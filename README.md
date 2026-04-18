# lattice-web

Management frontend for the Lattice orchestrator platform. Provides a dashboard for managing workers, stacks, containers, deployments, and registries.

---

## Tech Stack

- **Next.js 16** with App Router
- **React 19** + **TypeScript**
- **Redux Toolkit** — state management
- **Axios** — API client
- **Tailwind CSS v4** — styling

---

## Environment Variables

| Variable                  | Required | Description                                         |
| ------------------------- | -------- | --------------------------------------------------- |
| `NEXT_PUBLIC_LATTICE_API` | Yes      | Lattice API base URL (e.g. `http://localhost:8000`) |

---

## Features

- **Dual authentication** — Local email/password login + Forta OAuth
- **Worker management** — View status, metrics, runner version, and manage API tokens
- **Stack management** — Create, configure, and deploy container stacks
- **Deployment tracking** — Live deployment progress, approve/rollback controls
- **Registry management** — Configure and test Docker registries with repository/tag browsing
- **User management** — Create local users, manage roles
- **Audit log** — Track administrative actions
- **Version display** — Dashboard shows web and API versions; worker detail shows runner version
- **Dark theme** — Consistent with the appleby.cloud design system

---

## Quick Start

```bash
# Install dependencies
npm install

# Set environment
echo 'NEXT_PUBLIC_LATTICE_API=http://localhost:8000' > .env.local

# Start development server
npm run dev
```

---

## Pages

| Route               | Description                                         |
| ------------------- | --------------------------------------------------- |
| `/`                 | Dashboard with overview statistics and version info |
| `/login`            | Dual auth login (local + Forta OAuth)               |
| `/workers`          | Worker list with status and metrics                 |
| `/workers/[id]`     | Worker detail, tokens, metrics, and runner version  |
| `/stacks`           | Stack list with status overview                     |
| `/stacks/new`       | Create new stack                                    |
| `/stacks/[id]`      | Stack detail, containers, and deploy                |
| `/deployments`      | Deployment history                                  |
| `/deployments/[id]` | Deployment detail with progress                     |
| `/registries`       | Docker registry management                          |
| `/settings`         | User management                                     |

---

## Version Check

The web app exposes its version via an API route:

```
GET /api/version
{"version":"v0.0.5"}
```

The version is hardcoded in the source. The dashboard page also displays both the web version and the API version (fetched from the backend's `GET /version` endpoint).
