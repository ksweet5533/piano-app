import { readdirSync, readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";
import { decodeCalibrationWav, encodeCalibrationWav, toInt16 } from "./calibration";
import { noteName } from "./notes";
import { MicListener } from "./pitch";

it("a calibration WAV keeps its audio and key labels", async () => {
  const audio = toInt16(Float32Array.from({ length: 1000 }, (_, i) => Math.sin(i / 10) * 0.5));
  const keys = [{ midi: 60, start: 0, length: 1000, heard: [60] }];
  const blob = encodeCalibrationWav(44100, [audio], { version: 1, createdAt: "x", userAgent: "y", keys });
  const decoded = decodeCalibrationWav(new Uint8Array(await blob.arrayBuffer()));
  expect(decoded.sampleRate).toBe(44100);
  expect(decoded.meta.keys).toEqual(keys);
  expect(decoded.samples[100]).toBeCloseTo(Math.sin(10) * 0.5, 3);
});

/** Replays a recording through the app's listener, as one continuous take, and sorts what it heard by key. */
export function replay(bytes: Uint8Array) {
  const { sampleRate, samples, meta } = decodeCalibrationWav(bytes);
  const heardAt: { sample: number; midi: number }[] = [];
  let at = 0;
  const listener = new MicListener(sampleRate, (r) => r.note !== undefined && heardAt.push({ sample: at, midi: r.note }));
  for (; at < samples.length; at += 128) listener.feed(samples.subarray(at, at + 128));
  return meta.keys.map((k) => {
    const heard = heardAt.filter((h) => h.sample > k.start && h.sample <= k.start + k.length).map((h) => h.midi);
    const right = heard.filter((m) => m === k.midi).length;
    return { midi: k.midi, heard, right, wrong: heard.length - right };
  });
}

const DIR = join(import.meta.dirname, "../../calibration");
const takes = readdirSync(DIR).filter((f) => f.endsWith(".wav"));

describe.skipIf(takes.length === 0)("real piano recordings", () => {
  for (const file of takes) {
    it(`hears every key in ${file}`, () => {
      const report = replay(readFileSync(join(DIR, file)));
      const problems = report
        .filter((k) => k.wrong > 0 || k.right === 0)
        .map((k) => `${noteName(k.midi)}: heard ${k.heard.map(noteName).join(" ") || "nothing"}`);
      expect(problems).toEqual([]);
    });
  }
});
