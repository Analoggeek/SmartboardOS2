// Fall back to the release page if GitHub's API is rate-limited or offline.
(async () => {
  try {
    const response = await fetch('https://api.github.com/repos/Analoggeek/SmartboardOS2/releases/latest', { signal: AbortSignal.timeout(8000) });
    if (!response.ok) return;
    const release = await response.json();
    const version = /^desktop-v(\d+\.\d+\.\d+)$/.exec(release.tag_name)?.[1];
    if (!version) return;
    let count = 0;
    for (const link of document.querySelectorAll('[data-suffix]')) {
      const name = `SmartBoardOS-${version}-${link.dataset.suffix}`;
      const url = `https://github.com/Analoggeek/SmartboardOS2/releases/download/${release.tag_name}/${name}`;
      if (release.assets?.some((file) => file.name === name && file.browser_download_url === url)) { link.href = url; count++; }
    }
    if (count === 4) document.querySelector('#installer-status').textContent = `Latest release: ${version}. Choose a platform to download its full installer.`;
  } catch { /* Keep the release-page links usable. */ }
})();
