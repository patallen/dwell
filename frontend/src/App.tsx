import { useEffect, useState, useCallback, useRef } from "react";
import { Routes, Route, useNavigate, useParams, useLocation } from "react-router-dom";
import type { Task, Project, FocusState, EnergyLevel } from "./api";
import {
  fetchFocus,
  fetchContext,
  fetchTasks,
  fetchProjects,
  createTask,
  createProject,
  updateTask,
  pushContext,
  popContext,
  removeContext,
  setContextNote,
} from "./api";
import type { ContextEntry } from "./api";
import ProjectView from "./components/ProjectView";
import WhereWasI from "./components/WhereWasI";
import NoteToSelf from "./components/NoteToSelf";
import AmbientPulse from "./components/AmbientPulse";
import SoftLanding from "./components/SoftLanding";
import GentleWave from "./components/GentleWave";
import { useBodyPrompts } from "./hooks/useBodyPrompts";
import type { PromptType } from "./hooks/useBodyPrompts";
import { useSessionTimer } from "./hooks/useSessionTimer";

const LAST_SEEN_KEY = "adhdeez:lastSeen";
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

type Overlay = null | "capture" | "find" | "stack" | "projects" | "help" | "settings";

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

function ProjectRoute() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();

  const handleBack = () => {
    navigate("/");
  };

  if (!projectId) return null;
  return <ProjectView projectId={projectId} onBack={handleBack} />;
}

