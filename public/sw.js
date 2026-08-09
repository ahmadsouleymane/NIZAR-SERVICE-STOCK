// public/sw.js — Service Worker Nizar Stock
// Strategie NETWORK-FIRST : on sert toujours la derniere version des fichiers
// (l'app change souvent), le cache ne sert qu'en secours hors-ligne.
// Version de cache incrementee a chaque deploiement pour purger l'ancien.
var CACHE_NAME = 'nizar-stock-v7';
var STATIC_ASSETS = [
  '/',
  '/index.html',
  '/css/app.css',
  '/css/imprimer.css',
  '/js/api.js',
  '/js/ui.js',
  '/js/app.js',
  '/js/dashboard.js',
  '/js/articles.js',
  '/js/mouvements.js',
  '/js/fiches.js',
  '/js/fiches_besoin.js',
  '/js/entrees.js',
  '/js/retours.js',
  '/js/souches.js',
  '/js/inventaire.js',
  '/js/grandlivre.js',
  '/js/reportui.js',
  '/js/rapports.js',
  '/js/parametres.js',
  '/js/trends.js',
  '/js/alertes.js',
  '/js/globalsearch.js',
  '/js/billets.js',
  '/js/wake.js',
  '/js/imprimer.js',
  '/imprimer.html',
  '/manifest.json'
];

// Chart.js servi par CDN — mis en cache avec stale-while-revalidate pour l'offline
var CHART_CDN = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js';

// Install : pre-cacher les assets de base
self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(STATIC_ASSETS);
    }).catch(function() { /* certains fichiers peuvent manquer a l'install */ })
  );
  self.skipWaiting();
});

// Activate : purger les anciens caches
self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(key) { return key !== CACHE_NAME; })
          .map(function(key) { return caches.delete(key); })
      );
    })
  );
  self.clients.claim();
});

// Fetch : network-first pour le meme-origine (toujours frais), cache en secours.
self.addEventListener('fetch', function(event) {
  var request = event.request;
  var url = new URL(request.url);

  // Chart.js CDN : stale-while-revalidate (disponible offline après le premier chargement)
  if (url.href === CHART_CDN || (url.origin === 'https://cdn.jsdelivr.net' && url.pathname.indexOf('chart.js@4') !== -1)) {
    event.respondWith(
      fetch(request).then(function(response) {
        if (response && response.status === 200) {
          var clone = response.clone();
          caches.open(CACHE_NAME).then(function(cache) { cache.put(request, clone); });
        }
        return response;
      }).catch(function() {
        return caches.match(request).then(function(cached) {
          return cached || new Response('', { status: 504, headers: { 'Content-Type': 'text/plain' } });
        });
      })
    );
    return;
  }

  // Laisse les autres origines (Google Fonts, etc.) au navigateur
  if (url.origin !== location.origin) return;

  // Les API restent network-first sans cache (donnees toujours fraiches)
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/uploads/')) {
    event.respondWith(
      fetch(request).catch(function() {
        return new Response(JSON.stringify({ error: 'Hors-ligne.' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' }
        });
      })
    );
    return;
  }

  // GET statiques : network-first, on met a jour le cache en parallele
  if (request.method === 'GET') {
    event.respondWith(
      fetch(request).then(function(response) {
        if (response && response.status === 200) {
          var clone = response.clone();
          caches.open(CACHE_NAME).then(function(cache) { cache.put(request, clone); });
        }
        return response;
      }).catch(function() {
        return caches.match(request).then(function(cached) {
          return cached || new Response('', { status: 504, headers: { 'Content-Type': 'text/plain' } });
        });
      })
    );
    return;
  }

  // Autres methodes : reseau
  event.respondWith(fetch(request));
});
