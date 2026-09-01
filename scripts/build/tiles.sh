#!/usr/bin/env bash
#
# Build montreal.pmtiles from the GeoJSON sequences build.ts emits.
#
# tippecanoe is a native binary and the only thing in this project that is not a
# Node builtin, so it lives in CI rather than in package.json. Locally this is
# optional: everything except the tiles builds without it.
#
#   scripts/build/tiles.sh [out-dir]

set -euo pipefail

OUT="${1:-data/out}"

if ! command -v tippecanoe >/dev/null 2>&1; then
  echo "tippecanoe not found." >&2
  echo "  macOS:  brew install tippecanoe" >&2
  echo "  Ubuntu: apt-get install -y tippecanoe" >&2
  exit 127
fi

for f in poles bays; do
  if [ ! -s "$OUT/$f.geojsonl" ]; then
    echo "missing $OUT/$f.geojsonl — run 'npm run build' first" >&2
    exit 1
  fi
done

# -zg picks the max zoom from feature density. Points are dropped rather than
# clustered at low zoom: a cluster would be a feature the rule engine cannot
# colour, and an invented marker is worse than an absent one.
tippecanoe \
  --output="$OUT/montreal.pmtiles" \
  --force \
  --minimum-zoom=10 \
  --maximum-zoom=16 \
  --drop-densest-as-needed \
  --extend-zooms-if-still-dropping \
  --no-tile-size-limit \
  --named-layer=poles:"$OUT/poles.geojsonl" \
  --named-layer=bays:"$OUT/bays.geojsonl"

ls -lh "$OUT/montreal.pmtiles"
