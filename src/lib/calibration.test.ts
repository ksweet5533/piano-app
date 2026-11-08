import { existsSync, readFileSync, readdirSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";
import { decodeCalibrationWav, encodeCalibrationWav, lagsOf, listen, scoreSequence, toInt16 } from "./calibration";
import { HIGHEST, LOWEST, isBlack, noteName } from "./notes";

it("a calibration WAV keeps its audio and key labels", async () => {
  const audio = toInt16(Float32Array.from({ length: 1000 }, (_, i) => Math.sin(i / 10) * 0.5));
  const keys = [{ midi: 60, start: 0, length: 1000, heard: [60] }];
  const blob = encodeCalibrationWav(44100, [audio], { version: 1, createdAt: "x", userAgent: "y", keys });
  const decoded = decodeCalibrationWav(new Uint8Array(await blob.arrayBuffer()));
  expect(decoded.sampleRate).toBe(44100);
  expect(decoded.meta.keys).toEqual(keys);
  expect(decoded.samples[100]).toBeCloseTo(Math.sin(10) * 0.5, 3);
});

it("scoring lines up what was heard with what was played", () => {
  expect(scoreSequence([60, 62, 65, 67], [60, 62, 64, 65, 67])).toMatchObject({ right: 4, wrong: 0, missed: 1, extra: 0 });
  expect(scoreSequence([60, 62, 62], [60, 62])).toMatchObject({ right: 2, extra: 1 });
  expect(scoreSequence([60, 74], [60, 62])).toMatchObject({ right: 1, wrong: 1, octave: 1 });
});

const DIR = join(import.meta.dirname, "../../calibration");

/** Plain 16-bit mono WAV, as recorded outside the app. */
function readPlainWav(bytes: Uint8Array) {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let sampleRate = 48000;
  for (let o = 12; o + 8 <= bytes.length; ) {
    const tag = String.fromCharCode(...bytes.subarray(o, o + 4));
    const size = v.getUint32(o + 4, true);
    if (tag === "fmt ") sampleRate = v.getUint32(o + 12, true);
    if (tag === "data") {
      const n = Math.min(size, bytes.length - o - 8) >> 1;
      const samples = new Float32Array(n);
      for (let i = 0; i < n; i++) samples[i] = v.getInt16(o + 8 + i * 2, true) / 32768;
      return { sampleRate, samples };
    }
    o += 8 + size + (size % 2);
  }
  throw new Error("No audio in this WAV.");
}

type Take = {
  file: string;
  played: { from: string; to: string; keys: "white" | "all"; strikes: number };
  atLeast: { right: number };
  atMost: { wrong: number; extra: number; middleLagMs: number };
};
const byName = (name: string) => Array.from({ length: HIGHEST - LOWEST + 1 }, (_, i) => LOWEST + i).find((m) => noteName(m) === name)!;

describe("real piano takes, known sequence", () => {
  const takes: Take[] = existsSync(join(DIR, "takes.json")) ? JSON.parse(readFileSync(join(DIR, "takes.json"), "utf8")) : [];
  for (const take of takes) {
    it.skipIf(!existsSync(join(DIR, take.file)))(`${take.file} does at least as well as before`, () => {
      const { sampleRate, samples } = readPlainWav(readFileSync(join(DIR, take.file)));
      const played: number[] = [];
      for (let m = byName(take.played.from); m <= byName(take.played.to); m++) {
        if (take.played.keys === "white" && isBlack(m)) continue;
        for (let s = 0; s < take.played.strikes; s++) played.push(m);
      }
      const heard = listen(samples, sampleRate);
      const score = scoreSequence(heard.map((h) => h.midi), played);
      // How quickly the middle of the keyboard (C4 to B5) answers, typically.
      const middle = score.matched.map((j) => heard[j]).filter((h) => h.midi >= 60 && h.midi < 84);
      const lags = lagsOf(samples, sampleRate, middle.map((h) => h.sample)).sort((a, b) => a - b);
      const middleLag = lags[lags.length >> 1];
      console.log(`${take.file}: ${score.right}/${played.length} right, ${score.wrong} wrong (${score.octave} octave), ${score.missed} missed, ${score.extra} extra; middle keys heard ${Math.round(middleLag)} ms after the strike`);
      expect(score.right).toBeGreaterThanOrEqual(take.atLeast.right);
      expect(score.wrong).toBeLessThanOrEqual(take.atMost.wrong);
      expect(score.extra).toBeLessThanOrEqual(take.atMost.extra);
      expect(middleLag).toBeLessThanOrEqual(take.atMost.middleLagMs);
    });
  }
});

const labeled = existsSync(DIR) ? readdirSync(DIR).filter((f) => f.startsWith("piano-calibration-") && f.endsWith(".wav")) : [];

describe.skipIf(labeled.length === 0)("real piano takes from the Calibrate tab", () => {
  for (const file of labeled) {
    it(`hears every key in ${file}`, () => {
      const { sampleRate, samples, meta } = decodeCalibrationWav(readFileSync(join(DIR, file)));
      const heard = listen(samples, sampleRate);
      const problems = meta.keys
        .map((k) => ({ k, got: heard.filter((h) => h.sample > k.start && h.sample <= k.start + k.length).map((h) => h.midi) }))
        .filter(({ k, got }) => !got.includes(k.midi) || got.some((m) => m !== k.midi))
        .map(({ k, got }) => `${noteName(k.midi)}: heard ${got.map(noteName).join(" ") || "nothing"}`);
      expect(problems).toEqual([]);
    });
  }
});
