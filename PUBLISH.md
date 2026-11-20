# Publishing offline installers

## Automatic releases

1. Merge an update into `main`. A push to `main` runs **Offline desktop installers** in GitHub Actions. Pull requests run unit tests and a QA-only Android build/emulator smoke test, without publisher secrets. The workflow can also be run manually **on `main`**.
2. The workflow assigns a unique version (`1.4.<workflow run number>`) and builds four full desktop installers and, when configured, a signed Android APK: Windows x64 and ARM64 NSIS `.exe` files and Intel/Apple silicon `.dmg` files. These are **not** network bootstrap installers. The build machines need internet access to fetch Electron and packaging tools; target computers do not.
3. After all packages succeed, the workflow uploads them and `SHA256SUMS.txt` to a draft release for the exact commit, then publishes it as the latest release. A failed build does not replace the last working release. Installers are never committed to Git.
4. Download from [Releases](https://github.com/Analoggeek/SmartboardOS2/releases/latest) and use that full installer for fresh or offline upgrade installs. Installed desktop copies can use **Settings → App → Check for updates** to verify and download the newest published full installer, then launch it. There are no background downloads. On Mac the disk image is opened and the user replaces the app; unattended replacement is not supported by this updater. Fully disconnected machines must receive the new installer by USB or other local transfer.

The publish job requires GitHub Actions to be enabled and the workflow's `GITHUB_TOKEN` to be allowed `contents: write` under repository/org policy. No personal access token is needed.

## Configure publisher verification

Only enable each `SBOS_*_SIGNING` repository **variable** after adding its configuration under **Settings → Secrets and variables → Actions**. Keep private material in **Actions secrets**, never in the repository or a chat. A signing-enabled platform fails the workflow if signing/verification fails; it does not fall back to unsigned. Release notes disclose each platform's actual verification status. Turning off signing should not be part of normal release operations once enabled.

| Platform | Variables | Secrets / external setup |
| --- | --- | --- |
| Android | `SBOS_ANDROID_SIGNING=true`, `SBOS_ANDROID_KEY_ALIAS`, `SBOS_ANDROID_CERT_SHA256` (64 hex digits, no colons) | `SBOS_ANDROID_KEYSTORE_B64`, `SBOS_ANDROID_STORE_PASSWORD`, `SBOS_ANDROID_KEY_PASSWORD`. Use, back up, and protect a project-owned release keystore. Preserve it across APK updates so Android accepts upgrades. `apksigner` verifies APK signing scheme v2 and the pinned certificate fingerprint. |
| Windows | `SBOS_WIN_SIGNING=true`, `SBOS_WIN_PUBLISHER` (certificate simple name), `SBOS_WIN_ENDPOINT`, `SBOS_WIN_ACCOUNT`, `SBOS_WIN_PROFILE` | `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET` for a Microsoft Artifact Signing / Trusted Signing **public-trust** certificate profile. Grant only the appropriate profile signer role. CI checks trusted, timestamped Authenticode on both the NSIS installer and the installed executable. SmartScreen reputation is independent of signing. |
| macOS | `SBOS_MAC_SIGNING=true`, `SBOS_MAC_TEAM_ID` | `SBOS_MAC_CERT_P12_B64`, `SBOS_MAC_CERT_PASSWORD` (Developer ID **Application** certificate and private key), `SBOS_APPLE_API_KEY_B64` (App Store Connect `.p8`), `SBOS_APPLE_API_KEY_ID`, `SBOS_APPLE_API_ISSUER`. CI enables the hardened runtime, notarizes and staples the app and DMG, and validates Team ID plus Gatekeeper assessment. |

With no signing setup, the desktop workflow continues to publish explicitly labelled unsigned Windows/ad-hoc Mac packages. Android CI uses a separate `.qa` app ID and throwaway signing certificate for the emulator; the QA APK is an Actions artifact, never a public release asset. View QA results from the `android` job. The QA artifact is not proof that the emulator step completed; Android production signing requires a successful Airplane Mode smoke test before the release APK is built. A native iPhone/iPad release would require a separately signed iOS build and Apple distribution (normally TestFlight/App Store); this repository currently publishes the Safari home-screen edition only.

## Local packaging

Build on the relevant OS using Node.js 22.12+:

```sh
npm ci
npm test
# Windows
npm run dist:win -- --x64
npm run dist:win -- --arm64
# macOS (use the matching runner or Mac for each architecture)
npm run dist:mac -- --x64
npm run dist:mac -- --arm64
```

Find the `.exe` or `.dmg` under `dist/`. For an Android QA build, install JDK 17, Android SDK platform 35 and build-tools 35.0.0, set `ANDROID_HOME`, then run `bash scripts/build-android.sh qa`. That throws away its QA key on exit. A local build does not publish to GitHub.

## Release smoke test on each platform

- Copy the installer to a clean Windows or macOS machine. Disconnect the machine from the internet before running setup, then launch from the installed shortcut or Applications.
- Open Recording Studio, try its available capture sources (including a newly attached webcam only after opting in), stop each recording, and verify it plays from the dated lesson folder. Test the 4K limit only with capable hardware.
- Draw and save on the whiteboard, open a local PDF, send its page to the board, and export a board PDF. Create a note, quit, and confirm that both the board and note return on relaunch.
- From the installed app, test **Check for updates** against a newer public release and confirm it opens the right installer after verification.
- Run a newer installer while disconnected and confirm the same data is still there and the new version appears in Settings.

## Optional web deployment

The **Deploy SmartBoardOS web app** workflow publishes renderer changes to [GitHub Pages](https://analoggeek.github.io/SmartboardOS2/) when they land on `main`. For forks, enable Pages with **GitHub Actions** as the source. The web edition is still a static site; for another host, serve `index.html`, `install.html`, `css/`, `js/`, `assets/`, `vendor/`, `manifest.webmanifest`, and `sw.js` together over HTTPS (or localhost for testing). Bump the cache version in `sw.js` whenever publishing changed web assets. Existing web tabs keep their current version until closed; then the complete cache activates. Home confirms the cache via a service-worker status check; it does not infer readiness from registration.
