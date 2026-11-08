import { freqToMidi, LOWEST, HIGHEST } from "./notes";

const MIN_LEVEL = 0.002;

export function rmsOf(input: Float32Array) {
  let sum = 0;
  for (const v of input) sum += v * v;
  return Math.sqrt(sum / input.length);
}

/** Autocorrelation pitch estimate for one buffer; -1 when too quiet or unclear. */
export function detectPitch(input: Float32Array, sampleRate: number) {
  if (rmsOf(input) < MIN_LEVEL) return -1;

  let start = 0;
  let end = input.length - 1;
  const threshold = 0.2;
  for (let i = 0; i < input.length / 2; i++) if (Math.abs(input[i]) < threshold) { start = i; break; }
  for (let i = 1; i < input.length / 2; i++) if (Math.abs(input[input.length - i]) < threshold) { end = input.length - i; break; }
  const buf = input.slice(start, end);
  const size = buf.length;

  const c = new Float32Array(size);
  for (let lag = 0; lag < size; lag++) {
    let sum = 0;
    for (let j = 0; j < size - lag; j++) sum += buf[j] * buf[j + lag];
    c[lag] = sum;
  }
  let d = 0;
  while (d < size - 1 && c[d] > c[d + 1]) d++;
  let best = -1;
  let lag = -1;
  for (let i = d; i < size; i++) if (c[i] > best) { best = c[i]; lag = i; }
  if (lag <= 0 || lag >= size - 1) return -1;

  const [x1, x2, x3] = [c[lag - 1], c[lag], c[lag + 1]];
  const a = (x1 + x3 - 2 * x2) / 2;
  const b = (x3 - x1) / 2;
  return sampleRate / (a ? lag - b / (2 * a) : lag);
}

/**
 * Listens through the microphone and reports a note once it has held steady
 * for a few frames, and null when the sound stops. A fresh attack on the same
 * key counts again. Works best one note at a time.
 */
export async function startMic(
  onNote: (midi: number | null) => void,
  onLevel: (level: number) => void,
): Promise<() => void> {
  // Made before the permission prompt so Chrome still counts it as part of the click.
  const ctx = new AudioContext();
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: true },
    });
  } catch (err) {
    void ctx.close();
    throw err;
  }
  if (ctx.state === "suspended") await ctx.resume();
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 2048;
  ctx.createMediaStreamSource(stream).connect(analyser);
  const buf = new Float32Array(analyser.fftSize);

  let candidate = -1;
  let count = 0;
  let current: number | null = null;
  let lastLevel = 0;
  let frame = 0;
  let raf = 0;

  const tick = () => {
    raf = requestAnimationFrame(tick);
    if (frame++ % 2) return;
    analyser.getFloatTimeDomainData(buf);
    const level = rmsOf(buf);
    onLevel(level);
    if (level > lastLevel * 1.8 && level > MIN_LEVEL * 3) {
      // A new attack: let the same note count again.
      count = 0;
      current = null;
    }
    lastLevel = level;
    const freq = detectPitch(buf, ctx.sampleRate);
    const midi = freq > 0 ? freqToMidi(freq) : -1;
    if (midi < LOWEST || midi > HIGHEST) {
      candidate = -1;
      count = 0;
      if (current !== null) { current = null; onNote(null); }
      return;
    }
    count = midi === candidate ? count + 1 : 1;
    candidate = midi;
    if (count === 2 && midi !== current) { current = midi; onNote(midi); }
  };
  tick();

  return () => {
    cancelAnimationFrame(raf);
    stream.getTracks().forEach((t) => t.stop());
    void ctx.close();
  };
}
