// public/js/mouvements.js
var Mouvements = {
  render: function(container) {
    var today = new Date().toISOString().split('T')[0];
    var lastMonth = new Date();
    lastMonth.setMonth(lastMonth.getMonth() - 1);
    var lastMonthStr = lastMonth.toISOString().split('T')[0];

    container.innerHTML =
      '<div class="card">' +
      '<div class="card-header">' +
      '<h3 class="card-title">Historique des mouvements</h3>' +
      '</div>' +
      '<div class="filter-bar">' +
      '<input type="date" class="form-input" id="filtre-debut" value="' + lastMonthStr + '" style="min-width:140px">' +
      '<input type="date" class="form-input" id="filtre-fin" value="' + today + '" style="min-width:140px">' +
      '<select class="form-select" id="filtre-type"><option value="">Tous types</option><option value="entree">Entrees</option><option value="sortie">Sorties</option></select>' +
      '<button class="btn btn-secondary btn-sm" id="btn-refresh">Actualiser</button>' +
      '</div>' +
      '<div id="mouvements-summary" class="summary-box">' +
      '<div class="summary-item">Entrees: <strong id="sum-entrees">-</strong></div>' +
      '<div class="summary-item">Sorties: <strong id="sum-sorties">-</strong></div>' +
      '<div class="summary-item">Solde: <strong id="sum-solde">-</strong></div>' +
      '</div>' +
      '<div id="mouvements-table">' + UI.renderSkeleton(10) + '</div>' +
      '</div>';

    this._loadMouvements();
    this._bindEvents();
  },

  _bindEvents: function() {
    var self = this;
    document.getElementById('btn-refresh').addEventListener('click', function() { self._loadMouvements(); });
    document.getElementById('filtre-type').addEventListener('change', function() { self._loadMouvements(); });
  },

  _loadMouvements: function() {
    var self = this;
    var params = {
      debut: document.getElementById('filtre-debut').value,
      fin: document.getElementById('filtre-fin').value
    };
    var type = document.getElementById('filtre-type').value;
    if (type) params.type = type;

    API.getMouvements(params)
      .then(function(data) {
        self._renderTable(data.mouvements);
        document.getElementById('sum-entrees').textContent = UI.formatNumber(data.totals.total_entrees);
        document.getElementById('sum-sorties').textContent = UI.formatNumber(data.totals.total_sorties);
        var solde = data.totals.total_entrees - data.totals.total_sorties;
        var soldeEl = document.getElementById('sum-solde');
        soldeEl.textContent = UI.formatNumber(solde);
        soldeEl.className = solde >= 0 ? 'text-success' : 'text-danger';
      })
      .catch(function(err) {
        document.getElementById('mouvements-table').innerHTML = '<div class="empty-state"><h3>Erreur</h3><p>' + UI.escapeHtml(err.message) + '</p></div>';
      });
  },

  _renderTable: function(mvts) {
    var el = document.getElementById('mouvements-table');
    if (!mvts || !mvts.length) {
      el.innerHTML = UI.renderEmptyState('Aucun mouvement sur cette periode');
      return;
    }

    var html = '<div class="table-wrapper"><table><thead><tr>' +
      '<th>Date</th><th>Article</th><th>Type</th><th>Qté</th><th>Motif</th><th>Demandeur</th><th>Fournisseur</th><th>Saisi par</th>' +
      '</tr></thead><tbody>';

    for (var i = 0; i < mvts.length; i++) {
      var m = mvts[i];
      html += '<tr>' +
        '<td>' + UI.formatDate(m.date) + '</td>' +
        '<td><strong>' + UI.escapeHtml(m.article_nom || '-') + '</strong><br><span class="text-sm text-muted">' + UI.escapeHtml(m.article_reference || '') + '</span></td>' +
        '<td><span class="badge ' + (m.type === 'entree' ? 'badge-success' : 'badge-warning') + '">' + (m.type === 'entree' ? 'Entree' : 'Sortie') + '</span></td>' +
        '<td><strong>' + m.quantite + '</strong></td>' +
        '<td>' + UI.escapeHtml(m.motif || '-') + '</td>' +
        '<td>' + UI.escapeHtml(m.demandeur || '-') + '</td>' +
        '<td>' + UI.escapeHtml(m.fournisseur_nom || '-') + '</td>' +
        '<td>' + UI.escapeHtml(m.username || '-') + '</td>' +
        '</tr>';
    }
    html += '</tbody></table></div>';
    el.innerHTML = html;
  },

};
