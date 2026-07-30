// Builds dist/learn-mahjong-offline.html: the entire app inlined into one
// self-contained HTML file that can be downloaded to a phone/laptop and
// opened directly from local storage — no server, no network. Runs after
// `vite build` (wired into the npm build script) so the file also deploys
// with the site and is downloadable from there.
import { readFileSync, writeFileSync } from 'fs';

const DIST = 'dist';
let html = readFileSync(`${DIST}/index.html`, 'utf8');

// Inline the module script. `</script` inside JS would end the inline tag
// early; escaping it as `<\/script` is a no-op in strings/regexes/comments,
// the only places it can legally appear.
html = html.replace(
  /<script type="module"[^>]*src="\.\/(assets\/[^"]+\.js)"><\/script>/,
  (_, src) => {
    const js = readFileSync(`${DIST}/${src}`, 'utf8')
      .replaceAll('</script', '<\\/script')
      .replaceAll('<!--', '<\\!--');
    return `<script type="module">${js}</script>`;
  },
);

// Inline the stylesheet.
html = html.replace(/<link rel="stylesheet"[^>]*href="\.\/(assets\/[^"]+\.css)"[^>]*>/, (_, href) => {
  const css = readFileSync(`${DIST}/${href}`, 'utf8').replaceAll('</style', '<\\/style');
  return `<style>${css}</style>`;
});

// Drop references that only make sense on the hosted site.
html = html
  .replace(/\s*<link rel="manifest"[^>]*>/, '')
  .replace(/\s*<link rel="apple-touch-icon"[^>]*>/, '');

for (const leftover of html.matchAll(/(src|href)="\.\/(assets|icons)\/[^"]+"/g)) {
  throw new Error(`offline build still references an external file: ${leftover[0]}`);
}

writeFileSync(`${DIST}/learn-mahjong-offline.html`, html);
// Also keep a committed copy at the repo root so it can be downloaded straight
// from GitHub even when Pages/Actions are unavailable.
writeFileSync('learn-mahjong-offline.html', html);
const kb = Math.round(Buffer.byteLength(html) / 1024);
console.log(`wrote learn-mahjong-offline.html (${kb} KB, fully self-contained) to dist/ and repo root`);
