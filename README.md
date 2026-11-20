# SmartBoardOS

An offline classroom workspace for teachers. Draw on a whiteboard, mark up PDF pages, run a class timer, and keep lesson notes and media on your own device. No account is required.

## Install on a PC or Mac — no internet needed on the device

Open the [offline installer page](https://analoggeek.github.io/SmartboardOS2/install.html) or download the **full installer** from [GitHub Releases](https://github.com/Analoggeek/SmartboardOS2/releases/latest) on any connected device. You can copy it to a school computer by USB and install it without an internet connection.

| Device | Installer | How to install |
| --- | --- | --- |
| Windows with Intel or AMD processor | `*-win-x64.exe` | Run the installer. It installs for the current user and adds Start menu and desktop shortcuts. |
| Windows on ARM | `*-win-arm64.exe` | Run the installer. Use this on ARM-based PCs such as Snapdragon laptops. |
| Mac with Apple silicon | `*-mac-arm64.dmg` | Open the disk image and drag SmartBoardOS to Applications. |
| Mac with Intel processor | `*-mac-x64.dmg` | Open the disk image and drag SmartBoardOS to Applications. |

Each installer includes the app runtime, PDF renderer and worker, icons, and all classroom tools. There is no separate Node.js or browser installation. The current CI builds are not publisher-signed/notarized: Windows SmartScreen or macOS Gatekeeper may warn or block installation on managed devices. Use a release from the official repo, verify it against `SHA256SUMS.txt`, and follow your school's IT policy.

**Updating while online:** open **Settings → App → Check for updates**. SmartBoardOS checks the official release, downloads the matching full installer, verifies its SHA-256 checksum, and saves your work before asking to launch it. On Windows it runs setup; on Mac it opens the `.dmg`, and you replace the app in Applications.

**Updating an offline device:** close SmartBoardOS and run the newer Windows installer, or replace the app in Applications on Mac. Classroom data is stored separately from the installed program. The desktop app checks only when you press the update button. The web and desktop editions use separate storage; existing web data does not transfer automatically.

## Classroom tools

- **Whiteboard:** pressure and tilt support, software palm rejection, shapes, handwriting, erasable highlighter, stickers, camera photos, multiple pages, a brush eraser that splits strokes or removes whole objects, 12 background styles, built-in and custom pen colours, autosave and PNG/PDF export. Rename and reorder pages in Page overview. Press **F** for an edge-to-edge board without the desktop, dock or window frame. **Tools** reveals an overlay without shrinking the canvas; **Exit fullscreen** returns to the workspace. Hosts that block native fullscreen still get the edge-to-edge viewport fallback. **Student display** opens a second, read-only window showing just the board canvas on the same computer, not your notes or other apps.
- **Document Studio:** PDF, PPTX, DOCX, TXT and Markdown, with pen, highlighter, partial/object eraser, shapes and text. **Office quick import is text-only**; for an exact slide/document layout, export it to PDF first. Inking is saved locally for each page and rotation. Use **Next/Previous annotation page** to continue writing without leaving ink mode. **Export with ink** downloads a flattened copy of all pages (up to 120; text in the export is not selectable) without modifying the original.
- **Map Atlas:** bundled Natural Earth world, regional and 242 country/territory views. Choose Political, Plain, Outline, Simple, Physical, Rivers, Mountains or Coordinates. India opens by default, with a dedicated 1:10m India-viewpoint outline and detailed rivers; use the Asia shortcut for the regional view. The Political layer includes Indian states and union territories. Subnational coverage elsewhere is limited to the source dataset. Send a map to the board to annotate, search over 1,200 bundled cities, or use **Blank map PDF** for a worksheet. The scale bar is approximate at the map centre.
- **Smart Lab:** 36 original offline SVG diagrams across Physics, Chemistry, Biology and Mathematics. Filter by chapter and level, download an unlabelled worksheet, reveal teacher answers, or annotate on the board. Explore two adjustable offline models: series circuits and thin lenses. This is a curated library, not a complete graduate curriculum.
- **Recording Studio (desktop only):** record the SmartBoardOS window, a camera, or microphone-only audio. Add a camera inset and adjustable solid-colour chroma key. Choose 15, 24 or 30 fps and a recording limit from 720p to 4K; the actual size depends on display, camera, encoder and hardware. The raw preview is limited to HD to reduce load. Chroma key prefers GPU rendering and uses a smaller, slower CPU path when WebGL is unavailable. Keyed camera-only recording uses a lower resolution. Recordings are local WebM files. Pause/resume, add chapter marks, and download a WebVTT chapter sidecar before closing the studio. Windows window capture can optionally include computer playback audio where available; other platforms use microphone audio.
- **Lesson Library:** save editable boards by class, subject and chapter with private notes and attachments. Export/import `.sboslesson` packs (64 MB limit). Open a board or recovery point with a safety snapshot of the current board first. PDF ink is not transferred with raw PDF attachments; export the annotated PDF and attach that copy to share the ink.
- **Media and Notes:** keep local images and autosaving notes; export notes as text. Open a local recording in Media and attach an existing WebVTT captions file. Captions aren’t generated automatically.
- **Class Tools:** student picker, name wheel, countdown timer, stopwatch, scoreboard and dice. Includes offline seating plans, anonymous on-board poll/exit-ticket tallies with CSV export, a calculator and desktop widgets. Polls do not connect student phones.
- **Responsive workspace:** full-size app windows on small screens; movable, resizable windows on larger screens. Scroll the whiteboard toolbar sideways on narrow screens. Settings includes high contrast, 44px touch targets and reduced motion.

### Local lesson storage and camera setup

- The installed app checkpoints board ink, notes and document annotations to `Documents/SmartBoardOS/YYYY-MM-DD/Classroom` and streams recordings to `Documents/SmartBoardOS/YYYY-MM-DD/Recordings`. The daily checkpoint for each item is replaced as you work. **Settings → Open folder** opens the library. Live editing data also stays in the app's local profile. Disk space is still required; remove or archive dated folders you no longer need. Stop recordings before quitting.
- A phone works as a camera only when your OS exposes it as a webcam (e.g. Continuity Camera, or a phone/USB webcam mode). Choose the camera manually or opt in to auto-preview newly connected devices while Recording Studio is open. Connecting a device never begins recording automatically. macOS may require Camera, Microphone and Screen Recording permissions.
- Chroma key removes a selected solid colour with soft edges; it is not AI person segmentation and cannot guarantee a clean cutout with arbitrary backgrounds.

Legacy link cards already saved to whiteboards still display as reference objects; they no longer open web pages.

![Whiteboard and page tools](docs/pages.png)

## Develop and release

Requires Node.js 22.12 or later.

```sh
npm ci
npm run dev       # Web preview on port 5173
npm run desktop   # Desktop app (first dev run downloads Electron if needed)
npm test
```

The web edition can still be installed as a PWA after its first online load. See [Publishing and offline updates](PUBLISH.md) for the automated release workflow and local build commands.

Developed by **Analoggeek**. SmartBoardOS bundles PDF.js, jsPDF and [fflate](https://github.com/101arrowz/fflate) (MIT). Simplified maps use [Natural Earth](https://www.naturalearthdata.com/about/terms-of-use/) public-domain data (1:50m world and 1:10m India detail); see `scripts/build-atlas.py` for the pinned datasets and regeneration. Emoji artwork uses [Twemoji](https://github.com/jdecked/twemoji) (CC BY 4.0). See [LICENSE](LICENSE) for the application's license.
