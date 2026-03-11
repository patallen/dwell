import { useSyncExternalStore, useCallback, useRef } from "react";
import { create } from "zustand";
import type { Note, AiThread, FocusState, EnergyLevel, PendingAction } from "./api";

// --- Focus Store (Zustand) ---

export const COLD_START_HOURS = 4;
export const LAST_SEEN_KEY = "dwell:lastSeen";

function isColdStart(): boolean {
  try {
    const raw = localStorage.getItem(LAST_SEEN_KEY);
    if (!raw) return true;
    const elapsed = (Date.now() - Number(raw)) / 3600000;
    return elapsed >= COLD_START_HOURS;
  } catch {
    return true;
  }
}

interface FocusStoreState {
  showLanding: boolean;
  energy: EnergyLevel | null;
  focus: FocusState | null;
  showWhereWasI: boolean;
  pendingAction: PendingAction | null;

  setFocus: (focus: FocusState | null) => void;
  setEnergy: (energy: EnergyLevel | null) => void;
  setShowLanding: (show: boolean) => void;
  setShowWhereWasI: (show: boolean) => void;
  setPendingAction: (action: PendingAction | null) => void;
}

export const useFocusStore = create<FocusStoreState>((set) => ({
  showLanding: isColdStart(),
  energy: null,
  focus: null,
  showWhereWasI: false,
  pendingAction: null,

  setFocus: (focus) => {
    set({ focus });
    if (focus) {
      localStorage.setItem(LAST_SEEN_KEY, String(Date.now()));
    }
  },
  setEnergy: (energy) => set({ energy }),
  setShowLanding: (showLanding) => set({ showLanding }),
  setShowWhereWasI: (showWhereWasI) => set({ showWhereWasI }),
  setPendingAction: (pendingAction) => set({ pendingAction }),
}));

export const useFocus = () => useFocusStore();

// --- Entity Store (Internal) ---

const notes = new Map<string, Note>();
const threads = new Map<string, AiThread>();
const listeners = new Set<() => void>();
const focusListeners = new Set<() => void>();

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

  getThread(id: string) {
    return threads.get(id);
  },

  removeThread(id: string) {
    threads.delete(id);
    emit();
  },

  subscribeFocus(fn: () => void) {
    focusListeners.add(fn);
    return () => { focusListeners.delete(fn); };
  },

  triggerFocusRefresh() {
    for (const fn of focusListeners) fn();
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