function App() {
  const [showLanding, setShowLanding] = useState(isColdStart);
  const [energy, setEnergy] = useState<EnergyLevel | null>(null);
  const [focus, setFocus] = useState<FocusState | null>(null);
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [captureText, setCaptureText] = useState("");
  const [findText, setFindText] = useState("");
  const [findResults, setFindResults] = useState<{ type: "task" | "project"; id: string; title: string; status: string }[]>([]);
  const [stackItems, setStackItems] = useState<ContextEntry[]>([]);
  const [projectList, setProjectList] = useState<Project[]>([]);
  const [showWhereWasI, setShowWhereWasI] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const captureRef = useRef<HTMLInputElement>(null);
  const bodyPrompts = useBodyPrompts();
  const sessionTimer = useSessionTimer();
  const navigate = useNavigate();
  const location = useLocation();

  const isProjectView = location.pathname.startsWith("/project/");

  const applyFocus = useCallback((state: FocusState) => {
    setFocus(state);
    localStorage.setItem(LAST_SEEN_KEY, String(Date.now()));
  }, []);

  const refresh = useCallback(async () => {
    applyFocus(await fetchFocus(energy ?? undefined));
  }, [applyFocus, energy]);

  useEffect(() => {
    if (showLanding) return; // Don't fetch until landing is dismissed
    fetchFocus(energy ?? undefined).then(applyFocus);
  }, [applyFocus, energy, location.pathname, showLanding]);

  const handleLanding = useCallback((selected: EnergyLevel) => {
    setEnergy(selected);
    setShowLanding(false);
  }, []);

  // Execute an action that leaves the current focus, optionally with a note
  const executeAction = useCallback(async (action: PendingAction, note?: string) => {
    let showRestore = false;

    if (action.type === "push") {
      const result = await pushContext(action.refId, action.refType, action.reason, note);
      // Check for note-based restoration before refreshing with energy
      if (result.state === "focused" && result.context?.note) {
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

    // Refresh with energy param to get correctly ranked suggestions
    await refresh();
    if (showRestore) {
      setShowWhereWasI(true);
    }
  }, [focus, refresh]);

  // Initiate an action — show note prompt only when the current entry stays in the stack (push)
  const initiateAction = useCallback((action: PendingAction) => {
    // If WhereWasI is showing, dismiss it (user has seen it, clear the note)
    if (showWhereWasI) {
      setShowWhereWasI(false);
      void setContextNote("");
    }
    if (action.type === "push" && focus?.state === "focused" && (focus.task || focus.project)) {
      // Switching to something new — current entry stays in stack, note is useful
      setPendingAction(action);
    } else {
      // Pause/done/drop — current entry is removed from stack, note would be lost
      void executeAction(action);
    }
  }, [focus, executeAction, showWhereWasI]);

  const handlePick = (task: Task, reason: string) => {
    initiateAction({ type: "push", refId: task.id, refType: "task", reason });
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
    const [tasks, projects] = await Promise.all([
      fetchTasks({ search: query.trim() }),
      fetchProjects({ search: query.trim() }),
    ]);
    setFindResults([
      ...projects.map(p => ({ type: "project" as const, id: p.id, title: p.title, status: p.status })),
      ...tasks.map(t => ({ type: "task" as const, id: t.id, title: t.title, status: t.status })),
    ]);
  };

  const handleFindSelect = (result: { type: "task" | "project"; id: string }) => {
    setOverlay(null);
    setFindText("");
    setFindResults([]);
    if (result.type === "project") {
      navigate(`/project/${result.id}`);
    }
    initiateAction({ type: "push", refId: result.id, refType: result.type, reason: "picked from search" });
  };

  const loadStack = async () => {
    setStackItems(await fetchContext());
  };

  const loadProjects = async () => {
    setProjectList(await fetchProjects({ status: "active" }));
  };

  const handleOpenProject = (project: Project) => {
    setOverlay(null);
    navigate(`/project/${project.id}`);
  };

  const handleCreateProject = async () => {
    const project = await createProject({ title: "New project" });
    setOverlay(null);
    navigate(`/project/${project.id}`);
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
      if (meta && e.key === "p") { e.preventDefault(); void loadProjects(); setOverlay("projects"); return; }
      if (meta && e.key === ".") { e.preventDefault(); setOverlay("help"); return; }
      if (meta && e.key === ",") { e.preventDefault(); setOverlay("settings"); return; }

      if (!isProjectView && focus?.state === "focused" && focus.task) {
        if (e.key === "d") { e.preventDefault(); void handleDone(); return; }
        if (e.key === "x") { e.preventDefault(); void handleDrop(); return; }
        if (e.key === "p") { e.preventDefault(); void handlePause(); return; }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [overlay, pendingAction, focus, isProjectView, handleDone, handleDrop, handlePause]);

  const task = focus?.task;
  const suggestions = focus?.suggestions || [];

  if (showLanding) {
    return <SoftLanding onSelect={handleLanding} />;
  }

  return (
    <div className="h-dvh flex flex-col bg-background font-sans text-text antialiased">
      {/* Header */}
      <header className="sticky top-0 z-40 px-6 py-4 border-b border-border-subtle shrink-0 sm:px-10 flex items-center gap-4 bg-background/80 backdrop-blur-md">
        <span className="text-sm font-bold tracking-tight text-accent cursor-pointer" onClick={() => navigate("/")}>adhdeez</span>
        {focus?.state === "focused" && (
          <div
            className="flex items-center gap-2 min-w-0 flex-1 cursor-pointer group"
            onClick={() => {
              if (focus.context?.type === "project" && focus.project) {
                navigate(`/project/${focus.project.id}`);
              } else {
                navigate("/");
              }
            }}
          >
            <span className="text-text-muted text-xs shrink-0">→</span>
            <span className="text-xs text-text-secondary truncate group-hover:text-text transition-colors">
              {focus.task?.title || focus.project?.title}
            </span>
          </div>
        )}
        {focus?.state === "focused" && focus.stack_depth && focus.stack_depth > 1 && (
          <span className="text-xs text-text-muted shrink-0">{focus.stack_depth - 1} paused</span>
        )}
      </header>

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
                      <span className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded ${r.type === "project" ? "bg-accent/15 text-accent-dim" : "bg-background text-text-muted"}`}>{r.type === "project" ? "proj" : "task"}</span>
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
                          {entry.task?.title || entry.project?.title || entry.ref_id}
                        </span>
                        {entry.note && (
                          <span className="text-xs text-accent-dim italic truncate">&ldquo;{entry.note}&rdquo;</span>
                        )}
                      </div>
                      {entry.reason && !entry.note && <span className="ml-auto text-xs text-text-muted shrink-0">{entry.reason}</span>}
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
            {overlay === "projects" && <>
              <div className="flex items-center justify-between mb-3.5">
                <h3 className="text-xs uppercase tracking-widest text-text-muted font-semibold">Projects</h3>
                <button onClick={() => void handleCreateProject()} className="text-xs text-accent hover:text-accent/80 transition-colors">+ new</button>
              </div>
              {projectList.length > 0 ? (
                <ul className="flex-1 overflow-y-auto mb-2">
                  {projectList.map(p => (
                    <li key={p.id} onClick={() => void handleOpenProject(p)}
                      className="flex items-center gap-3 px-1.5 py-2 rounded-lg text-sm cursor-pointer text-text hover:bg-surface">
                      <span>{p.title}</span>
                      <span className="ml-auto text-xs text-text-muted">{p.status}</span>
                    </li>
                  ))}
                </ul>
              ) : <p className="text-sm text-text-muted mb-2">no projects yet</p>}
              <span className="text-xs text-text-muted pt-2.5 border-t border-border">click to open · esc to close</span>
            </>}
            {overlay === "help" && <>
              <h3 className="text-xs uppercase tracking-widest text-text-muted font-semibold mb-3.5">Keyboard Shortcuts</h3>
              <ul className="mb-2">
                {[
                  ["Quick capture", "⌘I"], ["Find", "⌘/"], ["Stack", "⌘J"], ["Projects", "⌘P"],
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
          taskTitle={focus?.task?.title || focus?.project?.title || "current task"}
          onSubmit={(note) => {
            setPendingAction(null);
            void executeAction(pendingAction, note);
          }}
          onSkip={() => {
            setPendingAction(null);
            void executeAction(pendingAction);
          }}
        />
      )}

      {/* Where Was I restoration card — hide when NoteToSelf is active */}
      {showWhereWasI && !pendingAction && focus?.state === "focused" && (
        <WhereWasI
          focus={focus}
          onDismiss={() => {
            setShowWhereWasI(false);
            // Clear the note so it doesn't show again on next visit
            void setContextNote("");
          }}
        />
      )}

      {/* Main */}
      <main className={`flex-1 flex ${isProjectView ? "items-start" : focus?.state === "empty" ? "items-center" : "items-start"} justify-center p-6 sm:p-10 overflow-y-auto`}>
        <Routes>
          <Route path="/project/:projectId" element={<ProjectRoute />} />
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
                  {focus.state === "focused" && (task || focus.project) && (
                    <div>
                      <p className="text-xs uppercase tracking-widest text-text-muted font-semibold mb-3">Working on</p>
                      <div
                        className={`relative rounded-2xl border border-accent/30 bg-surface p-5 sm:p-6 shadow-lg shadow-accent/5 ${focus.project ? "cursor-pointer hover:border-accent/50 transition-colors" : ""}`}
                        onClick={() => {
                          if (focus.project) {
                            navigate(`/project/${focus.project.id}`);
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
                          {task?.title || focus.project?.title}
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
                        {suggestions.map(({ task: t, reason }) => (
                          <button
                            key={t.id}
                            onClick={() => void handlePick(t, reason)}
                            className="w-full text-left rounded-2xl border border-border bg-surface p-4 hover:border-accent/30 hover:shadow-lg hover:shadow-accent/5 active:scale-[0.99] transition-all group"
                          >
                            <div className="flex items-center gap-3">
                              <div className={`size-2 rounded-full shrink-0 ${loeDot(t.loe)}`} />
                              <span className="text-sm font-semibold text-text group-hover:text-text tracking-tight">
                                {t.title}
                              </span>
                              {reason && (
                                <span className="ml-auto text-xs text-accent-dim shrink-0">{reason}</span>
                              )}
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          } />
        </Routes>
      </main>

      {/* Session guardrail — suppress when overlay or modal is active */}
      {sessionTimer.showWave && !overlay && !pendingAction && (
        <GentleWave
          minutes={sessionTimer.sessionMinutes}
          onDismiss={sessionTimer.dismiss}
          onSnooze={sessionTimer.snooze}
        />
      )}

      {/* Footer */}
      <footer className="sticky bottom-0 z-40 px-6 py-3 border-t border-border-subtle flex flex-wrap items-center gap-5 text-xs text-text-muted shrink-0 sm:px-10 bg-background/80 backdrop-blur-md">
        <span>⌘I capture</span>
        <span>⌘/ find</span>
        <span>⌘J stack</span>
        <span>⌘P projects</span>
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
