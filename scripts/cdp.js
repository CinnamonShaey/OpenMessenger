// Tiny CDP helper for debugging OpenMessenger in dev mode.
// usage: node cdp.js "<js expression>" [urlSubstring]   |   node cdp.js --shot out.png
const [, , arg, arg2, arg3] = process.argv;
(async () => {
  const targets = await (await fetch('http://127.0.0.1:9333/json')).json();
  const pages = targets.filter((t) => t.type === 'page');
  const t = pages.find((p) => !arg2 || p.url.includes(arg3 || arg2) || p.title.includes(arg3 || arg2)) || pages[0];
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  let id = 0; const pending = {};
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (pending[d.id]) { pending[d.id](d); delete pending[d.id]; } };
  await new Promise((r) => (ws.onopen = r));
  const send = (method, params = {}) => new Promise((r) => { pending[++id] = r; ws.send(JSON.stringify({ id, method, params })); });
  if (arg === '--shot') {
    const r = await send('Page.captureScreenshot', { format: 'png' });
    require('fs').writeFileSync(arg2 && arg2.endsWith('.png') ? arg2 : 'shot.png', Buffer.from(r.result.data, 'base64'));
    console.log('saved');
  } else if (arg === '--list') {
    console.log(pages.map((p) => p.title + ' | ' + p.url).join('\n'));
  } else {
    const r = await send('Runtime.evaluate', { expression: arg, returnByValue: true, awaitPromise: true });
    console.log(JSON.stringify(r.result.result.value ?? r.result, null, 1));
  }
  ws.close();
})();
