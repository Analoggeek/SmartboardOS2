# SmartBoardOS

An offline classroom workspace for teachers. Draw on a whiteboard, mark up PDF pages, run a class timer, and keep lesson notes and media on your own device. No account is required.

## Install on phones and tablets

Open the [install page](https://analoggeek.github.io/SmartboardOS2/install.html) for device-specific steps.

- **iPhone and iPad:** Open the classroom in Safari → **Share → Add to Home Screen**. If shown, enable **Open as Web App**. Open the new icon while online and choose **Menu → Home** to confirm **Ready offline**. Then test a cold launch in Airplane Mode. This is a home-screen web app, not an IPA or App Store release. The first setup needs internet and Safari can clear offline data, so export lesson backups.
- **Android phones and tablets:** The Android build packages the classroom files inside the APK, with no internet permission. A production APK appears on the install page only if the release passed signing verification. If there is no production APK, install the web app via Chrome and confirm **Ready offline** after opening it online. Android, browser and desktop storage are separate.

## Install on a PC or Mac — no internet needed on the device

Open the [offline installer page](https://analoggeek.github.io/SmartboardOS2/install.html) or download the **full installer** from [GitHub Releases](https://github.com/Analoggeek/SmartboardOS2/releases/latest) on any connected device. You can copy it to a school computer by USB and install it without an internet connection.

| Device | Installer | How to install |
| --- | --- | --- |
| Windows with Intel or AMD processor | `*-win-x64.exe` | Run the installer. It installs for the current user and adds Start menu and desktop shortcuts. |
| Windows on ARM | `*-win-arm64.exe` | Run the installer. Use this on ARM-based PCs such as Snapdragon laptops. |
| Mac with Apple silicon | `*-mac-arm64.dmg` | Open the disk image and drag SmartBoardOS to Applications. |
| Mac with Intel processor | `*-mac-x64.dmg` | Open the disk image and drag SmartBoardOS to Applications. |

Each installer includes the app runtime, PDF renderer and worker, icons, and all classroom tools. There is no separate Node.js or browser installation. Check the release notes for Windows Authenticode and Mac Developer ID/notarization status. `SHA256SUMS.txt` verifies file integrity, not publisher identity. If an installer is unsigned or unnotarized, OS or school policy may block it; contact school IT rather than bypassing those checks.

**Updating while online:** open **Settings → App → Check for updates**. SmartBoardOS checks the official release, downloads the matching full installer, verifies its SHA-256 checksum, and saves your work before asking to launch it. On Windows it runs setup; on Mac it opens the `.dmg`, and you replace the app in Applications.

**Updating an offline device:** close SmartBoardOS and run the newer Windows installer, or replace the app in Applications on Mac. Classroom data is stored separately from the installed program. The desktop app checks only when you press the update button. The web and desktop editions use separate storage; existing web data does not transfer automatically.

## Classroom tools

- **Whiteboard and Home:** the board opens edge-to-edge with a clock and direct shortcuts for Import, Camera, Stickers, Class Tools and Notes. The bottom tray includes pen, highlighter, colours, page controls and image removal. Drag the dotted grips on the Menu button or toolbox, or focus a grip and use the arrow keys. **Menu → Reset layout** restores both positions. The complete menu groups drawing tools, pages and view, and insert/export actions, with the app launcher in the same panel. **Menu → Home** opens the launchpad with a resume card and board template previews. **Customize** pins favourites and sets the startup view. The installed app starts in native fullscreen; in a browser use **Menu → Fullscreen** or press **F** to hide browser chrome.
- **Board designs:** choose Blueprint, Cornell Notes, Coordinate Plane, Storyboard, Hex Grid, Warm Paper or a classic writing surface. Use **Add as a new board page** to keep the current design and ink.
- **Documents on the board:** **Import** on the board, the Home import button, or drag and drop. Each page or slide is added as its own regular Whiteboard page, with editable ink and page navigation. Tap **New page after current** to insert a blank board page between slides or document pages. Use **Back to Whiteboard** from Notes or a classroom app to resume the same board. The whole import is saved locally before the board changes. Export a flattened copy from **Menu → Export board PDF**. A board holds up to 300 pages; offline PPTX supports up to 200 slides and 50 MB input, with an additional rendered-image budget. Static PPTX includes supported text, shapes, fills and embedded raster images. Fonts, animations, charts and other complex objects can differ or be omitted. Save old `.ppt` files as PPTX or PDF, or use PDF for exact layout. DOCX, TXT and Markdown use text import. **Menu → Previous imports** can reopen files cached by the previous document reader.
- **Map Atlas:** bundled Natural Earth world, regional and 242 country/territory views. Choose Political, Plain, Outline, Simple, Physical, Rivers, Mountains or Coordinates. India opens by default, with a dedicated 1:10m India-viewpoint outline and detailed rivers; use the Asia shortcut for the regional view. The Political layer includes Indian states and union territories. Subnational coverage elsewhere is limited to the source dataset. Send a map to the board to annotate, search over 1,200 bundled cities, or use **Blank map PDF** for a worksheet. The scale bar is approximate at the map centre.
- **Camera and offline recording:** choose **Menu → Camera**, then select a device, shape, corner and size. Start a preview and choose **Show board**. The installed app can also record the workspace with its camera inset, camera-only video or microphone-only audio to local WebM files. Rounded-square camera-only video uses square frames with a dark matte at the corners. Square/circular and chroma-key capture reduce the resolution or frame rate for responsiveness. Pause/resume and download WebVTT chapter marks in the studio. Windows can include system audio when available. Nothing is uploaded.
- **Lesson Library:** save editable boards by class, subject and chapter with private notes and attachments. Export/import `.sboslesson` packs (64 MB limit). Open a board or recovery point with a safety snapshot of the current board first. Imported PDF/PPTX board pages and editable ink are included when the board fits the 24 MB board-data limit for a lesson pack. The raw PDF attachment alone does not contain editable ink.
- **Media and Notes:** keep local images and autosaving notes; export notes as text. Open a local recording in Media and attach an existing WebVTT captions file. Captions aren’t generated automatically.
- **Class Tools:** open the small countdown and roster picker widget from **Menu → Class widget**. The full app adds name wheel, stopwatch, scores, seating plans and anonymous poll/exit-ticket tallies with CSV export. Polls do not connect student phones.
- **Responsive workspace:** full-size app windows on small screens; movable, resizable windows on larger screens. Find secondary drawing tools and zoom in the toolbox’s More drawing tools button. Settings includes high contrast, 44px touch targets and reduced motion.

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
