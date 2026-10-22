# <img src="app-icon.png" alt="" width="40" align="top"> Mox desktop

> **Test version.** It works, and its look and features will still change. Try it, and report what goes wrong.

![Mox downloading a season: one episode done, three downloading with the piece map of each file, and two waiting their turn](docs/screenshot.png)

A desktop app for [Mox](https://github.com/moxart/moxdl), the multi-connection download manager. It is a window on Mox, not a second downloader: the app starts Mox's engine and talks to it, so every feature of Mox works here, and new ones arrive with Mox.

- Many connections per file, and a progress bar that shows which parts of the file are on disk.
- Pause, resume, and survive reboots and internet outages.
- Drag downloads into the order you want, or give one all the speed.
- Keyboard shortcuts, search, and a details panel with the piece map, the speed graph and the link.
- Download only between certain hours, or up to so much a day, and quit, sleep or shut down when everything is done.
- Watch a video while it downloads.
- Add links from the browser's right-click menu, by dropping them on the window, or by pasting text with links in it. Links copied a moment ago are offered when the window comes to the front.
- Series sorted into a folder per show and season.
- History, and the same settings as `mox config`.
- Lives in the tray, and can start with the computer.
- Updates itself: it offers a new version, and installs it when you say so.
- In English or Persian, dark or light.

Built with Tauri 2, React and Tailwind. Linux, Windows and macOS.

## Install

From a [release](https://github.com/moxart/moxdl-desktop/releases), on Linux:

```bash
sudo apt install ./Mox_0.4.0_amd64.deb      # Debian, Ubuntu
chmod +x Mox_0.4.0_amd64.AppImage && ./Mox_0.4.0_amd64.AppImage   # any distribution
```

On Windows run `Mox_0.4.0_x64-setup.exe`; on a Mac open `Mox_0.4.0_aarch64.dmg` (Apple silicon) or `Mox_0.4.0_x64.dmg` (Intel). The installers are not signed yet, so Windows shows a SmartScreen warning (More info → Run anyway), and macOS needs a right-click → Open the first time.

Mox is built into the app, so nothing else is needed: no Python, no separate install.

## From the browser

The extension in [`browser-extension/`](browser-extension) takes over the browser's downloads and sends them to Mox, as IDM does. Files the browser knows to be under 1 MB stay with the browser, and so does a download you start again within a minute of handing it to Mox: that is the way to let the browser have one, say from a site that needs your login. Its toolbar button turns this off and on.

It also adds three items to the right-click menu of Firefox and Chrome: **Download with Mox** on a link, one for the links in selected text, and one for every file link on the page, such as a folder listing.

Either way it sends them to the app as a `mox://` link, and the app shows them in its add dialog. Nothing downloads before you press Download there, since any web page can open a `mox://` link too.

- **Chrome, Edge, Brave:** open `chrome://extensions`, turn on Developer mode, press Load unpacked, and pick the `browser-extension` folder.
- **Firefox:** open `about:debugging#/runtime/this-firefox`, press Load Temporary Add-on, and pick `browser-extension/manifest.json`. It stays until Firefox restarts; for good it needs signing by Mozilla.

The first time, the browser asks whether to let it open Mox. `npm run extension` zips it for a store.

## Build it

You need Node, Rust, Python 3.8 or newer, and on Linux the libraries Tauri uses:

```bash
sudo apt install libwebkit2gtk-4.1-dev libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev
```

With the [Mox repository](https://github.com/moxart/moxdl) checked out next to this one, as `../moxdl`:

```bash
npm install
npm run tauri dev       # the app, using ../moxdl/mox.py, so changes to Mox show at once
npm run package         # installers in src-tauri/target/release/bundle/
```

`npm run package` first builds Mox into one executable with PyInstaller (`scripts/build-engine.sh`, in a venv of its own), then puts it in the installers.

The app finds Mox in this order: the `MOX_ENGINE` variable (a whole command, such as `python3 /path/to/mox.py`); in a development build, `../moxdl/mox.py`; the Mox built into the app; `mox` on the PATH (version 1.8 or newer).

## Change the look

```bash
npm run dev
```

opens the interface in a browser at http://localhost:1420 with a pretend engine and made-up downloads that move, so every state shows. No Rust build, and every edit appears at once.

- **Colors, corners and fonts** are all in [`src/theme/tokens.css`](src/theme/tokens.css). Components only use the names defined there (`bg-surface`, `text-muted`, `rounded-card`…), so changing a value restyles everything that uses it.
- **Each part of the window** is its own file in [`src/components/`](src/components): a download's row, the piece-map bar, the add dialog, the dropdowns, the status bar, history, settings.
- **The icon** is made from [`app-icon.png`](app-icon.png), 1024 px with a transparent background: `npx tauri icon app-icon.png` makes every size.

## How it fits together

```
React (src/)  ⇄  Tauri shell (src-tauri/src/lib.rs)  ⇄  mox engine (mox.py)
     events and commands        JSON lines on stdin and stdout
```

- `src-tauri/src/lib.rs` starts the engine, sends the interface's commands to it and passes its events back. Closing the window asks Mox to save every download's progress first.
- `src/engine/` holds the protocol's types, the `useEngine` hook that keeps the app's state, and the browser demo.
- The protocol itself is documented on `Engine` in mox.py.

## Not done yet

- Signed installers, so Windows and macOS stop warning about them.
- Reading the clipboard while the window is in the background: on Wayland that takes focus for a moment, so links are offered when the window comes to the front instead.

## License

MIT
