// ── arrangement (60s, 30 bars) ──────────────────────────────────────────────
// Mirrors src/v2/timeline.ts. Section → bars:
//  0–1 hook · 2–3 two sides · 4–6 verified · 7–10 post · 11–14 propose
//  15–18 hire · 19–23 work & pay · 24–25 review · 26 build · 27 drop · 28–29 end
const PROG = [
  { root: 38, chord: [62, 65, 69, 74] },   // Dm
  { root: 34, chord: [62, 65, 70, 74] },   // Bb
  { root: 41, chord: [60, 65, 69, 72] },   // F
  { root: 36, chord: [60, 64, 67, 72] },   // C
];
const barT = (b) => b * BAR;
const beatT = (b, beat) => b * BAR + beat * BEAT;
const ARP = [0, 2, 1, 3, 2, 1, 3, 2];
const ch = (b) => PROG[b % 4];

function groove(b, o = {}) {
  const c = ch(b);
  const { kick: k = true, clap: cl = true, hats = 16, open = true, bassOn = true, stabs = true, arp = true, up = 0, pad = false } = o;
  if (k) for (let i = 0; i < 4; i++) kick(beatT(b, i), 1);
  if (cl) { clap(beatT(b, 1)); clap(beatT(b, 3)); }
  const step = 4 / hats;
  for (let i = 0; i < hats; i++) hat(beatT(b, i * step), (i * step) % 1 === 0.5 ? 0.1 : 0.045, false, i % 2 ? 0.35 : -0.35);
  if (open) for (let i = 0; i < 4; i++) hat(beatT(b, i + 0.5), 0.08, true);
  if (bassOn) for (let i = 0; i < 8; i++) bass(beatT(b, i * 0.5 + 0.25), c.root + (i === 7 ? 12 : 0), 0.22, 0.3);
  if (stabs) for (const s of [0, 0.75, 1.5, 2.5, 3.25]) chord(beatT(b, s), c.chord.map((n) => n + up), 0.18, { gain: 0.085, cutoff: 4200, env: 14 });
  if (arp) for (let i = 0; i < 8; i++) pluck(beatT(b, i * 0.5), c.chord[ARP[i]] + 12 + up, 0.05, i % 2 ? 0.4 : -0.4);
  if (pad) chord(barT(b), c.chord, BAR - 0.05, { gain: 0.05, cutoff: 1800, env: 0.5, attack: 0.3 });
}
function fill(b, g = 1) {
  for (let i = 0; i < 4; i++) snare(beatT(b, 3 + i * 0.25), (0.12 + i * 0.05) * g);
  whoosh(beatT(b, 3.25), 0.75, 0.22 * g);
}

// 0–1 HOOK: impact on frame 0, logo assembles, fill into bar 2
impact(0, 1.05);
chord(0, [...PROG[0].chord, 50], 1.6, { gain: 0.11, cutoff: 5000, env: 2.5 });
for (let i = 0; i < 4; i++) hat(beatT(0, 1 + i * 0.5), 0.06);
kick(barT(1), 0.9); kick(beatT(1, 2), 0.9);
for (let i = 0; i < 8; i++) hat(beatT(1, i * 0.5), 0.06);
chord(barT(1), PROG[1].chord, BAR - 0.05, { gain: 0.06, sweep: (tt) => 300 + tt * 1200, attack: 0.1 });
fill(1, 1.2);
reverseSwell(barT(2), 1, 0.3);

// 2–3 TWO SIDES: intro groove, filter opens
for (let b = 2; b <= 3; b++) {
  const c = ch(b - 2);
  for (let k = 0; k < 4; k++) kick(beatT(b, k), 0.95);
  for (let k = 0; k < 8; k++) hat(beatT(b, k * 0.5), k % 2 ? 0.1 : 0.05, false, k % 2 ? 0.3 : -0.3);
  if (b === 3) { clap(beatT(b, 1)); clap(beatT(b, 3)); }
  for (let k = 0; k < 8; k++) bass(beatT(b, k * 0.5 + 0.25), c.root, 0.22, 0.26);
  chord(barT(b), c.chord, BAR - 0.05, { gain: 0.07, sweep: (tt) => 300 + (b - 2 + tt / BAR) * 1500, attack: 0.08 });
}
crash(barT(2), 0.18);
fill(3);

