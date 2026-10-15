// Record the exact Wikimedia Commons source file, author and licence for every
// photo in public/assets/images/, as those licences require.
//
//   node scripts/record_image_credits.js
//
// How it identifies the source: fetch_images.js downloaded candidates in a
// deterministic order (curated fallback title first, then search results) and
// kept the first that worked, always resizing to 1280px. So the file that is
// actually on disk can be identified by comparing its byte size — and then its
// SHA-256 — against those same candidates, without re-downloading the set.
// Writes public/assets/images/CREDITS.json + CREDITS.md.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const IMG_DIR = path.join(ROOT, 'public', 'assets', 'images');
const UA = 'PokharaTourismApp/1.0';
const API = 'https://commons.wikimedia.org/w/api.php';

const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'server', 'data', 'destinations.json'), 'utf8'));

// --only=slug,slug  re-check a subset (merges into the existing CREDITS.json)
// --wide            widen the search (20 hits, and search the display name too),
//                   for images whose source is no longer in the top-8 results
const ARGS = process.argv.slice(2);
const ONLY = (ARGS.find((a) => a.startsWith('--only=')) || '').split('=')[1];
const WIDE = ARGS.includes('--wide');
const onlySlugs = ONLY ? new Set(ONLY.split(',').map((s) => s.trim())) : null;
const CREDITS_JSON = path.join(IMG_DIR, 'CREDITS.json');
const previous = fs.existsSync(CREDITS_JSON) ? JSON.parse(fs.readFileSync(CREDITS_JSON, 'utf8')).images : [];

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

