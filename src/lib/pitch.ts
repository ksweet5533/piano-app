import { fft } from "./fft";
import { freqToMidi, HIGHEST, LOWEST, midiToFreq } from "./notes";

const MIN_LEVEL = 0.0003; // just above digital silence; loudness is judged against the room
const TOP_OCTAVE = 96; // C7; above here a note's own frequency is its loudest

/** Every knob the mic listener has, so they can be tuned against real recordings. */
export type MicSettings = {
  rumbleCutoff: number; // Hz; fans, traffic and handling noise sit below this. Piano overtones carry low notes.
  window: number; // samples looked at for pitch; long enough for two cycles of the lowest note
  levelWindow: number; // samples looked at for loudness; short, so strikes stand out
  peakPick: number; // take the first repeat of the wave at least this strong compared with the best
  minClarity: number; // how cleanly the wave must repeat; voices and clatter score lower
  attackJump: number; // how much louder than a moment ago a key strike must be
  aboveRoom: number; // how much louder than the room's background noise
  listenFrames: number; // how long after a strike to wait for a steady pitch
  steadyFrames: number; // readings in a row that must agree
  steadyCents: number; // how closely they must agree; voices wobble more than this
  votes: number; // or: readings of the same note, in any order, after one strike (0 turns this off)
  trebleCutoff: number; // Hz; a second listener above the key-and-hammer thump, for the top keys (0 turns it off)
  trebleWindow: number; // samples it looks at; top notes are short and repeat fast
  trebleFrom: number; // lowest note (MIDI) it may vote for
  trebleClarity: number; // how cleanly the high wave must repeat to vote
  topProminence: number; // top octave: how far the loudest frequency must stand above the rest
  topCents: number; // top octave: how close to a real note it must be
  topVotes: number; // top octave: readings needed; these notes fade within a third of a second
  refractory: number; // readings after a note during which no new strike can start; one strike can thump twice
};

/** Tuned on a laptop-mic take of an FP-10 (all white keys, 3 strikes each) plus the simulated rooms in micRooms.ts. */
export const MIC_SETTINGS: MicSettings = {
  rumbleCutoff: 180,
  window: 4096,
  levelWindow: 1024,
  peakPick: 0.9,
  minClarity: 0.6,
  attackJump: 1.3,
  aboveRoom: 3,
  listenFrames: 24,
  steadyFrames: 4,
  steadyCents: 20,
  votes: 5,
  trebleCutoff: 700,
  trebleWindow: 1024,
  trebleFrom: 84,
  trebleClarity: 0.8,
  topProminence: 20,
  topCents: 40,
  topVotes: 2,
  refractory: 8,
};

export function rmsOf(input: Float32Array) {
  let sum = 0;
  for (const v of input) sum += v * v;
  return Math.sqrt(sum / input.length);
}

/**
 * Pitch from the normalized square difference function (McLeod's method),
 * computed with an FFT so long windows stay cheap. Clarity runs from 0 to 1:
 * near 1 for a clean repeating wave, lower for voices, clatter and hiss.
 */
