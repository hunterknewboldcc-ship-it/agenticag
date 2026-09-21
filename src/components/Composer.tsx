"use client";

import { ArrowUp, Square, Waveform } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { composerButtonMode, type ComposerButtonMode } from "@/lib/chat/composerMode";
import type { VoicePhase } from "@/lib/chat/types";

type ComposerProps = {
  value: string;
  phase: VoicePhase;
  streaming: boolean;
  disabled?: boolean;
  sessionId: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onToggleVoice: () => void;
  onStopStream: () => void;
};

function animationMs(phase: VoicePhase): number {
  switch (phase) {
    case "speaking":
      return 350;
    case "listening":
      return 900;
    case "connecting":
    case "thinking":
      return 1400;
    case "idle":
      return 900;
    default: {
      const _exhaustive: never = phase;
      return _exhaustive;
    }
  }
}

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => setReduced(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

function LiveWaveform({ phase }: { phase: VoicePhase }) {
  const reduced = useReducedMotion();
  const duration = animationMs(phase);
  const dimmed = phase === "connecting" || phase === "thinking";

  return (
    <span
      className="flex h-4 items-center gap-[2px]"
      style={{ opacity: dimmed ? 0.75 : 1 }}
      aria-hidden="true"
    >
      {[0, 1, 2, 3].map((i) => (
        <span
          key={i}
          className="voice-bar inline-block w-[3px] rounded-sm bg-ink-900"
          style={{
            height: 16,
            animation: reduced ? undefined : `voice-bar ${duration}ms ease-in-out ${i * 120}ms infinite`,
            transform: reduced ? `scaleY(${0.4 + (i % 3) * 0.2})` : undefined,
          }}
        />
      ))}
    </span>
  );
}

export function Composer({
  value,
  phase,
  streaming,
  disabled = false,
  sessionId,
  onChange,
  onSubmit,
  onToggleVoice,
  onStopStream,
}: ComposerProps) {
  const mode = composerButtonMode(value, phase, streaming);
  const placeholder =
    phase === "idle" ? "Message Grok, or tap the waveform to talk" : phasePlaceholder(phase);

  function onPrimary() {
    switch (mode) {
      case "send":
        onSubmit();
        return;
      case "stop":
        onStopStream();
        return;
      case "live":
      case "waveform":
        onToggleVoice();
        return;
      default: {
        const _exhaustive: never = mode;
        return _exhaustive;
      }
    }
  }

  const label = primaryLabel(mode);

  return (
    <div className="rounded-2xl border border-white/10 bg-ink-800 px-3 py-2 shadow-[0_0_0_1px_rgba(255,255,255,0.02)]">
      <span className="sr-only" role="status">
        {phase === "idle"
          ? ""
          : `${phasePlaceholder(phase).replace("…", "")}${sessionId ? ` · session ${sessionId}` : ""}`}
      </span>
      <div className="flex items-end gap-2">
        <textarea
          value={value}
          disabled={disabled}
          placeholder={placeholder}
          rows={1}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              if (value.trim()) onSubmit();
            }
          }}
          className="max-h-40 min-h-10 flex-1 resize-none bg-transparent py-2 text-[15px] leading-6 text-ink-50 placeholder:text-ink-400 focus:outline-none"
        />
        <button
          type="button"
          disabled={disabled}
          onClick={onPrimary}
          aria-label={label}
          className="mb-1 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent text-ink-900 hover:bg-accent-dim disabled:opacity-40"
        >
          {mode === "live" ? (
            <LiveWaveform phase={phase} />
          ) : mode === "send" ? (
            <ArrowUp className="h-4 w-4" weight="bold" />
          ) : mode === "stop" ? (
            <Square className="h-3.5 w-3.5" weight="fill" />
          ) : (
            <Waveform className="h-4 w-4" weight="bold" />
          )}
        </button>
      </div>
    </div>
  );
}

function phasePlaceholder(phase: VoicePhase): string {
  switch (phase) {
    case "idle":
      return "Message Grok, or tap the waveform to talk";
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

function primaryLabel(mode: ComposerButtonMode): string {
  switch (mode) {
    case "waveform":
      return "Start voice mode";
    case "send":
      return "Send message";
    case "stop":
      return "Stop generating";
    case "live":
      return "End voice mode";
    default: {
      const _exhaustive: never = mode;
      return _exhaustive;
    }
  }
}
