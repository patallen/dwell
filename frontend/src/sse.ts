import { store, useFocusStore } from "./store";
import { fetchNotes } from "./api";
import type { AiThread, Note, FocusState } from "./api";

const SSE_URL = "http://127.0.0.1:7777/events";

let eventSource: EventSource | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | undefined;

function parseSSEPayload<T>(data: string): T | null {
  try {
    return JSON.parse(data) as T;
  } catch (err) {
    console.error("Failed to parse SSE payload:", err, data);
    return null;
  }
}

function connect() {
  if (eventSource) return;

  const es = new EventSource(SSE_URL);
  eventSource = es;

  es.addEventListener("thread.created", (e) => {
    const data = parseSSEPayload<AiThread>(e.data);
    if (data) store.setThread(data);
  });

  es.addEventListener("thread.updated", (e) => {
    const data = parseSSEPayload<AiThread>(e.data);
    if (data) store.setThread(data);
  });

  es.addEventListener("thread.deleted", (e) => {
    const data = parseSSEPayload<{ id: string }>(e.data);
    if (data) store.removeThread(data.id);
  });

  es.addEventListener("note.created", (e) => {
    const data = parseSSEPayload<Note>(e.data);
    if (data) store.setNote(data);
  });

  es.addEventListener("note.updated", (e) => {
    const data = parseSSEPayload<Note>(e.data);
    if (data) store.setNote(data);
  });

  es.addEventListener("note.deleted", (e) => {
    const data = parseSSEPayload<{ id: string }>(e.data);
    if (data) store.removeNote(data.id);
  });

  es.addEventListener("task.created", (e) => {
    // Tasks are currently not in the entity store but affect focus
    // Backend broadcasts focus.updated alongside task events
  });

  es.addEventListener("task.updated", (e) => {
    // Tasks are currently not in the entity store but affect focus
  });

  es.addEventListener("task.deleted", (e) => {
    // Tasks are currently not in the entity store but affect focus
  });

  es.addEventListener("focus.updated", (e) => {
    const focus = parseSSEPayload<FocusState>(e.data);
    if (focus) useFocusStore.getState().setFocus(focus);
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
