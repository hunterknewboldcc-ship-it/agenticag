import { pcm16ToFloat } from "@/lib/audio/pcm";

export class PcmPlayer {
  readonly ctx: AudioContext;
  readonly sampleRate: number;
  underruns = 0;
  drainMsMax = 0;
  maxGapMs = 0;
  deltas = 0;
  bytes = 0;
  private playhead = 0;
  private sources: AudioBufferSourceNode[] = [];
  private lastDeltaAt: number | null = null;
  private turnStartedAt: number | null = null;

  constructor(ctx: AudioContext, sampleRate: number) {
    this.ctx = ctx;
    this.sampleRate = sampleRate;
  }

  get playState(): AudioContextState {
    return this.ctx.state;
  }

  get queuedMs(): number {
    const remaining = this.playhead - this.ctx.currentTime;
    return Math.max(0, remaining * 1000);
  }

  resetTurn(): void {
    this.underruns = 0;
    this.drainMsMax = 0;
    this.maxGapMs = 0;
    this.deltas = 0;
    this.bytes = 0;
    this.playhead = 0;
    this.lastDeltaAt = null;
    this.turnStartedAt = performance.now();
  }

  enqueue(pcm: Int16Array): void {
    if (pcm.length === 0) return;
    const now = this.ctx.currentTime;
    const wall = performance.now();
    if (this.lastDeltaAt !== null) {
      this.maxGapMs = Math.max(this.maxGapMs, wall - this.lastDeltaAt);
    }
    this.lastDeltaAt = wall;
    this.deltas += 1;
    this.bytes += pcm.byteLength;

    const float = pcm16ToFloat(pcm);
    const buffer = this.ctx.createBuffer(1, float.length, this.sampleRate);
    const channel = buffer.getChannelData(0);
    channel.set(float);
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(this.ctx.destination);

    if (this.playhead === 0) {
      this.playhead = now + 0.15;
    } else if (this.playhead < now) {
      this.underruns += 1;
      this.playhead = now + 0.02;
    }

    src.start(this.playhead);
    this.playhead += buffer.duration;
    this.drainMsMax = Math.max(this.drainMsMax, (this.playhead - now) * 1000);
    this.sources.push(src);
  }

  stop(): { droppedMs: number } {
    const droppedMs = this.queuedMs;
    for (const src of this.sources) {
      try {
        src.stop();
      } catch {
        // already stopped
      }
    }
    this.sources = [];
    this.playhead = 0;
    return { droppedMs };
  }

  turnWallMs(): number {
    if (this.turnStartedAt === null) return 0;
    return performance.now() - this.turnStartedAt;
  }
}
