/* ============ installed-app shell ============
   Builds the web-app manifest at runtime and attaches it as a Blob URL, so the
   single-file build stays genuinely self-contained — no manifest.json sitting
   next to it, no network request.

   What this honestly does and does not buy you:
     iOS      Add to Home Screen gives a real standalone launch with the app
              icon and a dark status bar, via the apple-* meta in <head>.
     Android  Chrome will show the icon and name, but a proper installed WebAPK
              plus offline launch needs a service worker, and a service worker
              cannot be registered from a blob:/data: document. So a single
              self-contained file cannot be a fully installable PWA.
   Either way every cold start re-downloads the whole bundle: there is no cache
   layer here, by design.                                                     */
'use strict';

const PWA = (() => {
  function iconUrl(size) {
    // in the single-file build these resolve to data URIs
    return assetUrl(`assets/ui/app-${size}.png`);
  }

  function attachManifest() {
    try {
      const m = {
        name: 'Hourling',
        short_name: 'Hourling',
        description: 'An idle RPG powered by the hours you practise.',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#101529',
        theme_color: '#101529',
        // start_url / scope / id are deliberately omitted so they fall back to
        // the document URL — this file gets served from several hosts
        icons: [192, 512].map(s => ({
          src: iconUrl(s), sizes: `${s}x${s}`, type: 'image/png', purpose: 'any',
        })),
      };
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(m)], { type: 'application/manifest+json' }));
      const link = document.createElement('link');
      link.rel = 'manifest';
      link.href = url;
      document.head.appendChild(link);
    } catch (e) { /* a missing manifest costs nothing at runtime */ }
  }

  /* standalone launches get the safe-area padding; browser tabs do not need it */
  function markStandalone() {
    const standalone = window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true;
    if (standalone) document.documentElement.dataset.standalone = '1';
  }

  function hideBoot() {
    const b = document.getElementById('boot');
    if (!b) return;
    b.classList.add('gone');
    setTimeout(() => b.remove(), 420);
  }

  function init() {
    attachManifest();
    markStandalone();
  }

  return { init, hideBoot };
})();
