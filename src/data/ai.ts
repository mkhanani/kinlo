import { db } from "./driver";
import type { AiMessage, AiRole, AiThread } from "./types";
import { newId, nowIso } from "./util";

interface MessageRow extends Omit<AiMessage, "content"> {
  content: string;
}

export async function listThreads(): Promise<AiThread[]> {
  return db().select<AiThread>("SELECT * FROM ai_threads ORDER BY updated_at DESC");
}

export async function createThread(title = ""): Promise<AiThread> {
  const id = newId();
  const now = nowIso();
  await db().execute("INSERT INTO ai_threads (id, title, created_at, updated_at) VALUES ($1, $2, $3, $3)", [
    id,
    title.trim(),
    now,
  ]);
  return { id, title: title.trim(), created_at: now, updated_at: now };
}

export async function renameThread(id: string, title: string): Promise<void> {
  await db().execute("UPDATE ai_threads SET title = $2, updated_at = $3 WHERE id = $1", [id, title.trim(), nowIso()]);
}

export async function deleteThread(id: string): Promise<void> {
  await db().execute("DELETE FROM ai_threads WHERE id = $1", [id]);
}

export async function listMessages<Content = unknown>(threadId: string): Promise<AiMessage<Content>[]> {
  const rows = await db().select<MessageRow>(
    "SELECT * FROM ai_messages WHERE thread_id = $1 ORDER BY created_at, rowid",
    [threadId],
  );
  return rows.map((row) => ({ ...row, content: JSON.parse(row.content) as Content }));
}

export async function addMessage<Content>(threadId: string, role: AiRole, content: Content): Promise<AiMessage<Content>> {
  const id = newId();
  const now = nowIso();
  await db().execute(
    "INSERT INTO ai_messages (id, thread_id, role, content, created_at) VALUES ($1, $2, $3, $4, $5)",
    [id, threadId, role, JSON.stringify(content), now],
  );
  await db().execute("UPDATE ai_threads SET updated_at = $2 WHERE id = $1", [threadId, now]);
  return { id, thread_id: threadId, role, content, created_at: now };
}
