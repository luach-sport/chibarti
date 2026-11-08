#!/usr/bin/env bash
# Builds chibarti-pc.exe: copies the computer page (www/pc), the font, the icon and the QR drawing into web/ (built
# into the program), then compiles for 64-bit Windows without a console window. VERSION / BUILD set the version shown.
# With go-winres installed (CI installs it) the file also gets its icon, name and version in its properties.
# Usage: pc-app/build.sh [out-dir]   (works on Linux too; GOOS=windows is set here)
set -euo pipefail
cd "$(dirname "$0")"
OUT="${1:-dist}"
rm -rf web && mkdir -p web/fonts web/vendor
cp -R ../www/pc web/pc
cp ../www/fonts/Rubik-var.ttf web/fonts/
cp ../www/icon.png web/icon.png
cp ../www/vendor/qrcode.js web/vendor/qrcode.js
mkdir -p "$OUT"
WR="$(command -v go-winres || true)"
if [ -z "$WR" ] && [ -x "$(go env GOPATH)/bin/go-winres" ]; then WR="$(go env GOPATH)/bin/go-winres"; fi
if [ -n "$WR" ]; then
  V="${VERSION:-0.0}.${BUILD:-0}"
  "$WR" simply --arch amd64 --icon ../www/icon.png --manifest gui --product-name "חיברתי" --file-description "חיברתי למחשב" \
    --product-version "$V" --file-version "$V" --copyright "Itzko" --original-filename chibarti-pc.exe
fi
GOOS=windows GOARCH=amd64 CGO_ENABLED=0 go build -trimpath -ldflags "-H windowsgui -X main.version=${VERSION:-dev}" -o "$OUT/chibarti-pc.exe" .
echo "built $OUT/chibarti-pc.exe"
