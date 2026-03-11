import { useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import type { Note, ContextEntry, PendingAction } from "../api";
import {
  createTask,
  fetchTasks,
  fetchNotes,
  fetchQuestions,
  fetchContext,
  createNote,
  removeContext,
} from "../api";

export type Overlay = null | "capture" | "find" | "stack" | "notes" | "help" | "settings";

export function useOverlayManager(
  refresh: () => Promise<void>,
  initiateAction: (action: PendingAction) => void
) {
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [captureText, setCaptureText] = useState("");
  const [findText, setFindText] = useState("");
  const [findResults, setFindResults] = useState<{ type: "task" | "note" | "question"; id: string; title: string; status: string; noteId?: string }[]>([]);
  const [stackItems, setStackItems] = useState<ContextEntry[]>([]);
  const [noteList, setNoteList] = useState<Note[]>([]);
  const captureRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  const handleCapture = useCallback(async () => {
    const text = captureText.trim();
    if (!text) return;
    
    setOverlay(null);
    setCaptureText("");
    
    try {
      await createTask({ title: text });
      await refresh();
    } catch (err) {
      console.error("Failed to capture task:", err);
    }
  }, [captureText, refresh]);

  const handleFind = useCallback(async (query: string) => {
    setFindText(query);
    if (!query.trim()) {
      setFindResults([]);
      return;
    }
    try {
      const [tasks, notes, questions] = await Promise.all([
        fetchTasks({ search: query.trim() }),
        fetchNotes({ search: query.trim() }),
        fetchQuestions({ search: query.trim() }),
      ]);
      setFindResults([
        ...notes.map(n => ({ type: "note" as const, id: n.id, title: n.title, status: n.status })),
        ...tasks.map(t => ({ type: "task" as const, id: t.id, title: t.title, status: t.status })),
        ...questions.map(q => ({ type: "question" as const, id: q.id, title: q.question, status: q.status, noteId: q.note_id ?? undefined })),
      ]);
    } catch (err) {
      console.error("Failed to find:", err);
    }
  }, []);

  const handleFindSelect = useCallback((result: { type: "task" | "note" | "question"; id: string; noteId?: string }) => {
    setOverlay(null);
    setFindText("");
    setFindResults([]);
    if (result.type === "note") {
      navigate(`/note/${result.id}`);
      return;
    }
    if (result.type === "question" && result.noteId) {
      navigate(`/note/${result.noteId}`);
      return;
    }
    initiateAction({ type: "push", refId: result.id, refType: result.type, reason: "picked from search" });
  }, [navigate, initiateAction]);

  const loadStack = useCallback(async () => {
    try {
      setStackItems(await fetchContext());
    } catch (err) {
      console.error("Failed to load stack:", err);
    }
  }, []);

  const handleRemoveStackItem = useCallback(async (refId: string) => {
    try {
      await removeContext(refId);
      await refresh();
      setStackItems(await fetchContext());
    } catch (err) {
      console.error("Failed to remove stack item:", err);
    }
  }, [refresh]);

  const loadNotes = useCallback(async () => {
    try {
      setNoteList(await fetchNotes({ status: "active" }));
    } catch (err) {
      console.error("Failed to load notes:", err);
    }
  }, []);

  const handleCreateNote = useCallback(async (noteType?: Note["note_type"]) => {
    try {
      const note = await createNote({ title: "Untitled", note_type: noteType });
      setOverlay(null);
      navigate(`/note/${note.id}`);
    } catch (err) {
      console.error("Failed to create note:", err);
    }
  }, [navigate]);

  const handleOpenNote = useCallback((note: Note) => {
    setOverlay(null);
    navigate(`/note/${note.id}`);
  }, [navigate]);

  return {
    overlay,
    setOverlay,
    captureText,
    setCaptureText,
    findText,
    setFindText,
    findResults,
    setFindResults,
    stackItems,
    setStackItems,
    noteList,
    setNoteList,
    captureRef,
    handleCapture,
    handleFind,
    handleFindSelect,
    loadStack,
    loadNotes,
    handleRemoveStackItem,
    handleCreateNote,
    handleOpenNote,
  };
}