export function detectPitch(input: Float32Array, sampleRate: number, peakPick = MIC_SETTINGS.peakPick, minLevel = MIN_LEVEL) {
  const none = { freq: -1, clarity: 0 };
  const n = input.length;
  if (rmsOf(input) < minLevel) return none;

  let size = 1;
  while (size < 2 * n) size <<= 1;
  const re = new Float64Array(size);
  const im = new Float64Array(size);
  re.set(input);
  fft(re, im);
  for (let i = 0; i < size; i++) {
    re[i] = re[i] * re[i] + im[i] * im[i];
    im[i] = 0;
  }
  fft(re, im, true);

  const minLag = Math.max(2, Math.floor(sampleRate / 4600)); // a little above C8
  const maxLag = Math.min(Math.floor(n / 2), Math.ceil(sampleRate / 25)); // a little below A0
  const nsdf = new Float64Array(maxLag + 2);
  let m = 0;
  for (let i = 0; i < n; i++) m += 2 * input[i] * input[i];
  for (let lag = 0; lag <= maxLag + 1; lag++) {
    if (lag > 0) m -= input[lag - 1] * input[lag - 1] + input[n - lag] * input[n - lag];
    nsdf[lag] = m > 0 ? (2 * (re[lag] / size)) / m : 0;
  }

  // Highest point of each positive stretch after the wave first falls below zero.
  const peaks: number[] = [];
  let lag = 1;
  while (lag <= maxLag && nsdf[lag] > 0) lag++;
  while (lag <= maxLag) {
    while (lag <= maxLag && nsdf[lag] <= 0) lag++;
    let best = -1;
    while (lag <= maxLag && nsdf[lag] > 0) {
      if (best < 0 || nsdf[lag] > nsdf[best]) best = lag;
      lag++;
    }
    if (best >= minLag) peaks.push(best);
  }
  if (!peaks.length) return none;
  const top = Math.max(...peaks.map((p) => nsdf[p]));
  // Take the first repeat nearly as strong as the best one. Later ones are the
  // same wave repeating, and picking them would read the note an octave or a fifth low.
  const pick = peaks.find((p) => nsdf[p] >= peakPick * top)!;
  const [x1, x2, x3] = [nsdf[pick - 1], nsdf[pick], nsdf[pick + 1]];
  const a = (x1 + x3 - 2 * x2) / 2;
  const b = (x3 - x1) / 2;
  const shift = a ? -b / (2 * a) : 0;
  return { freq: sampleRate / (pick + shift), clarity: Math.min(1, x2 - (a * shift * shift)) };
}

/**
 * The loudest frequency, and how far it stands above the rest of the spectrum
 * (its strength over the median). Used for the top octave, where a note's own
 * frequency is its loudest and the waves are too short to time reliably.
 */
export function loudestPeak(input: Float32Array, sampleRate: number) {
  let size = 1;
  while (size < input.length * 2) size <<= 1;
  const re = new Float64Array(size);
  const im = new Float64Array(size);
  for (let i = 0; i < input.length; i++) re[i] = input[i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (input.length - 1)));
  fft(re, im);
  const mag = new Float64Array(size / 2);
  for (let k = 0; k < mag.length; k++) mag[k] = Math.hypot(re[k], im[k]);
  let best = 2;
  for (let k = 2; k < mag.length - 1; k++) if (mag[k] > mag[best]) best = k;
  const [a, b, c] = [mag[best - 1], mag[best], mag[best + 1]];
  const shift = a - 2 * b + c ? (0.5 * (a - c)) / (a - 2 * b + c) : 0;
  const median = Float64Array.from(mag).sort()[mag.length >> 1];
  return { freq: ((best + shift) * sampleRate) / size, prominence: median > 0 ? b / median : 0 };
}

