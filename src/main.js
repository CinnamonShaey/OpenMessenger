const paths = require('./paths'); // must be first: redirects all app data into data\
const settings = require('./settings');
const themeEngine = require('./theme');
const {
  app, BrowserWindow, Tray, Menu, shell, ipcMain, nativeImage, session,
  desktopCapturer, dialog, clipboard, protocol,
} = require('electron');
const path = require('path');
const fs = require('fs');

// The Settings UI is served from a private om:// scheme (file:// is locked
// down by the grantFileProtocolExtraPrivileges fuse).
protocol.registerSchemesAsPrivileged([
  { scheme: 'om', privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);
const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png',
  '.ico': 'image/x-icon', '.svg': 'image/svg+xml', '.wav': 'audio/wav' };
function registerOmProtocol() {
  const roots = { settings: path.join(__dirname, 'settings-ui'), assets: paths.assets };
  protocol.handle('om', (req) => {
    const u = new URL(req.url);
    const root = roots[u.hostname];
    const file = root && path.normalize(path.join(root, decodeURIComponent(u.pathname)));
    if (!file || !file.startsWith(root + path.sep)) return new Response('Not found', { status: 404 });
    try {
      return new Response(fs.readFileSync(file), {
        headers: { 'content-type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' },
      });
    } catch {
      return new Response('Not found', { status: 404 });
    }
  });
}

// Windows caches the taskbar icon per app ID. Dev runs (generic electron.exe)
// use a separate ID so they can't poison the real app's cached icon.
const APP_ID = app.isPackaged ? 'io.github.cinnamonshaey.openmessenger' : 'io.github.cinnamonshaey.openmessenger.dev';
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
  return themeEngine.listFiles(dirs, exts);
}
const sounds = () => listFiles([paths.builtinSounds, paths.userSounds], ['.wav', '.mp3', '.ogg', '.m4a', '.flac']);
const prettyName = themeEngine.prettyName;

let settingsWindow = null;

// Messenger windows only (main window + call popups), never the Settings window.
function allWindows() {
  return BrowserWindow.getAllWindows().filter((w) => !w.isDestroyed() && w !== settingsWindow);
}

