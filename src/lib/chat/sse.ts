export async function readChatSse(
  response: Response,
  onDelta: (text: string) => void,
): Promise<void> {
  if (!response.body) {
    throw new Error("Chat response had no body.");
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split("\n\n");
    buffer = chunks.pop() ?? "";
    for (const chunk of chunks) {
      for (const line of chunk.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const data = trimmed.slice(5).trim();
        if (!data || data === "[DONE]") continue;
        try {
          const parsed: unknown = JSON.parse(data);
          const delta = extractDelta(parsed);
          if (delta) onDelta(delta);
        } catch {
          // ignore malformed sse rows
        }
      }
    }
  }
}

function extractDelta(payload: unknown): string {
  if (typeof payload !== "object" || payload === null) return "";
  const choices = (payload as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) return "";
  const first = choices[0];
  if (typeof first !== "object" || first === null) return "";
  const delta = (first as { delta?: { content?: unknown } }).delta;
  if (typeof delta?.content === "string") return delta.content;
  return "";
}
