import { useState, useEffect } from "react";
import { fetchContext, removeContext } from "../api";
import type { ContextEntry } from "../api";
import OverlayShell from "./OverlayShell";

interface StackOverlayProps {
  onClose: () => void;
  onRefresh: () => Promise<void>;
}

export default function StackOverlay({ onClose, onRefresh }: StackOverlayProps) {
  const [items, setItems] = useState<ContextEntry[]>([]);

  useEffect(() => {
    void fetchContext().then(setItems);
  }, []);

  const remove = async (refId: string) => {
    await removeContext(refId);
    await onRefresh();
    setItems(await fetchContext());
  };

  return (
    <OverlayShell onClose={onClose}>
      <h3 className="text-xs uppercase tracking-widest text-text-muted font-semibold mb-3.5">
        Context Stack
      </h3>
      {items.length > 0 ? (
        <ul className="flex-1 overflow-y-auto mb-2">
          {items.map((entry, i) => (
            <li
              key={entry.ref_id}
              className="flex items-center gap-3 px-1.5 py-2 rounded-lg text-sm text-text group"
            >
              <span className={`size-1.5 rounded-full shrink-0 ${i === 0 ? "bg-accent" : "bg-text-muted/40"}`} />
              <div className="flex flex-col min-w-0">
                <span className={i === 0 ? "font-medium" : "text-text-secondary"}>
                  {entry.task?.title || entry.note?.title || entry.question?.question || entry.ref_id}
                </span>
                {entry.memo && (
                  <span className="text-xs text-accent-dim italic truncate">
                    &ldquo;{entry.memo}&rdquo;
                  </span>
                )}
              </div>
              {entry.reason && !entry.memo && (
                <span className="ml-auto text-xs text-text-muted shrink-0">{entry.reason}</span>
              )}
              <button
                onClick={() => void remove(entry.ref_id)}
                className="text-[10px] text-text-muted hover:text-urgent px-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-text-muted mb-2">stack is empty</p>
      )}
      <span className="text-xs text-text-muted pt-2.5 border-t border-border">
        hover to remove · esc to close
      </span>
    </OverlayShell>
  );
}
