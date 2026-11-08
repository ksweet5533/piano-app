import { fft } from "./fft";
import { CarefulListener, detectPitch, HighPass, type MicReading } from "./pitch";
import { freqToMidi, HIGHEST, LOWEST } from "./notes";

const MIN_LEVEL = 0.0003;
const BLOCK = 128;

/** One filtered copy of the mic: a high-pass at `cutoff`, applied `order` times, trusted for notes from `from` Hz. */
export type View = { cutoff: number; order: number; from: number };

export type QuickSettings = {
  views: View[];
  lengths: number[]; // window sizes tried, shortest first; the newest samples are used
  rise: number; // energy jump over the moment before that counts as a strike
  aboveRoom: number; // energy over the room's noise
  periods: number; // cycles of a note a window must hold before it can be trusted
  minClarity: number;
  peakPick: number;
  agree: number; // readings in a row that must name the same note
  newer: number; // how much louder than just before the strike the note must be; a key let go, or a finger landing, isn't louder
  listen: number; // samples after a strike to wait for a pitch
  gap: number; // samples after a note before another strike can start
  range: [number, number]; // notes (MIDI) this listener may report
  overtoneDb: number; // through the steep filter, how far the 2nd or 3rd harmonic must stand above its surroundings
  octaveCheckFrom: number; // from this note up, a much stronger 2nd harmonic means the key an octave up
  octaveDb: number; // how much stronger
  wholeClarity: number; // how clear everything since the strike, read at once, must be to overrule a reading
  wholeBelow: number; // and how far below (semitones) it must name a key; then the reading is one of that key's partials
  oddDb: number; // how far the 3rd harmonic must stand above its surroundings
  evenDb: number; // and the 2nd
  twelfthDb: number; // the 3rd harmonic this far above the 1st and 2nd means the key a twelfth up
  halfDb: number; // more than this at half the frequency means a lower key's partial
  ownFrom: number; // from this note up, the note's own frequency must stand out through the low view
  ownDb: number; // by this much
  steadyFor: number; // samples the agreeing readings must span; a voice slides, a string holds
  agreeCents: number;
};

export const QUICK_SETTINGS: QuickSettings = {
  views: [
    { cutoff: 450, order: 3, from: 400 },
    { cutoff: 180, order: 1, from: 0 },
  ],
  lengths: [512, 1024, 2048],
  rise: 4,
  aboveRoom: 9,
  periods: 4,
  minClarity: 0.8,
  peakPick: 0.9,
  agree: 2,
  newer: 2,
  listen: 9600,
  gap: 2400,
  range: [60, 83],
  overtoneDb: 12,
  octaveCheckFrom: 77,
  octaveDb: 10,
  wholeClarity: 0.6,
  wholeBelow: 30,
  oddDb: 5,
  evenDb: 6,
  twelfthDb: 20,
  halfDb: 2,
  ownFrom: 74,
  ownDb: 13,
  steadyFor: 480,
  agreeCents: 20,
};

function meanSquare(x: Float32Array) {
  let sum = 0;
  for (const v of x) sum += v * v;
  return sum / Math.max(1, x.length);
}

/**
 * The spectrum of `seg`, as a function telling how far a frequency's peak
 * stands above the spectrum around it, in dB.
 */
function prominence(seg: Float32Array, sampleRate: number) {
  let size = 4096;
  while (size < 2 * seg.length) size <<= 1;
  const re = new Float64Array(size);
  const im = new Float64Array(size);
  const n = seg.length;
  for (let i = 0; i < n; i++) re[i] = seg[i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1)));
  fft(re, im);
  const mag = new Float64Array(size / 2);
  for (let k = 0; k < mag.length; k++) mag[k] = Math.hypot(re[k], im[k]);
  return (freq: number) => {
    const at = (freq * size) / sampleRate;
    if (at * 1.2 >= mag.length) return -Infinity;
    let peak = 0;
    const around: number[] = [];
    for (let k = Math.floor(at * 0.8); k <= Math.ceil(at * 1.2); k++) {
      if (Math.abs(k - at) <= at * 0.03) peak = Math.max(peak, mag[k]);
      else if (Math.abs(k - at) > at * 0.06) around.push(mag[k]);
    }
    around.sort((x, y) => x - y);
    return 20 * Math.log10(peak / (around[around.length >> 1] || 1e-12));
  };
}

