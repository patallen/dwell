import { useEffect, useState, useCallback, useRef } from "react";
import { Routes, Route, useNavigate, useParams, useLocation } from "react-router-dom";
import type { Task, Note, FocusState, EnergyLevel } from "./api";
import {
  fetchFocus,
  fetchContext,
  fetchTasks,
  fetchNotes,
  fetchQuestions,
  createTask,
  createNote,
  updateTask,
  pushContext,
  popContext,
  removeContext,
  setContextMemo,
} from "./api";
import type { ContextEntry } from "./api";
import NoteView from "./components/NoteView";
import WhereWasI from "./components/WhereWasI";
import NoteToSelf from "./components/NoteToSelf";
import AmbientPulse from "./components/AmbientPulse";
import SoftLanding from "./components/SoftLanding";
import GentleWave from "./components/GentleWave";
import { useBodyPrompts } from "./hooks/useBodyPrompts";
import type { PromptType } from "./hooks/useBodyPrompts";
import { useSessionTimer } from "./hooks/useSessionTimer";

const LAST_SEEN_KEY = "dwell:lastSeen";
const COLD_START_HOURS = 4;

function isColdStart(): boolean {
  try {
    const raw = localStorage.getItem(LAST_SEEN_KEY);
    if (!raw) return true;
    const elapsed = (Date.now() - Number(raw)) / 3600000;
    return elapsed >= COLD_START_HOURS;
  } catch {
    return true;
  }
}

type Overlay = null | "capture" | "find" | "stack" | "notes" | "help" | "settings";

type PendingAction =
  | { type: "push"; refId: string; refType: string; reason: string }
  | { type: "pause" }
  | { type: "done" }
  | { type: "drop" };

function loeDot(loe: string | null) {
  if (loe === "hot") return "bg-urgent shadow-[0_0_6px_rgba(248,113,113,0.5)]";
  if (loe === "warm") return "bg-warn";
  if (loe === "cool") return "bg-info";
  return "bg-text-muted";
}

function NoteRoute() {
  const { noteId } = useParams<{ noteId: string }>();
  const navigate = useNavigate();

  if (!noteId) return null;
  return (
    <NoteView
      noteId={noteId}
      onBack={() => navigate("/")}
    />
  );
}

