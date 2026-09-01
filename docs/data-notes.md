# Data notes

Findings from working with the two upstream feeds. Recorded here because none
of it is documented upstream and all of it is easy to get wrong.

## Agence de mobilité durable (paid parking)

Base URL: `https://www.agencemobilitedurable.ca/images/data/<name>.csv`
License: CC-BY 4.0 (commercial use permitted with attribution)

- **The files are Windows-1252, not UTF-8.** Read as UTF-8, `Régulier` becomes
  `R�gulier` and — more damagingly — `sGenre === 'HANDICAPÉ'` never matches, so
  all 283 accessible spaces silently disappear. `scripts/ingest/normalize.ts`
  carries two canaries for this: a count of accented street names (expect
  ~3,365) and the accessible-space count.
- `DateExportation.csv` is 19 bytes. Any "file looks too small, must be an
  error" heuristic will reject it.
- Tariffs are integer cents: `425` is $4.25/h.
- `sType = Double` means two bays share a pole; `sAutreTete` names the other.
- Coordinates come in two pairs. `nLongitude`/`nLatitude` is the pole;
  `nPositionCentreLongitude`/`nPositionCentreLatitude` is the centre of the
  marked bay and is the better choice for map placement.
- ~19,573 spaces, ~4.47 regulations each.

### Regulation types (`Reglementations.sType`)

Undocumented upstream. Established by reading a representative
`ReglementationPeriode` description for each; see `TYPE_SEMANTICS` in
[`packages/city-montreal/src/amd.ts`](../packages/city-montreal/src/amd.ts).

| Type | Count | Meaning | Example description |
|---|---|---|---|
| `I` | 321 | Stationnement interdit | `STAT. INT. 8 h - 9 h 30 LUN À VEN` |
| `A` | 190 | Stationnement interdit | `STAT. INT. 4 h - 9 h LUN et JEU 01 nov au 31 déc` |
| `R` | 36 | Arrêt interdit | `ARRET INT. 6 h - 9 h 30 LUN À VEN AVEC REMORQUAGE` |
| `U` | 37 | Stationnement tarifé | `LUN à VEN 8h-23h SAM 9h-23h DIM 13h-18h` |
| `Q`, `P` | 23, 8 | Durée maximale | `MAX 3 h 9h - 18 h SAM` |
| `G` | 14 | Stationnement gratuit | `Stationnement gratuit 8h-10h LUN-VEN` |
| `D`, `M` | 10, 9 | Tarif journalier / maximum | `24h /24 7j /7 - (10 $ / 24h)` |
| `H` | 2 | Réservé handicapés | `\P Réservé aux handicapés` |
| `B` | 2 | Réservé véhicule électrique | `Réservée véhicule électrique en recharge` |
| `Z`, `F` | 3, 7 | Avis (no parking semantics) | `Interdit d attacher vélo après un parcomètre` |

`maxHeures` for type `M` uses a sentinel (`1100`) rather than a real duration,
so durations above 24h are discarded.

**`Periodes.csv` is fully structured** — explicit `dtHeureDebut`/`dtHeureFin`
and seven weekday booleans. The descriptions in `ReglementationPeriode.csv` are
labels only; never parse them. This is the opposite of the city signage feed.

## Ville de Montréal — Signalisation (stationnement sur rue)

