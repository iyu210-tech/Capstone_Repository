/* Offline copy of the site, for revising on a train or with the Wi-Fi off.
 *
 * Network first, always. server.py's comments explain the bug this site has
 * already had once: a cached script served against newer markup, quietly
 * behaving like last week's build. A cache-first worker would bring that bug
 * back permanently, so the cache here is only ever the fallback - online, every
 * request goes to the network and the copy is just refreshed on the way past.
 *
 * Only same-origin GETs are touched. Supabase and the sign-in library are
 * cross-origin and pass straight through: offline, sign-in is simply off.
 */
var CACHE = "ib-hl-v1";

// The shell a first offline visit needs. Topic pages and anything else are
// added as they are visited.
var CORE = [
  "./",
  "index.html",
  "style.css",
  "topics.js",
  "demos.js",
  "app.js",
  "nav.js",
  "share.js",
  "progress.js",
  "auth-config.js",
  "auth.js",
  "404.html",
  "icon.svg",
  "manifest.webmanifest"
];

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CACHE).then(function (cache) {
      // One missing file must not abort the whole install, or a single
      // renamed script would switch offline support off without a word.
      return Promise.all(CORE.map(function (url) {
        return cache.add(new Request(url, { cache: "reload" })).catch(function () {});
      }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE; })
        .map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function (event) {
  var req = event.request;
  if (req.method !== "GET") return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(req).then(function (res) {
      if (res.ok && res.type === "basic") {
        var copy = res.clone();
        caches.open(CACHE).then(function (cache) { cache.put(req, copy); });
      }
      return res;
    }).catch(function () {
      // Query strings carry demo setups and searches, not different files,
      // so an offline ?setup=... link still finds the cached page.
      return caches.match(req, { ignoreSearch: true }).then(function (hit) {
        if (hit) return hit;
        if (req.mode === "navigate") return caches.match("index.html");
        return Response.error();
      });
    })
  );
});
