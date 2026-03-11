# Dwell

A note-taking app. Tauri + React frontend, Python daemon backend.

## Running

```
./run.sh
```

Starts the Python daemon (port 7777) and Vite dev server.

## Architecture

- `frontend/` — React 19, Vite, TipTap editor, Tailwind CSS v4
- `daemon/` — FastAPI, file-backed store (`~/.adhdeez/`), AI streaming
- Notes stored as markdown files with YAML frontmatter

### Global State

Frontend uses a global store (`store.ts`) backed by `useSyncExternalStore` with `Map<id, entity>` for notes and threads. SSE connection (`sse.ts`) pushes real-time updates from the daemon. AI streaming is server-owned — the daemon runs LLM calls as background tasks and broadcasts token updates via SSE.

### AI Threads

`Cmd+L` in the editor triggers an AI thread. The daemon creates a thread, spawns an async task to stream from the LLM, and pushes updates via SSE. Threads survive navigation — trigger AI on a note, leave, come back, and the result is there.

## Known Issues

- **PATCH endpoint doesn't broadcast SSE** — accepting/dismissing a thread doesn't push an SSE event. Works fine single-window (optimistic removal), but multiple windows won't stay in sync.
- **Accept/dismiss not recoverable on API failure** — thread is removed from the store immediately. If the PATCH fails (daemon down), the thread is gone from the UI with no rollback.
- **Note body stored as HTML** — TipTap serializes to HTML, but files are `.md`. Markdown storage migration is planned.

## AI Config

`~/.adhdeez/ai.json` — set `endpoint`, `api_key`, `model`.
