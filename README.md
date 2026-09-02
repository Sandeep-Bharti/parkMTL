# parkmtl

*Can I park here right now, and when do I have to move?* — Montreal on-street
parking for iOS and Android.

Most parking apps for Montreal answer "where is pole number 12345". That is the
question you have **after** you have already parked. This one answers the
question you have **before**: it colours the curb green, amber or red for right
now, and tells you when that changes.

## Status

Phases 1–6 complete. The app answers the question, in both languages, and
refreshes its own data. Phase 7 is configured but needs developer accounts.

| Phase | | |
|---|---|---|
| 1 | Ingestion, rule parser, rules engine | **done** |
| 2 | Build artifacts (SQLite + PMTiles + manifest), daily CI | **done** |
| 3 | Expo app shell, MapLibre + PMTiles | **done** |
| 4 | Live colouring, time scrubber, detail sheet | **done** |
| 5 | Search / Nearby / Settings, i18n, attribution | **done** |
| 6 | Background data refresh | **done** |
| 7 | EAS build, TestFlight + Play internal | configured, not run |

Phase 7 needs an Apple Developer membership, a Google Play account and an EAS
login; see [docs/release.md](docs/release.md) for the runbook and for what is
still open before a public release.

## Layout

```
packages/rules-core/      City-neutral rule model and evaluator. No French,
                          no CSV schemas — a second city plugs in here.
packages/city-montreal/   Montreal adapters: the RPA sign-text parser and the
                          Agence de mobilité durable join.
scripts/ingest/           Build-time pipeline: fetch -> normalize -> parse.
                          dataset.ts is the single place the feeds are read
                          and filtered; everything else goes through it.
scripts/build/            Artifacts: SQLite, GeoJSON -> PMTiles, manifest,
                          the offline basemap extract, and asset staging.
apps/mobile/              Expo app. MapLibre renders two PMTiles layers; the
                          paint expression is compiled from the rules engine.
docs/data-notes.md        What the upstream feeds actually contain, and the
                          traps in them. Read this before touching ingestion.
```

## Running it

Needs Node 22.6+ and nothing else — the pipeline uses only Node builtins, so
there is no install step.

```bash
npm run fetch        # download both upstreams into data/raw/ (~35 MB)
npm run normalize    # join, validate, and report
npm run rules        # rule-parser coverage report
npm test             # 79 tests
npm run ingest       # all of the above, with CI thresholds enforced
npm run build        # SQLite + GeoJSON + manifest into data/out/
npm run tiles        # GeoJSON -> montreal.pmtiles (needs tippecanoe)
```

The pipeline itself uses only Node builtins. `tiles` needs tippecanoe and the
offline basemap needs the pmtiles CLI — both are native binaries, installed in
CI and optional locally (`brew install tippecanoe pmtiles`).

To run the app:

```bash
scripts/build/basemap.sh        # ~59 MB Montreal extract from Protomaps
scripts/build/stage-assets.sh   # copy artifacts into apps/mobile/assets/data/
cd apps/mobile && npm run ios   # dev build; Expo Go cannot load MapLibre
```

If the iOS build fails in `CompileAssetCatalogVariant` with *"No simulator
runtime version … available to use with iphonesimulator SDK version"*, Xcode's
SDK and its installed simulator runtime disagree. Point the SDK at the runtime
you have:

```bash
xcrun simctl runtime match list                    # find the installed build
xcrun simctl runtime match set iphoneos26.5 23E254a
```

`npm run normalize` prints a checklist and writes nothing if anything looks
wrong:

```
  ok   paid spaces in expected range              19573 (expected 15k-25k)
  ok   installed sign rows in expected range      118359 (expected 100k-160k)
  ok   installed signs are the bulk of the feed   82.1% Réel (expected >60%)
  ok   poles in expected range                    88985 (expected 70k-120k)
  ok   all 20 boroughs present                    20
  ok   AMD encoding intact                        3365 accented street names
  ok   parse coverage above 95%                   99.36%
  ok   every space has at least one regulation    0 without
```

## Design notes

**Rules are parsed once, at build time.** The installed signage reduces to 1,402
distinct sign strings, so parsing happens in CI and ships as a dictionary. A
mis-parse is fixable by republishing data, without an app store release.

**Rules are evaluated in JS; the map does the colouring.** Every map feature
carries a small integer `ruleId`. At a given instant `statusByRuleId()` resolves
all 2,064 rules in one pass — measured at 8 ms for the whole city — and the
result becomes a MapLibre `match` expression on the layer's paint property.
Dragging the time scrubber recolours the entire city with no per-feature
JavaScript and no marker components.

**The `ruleId` is the city's own, not ours.** It is `PANNEAU_ID_RPA` from the
signage feed, so it survives the daily refresh. Numbering rules by CSV position
would reshuffle them nightly, and tiles and dictionary are downloaded
separately: a client pairing yesterday's tiles with today's dictionary would
mis-colour the city rather than fail. The manifest's `ruleDictVersion` makes
that mismatch loud.

**A bay obeys many rules at once; the map matches on one integer.** A paid space
can carry sixteen regulations, and a `match` expression cannot evaluate a list.
Distinct *combinations* are few — 1,246 across the city — so each is named by a
`comboId` and resolved to its most restrictive member right after the rules are.

**An unreadable sign is never reported as a clear spot.** `unknown` outranks
every other status when combining the signs on a pole, and any rule the parser
could not fully understand forces the UI to show the literal sign text. The same
principle excludes the 18% of the signage feed that is removed, planned or
archived rather than actually on the street.

## Data

Both sources are CC-BY 4.0 and permit commercial use with attribution:

- [Agence de mobilité durable de Montréal](https://www.agencemobilitedurable.ca/fr/informations/donnees-ouvertes/description-des-donnees-disponibles) — 19,573 paid spaces, tariffs, regulations
- [Ville de Montréal — Signalisation (stationnement sur rue)](https://donnees.montreal.ca/dataset/stationnement-sur-rue-signalisation-courant) — 144,177 sign records, of which 118,359 on 88,985 poles are actually installed; refreshed daily

Both publishers note the data may diverge from conditions in the field. **The
signs on the street are authoritative.** The app is guidance, not a guarantee —
this must be surfaced prominently in the UI, not buried in a settings screen.

See [docs/data-notes.md](docs/data-notes.md) for schemas, undocumented type
codes, and the parsing traps.
