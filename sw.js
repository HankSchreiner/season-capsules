/* Offline support: network-first, falling back to the cached app when offline.
   Online you always get the newest version; offline the last good copy still opens.
   Bump VERSION whenever app files change. */
var VERSION = 'sc-v3';
var SHELL = ['./', 'index.html', 'css/styles.css', 'js/logic.js', 'js/db.js', 'js/lastfm.js', 'js/app.js', 'icon.svg', 'manifest.webmanifest'];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(VERSION).then(function (c) {
    // cache: 'reload' skips the browser's HTTP cache, so we never store a stale copy.
    return c.addAll(SHELL.map(function (u) { return new Request(u, { cache: 'reload' }); }));
  }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== VERSION; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (e) {
  var url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return; // never touch Last.fm calls
  e.respondWith(
    fetch(e.request.url, { cache: 'no-cache' }).then(function (res) {
      if (res.ok) {
        var copy = res.clone();
        caches.open(VERSION).then(function (c) { c.put(e.request, copy); });
      }
      return res;
    }).catch(function () {
      return caches.match(e.request, { ignoreSearch: true }).then(function (hit) {
        return hit || caches.match('index.html');
      });
    })
  );
});
