# Piano practice

A web app for adult beginners learning piano at home on a Roland FP-10.

Try it: https://ksweet5533.github.io/piano-app/ (use Chrome or Edge)

- Note reading: a note appears on the treble or bass staff and you play it.
- Songs: play simple melodies one note at a time.
- Ear training: hear a note and find it on the keys.
- Practice: streaks and daily counts, saved in this browser.

## Connecting the piano

Use Chrome or Edge. Connect the FP-10's USB port (on the back, marked USB to host) to the computer
with a USB cable, turn the piano on, then press "Piano over USB or Bluetooth". Bluetooth MIDI also
works once the FP-10 is paired in macOS (Audio MIDI Setup → MIDI Studio → Bluetooth).

No cable? "Microphone" listens through the computer's mic. It counts a note only when a key is
struck (a sudden rise above the room's background) and its pitch holds steady, so talking, hums and
fading notes are ignored. It works one note at a time and only checks the letter, since a mic often
hears a piano an octave off.

Two listeners share the mic. The quick one reads the middle of the keyboard (C4 to B5) within a few
cycles of the strike, through a steep high-pass that clears the key's thump. The careful one takes
longer windows and covers the bass, the top, and any middle note the quick one wasn't sure of.

## Running it

```bash
npm install
npm run dev
```

Opens at http://localhost:5180. `npm test` runs the mic tests, which play simulated rooms (noise,
hum, talking, a played phrase) through the note tracker.

## Working on it together

Make a branch, push it, and open a pull request. CI runs the type check, the tests and a build on
every pull request. Each push to `main` publishes the site to GitHub Pages within a couple of minutes.
