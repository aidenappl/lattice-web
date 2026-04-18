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

| Variable | Required | Description |
|---|---|---|
| `NEXT_PUBLIC_LATTICE_API` | Yes | Lattice API base URL (e.g. `http://localhost:8000`) |

---

## Features

- **Dual authentication** — Local email/password login + Forta OAuth
- **Worker management** — View status, metrics, and manage API tokens
- **Stack management** — Create, configure, and deploy container stacks
- **Deployment tracking** — Live deployment progress, approve/rollback controls
- **Registry management** — Configure Docker registries
- **User management** — Create local users, manage roles
- **Dark theme** — Consistent with the appleby.cloud design system

---

## Quick Start

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Or with HTTPS (requires setup-local first)
dev setup-local
dev dev
```

---

## Pages

| Route | Description |
|---|---|
| `/` | Dashboard with overview statistics |
| `/login` | Dual auth login (local + Forta OAuth) |
| `/workers` | Worker list with status and metrics |
| `/workers/[id]` | Worker detail, tokens, and metrics |
| `/stacks` | Stack list with status overview |
| `/stacks/new` | Create new stack |
| `/stacks/[id]` | Stack detail, containers, and deploy |
| `/deployments` | Deployment history |
| `/deployments/[id]` | Deployment detail with progress |
| `/registries` | Docker registry management |
| `/settings` | User management |
