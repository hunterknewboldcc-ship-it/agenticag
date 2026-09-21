export const TARGET_SAMPLE_RATE = 24_000;

export function floatToPcm16(input: ArrayLike<number>): Int16Array {
  const out = new Int16Array(input.length);
  for (let i = 0; i < input.length; i += 1) {
    const s = Math.max(-1, Math.min(1, input[i] ?? 0));
    out[i] = s < 0 ? Math.round(s * 0x8000) : Math.round(s * 0x7fff);
  }
  return out;
}

export function pcm16ToFloat(input: Int16Array): Float32Array {
  const out = new Float32Array(input.length);
  for (let i = 0; i < input.length; i += 1) {
    out[i] = (input[i] ?? 0) / 32768;
  }
  return out;
}

export function resampleFloat32(
  input: ArrayLike<number>,
  fromRate: number,
  toRate: number,
): Float32Array {
  if (fromRate === toRate) {
    return Float32Array.from(input);
  }
  if (fromRate <= 0 || toRate <= 0 || input.length === 0) {
    return new Float32Array(0);
  }
  const ratio = fromRate / toRate;
  const outLength = Math.max(1, Math.floor(input.length / ratio));
  const out = new Float32Array(outLength);
  const last = input.length - 1;
  for (let i = 0; i < outLength; i += 1) {
    const src = i * ratio;
    const i0 = Math.min(Math.floor(src), last);
    const i1 = Math.min(i0 + 1, last);
    const frac = src - i0;
    const a = input[i0] ?? 0;
    const b = input[i1] ?? 0;
    out[i] = a * (1 - frac) + b * frac;
  }
  return out;
}

export function evenAlignBytes(bytes: Uint8Array): Uint8Array {
  if (bytes.byteLength % 2 === 0) return bytes;
  return bytes.subarray(0, bytes.byteLength - 1);
}

export function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return evenAlignBytes(bytes);
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export function pcm16ToBase64(pcm: Int16Array): string {
  return bytesToBase64(new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength));
}

export function base64ToPcm16(b64: string): Int16Array {
  const bytes = base64ToBytes(b64);
  return new Int16Array(bytes.buffer, bytes.byteOffset, bytes.byteLength >> 1);
}

export function rmsFloat(input: ArrayLike<number>): number {
  if (input.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < input.length; i += 1) {
    const s = input[i] ?? 0;
    sum += s * s;
  }
  return Math.sqrt(sum / input.length);
}