function showMain() {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

// ------------------------------------------------------------------ theme
// Two stylesheets per window: the theme (palette + Meta variable mapping) and
// a small generated accent layer, so accent previews only swap the small one.
const injected = new WeakMap(); // webContents -> { theme, accent } css keys
let themeWatcher = null;
let previewAccent = null; // live preview from the Settings window (unsaved)

// Only theme the app once logged in (the login page looks odd themed).
// Meta sets the c_user cookie for a logged-in session.
async function isLoggedIn(ses) {
  try {
    const cookies = await ses.cookies.get({ name: 'c_user' });
    return cookies.some((c) => /(^|\.)(messenger|facebook)\.com$/.test(c.domain.replace(/^\./, '')));
  } catch {
    return false;
  }
}

function currentAccentCss() {
  const name = settings.get('theme');
  if (!name) return '';
  return themeEngine.accentCss(previewAccent || settings.get('accent'), themeEngine.themeMode(name), settings.get('recolorChats'));
}

async function swap(wc, slot, css) {
  const keys = injected.get(wc) || {};
  injected.set(wc, keys);
  const old = keys[slot];
  keys[slot] = null;
  if (css && !wc.isDestroyed()) keys[slot] = await wc.insertCSS(css, { cssOrigin: 'user' });
  if (old && !wc.isDestroyed()) { try { await wc.removeInsertedCSS(old); } catch {} }
}

async function applyTheme(wc) {
  if (!wc || wc.isDestroyed()) return;
  const on = await isLoggedIn(wc.session) && settings.get('theme');
  // remove the accent first so the order stays theme -> accent
  await swap(wc, 'accent', '');
  await swap(wc, 'theme', on ? themeEngine.themeCss(settings.get('theme')) : '');
  await swap(wc, 'accent', on ? currentAccentCss() : '');
}

async function applyAccent(wc) {
  if (!wc || wc.isDestroyed()) return;
  const keys = injected.get(wc);
  if (!keys || !keys.theme) return; // not themed (logged out / no theme)
  await swap(wc, 'accent', currentAccentCss());
}

function applyThemeEverywhere() {
  for (const w of allWindows()) applyTheme(w.webContents);
  watchTheme();
}
const applyAccentEverywhere = () => allWindows().forEach((w) => applyAccent(w.webContents));

// Live reload: edit a .css file in data\themes, save, and the app updates instantly.
function watchTheme() {
  if (themeWatcher) { themeWatcher.close(); themeWatcher = null; }
  const files = themeEngine.chain(settings.get('theme')).map((t) => t.file).filter((f) => !f.includes('.asar'));
  if (!files.length) return;
  let t;
  const reapply = () => {
    clearTimeout(t);
    t = setTimeout(() => { for (const w of allWindows()) applyTheme(w.webContents); }, 150);
  };
  const watchers = [];
  for (const f of files) { try { watchers.push(fs.watch(f, reapply)); } catch { /* ignore */ } }
  themeWatcher = { close: () => watchers.forEach((w) => w.close()) };
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

  // Log in -> theme turns on; log out -> theme turns off.
  ses.cookies.on('changed', (_e, cookie) => {
    if (cookie.name === 'c_user') {
      ses.cookies.flushStore().catch(() => {});
      setTimeout(() => allWindows().forEach((w) => applyTheme(w.webContents)), 300);
    }
  });
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
  dialog.showMessageBox(settingsWindow && !settingsWindow.isDestroyed() ? settingsWindow : mainWindow,
    { message: ok ? 'Desktop shortcut created.' : 'Could not create the shortcut.' });
}

// Stamp our app ID onto an existing desktop shortcut that points at this exe.
// Windows then takes the taskbar icon from the shortcut, not a cached guess.
function repairDesktopShortcut() {
  if (process.platform !== 'win32' || !app.isPackaged) return;
  const lnk = path.join(app.getPath('desktop'), 'OpenMessenger.lnk');
  try {
    const cur = shell.readShortcutLink(lnk);
    if (path.resolve(cur.target).toLowerCase() !== process.execPath.toLowerCase()) return;
    if (cur.appUserModelId === APP_ID) return;
    shell.writeShortcutLink(lnk, 'update', { appUserModelId: APP_ID, icon: process.execPath, iconIndex: 0 });
  } catch { /* no shortcut */ }
}

// ------------------------------------------------------------------ start with Windows
// Uses the normal per-user startup entry, so it also shows up (and can be
// disabled) in Task Manager → Startup apps. Packaged builds only.
const AUTOSTART_ARGS = ['--autostart'];
function autostartSupported() {
  return app.isPackaged && (process.platform === 'win32' || process.platform === 'darwin');
}
function getAutostart() {
  if (!autostartSupported()) return false;
  return app.getLoginItemSettings({ path: process.execPath, args: AUTOSTART_ARGS }).openAtLogin;
}
function setAutostart(on) {
  if (!autostartSupported()) return;
  app.setLoginItemSettings({ openAtLogin: on, path: process.execPath, args: AUTOSTART_ARGS });
}

// ------------------------------------------------------------------ settings
// Single place where a changed setting takes effect (menus + Settings window).
function applySetting(key, value) {
  if (key === 'startWithWindows') {
    setAutostart(!!value);
    rebuildMenus();
    pushSettingsState();
    return;
  }
  settings.set(key, value);
  switch (key) {
    case 'theme':
    case 'recolorChats':
      previewAccent = null;
      applyThemeEverywhere();
      break;
    case 'accent':
      previewAccent = null;
      applyAccentEverywhere();
      break;
    case 'sound':
    case 'volume':
      sendSoundEverywhere();
      break;
    default:
      break;
  }
  rebuildMenus();
  pushSettingsState();
}

function testSound() {
  if (mainWindow) mainWindow.webContents.send('om:play');
}

function settingsState() {
  return {
    settings: {
      theme: settings.get('theme'),
      accent: settings.get('accent'),
      recolorChats: settings.get('recolorChats'),
      sound: settings.get('sound'),
      volume: settings.get('volume'),
      closeToTray: settings.get('closeToTray'),
      startMinimized: settings.get('startMinimized'),
      startWithWindows: getAutostart(),
    },
    autostartSupported: autostartSupported(),
    themes: themeEngine.listThemes(),
    sounds: [...sounds().keys()].map((file) => ({ file, name: prettyName(file) })),
    version: app.getVersion(),
    platform: process.platform,
  };
}

function pushSettingsState() {
  if (settingsWindow && !settingsWindow.isDestroyed()) settingsWindow.webContents.send('settings:state', settingsState());
}

function openSettings() {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.show();
    settingsWindow.focus();
    return;
  }
  settingsWindow = new BrowserWindow({
    width: 760,
    height: 720,
    minWidth: 560,
    minHeight: 480,
    title: 'OpenMessenger Settings',
    backgroundColor: '#0b0b0e',
    autoHideMenuBar: true,
    icon: path.join(paths.assets, process.platform === 'win32' ? 'icon.ico' : 'icon.png'),
    parent: undefined,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'settings-ui', 'preload.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });
  settingsWindow.setMenu(null);
  settingsWindow.loadURL('om://settings/index.html');
  settingsWindow.once('ready-to-show', () => settingsWindow.show());
  settingsWindow.webContents.setWindowOpenHandler(({ url }) => { openExternal(url); return { action: 'deny' }; });
  settingsWindow.on('closed', () => {
    settingsWindow = null;
    if (previewAccent) { previewAccent = null; applyAccentEverywhere(); } // drop unsaved preview
  });
}

ipcMain.handle('settings:get', () => settingsState());
ipcMain.handle('settings:set', (_e, key, value) => {
  const allowed = ['theme', 'accent', 'recolorChats', 'sound', 'volume', 'closeToTray', 'startMinimized', 'startWithWindows'];
  if (!allowed.includes(key)) return false;
  if (key === 'volume') value = Math.min(1, Math.max(0, Number(value) || 0));
  if (key === 'accent' && !/^#[0-9a-f]{6}$/i.test(value)) return false;
  applySetting(key, value);
  return true;
});
ipcMain.on('settings:preview-accent', (_e, hex) => {
  if (!/^#[0-9a-f]{6}$/i.test(hex || '')) return;
  previewAccent = hex;
  applyAccentEverywhere();
});
ipcMain.on('settings:test-sound', testSound);
ipcMain.on('settings:open', (_e, what) => {
  const target = { themes: paths.userThemes, sounds: paths.userSounds, data: paths.dataDir }[what];
  if (target) shell.openPath(target);
});
ipcMain.on('settings:shortcut', createDesktopShortcut);

function settingsMenu() {
  const themeItems = [{ label: 'None (Messenger default)', type: 'radio', checked: !settings.get('theme'),
    click: () => applySetting('theme', '') }];
  for (const t of themeEngine.listThemes()) {
    themeItems.push({ label: t.name, type: 'radio', checked: settings.get('theme') === t.file,
      click: () => applySetting('theme', t.file) });
  }
  themeItems.push({ type: 'separator' },
    { label: 'Recolor chats with accent', type: 'checkbox', checked: settings.get('recolorChats'),
      click: (i) => applySetting('recolorChats', i.checked) },
    { label: 'Open themes folder', click: () => shell.openPath(paths.userThemes) },
    { label: 'Reload theme', accelerator: 'CmdOrCtrl+Shift+R', click: applyThemeEverywhere });

  return [
    { label: 'Settings…', accelerator: 'CmdOrCtrl+,', click: openSettings },
    { type: 'separator' },
    { label: 'Theme', submenu: themeItems },
    { label: 'Test notification sound', click: testSound },
    { type: 'separator' },
    { label: 'Close button hides to tray', type: 'checkbox', checked: settings.get('closeToTray'),
      click: (i) => applySetting('closeToTray', i.checked) },
    { label: 'Start with Windows', type: 'checkbox', checked: getAutostart(), visible: autostartSupported(),
      click: (i) => applySetting('startWithWindows', i.checked) },
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
app.on('second-instance', (_e, argv) => {
  if (argv.includes('--settings')) openSettings(); else showMain();
});
app.on('before-quit', () => {
  quitting = true;
  settings.flush();
  session.defaultSession.cookies.flushStore().catch(() => {}); // keep the login on disk
});
app.on('activate', showMain); // macOS dock click
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

app.whenReady().then(() => {
  registerOmProtocol();
  repairDesktopShortcut();
  setupSession();
  createTray();
  rebuildMenus();
  createMainWindow();
  watchTheme();
  mainWindow.on('focus', () => mainWindow.flashFrame(false));
  if (process.argv.includes('--settings')) openSettings();

  // Right-click the taskbar icon -> "Settings"
  if (process.platform === 'win32' && app.isPackaged) {
    app.setUserTasks([{
      program: process.execPath,
      arguments: '--settings',
      iconPath: process.execPath,
      iconIndex: 0,
      title: 'Settings',
      description: 'Open OpenMessenger settings',
    }]);
  }
});
