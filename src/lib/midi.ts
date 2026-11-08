type Handlers = {
  onNote: (midi: number, on: boolean) => void;
  onDevices: (names: string[]) => void;
};

/** Listens to every connected MIDI input (USB or Bluetooth). Returns a stop function. */
export async function connectMidi({ onNote, onDevices }: Handlers): Promise<() => void> {
  const access = await navigator.requestMIDIAccess();
  const listen = (e: MIDIMessageEvent) => {
    if (!e.data) return;
    const [status, note, velocity] = e.data;
    const kind = status & 0xf0;
    if (kind === 0x90 && velocity > 0) onNote(note, true);
    else if (kind === 0x80 || (kind === 0x90 && velocity === 0)) onNote(note, false);
  };
  const attach = () => {
    const names: string[] = [];
    access.inputs.forEach((input) => {
      input.onmidimessage = listen;
      names.push(input.name ?? "MIDI keyboard");
    });
    onDevices(names);
  };
  attach();
  access.onstatechange = attach;
  return () => {
    access.onstatechange = null;
    access.inputs.forEach((input) => (input.onmidimessage = null));
  };
}
