// Registers the offline service worker (generated into dist/ at build time).
// Skipped in dev (no sw.js), from file:// (the single-file offline build),
// and in browsers without SW support.
export function registerServiceWorker(): void {
  if (!import.meta.env.PROD) return;
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  if (location.protocol === 'file:') return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      // Offline play is a progressive enhancement; the app works without it.
    });
  });
}
