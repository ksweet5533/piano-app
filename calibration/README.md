# Calibration recordings

Each `.wav` here is a take from the app's Calibrate tab: every key on a real piano, bottom to top,
with a `keys` chunk that says which key was being played when. `npm test` replays each one through
the mic listener and fails if any key is missed or heard as a wrong note.

Add a take by downloading it from the Calibrate tab and saving it in this folder.
