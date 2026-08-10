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
        '</tr><tr class="mvt-detail" id="mvt-detail-' + i + '" style="display:none"><td colspan="9"><div id="mvt-detail-body-' + i + '" style="background:var(--color-muted);padding:12px;border-radius:8px;font-size:0.875rem">' + self._buildDetail(m) + '</div></td></tr>';
    }
    html += '</tbody></table></div>';
    el.innerHTML = html;

    // Click to expand/collapse — charge le detail complet (fiche liee, articles, PDF) a la volee.
    el.querySelectorAll('.mvt-row').forEach(function(row) {
      row.addEventListener('click', function() {
        var idx = this.dataset.idx;
        var detail = document.getElementById('mvt-detail-' + idx);
        var icon = this.querySelector('.expand-icon');
        if (detail.style.display === 'none') {
          detail.style.display = '';
          icon.textContent = '▼';
          if (!detail.dataset.loaded) {
            detail.dataset.loaded = '1';
            self._loadDetail(mvts[idx].id, idx);
          }
        } else {
          detail.style.display = 'none';
          icon.textContent = '▶';
        }
      });
    });
  },

  _loadDetail: function(id, idx) {
    var body = document.getElementById('mvt-detail-body-' + idx);
    if (!body) return;
    API.getMouvementDetail(id).then(function(d) {
      body.innerHTML = Mouvements._renderRichDetail(d);
      var pdfBtn = body.querySelector('.mvt-pdf-btn');
      if (pdfBtn) {
        pdfBtn.addEventListener('click', function() {
          var url = this.getAttribute('data-url');
          var token = API.getToken();
          fetch(url, { headers: { 'Authorization': 'Bearer ' + token } })
            .then(function(r) { if (!r.ok) throw new Error('Erreur'); return r.blob(); })
            .then(function(blob) { var u = URL.createObjectURL(blob); window.open(u, '_blank'); setTimeout(function() { URL.revokeObjectURL(u); }, 1000); })
            .catch(function() { UI.toast('Erreur lors du chargement du PDF.', 'error'); });
        });
      }
    }).catch(function() { /* on garde le detail basique */ });
  },

  _renderRichDetail: function(d) {
    var m = d.mouvement;
    var h = '<div style="display:flex;flex-wrap:wrap;gap:24px">';
    h += '<div><strong>Motif :</strong> ' + UI.escapeHtml(m.motif || '-') + '<br>';
    if (m.fournisseur_nom) h += '<strong>Fournisseur :</strong> ' + UI.escapeHtml(m.fournisseur_nom) + '<br>';
    if (m.localite_nom) h += '<strong>Localité :</strong> ' + UI.escapeHtml(m.localite_nom) + '<br>';
    h += '<strong>Saisi par :</strong> ' + UI.escapeHtml(m.cree_par || '-') + '</div>';

    if (d.source && d.source.fiche) {
      var f = d.source.fiche;
      var titre = d.source.kind === 'sortie' ? 'Sortie' : 'Entrée';
      h += '<div style="flex:1;min-width:260px">';
      h += '<strong>' + titre + ' liée : ' + UI.escapeHtml(f.reference || '') + '</strong>';
      if (d.source.pdf_url) h += ' <button class="btn btn-sm btn-accent mvt-pdf-btn" data-url="' + UI.escapeHtml(d.source.pdf_url) + '" style="margin-left:8px">PDF</button>';
      if (d.source.lignes && d.source.lignes.length) {
        h += '<div class="table-wrapper" style="margin-top:6px"><table><thead><tr><th>Article</th><th>Unité</th><th>Qté</th><th>N° début</th><th>N° fin</th></tr></thead><tbody>';
        for (var i = 0; i < d.source.lignes.length; i++) {
          var l = d.source.lignes[i];
          h += '<tr><td>' + UI.escapeHtml(l.article_nom || '-') + '</td><td>' + UI.escapeHtml(UI.uniteLabel(l.unite)) + '</td><td>' + l.quantite + '</td><td>' + UI.escapeHtml(l.numero_debut || '-') + '</td><td>' + UI.escapeHtml(l.numero_fin || '-') + '</td></tr>';
        }
        h += '</tbody></table></div>';
      }
      h += '</div>';
    }
    h += '</div>';
    return h;
  },

  _buildDetail: function(m) {
    var detail = '<strong>Motif :</strong> ' + UI.escapeHtml(m.motif || '-') + '<br>';
    detail += '<span class="text-sm text-muted">Chargement du détail…</span>';
    return detail;
  }
};
