import { describe, expect, it } from "vitest";
import { midiToFreq } from "./notes";
import { MicNoteTracker } from "./pitch";

// Simulated rooms: what a laptop mic hears, frame by frame, as the app reads it.
const SR = 48000;
const HOP = 1600;
const N = 2048;
type Sound = (t: number) => number;

const noise = (a: number): Sound => () => (Math.random() - 0.5) * 2 * a;
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
const voice = (from: number, to: number, a: number): Sound => (t) => {
  if (t < from || t > to) return 0;
  const syllable = Math.max(0, Math.sin(2 * Math.PI * 4 * t)) ** 2;
  const phase =
    2 * Math.PI * (160 * t - (50 / (2 * Math.PI * 1.3)) * Math.cos(2 * Math.PI * 1.3 * t) - (20 / (2 * Math.PI * 7)) * Math.cos(2 * Math.PI * 7 * t));
  return a * syllable * (Math.sin(phase) + 0.6 * Math.sin(2 * phase) + 0.4 * Math.sin(3 * phase) + 0.3 * (Math.random() - 0.5));
};

function heard(sounds: Sound[], seconds: number) {
  const tracker = new MicNoteTracker(SR);
  const notes: number[] = [];
  for (let start = 0; start + N < seconds * SR; start += HOP) {
    const buf = new Float32Array(N);
    for (let i = 0; i < N; i++) for (const s of sounds) buf[i] += s((start + i) / SR);
    const r = tracker.push(buf);
    if (r.note !== undefined) notes.push(r.note);
  }
  return notes;
}

const PHRASE = [[60, 0.5], [64, 1.1], [64, 1.7], [67, 2.3], [48, 3.0], [72, 3.6]] as const;
const played = (amp?: number) => PHRASE.map(([m, at]) => piano(m, at, amp));
const expected = PHRASE.map(([m]) => m);

describe("MicNoteTracker", () => {
  it("ignores a quiet room", () => expect(heard([noise(0.003)], 4)).toEqual([]));
  it("ignores a steady hum", () => expect(heard([noise(0.002), hum(120, 0.02)], 4)).toEqual([]));
  it("ignores talking", () => expect(heard([noise(0.002), voice(0.5, 3.5, 0.05)], 4)).toEqual([]));
  it("hears each key, including a repeated one", () => expect(heard([noise(0.003), ...played()], 4.5)).toEqual(expected));
  it("hears playing over a hum", () => expect(heard([noise(0.002), hum(120, 0.005), ...played(0.08)], 4.5)).toEqual(expected));
  it("hears playing while someone talks", () =>
    expect(heard([noise(0.002), voice(0.3, 4.2, 0.02), ...played()], 4.5)).toEqual(expected));
  it("stays silent before guessing when the piano is buried under a hum", () =>
    expect(heard([noise(0.002), hum(120, 0.01), ...played(0.03)], 4.5)).toEqual([]));
});
