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

- Next.js App Router, TypeScript, Tailwind
- Username/password auth with signed session cookies
- Turso (libSQL) for server storage and sync
- IndexedDB cache with last-write-wins sync
- Groq for the Ask sidebar
- `@ducanh2912/next-pwa` for the service worker and installables

## Setup

```bash
npm install
```

Copy these into `.env.local`:

```env
SESSION_SECRET=long-random-string
TURSO_DATABASE_URL=libsql://...
TURSO_AUTH_TOKEN=...
GROQ_API_KEY=...
GROQ_MODEL=llama-3.3-70b-versatile
```

```bash
npm run dev
```

Open `http://localhost:3000`, then register or sign in.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Local development |
| `npm run build` | Production build (includes service worker) |
| `npm start` | Serve the production build |

## How sync works

1. You edit a note locally (IndexedDB).
2. Changes queue in an outbox.
3. When online, SidePad flushes the outbox to Turso, then pulls the latest server state.
4. Last write wins if two devices touch the same note.

Ask needs network because it calls Groq. Notes and chats still load from the local cache when offline.
