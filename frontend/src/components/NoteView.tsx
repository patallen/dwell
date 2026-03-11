import { useState, useEffect, useRef, useCallback } from "react";
import type { Editor as TiptapEditor } from "@tiptap/react";
import type { Note, Task, Question, AiStreamEvent } from "../api";
import {
  fetchNote, updateNote, fetchNoteTasks, fetchNoteQuestions,
  createTask, updateTask, deleteTask,
  createQuestion, updateQuestion, deleteQuestion,
  streamAi,
} from "../api";
import Editor from "./Editor";
import type { QuestionMenuAction } from "./Editor";
import { useEditorState } from "../hooks/useEditorState";
import { useAiThreads } from "../hooks/useAiThreads";
import AiPromptPopover from "./AiPromptPopover";
import AiThreadCard from "./AiThreadCard";

/** Find the actual from/to of an aiThread mark in the document */
function findThreadMarkRange(editor: TiptapEditor, threadId: string): { from: number; to: number } | null {
  let result: { from: number; to: number } | null = null;
  editor.state.doc.descendants((node, pos) => {
    if (result) return false;
    const mark = node.marks.find(m => m.type.name === "aiThread" && m.attrs.threadId === threadId);
    if (mark) {
      result = { from: pos, to: pos + node.nodeSize };
    }
  });
  return result;
}

interface NoteViewProps {
  noteId: string;
  onBack: () => void;
}

const NOTE_TYPES = [null, "project", "meeting", "one_on_one", "research"] as const;
const STATUS_OPTIONS = ["active", "paused", "done", "dropped"] as const;

function typeLabel(t: string | null) {
  if (!t) return "note";
  if (t === "one_on_one") return "1:1";
  return t;
}

function statusColor(s: string) {
  if (s === "active") return "text-success";
  if (s === "paused") return "text-warn";
  if (s === "done") return "text-text-muted";
  if (s === "dropped") return "text-urgent";
  return "text-text-muted";
}

