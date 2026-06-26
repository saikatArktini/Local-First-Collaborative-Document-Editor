# Local-First Collaborative Document Editor

A state-of-the-art, local-first collaborative document editor featuring real-time peer synchronization, conflict resolution via Yjs CRDTs, session authentication, and database-backed document snapshots.

## 🚀 Live Demo

| Service | URL |
|---|---|
| **Frontend (Vercel)** | [https://local-first-collaborative-document.vercel.app](https://local-first-collaborative-document.vercel.app) |
| **WebSocket Server (Render)** | [https://doc-editor-websocket.onrender.com](https://doc-editor-websocket.onrender.com) |
| **Health Check** | [https://doc-editor-websocket.onrender.com/health](https://doc-editor-websocket.onrender.com/health) |

---

## Features

*   **Real-time Collaboration**: Instant synchronization across multiple editors using Yjs CRDTs over WebSockets.
*   **Conflict Resolution**: Robust conflict resolution handles offline-first typing and merges changes deterministically.
*   **User Presence**: Live collaborator presence icons with cursor trackers.
*   **Role-Based Access Control (RBAC)**: Fine-grained permissions matrix for `OWNER`, `EDITOR`, and `VIEWER` roles.
*   **Version History & Snapshots**: View and compare historical snapshots, with one-click restore states.
*   **Audit Logging**: Automatic background logging of user actions (document creation, deletion, role changes, snapshots, and sync events).

---

## Tech Stack

*   **Frontend / APIs**: Next.js 16 (App Router), React 19, Tailwind CSS v4.
*   **Realtime Backend**: Standalone Node.js WebSockets Server (`ws`, `yjs`).
*   **Database**: PostgreSQL with Prisma ORM.
*   **Authentication**: NextAuth.js.

---


## Local Setup & Development

### 1. Prerequisites
Ensure you have Docker and Node.js installed.

### 2. Install Dependencies
```bash
npm install
```

### 3. Spin Up Local Database
```bash
docker-compose up -d
```

### 4. Setup Database Schema and Seed Data
```bash
npx prisma db push
npx prisma db seed
```

### 5. Start the Standalone WebSocket Server
```bash
npm run websocket
```

### 6. Run Next.js Development App
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) to view the editor.

---

## 🧪 Verification & Testing

Verify your codebase components (RBAC permissions, CRDT merge logic, security layers, authentication, and WebSocket server connections) using the master verification suite:

```bash
npm test
```

---

## 🌐 Production Deployment

### 1. PostgreSQL Database
Use a cloud-native database provider like **Neon**. Provide the connection string as `DATABASE_URL` in your environment variables.

### 2. Standalone WebSocket Server (Fly.io)
Deploy the standalone WebSocket process to a persistent VM/container hosting platform:
*   **Build Command**: `npm ci && npx prisma generate`
*   **Start Command**: `npx tsx src/server/websocket.ts`
*   **Environment Variables**: `DATABASE_URL`, `JWT_SECRET`, `WS_PORT`

### 3. Frontend App (Vercel)
Deploy your Next.js project directly to Vercel:
*   **Build Command**: `npx prisma generate && next build`
*   **Environment Variables**:
    *   `DATABASE_URL`: (Your database connection string)
    *   `JWT_SECRET`: (Same secret key used in WebSocket server)
    *   `AUTH_SECRET`: (NextAuth security key)
    *   `NEXT_PUBLIC_WS_URL`: `wss://your-websocket-server.railway.app` (The domain of your WebSocket server from Step 2)

---

## 🔄 CI/CD Pipeline (GitHub Actions)
A pre-configured CI/CD workflow is available in `.github/workflows/deploy.yml` which automates:
1. Environment setup and dependency installation.
2. Generating the Prisma client and applying database migrations.
3. Running lint checks and the master verification suite (`verify_all.ts`).
4. Triggering Vercel production build and deployment.
