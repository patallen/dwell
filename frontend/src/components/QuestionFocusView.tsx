import { useState, useEffect, useRef, useCallback } from "react";
import type { Question, Note, Task } from "../api";
import {
  fetchQuestion, fetchNote, fetchTasks,
  updateQuestion, createTask, createQuestion, deleteQuestion,
  fetchNoteQuestions,
} from "../api";
import Editor from "./Editor";
import type { QuestionMenuAction } from "./Editor";

interface QuestionFocusViewProps {
  questionId: string;
  parentNoteId: string | null;
  onPop: () => void;
  onNavigateToNote: (noteId: string) => void;
}

export default function QuestionFocusView({ questionId, parentNoteId, onPop, onNavigateToNote }: QuestionFocusViewProps) {
  const [question, setQuestion] = useState<Question | null>(null);
  const [parentNote, setParentNote] = useState<Note | null>(null);
  const [relatedTasks, setRelatedTasks] = useState<Task[]>([]);
  const [answerText, setAnswerText] = useState("");
  const [showAnswerInput, setShowAnswerInput] = useState(false);
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const saveTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Sub-question support (same pattern as NoteView)
  const [subQuestions, setSubQuestions] = useState<Question[]>([]);
  const [questionMenu, setQuestionMenu] = useState<{ question: Question; position: { top: number; left: number } } | null>(null);
  const [inlineAnswer, setInlineAnswer] = useState("");

  useEffect(() => {
    fetchQuestion(questionId).then(setQuestion);
    if (parentNoteId) {
      fetchNote(parentNoteId).then(setParentNote);
      fetchTasks({ note_id: parentNoteId }).then(setRelatedTasks);
      fetchNoteQuestions(parentNoteId).then(setSubQuestions);
    }
  }, [questionId, parentNoteId]);

  // Keyboard shortcuts outside editor
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.closest(".tiptap")) return;

      if (e.key === "a") { e.preventDefault(); setShowAnswerInput(true); return; }
      if (e.key === "p") { e.preventDefault(); onPop(); return; }
      if (e.key === "t") { e.preventDefault(); setShowTaskForm(true); return; }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onPop]);

  const handleNotesUpdate = useCallback((html: string) => {
    if (!question) return;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      void updateQuestion(question.id, { notes: html });
    }, 800);
  }, [question]);

  const handleAnswer = async () => {
    if (!question || !answerText.trim()) return;
    await updateQuestion(question.id, { answer: answerText.trim(), status: "answered" });
    onPop();
  };

  const handleCreateTask = async () => {
    if (!newTaskTitle.trim()) return;
    await createTask({ title: newTaskTitle.trim(), note_id: parentNoteId ?? undefined });
    setNewTaskTitle("");
    setShowTaskForm(false);
    if (parentNoteId) {
      setRelatedTasks(await fetchTasks({ note_id: parentNoteId }));
    }
  };

  // Sub-question handlers (same pattern as NoteView)
  const handleNewQuestion = async (text: string): Promise<string> => {
    if (!parentNoteId) return "";
    const q = await createQuestion({ question: text, note_id: parentNoteId });
    setSubQuestions(await fetchNoteQuestions(parentNoteId));
    return q.id;
  };

  const handleQuestionAction = (action: QuestionMenuAction) => {
    const q = subQuestions.find(sq => sq.id === action.questionId);
    if (!q) return;
    setQuestionMenu({ question: q, position: action.position });
    setInlineAnswer(q.answer || "");
  };

  const closeMenu = () => { setQuestionMenu(null); setInlineAnswer(""); };

  const handleInlineAnswer = async () => {
    if (!questionMenu || !inlineAnswer.trim()) return;
    await updateQuestion(questionMenu.question.id, { answer: inlineAnswer.trim(), status: "answered" });
    if (parentNoteId) setSubQuestions(await fetchNoteQuestions(parentNoteId));
    closeMenu();
  };

  const handleInlineDelete = async () => {
    if (!questionMenu) return;
    await deleteQuestion(questionMenu.question.id);
    if (parentNoteId) setSubQuestions(await fetchNoteQuestions(parentNoteId));
    closeMenu();
  };

  if (!question) return null;

  return (
    <div className="w-full max-w-3xl mx-auto">
      {/* Sticky question text */}
      <div className="sticky top-0 z-10 bg-background/90 backdrop-blur-sm pb-3">
        <div className="flex items-center gap-3 mb-2">
          <button onClick={onPop} className="text-text-muted hover:text-text-secondary text-sm shrink-0">
            &larr;
          </button>
          <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded bg-warn/15 text-warn font-semibold">
            question
          </span>
        </div>
        <h1 className="text-xl font-bold leading-snug tracking-tight text-warn">
          {question.question}
        </h1>
        {parentNote && (
          <button
            onClick={() => onNavigateToNote(parentNote.id)}
            className="text-xs text-accent-dim hover:text-accent mt-1 transition-colors"
          >
            from: {parentNote.title}
          </button>
        )}
      </div>

      {/* Answer section */}
      {question.status === "answered" ? (
        <div className="mb-6 px-4 py-3 rounded-xl bg-success/10 border border-success/20">
          <p className="text-xs uppercase tracking-wider text-success font-semibold mb-1">Answered</p>
          <p className="text-sm text-text-secondary">{question.answer}</p>
        </div>
      ) : (
        <div className="mb-6">
          {showAnswerInput ? (
            <div className="flex gap-2 items-center">
              <input
                autoFocus
                value={answerText}
                onChange={e => setAnswerText(e.target.value)}
                onKeyDown={e => {
                  if (e.key === "Enter") void handleAnswer();
                  if (e.key === "Escape") { setShowAnswerInput(false); setAnswerText(""); }
                }}
                className="flex-1 text-sm bg-transparent border border-border rounded-lg px-3 py-2 text-text outline-none focus:border-accent/50"
                placeholder="Type your answer..."
              />
              <button onClick={() => void handleAnswer()} className="h-9 px-4 rounded-xl bg-success/15 text-success text-sm font-semibold hover:bg-success/25 transition-colors">
                Done
              </button>
              <button onClick={() => { setShowAnswerInput(false); setAnswerText(""); }} className="text-xs text-text-muted hover:text-text-secondary">
                cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowAnswerInput(true)}
              className="text-xs text-success/70 hover:text-success transition-colors"
            >
              answer this question (a)
            </button>
          )}
        </div>
      )}

      {/* Research notes editor */}
      <div className="mb-6">
        <p className="text-xs uppercase tracking-widest text-text-muted font-semibold mb-2">Research notes</p>
        <div className="relative">
          <Editor
            content={question.notes || ""}
            onUpdate={handleNotesUpdate}
            onQuestion={handleNewQuestion}
            onQuestionAction={handleQuestionAction}
            placeholder="Research and think here..."
            vim
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

      {/* Create task form */}
      <div className="mb-6">
        {showTaskForm ? (
          <div className="flex gap-2 items-center">
            <input
              autoFocus
              value={newTaskTitle}
              onChange={e => setNewTaskTitle(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter") void handleCreateTask();
                if (e.key === "Escape") { setShowTaskForm(false); setNewTaskTitle(""); }
              }}
              className="flex-1 text-sm bg-transparent border border-border rounded-lg px-3 py-2 text-text outline-none focus:border-accent/50"
              placeholder="Task title..."
            />
            <button onClick={() => void handleCreateTask()} className="text-xs text-accent hover:text-accent/80">create</button>
            <button onClick={() => { setShowTaskForm(false); setNewTaskTitle(""); }} className="text-xs text-text-muted hover:text-text-secondary">cancel</button>
          </div>
        ) : (
          <button
            onClick={() => setShowTaskForm(true)}
            className="text-xs text-text-muted hover:text-text-secondary transition-colors"
          >
            + create task from this (t)
          </button>
        )}
      </div>

      {/* Related tasks */}
      {relatedTasks.length > 0 && (
        <div className="border-t border-border-subtle pt-3">
          <p className="text-xs uppercase tracking-widest text-text-muted font-semibold mb-2">Related tasks</p>
          <div className="flex flex-col gap-1">
            {relatedTasks.map(t => (
              <div key={t.id} className="flex items-center gap-2 py-1 px-1">
                <span className={`size-3.5 rounded shrink-0 flex items-center justify-center ${
                  t.status === "done" ? "bg-success/20 border border-success/30" : "border border-border-subtle"
                }`}>
                  {t.status === "done" && <span className="text-success text-[8px]">&#10003;</span>}
                </span>
                <span className={`text-sm ${t.status === "done" ? "text-text-muted line-through" : "text-text"}`}>
                  {t.title}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
