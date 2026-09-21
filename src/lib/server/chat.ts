import { getChatModel, getXaiApiKey } from "@/lib/server/config";

const CHAT_URL = "https://api.x.ai/v1/chat/completions";

export const CHAT_SYSTEM_PROMPT =
  "You are Grok, a helpful assistant in AgenticAG. Write in clear prose. Prefer short paragraphs. Use markdown sparingly.";

export type ChatTurn = {
  role: "user" | "assistant";
  content: string;
};

export async function streamChat(messages: ChatTurn[]): Promise<Response> {
  const key = getXaiApiKey();
  if (!key) {
    return Response.json({ error: "XAI_API_KEY is not configured." }, { status: 500 });
  }

  const res = await fetch(CHAT_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: getChatModel(),
      stream: true,
      messages: [{ role: "system", content: CHAT_SYSTEM_PROMPT }, ...messages],
    }),
  });

  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => "");
    return Response.json(
      { error: detail.trim() || `Chat request failed (${res.status}).` },
      { status: res.status >= 400 ? res.status : 502 },
    );
  }

  return new Response(res.body, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
