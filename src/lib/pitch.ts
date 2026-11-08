import { freqToMidi, LOWEST, HIGHEST } from "./notes";

const MIN_LEVEL = 0.0003; // just above digital silence; loudness is judged against the room
export const RUMBLE_CUTOFF = 150; // Hz; fans, traffic and handling noise sit below this. Piano overtones carry low notes.

export function rmsOf(input: Float32Array) {
  let sum = 0;
  for (const v of input) sum += v * v;
  return Math.sqrt(sum / input.length);
}

/**
 * Autocorrelation pitch estimate for one buffer. Clarity runs from 0 to 1:
 * near 1 for a clean held tone, much lower for voices, clatter and hiss.
 */
export function detectPitch(input: Float32Array, sampleRate: number) {
  const none = { freq: -1, clarity: 0 };
  if (rmsOf(input) < MIN_LEVEL) return none;

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
  for (let i = d; i < size; i++) if (c[i] > best) best = c[i];
  // Take the first peak nearly as strong as the best one. Later peaks are the
  // same wave repeating, and picking them would read the note an octave or a fifth low.
  let lag = -1;
  for (let i = Math.max(d, 1); i < size - 1; i++) {
    if (c[i] >= 0.9 * best && c[i] >= c[i - 1] && c[i] >= c[i + 1]) { lag = i; break; }
  }
  if (lag <= 0 || lag >= size - 1 || c[0] <= 0) return none;

  // Correlation at the period, scaled for the samples that overlap at that lag.
  const clarity = (c[lag] / c[0]) * (size / (size - lag));
  const [x1, x2, x3] = [c[lag - 1], c[lag], c[lag + 1]];
  const a = (x1 + x3 - 2 * x2) / 2;
  const b = (x3 - x1) / 2;
  return { freq: sampleRate / (a ? lag - b / (2 * a) : lag), clarity };
}

export type MicReading = { level: number; note?: number; released?: boolean };

const MIN_CLARITY = 0.7;
const ATTACK_JUMP = 1.6; // how much louder than a moment ago a key strike must be
const ABOVE_ROOM = 3; // how much louder than the room's background noise
const LISTEN_FRAMES = 8; // how long after a strike to wait for a steady pitch
const STEADY_FRAMES = 3; // readings in a row that must agree
const STEADY_CENTS = 20; // how closely they must agree; voices wobble more than this

/**
 * Turns a stream of mic buffers into key presses. A note counts only right
 * after a strike (a sudden rise well above the room's noise) and only once
 * its pitch is clean and steady, so talking, hum and fading notes are ignored.
 */
export class MicNoteTracker {
  private room = -1;
  private lastLevel = 0;
  private listening = 0;
  private candidate = -1;
  private count = 0;
  private sounding = false;

  constructor(private sampleRate: number) {}

  push(buf: Float32Array): MicReading {
    const level = rmsOf(buf);
    const reading: MicReading = { level };
    if (this.room < 0) {
      // The first reading is the room as it is, hum and all.
      this.room = Math.max(level, MIN_LEVEL);
      this.lastLevel = level;
      return reading;
    }
    const loudEnough = level > Math.max(this.room * ABOVE_ROOM, MIN_LEVEL * 2);

    if (loudEnough && level > this.lastLevel * ATTACK_JUMP) {
      this.listening = LISTEN_FRAMES;
      this.candidate = -1;
      this.count = 0;
    }
    // The room level drops quickly to quiet moments and creeps up slowly, so a held note doesn't raise it much.
    this.room = level < this.room ? this.room * 0.7 + level * 0.3 : this.room * 1.01;
    this.lastLevel = level;

    if (this.sounding && level < this.room * 2) {
      this.sounding = false;
      reading.released = true;
    }
    if (this.listening <= 0) return reading;
    this.listening--;

    const { freq, clarity } = detectPitch(buf, this.sampleRate);
    const midi = freq > 0 ? freqToMidi(freq) : -1;
    if (clarity < MIN_CLARITY || midi < LOWEST || midi > HIGHEST) {
      this.candidate = -1;
      this.count = 0;
      return reading;
    }
    const steady = this.candidate > 0 && Math.abs(1200 * Math.log2(freq / this.candidate)) < STEADY_CENTS;
    this.count = steady ? this.count + 1 : 1;
    this.candidate = freq;
    if (this.count === STEADY_FRAMES) {
      this.listening = 0;
      this.sounding = true;
      reading.note = midi;
    }
    return reading;
  }
}

