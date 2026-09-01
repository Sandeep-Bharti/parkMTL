#!/usr/bin/env bash
#
# Extract an offline Montreal basemap from the Protomaps daily planet build.
#
#   scripts/build/basemap.sh [YYYYMMDD] [out]
#
# The app ships this alongside montreal.pmtiles so the map works with no API
# key and no network: the same reason the parking data is a file rather than a
# service. `pmtiles extract` reads only the byte ranges the bounding box needs,
# so this pulls tens of MB out of a multi-terabyte planet file.
#
# The bounding box is the signage feed's extent, padded. Keep it in step with
# the `bounds` that tippecanoe reports for montreal.pmtiles.

set -euo pipefail

DATE="${1:-$(date -u -v-2d +%Y%m%d 2>/dev/null || date -u -d '2 days ago' +%Y%m%d)}"
OUT="${2:-data/basemap/montreal-base.pmtiles}"
BBOX="-74.00,45.38,-73.42,45.75"

if ! command -v pmtiles >/dev/null 2>&1; then
  echo "pmtiles not found." >&2
  echo "  macOS:  brew install pmtiles" >&2
  echo "  other:  https://github.com/protomaps/go-pmtiles/releases" >&2
  exit 127
fi

mkdir -p "$(dirname "$OUT")"

echo "extracting $BBOX from the $DATE planet build..."
pmtiles extract "https://build.protomaps.com/$DATE.pmtiles" "$OUT" \
  --bbox="$BBOX" \
  --maxzoom=15

pmtiles show "$OUT" | head -8
ls -lh "$OUT"
