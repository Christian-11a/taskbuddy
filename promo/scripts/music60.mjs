// Original 30s soundtrack for the TaskBuddy promo, synthesized from scratch.
// 120 BPM, 4/4 → 1 beat = 0.5s = 15 video frames @30fps, 1 bar = 2s = 60 frames.
// Arrangement mirrors src/timeline.ts so every visual hit lands on a musical hit.
import { writeFileSync, mkdirSync } from 'node:fs';

const SR = 44100;
const DUR = 60;
const N = SR * DUR;
const BPM = 120;
const BEAT = 60 / BPM;
const BAR = BEAT * 4;
const L = new Float32Array(N);
const R = new Float32Array(N);

// deterministic noise
let seed = 1337;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1;

const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const add = (i, l, r = l) => { if (i >= 0 && i < N) { L[i] += l; R[i] += r; } };

// ── sidechain envelope (kick ducking) ───────────────────────────────────────
const duck = new Float32Array(N).fill(1);
const kickTimes = [];

// ── state-variable filter helper ───────────────────────────────────────────
// Zero-delay-feedback SVF (Simper/Cytomic) — stable at any cutoff / Q.
function svf() {
  let ic1 = 0, ic2 = 0;
  return (x, fc, q = 0.7) => {
    const g = Math.tan(Math.PI * Math.min(Math.max(fc, 20), SR * 0.45) / SR);
    const k = 1 / q;
    const a1 = 1 / (1 + g * (g + k)), a2 = g * a1, a3 = g * a2;
    const v3 = x - ic2;
    const v1 = a1 * ic1 + a2 * v3;
    const v2 = ic2 + a2 * ic1 + a3 * v3;
    ic1 = 2 * v1 - ic1; ic2 = 2 * v2 - ic2;
    return { lp: v2, bp: v1, hp: x - k * v1 - v2 };
  };
}

// ── instruments ─────────────────────────────────────────────────────────────
function kick(t, gain = 1) {
  kickTimes.push(t);
  const s = Math.floor(t * SR);
  let ph = 0;
  for (let i = 0; i < SR * 0.45; i++) {
    const tt = i / SR;
    const f = 45 + 140 * Math.exp(-tt * 28);
    ph += (2 * Math.PI * f) / SR;
    const env = Math.exp(-tt * 7.5);
    const click = i < 90 ? rnd() * 0.35 * (1 - i / 90) : 0;
    const v = Math.tanh(Math.sin(ph) * 1.6) * env * 0.95 + click;
    add(s + i, v * gain);
  }
}

function clap(t, gain = 0.5) {
  const s = Math.floor(t * SR);
  const f = svf();
  for (let i = 0; i < SR * 0.3; i++) {
    const tt = i / SR;
    // three quick re-triggers then a tail = hand-clap shape
    const burst = [0, 0.011, 0.022].reduce((a, o) => a + (tt >= o ? Math.exp(-(tt - o) * 180) : 0), 0);
    const env = burst * 0.6 + Math.exp(-tt * 16) * 0.55;
    const n = f(rnd(), 1500, 1.4).bp;
    add(s + i, n * env * gain * 1.2, n * env * gain * 0.95);
  }
}

function snare(t, gain = 0.4) {
  const s = Math.floor(t * SR);
  const f = svf();
  let ph = 0;
  for (let i = 0; i < SR * 0.18; i++) {
    const tt = i / SR;
    ph += (2 * Math.PI * 190) / SR;
    const n = f(rnd(), 3200, 0.9).hp;
    const v = (n * 0.8 + Math.sin(ph) * 0.5 * Math.exp(-tt * 40)) * Math.exp(-tt * 22);
    add(s + i, v * gain);
  }
}

function hat(t, gain = 0.12, open = false, pan = 0) {
  const s = Math.floor(t * SR);
  const f = svf();
  const len = open ? 0.28 : 0.045;
  for (let i = 0; i < SR * len; i++) {
    const tt = i / SR;
    const n = f(rnd(), 9000, 0.8).hp;
    const env = Math.exp(-tt * (open ? 12 : 90));
    add(s + i, n * env * gain * (1 - pan), n * env * gain * (1 + pan));
  }
}

function saw(ph) { return 2 * (ph - Math.floor(ph + 0.5)); }

