// Samples the guide phone time-warp for every hero/signup step (phone frame every 0.5 s).
// Usage: npx tsx scripts/warp-check.ts
import { readFileSync, existsSync } from 'node:fs';
import { LESSONS } from '../src/guides2/lessons';
import { layout, realSpeed } from '../src/guides2/GuideVideo';
import { TAPS } from '../src/hero/story';
import { suTaps } from '../src/hero/Signup';
import { CUTS } from '../src/film/Film';

for (const l of LESSONS) {
  const tp = `public/guides/timing/${l.id}.json`;
  const timing = existsSync(tp) ? JSON.parse(readFileSync(tp, 'utf8')) : null;
  const { parts } = layout(l, timing);
  l.steps.forEach((s, i) => {
    const src = s.phone;
    if (src.kind === 'screen') return;
    const dur = parts[i + 1].dur;
    const w = realSpeed(src.from, src.to, dur, src.kind === 'signup' ? suTaps(src.role) : TAPS[src.role], src.kind === 'signup' ? [] : CUTS[src.role]);
    const xs: number[] = [];
    for (let t = 0; t <= dur; t += 15) xs.push(Math.round(w(t)));
    console.log(`${l.id} s${i + 1} ${src.from}-${src.to} ${(dur / 30).toFixed(1)}s: ${xs.join(' ')}`);
  });
}
