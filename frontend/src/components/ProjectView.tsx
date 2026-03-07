import { useState, useEffect, useRef, useCallback } from "react";
import type { Project, Task, Question } from "../api";
import { fetchProject, updateProject, fetchProjectTasks, fetchQuestions, createTask, updateTask, createQuestion, updateQuestion } from "../api";
import Editor from "./Editor";

interface ProjectViewProps {
  projectId: string;
  onBack: () => void;
}

export default function ProjectView({ projectId, onBack }: ProjectViewProps) {
  const [project, setProject] = useState<Project | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [editingTitle, setEditingTitle] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout>>();

  const load = useCallback(async () => {
    const [p, t, q] = await Promise.all([
      fetchProject(projectId),
      fetchProjectTasks(projectId),
      fetchQuestions({ project_id: projectId }),
    ]);
    setProject(p);
    setTasks(t);
    setQuestions(q);
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  const handleBodyUpdate = (html: string) => {
    if (!project) return;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      updateProject(project.id, { body: html });
    }, 800);
  };

  const handleTitleSubmit = async () => {
    if (!project || !titleRef.current) return;
    const newTitle = titleRef.current.value.trim();
    if (newTitle && newTitle !== project.title) {
      const updated = await updateProject(project.id, { title: newTitle });
      setProject(updated);
    }
    setEditingTitle(false);
  };

  const handleAddTask = async () => {
    if (!project) return;
    await createTask({ title: "New task", parent: project.id });
    setTasks(await fetchProjectTasks(project.id));
  };

  const handleTaskDone = async (task: Task) => {
    await updateTask(task.id, { status: task.status === "done" ? "open" : "done" });
    setTasks(await fetchProjectTasks(projectId));
  };

  const handleNewQuestion = async (text: string) => {
    if (!project) return;
    await createQuestion({ question: text, project_id: project.id });
    setQuestions(await fetchQuestions({ project_id: project.id }));
  };

  const handleAnswerQuestion = async (q: Question, answer: string) => {
    await updateQuestion(q.id, { answer, status: "answered" });
    setQuestions(await fetchQuestions({ project_id: projectId }));
  };

  if (!project) return null;

  const openTasks = tasks.filter(t => t.status === "open");
  const doneTasks = tasks.filter(t => t.status === "done");
  const openQuestions = questions.filter(q => q.status === "open");
  const answeredQuestions = questions.filter(q => q.status === "answered");

  return (
    <div className="w-full max-w-2xl mx-auto">
      <button onClick={onBack} className="text-sm text-text-muted hover:text-text-secondary transition-colors mb-6">
        ← back
      </button>

      {/* Title */}
      {editingTitle ? (
        <input ref={titleRef} defaultValue={project.title} autoFocus
          className="w-full text-3xl font-bold bg-transparent border-none outline-none text-text tracking-tight mb-2"
          onBlur={handleTitleSubmit}
          onKeyDown={e => { if (e.key === "Enter") handleTitleSubmit(); }} />
      ) : (
        <h1 onClick={() => setEditingTitle(true)}
          className="text-3xl font-bold text-text tracking-tight mb-2 cursor-text">
          {project.title}
        </h1>
      )}

      <div className="flex items-center gap-3 mb-8">
        <span className="text-xs uppercase tracking-wider text-text-muted bg-surface px-2 py-0.5 rounded">
          {project.status}
        </span>
        {project.deadline && (
          <span className="text-xs text-text-muted">due {new Date(project.deadline).toLocaleDateString()}</span>
        )}
      </div>

      {/* Editor */}
      <div className="mb-10">
        <Editor
          content={project.body}
          onUpdate={handleBodyUpdate}
          onQuestion={handleNewQuestion}
          placeholder="Describe the goal, add notes, highlight open questions..."
        />
      </div>

      {/* Open Questions */}
      {(openQuestions.length > 0 || answeredQuestions.length > 0) && (
        <div className="border-t border-border-subtle pt-6 mb-8">
          <h2 className="text-xs uppercase tracking-widest text-text-muted font-semibold mb-4">Questions</h2>

          {openQuestions.map(q => (
            <QuestionItem key={q.id} question={q} onAnswer={handleAnswerQuestion} />
          ))}

          {answeredQuestions.map(q => (
            <div key={q.id} className="mb-3 px-3 py-2 rounded-lg bg-surface/50">
              <p className="text-sm text-text-muted line-through">{q.question}</p>
              <p className="text-sm text-text-secondary mt-1">{q.answer}</p>
            </div>
          ))}
        </div>
      )}

      {/* Tasks */}
      <div className="border-t border-border-subtle pt-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xs uppercase tracking-widest text-text-muted font-semibold">Tasks</h2>
          <button onClick={handleAddTask} className="text-xs text-accent hover:text-accent/80 transition-colors">
            + add task
          </button>
        </div>

        {openTasks.length === 0 && doneTasks.length === 0 && (
          <p className="text-sm text-text-muted">No tasks yet</p>
        )}

        {openTasks.map(t => (
          <div key={t.id} className="flex items-center gap-3 py-2 px-1">
            <button onClick={() => handleTaskDone(t)}
              className="size-4 rounded border border-border-subtle shrink-0 hover:border-accent transition-colors" />
            <span className="text-sm text-text">{t.title}</span>
          </div>
        ))}

        {doneTasks.length > 0 && (
          <div className="mt-4 pt-3 border-t border-border-subtle/50">
            {doneTasks.map(t => (
              <div key={t.id} className="flex items-center gap-3 py-2 px-1">
                <button onClick={() => handleTaskDone(t)}
                  className="size-4 rounded bg-success/20 border border-success/30 shrink-0 flex items-center justify-center">
                  <span className="text-success text-[10px]">✓</span>
                </button>
                <span className="text-sm text-text-muted line-through">{t.title}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function QuestionItem({ question: q, onAnswer }: { question: Question; onAnswer: (q: Question, answer: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [answer, setAnswer] = useState("");

  return (
    <div className="mb-3 px-3 py-2 rounded-lg border border-warn/20 bg-warn/5">
      <p className="text-sm text-warn">{q.question}</p>
      {editing ? (
        <div className="mt-2 flex gap-2">
          <input autoFocus value={answer} onChange={e => setAnswer(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && answer.trim()) { onAnswer(q, answer.trim()); setEditing(false); } }}
            className="flex-1 text-sm bg-transparent border border-border rounded px-2 py-1 text-text outline-none"
            placeholder="Type answer..." />
          <button onClick={() => { if (answer.trim()) { onAnswer(q, answer.trim()); setEditing(false); } }}
            className="text-xs text-success hover:text-success/80 px-2">save</button>
          <button onClick={() => setEditing(false)}
            className="text-xs text-text-muted hover:text-text-secondary px-2">cancel</button>
        </div>
      ) : (
        <button onClick={() => setEditing(true)}
          className="text-xs text-text-muted hover:text-text-secondary mt-1">
          + answer
        </button>
      )}
    </div>
  );
}
