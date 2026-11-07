// Runs inside every Messenger window (sandboxed, isolated from the page).
// Jobs:
//   1. Wrap the page's Notification API so Windows toasts are silent and
//      OpenMessenger plays the user's chosen sound instead.
//   2. Relay notification clicks to the main process (to show/focus the window).
//   3. Play sounds with WebAudio (not subject to the page's CSP).
const { contextBridge, ipcRenderer } = require('electron');

// ------------------------------------------------------------------ sound
let audioCtx = null;
let rawSound = null; // Uint8Array of the chosen file
let decoded = null;  // AudioBuffer cache
let volume = 0.7;
let lastPlay = 0;

ipcRenderer.on('om:sound', (_e, payload) => {
  rawSound = payload && payload.data ? payload.data : null;
  volume = payload ? payload.volume : volume;
  decoded = null;
});
ipcRenderer.on('om:play', () => playSound(true));

async function playSound(force = false) {
  if (!rawSound) return;
  const now = Date.now();
  if (!force && now - lastPlay < 1000) return; // one ding per burst of messages
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
  clicked: () => ipcRenderer.send('om:notification-click'),
});

// ------------------------------------------------------------------ page patch
// Executed in the page's own JS world, before Messenger's scripts run.
function patchNotifications() {
  const om = window.__openMessenger;
  const Orig = window.Notification;
  if (!Orig || Orig.__openMessenger) return;

  function OMNotification(title, options) {
    const n = new Orig(title, Object.assign({}, options, { silent: true }));
    try { om.notified(title); } catch {}
    n.addEventListener('click', () => { try { om.clicked(); } catch {} });
    return n;
  }
  OMNotification.prototype = Orig.prototype;
  Object.defineProperty(OMNotification, 'permission', { get: () => Orig.permission });
  OMNotification.requestPermission = (...a) => Orig.requestPermission(...a);
  OMNotification.__openMessenger = true;
  window.Notification = OMNotification;

  const SWR = window.ServiceWorkerRegistration;
  if (SWR && SWR.prototype.showNotification) {
    const origShow = SWR.prototype.showNotification;
    SWR.prototype.showNotification = function (title, options) {
      try { om.notified(title); } catch {}
      return origShow.call(this, title, Object.assign({}, options, { silent: true }));
    };
  }
}

try {
  contextBridge.executeInMainWorld({ func: patchNotifications });
} catch (err) {
  // Older Electron fallback
  require('electron').webFrame.executeJavaScript(`(${patchNotifications.toString()})()`);
}
