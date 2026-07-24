# SidePad

Notes that stay with you.

SidePad is a calm desktop notepad for quick writing, markdown, and asking AI about the note you’re on — without leaving the pad.

![SidePad](build/icon.png)

## What it is

A local Electron app for everyday notes. Files live on your machine as markdown. An optional Ask sidebar talks to Groq so you can question a note or have the model rewrite it.

## Features

- Local markdown notes with autosave
- Search across titles and bodies
- Markdown toolbar and live preview
- Ask sidebar with per-note chat history (stored locally)
- AI can edit the current note when you ask
- Open on startup (on by default; toggle in the sidebar)
- Collapsible Ask panel

## Stack

- Electron
- Plain HTML / CSS / JS
- Groq for chat and note edits
- `marked` for markdown preview

## Setup

```bash
npm install
```

Create a `.env` in the project root:

```env
GROQ_API_KEY=your_key_here
GROQ_MODEL=llama-3.3-70b-versatile
```

## Run

```bash
npm start
```

## Build (Windows)

```bash
npm run dist
```

Output: `dist/win-unpacked/sidepad.exe`

The build packs `.env` so the packaged app can reach Groq. Keep that key private if you share the build.

## Layout

```
src/         main process, notes, chat, AI
renderer/    UI
build/       app icon
```

## License

Private.
