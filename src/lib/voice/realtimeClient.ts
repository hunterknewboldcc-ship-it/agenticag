import { TARGET_SAMPLE_RATE, base64ToPcm16, pcm16ToBase64 } from "@/lib/audio/pcm";
import { createVoiceLogger, type VoiceLogger } from "@/lib/voice/logger";
import { startMicCapture, type MicHandle } from "@/lib/voice/micCapture";
import { PcmPlayer } from "@/lib/voice/pcmPlayer";
import { newSessionId } from "@/lib/voice/sessionId";
import { type VoicePhase } from "@/lib/chat/types";

const REALTIME_URL = "wss://api.x.ai/v1/realtime?model=grok-voice-latest";
const LOG_SINK = "/api/voice/log";
const PREOPEN_CAP = 20;

const HANDLED_EVENTS = [
  "session.updated",
  "input_audio_buffer.speech_started",
  "input_audio_buffer.speech_stopped",
  "input_audio_buffer.committed",
  "conversation.item.input_audio_transcription.updated",
  "conversation.item.input_audio_transcription.completed",
  "response.created",
  "response.output_audio.delta",
  "response.audio.delta",
  "response.output_audio_transcript.delta",
  "response.output_audio_transcript.done",
  "response.done",
  "error",
] as const;

type HandledEventType = (typeof HANDLED_EVENTS)[number];

function isHandledEvent(type: string): type is HandledEventType {
  return (HANDLED_EVENTS as readonly string[]).includes(type);
}

export type RealtimeCallbacks = {
  onPhase: (phase: VoicePhase, sessionId: string) => void;
  onError: (message: string, sessionId: string) => void;
  onUserCommitted: (itemId: string) => void;
  onUserTranscript: (itemId: string, text: string) => void;
  onAssistantDelta: (responseId: string, delta: string) => void;
  onAssistantDone: (responseId: string) => void;
};

type JsonEvent = Record<string, unknown> & { type: string };

function asEvent(data: unknown): JsonEvent | null {
  if (typeof data !== "object" || data === null) return null;
  const record = data as Record<string, unknown>;
  if (typeof record.type !== "string") return null;
  return record as JsonEvent;
}

export class RealtimeVoiceSession {
  private callbacks: RealtimeCallbacks;
  private phase: VoicePhase = "idle";
  private sessionId = "";
  private logger: VoiceLogger | null = null;
  private ctx: AudioContext | null = null;
  private player: PcmPlayer | null = null;
  private mic: MicHandle | null = null;
  private ws: WebSocket | null = null;
  private pending: string[] = [];
  private lastPhase: VoicePhase | null = null;
  private createdT: number | null = null;
  private speechStoppedT: number | null = null;
  private gotFirstAudio = false;
  private activeResponseId: string | null = null;
  private inWindow = { started: 0, chunks: 0, bytes: 0, rmsSum: 0, rmsMax: 0 };
  private startedAt = 0;
  private audioStats = { deltas: 0, bytes: 0, maxGap: 0, lastAt: 0 };
  private stopped = false;

  constructor(callbacks: RealtimeCallbacks) {
    this.callbacks = callbacks;
  }

  get id(): string {
    return this.sessionId;
  }

  get currentPhase(): VoicePhase {
    return this.phase;
  }

  get live(): boolean {
    return this.phase !== "idle";
  }

