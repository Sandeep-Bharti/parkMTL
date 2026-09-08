# Release runbook

Phase 7. The data pipeline (Phase 2) is live — see **Data hosting** below.
Everything past that still needs paid developer accounts, so it is configured
but unexecuted against the real services.

## What you need before anything works

| | Cost | Why |
|---|---|---|
| Apple Developer Program | $99/yr | TestFlight, App Store |
| Google Play Console | $25 once | Play internal testing |
| Expo account | free tier fine | `eas build` runs on their infrastructure |

## One-time setup

```bash
npm install -g eas-cli          # or use npx
cd apps/mobile
eas login
eas init                        # creates the EAS project, writes extra.eas.projectId
```

`eas init` writes a project id into `app.json`. Commit it: it identifies the
app, not a secret.

## Builds

```bash
eas build --profile development --platform ios     # simulator dev client
eas build --profile preview --platform all         # internal testers
eas build --profile production --platform all      # store submission
```

`production` uses `autoIncrement`, so build numbers advance on their own.
`appVersionSource: "remote"` means EAS is the source of truth for them — do not
also bump them by hand in `app.json`.

## Submission

```bash
eas submit --profile production --platform ios      # -> App Store Connect / TestFlight
eas submit --profile production --platform android  # -> Play internal track
```

iOS asks for the Apple ID, App Store Connect app id and team id on first run.
Android needs a Play service-account JSON; **never commit it** — pass it as an
EAS secret or a path outside the repo.

## Store listing

The disclaimer is not optional marketing copy. Both feeds are CC-BY 4.0 and both
publishers state the data may diverge from the street, so the listing must carry
the attribution and say plainly that the app is guidance:

> Données : Agence de mobilité durable de Montréal; Ville de Montréal (CC BY 4.0)
>
> Guidance only — the signs on the street are authoritative.

Screenshots needed: the map at downtown zoom, a detail sheet on a multi-panel
pole, the scrubber mid-drag, and the settings/attribution screen. The simulator
produces store-acceptable sizes via `xcrun simctl io <device> screenshot`.

Both listings should exist in French and English. Quebec's Charter of the French
language applies to commercial listings served in Quebec; French is not a
translation afterthought here.

## Privacy

`PrivacyInfo.xcprivacy` declares file-timestamp, disk-space and UserDefaults API
use, and precise location as app functionality, not tracking. Review rejects
builds that use those APIs without a declaration.

The honest summary, which should also be the privacy policy: the app collects
nothing. Location is read on device to centre the map and is never stored or
transmitted. There is no analytics SDK and no account.

## Data hosting

**Live.** The repo is pushed to
[github.com/Sandeep-Bharti/parkMTL](https://github.com/Sandeep-Bharti/parkMTL),
`.github/workflows/data.yml` has run for real, and
`https://github.com/Sandeep-Bharti/parkMTL/releases/latest/download/manifest.json`
resolves to a genuine published build — verified by fetching it and cross-
checking its `artifacts.*.bytes` against the actual release asset sizes.

`preview` and `production` in [eas.json](../apps/mobile/eas.json) set
`EXPO_PUBLIC_DATA_URL` to that base, so builds from those profiles get real
updates with no manual step. `development` deliberately leaves it unset —
`DATA_BASE_URL` in [apps/mobile/src/updates.ts](../apps/mobile/src/updates.ts)
defaults to `null` in that case, which surfaces as "not configured" rather than
failing obscurely against a host that isn't there; override it locally with
`EXPO_PUBLIC_DATA_URL=http://localhost:8000` to test against a dev server.

The scheduled workflow only fires from the **default branch**, and GitHub
disables scheduled workflows after 60 days with no commits to the repo — the
risk flagged earlier. Worth a periodic check that it's still firing.

## Still open before a public release

- **Glyphs and sprites are fetched over HTTP** from `protomaps.github.io`, so a
  genuinely offline cold start renders the map without labels. Bundling them is
  outstanding.
- **SHA-256 is published but not verified on device** — only byte length is
  checked. See the note in `updates.ts`.
- **Search covers only streets with paid parking**, plus boroughs. Full street
  search needs a street-centreline join at build time.
- The **iOS build here required** `xcrun simctl runtime match set iphoneos26.5 23E254a`
  because Xcode's SDK and installed simulator runtime disagreed; EAS builds on
  their own images and should not hit this.
