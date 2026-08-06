// public/js/entrees.js — Entrees fournisseur (enregistrement sans impression)
var Entrees = {
  _lignes: [],
  _articleItems: [],
  _acLignes: [],
  _fournAC: null,

  render: function(container) {
    this._offset = 0;
    this._all = [];
    this._hasMore = true;

    container.innerHTML =
      '<div class="card">' +
      '<div class="card-header flex-between">' +
      '<h3 class="card-title">Entrées fournisseur</h3>' +
      '<button class="btn btn-primary" id="btn-new-entree">' +
      '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>' +
      ' Nouvelle entrée</button>' +
      '</div>' +
      '<div class="filter-bar">' +
      '<select class="form-select" id="entree-statut"><option value="">Tous statuts</option><option value="validee">Validée</option><option value="archivee">Archivée</option></select>' +
      '<button class="btn btn-secondary btn-sm" id="btn-entrees-refresh">Actualiser</button>' +
      '</div>' +
      '<p class="text-sm text-muted mb-md">Les articles arrivent avec le bon de livraison et la facture du fournisseur — aucune impression depuis l app. Les photos de ces documents peuvent etre archivees.</p>' +
      '<div id="entrees-table">' + UI.renderSkeleton(6) + '</div>' +
      '<div id="entrees-more" class="text-center mt-md"></div>' +
      '</div>';

    this._load(true);
    this._bindEvents();
  },

  _bindEvents: function() {
    var self = this;
    document.getElementById('btn-new-entree').addEventListener('click', function() { self._showForm(); });
    document.getElementById('entree-statut').addEventListener('change', function() { self._load(true); });
    document.getElementById('btn-entrees-refresh').addEventListener('click', function() { self._load(true); });
  },

  _load: function(reset) {
    var self = this;
    if (reset) { this._offset = 0; this._all = []; this._hasMore = true; }

    var params = { offset: this._offset };
    var s = document.getElementById('entree-statut').value;
    if (s) params.statut = s;

    API.getEntrees(params).then(function(data) {
      if (reset) self._all = data.fiches;
      else self._all = self._all.concat(data.fiches);
      self._hasMore = data.fiches.length >= 50;
      self._offset += data.fiches.length;
      self._renderTable(self._all);
      self._renderMore();
    })
      .catch(function(err) {
        document.getElementById('entrees-table').innerHTML = '<div class="empty-state"><p>' + UI.escapeHtml(err.message) + '</p></div>';
      });
  },

  _renderMore: function() {
    var el = document.getElementById('entrees-more');
    if (!el) return;
    if (!this._hasMore) { el.innerHTML = ''; return; }
    var self = this;
    el.innerHTML = '<button class="btn btn-secondary btn-sm" id="btn-entrees-more">Voir plus</button>';
    document.getElementById('btn-entrees-more').addEventListener('click', function() { self._load(false); });
  },

  _renderTable: function(fiches) {
    var el = document.getElementById('entrees-table');
    if (!fiches || !fiches.length) { el.innerHTML = UI.renderEmptyState('Aucune entrée', 'Enregistrer une entrée', 'btn-new-entree'); return; }

    var self = this;
    var html = '<div class="table-wrapper"><table><thead><tr>' +
      '<th>Référence</th><th>Date</th><th>Fournisseur</th><th>N° BL</th><th>N° facture</th><th>Photos</th><th>Statut</th><th>Actions</th>' +
      '</tr></thead><tbody>';

    for (var i = 0; i < fiches.length; i++) {
      var f = fiches[i];
      var estBrouillon = f.validee === 0;
      var statutCls = estBrouillon ? 'badge-warning' : (f.statut === 'archivee' ? 'badge-neutral' : 'badge-success');
      var statutLabel = estBrouillon ? 'Photos requises' : (f.statut === 'archivee' ? 'Archivée' : 'Validée');
      html += '<tr>' +
        '<td><strong style="font-family:var(--font-heading);font-size:0.8rem">' + UI.escapeHtml(f.reference) + '</strong></td>' +
        '<td>' + UI.formatDate(f.date_entree) + '</td>' +
        '<td><strong>' + UI.escapeHtml(f.fournisseur_nom || '-') + '</strong></td>' +
        '<td>' + UI.escapeHtml(f.numero_bl || '-') + '</td>' +
        '<td>' + UI.escapeHtml(f.numero_facture || '-') + '</td>' +
        '<td>' + (f.nb_photos > 0 ? '<span class="badge badge-info">' + f.nb_photos + '</span>' : '<span class="text-muted">—</span>') + '</td>' +
        '<td><span class="badge ' + statutCls + '">' + statutLabel + '</span></td>' +
        '<td class="actions">' +
        '<button class="btn btn-sm btn-info btn-view-entree" data-id="' + f.id + '">Details</button>';
      if (estBrouillon) {
        html += '<button class="btn btn-sm btn-warning btn-continue-entree" data-id="' + f.id + '">Continuer</button>';
      } else if (f.statut !== 'archivee') {
        html += '<button class="btn btn-sm btn-success btn-photo-entree" data-id="' + f.id + '">Photo BL/Facture</button>';
      }
      html += '<button class="btn btn-sm btn-danger btn-del-entree" data-id="' + f.id + '">Suppr.</button>' +
        '</td></tr>';
    }
    html += '</tbody></table></div>';
    el.innerHTML = html;

    var btns = el.querySelectorAll('.btn-view-entree, .btn-photo-entree, .btn-del-entree, .btn-continue-entree');
    for (var j = 0; j < btns.length; j++) {
      btns[j].addEventListener('click', function() {
        var id = parseInt(this.getAttribute('data-id'));
        if (this.classList.contains('btn-view-entree')) self._viewEntree(id);
        else if (this.classList.contains('btn-photo-entree')) self._addPhoto(id);
        else if (this.classList.contains('btn-del-entree')) self._deleteEntree(id);
        else if (this.classList.contains('btn-continue-entree')) self._continueDraft(id);
      });
    }
  },

  _showForm: function() {
    var self = this;
    API.getFournisseurs().then(function(results) {
      var fournisseurs = results.fournisseurs;

      self._lignes = [{ article_id: '', quantite: 1, numero_debut: '', numero_fin: '', article_type: '', article_nom: '' }];
      self._acLignes = [];
      self._fournAC = null;
      self._photoBL = null;
      self._photoFacture = null;
      self._draftPhotos = { bl: false, facture: false };

      var body =
        '<div class="form-group"><label class="form-label">Fournisseur (recherche ou ajout)</label><div id="entree-fourn-ac"></div></div>' +
        '<div class="form-row"><div class="form-group"><label class="form-label">N° bon de livraison</label><input type="text" class="form-input" id="entree-bl" placeholder="Ex: BL-2026-001"></div>' +
        '<div class="form-group"><label class="form-label">N° facture</label><input type="text" class="form-input" id="entree-facture" placeholder="Ex: FAC-2026-001"></div></div>' +
        '<div class="flex-between mb-sm"><strong>Articles</strong><button class="btn btn-sm btn-secondary" id="btn-add-line">+ Ajouter</button></div>' +
        '<div id="lignes-entree"></div>' +
        '<div class="mt-md mb-sm"><strong>Documents requis (obligatoires)</strong><p class="text-sm text-muted">Photos du bon de livraison et de la facture — aucune validation possible sans les deux.</p></div>' +
        '<div class="flex-wrap" style="display:flex;gap:12px">' +
        '<div style="flex:1;min-width:140px;border:1px dashed var(--color-border);border-radius:10px;padding:10px;text-align:center">' +
        '<strong class="text-sm">Bon de livraison</strong>' +
        '<div id="preview-bl" style="margin:8px 0"><span class="text-muted text-sm">Aucune photo</span></div>' +
        '<button class="btn btn-sm btn-secondary" id="btn-photo-bl">Prendre une photo</button>' +
        '</div>' +
        '<div style="flex:1;min-width:140px;border:1px dashed var(--color-border);border-radius:10px;padding:10px;text-align:center">' +
        '<strong class="text-sm">Facture</strong>' +
        '<div id="preview-facture" style="margin:8px 0"><span class="text-muted text-sm">Aucune photo</span></div>' +
        '<button class="btn btn-sm btn-secondary" id="btn-photo-facture">Prendre une photo</button>' +
        '</div></div>';

      UI.modal('Nouvelle entree (sans impression)', body, [
        { label: 'Annuler', cls: 'btn-secondary', callback: function(m) { m.close(); } },
        { label: 'Valider l entree', cls: 'btn-primary', callback: function(m) { self._saveEntree(m); } }
      ]);

      document.getElementById('btn-photo-bl').addEventListener('click', function() { self._pickPhoto('bl', 'Bon de livraison'); });
      document.getElementById('btn-photo-facture').addEventListener('click', function() { self._pickPhoto('facture', 'Facture'); });
      self._refreshValiderBtn();

      self._fournAC = UI.autocomplete(document.getElementById('entree-fourn-ac'), {
        items: fournisseurs.map(function(f) {
          return { id: f.id, label: f.nom, meta: (f.telephone || f.contact || '') };
        }),
        placeholder: 'Rechercher un fournisseur...',
        allowAdd: true,
        onAdd: function(text) {
          API.createFournisseur({ nom: text }).then(function(data) {
            var f = data.fournisseur;
            self._fournAC.set(f.id);
            UI.toast('Fournisseur cree : ' + f.nom, 'success');
          }).catch(function(err) { UI.toast(err.message, 'error'); });
        }
      });

      document.getElementById('btn-add-line').addEventListener('click', function() {
        self._lignes.push({ article_id: '', quantite: 1, numero_debut: '', numero_fin: '', article_type: '', article_nom: '' });
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
      var showNum = l.article_type === 'numerote' ? 'flex' : 'none';
      h += '<div class="commande-ligne" style="border:1px solid var(--color-border);border-radius:10px;padding:8px;margin-bottom:8px">' +
        '<div class="art-ac" data-idx="' + k + '"></div>' +
        '<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-top:6px">' +
        '<input type="number" class="form-input qte-entree" data-idx="' + k + '" value="' + (l.quantite || 1) + '" min="1" placeholder="Qte" style="min-height:40px;width:90px">' +
        '<div class="num-fields" data-idx="' + k + '" style="display:' + showNum + ';gap:6px;flex-wrap:wrap">' +
        '<input type="text" class="form-input num-debut" data-idx="' + k + '" value="' + (l.numero_debut || '') + '" placeholder="N° debut" style="min-height:40px;width:110px">' +
        '<input type="text" class="form-input num-fin" data-idx="' + k + '" value="' + (l.numero_fin || '') + '" placeholder="N° fin" style="min-height:40px;width:110px">' +
        '</div>' +
        '<button class="btn btn-sm btn-danger btn-rm-line" data-idx="' + k + '" style="min-width:32px;min-height:40px">&times;</button>' +
        '</div></div>';
    }
    lc.innerHTML = h;
    this._bindLignes(lc);
  },

  _bindLignes: function(container) {
    var self = this;
    container.querySelectorAll('.art-ac').forEach(function(el) {
      var idx = parseInt(el.dataset.idx);
      var ac = UI.autocomplete(el, {
        items: [],
        placeholder: 'Rechercher un article...',
        search: function(term, cb) {
          API.getArticles({ search: term }).then(function(data) {
            cb(data.articles.map(function(a) {
              return { id: a.id, label: a.nom, meta: 'Stock: ' + a.stock_actuel + ' ' + a.unite, type: a.type_article };
            }));
          }).catch(function() { cb([]); });
        },
        onSelect: function(item) {
          var l = self._lignes[idx];
          l.article_id = item.id;
          l.article_type = item.type;
          l.article_nom = item.label;
          var nf = container.querySelector('.num-fields[data-idx="' + idx + '"]');
          if (nf) nf.style.display = item.type === 'numerote' ? 'flex' : 'none';
        }
      });
      self._acLignes[idx] = ac;
      // Restaurer l'état après un re-render (ajout/suppression de ligne)
      if (self._lignes[idx] && self._lignes[idx].article_id) {
        ac.setItem({ id: self._lignes[idx].article_id, label: self._lignes[idx].article_nom || '', type: self._lignes[idx].article_type });
        var nf = container.querySelector('.num-fields[data-idx="' + idx + '"]');
        if (nf) nf.style.display = self._lignes[idx].article_type === 'numerote' ? 'flex' : 'none';
      }
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
    var self = this;
    var fourn = this._fournAC ? this._fournAC.value() : null;
    var fournisseurId = fourn ? fourn.id : null;
    var numero_bl = document.getElementById('entree-bl').value.trim() || null;
    var numero_facture = document.getElementById('entree-facture').value.trim() || null;

    if (!self._photoBL || !self._photoFacture) {
      UI.toast('Les photos du bon de livraison et de la facture sont obligatoires.', 'error');
      return;
    }

    var arts = [];
    for (var i = 0; i < this._lignes.length; i++) {
      var l = this._lignes[i];
      if (!l.article_id) { UI.toast('Tous les articles sont requis.', 'error'); return; }
      arts.push({ article_id: parseInt(l.article_id), quantite: l.quantite || 1, numero_debut: l.numero_debut || null, numero_fin: l.numero_fin || null });
    }

    API.createEntree({ fournisseur_id: fournisseurId, numero_bl: numero_bl, numero_facture: numero_facture, articles: arts })
      .then(function(data) {
        var id = data.fiche.id;
        // Upload BL puis facture, puis validation (stock mis a jour uniquement a la validation)
        return API.uploadEntreePhoto(id, self._photoBL, 'bl')
          .then(function(d) { if (d && d.error) throw new Error(d.error); return API.uploadEntreePhoto(id, self._photoFacture, 'facture'); })
          .then(function(d) { if (d && d.error) throw new Error(d.error); return API.validerEntree(id); })
          .then(function() {
            UI.toast('Entree validee — stock mis a jour.', 'success');
            modal.close();
            self._load();
          })
          .catch(function(err) {
            // La fiche reste en brouillon : reprise possible depuis le tableau (bouton Continuer)
            modal.close();
            self._load();
            UI.toast(err.message + ' L entree reste en attente de validation.', 'error');
          });
      })
      .catch(function(err) { UI.toast(err.message, 'error'); });
  },

  _viewEntree: function(id) {
    var self = this;
    API.getEntree(id).then(function(data) {
      var f = data.fiche, lignes = data.lignes, photos = data.photos;

      var html = '<div style="font-size:0.9rem">' +
        '<div class="flex-between mb-md"><div><strong>Ref:</strong> ' + UI.escapeHtml(f.reference) + '</div><div><span class="badge ' + (f.validee === 0 ? 'badge-warning' : (f.statut === 'archivee' ? 'badge-neutral' : 'badge-success')) + '">' + (f.validee === 0 ? 'Photos requises' : (f.statut === 'archivee' ? 'Archivee' : 'Validee')) + '</span></div></div>' +
        '<div class="flex-between mb-md"><div><strong>Fournisseur:</strong> ' + UI.escapeHtml(f.fournisseur_nom || '-') + '</div><div><strong>Date:</strong> ' + UI.formatDate(f.date_entree) + '</div></div>' +
        '<div class="flex-between mb-md"><div><strong>N° BL:</strong> ' + UI.escapeHtml(f.numero_bl || '-') + '</div><div><strong>N° facture:</strong> ' + UI.escapeHtml(f.numero_facture || '-') + '</div></div>';

      if (lignes.length) {
        html += '<div class="table-wrapper"><table><thead><tr><th>Article</th><th>Qté</th><th>N° debut</th><th>N° fin</th></tr></thead><tbody>';
        for (var i = 0; i < lignes.length; i++) {
          html += '<tr><td>' + UI.escapeHtml(lignes[i].article_nom || '-') + '</td><td>' + lignes[i].quantite + '</td><td>' + UI.escapeHtml(lignes[i].numero_debut || '-') + '</td><td>' + UI.escapeHtml(lignes[i].numero_fin || '-') + '</td></tr>';
        }
        html += '</tbody></table></div>';
      }

      html += '<div class="mt-md"><div class="flex-between"><strong>Photos archivees</strong><button class="btn btn-sm btn-secondary" id="btn-add-photo-detail">+ Photo</button></div>' +
        '<div id="photos-gallery" class="flex-wrap" style="display:flex;gap:8px;margin-top:0.5rem">';
      if (photos.length) {
        for (var p = 0; p < photos.length; p++) {
          var label = photos[p].type === 'bl' ? 'Bon de livraison' : (photos[p].type === 'facture' ? 'Facture' : 'Autre');
          html += '<div style="width:120px;text-align:center">' +
            '<a href="' + UI.escapeHtml(photos[p].fichier_path) + '" target="_blank"><img src="' + UI.escapeHtml(photos[p].fichier_path) + '" style="width:100%;height:90px;object-fit:cover;border:1px solid var(--color-border);border-radius:8px"></a>' +
            '<span class="text-sm">' + label + '</span></div>';
        }
      } else {
        html += '<p class="text-muted text-sm">Aucune photo.</p>';
      }
      html += '</div></div></div>';

      var actions = [{ label: 'Fermer', cls: 'btn-secondary', callback: function(m) { m.close(); } }];
      if (f.validee === 0) {
        actions.unshift({ label: 'Continuer la validation', cls: 'btn-primary', callback: function(m) { m.close(); self._continueDraft(id); } });
      }
      UI.modal('Entree ' + UI.escapeHtml(f.reference), html, actions);

      var addBtn = document.getElementById('btn-add-photo-detail');
      if (addBtn) addBtn.addEventListener('click', function() { self._addPhoto(f.id); });
    }).catch(function(err) { UI.toast(err.message, 'error'); });
  },

  _pickPhoto: function(type, label) {
    var self = this;
    // Ouvre directement la camera du telephone (input capture), sinon le selecteur de fichier
    UI.pickFile(function(file) {
      if (!file) return;
      if (file.size > 10 * 1024 * 1024) { UI.toast('Fichier trop volumineux (max 10 Mo).', 'error'); return; }

      if (type === 'bl') self._photoBL = file;
      else self._photoFacture = file;

      var preview = document.getElementById(type === 'bl' ? 'preview-bl' : 'preview-facture');
      if (preview) {
        preview.innerHTML = '<img src="' + URL.createObjectURL(file) + '" style="width:100%;height:80px;object-fit:cover;border:1px solid var(--color-border);border-radius:8px" alt="' + UI.escapeHtml(label) + '">' +
          '<span class="text-sm text-muted" style="display:block">Photo OK</span>';
      }
      self._refreshValiderBtn();
    });
  },

  // Active/desactive le bouton « Valider » selon la presence des deux photos
  _refreshValiderBtn: function() {
    var base = this._draftPhotos || { bl: false, facture: false };
    var ok = (this._photoBL || base.bl) && (this._photoFacture || base.facture);
    var btn = document.getElementById('modal-btn-1');
    if (!btn) return;
    btn.disabled = !ok;
    btn.style.opacity = ok ? '1' : '0.5';
    btn.style.cursor = ok ? 'pointer' : 'not-allowed';
  },

  // Reprendre un brouillon (photos + validation) depuis le tableau
  _continueDraft: function(id) {
    var self = this;
    API.getEntree(id).then(function(data) {
      var f = data.fiche;
      var hasBL = (data.photos || []).some(function(p) { return p.type === 'bl'; });
      var hasFacture = (data.photos || []).some(function(p) { return p.type === 'facture'; });

      self._photoBL = null;
      self._photoFacture = null;
      self._draftPhotos = { bl: hasBL, facture: hasFacture };

      var body =
        '<div class="mb-md"><strong>Entree ' + UI.escapeHtml(f.reference) + '</strong> — les deux photos sont requises pour valider.</div>' +
        '<div class="flex-wrap" style="display:flex;gap:12px">' +
        '<div style="flex:1;min-width:140px;border:1px dashed var(--color-border);border-radius:10px;padding:10px;text-align:center">' +
        '<strong class="text-sm">Bon de livraison</strong>' +
        '<div id="preview-bl" style="margin:8px 0">' + (hasBL ? '<span class="badge badge-success">Photo BL presente</span>' : '<span class="text-muted text-sm">Aucune photo</span>') + '</div>' +
        '<button class="btn btn-sm btn-secondary" id="btn-photo-bl">' + (hasBL ? 'Remplacer' : 'Prendre une photo') + '</button>' +
        '</div>' +
        '<div style="flex:1;min-width:140px;border:1px dashed var(--color-border);border-radius:10px;padding:10px;text-align:center">' +
        '<strong class="text-sm">Facture</strong>' +
        '<div id="preview-facture" style="margin:8px 0">' + (hasFacture ? '<span class="badge badge-success">Photo facture presente</span>' : '<span class="text-muted text-sm">Aucune photo</span>') + '</div>' +
        '<button class="btn btn-sm btn-secondary" id="btn-photo-facture">' + (hasFacture ? 'Remplacer' : 'Prendre une photo') + '</button>' +
        '</div></div>';

      UI.modal('Valider l entree ' + UI.escapeHtml(f.reference), body, [
        { label: 'Annuler', cls: 'btn-secondary', callback: function(m) { m.close(); } },
        { label: 'Valider l entree', cls: 'btn-primary', callback: function(m) { self._validerDraft(m, id, hasBL, hasFacture); } }
      ]);

      document.getElementById('btn-photo-bl').addEventListener('click', function() { self._pickPhoto('bl', 'Bon de livraison'); });
      document.getElementById('btn-photo-facture').addEventListener('click', function() { self._pickPhoto('facture', 'Facture'); });
      self._refreshValiderBtn();
    }).catch(function(err) { UI.toast(err.message, 'error'); });
  },

  _validerDraft: function(modal, id, hasBL, hasFacture) {
    var self = this;
    var uploads = [];
    if (self._photoBL) uploads.push(API.uploadEntreePhoto(id, self._photoBL, 'bl').then(function(d) { if (d && d.error) throw new Error(d.error); }));
    if (self._photoFacture) uploads.push(API.uploadEntreePhoto(id, self._photoFacture, 'facture').then(function(d) { if (d && d.error) throw new Error(d.error); }));

    Promise.all(uploads)
      .then(function() { return API.validerEntree(id); })
      .then(function() {
        UI.toast('Entree validee — stock mis a jour.', 'success');
        modal.close();
        self._load();
      })
      .catch(function(err) {
        modal.close();
        self._load();
        UI.toast(err.message + ' L entree reste en attente de validation.', 'error');
      });
  },

  _addPhoto: function(id) {
    var self = this;
    UI.pickFile(function(file) {
      if (!file) return;
      if (file.size > 10 * 1024 * 1024) { UI.toast('Fichier trop volumineux (max 10 Mo).', 'error'); return; }

      function upload(type) {
        UI.toast('Enregistrement de la photo...', 'info');
        API.uploadEntreePhoto(id, file, type).then(function(data) {
          if (data.error) { UI.toast(data.error, 'error'); return; }
          UI.toast('Photo archivee.', 'success');
          self._load();
        }).catch(function(err) { UI.toast(err.message, 'error'); });
      }

      UI.modal('Archiver la photo', '<p>Type de document ?</p>', [
        { label: 'Bon de livraison', cls: 'btn-primary', callback: function(m) { m.close(); upload('bl'); } },
        { label: 'Facture / Autre', cls: 'btn-secondary', callback: function(m) { m.close(); upload('facture'); } },
        { label: 'Annuler', cls: 'btn-secondary', callback: function(m) { m.close(); } }
      ]);
    }, 'image/*,.pdf');
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
