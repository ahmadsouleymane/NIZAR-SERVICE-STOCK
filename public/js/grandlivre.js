// public/js/grandlivre.js — Grand livre chronologique (date/heure, article, entree, sortie, stock reel)
var GrandLivre = {
  render: function(container) {
    container.innerHTML =
      '<div class="card">' +
      '<div class="card-header flex-between">' +
      '<h3 class="card-title">Grand livre</h3>' +
      '<a id="btn-export-journal" class="btn btn-secondary btn-sm" href="#">Exporter (Excel)</a>' +
      '</div>' +
      '<div class="filter-bar">' +
      '<select class="form-select" id="journal-article"><option value="">Tous les articles</option></select>' +
      '<input type="date" class="form-input" id="journal-debut">' +
      '<input type="date" class="form-input" id="journal-fin">' +
      '<button class="btn btn-secondary btn-sm" id="btn-journal-refresh">Filtrer</button>' +
      '</div>' +
      '<p class="text-sm text-muted mb-md">Historique chronologique de tous les mouvements, avec le stock reel apres chaque operation (comme un releve).</p>' +
      '<div id="journal-table">' + UI.renderSkeleton(8) + '</div>' +
      '</div>';

    this._loadArticles();
    this._load();
    this._bindEvents();
  },

  _bindEvents: function() {
    var self = this;
    document.getElementById('journal-article').addEventListener('change', function() { self._load(); });
    document.getElementById('btn-journal-refresh').addEventListener('click', function() { self._load(); });
    document.getElementById('btn-export-journal').addEventListener('click', function(e) {
      e.preventDefault();
      self._export();
    });
  },

  _loadArticles: function() {
    API.getArticles().then(function(data) {
      var sel = document.getElementById('journal-article');
      for (var i = 0; i < data.articles.length; i++) {
        var opt = document.createElement('option');
        opt.value = data.articles[i].id;
        opt.textContent = data.articles[i].nom;
        sel.appendChild(opt);
      }
    }).catch(function() {});
  },

  _currentParams: function() {
    var params = {};
    var art = document.getElementById('journal-article').value;
    var debut = document.getElementById('journal-debut').value;
    var fin = document.getElementById('journal-fin').value;
    if (art) params.article_id = art;
    if (debut) params.debut = debut;
    if (fin) params.fin = fin;
    return params;
  },

  _currentExportUrl: function() {
    return API.getJournalExportUrl(this._currentParams());
  },

  _export: function() {
    // L'export est protege par un header Authorization (Bearer) : un simple
    // window.open ne le transmettrait pas. On reutilise le helper authentifie.
    API.downloadRapport(this._currentExportUrl(), 'grand-livre.xlsx')
      .then(function() { UI.toast('Export téléchargé.', 'success'); })
      .catch(function() { UI.toast('Erreur lors du téléchargement.', 'danger'); });
  },

  _load: function() {
    var self = this;
    API.getJournal(this._currentParams()).then(function(data) { self._renderTable(data.lignes); })
      .catch(function(err) {
        document.getElementById('journal-table').innerHTML = '<div class="empty-state"><p>' + UI.escapeHtml(err.message) + '</p></div>';
      });
  },

  _renderTable: function(lignes) {
    var el = document.getElementById('journal-table');
    if (!lignes || !lignes.length) { el.innerHTML = UI.renderEmptyState('Aucun mouvement sur cette periode'); return; }

    var html = '<div class="table-wrapper"><table><thead><tr>' +
      '<th>Date/heure</th><th>Article</th><th>Entree</th><th>Sortie</th><th>Stock reel</th>' +
      '</tr></thead><tbody>';

    for (var i = 0; i < lignes.length; i++) {
      var l = lignes[i];
      html += '<tr>' +
        '<td>' + UI.formatDate(l.date) + '</td>' +
        '<td>' + UI.escapeHtml(l.article_nom || '-') + '</td>' +
        '<td>' + (l.entree ? '<span class="text-success">+' + l.entree + '</span>' : '-') + '</td>' +
        '<td>' + (l.sortie ? '<span class="text-danger">-' + l.sortie + '</span>' : '-') + '</td>' +
        '<td><strong>' + l.stock_reel + '</strong> ' + UI.escapeHtml(UI.uniteLabel(l.unite)) + '</td>' +
        '</tr>';
    }
    html += '</tbody></table></div>';
    el.innerHTML = html;
  }
};
