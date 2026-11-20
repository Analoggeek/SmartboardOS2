// A registered worker alone doesn't prove its cached files are still present.
export function offlineStatus(worker = globalThis.navigator?.serviceWorker?.controller, timeout = 2500) {
  if (!worker || typeof MessageChannel === 'undefined') return Promise.resolve(false);
  return new Promise(resolve => {
    const channel = new MessageChannel();
    const finish = value => { clearTimeout(timer); channel.port1.close(); resolve(value); };
    const timer = setTimeout(() => finish(false), timeout);
    channel.port1.onmessage = event => finish(event.data?.ready === true);
    try { worker.postMessage({ type: 'SMARTBOARDOS_OFFLINE_STATUS' }, [channel.port2]); }
    catch { finish(false); }
  });
}

export async function registerOffline({ status, onWaiting = () => {}, onError = () => {} }) {
  let request = 0;
  const update = async () => {
    const current = ++request;
    const ready = await offlineStatus();
    if (current === request) status(ready);
  };
  if (!globalThis.isSecureContext || !navigator.serviceWorker) { status(false); return; }
  navigator.serviceWorker.addEventListener('controllerchange', update);
  window.addEventListener('pageshow', update);
  try {
    const registration = await navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' });
    const notify = () => { if (registration.waiting && navigator.serviceWorker.controller) onWaiting(); };
    notify();
    registration.addEventListener('updatefound', () => registration.installing?.addEventListener('statechange', notify));
    if (navigator.serviceWorker.controller) void update();
    else {
      const pending = registration.installing;
      if (pending?.state === 'redundant') status(false);
      pending?.addEventListener('statechange', () => { if (pending.state === 'redundant') status(false); });
    }
  } catch (error) { status(false); onError(error); }
}
