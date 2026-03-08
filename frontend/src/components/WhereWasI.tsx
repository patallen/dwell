import { useEffect, useCallback } from "react";
import type { FocusState } from "../api";

function timeAgo(isoString: string): string {
  const ms = Date.now() - new Date(isoString).getTime();
  const min = Math.floor(ms / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hrs = Math.floor(min / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

interface WhereWasIProps {
  focus: FocusState;
  onDismiss: () => void;
}

export default function WhereWasI({ focus, onDismiss }: WhereWasIProps) {
  const title = focus.task?.title || focus.note?.title;
  const memo = focus.context?.memo;
  const pushedAt = focus.context?.pushed_at;
  const body = focus.task?.body;

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      e.preventDefault();
      onDismiss();
    },
    [onDismiss]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  return (
    <div
      className="fixed bottom-20 left-1/2 z-50 w-[min(440px,calc(100vw-48px))] animate-in"
      onClick={onDismiss}
    >
      <div className="rounded-2xl border border-accent/20 bg-surface-raised p-5 shadow-2xl shadow-accent/10">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xs uppercase tracking-widest text-accent-dim font-semibold">
            Welcome back
          </span>
          {pushedAt && (
            <span className="text-xs text-text-muted ml-auto">
              left {timeAgo(pushedAt)}
            </span>
          )}
        </div>

        <h3 className="text-base font-bold text-text tracking-tight">{title}</h3>

        {memo && (
          <p className="text-sm text-accent-dim mt-2 italic">
            &ldquo;{memo}&rdquo;
          </p>
        )}

        {!memo && body && (
          <p className="text-sm text-text-secondary mt-1.5 line-clamp-2 leading-relaxed">
            {body}
          </p>
        )}

        <p className="text-xs text-text-muted mt-3">
          press any key to continue
        </p>
      </div>
    </div>
  );
}
