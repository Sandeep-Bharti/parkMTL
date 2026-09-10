#!/usr/bin/env bash
#
# Copy the built artifacts into the mobile app's asset directory.
#
#   scripts/build/stage-assets.sh
#
# Phase 3 ships the data inside the app. Phase 6 replaces these copies with
# downloads into the same document directory the app already reads from, so
# only this staging step goes away.

set -euo pipefail

OUT="data/out"
BASE="data/basemap"
DEST="apps/mobile/assets/data"

mkdir -p "$DEST"

need() {
  if [ ! -s "$1" ]; then
    echo "missing $1 — run '$2' first" >&2
    exit 1
  fi
}

need "$OUT/montreal.pmtiles" "npm run tiles"
need "$OUT/montreal.sqlite" "npm run build"
need "$BASE/montreal-base.pmtiles" "scripts/build/basemap.sh"

# Renamed from the upstream montreal.pmtiles/montreal.sqlite basenames: Android's
# resource merger derives a raw-resource id by stripping the extension, so two
# bundled assets sharing a basename ("montreal") collide as "assets_data_montreal"
# and fail the release build with "Duplicate resources" — found by actually
# running a production build, not by reasoning about it in the abstract.
cp "$OUT/montreal.pmtiles" "$DEST/montreal-tiles.pmtiles"
cp "$OUT/montreal.sqlite" "$DEST/montreal-db.sqlite"
cp "$BASE/montreal-base.pmtiles" "$DEST/montreal-base.pmtiles"
cp "$OUT/manifest.json" "$DEST/manifest.json"

du -h "$DEST"/* | sort -h
echo "staged into $DEST"
