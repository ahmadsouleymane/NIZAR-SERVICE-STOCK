// public/js/inventaire.js — Inventaire physique / ajustement de stock
var Inventaire = {
  _articleAC: null,

  render: function(container) {
    container.innerHTML =
      '<div class="card">' +
      '<div class="card-header flex-between">' +
      '<h3 class="card-title">Comptage</h3>' +
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
    if (!inventaires || !inventaires.length) { el.innerHTML = UI.renderEmptyState('Aucun comptage effectue', 'Nouveau comptage', 'btn-new-inventaire'); return; }

    var self = this;
    var html = '<div class="table-wrapper"><table><thead><tr>' +
      '<th>Date</th><th>Article</th><th>Stock theorique</th><th>Compte</th><th>Ecart</th><th>Notes</th><th>Par</th><th>Actions</th>' +
      '</tr></thead><tbody>';

    for (var i = 0; i < inventaires.length; i++) {
      var inv = inventaires[i];
      var ecartCls = inv.ecart > 0 ? 'text-success' : (inv.ecart < 0 ? 'text-danger' : 'text-muted');
      var ecartLabel = inv.ecart === 0 ? '0 (exact)' : (inv.ecart > 0 ? '+' + inv.ecart : String(inv.ecart));
      var actions = '';
      if (UI.isAdmin()) {
        actions = '<button class="btn btn-sm btn-secondary btn-edit-inv" data-id="' + inv.id + '" data-qte="' + inv.quantite_comptee + '" data-notes="' + UI.escapeHtml(inv.notes || '') + '" data-nom="' + UI.escapeHtml(inv.article_nom || '') + '">Modifier</button>' +
          '<button class="btn btn-sm btn-danger btn-del-inv" data-id="' + inv.id + '">Suppr.</button>';
      } else if (UI.isAssistant()) {
        actions = '<button class="btn btn-sm btn-secondary btn-demande-inv" data-id="' + inv.id + '" data-nom="' + UI.escapeHtml(inv.article_nom || '') + '">Demander modif/suppr.</button>';
      }
      html += '<tr>' +
        '<td>' + UI.formatDate(inv.date_inventaire) + '</td>' +
        '<td><strong>' + UI.escapeHtml(inv.article_nom || '-') + '</strong><br><span class="text-sm text-muted">' + UI.escapeHtml(inv.reference || '') + '</span></td>' +
        '<td>' + inv.stock_theorique + ' ' + UI.escapeHtml(UI.uniteLabel(inv.unite)) + '</td>' +
        '<td><strong>' + inv.quantite_comptee + '</strong> ' + UI.escapeHtml(UI.uniteLabel(inv.unite)) + '</td>' +
        '<td><span class="' + ecartCls + '" style="font-weight:700">' + ecartLabel + '</span></td>' +
        '<td>' + UI.escapeHtml(inv.notes || '-') + '</td>' +
        '<td>' + UI.escapeHtml(inv.username || '-') + '</td>' +
        '<td class="actions">' + actions + '</td>' +
        '</tr>';
    }
    html += '</tbody></table></div>';
    el.innerHTML = html;

    el.querySelectorAll('.btn-edit-inv').forEach(function(b) {
      b.addEventListener('click', function() { self._showEditForm(parseInt(this.dataset.id, 10), parseInt(this.dataset.qte, 10), this.dataset.notes || '', this.dataset.nom || ''); });
    });
    el.querySelectorAll('.btn-del-inv').forEach(function(b) {
      b.addEventListener('click', function() { self._deleteInventaire(parseInt(this.dataset.id, 10)); });
    });
    el.querySelectorAll('.btn-demande-inv').forEach(function(b) {
      b.addEventListener('click', function() {
        var id = parseInt(this.dataset.id, 10); var nom = this.dataset.nom || '';
        var label = 'Comptage — ' + nom;
        UI.modal('Demande sur ' + UI.escapeHtml(label), '<p class="text-sm text-muted mb-sm">Que souhaitez-vous demander à l\'administrateur ?</p>', [
          { label: 'Annuler', cls: 'btn-secondary', callback: function(m) { m.close(); } },
          { label: 'Modification', cls: 'btn-primary', callback: function(m) { m.close(); UI.demanderAdmin('modification', 'comptage', id, label); } },
          { label: 'Suppression', cls: 'btn-danger', callback: function(m) { m.close(); UI.demanderAdmin('suppression', 'comptage', id, label); } }
        ]);
      });
    });
  },

  _showEditForm: function(id, qte, notes, nom) {
    var self = this;
    var html = '<p class="text-sm text-muted mb-sm">' + UI.escapeHtml(nom) + '</p>' +
      '<div class="form-group"><label class="form-label">Quantité comptée *</label><input type="number" class="form-input" id="inv-edit-qte" min="0" value="' + qte + '"></div>' +
      '<div class="form-group"><label class="form-label">Notes</label><input type="text" class="form-input" id="inv-edit-notes" value="' + UI.escapeHtml(notes) + '"></div>' +
      '<p class="text-sm text-muted">Le stock sera réajusté selon le nouvel écart.</p>';
    UI.modal('Modifier le comptage', html, [
      { label: 'Annuler', cls: 'btn-secondary', callback: function(m) { m.close(); } },
      { label: 'Enregistrer', cls: 'btn-primary', callback: function(m) {
        var q = parseInt(document.getElementById('inv-edit-qte').value, 10);
        if (isNaN(q) || q < 0) { UI.toast('Quantité invalide.', 'error'); return; }
        API.updateInventaire(id, { quantite_comptee: q, notes: document.getElementById('inv-edit-notes').value.trim() || null })
          .then(function() { UI.toast('Comptage modifié, stock réajusté.', 'success'); m.close(); self._load(); })
          .catch(function(err) { UI.toast(err.message, 'error'); });
      } }
    ]);
  },

  _deleteInventaire: function(id) {
    var self = this;
    UI.confirm('Supprimer ce comptage ? Le stock sera rétabli (annulation de l\'écart).').then(function(ok) {
      if (!ok) return;
      API.deleteInventaire(id).then(function() { UI.toast('Comptage supprimé, stock rétabli.', 'success'); self._load(); }).catch(function(err) { UI.toast(err.message, 'error'); });
    });
  },

  _showForm: function() {
    var self = this;
    API.getArticles().then(function(data) {
      var articles = data.articles;
      self._articleItems = articles.map(function(a) {
        return { id: a.id, label: a.nom, meta: 'Stock theorique: ' + a.stock_actuel + ' ' + UI.uniteLabel(a.unite), type: a.type_article };
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
