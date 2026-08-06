// public/js/rapports.js
var Rapports = {
  render: function(container) {
    var today = new Date().toISOString().split('T')[0];
    var lastMonth = new Date();
    lastMonth.setMonth(lastMonth.getMonth() - 1);
    var lastMonthStr = lastMonth.toISOString().split('T')[0];

    container.innerHTML =
      '<div class="kpi-grid" style="grid-template-columns:repeat(auto-fit,minmax(280px,1fr));margin-bottom:1.5rem">' +
      // Carte 1: Etat du stock
      '<div class="card">' +
      '<h4 style="margin-bottom:0.75rem;display:flex;align-items:center;gap:0.5rem">' +
      '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent)" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>' +
      'État du stock</h4>' +
      '<p class="text-sm text-muted" style="margin-bottom:1rem">Export complet de tous les articles avec leur stock actuel, statut et fournisseur.</p>' +
      '<button class="btn btn-primary btn-full" id="btn-export-stock">Télécharger Excel</button>' +
      '</div>' +
      // Carte 2: Historique mouvements
      '<div class="card">' +
      '<h4 style="margin-bottom:0.75rem;display:flex;align-items:center;gap:0.5rem">' +
      '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent)" stroke-width="2"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 014-4h14"/></svg>' +
      'Historique mouvements</h4>' +
      '<div class="form-row mb-md">' +
      '<div class="form-group"><label class="form-label text-sm">Du</label><input type="date" class="form-input" id="rpt-debut" value="' + lastMonthStr + '"></div>' +
      '<div class="form-group"><label class="form-label text-sm">Au</label><input type="date" class="form-input" id="rpt-fin" value="' + today + '"></div>' +
      '</div>' +
      '<button class="btn btn-primary btn-full" id="btn-export-mouvements">Télécharger Excel</button>' +
      '</div>' +
      // Carte 3: Consommation
      '<div class="card">' +
      '<h4 style="margin-bottom:0.75rem;display:flex;align-items:center;gap:0.5rem">' +
      '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent)" stroke-width="2"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>' +
      'Consommation par article</h4>' +
      '<div class="form-row mb-md">' +
      '<div class="form-group"><label class="form-label text-sm">Du</label><input type="date" class="form-input" id="conso-debut" value="' + lastMonthStr + '"></div>' +
      '<div class="form-group"><label class="form-label text-sm">Au</label><input type="date" class="form-input" id="conso-fin" value="' + today + '"></div>' +
      '</div>' +
      '<button class="btn btn-primary btn-full" id="btn-export-conso">Télécharger Excel</button>' +
      '</div>' +
      // Carte 4: Sorties par agence
      '<div class="card">' +
      '<h4 style="margin-bottom:0.75rem;display:flex;align-items:center;gap:0.5rem">' +
      '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent)" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>' +
      'Sorties par agence</h4>' +
      '<p class="text-sm text-muted" style="margin-bottom:1rem">Regroupement des sorties par localité sur la période : nombre, quantité et valeur estimée.</p>' +
      '<div class="form-row mb-md">' +
      '<div class="form-group"><label class="form-label text-sm">Du</label><input type="date" class="form-input" id="agence-debut" value="' + lastMonthStr + '"></div>' +
      '<div class="form-group"><label class="form-label text-sm">Au</label><input type="date" class="form-input" id="agence-fin" value="' + today + '"></div>' +
      '</div>' +
      '<button class="btn btn-primary btn-full" id="btn-export-agence">Télécharger Excel</button>' +
      '</div>' +
      // Carte 5: Etat du stock PDF
      '<div class="card">' +
      '<h4 style="margin-bottom:0.75rem;display:flex;align-items:center;gap:0.5rem">' +
      '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent)" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><polyline points="12 18 12 12"/><polyline points="9 15 12 12 15 15"/></svg>' +
      'État du stock (PDF)</h4>' +
      '<p class="text-sm text-muted" style="margin-bottom:1rem">Document A4 imprimable avec la valeur totale du stock en bas de page.</p>' +
      '<button class="btn btn-primary btn-full" id="btn-export-stock-pdf">Télécharger PDF</button>' +
      '</div>' +
      '</div>';

    this._bindEvents();
  },

  _bindEvents: function() {
    document.getElementById('btn-export-stock').addEventListener('click', function() {
      API.downloadRapport(API.getRapportStockUrl(), 'etat-du-stock.xlsx')
        .then(function() { UI.toast('Export termine.', 'success'); })
        .catch(function(err) { UI.toast('Erreur export: ' + err.message, 'error'); });
    });

    document.getElementById('btn-export-mouvements').addEventListener('click', function() {
      var debut = document.getElementById('rpt-debut').value;
      var fin = document.getElementById('rpt-fin').value;
      var params = {};
      if (debut) params.debut = debut;
      if (fin) params.fin = fin;
      API.downloadRapport(API.getRapportMouvementsUrl(params), 'historique-mouvements.xlsx')
        .then(function() { UI.toast('Export termine.', 'success'); })
        .catch(function(err) { UI.toast('Erreur export: ' + err.message, 'error'); });
    });

    document.getElementById('btn-export-conso').addEventListener('click', function() {
      var debut = document.getElementById('conso-debut').value;
      var fin = document.getElementById('conso-fin').value;
      var params = {};
      if (debut) params.debut = debut;
      if (fin) params.fin = fin;
      API.downloadRapport(API.getRapportConsommationUrl(params), 'consommation.xlsx')
        .then(function() { UI.toast('Export termine.', 'success'); })
        .catch(function(err) { UI.toast('Erreur export: ' + err.message, 'error'); });
    });

    document.getElementById('btn-export-agence').addEventListener('click', function() {
      var debut = document.getElementById('agence-debut').value;
      var fin = document.getElementById('agence-fin').value;
      var params = {};
      if (debut) params.debut = debut;
      if (fin) params.fin = fin;
      API.downloadRapport(API.getRapportSortiesAgenceUrl(params), 'sorties-par-agence.xlsx')
        .then(function() { UI.toast('Export termine.', 'success'); })
        .catch(function(err) { UI.toast('Erreur export: ' + err.message, 'error'); });
    });

    document.getElementById('btn-export-stock-pdf').addEventListener('click', function() {
      API.downloadRapport(API.getRapportStockPdfUrl(), 'etat-du-stock.pdf')
        .then(function() { UI.toast('PDF genere.', 'success'); })
        .catch(function(err) { UI.toast('Erreur export: ' + err.message, 'error'); });
    });
  }
};
