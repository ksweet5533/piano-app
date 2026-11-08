import { useEffect, useRef, useState } from "react";
import { noteName } from "../lib/notes";
import { recordAttempt } from "../lib/practice";
import { SONGS } from "../lib/songs";
import { sameNote, type NoteEvent } from "../useInput";

type Props = { event: NoteEvent | null; setHighlight: (m: number | null) => void };

export function Songs({ event, setHighlight }: Props) {
  const [songId, setSongId] = useState(SONGS[0].id);
  const [index, setIndex] = useState(0);
  const [missed, setMissed] = useState(false);
  const seen = useRef(event?.id ?? 0);
  const song = SONGS.find((s) => s.id === songId)!;
  const done = index >= song.notes.length;

  useEffect(() => setHighlight(done ? null : song.notes[index]), [done, index, song, setHighlight]);

  useEffect(() => {
    if (!event || event.id === seen.current) return;
    seen.current = event.id;
    if (done) return;
    if (sameNote(song.notes[index], event.midi, event.source)) {
      setMissed(false);
      const next = index + 1;
      setIndex(next);
      if (next === song.notes.length) recordAttempt("songs", true);
    } else {
      setMissed(true);
    }
  }, [event, index, song, done]);

  const choose = (id: string) => {
    setSongId(id);
    setIndex(0);
    setMissed(false);
  };

  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h2>Songs</h2>
          <p className="muted">Play each note when it lights up. Go at your own pace.</p>
        </div>
        <select value={songId} onChange={(e) => choose(e.target.value)} aria-label="Song">
          {SONGS.map((s) => (
            <option key={s.id} value={s.id}>
              {s.title}
            </option>
          ))}
        </select>
      </div>
      <div className="drill">
        <ol className="song-notes">
          {song.notes.map((m, i) => (
            <li key={i} className={i < index ? "is-played" : i === index ? (missed ? "is-current is-missed" : "is-current") : ""}>
              {noteName(m).replace(/\d/, "")}
            </li>
          ))}
        </ol>
        <p className={`feedback ${done ? "is-right" : missed ? "is-wrong" : ""}`} aria-live="polite">
          {done
            ? "You played the whole song."
            : missed
              ? `Look for ${noteName(song.notes[index])} on the keyboard below.`
              : `Next: ${noteName(song.notes[index])}`}
        </p>
        <p className="muted">
          {Math.min(index, song.notes.length)} of {song.notes.length} notes
        </p>
        {done && (
          <button className="big-button" onClick={() => choose(songId)}>
            Play it again
          </button>
        )}
      </div>
    </section>
  );
}
