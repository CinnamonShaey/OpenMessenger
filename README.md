<p align="center"><img src="assets/icon.png" width="96" alt="OpenMessenger icon"></p>

<h1 align="center">OpenMessenger</h1>

<p align="center">A portable desktop app for Facebook Messenger, with themes, any accent color and your own notification sounds.</p>

---

Meta discontinued the official Messenger desktop app. OpenMessenger gives you a real desktop
app again: its own window, taskbar badge, tray icon and native notifications, wrapped around
Messenger's own web client (messenger.com). Because it runs Messenger's own client, you get
Messenger's features, calls included, the same as in a browser.

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

- **Messenger's own client.** Chats, groups, reactions, voice notes, stickers and calls all come
  from messenger.com itself.
- **Themes.** OLED, Midnight, Graphite, Catppuccin Mocha, Nord and Light, or Messenger's own look.
- **Any accent color.** Color wheel, brightness slider, hex/RGB input, 18 presets, or pick a color
  from anywhere on screen. It works with every theme, and you can optionally recolor every chat's
  message bubbles with it.
- **Notification sounds.** Four gentle built-in sounds, or add your own. Adjustable volume.
- **Desktop integration.** Native notifications (click to jump to the app), an unread count on
  the taskbar icon, a tray icon, close-to-tray, and a **Settings** entry when you right-click the
  taskbar icon.
- **Portable on Windows.** Everything lives in a `data` folder next to `OpenMessenger.exe`.
- **Optional start with Windows.** Off by default, with an option to start minimized to the tray.
- **Your own CSS themes.** They reload live while you edit them.
- Right-click menu with spell-check suggestions, copy/save image, and open-link-in-browser.
  External links open in your normal browser.

## Install (Windows)

1. Download the Windows `.zip` from [Releases](../../releases).
2. Extract it to a folder of your choice.
3. Run `OpenMessenger.exe` and log in to Messenger.
4. Optional: **Settings → Behavior → Create desktop shortcut**.

> [!NOTE]
> The app isn't code-signed, so Windows SmartScreen may say
> *"Windows protected your PC"* the first time. Click **More info → Run anyway**.

**Updating:** close OpenMessenger (tray icon → Quit), then extract the new version over the old
folder. Your `data` folder, including your login, is kept.

**Uninstalling:** turn off *Start with Windows* if you enabled it, quit the app, then delete the
folder (and the desktop shortcut, if you made one). The app itself writes nothing else to your
system. Windows keeps its own small records, like your notification preferences for the app.

### macOS and Linux (experimental)

The release workflow also builds a macOS `.zip` and Linux `AppImage`/`tar.gz`, but **these have
never been tested**. On those systems the app stores its data in the normal per-user folder
(`~/Library/Application Support/OpenMessenger` or `~/.config/OpenMessenger`) instead of next to
the app. Feedback and fixes are welcome.

## Settings

Open **Settings** with `Ctrl+,`, from the tray icon menu, by right-clicking the taskbar icon, or
from the menu bar (press `Alt`):

| Section | What's there |
| --- | --- |
| Appearance | Theme cards with a preview, plus a button to open the themes folder |
| Accent color | Color wheel, brightness, hex/RGB, presets, pick-from-screen, "use theme's suggestion", recolor chats |
| Notifications | Pick a sound (click to hear it), volume, play button, open the sounds folder |
| Behavior | Close button hides to tray, start with Windows, start minimized, desktop shortcut, open the data folder |

Other shortcuts: zoom with `Ctrl +` / `Ctrl -` / `Ctrl 0`, reload the theme with `Ctrl+Shift+R`,
developer tools with `Ctrl+Shift+I`.

> **Moved the app folder?** Turn *Start with Windows* off and on again so it points to the new
> location.

> **Hearing Messenger's own sound too?** Turn it off in Messenger's own settings if it offers that,
> or set OpenMessenger's sound to *Silent*.

## Custom themes and sounds

- **Themes:** Settings → **Open themes folder** (`data\themes`), add a `.css` file, and reopen
  Settings. A theme is a small color palette on top of a shared base, so a basic one is about 10
  lines. See [themes/README.md](themes/README.md).
- **Sounds:** Settings → **Open sounds folder** (`data\sounds`), add `.wav`, `.mp3`, `.ogg`, `.m4a`
  or `.flac` files, and reopen Settings. Short sounds (under 1 second) work best.

## Privacy and security

- **Your password is never stored.** Like a browser, the app keeps Messenger's login session
  cookie. In release builds that cookie is **encrypted** with your Windows account (DPAPI), so a
  copied `data` folder can't be used to log in on another PC or user account.
- **OpenMessenger adds no telemetry.** The app itself collects nothing and sends nothing anywhere.
  It only loads Meta's own Messenger/Facebook pages, and links to other sites open in your normal
  browser.
- **Meta's own tracking is untouched.** Messenger is Meta's web client running as-is, so whatever
  data collection Meta does on messenger.com in a browser happens here too. OpenMessenger doesn't
  block or change it.
- **Locked-down window.** Messenger runs sandboxed and context-isolated, with no access to Node.js
  or your files. Camera, microphone, notification and screen-share permissions are granted only to
  Messenger/Facebook pages.
- **Hardened executable.** Electron's Node.js inspector and run-as-Node switches are disabled, and
  the app's code is integrity-checked at startup.

## How it works

OpenMessenger loads `messenger.com` in a Chromium window and reports a standard Chrome user agent,
so Meta serves its normal web client. A small preload script wraps the page's `Notification` API.
The Windows notification stays silent and your chosen sound plays instead. Themes are injected as
stylesheets that override Messenger's own CSS variables. The accent color is generated as a
separate layer on top, including CSS-filter values for the icons Meta tints with filters rather
than colors.

## Development

Requirements: [Node.js](https://nodejs.org) 20+ and Git.

```bash
git clone https://github.com/CinnamonShaey/OpenMessenger.git
cd OpenMessenger
npm install
npm start          # run from source (data goes to ./data, git-ignored)
npm run dev        # same, with Chrome DevTools Protocol on port 9333 (see scripts/cdp.js)
npm run dist       # build into ./dist (Windows: portable zip + dist/win-unpacked)
npm run assets     # regenerate icon, badges and sounds (needs uv)
```

> [!WARNING]
> Running from source uses plain Electron, which **doesn't encrypt cookies**. Your login in
> `./data` is stored unencrypted. Use `npm run dist` builds for everyday use, and delete `./data`
> when you're done developing.

Layout:

```
src/main.js             app window, tray, menus, permissions, settings window, start-with-Windows
src/preload.js          runs in the Messenger page: silences toasts and plays the chosen sound
src/theme.js            theme loading (@extends chains) + generated accent layer
src/color.js            color math + CSS-filter solver
src/settings-ui/        the Settings window (served from a private om:// scheme)
src/paths.js            where data is stored (portable on Windows)
src/settings.js         data/settings.json
themes/                 built-in themes (see themes/README.md)
assets/                 icon, tray icon, unread badges, built-in sounds
scripts/make-assets.py  generates everything in assets/ (no third-party artwork or audio)
scripts/cdp.js          poke at a running `npm run dev` build: evaluate JS, take screenshots
```

### Publishing a release

For maintainers, including anyone publishing releases from their own fork. Bump `version` in
`package.json`, commit, then push a matching tag:

```bash
git tag vX.Y.Z
git push --tags
```

GitHub Actions builds Windows, macOS and Linux packages and attaches them to a **draft**
release. Check it, then publish it on GitHub.

## License

[MIT](LICENSE). The bundled icon and sounds are generated by `scripts/make-assets.py` and fall under
the same license.
