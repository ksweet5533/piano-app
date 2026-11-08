import { diatonic } from "../lib/notes";

export type Clef = "treble" | "bass";

const HALF = 7; // half a staff space
const BOTTOM_LINE_Y = 104;
const BOTTOM_LINE = { treble: diatonic(64), bass: diatonic(43) }; // E4, G2

type Props = { clef: Clef; midi: number; state?: "right" | "wrong" | null };

/** One whole note on a five-line staff, with ledger lines when it sits outside the staff. */
export function Staff({ clef, midi, state }: Props) {
  const bottom = BOTTOM_LINE[clef];
  const step = diatonic(midi) - bottom;
  const y = BOTTOM_LINE_Y - step * HALF;
  const x = 150;
  const lines = [0, 2, 4, 6, 8].map((s) => BOTTOM_LINE_Y - s * HALF);
  const ledgers: number[] = [];
  for (let s = -2; s >= step; s -= 2) ledgers.push(BOTTOM_LINE_Y - s * HALF);
  for (let s = 10; s <= step; s += 2) ledgers.push(BOTTOM_LINE_Y - s * HALF);

  return (
    <svg className={`staff ${state ? `is-${state}` : ""}`} viewBox="0 0 240 170" role="img" aria-label={`A note on the ${clef} staff`}>
      {lines.map((ly) => (
        <line key={ly} x1="10" x2="230" y1={ly} y2={ly} className="staff-line" />
      ))}
      <text className="clef" x="16" y={clef === "treble" ? 117 : 98} fontSize={clef === "treble" ? 92 : 62}>
        {clef === "treble" ? "𝄞" : "𝄢"}
      </text>
      {ledgers.map((ly) => (
        <line key={ly} x1={x - 16} x2={x + 16} y1={ly} y2={ly} className="staff-line" />
      ))}
      <ellipse className="note-head" cx={x} cy={y} rx="9.5" ry="6.8" transform={`rotate(-20 ${x} ${y})`} />
    </svg>
  );
}
