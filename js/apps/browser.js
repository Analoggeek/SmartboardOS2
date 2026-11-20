/* Class Browser — safe search, reader mode, and a live bridge to the whiteboard */
import { el, toast, relTime, fileToDataURL, downloadText } from '../utils.js';
import { icon } from '../icons.js';
import { store } from '../db.js';
import {
  classify, normalizeInput, ENGINES, PORTAL, wikiSearch, fetchReader,
  hostOf, shortText,
} from '../safeweb.js';

const SUGGESTIONS = ['Photosynthesis', 'Pythagoras theorem', 'Solar system', 'Human heart', 'Periodic table', 'Freedom struggle', 'Water cycle', 'Fractions'];

export function mount({ root, api, params }) {
  /* ---------------- state ---------------- */
  let mode = 'home';           // home | web | reader | search | blocked
  let currentUrl = '';
  let currentTitle = '';
  let results = [];
  let reader = null;
  let loading = false;
  let blockedInfo = null;
  let stack = [];
  let stackIndex = -1;
  let embedTimer = null;

  const history = () => store.get('browserHistory', []);
  const setHistory = (h) => store.set('browserHistory', h.slice(0, 40));
  const bookmarks = () => store.get('browserBookmarks', []);
  const setBookmarks = (b) => store.set('browserBookmarks', b.slice(0, 30));

  /* ---------------- dom ---------------- */
  const backBtn = el('button', { class: 'tool-btn', html: icon('chevron-left'), title: 'Back' });
  const fwdBtn = el('button', { class: 'tool-btn', html: icon('chevron-right'), title: 'Forward' });
  const homeBtn = el('button', { class: 'tool-btn', html: icon('grid'), title: 'Home / safe start' });
  const starBtn = el('button', { class: 'tool-btn', html: icon('star'), title: 'Bookmark this page' });
  const address = el('input', {
    class: 'field brw-address', type: 'text', spellcheck: 'false', autocomplete: 'off',
    placeholder: 'Search safely or type a website…',
  });
  const safeBadge = el('div', { class: 'brw-safe', title: 'Safe search is always on' },
    el('span', { class: 'ic', html: icon('lock') }), 'Safe');

  const sendBtn = el('button', { class: 'tool-btn ghost', html: `${icon('board')}<span>Send to board</span>`, title: 'Send this page to the whiteboard' });
  const readerBtn = el('button', { class: 'tool-btn ghost', html: `${icon('book')}<span>Reader</span>`, title: 'Open a clean reading view' });
  const extBtn = el('button', { class: 'tool-btn', html: icon('expand'), title: 'Open in a new tab' });

  const toolbar = el('div', { class: 'app-toolbar brw-toolbar' },
    homeBtn, backBtn, fwdBtn,
    address, safeBadge,
    el('div', { class: 'sep' }),
    readerBtn, sendBtn, starBtn, extBtn
  );

  const view = el('div', { class: 'brw-view' });
  root.append(el('div', { class: 'app brw' }, toolbar, view));

  /* ---------------- helpers ---------------- */
  const blobToData = (blob) => fileToDataURL(blob);

  function pushStack(entry) {
    stack = stack.slice(0, stackIndex + 1);
    stack.push(entry);
    stackIndex = stack.length - 1;
    syncNav();
  }
  function syncNav() {
    backBtn.disabled = stackIndex <= 0;
    fwdBtn.disabled = stackIndex >= stack.length - 1;
  }
  function record(url, title) {
    if (!url) return;
    const list = history().filter((h) => h.url !== url);
    list.unshift({ url, title: title || hostOf(url), ts: Date.now() });
    setHistory(list);
  }
  const isBookmarked = (url) => bookmarks().some((b) => b.url === url);

  function setChrome({ url, title, showReader = true, canBookmark = true }) {
    address.value = url || '';
    currentUrl = url || '';
    currentTitle = title || '';
    api.setTitle(title ? `Browser · ${title}` : 'Class Browser');
    readerBtn.style.display = showReader && url ? '' : 'none';
    starBtn.style.display = canBookmark && url ? '' : 'none';
    sendBtn.style.display = url ? '' : 'none';
    extBtn.style.display = url ? '' : 'none';
    starBtn.classList.toggle('active', !!url && isBookmarked(url));
  }

  /* ---------------- views ---------------- */
  function render() {
    view.innerHTML = '';
    if (mode === 'home') view.append(renderHome());
    if (mode === 'search') view.append(renderResults());
    if (mode === 'web') view.append(renderWeb());
    if (mode === 'reader') view.append(renderReader());
    if (mode === 'blocked') view.append(renderBlocked());
    syncNav();
  }

  /* ---- home ---- */
  function renderHome() {
    const wrap = el('div', { class: 'brw-home' });
    const searchInput = el('input', { class: 'brw-search-input', type: 'text', placeholder: 'What do you want to learn today?', spellcheck: 'false' });
    const searchBtn = el('button', { class: 'btn primary', html: `${icon('search')}<span>Class search</span>` });
    const submit = () => {
      const q = searchInput.value.trim();
      if (q) runSearch(q);
    };
    searchBtn.addEventListener('click', submit);
    searchInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });

    wrap.append(
      el('div', { class: 'brw-hero' },
        el('div', { class: 'brw-hero-badge' }, el('span', { class: 'ic', html: icon('lock') }), 'Safe web for classrooms'),
        el('h1', { class: 'brw-hero-title', text: 'Search the good stuff' }),
        el('p', { class: 'brw-hero-sub', text: 'Adult content is blocked, search engines are locked to SafeSearch, and every page can be sent straight to the board.' }),
        el('div', { class: 'brw-searchbar' }, el('span', { class: 'brw-search-ico', html: icon('search') }), searchInput, searchBtn),
        el('div', { class: 'brw-chips' }, SUGGESTIONS.map((s) => el('button', {
          class: 'chip', text: s, onclick: () => { searchInput.value = s; runSearch(s); },
        })))
      )
    );

    /* portal */
    const grid = el('div', { class: 'brw-portal' });
    PORTAL.forEach((site) => {
      grid.append(el('button', {
        class: 'brw-portal-card', title: site.url,
        style: { '--pc': site.color },
        onclick: () => openUrl(site.url, { title: site.title }),
      },
        el('span', { class: 'brw-portal-mono', text: site.title.trim()[0] }),
        el('span', { class: 'brw-portal-text' }, el('b', { text: site.title }), el('small', { text: site.desc })),
        el('span', { class: 'brw-portal-cat', text: site.cat })
      ));
    });
    wrap.append(el('h2', { class: 'brw-section' }, 'Curated & classroom-safe', el('span', { text: '16 sites' })), grid);

    /* bookmarks */
    const bm = bookmarks();
    if (bm.length) {
      wrap.append(el('h2', { class: 'brw-section' }, 'Bookmarks'));
      const row = el('div', { class: 'brw-list' });
      bm.forEach((b) => row.append(el('button', { class: 'brw-row', onclick: () => openUrl(b.url, { title: b.title }) },
        el('span', { class: 'brw-row-ico', html: icon('star') }),
        el('span', { class: 'brw-row-text' }, el('b', { text: b.title || hostOf(b.url) }), el('small', { text: b.url })),
        el('span', { class: 'brw-row-hint', text: 'Open' })
      )));
      wrap.append(row);
    }

    /* recents */
    const rec = history();
    if (rec.length) {
      wrap.append(el('h2', { class: 'brw-section' }, 'Recent', el('button', {
        class: 'link-btn', text: 'Clear', onclick: () => { setHistory([]); render(); },
      })));
      const row = el('div', { class: 'brw-list' });
      rec.slice(0, 8).forEach((h) => row.append(el('button', { class: 'brw-row', onclick: () => openUrl(h.url, { title: h.title }) },
        el('span', { class: 'brw-row-ico', html: icon('globe') }),
        el('span', { class: 'brw-row-text' }, el('b', { text: h.title || hostOf(h.url) }), el('small', { text: hostOf(h.url) })),
        el('span', { class: 'brw-row-hint', text: relTime(h.ts) })
      )));
      wrap.append(row);
    }

    wrap.append(el('p', { class: 'brw-foot-note', text: 'Filtering runs on this device · SafeSearch is forced on every engine · nothing you browse is uploaded' }));
    return wrap;
  }

  /* ---- search results ---- */
  function renderResults() {
    const wrap = el('div', { class: 'brw-results' });
    wrap.append(el('div', { class: 'brw-results-head' },
      el('div', {}, el('b', { text: `Results for “${currentTitle}”` }), el('small', { text: 'Reviewed encyclopedic content · Wikipedia' })),
      el('div', { class: 'brw-engine-row' },
        Object.entries(ENGINES).filter(([k]) => k !== 'wikipedia').map(([k, eng]) => el('button', {
          class: 'mini-btn', text: `${eng.name} (safe)`,
          onclick: () => window.open(eng.search(currentTitle), '_blank', 'noopener'),
        }))
      )
    ));

    if (!results.length) {
      wrap.append(el('div', { class: 'media-empty', text: 'No results. Try a different word, or use a web engine with SafeSearch.' }));
      return wrap;
    }

    const list = el('div', { class: 'brw-list' });
    results.forEach((r) => {
      list.append(el('div', { class: 'brw-result' },
        el('div', { class: 'brw-result-top' }, el('b', { text: r.title }), el('small', { text: r.words ? `${r.words.toLocaleString()} words` : '' })),
        el('p', { class: 'brw-result-snippet', text: r.snippet }),
        el('div', { class: 'brw-result-actions' },
          el('button', { class: 'btn primary', style: { padding: '6px 12px', fontSize: '12px' }, html: `${icon('book')}<span>Read here</span>`, onclick: () => openReader(r.url) }),
          el('button', { class: 'btn', style: { padding: '6px 12px', fontSize: '12px' }, html: `${icon('board')}<span>Send to board</span>`, onclick: () => sendLink(r.url, r.title, r.snippet) }),
          el('button', { class: 'btn ghost', style: { padding: '6px 12px', fontSize: '12px' }, html: icon('expand'), title: 'Open in new tab', onclick: () => window.open(r.url, '_blank', 'noopener') })
        )
      ));
    });
    wrap.append(list);
    return wrap;
  }

  /* ---- web (iframe) ---- */
  function renderWeb() {
    const wrap = el('div', { class: 'brw-web' });
    const frame = el('iframe', {
      class: 'brw-frame', src: currentUrl, referrerpolicy: 'no-referrer',
      sandbox: 'allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox',
      title: currentTitle || hostOf(currentUrl),
    });
    const fallback = el('div', { class: 'brw-fallback', hidden: true },
      el('div', { class: 'brw-fallback-ico', html: icon('globe') }),
      el('h3', { text: 'This site does not allow embedding' }),
      el('p', { text: 'Many popular websites block being shown inside another app. Use Reader mode to read it here (clean text, no ads), or open it in a new tab.' }),
      el('div', { class: 'brw-fallback-actions' },
        el('button', { class: 'btn primary', html: `${icon('book')}<span>Reader mode</span>`, onclick: () => openReader(currentUrl) }),
        el('button', { class: 'btn', html: `${icon('expand')}<span>Open in tab</span>`, onclick: () => window.open(currentUrl, '_blank', 'noopener') }),
        el('button', { class: 'btn ghost', html: `${icon('board')}<span>Send link to board</span>`, onclick: () => sendLink(currentUrl, currentTitle, hostOf(currentUrl)) })
      )
    );

    const bar = el('div', { class: 'brw-web-bar' },
      el('span', { class: 'brw-web-host', html: `${icon('globe')}<b>${hostOf(currentUrl)}</b>` }),
      el('span', { class: 'brw-web-note', text: 'Blank page? The site blocks embedding — use Reader.' })
    );
    wrap.append(bar, frame, fallback);

    clearTimeout(embedTimer);
    let loaded = false;
    frame.addEventListener('load', () => { loaded = true; clearTimeout(embedTimer); fallback.hidden = true; });
    embedTimer = setTimeout(() => { if (!loaded) fallback.hidden = false; }, 5500);

    return wrap;
  }

  /* ---- reader ---- */
  function renderReader() {
    const wrap = el('div', { class: 'brw-reader' });
    if (loading || !reader) {
      wrap.append(el('div', { class: 'lab3d-loading' }, el('div', { class: 'lab3d-spinner' }), el('div', { text: 'Preparing a clean reading view…' })));
      return wrap;
    }
    wrap.append(el('div', { class: 'brw-reader-head' },
      el('div', {},
        el('h2', { text: reader.title }),
        el('small', { text: `${hostOf(reader.url)} · ${reader.text.split(/\s+/).length.toLocaleString()} words` })
      ),
      el('div', { class: 'brw-reader-actions' },
        el('button', { class: 'btn primary', html: `${icon('board')}<span>Send text to board</span>`, onclick: () => sendText(reader.text, reader.title) }),
        el('button', { class: 'btn', html: `${icon('download')}<span>.txt</span>`, onclick: () => downloadText(`${reader.title}\n\n${reader.text}`, `${(reader.title || 'page').slice(0, 40)}.txt`) }),
        el('button', { class: 'btn ghost', html: icon('expand'), title: 'Open original', onclick: () => window.open(reader.url, '_blank', 'noopener') })
      )
    ));

    if (reader.images.length) {
      const strip = el('div', { class: 'brw-images' });
      reader.images.slice(0, 8).forEach((src) => {
        strip.append(el('div', { class: 'brw-image' },
          el('img', { src, loading: 'lazy', alt: '' }),
          el('button', { class: 'brw-image-send', html: `${icon('board')}<span>Board</span>`, onclick: () => sendImage(src) })
        ));
      });
      wrap.append(el('h3', { class: 'brw-section' }, 'Pictures from this page', el('span', { text: 'tap → board' })), strip);
    }

    const body = el('article', { class: 'brw-article' });
    shortText(reader.text, 12000).split(/\n{2,}/).forEach((para) => {
      const clean = para.trim();
      if (!clean) return;
      if (/^[A-Z][^.!?]{0,80}$/.test(clean) && clean.length < 80) body.append(el('h3', { text: clean }));
      else body.append(el('p', { text: clean }));
    });
    wrap.append(body);
    return wrap;
  }

  /* ---- blocked ---- */
  function renderBlocked() {
    return el('div', { class: 'brw-blocked' },
      el('div', { class: 'brw-blocked-ico' }, el('span', { class: 'ic', html: icon('lock') })),
      el('h2', { text: 'Blocked by classroom filter' }),
      el('p', { text: 'This page or search looks like adult content, so SmartBoardOS did not open it. The filter is always on while the class browser is in use.' }),
      el('div', { class: 'brw-blocked-meta' },
        el('div', {}, el('small', { text: 'Requested' }), el('b', { text: blockedInfo?.target || '' })),
        el('div', {}, el('small', { text: 'Reason' }), el('b', { text: blockedInfo?.reason === 'adult-site' ? 'Blocked website' : 'Adult keywords' }))
      ),
      el('div', { class: 'brw-blocked-actions' },
        el('button', { class: 'btn primary', html: `${icon('search')}<span>Back to safe search</span>`, onclick: () => { mode = 'home'; setChrome({}); render(); } }),
        el('button', { class: 'btn ghost', text: 'Try another topic', onclick: () => { mode = 'home'; setChrome({}); render(); } })
      )
    );
  }

  /* ---------------- navigation ---------------- */
  function goHome(push = true) {
    mode = 'home';
    results = [];
    reader = null;
    setChrome({});
    render();
    if (push) pushStack({ type: 'home' });
  }

  function openUrl(raw, opts = {}) {
    const check = classify(raw);
    if (check.blocked) {
      blockedInfo = { target: raw, reason: check.reason };
      mode = 'blocked';
      setChrome({});
      render();
      return;
    }
    mode = 'web';
    currentUrl = raw.startsWith('http') ? raw : `https://${raw}`;
    setChrome({ url: currentUrl, title: opts.title || hostOf(currentUrl) });
    render();
    record(currentUrl, opts.title || hostOf(currentUrl));
    if (opts.push !== false) pushStack({ type: 'web', url: currentUrl, title: opts.title });
  }

  async function openReader(raw, push = true) {
    const check = classify(raw);
    if (check.blocked) {
      blockedInfo = { target: raw, reason: check.reason };
      mode = 'blocked'; setChrome({}); render(); return;
    }
    mode = 'reader';
    loading = true;
    reader = null;
    setChrome({ url: raw, title: hostOf(raw) });
    render();
    try {
      const data = await fetchReader(raw);
      reader = data;
      loading = false;
      api.setTitle(`Browser · ${data.title}`);
      record(raw, data.title);
      render();
      if (push) pushStack({ type: 'reader', url: raw, title: data.title });
    } catch (e) {
      console.warn(e);
      loading = false;
      toast('Reader could not fetch this page — opening it in a tab instead', 'warn', 3800);
      mode = 'web';
      render();
    }
  }

  async function runSearch(query, push = true) {
    const check = classify(query);
    if (check.blocked) {
      blockedInfo = { target: query, reason: check.reason };
      mode = 'blocked'; setChrome({}); render();
      return;
    }
    currentTitle = query;
    mode = 'search';
    results = [];
    setChrome({ url: '', title: `Search · ${query}`, showReader: false, canBookmark: false });
    render();
    if (push) pushStack({ type: 'search', query });
    try {
      const found = await wikiSearch(query, 8);
      results = found.filter((r) => !classify(r.title).blocked);
      render();
    } catch (e) {
      console.warn(e);
      toast('Class search needs internet — use an engine below', 'warn', 3600);
      render();
    }
  }

  /* ---------------- board bridge ---------------- */
  function sendLink(url, title, desc) {
    api.open('whiteboard', { card: { url, title: title || hostOf(url), desc: desc || '' } });
    toast('Sent to the whiteboard ✦', 'ok');
  }
  function sendText(text, title) {
    api.open('whiteboard', { card: { url: currentUrl, title: title || currentTitle || hostOf(currentUrl), desc: shortText(text, 420) } });
    toast('Article sent to the board', 'ok');
  }
  async function sendImage(src) {
    try {
      const res = await fetch(src, { mode: 'cors' });
      if (!res.ok) throw new Error(String(res.status));
      const blob = await res.blob();
      if (!blob.type.startsWith('image/')) throw new Error('not an image');
      const data = await blobToData(blob);
      api.open('whiteboard', { image: data, title: 'Web image' });
      toast('Image placed on the board', 'ok');
    } catch (e) {
      console.warn(e);
      toast('This image is protected by the website — try another picture', 'warn', 3800);
    }
  }

  /* ---------------- toolbar wiring ---------------- */
  homeBtn.addEventListener('click', () => goHome());
  backBtn.addEventListener('click', () => {
    if (stackIndex <= 0) return;
    stackIndex -= 1;
    const entry = stack[stackIndex];
    syncNav();
    if (entry.type === 'home') goHome(false);
    else if (entry.type === 'web') openUrl(entry.url, { title: entry.title, push: false });
    else if (entry.type === 'reader') openReader(entry.url, false);
    else if (entry.type === 'search') runSearchFromStack(entry.query);
  });
  fwdBtn.addEventListener('click', () => {
    if (stackIndex >= stack.length - 1) return;
    stackIndex += 1;
    const entry = stack[stackIndex];
    syncNav();
    if (entry.type === 'home') goHome(false);
    else if (entry.type === 'web') openUrl(entry.url, { title: entry.title, push: false });
    else if (entry.type === 'reader') openReader(entry.url, false);
    else if (entry.type === 'search') runSearchFromStack(entry.query);
  });
  function runSearchFromStack(query) {
    currentTitle = query;
    mode = 'search';
    setChrome({ url: '', title: `Search · ${query}`, showReader: false, canBookmark: false });
    render();
    wikiSearch(query, 8).then((found) => {
      results = found.filter((r) => !classify(r.title).blocked);
      render();
    }).catch(() => {});
  }

  address.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    const raw = address.value.trim();
    if (!raw) return;
    const norm = normalizeInput(raw);
    if (norm.kind === 'url') openUrl(norm.url);
    else if (norm.kind === 'search') runSearch(norm.query);
  });
  address.addEventListener('focus', () => address.select());

  readerBtn.addEventListener('click', () => { if (currentUrl) openReader(currentUrl); });
  extBtn.addEventListener('click', () => { if (currentUrl) window.open(currentUrl, '_blank', 'noopener'); });
  sendBtn.addEventListener('click', () => {
    if (mode === 'reader' && reader) sendText(reader.text, reader.title);
    else if (currentUrl) sendLink(currentUrl, currentTitle || hostOf(currentUrl), '');
    else toast('Open a page first', 'warn', 1800);
  });
  starBtn.addEventListener('click', () => {
    if (!currentUrl) return;
    const list = bookmarks();
    if (list.some((b) => b.url === currentUrl)) {
      setBookmarks(list.filter((b) => b.url !== currentUrl));
      toast('Bookmark removed', 'info', 1500);
    } else {
      setBookmarks([{ url: currentUrl, title: currentTitle || hostOf(currentUrl), ts: Date.now() }, ...list]);
      toast('Bookmarked', 'ok', 1500);
    }
    starBtn.classList.toggle('active', isBookmarked(currentUrl));
  });

  /* ---------------- deep link ---------------- */
  if (params?.url) openUrl(params.url, { title: params.title });
  else if (params?.query) runSearch(params.query);
  else goHome(false);

  return {
    onParams: (p = {}) => {
      if (p.url) openUrl(p.url, { title: p.title });
      if (p.query) runSearch(p.query);
      if (p.home) goHome();
    },
    onClose: () => clearTimeout(embedTimer),
  };
}