class Ring {
  data: Float32Array;
  constructor(size: number) {
    let n = 1;
    while (n < size) n <<= 1;
    this.data = new Float32Array(n);
  }
  /** The `length` samples before `end`, oldest first. */
  last(end: number, length: number) {
    const out = new Float32Array(length);
    const mask = this.data.length - 1;
    for (let i = 0; i < length; i++) out[i] = this.data[(end - length + i) & mask];
    return out;
  }
}

type Band = { view: View; filters: HighPass[]; ring: Ring; energies: number[]; room: number; before: number };

/**
 * Hears a key the moment its pitch can be known. Every 128-sample block is
 * checked for a strike; from then on each block re-reads the newest sound,
 * in short windows first, until enough cycles of one clean pitch agree.
 * High notes are read through a steep high-pass, clear of the key's thump.
 */
export class QuickListener {
  private bands: Band[];
  private filled = 0;
  private start = -1; // sample where the strike being listened to began
  private agreed: { freq: number; at: number }[] = [];
  private quietUntil = 0;
  private sounding = false;

  constructor(
    private sampleRate: number,
    private onReading: (r: MicReading) => void,
    private s: QuickSettings = QUICK_SETTINGS,
  ) {
    const longest = Math.max(...s.lengths);
    this.bands = s.views.map((view) => ({
      view,
      filters: Array.from({ length: view.order }, () => new HighPass(sampleRate, view.cutoff)),
      ring: new Ring(longest + 1024 + 4 * BLOCK),
      energies: [],
      room: -1,
      before: 0,
    }));
  }

  feed(block: Float32Array) {
    const s = this.s;
    let struck = false;
    let level = 0;
    for (const band of this.bands) {
      const out = band.filters.reduce((x, f) => f.process(x), block);
      const mask = band.ring.data.length - 1;
      let energy = 0;
      for (let i = 0; i < out.length; i++) {
        band.ring.data[(this.filled + i) & mask] = out[i];
        energy += out[i] * out[i];
      }
      energy /= out.length;
      if (band === this.bands[this.bands.length - 1]) level = Math.sqrt(energy);
      const e = band.energies;
      e.push(energy);
      if (e.length > 10) e.shift();
      // Two blocks against the loudest pair a few blocks earlier, so a low note's own wobble isn't a strike.
      const now = e.length >= 2 ? e[e.length - 1] + e[e.length - 2] : 0;
      let before = Infinity;
      if (e.length === 10) {
        before = 0;
        for (let i = 1; i < 6; i++) before = Math.max(before, e[i] + e[i - 1]);
      }
      if (band.room < 0) band.room = Math.max(now, MIN_LEVEL * MIN_LEVEL);
      if (now > s.rise * before && now > Math.max(band.room * s.aboveRoom, 8 * MIN_LEVEL * MIN_LEVEL * (band.view.order > 1 ? 0.01 : 1))) struck = true;
      band.room = now < band.room ? band.room * 0.7 + now * 0.3 : band.room * 1.002;
    }
    this.filled += block.length;
    const reading: MicReading = { level };

    if (struck && this.filled >= this.quietUntil) {
      this.start = this.filled - 2 * BLOCK;
      this.agreed = [];
      for (const band of this.bands) band.before = meanSquare(band.ring.last(this.start, 1024));
    }
    const base = this.bands[this.bands.length - 1];
    if (this.sounding && level * level * 2 < base.room * 4) {
      this.sounding = false;
      reading.released = true;
    }

    if (this.start >= 0) {
      const since = this.filled - this.start;
      if (since > s.listen) this.start = -1;
      else {
        const note = this.read(since);
        if (note !== undefined) {
          reading.note = note;
          this.start = -1;
          this.sounding = true;
          this.quietUntil = this.filled + s.gap;
        }
      }
    }
    this.onReading(reading);
  }

