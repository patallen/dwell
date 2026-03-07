const API = "http://127.0.0.1:7777";

export interface Task {
  id: string;
  title: string;
  body: string;
  status: "open" | "done" | "dropped";
  loe: "hot" | "warm" | "cool" | null;
  deadline: string | null;
  parent: string | null;
  created_at: string;
  updated_at: string;
  last_viewed: string | null;
}

export interface ContextEntry {
  type: string;
  ref_id: string;
  reason: string;
  pushed_at: string;
  task?: Task | null;
}

export interface Suggestion {
  task: Task;
  reason: string;
}

export interface FocusState {
  state: "focused" | "suggesting" | "empty";
  task?: Task | null;
  suggestions?: Suggestion[];
  context?: ContextEntry;
  stack_depth?: number;
}

export async function fetchFocus(): Promise<FocusState> {
  const res = await fetch(`${API}/focus`);
  return res.json();
}

export async function pushContext(refId: string, type = "task", reason = ""): Promise<FocusState> {
  const res = await fetch(`${API}/context/push`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type, ref_id: refId, reason }),
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
  parent?: string;
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
  data: Partial<Pick<Task, "title" | "body" | "status" | "loe" | "deadline" | "parent">>
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
