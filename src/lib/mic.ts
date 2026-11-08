import { MicListener } from "./listener";

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
