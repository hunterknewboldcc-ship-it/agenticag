"use client";

import { useEffect, useRef, useState } from "react";
import { Composer } from "@/components/Composer";
import { MessageList } from "@/components/MessageList";
import { readChatSse } from "@/lib/chat/sse";
import { WELCOME_MESSAGE, type ChatMessage, type VoicePhase } from "@/lib/chat/types";
import { readAloud, stopReadAloud } from "@/lib/tts/player";
import { getReadAloudState, subscribeReadAloud } from "@/lib/tts/store";
import { RealtimeVoiceSession } from "@/lib/voice/realtimeClient";

export function ChatApp() {
  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME_MESSAGE]);
  const [draft, setDraft] = useState("");
  const [phase, setPhase] = useState<VoicePhase>("idle");
  const [sessionId, setSessionId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [autoSpeak, setAutoSpeak] = useState(false);
  const [hasKey, setHasKey] = useState<boolean | null>(null);
  const [streaming, setStreaming] = useState(false);
  const voiceRef = useRef<RealtimeVoiceSession | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const autoSpeakRef = useRef(false);
  const messagesRef = useRef(messages);

  useEffect(() => {
    autoSpeakRef.current = autoSpeak;
  }, [autoSpeak]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    const unsub = subscribeReadAloud(() => {
      const state = getReadAloudState();
      if (state.error) setError(state.error);
    });
    return unsub;
  }, []);

  useEffect(() => {
    void fetch("/api/health")
      .then((res) => res.json())
      .then((body: { hasXaiKey?: boolean }) => setHasKey(Boolean(body.hasXaiKey)))
      .catch(() => setHasKey(false));
  }, []);

  useEffect(() => {
    const session = new RealtimeVoiceSession({
      onPhase: (next, id) => {
        setPhase(next);
        setSessionId(id);
      },
      onError: (message) => setError(message),
      onUserCommitted: (itemId) => {
        setMessages((prev) => {
          if (prev.some((row) => row.id === itemId)) return prev;
          return [...prev, { id: itemId, role: "user", content: "", source: "voice", streaming: true }];
        });
      },
      onUserTranscript: (itemId, text) => {
        setMessages((prev) =>
          prev.map((row) => (row.id === itemId ? { ...row, content: text, streaming: false } : row)),
        );
      },
      onAssistantDelta: (responseId, delta) => {
        setMessages((prev) => {
          const existing = prev.find((row) => row.id === responseId);
          if (!existing) {
            return [
              ...prev,
              { id: responseId, role: "assistant", content: delta, source: "voice", streaming: true },
            ];
          }
          return prev.map((row) =>
            row.id === responseId ? { ...row, content: row.content + delta, streaming: true } : row,
          );
        });
      },
      onAssistantDone: (responseId) => {
        setMessages((prev) =>
          prev.map((row) => (row.id === responseId ? { ...row, streaming: false } : row)),
        );
      },
    });
    voiceRef.current = session;
    return () => session.stop();
  }, []);

  async function sendText() {
    const text = draft.trim();
    if (!text || streaming) return;
    setDraft("");
    setError(null);

    const voice = voiceRef.current;
    if (voice?.live) {
      const id = crypto.randomUUID();
      setMessages((prev) => [...prev, { id, role: "user", content: text, source: "text", streaming: false }]);
      voice.sendText(text);
      return;
    }

    const user: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: text,
      source: "text",
      streaming: false,
    };
    const assistantId = crypto.randomUUID();
    const assistant: ChatMessage = {
      id: assistantId,
      role: "assistant",
      content: "",
      source: "text",
      streaming: true,
    };
    const history = [...messagesRef.current.filter((row) => row.id !== "welcome"), user];
    setMessages((prev) => [...prev, user, assistant]);
    setStreaming(true);

    const abort = new AbortController();
    abortRef.current = abort;
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: history.map((row) => ({ role: row.role, content: row.content })),
        }),
        signal: abort.signal,
      });
      if (!res.ok) {
        const payload: unknown = await res.json().catch(() => null);
        const message =
          typeof payload === "object" &&
          payload !== null &&
          typeof (payload as { error?: unknown }).error === "string"
            ? (payload as { error: string }).error
            : "Chat request failed.";
        throw new Error(message);
      }
      let spoken = "";
      await readChatSse(res, (delta) => {
        spoken += delta;
        setMessages((prev) =>
          prev.map((row) =>
            row.id === assistantId ? { ...row, content: row.content + delta } : row,
          ),
        );
      });
      setMessages((prev) =>
        prev.map((row) => (row.id === assistantId ? { ...row, streaming: false } : row)),
      );
      if (autoSpeakRef.current && spoken) {
        void readAloud(assistantId, spoken);
      }
    } catch (err) {
      if ((err as { name?: string }).name === "AbortError") {
        setMessages((prev) =>
          prev.map((row) => (row.id === assistantId ? { ...row, streaming: false } : row)),
        );
        return;
      }
      const message = err instanceof Error ? err.message : "Chat request failed.";
      setError(message);
      setMessages((prev) =>
        prev.map((row) =>
          row.id === assistantId
            ? { ...row, streaming: false, content: row.content || "I could not complete that reply." }
            : row,
        ),
      );
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  }

  function toggleVoice() {
    const voice = voiceRef.current;
    if (!voice) return;
    setError(null);
    if (voice.live) {
      voice.stop();
      return;
    }
    stopReadAloud();
    void voice.start();
  }

  function speak(messageId: string, text: string) {
    if (voiceRef.current?.live) voiceRef.current.stop();
    void readAloud(messageId, text);
  }

  return (
    <div className="flex min-h-dvh flex-col bg-ink-900 text-ink-50">
      <header className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <div>
          <p className="text-sm font-semibold tracking-tight">AgenticAG</p>
          <p className="text-xs text-ink-400">Grok voice + read aloud</p>
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-xs text-ink-400">
          <input
            type="checkbox"
            checked={autoSpeak}
            onChange={(event) => setAutoSpeak(event.target.checked)}
            className="accent-accent"
          />
          Auto-speak replies
        </label>
      </header>

      {hasKey === false ? (
        <div className="border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm text-amber-100">
          Set an xAI API key on the server to enable Grok voice, chat, and speech.
        </div>
      ) : null}

      <MessageList messages={messages} onSpeak={speak} onStopSpeak={stopReadAloud} />

      <div className="sticky bottom-0 mx-auto w-full max-w-2xl space-y-2 px-4 pb-6">
        {error ? <p className="text-sm text-rose-300">{error}</p> : null}
        <Composer
          value={draft}
          phase={phase}
          streaming={streaming}
          sessionId={sessionId}
          onChange={setDraft}
          onSubmit={() => void sendText()}
          onToggleVoice={toggleVoice}
          onStopStream={() => abortRef.current?.abort()}
        />
        <p className="px-1 text-[11px] text-ink-400">
          Use headphones in voice mode so the mic does not hear Grok and answer itself.
        </p>
      </div>
    </div>
  );
}
