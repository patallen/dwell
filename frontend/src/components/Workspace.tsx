import { useNavigate } from "react-router-dom";
import type { FocusManager } from "../hooks/useFocusManager";

export function loeDot(loe: string | null) {
  if (loe === "hot") return "bg-urgent shadow-[0_0_6px_rgba(248,113,113,0.5)]";
  if (loe === "warm") return "bg-warn";
  if (loe === "cool") return "bg-info";
  return "bg-text-muted";
}

interface WorkspaceProps {
  focusManager: FocusManager;
}

export default function Workspace({ focusManager }: WorkspaceProps) {
  const { focus, handlePick, handleDone, handlePause, handleDrop } = focusManager;
  const navigate = useNavigate();

  const task = focus?.task;
  const suggestions = focus?.suggestions || [];

  return (
    <>
      {/* Empty */}
      {focus?.state === "empty" && (
        <div className="text-center">
          <p className="text-text-secondary text-xl">All clear.</p>
          <p className="text-text-muted text-sm mt-4">
            <kbd className="bg-surface border border-border px-1.5 py-0.5 rounded text-xs font-[inherit] text-text-muted mr-1">⌘I</kbd>
            to capture something
          </p>
        </div>
      )}

      {/* Focused + suggestions */}
      {(focus?.state === "focused" || focus?.state === "suggesting") && (
        <div className="w-full max-w-xl flex flex-col gap-6">
          {/* Current focus */}
          {focus.state === "focused" && (task || focus.note) && (
            <div>
              <p className="text-xs uppercase tracking-widest text-text-muted font-semibold mb-3">Working on</p>
              <div
                className={`relative rounded-2xl border border-accent/30 bg-surface p-5 sm:p-6 shadow-lg shadow-accent/5 ${focus.note ? "cursor-pointer hover:border-accent/50 transition-colors" : ""}`}
                onClick={() => {
                  if (focus.note) {
                    navigate(`/note/${focus.note.id}`);
                  }
                }}
              >
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-10 bg-accent rounded-r-full" />
                <div className="flex items-center gap-2.5 mb-3">
                  {task && <div className={`size-2 rounded-full ${loeDot(task.loe)}`} />}
                  {focus.context?.reason && (
                    <span className="text-xs text-accent-dim tracking-wide">{focus.context.reason}</span>
                  )}
                </div>
                <h1 className="text-xl font-bold leading-snug tracking-tight text-text">
                  {task?.title || focus.note?.title}
                </h1>
                {task?.body && (
                  <p className="text-text-secondary text-sm mt-1.5 leading-relaxed">{task.body}</p>
                )}

                <div className="flex gap-3 mt-4 pt-4 border-t border-border-subtle">
                  {task && (
                    <button
                      onClick={e => { e.stopPropagation(); void handleDone(); }}
                      className="h-9 px-5 rounded-xl bg-success/15 text-success text-sm font-semibold hover:bg-success/25 active:scale-[0.98] transition-all"
                    >
                      Done
                    </button>
                  )}
                  <button
                    onClick={e => { e.stopPropagation(); void handlePause(); }}
                    className="h-9 px-5 rounded-xl text-text-muted text-sm hover:text-text-secondary hover:bg-surface-raised transition-colors"
                  >
                    Pause
                  </button>
                  {task && (
                    <button
                      onClick={e => { e.stopPropagation(); void handleDrop(); }}
                      className="h-9 px-5 rounded-xl text-text-muted text-sm hover:text-urgent hover:bg-urgent/10 transition-colors"
                    >
                      Drop
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Suggestions */}
          {suggestions.length > 0 && (
            <div>
              <p className="text-xs uppercase tracking-widest text-text-muted font-semibold mb-3">
                {focus.state === "focused" ? "Up next" : "What should we work on?"}
              </p>
              <div className="flex flex-col gap-2">
                {suggestions.map((s) => {
                  const id = s.task?.id || s.note?.id || "";
                  const title = s.task?.title || s.note?.title || "";
                  return (
                    <button
                      key={id}
                      onClick={() => void handlePick(s)}
                      className="w-full text-left rounded-2xl border border-border bg-surface p-4 hover:border-accent/30 hover:shadow-lg hover:shadow-accent/5 active:scale-[0.99] transition-all group"
                    >
                      <div className="flex items-center gap-3">
                        {s.type === "task" && s.task && (
                          <div className={`size-2 rounded-full shrink-0 ${loeDot(s.task.loe)}`} />
                        )}
                        {s.type === "note" && (
                          <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-accent/10 text-accent-dim shrink-0">
                            {s.note?.note_type === "one_on_one" ? "1:1" : s.note?.note_type || "note"}
                          </span>
                        )}
                        <span className="text-sm font-semibold text-text group-hover:text-text tracking-tight">
                          {title}
                        </span>
                        {s.reason && (
                          <span className="ml-auto text-xs text-accent-dim shrink-0">{s.reason}</span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}
