import React from "react";
import type { useOverlayManager } from "../hooks/useOverlayManager";
import type { useBodyPrompts, PromptType } from "../hooks/useBodyPrompts";
import type { useSessionTimer } from "../hooks/useSessionTimer";

interface AppOverlaysProps {
  overlayManager: ReturnType<typeof useOverlayManager>;
  bodyPrompts: ReturnType<typeof useBodyPrompts>;
  sessionTimer: ReturnType<typeof useSessionTimer>;
}

const AppOverlays: React.FC<AppOverlaysProps> = ({
  overlayManager,
  bodyPrompts,
  sessionTimer,
}) => {
  const {
    overlay,
    setOverlay,
    captureText,
    setCaptureText,
    handleCapture,
    captureRef,
    findText,
    handleFind,
    findResults,
    handleFindSelect,
    stackItems,
    handleRemoveStackItem,
    handleCreateNote,
    noteList,
    handleOpenNote,
  } = overlayManager;

  if (!overlay) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[16vh] bg-black/70 backdrop-blur-sm"
      onClick={() => setOverlay(null)}
    >
      <div
        className="w-[min(480px,calc(100vw-48px))] max-h-[60vh] flex flex-col bg-surface-raised border border-border rounded-2xl p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {overlay === "capture" && (
          <>
            <input
              className="w-full bg-transparent border-none text-text text-base outline-none pb-3 placeholder:text-text-muted"
              autoFocus
              placeholder="what's on your mind?"
              value={captureText}
              onChange={(e) => setCaptureText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  e.stopPropagation();
                  void handleCapture();
                }
              }}
              ref={captureRef}
            />
            <span className="text-xs text-text-muted pt-2.5 border-t border-border">
              enter to save · esc to cancel
            </span>
          </>
        )}
        {overlay === "find" && (
          <>
            <input
              className="w-full bg-transparent border-none text-text text-base outline-none pb-3 placeholder:text-text-muted"
              autoFocus
              placeholder="search..."
              value={findText}
              onChange={(e) => void handleFind(e.target.value)}
            />
            {findResults.length > 0 && (
              <ul className="flex-1 overflow-y-auto mb-2">
                {findResults.map((r) => (
                  <li
                    key={`${r.type}-${r.id}`}
                    onClick={() => void handleFindSelect(r)}
                    className="flex items-center gap-3 px-1.5 py-2 rounded-lg text-sm cursor-pointer text-text hover:bg-surface"
                  >
                    <span
                      className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded ${
                        r.type === "note"
                          ? "bg-accent/15 text-accent-dim"
                          : r.type === "question"
                          ? "bg-warn/15 text-warn"
                          : "bg-background text-text-muted"
                      }`}
                    >
                      {r.type === "question" ? "?" : r.type}
                    </span>
                    <span>{r.title}</span>
                    <span className="ml-auto text-xs uppercase tracking-wider text-text-muted">
                      {r.status}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {findText && findResults.length === 0 && (
              <p className="text-sm text-text-muted mb-2">no results</p>
            )}
            <span className="text-xs text-text-muted pt-2.5 border-t border-border">
              click to focus · esc to close
            </span>
          </>
        )}
        {overlay === "stack" && (
          <>
            <h3 className="text-xs uppercase tracking-widest text-text-muted font-semibold mb-3.5">
              Context Stack
            </h3>
            {stackItems.length > 0 ? (
              <ul className="flex-1 overflow-y-auto mb-2">
                {stackItems.map((entry, i) => (
                  <li
                    key={entry.ref_id}
                    className="flex items-center gap-3 px-1.5 py-2 rounded-lg text-sm text-text group"
                  >
                    {i === 0 && (
                      <span className="size-1.5 rounded-full bg-accent shrink-0" />
                    )}
                    {i > 0 && (
                      <span className="size-1.5 rounded-full bg-text-muted/40 shrink-0" />
                    )}
                    <div className="flex flex-col min-w-0">
                      <span
                        className={i === 0 ? "font-medium" : "text-text-secondary"}
                      >
                        {entry.task?.title ||
                          entry.note?.title ||
                          entry.question?.question ||
                          entry.ref_id}
                      </span>
                      {entry.memo && (
                        <span className="text-xs text-accent-dim italic truncate">
                          &ldquo;{entry.memo}&rdquo;
                        </span>
                      )}
                    </div>
                    {entry.reason && !entry.memo && (
                      <span className="ml-auto text-xs text-text-muted shrink-0">
                        {entry.reason}
                      </span>
                    )}
                    <button
                      onClick={() => void handleRemoveStackItem(entry.ref_id)}
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
          </>
        )}
        {overlay === "notes" && (
          <>
            <div className="flex items-center justify-between mb-3.5">
              <h3 className="text-xs uppercase tracking-widest text-text-muted font-semibold">
                Notes
              </h3>
              <div className="flex gap-2">
                <button
                  onClick={() => void handleCreateNote()}
                  className="text-xs text-accent hover:text-accent/80"
                >
                  + note
                </button>
                <button
                  onClick={() => void handleCreateNote("project")}
                  className="text-xs text-accent hover:text-accent/80"
                >
                  + project
                </button>
                <button
                  onClick={() => void handleCreateNote("research")}
                  className="text-xs text-accent hover:text-accent/80"
                >
                  + research
                </button>
              </div>
            </div>
            {noteList.length > 0 ? (
              <ul className="flex-1 overflow-y-auto mb-2">
                {noteList.map((n) => (
                  <li
                    key={n.id}
                    onClick={() => void handleOpenNote(n)}
                    className="flex items-center gap-3 px-1.5 py-2 rounded-lg text-sm cursor-pointer text-text hover:bg-surface"
                  >
                    {n.note_type && (
                      <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-accent/10 text-accent-dim shrink-0">
                        {n.note_type === "one_on_one" ? "1:1" : n.note_type}
                      </span>
                    )}
                    <span>{n.title}</span>
                    <span className="ml-auto text-xs text-text-muted">
                      {n.status}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-text-muted mb-2">no notes yet</p>
            )}
            <span className="text-xs text-text-muted pt-2.5 border-t border-border">
              click to open · esc to close
            </span>
          </>
        )}
        {overlay === "help" && (
          <>
            <h3 className="text-xs uppercase tracking-widest text-text-muted font-semibold mb-3.5">
              Keyboard Shortcuts
            </h3>
            <ul className="mb-2">
              {[
                ["Quick capture", "⌘I"],
                ["Find", "⌘/"],
                ["Stack", "⌘J"],
                ["Notes", "⌘P"],
                ["Accept suggestion", "Enter / Y"],
                ["Skip suggestion", "N / Tab"],
                ["Done", "D"],
                ["Drop", "X"],
                ["Pause (put back)", "P"],
                ["Help", "⌘."],
                ["Settings", "⌘,"],
                ["Close / back", "Esc"],
              ].map(([label, key]) => (
                <li key={key} className="flex items-center py-2 px-1 text-sm">
                  <span className="text-text-secondary">{label}</span>
                  <kbd className="ml-auto text-xs text-text-muted bg-background border border-border px-2 py-0.5 rounded-md font-[inherit]">
                    {key}
                  </kbd>
                </li>
              ))}
            </ul>
            <span className="text-xs text-text-muted pt-2.5 border-t border-border">
              esc to close
            </span>
          </>
        )}
        {overlay === "settings" && (
          <>
            <h3 className="text-xs uppercase tracking-widest text-text-muted font-semibold mb-3.5">
              Settings
            </h3>
            <div className="mb-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm text-text-secondary">Body prompts</span>
                <button
                  onClick={() =>
                    bodyPrompts.updateConfig({
                      enabled: !bodyPrompts.config.enabled,
                    })
                  }
                  className={`text-xs px-2.5 py-1 rounded-lg transition-colors ${
                    bodyPrompts.config.enabled
                      ? "bg-success/15 text-success"
                      : "bg-surface text-text-muted"
                  }`}
                >
                  {bodyPrompts.config.enabled ? "on" : "off"}
                </button>
              </div>
              {bodyPrompts.config.enabled && (
                <div className="flex flex-col gap-2 pl-1">
                  {(["water", "movement", "meal"] as PromptType[]).map((type) => (
                    <div
                      key={type}
                      className="flex items-center justify-between text-sm"
                    >
                      <span className="text-text-muted capitalize">{type}</span>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            const cur = bodyPrompts.config.intervals[type];
                            if (cur > 15)
                              bodyPrompts.updateConfig({
                                intervals: {
                                  ...bodyPrompts.config.intervals,
                                  [type]: cur - 15,
                                },
                              });
                          }}
                          className="text-xs text-text-muted hover:text-text px-1"
                        >
                          -
                        </button>
                        <span className="text-xs text-text-secondary w-12 text-center">
                          {bodyPrompts.config.intervals[type]}m
                        </span>
                        <button
                          onClick={() => {
                            const cur = bodyPrompts.config.intervals[type];
                            bodyPrompts.updateConfig({
                              intervals: {
                                ...bodyPrompts.config.intervals,
                                [type]: cur + 15,
                              },
                            });
                          }}
                          className="text-xs text-text-muted hover:text-text px-1"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="mb-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm text-text-secondary">
                  Session guardrails
                </span>
                <button
                  onClick={() =>
                    sessionTimer.updateConfig({
                      enabled: !sessionTimer.config.enabled,
                    })
                  }
                  className={`text-xs px-2.5 py-1 rounded-lg transition-colors ${
                    sessionTimer.config.enabled
                      ? "bg-success/15 text-success"
                      : "bg-surface text-text-muted"
                  }`}
                >
                  {sessionTimer.config.enabled ? "on" : "off"}
                </button>
              </div>
              {sessionTimer.config.enabled && (
                <div className="flex items-center justify-between text-sm pl-1">
                  <span className="text-text-muted">Remind after</span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        const cur = sessionTimer.config.intervalMinutes;
                        if (cur > 15)
                          sessionTimer.updateConfig({
                            intervalMinutes: cur - 15,
                          });
                      }}
                      className="text-xs text-text-muted hover:text-text px-1"
                    >
                      -
                    </button>
                    <span className="text-xs text-text-secondary w-12 text-center">
                      {sessionTimer.config.intervalMinutes}m
                    </span>
                    <button
                      onClick={() => {
                        const cur = sessionTimer.config.intervalMinutes;
                        sessionTimer.updateConfig({ intervalMinutes: cur + 15 });
                      }}
                      className="text-xs text-text-muted hover:text-text px-1"
                    >
                      +
                    </button>
                  </div>
                </div>
              )}
            </div>
            <span className="text-xs text-text-muted pt-2.5 border-t border-border">
              esc to close
            </span>
          </>
        )}
      </div>
    </div>
  );
};

export default AppOverlays;