  /**
   * Checks a reading's overtones, so a lone ring, a low key's upper partials,
   * or a key an octave or a twelfth away isn't taken for this note.
   */
  private looksStruck(band: Band, seg: Float32Array, freq: number, since: number) {
    const s = this.s;
    const midi = freqToMidi(freq);
    const at = prominence(seg, this.sampleRate);
    const [h1, h2, h3] = [at(freq), at(2 * freq), at(3 * freq)];
    // A struck string has both: only even harmonics means the key an octave up, only odd ones a key a twelfth up.
    if (h3 < s.oddDb || h2 < s.evenDb) return false;
    // The 3rd harmonic towering over the rest: the key a twelfth up.
    if (h3 - Math.max(h1, h2) >= s.twelfthDb) return false;
    if (band.view.order > 1) {
      // A ring in the room or the piano's case sounds like a lone tone.
      if (Math.max(h2, h3) < s.overtoneDb) return false;
      // Much more at twice the frequency: the key an octave up, heard at half its pitch.
      if (midi >= s.octaveCheckFrom && h2 - h1 >= s.octaveDb) return false;
    }
    const low = this.bands[this.bands.length - 1].ring.last(this.filled, Math.min(since, 4096));
    const lowAt = prominence(low, this.sampleRate);
    const own = lowAt(freq);
    const half = lowAt(freq / 2);
    // More going on an octave below: a lower key's partial.
    if (half > own + s.halfDb) return false;
    // Everything heard since the strike, read at once, naming a key far below: this is one of its upper partials.
    const whole = detectPitch(low, this.sampleRate, s.peakPick, MIN_LEVEL);
    if (whole.clarity >= s.wholeClarity && whole.freq > 0 && midi - freqToMidi(whole.freq) > s.wholeBelow) return false;
    // High notes ring clearly at their own pitch, even through the low view.
    if (midi >= s.ownFrom && own < s.ownDb) return false;
    return true;
  }

  /** One look at the newest sound; returns a note once readings agree. */
  private read(since: number): number | undefined {
    const s = this.s;
    let found = -1;
    let foundFreq = 0;
    let tooShort = false;
    search: for (const length of s.lengths) {
      if (length > since) break;
      for (const band of this.bands) {
        const seg = band.ring.last(this.filled, length);
        const { freq, clarity } = detectPitch(seg, this.sampleRate, s.peakPick, band.view.order > 1 ? MIN_LEVEL / 30 : MIN_LEVEL);
        if (freq <= 0 || clarity < s.minClarity || freq < band.view.from) continue;
        const midi = freqToMidi(freq);
        if (midi < LOWEST || midi > HIGHEST) continue;
        if (length < (s.periods * this.sampleRate) / freq) {
          tooShort = true;
          continue;
        }
        if (meanSquare(seg) < s.newer * band.before) continue;
        // A clear note below this listener's keys: the careful listener has it.
        if (midi < s.range[0]) {
          this.start = -1;
          return undefined;
        }
        if (midi > s.range[1] || !this.looksStruck(band, seg, freq, since)) continue;
        found = midi;
        foundFreq = freq;
        break search;
      }
    }
    if (found < 0) {
      if (!tooShort) this.agreed = [];
      return undefined;
    }
    this.agreed = this.agreed.filter((a) => Math.abs(1200 * Math.log2(foundFreq / a.freq)) <= s.agreeCents);
    this.agreed.push({ freq: foundFreq, at: this.filled });
    const span = this.filled - this.agreed[0].at;
    return this.agreed.length >= s.agree && span >= s.steadyFor ? found : undefined;
  }
}

/**
 * The quick listener for the middle of the keyboard, with the careful one
 * behind it for the bass and the top, and for any middle note the quick one misses.
 */
export class MicListener {
  private quick: QuickListener;
  private careful: CarefulListener;
  private quickAt = -Infinity;
  private quickNote = -1;
  private filled = 0;

  constructor(
    private sampleRate: number,
    private onReading: (r: MicReading) => void,
    s: QuickSettings = QUICK_SETTINGS,
  ) {
    this.quick = new QuickListener(sampleRate, (r) => {
      if (r.note !== undefined) [this.quickAt, this.quickNote] = [this.filled, r.note];
      this.onReading(r);
    }, s);
    this.careful = new CarefulListener(sampleRate, (r) => {
      if (r.released) this.onReading({ level: r.level, released: true });
      if (r.note === undefined) return;
      // The careful listener is late. If the quick one already spoke for this strike, it stays quiet.
      const recent = this.filled - this.quickAt < 0.6 * this.sampleRate;
      if (recent && (r.note % 12 === this.quickNote % 12 || (r.note >= s.range[0] && r.note <= s.range[1]))) return;
      this.onReading({ level: r.level, note: r.note });
    });
  }

  feed(block: Float32Array) {
    this.filled += block.length;
    this.quick.feed(block);
    this.careful.feed(block);
  }
}