export type MicReading = { level: number; note?: number; released?: boolean };

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
  private tally = new Map<number, number>();
  private sounding = false;
  private quiet = 0;

  constructor(
    private sampleRate: number,
    private s: MicSettings = MIC_SETTINGS,
  ) {}

  /**
   * buf is the pitch window; its last levelWindow samples decide loudness.
   * treble, when given, is the same moment with only the high end kept.
   */
  push(buf: Float32Array, treble?: Float32Array): MicReading {
    const s = this.s;
    const level = rmsOf(buf.subarray(Math.max(0, buf.length - s.levelWindow)));
    const reading: MicReading = { level };
    if (this.room < 0) {
      // The first reading is the room as it is, hum and all.
      this.room = Math.max(level, MIN_LEVEL);
      this.lastLevel = level;
      return reading;
    }
    const loudEnough = level > Math.max(this.room * s.aboveRoom, MIN_LEVEL * 2);

    if (this.quiet > 0) this.quiet--;
    else if (loudEnough && level > this.lastLevel * s.attackJump) {
      this.listening = s.listenFrames;
      this.candidate = -1;
      this.count = 0;
      this.tally.clear();
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

    const emit = (midi: number) => {
      this.listening = 0;
      this.quiet = s.refractory;
      this.sounding = true;
      reading.note = midi;
    };
    const vote = (midi: number, needed = s.votes) => {
      const votes = (this.tally.get(midi) ?? 0) + 1;
      this.tally.set(midi, votes);
      return needed > 0 && votes === needed;
    };

    const { freq, clarity } = detectPitch(buf, this.sampleRate, s.peakPick);
    const midi = freq > 0 ? freqToMidi(freq) : -1;
    if (clarity < s.minClarity || midi < LOWEST || midi > HIGHEST) {
      this.candidate = -1;
      this.count = 0;
    } else {
      const steady = this.candidate > 0 && Math.abs(1200 * Math.log2(freq / this.candidate)) < s.steadyCents;
      this.count = steady ? this.count + 1 : 1;
      this.candidate = freq;
      // Low keys start with hammer noise and wander between readings, so a note
      // can also win by turning up often enough in the moments after the strike.
      if (vote(midi) || this.count === s.steadyFrames) return emit(midi), reading;
    }

    // Top keys are quiet next to the thump of the key, so the high end gets its own say.
    if (treble) {
      const high = detectPitch(treble, this.sampleRate, s.peakPick, MIN_LEVEL / 10);
      const highMidi = high.freq > 0 ? freqToMidi(high.freq) : -1;
      if (high.clarity >= s.trebleClarity && highMidi >= s.trebleFrom && highMidi < TOP_OCTAVE && vote(highMidi)) return emit(highMidi), reading;

      const peak = loudestPeak(treble, this.sampleRate);
      const peakMidi = freqToMidi(peak.freq);
      const offTune = Math.abs(1200 * Math.log2(peak.freq / midiToFreq(peakMidi)));
      if (peakMidi >= TOP_OCTAVE && peakMidi <= HIGHEST && offTune < s.topCents && peak.prominence >= s.topProminence && vote(peakMidi, s.topVotes)) emit(peakMidi);
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

/** The ring buffer's contents, oldest sample first. */
function latest(ring: Float32Array, filled: number) {
  const start = filled % ring.length;
  const frame = new Float32Array(ring.length);
  frame.set(ring.subarray(start));
  frame.set(ring.subarray(0, start), ring.length - start);
  return frame;
}

/**
 * Raw mic samples in, key presses out. Filters out rumble, then looks at the
 * latest window of sound 30 times a second, whatever the screen's refresh rate.
 */
export class MicListener {
  private filter: HighPass;
  private trebleFilters: HighPass[];
  private tracker: MicNoteTracker;
  private ring: Float32Array;
  private trebleRing: Float32Array;
  private filled = 0;
  private sinceLast = 0;
  private hop: number;

  constructor(
    sampleRate: number,
    private onReading: (r: MicReading) => void,
    settings: MicSettings = MIC_SETTINGS,
  ) {
    this.filter = new HighPass(sampleRate, settings.rumbleCutoff);
    // Two in a row, so the thump falls away twice as steeply.
    this.trebleFilters = settings.trebleCutoff > 0 ? [new HighPass(sampleRate, settings.trebleCutoff), new HighPass(sampleRate, settings.trebleCutoff)] : [];
    this.tracker = new MicNoteTracker(sampleRate, settings);
    this.ring = new Float32Array(settings.window);
    this.trebleRing = new Float32Array(settings.trebleCutoff > 0 ? settings.trebleWindow : 0);
    this.hop = Math.round(sampleRate / 30);
  }

  feed(block: Float32Array) {
    const size = this.ring.length;
    const tsize = this.trebleRing.length;
    const filtered = this.filter.process(block);
    const treble = this.trebleFilters.reduce((x, f) => f.process(x), block);
    for (let i = 0; i < filtered.length; i++) {
      this.ring[this.filled % size] = filtered[i];
      if (tsize) this.trebleRing[this.filled % tsize] = treble[i];
      this.filled++;
      if (++this.sinceLast >= this.hop && this.filled >= size) {
        this.sinceLast = 0;
        this.onReading(this.tracker.push(latest(this.ring, this.filled), tsize ? latest(this.trebleRing, this.filled) : undefined));
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
