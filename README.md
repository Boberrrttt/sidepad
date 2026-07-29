# SidePad

A calm personal notepad you can install on any device.

Write notes, ask AI about them, and keep everything in sync across phones and computers. Works offline. Updates itself when you ship a new build.

## Why SidePad

- **Yours alone:** each account has its own notes and chats
- **Works offline:** edits land in IndexedDB first, then sync when you reconnect
- **Cross-device:** Turso stores notes and chats so every signed-in device stays aligned
- **Ask beside the note:** Groq answers in a sidebar, with memory per note
- **Installable PWA:** add to home screen; no Electron, no app store wait

## Stack

- Monorepo: `web` (Next.js), `backend` (FastAPI), `packages/shared`
- Username/password auth with signed session cookies
- Turso (libSQL) for server storage and sync
- IndexedDB cache with last-write-wins sync
- Groq for the Ask sidebar
- `@ducanh2912/next-pwa` for the service worker and installables

## Setup

```bash
npm install
pip install -r backend/requirements.txt
```

Copy env into `backend/.env`:

```env
SESSION_SECRET=long-random-string
TURSO_DATABASE_URL=libsql://...
TURSO_AUTH_TOKEN=...
GROQ_API_KEY=...
GROQ_MODEL=llama-3.3-70b-versatile
PORT=3001
```

Copy env into `web/.env.local`:

```env
BACKEND_URL=http://localhost:3001
```

```bash
npm run dev
```

- Web: http://localhost:3000 (proxies `/api/*` to FastAPI)
- Backend: http://localhost:3001

```bash
npm run build
npm start
```
