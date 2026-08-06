// public/js/billets.js — Billets en circulation par article numéroté
var Billets = {
  render: function(container) {
    container.innerHTML =
      '<div class="card">' +
      '<div class="card-header flex-between">' +
      '<h3 class="card-title">Billets en circulation</h3>' +
      '<button class="btn btn-secondary btn-sm" id="btn-billets-refresh">Actualiser</button>' +
      '</div>' +
      '<p class="text-sm text-muted mb-md">Par article numéroté : billets émis, envoyés aux agences, retournés (usage ou remis en stock), et encore au siège.</p>' +
      '<div id="billets-table">' + UI.renderSkeleton(6) + '</div>' +
      '</div>';

    this._load();
    document.getElementById('btn-billets-refresh').addEventListener('click', function() { Billets._load(); });
  },

  _load: function() {
    var self = this;
    API.getBillets()
      .then(function(data) { self._renderTable(data.billets); })
      .catch(function(err) {
        document.getElementById('billets-table').innerHTML = '<div class="empty-state"><p>' + UI.escapeHtml(err.message) + '</p></div>';
      });
  },

  _renderTable: function(billets) {
    var el = document.getElementById('billets-table');
    if (!billets || !billets.length) {
      el.innerHTML = UI.renderEmptyState('Aucun article numéroté', 'Tableau de bord', 'dashboard');
      return;
    }

    var html = '<div class="table-wrapper"><table><thead><tr>' +
      '<th>Article</th><th>Émis</th><th>Envoyé</th><th>Retourné usage</th><th>Retourné stock</th><th>En stock</th><th>En circulation</th>' +
      '</tr></thead><tbody>';

    for (var i = 0; i < billets.length; i++) {
      var b = billets[i];
      var circulation = (Number(b.total_envoye) || 0) - (Number(b.total_retour_usage) || 0);
      var circCls = circulation > 0 ? 'text-warning' : 'text-success';
      html += '<tr>' +
        '<td><strong>' + UI.escapeHtml(b.nom) + '</strong><br><span class="text-sm text-muted">' + UI.escapeHtml(b.reference) + '</span></td>' +
        '<td>' + (b.total_emis || 0) + '</td>' +
        '<td>' + (b.total_envoye || 0) + '</td>' +
        '<td>' + (b.total_retour_usage || 0) + '</td>' +
        '<td>' + (b.total_retour_stock || 0) + '</td>' +
        '<td>' + UI.renderStockBadge(b.stock_actuel, b.stock_min) + ' <strong>' + b.stock_actuel + '</strong></td>' +
        '<td><span class="' + circCls + '" style="font-weight:700">' + circulation + '</span></td>' +
        '</tr>';
    }
    html += '</tbody></table></div>';
    el.innerHTML = html;
  }
};
