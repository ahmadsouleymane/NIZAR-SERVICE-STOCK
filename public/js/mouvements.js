// public/js/mouvements.js — Historique des mouvements (entrées + sorties)
var Mouvements = {
  _offset: 0,
  _all: [],
  _hasMore: true,

  render: function(container) {
    this._offset = 0;
    this._all = [];
    this._hasMore = true;

    container.innerHTML =
      '<div class="card">' +
      '<div class="card-header">' +
      '<h3 class="card-title">Historique des mouvements</h3>' +
      '</div>' +
      '<div class="filter-bar">' +
      '<input type="date" class="form-input" id="filtre-debut" placeholder="Du..." style="min-width:130px">' +
      '<input type="date" class="form-input" id="filtre-fin" placeholder="Au..." style="min-width:130px">' +
      '<select class="form-select" id="filtre-type"><option value="">Tous types</option><option value="entree">Entrées</option><option value="sortie">Sorties</option></select>' +
      '<select class="form-select" id="filtre-article-mvt"><option value="">Tous articles</option></select>' +
      '<button class="btn btn-secondary btn-sm" id="btn-refresh">Actualiser</button>' +
      '</div>' +
      '<div id="mouvements-summary" class="summary-box">' +
      '<div class="summary-item">Entrées: <strong id="sum-entrees">-</strong></div>' +
      '<div class="summary-item">Sorties: <strong id="sum-sorties">-</strong></div>' +
      '<div class="summary-item">Solde: <strong id="sum-solde">-</strong></div>' +
      '</div>' +
      '<div id="mouvements-table">' + UI.renderSkeleton(10) + '</div>' +
      '<div id="mouvements-more" class="text-center mt-md"></div>' +
      '</div>';

    this._loadArticles();
    this._loadMouvements(true);
    this._bindEvents();
  },

  _bindEvents: function() {
    var self = this;
    document.getElementById('btn-refresh').addEventListener('click', function() { self._loadMouvements(true); });
    document.getElementById('filtre-type').addEventListener('change', function() { self._loadMouvements(true); });
    document.getElementById('filtre-article-mvt').addEventListener('change', function() { self._loadMouvements(true); });
  },

  _loadArticles: function() {
    API.getArticles().then(function(d) {
      var sel = document.getElementById('filtre-article-mvt');
      for (var i = 0; i < d.articles.length; i++) {
        var opt = document.createElement('option');
        opt.value = d.articles[i].id;
        opt.textContent = d.articles[i].nom;
        sel.appendChild(opt);
      }
    }).catch(function() {});
  },

  _loadMouvements: function(reset) {
    var self = this;
    if (reset) { this._offset = 0; this._all = []; this._hasMore = true; }

    var params = {
      debut: document.getElementById('filtre-debut').value,
      fin: document.getElementById('filtre-fin').value,
      offset: this._offset
    };
    var type = document.getElementById('filtre-type').value;
    if (type) params.type = type;
    var art = document.getElementById('filtre-article-mvt').value;
    if (art) params.article_id = art;

    API.getMouvements(params)
      .then(function(data) {
        if (reset) self._all = data.mouvements;
        else self._all = self._all.concat(data.mouvements);
        self._hasMore = data.mouvements.length >= 50;
        self._offset += data.mouvements.length;
        self._renderTable(self._all);
        self._renderMore();
        document.getElementById('sum-entrees').textContent = UI.formatNumber(data.totals.total_entrees);
        document.getElementById('sum-sorties').textContent = UI.formatNumber(data.totals.total_sorties);
        var solde = data.totals.total_entrees - data.totals.total_sorties;
        var soldeEl = document.getElementById('sum-solde');
        soldeEl.textContent = UI.formatNumber(solde);
        soldeEl.className = solde >= 0 ? 'text-success' : 'text-danger';
      })
      .catch(function(err) {
        document.getElementById('mouvements-table').innerHTML = '<div class="empty-state"><h3>Erreur</h3><p>' + UI.escapeHtml(err.message) + '</p></div>';
      });
  },

  _renderMore: function() {
    var el = document.getElementById('mouvements-more');
    if (!el) return;
    if (!this._hasMore) { el.innerHTML = ''; return; }
    var self = this;
    el.innerHTML = '<button class="btn btn-secondary btn-sm" id="btn-mvts-more">Voir plus</button>';
    document.getElementById('btn-mvts-more').addEventListener('click', function() { self._loadMouvements(false); });
  },

  _renderTable: function(mvts) {
    var el = document.getElementById('mouvements-table');
    if (!mvts || !mvts.length) {
      el.innerHTML = UI.renderEmptyState('Aucun mouvement sur cette periode');
      return;
    }

    var self = this;
    var html = '<div class="table-wrapper"><table><thead><tr>' +
      '<th></th><th>Date</th><th>Article</th><th>Type</th><th>Qté</th><th>N° début</th><th>N° fin</th><th>Localité</th><th>Saisi par</th>' +
      '</tr></thead><tbody>';

    for (var i = 0; i < mvts.length; i++) {
      var m = mvts[i];
      var localite = m.localite_nom || '-';
      if (m.fiche_reference) localite += ' <span class="text-sm text-muted">(' + UI.escapeHtml(m.fiche_reference) + ')</span>';
      html += '<tr class="mvt-row" data-idx="' + i + '" style="cursor:pointer">' +
        '<td><span class="expand-icon">▶</span></td>' +
        '<td>' + UI.formatDate(m.date) + '</td>' +
        '<td><strong>' + UI.escapeHtml(m.article_nom || '-') + '</strong><br><span class="text-sm text-muted">' + UI.escapeHtml(m.article_reference || '') + '</span></td>' +
        '<td><span class="badge ' + (m.type === 'entree' ? 'badge-success' : 'badge-warning') + '">' + (m.type === 'entree' ? 'Entrée' : 'Sortie') + '</span></td>' +
        '<td><strong>' + m.quantite + '</strong></td>' +
        '<td>' + UI.escapeHtml(m.numero_debut || '-') + '</td>' +
        '<td>' + UI.escapeHtml(m.numero_fin || '-') + '</td>' +
        '<td>' + localite + '</td>' +
        '<td>' + UI.escapeHtml(m.username || '-') + '</td>' +
        '</tr><tr class="mvt-detail" id="mvt-detail-' + i + '" style="display:none"><td colspan="9">' + self._buildDetail(m) + '</td></tr>';
    }
    html += '</tbody></table></div>';
    el.innerHTML = html;

    // Click to expand/collapse
    el.querySelectorAll('.mvt-row').forEach(function(row) {
      row.addEventListener('click', function() {
        var idx = this.dataset.idx;
        var detail = document.getElementById('mvt-detail-' + idx);
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
  },

  _buildDetail: function(m) {
    var detail = '<div style="background:var(--color-muted);padding:12px;border-radius:8px;font-size:0.875rem">';
    detail += '<strong>Motif :</strong> ' + UI.escapeHtml(m.motif || '-') + '<br>';
    if (m.fournisseur_nom) detail += '<strong>Fournisseur :</strong> ' + UI.escapeHtml(m.fournisseur_nom) + '<br>';
    if (m.demandeur) detail += '<strong>Demandeur :</strong> ' + UI.escapeHtml(m.demandeur) + '<br>';
    if (m.fiche_id) {
      detail += '<strong>Fiche liée :</strong> <a href="#fiches" style="color:var(--color-primary)" class="link-to-fiche" data-id="' + m.fiche_id + '">' + UI.escapeHtml(m.fiche_reference || 'Fiche #' + m.fiche_id) + '</a><br>';
    }
    detail += '</div>';
    return detail;
  }
};
