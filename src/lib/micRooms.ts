import { midiToFreq } from "./notes";
import { MIC_SETTINGS, MicListener, type MicSettings } from "./pitch";

// Simulated rooms: what a laptop mic hears, fed to the app's listener exactly as the browser would.
const SR = 48000;
type Sound = (t: number) => number;

/** Seeded noise, so every run hears the same room. */
function seeded(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const noise = (a: number, seed = 1): Sound => {
  const rand = seeded(seed);
  return () => (rand() - 0.5) * 2 * a;
};
const hum = (f: number, a: number): Sound => (t) => a * Math.sin(2 * Math.PI * f * t);

/** A struck key: strong overtones, slightly stretched like real strings, let go after 0.45 s. */
const piano = (midi: number, at: number, amp = 0.15): Sound => (t) => {
  if (t < at) return 0;
  const u = t - at;
  const f = midiToFreq(midi);
  const env = amp * Math.exp(-u / 0.7) * Math.min(1, u / 0.005) * (u > 0.45 ? Math.exp(-(u - 0.45) / 0.04) : 1);
  return (
    env *
    (0.4 * Math.sin(2 * Math.PI * f * u) +
      0.6 * Math.sin(2 * Math.PI * f * 2.002 * u) +
      0.3 * Math.sin(2 * Math.PI * f * 3.006 * u) +
      0.15 * Math.sin(2 * Math.PI * f * 4.01 * u))
  );
};

/** Someone talking: a voice that slides around 110 to 230 Hz, in syllables. */
const voice = (from: number, to: number, a: number, seed = 2): Sound => {
  const rand = seeded(seed);
  return (t) => {
    if (t < from || t > to) return 0;
    const syllable = Math.max(0, Math.sin(2 * Math.PI * 4 * t)) ** 2;
    const phase =
      2 * Math.PI * (160 * t - (50 / (2 * Math.PI * 1.3)) * Math.cos(2 * Math.PI * 1.3 * t) - (20 / (2 * Math.PI * 7)) * Math.cos(2 * Math.PI * 7 * t));
    return a * syllable * (Math.sin(phase) + 0.6 * Math.sin(2 * phase) + 0.4 * Math.sin(3 * phase) + 0.3 * (rand() - 0.5));
  };
};

const PHRASE = [[60, 0.5], [64, 1.1], [64, 1.7], [67, 2.3], [48, 3.0], [72, 3.6]] as const;
const played = (amp?: number) => PHRASE.map(([m, at]) => piano(m, at, amp));
const PHRASE_NOTES = PHRASE.map(([m]) => m);

export type Room = { name: string; sounds: () => Sound[]; seconds: number; expected: number[] };

export const ROOMS: Room[] = [
  { name: "ignores a quiet room", sounds: () => [noise(0.003)], seconds: 4, expected: [] },
  { name: "ignores a steady hum", sounds: () => [noise(0.002), hum(120, 0.02)], seconds: 4, expected: [] },
  { name: "ignores talking", sounds: () => [noise(0.002), voice(0.5, 3.5, 0.05)], seconds: 4, expected: [] },
  { name: "hears each key, including a repeated one", sounds: () => [noise(0.003), ...played()], seconds: 4.5, expected: PHRASE_NOTES },
  { name: "hears playing over a hum", sounds: () => [noise(0.002), hum(120, 0.005), ...played(0.08)], seconds: 4.5, expected: PHRASE_NOTES },
  { name: "hears playing while someone talks", sounds: () => [noise(0.002), voice(0.3, 4.2, 0.02), ...played()], seconds: 4.5, expected: PHRASE_NOTES },
  {
    // Matches a real laptop recording of an FP-10: notes only a few times above the room.
    name: "hears playing at a normal home volume, with low rumble in the room",
    sounds: () => [noise(0.0015), hum(70, 0.003), ...played(0.012)],
    seconds: 4.5,
    expected: PHRASE_NOTES,
  },
  { name: "ignores talking in a quiet room with rumble", sounds: () => [noise(0.0015), hum(70, 0.003), voice(0.5, 4, 0.01)], seconds: 4.5, expected: [] },
  {
    name: "hears soft playing under a loud hum, once the rumble filter removes it",
    sounds: () => [noise(0.002), hum(120, 0.01), ...played(0.03)],
    seconds: 4.5,
    expected: PHRASE_NOTES,
  },
];

/** Feeds a room to the app's own listener in the 128-sample blocks the browser delivers. */
export function heard(room: Room, settings: MicSettings = MIC_SETTINGS) {
  const sounds = room.sounds();
  const signal = new Float32Array(Math.floor(room.seconds * SR));
  for (let i = 0; i < signal.length; i++) for (const s of sounds) signal[i] += s(i / SR);
  const notes: number[] = [];
  const listener = new MicListener(SR, (r) => r.note !== undefined && notes.push(r.note), settings);
  for (let i = 0; i < signal.length; i += 128) listener.feed(signal.subarray(i, i + 128));
  return notes;
}
