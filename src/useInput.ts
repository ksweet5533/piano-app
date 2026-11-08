import { useCallback, useEffect, useRef, useState } from "react";
import { connectMidi } from "./lib/midi";
import { startMic } from "./lib/mic";
import { playNote } from "./lib/synth";

export type Source = "midi" | "mic" | "screen";
export type NoteEvent = { midi: number; source: Source; id: number };
export type InputMode = "none" | "midi" | "mic";

/** One place for every way a note can come in: the FP-10 over MIDI, the mic, or the on-screen keys. */
export function useInput() {
  const [mode, setMode] = useState<InputMode>("none");
  const [message, setMessage] = useState("Connect your piano to start.");
  const [active, setActive] = useState<Set<number>>(new Set());
  const [event, setEvent] = useState<NoteEvent | null>(null);
  const [level, setLevel] = useState(0);
  const lastLevelAt = useRef(0);
  const stopRef = useRef<(() => void) | null>(null);
  const idRef = useRef(0);

  const emit = useCallback((midi: number, source: Source) => {
    setEvent({ midi, source, id: ++idRef.current });
  }, []);

  const stop = useCallback(() => {
    stopRef.current?.();
    stopRef.current = null;
    setActive(new Set());
    setLevel(0);
    setMode("none");
    setMessage("Connect your piano to start.");
  }, []);

  const connectKeyboard = useCallback(async () => {
    stopRef.current?.();
    if (!("requestMIDIAccess" in navigator)) {
      setMessage("This browser can't read MIDI. Open the app in Chrome or Edge, or use the microphone.");
      return;
    }
    try {
      stopRef.current = await connectMidi({
        onNote: (midi, on) => {
          setActive((prev) => {
            const next = new Set(prev);
            if (on) next.add(midi);
            else next.delete(midi);
            return next;
          });
          if (on) emit(midi, "midi");
        },
        onDevices: (names) =>
          setMessage(
            names.length
              ? `Connected to ${names.join(", ")}.`
              : "No keyboard found yet. Plug the FP-10 into a USB port on this computer and turn it on.",
          ),
      });
      setMode("midi");
    } catch {
      setMessage("MIDI access was blocked. Allow it in the browser's site settings and try again.");
    }
  }, [emit]);

  const listenWithMic = useCallback(async () => {
    stopRef.current?.();
    try {
      const session = await startMic(
        (midi) => {
          setActive(midi === null ? new Set() : new Set([midi]));
          if (midi !== null) emit(midi, "mic");
        },
        (l) => {
          const now = performance.now();
          if (now - lastLevelAt.current < 80) return;
          lastLevelAt.current = now;
          setLevel(l);
        },
      );
      stopRef.current = session.stop;
      setMode("mic");
      setMessage("Listening. Play one note at a time, a little firmly. The bar moves when the mic hears you.");
    } catch {
      setMessage(
        "The microphone is blocked. Allow it for this page in Chrome, and for Chrome in System Settings → Privacy & Security → Microphone.",
      );
    }
  }, [emit]);

  const pressScreenKey = useCallback(
    (midi: number) => {
      playNote(midi);
      emit(midi, "screen");
    },
    [emit],
  );

  useEffect(() => () => stopRef.current?.(), []);

  return { mode, message, level, active, event, connectKeyboard, listenWithMic, stop, pressScreenKey };
}

/** The mic often hears a note an octave off, so it only has to get the letter right. */
export const sameNote = (target: number, played: number, source: Source) =>
  source === "mic" ? target % 12 === played % 12 : target === played;
