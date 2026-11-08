export type Song = { id: string; title: string; notes: number[] };

const C = 60, D = 62, E = 64, F = 65, G = 67, A = 69;

export const SONGS: Song[] = [
  {
    id: "mary",
    title: "Mary had a little lamb",
    notes: [E, D, C, D, E, E, E, D, D, D, E, G, G, E, D, C, D, E, E, E, E, D, D, E, D, C],
  },
  {
    id: "twinkle",
    title: "Twinkle, twinkle, little star",
    notes: [C, C, G, G, A, A, G, F, F, E, E, D, D, C, G, G, F, F, E, E, D, G, G, F, F, E, E, D, C, C, G, G, A, A, G, F, F, E, E, D, D, C],
  },
  {
    id: "ode",
    title: "Ode to joy",
    notes: [E, E, F, G, G, F, E, D, C, C, D, E, E, D, D, E, E, F, G, G, F, E, D, C, C, D, E, D, C, C],
  },
];
