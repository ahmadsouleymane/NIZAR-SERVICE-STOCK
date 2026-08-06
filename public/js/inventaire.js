// public/js/inventaire.js — Inventaire physique / ajustement de stock
var Inventaire = {
  _articleAC: null,

  render: function(container) {
    container.innerHTML =
      '<div class="card">' +
      '<div class="card-header flex-between">' +
      '<h3 class="card-title">Inventaire physique</h3>' +
      '<button class="btn btn-primary" id="btn-new-inventaire">' +
      '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>' +
      ' Nouveau comptage</button>' +
      '</div>' +
      '<p class="text-sm text-muted mb-md">Comptez physiquement un article : le systeme calcule l\'ecart par rapport au stock theorique et ajuste automatiquement le stock (mouvement « Inventaire » trace dans l\'historique).</p>' +
      '<div id="inventaire-table">' + UI.renderSkeleton(6) + '</div>' +
      '</div>';

    this._load();
    document.getElementById('btn-new-inventaire').addEventListener('click', function() { Inventaire._showForm(); });
  },

  _load: function() {
    var self = this;
    API.getInventaires().then(function(data) { self._renderTable(data.inventaires); })
      .catch(function(err) {
        document.getElementById('inventaire-table').innerHTML = '<div class="empty-state"><p>' + UI.escapeHtml(err.message) + '</p></div>';
      });
  },

  _renderTable: function(inventaires) {
    var el = document.getElementById('inventaire-table');
    if (!inventaires || !inventaires.length) { el.innerHTML = UI.renderEmptyState('Aucun comptage effectue', 'Nouveau comptage', '#'); return; }

    var html = '<div class="table-wrapper"><table><thead><tr>' +
      '<th>Date</th><th>Article</th><th>Stock theorique</th><th>Compte</th><th>Ecart</th><th>Notes</th><th>Par</th>' +
      '</tr></thead><tbody>';

    for (var i = 0; i < inventaires.length; i++) {
      var inv = inventaires[i];
      var ecartCls = inv.ecart > 0 ? 'text-success' : (inv.ecart < 0 ? 'text-danger' : 'text-muted');
      var ecartLabel = inv.ecart === 0 ? '0 (exact)' : (inv.ecart > 0 ? '+' + inv.ecart : String(inv.ecart));
      html += '<tr>' +
        '<td>' + UI.formatDate(inv.date_inventaire) + '</td>' +
        '<td><strong>' + UI.escapeHtml(inv.article_nom || '-') + '</strong><br><span class="text-sm text-muted">' + UI.escapeHtml(inv.reference || '') + '</span></td>' +
        '<td>' + inv.stock_theorique + ' ' + UI.escapeHtml(inv.unite || '') + '</td>' +
        '<td><strong>' + inv.quantite_comptee + '</strong> ' + UI.escapeHtml(inv.unite || '') + '</td>' +
        '<td><span class="' + ecartCls + '" style="font-weight:700">' + ecartLabel + '</span></td>' +
        '<td>' + UI.escapeHtml(inv.notes || '-') + '</td>' +
        '<td>' + UI.escapeHtml(inv.username || '-') + '</td>' +
        '</tr>';
    }
    html += '</tbody></table></div>';
    el.innerHTML = html;
  },

  _showForm: function() {
    var self = this;
    API.getArticles().then(function(data) {
      var articles = data.articles;
      self._articleItems = articles.map(function(a) {
        return { id: a.id, label: a.nom, meta: 'Stock theorique: ' + a.stock_actuel + ' ' + a.unite, type: a.type_article };
      });

      var body =
        '<div class="form-group"><label class="form-label">Article *</label><div id="inventaire-art-ac"></div></div>' +
        '<div class="form-group"><label class="form-label">Quantite comptee *</label><input type="number" class="form-input" id="inventaire-qte" value="0" min="0" inputmode="numeric"></div>' +
        '<div class="form-group"><label class="form-label">Notes / observation</label><input type="text" class="form-input" id="inventaire-notes" placeholder="Perte, casse, erreur, etc."></div>';

      UI.modal('Nouveau comptage', body, [
        { label: 'Annuler', cls: 'btn-secondary', callback: function(m) { m.close(); } },
        { label: 'Valider le comptage', cls: 'btn-primary', callback: function(m) { self._save(m); } }
      ]);

      self._articleAC = UI.autocomplete(document.getElementById('inventaire-art-ac'), {
        items: self._articleItems,
        placeholder: 'Rechercher un article...'
      });
    }).catch(function(err) { UI.toast(err.message, 'error'); });
  },

  _save: function(modal) {
    var art = this._articleAC ? this._articleAC.value() : null;
    if (!art) { UI.toast('Selectionnez un article.', 'error'); return; }

    var qte = parseInt(document.getElementById('inventaire-qte').value, 10);
    if (isNaN(qte) || qte < 0) { UI.toast('Quantite comptee invalide.', 'error'); return; }

    var data = {
      article_id: art.id,
      quantite_comptee: qte,
      notes: document.getElementById('inventaire-notes').value.trim() || null
    };

    var self = this;
    API.createInventaire(data)
      .then(function(resp) {
        UI.toast(resp.message || 'Comptage enregistre.', 'success');
        modal.close();
        self._load();
      })
      .catch(function(err) { UI.toast(err.message, 'error'); });
  }
};
