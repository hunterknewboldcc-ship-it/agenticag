import { prepareSpeakableText, splitForTts } from "@/lib/tts/prepareText";
import {
  getReadAloudState,
  resetReadAloudState,
  setReadAloudState,
} from "@/lib/tts/store";

const DEFAULT_VOICE = "eve";
const DEFAULT_LANGUAGE = "auto";

let current: HTMLAudioElement | null = null;
let objectUrl: string | null = null;
let generation = 0;
const blobCache = new Map<string, Blob>();

function cacheKey(text: string, voiceId: string, language: string, speed: number): string {
  return `${voiceId}|${language}|${speed}|${text}`;
}

function revokeCurrentUrl(): void {
  if (objectUrl) {
    URL.revokeObjectURL(objectUrl);
    objectUrl = null;
  }
}

export function stopReadAloud(): void {
  generation += 1;
  current?.pause();
  current = null;
  revokeCurrentUrl();
  resetReadAloudState();
}

async function fetchPart(text: string, voiceId: string, language: string, speed: number): Promise<Blob> {
  const key = cacheKey(text, voiceId, language, speed);
  const cached = blobCache.get(key);
  if (cached) return cached;

  const res = await fetch("/api/tts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text,
      voice_id: voiceId,
      language,
      speed,
    }),
  });
  if (!res.ok) {
    const payload: unknown = await res.json().catch(() => null);
    const message =
      typeof payload === "object" &&
      payload !== null &&
      typeof (payload as { error?: unknown }).error === "string"
        ? (payload as { error: string }).error
        : "TTS request failed";
    throw new Error(message);
  }
  const blob = await res.blob();
  blobCache.set(key, blob);
  return blob;
}

function playBlob(blob: Blob): Promise<void> {
  return new Promise((resolve, reject) => {
    revokeCurrentUrl();
    objectUrl = URL.createObjectURL(blob);
    const audio = new Audio(objectUrl);
    current = audio;
    audio.addEventListener("ended", () => {
      URL.revokeObjectURL(objectUrl ?? "");
      if (objectUrl) objectUrl = null;
      if (current === audio) current = null;
      resolve();
    });
    audio.addEventListener("error", () => {
      reject(new Error("Audio playback failed."));
    });
    void audio.play().catch(reject);
  });
}

export async function readAloud(
  messageId: string,
  markdown: string,
  voiceId = DEFAULT_VOICE,
  language = DEFAULT_LANGUAGE,
  speed = 1,
): Promise<void> {
  const existing = getReadAloudState();
  if (existing.activeMessageId === messageId && existing.status === "playing") {
    stopReadAloud();
    return;
  }

  stopReadAloud();
  const token = generation;
  setReadAloudState({ activeMessageId: messageId, status: "loading", error: null });

  try {
    const prepared = prepareSpeakableText(markdown);
    if (!prepared) {
      throw new Error("Nothing to speak.");
    }
    const parts = splitForTts(prepared);
    for (let i = 0; i < parts.length; i += 1) {
      if (token !== generation) return;
      const part = parts[i];
      if (!part) continue;
      const next = parts[i + 1];
      const blobPromise = fetchPart(part, voiceId, language, speed);
      const prefetch = next ? fetchPart(next, voiceId, language, speed) : null;
      const blob = await blobPromise;
      if (token !== generation) return;
      setReadAloudState({ activeMessageId: messageId, status: "playing", error: null });
      await playBlob(blob);
      if (prefetch) await prefetch.catch(() => undefined);
    }
    if (token === generation) resetReadAloudState();
  } catch (err) {
    if (token !== generation) return;
    const message = err instanceof Error ? err.message : "TTS request failed";
    setReadAloudState({ status: "idle", error: message });
  }
}
