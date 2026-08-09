// public/js/sw-register.js — PWA : enregistrement du service worker (cache statique, offline)
if ('serviceWorker' in navigator) {
  window.addEventListener('load', function() {
    navigator.serviceWorker.register('/sw.js').catch(function(err) {
      console.warn('Service worker non enregistre:', err);
    });
  });
}
