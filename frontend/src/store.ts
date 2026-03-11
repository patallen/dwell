import { useSyncExternalStore, useCallback, useRef } from "react";
import type { Note, AiThread } from "./api";

// --- Store internals ---

const notes = new Map<string, Note>();
const threads = new Map<string, AiThread>();
const listeners = new Set<() => void>();

function emit() {
  for (const fn of listeners) fn();
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

// --- Mutators ---

export const store = {
  setNote(note: Note) {
    notes.set(note.id, note);
    emit();
  },

  removeNote(id: string) {
    notes.delete(id);
    emit();
  },

  setNotes(list: Note[]) {
    notes.clear();
    for (const n of list) notes.set(n.id, n);
    emit();
  },

  setThread(thread: AiThread) {
    threads.set(thread.id, thread);
    emit();
  },

  setThreadIfNewer(thread: AiThread) {
    const existing = threads.get(thread.id);
    if (!existing || thread.updated_at >= existing.updated_at) {
      threads.set(thread.id, thread);
      emit();
    }
  },

  removeThread(id: string) {
    threads.delete(id);
    emit();
  },

};

// --- Selectors / hooks ---

export function useNote(id: string): Note | undefined {
  const snap = useCallback(() => notes.get(id), [id]);
  const prev = useRef<Note | undefined>(undefined);

  return useSyncExternalStore(subscribe, () => {
    const next = snap();
    if (next === prev.current) return prev.current;
    prev.current = next;
    return next;
  });
}

export function useNotes(): Note[] {
  const prev = useRef<Note[]>([]);
  const prevKey = useRef("");

  return useSyncExternalStore(subscribe, () => {
    // Build a cache key from ids+updated_at to avoid re-sorting on unrelated changes
    let key = "";
    for (const [id, n] of notes) key += id + n.updated_at;
    if (key === prevKey.current) return prev.current;
    prevKey.current = key;

    const sorted = Array.from(notes.values()).sort(
      (a, b) => b.updated_at.localeCompare(a.updated_at),
    );
    prev.current = sorted;
    return sorted;
  });
}

export function useThread(id: string): AiThread | undefined {
  const prev = useRef<AiThread | undefined>(undefined);

  return useSyncExternalStore(subscribe, () => {
    const next = threads.get(id);
    if (next === prev.current) return prev.current;
    prev.current = next;
    return next;
  });
}

export function useThreads(noteId: string): AiThread[] {
  const prev = useRef<AiThread[]>([]);
  const prevKey = useRef("");

  return useSyncExternalStore(subscribe, () => {
    let key = "";
    for (const [id, t] of threads) {
      if (t.note_id === noteId && t.status !== "accepted" && t.status !== "dismissed") {
        key += id + t.status + t.updated_at;
      }
    }
    if (key === prevKey.current) return prev.current;
    prevKey.current = key;

    const filtered: AiThread[] = [];
    for (const t of threads.values()) {
      if (t.note_id === noteId && t.status !== "accepted" && t.status !== "dismissed") {
        filtered.push(t);
      }
    }
    prev.current = filtered;
    return filtered;
  });
}

export function useActiveThreadCount(): number {
  const prev = useRef(0);

  return useSyncExternalStore(subscribe, () => {
    let count = 0;
    for (const t of threads.values()) {
      if (t.status === "streaming") count++;
    }
    if (count === prev.current) return prev.current;
    prev.current = count;
    return count;
  });
}
