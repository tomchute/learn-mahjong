import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));

// Emits dist/sw.js after every build: precaches the whole built site so the
// app is playable fully offline (installed-PWA use case, e.g. on a flight).
// The cache name is a hash of all built file contents, so any rebuild rolls
// browsers over to the new version on their next online visit.
function serviceWorkerPlugin(): Plugin {
  return {
    name: 'generate-service-worker',
    apply: 'build',
    closeBundle() {
      const dist = join(ROOT, 'dist');
      const walk = (dir: string): string[] =>
        readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
          e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)],
        );
      const files = walk(dist)
        .map((f) => relative(dist, f).split('\\').join('/'))
        .filter((f) => f !== 'sw.js' && f !== 'learn-mahjong-offline.html')
        .sort();
      const hash = createHash('sha256');
      for (const f of files) hash.update(f).update(readFileSync(join(dist, f)));
      const assets = ['./', ...files.map((f) => './' + f)];
      const sw = `// Generated at build time by vite.config.ts — do not edit.
const CACHE = 'learn-mahjong-${hash.digest('hex').slice(0, 12)}';
const ASSETS = ${JSON.stringify(assets)};

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  if (new URL(req.url).origin !== location.origin) return;

  if (req.mode === 'navigate') {
    // Network-first with a short timeout so a dead or captive-portal network
    // (airplane wifi) still lands on the cached app quickly. The cached copy
    // is only ever refreshed by a new build installing a new cache.
    e.respondWith(
      Promise.race([
        fetch(req),
        new Promise((_, rej) => setTimeout(rej, 3000, new Error('timeout'))),
      ]).catch(() => caches.match('./index.html', { cacheName: CACHE, ignoreVary: true }))
        .then((res) => res || fetch(req)),
    );
    return;
  }

  // Everything else: cache-first (all build assets are precached; hashed
  // filenames make staleness impossible), fill the cache on miss. ignoreVary:
  // servers send 'Vary: Origin' on assets, which would defeat matching for
  // cors-mode module-script requests against the no-cors precached entries.
  e.respondWith(
    caches.match(req, { ignoreSearch: true, ignoreVary: true }).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        }),
    ),
  );
});
`;
      writeFileSync(join(dist, 'sw.js'), sw);
      console.log(`generated dist/sw.js (${assets.length} precached files)`);
    },
  };
}

// base './' so the built app works from any static host path (incl. GitHub Pages)
export default defineConfig({
  base: './',
  plugins: [react(), serviceWorkerPlugin()],
  server: { host: true },
});
