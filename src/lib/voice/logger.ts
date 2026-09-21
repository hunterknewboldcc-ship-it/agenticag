import { redact } from "@/lib/voice/redact";

export type VoiceLogKind =
  | "start"
  | "token.ok"
  | "mic.ok"
  | "env"
  | "ws.connecting"
  | "ws.open"
  | "ws.error"
  | "ws.close"
  | "client"
  | "server"
  | "phase"
  | "audio.in"
  | "audio.flush"
  | "audio.out.first"
  | "audio.out"
  | "play.stop"
  | "stop"
  | "error";

type LogData = Record<string, unknown>;

export type VoiceLogger = {
  sessionId: string;
  log: (kind: string, data?: LogData) => void;
  server: (event: Record<string, unknown>, extra?: LogData) => void;
  client: (event: Record<string, unknown>) => void;
  error: (where: string, err: unknown, extra?: LogData) => void;
  flush: (final?: boolean) => void;
  close: () => void;
};

function errorFields(err: unknown): { name: string; message: string } {
  if (err instanceof Error) return { name: err.name, message: err.message };
  return { name: "Error", message: String(err) };
}

export function createVoiceLogger(sessionId: string, sink: string): VoiceLogger {
  const buffer: Record<string, unknown>[] = [];
  const started = Date.now();
  let timer: ReturnType<typeof setTimeout> | null = null;
  let closed = false;

  function enqueue(kind: string, data: LogData) {
    if (closed && kind !== "stop") return;
    try {
      const entry = {
        ...redact(data),
        t: Date.now() - started,
        ts: Date.now(),
        kind,
      };
      buffer.push(entry);
      if (process.env.NODE_ENV !== "production") {
        console.debug("[voice]", kind, data);
      }
      if (buffer.length >= 200) {
        flush(false);
      } else if (!timer) {
        timer = setTimeout(() => {
          timer = null;
          flush(false);
        }, 1000);
      }
    } catch {
      // logging must never throw into the voice path
    }
  }

  function flush(final = false) {
    try {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      if (buffer.length === 0) return;
      const entries = buffer.splice(0, buffer.length);
      const body = JSON.stringify({ sessionId, entries });
      const keepalive = final;
      void fetch(sink, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        keepalive,
      }).catch(() => undefined);
    } catch {
      // swallow transport errors
    }
  }

  return {
    sessionId,
    log: (kind, data = {}) => enqueue(kind, data),
    server: (event, extra = {}) => enqueue("server", { ...redact(event), ...extra }),
    client: (event) => enqueue("client", redact(event)),
    error: (where, err, extra = {}) => enqueue("error", { where, ...errorFields(err), ...extra }),
    flush,
    close: () => {
      closed = true;
      flush(true);
    },
  };
}
