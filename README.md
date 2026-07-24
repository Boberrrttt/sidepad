# SidePad

Notes that stay with you — Next.js PWA notepad with per-user accounts, offline cache, Turso sync, and Groq Ask.

## Stack

- Next.js (App Router) + TypeScript + Tailwind
- Username/password accounts (each user has their own notes)
- Turso (libSQL) for cross-device sync
- IndexedDB offline cache (last-write-wins, per user)
- Groq for Ask sidebar
- PWA via `@ducanh2912/next-pwa`

## Setup

```bash
npm install
```

Copy env values into `.env.local`:

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

Open `http://localhost:3000`, register or sign in.

## Scripts

- `npm run dev` — local dev
- `npm run build` — production build (+ service worker)
- `npm start` — serve production build

## Notes

- Each account only sees its own notes/chats.
- Edits work offline via IndexedDB; sync when back online.
- Ask needs network (Groq).
