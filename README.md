# SmartBoardOS

An offline classroom workspace for teachers. Draw on a whiteboard, mark up PDF pages, run a class timer, and keep lesson notes and media on your own device. No account is required.

## Install on a PC or Mac — no internet needed on the device

Download the **full installer** from [GitHub Releases](https://github.com/Analoggeek/SmartboardOS2/releases/latest) on any connected device. You can copy it to a school computer by USB and install it without an internet connection.

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

- **Whiteboard:** pressure and tilt support, software palm rejection, shapes, handwriting, erasable highlighter, stickers, camera photos, multiple pages, 12 background styles, built-in and custom pen colours, autosave and PNG/PDF export. Opens maximized and has a fullscreen presentation button.
- **PDF Studio:** open a local PDF, navigate and zoom, and use **Write on PDF** for pen, highlighter, eraser, shapes and text without leaving PDF Studio. Inking is saved locally for each page and rotation; export the annotated page using the annotation toolbar. The original PDF is not modified.
- **Media and Notes:** keep local images and autosaving lesson notes; export notes as text.
- **Class Tools:** student picker, name wheel, countdown timer, stopwatch, scoreboard and dice. Includes a calculator and desktop widgets.
- **Responsive workspace:** full-size app windows on small screens; movable, resizable windows on larger screens. Scroll the whiteboard toolbar sideways on narrow screens to reach all tools.

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

SmartBoardOS bundles PDF.js and jsPDF. Emoji artwork uses [Twemoji](https://github.com/jdecked/twemoji) (CC BY 4.0). See [LICENSE](LICENSE) for the application's license.
