import { chromium } from 'playwright';
const BASE = process.env.BASE_URL || 'http://localhost:3000';

async function getToken(page) {
  const u = 'navtest_' + Math.random().toString(36).slice(2, 8);
  const res = await page.evaluate(async (uname) => {
    const r = await fetch('/api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: uname, email: uname + '@x.com', password: 'Password1' }) });
    const j = await r.json(); return j.token;
  }, u);
  return res;
}

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  let failures = 0;

  // --- not signed in ---
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  const hamVisible = await page.locator('.hamburger').isVisible();
  await page.locator('.hamburger').click();
  await page.waitForTimeout(500);
  const drawerVisible = await page.locator('.nav-drawer').isVisible();
  const loginBtn = await page.locator('.nav-drawer-account >> text=Log in').count();
  // close via backdrop
  await page.locator('.nav-drawer-backdrop').click({ position: { x: 10, y: 10 } });
  await page.waitForTimeout(900);
  const drawerClosed = !(await page.locator('.nav-drawer').isVisible());
  console.log(`[logged-out] hamburger=${hamVisible} drawer=${drawerVisible} loginBtn=${loginBtn>0} closesOnBackdrop=${drawerClosed}`);
  if (!(hamVisible && drawerVisible && loginBtn > 0 && drawerClosed)) failures++;

  // --- signed in: avatar button + profile/logout in drawer ---
  const token = await getToken(page);
  await page.evaluate((t) => { localStorage.setItem('pt_token', t); localStorage.setItem('pt_user', JSON.stringify({ username: 'navtester', email: 'nav@x.com' })); }, token);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  const avatarBtn = await page.locator('.nav-avatar-btn').isVisible();
  await page.locator('.nav-avatar-btn').click();
  await page.waitForTimeout(500);
  const profileBtn = await page.locator('.nav-drawer-account >> text=My profile').count();
  const logoutBtn = await page.locator('.nav-drawer-account >> text=Log out').count();
  const drawerX = await page.locator('.nav-drawer').boundingBox();
  // drawer should be pinned to the right edge (x close to viewport width 390)
  const nearRight = drawerX && (drawerX.x + drawerX.width) > 380;
  console.log(`[logged-in] avatarBtn=${avatarBtn} profileBtn=${profileBtn>0} logoutBtn=${logoutBtn>0} anchoredRight=${nearRight}`);
  if (!(avatarBtn && profileBtn > 0 && logoutBtn > 0 && nearRight)) failures++;
  await page.screenshot({ path: 'tests/shots/mobile-drawer-open.png' });

  console.log(`\n${failures === 0 ? '✅ MOBILE NAV DRAWER PASSED' : `❌ ${failures} issue(s)`}`);
  await browser.close();
  process.exit(failures === 0 ? 0 : 1);
})();
