import { store } from "./store";
import { fetchNotes } from "./api";
import type { AiThread, Note } from "./api";

const SSE_URL = "http://127.0.0.1:7777/events";

let eventSource: EventSource | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | undefined;

function connect() {
  if (eventSource) return;

  const es = new EventSource(SSE_URL);
  eventSource = es;

  es.addEventListener("thread.created", (e) => {
    try { store.setThread(JSON.parse(e.data) as AiThread); } catch { /* malformed */ }
  });

  es.addEventListener("thread.updated", (e) => {
    try { store.setThread(JSON.parse(e.data) as AiThread); } catch { /* malformed */ }
  });

  es.addEventListener("thread.deleted", (e) => {
    try { store.removeThread((JSON.parse(e.data) as { id: string }).id); } catch { /* malformed */ }
  });

  es.addEventListener("note.updated", (e) => {
    try { store.setNote(JSON.parse(e.data) as Note); } catch { /* malformed */ }
  });

  es.onopen = () => {
    // Re-seed store on (re)connect to catch any events missed during disconnect
    fetchNotes({ status: "active" }).then((list) => store.setNotes(list)).catch(() => {});
  };

  es.onerror = () => {
    es.close();
    eventSource = null;
    reconnectTimer = setTimeout(connect, 2000);
  };
}

export function initSSE() {
  connect();
}

export function stopSSE() {
  clearTimeout(reconnectTimer);
  if (eventSource) {
    eventSource.close();
    eventSource = null;
  }
}
