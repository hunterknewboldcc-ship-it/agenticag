export type VoicePhase = "idle" | "connecting" | "listening" | "thinking" | "speaking";

export const VOICE_PHASES: readonly VoicePhase[] = [
  "idle",
  "connecting",
  "listening",
  "thinking",
  "speaking",
] as const;

export function phaseLabel(phase: VoicePhase): string {
  switch (phase) {
    case "idle":
      return "";
    case "connecting":
      return "Connecting…";
    case "listening":
      return "Listening…";
    case "thinking":
      return "Thinking…";
    case "speaking":
      return "Speaking…";
    default: {
      const _exhaustive: never = phase;
      return _exhaustive;
    }
  }
}

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  source: "text" | "voice";
  streaming: boolean;
};

export const WELCOME_MESSAGE: ChatMessage = {
  id: "welcome",
  role: "assistant",
  content:
    "Hi — I'm Grok on AgenticAG. Tap the waveform to talk, or type a message. When a reply finishes, the speaker reads it aloud.",
  source: "text",
  streaming: false,
};
