import { mkdir, appendFile } from "node:fs/promises";
import path from "node:path";
import { isSessionId } from "@/lib/voice/sessionId";

export const SESSION_ID_RE = /^[a-z0-9]{4,64}$/;

export type VoiceLogBody = {
  sessionId: string;
  entries: unknown[];
};

export type VoiceLogResult =
  | { ok: true; status: 204 }
  | { ok: false; status: number; error: string };

function asRecord(body: unknown): Record<string, unknown> | null {
  if (typeof body !== "object" || body === null || Array.isArray(body)) return null;
  return body as Record<string, unknown>;
}

export function parseVoiceLogBody(body: unknown): { ok: true; value: VoiceLogBody } | { ok: false; error: string } {
  const record = asRecord(body);
  if (!record) return { ok: false, error: "Expected a JSON object." };
  const sessionId = typeof record.sessionId === "string" ? record.sessionId : "";
  if (!isSessionId(sessionId) || !SESSION_ID_RE.test(sessionId)) {
    return { ok: false, error: "Invalid sessionId." };
  }
  if (!Array.isArray(record.entries)) {
    return { ok: false, error: "entries must be an array." };
  }
  return { ok: true, value: { sessionId, entries: record.entries } };
}

export async function appendVoiceLog(
  sessionId: string,
  entries: unknown[],
  logDir = path.join(process.cwd(), ".voice-logs"),
): Promise<void> {
  await mkdir(logDir, { recursive: true });
  const lines = entries
    .slice(0, 500)
    .map((entry) => JSON.stringify(entry))
    .filter((line) => line.length < 16_000)
    .join("\n");
  if (!lines) return;
  await appendFile(path.join(logDir, `${sessionId}.ndjson`), `${lines}\n`, "utf8");
}

export async function writeServerTokenLog(
  sessionId: string | undefined,
  fields: { ok: boolean; status: number; ms: number; upstream: string },
): Promise<void> {
  if (!sessionId || !isSessionId(sessionId)) return;
  try {
    await appendVoiceLog(sessionId, [
      {
        ts: Date.now(),
        src: "server",
        kind: "server.token",
        ...fields,
      },
    ]);
  } catch {
    // logging must never throw into the token path
  }
}