function App() {
  const [showLanding, setShowLanding] = useState(isColdStart);
  const [energy, setEnergy] = useState<EnergyLevel | null>(null);
  const [focus, setFocus] = useState<FocusState | null>(null);
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [captureText, setCaptureText] = useState("");
  const [findText, setFindText] = useState("");
  const [findResults, setFindResults] = useState<{ type: "task" | "note" | "question"; id: string; title: string; status: string; noteId?: string }[]>([]);
  const [stackItems, setStackItems] = useState<ContextEntry[]>([]);
  const [noteList, setNoteList] = useState<Note[]>([]);
  const [showWhereWasI, setShowWhereWasI] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const captureRef = useRef<HTMLInputElement>(null);
  const bodyPrompts = useBodyPrompts();
  const sessionTimer = useSessionTimer();
  const navigate = useNavigate();
  const location = useLocation();

  const isNoteView = location.pathname.startsWith("/note/");

  const applyFocus = useCallback((state: FocusState) => {
    setFocus(state);
    localStorage.setItem(LAST_SEEN_KEY, String(Date.now()));
  }, []);

  const refresh = useCallback(async () => {
    applyFocus(await fetchFocus(energy ?? undefined));
  }, [applyFocus, energy]);

  useEffect(() => {
    if (showLanding) return;
    fetchFocus(energy ?? undefined).then(applyFocus);
  }, [applyFocus, energy, location.pathname, showLanding]);

  const handleLanding = useCallback((selected: EnergyLevel) => {
    setEnergy(selected);
    setShowLanding(false);
  }, []);

  const executeAction = useCallback(async (action: PendingAction, memo?: string) => {
    let showRestore = false;

    if (action.type === "push") {
      const result = await pushContext(action.refId, action.refType, action.reason, memo);
      if (result.state === "focused" && result.context?.memo) {
        showRestore = true;
      }
    } else if (action.type === "pause") {
      const result = await popContext();
      if (result.state === "focused") {
        showRestore = true;
      }
    } else if (action.type === "done") {
      if (focus?.task) {
        await updateTask(focus.task.id, { status: "done" });
        if (focus.state === "focused") {
          const result = await popContext();
          if (result.state === "focused") {
            showRestore = true;
          }
        }
      }
    } else if (action.type === "drop") {
      if (focus?.task) {
        await updateTask(focus.task.id, { status: "dropped" });
        if (focus.state === "focused") {
          const result = await popContext();
          if (result.state === "focused") {
            showRestore = true;
          }
        }
      }
    }

    await refresh();
    if (showRestore) {
      setShowWhereWasI(true);
    }
  }, [focus, refresh]);

  const initiateAction = useCallback((action: PendingAction) => {
    if (showWhereWasI) {
      setShowWhereWasI(false);
      void setContextMemo("");
    }
    if (action.type === "push" && focus?.state === "focused" && (focus.task || focus.note)) {
      setPendingAction(action);
    } else {
      void executeAction(action);
    }
  }, [focus, executeAction, showWhereWasI]);

  const handlePick = (suggestion: { type: "task" | "note"; task?: Task; note?: Note; reason: string }) => {
    if (suggestion.type === "note" && suggestion.note) {
      navigate(`/note/${suggestion.note.id}`);
      initiateAction({ type: "push", refId: suggestion.note.id, refType: "note", reason: suggestion.reason });
    } else if (suggestion.task) {
      initiateAction({ type: "push", refId: suggestion.task.id, refType: "task", reason: suggestion.reason });
    }
  };

  const handleDone = useCallback(() => {
    if (!focus?.task) return;
    initiateAction({ type: "done" });
  }, [focus, initiateAction]);

  const handlePause = useCallback(() => {
    if (focus?.state !== "focused") return;
    initiateAction({ type: "pause" });
  }, [focus, initiateAction]);

  const handleDrop = useCallback(() => {
    if (!focus?.task) return;
    initiateAction({ type: "drop" });
  }, [focus, initiateAction]);

  const handleCapture = async () => {
    if (!captureText.trim()) return;
    await createTask({ title: captureText.trim() });
    setCaptureText("");
    setOverlay(null);
    await refresh();
  };

  const handleFind = async (query: string) => {
    setFindText(query);
    if (!query.trim()) { setFindResults([]); return; }
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
  };

  const handleFindSelect = (result: { type: "task" | "note" | "question"; id: string; noteId?: string }) => {
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
  };

  const loadStack = async () => {
    setStackItems(await fetchContext());
  };

  const loadNotes = async () => {
    setNoteList(await fetchNotes({ status: "active" }));
  };

  const handleOpenNote = (note: Note) => {
    setOverlay(null);
    navigate(`/note/${note.id}`);
  };

  const handleCreateNote = async (noteType?: string) => {
    const note = await createNote({ title: "Untitled", note_type: noteType });
    setOverlay(null);
    navigate(`/note/${note.id}`);
  };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;

      if (e.key === "Escape") {
        if (overlay) { setOverlay(null); setCaptureText(""); setFindText(""); setFindResults([]); return; }
        return;
      }
      if (overlay || pendingAction) return;

      if (meta && e.key === "i") { e.preventDefault(); setCaptureText(""); setOverlay("capture"); return; }
      if (meta && e.key === "/") { e.preventDefault(); setFindText(""); setFindResults([]); setOverlay("find"); return; }
      if (meta && e.key === "j") { e.preventDefault(); void loadStack(); setOverlay("stack"); return; }
      if (meta && e.key === "p") { e.preventDefault(); void loadNotes(); setOverlay("notes"); return; }
      if (meta && e.key === ".") { e.preventDefault(); setOverlay("help"); return; }
      if (meta && e.key === ",") { e.preventDefault(); setOverlay("settings"); return; }

      if (!isNoteView && focus?.state === "focused" && focus.task) {
        if (e.key === "d") { e.preventDefault(); void handleDone(); return; }
        if (e.key === "x") { e.preventDefault(); void handleDrop(); return; }
        if (e.key === "p") { e.preventDefault(); void handlePause(); return; }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [overlay, pendingAction, focus, isNoteView, handleDone, handleDrop, handlePause]);

  const task = focus?.task;
  const suggestions = focus?.suggestions || [];

  if (showLanding) {
    return <SoftLanding onSelect={handleLanding} />;
  }

  return (
    <div className="h-dvh flex flex-col bg-background font-sans text-text antialiased">
      {/* Overlay */}
      {overlay && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-[16vh] bg-black/70 backdrop-blur-sm" onClick={() => setOverlay(null)}>
          <div className="w-[min(480px,calc(100vw-48px))] max-h-[60vh] flex flex-col bg-surface-raised border border-border rounded-2xl p-5 shadow-2xl" onClick={e => e.stopPropagation()}>
            {overlay === "capture" && <>
              <input className="w-full bg-transparent border-none text-text text-base outline-none pb-3 placeholder:text-text-muted"
                autoFocus placeholder="what's on your mind?" value={captureText}
                onChange={e => setCaptureText(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") void handleCapture(); }}
                ref={captureRef} />
              <span className="text-xs text-text-muted pt-2.5 border-t border-border">enter to save · esc to cancel</span>
            </>}
            {overlay === "find" && <>
              <input className="w-full bg-transparent border-none text-text text-base outline-none pb-3 placeholder:text-text-muted"
                autoFocus placeholder="search..." value={findText}
                onChange={e => void handleFind(e.target.value)} />
              {findResults.length > 0 && (
                <ul className="flex-1 overflow-y-auto mb-2">
                  {findResults.map(r => (
                    <li key={`${r.type}-${r.id}`} onClick={() => void handleFindSelect(r)}
                      className="flex items-center gap-3 px-1.5 py-2 rounded-lg text-sm cursor-pointer text-text hover:bg-surface">
                      <span className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded ${r.type === "note" ? "bg-accent/15 text-accent-dim" : r.type === "question" ? "bg-warn/15 text-warn" : "bg-background text-text-muted"}`}>{r.type === "question" ? "?" : r.type}</span>
                      <span>{r.title}</span>
                      <span className="ml-auto text-xs uppercase tracking-wider text-text-muted">{r.status}</span>
                    </li>
                  ))}
                </ul>
              )}
              {findText && findResults.length === 0 && <p className="text-sm text-text-muted mb-2">no results</p>}
              <span className="text-xs text-text-muted pt-2.5 border-t border-border">click to focus · esc to close</span>
            </>}
            {overlay === "stack" && <>
              <h3 className="text-xs uppercase tracking-widest text-text-muted font-semibold mb-3.5">Context Stack</h3>
              {stackItems.length > 0 ? (
                <ul className="flex-1 overflow-y-auto mb-2">
                  {stackItems.map((entry, i) => (
                    <li key={entry.ref_id}
                      className="flex items-center gap-3 px-1.5 py-2 rounded-lg text-sm text-text group">
                      {i === 0 && <span className="size-1.5 rounded-full bg-accent shrink-0" />}
                      {i > 0 && <span className="size-1.5 rounded-full bg-text-muted/40 shrink-0" />}
                      <div className="flex flex-col min-w-0">
                        <span className={i === 0 ? "font-medium" : "text-text-secondary"}>
                          {entry.task?.title || entry.note?.title || entry.question?.question || entry.ref_id}
                        </span>
                        {entry.memo && (
                          <span className="text-xs text-accent-dim italic truncate">&ldquo;{entry.memo}&rdquo;</span>
                        )}
                      </div>
                      {entry.reason && !entry.memo && <span className="ml-auto text-xs text-text-muted shrink-0">{entry.reason}</span>}
                      <button
                        onClick={async () => {
                          await removeContext(entry.ref_id);
                          await refresh();
                          setStackItems(await fetchContext());
                        }}
                        className="text-[10px] text-text-muted hover:text-urgent px-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                      >×</button>
                    </li>
                  ))}
                </ul>
              ) : <p className="text-sm text-text-muted mb-2">stack is empty</p>}
              <span className="text-xs text-text-muted pt-2.5 border-t border-border">hover to remove · esc to close</span>
            </>}
            {overlay === "notes" && <>
              <div className="flex items-center justify-between mb-3.5">
                <h3 className="text-xs uppercase tracking-widest text-text-muted font-semibold">Notes</h3>
                <div className="flex gap-2">
                  <button onClick={() => void handleCreateNote()} className="text-xs text-accent hover:text-accent/80">+ note</button>
                  <button onClick={() => void handleCreateNote("project")} className="text-xs text-accent hover:text-accent/80">+ project</button>
                  <button onClick={() => void handleCreateNote("research")} className="text-xs text-accent hover:text-accent/80">+ research</button>
                </div>
              </div>
              {noteList.length > 0 ? (
                <ul className="flex-1 overflow-y-auto mb-2">
                  {noteList.map(n => (
                    <li key={n.id} onClick={() => void handleOpenNote(n)}
                      className="flex items-center gap-3 px-1.5 py-2 rounded-lg text-sm cursor-pointer text-text hover:bg-surface">
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
              ) : <p className="text-sm text-text-muted mb-2">no notes yet</p>}
              <span className="text-xs text-text-muted pt-2.5 border-t border-border">click to open · esc to close</span>
            </>}
            {overlay === "help" && <>
              <h3 className="text-xs uppercase tracking-widest text-text-muted font-semibold mb-3.5">Keyboard Shortcuts</h3>
              <ul className="mb-2">
                {[
                  ["Quick capture", "⌘I"], ["Find", "⌘/"], ["Stack", "⌘J"], ["Notes", "⌘P"],
                  ["Accept suggestion", "Enter / Y"], ["Skip suggestion", "N / Tab"],
                  ["Done", "D"], ["Drop", "X"], ["Pause (put back)", "P"],
                  ["Help", "⌘."], ["Settings", "⌘,"], ["Close / back", "Esc"],
                ].map(([label, key]) => (
                  <li key={key} className="flex items-center py-2 px-1 text-sm">
                    <span className="text-text-secondary">{label}</span>
                    <kbd className="ml-auto text-xs text-text-muted bg-background border border-border px-2 py-0.5 rounded-md font-[inherit]">{key}</kbd>
                  </li>
                ))}
              </ul>
              <span className="text-xs text-text-muted pt-2.5 border-t border-border">esc to close</span>
            </>}
            {overlay === "settings" && <>
              <h3 className="text-xs uppercase tracking-widest text-text-muted font-semibold mb-3.5">Settings</h3>
              <div className="mb-4">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm text-text-secondary">Body prompts</span>
                  <button
                    onClick={() => bodyPrompts.updateConfig({ enabled: !bodyPrompts.config.enabled })}
                    className={`text-xs px-2.5 py-1 rounded-lg transition-colors ${bodyPrompts.config.enabled ? "bg-success/15 text-success" : "bg-surface text-text-muted"}`}
                  >
                    {bodyPrompts.config.enabled ? "on" : "off"}
                  </button>
                </div>
                {bodyPrompts.config.enabled && (
                  <div className="flex flex-col gap-2 pl-1">
                    {(["water", "movement", "meal"] as PromptType[]).map(type => (
                      <div key={type} className="flex items-center justify-between text-sm">
                        <span className="text-text-muted capitalize">{type}</span>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => {
                              const cur = bodyPrompts.config.intervals[type];
                              if (cur > 15) bodyPrompts.updateConfig({
                                intervals: { ...bodyPrompts.config.intervals, [type]: cur - 15 }
                              });
                            }}
                            className="text-xs text-text-muted hover:text-text px-1"
                          >-</button>
                          <span className="text-xs text-text-secondary w-12 text-center">
                            {bodyPrompts.config.intervals[type]}m
                          </span>
                          <button
                            onClick={() => {
                              const cur = bodyPrompts.config.intervals[type];
                              bodyPrompts.updateConfig({
                                intervals: { ...bodyPrompts.config.intervals, [type]: cur + 15 }
                              });
                            }}
                            className="text-xs text-text-muted hover:text-text px-1"
                          >+</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="mb-4">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm text-text-secondary">Session guardrails</span>
                  <button
                    onClick={() => sessionTimer.updateConfig({ enabled: !sessionTimer.config.enabled })}
                    className={`text-xs px-2.5 py-1 rounded-lg transition-colors ${sessionTimer.config.enabled ? "bg-success/15 text-success" : "bg-surface text-text-muted"}`}
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
                          if (cur > 15) sessionTimer.updateConfig({ intervalMinutes: cur - 15 });
                        }}
                        className="text-xs text-text-muted hover:text-text px-1"
                      >-</button>
                      <span className="text-xs text-text-secondary w-12 text-center">
                        {sessionTimer.config.intervalMinutes}m
                      </span>
                      <button
                        onClick={() => {
                          const cur = sessionTimer.config.intervalMinutes;
                          sessionTimer.updateConfig({ intervalMinutes: cur + 15 });
                        }}
                        className="text-xs text-text-muted hover:text-text px-1"
                      >+</button>
                    </div>
                  </div>
                )}
              </div>
              <span className="text-xs text-text-muted pt-2.5 border-t border-border">esc to close</span>
            </>}
          </div>
        </div>
      )}

      {/* Note to self prompt */}
      {pendingAction && (
        <NoteToSelf
          taskTitle={focus?.task?.title || focus?.note?.title || "current task"}
          onSubmit={(memo) => {
            setPendingAction(null);
            void executeAction(pendingAction, memo);
          }}
          onSkip={() => {
            setPendingAction(null);
            void executeAction(pendingAction);
          }}
        />
      )}

      {/* Where Was I restoration card */}
      {showWhereWasI && !pendingAction && focus?.state === "focused" && (
        <WhereWasI
          focus={focus}
          onDismiss={() => {
            setShowWhereWasI(false);
            void setContextMemo("");
          }}
        />
      )}

      {/* Main */}
      <main className={`flex-1 flex ${isNoteView ? "items-start" : focus?.state === "empty" ? "items-center" : "items-start"} justify-center p-6 sm:p-10 overflow-y-auto`}>
        <Routes>
          <Route path="/note/:noteId" element={<NoteRoute />} />
          <Route path="*" element={
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
          } />
        </Routes>
      </main>

      {/* Session guardrail */}
      {sessionTimer.showWave && !overlay && !pendingAction && (
        <GentleWave
          minutes={sessionTimer.sessionMinutes}
          onDismiss={sessionTimer.dismiss}
          onSnooze={sessionTimer.snooze}
        />
      )}

      {/* Footer */}
      <footer className="sticky bottom-0 z-40 px-6 py-2.5 border-t border-border-subtle flex flex-wrap items-center gap-4 text-xs text-text-muted shrink-0 sm:px-10 bg-background/80 backdrop-blur-md">
        {focus?.state === "focused" && (
          <span
            className="text-text-secondary truncate max-w-[200px] cursor-pointer hover:text-text transition-colors"
            onClick={() => {
              if (focus.context?.type === "note" && focus.note) {
                navigate(`/note/${focus.note.id}`);
              } else {
                navigate("/");
              }
            }}
          >
            {focus.task?.title || focus.note?.title}
          </span>
        )}
        {focus?.state === "focused" && focus.stack_depth && focus.stack_depth > 1 && (
          <span>{focus.stack_depth - 1} paused</span>
        )}
        <span className="ml-auto" />
        <span>⌘I capture</span>
        <span>⌘/ find</span>
        <span>⌘J stack</span>
        <span>⌘P notes</span>
        <span>⌘. help</span>
        {bodyPrompts.activePrompts.length > 0 && (
          <div className="ml-auto flex items-center gap-4">
            {bodyPrompts.activePrompts.map(prompt => (
              <AmbientPulse
                key={prompt.type}
                prompt={prompt}
                label={bodyPrompts.PROMPT_LABELS[prompt.type]}
                onAcknowledge={bodyPrompts.acknowledge}
                onSnooze={bodyPrompts.snooze}
              />
            ))}
          </div>
        )}
      </footer>
    </div>
  );
}

export default App;
