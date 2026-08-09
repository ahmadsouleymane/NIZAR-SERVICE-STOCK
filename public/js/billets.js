// public/js/billets.js — Billets en circulation par article numéroté
var Billets = {
  render: function(container) {
    container.innerHTML =
      '<div class="card">' +
      '<div class="card-header flex-between">' +
      '<h3 class="card-title">Billets en circulation</h3>' +
      '<button class="btn btn-secondary btn-sm" id="btn-billets-refresh">Actualiser</button>' +
      '</div>' +
      '<p class="text-sm text-muted mb-md">Par article numéroté (billets, carnets, bons) : émis, envoyés aux agences, retournés (usage ou remis en stock), et encore au siège. <strong>Clic sur une ligne pour plus de details.</strong></p>' +
      '<div id="billets-summary" class="mb-md"></div>' +
      '<div id="billets-table">' + UI.renderSkeleton(6) + '</div>' +
      '<div class="card mt-md"><div class="card-header"><h3 class="card-title">Vue par localité — Qui a reçu quoi ?</h3></div>' +
      '<div id="billets-localite">' + UI.renderSkeleton(4) + '</div></div>' +
      '</div>';

    this._load();
    document.getElementById('btn-billets-refresh').addEventListener('click', function() { Billets._load(); });
  },

  _load: function() {
    var self = this;
    API.getBillets()
      .then(function(data) {
        self._renderSummary(data.billets || []);
        self._renderTable(data.billets);
        if (data.parLocalite && data.parLocalite.length) self._renderParLocalite(data.parLocalite);
      })
      .catch(function(err) {
        document.getElementById('billets-table').innerHTML = '<div class="empty-state"><p>' + UI.escapeHtml(err.message) + '</p></div>';
      });
  },

  _renderParLocalite: function(rows) {
    var el = document.getElementById('billets-localite');
    if (!el) return;
    var html = '<div class="table-wrapper"><table><thead><tr>' +
      '<th>Article</th><th>Localité</th><th>Total envoyé</th></tr></thead><tbody>';
    for (var i = 0; i < rows.length; i++) {
      html += '<tr><td><strong>' + UI.escapeHtml(rows[i].article_nom) + '</strong></td>' +
        '<td>' + UI.escapeHtml(rows[i].localite_nom) + '</td>' +
        '<td>' + rows[i].total_envoye + '</td></tr>';
    }
    html += '</tbody></table></div>';
    el.innerHTML = html;
  },

  _renderSummary: function(billets) {
    var el = document.getElementById('billets-summary');
    if (!el) return;
    var totalEmis = 0, totalEnvoye = 0, totalRetour = 0, totalCirc = 0;
    for (var i = 0; i < billets.length; i++) {
      totalEmis += Number(billets[i].total_emis) || 0;
      totalEnvoye += Number(billets[i].total_envoye) || 0;
      totalRetour += Number(billets[i].total_retour_usage) || 0;
      totalCirc += (Number(billets[i].total_envoye) || 0) - (Number(billets[i].total_retour_usage) || 0);
    }
    el.innerHTML = '<div class="kpi-grid">' +
      '<div class="kpi-card"><div class="kpi-card-header"><span>Articles suivis</span></div><div class="kpi-card-value">' + billets.length + '</div></div>' +
      '<div class="kpi-card"><div class="kpi-card-header"><span>Total émis</span></div><div class="kpi-card-value">' + totalEmis + '</div></div>' +
      '<div class="kpi-card"><div class="kpi-card-header"><span>Envoyés en agence</span></div><div class="kpi-card-value">' + totalEnvoye + '</div></div>' +
      '<div class="kpi-card"><div class="kpi-card-header"><span>En circulation</span></div><div class="kpi-card-value' + (totalCirc > 0 ? ' danger' : ' success') + '">' + totalCirc + '</div></div>' +
      '</div>';
  },

  _renderTable: function(billets) {
    var el = document.getElementById('billets-table');
    if (!billets || !billets.length) {
      el.innerHTML = UI.renderEmptyState('Aucun article numéroté', 'Tableau de bord', 'dashboard');
      return;
    }

    var html = '<div class="table-wrapper"><table><thead><tr>' +
      '<th></th><th>Article</th><th>Émis</th><th>Envoyé</th><th>Usage</th><th>R. stock</th><th>Stock</th><th>Circ.</th><th>Dernier envoi</th><th>Localités</th>' +
      '</tr></thead><tbody>';

    for (var i = 0; i < billets.length; i++) {
      var b = billets[i];
      var circulation = (Number(b.total_envoye) || 0) - (Number(b.total_retour_usage) || 0);
      var circCls = circulation > 0 ? 'text-warning' : 'text-success';
      html += '<tr class="bil-row" data-idx="' + i + '" style="cursor:pointer">' +
        '<td><span class="expand-icon">▶</span></td>' +
        '<td><strong>' + UI.escapeHtml(b.nom) + '</strong><br><span class="text-sm text-muted">' + UI.escapeHtml(b.reference) + '</span></td>' +
        '<td>' + (b.total_emis || 0) + '</td>' +
        '<td>' + (b.total_envoye || 0) + '</td>' +
        '<td>' + (b.total_retour_usage || 0) + '</td>' +
        '<td>' + (b.total_retour_stock || 0) + '</td>' +
        '<td>' + UI.renderStockBadge(b.stock_actuel, b.stock_min) + ' <strong>' + b.stock_actuel + '</strong></td>' +
        '<td><span class="' + circCls + '" style="font-weight:700">' + circulation + '</span></td>' +
        '<td class="text-sm">' + UI.formatDate(b.dernier_envoi) + '</td>' +
        '<td class="text-sm">' + UI.escapeHtml(b.localites_envoyees || '-') + '</td>' +
        '</tr><tr class="bil-detail" id="bil-detail-' + i + '" style="display:none"><td colspan="10">' +
        '<div style="background:var(--color-muted);padding:12px;border-radius:8px;font-size:0.875rem">' +
        '<strong>Total émis :</strong> ' + (b.total_emis || 0) + ' | ' +
        '<strong>Envoyé :</strong> ' + (b.total_envoye || 0) + ' | ' +
        '<strong>Retourné usage :</strong> ' + (b.total_retour_usage || 0) + ' | ' +
        '<strong>Retourné en stock :</strong> ' + (b.total_retour_stock || 0) + ' | ' +
        '<strong>En circulation :</strong> <span class="' + circCls + '">' + circulation + '</span><br>' +
        (b.localites_envoyees ? '<strong>Localités destinataires :</strong> ' + UI.escapeHtml(b.localites_envoyees) + '<br>' : '') +
        (b.dernier_envoi ? '<strong>Dernier envoi :</strong> ' + UI.formatDate(b.dernier_envoi) + '<br>' : '') +
        '<strong>Unité :</strong> ' + UI.escapeHtml(UI.uniteLabel(b.unite)) +
        '</div></td></tr>';
    }
    html += '</tbody></table></div>';
    el.innerHTML = html;

    // Click to expand/collapse
    el.querySelectorAll('.bil-row').forEach(function(row) {
      row.addEventListener('click', function() {
        var idx = this.dataset.idx;
        var detail = document.getElementById('bil-detail-' + idx);
        var icon = this.querySelector('.expand-icon');
        if (detail.style.display === 'none') {
          detail.style.display = '';
          icon.textContent = '▼';
        } else {
          detail.style.display = 'none';
          icon.textContent = '▶';
        }
      });
    });
  }
};
