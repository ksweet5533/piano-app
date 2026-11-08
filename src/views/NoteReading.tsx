import { useEffect, useRef, useState } from "react";
import { Staff, type Clef } from "../components/Staff";
import { naturalsBetween, noteName, pick } from "../lib/notes";
import { recordAttempt } from "../lib/practice";
import { sameNote, type NoteEvent } from "../useInput";

const RANGES: Record<Clef, number[]> = {
  treble: naturalsBetween(60, 79), // C4 to G5
  bass: naturalsBetween(41, 60), // F2 to C4
};

type Choice = Clef | "both";
type Target = { clef: Clef; midi: number };

const nextTarget = (choice: Choice, prev?: Target): Target => {
  const clef: Clef = choice === "both" ? pick<Clef>(["treble", "bass"]) : choice;
  return { clef, midi: pick(RANGES[clef], prev?.clef === clef ? prev.midi : undefined) };
};

type Props = { event: NoteEvent | null; setHighlight: (m: number | null) => void };

export function NoteReading({ event, setHighlight }: Props) {
  const [choice, setChoice] = useState<Choice>("treble");
  const [target, setTarget] = useState<Target>(() => nextTarget("treble"));
  const [feedback, setFeedback] = useState<{ text: string; state: "right" | "wrong" } | null>(null);
  const [hint, setHint] = useState(false);
  const [score, setScore] = useState({ right: 0, total: 0 });
  const waiting = useRef(false);
  const seen = useRef(event?.id ?? 0);

  useEffect(() => setHighlight(hint ? target.midi : null), [hint, target, setHighlight]);

  useEffect(() => {
    if (!event || event.id === seen.current || waiting.current) return;
    seen.current = event.id;
    const right = sameNote(target.midi, event.midi, event.source);
    recordAttempt("reading", right);
    setScore((s) => ({ right: s.right + (right ? 1 : 0), total: s.total + 1 }));
    if (right) {
      setFeedback({ text: `Yes, that's ${noteName(target.midi)}.`, state: "right" });
      waiting.current = true;
      setTimeout(() => {
        waiting.current = false;
        setFeedback(null);
        setTarget((t) => nextTarget(choice, t));
      }, 800);
    } else {
      setFeedback({ text: `You played ${noteName(event.midi)}. Try again.`, state: "wrong" });
    }
  }, [event, target, choice]);

  const changeClef = (c: Choice) => {
    setChoice(c);
    setFeedback(null);
    setTarget(nextTarget(c));
  };

  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h2>Note reading</h2>
          <p className="muted">Find the note on your piano and play it.</p>
        </div>
        <div className="segmented" role="group" aria-label="Clef">
          {(["treble", "bass", "both"] as Choice[]).map((c) => (
            <button key={c} className={choice === c ? "is-on" : ""} onClick={() => changeClef(c)}>
              {c === "both" ? "Both clefs" : c === "treble" ? "Treble" : "Bass"}
            </button>
          ))}
        </div>
      </div>
      <div className="drill">
        <Staff clef={target.clef} midi={target.midi} state={feedback?.state} />
        <p className={`feedback ${feedback ? `is-${feedback.state}` : ""}`} aria-live="polite">
          {feedback?.text ?? "Which note is this?"}
        </p>
        <div className="drill-foot">
          <label className="check">
            <input type="checkbox" checked={hint} onChange={(e) => setHint(e.target.checked)} /> Show me the key
          </label>
          <span className="muted">
            {score.right} of {score.total} right this session
          </span>
        </div>
      </div>
    </section>
  );
}
