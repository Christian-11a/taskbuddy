import test from 'node:test';
import assert from 'node:assert/strict';
import { alignLesson, wordsMatch, normalize } from './align.mjs';

// Build a whisper JSON from [text, fromMs, toMs] triples.
const whisper = (rows) => ({
  transcription: rows.map(([text, from, to]) => ({ text, offsets: { from, to } })),
});

const lesson = {
  id: 'pay',
  title: 'Pay',
  steps: [
    { headline: 'Open', narration: 'Open the app now.', screenshot: 'a.png' },
    { headline: 'Pay', narration: 'Pay with GCash in TaskBuddy, Lipa.', tapWord: 'GCash', screenshot: 'b.png' },
    { headline: 'Done', narration: 'You are done.', screenshot: 'c.png' },
  ],
};

const rows = [
  [' Open', 0, 400], [' the', 400, 600], [' app', 600, 900], [' now.', 900, 1300],
  ['', 1300, 1400], ['   ', 1400, 1450],
  [' Pay', 2000, 2300], [' with', 2300, 2500], [' Gee', 2500, 2700], [' cash', 2700, 3000],
  [' in', 3000, 3100], [' Task', 3100, 3400], [' buddy,', 3400, 3800], [' Lippa.', 3800, 4200],
  [' You', 5000, 5200], [' are', 5200, 5400], [' done.', 5400, 6000],
];

test('normalize and fuzzy compare', () => {
  assert.equal(normalize(' Lipa, '), 'lipa');
  assert.ok(wordsMatch('lipa', 'lippa'));
  assert.ok(!wordsMatch('the', 'she'));
  assert.ok(!wordsMatch('app', 'apt'));
});

test('aligns steps, misheard words, blanks, tapFrame and tail', () => {
  const r = alignLesson(lesson, whisper(rows));
  assert.equal(r.fps, 30);
  assert.deepEqual(r.steps.map((s) => s.startFrame), [0, 60, 150]);
  assert.equal(r.steps[0].endFrame, 60);
  assert.equal(r.steps[1].endFrame, 150);
  // last step ends at audio end (6000ms) + 0.5s = 6500ms = 195 frames
  assert.equal(r.steps[2].endFrame, 195);
  assert.equal(r.durationFrames, 195);
  // tapFrame = start of "GCash" (matched Gee+cash at 2500ms)
  assert.equal(r.steps[1].tapFrame, 75);
  assert.equal(r.steps[0].tapFrame, undefined);
  // words use script spelling
  assert.deepEqual(r.words.map((w) => w.text), [
    'Open', 'the', 'app', 'now.', 'Pay', 'with', 'GCash', 'in', 'TaskBuddy,', 'Lipa.', 'You', 'are', 'done.',
  ]);
  const gcash = r.words.find((w) => w.text === 'GCash');
  assert.equal(gcash.startFrame, 75);
  assert.equal(gcash.endFrame, 90);
  const lipa = r.words.find((w) => w.text === 'Lipa.');
  assert.equal(lipa.startFrame, 114);
});

test('interpolates a narration word that Whisper dropped', () => {
  const l = { id: 'x', steps: [{ headline: 'H', narration: 'Alpha zebra bravo charlie' }] };
  const r = alignLesson(l, whisper([[' Alpha', 0, 1000], [' bravo', 2000, 3000], [' charlie', 3000, 4000]]));
  assert.equal(r.words[1].startFrame, 30);
  assert.equal(r.words[1].endFrame, 60);
});

test('merges split whisper pieces', () => {
  const l = { id: 'x', steps: [{ headline: 'H', narration: 'Welcome tomorrow friend' }] };
  const r = alignLesson(
    l,
    whisper([[' Welcome', 0, 500], [' tomor', 500, 800], ['row', 800, 1000], [' friend', 1000, 1500]]),
  );
  assert.equal(r.words[1].startFrame, 15);
  assert.equal(r.words[2].startFrame, 30);
});

test('missing step throws naming it', () => {
  const l = {
    id: 'x',
    steps: [
      { headline: 'One', narration: 'Open the application' },
      { headline: 'Two', narration: 'Quantum flux capacitor engaged' },
      { headline: 'Three', narration: 'Finish everything today' },
    ],
  };
  const w = whisper([
    [' Open', 0, 300], [' the', 300, 400], [' application', 400, 1000],
    [' Finish', 3000, 3400], [' everything', 3400, 4000], [' today', 4000, 4500],
  ]);
  assert.throws(() => alignLesson(l, w), /step 1 \("Two"\)/);
});
