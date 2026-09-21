import { streamChat, type ChatTurn } from "@/lib/server/chat";

export const runtime = "nodejs";

function isTurn(value: unknown): value is ChatTurn {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    (record.role === "user" || record.role === "assistant") &&
    typeof record.content === "string"
  );
}

export async function POST(request: Request) {
  const body: unknown = await request.json().catch(() => null);
  const messages =
    typeof body === "object" && body !== null && Array.isArray((body as { messages?: unknown }).messages)
      ? (body as { messages: unknown[] }).messages.filter(isTurn)
      : [];
  if (messages.length === 0) {
    return Response.json({ error: "Expected messages." }, { status: 400 });
  }
  return streamChat(messages);
}