export default function NoteView({ noteId, onBack }: NoteViewProps) {
  const [note, setNote] = useState<Note | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [editingTitle, setEditingTitle] = useState(false);
  const [showTypeMenu, setShowTypeMenu] = useState(false);
  const [showStatusMenu, setShowStatusMenu] = useState(false);
  const [showDoneItems, setShowDoneItems] = useState(false);
  const [showQuestions, setShowQuestions] = useState(false);
  const [showTasks, setShowTasks] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const editorRef = useRef<TiptapEditor | null>(null);
  const editorState = useEditorState(noteId);
  const aiAbortRef = useRef<AbortController | null>(null);
  const { threads, activeCount, readyCount, startThread, acceptThread, dismissThread, stopThread } = useAiThreads(noteId);
  const [promptCtx, setPromptCtx] = useState<{
    position: { top: number; left: number };
    from: number;
    to: number;
    text: string;
    cursorContext: string;
  } | null>(null);
  const [activeCardId, setActiveCardId] = useState<string | null>(null);
  const [cardPosition, setCardPosition] = useState<{ top: number }>({ top: 0 });

  const showCardForThread = useCallback((threadId: string, anchorFrom: number) => {
    if (!editorRef.current) return;
    const view = editorRef.current.view;
    const pos = Math.min(anchorFrom, view.state.doc.content.size);
    const coords = view.coordsAtPos(pos);
    const editorRect = view.dom.getBoundingClientRect();
    setCardPosition({ top: coords.bottom - editorRect.top + 4 });
    setActiveCardId(threadId);
  }, []);

  const handleAiTrigger = useCallback((ctx: { from: number; to: number; text: string; cursorContext: string }) => {
    if (!editorRef.current) return;
    const view = editorRef.current.view;
    const coords = view.coordsAtPos(ctx.from);
    const editorRect = view.dom.getBoundingClientRect();
    // Clamp left so popover (280px wide, centered) stays within editor bounds
    const rawLeft = coords.left - editorRect.left;
    const clampedLeft = Math.max(140, Math.min(rawLeft, editorRect.width - 140));
    setPromptCtx({
      position: { top: coords.bottom - editorRect.top + 4, left: clampedLeft },
      ...ctx,
    });
  }, []);

  const handlePromptSubmit = useCallback(async (action: "elaborate" | "research", prompt: string) => {
    if (!promptCtx || !editorRef.current) return;
    const thread = await startThread({
      noteId,
      action,
      prompt,
      selectionText: promptCtx.text,
      anchorFrom: promptCtx.from,
      anchorTo: promptCtx.to,
    });
    if (promptCtx.from !== promptCtx.to) {
      editorRef.current.chain().focus()
        .setTextSelection({ from: promptCtx.from, to: promptCtx.to })
        .setAiThreadMark(thread.id)
        .run();
    } else {
      // No selection — drop a pin at cursor so user can see where this thread lives
      editorRef.current.commands.addAiThreadPin(thread.id, promptCtx.from);
    }
    setPromptCtx(null);
    showCardForThread(thread.id, promptCtx.from);
  }, [promptCtx, noteId, startThread, showCardForThread]);

  const handleThreadInsertBelow = useCallback((threadId: string, text: string) => {
    if (!editorRef.current) return;
    const editor = editorRef.current;
    const markRange = findThreadMarkRange(editor, threadId);
    const thread = threads.find(t => t.id === threadId);
    const anchorTo = markRange?.to ?? thread?.anchor_to ?? editor.state.selection.to;
    const content = text.split("\n\n").filter(Boolean).map(p => ({ type: "paragraph", content: [{ type: "text", text: p }] }));
    if (content.length === 0) {
      // Nothing to insert (empty response) — just clean up
      editor.commands.removeAiThreadMark(threadId);
      editor.commands.removeAiThreadPin(threadId);
      void acceptThread(threadId);
      setActiveCardId(null);
      return;
    }
    try {
      const insertPos = Math.min(anchorTo, editor.state.doc.content.size);
      const resolved = editor.state.doc.resolve(insertPos);
      let depth = resolved.depth;
      while (depth > 0 && !resolved.node(depth).isBlock) depth--;
      const afterBlock = resolved.after(depth);
      editor.chain().focus().insertContentAt(afterBlock, content).run();
    } catch {
      editor.chain().focus().insertContentAt(editor.state.doc.content.size, content).run();
    }
    editor.commands.removeAiThreadMark(threadId);
    editor.commands.removeAiThreadPin(threadId);
    void acceptThread(threadId);
    setActiveCardId(null);
  }, [threads, acceptThread]);

  const handleThreadReplace = useCallback((threadId: string, text: string) => {
    if (!editorRef.current) return;
    const editor = editorRef.current;
    const markRange = findThreadMarkRange(editor, threadId);
    const thread = threads.find(t => t.id === threadId);
    const from = markRange?.from ?? thread?.anchor_from;
    const to = markRange?.to ?? thread?.anchor_to;
    if (from == null || to == null) return;
    try {
      const docSize = editor.state.doc.content.size;
      editor.chain().focus()
        .setTextSelection({ from: Math.min(from, docSize), to: Math.min(to, docSize) })
        .deleteSelection()
        .insertContent(text)
        .run();
    } catch {
      editor.chain().focus().insertContent(text).run();
    }
    editor.commands.removeAiThreadMark(threadId);
    editor.commands.removeAiThreadPin(threadId);
    void acceptThread(threadId);
    setActiveCardId(null);
  }, [threads, acceptThread]);

  const handleThreadCopy = useCallback((text: string) => {
    void navigator.clipboard.writeText(text);
  }, []);

  const handleThreadDismiss = useCallback((threadId: string) => {
    if (editorRef.current) {
      editorRef.current.commands.removeAiThreadMark(threadId);
      editorRef.current.commands.removeAiThreadPin(threadId);
    }
    void dismissThread(threadId);
    setActiveCardId(null);
  }, [dismissThread]);

  const handleThreadStop = useCallback((threadId: string) => {
    stopThread(threadId);
  }, [stopThread]);

  // Sync thread status to DOM + clean up orphaned marks from previous sessions
  useEffect(() => {
    if (!editorRef.current) return;
    const editor = editorRef.current;
    const editorEl = editor.view.dom;
    const activeIds = new Set(threads.map(t => t.id));
    // Set status on active thread highlights
    for (const thread of threads) {
      const spans = editorEl.querySelectorAll(`[data-ai-thread-id="${thread.id}"]`);
      spans.forEach(span => span.setAttribute("data-thread-status", thread.status));
    }
    // Remove orphaned marks (thread no longer exists)
    const allSpans = editorEl.querySelectorAll("[data-ai-thread-id]");
    const orphanIds = new Set<string>();
    allSpans.forEach(span => {
      const id = span.getAttribute("data-ai-thread-id");
      if (id && !activeIds.has(id)) orphanIds.add(id);
    });
    for (const id of orphanIds) {
      editor.commands.removeAiThreadMark(id);
    }
  }, [threads]);

  const handleEditorReady = useCallback((editor: TiptapEditor) => {
    editorRef.current = editor;
    editorState.restore(editor);
    editor.on('selectionUpdate', () => {
      editorState.save(editor);
    });
    // Handle clicks on AI pin widgets (decorations, not marks)
    editor.view.dom.addEventListener('click', (e) => {
      const pin = (e.target as HTMLElement).closest('.ai-thread-pin');
      if (!pin) return;
      const threadId = (pin as HTMLElement).dataset.aiThreadId;
      if (!threadId) return;
      const rect = pin.getBoundingClientRect();
      const editorRect = editor.view.dom.getBoundingClientRect();
      setCardPosition({ top: rect.bottom - editorRect.top + 4 });
      setActiveCardId(threadId);
    });
  }, [editorState]);

  useEffect(() => {
    return () => {
      if (editorRef.current) {
        editorState.flush(editorRef.current);
      }
    };
  }, [noteId, editorState]);

  useEffect(() => {
    return () => {
      aiAbortRef.current?.abort();
    };
  }, [noteId]);

  useEffect(() => {
    Promise.all([
      fetchNote(noteId),
      fetchNoteTasks(noteId),
      fetchNoteQuestions(noteId),
    ]).then(([n, t, q]) => {
      setNote(n);
      setTasks(t);
      setQuestions(q);
    });
  }, [noteId]);

  // --- Note-level actions ---

  const handleTypeChange = async (noteType: typeof NOTE_TYPES[number]) => {
    if (!note) return;
    const updated = await updateNote(note.id, { note_type: noteType ?? undefined });
    setNote(updated);
    setShowTypeMenu(false);
  };

  const handleStatusChange = async (status: typeof STATUS_OPTIONS[number]) => {
    if (!note) return;
    const updated = await updateNote(note.id, { status });
    setNote(updated);
    setShowStatusMenu(false);
  };

  const handleBodyUpdate = (html: string) => {
    if (!note) return;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      void updateNote(note.id, { body: html });
    }, 800);
  };

  const handleTitleSubmit = async () => {
    if (!note || !titleRef.current) return;
    const newTitle = titleRef.current.value.trim();
    if (newTitle && newTitle !== note.title) {
      const updated = await updateNote(note.id, { title: newTitle });
      setNote(updated);
    }
    setEditingTitle(false);
  };

  // --- Tasks ---

  const [newTaskTitle, setNewTaskTitle] = useState("");

  const handleAddTask = async () => {
    if (!note || !newTaskTitle.trim()) return;
    await createTask({ title: newTaskTitle.trim(), note_id: note.id });
    setNewTaskTitle("");
    setTasks(await fetchNoteTasks(note.id));
  };

  const handleTaskDone = async (task: Task) => {
    await updateTask(task.id, { status: task.status === "done" ? "open" : "done" });
    setTasks(await fetchNoteTasks(noteId));
  };

  const handleTaskEdit = async (task: Task, title: string) => {
    await updateTask(task.id, { title });
    setTasks(await fetchNoteTasks(noteId));
  };

  const handleTaskDelete = async (task: Task) => {
    await deleteTask(task.id);
    setTasks(await fetchNoteTasks(noteId));
  };

  // --- Questions ---

  const [questionMenu, setQuestionMenu] = useState<{ question: Question; position: { top: number; left: number } } | null>(null);
  const [inlineAnswer, setInlineAnswer] = useState<string>("");
  const [aiStreaming, setAiStreaming] = useState(false);

  const handleNewQuestion = async (text: string): Promise<string> => {
    if (!note) return "";
    const q = await createQuestion({ question: text, note_id: note.id });
    setQuestions(await fetchNoteQuestions(note.id));
    return q.id;
  };

  const handleQuestionAction = (action: QuestionMenuAction) => {
    const q = questions.find(q => q.id === action.questionId);
    if (!q) return;
    setQuestionMenu({ question: q, position: action.position });
    setInlineAnswer(q.answer || "");
  };

  const closeMenu = () => { aiAbortRef.current?.abort(); setQuestionMenu(null); setInlineAnswer(""); setAiStreaming(false); };

  const handleInlineAnswer = async () => {
    if (!questionMenu || !inlineAnswer.trim()) return;
    await updateQuestion(questionMenu.question.id, { answer: inlineAnswer.trim(), status: "answered" });
    setQuestions(await fetchNoteQuestions(noteId));
    closeMenu();
  };

  const handleInlineDelete = async () => {
    if (!questionMenu) return;
    await deleteQuestion(questionMenu.question.id);
    setQuestions(await fetchNoteQuestions(noteId));
    closeMenu();
  };

  const handleAnswerQuestion = async (q: Question, answer: string) => {
    await updateQuestion(q.id, { answer, status: "answered" });
    setQuestions(await fetchNoteQuestions(noteId));
  };

  const handleDeleteQuestion = async (q: Question) => {
    await deleteQuestion(q.id);
    setQuestions(await fetchNoteQuestions(noteId));
  };

  if (!note) return null;

  const openTasks = tasks.filter(t => t.status === "open");
  const doneTasks = tasks.filter(t => t.status === "done");
  const openQuestions = questions.filter(q => q.status === "open");
  const answeredQuestions = questions.filter(q => q.status === "answered");
  const doneCount = doneTasks.length + answeredQuestions.length;

  return (
    <div className="w-full max-w-3xl mx-auto">
      {/* Header bar — type + title + status */}
      <div className="flex items-center gap-3 mb-4">
        <button onClick={onBack} className="text-text-muted hover:text-text-secondary text-sm shrink-0">
          ←
        </button>

        {/* Type selector */}
        <div className="relative">
          <button
            onClick={() => setShowTypeMenu(!showTypeMenu)}
            className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded bg-accent/10 text-accent-dim hover:bg-accent/20 transition-colors"
          >
            {typeLabel(note.note_type)}
          </button>
          {showTypeMenu && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShowTypeMenu(false)} />
              <div className="absolute top-full left-0 mt-1 z-20 bg-surface-raised border border-border rounded-lg shadow-xl py-1 min-w-[100px]">
                {NOTE_TYPES.map(t => (
                  <button key={t || "none"} onClick={() => void handleTypeChange(t)}
                    className={`block w-full text-left text-xs px-3 py-1.5 hover:bg-surface transition-colors ${
                      note.note_type === t ? "text-accent" : "text-text-secondary"
                    }`}>
                    {typeLabel(t)}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Title */}
        {editingTitle ? (
          <input ref={titleRef} defaultValue={note.title} autoFocus
            className="flex-1 text-lg font-bold bg-transparent border-none outline-none text-text tracking-tight"
            onBlur={() => void handleTitleSubmit()}
            onKeyDown={e => { if (e.key === "Enter") { void handleTitleSubmit(); e.preventDefault(); } if (e.key === "Escape") setEditingTitle(false); }} />
        ) : (
          <h1 onClick={() => setEditingTitle(true)}
            className="text-lg font-bold text-text tracking-tight cursor-text flex-1 truncate">
            {note.title}
          </h1>
        )}

        {/* Status */}
        <div className="relative shrink-0">
          <button
            onClick={() => setShowStatusMenu(!showStatusMenu)}
            className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded hover:bg-surface-raised transition-colors ${statusColor(note.status)}`}
          >
            {note.status}
          </button>
          {showStatusMenu && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShowStatusMenu(false)} />
              <div className="absolute top-full right-0 mt-1 z-20 bg-surface-raised border border-border rounded-lg shadow-xl py-1 min-w-[100px]">
                {STATUS_OPTIONS.map(s => (
                  <button key={s} onClick={() => void handleStatusChange(s)}
                    className={`block w-full text-left text-xs px-3 py-1.5 hover:bg-surface transition-colors ${
                      note.status === s ? statusColor(s) : "text-text-secondary"
                    }`}>
                    {s}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Summary bar — collapsed questions & tasks */}
      {(openQuestions.length > 0 || openTasks.length > 0) && (
        <div className="flex items-center gap-3 mb-4">
          {openQuestions.length > 0 && (
            <button
              onClick={() => setShowQuestions(!showQuestions)}
              className={`text-xs px-2 py-0.5 rounded transition-colors ${showQuestions ? "bg-warn/15 text-warn" : "text-warn/70 hover:text-warn"}`}
            >
              {openQuestions.length} question{openQuestions.length > 1 ? "s" : ""}
            </button>
          )}
          {openTasks.length > 0 && (
            <button
              onClick={() => setShowTasks(!showTasks)}
              className={`text-xs px-2 py-0.5 rounded transition-colors ${showTasks ? "bg-accent/15 text-accent" : "text-text-muted hover:text-text-secondary"}`}
            >
              {openTasks.length} task{openTasks.length > 1 ? "s" : ""}
            </button>
          )}
        </div>
      )}

      {/* Open questions — expanded */}
      {showQuestions && openQuestions.length > 0 && (
        <div className="mb-4">
          <div className="flex flex-col gap-1.5">
            {openQuestions.map(q => (
              <QuestionRow key={q.id} question={q} onAnswer={handleAnswerQuestion} onDelete={handleDeleteQuestion} />
            ))}
          </div>
        </div>
      )}

      {/* Open tasks — expanded */}
      {showTasks && (
        <div className="mb-4">
          {openTasks.length > 0 && (
            <div className="flex flex-col gap-0.5 mb-1">
              {openTasks.map(t => (
                <TaskRow key={t.id} task={t} onToggle={handleTaskDone} onEdit={handleTaskEdit} onDelete={handleTaskDelete} />
              ))}
            </div>
          )}
          <div className="flex items-center gap-2 pl-1">
            <span className="text-text-muted text-sm">+</span>
            <input
              value={newTaskTitle}
              onChange={e => setNewTaskTitle(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") void handleAddTask(); }}
              className="flex-1 text-sm bg-transparent border-none outline-none text-text-secondary placeholder:text-text-muted/50"
              placeholder="add task"
            />
          </div>
        </div>
      )}

      {/* Editor — the thinking surface */}
      <div className="mb-6">
        <div className="relative">
          <Editor
            content={note.body}
            noteId={noteId}
            onUpdate={handleBodyUpdate}
            onQuestion={handleNewQuestion}
            onQuestionAction={handleQuestionAction}
            onAiTrigger={handleAiTrigger}
            onAiThreadClick={(threadId, position) => {
              setCardPosition({ top: position.top });
              setActiveCardId(threadId);
            }}
            placeholder="Think here..."
            vim
            onEditorReady={handleEditorReady}
          />

          {/* AI prompt popover */}
          {promptCtx && (
            <AiPromptPopover
              position={promptCtx.position}
              selectionText={promptCtx.text}
              onSubmit={(action, prompt) => void handlePromptSubmit(action, prompt)}
              onDismiss={() => setPromptCtx(null)}
            />
          )}

          {/* AI thread card */}
          {activeCardId && threads.find(t => t.id === activeCardId) && (
            <AiThreadCard
              thread={threads.find(t => t.id === activeCardId)!}
              position={cardPosition}
              onInsertBelow={handleThreadInsertBelow}
              onReplace={handleThreadReplace}
              onCopy={handleThreadCopy}
              onDismiss={handleThreadDismiss}
              onStop={handleThreadStop}
              onClose={() => setActiveCardId(null)}
            />
          )}

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
                {aiStreaming && (
                  <div className="flex items-center gap-2 text-xs text-text-muted mb-2">
                    <span className="inline-block w-1 h-3 bg-accent/40 animate-pulse" />
                    thinking...
                  </div>
                )}
                <div className="flex gap-2 text-[11px]">
                  <button onClick={() => void handleInlineAnswer()} disabled={aiStreaming} className={`${aiStreaming ? "text-text-muted/30" : "text-success hover:text-success/80"}`}>save</button>
                  {aiStreaming ? (
                    <button onClick={() => { aiAbortRef.current?.abort(); setAiStreaming(false); }} className="text-urgent hover:text-urgent/80">stop</button>
                  ) : (
                    <button onClick={() => {
                      if (!questionMenu) return;
                      aiAbortRef.current?.abort();
                      const controller = new AbortController();
                      aiAbortRef.current = controller;
                      setInlineAnswer("");
                      setAiStreaming(true);
                      streamAi(
                        { action: "research", prompt: questionMenu.question.question, note_id: noteId },
                        (event: AiStreamEvent) => {
                          if (event.type === "delta") {
                            setInlineAnswer(prev => prev + event.content);
                          } else if (event.type === "done") {
                            setAiStreaming(false);
                          } else if (event.type === "error") {
                            setInlineAnswer(prev => prev + `\n[Error: ${event.message}]`);
                            setAiStreaming(false);
                          }
                        },
                        controller.signal,
                      ).catch(() => { setAiStreaming(false); });
                    }} className="text-accent hover:text-accent/80">ask AI</button>
                  )}
                  <button onClick={() => void handleInlineDelete()} disabled={aiStreaming} className={`${aiStreaming ? "text-text-muted/30" : "text-urgent hover:text-urgent/80"}`}>remove</button>
                  <button onClick={closeMenu} className="text-text-muted hover:text-text-secondary ml-auto">cancel</button>
                </div>
              </div>
            </>
          )}
        </div>
        {(activeCount > 0 || readyCount > 0) && (
          <div className="flex items-center gap-3 mt-1 text-[10px] text-text-muted">
            {activeCount > 0 && (
              <button onClick={() => {
                const activeThread = threads.find(t => t.status === "streaming");
                if (activeThread) showCardForThread(activeThread.id, activeThread.anchor_from);
              }} className="text-accent hover:text-accent/80 animate-pulse">
                {activeCount} AI active
              </button>
            )}
            {readyCount > 0 && (
              <button onClick={() => {
                const readyThread = threads.find(t => t.status === "ready");
                if (readyThread) showCardForThread(readyThread.id, readyThread.anchor_from);
              }} className="text-success hover:text-success/80">
                {readyCount} ready
              </button>
            )}
          </div>
        )}
      </div>

      {/* Done items — collapsed by default */}
      {doneCount > 0 && (
        <div className="border-t border-border-subtle pt-3">
          <button
            onClick={() => setShowDoneItems(!showDoneItems)}
            className="text-[10px] uppercase tracking-wider text-text-muted hover:text-text-secondary transition-colors"
          >
            {showDoneItems ? "hide" : "show"} {doneCount} completed
          </button>
          {showDoneItems && (
            <div className="mt-2 flex flex-col gap-1 opacity-60">
              {doneTasks.map(t => (
                <TaskRow key={t.id} task={t} onToggle={handleTaskDone} onEdit={handleTaskEdit} onDelete={handleTaskDelete} />
              ))}
              {answeredQuestions.map(q => (
                <div key={q.id} className="flex items-start gap-2 py-1 px-1">
                  <span className="text-success text-xs mt-0.5 shrink-0">A</span>
                  <div className="min-w-0">
                    <p className="text-sm text-text-muted line-through">{q.question}</p>
                    <p className="text-xs text-text-secondary">{q.answer}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function TaskRow({ task: t, onToggle, onEdit, onDelete }: {
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
    <div className="flex items-center gap-2 py-1 px-1 group">
      <button onClick={() => onToggle(t)}
        className={`size-3.5 rounded shrink-0 transition-colors ${
          done ? "bg-success/20 border border-success/30 flex items-center justify-center" : "border border-border-subtle hover:border-accent"
        }`}>
        {done && <span className="text-success text-[8px]">✓</span>}
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

function QuestionRow({ question: q, onAnswer, onDelete }: {
  question: Question;
  onAnswer: (q: Question, answer: string) => void;
  onDelete: (q: Question) => void;
}) {
  const [answering, setAnswering] = useState(false);
  const [text, setText] = useState("");

  const submit = () => {
    if (!text.trim()) return;
    onAnswer(q, text.trim());
    setAnswering(false);
    setText("");
  };

  return (
    <div className="flex items-start gap-2 py-1 px-1 group rounded hover:bg-surface/50">
      <span className="text-warn text-xs mt-0.5 shrink-0 font-bold">?</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-warn/90">{q.question}</p>
        {answering ? (
          <div className="flex gap-2 mt-1">
            <input autoFocus value={text} onChange={e => setText(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") submit(); if (e.key === "Escape") setAnswering(false); }}
              className="flex-1 text-sm bg-transparent border border-border rounded px-2 py-0.5 text-text outline-none"
              placeholder="Answer..." />
            <button onClick={submit} className="text-xs text-success hover:text-success/80">save</button>
          </div>
        ) : (
          <div className="flex gap-2 mt-0.5">
            <button onClick={() => setAnswering(true)}
              className="text-[10px] text-text-muted hover:text-text-secondary">
              answer
            </button>
          </div>
        )}
      </div>
      <button onClick={() => onDelete(q)}
        className="text-[10px] text-text-muted hover:text-urgent px-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">×</button>
    </div>
  );
}
