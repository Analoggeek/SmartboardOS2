import { registerOffline } from './offline.js';

void registerOffline({ status: ready => {
  document.querySelector('#offline-status').textContent = ready
    ? 'This browser has all core offline files. Check again from the home-screen app after installing.'
    : 'Offline files are not confirmed in this browser. Open SmartBoardOS while online and check Home before relying on offline use.';
}});

// Fall back to the release page if GitHub's API is rate-limited or offline.
(async () => {
  try {
    const response = await fetch('https://api.github.com/repos/Analoggeek/SmartboardOS2/releases/latest', { signal: AbortSignal.timeout(8000) });
    if (!response.ok) return;
    const release = await response.json();
    const version = /^desktop-v(\d+\.\d+\.\d+)$/.exec(release.tag_name)?.[1];
    if (!version || release.draft || release.prerelease) return;
    const page = `https://github.com/Analoggeek/SmartboardOS2/releases/tag/${release.tag_name}`;
    const asset = name => {
      const url = `https://github.com/Analoggeek/SmartboardOS2/releases/download/${release.tag_name}/${name}`;
      return release.assets?.some(file => file.name === name && file.browser_download_url === url) ? url : null;
    };
    let desktop = 0;
    for (const link of document.querySelectorAll('[data-suffix]')) {
      const url = asset(`SmartBoardOS-${version}-${link.dataset.suffix}`);
      if (!url) continue;
      link.href = url;
      if (link.dataset.suffix.endsWith('.apk')) {
        link.hidden = false;
        document.querySelector('#apk-unavailable').hidden = true;
        document.querySelector('#apk-available').hidden = false;
      } else desktop++;
    }
    document.querySelector('#installer-release').href = page;
    document.querySelector('#installer-checksums').href = asset('SHA256SUMS.txt') || page;
    if (desktop === 4) document.querySelector('#installer-status').textContent = `Latest release: ${version}. Choose a platform to download its full installer.`;
  } catch { /* Keep the release-page links usable. */ }
})();
