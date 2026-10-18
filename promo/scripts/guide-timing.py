"""Split one guide narration mp3 into its lines (intro, steps, outro) at the longest pauses.

Usage: python scripts/guide-timing.py <lesson-id> <number-of-lines>
Reads public/guides/audio/<id>.mp3, writes public/guides/timing/<id>.json: [{"a": start_s, "b": end_s}, ...].
The narration is generated with a [pause] tag between lines, so those gaps are the longest silences.
"""
import json, re, shutil, subprocess, sys
from pathlib import Path

lid, n = sys.argv[1], int(sys.argv[2])
root = Path(__file__).resolve().parent.parent
mp3 = root / 'public' / 'guides' / 'audio' / f'{lid}.mp3'
ff = shutil.which('ffmpeg') or 'ffmpeg'
out = subprocess.run([ff, '-hide_banner', '-i', str(mp3), '-af', 'silencedetect=noise=-38dB:d=0.22', '-f', 'null', '-'], capture_output=True, text=True).stderr
h, m, sec = re.search(r'Duration: (\d+):(\d+):([\d.]+)', out).groups()
dur = int(h) * 3600 + int(m) * 60 + float(sec)
starts = [float(x) for x in re.findall(r'silence_start: ([\d.]+)', out)]
ends = [float(x) for x in re.findall(r'silence_end: ([\d.]+)', out)]
gaps = [(e - s, s, e) for s, e in zip(starts, ends) if s > 0.15 and e < dur - 0.15]
if len(gaps) < n - 1:
    sys.exit(f'only {len(gaps)} pauses found, need {n - 1}')
cuts = sorted(sorted(gaps, reverse=True)[: n - 1], key=lambda g: g[1])
segs, a = [], 0.0
lead = [(s, e) for s, e in zip(starts, ends) if s <= 0.15]
if lead:
    a = lead[0][1] - 0.05
for _, s, e in cuts:
    segs.append({'a': round(max(0, a), 3), 'b': round(s + 0.08, 3)})
    a = e - 0.06
# trailing silence = a silence that runs to the end of the file (it has no end, or ends at the very end)
trail = [st for i, st in enumerate(starts) if st > a and (i >= len(ends) or ends[i] >= dur - 0.05)]
segs.append({'a': round(a, 3), 'b': round((trail[-1] + 0.1) if trail else dur, 3)})
(root / 'public' / 'guides' / 'timing').mkdir(parents=True, exist_ok=True)
(root / 'public' / 'guides' / 'timing' / f'{lid}.json').write_text(json.dumps(segs))
print(lid, 'dur', round(dur, 2), 'lines', [round(x['b'] - x['a'], 2) for x in segs])
