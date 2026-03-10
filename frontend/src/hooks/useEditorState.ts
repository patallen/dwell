import { useRef, useEffect, useCallback } from "react";
import type { Editor } from "@tiptap/react";

interface PersistedEditorState {
  noteId: string;
  cursorPos: number;
  scrollTop: number;
  savedAt: number;
  contentLength: number;
}

export interface UseEditorStateReturn {
  restore: (editor: Editor) => void;
  save: (editor: Editor) => void;
  flush: (editor: Editor) => void;
}

const STORAGE_PREFIX = "dwell:editorState:";

function loadState(noteId: string): PersistedEditorState | null {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + noteId);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return null;
}

function saveState(state: PersistedEditorState) {
  try {
    localStorage.setItem(STORAGE_PREFIX + state.noteId, JSON.stringify(state));
  } catch { /* ignore */ }
}

function getScrollContainer(editor: Editor): HTMLElement | null {
  let el: HTMLElement | null = editor.view.dom;
  while (el) {
    if (el.tagName === "MAIN") return el;
    el = el.parentElement;
  }
  return null;
}

export function useEditorState(noteId: string): UseEditorStateReturn {
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const restoringRef = useRef(false);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [noteId]);

  const save = useCallback((editor: Editor) => {
    if (restoringRef.current) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      const container = getScrollContainer(editor);
      saveState({
        noteId,
        cursorPos: editor.state.selection.from,
        scrollTop: container?.scrollTop ?? 0,
        savedAt: Date.now(),
        contentLength: editor.state.doc.content.size,
      });
    }, 400);
  }, [noteId]);

  const flush = useCallback((editor: Editor) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    const container = getScrollContainer(editor);
    saveState({
      noteId,
      cursorPos: editor.state.selection.from,
      scrollTop: container?.scrollTop ?? 0,
      savedAt: Date.now(),
      contentLength: editor.state.doc.content.size,
    });
  }, [noteId]);

  const restore = useCallback((editor: Editor) => {
    const state = loadState(noteId);
    if (!state) return;

    const docSize = editor.state.doc.content.size;
    if (Math.abs(state.contentLength - docSize) > 10) return;

    const clampedPos = Math.min(state.cursorPos, docSize);

    // Suppress saves during restoration to prevent autofocus from overwriting
    restoringRef.current = true;

    // Use RAF to run after autofocus has settled
    requestAnimationFrame(() => {
      editor.commands.setTextSelection(clampedPos);

      const container = getScrollContainer(editor);
      if (container) {
        // Second RAF: set scroll after browser finishes scroll-into-view from cursor change
        requestAnimationFrame(() => {
          container.scrollTop = state.scrollTop;
          restoringRef.current = false;
        });
      } else {
        restoringRef.current = false;
      }
    });
  }, [noteId]);

  return { restore, save, flush };
}
