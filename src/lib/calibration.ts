/**
 * A calibration take: one WAV of everything the mic heard, plus a "keys" chunk
 * saying which key was being played when. Audio editors ignore the extra chunk.
 */
export type KeyTake = { midi: number; start: number; length: number; heard: number[] };
export type CalibrationMeta = { version: 1; createdAt: string; userAgent: string; keys: KeyTake[] };

export function encodeCalibrationWav(sampleRate: number, chunks: Int16Array[], meta: CalibrationMeta) {
  const samples = chunks.reduce((n, c) => n + c.length, 0);
  const json = new TextEncoder().encode(JSON.stringify(meta));
  const jsonPadded = json.length + (json.length % 2);
  const dataBytes = samples * 2;
  const buf = new ArrayBuffer(12 + 24 + 8 + dataBytes + 8 + jsonPadded);
  const v = new DataView(buf);
  const ascii = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  ascii(0, "RIFF");
  v.setUint32(4, buf.byteLength - 8, true);
  ascii(8, "WAVE");
  ascii(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 1, true); // mono
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  ascii(36, "data");
  v.setUint32(40, dataBytes, true);
  let o = 44;
  for (const c of chunks) {
    new Int16Array(buf, o, c.length).set(c);
    o += c.length * 2;
  }
  ascii(o, "keys");
  v.setUint32(o + 4, json.length, true);
  new Uint8Array(buf, o + 8, json.length).set(json);
  return new Blob([buf], { type: "audio/wav" });
}

export function decodeCalibrationWav(bytes: Uint8Array) {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (o: number) => String.fromCharCode(...bytes.subarray(o, o + 4));
  let sampleRate = 48000;
  let samples = new Float32Array(0);
  let meta: CalibrationMeta | null = null;
  for (let o = 12; o + 8 <= bytes.length; ) {
    const size = v.getUint32(o + 4, true);
    if (tag(o) === "fmt ") sampleRate = v.getUint32(o + 12, true);
    if (tag(o) === "data") {
      samples = new Float32Array(size / 2);
      for (let i = 0; i < samples.length; i++) samples[i] = v.getInt16(o + 8 + i * 2, true) / 32768;
    }
    if (tag(o) === "keys") meta = JSON.parse(new TextDecoder().decode(bytes.subarray(o + 8, o + 8 + size)));
    o += 8 + size + (size % 2);
  }
  if (!meta) throw new Error("This WAV has no calibration keys chunk.");
  return { sampleRate, samples, meta };
}

export const toInt16 = (block: Float32Array) => {
  const out = new Int16Array(block.length);
  for (let i = 0; i < block.length; i++) out[i] = Math.max(-32768, Math.min(32767, Math.round(block[i] * 32767)));
  return out;
};
