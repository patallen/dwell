const API = "http://127.0.0.1:7777";

export interface Entity {
  id: string;
  type: "task" | "project" | "area" | "thought";
  title: string;
  body: string;
  tags: string[];
  links: string[];
  status: string;
  priority: string | null;
  due: string | null;
  created_at: string;
  updated_at: string;
}

export async function fetchEntities(params?: Record<string, string>): Promise<Entity[]> {
  const url = new URL(`${API}/entities`);
  if (params) {
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  }
  const res = await fetch(url.toString());
  return res.json();
}

export async function fetchInbox(): Promise<Entity[]> {
  const res = await fetch(`${API}/inbox`);
  return res.json();
}

export async function createEntity(data: {
  type?: string;
  title: string;
  body?: string;
  tags?: string[];
  status?: string;
  priority?: string;
}): Promise<Entity> {
  const res = await fetch(`${API}/entities`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function updateEntity(
  id: string,
  data: Partial<Pick<Entity, "title" | "body" | "tags" | "status" | "priority">>
): Promise<Entity> {
  const res = await fetch(`${API}/entities/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function deleteEntity(id: string): Promise<void> {
  await fetch(`${API}/entities/${id}`, { method: "DELETE" });
}
