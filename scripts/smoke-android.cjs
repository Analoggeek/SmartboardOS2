// CDP checks against the QA WebView, launched by smoke-android.sh with radios disabled.
const assert = require('node:assert/strict');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
(async () => {
  let tab;
  for (let i = 0; i < 40 && !tab; i++) {
    try {
      const tabs = await (await fetch('http://127.0.0.1:9222/json/list', {signal:AbortSignal.timeout(1000)})).json();
      tab = tabs.find(t => t.url.startsWith('https://appassets.androidplatform.net/index.html'));
    } catch { /* WebView is still starting. */ }
    if (!tab) await sleep(500);
  }
  assert(tab, 'Bundled offline page did not start');
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  const open = new Promise((resolve,reject) => { ws.addEventListener('open',resolve); ws.addEventListener('error',reject); });
  const pending = new Map();
  let id = 0;
  ws.addEventListener('message', event => {
    const reply = JSON.parse(event.data);
    pending.get(reply.id)?.(reply);
    pending.delete(reply.id);
  });
  const cdp = (method, params) => new Promise((resolve, reject) => {
    const n = ++id;
    const timer = setTimeout(() => { pending.delete(n); reject(Error(`Timed out: ${method}`)); }, 5000);
    pending.set(n, reply => { clearTimeout(timer); reply.error ? reject(Error(reply.error.message)) : resolve(reply.result); });
    ws.send(JSON.stringify({id:n, method, params}));
  });
  const evalJs = async expression => {
    const {result, exceptionDetails} = await cdp('Runtime.evaluate', {expression, returnByValue:true, awaitPromise:true});
    if (exceptionDetails) throw Error(exceptionDetails.exception?.description || exceptionDetails.text);
    return result.value;
  };
  const board = "window.__sbos?.wm.windows.get('whiteboard')?.instance";
  try {
    await open;
    for (let i=0; i<40 && !await evalJs(`Boolean(${board})`); i++) await sleep(500);
    assert.equal(await evalJs(`Boolean(${board})`), true, 'Whiteboard did not mount offline');
    assert.equal(await evalJs("smartboardAndroid.isBundled() && document.querySelector('#home-offline-status').textContent"), 'Ready offline');
    assert.equal(await evalJs(`(${board}).state().pageCount`), 1);
    await evalJs("document.querySelector('.new-board-page').click()");
    assert.equal(await evalJs(`(${board}).state().pageCount`), 2);
    await evalJs('window.__sbos.saveWork()');
    await cdp('Page.reload', {ignoreCache:true});
    for (let i=0; i<40 && !await evalJs(`Boolean(${board})`).catch(() => false); i++) await sleep(500);
    assert.equal(await evalJs(`(${board}).state().pageCount`), 2, 'Offline page edits did not persist');
    console.log('Bundled Android WebView: airplane mode first launch, new page and offline persistence passed');
  } finally { ws.close(); }
})().catch(err => { console.error(err); process.exitCode = 1; });
