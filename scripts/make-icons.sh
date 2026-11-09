#!/usr/bin/env bash
# Генерация PNG-иконок из SVG-исходников (web/icons/*.svg)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
IC="$ROOT/web/icons"
RES="$ROOT/android/app/src/main/res"

if ! command -v rsvg-convert >/dev/null 2>&1; then
  echo "Нужен rsvg-convert: apt-get install librsvg2-bin" >&2
  exit 1
fi

mkdir -p "$ROOT/docs"

# --- PWA / favicon ---
rsvg-convert -w 192  -h 192  "$IC/icon.svg"     -o "$IC/icon-192.png"
rsvg-convert -w 512  -h 512  "$IC/icon.svg"     -o "$IC/icon-512.png"
rsvg-convert -w 1024 -h 1024 "$IC/icon.svg"     -o "$IC/icon-1024.png"
rsvg-convert -w 512  -h 512  "$IC/maskable.svg" -o "$IC/maskable-512.png"
cp -f "$IC/icon-512.png" "$ROOT/docs/icon-preview.png"

# --- Android: классические mipmap (до API 26) ---
while IFS=: read -r size density; do
  mkdir -p "$RES/mipmap-$density"
  rsvg-convert -w "$size" -h "$size" "$IC/icon.svg"  -o "$RES/mipmap-$density/ic_launcher.png"
  rsvg-convert -w "$size" -h "$size" "$IC/round.svg" -o "$RES/mipmap-$density/ic_launcher_round.png"
done <<'EOF'
48:mdpi
72:hdpi
96:xhdpi
144:xxhdpi
192:xxxhdpi
EOF

# --- Android: передний план адаптивной иконки (108dp × плотность) ---
while IFS=: read -r size density; do
  mkdir -p "$RES/mipmap-$density"
  rsvg-convert -w "$size" -h "$size" "$IC/foreground.svg" -o "$RES/mipmap-$density/ic_launcher_foreground.png"
done <<'EOF'
108:mdpi
162:hdpi
216:xhdpi
324:xxhdpi
432:xxxhdpi
EOF

echo "Иконки готовы:"
find "$IC" "$RES" -name '*.png' | sort | sed "s|$ROOT/||"
