# Publishing offline installers

## Automatic releases

1. Merge an update into `main`. A push to `main` runs **Offline desktop installers** in GitHub Actions. Pull requests run validation only. The workflow can also be run manually **on `main`**.
2. The workflow assigns a unique version (`1.4.<workflow run number>`) and builds four full installers: Windows x64 and ARM64 NSIS `.exe` files and Intel/Apple silicon `.dmg` files. These are **not** network bootstrap installers. The build machines need internet access to fetch Electron and packaging tools; target computers do not.
3. After all packages succeed, the workflow uploads them and `SHA256SUMS.txt` to a draft release for the exact commit, then publishes it as the latest release. A failed build does not replace the last working release. Installers are never committed to Git.
4. Download from [Releases](https://github.com/Analoggeek/SmartboardOS2/releases/latest) and use that full installer for fresh or offline upgrade installs. Installed desktop copies can use **Settings → App → Check for updates** to verify and download the newest published full installer, then launch it. There are no background downloads. On Mac the disk image is opened and the user replaces the app; unattended replacement is not supported by these ad-hoc-signed builds. Fully disconnected machines must receive the new installer by USB or other local transfer.

The publish job requires GitHub Actions to be enabled and the workflow's `GITHUB_TOKEN` to be allowed `contents: write` under repository/org policy. No personal access token is needed. CI does not perform publisher signing or Apple notarization; production deployments that require trusted signatures should configure those separately before wide rollout.

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

Find the `.exe` or `.dmg` under `dist/`. A local build does not publish to GitHub.

## Release smoke test on each platform

- Copy the installer to a clean Windows or macOS machine. Disconnect the machine from the internet before running setup, then launch from the installed shortcut or Applications.
- Open Recording Studio, try its available capture sources (including a newly attached webcam only after opting in), stop each recording, and verify it plays from the dated lesson folder. Test the 4K limit only with capable hardware.
- Draw and save on the whiteboard, open a local PDF, send its page to the board, and export a board PDF. Create a note, quit, and confirm that both the board and note return on relaunch.
- From the installed app, test **Check for updates** against a newer public release and confirm it opens the right installer after verification.
- Run a newer installer while disconnected and confirm the same data is still there and the new version appears in Settings.

## Optional web deployment

The **Deploy SmartBoardOS web app** workflow publishes renderer changes to [GitHub Pages](https://analoggeek.github.io/SmartboardOS2/) when they land on `main`. For forks, enable Pages with **GitHub Actions** as the source. The web edition is still a static site; for another host, serve `index.html`, `install.html`, `css/`, `js/`, `assets/`, `vendor/`, `manifest.webmanifest`, and `sw.js` together over HTTPS (or localhost for testing). Bump the cache version in `sw.js` whenever publishing changed web assets. Existing web tabs keep their current version until closed; then the verified cache activates.
