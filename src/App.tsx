import { useState } from "react";
import { Keyboard } from "./components/Keyboard";
import { useInput } from "./useInput";
import { Calibrate } from "./views/Calibrate";
import { EarTraining } from "./views/EarTraining";
import { NoteReading } from "./views/NoteReading";
import { Practice } from "./views/Practice";
import { Songs } from "./views/Songs";

const TABS = [
  { id: "reading", label: "Note reading" },
  { id: "songs", label: "Songs" },
  { id: "ear", label: "Ear training" },
  { id: "practice", label: "Practice" },
  { id: "calibrate", label: "Calibrate" },
] as const;
type Tab = (typeof TABS)[number]["id"];

export default function App() {
  const input = useInput();
  const [tab, setTab] = useState<Tab>("reading");
  const [highlight, setHighlight] = useState<number | null>(null);
  const view = { event: input.event, setHighlight };

  return (
    <div className="app">
      <header className="top">
        <h1>Piano practice</h1>
        <nav className="tabs" aria-label="Sections">
          {TABS.map((t) => (
            <button key={t.id} className={tab === t.id ? "is-on" : ""} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      <section className="connect" aria-label="Piano connection">
        <span className={`dot ${input.mode !== "none" ? "is-live" : ""}`} aria-hidden />
        <p className="connect-message">{input.message}</p>
        {input.mode === "mic" && (
          <div className="meter" role="meter" aria-label="Microphone level" aria-valuemin={0} aria-valuemax={1} aria-valuenow={input.level}>
            <div className="meter-fill" style={{ width: `${Math.min(100, Math.sqrt(input.level / 0.2) * 100)}%` }} />
          </div>
        )}
        <div className="connect-actions">
          <button className={input.mode === "midi" ? "is-on" : ""} onClick={input.connectKeyboard}>
            Piano over USB or Bluetooth
          </button>
          <button className={input.mode === "mic" ? "is-on" : ""} onClick={input.listenWithMic}>
            Microphone
          </button>
          {input.mode !== "none" && (
            <button className="quiet" onClick={input.stop}>
              Disconnect
            </button>
          )}
        </div>
      </section>

      <main>
        {tab === "reading" && <NoteReading {...view} />}
        {tab === "songs" && <Songs {...view} />}
        {tab === "ear" && <EarTraining {...view} />}
        {tab === "practice" && <Practice setHighlight={setHighlight} />}
        {tab === "calibrate" && <Calibrate stopInput={input.stop} setHighlight={setHighlight} />}
      </main>

      <footer className="keys">
        <Keyboard active={input.active} highlight={highlight} onPress={input.pressScreenKey} />
        <p className="muted keys-note">You can also click these keys to try things out.</p>
      </footer>
    </div>
  );
}
