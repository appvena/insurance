/* Service worker — Vehicle Protection
   PENTING: naikkan VERSION setiap kali ada file yang diubah,
   supaya HP/PC yang sudah memasang aplikasi mendapat versi baru. */
const VERSION = "ai-v1.5.3";
const SHELL = [
  "./", "./index.html", "./manifest.json",
  "./css/style.css", "./js/app.js", "./js/config.js", "./js/data.js",
  "./icons/icon-192.png", "./icons/icon-512.png", "./icons/maskable-512.png",
  "./icons/apple-touch-icon.png", "./icons/favicon-32.png"
];
const CDN = [
  "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js",
  "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js",
  "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js",
  "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js"
];
const CDN_HOSTS = ["cdnjs.cloudflare.com", "www.gstatic.com", "fonts.googleapis.com", "fonts.gstatic.com"];

self.addEventListener("install", e => {
  e.waitUntil((async () => {
    const c = await caches.open(VERSION);
    await c.addAll(SHELL);
    await Promise.all(CDN.map(u => c.add(u).catch(() => {})));
  })());
});

self.addEventListener("activate", e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== VERSION) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener("message", e => { if (e.data === "SKIP_WAITING") self.skipWaiting(); });

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Halaman: jaringan dulu, cache bila offline.
  if (req.mode === "navigate") {
    e.respondWith((async () => {
      try {
        const res = await fetch(req);
        if (res.ok) (await caches.open(VERSION)).put("./index.html", res.clone());
        return res;
      } catch {
        return (await caches.match("./index.html")) || (await caches.match("./")) || Response.error();
      }
    })());
    return;
  }

  // File aplikasi, library, dan font: cache dulu, diperbarui di belakang layar.
  if (url.origin === self.location.origin || CDN_HOSTS.includes(url.hostname)) {
    e.respondWith((async () => {
      const c = await caches.open(VERSION);
      const hit = await c.match(req, { ignoreSearch: url.origin === self.location.origin });
      const net = fetch(req).then(res => {
        if (res && (res.ok || res.type === "opaque")) c.put(req, res.clone());
        return res;
      }).catch(() => null);
      return hit || (await net) || Response.error();
    })());
  }
  // Permintaan lain langsung ke jaringan.
});
