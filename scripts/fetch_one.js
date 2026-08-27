// Search Commons for an image of a subject, download the first good result.
const { execSync } = require('child_process');
const fs = require('fs');
const UA = 'PokharaTourismApp/1.0';
const slug = process.argv[2];
const term = process.argv[3];
const dest = `/home/uzu/code/vibecoding/tourism/public/assets/images/${slug}.jpg`;

const apiUrl = 'https://commons.wikimedia.org/w/api.php?format=json&action=query&generator=search&gsrsearch=' +
  encodeURIComponent(term) + '&gsrnamespace=6&gsrlimit=10&prop=imageinfo&iiprop=url%7Cmime&iiurlwidth=1280';
const apiRes = JSON.parse(execSync(`curl -s --max-time 30 -A '${UA}' '${apiUrl}'`, { encoding: 'utf8' }));
const pages = Object.values((apiRes.query && apiRes.query.pages) || {});
const cand = pages.filter((p) => p.imageinfo && /^image\/(jpeg|jpg|png)$/.test(p.imageinfo[0].mime || ''))
  .map((p) => (p.imageinfo[0].thumburl || p.imageinfo[0].url).split('?')[0]);

if (!cand.length) { console.log('no candidates for', term); process.exit(1); }
for (const url of cand) {
  execSync(`curl -sL --max-time 60 -A '${UA}' '${url}' -o '${dest}'`);
  if (fs.statSync(dest).size > 6000) { console.log(`${slug}: OK ${fs.statSync(dest).size} bytes`); process.exit(0); }
}
console.log(`${slug}: ALL CANDIDATES FAILED`);