[Dataset](https://donnees.montreal.ca/dataset/stationnement-sur-rue-signalisation-courant)
License: CC-BY 4.0. Refreshed daily.

- **`donnees.montreal.ca` returns `RBAC: access denied` to a default HTTP
  client.** A browser `User-Agent` is required. The refusal arrives with a 200
  status, so it will be written out as a valid CSV unless checked for.
- 144,177 sign rows across 102,132 poles and 20 boroughs; no missing
  coordinates. Filter on `DESCRIPTION_CAT` in
  `STATIONNEMENT` / `STAT-$` / `STAT. HORS RUE`.
- **`DESCRIPTION_REP` is the sign's lifecycle state, and only `Réel` is on the
  street.** Nearly a fifth of the feed is not:

  | `DESCRIPTION_REP` | Rows | |
  |---|---|---|
  | `Réel` | 118,359 | installed |
  | `Enlevé` | 12,209 | removed |
  | `En conception` | 8,283 | designed, not installed |
  | `Archive` | 5,326 | historical |

  Skipping this filter is not a cosmetic error. A removed `\P` paints a curb red
  where parking is now legal; a removed `P` paints it *green* where a new
  restriction may stand — the exact "clear spot that isn't" the app must never
  show. Filtering leaves 118,359 rows on 88,985 poles, and parse coverage rises
  to 99.36% because a good share of the unparseable tail is archived signage.
- `POSITION_POP` orders panels top to bottom on a pole. Sub-panels
  (`PANONCEAU …`, `AUTOCOL. …`) modify the panel above them and must not be
  evaluated standalone.
- `FLECHE_PAN` is the curb direction the sign governs: `0` (none) 83k,
  `3` 30k, `2` 29k, plus a long tail of `8`/`22`/`10`/`11`/`5`/`1`/`4`.

### Sign text (`DESCRIPTION_RPA`)

`PANNEAU_ID_RPA` is the city's own integer id for a sign text, and it is the
canonical `ruleId` throughout the pipeline. Verified: it is never blank, never
maps to two different texts, and ranges 1–17,021. Numbering rules by their
position in the CSV instead (as the pipeline first did) reshuffles the ids on
every daily refresh, which would silently mis-colour a client holding yesterday's
tiles against today's dictionary. AMD regulation codes share the namespace from
`1_000_000` up.

Only **1,525 distinct strings** across all 144k signs (1,402 among installed
signs), with a very heavy head:
top 25 cover 50%, top 100 cover 72%, top 400 cover 93%, top 800 cover 98%.
This is why parsing happens once at build time rather than on device.

Grammar:

```
[\P | \A | P] [duration] [time range]* [weekdays] [ET [time range]* [weekdays]]*
              [season] [EXCEPTE exemption]*
```

`\P` = stationnement interdit, `\A` = arrêt interdit, `P` = parking permitted.

Traps, all of which have a regression test in
[`packages/city-montreal/test/rpa-parser.test.ts`](../packages/city-montreal/test/rpa-parser.test.ts):

- **`P 02h 09h-18h`** — a greedy optional-minutes match reads `02h 09` as
  2:09 am, turning "2h cap, 9am–6pm" into nonsense. Minutes may not be followed
  by `H`. This affected ~1,500 signs.
- **Duration vs. range.** In `P 2h 8h-22h`, is `2h` a cap or a range start?
  Time tokens always pair into ranges, so an *odd* token count means exactly one
  is unpaired — the duration. This also resolves `P 2H - 8H @ 18H`, where the
  first separator is spurious.
- **Midnight-crossing ranges carry the weekday of their start.** `\P 19h-7h LUN`
  runs Monday evening into Tuesday morning; Monday 3 am is *not* covered.
- **`\P AUX CAMIONS` is not `\P EXCEPTE MOTOS`.** The first narrows the
  prohibition to trucks (a car may park); the second prohibits everything but
  motorcycles. Modelled as `appliesToVehicle` vs. `exemptions`.
- **A bare action marker is unconditional.** `\P DEUX COTES` (1,132 signs) says
  *where*, not *when* — it is in force at all times. Treating "no schedule
  found" as a parse failure would discard several thousand valid signs.
- Text quirks: doubled backslashes (`\\P`), lowercase (`\p`), run-together
  markers (`\P13H`), unspaced dates (`1AVRIL`), and outright typos in the source
  (`AVIL` for `AVRIL`, `LUNDRI` for `LUNDI`).
- `MARS` (month) must not be read as `MAR` (Tuesday). Seasons are extracted
  before weekdays for exactly this reason.

Current parser coverage: **99.27% of signs fully understood**, 0.33% partial,
0.40% unparsed. The remainder is genuine long tail — source typos and free-text
signs — and falls back to displaying the literal sign text.

## Attribution

Both feeds are CC-BY 4.0 and require attribution in the shipped app:

> Données : Agence de mobilité durable de Montréal; Ville de Montréal (CC BY 4.0)

Both publishers state the data may diverge from conditions in the field. The
signs on the street are authoritative — the app is guidance, not a guarantee.
