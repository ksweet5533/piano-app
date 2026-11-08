# Calibration recordings

Real piano audio that `npm test` replays through the mic listener, so tuning can only move forward.

- **Known-sequence takes** (`takes.json`): a plain WAV of keys played in a known order, with the
  score it must meet or beat. Raise `atLeast` / lower `atMost` whenever the listener improves.
  `middleLagMs` caps how long, typically, the keys C4 to B5 take to be heard after the strike.
- **Calibrate tab takes** (`piano-calibration-*.wav`): downloaded from the app, with every key
  labeled. Each key must be heard, and heard as nothing else.
