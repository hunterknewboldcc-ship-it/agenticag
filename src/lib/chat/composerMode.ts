import type { VoicePhase } from "@/lib/chat/types";

export type ComposerButtonMode = "waveform" | "send" | "stop" | "live";

export function composerButtonMode(
  value: string,
  phase: VoicePhase,
  streaming: boolean,
): ComposerButtonMode {
  if (value.trim()) return "send";
  if (streaming && phase === "idle") return "stop";
  if (phase !== "idle") return "live";
  return "waveform";
}
