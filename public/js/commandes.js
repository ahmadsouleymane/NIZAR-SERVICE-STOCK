// public/js/commandes.js
var Commandes = {
  _lignes: [],

  render: function(container) {
    container.innerHTML =
      '<div class="card">' +
      '<div class="card-header">' +
      '<h3 class="card-title">Commandes fournisseurs</h3>' +
      '<div class="flex-between gap-sm">' +
      '<button class="btn btn-secondary" id="btn-auto-cmd" title="Generer une commande a partir des articles en alerte"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg> Commande auto</button>' +
      '<button class="btn btn-primary" id="btn-add-cmd">' +
      '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>' +
      ' Nouvelle commande</button>' +
      '</div>' +
      '</div>' +
      '<div class="filter-bar">' +
      '<select class="form-select" id="filtre-statut">' +
      '<option value="tous">Tous statuts</option>' +
      '<option value="brouillon">Brouillon</option>' +
      '<option value="envoyee">Envoyée</option>' +
      '<option value="recue">Reçue</option>' +
      '<option value="annulee">Annulée</option>' +
      '</select>' +
      '</div>' +
      '<div id="commandes-table">' + UI.renderSkeleton(6) + '</div>' +
      '</div>';

    this._load();
    this._bindEvents();
  },

  _bindEvents: function() {
    var self = this;
    document.getElementById('btn-add-cmd').addEventListener('click', function() { self._showCreateForm(); });
    document.getElementById('btn-auto-cmd').addEventListener('click', function() { self._showCommandeAuto(); });
    document.getElementById('filtre-statut').addEventListener('change', function() { self._load(); });
  },

  // Genere une commande brouillon a partir des articles sous le seuil minimum.
  // Quantite suggeree = de quoi remonter au double du seuil : 2*stock_min - stock_actuel.
  _showCommandeAuto: function() {
    var self = this;
    API.getArticles({ alerte: '1' }).then(function(data) {
      if (!data.articles.length) { UI.toast('Aucun article sous le seuil minimum. Stock OK.', 'success'); return; }

      var lignes = data.articles.map(function(a) {
        var qte = Math.max(1, a.stock_min * 2 - a.stock_actuel);
        return { article_id: a.id, quantite: qte, prix_unitaire: a.prix_unitaire || 0 };
      });

      UI.toast('Commande pre-remplie avec ' + lignes.length + ' article(s) en alerte.', 'info');
      self._showCreateForm(null, lignes);
    }).catch(function(err) { UI.toast(err.message, 'error'); });
  },

  _load: function() {
    var self = this;
    var statut = document.getElementById('filtre-statut').value;
    var params = {};
    if (statut && statut !== 'tous') params.statut = statut;

    API.getCommandes(params)
      .then(function(data) { self._renderTable(data.commandes); })
      .catch(function(err) {
        document.getElementById('commandes-table').innerHTML = '<div class="empty-state"><h3>Erreur</h3><p>' + UI.escapeHtml(err.message) + '</p></div>';
      });
  },

  _renderTable: function(commandes) {
    var el = document.getElementById('commandes-table');
    if (!commandes || !commandes.length) {
      el.innerHTML = UI.renderEmptyState('Aucune commande', 'Nouvelle commande', '#');
      return;
    }

    var html = '<div class="table-wrapper"><table><thead><tr>' +
      '<th>N°</th><th>Fournisseur</th><th>Date</th><th>Statut</th><th>Lignes</th><th>Total</th><th>Actions</th>' +
      '</tr></thead><tbody>';

    var self = this;
    for (var i = 0; i < commandes.length; i++) {
      var c = commandes[i];
      html += '<tr>' +
        '<td><strong>#' + c.id + '</strong></td>' +
        '<td>' + UI.escapeHtml(c.fournisseur_nom || '-') + '</td>' +
        '<td>' + UI.formatDate(c.date_commande) + '</td>' +
        '<td>' + UI.renderBadgeStatut(c.statut) + '</td>' +
        '<td>' + (c.nb_lignes || 0) + '</td>' +
        '<td>' + UI.formatPrice(c.total || 0) + '</td>' +
        '<td class="actions">' +
        '<button class="btn btn-sm btn-info btn-detail-cmd" data-id="' + c.id + '" title="Details">Details</button>';

      if (c.statut === 'brouillon') {
        html += '<button class="btn btn-sm btn-info btn-envoyer" data-id="' + c.id + '" title="Envoyer">Envoyer</button>' +
          '<button class="btn btn-sm btn-secondary btn-edit-cmd" data-id="' + c.id + '" title="Modifier">Modifier</button>';
      }
      if (c.statut === 'envoyee') {
        html += '<button class="btn btn-sm btn-success btn-recevoir" data-id="' + c.id + '" title="Marquer reçue">Reçue</button>';
      }
      if (c.statut !== 'recue') {
        html += '<button class="btn btn-sm btn-warning btn-annuler" data-id="' + c.id + '" title="Annuler" style="color:#000">Annuler</button>';
      }
      if (c.statut !== 'recue') {
        html += '<button class="btn btn-sm btn-danger btn-delete-cmd" data-id="' + c.id + '" title="Supprimer">Suppr.</button>';
      }

      html += '</td></tr>';
    }
    html += '</tbody></table></div>';
    el.innerHTML = html;

    // Bind events
    ['btn-detail-cmd', 'btn-envoyer', 'btn-recevoir', 'btn-annuler', 'btn-delete-cmd', 'btn-edit-cmd'].forEach(function(cls) {
      var btns = el.querySelectorAll('.' + cls);
      for (var j = 0; j < btns.length; j++) {
        btns[j].addEventListener('click', function() {
          var id = parseInt(this.getAttribute('data-id'));
          if (this.classList.contains('btn-detail-cmd')) self._showDetail(id);
          else if (this.classList.contains('btn-envoyer')) self._changeStatut(id, 'envoyee');
          else if (this.classList.contains('btn-recevoir')) self._changeStatut(id, 'recue');
          else if (this.classList.contains('btn-annuler')) self._changeStatut(id, 'annulee');
          else if (this.classList.contains('btn-delete-cmd')) self._deleteCommande(id);
          else if (this.classList.contains('btn-edit-cmd')) self._showCreateForm(id);
        });
      }
    });
  },

  _changeStatut: function(id, statut) {
    var labels = { envoyee: 'Envoyer', recue: 'Marquer comme recue', annulee: 'Annuler' };
    var self = this;
    UI.confirm(labels[statut] + ' cette commande ?')
      .then(function(ok) {
        if (!ok) return;
        API.changeStatutCommande(id, statut)
          .then(function() { UI.toast('Commande ' + (statut === 'recue' ? 'recue (mouvements generes).' : statut + '.'), 'success'); self._load(); })
          .catch(function(err) { UI.toast(err.message, 'error'); });
      });
  },

  _deleteCommande: function(id) {
    var self = this;
    UI.confirm('Supprimer cette commande ?')
      .then(function(ok) {
        if (!ok) return;
        API.deleteCommande(id)
          .then(function() { UI.toast('Commande supprimee.', 'success'); self._load(); })
          .catch(function(err) { UI.toast(err.message, 'error'); });
      });
  },

  _showDetail: function(id) {
    var self = this;
    API.getCommande(id)
      .then(function(data) {
        var c = data.commande;
        var lignes = data.lignes;

        var html = '<p class="mb-md">' +
          '<strong>Fournisseur:</strong> ' + UI.escapeHtml(c.fournisseur_nom || '-') + '<br>' +
          '<strong>Statut:</strong> ' + UI.renderBadgeStatut(c.statut) + '<br>' +
          '<strong>Date:</strong> ' + UI.formatDate(c.date_commande) + '<br>' +
          (c.date_reception ? '<strong>Recue le:</strong> ' + UI.formatDate(c.date_reception) + '<br>' : '') +
          (c.notes ? '<strong>Notes:</strong> ' + UI.escapeHtml(c.notes) : '') +
          '</p>';

        if (lignes.length) {
          html += '<div class="table-wrapper"><table><thead><tr><th>Article</th><th>Ref</th><th>Qté</th><th>Prix unit.</th><th>Total</th></tr></thead><tbody>';
          for (var i = 0; i < lignes.length; i++) {
            var l = lignes[i];
            html += '<tr><td>' + UI.escapeHtml(l.nom || '-') + '</td><td>' + UI.escapeHtml(l.reference || '-') + '</td><td>' + l.quantite + '</td><td>' + UI.formatPrice(l.prix_unitaire) + '</td><td>' + UI.formatPrice(l.quantite * l.prix_unitaire) + '</td></tr>';
          }
          html += '</tbody></table></div>';
        }

        // Print button
        html += '<div class="modal-actions"><button class="btn btn-secondary" onclick="window.print()">Imprimer le bon</button></div>';

        UI.modal('Commande #' + c.id, html, [
          { label: 'Fermer', cls: 'btn-secondary', callback: function(m) { m.close(); } }
        ]);
      })
      .catch(function(err) { UI.toast(err.message, 'error'); });
  },

  _showCreateForm: function(id, prefillLignes) {
    var self = this;
    var isEdit = !!id;

    Promise.all([API.getFournisseurs(), API.getArticles()])
      .then(function(results) {
        var fournisseurs = results[0].fournisseurs;
        var articles = results[1].articles;

        var fournOptions = '<option value="">Selectionner un fournisseur</option>';
        for (var i = 0; i < fournisseurs.length; i++) {
          fournOptions += '<option value="' + fournisseurs[i].id + '">' + UI.escapeHtml(fournisseurs[i].nom) + '</option>';
        }

        var articleOptions = '';
        for (var j = 0; j < articles.length; j++) {
          var a = articles[j];
          var alerte = a.stock_actuel <= a.stock_min ? ' [ALERTE: ' + a.stock_actuel + ']' : '';
          articleOptions += '<option value="' + a.id + '" data-prix="' + a.prix_unitaire + '">' + UI.escapeHtml(a.nom) + ' (' + UI.escapeHtml(a.reference) + ')' + alerte + '</option>';
        }

        self._lignes = (prefillLignes && prefillLignes.length)
          ? prefillLignes.map(function(l) { return { article_id: l.article_id, quantite: l.quantite, prix_unitaire: l.prix_unitaire }; })
          : [{ article_id: '', quantite: 1, prix_unitaire: 0 }];
        self._articleOptionsCmd = articleOptions;

        self._renderLignesCmd = function() {
          var h = '';
          for (var k = 0; k < self._lignes.length; k++) {
            var l = self._lignes[k];
            h += '<div class="commande-ligne" data-index="' + k + '">' +
              '<div class="form-group" style="margin-bottom:0"><select class="form-select art-select" data-index="' + k + '"><option value="">Article</option>' + self._articleOptionsCmd + '</select></div>' +
              '<div class="form-group" style="margin-bottom:0"><input type="number" class="form-input qte-input" data-index="' + k + '" value="' + l.quantite + '" min="1"></div>' +
              '<div class="form-group" style="margin-bottom:0"><input type="number" class="form-input prix-input" data-index="' + k + '" value="' + l.prix_unitaire + '" min="0" step="0.01" placeholder="Prix"></div>' +
              '<button type="button" class="btn btn-sm btn-danger btn-remove-ligne" data-index="' + k + '">&times;</button>' +
              '</div>';
          }
          return h;
        };

        var formHtml =
          '<div class="form-group"><label class="form-label">Fournisseur *</label><select class="form-select" id="cmd-fourn">' + fournOptions + '</select></div>' +
          '<div class="form-group"><label class="form-label">Notes</label><textarea class="form-textarea" id="cmd-notes" rows="2" placeholder="Notes ou references internes..."></textarea></div>' +
          '<div class="flex-between mb-sm"><h4 style="font-size:0.9375rem">Lignes</h4><button type="button" class="btn btn-sm btn-secondary" id="btn-add-ligne">+ Ajouter une ligne</button></div>' +
          '<div id="lignes-container">' + self._renderLignesCmd() + '</div>';

        var modal = UI.modal(isEdit ? 'Modifier la commande' : 'Nouvelle commande', formHtml, [
          { label: 'Annuler', cls: 'btn-secondary', callback: function(m) { m.close(); } },
          { label: isEdit ? 'Enregistrer' : 'Creer (brouillon)', cls: 'btn-primary', callback: function(m) { self._saveCommande(m, isEdit, id); } }
        ]);

        // Bind add ligne
        document.getElementById('btn-add-ligne').addEventListener('click', function() {
          self._lignes.push({ article_id: '', quantite: 1, prix_unitaire: 0 });
          var container = document.getElementById('lignes-container');
          container.innerHTML = self._renderLignesCmd();
          self._bindLignesEvents(container);
        });

        self._bindLignesEvents(document.getElementById('lignes-container'));

        // Pre-fill si commande auto (articles en alerte)
        if (prefillLignes && prefillLignes.length) {
          var selPrefill = document.querySelectorAll('.art-select');
          for (var pf = 0; pf < selPrefill.length; pf++) {
            if (self._lignes[pf]) selPrefill[pf].value = self._lignes[pf].article_id;
          }
        }

        // Pre-fill if editing
        if (isEdit) {
          API.getCommande(id).then(function(data) {
            var c = data.commande;
            var lignes = data.lignes;
            document.getElementById('cmd-fourn').value = c.fournisseur_id || '';
            document.getElementById('cmd-notes').value = c.notes || '';
            self._lignes = lignes.map(function(l) { return { article_id: l.article_id, quantite: l.quantite, prix_unitaire: l.prix_unitaire }; });
            document.getElementById('lignes-container').innerHTML = self._renderLignesCmd();
            self._bindLignesEvents(document.getElementById('lignes-container'));
            // Set select values
            var selects = document.querySelectorAll('.art-select');
            for (var s = 0; s < selects.length; s++) {
              if (self._lignes[s]) selects[s].value = self._lignes[s].article_id;
            }
          }).catch(function(err) { UI.toast(err.message, 'error'); modal.close(); });
        }
      })
      .catch(function(err) { UI.toast(err.message, 'error'); });
  },

  _bindLignesEvents: function(container) {
    var self = this;

    var selects = container.querySelectorAll('.art-select');
    for (var i = 0; i < selects.length; i++) {
      selects[i].addEventListener('change', function() {
        var idx = parseInt(this.getAttribute('data-index'));
        self._lignes[idx].article_id = this.value;
        // Auto-fill price
        var opt = this.selectedOptions[0];
        if (opt && opt.getAttribute('data-prix')) {
          self._lignes[idx].prix_unitaire = parseFloat(opt.getAttribute('data-prix'));
          var prixInput = container.querySelector('.prix-input[data-index="' + idx + '"]');
          if (prixInput) prixInput.value = self._lignes[idx].prix_unitaire;
        }
      });
    }

    var qteInputs = container.querySelectorAll('.qte-input');
    for (var j = 0; j < qteInputs.length; j++) {
      qteInputs[j].addEventListener('input', function() {
        var idx = parseInt(this.getAttribute('data-index'));
        self._lignes[idx].quantite = parseInt(this.value) || 1;
      });
    }

    var prixInputs = container.querySelectorAll('.prix-input');
    for (var k = 0; k < prixInputs.length; k++) {
      prixInputs[k].addEventListener('input', function() {
        var idx = parseInt(this.getAttribute('data-index'));
        self._lignes[idx].prix_unitaire = parseFloat(this.value) || 0;
      });
    }

    var removeBtns = container.querySelectorAll('.btn-remove-ligne');
    for (var r = 0; r < removeBtns.length; r++) {
      removeBtns[r].addEventListener('click', function() {
        var idx = parseInt(this.getAttribute('data-index'));
        if (self._lignes.length <= 1) { UI.toast('Il faut au moins une ligne.', 'warning'); return; }
        self._lignes.splice(idx, 1);
        container.innerHTML = self._renderLignesCmd();
        self._bindLignesEvents(container);
      });
    }
  },

  _saveCommande: function(modal, isEdit, id) {
    var fournisseurId = parseInt(document.getElementById('cmd-fourn').value);
    var notes = document.getElementById('cmd-notes').value.trim() || null;

    if (!fournisseurId) { UI.toast('Selectionnez un fournisseur.', 'error'); return; }

    var lignes = [];
    for (var i = 0; i < this._lignes.length; i++) {
      var l = this._lignes[i];
      if (!l.article_id) { UI.toast('Toutes les lignes doivent avoir un article.', 'error'); return; }
      lignes.push({ article_id: parseInt(l.article_id), quantite: l.quantite, prix_unitaire: l.prix_unitaire });
    }

    var self = this;
    var promise = isEdit
      ? API.updateCommande(id, { fournisseur_id: fournisseurId, notes: notes, lignes: lignes })
      : API.createCommande({ fournisseur_id: fournisseurId, notes: notes, lignes: lignes });

    promise
      .then(function() {
        UI.toast(isEdit ? 'Commande modifiee.' : 'Commande creee (brouillon).', 'success');
        modal.close();
        self._load();
      })
      .catch(function(err) { UI.toast(err.message, 'error'); });
  }
};