/** Web Audio's "highpass" biquad (Q = 1/√2), in plain code so the app and the tests filter identically. */
export class HighPass {
  private b: [number, number, number];
  private a: [number, number];
  private x1 = 0;
  private x2 = 0;
  private y1 = 0;
  private y2 = 0;

  constructor(sampleRate: number, cutoff: number) {
    const w = (2 * Math.PI * cutoff) / sampleRate;
    const alpha = Math.sin(w) / (2 * Math.SQRT1_2);
    const cos = Math.cos(w);
    const a0 = 1 + alpha;
    this.b = [(1 + cos) / 2 / a0, -(1 + cos) / a0, (1 + cos) / 2 / a0];
    this.a = [(-2 * cos) / a0, (1 - alpha) / a0];
  }

  process(input: Float32Array, out = new Float32Array(input.length)) {
    const [b0, b1, b2] = this.b;
    const [a1, a2] = this.a;
    for (let i = 0; i < input.length; i++) {
      const x = input[i];
      const y = b0 * x + b1 * this.x1 + b2 * this.x2 - a1 * this.y1 - a2 * this.y2;
      this.x2 = this.x1;
      this.x1 = x;
      this.y2 = this.y1;
      this.y1 = y;
      out[i] = y;
    }
    return out;
  }
}

const WINDOW = 2048;

/**
 * Raw mic samples in, key presses out. Filters out rumble, then looks at the
 * latest 2048 samples about 30 times a second, whatever the screen's refresh rate.
 */
export class MicListener {
  private filter: HighPass;
  private tracker: MicNoteTracker;
  private ring = new Float32Array(WINDOW);
  private filled = 0;
  private sinceLast = 0;
  private hop: number;

  constructor(sampleRate: number, private onReading: (r: MicReading) => void) {
    this.filter = new HighPass(sampleRate, RUMBLE_CUTOFF);
    this.tracker = new MicNoteTracker(sampleRate);
    this.hop = Math.round(sampleRate / 30);
  }

  feed(block: Float32Array) {
    const filtered = this.filter.process(block);
    for (let i = 0; i < filtered.length; i++) {
      this.ring[this.filled % WINDOW] = filtered[i];
      this.filled++;
      if (++this.sinceLast >= this.hop && this.filled >= WINDOW) {
        this.sinceLast = 0;
        const start = this.filled % WINDOW;
        const frame = new Float32Array(WINDOW);
        frame.set(this.ring.subarray(start));
        frame.set(this.ring.subarray(0, start), WINDOW - start);
        this.onReading(this.tracker.push(frame));
      }
    }
  }
}

// Hands every block of raw mic samples from the audio thread to the page.
const TAP = `class Tap extends AudioWorkletProcessor {
  process(inputs) { const ch = inputs[0] && inputs[0][0]; if (ch) this.port.postMessage(ch.slice(0)); return true; }
}
registerProcessor("tap", Tap);`;

export type MicSession = { stop: () => void; sampleRate: number };

/**
 * Listens through the microphone and reports each key strike. Works best one
 * note at a time. onAudio, when given, also receives the raw samples (for calibration).
 */
export async function startMic(
  onNote: (midi: number | null) => void,
  onLevel: (level: number) => void,
  onAudio?: (block: Float32Array) => void,
): Promise<MicSession> {
  // Made before the permission prompt so Chrome still counts it as part of the click.
  const ctx = new AudioContext();
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    });
  } catch (err) {
    void ctx.close();
    throw err;
  }
  if (ctx.state === "suspended") await ctx.resume();

  const url = URL.createObjectURL(new Blob([TAP], { type: "text/javascript" }));
  await ctx.audioWorklet.addModule(url);
  URL.revokeObjectURL(url);
  const tap = new AudioWorkletNode(ctx, "tap");
  const mute = ctx.createGain();
  mute.gain.value = 0;
  ctx.createMediaStreamSource(stream).connect(tap).connect(mute).connect(ctx.destination);

  const listener = new MicListener(ctx.sampleRate, (r) => {
    onLevel(r.level);
    if (r.released) onNote(null);
    if (r.note !== undefined) onNote(r.note);
  });
  tap.port.onmessage = (e: MessageEvent<Float32Array>) => {
    onAudio?.(e.data);
    listener.feed(e.data);
  };

  return {
    sampleRate: ctx.sampleRate,
    stop: () => {
      tap.port.onmessage = null;
      stream.getTracks().forEach((t) => t.stop());
      void ctx.close();
    },
  };
}
