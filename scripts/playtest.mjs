import { chromium } from 'playwright';

const SHOTS = 'shots';
import { mkdirSync } from 'fs';
mkdirSync(SHOTS, { recursive: true });

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

await page.goto('http://localhost:4173/');
await page.waitForTimeout(700);
await page.screenshot({ path: `${SHOTS}/01-start.png` });

// open tutorial
await page.getByText('Read the rules first').click();
await page.waitForTimeout(400);
await page.screenshot({ path: `${SHOTS}/02-tutorial-guide.png` });
await page.getByText('Tiles', { exact: true }).click();
await page.waitForTimeout(300);
await page.screenshot({ path: `${SHOTS}/03-tutorial-tiles.png` });
await page.getByText('Scoring', { exact: true }).click();
await page.waitForTimeout(300);
await page.screenshot({ path: `${SHOTS}/04-tutorial-scoring.png` });
await page.locator('.modal-head .icon-btn').click();

// start game
await page.getByText('Sit down & play').click();
await page.waitForTimeout(800);

// click through first-time onboarding if present
for (let i = 0; i < 8; i++) {
  const ob = page.locator('.onboarding');
  if (!(await ob.count())) break;
  if (i === 0) await page.screenshot({ path: `${SHOTS}/05a-onboarding.png` });
  const next = page.locator('.onboarding .btn-primary');
  await next.click();
  await page.waitForTimeout(250);
}
await page.waitForTimeout(600);
await page.screenshot({ path: `${SHOTS}/05-table-initial.png` });

// Let the game run; interact when it's our turn or a claim is offered.
let shots = 6;
for (let i = 0; i < 240; i++) {
  await page.waitForTimeout(500);

  // hand-end modal? (has both a Review and a Next-hand button — take primary)
  const nextHand = page.locator('.hand-end-modal .btn-primary');
  if (await nextHand.count()) {
    await page.screenshot({ path: `${SHOTS}/${String(shots++).padStart(2, '0')}-hand-end.png` });
    await nextHand.click();
    continue;
  }
  const matchEnd = page.locator('.match-end-modal');
  if (await matchEnd.count()) {
    await page.screenshot({ path: `${SHOTS}/${String(shots++).padStart(2, '0')}-match-end.png` });
    break;
  }
  // claim bar?
  const claim = page.locator('.claim-bar .btn').first();
  if (await claim.count()) {
    await page.screenshot({ path: `${SHOTS}/${String(shots++).padStart(2, '0')}-claim.png` });
    await claim.click(); // take the first (best) option
    continue;
  }
  // win button?
  const winBtn = page.locator('.btn-win');
  if (await winBtn.count()) {
    await page.screenshot({ path: `${SHOTS}/${String(shots++).padStart(2, '0')}-win-available.png` });
    await winBtn.first().click();
    continue;
  }
  // our turn? tap first tile twice (select then discard) — crude but fine
  const active = page.locator('.rack-active');
  if (await active.count()) {
    const tiles = page.locator('.rack .tile');
    const n = await tiles.count();
    if (n > 0) {
      const idx = Math.floor(Math.random() * n);
      await tiles.nth(idx).click();
      await page.waitForTimeout(150);
      await tiles.nth(idx).click();
    }
  }
  if (i === 20) await page.screenshot({ path: `${SHOTS}/06-midgame.png` });
}
await page.screenshot({ path: `${SHOTS}/99-final.png` });

console.log('ERRORS:', errors.length ? errors.slice(0, 10) : 'none');
await browser.close();
