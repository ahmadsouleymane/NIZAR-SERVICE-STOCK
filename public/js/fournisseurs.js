// public/js/fournisseurs.js
var Fournisseurs = {
  render: function(container) {
    container.innerHTML =
      '<div class="card">' +
      '<div class="card-header">' +
      '<h3 class="card-title">Fournisseurs</h3>' +
      '<button class="btn btn-primary" id="btn-add-fourn">' +
      '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>' +
      ' Ajouter</button>' +
      '</div>' +
      '<div id="fournisseurs-list">' + UI.renderSkeleton(6) + '</div>' +
      '</div>' +
      '<div id="fournisseur-detail" style="display:none"></div>';

    this._load();
    document.getElementById('btn-add-fourn').addEventListener('click', function() { Fournisseurs._showForm(); });
  },

  _load: function() {
    var self = this;
    API.getFournisseurs()
      .then(function(data) { self._renderList(data.fournisseurs); })
      .catch(function(err) {
        document.getElementById('fournisseurs-list').innerHTML = '<div class="empty-state"><h3>Erreur</h3><p>' + UI.escapeHtml(err.message) + '</p></div>';
      });
  },

  _renderList: function(fournisseurs) {
    var el = document.getElementById('fournisseurs-list');
    if (!fournisseurs || !fournisseurs.length) {
      el.innerHTML = UI.renderEmptyState('Aucun fournisseur', 'Ajouter un fournisseur', 'btn-add-fourn');
      return;
    }

    var html = '<div class="table-wrapper"><table><thead><tr>' +
      '<th>Nom</th><th>Contact</th><th>Téléphone</th><th>Email</th><th>Délai</th><th>Articles</th><th>Actions</th>' +
      '</tr></thead><tbody>';

    var self = this;
    for (var i = 0; i < fournisseurs.length; i++) {
      var f = fournisseurs[i];
      html += '<tr>' +
        '<td><strong>' + UI.escapeHtml(f.nom) + '</strong></td>' +
        '<td>' + UI.escapeHtml(f.contact || '-') + '</td>' +
        '<td>' + UI.escapeHtml(f.telephone || '-') + '</td>' +
        '<td>' + (f.email ? '<a href="mailto:' + UI.escapeHtml(f.email) + '">' + UI.escapeHtml(f.email) + '</a>' : '-') + '</td>' +
        '<td>' + (f.delai_moyen_j || '-') + ' j</td>' +
        '<td>' + (f.nb_articles || 0) + '</td>' +
        '<td class="actions">' +
        '<button class="btn btn-sm btn-secondary btn-detail" data-id="' + f.id + '" title="Details">Details</button>' +
        '<button class="btn btn-sm btn-secondary btn-edit-f" data-id="' + f.id + '" title="Modifier">Modifier</button>' +
        '<button class="btn btn-sm btn-danger btn-delete-f" data-id="' + f.id + '" title="Supprimer">Suppr.</button>' +
        '</td>' +
        '</tr>';
    }
    html += '</tbody></table></div>';
    el.innerHTML = html;

    // Bind events
    var btns = el.querySelectorAll('.btn-detail, .btn-edit-f, .btn-delete-f');
    for (var j = 0; j < btns.length; j++) {
      var btn = btns[j];
      btn.addEventListener('click', function() {
        var id = parseInt(this.getAttribute('data-id'));
        if (this.classList.contains('btn-detail')) self._showDetail(id);
        else if (this.classList.contains('btn-edit-f')) self._showForm(id);
        else if (this.classList.contains('btn-delete-f')) self._deleteFournisseur(id);
      });
    }
  },

  _showForm: function(id) {
    var self = this;
    var isEdit = !!id;
    var title = isEdit ? 'Modifier le fournisseur' : 'Ajouter un fournisseur';

    var formHtml =
      '<div class="form-group"><label class="form-label">Nom *</label><input type="text" class="form-input" id="fnom" required></div>' +
      '<div class="form-row">' +
      '<div class="form-group"><label class="form-label">Contact</label><input type="text" class="form-input" id="fcontact"></div>' +
      '<div class="form-group"><label class="form-label">Telephone</label><input type="tel" class="form-input" id="ftel"></div>' +
      '</div>' +
      '<div class="form-row">' +
      '<div class="form-group"><label class="form-label">Email</label><input type="email" class="form-input" id="femail"></div>' +
      '<div class="form-group"><label class="form-label">Delai moyen (jours)</label><input type="number" class="form-input" id="fdelai" value="7" min="1"></div>' +
      '</div>' +
      '<div class="form-group"><label class="form-label">Adresse</label><textarea class="form-textarea" id="fadresse" rows="2"></textarea></div>';

    var modal = UI.modal(title, formHtml, [
      { label: 'Annuler', cls: 'btn-secondary', callback: function(m) { m.close(); } },
      { label: 'Enregistrer', cls: 'btn-primary', callback: function(m) { self._saveFournisseur(m, isEdit, id); } }
    ]);

    if (isEdit) {
      API.getFournisseur(id).then(function(data) {
        var f = data.fournisseur;
        document.getElementById('fnom').value = f.nom;
        document.getElementById('fcontact').value = f.contact || '';
        document.getElementById('ftel').value = f.telephone || '';
        document.getElementById('femail').value = f.email || '';
        document.getElementById('fdelai').value = f.delai_moyen_j || 7;
        document.getElementById('fadresse').value = f.adresse || '';
      }).catch(function(err) { UI.toast(err.message, 'error'); modal.close(); });
    }
  },

  _saveFournisseur: function(modal, isEdit, id) {
    var data = {
      nom: document.getElementById('fnom').value.trim(),
      contact: document.getElementById('fcontact').value.trim() || null,
      telephone: document.getElementById('ftel').value.trim() || null,
      email: document.getElementById('femail').value.trim() || null,
      delai_moyen_j: parseInt(document.getElementById('fdelai').value) || 7,
      adresse: document.getElementById('fadresse').value.trim() || null
    };

    if (!data.nom) { UI.toast('Nom requis.', 'error'); return; }

    var self = this;
    var promise = isEdit ? API.updateFournisseur(id, data) : API.createFournisseur(data);

    promise
      .then(function() {
        UI.toast(isEdit ? 'Fournisseur modifie.' : 'Fournisseur cree.', 'success');
        modal.close();
        self._load();
      })
      .catch(function(err) { UI.toast(err.message, 'error'); });
  },

  _deleteFournisseur: function(id) {
    var self = this;
    UI.confirm('Supprimer ce fournisseur ? Les articles associes ne seront pas supprimes.')
      .then(function(ok) {
        if (!ok) return;
        API.deleteFournisseur(id)
          .then(function() { UI.toast('Fournisseur supprime.', 'success'); self._load(); })
          .catch(function(err) { UI.toast(err.message, 'error'); });
      });
  },

  _showDetail: function(id) {
    var self = this;
    var container = document.getElementById('fournisseur-detail');
    container.innerHTML = UI.renderSkeleton(4);
    container.style.display = 'block';

    API.getFournisseur(id)
      .then(function(data) {
        var f = data.fournisseur;
        var articles = data.articles;
        var commandes = data.commandes;

        var html = '<div class="card">' +
          '<div class="card-header">' +
          '<h3 class="card-title">' + UI.escapeHtml(f.nom) + '</h3>' +
          '<button class="btn btn-secondary btn-sm" id="btn-hide-detail">Fermer</button>' +
          '</div>' +
          '<div class="flex-between" style="margin-bottom:1rem">' +
          '<div><span class="text-sm text-muted">Contact: </span><strong>' + UI.escapeHtml(f.contact || '-') + '</strong></div>' +
          '<div><span class="text-sm text-muted">Tel: </span><strong>' + UI.escapeHtml(f.telephone || '-') + '</strong></div>' +
          '<div><span class="text-sm text-muted">Email: </span>' + (f.email ? '<a href="mailto:' + UI.escapeHtml(f.email) + '">' + UI.escapeHtml(f.email) + '</a>' : '-') + '</div>' +
          '<div><span class="text-sm text-muted">Delai: </span><strong>' + (f.delai_moyen_j || '-') + ' j</strong></div>' +
          '</div>';

        if (f.adresse) {
          html += '<p class="text-sm text-muted mb-md">Adresse: ' + UI.escapeHtml(f.adresse) + '</p>';
        }

        // Articles fournis
        html += '<h4 style="margin-bottom:0.5rem">Articles fournis (' + articles.length + ')</h4>';
        if (articles.length) {
          html += '<div class="table-wrapper"><table><thead><tr><th>Reference</th><th>Nom</th><th>Stock</th><th>Prix</th></tr></thead><tbody>';
          for (var i = 0; i < articles.length; i++) {
            html += '<tr><td>' + UI.escapeHtml(articles[i].reference) + '</td><td>' + UI.escapeHtml(articles[i].nom) + '</td><td>' + articles[i].stock_actuel + '</td><td>' + UI.formatPrice(articles[i].prix_unitaire) + '</td></tr>';
          }
          html += '</tbody></table></div>';
        } else {
          html += '<p class="text-sm text-muted">Aucun article associe.</p>';
        }

        // Dernieres commandes
        html += '<h4 style="margin:1rem 0 0.5rem">Dernieres commandes (' + commandes.length + ')</h4>';
        if (commandes.length) {
          html += '<div class="table-wrapper"><table><thead><tr><th>N°</th><th>Statut</th><th>Date</th></tr></thead><tbody>';
          for (var j = 0; j < commandes.length; j++) {
            html += '<tr><td>#' + commandes[j].id + '</td><td>' + UI.renderBadgeStatut(commandes[j].statut) + '</td><td>' + UI.formatDate(commandes[j].date_commande) + '</td></tr>';
          }
          html += '</tbody></table></div>';
        } else {
          html += '<p class="text-sm text-muted">Aucune commande.</p>';
        }

        html += '</div>';
        container.innerHTML = html;

        document.getElementById('btn-hide-detail').addEventListener('click', function() {
          container.style.display = 'none';
        });
      })
      .catch(function(err) {
        container.innerHTML = '<div class="empty-state"><h3>Erreur</h3><p>' + UI.escapeHtml(err.message) + '</p></div>';
      });
  }
};
