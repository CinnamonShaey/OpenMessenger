// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 CinnamonShaey
// Runs inside every Messenger window (sandboxed, isolated from the page).
// Jobs:
//   1. Background mode: when the main window isn't the active window, tell
//      Messenger the page is hidden (like a background browser tab), and show a
//      desktop notification (sender, preview, avatar, click-to-open) when a new
//      message arrives. messenger.com uses web push for that, which isn't
//      available here, so we build it from the chat list.
//   2. Wrap the Notification API so Windows toasts are silent and our sound plays.
//   3. Replace Messenger's own short "new message" sound with the chosen one
//      (call ringtones are left alone), or keep Meta's sound in "Messenger default".
//   4. Play sounds with WebAudio (not subject to the page's CSP).
const { contextBridge, ipcRenderer, webFrame } = require('electron');

// ------------------------------------------------------------------ sound
let audioCtx = null;
let rawSound = null;   // Uint8Array of the chosen file
let decoded = null;    // AudioBuffer cache
let volume = 0.5;
let mode = 'custom';   // 'custom' | 'silent' | 'messenger'
let isMain = false;    // only the main window replaces Messenger's sounds
let popups = true;     // show desktop notification pop-ups
let soundWhenActive = false; // also ping while the app is the active window
let reactions = true;  // notify when someone reacts to your message
let lastPlay = 0;

ipcRenderer.on('om:sound', (_e, p) => {
  if (!p) return;
  rawSound = p.data || null;
  volume = p.volume;
  mode = p.mode;
  isMain = !!p.isMain;
  popups = p.popups !== false;
  soundWhenActive = !!p.soundWhenActive;
  reactions = p.reactions !== false;
  decoded = null;
});
ipcRenderer.on('om:play', () => {
  if (mode === 'messenger') runInPage(() => { if (window.__omPlayMessengerSound) window.__omPlayMessengerSound(); });
  else playSound(true);
});

async function playSound(force = false) {
  if (mode !== 'custom' || !rawSound) return;
  const now = Date.now();
  if (!force && now - lastPlay < 1500) return; // one sound per burst of messages
  lastPlay = now;
  try {
    audioCtx ||= new AudioContext();
    if (audioCtx.state === 'suspended') await audioCtx.resume();
    if (!decoded) {
      const buf = rawSound.buffer.slice(rawSound.byteOffset, rawSound.byteOffset + rawSound.byteLength);
      decoded = await audioCtx.decodeAudioData(buf);
    }
    const src = audioCtx.createBufferSource();
    const gain = audioCtx.createGain();
    gain.gain.value = volume;
    src.buffer = decoded;
    src.connect(gain).connect(audioCtx.destination);
    src.start();
  } catch (err) {
    console.warn('[OpenMessenger] sound failed', err);
  }
}

// ------------------------------------------------------------------ bridge
contextBridge.exposeInMainWorld('__openMessenger', {
  notified: (title) => {
    playSound();
    ipcRenderer.send('om:notified', String(title || ''));
  },
  messageSound: () => playSound(),
  clicked: () => ipcRenderer.send('om:notification-click'),
  soundMode: () => mode,
  isMainWindow: () => isMain,
  volume: () => volume,
  popups: () => popups,
  soundWhenActive: () => soundWhenActive,
  reactions: () => reactions,
});

function runInPage(func, args = []) {
  try {
    contextBridge.executeInMainWorld({ func, args });
  } catch {
    webFrame.executeJavaScript(`(${func.toString()})(...${JSON.stringify(args)})`);
  }
}

ipcRenderer.on('om:background', (_e, on) => {
  runInPage((b) => { if (window.__omSetBackground) window.__omSetBackground(b); }, [!!on]);
});

// Ctrl + mouse wheel zoom. Handled here (not only via Electron's 'zoom-changed')
// so it works reliably; touchpad scrolls are accumulated into whole steps.
let wheelAcc = 0;
let wheelTimer = 0;
window.addEventListener('wheel', (e) => {
  if (!e.ctrlKey) return;
  e.preventDefault();
  wheelAcc += e.deltaMode === 1 ? e.deltaY * 40 : e.deltaY; // lines -> pixels
  clearTimeout(wheelTimer);
  wheelTimer = setTimeout(() => { wheelAcc = 0; }, 300);
  while (Math.abs(wheelAcc) >= 100) {
    ipcRenderer.send('om:zoom', wheelAcc < 0 ? 1 : -1);
    wheelAcc -= Math.sign(wheelAcc) * 100;
  }
}, { passive: false, capture: true });

