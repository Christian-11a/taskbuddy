# TaskBuddy mascot refresh (brief for Codex)

Inputs (in this folder / repo):
- `site-screenshot.jpg`: how the mascot looks on the website today (About section).
- `../taskbuddy-mascot.webp`: the current mascot file (832x832, transparent).

Problems to fix:
1. A pale blue triangle shape sits behind the feet (a broken shadow). Remove it.
2. The body is royal blue; the app's brand is "Sky" blue: primary #0369A1, light #0284C7, highlight #7DD3FC, deep #0C4A6E. The check tile/badge is teal; keep an accent but make it fit (teal-green #15803D-ish or sky #38BDF8, your call, consistent).
3. Edges/shading look slightly muddy at small sizes. Keep the soft 3D clay look but make it crisp and clean.

Keep the character the same: rounded-square body, small friendly face (two dark eyes, small smile), three bar "list lines" on the belly with a check tile, holding a checklist card in one hand and a round check badge in the other, short legs with big feet. Same proportions and personality. No text, no logo.

Deliver (PNG, transparent background, 1254x1254, character centered with some padding, a very soft round contact shadow under the feet only):
- `mascot-default.png`: same pose as today (checklist + check badge), fixed colors.
- `mascot-wave.png`: same character, one hand waving hello, the other holding the round check badge; cheerful. For the end card of a 60 s promo film on a blue (#0369A1) background, so it must read well on blue too (a thin light rim light helps).
- `mascot-thumbs.png`: same character giving a thumbs-up (the website alt text says "showing a thumbs-up").

Save into `promo/public/mascot-new/` only. Do not edit any other file. Do not commit.

## Sharpness (important)
The current file looks blurry when shown large. Make every output sharp and high resolution: render at full 1254x1254 (or larger, then downscale), clean anti-aliased edges, crisp face and icons, no soft/smudgy areas, no upscaling artifacts, no JPEG noise. Check each PNG at 100% zoom before saving.
