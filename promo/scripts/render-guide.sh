#!/usr/bin/env bash
# Render one guide: 1080p master -> 720p web file + poster + contact sheet for review.
set -e
id="$1"
cd "$(dirname "$0")/.."
FF=$(powershell -c "(Get-Command ffmpeg).Source" | tr -d '\r')
FP=$(powershell -c "(Get-Command ffprobe).Source" | tr -d '\r')
mkdir -p out/guides/final out/guides/review
npx remotion render src/index.ts Guide "out/guides/$id-raw.mp4" --props="{\"id\":\"$id\"}" --crf=16 --concurrency=6 --log=error
"$FF" -y -v error -i "out/guides/$id-raw.mp4" -vf scale=1280:720:flags=lanczos -c:v libx264 -preset slow -crf 26 -tune animation -pix_fmt yuv420p -af "volume=2dB,alimiter=limit=0.89:level=disabled" -ar 48000 -c:a aac -b:a 128k -movflags +faststart "out/guides/final/$id.mp4"
"$FF" -y -v error -ss 0.8 -i "out/guides/$id-raw.mp4" -frames:v 1 -vf scale=1280:-1 -q:v 4 "out/guides/final/$id.jpg"
d=$("$FP" -v error -show_entries format=duration -of csv=p=0 "out/guides/final/$id.mp4")
"$FF" -y -v error -i "out/guides/$id-raw.mp4" -vf "fps=2,scale=360:-1,tile=8x$(python -c "import math;print(math.ceil(float('$d')*2/8))")" -frames:v 1 "out/guides/review/$id.png"
echo "$id $d s $(du -k "out/guides/final/$id.mp4" | cut -f1) KB"
