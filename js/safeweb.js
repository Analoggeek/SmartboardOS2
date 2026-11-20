/* Class Browser safety layer — search helpers, keyword filter, curated portal */

/* Words that should never reach a classroom screen (kept as stems so simple
   spellings are caught as well). This is a first line of defence — it works
   together with each engine's own SafeSearch. */
export const ADULT_TERMS = [
  'porn', 'porno', 'xxx', 'xnxx', 'nude', 'nudes', 'naked', 'nsfw', 'hentai',
  'sexvideo', 'sex video', 'sex clip', 'onlyfans', 'camgirl', 'webcam sex',
  'escort', 'brazzers', 'xhamster', 'xvideos', 'pornhub', 'chaturbate', 'redtube',
  'youporn', 'spankbang', 'rule34', 'e621', 'bdsm', 'orgy', 'masturbat',
  'rape video', 'incest', 'loli', 'milf', 'aunty sex', 'bf video', 'blue film',
  'chudai', 'sex hindi', 'xxx hindi', 'desi sex', 'bhabhi', 'gandii', 'nangi',
];

export const BLOCKED_HOSTS = [
  'pornhub.com', 'xvideos.com', 'xnxx.com', 'xhamster.com', 'redtube.com',
  'youporn.com', 'onlyfans.com', 'chaturbate.com', 'cam4.com', 'brazzers.com',
  'spankbang.com', 'motherless.com', 'rule34.xxx', 'e621.net', 'eporner.com',
  'txxx.com', 'beeg.com', 'hclips.com', 'porn.com', 'sex.com', 'hanime.tv',
  'nhentai.net', 'literotica.com', 'livejasmin.com', 'stripchat.com',
  'bongacams.com', 'camsoda.com', 'fapello.com', 'thothub.tv', 'erome.com',
];

