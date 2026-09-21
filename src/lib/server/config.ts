export function getXaiApiKey(): string | null {
  const key = process.env.XAI_API_KEY?.trim();
  return key ? key : null;
}

export function getChatModel(): string {
  return process.env.XAI_CHAT_MODEL?.trim() || "grok-4-fast";
}

export function isVoiceLogEnabled(): boolean {
  if (process.env.VOICE_LOG === "1") return true;
  return process.env.NODE_ENV !== "production";
}
