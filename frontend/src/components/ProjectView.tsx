import { useState, useEffect, useRef } from "react";
import type { Project, Task, Question } from "../api";
import { fetchProject, updateProject, fetchProjectTasks, fetchQuestions, createTask, updateTask, deleteTask, createQuestion, updateQuestion, deleteQuestion } from "../api";
import Editor from "./Editor";
import type { QuestionMenuAction } from "./Editor";

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
  const saveTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    Promise.all([
      fetchProject(projectId),
      fetchProjectTasks(projectId),
      fetchQuestions({ project_id: projectId }),
    ]).then(([p, t, q]) => {
      setProject(p);
      setTasks(t);
      setQuestions(q);
    });
  }, [projectId]);

  const handleBodyUpdate = (html: string) => {
    if (!project) return;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      void updateProject(project.id, { body: html });
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

  const [questionMenu, setQuestionMenu] = useState<{ question: Question; position: { top: number; left: number } } | null>(null);
  const [inlineAnswer, setInlineAnswer] = useState<string>("");

  const handleNewQuestion = async (text: string): Promise<string> => {
    if (!project) return "";
    const q = await createQuestion({ question: text, project_id: project.id });
    setQuestions(await fetchQuestions({ project_id: project.id }));
    return q.id;
  };

  const handleQuestionAction = (action: QuestionMenuAction) => {
    const q = questions.find(q => q.id === action.questionId);
    if (!q) return;
    setQuestionMenu({ question: q, position: action.position });
    setInlineAnswer(q.answer || "");
  };

  const closeMenu = () => { setQuestionMenu(null); setInlineAnswer(""); };

  const handleInlineAnswer = async () => {
    if (!questionMenu || !inlineAnswer.trim()) return;
    await updateQuestion(questionMenu.question.id, { answer: inlineAnswer.trim(), status: "answered" });
    setQuestions(await fetchQuestions({ project_id: projectId }));
    closeMenu();
  };

  const handleInlineDelete = async () => {
    if (!questionMenu) return;
    await deleteQuestion(questionMenu.question.id);
    setQuestions(await fetchQuestions({ project_id: projectId }));
    closeMenu();
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
          onBlur={() => void handleTitleSubmit()}
          onKeyDown={e => { if (e.key === "Enter") void handleTitleSubmit(); }} />
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
        <div className="relative">
          <Editor
            content={project.body}
            onUpdate={handleBodyUpdate}
            onQuestion={handleNewQuestion}
            onQuestionAction={handleQuestionAction}
            placeholder="Describe the goal, add notes, highlight open questions..."
          />

          {/* Inline question context menu */}
          {questionMenu && (
            <>
              <div className="fixed inset-0 z-10" onClick={closeMenu} />
              <div
                className="absolute z-20 bg-surface-raised border border-border rounded-xl shadow-xl p-3 w-64"
                style={{ top: questionMenu.position.top, left: questionMenu.position.left }}
              >
                <p className="text-xs text-warn mb-2">{questionMenu.question.question}</p>
                {questionMenu.question.status === "answered" && (
                  <p className="text-xs text-text-secondary mb-2">{questionMenu.question.answer}</p>
                )}
                <input
                  autoFocus
                  value={inlineAnswer}
                  onChange={e => setInlineAnswer(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === "Enter") void handleInlineAnswer();
                    if (e.key === "Escape") closeMenu();
                  }}
                  className="w-full text-sm bg-transparent border border-border rounded px-2 py-1 text-text outline-none mb-2"
                  placeholder={questionMenu.question.status === "answered" ? "Edit answer..." : "Answer..."}
                />
                <div className="flex gap-2 text-[11px]">
                  <button onClick={() => void handleInlineAnswer()} className="text-success hover:text-success/80">save</button>
                  <button onClick={() => void handleInlineDelete()} className="text-urgent hover:text-urgent/80">remove</button>
                  <button onClick={closeMenu} className="text-text-muted hover:text-text-secondary ml-auto">cancel</button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Open Questions */}
      {(openQuestions.length > 0 || answeredQuestions.length > 0) && (
        <div className="border-t border-border-subtle pt-6 mb-8">
          <h2 className="text-xs uppercase tracking-widest text-text-muted font-semibold mb-4">Questions</h2>

          {openQuestions.map(q => (
            <QuestionItem key={q.id} question={q} onAnswer={handleAnswerQuestion} onEdit={handleEditQuestion} onDelete={handleDeleteQuestion} />
          ))}

          {answeredQuestions.map(q => (
            <QuestionItem key={q.id} question={q} onAnswer={handleAnswerQuestion} onEdit={handleEditQuestion} onDelete={handleDeleteQuestion} />
          ))}
        </div>
      )}

      {/* Tasks */}
      <div className="border-t border-border-subtle pt-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xs uppercase tracking-widest text-text-muted font-semibold">Tasks</h2>
          <button onClick={() => void handleAddTask()} className="text-xs text-accent hover:text-accent/80 transition-colors">
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

function QuestionItem({ question: q, onAnswer, onEdit, onDelete }: {
  question: Question;
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
    <div className={`mb-3 px-3 py-2 rounded-lg border ${answered ? "border-border-subtle bg-surface/50" : "border-warn/20 bg-warn/5"}`}>
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
