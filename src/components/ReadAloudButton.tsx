"use client";

import { CircleNotch, SpeakerHigh, Square } from "@phosphor-icons/react";
import { useSyncExternalStore } from "react";
import { getReadAloudState, subscribeReadAloud } from "@/lib/tts/store";

type ReadAloudButtonProps = {
  messageId: string;
  text: string;
  disabled?: boolean;
  onSpeak: (messageId: string, text: string) => void;
  onStop: () => void;
};

export function ReadAloudButton({
  messageId,
  text,
  disabled = false,
  onSpeak,
  onStop,
}: ReadAloudButtonProps) {
  const state = useSyncExternalStore(subscribeReadAloud, getReadAloudState, getReadAloudState);
  const active = state.activeMessageId === messageId;
  const loading = active && state.status === "loading";
  const playing = active && state.status === "playing";

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => {
        if (playing || loading) onStop();
        else onSpeak(messageId, text);
      }}
      aria-label={playing ? "Stop reading aloud" : loading ? "Loading speech" : "Read aloud"}
      className="-ml-[5px] inline-flex h-6 w-6 items-center justify-center rounded text-ink-400 hover:text-ink-50 disabled:opacity-40"
    >
      {loading ? (
        <CircleNotch className="h-3.5 w-3.5 animate-spin" weight="bold" />
      ) : playing ? (
        <Square className="h-3.5 w-3.5" weight="fill" />
      ) : (
        <SpeakerHigh className="h-3.5 w-3.5" weight="bold" />
      )}
    </button>
  );
}
