# <img src="app-icon.png" alt="" width="40" align="top"> Mox desktop

> **Test version.** It works, and its look and features will still change. Try it, and report what goes wrong.

![Mox downloading a season: one episode done, three downloading with the piece map of each file, and two waiting their turn](docs/screenshot.png)

A desktop app for [Mox](https://github.com/moxart/moxdl), the multi-connection download manager. It is a window on Mox, not a second downloader: the app starts Mox's engine and talks to it, so every feature of Mox works here, and new ones arrive with Mox.

- Many connections per file, and a progress bar that shows which parts of the file are on disk.
- Pause, resume, and survive reboots and internet outages.
- Drag downloads into the order you want, or give one all the speed.
- Watch a video while it downloads.
- Paste text with links in it, or press Ctrl+V anywhere in the window.
- Series sorted into a folder per show and season.
- History, and the same settings as `mox config`.

Built with Tauri 2, React and Tailwind. Dark theme. Linux for now.

## Install

From a release, on Linux:

```bash
sudo apt install ./Mox_0.2.2_amd64.deb      # Debian, Ubuntu
chmod +x Mox_0.2.2_amd64.AppImage && ./Mox_0.2.2_amd64.AppImage   # any distribution
```

Mox is built into the app, so nothing else is needed: no Python, no separate install.

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

The app finds Mox in this order: the `MOX_ENGINE` variable (a whole command, such as `python3 /path/to/mox.py`); in a development build, `../moxdl/mox.py`; the Mox built into the app; `mox` on the PATH (version 1.7 or newer).

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

- Windows and macOS builds.
- Desktop notifications from the app itself (Mox's sound already plays).
- Keyboard shortcuts in the list, as in the terminal.

## License

MIT
