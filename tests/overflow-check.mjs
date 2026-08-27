import { chromium } from 'playwright';
const BASE = process.env.BASE_URL || 'http://localhost:3000';
const pages = ['/', '/destinations', '/map', '/login', '/profile'];
const viewports = [
  { name: 'iphone-390x844', width: 390, height: 844 },
  { name: 'small-360x740', width: 360, height: 740 },
];
(async () => {
  const browser = await chromium.launch();
  let problems = 0;
  for (const vp of viewports) {
    for (const path of pages) {
      const page = await (await browser.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: true, hasTouch: true })).newPage();
      await page.goto(BASE + path, { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
      await page.waitForTimeout(1400);
      const r = await page.evaluate(() => {
        const vh = window.innerHeight, vw = window.innerWidth;
        // horizontal overflow?
        const xOver = document.documentElement.scrollWidth - vw;
        // find any element whose right edge exceeds viewport (horizontal spill)
        let hSpill = 0;
        document.querySelectorAll('*').forEach((el) => {
          const b = el.getBoundingClientRect();
          if (b.width > 0 && b.right > vw + 1) hSpill = Math.max(hSpill, Math.round(b.right - vw));
        });
        // does the first "screen" of content fit? check key sections
        return { vw, vh, xOver, hSpill };
      });
      const bad = r.xOver > 1 || r.hSpill > 1;
      if (bad) problems++;
      console.log(`${vp.name} ${path.padEnd(14)} xOver=${r.xOver} hSpill=${r.hSpill} ${bad ? '❌' : '✅'}`);
      await page.close();
    }
  }
  console.log(problems === 0 ? '\n✅ NO HORIZONTAL OVERFLOW ANYWHERE' : `\n❌ ${problems} page(s) have overflow`);
  await browser.close();
})();
