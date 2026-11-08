# Piano practice

A web app for adult beginners learning piano at home on a Roland FP-10.

- Note reading: a note appears on the treble or bass staff and you play it.
- Songs: play simple melodies one note at a time.
- Ear training: hear a note and find it on the keys.
- Practice: streaks and daily counts, saved in this browser.

## Connecting the piano

Use Chrome or Edge. Connect the FP-10's USB port (on the back, marked USB to host) to the computer
with a USB cable, turn the piano on, then press "Piano over USB or Bluetooth". Bluetooth MIDI also
works once the FP-10 is paired in macOS (Audio MIDI Setup → MIDI Studio → Bluetooth).

No cable? "Microphone" listens through the computer's mic. It works one note at a time and only
checks the letter, since a mic often hears a piano an octave off.

## Running it

```bash
npm install
npm run dev
```

Opens at http://localhost:5180.
