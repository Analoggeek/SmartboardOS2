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

- **Whiteboard:** opens edge-to-edge with controls overlaying the canvas, not shrinking it. The installed app starts in native fullscreen. Browsers require a click on **Fullscreen** (or **F**) to hide browser chrome. Use the top-left **Apps** grid to switch tools; **Customize** pins favourites and lets you choose Whiteboard or Home at startup. The board supports pressure-sensitive ink, palm rejection, multiple pages, autosave and PNG/PDF export.
- **Documents on the board:** choose **Import PDF / PPT** for a complete PDF or PowerPoint deck, then navigate and annotate all pages/slides. Static PPTX import runs offline and renders supported text, layout, fills, shapes and embedded raster images (up to 200 slides and 50 MB source). Fonts and complex objects, charts, tables, animations and effects may differ or be omitted. For exact layout or old `.ppt` files, export to PDF first. DOCX, TXT and Markdown use text import. Ink is editable and saved per page and rotation. **Export with ink** flattens up to 120 pages into a new PDF.
- **Map Atlas:** bundled Natural Earth world, regional and 242 country/territory views. Choose Political, Plain, Outline, Simple, Physical, Rivers, Mountains or Coordinates. India opens by default, with a dedicated 1:10m India-viewpoint outline and detailed rivers; use the Asia shortcut for the regional view. The Political layer includes Indian states and union territories. Subnational coverage elsewhere is limited to the source dataset. Send a map to the board to annotate, search over 1,200 bundled cities, or use **Blank map PDF** for a worksheet. The scale bar is approximate at the map centre.
- **Camera and offline recording:** choose **Camera** on the board, then select a device, shape, corner and size. Start a preview and choose **Show board**. The installed app can also record the workspace with its camera inset, camera-only video or microphone-only audio to local WebM files. Rounded-square camera-only video uses square frames with a dark matte at the corners. Square/circular and chroma-key capture reduce the resolution or frame rate for responsiveness. Pause/resume and download WebVTT chapter marks in the studio. Windows can include system audio when available. Nothing is uploaded.
- **Lesson Library:** save editable boards by class, subject and chapter with private notes and attachments. Export/import `.sboslesson` packs (64 MB limit). Open a board or recovery point with a safety snapshot of the current board first. PDF ink is not transferred with raw PDF attachments; export the annotated PDF and attach that copy to share the ink.
- **Media and Notes:** keep local images and autosaving notes; export notes as text. Open a local recording in Media and attach an existing WebVTT captions file. Captions aren’t generated automatically.
- **Class Tools:** open the small countdown and roster picker widget directly on the board. The full app adds name wheel, stopwatch, scores, seating plans and anonymous poll/exit-ticket tallies with CSV export. Polls do not connect student phones.
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