  async start(): Promise<void> {
    if (this.live) return;
    this.sessionId = newSessionId();
    this.stopped = false;
    this.logger = createVoiceLogger(this.sessionId, LOG_SINK);
    this.startedAt = Date.now();
    this.logger.log("start", { url: REALTIME_URL, target_rate: TARGET_SAMPLE_RATE });
    this.setPhase("connecting");

    const ctx = new AudioContext({ sampleRate: TARGET_SAMPLE_RATE });
    this.ctx = ctx;
    await ctx.resume().catch(() => undefined);
    this.player = new PcmPlayer(ctx, TARGET_SAMPLE_RATE);

    try {
      const tokenStarted = Date.now();
      const [token, mic] = await Promise.all([this.fetchToken(), this.openMic(ctx)]);
      this.logger.log("token.ok", { ms: Date.now() - tokenStarted });
      this.mic = mic;
      this.logger.log("mic.ok", {
        ms: Date.now() - this.startedAt,
        label: mic.label,
        settings: mic.settings,
      });
      this.logger.log("env", {
        ua: navigator.userAgent,
        mic_rate: mic.nativeRate,
        mic_state: ctx.state,
        play_rate: ctx.sampleRate,
        play_state: ctx.state,
        capture_frames: Math.round(TARGET_SAMPLE_RATE * 0.1),
        target_rate: TARGET_SAMPLE_RATE,
      });
      this.openSocket(token);
    } catch (err) {
      this.logger.error("start", err);
      this.fail(err);
    }
  }

  stop(by: "client" | "error" = "client"): void {
    if (this.phase === "idle" && this.stopped) return;
    this.stopped = true;
    this.logger?.log("stop", { by, phase: this.phase });
    this.teardown();
    this.setPhase("idle");
    this.logger?.close();
    this.logger = null;
  }

