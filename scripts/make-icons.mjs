// One-off generator for the PWA icons in public/icons/ (committed to the repo).
// Renders the app's tile mark on a felt-green field at each required size.
import { chromium } from 'playwright';
import { mkdirSync, readdirSync } from 'fs';

const OUT = 'public/icons';
mkdirSync(OUT, { recursive: true });

const chromeDir = readdirSync('/opt/pw-browsers').find((d) => /^chromium-\d+$/.test(d));
const browser = await chromium.launch({
  executablePath: `/opt/pw-browsers/${chromeDir}/chrome-linux/chrome`,
});

// Tile occupies the central ~55% so the maskable variant survives circular crops.
const html = `<!doctype html><html><body style="margin:0">
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" style="display:block;width:100vw;height:100vh">
  <defs>
    <radialGradient id="felt" cx="50%" cy="42%" r="75%">
      <stop offset="0%" stop-color="#3f7359"/>
      <stop offset="100%" stop-color="#2c5441"/>
    </radialGradient>
  </defs>
  <rect width="100" height="100" fill="url(#felt)"/>
  <rect x="24.5" y="21.5" width="51" height="60" rx="7" fill="#00000055"/>
  <rect x="23" y="19" width="51" height="60" rx="7" fill="#e8ddca"/>
  <rect x="23" y="19" width="51" height="54" rx="7" fill="#fffdf5"/>
  <text x="48.5" y="60" font-size="34" font-weight="700" text-anchor="middle"
        font-family="'Noto Sans CJK SC','PingFang SC',sans-serif" fill="#c0392b">中</text>
</svg></body></html>`;

for (const size of [512, 192, 180]) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(html);
  await page.waitForTimeout(300); // font load
  await page.screenshot({ path: `${OUT}/icon-${size}.png` });
  await page.close();
  console.log(`wrote ${OUT}/icon-${size}.png`);
}
await browser.close();
