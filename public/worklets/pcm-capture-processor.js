class PcmCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.targetRate = 24000;
    this.chunkMs = 100;
    this.buffer = [];
    this.port.onmessage = (event) => {
      if (event.data && event.data.type === "config") {
        this.targetRate = event.data.targetRate || 24000;
        this.chunkMs = event.data.chunkMs || 100;
      }
    };
  }

  resample(input, fromRate, toRate) {
    if (fromRate === toRate) return input;
    const ratio = fromRate / toRate;
    const outLength = Math.max(1, Math.floor(input.length / ratio));
    const out = new Float32Array(outLength);
    const last = input.length - 1;
    for (let i = 0; i < outLength; i += 1) {
      const src = i * ratio;
      const i0 = Math.min(Math.floor(src), last);
      const i1 = Math.min(i0 + 1, last);
      const frac = src - i0;
      out[i] = input[i0] * (1 - frac) + input[i1] * frac;
    }
    return out;
  }

  floatTo16(input) {
    const out = new Int16Array(input.length);
    for (let i = 0; i < input.length; i += 1) {
      const s = Math.max(-1, Math.min(1, input[i]));
      out[i] = s < 0 ? Math.round(s * 0x8000) : Math.round(s * 0x7fff);
    }
    return out;
  }

  rms(input) {
    if (input.length === 0) return 0;
    let sum = 0;
    for (let i = 0; i < input.length; i += 1) sum += input[i] * input[i];
    return Math.sqrt(sum / input.length);
  }

  flush() {
    const native = new Float32Array(this.buffer);
    this.buffer = [];
    const resampled = this.resample(native, sampleRate, this.targetRate);
    const pcm = this.floatTo16(resampled);
    this.port.postMessage({ type: "chunk", pcm: pcm.buffer, rms: this.rms(resampled) }, [pcm.buffer]);
  }

  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (channel) {
      for (let i = 0; i < channel.length; i += 1) this.buffer.push(channel[i]);
    }
    const needed = Math.round(sampleRate * (this.chunkMs / 1000));
    while (this.buffer.length >= needed) {
      const slice = this.buffer.splice(0, needed);
      const native = new Float32Array(slice);
      const resampled = this.resample(native, sampleRate, this.targetRate);
      const pcm = this.floatTo16(resampled);
      this.port.postMessage({ type: "chunk", pcm: pcm.buffer, rms: this.rms(resampled) }, [pcm.buffer]);
    }
    return true;
  }
}

registerProcessor("pcm-capture-processor", PcmCaptureProcessor);
