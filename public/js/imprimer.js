// public/js/imprimer.js — Page d'impression d'un bon de reception
// Charge le PDF authentifie (fetch + blob, le token n'est jamais expose dans l'URL)
// puis l'affiche dans l'iframe et ouvre la boite d'impression.

(function() {
  'use strict';
  var params = new URLSearchParams(location.search);
  var id = params.get('id');
  var token = localStorage.getItem('nizar_token');

  function showError(msg) {
    var loading = document.getElementById('loading');
    if (loading) loading.innerHTML = '<span style="color:#DC2626">' + msg + '</span>';
  }

  if (!id || !token) { showError('Bon de réception introuvable ou session expirée.'); return; }

  // Charger le PDF du modele (avec les donnees) puis l'imprimer directement
  fetch('/api/fiches/' + id + '/pdf', { headers: { 'Authorization': 'Bearer ' + token } })
    .then(function(r) { if (!r.ok) throw new Error('Erreur ' + r.status); return r.blob(); })
    .then(function(blob) {
      var url = URL.createObjectURL(blob);
      var frame = document.getElementById('pdf-frame');
      var loading = document.getElementById('loading');
      frame.src = url;
      frame.style.display = 'block';
      if (loading) loading.style.display = 'none';
      // Laisser le temps au PDF de s'afficher puis ouvrir la boite d'impression
      setTimeout(function() {
        try { frame.contentWindow.print(); } catch (e) { /* ignore */ }
      }, 900);
    })
    .catch(function(err) {
      showError('Impossible de charger le PDF : ' + err.message);
    });

  document.getElementById('btn-print').addEventListener('click', function() {
    var frame = document.getElementById('pdf-frame');
    try { frame.contentWindow.print(); } catch (e) { /* ignore */ }
  });
})();
