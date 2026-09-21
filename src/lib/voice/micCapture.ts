import { TARGET_SAMPLE_RATE, rmsFloat } from "@/lib/audio/pcm";

export type MicChunk = {
  pcm: Int16Array;
  rms: number;
};

export type MicHandle = {
  label: string;
  settings: MediaTrackSettings;
  nativeRate: number;
  stop: () => void;
};

export async function startMicCapture(
  ctx: AudioContext,
  onChunk: (chunk: MicChunk) => void,
  targetRate = TARGET_SAMPLE_RATE,
): Promise<MicHandle> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      channelCount: 1,
      sampleRate: targetRate,
    },
  });

  await ctx.audioWorklet.addModule("/worklets/pcm-capture-processor.js");
  const source = ctx.createMediaStreamSource(stream);
  const worklet = new AudioWorkletNode(ctx, "pcm-capture-processor");
  worklet.port.postMessage({
    type: "config",
    targetRate,
    chunkMs: 100,
  });
  worklet.port.onmessage = (event: MessageEvent<{ type?: string; pcm?: ArrayBuffer; rms?: number }>) => {
    if (event.data?.type !== "chunk" || !event.data.pcm) return;
    const pcm = new Int16Array(event.data.pcm);
    onChunk({ pcm, rms: event.data.rms ?? rmsFloat(pcm) });
  };
  source.connect(worklet);

  const track = stream.getAudioTracks()[0];
  const settings = track?.getSettings() ?? {};

  return {
    label: track?.label ?? "microphone",
    settings,
    nativeRate: settings.sampleRate ?? ctx.sampleRate,
    stop: () => {
      worklet.port.onmessage = null;
      try {
        worklet.port.close();
      } catch {
        // ignore
      }
      source.disconnect();
      worklet.disconnect();
      for (const mediaTrack of stream.getTracks()) mediaTrack.stop();
    },
  };
}
