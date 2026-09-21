"use client";

import { ReadAloudButton } from "@/components/ReadAloudButton";
import type { ChatMessage } from "@/lib/chat/types";

type MessageListProps = {
  messages: ChatMessage[];
  onSpeak: (messageId: string, text: string) => void;
  onStopSpeak: () => void;
};

export function MessageList({ messages, onSpeak, onStopSpeak }: MessageListProps) {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-8">
      {messages.map((message) => (
        <article key={message.id} className={message.role === "user" ? "ml-10" : "mr-6"}>
          <p className="mb-1 text-[11px] uppercase tracking-[0.14em] text-ink-400">
            {message.role === "user" ? "You" : "Grok"}
          </p>
          <p className="whitespace-pre-wrap text-[15px] leading-7 text-ink-50">{message.content}</p>
          {message.role === "assistant" && !message.streaming ? (
            <div className="mt-1">
              <ReadAloudButton
                messageId={message.id}
                text={message.content}
                onSpeak={onSpeak}
                onStop={onStopSpeak}
              />
            </div>
          ) : null}
        </article>
      ))}
    </div>
  );
}
