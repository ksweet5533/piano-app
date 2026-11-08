import { midiToFreq } from "./notes";

let ctx: AudioContext | null = null;

/** A soft piano-like tone for on-screen keys and ear training prompts. */
export function playNote(midi: number, seconds = 1.2) {
  ctx ??= new AudioContext();
  if (ctx.state === "suspended") void ctx.resume();
  const now = ctx.currentTime;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.35, now + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + seconds);
  gain.connect(ctx.destination);
  for (const [type, mult, level] of [["triangle", 1, 1], ["sine", 2, 0.3]] as const) {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.value = midiToFreq(midi) * mult;
    g.gain.value = level;
    osc.connect(g).connect(gain);
    osc.start(now);
    osc.stop(now + seconds);
  }
}
