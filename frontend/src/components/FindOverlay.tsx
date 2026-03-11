import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { fetchTasks, fetchNotes, fetchQuestions } from "../api";
import type { PendingAction } from "../api";
import OverlayShell from "./OverlayShell";

interface FindResult {
  type: "task" | "note" | "question";
  id: string;
  title: string;
  status: string;
  noteId?: string;
}

interface FindOverlayProps {
  onClose: () => void;
  onAction: (action: PendingAction) => void;
}

export default function FindOverlay({ onClose, onAction }: FindOverlayProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<FindResult[]>([]);
  const navigate = useNavigate();

  const search = async (q: string) => {
    setQuery(q);
    if (!q.trim()) { setResults([]); return; }
    const [tasks, notes, questions] = await Promise.all([
      fetchTasks({ search: q.trim() }),
      fetchNotes({ search: q.trim() }),
      fetchQuestions({ search: q.trim() }),
    ]);
    setResults([
      ...notes.map(n => ({ type: "note" as const, id: n.id, title: n.title, status: n.status })),
      ...tasks.map(t => ({ type: "task" as const, id: t.id, title: t.title, status: t.status })),
      ...questions.map(q => ({ type: "question" as const, id: q.id, title: q.question, status: q.status, noteId: q.note_id ?? undefined })),
    ]);
  };

  const select = (r: FindResult) => {
    onClose();
    if (r.type === "note") { navigate(`/note/${r.id}`); return; }
    if (r.type === "question" && r.noteId) { navigate(`/note/${r.noteId}`); return; }
    onAction({ type: "push", refId: r.id, refType: r.type, reason: "picked from search" });
  };

  return (
    <OverlayShell onClose={onClose}>
      <input
        className="w-full bg-transparent border-none text-text text-base outline-none pb-3 placeholder:text-text-muted"
        autoFocus
        placeholder="search..."
        value={query}
        onChange={(e) => void search(e.target.value)}
      />
      {results.length > 0 && (
        <ul className="flex-1 overflow-y-auto mb-2">
          {results.map((r) => (
            <li
              key={`${r.type}-${r.id}`}
              onClick={() => select(r)}
              className="flex items-center gap-3 px-1.5 py-2 rounded-lg text-sm cursor-pointer text-text hover:bg-surface"
            >
              <span className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded ${
                r.type === "note" ? "bg-accent/15 text-accent-dim"
                : r.type === "question" ? "bg-warn/15 text-warn"
                : "bg-background text-text-muted"
              }`}>
                {r.type === "question" ? "?" : r.type}
              </span>
              <span>{r.title}</span>
              <span className="ml-auto text-xs uppercase tracking-wider text-text-muted">{r.status}</span>
            </li>
          ))}
        </ul>
      )}
      {query && results.length === 0 && (
        <p className="text-sm text-text-muted mb-2">no results</p>
      )}
      <span className="text-xs text-text-muted pt-2.5 border-t border-border">
        click to focus · esc to close
      </span>
    </OverlayShell>
  );
}
