import { useCallback, useEffect, useRef, useState } from "react";
import { encodeCalibrationWav, toInt16, type KeyTake } from "../lib/calibration";
import { HIGHEST, LOWEST, noteName } from "../lib/notes";
import { startMic, type MicSession } from "../lib/pitch";

const STRIKES = 3;

type Props = { stopInput: () => void; setHighlight: (m: number | null) => void };
type Phase = "intro" | "running" | "done";

const verdict = (t: KeyTake) => {
  const right = t.heard.filter((m) => m === t.midi).length;
  const wrong = t.heard.length - right;
  if (wrong) return "wrong";
  if (right >= STRIKES) return "right";
  return right ? "partly" : "missed";
};

/** Walks up the keyboard one key at a time, recording what the mic hears and what the app made of it. */
export function Calibrate({ stopInput, setHighlight }: Props) {
  const [phase, setPhase] = useState<Phase>("intro");
  const [startKey, setStartKey] = useState(LOWEST);
  const [current, setCurrent] = useState(LOWEST);
  const [heard, setHeard] = useState<number[]>([]);
  const [takes, setTakes] = useState<KeyTake[]>([]);
  const [level, setLevel] = useState(0);
  const [error, setError] = useState("");

  const session = useRef<MicSession | null>(null);
  const chunks = useRef<Int16Array[]>([]);
  const samples = useRef(0);
  const keyStart = useRef(0);
  const currentRef = useRef(LOWEST);
  const heardRef = useRef<number[]>([]);
  const takesRef = useRef<KeyTake[]>([]);
  const advanceTimer = useRef<number>();
  const lastLevelAt = useRef(0);

  useEffect(() => setHighlight(phase === "running" ? current : null), [phase, current, setHighlight]);

  const finish = useCallback(() => {
    window.clearTimeout(advanceTimer.current);
    session.current?.stop();
    setPhase("done");
  }, []);

  const advance = useCallback(() => {
    window.clearTimeout(advanceTimer.current);
    advanceTimer.current = undefined;
    const take: KeyTake = {
      midi: currentRef.current,
      start: keyStart.current,
      length: samples.current - keyStart.current,
      heard: heardRef.current,
    };
    takesRef.current = [...takesRef.current, take];
    setTakes(takesRef.current);
    keyStart.current = samples.current;
    heardRef.current = [];
    setHeard([]);
    if (currentRef.current >= HIGHEST) return finish();
    currentRef.current += 1;
    setCurrent(currentRef.current);
  }, [finish]);

  const redo = useCallback(() => {
    window.clearTimeout(advanceTimer.current);
    advanceTimer.current = undefined;
    keyStart.current = samples.current;
    heardRef.current = [];
    setHeard([]);
  }, []);

  const start = async () => {
    stopInput();
    setError("");
    chunks.current = [];
    samples.current = 0;
    keyStart.current = 0;
    takesRef.current = [];
    heardRef.current = [];
    currentRef.current = startKey;
    setTakes([]);
    setHeard([]);
    setCurrent(startKey);
    try {
      session.current = await startMic(
        (midi) => {
          if (midi === null) return;
          heardRef.current = [...heardRef.current, midi];
          setHeard(heardRef.current);
          const right = heardRef.current.filter((m) => m === currentRef.current).length;
          if (right >= STRIKES && advanceTimer.current === undefined) {
            advanceTimer.current = window.setTimeout(advance, 1200); // let the last note ring into this key's recording
          }
        },
        (l) => {
          const now = performance.now();
          if (now - lastLevelAt.current < 80) return;
          lastLevelAt.current = now;
          setLevel(l);
        },
        (block) => {
          chunks.current.push(toInt16(block));
          samples.current += block.length;
        },
      );
      setPhase("running");
    } catch {
      setError("The microphone is blocked. Allow it for this page in Chrome, and for Chrome in System Settings → Privacy & Security → Microphone.");
    }
  };

  useEffect(() => {
    if (phase !== "running") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Space") { e.preventDefault(); advance(); }
      if (e.code === "KeyR") { e.preventDefault(); redo(); }
      if (e.code === "Escape") { e.preventDefault(); finish(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, advance, redo, finish]);

  useEffect(() => () => {
    window.clearTimeout(advanceTimer.current);
    session.current?.stop();
  }, []);

  const download = () => {
    const blob = encodeCalibrationWav(session.current?.sampleRate ?? 48000, chunks.current, {
      version: 1,
      createdAt: new Date().toISOString(),
      userAgent: navigator.userAgent,
      keys: takesRef.current,
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `piano-calibration-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-")}.wav`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
  };

  const counts = takes.reduce<Record<string, number>>((acc, t) => ({ ...acc, [verdict(t)]: (acc[verdict(t)] ?? 0) + 1 }), {});
  const problems = takes.filter((t) => verdict(t) !== "right");

  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h2>Calibrate the microphone</h2>
          <p className="muted">Play every key, bottom to top, so the app learns how your piano sounds in your room.</p>
        </div>
      </div>

      {phase === "intro" && (
        <div className="calibrate-intro">
          <ol>
            <li>Put the computer where it usually sits when you practice, and keep the room quiet.</li>
            <li>Play each key {STRIKES} times: soft, medium, then firm. Let each note sound before the next.</li>
            <li>The app moves on by itself once it hears the key {STRIKES} times. Press space to move on yourself, R to redo a key, Esc to stop.</li>
          </ol>
          <label className="check">
            Start at
            <select value={startKey} onChange={(e) => setStartKey(Number(e.target.value))}>
              {Array.from({ length: HIGHEST - LOWEST + 1 }, (_, i) => LOWEST + i).map((m) => (
                <option key={m} value={m}>
                  {noteName(m)}
                  {m === LOWEST ? " (lowest key)" : ""}
                </option>
              ))}
            </select>
          </label>
          <button className="big-button" onClick={start}>
            Start calibrating
          </button>
          {error && <p className="feedback is-wrong">{error}</p>}
        </div>
      )}

      {phase === "running" && (
        <div className="drill">
          <p className="muted">
            Key {current - LOWEST + 1} of {HIGHEST - LOWEST + 1}
          </p>
          <p className="calibrate-target">Play {noteName(current)}</p>
          <div className="meter calibrate-meter" role="meter" aria-label="Microphone level" aria-valuemin={0} aria-valuemax={1} aria-valuenow={level}>
            <div className="meter-fill" style={{ width: `${Math.min(100, Math.sqrt(level / 0.2) * 100)}%` }} />
          </div>
          <ol className="song-notes" aria-live="polite">
            {heard.length === 0 && <li className="is-empty">Listening…</li>}
            {heard.map((m, i) => (
              <li key={i} className={m === current ? "is-played" : "is-wrong-note"}>
                {noteName(m)}
              </li>
            ))}
          </ol>
          <div className="connect-actions">
            <button onClick={advance}>Next key (space)</button>
            <button onClick={redo}>Redo this key (R)</button>
            <button className="quiet" onClick={finish}>
              Stop (Esc)
            </button>
          </div>
        </div>
      )}

      {phase === "done" && (
        <div className="calibrate-done">
          <div className="stats">
            <div className="stat">
              <span className="stat-value">{counts.right ?? 0}</span>
              <span className="muted">keys heard right every time</span>
            </div>
            <div className="stat">
              <span className="stat-value">{(counts.partly ?? 0) + (counts.missed ?? 0)}</span>
              <span className="muted">keys with missed strikes</span>
            </div>
            <div className="stat">
              <span className="stat-value">{counts.wrong ?? 0}</span>
              <span className="muted">keys with wrong notes</span>
            </div>
          </div>
          <div className="key-grid" aria-label="Every key and how it went">
            {takes.map((t) => (
              <span key={t.midi} className={`key-cell is-${verdict(t)}`} title={`${noteName(t.midi)}: heard ${t.heard.map(noteName).join(", ") || "nothing"}`}>
                {noteName(t.midi)}
              </span>
            ))}
          </div>
          {problems.length > 0 && (
            <>
              <h3>Keys to work on</h3>
              <ul className="totals">
                {problems.map((t) => (
                  <li key={t.midi}>
                    <span>{noteName(t.midi)}</span>
                    <span className="muted">heard {t.heard.map(noteName).join(", ") || "nothing"}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
          <div className="connect-actions">
            <button className="big-button" onClick={download}>
              Download the recording
            </button>
            <button onClick={() => setPhase("intro")}>Calibrate again</button>
          </div>
          <p className="muted">The recording has every key labeled, so it can be used to tune the app for this piano.</p>
        </div>
      )}
    </section>
  );
}
