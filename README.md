<p align="center"><img src="assets/icon.png" width="96" alt="OpenMessenger icon"></p>

<h1 align="center">OpenMessenger</h1>

<p align="center">A portable desktop app for Facebook Messenger, with custom CSS themes and your own notification sounds.</p>

---

Meta discontinued the official Messenger desktop app. OpenMessenger gives it back: a real
window with a taskbar badge, tray icon and native notifications, wrapped around Messenger's
own web client. Because it *is* Messenger's client, every feature works, including
**voice and video calls** and screen sharing.

> Not affiliated with or endorsed by Meta. "Messenger" is a trademark of Meta Platforms, Inc.

## Features

- **Everything Messenger has.** Chats, groups, reactions, voice notes, stickers, calls.
- **Custom notification sounds.** Pick a built-in sound or drop in your own `.wav`/`.mp3`.
- **CSS themes.** Ships with *OLED Purple*. Themes reload live as you edit them.
- **Native desktop integration.** Windows toast notifications, an unread-count badge on the
  taskbar icon, a tray icon, and close-to-tray.
- **Portable.** Everything (login, cache, settings, your themes and sounds) lives in one `data`
  folder next to the `.exe`. Nothing goes into the registry or `AppData`. Delete the folder and
  it's gone.
- **No autostart.** It only runs when you open it.
- Right-click menu with spell-check suggestions, copy/save image, and open-link-in-browser.
- External links open in your normal browser.

## Install (Windows)

1. Download `OpenMessenger-x.y.z-win-x64-portable.zip` from [Releases](../../releases).
2. Extract it anywhere, e.g. `D:\Apps\OpenMessenger`.
3. Run `OpenMessenger.exe` and log in.
4. Optional: press **Alt**, then **OpenMessenger → Create desktop shortcut**.

To update, extract the new version over the old folder. Your `data` folder is kept.

## Settings

Press **Alt** to show the menu bar, or right-click the tray icon:

| Menu | What it does |
| --- | --- |
| Theme | Switch theme, open the themes folder, reload (Ctrl+Shift+R) |
| Notification sound | Pick a sound, set the volume, test it, open the sounds folder |
| Close button hides to tray | Keep running in the background when you close the window |
| Start minimized to tray | Start hidden, tray icon only |
| Open data folder | Where everything is stored |

Zoom: `Ctrl +` / `Ctrl -` / `Ctrl 0`. Developer tools: `Ctrl+Shift+I`.

> **Hearing two sounds?** Turn off Messenger's own sounds in Messenger:
> **Settings → Preferences → Message sounds / Call sounds**.

## Custom themes

1. Menu → **Theme → Open themes folder** (this is `data\themes`).
2. Copy `oled-purple.css` from [`themes/`](themes/) there, rename it, and edit the colours at the top.
3. Menu → **Notification sound → Rescan themes & sounds**, then pick your theme.

While the theme is selected, saving the file updates the app instantly. See
[themes/README.md](themes/README.md) for tips.

## Custom sounds

Put `.wav`, `.mp3`, `.ogg`, `.m4a` or `.flac` files in **Open sounds folder** (`data\sounds`),
choose **Rescan themes & sounds**, then pick yours. Short sounds (under 1 second) work best.

## Development

Requirements: [Node.js](https://nodejs.org) 20+ and Git.

```bash
git clone https://github.com/CinnamonShaey/OpenMessenger.git
cd OpenMessenger
npm install
npm start          # run the app (data goes to ./data, git-ignored)
npm run dev        # same, with Chrome DevTools Protocol on port 9333
npm run dist       # build a portable zip into ./dist
```

Layout:

```
src/main.js        app window, tray, menus, permissions, theme + sound wiring
src/preload.js     runs in the page: silences toasts and plays the chosen sound
src/paths.js       portable data-folder redirection
src/settings.js    data/settings.json
themes/            built-in CSS themes
assets/            icon, tray icon, unread badges, built-in sounds
scripts/make-assets.py   regenerates assets (uv run --with pillow python scripts/make-assets.py)
```

### Releasing

Bump `version` in `package.json`, commit, then:

```bash
git tag v0.2.0 && git push --tags
```

GitHub Actions builds Windows, macOS and Linux packages and attaches them to a draft release.

## How it works

OpenMessenger loads `messenger.com` in a locked-down Chromium window (sandboxed, context-isolated,
no Node access for the page). It reports a standard Chrome user agent so Meta serves the full web
client. A small preload script wraps the page's `Notification` API, which makes the Windows toast
silent and plays your chosen sound with WebAudio instead. Themes are injected as user stylesheets
that override Meta's CSS variables.

## License

[MIT](LICENSE)
