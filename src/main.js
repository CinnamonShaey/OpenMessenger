const paths = require('./paths'); // must be first: redirects all app data into data\
const settings = require('./settings');
const {
  app, BrowserWindow, Tray, Menu, shell, ipcMain, nativeImage, session,
  desktopCapturer, dialog, clipboard,
} = require('electron');
const path = require('path');
const fs = require('fs');

const APP_ID = 'OpenMessenger';
app.setName('OpenMessenger');
if (process.platform === 'win32') app.setAppUserModelId(APP_ID);

// Present as plain Chrome: Meta serves its full web client to Chrome, and an
// "Electron/xx" token in the user agent can trigger "unsupported browser".
const chromeMajor = process.versions.chrome.split('.')[0];
const platformUA = {
  win32: 'Windows NT 10.0; Win64; x64',
  darwin: 'Macintosh; Intel Mac OS X 10_15_7',
  linux: 'X11; Linux x86_64',
}[process.platform] || 'X11; Linux x86_64';
const USER_AGENT = `Mozilla/5.0 (${platformUA}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeMajor}.0.0.0 Safari/537.36`;
app.userAgentFallback = USER_AGENT;

// Single instance: launching again just brings the existing window forward.
if (!app.requestSingleInstanceLock()) {
  app.quit();
  return;
}

let mainWindow = null;
let tray = null;
let quitting = false;
let unread = 0;

// ------------------------------------------------------------------ helpers
const INTERNAL_HOSTS = ['messenger.com', 'facebook.com', 'fbcdn.net', 'fbsbx.com'];
// Meta's outbound-link redirectors: these should open in the real browser.
const LINK_SHIMS = ['l.messenger.com', 'l.facebook.com', 'lm.facebook.com'];

function isInternal(url) {
  try {
    const { hostname, protocol } = new URL(url);
    if (protocol === 'about:' || protocol === 'blob:') return true;
    if (protocol !== 'https:') return false;
    if (LINK_SHIMS.includes(hostname)) return false;
    return INTERNAL_HOSTS.some((h) => hostname === h || hostname.endsWith('.' + h));
  } catch {
    return false;
  }
}

function openExternal(url) {
  if (/^(https?|mailto|tel):/i.test(url)) shell.openExternal(url);
}

function listFiles(dirs, exts) {
  const seen = new Map();
  for (const dir of dirs) {
    try {
      for (const f of fs.readdirSync(dir)) {
        if (exts.includes(path.extname(f).toLowerCase())) seen.set(f, path.join(dir, f));
      }
    } catch { /* missing dir */ }
  }
  return seen; // name -> full path (user files override built-ins with same name)
}
const themes = () => listFiles([paths.builtinThemes, paths.userThemes], ['.css']);
const sounds = () => listFiles([paths.builtinSounds, paths.userSounds], ['.wav', '.mp3', '.ogg', '.m4a', '.flac']);

