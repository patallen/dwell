import { useEffect, useState, useCallback } from "react";
import type { Entity } from "./api";
import { fetchEntities, fetchInbox, createEntity } from "./api";
import "./App.css";

function App() {
  const [tasks, setTasks] = useState<Entity[]>([]);
  const [projects, setProjects] = useState<Entity[]>([]);
  const [inbox, setInbox] = useState<Entity[]>([]);
  const [capturing, setCapturing] = useState(false);
  const [captureText, setCaptureText] = useState("");

  const refresh = useCallback(async () => {
    const [t, p, i] = await Promise.all([
      fetchEntities({ type: "task", status: "todo" }),
      fetchEntities({ type: "project", status: "active" }),
      fetchInbox(),
    ]);
    setTasks(t);
    setProjects(p);
    setInbox(i);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "i" && !capturing && document.activeElement === document.body) {
        e.preventDefault();
        setCapturing(true);
      }
      if (e.key === "Escape" && capturing) {
        setCapturing(false);
        setCaptureText("");
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [capturing]);

  const handleCapture = async () => {
    if (!captureText.trim()) return;
    await createEntity({ title: captureText.trim() });
    setCaptureText("");
    setCapturing(false);
    refresh();
  };

  return (
    <div className="app">
      <header className="header">
        <h1>adhdeez</h1>
      </header>

      {capturing && (
        <div className="capture-overlay" onClick={() => setCapturing(false)}>
          <div className="capture-modal" onClick={(e) => e.stopPropagation()}>
            <input
              autoFocus
              placeholder="what's on your mind?"
              value={captureText}
              onChange={(e) => setCaptureText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCapture();
              }}
            />
            <span className="capture-hint">enter to save · esc to cancel</span>
          </div>
        </div>
      )}

      <div className="dashboard">
        <section className="panel">
          <h2>Up Next</h2>
          {tasks.length === 0 ? (
            <p className="empty">nothing here</p>
          ) : (
            <ul>
              {tasks.map((t) => (
                <li key={t.id} className={t.priority === "high" ? "high" : ""}>
                  {t.title}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="panel">
          <h2>Projects</h2>
          {projects.length === 0 ? (
            <p className="empty">nothing here</p>
          ) : (
            <ul>
              {projects.map((p) => (
                <li key={p.id}>{p.title}</li>
              ))}
            </ul>
          )}
        </section>

        <section className="panel inbox">
          <h2>Inbox ({inbox.length})</h2>
          {inbox.length === 0 ? (
            <p className="empty">nothing here</p>
          ) : (
            <ul>
              {inbox.map((item) => (
                <li key={item.id}>{item.title}</li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <footer className="footer">
        <span>i: capture</span>
      </footer>
    </div>
  );
}

export default App;
