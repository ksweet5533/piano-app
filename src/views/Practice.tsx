import { useEffect, useMemo } from "react";
import { dayKey, loadAttempts, streak, type Activity } from "../lib/practice";

const LABELS: Record<Activity, string> = { reading: "Note reading", ear: "Ear training", songs: "Songs finished" };

export function Practice({ setHighlight }: { setHighlight: (m: number | null) => void }) {
  useEffect(() => setHighlight(null), [setHighlight]);
  const attempts = useMemo(loadAttempts, []);
  const today = dayKey(Date.now());
  const todays = attempts.filter((a) => dayKey(a.t) === today);
  const accuracy = todays.length ? Math.round((todays.filter((a) => a.correct).length / todays.length) * 100) : null;

  const week = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    const key = dayKey(d.getTime());
    return { key, label: d.toLocaleDateString("en-US", { weekday: "short" }), count: attempts.filter((a) => dayKey(a.t) === key).length };
  });
  const most = Math.max(1, ...week.map((w) => w.count));

  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h2>Practice</h2>
          <p className="muted">Everything you play in the app is counted here, on this computer.</p>
        </div>
      </div>
      <div className="stats">
        <div className="stat">
          <span className="stat-value">{streak(attempts)}</span>
          <span className="muted">day streak</span>
        </div>
        <div className="stat">
          <span className="stat-value">{todays.length}</span>
          <span className="muted">notes played today</span>
        </div>
        <div className="stat">
          <span className="stat-value">{accuracy === null ? "–" : `${accuracy}%`}</span>
          <span className="muted">right today</span>
        </div>
      </div>
      <h3>This week</h3>
      <div className="week">
        {week.map((w) => (
          <div key={w.key} className="week-day">
            <div className="week-bar" style={{ height: `${(w.count / most) * 100}%` }} title={`${w.count} notes`} />
            <span className="muted">{w.label}</span>
          </div>
        ))}
      </div>
      <h3>All time</h3>
      <ul className="totals">
        {(Object.keys(LABELS) as Activity[]).map((k) => (
          <li key={k}>
            <span>{LABELS[k]}</span>
            <span>{attempts.filter((a) => a.activity === k && (k !== "songs" || a.correct)).length}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
