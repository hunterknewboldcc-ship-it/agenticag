import { getXaiApiKey } from "@/lib/server/config";
import { writeServerTokenLog } from "@/lib/server/voiceLog";
import { isSessionId } from "@/lib/voice/sessionId";

const CLIENT_SECRETS_URL = "https://api.x.ai/v1/realtime/client_secrets";

export type EphemeralSecret = {
  value: string;
  expires_at?: number;
};

function asRecord(body: unknown): Record<string, unknown> | null {
  if (typeof body !== "object" || body === null || Array.isArray(body)) return null;
  return body as Record<string, unknown>;
}

export function extractClientSecret(payload: unknown): string | null {
  const record = asRecord(payload);
  if (!record) return null;
  if (typeof record.value === "string" && record.value) return record.value;
  const nested = asRecord(record.client_secret);
  if (nested && typeof nested.value === "string" && nested.value) return nested.value;
  if (typeof record.client_secret === "string" && record.client_secret) {
    return record.client_secret;
  }
  return null;
}

export async function mintRealtimeSecret(sessionId?: string): Promise<{
  status: number;
  body: Record<string, unknown>;
}> {
  const key = getXaiApiKey();
  if (!key) {
    await writeServerTokenLog(sessionId, {
      ok: false,
      status: 500,
      ms: 0,
      upstream: "missing_key",
    });
    return { status: 500, body: { error: "xAI API key is not configured." } };
  }

  const started = Date.now();
  let upstream = "unknown";
  let status = 500;
  try {
    const res = await fetch(CLIENT_SECRETS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ expires_after: { seconds: 300 } }),
    });
    status = res.status;
    upstream = new URL(res.url).host;
    const payload: unknown = await res.json().catch(() => null);
    const ms = Date.now() - started;
    await writeServerTokenLog(sessionId, {
      ok: res.ok,
      status,
      ms,
      upstream,
    });
    if (!res.ok) {
      return { status: res.status >= 400 ? res.status : 502, body: { error: "Failed to mint realtime token." } };
    }
    const value = extractClientSecret(payload);
    if (!value) {
      return { status: 502, body: { error: "Realtime token response was missing a value." } };
    }
    const record = asRecord(payload);
    const expiresAt =
      typeof record?.expires_at === "number"
        ? record.expires_at
        : typeof asRecord(record?.client_secret)?.expires_at === "number"
          ? (asRecord(record?.client_secret)?.expires_at as number)
          : undefined;
    return { status: 200, body: { value, expires_at: expiresAt } };
  } catch {
    await writeServerTokenLog(sessionId, {
      ok: false,
      status,
      ms: Date.now() - started,
      upstream,
    });
    return { status: 502, body: { error: "Failed to mint realtime token." } };
  }
}

export function sessionIdFromRequest(body: unknown, header: string | null): string | undefined {
  const record = asRecord(body);
  const fromBody = typeof record?.sessionId === "string" ? record.sessionId : "";
  const fromHeader = header?.trim() ?? "";
  const candidate = fromBody || fromHeader;
  return isSessionId(candidate) ? candidate : undefined;
}
