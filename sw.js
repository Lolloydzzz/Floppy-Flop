// Service worker: lets the game be installed. Online it always loads the newest files; offline it uses saved copies.
const CACHE = "ff-v3";
const FILES = ["./", "index.html", "style.css", "social.css", "social2.css", "extras.css", "skins.js", "avatars.js",
  "game.js", "social.js", "social2.js", "admin.js", "extras.js", "groups.js", "robot.js", "extras2.js",
  "manifest.webmanifest", "icon-192.png", "icon-512.png"];
self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).catch(() => {}));
  self.skipWaiting();
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const r = e.request;
  if (r.method !== "GET" || new URL(r.url).origin !== location.origin) return;   // Firebase calls go straight to the network
  e.respondWith(
    fetch(r).then(res => { const copy = res.clone(); caches.open(CACHE).then(c => c.put(r, copy)); return res; })
      .catch(() => caches.match(r, { ignoreSearch: true }))
  );
});
