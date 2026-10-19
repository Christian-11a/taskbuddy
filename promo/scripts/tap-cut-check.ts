// Lists guide steps whose phone range cuts a tap in half (pressed in this step but its ring runs past the end,
// or started in the previous step). Usage: npx tsx scripts/tap-cut-check.ts
import { LESSONS } from '../src/guides2/lessons';
import { TAPS } from '../src/hero/story';
import { suTaps } from '../src/hero/Signup';

for (const l of LESSONS) l.steps.forEach((s, i) => {
  const src = s.phone;
  if (src.kind === 'screen') return;
  const taps = src.kind === 'signup' ? suTaps(src.role) : TAPS[src.role];
  for (const t of taps) {
    if (t >= src.from && t <= src.to && t + 14 > src.to) console.log(`${l.id} s${i + 1} ${src.from}-${src.to}: tap ${t} ring runs past end`);
    if (t > src.from && t - 12 < src.from) console.log(`${l.id} s${i + 1} ${src.from}-${src.to}: tap ${t} finger starts before step`);
  }
});
