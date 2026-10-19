// Renders one still per tap (TapAudit composition) and tiles them into contact sheets.
// Usage: node scripts/tap-audit.mjs out/taps/taps.json   (writes out/taps/<n>.png and out/taps/sheet-*.png)
import { bundle } from '@remotion/bundler';
import { renderStill, selectComposition } from '@remotion/renderer';
import { readFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const list = JSON.parse(readFileSync(process.argv[2], 'utf8')).filter((t) => t.f >= 0);
const outDir = path.resolve('out/taps');
mkdirSync(outDir, { recursive: true });
const serveUrl = await bundle({ entryPoint: path.resolve('src/index.ts') });
let i = 0;
for (const t of list) {
  const inputProps = { src: t.src, f: t.f, dur: t.dur ?? 150, x: t.x, y: t.y, label: `${i} ${t.label}`.slice(0, 48) };
  const composition = await selectComposition({ serveUrl, id: 'TapAudit', inputProps });
  await renderStill({ composition, serveUrl, inputProps, output: path.join(outDir, `${String(i).padStart(3, '0')}.png`), scale: 0.6 });
  i++;
}
console.log('rendered', i);
