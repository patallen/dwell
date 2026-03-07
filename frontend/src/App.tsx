import { useEffect, useState, useCallback, useRef } from "react";
import type { Task, Project, FocusState } from "./api";
import {
  fetchFocus,
  fetchContext,
  fetchTasks,
  fetchProjects,
  fetchProject,
  createTask,
  createProject,
  updateTask,
  pushContext,
  popContext,
} from "./api";
import type { ContextEntry } from "./api";
import ProjectView from "./components/ProjectView";

type Overlay = null | "capture" | "find" | "stack" | "projects" | "help" | "settings";

function loeDot(loe: string | null) {
  if (loe === "hot") return "bg-urgent shadow-[0_0_6px_rgba(248,113,113,0.5)]";
  if (loe === "warm") return "bg-warn";
  if (loe === "cool") return "bg-info";
  return "bg-text-muted";
}

function App() {
  const [focus, setFocus] = useState<FocusState | null>(null);
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [captureText, setCaptureText] = useState("");
  const [findText, setFindText] = useState("");
  const [findResults, setFindResults] = useState<{ type: "task" | "project"; id: string; title: string; status: string }[]>([]);
  const [stackItems, setStackItems] = useState<ContextEntry[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [projectList, setProjectList] = useState<Project[]>([]);
  const captureRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    const state = await fetchFocus();
    setFocus(state);
    // If focused on a project, show project view
    if (state.state === "focused" && state.context?.type === "project" && state.project) {
      setActiveProjectId(state.project.id);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const handlePick = async (task: Task, reason: string) => {
    await pushContext(task.id, "task", reason);
    refresh();
  };

  const handleDone = async () => {
    if (!focus?.task) return;
    await updateTask(focus.task.id, { status: "done" });
    if (focus.state === "focused") await popContext();
    refresh();
  };

  const handlePause = async () => {
    if (focus?.state !== "focused") return;
    await popContext();
    refresh();
  };

  const handleDrop = async () => {
    if (!focus?.task) return;
    await updateTask(focus.task.id, { status: "dropped" });
    if (focus.state === "focused") await popContext();
    refresh();
  };

  const handleCapture = async () => {
    if (!captureText.trim()) return;
    await createTask({ title: captureText.trim() });
    setCaptureText("");
    setOverlay(null);
    refresh();
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

  const handleFindSelect = async (result: { type: "task" | "project"; id: string }) => {
    setOverlay(null);
    setFindText("");
    setFindResults([]);
    if (result.type === "project") {
      setActiveProjectId(result.id);
      await pushContext(result.id, "project", "picked from search");
    } else {
      await pushContext(result.id, "task", "picked from search");
    }
    refresh();
  };

  const loadStack = async () => {
    setStackItems(await fetchContext());
  };

  const loadProjects = async () => {
    setProjectList(await fetchProjects({ status: "active" }));
  };

  const handleOpenProject = async (project: Project) => {
    setOverlay(null);
    setActiveProjectId(project.id);
    await pushContext(project.id, "project", "opened");
    refresh();
  };

  const handleCreateProject = async () => {
    const project = await createProject({ title: "New project" });
    setOverlay(null);
    setActiveProjectId(project.id);
    await pushContext(project.id, "project", "created");
    refresh();
  };

  const handleBackFromProject = () => {
    setActiveProjectId(null);
  };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;

      if (e.key === "Escape") {
        if (overlay) { setOverlay(null); setCaptureText(""); setFindText(""); setFindResults([]); return; }
        if (activeProjectId) { handleBackFromProject(); return; }
        return;
      }
      if (overlay) return;

      if (meta && e.key === "i") { e.preventDefault(); setCaptureText(""); setOverlay("capture"); return; }
      if (meta && e.key === "/") { e.preventDefault(); setFindText(""); setFindResults([]); setOverlay("find"); return; }
      if (meta && e.key === "j") { e.preventDefault(); loadStack(); setOverlay("stack"); return; }
      if (meta && e.key === "p") { e.preventDefault(); loadProjects(); setOverlay("projects"); return; }
      if (meta && e.key === ".") { e.preventDefault(); setOverlay("help"); return; }
      if (meta && e.key === ",") { e.preventDefault(); setOverlay("settings"); return; }

      if (focus?.state === "focused" && focus.task) {
        if (e.key === "d") { e.preventDefault(); handleDone(); return; }
        if (e.key === "x") { e.preventDefault(); handleDrop(); return; }
        if (e.key === "p") { e.preventDefault(); handlePause(); return; }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [overlay, focus]);

  const task = focus?.task;
  const suggestions = focus?.suggestions || [];

  return (
    <div className="min-h-dvh flex flex-col bg-background font-sans text-text antialiased">
      {/* Header */}
      <header className="px-6 py-4 border-b border-border-subtle shrink-0 sm:px-10 flex items-center justify-between">
        <span className="text-sm font-bold tracking-tight text-accent">adhdeez</span>
        {focus?.state === "focused" && focus.stack_depth && focus.stack_depth > 1 && (
          <span className="text-xs text-text-muted">{focus.stack_depth - 1} paused</span>
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
                onKeyDown={e => { if (e.key === "Enter") handleCapture(); }}
                ref={captureRef} />
              <span className="text-xs text-text-muted pt-2.5 border-t border-border">enter to save · esc to cancel</span>
            </>}
            {overlay === "find" && <>
              <input className="w-full bg-transparent border-none text-text text-base outline-none pb-3 placeholder:text-text-muted"
                autoFocus placeholder="search..." value={findText}
                onChange={e => handleFind(e.target.value)} />
              {findResults.length > 0 && (
                <ul className="flex-1 overflow-y-auto mb-2">
                  {findResults.map(r => (
                    <li key={`${r.type}-${r.id}`} onClick={() => handleFindSelect(r)}
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
                      className="flex items-center gap-3 px-1.5 py-2 rounded-lg text-sm text-text">
                      {i === 0 && <span className="size-1.5 rounded-full bg-accent shrink-0" />}
                      {i > 0 && <span className="size-1.5 rounded-full bg-text-muted/40 shrink-0" />}
                      <span className={i === 0 ? "font-medium" : "text-text-secondary"}>{entry.task?.title || entry.ref_id}</span>
                      {entry.reason && <span className="ml-auto text-xs text-text-muted shrink-0">{entry.reason}</span>}
                    </li>
                  ))}
                </ul>
              ) : <p className="text-sm text-text-muted mb-2">stack is empty</p>}
              <span className="text-xs text-text-muted pt-2.5 border-t border-border">top = current focus · esc to close</span>
            </>}
            {overlay === "projects" && <>
              <div className="flex items-center justify-between mb-3.5">
                <h3 className="text-xs uppercase tracking-widest text-text-muted font-semibold">Projects</h3>
                <button onClick={handleCreateProject} className="text-xs text-accent hover:text-accent/80 transition-colors">+ new</button>
              </div>
              {projectList.length > 0 ? (
                <ul className="flex-1 overflow-y-auto mb-2">
                  {projectList.map(p => (
                    <li key={p.id} onClick={() => handleOpenProject(p)}
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
              <p className="text-sm text-text-muted mb-2">nothing here yet</p>
              <span className="text-xs text-text-muted pt-2.5 border-t border-border">esc to close</span>
            </>}
          </div>
        </div>
      )}

      {/* Main */}
      <main className={`flex-1 flex ${activeProjectId ? "items-start" : "items-center"} justify-center p-6 sm:p-10 overflow-y-auto`}>

        {/* Project View */}
        {activeProjectId && (
          <ProjectView projectId={activeProjectId} onBack={handleBackFromProject} />
        )}

        {/* Empty */}
        {!activeProjectId && focus?.state === "empty" && (
          <div className="text-center">
            <p className="text-text-secondary text-xl">All clear.</p>
            <p className="text-text-muted text-sm mt-4">
              <kbd className="bg-surface border border-border px-1.5 py-0.5 rounded text-xs font-[inherit] text-text-muted mr-1">⌘I</kbd>
              to capture something
            </p>
          </div>
        )}

        {/* Suggesting */}
        {!activeProjectId && focus?.state === "suggesting" && suggestions.length > 0 && (
          <div className="w-full h-full flex flex-col items-center justify-center gap-12">
            <h1 className="text-5xl sm:text-6xl font-semibold text-text-secondary text-center tracking-tight leading-none px-6">
              What should we work on?
            </h1>

            <div className="w-full max-w-lg flex flex-col gap-2">
              {suggestions.map(({ task: t, reason }) => (
                <button
                  key={t.id}
                  onClick={() => handlePick(t, reason)}
                  className="w-full text-left rounded-2xl border border-border bg-surface p-5 hover:border-accent/30 hover:shadow-lg hover:shadow-accent/5 active:scale-[0.99] transition-all group"
                >
                  <div className="flex items-center gap-3">
                    <div className={`size-2 rounded-full shrink-0 ${loeDot(t.loe)}`} />
                    <span className="text-lg font-semibold text-text group-hover:text-text tracking-tight">
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

        {/* Focused */}
        {!activeProjectId && focus?.state === "focused" && task && (
          <div className="w-full max-w-xl">
            <p className="text-text-muted text-sm mb-6 text-center">Working on</p>

            <div className="relative rounded-2xl border border-accent/30 bg-surface p-6 sm:p-8 shadow-lg shadow-accent/5">
              <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-10 bg-accent rounded-r-full" />
              <div className="flex items-center gap-2.5 mb-4">
                <div className={`size-2 rounded-full ${loeDot(task.loe)}`} />
                {focus.context?.reason && (
                  <span className="text-xs text-accent-dim tracking-wide">{focus.context.reason}</span>
                )}
              </div>
              <h1 className="text-2xl font-bold leading-snug tracking-tight text-text">
                {task.title}
              </h1>
              {task.body && (
                <p className="text-text-secondary text-sm mt-2 leading-relaxed">{task.body}</p>
              )}

              <div className="flex gap-3 mt-6 pt-5 border-t border-border-subtle">
                <button
                  onClick={handleDone}
                  className="h-10 px-6 rounded-xl bg-success/15 text-success text-sm font-semibold hover:bg-success/25 active:scale-[0.98] transition-all"
                >
                  Done
                </button>
                <button
                  onClick={handlePause}
                  className="h-10 px-6 rounded-xl text-text-muted text-sm hover:text-text-secondary hover:bg-surface-raised transition-colors"
                >
                  Pause
                </button>
                <button
                  onClick={handleDrop}
                  className="h-10 px-6 rounded-xl text-text-muted text-sm hover:text-urgent hover:bg-urgent/10 transition-colors"
                >
                  Drop
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="px-6 py-3 border-t border-border-subtle flex flex-wrap gap-5 text-xs text-text-muted shrink-0 sm:px-10">
        <span>⌘I capture</span>
        <span>⌘/ find</span>
        <span>⌘J stack</span>
        <span>⌘P projects</span>
        <span>⌘. help</span>
      </footer>
    </div>
  );
}

export default App;
