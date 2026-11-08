const NAMES = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];
const LETTER_STEP: Record<number, number> = { 0: 0, 2: 1, 4: 2, 5: 3, 7: 4, 9: 5, 11: 6 };

export const LOWEST = 21; // A0
export const HIGHEST = 108; // C8
export const MIDDLE_C = 60;

export const noteName = (midi: number) => NAMES[midi % 12] + (Math.floor(midi / 12) - 1);
export const pitchClassName = (midi: number) => NAMES[midi % 12];
export const isBlack = (midi: number) => [1, 3, 6, 8, 10].includes(midi % 12);
export const midiToFreq = (midi: number) => 440 * 2 ** ((midi - 69) / 12);
export const freqToMidi = (freq: number) => Math.round(69 + 12 * Math.log2(freq / 440));

/** Staff position counted in letter steps (C0 = 0). Natural notes only. */
export const diatonic = (midi: number) => (Math.floor(midi / 12) - 1) * 7 + LETTER_STEP[midi % 12];

export const naturalsBetween = (low: number, high: number) => {
  const out: number[] = [];
  for (let m = low; m <= high; m++) if (!isBlack(m)) out.push(m);
  return out;
};

export const pick = <T,>(items: T[], avoid?: T) => {
  const pool = items.length > 1 ? items.filter((i) => i !== avoid) : items;
  return pool[Math.floor(Math.random() * pool.length)];
};
