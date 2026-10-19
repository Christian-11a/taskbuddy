// Align a lesson script's narration to Whisper word timings.
// Usage: node scripts/align.mjs <lesson.json> <words.json> [out.json]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const FPS = 30;
const TAIL_MS = 500;
const LOOKAHEAD = 4; // whisper words that may be skipped
const MAX_JOIN = 3; // whisper pieces joined to match one narration word
const START_WINDOW = 3; // a step's first match must be among its first N words
const GUESS_MS = 300; // duration for unmatched words with no neighbour

export const frames = (ms) => Math.round((ms / 1000) * FPS);

export function normalize(s) {
  return String(s).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
}

function editDistance(a, b) {
  const m = a.length;
  const n = b.length;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
}

// Forgiving comparison of two already-normalized strings.
export function wordsMatch(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;
  const minLen = Math.min(a.length, b.length);
  if (minLen <= 3) return false; // short words must match exactly
  if (a.startsWith(b) || b.startsWith(a)) return true;
  const limit = Math.max(a.length, b.length) <= 5 ? 1 : 2;
  return editDistance(a, b) <= limit;
}

// Whisper JSON -> [{ norm, text, from, to }] in ms.
// Accepts { transcription: [...] } (whisper-cli) or a bare array.
export function parseWhisperWords(json) {
  const list = Array.isArray(json) ? json : json && json.transcription;
  if (!Array.isArray(list)) throw new Error('Whisper words JSON has no "transcription" array');
  const out = [];
  for (const e of list) {
    const raw = e && typeof e.text === 'string' ? e.text : '';
    const trimmed = raw.trim();
    if (!trimmed) continue;
    if (/^\[.*\]$/.test(trimmed) || /^\(.*\)$/.test(trimmed)) continue; // [BLANK_AUDIO], [_TT_x]
    const from = e.offsets && e.offsets.from;
    const to = e.offsets && e.offsets.to;
    if (typeof from !== 'number' || typeof to !== 'number') continue;
    const norm = normalize(trimmed);
    const prev = out[out.length - 1];
    const noLeadingSpace = !/^\s/.test(raw);
    // A token with no leading space that starts with a word char is a piece of the previous word.
    if (prev && noLeadingSpace && /^['’\p{L}\p{N}]/u.test(trimmed) && /[\p{L}\p{N}]$/u.test(prev.text)) {
      prev.text += trimmed;
      prev.norm += norm;
      prev.to = Math.max(prev.to, to);
      continue;
    }
    if (!norm) {
      // pure punctuation: just extend the previous word
      if (prev) prev.to = Math.max(prev.to, to);
      continue;
    }
    out.push({ norm, text: trimmed, from, to });
  }
  return out;
}

// Flatten narration into words, remembering which step each belongs to.
export function narrationWords(lesson) {
  const words = [];
  lesson.steps.forEach((step, stepIndex) => {
    for (const text of String(step.narration || '').split(/\s+/)) {
      const norm = normalize(text);
      if (norm) words.push({ text, norm, stepIndex });
    }
  });
  return words;
}

// Nearest match for narration word n at/after whisper index j, or null.
function tryMatch(n, nextN, W, j) {
  for (let skip = 0; skip <= LOOKAHEAD; skip++) {
    const s = j + skip;
    if (s >= W.length) break;
    if (n.norm.length <= 3 && skip > 2) break;
    let joined = '';
    for (let k = 1; k <= MAX_JOIN && s + k <= W.length; k++) {
      joined += W[s + k - 1].norm;
      if (wordsMatch(n.norm, joined)) return { skip, take: k, ntake: 1 };
    }
    // one whisper word covering two narration words ("Task Buddy" -> "Taskbuddy")
    if (nextN) {
      const both = n.norm + nextN.norm;
      if (both.length > 4 && wordsMatch(both, W[s].norm)) return { skip, take: 1, ntake: 2 };
    }
  }
  return null;
}

export function alignLesson(lesson, whisperJson) {
  if (!lesson || !Array.isArray(lesson.steps) || lesson.steps.length === 0) {
    throw new Error('Lesson has no steps');
  }
  const W = parseWhisperWords(whisperJson);
  if (W.length === 0) throw new Error('Whisper words JSON has no usable words');
  const N = narrationWords(lesson);

  // timing[i] = { from, to } in ms, or null when unmatched
  const timing = new Array(N.length).fill(null);
  let j = 0;
  for (let i = 0; i < N.length; i++) {
    const m = tryMatch(N[i], N[i + 1], W, j);
    if (!m) continue;
    const first = W[j + m.skip];
    const last = W[j + m.skip + m.take - 1];
    if (m.ntake === 2) {
      const mid = first.from + (last.to - first.from) / 2;
      timing[i] = { from: first.from, to: mid };
      timing[i + 1] = { from: mid, to: last.to };
      i += 1;
    } else {
      timing[i] = { from: first.from, to: last.to };
    }
    j += m.skip + m.take;
  }
  const matched = timing.map((t) => t !== null);

  // Interpolate unmatched words between matched neighbours.
  for (let i = 0; i < N.length; ) {
    if (timing[i]) {
      i++;
      continue;
    }
    let e = i;
    while (e < N.length && !timing[e]) e++;
    const count = e - i;
    let t0;
    let t1;
    if (i > 0 && e < N.length) {
      t0 = timing[i - 1].to;
      t1 = timing[e].from;
    } else if (e < N.length) {
      t1 = timing[e].from;
      t0 = Math.max(0, t1 - count * GUESS_MS);
    } else {
      t0 = timing[i - 1].to;
      t1 = t0 + count * GUESS_MS;
    }
    if (t1 < t0) t1 = t0;
    const slice = (t1 - t0) / count;
    for (let k = 0; k < count; k++) timing[i + k] = { from: t0 + k * slice, to: t0 + (k + 1) * slice };
    i = e;
  }

  // Step starts.
  const stepWordIdx = lesson.steps.map(() => []);
  N.forEach((w, i) => stepWordIdx[w.stepIndex].push(i));
  const startMs = lesson.steps.map((step, si) => {
    const idxs = stepWordIdx[si];
    const label = `step ${si} ("${step.headline ?? ''}")`;
    if (idxs.length === 0) throw new Error(`Cannot align ${label}: it has no narration words`);
    const k = idxs.slice(0, START_WINDOW).find((i) => matched[i]);
    if (k === undefined) {
      const opening = idxs.slice(0, START_WINDOW).map((i) => N[i].text).join(' ');
      throw new Error(
        `Cannot align ${label}: none of its opening words ("${opening}") were found in the audio transcript`,
      );
    }
    return timing[k].from;
  });
  for (let si = 1; si < startMs.length; si++) {
    if (startMs[si] < startMs[si - 1]) {
      throw new Error(
        `Cannot align step ${si} ("${lesson.steps[si].headline ?? ''}"): it starts before the previous step`,
      );
    }
  }

  const audioEndMs = W[W.length - 1].to;
  const endFrameLast = frames(audioEndMs + TAIL_MS);
  const wordsOut = N.map((w, i) => ({
    text: w.text,
    startFrame: frames(timing[i].from),
    endFrame: Math.max(frames(timing[i].from), frames(timing[i].to)),
  }));

  const steps = lesson.steps.map((step, si) => {
    const startFrame = frames(startMs[si]);
    const endFrame = si + 1 < lesson.steps.length ? frames(startMs[si + 1]) : endFrameLast;
    const out = { startFrame, endFrame };
    if (step.tapWord) {
      const target = normalize(step.tapWord);
      const hit = stepWordIdx[si].find((i) => wordsMatch(target, N[i].norm));
      if (hit !== undefined) out.tapFrame = wordsOut[hit].startFrame;
      else console.warn(`warning: tapWord "${step.tapWord}" not found in step ${si} ("${step.headline ?? ''}"); no tapFrame`);
    }
    return out;
  });

  return { fps: FPS, durationFrames: steps[steps.length - 1].endFrame, steps, words: wordsOut };
}

export function runCli(argv) {
  const [lessonPath, wordsPath, outArg] = argv;
  if (!lessonPath || !wordsPath) {
    throw new Error('Usage: node scripts/align.mjs <lesson.json> <words.json> [out.json]');
  }
  const lesson = JSON.parse(fs.readFileSync(lessonPath, 'utf8'));
  const words = JSON.parse(fs.readFileSync(wordsPath, 'utf8'));
  const result = alignLesson(lesson, words);
  const promoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const outPath = outArg
    ? path.resolve(outArg)
    : path.join(promoRoot, 'guides', 'timing', `${lesson.id}.timing.json`);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(result, null, 2) + '\n');
  return outPath;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    console.log(`Wrote ${runCli(process.argv.slice(2))}`);
  } catch (err) {
    console.error(`align failed: ${err.message}`);
    process.exit(1);
  }
}
