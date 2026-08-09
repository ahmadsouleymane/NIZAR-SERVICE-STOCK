// public/js/grandlivre.js — Inventaire simplifie : totaux sorties / entrees / stock reel par article,
// avec detail chronologique (grand livre) au clic sur une ligne.
var GrandLivre = {
  _lignes: [],

  render: function(container) {
    container.innerHTML =
      '<div class="card">' +
      '<div class="card-header flex-between">' +
      '<h3 class="card-title">Inventaire</h3>' +
      '<a id="btn-export-journal" class="btn btn-secondary btn-sm" href="#">Exporter (Excel)</a>' +
      '</div>' +
      '<p class="text-sm text-muted mb-md">Totaux d\'entrées, de sorties et de stock réel par article. <strong>Cliquez sur une ligne</strong> pour voir le détail chronologique.</p>' +
      '<div id="inv-summary" class="mb-md"></div>' +
      '<div id="journal-table">' + UI.renderSkeleton(8) + '</div>' +
      '</div>';

    this._load();
    document.getElementById('btn-export-journal').addEventListener('click', function(e) {
      e.preventDefault();
      GrandLivre._export();
    });
  },

  _currentExportUrl: function() {
    return API.getJournalExportUrl({});
  },

  _export: function() {
    // L'export est protege par un header Authorization (Bearer) : un simple
    // window.open ne le transmettrait pas. On reutilise le helper authentifie.
    API.downloadRapport(this._currentExportUrl(), 'inventaire.xlsx')
      .then(function() { UI.toast('Export téléchargé.', 'success'); })
      .catch(function() { UI.toast('Erreur lors du téléchargement.', 'danger'); });
  },

  _load: function() {
    var self = this;
    API.getMouvementsResume()
      .then(function(data) {
        self._lignes = data.lignes || [];
        self._renderSummary(data.totaux || {});
        self._renderTable(self._lignes);
      })
      .catch(function(err) {
        document.getElementById('journal-table').innerHTML = '<div class="empty-state"><p>' + UI.escapeHtml(err.message) + '</p></div>';
      });
  },

  _renderSummary: function(totaux) {
    var el = document.getElementById('inv-summary');
    el.innerHTML = '<div class="kpi-grid">' +
      '<div class="kpi-card"><div class="kpi-card-header"><span>Total entrées</span></div><div class="kpi-card-value success">' + (totaux.total_entrees || 0) + '</div></div>' +
      '<div class="kpi-card"><div class="kpi-card-header"><span>Total sorties</span></div><div class="kpi-card-value danger">' + (totaux.total_sorties || 0) + '</div></div>' +
      '<div class="kpi-card"><div class="kpi-card-header"><span>Stock réel</span></div><div class="kpi-card-value">' + (totaux.stock_reel || 0) + '</div></div>' +
      '</div>';
  },

  _renderTable: function(lignes) {
    var el = document.getElementById('journal-table');
    if (!lignes || !lignes.length) { el.innerHTML = UI.renderEmptyState('Aucun article'); return; }

    var html = '<div class="table-wrapper"><table><thead><tr>' +
      '<th></th><th>Article</th><th>Entrées</th><th>Sorties</th><th>Stock réel</th>' +
      '</tr></thead><tbody>';

    for (var i = 0; i < lignes.length; i++) {
      var l = lignes[i];
      html += '<tr class="inv-row" data-idx="' + i + '" style="cursor:pointer">' +
        '<td><span class="expand-icon">▶</span></td>' +
        '<td><strong>' + UI.escapeHtml(l.article_nom) + '</strong> <span class="text-sm text-muted">' + UI.escapeHtml(l.reference) + '</span></td>' +
        '<td><span class="text-success">+' + l.total_entrees + '</span></td>' +
        '<td><span class="text-danger">-' + l.total_sorties + '</span></td>' +
        '<td>' + UI.renderStockBadge(l.stock_actuel, l.stock_min) + ' <strong>' + l.stock_actuel + '</strong> ' + UI.escapeHtml(UI.uniteLabel(l.unite)) + '</td>' +
        '</tr><tr class="inv-detail" id="inv-detail-' + i + '" style="display:none"><td colspan="5">' +
        '<div id="inv-detail-body-' + i + '" style="padding:0.5rem 0">' + UI.renderSkeleton(3) + '</div></td></tr>';
    }
    html += '</tbody></table></div>';
    el.innerHTML = html;

    var self = this;
    el.querySelectorAll('.inv-row').forEach(function(row) {
      row.addEventListener('click', function() {
        var idx = this.dataset.idx;
        var detail = document.getElementById('inv-detail-' + idx);
        var icon = this.querySelector('.expand-icon');
        var opening = detail.style.display === 'none';
        detail.style.display = opening ? '' : 'none';
        icon.textContent = opening ? '▼' : '▶';
        if (opening) self._loadDetail(idx);
      });
    });
  },

  _loadDetail: function(idx) {
    var l = this._lignes[idx];
    if (!l) return;
    API.getJournal({ article_id: l.article_id })
      .then(function(data) {
        var body = document.getElementById('inv-detail-body-' + idx);
        if (!body) return;
        var lignes = data.lignes || [];
        if (!lignes.length) { body.innerHTML = '<p class="text-sm text-muted">Aucun mouvement.</p>'; return; }
        var html = '<div class="table-wrapper"><table><thead><tr><th>Date/heure</th><th>Entrée</th><th>Sortie</th><th>Stock réel</th><th>Destination / Fournisseur</th><th>Bon</th><th>Saisi par</th></tr></thead><tbody>';
        for (var i = 0; i < lignes.length; i++) {
          var m = lignes[i];
          html += '<tr>' +
            '<td>' + UI.formatDate(m.date) + '</td>' +
            '<td>' + (m.entree ? '<span class="text-success">+' + m.entree + '</span>' : '-') + '</td>' +
            '<td>' + (m.sortie ? '<span class="text-danger">-' + m.sortie + '</span>' : '-') + '</td>' +
            '<td><strong>' + m.stock_reel + '</strong></td>' +
            '<td>' + UI.escapeHtml(m.lieu || '-') + '</td>' +
            '<td class="text-sm">' + UI.escapeHtml(m.fiche_reference || '-') + '</td>' +
            '<td class="text-sm">' + UI.escapeHtml(m.username || '-') + '</td>' +
            '</tr>';
        }
        html += '</tbody></table></div>';
        body.innerHTML = html;
      })
      .catch(function() {
        var body = document.getElementById('inv-detail-body-' + idx);
        if (body) body.innerHTML = '<p class="text-sm text-danger">Erreur de chargement.</p>';
      });
  }
};
