// public/js/retours.js — Retours de carnets (usages ou non utilises)
var Retours = {
  _articleAC: null,
  _numFieldsVisible: false,

  render: function(container) {
    container.innerHTML =
      '<div class="card">' +
      '<div class="card-header flex-between">' +
      '<h3 class="card-title">Retours de carnets</h3>' +
      '<button class="btn btn-primary" id="btn-new-retour">' +
      '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>' +
      ' Nouveau retour</button>' +
      '</div>' +
      '<div class="filter-bar">' +
      '<select class="form-select" id="retour-type"><option value="">Tous types</option><option value="usage">Usages (archives)</option><option value="non_utilise">Non utilises (remis en stock)</option></select>' +
      '<button class="btn btn-secondary btn-sm" id="btn-retours-refresh">Actualiser</button>' +
      '</div>' +
      '<p class="text-sm text-muted mb-md">Les carnets reviennent des agences : <strong>usages</strong> (a archiver) ou <strong>non utilises</strong> (remis en stock automatiquement).</p>' +
      '<div id="retours-table">' + UI.renderSkeleton(6) + '</div>' +
      '</div>';

    this._load();
    this._bindEvents();
  },

  _bindEvents: function() {
    var self = this;
    document.getElementById('btn-new-retour').addEventListener('click', function() { self._showForm(); });
    document.getElementById('retour-type').addEventListener('change', function() { self._load(); });
    document.getElementById('btn-retours-refresh').addEventListener('click', function() { self._load(); });
  },

  _load: function() {
    var self = this;
    var params = {};
    var t = document.getElementById('retour-type').value;
    if (t) params.type_retour = t;

    API.getRetours(params).then(function(data) { self._renderTable(data.retours); })
      .catch(function(err) {
        document.getElementById('retours-table').innerHTML = '<div class="empty-state"><p>' + UI.escapeHtml(err.message) + '</p></div>';
      });
  },

  _renderTable: function(retours) {
    var el = document.getElementById('retours-table');
    if (!retours || !retours.length) { el.innerHTML = UI.renderEmptyState('Aucun retour de carnet', 'Enregistrer un retour', '#'); return; }

    var html = '<div class="table-wrapper"><table><thead><tr>' +
      '<th>Date</th><th>Article</th><th>Agence</th><th>Type</th><th>Qte</th><th>N° debut</th><th>N° fin</th><th>Motif</th><th>Saisi par</th>' +
      '</tr></thead><tbody>';

    for (var i = 0; i < retours.length; i++) {
      var r = retours[i];
      var usage = r.type_retour === 'usage';
      html += '<tr>' +
        '<td>' + UI.formatDate(r.date_retour) + '</td>' +
        '<td><strong>' + UI.escapeHtml(r.article_nom || '-') + '</strong><br><span class="text-sm text-muted">' + UI.escapeHtml(r.reference || '') + '</span></td>' +
        '<td>' + UI.escapeHtml(r.localite_nom || '-') + '</td>' +
        '<td><span class="badge ' + (usage ? 'badge-neutral' : 'badge-success') + '">' + (usage ? 'Usage' : 'Non utilise') + '</span></td>' +
        '<td><strong>' + r.quantite + '</strong></td>' +
        '<td>' + UI.escapeHtml(r.numero_debut || '-') + '</td>' +
        '<td>' + UI.escapeHtml(r.numero_fin || '-') + '</td>' +
        '<td>' + UI.escapeHtml(r.motif || '-') + '</td>' +
        '<td>' + UI.escapeHtml(r.username || '-') + '</td>' +
        '</tr>';
    }
    html += '</tbody></table></div>';
    el.innerHTML = html;
  },

  _showForm: function() {
    var self = this;
    Promise.all([API.getArticles(), API.getLocalites()]).then(function(results) {
      var articles = results[0].articles;
      var localites = results[1].localites;

      self._articleItems = articles.map(function(a) {
        return { id: a.id, label: a.nom, meta: 'Stock: ' + a.stock_actuel + ' ' + a.unite, type: a.type_article };
      });

      var locOptions = '<option value="">— Siege / aucune —</option>';
      for (var i = 0; i < localites.length; i++) {
        var l = localites[i];
        if (l.est_service) continue; // retour depuis une agence
        locOptions += '<option value="' + l.id + '">' + UI.escapeHtml(l.nom) + '</option>';
      }

      var body =
        '<div class="form-group"><label class="form-label">Article (carnet) *</label><div id="retour-art-ac"></div></div>' +
        '<div class="form-group"><label class="form-label">Agence de provenance</label><select class="form-select" id="retour-loc">' + locOptions + '</select></div>' +
        '<div class="form-row">' +
        '<div class="form-group"><label class="form-label">Type de retour *</label><select class="form-select" id="retour-type-form"><option value="usage">Usage (archive)</option><option value="non_utilise">Non utilise (remis en stock)</option></select></div>' +
        '<div class="form-group"><label class="form-label">Quantite *</label><input type="number" class="form-input" id="retour-qte" value="1" min="1" required></div>' +
        '</div>' +
        '<div class="form-row" id="retour-num-fields" style="display:none">' +
        '<div class="form-group"><label class="form-label">N° debut</label><input type="text" class="form-input" id="retour-num-debut" placeholder="Ex: 160001"></div>' +
        '<div class="form-group"><label class="form-label">N° fin</label><input type="text" class="form-input" id="retour-num-fin" placeholder="Ex: 160050"></div>' +
        '</div>' +
        '<div class="form-group"><label class="form-label">Motif / observation</label><input type="text" class="form-input" id="retour-motif" placeholder="Optionnel"></div>';

      UI.modal('Nouveau retour de carnet', body, [
        { label: 'Annuler', cls: 'btn-secondary', callback: function(m) { m.close(); } },
        { label: 'Enregistrer', cls: 'btn-primary', callback: function(m) { self._saveRetour(m); } }
      ]);

      self._articleAC = UI.autocomplete(document.getElementById('retour-art-ac'), {
        items: self._articleItems,
        placeholder: 'Rechercher un article...',
        onSelect: function(item) {
          self._numFieldsVisible = item.type === 'numerote';
          document.getElementById('retour-num-fields').style.display = self._numFieldsVisible ? 'grid' : 'none';
        }
      });
    }).catch(function(err) { UI.toast(err.message, 'error'); });
  },

  _saveRetour: function(modal) {
    var art = this._articleAC ? this._articleAC.value() : null;
    if (!art) { UI.toast('Selectionnez un article.', 'error'); return; }

    var qte = parseInt(document.getElementById('retour-qte').value, 10);
    if (isNaN(qte) || qte < 1) { UI.toast('Quantite invalide.', 'error'); return; }

    var data = {
      article_id: art.id,
      localite_id: parseInt(document.getElementById('retour-loc').value) || null,
      type_retour: document.getElementById('retour-type-form').value,
      quantite: qte,
      motif: document.getElementById('retour-motif').value.trim() || null
    };
    if (this._numFieldsVisible) {
      data.numero_debut = document.getElementById('retour-num-debut').value.trim() || null;
      data.numero_fin = document.getElementById('retour-num-fin').value.trim() || null;
    }

    var self = this;
    API.createRetour(data)
      .then(function(r) {
        var remis = r.retour && r.retour.type_retour === 'non_utilise';
        UI.toast(remis ? 'Retour enregistre. Articles remis en stock.' : 'Retour enregistre (archive).', 'success');
        modal.close();
        self._load();
      })
      .catch(function(err) { UI.toast(err.message, 'error'); });
  }
};
