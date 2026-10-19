import { LESSONS } from '../src/guides2/lessons';
const ids = process.argv.slice(2);
for (const l of LESSONS.filter((x) => ids.includes(x.id))) {
  const lines = [l.intro, ...l.steps.map((s) => s.say), l.outro];
  console.log(JSON.stringify({ id: l.id, n: lines.length, prompt: '[warmly] ' + lines.join(' [pause] ') }));
}
