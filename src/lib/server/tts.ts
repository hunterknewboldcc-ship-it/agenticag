import { getXaiApiKey } from "@/lib/server/config";
import type { TtsRequest } from "@/lib/tts/validate";

const TTS_URL = "https://api.x.ai/v1/tts";

export type TtsUpstreamResult =
  | { ok: true; body: ReadableStream<Uint8Array> | null; contentType: string }
  | { ok: false; status: number; error: string };

export async function synthesizeSpeech(request: TtsRequest): Promise<TtsUpstreamResult> {
  const key = getXaiApiKey();
  if (!key) {
    return { ok: false, status: 500, error: "XAI_API_KEY is not configured." };
  }

  const payload: Record<string, unknown> = {
    text: request.text,
    voice_id: request.voice_id,
    language: request.language,
    text_normalization: true,
  };
  if (request.speed !== undefined) payload.speed = request.speed;

  const res = await fetch(TTS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (res.status === 404) {
    return { ok: false, status: 404, error: "Unknown voice." };
  }
  if (!res.ok) {
    return {
      ok: false,
      status: res.status >= 400 ? res.status : 502,
      error: `TTS ${res.status}`,
    };
  }

  return {
    ok: true,
    body: res.body,
    contentType: res.headers.get("content-type") ?? "audio/mpeg",
  };
}
