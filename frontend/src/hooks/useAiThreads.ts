import { useState, useEffect, useRef, useCallback } from "react";
import type { AiThread } from "../api";
import {
  fetchNoteAiThreads,
  createAiThread,
  updateAiThread,
  streamAi,
} from "../api";

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
  const [threads, setThreads] = useState<AiThread[]>([]);
  const controllersRef = useRef<Map<string, AbortController>>(new Map());
  const debounceTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    let cancelled = false;
    fetchNoteAiThreads(noteId).then((data) => {
      if (!cancelled && Array.isArray(data)) {
        setThreads(data.filter((t) => t.status !== "accepted" && t.status !== "dismissed"));
      }
    }).catch(() => { /* ignore fetch errors */ });
    return () => { cancelled = true; };
  }, [noteId]);

  useEffect(() => {
    const controllers = controllersRef.current;
    const timers = debounceTimers.current;
    return () => {
      for (const controller of controllers.values()) {
        controller.abort();
      }
      controllers.clear();
      for (const timer of timers.values()) {
        clearTimeout(timer);
      }
      timers.clear();
    };
  }, []);

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

    setThreads((prev) => [...prev, thread]);

    const controller = new AbortController();
    controllersRef.current.set(thread.id, controller);

    let accumulated = "";

    streamAi(
      {
        action: opts.action === "elaborate" ? "freeform" : "research",
        prompt: opts.prompt,
        note_id: opts.noteId,
        selection: opts.selectionText || null,
      },
      (event) => {
        if (event.type === "delta") {
          accumulated += event.content;
          const current = accumulated;
          setThreads((prev) =>
            prev.map((t) =>
              t.id === thread.id
                ? { ...t, response: current, status: "streaming" as const }
                : t,
            ),
          );

          // Debounced persist
          const existing = debounceTimers.current.get(thread.id);
          if (existing) clearTimeout(existing);
          debounceTimers.current.set(
            thread.id,
            setTimeout(() => {
              debounceTimers.current.delete(thread.id);
              updateAiThread(thread.id, { response: current });
            }, 500),
          );
        } else if (event.type === "done") {
          controllersRef.current.delete(thread.id);
          const finalResponse = accumulated;
          setThreads((prev) =>
            prev.map((t) =>
              t.id === thread.id
                ? { ...t, response: finalResponse, status: "ready" as const }
                : t,
            ),
          );
          // Clear any pending debounce and persist final
          const timer = debounceTimers.current.get(thread.id);
          if (timer) { clearTimeout(timer); debounceTimers.current.delete(thread.id); }
          updateAiThread(thread.id, { response: finalResponse, status: "ready" });
        } else if (event.type === "error") {
          controllersRef.current.delete(thread.id);
          const errorResponse = accumulated + `\n[Error: ${event.message}]`;
          setThreads((prev) =>
            prev.map((t) =>
              t.id === thread.id
                ? { ...t, response: errorResponse, status: "error" as const }
                : t,
            ),
          );
          const timer = debounceTimers.current.get(thread.id);
          if (timer) { clearTimeout(timer); debounceTimers.current.delete(thread.id); }
          updateAiThread(thread.id, { response: errorResponse, status: "error" });
        }
      },
      controller.signal,
    ).catch(() => {
      controllersRef.current.delete(thread.id);
      // Stream failed (network error, abort, timeout) — mark as error if still streaming
      setThreads((prev) =>
        prev.map((t) =>
          t.id === thread.id && t.status === "streaming"
            ? { ...t, status: "error" as const, response: t.response || "[Connection failed]" }
            : t,
        ),
      );
      const pendingTimer = debounceTimers.current.get(thread.id);
      if (pendingTimer) { clearTimeout(pendingTimer); debounceTimers.current.delete(thread.id); }
      updateAiThread(thread.id, { status: "error" }).catch(() => {});
    });

    return thread;
  }, []);

  const acceptThread = useCallback(async (id: string) => {
    // Remove from state immediately, persist in background
    setThreads((prev) => prev.filter((t) => t.id !== id));
    updateAiThread(id, { status: "accepted" }).catch(() => {});
  }, []);

  const dismissThread = useCallback(async (id: string) => {
    setThreads((prev) => prev.filter((t) => t.id !== id));
    updateAiThread(id, { status: "dismissed" }).catch(() => {});
  }, []);

  const stopThread = useCallback((id: string) => {
    const controller = controllersRef.current.get(id);
    if (controller) {
      controller.abort();
      controllersRef.current.delete(id);
    }
    setThreads((prev) =>
      prev.map((t) =>
        t.id === id && t.status === "streaming"
          ? { ...t, status: "ready" as const }
          : t,
      ),
    );
    // Persist the partial response
    const thread = threads.find((t) => t.id === id);
    if (thread) {
      updateAiThread(id, { response: thread.response, status: "ready" });
    }
  }, [threads]);

  const activeCount = threads.filter((t) => t.status === "streaming").length;
  const readyCount = threads.filter((t) => t.status === "ready").length;

  return { threads, activeCount, readyCount, startThread, acceptThread, dismissThread, stopThread };
}