function prettyName(file) {
  return path.basename(file, path.extname(file)).replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function allWindows() {
  return BrowserWindow.getAllWindows().filter((w) => !w.isDestroyed());
}

function showMain() {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

// ------------------------------------------------------------------ theme
const cssKeys = new WeakMap(); // webContents -> inserted css key
let themeWatcher = null;

function readThemeCss() {
  const name = settings.get('theme');
  if (!name) return '';
  const file = themes().get(name);
  if (!file) return '';
  try { return fs.readFileSync(file, 'utf8'); } catch { return ''; }
}

async function applyTheme(wc) {
  if (!wc || wc.isDestroyed()) return;
  const old = cssKeys.get(wc);
  if (old) { try { await wc.removeInsertedCSS(old); } catch {} cssKeys.delete(wc); }
  const css = readThemeCss();
  if (css) cssKeys.set(wc, await wc.insertCSS(css, { cssOrigin: 'user' }));
}

function applyThemeEverywhere() {
  for (const w of allWindows()) applyTheme(w.webContents);
  watchTheme();
}

// Live reload: edit the .css file, save, and the app updates instantly.
function watchTheme() {
  if (themeWatcher) { themeWatcher.close(); themeWatcher = null; }
  const file = themes().get(settings.get('theme'));
  if (!file || file.includes('.asar')) return;
  let t;
  try {
    themeWatcher = fs.watch(file, () => {
      clearTimeout(t);
      t = setTimeout(() => { for (const w of allWindows()) applyTheme(w.webContents); }, 150);
    });
  } catch { /* ignore */ }
}

// ------------------------------------------------------------------ sound
function soundPayload() {
  const name = settings.get('sound');
  const file = name && sounds().get(name);
  let data = null;
  if (file) { try { data = fs.readFileSync(file); } catch {} }
  return { data, volume: settings.get('volume') };
}

function sendSound(wc) {
  if (wc && !wc.isDestroyed()) wc.send('om:sound', soundPayload());
}
const sendSoundEverywhere = () => allWindows().forEach((w) => sendSound(w.webContents));

// ------------------------------------------------------------------ unread badge
function updateUnread(title) {
  const m = /\((\d+)\)/.exec(title || '');
  const count = m ? parseInt(m[1], 10) : 0;
  if (count === unread) return;
  unread = count;

  if (process.platform === 'win32' && mainWindow) {
    if (count > 0) {
      const badge = path.join(paths.assets, 'badges', count > 9 ? '9plus.png' : `${count}.png`);
      mainWindow.setOverlayIcon(nativeImage.createFromPath(badge), `${count} unread`);
    } else {
      mainWindow.setOverlayIcon(null, '');
    }
  } else {
    app.setBadgeCount(count);
  }
  if (tray) tray.setToolTip(count ? `OpenMessenger — ${count} unread` : 'OpenMessenger');
}

// ------------------------------------------------------------------ context menu
function attachContextMenu(wc) {
  wc.on('context-menu', (_e, p) => {
    const items = [];
    if (p.misspelledWord) {
      for (const s of p.dictionarySuggestions.slice(0, 5)) {
        items.push({ label: s, click: () => wc.replaceMisspelling(s) });
      }
      items.push({ label: 'Add to dictionary', click: () => wc.session.addWordToSpellCheckerDictionary(p.misspelledWord) });
      items.push({ type: 'separator' });
    }
    if (p.linkURL) {
      items.push({ label: 'Open link in browser', click: () => openExternal(p.linkURL) });
      items.push({ label: 'Copy link', click: () => clipboard.writeText(p.linkURL) });
      items.push({ type: 'separator' });
    }
    if (p.mediaType === 'image' && p.srcURL) {
      items.push({ label: 'Save image as…', click: () => wc.downloadURL(p.srcURL) });
      items.push({ label: 'Copy image', click: () => wc.copyImageAt(p.x, p.y) });
      items.push({ type: 'separator' });
    }
    if (p.isEditable) {
      items.push({ role: 'undo' }, { role: 'redo' }, { type: 'separator' },
        { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' });
    } else if (p.selectionText) {
      items.push({ role: 'copy' });
    }
    while (items.length && items[items.length - 1].type === 'separator') items.pop();
    if (items.length) Menu.buildFromTemplate(items).popup();
  });
}

// ------------------------------------------------------------------ windows
function webPreferences() {
  return {
    preload: path.join(__dirname, 'preload.js'),
    contextIsolation: true,
    sandbox: true,
    nodeIntegration: false,
    spellcheck: true,
    backgroundThrottling: false, // keep receiving messages while hidden in the tray
    autoplayPolicy: 'no-user-gesture-required',
  };
}

function wireContents(wc) {
  wc.setUserAgent(USER_AGENT);
  attachContextMenu(wc);
  wc.on('dom-ready', () => { applyTheme(wc); sendSound(wc); });

  wc.on('will-navigate', (e, url) => {
    if (!isInternal(url)) { e.preventDefault(); openExternal(url); }
  });

  // Popups: calls and Meta's own windows stay in-app; everything else -> browser.
  wc.setWindowOpenHandler(({ url }) => {
    if (url && !isInternal(url)) { openExternal(url); return { action: 'deny' }; }
    return {
      action: 'allow',
      overrideBrowserWindowOptions: {
        width: 1000, height: 700,
        backgroundColor: '#000000',
        autoHideMenuBar: true,
        icon: path.join(paths.assets, 'icon.png'),
        webPreferences: webPreferences(),
      },
    };
  });
  wc.on('did-create-window', (child) => wireContents(child.webContents));
}

function createMainWindow() {
  const b = settings.get('windowBounds');
  mainWindow = new BrowserWindow({
    ...b,
    minWidth: 400,
    minHeight: 400,
    title: 'OpenMessenger',
    backgroundColor: '#000000',
    autoHideMenuBar: true, // press Alt to show the menu
    icon: path.join(paths.assets, process.platform === 'win32' ? 'icon.ico' : 'icon.png'),
    show: false,
    webPreferences: webPreferences(),
  });
  if (settings.get('windowMaximized')) mainWindow.maximize();

  wireContents(mainWindow.webContents);
  mainWindow.webContents.on('page-title-updated', (e, title) => {
    e.preventDefault();
    mainWindow.setTitle(title.replace(/Messenger/, 'OpenMessenger'));
    updateUnread(title);
  });

  mainWindow.once('ready-to-show', () => {
    if (!settings.get('startMinimized')) mainWindow.show();
  });

  const saveBounds = () => {
    if (!mainWindow.isMaximized() && !mainWindow.isMinimized()) settings.set('windowBounds', mainWindow.getBounds());
    settings.set('windowMaximized', mainWindow.isMaximized());
  };
  mainWindow.on('resize', saveBounds);
  mainWindow.on('move', saveBounds);

  mainWindow.on('close', (e) => {
    if (!quitting && settings.get('closeToTray')) {
      e.preventDefault();
      mainWindow.hide();
    }
  });
  mainWindow.on('closed', () => { mainWindow = null; });

  mainWindow.loadURL(settings.get('startUrl'));
}

// ------------------------------------------------------------------ permissions
function setupSession() {
  const ses = session.defaultSession;
  ses.setUserAgent(USER_AGENT);
  ses.setSpellCheckerLanguages(
    settings.get('spellcheckLanguages').filter((l) => ses.availableSpellCheckerLanguages.includes(l)),
  );

  const allowed = new Set(['media', 'notifications', 'fullscreen', 'clipboard-read',
    'clipboard-sanitized-write', 'display-capture', 'speaker-selection', 'window-management']);
  ses.setPermissionRequestHandler((wc, permission, cb, details) => {
    cb(allowed.has(permission) && isInternal(details.requestingUrl || wc.getURL()));
  });
  ses.setPermissionCheckHandler((_wc, permission, origin) => allowed.has(permission) && isInternal(origin));

  // Screen sharing during calls: let the user pick a screen or window.
  ses.setDisplayMediaRequestHandler(async (_req, cb) => {
    try {
      const sources = await desktopCapturer.getSources({ types: ['screen', 'window'] });
      const shown = sources.slice(0, 12);
      const { response } = await dialog.showMessageBox(BrowserWindow.getFocusedWindow() || mainWindow, {
        type: 'question',
        title: 'Share your screen',
        message: 'What do you want to share?',
        buttons: [...shown.map((s) => s.name.slice(0, 60)), 'Cancel'],
        cancelId: shown.length,
        noLink: true,
      });
      if (response >= shown.length) return cb({});
      cb({ video: shown[response], audio: process.platform === 'win32' ? 'loopback' : undefined });
    } catch {
      cb({});
    }
  });
}

// ------------------------------------------------------------------ menus
function createDesktopShortcut() {
  if (process.platform !== 'win32') return;
  const lnk = path.join(app.getPath('desktop'), 'OpenMessenger.lnk');
  const ok = shell.writeShortcutLink(lnk, 'create', {
    target: process.execPath,
    args: app.isPackaged ? '' : `"${paths.appRoot}"`,
    cwd: path.dirname(process.execPath),
    icon: app.isPackaged ? process.execPath : path.join(paths.assets, 'icon.ico'),
    iconIndex: 0,
    appUserModelId: APP_ID,
    description: 'OpenMessenger',
  });
  dialog.showMessageBox({ message: ok ? 'Desktop shortcut created.' : 'Could not create the shortcut.' });
}

function settingsMenu() {
  const themeItems = [{ label: 'None (Messenger default)', type: 'radio', checked: !settings.get('theme'),
    click: () => { settings.set('theme', ''); applyThemeEverywhere(); } }];
  for (const name of themes().keys()) {
    themeItems.push({ label: prettyName(name), type: 'radio', checked: settings.get('theme') === name,
      click: () => { settings.set('theme', name); applyThemeEverywhere(); rebuildMenus(); } });
  }
  themeItems.push({ type: 'separator' },
    { label: 'Open themes folder', click: () => shell.openPath(paths.userThemes) },
    { label: 'Reload theme', accelerator: 'CmdOrCtrl+Shift+R', click: applyThemeEverywhere });

  const soundItems = [{ label: 'Silent', type: 'radio', checked: !settings.get('sound'),
    click: () => { settings.set('sound', ''); sendSoundEverywhere(); } }];
  for (const name of sounds().keys()) {
    soundItems.push({ label: prettyName(name), type: 'radio', checked: settings.get('sound') === name,
      click: () => {
        settings.set('sound', name); sendSoundEverywhere();
        setTimeout(() => mainWindow && mainWindow.webContents.send('om:play'), 200);
      } });
  }
  const vol = Math.round(settings.get('volume') * 100);
  soundItems.push({ type: 'separator' },
    { label: 'Volume', submenu: [25, 50, 70, 100].map((v) => ({ label: `${v}%`, type: 'radio', checked: vol === v,
      click: () => { settings.set('volume', v / 100); sendSoundEverywhere(); mainWindow && mainWindow.webContents.send('om:play'); } })) },
    { label: 'Test sound', click: () => mainWindow && mainWindow.webContents.send('om:play') },
    { label: 'Open sounds folder', click: () => shell.openPath(paths.userSounds) },
    { label: 'Rescan themes & sounds', click: rebuildMenus });

  return [
    { label: 'Theme', submenu: themeItems },
    { label: 'Notification sound', submenu: soundItems },
    { type: 'separator' },
    { label: 'Close button hides to tray', type: 'checkbox', checked: settings.get('closeToTray'),
      click: (i) => settings.set('closeToTray', i.checked) },
    { label: 'Start minimized to tray', type: 'checkbox', checked: settings.get('startMinimized'),
      click: (i) => settings.set('startMinimized', i.checked) },
    { label: 'Create desktop shortcut', click: createDesktopShortcut, visible: process.platform === 'win32' },
    { label: 'Open data folder', click: () => shell.openPath(paths.dataDir) },
  ];
}

function rebuildMenus() {
  const template = [
    { label: 'OpenMessenger', submenu: [
      ...settingsMenu(),
      { type: 'separator' },
      { label: 'Quit', accelerator: 'CmdOrCtrl+Q', click: () => { quitting = true; app.quit(); } },
    ] },
    { label: 'Edit', submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' },
      { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] },
    { label: 'View', submenu: [
      { role: 'reload' }, { role: 'forceReload' }, { type: 'separator' },
      { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomIn', accelerator: 'CmdOrCtrl+=', visible: false },
      { role: 'zoomOut' }, { type: 'separator' }, { role: 'togglefullscreen' },
      { type: 'separator' }, { role: 'toggleDevTools' },
    ] },
    { label: 'Help', submenu: [
      { label: 'Project page', click: () => openExternal('https://github.com/CinnamonShaey/OpenMessenger') },
      { label: `Version ${app.getVersion()} (Electron ${process.versions.electron})`, enabled: false },
    ] },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));

  if (tray) {
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: 'Show OpenMessenger', click: showMain },
      { type: 'separator' },
      ...settingsMenu(),
      { type: 'separator' },
      { label: 'Quit', click: () => { quitting = true; app.quit(); } },
    ]));
  }
}

function createTray() {
  tray = new Tray(nativeImage.createFromPath(path.join(paths.assets, 'tray.png')));
  tray.setToolTip('OpenMessenger');
  tray.on('click', () => (mainWindow && mainWindow.isVisible() && mainWindow.isFocused() ? mainWindow.hide() : showMain()));
}

// ------------------------------------------------------------------ IPC
ipcMain.on('om:notification-click', showMain);
ipcMain.on('om:notified', () => {
  if (mainWindow && !mainWindow.isFocused()) mainWindow.flashFrame(true);
});

// ------------------------------------------------------------------ lifecycle
app.on('second-instance', showMain);
app.on('before-quit', () => { quitting = true; settings.flush(); });
app.on('activate', showMain); // macOS dock click
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

app.whenReady().then(() => {
  setupSession();
  createTray();
  rebuildMenus();
  createMainWindow();
  watchTheme();
  mainWindow.on('focus', () => mainWindow.flashFrame(false));
});