// ------------------------------------------------------------------ page patch
// Executed in the page's own JS world, before Messenger's scripts run.
function pagePatch() {
  const om = window.__openMessenger;
  if (!om || window.__omPatched) return;
  Object.defineProperty(window, '__omPatched', { value: true });

  // ---- background mode (fake "hidden tab" while the window isn't active)
  const docProto = Document.prototype;
  const visDesc = Object.getOwnPropertyDescriptor(docProto, 'visibilityState');
  const hidDesc = Object.getOwnPropertyDescriptor(docProto, 'hidden');
  const origHasFocus = docProto.hasFocus;
  let background = false;
  Object.defineProperty(docProto, 'visibilityState', {
    configurable: true, enumerable: true,
    get() { return background ? 'hidden' : visDesc.get.call(this); },
  });
  Object.defineProperty(docProto, 'hidden', {
    configurable: true, enumerable: true,
    get() { return background ? true : hidDesc.get.call(this); },
  });
  docProto.hasFocus = function hasFocus() { return background ? false : origHasFocus.call(this); };
  Object.defineProperty(window, '__omSetBackground', {
    value: (b) => {
      if (b === background) return;
      background = b;
      document.dispatchEvent(new Event('visibilitychange'));
    },
  });

  // ---- Messenger's own sounds
  const origPlay = HTMLMediaElement.prototype.play;
  const isMetaSound = (src) => /^https:\/\/[^/]*fbcdn\.net\/.+\.(ogg|mp3|wav|m4a)(\?|$)/i.test(src);
  let messengerSoundUrl = 'https://static.xx.fbcdn.net/rsrc.php/yy/r/XFhtdTsftOC.ogg';
  let lastMessengerSound = 0;

  HTMLMediaElement.prototype.play = function play() {
    const src = this.currentSrc || this.src || '';
    if (!(this instanceof HTMLVideoElement) && !this.loop && isMetaSound(src) && om.isMainWindow()) {
      const el = this;
      el.muted = true; el.__omMuted = true; // decided once its length is known
      const unmute = () => { if (el.__omMuted) { el.muted = false; el.__omMuted = false; } };
      const decide = () => {
        const isMessageSound = el.duration > 0 && el.duration < 4 && !el.loop;
        if (!isMessageSound) { unmute(); return; } // ringtones etc. untouched
        messengerSoundUrl = src;
        lastMessengerSound = Date.now();
        const active = !background && !hidDesc.get.call(document);
        if (active && !om.soundWhenActive()) return; // you're looking at the app: no ping
        if (om.soundMode() === 'messenger') unmute(); else om.messageSound();
        messageArrived();
      };
      if (el.readyState >= 1) decide(); else el.addEventListener('loadedmetadata', decide, { once: true });
    }
    return origPlay.apply(this, arguments);
  };

  // In "Messenger default" mode, make sure a notification still makes Meta's sound.
  function playMessengerSound() {
    lastMessengerSound = Date.now();
    const a = new Audio(messengerSoundUrl);
    a.volume = Math.min(1, Math.max(0, om.volume()));
    origPlay.call(a).catch(() => {});
  }
  Object.defineProperty(window, '__omPlayMessengerSound', { value: playMessengerSound });
  function messengerDefaultSound() {
    if (om.soundMode() !== 'messenger') return;
    setTimeout(() => {
      if (Date.now() - lastMessengerSound < 2000) return; // Messenger already played it
      playMessengerSound();
    }, 700);
  }

  // ---- notifications
  const Orig = window.Notification;
  let lastPageNotification = 0;

  // messenger.com relies on web push for desktop notifications, which isn't
  // available here. So we build them ourselves from the chat list:
  //   - new messages: when Messenger plays its new-message sound
  //   - reactions:    when a chat's preview changes to "Reacted ... to your message"
  //                   (Messenger plays no sound for those)
  const CHAT_ROWS = '[role="grid"][aria-label="Chats"] [role="row"]';
  const recent = new Map(); // dedupe key -> time

  // Text of an element with emoji images replaced by their emoji (alt text).
  function textWithEmoji(el) {
    let out = '';
    const walk = (n) => {
      if (n.nodeType === 3) out += n.nodeValue;
      else if (n.nodeName === 'IMG') out += n.alt || '';
      else if (n.nodeType === 1 && n.getAttribute('aria-hidden') !== 'true') n.childNodes.forEach(walk);
    };
    walk(el);
    return out.replace(/\s+/g, ' ').trim();
  }

  // { name, preview, href, link, avatar } for one chat-list row
  function readRow(row) {
    const link = row.querySelector('a[href*="/t/"]');
    if (!link) return null;
    // name and preview are the first two dir="auto" spans that aren't hidden
    // (the "Active now" label sits in an aria-hidden block before the name)
    const spans = [...row.querySelectorAll('span[dir="auto"]')]
      .filter((sp) => !sp.closest('[aria-hidden="true"]') && sp.textContent.trim() && !sp.parentElement.closest('span[dir="auto"]'));
    const name = spans[0] ? spans[0].textContent.trim() : '';
    const preview = spans[1] ? textWithEmoji(spans[1]).replace(/\s*·\s*$/, '') : '';
    const img = [...row.querySelectorAll('img')].find((i) => i.src && !i.src.includes('/emoji.php/'));
    return { name, preview: preview === '·' ? '' : preview, href: link.getAttribute('href'), link, avatar: img ? img.src : undefined };
  }

  const inBackground = () => background || hidDesc.get.call(document);

  function showChatNotification(info) {
    const key = info.href + '|' + info.preview;
    const now = Date.now();
    for (const [k, t] of recent) if (now - t > 15000) recent.delete(k);
    if (recent.has(key)) return false;
    recent.set(key, now);
    const n = new Orig(info.name || 'Messenger', {
      body: info.preview || 'New message',
      icon: info.avatar,
      silent: true,
      tag: 'om-' + info.href,
    });
    n.addEventListener('click', () => {
      try { om.clicked(); } catch {}
      if (info.link && info.link.isConnected) info.link.click(); // open that chat
      else {
        const fresh = [...document.querySelectorAll(CHAT_ROWS + ' a[href]')].find((a) => a.getAttribute('href') === info.href);
        if (fresh) fresh.click();
      }
    });
    return true;
  }

  function messageArrived() {
    if (!inBackground()) return; // user is looking at the app
    if (!om.popups()) return; // pop-ups turned off in Settings (sound still plays)
    setTimeout(() => {
      try {
        if (Date.now() - lastPageNotification < 3000) return; // Messenger made its own
        const rows = [...document.querySelectorAll(CHAT_ROWS)].map(readRow).filter(Boolean);
        if (!rows.length) return;
        const m = /^(.+?) messaged you/.exec(document.title || '');
        const info = (m && rows.find((r) => r.name === m[1].trim())) || rows[0];
        if (/^You[:\s]/.test(info.preview)) return; // our own message, not an incoming one
        showChatNotification(info);
      } catch (err) {
        console.warn('[OpenMessenger] notification failed', err);
      }
    }, 600); // give the chat list a moment to update
  }

  // ---- reactions: watch chat previews for "Reacted ... to your message"
  const REACTION = /\breacted\b.*\bto your message\b/i;
  let previews = null; // href -> last seen preview
  let scanTimer = 0;
  function scanForReactions() {
    const rows = [...document.querySelectorAll(CHAT_ROWS)].map(readRow).filter(Boolean);
    if (!rows.length) return;
    const first = previews === null;
    const seen = new Map(rows.map((r) => [r.href, r.preview]));
    if (!first && inBackground() && om.popups() && om.reactions()) {
      for (const r of rows) {
        if (!REACTION.test(r.preview) || previews.get(r.href) === r.preview) continue;
        if (showChatNotification(r)) {
          if (om.soundMode() === 'messenger') playMessengerSound(); else om.messageSound();
        }
      }
    }
    previews = seen;
  }
  new MutationObserver(() => {
    clearTimeout(scanTimer);
    scanTimer = setTimeout(scanForReactions, 500);
  }).observe(document, { subtree: true, childList: true, characterData: true });

  if (Orig && !Orig.__openMessenger) {
    function OMNotification(title, options) {
      lastPageNotification = Date.now();
      try { om.notified(title); } catch {}
      messengerDefaultSound();
      if (!om.popups()) {
        // Pop-ups off: hand Messenger a harmless stand-in instead of a real notification.
        const fake = new EventTarget();
        Object.assign(fake, { title, body: (options && options.body) || '', close() {}, onclick: null, onclose: null, onerror: null, onshow: null });
        return fake;
      }
      const n = new Orig(title, Object.assign({}, options, { silent: true }));
      n.addEventListener('click', () => { try { om.clicked(); } catch {} });
      return n;
    }
    OMNotification.prototype = Orig.prototype;
    Object.defineProperty(OMNotification, 'permission', { get: () => Orig.permission });
    OMNotification.requestPermission = (...a) => Orig.requestPermission(...a);
    OMNotification.__openMessenger = true;
    window.Notification = OMNotification;
  }

  const SWR = window.ServiceWorkerRegistration;
  if (SWR && SWR.prototype.showNotification) {
    const origShow = SWR.prototype.showNotification;
    SWR.prototype.showNotification = function showNotification(title, options) {
      lastPageNotification = Date.now();
      try { om.notified(title); } catch {}
      messengerDefaultSound();
      if (!om.popups()) return Promise.resolve();
      return origShow.call(this, title, Object.assign({}, options, { silent: true }));
    };
  }
}

runInPage(pagePatch);