  sendText(text: string): void {
    const trimmed = text.trim();
    if (!trimmed || !this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.send({
      type: "conversation.item.create",
      item: {
        type: "message",
        role: "user",
        content: [{ type: "input_text", text: trimmed }],
      },
    });
    this.send({ type: "response.create" });
  }

  private async fetchToken(): Promise<string> {
    const res = await fetch("/api/realtime/session", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-voice-session": this.sessionId,
      },
      body: JSON.stringify({ sessionId: this.sessionId }),
    });
    const payload: unknown = await res.json().catch(() => null);
    const value =
      typeof payload === "object" &&
      payload !== null &&
      typeof (payload as { value?: unknown }).value === "string"
        ? (payload as { value: string }).value
        : "";
    if (!res.ok || !value) {
      const message =
        typeof payload === "object" &&
        payload !== null &&
        typeof (payload as { error?: unknown }).error === "string"
          ? (payload as { error: string }).error
          : "Failed to mint a voice session token.";
      throw new Error(message);
    }
    return value;
  }

  private async openMic(ctx: AudioContext): Promise<MicHandle> {
    return startMicCapture(ctx, (chunk) => this.onMicChunk(chunk.pcm, chunk.rms));
  }

  private openSocket(token: string): void {
    this.logger?.log("ws.connecting", {});
    const ws = new WebSocket(REALTIME_URL, [`xai-client-secret.${token}`]);
    this.ws = ws;
    ws.addEventListener("open", () => {
      this.logger?.log("ws.open", { ms: Date.now() - this.startedAt });
      this.send(
        {
          type: "session.update",
          session: {
            voice: "eve",
            instructions:
              "You are a helpful voice agent for AgenticAG. Be concise. Speak naturally in short sentences.",
            turn_detection: { type: "server_vad" },
            reasoning: { effort: "none" },
            audio: {
              input: {
                format: { type: "audio/pcm", rate: TARGET_SAMPLE_RATE },
                transcription: { model: "grok-transcribe" },
              },
              output: {
                format: { type: "audio/pcm", rate: TARGET_SAMPLE_RATE },
              },
            },
            tools: [{ type: "web_search" }],
          },
        },
        true,
      );
      this.flushPending();
    });
    ws.addEventListener("message", (event) => this.onMessage(event.data));
    ws.addEventListener("error", () => {
      this.logger?.log("ws.error", {});
    });
    ws.addEventListener("close", (event) => {
      this.logger?.log("ws.close", {
        code: event.code,
        reason: event.reason,
        wasClean: event.wasClean,
        by: this.stopped ? "client" : "server",
      });
      if (!this.stopped) {
        this.fail(new Error(`Voice socket closed (${event.code}).`));
      }
    });
  }

  private onMicChunk(pcm: Int16Array, rms: number): void {
    const now = Date.now();
    if (!this.inWindow.started) this.inWindow.started = now;
    this.inWindow.chunks += 1;
    this.inWindow.bytes += pcm.byteLength;
    this.inWindow.rmsSum += rms;
    this.inWindow.rmsMax = Math.max(this.inWindow.rmsMax, rms);
    if (now - this.inWindow.started >= 2000) {
      this.logger?.log("audio.in", {
        chunks: this.inWindow.chunks,
        bytes: this.inWindow.bytes,
        rms_max: this.inWindow.rmsMax,
        rms_avg: this.inWindow.chunks ? this.inWindow.rmsSum / this.inWindow.chunks : 0,
        pending: this.pending.length,
        mic_state: this.ctx?.state,
        phase: this.phase,
      });
      this.inWindow = { started: 0, chunks: 0, bytes: 0, rmsSum: 0, rmsMax: 0 };
    }

    const encoded = pcm16ToBase64(pcm);
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: "input_audio_buffer.append", audio: encoded }));
      return;
    }
    if (this.pending.length >= PREOPEN_CAP) this.pending.shift();
    this.pending.push(encoded);
  }

  private flushPending(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.logger?.log("audio.flush", { chunks: this.pending.length });
    for (const audio of this.pending) {
      this.ws.send(JSON.stringify({ type: "input_audio_buffer.append", audio }));
    }
    this.pending = [];
  }

  private onMessage(raw: unknown): void {
    try {
      const parsed = typeof raw === "string" ? JSON.parse(raw) : JSON.parse(String(raw));
      const event = asEvent(parsed);
      if (!event) return;
      if (event.type === "response.output_audio.delta" || event.type === "response.audio.delta") {
        this.onAudioDelta(event);
        return;
      }
      this.logger?.server(event, { phase: this.phase });
      if (!isHandledEvent(event.type)) return;
      this.handleEvent(event, event.type);
    } catch (err) {
      this.logger?.error("message", err);
    }
  }

  private handleEvent(event: JsonEvent, type: HandledEventType): void {
    switch (type) {
      case "session.updated":
        if (this.phase === "connecting") this.setPhase("listening");
        break;
      case "input_audio_buffer.speech_started": {
        if (this.phase === "speaking") {
          const dropped = this.player?.stop() ?? { droppedMs: 0 };
          this.logger?.log("play.stop", { reason: "barge-in", dropped_ms: dropped.droppedMs });
        }
        this.setPhase("listening");
        break;
      }
      case "input_audio_buffer.speech_stopped":
        this.speechStoppedT = Date.now();
        this.setPhase("thinking");
        break;
      case "input_audio_buffer.committed": {
        const itemId = typeof event.item_id === "string" ? event.item_id : crypto.randomUUID();
        this.callbacks.onUserCommitted(itemId);
        break;
      }
      case "conversation.item.input_audio_transcription.updated":
      case "conversation.item.input_audio_transcription.completed": {
        const itemId = typeof event.item_id === "string" ? event.item_id : "";
        const transcript =
          typeof event.transcript === "string"
            ? event.transcript
            : typeof event.text === "string"
              ? event.text
              : "";
        if (itemId && transcript) this.callbacks.onUserTranscript(itemId, transcript);
        break;
      }
      case "response.created": {
        this.createdT = Date.now();
        this.gotFirstAudio = false;
        this.audioStats = { deltas: 0, bytes: 0, maxGap: 0, lastAt: 0 };
        this.activeResponseId = typeof event.response_id === "string" ? event.response_id : null;
        const nested =
          typeof event.response === "object" && event.response !== null
            ? (event.response as { id?: unknown }).id
            : undefined;
        if (!this.activeResponseId && typeof nested === "string") this.activeResponseId = nested;
        this.player?.resetTurn();
        if (this.phase !== "speaking") this.setPhase("thinking");
        break;
      }
      case "response.output_audio.delta":
      case "response.audio.delta":
        this.onAudioDelta(event);
        break;
      case "response.output_audio_transcript.delta": {
        const delta = typeof event.delta === "string" ? event.delta : "";
        const responseId =
          (typeof event.response_id === "string" && event.response_id) ||
          this.activeResponseId ||
          "assistant";
        if (delta) this.callbacks.onAssistantDelta(responseId, delta);
        break;
      }
      case "response.output_audio_transcript.done":
        break;
      case "response.done": {
        const responseId =
          (typeof event.response_id === "string" && event.response_id) ||
          this.activeResponseId ||
          "assistant";
        const status =
          typeof event.status === "string"
            ? event.status
            : typeof (event.response as { status?: unknown } | undefined)?.status === "string"
              ? ((event.response as { status: string }).status)
              : "completed";
        this.logger?.log("audio.out", {
          response_id: responseId,
          status,
          deltas: this.player?.deltas ?? this.audioStats.deltas,
          bytes: this.player?.bytes ?? this.audioStats.bytes,
          audio_ms: this.player ? Math.round((this.player.bytes / 2 / TARGET_SAMPLE_RATE) * 1000) : 0,
          wall_ms: this.player?.turnWallMs() ?? 0,
          max_gap_ms: this.player?.maxGapMs ?? this.audioStats.maxGap,
          queued_ms: this.player?.queuedMs ?? 0,
          underruns: this.player?.underruns ?? 0,
          drain_ms_max: this.player?.drainMsMax ?? 0,
        });
        this.callbacks.onAssistantDone(responseId);
        this.activeResponseId = null;
        this.setPhase("listening");
        break;
      }
      case "error": {
        const message =
          typeof event.message === "string"
            ? event.message
            : typeof (event.error as { message?: unknown } | undefined)?.message === "string"
              ? ((event.error as { message: string }).message)
              : "Voice session error.";
        this.callbacks.onError(`${message} (voice session ${this.sessionId})`, this.sessionId);
        break;
      }
      default: {
        const _exhaustive: never = type;
        return _exhaustive;
      }
    }
  }

  private onAudioDelta(event: JsonEvent): void {
    const payload = typeof event.delta === "string" ? event.delta : typeof event.audio === "string" ? event.audio : "";
    if (!payload) return;
    const pcm = base64ToPcm16(payload);
    const bytes = pcm.byteLength;
    const now = Date.now();
    this.audioStats.deltas += 1;
    this.audioStats.bytes += bytes;
    if (this.audioStats.lastAt) {
      this.audioStats.maxGap = Math.max(this.audioStats.maxGap, now - this.audioStats.lastAt);
    }
    this.audioStats.lastAt = now;

    if (!this.gotFirstAudio) {
      this.gotFirstAudio = true;
      const responseId =
        (typeof event.response_id === "string" && event.response_id) || this.activeResponseId || "assistant";
      this.logger?.log("audio.out.first", {
        response_id: responseId,
        bytes,
        since_response_created_ms: this.createdT ? now - this.createdT : null,
        since_speech_stopped_ms: this.speechStoppedT ? now - this.speechStoppedT : null,
        play_state: this.ctx?.state,
      });
      this.setPhase("speaking");
    }
    this.player?.enqueue(pcm);
  }

  private send(event: Record<string, unknown>, log = true): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify(event));
    if (log) this.logger?.client(event);
  }

  private setPhase(phase: VoicePhase): void {
    this.phase = phase;
    if (phase !== this.lastPhase) {
      this.lastPhase = phase;
      if (phase !== "idle") this.logger?.log("phase", { phase });
      this.callbacks.onPhase(phase, this.sessionId);
    }
  }

  private fail(err: unknown): void {
    const message = err instanceof Error ? err.message : String(err);
    this.callbacks.onError(`${message} (voice session ${this.sessionId})`, this.sessionId);
    this.logger?.error("session", err, { phase: this.phase });
    this.stop("error");
  }

  private teardown(): void {
    this.player?.stop();
    this.mic?.stop();
    this.mic = null;
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.onerror = null;
      this.ws.onmessage = null;
      if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
        this.ws.close();
      }
    }
    this.ws = null;
    if (this.ctx) {
      void this.ctx.close().catch(() => undefined);
    }
    this.ctx = null;
    this.player = null;
    this.pending = [];
  }
}
