import { useState, useRef, useEffect } from "react";

interface NoteToSelfProps {
  taskTitle: string;
  onSubmit: (note: string) => void;
  onSkip: () => void;
}

export default function NoteToSelf({ taskTitle, onSubmit, onSkip }: NoteToSelfProps) {
  const [text, setText] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (text.trim()) {
        onSubmit(text.trim());
      } else {
        onSkip();
      }
    }
    if (e.key === "Escape") {
      e.preventDefault();
      onSkip();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[16vh] bg-black/70 backdrop-blur-sm" onClick={onSkip}>
      <div className="w-[min(480px,calc(100vw-48px))] flex flex-col bg-surface-raised border border-border rounded-2xl p-5 shadow-2xl" onClick={e => e.stopPropagation()}>
        <p className="text-xs text-text-muted mb-1">
          Leaving <span className="text-text-secondary font-medium">{taskTitle}</span>
        </p>
        <input
          ref={inputRef}
          className="w-full bg-transparent border-none text-text text-base outline-none pb-3 placeholder:text-text-muted"
          placeholder="note for when you come back?"
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <span className="text-xs text-text-muted pt-2.5 border-t border-border">
          enter to save · esc to skip
        </span>
      </div>
    </div>
  );
}
