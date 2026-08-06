// public/js/entrees.js — Entrees fournisseur (enregistrement sans impression)
var Entrees = {
  _lignes: [],
  _articleOptions: '',

  render: function(container) {
    container.innerHTML =
      '<div class="card">' +
      '<div class="card-header flex-between">' +
      '<h3 class="card-title">Entrees fournisseur</h3>' +
      '<button class="btn btn-primary" id="btn-new-entree">' +
      '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>' +
      ' Nouvelle entree</button>' +
      '</div>' +
      '<div class="filter-bar">' +
      '<select class="form-select" id="entree-statut"><option value="">Tous statuts</option><option value="validee">Validee</option><option value="archivee">Archivee</option></select>' +
      '<button class="btn btn-secondary btn-sm" id="btn-entrees-refresh">Actualiser</button>' +
      '</div>' +
      '<p class="text-sm text-muted mb-md">Les articles arrivent avec le bon de livraison et la facture du fournisseur — aucune impression depuis l app. Les photos de ces documents peuvent etre archivees.</p>' +
      '<div id="entrees-table">' + UI.renderSkeleton(6) + '</div>' +
      '</div>';

    this._load();
    this._bindEvents();
  },

  _bindEvents: function() {
    var self = this;
    document.getElementById('btn-new-entree').addEventListener('click', function() { self._showForm(); });
    document.getElementById('entree-statut').addEventListener('change', function() { self._load(); });
    document.getElementById('btn-entrees-refresh').addEventListener('click', function() { self._load(); });
  },

  _load: function() {
    var self = this;
    var params = {};
    var s = document.getElementById('entree-statut').value;
    if (s) params.statut = s;

    API.getEntrees(params).then(function(data) { self._renderTable(data.fiches); })
      .catch(function(err) {
        document.getElementById('entrees-table').innerHTML = '<div class="empty-state"><p>' + UI.escapeHtml(err.message) + '</p></div>';
      });
  },

  _renderTable: function(fiches) {
    var el = document.getElementById('entrees-table');
    if (!fiches || !fiches.length) { el.innerHTML = UI.renderEmptyState('Aucune entree', 'Enregistrer une entree', 'entrees'); return; }

    var self = this;
    var html = '<div class="table-wrapper"><table><thead><tr>' +
      '<th>Reference</th><th>Date</th><th>Fournisseur</th><th>N° BL</th><th>N° facture</th><th>Photos</th><th>Statut</th><th>Actions</th>' +
      '</tr></thead><tbody>';

    for (var i = 0; i < fiches.length; i++) {
      var f = fiches[i];
      var statutCls = f.statut === 'archivee' ? 'badge-neutral' : 'badge-success';
      html += '<tr>' +
        '<td><strong style="font-family:var(--font-heading);font-size:0.8rem">' + UI.escapeHtml(f.reference) + '</strong></td>' +
        '<td>' + UI.formatDate(f.date_entree) + '</td>' +
        '<td><strong>' + UI.escapeHtml(f.fournisseur_nom || '-') + '</strong></td>' +
        '<td>' + UI.escapeHtml(f.numero_bl || '-') + '</td>' +
        '<td>' + UI.escapeHtml(f.numero_facture || '-') + '</td>' +
        '<td>' + (f.nb_photos > 0 ? '<span class="badge badge-info">' + f.nb_photos + '</span>' : '<span class="text-muted">—</span>') + '</td>' +
        '<td><span class="badge ' + statutCls + '">' + (f.statut === 'archivee' ? 'Archivee' : 'Validee') + '</span></td>' +
        '<td class="actions">' +
        '<button class="btn btn-sm btn-info btn-view-entree" data-id="' + f.id + '">Details</button>';
      if (f.statut !== 'archivee') {
        html += '<button class="btn btn-sm btn-success btn-photo-entree" data-id="' + f.id + '">Photo BL/Facture</button>';
      }
      html += '<button class="btn btn-sm btn-danger btn-del-entree" data-id="' + f.id + '">Suppr.</button>' +
        '</td></tr>';
    }
    html += '</tbody></table></div>';
    el.innerHTML = html;

    var btns = el.querySelectorAll('.btn-view-entree, .btn-photo-entree, .btn-del-entree');
    for (var j = 0; j < btns.length; j++) {
      btns[j].addEventListener('click', function() {
        var id = parseInt(this.getAttribute('data-id'));
        if (this.classList.contains('btn-view-entree')) self._viewEntree(id);
        else if (this.classList.contains('btn-photo-entree')) self._addPhoto(id);
        else if (this.classList.contains('btn-del-entree')) self._deleteEntree(id);
      });
    }
  },

  _showForm: function() {
    var self = this;
    Promise.all([API.getFournisseurs(), API.getArticles()]).then(function(results) {
      var fournisseurs = results[0].fournisseurs;
      var articles = results[1].articles;

      var fournOptions = '<option value="">Fournisseur (optionnel)</option>';
      for (var i = 0; i < fournisseurs.length; i++) {
        fournOptions += '<option value="' + fournisseurs[i].id + '">' + UI.escapeHtml(fournisseurs[i].nom) + '</option>';
      }

      var articleOptions = '';
      for (var j = 0; j < articles.length; j++) {
        var a = articles[j];
        articleOptions += '<option value="' + a.id + '" data-type="' + a.type_article + '">' + UI.escapeHtml(a.nom) + ' (stock: ' + a.stock_actuel + ' ' + UI.escapeHtml(a.unite) + ')' + (a.type_article === 'numerote' ? ' [NUMEROTE]' : '') + '</option>';
      }
      self._articleOptions = articleOptions;
      self._lignes = [{ article_id: '', quantite: 1, numero_debut: '', numero_fin: '' }];

      var body =
        '<div class="form-group"><label class="form-label">Fournisseur</label><select class="form-select" id="entree-fourn">' + fournOptions + '</select></div>' +
        '<div class="form-group"><label class="form-label">N° bon de livraison</label><input type="text" class="form-input" id="entree-bl" placeholder="Ex: BL-2026-001"></div>' +
        '<div class="form-group"><label class="form-label">N° facture</label><input type="text" class="form-input" id="entree-facture" placeholder="Ex: FAC-2026-001"></div>' +
        '<div class="form-group"><label class="form-label">Notes</label><textarea class="form-textarea" id="entree-notes" rows="2" placeholder="Observations..."></textarea></div>' +
        '<div class="flex-between mb-sm"><strong>Articles</strong><button class="btn btn-sm btn-secondary" id="btn-add-line">+ Ajouter</button></div>' +
        '<div id="lignes-entree"></div>';

      UI.modal('Nouvelle entree (sans impression)', body, [
        { label: 'Annuler', cls: 'btn-secondary', callback: function(m) { m.close(); } },
        { label: 'Enregistrer', cls: 'btn-primary', callback: function(m) { self._saveEntree(m); } }
      ]);

      document.getElementById('btn-add-line').addEventListener('click', function() {
        self._lignes.push({ article_id: '', quantite: 1, numero_debut: '', numero_fin: '' });
        self._refreshLignes();
      });
      self._refreshLignes();
    }).catch(function(err) { UI.toast(err.message, 'error'); });
  },

  _refreshLignes: function() {
    var lc = document.getElementById('lignes-entree');
    if (!lc) return;
    var h = '';
    for (var k = 0; k < this._lignes.length; k++) {
      var l = this._lignes[k];
      h += '<div class="commande-ligne" style="grid-template-columns:2fr 80px auto auto 32px;gap:4px;align-items:end">' +
        '<select class="form-select art-entree" data-idx="' + k + '" style="min-height:40px;font-size:0.85rem"><option value="">Article</option>' + this._articleOptions + '</select>' +
        '<input type="number" class="form-input qte-entree" data-idx="' + k + '" value="' + (l.quantite || 1) + '" min="1" placeholder="Qte" style="min-height:40px">' +
        '<input type="text" class="form-input num-debut" data-idx="' + k + '" value="' + (l.numero_debut || '') + '" placeholder="N° debut" style="min-height:40px">' +
        '<input type="text" class="form-input num-fin" data-idx="' + k + '" value="' + (l.numero_fin || '') + '" placeholder="N° fin" style="min-height:40px">' +
        '<button class="btn btn-sm btn-danger btn-rm-line" data-idx="' + k + '" style="min-width:32px;min-height:40px">&times;</button>' +
        '</div>';
    }
    lc.innerHTML = h;
    this._bindLignes(lc);
  },

  _bindLignes: function(container) {
    var self = this;
    container.querySelectorAll('.art-entree').forEach(function(el) {
      el.addEventListener('change', function() { self._lignes[parseInt(this.dataset.idx)].article_id = this.value; });
    });
    container.querySelectorAll('.qte-entree').forEach(function(el) {
      el.addEventListener('input', function() { self._lignes[parseInt(this.dataset.idx)].quantite = parseInt(this.value) || 1; });
    });
    container.querySelectorAll('.num-debut').forEach(function(el) {
      el.addEventListener('input', function() { self._lignes[parseInt(this.dataset.idx)].numero_debut = this.value; });
    });
    container.querySelectorAll('.num-fin').forEach(function(el) {
      el.addEventListener('input', function() { self._lignes[parseInt(this.dataset.idx)].numero_fin = this.value; });
    });
    container.querySelectorAll('.btn-rm-line').forEach(function(el) {
      el.addEventListener('click', function() {
        var idx = parseInt(this.dataset.idx);
        if (self._lignes.length <= 1) { UI.toast('Il faut au moins un article.', 'warning'); return; }
        self._lignes.splice(idx, 1);
        self._refreshLignes();
      });
    });
  },

  _saveEntree: function(modal) {
    var fournisseurId = document.getElementById('entree-fourn').value || null;
    var numero_bl = document.getElementById('entree-bl').value.trim() || null;
    var numero_facture = document.getElementById('entree-facture').value.trim() || null;
    var notes = document.getElementById('entree-notes').value.trim() || null;

    var arts = [];
    for (var i = 0; i < this._lignes.length; i++) {
      var l = this._lignes[i];
      if (!l.article_id) { UI.toast('Tous les articles sont requis.', 'error'); return; }
      arts.push({ article_id: parseInt(l.article_id), quantite: l.quantite || 1, numero_debut: l.numero_debut || null, numero_fin: l.numero_fin || null });
    }

    var self = this;
    API.createEntree({ fournisseur_id: fournisseurId, numero_bl: numero_bl, numero_facture: numero_facture, notes: notes, articles: arts })
      .then(function(data) {
        UI.toast(data.message || 'Entree enregistree.', 'success');
        modal.close();
        self._load();
        setTimeout(function() {
          UI.confirm('Voulez-vous prendre en photo le bon de livraison et/ou la facture pour les archiver ?')
            .then(function(ok) { if (ok) self._viewEntree(data.fiche.id); });
        }, 400);
      })
      .catch(function(err) { UI.toast(err.message, 'error'); });
  },

  _viewEntree: function(id) {
    var self = this;
    API.getEntree(id).then(function(data) {
      var f = data.fiche, lignes = data.lignes, photos = data.photos;

      var html = '<div style="font-size:0.9rem">' +
        '<div class="flex-between mb-md"><div><strong>Ref:</strong> ' + UI.escapeHtml(f.reference) + '</div><div><span class="badge ' + (f.statut === 'archivee' ? 'badge-neutral' : 'badge-success') + '">' + (f.statut === 'archivee' ? 'Archivee' : 'Validee') + '</span></div></div>' +
        '<div class="flex-between mb-md"><div><strong>Fournisseur:</strong> ' + UI.escapeHtml(f.fournisseur_nom || '-') + '</div><div><strong>Date:</strong> ' + UI.formatDate(f.date_entree) + '</div></div>' +
        '<div class="flex-between mb-md"><div><strong>N° BL:</strong> ' + UI.escapeHtml(f.numero_bl || '-') + '</div><div><strong>N° facture:</strong> ' + UI.escapeHtml(f.numero_facture || '-') + '</div></div>';

      if (lignes.length) {
        html += '<div class="table-wrapper"><table><thead><tr><th>Article</th><th>Qté</th><th>N° debut</th><th>N° fin</th></tr></thead><tbody>';
        for (var i = 0; i < lignes.length; i++) {
          html += '<tr><td>' + UI.escapeHtml(lignes[i].article_nom || '-') + '</td><td>' + lignes[i].quantite + '</td><td>' + (lignes[i].numero_debut || '-') + '</td><td>' + (lignes[i].numero_fin || '-') + '</td></tr>';
        }
        html += '</tbody></table></div>';
      }

      html += '<div class="mt-md"><div class="flex-between"><strong>Photos archivees</strong><button class="btn btn-sm btn-secondary" id="btn-add-photo-detail">+ Photo</button></div>' +
        '<div id="photos-gallery" class="flex-wrap" style="display:flex;gap:8px;margin-top:0.5rem">';
      if (photos.length) {
        for (var p = 0; p < photos.length; p++) {
          var label = photos[p].type === 'bl' ? 'Bon de livraison' : (photos[p].type === 'facture' ? 'Facture' : 'Autre');
          html += '<div style="width:120px;text-align:center">' +
            '<a href="' + photos[p].fichier_path + '" target="_blank"><img src="' + photos[p].fichier_path + '" style="width:100%;height:90px;object-fit:cover;border:1px solid var(--color-border);border-radius:8px"></a>' +
            '<span class="text-sm">' + label + '</span></div>';
        }
      } else {
        html += '<p class="text-muted text-sm">Aucune photo.</p>';
      }
      html += '</div></div></div>';

      var actions = [{ label: 'Fermer', cls: 'btn-secondary', callback: function(m) { m.close(); } }];
      UI.modal('Entree ' + UI.escapeHtml(f.reference), html, actions);

      var addBtn = document.getElementById('btn-add-photo-detail');
      if (addBtn) addBtn.addEventListener('click', function() { self._addPhoto(f.id); });
    }).catch(function(err) { UI.toast(err.message, 'error'); });
  },

  _addPhoto: function(id) {
    var self = this;
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*,.pdf';
    input.capture = 'environment';

    input.addEventListener('change', function() {
      var file = this.files[0];
      if (!file) return;
      if (file.size > 10 * 1024 * 1024) { UI.toast('Fichier trop volumineux (max 10 Mo).', 'error'); return; }
      UI.confirm('C\'est le bon de livraison ? (Oui = BL, Non = Facture/Autre)').then(function(isBl) {
        var type = isBl ? 'bl' : 'facture';
        UI.toast('Enregistrement de la photo...', 'info');
        API.uploadEntreePhoto(id, file, type).then(function(data) {
          if (data.error) { UI.toast(data.error, 'error'); return; }
          UI.toast('Photo archivee.', 'success');
          self._load();
        }).catch(function(err) { UI.toast(err.message, 'error'); });
      });
    });
    input.click();
  },

  _deleteEntree: function(id) {
    var self = this;
    UI.confirm('Supprimer cette entree ? Le stock sera ajuste (refuse si des sorties ont deja eu lieu).').then(function(ok) {
      if (!ok) return;
      API.deleteEntree(id).then(function() { UI.toast('Entree supprimee.', 'success'); self._load(); })
        .catch(function(err) { UI.toast(err.message, 'error'); });
    });
  }
};
