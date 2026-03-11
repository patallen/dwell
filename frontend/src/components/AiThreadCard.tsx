import { useEffect, useRef } from "react";
import type { AiThread } from "../api";

interface AiThreadCardProps {
  thread: AiThread;
  position: { top: number };
  onInsertBelow: (threadId: string, text: string) => void;
  onReplace: (threadId: string, text: string) => void;
  onCopy: (text: string) => void;
  onDismiss: (threadId: string) => void;
  onStop: (threadId: string) => void;
  onClose: () => void;
}

function renderMarkdown(text: string) {
  return text.split("\n\n").map((block, i) => (
    <p key={i} className={i > 0 ? "mt-2" : ""}>
      {block.split("\n").map((line, j) => (
        <span key={j}>
          {j > 0 && <br />}
          {line}
        </span>
      ))}
    </p>
  ));
}

export default function AiThreadCard({
  thread,
  position,
  onInsertBelow,
  onReplace,
  onCopy,
  onDismiss,
  onStop,
  onClose,
}: AiThreadCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", handler, true);
    return () => document.removeEventListener("keydown", handler, true);
  }, [onClose]);

  return (
    <div
      ref={cardRef}
      className="absolute z-30 left-0 right-0 max-h-[400px] bg-surface-raised border border-border rounded-xl shadow-xl flex flex-col"
      style={{ top: position.top + 4 }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 pt-2.5 pb-1">
        <div className="flex items-center gap-2">
          <span
            className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
              thread.action === "elaborate"
                ? "bg-accent/15 text-accent"
                : "bg-warn/15 text-warn"
            }`}
          >
            {thread.action}
          </span>
          {thread.selection_text && (
            <span className="text-[10px] text-text-muted italic truncate max-w-[300px]">
              &quot;{thread.selection_text.slice(0, 80)}
              {thread.selection_text.length > 80 ? "..." : ""}&quot;
            </span>
          )}
        </div>
        <button
          onClick={onClose}
          className="text-text-muted hover:text-text text-xs leading-none px-1"
          title="Esc to close"
        >
          &times;
        </button>
      </div>

      {/* Response */}
      <div className="px-3 py-2 overflow-y-auto flex-1 min-h-0">
        {!thread.response && thread.status === "streaming" && (
          <div className="flex items-center gap-2 text-xs text-text-muted">
            <span className="inline-block w-1 h-3 bg-accent/40 animate-pulse" />
            thinking...
          </div>
        )}

        {thread.response && (
          <div
            className={`text-sm leading-relaxed ${
              thread.status === "error" ? "text-urgent" : "text-text"
            }`}
          >
            {renderMarkdown(thread.response)}
            {thread.status === "streaming" && (
              <span className="inline-block w-1.5 h-4 bg-accent/60 animate-pulse ml-0.5 align-text-bottom" />
            )}
          </div>
        )}

        {thread.status === "error" && !thread.response && (
          <div className="text-sm text-urgent">Something went wrong.</div>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-2 text-[11px] px-3 pb-2.5 pt-1 border-t border-border-subtle">
        {thread.status === "ready" && (
          <>
            <button
              onClick={() => onInsertBelow(thread.id, thread.response)}
              className="text-accent hover:text-accent/80"
            >
              insert below
            </button>
            <button
              onClick={() => onReplace(thread.id, thread.response)}
              className="text-warn hover:text-warn/80"
            >
              replace
            </button>
            <button
              onClick={() => onCopy(thread.response)}
              className="text-text-muted hover:text-text-secondary"
            >
              copy
            </button>
            <button
              onClick={() => onDismiss(thread.id)}
              className="text-text-muted hover:text-text-secondary"
            >
              dismiss
            </button>
          </>
        )}
        {thread.status === "streaming" && (
          <button
            onClick={() => onStop(thread.id)}
            className="text-urgent hover:text-urgent/80"
          >
            stop
          </button>
        )}
        {thread.status === "error" && (
          <button
            onClick={() => onDismiss(thread.id)}
            className="text-text-muted hover:text-text-secondary"
          >
            dismiss
          </button>
        )}
      </div>
    </div>
  );
}
