import { chromium } from 'playwright';
const BASE = process.env.BASE_URL || 'http://localhost:3000';
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newContext({ viewport: { width: 390, height: 844 } }).then(c => c.newPage());
  const found = [];
  await page.goto(BASE + '/map', { waitUntil: 'networkidle', timeout: 30000 });
  for (let i = 0; i < 10; i++) {
    await page.waitForTimeout(500);
    const t = await page.evaluate(() => {
      const el = document.getElementById('toast');
      return el ? { text: el.textContent, show: el.classList.contains('show') } : null;
    });
    if (t && t.text) found.push(`${(i + 1) * 500}ms: "${t.text}" show=${t.show}`);
  }
  console.log('toast observations:', found.length ? found.join(' | ') : 'none');
  await browser.close();
})();
