// public/js/souches.js — Recherche et filtrage des numeros de souche (billets / carnets)
var Souches = {
  _articles: [],
  _localites: [],

  render: function(container) {
    container.innerHTML =
      '<div class="card">' +
      '<div class="card-header"><h3 class="card-title">Recherche de numero de souche</h3></div>' +
      '<p class="text-sm text-muted mb-md">Recherchez un numero precis ou filtrez par article, localite, statut ou periode pour retrouver un billet / carnet.</p>' +

      // Barre de recherche rapide par numero
      '<div class="flex-between gap-sm mb-md">' +
      '<input type="number" class="form-input" id="souche-numero" placeholder="Recherche exacte : entrer un numero..." style="min-width:200px" inputmode="numeric">' +
      '<button class="btn btn-primary" id="btn-souche-search">Rechercher</button>' +
      '</div>' +

      // Filtres
      '<div class="filter-bar mb-md">' +
      '<select class="form-select" id="filtre-souche-article"><option value="">Tous les articles</option></select>' +
      '<select class="form-select" id="filtre-souche-localite"><option value="">Toutes localites</option></select>' +
      '<select class="form-select" id="filtre-souche-type"><option value="">Tous types</option><option value="entree">Entrees</option><option value="sortie">Sorties</option><option value="retour">Retours</option></select>' +
      '<input type="date" class="form-input" id="filtre-souche-debut" placeholder="Du..." style="min-width:130px">' +
      '<input type="date" class="form-input" id="filtre-souche-fin" placeholder="Au..." style="min-width:130px">' +
      '<button class="btn btn-secondary btn-sm" id="btn-souche-filter">Filtrer</button>' +
      '</div>' +

      '<div id="souche-result" class="mt-md"></div>' +
      '</div>';

    this._loadFilters();
    this._bindEvents();
  },

  _bindEvents: function() {
    var self = this;
    document.getElementById('btn-souche-search').addEventListener('click', function() { self._search(); });
    document.getElementById('souche-numero').addEventListener('keydown', function(e) {
      if (e.key === 'Enter') self._search();
    });
    document.getElementById('btn-souche-filter').addEventListener('click', function() { self._filterList(); });
  },

  _loadFilters: function() {
    var self = this;
    API.getArticles().then(function(d) {
      // Seuls les articles a numero de souche (billets/carnets/bons) ont leur place ici.
      self._articles = d.articles.filter(function(a) { return a.type_article === 'numerote'; });
      var sel = document.getElementById('filtre-souche-article');
      for (var i = 0; i < self._articles.length; i++) {
        var opt = document.createElement('option');
        opt.value = self._articles[i].id;
        opt.textContent = self._articles[i].nom;
        sel.appendChild(opt);
      }
    }).catch(function() {});
    API.getLocalites().then(function(d) {
      self._localites = d.localites;
      var sel = document.getElementById('filtre-souche-localite');
      for (var j = 0; j < d.localites.length; j++) {
        var opt = document.createElement('option');
        opt.value = d.localites[j].id;
        opt.textContent = d.localites[j].nom;
        sel.appendChild(opt);
      }
    }).catch(function() {});
  },

  _filterList: function() {
    var params = {};
    var art = document.getElementById('filtre-souche-article').value;
    var loc = document.getElementById('filtre-souche-localite').value;
    var type = document.getElementById('filtre-souche-type').value;
    var debut = document.getElementById('filtre-souche-debut').value;
    var fin = document.getElementById('filtre-souche-fin').value;
    if (art) params.article_id = art;
    if (loc) params.localite_id = loc;
    if (type) params.source_type = type;
    if (debut) params.debut = debut;
    if (fin) params.fin = fin;

    var result = document.getElementById('souche-result');
    result.innerHTML = UI.renderSkeleton(4);

    var self = this;
    API.getSeries(params)
      .then(function(data) {
        if (!data.series.length) {
          result.innerHTML = '<div class="empty-state"><h3>Aucune serie</h3><p>Aucune plage de numero ne correspond a ces filtres.</p></div>';
          return;
        }
        self._renderTable(data.series);
      })
      .catch(function(err) {
        result.innerHTML = '<div class="empty-state"><h3>Erreur</h3><p>' + UI.escapeHtml(err.message) + '</p></div>';
      });
  },

  _renderTable: function(series) {
    var html = '<div class="table-wrapper"><table><thead><tr>' +
      '<th></th><th>Date</th><th>Article</th><th>Type</th><th>Plage</th><th>Qte</th><th>Localite</th><th>Fiche</th>' +
      '</tr></thead><tbody>';

    for (var i = 0; i < series.length; i++) {
      var s = series[i];
      var typeBadge = s.source_type === 'entree'
        ? '<span class="badge badge-success">Entree</span>'
        : (s.source_type === 'sortie'
          ? '<span class="badge badge-warning">Sortie</span>'
          : '<span class="badge badge-info">Retour</span>');
      html += '<tr class="serie-row" data-idx="' + i + '" style="cursor:pointer">' +
        '<td><span class="expand-icon">▶</span></td>' +
        '<td>' + UI.formatDate(s.date) + '</td>' +
        '<td><strong>' + UI.escapeHtml(s.article_nom || '-') + '</strong></td>' +
        '<td>' + typeBadge + '</td>' +
        '<td style="font-family:var(--font-heading);font-size:0.8rem">' + (s.numero_debut ? UI.escapeHtml(s.numero_debut) + ' — ' + UI.escapeHtml(s.numero_fin) : '-') + '</td>' +
        '<td>' + s.quantite + '</td>' +
        '<td>' + UI.escapeHtml(s.localite_nom || '-') + '</td>' +
        '<td>' + UI.escapeHtml(s.fiche_reference || '-') + '</td>' +
        '</tr><tr class="serie-detail" id="serie-detail-' + i + '" style="display:none"><td colspan="8">' +
        '<div style="background:var(--color-muted);padding:12px;border-radius:8px;font-size:0.875rem">' +
        '<strong>Plage complète :</strong> <span style="font-family:var(--font-heading)">' + UI.escapeHtml(s.numero_debut || '') + ' — ' + UI.escapeHtml(s.numero_fin || '') + '</span><br>' +
        '<strong>Type :</strong> ' + UI.escapeHtml(s.source_type) + '<br>' +
        (s.localite_nom ? '<strong>Localité :</strong> ' + UI.escapeHtml(s.localite_nom) + '<br>' : '') +
        (s.fiche_reference ? '<strong>Fiche liée :</strong> <a href="#fiches" style="color:var(--color-primary)">' + UI.escapeHtml(s.fiche_reference) + '</a><br>' : '') +
        '<strong>Réf. article :</strong> ' + UI.escapeHtml(s.reference || '-') +
        '</div></td></tr>';
    }
    html += '</tbody></table></div>';
    document.getElementById('souche-result').innerHTML = html;

    // Click to expand/collapse
    document.getElementById('souche-result').querySelectorAll('.serie-row').forEach(function(row) {
      row.addEventListener('click', function() {
        var idx = this.dataset.idx;
        var detail = document.getElementById('serie-detail-' + idx);
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

  _search: function() {
    var numero = document.getElementById('souche-numero').value.trim();
    if (!numero) { UI.toast('Entrez un numero de souche.', 'error'); return; }

    var result = document.getElementById('souche-result');
    result.innerHTML = UI.renderSkeleton(3);

    API.searchSerie(numero)
      .then(function(data) {
        if (!data.series.length) {
          result.innerHTML = '<div class="empty-state"><h3>Numero inconnu</h3><p>Le numero ' + UI.escapeHtml(String(data.numero)) + ' ne correspond a aucune serie enregistree.</p></div>';
          return;
        }

        var article = data.series[0].article_nom || '-';
        var ref = data.series[0].reference || '';
        var regimeLabel = data.regime === 'point_de_vente'
          ? '<span class="badge badge-info">Point de vente</span><span class="text-sm text-muted" style="margin-left:6px">Numerotation independante par localite</span>'
          : '<span class="badge badge-success">Standard</span><span class="text-sm text-muted" style="margin-left:6px">Suite continue entre agences</span>';

        var html = '<div class="card" style="background:var(--color-muted);border:none">' +
          '<div class="flex-between"><div><strong>Numero :</strong> <span style="font-family:var(--font-heading);font-size:1.1rem">' + UI.escapeHtml(String(data.numero)) + '</span></div>' +
          '<div>' + regimeLabel + '</div></div>' +
          '<div class="flex-between mt-sm"><div><strong>Article :</strong> ' + UI.escapeHtml(article) + ' <span class="text-sm text-muted">(' + UI.escapeHtml(ref) + ')</span></div>';

        var statutBadge = '';
        if (data.statut.code === 'en_stock') statutBadge = '<span class="badge badge-success">En stock</span>';
        else if (data.statut.code === 'envoye') statutBadge = '<span class="badge badge-warning">Envoye</span>';
        else statutBadge = '<span class="badge badge-neutral">Usage (archive)</span>';

        html += '<div><strong>Statut actuel :</strong> ' + statutBadge + ' ' + UI.escapeHtml(data.statut.label) + '</div></div></div>';

        // Positions du numero dans ses plages
        if (data.positions && data.positions.length) {
          html += '<div class="card mt-sm" style="border-left:3px solid var(--color-teal)">' +
            '<h4 style="margin:0 0 0.5rem 0">Position du billet</h4>';
          for (var p = 0; p < data.positions.length; p++) {
            var pos = data.positions[p];
            html += '<div class="flex-between" style="padding:0.25rem 0">' +
              '<span>Billet <strong>n°' + pos.index + '</strong> sur ' + pos.total + ' du carnet <span style="font-family:var(--font-heading)">' + pos.debut + ' — ' + pos.fin + '</span></span>';
            if (pos.localite) {
              html += '<span class="badge badge-info">' + UI.escapeHtml(pos.localite) + '</span>';
            }
            html += '</div>';
          }
          html += '</div>';
        }

        // Trace chronologique
        html += '<div class="table-wrapper mt-sm"><table><thead><tr><th>Date</th><th>Evenement</th><th>Plage</th><th>Qte</th><th>Details</th></tr></thead><tbody>';
        for (var i = 0; i < data.series.length; i++) {
          var s = data.series[i];
          var evt = '';
          var det = '';
          if (s.source_type === 'entree') {
            evt = '<span class="badge badge-success">Entree</span>';
            det = s.fournisseur_nom ? 'Fournisseur : ' + UI.escapeHtml(s.fournisseur_nom) : 'Reception';
            if (s.entree_reference) det += '<br><span class="text-sm text-muted">Fiche ' + UI.escapeHtml(s.entree_reference) + '</span>';
            if (s.numero_bl) det += '<br><span class="text-sm">BL ' + UI.escapeHtml(s.numero_bl) + '</span>';
          } else if (s.source_type === 'sortie') {
            evt = '<span class="badge badge-warning">Sortie</span>';
            det = s.localite_nom ? '<strong>' + UI.escapeHtml(s.localite_nom) + '</strong>' : '-';
            if (s.destinataire) det += ' — ' + UI.escapeHtml(s.destinataire);
            if (s.fiche_reference) det += '<br><span class="text-sm text-muted">Fiche ' + UI.escapeHtml(s.fiche_reference) + '</span>';
            if (s.date_envoi) det += '<br><span class="text-sm">Envoye le ' + UI.formatDate(s.date_envoi) + '</span>';
            if (s.fiche_statut) det += ' <span class="badge badge-sm">' + UI.escapeHtml(s.fiche_statut) + '</span>';
          } else {
            evt = s.type_retour === 'non_utilise'
              ? '<span class="badge badge-success">Retour (en stock)</span>'
              : '<span class="badge badge-neutral">Retour usage</span>';
            det = s.type_retour === 'non_utilise' ? 'Remis en stock' : 'Archive';
            if (s.date_retour) det += '<br><span class="text-sm">Le ' + UI.formatDate(s.date_retour) + '</span>';
          }
          html += '<tr>' +
            '<td>' + UI.formatDate(s.date) + '</td>' +
            '<td>' + evt + '</td>' +
            '<td style="font-family:var(--font-heading);font-size:0.8rem">' + UI.escapeHtml(s.numero_debut) + ' — ' + UI.escapeHtml(s.numero_fin) + '</td>' +
            '<td>' + s.quantite + '</td>' +
            '<td>' + det + '</td>' +
            '</tr>';
        }
        html += '</tbody></table></div>';
        result.innerHTML = html;
      })
      .catch(function(err) {
        result.innerHTML = '<div class="empty-state"><h3>Erreur</h3><p>' + UI.escapeHtml(err.message) + '</p></div>';
      });
  }
};
