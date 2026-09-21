const AUDIO_EVENT_TYPES = new Set([
  "response.output_audio.delta",
  "response.audio.delta",
  "input_audio_buffer.append",
]);

const MAX_STRING = 400;
const MAX_ARRAY = 50;
const MAX_DEPTH = 4;

function base64Bytes(value: string): number {
  try {
    return Math.floor((value.length * 3) / 4) - (value.endsWith("==") ? 2 : value.endsWith("=") ? 1 : 0);
  } catch {
    return value.length;
  }
}

export function cutString(value: string): string {
  if (value.length <= MAX_STRING) return value;
  return `${value.slice(0, MAX_STRING)}…[${value.length} chars]`;
}

function redactValue(value: unknown, depth: number): unknown {
  if (depth >= MAX_DEPTH) return "[depth]";
  if (typeof value === "string") return cutString(value);
  if (value === null || value === undefined) return value;
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) {
    const sliced = value.slice(0, MAX_ARRAY);
    return sliced.map((item) => redactValue(item, depth + 1));
  }
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value)) {
      out[key] = redactValue(nested, depth + 1);
    }
    return out;
  }
  return String(value);
}

export function redact(data: unknown): Record<string, unknown> {
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    return { value: redactValue(data, 0) };
  }
  const record = data as Record<string, unknown>;
  const type = typeof record.type === "string" ? record.type : undefined;
  if (type && AUDIO_EVENT_TYPES.has(type)) {
    const payload = typeof record.delta === "string" ? record.delta : typeof record.audio === "string" ? record.audio : "";
    const rest: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(record)) {
      if (key === "delta" || key === "audio") continue;
      rest[key] = nested;
    }
    return {
      ...((redactValue(rest, 0) as Record<string, unknown>) ?? {}),
      type,
      bytes: payload ? base64Bytes(payload) : 0,
    };
  }
  return redactValue(record, 0) as Record<string, unknown>;
}
