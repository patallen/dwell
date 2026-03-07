import { useState, useEffect, useRef, useCallback } from "react";
import type { Project, Task, Question } from "../api";
import { fetchProject, updateProject, fetchProjectTasks, fetchQuestions, createTask, updateTask, deleteTask, createQuestion, updateQuestion, deleteQuestion } from "../api";
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

  const handleTaskEdit = async (task: Task, title: string) => {
    await updateTask(task.id, { title });
    setTasks(await fetchProjectTasks(projectId));
  };

  const handleTaskDelete = async (task: Task) => {
    await deleteTask(task.id);
    setTasks(await fetchProjectTasks(projectId));
  };

  const [highlightedQuestionId, setHighlightedQuestionId] = useState<string | null>(null);

  const handleNewQuestion = async (text: string): Promise<string> => {
    if (!project) return "";
    const q = await createQuestion({ question: text, project_id: project.id });
    setQuestions(await fetchQuestions({ project_id: project.id }));
    return q.id;
  };

  const handleQuestionClick = (questionId: string) => {
    setHighlightedQuestionId(questionId);
    const el = document.getElementById(`question-${questionId}`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
    setTimeout(() => setHighlightedQuestionId(null), 2000);
  };

  const handleAnswerQuestion = async (q: Question, answer: string) => {
    await updateQuestion(q.id, { answer, status: "answered" });
    setQuestions(await fetchQuestions({ project_id: projectId }));
  };

  const handleEditQuestion = async (q: Question, text: string) => {
    await updateQuestion(q.id, { question: text });
    setQuestions(await fetchQuestions({ project_id: projectId }));
  };

  const handleDeleteQuestion = async (q: Question) => {
    await deleteQuestion(q.id);
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
          onQuestionClick={handleQuestionClick}
          placeholder="Describe the goal, add notes, highlight open questions..."
        />
      </div>

      {/* Open Questions */}
      {(openQuestions.length > 0 || answeredQuestions.length > 0) && (
        <div className="border-t border-border-subtle pt-6 mb-8">
          <h2 className="text-xs uppercase tracking-widest text-text-muted font-semibold mb-4">Questions</h2>

          {openQuestions.map(q => (
            <QuestionItem key={q.id} question={q} highlighted={highlightedQuestionId === q.id} onAnswer={handleAnswerQuestion} onEdit={handleEditQuestion} onDelete={handleDeleteQuestion} />
          ))}

          {answeredQuestions.map(q => (
            <QuestionItem key={q.id} question={q} highlighted={highlightedQuestionId === q.id} onAnswer={handleAnswerQuestion} onEdit={handleEditQuestion} onDelete={handleDeleteQuestion} />
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
          <TaskItem key={t.id} task={t} onToggle={handleTaskDone} onEdit={handleTaskEdit} onDelete={handleTaskDelete} />
        ))}

        {doneTasks.length > 0 && (
          <div className="mt-4 pt-3 border-t border-border-subtle/50">
            {doneTasks.map(t => (
              <TaskItem key={t.id} task={t} onToggle={handleTaskDone} onEdit={handleTaskEdit} onDelete={handleTaskDelete} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function TaskItem({ task: t, onToggle, onEdit, onDelete }: {
  task: Task;
  onToggle: (t: Task) => void;
  onEdit: (t: Task, title: string) => void;
  onDelete: (t: Task) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(t.title);
  const done = t.status === "done";

  const submit = () => {
    if (title.trim() && title.trim() !== t.title) onEdit(t, title.trim());
    setEditing(false);
  };

  return (
    <div className="flex items-center gap-3 py-2 px-1 group">
      <button onClick={() => onToggle(t)}
        className={`size-4 rounded shrink-0 transition-colors ${
          done ? "bg-success/20 border border-success/30 flex items-center justify-center" : "border border-border-subtle hover:border-accent"
        }`}>
        {done && <span className="text-success text-[10px]">✓</span>}
      </button>
      {editing ? (
        <input autoFocus value={title} onChange={e => setTitle(e.target.value)}
          onBlur={submit}
          onKeyDown={e => { if (e.key === "Enter") submit(); if (e.key === "Escape") setEditing(false); }}
          className="flex-1 text-sm bg-transparent border-none outline-none text-text" />
      ) : (
        <span className={`text-sm flex-1 ${done ? "text-text-muted line-through" : "text-text"}`}
          onDoubleClick={() => { setTitle(t.title); setEditing(true); }}>
          {t.title}
        </span>
      )}
      <button onClick={() => onDelete(t)}
        className="text-[10px] text-text-muted hover:text-urgent px-1 opacity-0 group-hover:opacity-100 transition-opacity">×</button>
    </div>
  );
}

function QuestionItem({ question: q, highlighted, onAnswer, onEdit, onDelete }: {
  question: Question;
  highlighted?: boolean;
  onAnswer: (q: Question, answer: string) => void;
  onEdit: (q: Question, text: string) => void;
  onDelete: (q: Question) => void;
}) {
  const [mode, setMode] = useState<null | "answer" | "edit">(null);
  const [text, setText] = useState("");
  const answered = q.status === "answered";

  const startEdit = () => { setText(q.question); setMode("edit"); };
  const startAnswer = () => { setText(q.answer || ""); setMode("answer"); };

  const submit = () => {
    if (!text.trim()) return;
    if (mode === "answer") onAnswer(q, text.trim());
    if (mode === "edit") onEdit(q, text.trim());
    setMode(null);
  };

  return (
    <div id={`question-${q.id}`}
      className={`mb-3 px-3 py-2 rounded-lg border transition-all ${
        highlighted ? "ring-2 ring-warn/50" : ""
      } ${answered ? "border-border-subtle bg-surface/50" : "border-warn/20 bg-warn/5"}`}>
      <div className="flex items-start gap-2">
        <p className={`text-sm flex-1 ${answered ? "text-text-muted" : "text-warn"}`}>{q.question}</p>
        <div className="flex gap-1 shrink-0">
          <button onClick={startEdit} className="text-[10px] text-text-muted hover:text-text-secondary px-1">edit</button>
          <button onClick={() => onDelete(q)} className="text-[10px] text-text-muted hover:text-urgent px-1">×</button>
        </div>
      </div>

      {answered && !mode && (
        <p className="text-sm text-text-secondary mt-1 cursor-pointer" onClick={startAnswer}>{q.answer}</p>
      )}

      {mode ? (
        <div className="mt-2 flex gap-2">
          <input autoFocus value={text} onChange={e => setText(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") submit(); if (e.key === "Escape") setMode(null); }}
            className="flex-1 text-sm bg-transparent border border-border rounded px-2 py-1 text-text outline-none"
            placeholder={mode === "answer" ? "Type answer..." : "Edit question..."} />
          <button onClick={submit} className="text-xs text-success hover:text-success/80 px-2">save</button>
          <button onClick={() => setMode(null)} className="text-xs text-text-muted hover:text-text-secondary px-2">cancel</button>
        </div>
      ) : !answered && (
        <button onClick={startAnswer} className="text-xs text-text-muted hover:text-text-secondary mt-1">+ answer</button>
      )}
    </div>
  );
}
