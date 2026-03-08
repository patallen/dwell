const API = "http://127.0.0.1:7777";

export interface Note {
  id: string;
  title: string;
  body: string;
  note_type: "project" | "meeting" | "one_on_one" | "research" | null;
  status: "active" | "paused" | "done" | "dropped";
  parent: string | null;
  deadline: string | null;
  created_at: string;
  updated_at: string;
  last_viewed: string | null;
  file_path: string;
}

export interface Task {
  id: string;
  title: string;
  body: string;
  status: "open" | "done" | "dropped";
  loe: "hot" | "warm" | "cool" | null;
  deadline: string | null;
  note_id: string | null;
  created_at: string;
  updated_at: string;
  last_viewed: string | null;
  completed_at: string | null;
}

export interface Question {
  id: string;
  question: string;
  answer: string;
  notes: string;
  status: "open" | "answered";
  note_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface ContextEntry {
  type: string;
  ref_id: string;
  reason: string;
  memo?: string | null;
  pushed_at: string;
  task?: Task | null;
  note?: Note | null;
  question?: Question | null;
}

export interface Suggestion {
  type: "task" | "note";
  task?: Task;
  note?: Note;
  reason: string;
}

export interface PoppedEntry {
  type: string;
  ref_id: string;
  reason: string;
  memo?: string | null;
}

export interface FocusState {
  state: "focused" | "suggesting" | "empty";
  task?: Task | null;
  note?: Note | null;
  question?: Question | null;
  suggestions?: Suggestion[];
  context?: ContextEntry;
  stack_depth?: number;
  popped?: PoppedEntry;
}

export type EnergyLevel = "calm" | "neutral" | "rough";

// --- Focus ---

export async function fetchFocus(energy?: EnergyLevel): Promise<FocusState> {
  const url = energy ? `${API}/focus?energy=${energy}` : `${API}/focus`;
  const res = await fetch(url);
  return res.json();
}

// --- Context Stack ---

export async function pushContext(refId: string, type = "task", reason = "", memoForCurrent?: string): Promise<FocusState> {
  const res = await fetch(`${API}/context/push`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type, ref_id: refId, reason, memo_for_current: memoForCurrent || null }),
  });
  return res.json();
}

export async function setContextMemo(memo: string): Promise<FocusState> {
  const res = await fetch(`${API}/context/memo`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ memo }),
  });
  return res.json();
}

export async function popContext(): Promise<FocusState> {
  const res = await fetch(`${API}/context/pop`, { method: "POST" });
  return res.json();
}

export async function fetchContext(): Promise<ContextEntry[]> {
  const res = await fetch(`${API}/context`);
  return res.json();
}

export async function removeContext(refId: string): Promise<FocusState> {
  const res = await fetch(`${API}/context/${refId}`, { method: "DELETE" });
  return res.json();
}

// --- Notes ---

export async function fetchNotes(params?: Record<string, string>): Promise<Note[]> {
  const url = new URL(`${API}/notes`);
  if (params) {
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  }
  const res = await fetch(url.toString());
  return res.json();
}

export async function fetchNote(id: string): Promise<Note> {
  const res = await fetch(`${API}/notes/${id}`);
  return res.json();
}

export async function createNote(data: {
  title: string;
  body?: string;
  note_type?: string;
  status?: string;
  parent?: string;
  deadline?: string;
}): Promise<Note> {
  const res = await fetch(`${API}/notes`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function updateNote(
  id: string,
  data: Partial<Pick<Note, "title" | "body" | "note_type" | "status" | "parent" | "deadline">>
): Promise<Note> {
  const res = await fetch(`${API}/notes/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function deleteNote(id: string): Promise<void> {
  await fetch(`${API}/notes/${id}`, { method: "DELETE" });
}

export async function fetchNoteChildren(noteId: string): Promise<Note[]> {
  const res = await fetch(`${API}/notes/${noteId}/children`);
  return res.json();
}

export async function fetchNoteTasks(noteId: string): Promise<Task[]> {
  const res = await fetch(`${API}/notes/${noteId}/tasks`);
  return res.json();
}

export async function fetchNoteQuestions(noteId: string): Promise<Question[]> {
  const res = await fetch(`${API}/notes/${noteId}/questions`);
  return res.json();
}

// --- Tasks ---

export async function fetchTasks(params?: Record<string, string>): Promise<Task[]> {
  const url = new URL(`${API}/tasks`);
  if (params) {
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  }
  const res = await fetch(url.toString());
  return res.json();
}

export async function createTask(data: {
  title: string;
  body?: string;
  status?: string;
  loe?: string;
  deadline?: string;
  note_id?: string;
}): Promise<Task> {
  const res = await fetch(`${API}/tasks`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function updateTask(
  id: string,
  data: Partial<Pick<Task, "title" | "body" | "status" | "loe" | "deadline" | "note_id">>
): Promise<Task> {
  const res = await fetch(`${API}/tasks/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function deleteTask(id: string): Promise<void> {
  await fetch(`${API}/tasks/${id}`, { method: "DELETE" });
}

// --- Questions ---

export async function fetchQuestions(params?: Record<string, string>): Promise<Question[]> {
  const url = new URL(`${API}/questions`);
  if (params) {
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  }
  const res = await fetch(url.toString());
  return res.json();
}

export async function createQuestion(data: {
  question: string;
  note_id?: string;
}): Promise<Question> {
  const res = await fetch(`${API}/questions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function updateQuestion(
  id: string,
  data: Partial<Pick<Question, "question" | "answer" | "notes" | "status">>
): Promise<Question> {
  const res = await fetch(`${API}/questions/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function deleteQuestion(id: string): Promise<void> {
  await fetch(`${API}/questions/${id}`, { method: "DELETE" });
}
