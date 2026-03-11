import { useCallback, useEffect } from "react";
import type { AiThread } from "../api";
import {
  fetchNoteAiThreads,
  createAiThread,
  updateAiThread,
  stopAiThread,
} from "../api";
import { store, useThreads } from "../store";

interface UseAiThreadsReturn {
  threads: AiThread[];
  activeCount: number;
  readyCount: number;
  startThread: (opts: {
    noteId: string;
    action: "elaborate" | "research";
    prompt: string;
    selectionText: string;
    anchorFrom: number;
    anchorTo: number;
  }) => Promise<AiThread>;
  acceptThread: (id: string) => Promise<void>;
  dismissThread: (id: string) => Promise<void>;
  stopThread: (id: string) => void;
}

export function useAiThreads(noteId: string): UseAiThreadsReturn {
  useEffect(() => {
    let cancelled = false;
    fetchNoteAiThreads(noteId).then((data) => {
      if (!cancelled && Array.isArray(data)) {
        for (const t of data) store.setThreadIfNewer(t);
      }
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [noteId]);

  const threads = useThreads(noteId);

  const activeCount = threads.filter((t) => t.status === "streaming").length;
  const readyCount = threads.filter((t) => t.status === "ready").length;

  const startThread = useCallback(async (opts: {
    noteId: string;
    action: "elaborate" | "research";
    prompt: string;
    selectionText: string;
    anchorFrom: number;
    anchorTo: number;
  }): Promise<AiThread> => {
    const thread = await createAiThread({
      note_id: opts.noteId,
      action: opts.action,
      prompt: opts.prompt,
      selection_text: opts.selectionText,
      anchor_from: opts.anchorFrom,
      anchor_to: opts.anchorTo,
    });
    store.setThread(thread);
    return thread;
  }, []);

  const acceptThread = useCallback(async (id: string) => {
    store.removeThread(id);
    updateAiThread(id, { status: "accepted" }).catch(() => {});
  }, []);

  const dismissThread = useCallback(async (id: string) => {
    store.removeThread(id);
    updateAiThread(id, { status: "dismissed" }).catch(() => {});
  }, []);

  const stopThread = useCallback((id: string) => {
    stopAiThread(id).then((t) => store.setThread(t)).catch(() => {});
  }, []);

  return { threads, activeCount, readyCount, startThread, acceptThread, dismissThread, stopThread };
}