// 4–6 VERIFIED: groove, arps, no stabs yet
for (let b = 4; b <= 6; b++) groove(b, { stabs: false, pad: true });
crash(barT(4), 0.2);
fill(6);

// 7–10 POST: full groove
for (let b = 7; b <= 10; b++) groove(b);
crash(barT(7), 0.22); crash(barT(9), 0.16);
fill(8, 0.7);
// hand-off whoosh (job card flies to the provider)
whoosh(beatT(10, 2.5), 1.0, 0.3);
reverseSwell(barT(11), 0.8, 0.3);

// 11–14 PROPOSE: full, voicing up an octave on stabs for lift
for (let b = 11; b <= 14; b++) groove(b, { up: 12 });
crash(barT(11), 0.22); crash(barT(13), 0.16);
whoosh(beatT(14, 2.5), 1.0, 0.3); // proposal flies back
reverseSwell(barT(15), 0.8, 0.3);

// 15–18 HIRE
for (let b = 15; b <= 18; b++) groove(b);
crash(barT(15), 0.22); crash(barT(17), 0.18);
fill(18);

// 19–23 WORK & PAY: breakdown → half-time → build
for (let b = 19; b <= 20; b++) groove(b, { kick: false, clap: false, hats: 8, open: false, stabs: false, pad: true });
crash(barT(19), 0.16);
for (let b = 21; b <= 22; b++) {
  groove(b, { kick: false, clap: false, hats: 16, open: false, stabs: false, pad: true });
  kick(beatT(b, 0), 1); kick(beatT(b, 2.5), 0.9); clap(beatT(b, 2));
}
groove(23, { stabs: false });
for (let k = 0; k < 8; k++) snare(beatT(23, k * 0.5), 0.1 + k * 0.015);
riser(barT(23), barT(24) - 0.02, 0.22);

// 24–25 REVIEW: stars ping on beats
for (let b = 24; b <= 25; b++) groove(b);
crash(barT(24), 0.22);
[beatT(24, 0), beatT(24, 1), beatT(24, 2), beatT(24, 3), beatT(25, 0)].forEach((t, i) => {
  pluck(t, 84 + [0, 2, 4, 5, 7][i], 0.07, 0);
  pluck(t + 0.004, 96 + [0, 2, 4, 5, 7][i], 0.03, 0);
});

// 26 BUILD: montage, accelerating snare roll, riser, gap before drop
for (let k = 0; k < 4; k++) kick(beatT(26, k * 0.5), 0.6 + k * 0.05);
for (let k = 0; k < 16; k++) snare(beatT(26, k * 0.25 * 0.875), 0.2 + k * 0.018);
for (let k = 0; k < 8; k++) pluck(beatT(26, k * 0.5), PROG[2].chord[ARP[k]] + 12 + 12 * (k / 8), 0.05);
chord(barT(26), PROG[3].chord, BAR - 0.05, { gain: 0.07, sweep: (tt) => 400 + (tt / BAR) * 6000, attack: 0.05 });
riser(barT(25) + BEAT * 2, beatT(26, 3.5), 0.3);
reverseSwell(barT(27), 0.5, 0.25);

// 27 DROP: logo + wordmark
impact(barT(27), 1.1);
for (let k = 0; k < 4; k++) kick(beatT(27, k), 1);
clap(beatT(27, 1)); clap(beatT(27, 3));
for (let k = 0; k < 8; k++) hat(beatT(27, k * 0.5 + 0.25), 0.07);
for (let k = 0; k < 8; k++) bass(beatT(27, k * 0.5 + 0.25), PROG[0].root, 0.22, 0.3);
chord(barT(27), PROG[0].chord, 0.9, { gain: 0.1, cutoff: 5000, env: 3 });
chord(beatT(27, 2), PROG[1].chord, 0.9, { gain: 0.1, cutoff: 5000, env: 3 });

// 28–29 END: final chord lands the tagline, rings out
impact(barT(28), 0.75);
chord(barT(28), [53, 60, 65, 69, 72, 77], 3.6, { gain: 0.12, cutoff: 3500, env: 0.8, voices: 7 });
bass(barT(28), 29, 3.4, 0.28);
for (const [i, n] of [72, 77, 81, 84].entries()) pluck(beatT(28, i * 0.25), n, 0.05, i % 2 ? 0.5 : -0.5);
pluck(beatT(29, 0), 89, 0.035, 0.3);
