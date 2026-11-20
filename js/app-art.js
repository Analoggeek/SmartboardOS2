/* Original launcher icon set: a common rounded tile with distinct, drawn symbols. */
const art = {
  whiteboard: ['#b3a9ff','#664be7','#362786','<rect x="19" y="19" width="34" height="26" rx="5"/><path d="m25 39 8-7 6 4 8-9M32 51h8"/>'],
  pdf: ['#ffbbb5','#dd4e62','#922c51','<path d="M28 17h12l9 9v23a4 4 0 0 1-4 4H27a4 4 0 0 1-4-4V22a5 5 0 0 1 5-5Z"/><path d="M40 17v11h9M29 35h13m-13 7h10"/>'],
  media: ['#8bdcff','#2675d4','#1b438c','<rect x="19" y="22" width="34" height="29" rx="5"/><circle cx="43" cy="30" r="2.6" fill="#fff" stroke="none"/><path d="m20 45 9-10 7 7 5-4 10 9"/>'],
  class: ['#ffc89c','#da692b','#943c2c','<path d="M33 17h7m-3 0v5m12 3 3 3"/><circle cx="36" cy="38" r="14"/><path d="M36 30v9l5 3"/><circle cx="36" cy="38" r="1" fill="#fff"/>'],
  notes: ['#94eab6','#2c9f75','#276354','<rect x="23" y="18" width="29" height="35" rx="5"/><path d="M20 25h8m-8 10h8m-8 10h8m5-16h13m-13 8h13m-13 8h8"/>'],
  calculator: ['#d9b1ff','#9152d7','#552c8d','<rect x="23" y="17" width="27" height="37" rx="5"/><path d="M29 24h15v7H29z"/><path d="M30 39h2m8 0h2m-12 7h2m8 0h2"/>'],
  maps: ['#77eadb','#169e9a','#16616e','<circle cx="36" cy="36" r="17"/><ellipse cx="36" cy="36" rx="8" ry="17"/><path d="M20 30h32m-32 12h32"/>'],
  recording: ['#ffaade','#d4458a','#8a2c65','<rect x="18" y="23" width="27" height="26" rx="6"/><path d="m45 32 10-5v18l-10-5z"/><circle cx="31.5" cy="36" r="5" fill="#fff" stroke="none"/>'],
  lessons: ['#ffe495','#bd8b36','#836135','<path d="M19 25a4 4 0 0 1 4-4h10l5 5h10a5 5 0 0 1 5 5v15a5 5 0 0 1-5 5H24a5 5 0 0 1-5-5z"/><path d="M20 34h32M28 42h12"/>'],
  settings: ['#d0e3ff','#627eaf','#354974','<path d="M21 25h30m-30 11h30m-30 11h30"/><circle cx="32" cy="25" r="4" fill="#a9c3ff"/><circle cx="43" cy="36" r="4" fill="#a9c3ff"/><circle cx="29" cy="47" r="4" fill="#a9c3ff"/>'],
};
let sequence = 0;
export function appArt(id) {
  const [light,base,deep,paths] = art[id] || art.settings;
  const key = `app-art-${++sequence}`;
  return `<svg class="app-art" viewBox="0 0 72 72" aria-hidden="true" focusable="false"><defs>
  <linearGradient id="${key}-base" x2=".9" y2="1"><stop stop-color="${light}"/><stop offset=".63" stop-color="${base}"/><stop offset="1" stop-color="${deep}"/></linearGradient>
  <linearGradient id="${key}-rim" x2=".6" y2="1"><stop stop-color="#fff" stop-opacity=".72"/><stop offset="1" stop-color="#fff" stop-opacity=".03"/></linearGradient>
  <linearGradient id="${key}-depth" x2="0" y2="1"><stop stop-color="${base}"/><stop offset="1" stop-color="${deep}"/></linearGradient></defs>
  <rect x="7" y="10" width="58" height="57" rx="16" fill="url(#${key}-depth)"/><rect x="7" y="6" width="58" height="57" rx="16" fill="url(#${key}-base)" stroke="url(#${key}-rim)"/>
  <path d="M14 23c0-6 4-10 10-10h15" stroke="#fff" opacity=".17" stroke-linecap="round" fill="none"/>
  <g fill="none" stroke="#fff" stroke-linecap="round" stroke-linejoin="round" stroke-width="2.7">${paths}</g></svg>`;
}
