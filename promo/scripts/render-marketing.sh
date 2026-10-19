#!/usr/bin/env bash
# Render the hero loop, the 11 carousel clips and the 60 s film into out/ (not the site).
# Usage: bash scripts/render-marketing.sh   then check, then bash scripts/render-marketing.sh --publish
set -e
cd "$(dirname "$0")/.."
FF=$(powershell -c "(Get-Command ffmpeg).Source" | tr -d '\r')
WEB=../web/public/film
if [ "$1" = "--publish" ]; then
  cp out/hero2/taskbuddy-hero-loop.mp4 out/hero2/taskbuddy-hero-loop-640.mp4 "$WEB/"
  cp out/carousel/final/*.mp4 out/carousel/final/*.jpg "$WEB/story/"
  cp out/film/taskbuddy-film.mp4 "$WEB/"
  "$FF" -y -v error -ss 7.6 -i out/film/film-raw.mp4 -frames:v 1 -vf scale=1280:-1 -q:v 3 "$WEB/taskbuddy-film-poster.jpg"
  echo published
  exit 0
fi
mkdir -p out/hero2 out/carousel/final out/film
npx remotion render src/index.ts HeroLoop out/hero2/hero-loop-raw.mp4 --crf=14 --concurrency=6 --log=error
"$FF" -y -v error -i out/hero2/hero-loop-raw.mp4 -an -c:v libx264 -preset veryslow -crf 26 -tune animation -pix_fmt yuv420p -movflags +faststart out/hero2/taskbuddy-hero-loop.mp4
"$FF" -y -v error -i out/hero2/hero-loop-raw.mp4 -an -vf scale=640:-2:flags=lanczos -c:v libx264 -preset slow -crf 24 -pix_fmt yuv420p -movflags +faststart out/hero2/taskbuddy-hero-loop-640.mp4
echo "hero loop done"
for c in "customer 1" "customer 2" "customer 3" "customer 4" "customer 5" "provider 1" "provider 2" "provider 3" "provider 4" "provider 5" "provider 6"; do
  set -- $c; n="$1-$2"
  npx remotion render src/index.ts CarouselClip out/carousel/$n-raw.mp4 --props="{\"role\":\"$1\",\"step\":$2}" --crf=16 --concurrency=6 --log=error
  "$FF" -y -v error -i out/carousel/$n-raw.mp4 -an -vf scale=900:900:flags=lanczos -c:v libx264 -preset veryslow -crf 27 -tune animation -pix_fmt yuv420p -movflags +faststart out/carousel/final/$n.mp4
  npx remotion still src/index.ts CarouselPoster out/carousel/$n-poster.png --props="{\"role\":\"$1\",\"step\":$2}" --log=error
  "$FF" -y -v error -i out/carousel/$n-poster.png -vf scale=900:900:flags=lanczos -q:v 4 out/carousel/final/$n.jpg
done
echo "carousel done"
npx remotion render src/index.ts TaskBuddyFilm out/film/film-raw.mp4 --crf=16 --concurrency=6 --log=error
"$FF" -y -v error -i out/film/film-raw.mp4 -c:v libx264 -preset slow -crf 23 -tune animation -pix_fmt yuv420p -af "volume=10dB,alimiter=limit=0.84:attack=5:release=60:level=disabled" -ar 48000 -c:a aac -b:a 192k -movflags +faststart out/film/taskbuddy-film.mp4
echo "film done"
