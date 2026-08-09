// public/js/fiches_besoin.js — Fiches de besoin (demande d'achat -> service achat -> retour)
var FichesBesoin = {
  _articleItems: [],
  _lignes: [],
  _acLignes: [],

  render: function(container) {
    container.innerHTML =
      '<div class="card">' +
      '<div class="card-header flex-between">' +
      '<h3 class="card-title">Fiches de besoin</h3>' +
      '<button class="btn btn-primary" id="btn-new-besoin">' +
      '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>' +
      ' Nouvelle fiche de besoin</button>' +
      '</div>' +
      '<div class="filter-bar">' +
      '<select class="form-select" id="besoin-statut"><option value="">Tous statuts</option><option value="creee">Creee</option><option value="transmise">Transmise</option><option value="revenue">Revenue</option><option value="archivee">Archivee</option></select>' +
      '<button class="btn btn-secondary btn-sm" id="btn-besoin-refresh">Actualiser</button>' +
      '</div>' +
      '<p class="text-sm text-muted mb-md">Demande d\'achat interne : creee, transmise au service achat, puis archivee des reception du retour signe (scan).</p>' +
      '<div id="besoin-table">' + UI.renderSkeleton(6) + '</div>' +
      '</div>';

    this._load();
    this._bindEvents();
  },

  _bindEvents: function() {
    var self = this;
    document.getElementById('btn-new-besoin').addEventListener('click', function() { self._showForm(); });
    document.getElementById('besoin-statut').addEventListener('change', function() { self._load(); });
    document.getElementById('btn-besoin-refresh').addEventListener('click', function() { self._load(); });
  },

  _load: function() {
    var self = this;
    var params = {};
    var s = document.getElementById('besoin-statut').value;
    if (s) params.statut = s;

    API.getFichesBesoin(params).then(function(data) { self._renderTable(data.fiches); })
      .catch(function(err) {
        document.getElementById('besoin-table').innerHTML = '<div class="empty-state"><p>' + UI.escapeHtml(err.message) + '</p></div>';
      });
  },

  _statutBadge: function(statut) {
    var map = { creee: ['badge-warning', 'Creee'], transmise: ['badge-info', 'Transmise'], revenue: ['badge-success', 'Revenue'], archivee: ['badge-neutral', 'Archivee'] };
    var m = map[statut] || ['badge-neutral', statut];
    return '<span class="badge ' + m[0] + '">' + m[1] + '</span>';
  },

  _renderTable: function(fiches) {
    var el = document.getElementById('besoin-table');
    if (!fiches || !fiches.length) { el.innerHTML = UI.renderEmptyState('Aucune fiche de besoin', 'Nouvelle fiche de besoin', 'btn-new-besoin'); return; }

    var self = this;
    var html = '<div class="table-wrapper"><table><thead><tr>' +
      '<th>Reference</th><th>Date</th><th>Lignes</th><th>Statut</th><th>Créé par</th><th>Actions</th>' +
      '</tr></thead><tbody>';

    for (var i = 0; i < fiches.length; i++) {
      var f = fiches[i];
      html += '<tr>' +
        '<td><strong style="font-family:var(--font-heading);font-size:0.8rem">' + UI.escapeHtml(f.reference) + '</strong></td>' +
        '<td>' + UI.formatDate(f.date_creation) + '</td>' +
        '<td>' + f.nb_lignes + '</td>' +
        '<td>' + this._statutBadge(f.statut) + '</td>' +
        '<td class="text-sm">' + UI.escapeHtml(f.cree_par || '-') + '</td>' +
        '<td class="actions">';
      if (f.statut === 'creee') {
        html += '<button class="btn btn-sm btn-warning btn-transmettre" data-id="' + f.id + '">Transmettre</button>';
      } else if (f.statut === 'transmise') {
        html += '<button class="btn btn-sm btn-success btn-scan-besoin" data-id="' + f.id + '">Scanner le retour</button>';
      } else if (f.statut === 'revenue') {
        html += '<button class="btn btn-sm btn-info btn-archiver-besoin" data-id="' + f.id + '">Archiver</button>';
      }
      html += '</td></tr>';
    }
    html += '</tbody></table></div>';
    el.innerHTML = html;

    el.querySelectorAll('.btn-transmettre').forEach(function(btn) {
      btn.addEventListener('click', function() { self._changeStatut(parseInt(this.dataset.id), 'transmise'); });
    });
    el.querySelectorAll('.btn-archiver-besoin').forEach(function(btn) {
      btn.addEventListener('click', function() { self._changeStatut(parseInt(this.dataset.id), 'archivee'); });
    });
    el.querySelectorAll('.btn-scan-besoin').forEach(function(btn) {
      btn.addEventListener('click', function() { self._scanRetour(parseInt(this.dataset.id)); });
    });
  },

  _changeStatut: function(id, statut) {
    var self = this;
    API.changeStatutFicheBesoin(id, statut)
      .then(function() { UI.toast('Statut mis a jour.', 'success'); self._load(); })
      .catch(function(err) { UI.toast(err.message, 'error'); });
  },

  _scanRetour: function(id) {
    var self = this;
    UI.pickFile(function(file) {
      if (!file) return;
      API.uploadScanFicheBesoin(id, file).then(function(data) {
        if (data && data.error) { UI.toast(data.error, 'error'); return; }
        UI.toast('Retour enregistre.', 'success');
        self._load();
      }).catch(function(err) { UI.toast(err.message, 'error'); });
    }, 'image/*,.pdf');
  },

  _showForm: function() {
    var self = this;
    self._lignes = [{ article_id: '', quantite: 1, article_nom: '' }];
    self._acLignes = [];

    var body =
      '<div class="form-group"><label class="form-label">Notes</label><input type="text" class="form-input" id="besoin-notes" placeholder="Optionnel"></div>' +
      '<div class="flex-between mb-sm"><strong>Articles souhaites</strong><button class="btn btn-sm btn-secondary" id="btn-add-besoin-line">+ Ajouter</button></div>' +
      '<div id="lignes-besoin"></div>';

    UI.modal('Nouvelle fiche de besoin', body, [
      { label: 'Annuler', cls: 'btn-secondary', callback: function(m) { m.close(); } },
      { label: 'Creer', cls: 'btn-primary', callback: function(m) { self._save(m); } }
    ]);

    document.getElementById('btn-add-besoin-line').addEventListener('click', function() {
      self._lignes.push({ article_id: '', quantite: 1, article_nom: '' });
      self._refreshLignes();
    });
    self._refreshLignes();
  },

  _refreshLignes: function() {
    var lc = document.getElementById('lignes-besoin');
    if (!lc) return;
    var h = '';
    for (var k = 0; k < this._lignes.length; k++) {
      h += '<div style="border:1px solid var(--color-border);border-radius:10px;padding:10px;margin-bottom:8px">' +
        '<div class="art-ac-besoin" data-idx="' + k + '"></div>' +
        '<div style="display:flex;gap:8px;align-items:center;margin-top:8px">' +
        '<input type="number" class="form-input qte-besoin" data-idx="' + k + '" value="' + (this._lignes[k].quantite || 1) + '" min="1" style="min-height:40px;width:110px">' +
        '<button class="btn btn-sm btn-danger btn-rm-besoin-line" data-idx="' + k + '" style="min-width:32px;min-height:40px">&times;</button>' +
        '</div></div>';
    }
    lc.innerHTML = h;
    this._bindLignes(lc);
  },

  _bindLignes: function(container) {
    var self = this;
    container.querySelectorAll('.art-ac-besoin').forEach(function(el) {
      var idx = parseInt(el.dataset.idx);
      var ac = UI.autocomplete(el, {
        items: [],
        placeholder: 'Rechercher un article...',
        search: function(term, cb) {
          API.getArticles({ search: term }).then(function(data) {
            cb(data.articles.map(function(a) { return { id: a.id, label: a.nom, meta: 'Stock: ' + a.stock_actuel }; }));
          }).catch(function() { cb([]); });
        },
        onSelect: function(item) {
          self._lignes[idx].article_id = item.id;
          self._lignes[idx].article_nom = item.label;
        }
      });
      self._acLignes[idx] = ac;
      if (self._lignes[idx] && self._lignes[idx].article_id) {
        ac.setItem({ id: self._lignes[idx].article_id, label: self._lignes[idx].article_nom || '' });
      }
    });
    container.querySelectorAll('.qte-besoin').forEach(function(el) {
      el.addEventListener('input', function() { self._lignes[parseInt(this.dataset.idx)].quantite = parseInt(this.value) || 1; });
    });
    container.querySelectorAll('.btn-rm-besoin-line').forEach(function(el) {
      el.addEventListener('click', function() {
        var idx = parseInt(this.dataset.idx);
        if (self._lignes.length <= 1) { UI.toast('Il faut au moins un article.', 'warning'); return; }
        self._lignes.splice(idx, 1);
        self._refreshLignes();
      });
    });
  },

  _save: function(modal) {
    var self = this;
    var articles = [];
    for (var i = 0; i < self._lignes.length; i++) {
      var l = self._lignes[i];
      if (!l.article_id) { UI.toast('Selectionnez un article pour chaque ligne.', 'error'); return; }
      articles.push({ article_id: parseInt(l.article_id), quantite: l.quantite || 1 });
    }

    var notes = document.getElementById('besoin-notes').value.trim() || null;
    API.createFicheBesoin({ notes: notes, articles: articles })
      .then(function(data) {
        UI.toast('Fiche de besoin creee : ' + data.fiche.reference, 'success');
        modal.close();
        self._load();
      })
      .catch(function(err) { UI.toast(err.message, 'error'); });
  }
};