const URL_RE = /^(https?:\/\/)?([a-z0-9-]+\.)+[a-z]{2,}(:\d+)?([/?#].*)?$/i;

export function hostOf(url = '') {
  try { return new URL(url.startsWith('http') ? url : `https://${url}`).hostname.replace(/^www\./, ''); }
  catch { return ''; }
}

/** Is this text/url something we should never open? */
export function classify(raw = '') {
  const text = String(raw).toLowerCase();
  const compact = text.replace(/[\s._-]+/g, '');
  for (const term of ADULT_TERMS) {
    const t = term.replace(/[\s._-]+/g, '');
    if (!t) continue;
    if (term.includes(' ') ? text.includes(term) : (compact.includes(t) || text.includes(term))) {
      return { blocked: true, reason: 'adult-keyword' };
    }
  }
  const host = hostOf(raw);
  if (host && BLOCKED_HOSTS.some((h) => host === h || host.endsWith(`.${h}`))) {
    return { blocked: true, reason: 'adult-site' };
  }
  return { blocked: false };
}

/** Turn whatever the teacher typed into { kind, url } */
export function normalizeInput(raw = '') {
  const value = raw.trim();
  if (!value) return { kind: 'empty' };
  if (/^(https?:\/\/)/i.test(value) || URL_RE.test(value)) {
    const url = /^https?:\/\//i.test(value) ? value : `https://${value}`;
    return { kind: 'url', url };
  }
  return { kind: 'search', query: value };
}

/* Every web search we hand off gets the strictest safe-search flag the engine offers. */
export const ENGINES = {
  duckduckgo: {
    name: 'DuckDuckGo',
    search: (q) => `https://duckduckgo.com/?q=${encodeURIComponent(q)}&kp=1&ia=web`,
    icon: '🦆',
  },
  google: {
    name: 'Google',
    search: (q) => `https://www.google.com/search?q=${encodeURIComponent(q)}&safe=active`,
    icon: '🔎',
  },
  bing: {
    name: 'Bing',
    search: (q) => `https://www.bing.com/search?q=${encodeURIComponent(q)}&adlt=strict`,
    icon: '🅱️',
  },
  wikipedia: {
    name: 'Wikipedia',
    search: (q) => `https://en.wikipedia.org/w/index.php?search=${encodeURIComponent(q)}`,
    icon: '📚',
  },
};

/** Curated, classroom-safe starting points. `embed` = usually allows iframes. */
export const PORTAL = [
  { title: 'Wikipedia', desc: 'Every topic, free encyclopedia', url: 'https://en.wikipedia.org', cat: 'Reference', icon: '📚', color: '#64748b' },
  { title: 'Khan Academy', desc: 'Maths & science lessons', url: 'https://www.khanacademy.org', cat: 'Learning', icon: '🎓', color: '#10b981' },
  { title: 'PhET Simulations', desc: 'Interactive science sims', url: 'https://phet.colorado.edu/en/simulations/browse', cat: 'Science', icon: '⚛️', color: '#0ea5e9', embed: true },
  { title: 'GeoGebra', desc: 'Geometry & graphing', url: 'https://www.geogebra.org/classic', cat: 'Maths', icon: '📐', color: '#6366f1', embed: true },
  { title: 'Desmos', desc: 'Graphing calculator', url: 'https://www.desmos.com/calculator', cat: 'Maths', icon: '📈', color: '#22c55e', embed: true },
  { title: 'NASA', desc: 'Space, planets, missions', url: 'https://www.nasa.gov', cat: 'Science', icon: '🚀', color: '#ef4444' },
  { title: 'National Geographic Kids', desc: 'Animals & nature', url: 'https://kids.nationalgeographic.com', cat: 'Science', icon: '🌍', color: '#f59e0b' },
  { title: 'CK-12', desc: 'Free textbooks, class 6–12', url: 'https://www.ck12.org/student/', cat: 'Learning', icon: '📘', color: '#8b5cf6' },
  { title: 'OpenStax', desc: 'Open college textbooks', url: 'https://openstax.org', cat: 'Reference', icon: '📗', color: '#14b8a6' },
  { title: 'Project Gutenberg', desc: '70k free ebooks', url: 'https://www.gutenberg.org', cat: 'Reading', icon: '📖', color: '#a16207' },
  { title: 'StoryWeaver', desc: 'Free stories for kids', url: 'https://storyweaver.org.in', cat: 'Reading', icon: '🧒', color: '#ec4899' },
  { title: 'Scratch', desc: 'Creative coding for kids', url: 'https://scratch.mit.edu', cat: 'Coding', icon: '🐱', color: '#f97316' },
  { title: 'Tinkercad', desc: '3D design & circuits', url: 'https://www.tinkercad.com', cat: 'Coding', icon: '🧩', color: '#06b6d4' },
  { title: 'Google Arts & Culture', desc: 'Museums & art', url: 'https://artsandculture.google.com', cat: 'Culture', icon: '🎨', color: '#e11d48' },
  { title: 'Smithsonian', desc: 'History & museums', url: 'https://www.si.edu', cat: 'Culture', icon: '🏛️', color: '#0891b2' },
  { title: 'NCERT', desc: 'Indian school textbooks', url: 'https://ncert.nic.in/textbook.php', cat: 'Learning', icon: '🇮🇳', color: '#f97316' },
];

/** Wikipedia has a CORS-enabled search API — perfect for an in-app class search. */
export async function wikiSearch(query, limit = 8) {
  const url = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&srlimit=${limit}&format=json&origin=*`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`search failed (${res.status})`);
  const data = await res.json();
  return (data?.query?.search || []).map((r) => ({
    title: r.title,
    snippet: String(r.snippet || '').replace(/<[^>]+>/g, ''),
    url: `https://en.wikipedia.org/wiki/${encodeURIComponent(r.title.replace(/\s/g, '_'))}`,
    words: r.wordcount,
  }));
}

