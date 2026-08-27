// Fetch real Pokhara photos from Wikimedia Commons (freely licensed) into public/assets/images.
// Uses the MediaWiki API. Falls back to curated direct file URLs if search yields nothing.
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const IMG_DIR = path.join(__dirname, '..', 'public', 'assets', 'images');
if (!fs.existsSync(IMG_DIR)) fs.mkdirSync(IMG_DIR, { recursive: true });

const data = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'server', 'data', 'destinations.json'), 'utf8')
);

const UA = 'PokharaTourismApp/1.0 (educational demo; contact: dev@example.com)';
const API = 'https://commons.wikimedia.org/w/api.php';

// Curated fallback file titles (without File: prefix) known to exist on Commons.
const FALLBACK = {
  'phewa-lake': 'Phewa Lake Nepal.jpg',
  'tal-barahi-temple': 'Tal Barahi Temple.jpg',
  'world-peace-pagoda': 'World Peace Pagoda, Pokhara.jpg',
  'sarangkot': 'Sarangkot Pokhara.jpg',
  'devis-fall': 'Devis Fall Pokhara.jpg',
  'gupteshwor-mahadev-cave': 'Gupteshwor Mahadev Cave.jpg',
  'begnas-lake': 'Begnas Lake.jpg',
  'rupa-lake': 'Rupa Lake Pokhara.jpg',
  'mahendra-cave': 'Mahendra Cave Pokhara.jpg',
  'bindhyabasini-temple': 'Bindhyabasini Temple Pokhara.jpg',
  'international-mountain-museum': 'International Mountain Museum Pokhara.jpg',
  'seti-river-gorge': 'Seti River Pokhara.jpg',
  'pokhara-old-bazaar': 'Pokhara Old Bazaar.jpg',
  'pumdikot-shiva-statue': 'Pumdikot Shiva Statue Pokhara.jpg',
};

function apiGet(params) {
  const url = API + '?format=json&' + new URLSearchParams(params).toString();
  const res = execSync(
    `curl -s --max-time 30 -A '${UA}' '${url}'`,
    { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 }
  );
  return JSON.parse(res);
}

function searchImages(term) {
  const data = apiGet({
    action: 'query',
    generator: 'search',
    gsrsearch: term,
    gsrnamespace: '6',
    gsrlimit: '8',
    prop: 'imageinfo',
    iiprop: 'url|mime',
    iiurlwidth: '1280',
  });
  const pages = data.query && data.query.pages ? Object.values(data.query.pages) : [];
  const out = [];
  for (const p of pages) {
    const ii = p.imageinfo && p.imageinfo[0];
    if (!ii) continue;
    if (!/^image\/(jpeg|jpg|png)$/.test(ii.mime || '')) continue;
    out.push({ title: p.title, url: ii.thumburl || ii.url });
  }
  return out;
}

function download(url, dest) {
  try {
    execSync(`curl -sL --max-time 60 -A '${UA}' '${url}' -o '${dest}'`, { encoding: 'utf8' });
    return fs.existsSync(dest) && fs.statSync(dest).size > 6000;
  } catch (e) {
    return false;
  }
}

function looksLikeImage(dest) {
  try {
    const t = execSync(`file -b --mime-type '${dest}'`, { encoding: 'utf8' }).trim();
    return t.startsWith('image/');
  } catch (e) {
    return false;
  }
}

(async () => {
  const results = [];
  for (const d of data) {
    const dest = path.join(IMG_DIR, d.slug + '.jpg');
    let ok = false;

    // 1) search by the destination's search term
    let candidates = searchImages(d.search);
    // 2) fallback to curated title
    if (FALLBACK[d.slug]) {
      const t = 'File:' + FALLBACK[d.slug];
      const fi = apiGet({ action: 'query', titles: t, prop: 'imageinfo', iiprop: 'url|mime', iiurlwidth: '1280' });
      const pg = fi.query && fi.query.pages ? Object.values(fi.query.pages)[0] : null;
      if (pg && pg.imageinfo) {
        const ii = pg.imageinfo[0];
        if (/^image\/(jpeg|jpg|png)$/.test(ii.mime || '')) {
          candidates.unshift({ title: pg.title, url: ii.thumburl || ii.url });
        }
      }
    }

    for (const c of candidates) {
      if (download(c.url, dest) && looksLikeImage(dest)) { ok = true; break; }
    }
    console.log(`${ok ? 'OK ' : 'MISS'} ${d.slug}  (${candidates.length} candidates)`);
    results.push({ slug: d.slug, ok });
  }
  const missed = results.filter((r) => !r.ok).map((r) => r.slug);
  console.log('\nDone. ' + (data.length - missed.length) + '/' + data.length + ' images fetched.');
  if (missed.length) console.log('Missing: ' + missed.join(', '));
})();
