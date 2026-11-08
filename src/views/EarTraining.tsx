import { useEffect, useRef, useState } from "react";
import { naturalsBetween, noteName, pick } from "../lib/notes";
import { recordAttempt } from "../lib/practice";
import { playNote } from "../lib/synth";
import type { NoteEvent } from "../useInput";

const POOL = naturalsBetween(60, 71); // the white keys from middle C up to B

type Props = { event: NoteEvent | null; setHighlight: (m: number | null) => void };

export function EarTraining({ event, setHighlight }: Props) {
  const [target, setTarget] = useState(() => pick(POOL));
  const [started, setStarted] = useState(false);
  const [feedback, setFeedback] = useState<{ text: string; state: "right" | "wrong" } | null>(null);
  const seen = useRef(event?.id ?? 0);
  const ignoreMicUntil = useRef(0);
  const waiting = useRef(false);

  useEffect(() => setHighlight(null), [setHighlight]);

  const play = (m = target) => {
    ignoreMicUntil.current = Date.now() + 1500; // so the mic doesn't hear the speaker
    playNote(m, 1.4);
  };

  useEffect(() => {
    if (!event || event.id === seen.current) return;
    seen.current = event.id;
    if (!started || waiting.current) return;
    if (event.source === "mic" && Date.now() < ignoreMicUntil.current) return;
    const right = event.midi % 12 === target % 12;
    recordAttempt("ear", right);
    if (right) {
      setFeedback({ text: `Yes, it was ${noteName(target).replace(/\d/, "")}.`, state: "right" });
      waiting.current = true;
      setTimeout(() => {
        const next = pick(POOL, target);
        waiting.current = false;
        setFeedback(null);
        setTarget(next);
        play(next);
      }, 1000);
    } else {
      setFeedback({ text: "Close. Listen again and try another key.", state: "wrong" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event]);

  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h2>Ear training</h2>
          <p className="muted">Listen to a note, then find it on the white keys. Any octave counts.</p>
        </div>
      </div>
      <div className="drill">
        {started ? (
          <>
            <button className="big-button" onClick={() => play()}>
              Play the note again
            </button>
            <p className={`feedback ${feedback ? `is-${feedback.state}` : ""}`} aria-live="polite">
              {feedback?.text ?? "Which note did you hear?"}
            </p>
            <p className="muted">
              Tip: play middle C first, then count up until it sounds the same.
            </p>
          </>
        ) : (
          <button
            className="big-button"
            onClick={() => {
              setStarted(true);
              play();
            }}
          >
            Start listening
          </button>
        )}
      </div>
    </section>
  );
}