const cleanUrl = (u) => (u || '').split('?')[0];
const stripHtml = (s) => String(s || '').replace(/<[^>]*>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const sleep = (ms) => execSync(`sleep ${ms / 1000}`);

function apiGet(params) {
  const url = API + '?format=json&' + new URLSearchParams(params).toString();
  for (let attempt = 1; attempt <= 4; attempt++) {
    const res = execSync(`curl -s --max-time 30 -A '${UA}' '${url}'`, { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
    if (res.startsWith('{')) return JSON.parse(res);
    const wait = attempt * 2500;
    console.error(`   (rate-limited, retry ${attempt} in ${wait}ms)`);
    sleep(wait);
  }
  return {};
}

// Same candidate order fetch_images.js used, so the on-disk file can be matched.
function candidatesFor(dest) {
  const out = [];
  const fb = FALLBACK[dest.slug];
  if (fb) {
    const fi = apiGet({ action: 'query', titles: 'File:' + fb, prop: 'imageinfo', iiprop: 'url|mime|size', iiurlwidth: '1280' });
    const pg = Object.values((fi.query && fi.query.pages) || {})[0];
    const ii = pg && pg.imageinfo && pg.imageinfo[0];
    if (ii && ii.thumburl) out.push({ title: pg.title, url: cleanUrl(ii.thumburl), via: 'curated' });
  }
  const search = apiGet({
    action: 'query', generator: 'search', gsrsearch: dest.search, gsrnamespace: '6',
    gsrlimit: WIDE ? '20' : '8', prop: 'imageinfo', iiprop: 'url|mime|size', iiurlwidth: '1280',
  });
  for (const p of Object.values((search.query && search.query.pages) || {})) {
    const ii = p.imageinfo && p.imageinfo[0];
    if (!ii || !/^image\/(jpeg|jpg|png)$/.test(ii.mime || '') || !ii.thumburl) continue;
    const url = cleanUrl(ii.thumburl);
    if (!out.some((c) => c.url === url)) out.push({ title: p.title, url, via: 'search' });
  }
  if (WIDE && dest.name) {
    const alt = apiGet({
      action: 'query', generator: 'search', gsrsearch: dest.name, gsrnamespace: '6',
      gsrlimit: '20', prop: 'imageinfo', iiprop: 'url|mime|size', iiurlwidth: '1280',
    });
    for (const p of Object.values((alt.query && alt.query.pages) || {})) {
      const ii = p.imageinfo && p.imageinfo[0];
      if (!ii || !/^image\/(jpeg|jpg|png)$/.test(ii.mime || '') || !ii.thumburl) continue;
      const url = cleanUrl(ii.thumburl);
      if (!out.some((c) => c.url === url)) out.push({ title: p.title, url, via: 'search-wide' });
    }
  }
  return out;
}

// Byte size of a remote thumb without pulling the whole body.
function headSize(url) {
  try {
    const h = execSync(`curl -sIL --max-time 30 -A '${UA}' '${url}'`, { encoding: 'utf8' });
    const m = h.match(/content-length:\s*(\d+)/i);
    return m ? Number(m[1]) : null;
  } catch (e) {
    return null;
  }
}

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function extmetadata(title) {
  const r = apiGet({ action: 'query', titles: title, prop: 'imageinfo', iiprop: 'extmetadata|url|user' });
  const pg = Object.values((r.query && r.query.pages) || {})[0];
  const ii = pg && pg.imageinfo && pg.imageinfo[0];
  const em = (ii && ii.extmetadata) || {};
  const val = (k) => (em[k] && em[k].value ? stripHtml(em[k].value) : null);
  return {
    artist: val('Artist') || (ii && ii.user) || null,
    license: val('LicenseShortName'),
    licenseUrl: val('LicenseUrl'),
    credit: val('Credit'),
    description: val('ImageDescription'),
    date: val('DateTimeOriginal'),
    page: ii && ii.descriptionurl ? ii.descriptionurl : `https://commons.wikimedia.org/wiki/${encodeURIComponent(title)}`,
  };
}

const results = [];
for (const dest of data) {
  if (onlySlugs && !onlySlugs.has(dest.slug)) {
    const prev = previous.find((p) => p.slug === dest.slug);
    if (prev) results.push(prev); // keep what we already know
    continue;
  }
  const file = path.join(IMG_DIR, dest.slug + '.jpg');
  if (!fs.existsSync(file)) {
    console.log(`MISS ${dest.slug} (no file)`);
    results.push({ slug: dest.slug, name: dest.name, resolved: false, reason: 'file missing' });
    continue;
  }
  const size = fs.statSync(file).size;
  const hash = sha256(file);
  const cands = candidatesFor(dest);
  let match = null;
  for (const c of cands) {
    if (headSize(c.url) !== size) continue;
    // size matched: confirm by content, not just length
    const tmp = path.join(require('os').tmpdir(), `credit-${process.pid}.jpg`);
    try {
      execSync(`curl -sL --max-time 60 -A '${UA}' '${c.url}' -o '${tmp}'`);
      if (fs.existsSync(tmp) && sha256(tmp) === hash) { match = c; fs.unlinkSync(tmp); break; }
    } catch (e) { /* try the next candidate */ }
    if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
  }
  if (!match) {
    console.log(`MISS ${dest.slug}  (${cands.length} candidates, none matched by size+hash)`);
    results.push({ slug: dest.slug, name: dest.name, resolved: false, candidates: cands.length });
    continue;
  }
  const meta = extmetadata(match.title);
  console.log(`OK   ${dest.slug}  ${match.title}  [${meta.license || 'licence unknown'}]`);
  results.push({ slug: dest.slug, name: dest.name, resolved: true, via: match.via, file: match.title, sourceUrl: match.url, ...meta });
  sleep(400);
}

const resolved = results.filter((r) => r.resolved);
const unresolved = results.filter((r) => !r.resolved);

fs.writeFileSync(path.join(IMG_DIR, 'CREDITS.json'), JSON.stringify({ generated: new Date().toISOString(), source: 'Wikimedia Commons', images: results }, null, 2) + '\n');

const rows = resolved.map((r) =>
  `| \`${r.slug}\` | ${r.name} | [${r.file.replace(/^File:/, '')}](${r.page}) | ${r.artist || '—'} | ${r.license || 'unknown'} |`
).join('\n');

const md = `# Image credits

Every photo in \`public/assets/images/\` was downloaded from **Wikimedia Commons**
by [\`scripts/fetch_images.js\`](scripts/fetch_images.js). Wikimedia Commons images
are freely licensed but most of them — CC BY and CC BY-SA — **require attribution**,
so the source file, author and licence for each image are recorded here.

Machine-readable copy: [\`public/assets/images/CREDITS.json\`](public/assets/images/CREDITS.json)
(regenerate with \`node scripts/record_image_credits.js\`, which identifies the exact
source file by matching byte size and SHA-256 against the candidates the fetch
script would have chosen).

| Slug | Destination | Source file (Wikimedia Commons) | Author | Licence |
|---|---|---|---|---|
${rows}
${unresolved.length ? `\n**Not yet resolved** (source file could not be matched — check before reuse): ${unresolved.map((u) => `\`${u.slug}\``).join(', ')}\n` : ''}
*Regenerated: ${new Date().toISOString().slice(0, 10)}*

## Maps

Map data and tiles © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright)
(ODbL). Routing by [OSRM](http://project-osrm.org/) — the public demo server.
Before public traffic, move both to a keyed provider or a self-hosted instance:
see [\`docs/AUDIT.md\`](docs/AUDIT.md).
`;

fs.writeFileSync(path.join(ROOT, 'CREDITS.md'), md);

console.log(`\n${resolved.length}/${results.length} images attributed. Wrote CREDITS.md + public/assets/images/CREDITS.json`);
if (unresolved.length) console.log('Unresolved: ' + unresolved.map((u) => u.slug).join(', '));
