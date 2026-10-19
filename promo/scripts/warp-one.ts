// Prints the phone frame every 0.25 s for one guide step, using the same mapping as GuideVideo.
// Usage: npx tsx scripts/warp-one.ts <lesson-id> <step 1-based>
import { readFileSync, existsSync } from 'node:fs';
import { LESSONS } from '../src/guides2/lessons';
import { layout, phoneWarp } from '../src/guides2/GuideVideo';
const [id, n] = process.argv.slice(2);
const l = LESSONS.find((x) => x.id === id)!;
const tp = `public/guides/timing/${id}.json`;
const { parts } = layout(l, existsSync(tp) ? JSON.parse(readFileSync(tp, 'utf8')) : null);
const s = l.steps[Number(n) - 1];
const dur = parts[Number(n)].dur;
const w = phoneWarp(s.phone as any, dur);
const out: string[] = [];
for (let t = 0; t <= dur; t += 7.5) out.push(w.w(t).toFixed(0));
console.log(`range ${w.from}-${w.to} dur ${dur} endAt ${w.w.endAt.toFixed(0)}:`, out.join(' '));
