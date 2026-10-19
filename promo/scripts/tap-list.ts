// Lists every <Tap .../> in the guide/hero screens with its frame and position, evaluated.
// Usage: npx tsx scripts/tap-list.ts > out/taps.json
import { readFileSync } from 'node:fs';
import { K } from '../src/hero/story';
import { SU } from '../src/hero/Signup';

type T = { src: string; f: number; x: number; y: number; label: string; dur?: number };
const out: T[] = [];
const DUR = 150;
const at = (dur: number, x: number) => Math.round(dur * x);

const evalIn = (expr: string, scope: Record<string, unknown>) => {
  try {
    // eslint-disable-next-line no-new-func
    return Function(...Object.keys(scope), `return (${expr});`)(...Object.values(scope)) as number;
  } catch { return NaN; }
};
const TAP = /<Tap\s+(?:key=\{[^}]*\}\s+)?f=\{f\}\s+at=\{([^}]+)\}\s+x=\{([^}]+)\}\s+y=\{([^}]+)\}/g;

// Hero phones: f is the hero frame.
for (const [file, src] of [['src/hero/ClientPhone.tsx', 'client'], ['src/hero/ProviderPhone.tsx', 'provider']] as const) {
  const code = readFileSync(file, 'utf8');
  for (const m of code.matchAll(TAP)) {
    const scope = { K, has: false, i: 0 };
    const f = evalIn(m[1], scope); const x = evalIn(m[2], scope); const y = evalIn(m[3], scope);
    if ([f, x, y].every(Number.isFinite)) out.push({ src, f, x, y, label: `${src} ${m[1]}` });
    else if (m[1].includes('a') && m[1].trim() === 'a') { /* star taps in a map, handled below */ }
  }
}
// Review stars (map)
K.stars.forEach((a, i) => out.push({ src: 'client', f: a, x: 102 + i * 51, y: 346, label: `client star ${i + 1}` }));
// Signup (both roles)
{
  const code = readFileSync('src/hero/Signup.tsx', 'utf8');
  for (const role of ['client', 'provider'] as const) {
    for (const m of code.matchAll(TAP)) {
      const scope = { SU, role };
      const f = evalIn(m[1], scope); const x = evalIn(m[2], scope); const y = evalIn(m[3], scope);
      if ([f, x, y].every(Number.isFinite)) out.push({ src: `su-${role}`, f, x, y, label: `su-${role} ${m[1]}` });
    }
  }
}
// Custom guide screens: taps use at(dur, frac) or local consts; evaluate per screen with dur = 150.
for (const file of ['src/guides2/screens.tsx', 'src/guides2/screens2.tsx']) {
  const code = readFileSync(file, 'utf8');
  const fnRe = /^const (\w+)(?:: Screen)? = (?:\([^)]*\)|\w+) =>[\s\S]*?(?=^const |^export const |^\/\/ ──)/gm;
  for (const fm of code.matchAll(fnRe)) {
    const name = fm[1]; const body = fm[0];
    const locals: Record<string, number> = {};
    for (const lm of body.matchAll(/const (\w+) = (at\(dur, [\d.]+\)(?: [-+] \d+)?|Math\.round\(dur \* [\d.]+\)|\d+)/g)) locals[lm[1]] = evalIn(lm[2], { at, dur: DUR, Math });
    for (const lm of body.matchAll(/const \{? ?(\w+) ?\}? = (\w+)\(dur\)/g)) void lm;
    for (const m of body.matchAll(TAP)) {
      const scope = { at, dur: DUR, Math, K, SETTINGS_DARK: { x: 350, y: 237 }, has: true, tone: 'client', ...locals };
      const f = evalIn(m[1], scope); const x = evalIn(m[2], scope); const y = evalIn(m[3], scope);
      if ([f, x, y].every(Number.isFinite)) out.push({ src: name, f, x, y, label: `${name} ${m[1]}`, dur: DUR });
      else out.push({ src: name, f: -1, x: -1, y: -1, label: `UNRESOLVED ${name}: at=${m[1]} x=${m[2]} y=${m[3]}` });
    }
  }
}
console.log(JSON.stringify(out.filter((t) => t.f >= 0 || t.label.startsWith('UNRESOLVED')), null, 0));
