const BASE = "http://127.0.0.1:7777";

// --- Generic client ---

async function request<T>(method: string, path: string, params?: Record<string, string>, body?: unknown): Promise<T> {
  const url = new URL(`${BASE}${path}`);
  if (params) for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url.toString(), {
    method,
    ...(body !== undefined && {
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  });
  if (method === "DELETE" && res.status === 204) return undefined as T;
  return res.json();
}

const api = {
  get: <T>(path: string, params?: Record<string, string>) => request<T>("GET", path, params),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, undefined, body),
  patch: <T>(path: string, body?: unknown) => request<T>("PATCH", path, undefined, body),
  del: <T>(path: string) => request<T>("DELETE", path),
};

// --- Types ---

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

export type PendingAction =
  | { type: "push"; refId: string; refType: string; reason: string }
  | { type: "pause" }
  | { type: "done" }
  | { type: "drop" };

export interface AiThread {
  id: string;
  note_id: string;
  action: "elaborate" | "research";
  prompt: string;
  selection_text: string;
  anchor_from: number;
  anchor_to: number;
  status: "streaming" | "ready" | "error" | "accepted" | "dismissed";
  response: string;
  created_at: string;
  updated_at: string;
}

export interface AiStreamRequest {
  action: "research" | "brainstorm" | "breakdown" | "freeform";
  prompt: string;
  note_id?: string;
  selection?: string | null;
  cursor_context?: string | null;
}

export type AiStreamEvent =
  | { type: "delta"; content: string }
  | { type: "thinking" }
  | { type: "done" }
  | { type: "error"; message: string };

// --- Focus ---

export const fetchFocus = (energy?: EnergyLevel) =>
  api.get<FocusState>("/focus", energy ? { energy } : undefined);

// --- Context Stack ---

export const pushContext = (refId: string, type = "task", reason = "", memoForCurrent?: string) =>
  api.post<FocusState>("/context/push", { type, ref_id: refId, reason, memo_for_current: memoForCurrent || null });

export const setContextMemo = (memo: string) =>
  api.post<FocusState>("/context/memo", { memo });

export const popContext = () => api.post<FocusState>("/context/pop");

export const fetchContext = () => api.get<ContextEntry[]>("/context");

export const removeContext = (refId: string) => api.del<FocusState>(`/context/${refId}`);

// --- Notes ---

export const fetchNotes = (params?: Record<string, string>) => api.get<Note[]>("/notes", params);
export const fetchNote = (id: string) => api.get<Note>(`/notes/${id}`);
export const createNote = (data: Partial<Note>) => api.post<Note>("/notes", data);
export const updateNote = (id: string, data: Partial<Note>) => api.patch<Note>(`/notes/${id}`, data);
export const deleteNote = (id: string) => api.del<void>(`/notes/${id}`);
export const fetchNoteChildren = (noteId: string) => api.get<Note[]>(`/notes/${noteId}/children`);
export const fetchNoteTasks = (noteId: string) => api.get<Task[]>(`/notes/${noteId}/tasks`);
export const fetchNoteQuestions = (noteId: string) => api.get<Question[]>(`/notes/${noteId}/questions`);

// --- Tasks ---

export const fetchTasks = (params?: Record<string, string>) => api.get<Task[]>("/tasks", params);
export const createTask = (data: Partial<Task>) => api.post<Task>("/tasks", data);
export const updateTask = (id: string, data: Partial<Task>) => api.patch<Task>(`/tasks/${id}`, data);
export const deleteTask = (id: string) => api.del<void>(`/tasks/${id}`);

// --- Questions ---

export const fetchQuestion = (id: string) => api.get<Question>(`/questions/${id}`);
export const fetchQuestions = (params?: Record<string, string>) => api.get<Question[]>("/questions", params);
export const createQuestion = (data: Partial<Question>) => api.post<Question>("/questions", data);
export const updateQuestion = (id: string, data: Partial<Question>) => api.patch<Question>(`/questions/${id}`, data);
export const deleteQuestion = (id: string) => api.del<void>(`/questions/${id}`);

// --- AI Threads ---

export const fetchNoteAiThreads = (noteId: string) => api.get<AiThread[]>(`/notes/${noteId}/ai-threads`);
export const createAiThread = (data: Partial<AiThread>) => api.post<AiThread>("/ai-threads", data);
export const updateAiThread = (id: string, data: Partial<AiThread>) => api.patch<AiThread>(`/ai-threads/${id}`, data);
export const deleteAiThread = (id: string) => api.del<void>(`/ai-threads/${id}`);
export const stopAiThread = (id: string) => api.post<AiThread>(`/ai-threads/${id}/stop`);

// --- AI Streaming ---

export const fetchAiStatus = () => api.get<{ configured: boolean; model: string | null }>("/ai/status");

export async function streamAi(
  req: AiStreamRequest,
  onEvent: (event: AiStreamEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(`${BASE}/ai/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
    signal,
  });

  if (!res.ok) {
    onEvent({ type: "error", message: `HTTP ${res.status}` });
    return;
  }

  const reader = res.body?.getReader();
  if (!reader) return;
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    for (const line of lines) {
      if (line.startsWith("data: ")) {
        try {
          onEvent(JSON.parse(line.slice(6)) as AiStreamEvent);
        } catch { /* skip malformed */ }
      }
    }
  }
}
