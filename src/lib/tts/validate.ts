export const VOICE_ID_RE = /^[a-z0-9-]{1,64}$/;
export const LANGUAGE_RE = /^(auto|[A-Za-z]{2,3}(?:-[A-Za-z]{2})?)$/;
export const DEFAULT_VOICE_ID = "eve";
export const DEFAULT_LANGUAGE = "auto";

export type TtsRequest = {
  text: string;
  voice_id: string;
  language: string;
  speed?: number;
};

export type ParseTtsResult =
  | { ok: true; value: TtsRequest }
  | { ok: false; status: number; error: string };

function asRecord(body: unknown): Record<string, unknown> | null {
  if (typeof body !== "object" || body === null || Array.isArray(body)) return null;
  return body as Record<string, unknown>;
}

export function parseTtsRequest(body: unknown): ParseTtsResult {
  const record = asRecord(body);
  if (!record) {
    return { ok: false, status: 400, error: "Expected a JSON object." };
  }

  const text = typeof record.text === "string" ? record.text : "";
  if (!text.trim()) {
    return { ok: false, status: 400, error: "TTS text must be 1–15,000 chars." };
  }
  if (text.length > 15_000) {
    return { ok: false, status: 400, error: "TTS text must be 1–15,000 chars." };
  }

  const voiceId =
    typeof record.voice_id === "string" && record.voice_id.trim()
      ? record.voice_id.trim().toLowerCase()
      : DEFAULT_VOICE_ID;
  if (!VOICE_ID_RE.test(voiceId)) {
    return { ok: false, status: 400, error: "Invalid voice_id." };
  }

  const language =
    typeof record.language === "string" && record.language.trim()
      ? record.language.trim()
      : DEFAULT_LANGUAGE;
  if (!LANGUAGE_RE.test(language)) {
    return { ok: false, status: 400, error: "Invalid language." };
  }

  let speed: number | undefined;
  if (record.speed !== undefined) {
    if (typeof record.speed !== "number" || Number.isNaN(record.speed)) {
      return { ok: false, status: 400, error: "Invalid speed." };
    }
    if (record.speed < 0.7 || record.speed > 1.5) {
      return { ok: false, status: 400, error: "Speed must be between 0.7 and 1.5." };
    }
    speed = record.speed;
  }

  return {
    ok: true,
    value: {
      text,
      voice_id: voiceId,
      language,
      speed,
    },
  };
}
