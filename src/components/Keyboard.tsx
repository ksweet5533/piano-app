import { useEffect, useRef } from "react";
import { HIGHEST, LOWEST, MIDDLE_C, isBlack, noteName } from "../lib/notes";

const WHITE = 26;
const BLACK = 16;

type Props = {
  active: Set<number>;
  highlight?: number | null;
  onPress: (midi: number) => void;
};

/** All 88 keys, like the FP-10. Scrolls sideways and opens centered on middle C. */
export function Keyboard({ active, highlight, onPress }: Props) {
  const scroller = useRef<HTMLDivElement>(null);
  const whites: number[] = [];
  const blacks: { midi: number; left: number }[] = [];
  for (let m = LOWEST; m <= HIGHEST; m++) {
    if (isBlack(m)) blacks.push({ midi: m, left: whites.length * WHITE - BLACK / 2 });
    else whites.push(m);
  }

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const cX = whites.indexOf(MIDDLE_C) * WHITE;
    el.scrollLeft = cX - el.clientWidth / 2 + WHITE / 2;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cls = (m: number, base: string) =>
    [base, active.has(m) && "is-down", highlight === m && "is-target"].filter(Boolean).join(" ");

  return (
    <div className="keyboard-scroll" ref={scroller}>
      <div className="keyboard" style={{ width: whites.length * WHITE }}>
        {whites.map((m) => (
          <button key={m} className={cls(m, "key white")} style={{ width: WHITE }} onPointerDown={() => onPress(m)} aria-label={noteName(m)}>
            {m % 12 === 0 && <span className="key-label">{noteName(m)}</span>}
          </button>
        ))}
        {blacks.map(({ midi, left }) => (
          <button key={midi} className={cls(midi, "key black")} style={{ left, width: BLACK }} onPointerDown={() => onPress(midi)} aria-label={noteName(midi)} />
        ))}
      </div>
    </div>
  );
}