/** Wikipedia has clean, CORS-enabled article endpoints — use them first. */
async function fetchWiki(url, images) {
  const u = new URL(url);
  const rawTitle = decodeURIComponent(u.pathname.replace(/^\/wiki\//, '')).replace(/_/g, ' ');
  const host = u.hostname.replace(/^www\./, '');
  const api = `https://${host}/w/api.php?action=query&prop=extracts&explaintext=1&redirects=1&format=json&origin=*&titles=${encodeURIComponent(rawTitle)}`;
  const res = await fetch(api);
  if (!res.ok) throw new Error(`wiki ${res.status}`);
  const data = await res.json();
  const page = Object.values(data?.query?.pages || {})[0];
  if (!page || !page.extract) throw new Error('no extract');
  return { title: page.title, text: page.extract.trim(), images, url };
}

export async function wikiImages(url, limit = 8) {
  try {
    const u = new URL(url);
    const rawTitle = decodeURIComponent(u.pathname.replace(/^\/wiki\//, '')).replace(/_/g, ' ');
    const host = u.hostname.replace(/^www\./, '');
    const api = `https://${host}/w/api.php?action=query&generator=images&titles=${encodeURIComponent(rawTitle)}`
      + `&gimlimit=${limit + 4}&prop=imageinfo&iiprop=url&iiurlwidth=520&format=json&origin=*`;
    const res = await fetch(api);
    if (!res.ok) return [];
    const data = await res.json();
    return Object.values(data?.query?.pages || {})
      .map((p) => p.imageinfo?.[0]?.thumburl || p.imageinfo?.[0]?.url)
      .filter((src) => src && !/\.svg(\?|$)/i.test(src))
      .slice(0, limit);
  } catch {
    return [];
  }
}

/** Reader mode: Wikipedia API for wiki pages, r.jina.ai for everything else. */
export async function fetchReader(url) {
  const isWiki = /^https?:\/\/[a-z.]*wikipedia\.org\/wiki\//i.test(url);
  if (isWiki) {
    const images = await wikiImages(url);
    try {
      return await fetchWiki(url, images);
    } catch (e) {
      console.warn('wiki reader failed, falling back', e);
    }
  }
  const res = await fetch(`https://r.jina.ai/${url}`, { headers: { Accept: 'text/plain' } });
  if (!res.ok) throw new Error(`reader failed (${res.status})`);
  const raw = await res.text();
  return parseReader(raw, url);
}

export function parseReader(raw, sourceUrl) {
  const title = (raw.match(/^Title:\s*(.+)$/m) || [])[1] || hostOf(sourceUrl);
  let body = raw;
  const idx = raw.indexOf('Markdown Content:');
  if (idx > -1) body = raw.slice(idx + 'Markdown Content:'.length);

  const images = [];
  body.replace(/!\[[^\]]*\]\((https?:\/\/[^\s)]+)\)/g, (m, u) => {
    if (images.length < 12 && !/\.svg(\?|$)/i.test(u)) images.push(u);
    return '';
  });

  let text = body.replace(/!\[[^\]]*\]\([^)]*\)/g, '');
  // unwrap markdown links (a few passes handles nested brackets)
  for (let pass = 0; pass < 3; pass++) {
    text = text.replace(/\[([^[\]]*)\]\([^()]*\)/g, '$1');
  }
  text = text
    .replace(/\]\([^)]*\)/g, '')                       // leftover link tails
    .replace(/\(\s*https?:\/\/[^)\s]*\s*\)/g, '')       // (https://…) noise
    .replace(/\[([^\]\n]{0,14})\]/g, (m, inner) => (/\d{4}|[A-Z][a-z]{4,}/.test(inner) ? ` ${inner} ` : ' '))
    .replace(/\[([^\[\]\n]{1,60})\s+"[^"\n]*"\)/g, '$1')      // [Mercury "…")
    .replace(/"[^"\n]{0,60}"\s*\)/g, '')
    .replace(/\*\*([^*\n]+)\*\*/g, '$1')
    .replace(/__([^_\n]+)__/g, '$1')
    .replace(/_([^_\n]{2,60})_/g, '$1')
    .replace(/\*/g, '')
    .replace(/^[#>\-\s]{1,6}/gm, '')
    .replace(/[ ]*\|{1,2}[ ]*/g, ' · ')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\s+([.,;:!?])/g, '$1')
    .replace(/\n /g, '\n')
    .trim();

  return { title, text, images, url: sourceUrl };
}

export function shortText(text = '', max = 900) {
  if (text.length <= max) return text;
  return `${text.slice(0, max).replace(/\s+\S*$/, '')}…`;
}
