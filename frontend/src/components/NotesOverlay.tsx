import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { fetchNotes, createNote } from "../api";
import type { Note } from "../api";
import OverlayShell from "./OverlayShell";

interface NotesOverlayProps {
  onClose: () => void;
}

export default function NotesOverlay({ onClose }: NotesOverlayProps) {
  const [notes, setNotes] = useState<Note[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    void fetchNotes({ status: "active" }).then(setNotes);
  }, []);

  const create = async (noteType?: Note["note_type"]) => {
    const note = await createNote({ title: "Untitled", note_type: noteType });
    onClose();
    navigate(`/note/${note.id}`);
  };

  const open = (note: Note) => {
    onClose();
    navigate(`/note/${note.id}`);
  };

  return (
    <OverlayShell onClose={onClose}>
      <div className="flex items-center justify-between mb-3.5">
        <h3 className="text-xs uppercase tracking-widest text-text-muted font-semibold">Notes</h3>
        <div className="flex gap-2">
          <button onClick={() => void create()} className="text-xs text-accent hover:text-accent/80">+ note</button>
          <button onClick={() => void create("project")} className="text-xs text-accent hover:text-accent/80">+ project</button>
          <button onClick={() => void create("research")} className="text-xs text-accent hover:text-accent/80">+ research</button>
        </div>
      </div>
      {notes.length > 0 ? (
        <ul className="flex-1 overflow-y-auto mb-2">
          {notes.map((n) => (
            <li
              key={n.id}
              onClick={() => open(n)}
              className="flex items-center gap-3 px-1.5 py-2 rounded-lg text-sm cursor-pointer text-text hover:bg-surface"
            >
              {n.note_type && (
                <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-accent/10 text-accent-dim shrink-0">
                  {n.note_type === "one_on_one" ? "1:1" : n.note_type}
                </span>
              )}
              <span>{n.title}</span>
              <span className="ml-auto text-xs text-text-muted">{n.status}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-text-muted mb-2">no notes yet</p>
      )}
      <span className="text-xs text-text-muted pt-2.5 border-t border-border">
        click to open · esc to close
      </span>
    </OverlayShell>
  );
}
