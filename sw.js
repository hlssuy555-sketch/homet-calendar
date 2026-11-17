/* 아침 7시 홈트 달력 — service worker (앱 셸 캐시 + data.json 네트워크 우선) */
var CACHE = 'homet-calendar-v4';
var ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './fallback.js',
  './manifest.json',
  './icon.svg',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) { return c.addAll(ASSETS); }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) { return k === CACHE ? null : caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);

  // data.json 은 항상 최신을 먼저 시도하고, 실패하면 캐시로
  if (url.pathname.indexOf('data.json') > -1) {
    e.respondWith(
      fetch(req).then(function (res) {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put('./data.json', copy); });
        return res;
      }).catch(function () { return caches.match('./data.json'); })
    );
    return;
  }

  // 앱 셸은 네트워크 우선(업데이트가 바로 반영), 오프라인이면 캐시
  e.respondWith(
    fetch(req).then(function (res) {
      if (res && res.status === 200 && url.origin === location.origin) {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(req, copy); });
      }
      return res;
    }).catch(function () {
      return caches.match(req).then(function (hit) { return hit || caches.match('./index.html'); });
    })
  );
});
