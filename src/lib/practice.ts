export type Activity = "reading" | "ear" | "songs";
export type Attempt = { t: number; activity: Activity; correct: boolean };

const KEY = "piano-app:practice";

export function loadAttempts(): Attempt[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]") as Attempt[];
  } catch {
    return [];
  }
}

export function recordAttempt(activity: Activity, correct: boolean) {
  const all = loadAttempts();
  all.push({ t: Date.now(), activity, correct });
  try {
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    // Storage full or blocked; practice still works, it just isn't saved.
  }
}

export const dayKey = (t: number) => new Date(t).toLocaleDateString("en-CA");

/** Consecutive days with practice, counting back from today (or yesterday). */
export function streak(attempts: Attempt[]) {
  const days = new Set(attempts.map((a) => dayKey(a.t)));
  const d = new Date();
  if (!days.has(dayKey(d.getTime()))) d.setDate(d.getDate() - 1);
  let n = 0;
  while (days.has(dayKey(d.getTime()))) {
    n++;
    d.setDate(d.getDate() - 1);
  }
  return n;
}