// supersaw chord stab / pad through a filter with its own envelope
function chord(t, notes, len, { gain = 0.08, cutoff = 2500, env = 6, voices = 5, detune = 0.18, attack = 0.004, sweep = null } = {}) {
  const s = Math.floor(t * SR);
  const fl = svf(), fr = svf();
  const phs = notes.flatMap(() => Array.from({ length: voices }, () => Math.random()));
  const total = Math.floor((len + 0.25) * SR);
  for (let i = 0; i < total; i++) {
    const tt = i / SR;
    let l = 0, r = 0, k = 0;
    for (const m of notes) {
      const base = mtof(m);
      for (let v = 0; v < voices; v++) {
        const d = (v - (voices - 1) / 2) * detune;
        const f = base * Math.pow(2, d / 12);
        phs[k] += f / SR;
        const x = saw(phs[k]);
        const p = v / (voices - 1 || 1);
        l += x * (1 - p); r += x * p; k++;
      }
    }
    const a = Math.min(1, tt / attack);
    const rel = tt > len ? Math.exp(-(tt - len) * 18) : 1;
    const fc = sweep ? sweep(tt) : 200 + cutoff * Math.exp(-tt * env);
    const amp = a * rel * gain / Math.sqrt(notes.length * voices) * 2.2;
    add(s + i, fl(l, fc, 0.9).lp * amp, fr(r, fc, 0.9).lp * amp);
  }
}

function bass(t, note, len, gain = 0.32) {
  const s = Math.floor(t * SR);
  const f = svf();
  let p1 = 0, p2 = 0, ps = 0;
  const fr = mtof(note);
  for (let i = 0; i < SR * len; i++) {
    const tt = i / SR;
    p1 += fr / SR; p2 += (fr * 1.006) / SR; ps += fr / SR;
    const x = saw(p1) * 0.5 + saw(p2) * 0.5;
    const fc = 180 + 900 * Math.exp(-tt * 9);
    const sub = Math.sin(2 * Math.PI * ps) * 0.9;
    const env = Math.min(1, tt / 0.004) * (tt > len - 0.02 ? (len - tt) / 0.02 : 1);
    add(s + i, (f(x, fc, 1.2).lp * 0.7 + sub) * env * gain);
  }
}

function pluck(t, note, gain = 0.07, pan = 0) {
  const s = Math.floor(t * SR);
  const f = svf();
  let p = 0, p2 = 0;
  const fr = mtof(note);
  for (let i = 0; i < SR * 0.35; i++) {
    const tt = i / SR;
    p += fr / SR; p2 += (fr * 2.003) / SR;
    const x = saw(p) * 0.7 + Math.sin(2 * Math.PI * p2) * 0.3;
    const fc = 400 + 5000 * Math.exp(-tt * 22);
    const v = f(x, fc, 1.1).lp * Math.exp(-tt * 9) * gain;
    add(s + i, v * (1 - pan), v * (1 + pan));
  }
}

function impact(t, gain = 1) {
  const s = Math.floor(t * SR);
  const f = svf(), f2 = svf();
  let ph = 0;
  for (let i = 0; i < SR * 2.4; i++) {
    const tt = i / SR;
    const fq = 32 + 90 * Math.exp(-tt * 9);
    ph += (2 * Math.PI * fq) / SR;
    const boom = Math.tanh(Math.sin(ph) * 2) * Math.exp(-tt * 1.8) * 0.9;
    const crashL = f(rnd(), 7000, 0.6).hp * Math.exp(-tt * 2.2) * 0.32;
    const crashR = f2(rnd(), 6500, 0.6).hp * Math.exp(-tt * 2.0) * 0.32;
    const snap = i < 400 ? rnd() * (1 - i / 400) * 0.7 : 0;
    add(s + i, (boom + crashL + snap) * gain, (boom + crashR + snap) * gain);
  }
}

function crash(t, gain = 0.22) {
  const s = Math.floor(t * SR);
  const f = svf(), g = svf();
  for (let i = 0; i < SR * 1.8; i++) {
    const tt = i / SR;
    const env = Math.exp(-tt * 2.6);
    add(s + i, f(rnd(), 6000, 0.7).hp * env * gain, g(rnd(), 6200, 0.7).hp * env * gain);
  }
}

