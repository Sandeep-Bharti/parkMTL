# Release runbook

Phase 7. Everything here needs credentials and paid developer accounts, so none
of it has been executed — the configuration is in place and untested against the
real services.

## What you need before anything works

| | Cost | Why |
|---|---|---|
| Apple Developer Program | $99/yr | TestFlight, App Store |
| Google Play Console | $25 once | Play internal testing |
| Expo account | free tier fine | `eas build` runs on their infrastructure |

`gh` is not installed and the repository has no remote, so the data pipeline's
GitHub Releases publishing (Phase 2) is also not yet live. The app currently
falls back to `http://localhost:8000` for updates — see **Data hosting** below.

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

Until the repo has a remote and CI publishes releases, `DATA_BASE_URL` in
[apps/mobile/src/updates.ts](../apps/mobile/src/updates.ts) points at
`localhost:8000`. Before shipping, set `EXPO_PUBLIC_DATA_URL` to the release
asset base — the app reads it at build time.

Note that a release build hitting a plain-HTTP host will be blocked by App
Transport Security. The published URL must be HTTPS, which GitHub Releases and
any CDN already are.

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
