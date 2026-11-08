import { useEffect, useRef } from "react";
import { HIGHEST, LOWEST, MIDDLE_C, isBlack, noteName } from "../lib/notes";

const BLACK_SHARE = 0.6; // a black key's width compared with a white key's
const MIN_WHITE = 13; // px; below this the keyboard scrolls sideways (phones)

type Props = {
  active: Set<number>;
  highlight?: number | null;
  onPress: (midi: number) => void;
};

/**
 * All 88 keys, like the FP-10, stretched to fit the width so every key sits
 * where it does on the real piano. Narrow screens scroll, opening on middle C.
 */
export function Keyboard({ active, highlight, onPress }: Props) {
  const scroller = useRef<HTMLDivElement>(null);
  const whites: number[] = [];
  const blacks: { midi: number; at: number }[] = [];
  for (let m = LOWEST; m <= HIGHEST; m++) {
    if (isBlack(m)) blacks.push({ midi: m, at: whites.length });
    else whites.push(m);
  }
  const white = 100 / whites.length; // % of the keyboard's width

  useEffect(() => {
    const el = scroller.current;
    if (!el || el.scrollWidth <= el.clientWidth) return;
    const middleC = (whites.indexOf(MIDDLE_C) + 0.5) * (el.scrollWidth / whites.length);
    el.scrollLeft = middleC - el.clientWidth / 2;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cls = (m: number, base: string) =>
    [base, active.has(m) && "is-down", highlight === m && "is-target"].filter(Boolean).join(" ");

  return (
    <div className="keyboard-scroll" ref={scroller}>
      <div className="keyboard" style={{ minWidth: whites.length * MIN_WHITE }}>
        {whites.map((m) => (
          <button key={m} className={cls(m, "key white")} style={{ width: `${white}%` }} onPointerDown={() => onPress(m)} aria-label={noteName(m)}>
            {m % 12 === 0 && <span className="key-label">{noteName(m)}</span>}
          </button>
        ))}
        {blacks.map(({ midi, at }) => (
          <button
            key={midi}
            className={cls(midi, "key black")}
            style={{ left: `${(at - BLACK_SHARE / 2) * white}%`, width: `${BLACK_SHARE * white}%` }}
            onPointerDown={() => onPress(midi)}
            aria-label={noteName(midi)}
          />
        ))}
      </div>
    </div>
  );
}