// noise riser + rising tone between t0 and t1
function riser(t0, t1, gain = 0.25) {
  const s = Math.floor(t0 * SR), e = Math.floor(t1 * SR);
  const f = svf(), g = svf();
  let ph = 0;
  for (let i = s; i < e; i++) {
    const p = (i - s) / (e - s);
    const fc = 300 + 9000 * p * p;
    ph += (2 * Math.PI * (180 + 1400 * p * p)) / SR;
    const tone = Math.sin(ph) * 0.18 * p;
    const amp = gain * Math.pow(p, 1.6);
    add(i, (f(rnd(), fc, 2.5).bp + tone) * amp, (g(rnd(), fc * 1.05, 2.5).bp + tone) * amp);
  }
}

// reverse-cymbal swell ending exactly at t
function reverseSwell(t, len = 1, gain = 0.3) {
  const e = Math.floor(t * SR), s = e - Math.floor(len * SR);
  const f = svf();
  for (let i = s; i < e; i++) {
    const p = (i - s) / (e - s);
    const n = f(rnd(), 5000, 0.7).hp;
    add(i, n * Math.pow(p, 3) * gain, n * Math.pow(p, 3) * gain * 0.9);
  }
}

function whoosh(t, len = 0.5, gain = 0.2, up = true) {
  const s = Math.floor(t * SR);
  const f = svf();
  for (let i = 0; i < SR * len; i++) {
    const p = i / (SR * len);
    const fc = up ? 400 + 6000 * p : 6400 - 6000 * p;
    const env = Math.sin(Math.PI * p);
    const n = f(rnd(), fc, 3).bp * env * gain;
    add(s + i, n * (1 - p * 0.8), n * (0.2 + p * 0.8));
  }
}

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
// ── sidechain pump from kicks ───────────────────────────────────────────────
for (const t of kickTimes) {
  const s = Math.floor(t * SR);
  for (let i = 0; i < SR * 0.3; i++) {
    const tt = i / SR;
    const d = 1 - 0.55 * Math.exp(-tt * 14);
    if (s + i < N) duck[s + i] = Math.min(duck[s + i], d);
  }
}

// ── master: pump the non-kick bed, simple stereo delay, soft clip, fade ─────
// (The pump is approximated by ducking everything a little; kicks recover in 30ms.)
const out = Buffer.alloc(44 + N * 4);
const dl = Math.floor(BEAT * 0.75 * SR);
const DL = new Float32Array(N), DR = new Float32Array(N);
let peak = 0;
for (let i = 0; i < N; i++) {
  DL[i] = L[i] + (i >= dl ? DR[i - dl] * 0.22 : 0);
  DR[i] = R[i] + (i >= dl ? DL[i - dl] * 0.22 : 0);
}
const M = new Float32Array(N * 2);
for (let i = 0; i < N; i++) {
  const tt = i / SR;
  const fade = tt > DUR - 0.6 ? Math.max(0, (DUR - tt) / 0.6) : 1;
  const g = 0.85 + 0.15 * duck[i];
  const gap = tt > 53.74 && tt < 54 ? 0 : 1; // hard silence before the drop
  const l = Math.tanh(DL[i] * g * 0.75) * fade * gap;
  const r = Math.tanh(DR[i] * g * 0.75) * fade * gap;
  M[i * 2] = l; M[i * 2 + 1] = r;
  peak = Math.max(peak, Math.abs(l), Math.abs(r));
}
const norm = 0.89 / peak;
out.write('RIFF', 0); out.writeUInt32LE(36 + N * 4, 4); out.write('WAVE', 8);
out.write('fmt ', 12); out.writeUInt32LE(16, 16); out.writeUInt16LE(1, 20); out.writeUInt16LE(2, 22);
out.writeUInt32LE(SR, 24); out.writeUInt32LE(SR * 4, 28); out.writeUInt16LE(4, 32); out.writeUInt16LE(16, 34);
out.write('data', 36); out.writeUInt32LE(N * 4, 40);
for (let i = 0; i < N * 2; i++) out.writeInt16LE(Math.round(Math.max(-1, Math.min(1, M[i] * norm)) * 32767), 44 + i * 2);
mkdirSync(new URL('../public/', import.meta.url), { recursive: true });
writeFileSync(new URL('../public/music60.wav', import.meta.url), out);
console.log('wrote public/music60.wav', { peak: peak.toFixed(3) });
