<p align="center"><img src="assets/icon.png" width="96" alt="OpenMessenger icon"></p>

<h1 align="center">OpenMessenger</h1>

<p align="center">A portable desktop app for Facebook Messenger, with custom CSS themes and your own notification sounds.</p>

---

Meta discontinued the official Messenger desktop app. OpenMessenger gives it back: a real
window with a taskbar badge, tray icon and native notifications, wrapped around Messenger's
own web client. Because it *is* Messenger's client, every feature works, including
**voice and video calls** and screen sharing.

> [!IMPORTANT]
> **Not affiliated with Meta.** OpenMessenger is an independent, unofficial project. It is not
> affiliated with, endorsed by, sponsored by or connected to Meta Platforms, Inc. in any way.
> "Messenger" and "Facebook" are trademarks of Meta Platforms, Inc., used here only to describe
> what the app works with. Use it at your own risk and in line with Meta's terms of service.

> [!NOTE]
> **This project was built with AI.** I wanted a proper Messenger desktop app for myself, so an AI
> coding assistant wrote the code while I tested it and steered the design. I don't claim to have
> written it by hand. It's shared in case it's useful to anyone else. Issues and pull requests are
> welcome, but please read the code before you trust it with your account, as you would with any
> project.

## Features

- **Everything Messenger has.** Chats, groups, reactions, voice notes, stickers, calls.
- **Custom notification sounds.** Pick a built-in sound or drop in your own `.wav`/`.mp3`.
- **Themes + any accent color.** OLED, Midnight, Graphite, Catppuccin Mocha, Nord and Light, each
  combinable with any accent: presets, hex/RGB input, a color wheel, or pick from screen.
  Optionally recolor every chat's bubbles with your accent.
- **Custom CSS themes.** Write your own. They reload live as you edit them.
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
4. Optional: Settings → Behavior → **Create desktop shortcut**.

To update, extract the new version over the old folder. Your `data` folder is kept.

## Settings

Open **Settings** with `Ctrl+,`, from the tray icon menu, or by right-clicking the taskbar icon:

- **Appearance**: pick a theme.
- **Accent color**: color wheel, brightness, hex/RGB input, presets, pick-from-screen, and
  "Recolor chats with the accent".
- **Notifications**: pick a sound, set the volume, and test it.
- **Behavior**: close-to-tray, start minimized, desktop shortcut, open the data folder.

Zoom: `Ctrl +` / `Ctrl -` / `Ctrl 0`. Developer tools: `Ctrl+Shift+I`.

> **Hearing two sounds?** Turn off Messenger's own message sounds in Messenger's preferences.

## Custom themes

Settings → **Open themes folder** (`data\themes`), add a `.css` file, and reopen Settings. A
theme is a small palette on top of a shared base, so a basic one is about 10 lines. See
[themes/README.md](themes/README.md).

## Custom sounds

Put `.wav`, `.mp3`, `.ogg`, `.m4a` or `.flac` files in Settings → **Open sounds folder**
(`data\sounds`), then reopen Settings and pick yours. Short sounds (under 1 second) work best.

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
src/main.js        app window, tray, menus, permissions, settings window, sound wiring
src/preload.js     runs in the page: silences toasts and plays the chosen sound
src/theme.js       theme loading (@extends chains) + generated accent layer
src/color.js       color math + CSS-filter solver (recolors icons Meta tints with filters)
src/settings-ui/   the Settings window (served from a private om:// scheme)
src/paths.js       portable data-folder redirection
src/settings.js    data/settings.json
themes/            built-in CSS themes (see themes/README.md)
scripts/cdp.js     drive a running dev build over CDP (npm run dev): eval JS, screenshots
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
