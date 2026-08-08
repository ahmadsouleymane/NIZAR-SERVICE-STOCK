// public/js/reportui.js — Helpers partagés du centre de rapports
// Barre de filtres, KPI, graphiques Chart.js, tableaux détaillés.
// Toutes les couleurs proviennent de la charte Nizar (turquoise / noir marque).

var ReportUI = {

  // Palette charte Nizar (dérivée des tokens CSS)
  palette: {
    entree: '#0EA5A0',        // turquoise Nizar
    sortie: '#111827',        // noir marque
    alerte: '#D97706',
    rupture: '#DC2626',
    ok: '#16A34A',
    cat: ['#0EA5A0', '#111827', '#D97706', '#16A34A', '#0B8A86', '#6B7280', '#DC2626', '#8B5CF6']
  },

  _charts: [],

  // Applique le thème Chart.js (typographie et couleurs de l'app)
  applyTheme: function() {
    if (window.Chart) {
      Chart.defaults.font.family = "'Fira Sans', system-ui, -apple-system, sans-serif";
      Chart.defaults.color = '#6B7280';
      Chart.defaults.borderColor = '#E5E7EB';
    }
  },

  destroyCharts: function() {
    for (var i = 0; i < this._charts.length; i++) {
      if (this._charts[i]) this._charts[i].destroy();
    }
    this._charts = [];
  },

  dimLabel: function(g) {
    var map = {
      jour: 'Jour', mois: 'Mois', article: 'Article', categorie: 'Catégorie',
      localite: 'Agence', fournisseur: 'Fournisseur', type: 'Type',
      utilisateur: 'Utilisateur', unite: 'Unité', statut: 'Statut'
    };
    return map[g] || g;
  },

  fmtLabel: function(gb, v) {
    if (!v) return v;
    if (gb === 'mois') { var p = String(v).split('-'); return p.length === 2 ? p[1] + '/' + p[0] : v; }
    if (gb === 'jour') { var d = String(v).split('-'); return d.length === 3 ? d[2] + '/' + d[1] : v; }
    return v;
  },

  fmtVal: function(fmt, v) {
    if (v === null || v === undefined) return '-';
    if (fmt === 'fcfa') return UI.formatPrice(v);
    if (fmt === 'num') return UI.formatNumber(v);
    if (fmt === 'dec') return Number(v).toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    if (fmt === 'date') return UI.formatDate(v);
    return String(v);
  },

  // <select> à partir de [{value,label}]
  select: function(id, options, current, emptyLabel) {
    var html = '<select class="form-input" id="' + id + '">';
    html += '<option value="">' + (emptyLabel || '— Tous —') + '</option>';
    for (var i = 0; i < options.length; i++) {
      var sel = String(current) === String(options[i].value) ? ' selected' : '';
      html += '<option value="' + UI.escapeHtml(options[i].value) + '"' + sel + '>' + UI.escapeHtml(options[i].label) + '</option>';
    }
    html += '</select>';
    return html;
  },

  // Barre de filtres : rend les champs selon cfg.filters, valeurs dans st
  renderFilters: function(meta, cfg, st) {
    var self = this;
    var has = function(f) { return cfg.filters.indexOf(f) !== -1; };
    var html = '';
    if (has('dates')) {
      html += '<div class="form-group"><label class="form-label">Du</label><input type="date" class="form-input" id="rf-debut" value="' + st.debut + '"></div>';
      html += '<div class="form-group"><label class="form-label">Au</label><input type="date" class="form-input" id="rf-fin" value="' + st.fin + '"></div>';
    }
    if (has('article')) {
      html += '<div class="form-group"><label class="form-label">Article</label>' + this.select('rf-article',
        (meta.articles || []).map(function(a) { return { value: a.id, label: a.reference + ' — ' + a.nom }; }), st.article_id) + '</div>';
    }
    if (has('categorie')) {
      html += '<div class="form-group"><label class="form-label">Catégorie</label>' + this.select('rf-categorie',
        (meta.categories || []).map(function(c) { return { value: c.id, label: c.name }; }), st.categorie_id) + '</div>';
    }
    if (has('localite')) {
      html += '<div class="form-group"><label class="form-label">Agence</label>' + this.select('rf-localite',
        (meta.localites || []).map(function(l) { return { value: l.id, label: l.nom }; }), st.localite_id) + '</div>';
    }
    if (has('fournisseur')) {
      html += '<div class="form-group"><label class="form-label">Fournisseur</label>' + this.select('rf-fournisseur',
        (meta.fournisseurs || []).map(function(f) { return { value: f.id, label: f.nom }; }), st.fournisseur_id) + '</div>';
    }
    if (has('type')) {
      html += '<div class="form-group"><label class="form-label">Type</label>' + this.select('rf-type',
        [{ value: 'entree', label: 'Entrée' }, { value: 'sortie', label: 'Sortie' }], st.type) + '</div>';
    }
    if (has('user')) {
      html += '<div class="form-group"><label class="form-label">Utilisateur</label>' + this.select('rf-user',
        (meta.users || []).map(function(u) { return { value: u.id, label: u.username }; }), st.user_id) + '</div>';
    }
    if (has('seuil')) {
      html += '<div class="form-group"><label class="form-label">Sans mouvement depuis (j)</label><input type="number" min="1" max="365" class="form-input" id="rf-seuil" value="' + (st.stock_min_jours || 30) + '"></div>';
    }
    if (has('jours')) {
      html += '<div class="form-group"><label class="form-label">Fenêtre (jours)</label><input type="number" min="1" max="730" class="form-input" id="rf-jours" value="' + (st.jours || 90) + '"></div>';
    }
    if (has('groupby') && cfg.groupByOptions) {
      var gopts = cfg.groupByOptions.map(function(g) { return { value: g, label: self.dimLabel(g) }; });
      html += '<div class="form-group"><label class="form-label">Regrouper par</label>' + this.select('rf-groupby', gopts, st.group_by) + '</div>';
    }
    if (has('limit') && cfg.topN) {
      var lopts = cfg.topN.map(function(n) { return n === 0 ? { value: '0', label: 'Tout' } : { value: String(n), label: 'Top ' + n }; });
      html += '<div class="form-group"><label class="form-label">Limite</label>' + this.select('rf-limit', lopts, String(st.limit === '' ? (cfg.topN[0] || '') : st.limit)) + '</div>';
    }
    html += '<button type="button" class="btn btn-secondary" id="rf-reset">Réinitialiser</button>';
    return html;
  },

  // Ligne de KPI
  renderKpis: function(container, kpis, totals) {
    var html = '';
    for (var i = 0; i < kpis.length; i++) {
      var k = kpis[i];
      var v = totals ? totals[k.key] : null;
      html += '<div class="kpi-card report-kpi"><div class="kpi-card-header"><span>' + UI.escapeHtml(k.label) + '</span></div>' +
        '<div class="kpi-card-value">' + this.fmtVal(k.fmt, v) + '</div></div>';
    }
    container.innerHTML = html;
  },

  // Construit labels + datasets pour Chart.js
  chartData: function(rows, cfg, gb) {
    var self = this;
    var labels = rows.map(function(r) { return self.fmtLabel(gb, r.libelle); });
    var datasets = [];
    for (var i = 0; i < (cfg.datasets || []).length; i++) {
      var ds = cfg.datasets[i];
      var color = ds.color || this.palette.cat[i % this.palette.cat.length];
      var isDough = cfg.type === 'doughnut';
      datasets.push({
        label: ds.label,
        data: rows.map(function(r) { return r[ds.key] === null || r[ds.key] === undefined ? null : r[ds.key]; }),
        backgroundColor: isDough ? this.palette.cat.slice(0, rows.length).concat(this.palette.cat.slice(0, Math.max(0, rows.length - this.palette.cat.length))) : color,
        borderColor: isDough ? '#FFFFFF' : color,
        borderWidth: isDough ? 2 : (cfg.type === 'line' ? 2 : 1),
        fill: cfg.type === 'line' ? (ds.fill || false) : false,
        tension: cfg.type === 'line' ? 0.3 : 0,
        stack: ds.stack,
        borderRadius: (cfg.type === 'bar' || cfg.type === 'hbar' || cfg.type === 'stacked') ? 4 : 0,
        maxBarThickness: 34
      });
    }
    return { labels: labels, datasets: datasets };
  },

  renderChart: function(container, cfg, rows) {
    if (!window.Chart) {
      container.innerHTML = '<p class="text-sm text-muted">Graphiques indisponibles (Chart.js non chargé).</p>';
      return;
    }
    if (!rows || !rows.length) {
      container.innerHTML = '';
      return;
    }
    var gb = cfg.groupByCurrent || cfg.groupBy || '';
    var data = this.chartData(rows, cfg, gb);
    var isHbar = cfg.type === 'hbar';
    var isDough = cfg.type === 'doughnut';
    var isStacked = cfg.type === 'stacked';
    var isLine = cfg.type === 'line';
    var chartType = isHbar ? 'bar' : (isDough ? 'doughnut' : (isLine ? 'line' : 'bar'));

    container.innerHTML = '';
    var canvas = document.createElement('canvas');
    container.appendChild(canvas);

    var chart = new Chart(canvas.getContext('2d'), {
      type: chartType,
      data: data,
      options: {
        responsive: true,
        maintainAspectRatio: false,
        indexAxis: isHbar ? 'y' : 'x',
        plugins: {
          legend: {
            position: isDough ? 'right' : 'bottom',
            labels: { boxWidth: 12, font: { size: 11 } }
          },
          tooltip: {
            callbacks: {
              label: function(ctx2) {
                var val = ctx2.parsed && ctx2.parsed.y !== undefined ? ctx2.parsed.y : ctx2.parsed;
                var ds = cfg.datasets[ctx2.datasetIndex];
                return ' ' + (ds ? ds.label : '') + ' : ' + UI.formatNumber(val) + (ds && ds.fcfa ? ' F' : '');
              }
            }
          }
        },
        scales: isDough ? {} : {
          x: { stacked: isStacked, grid: { color: '#E5E7EB' } },
          y: { stacked: isStacked, beginAtZero: true, grid: { color: '#E5E7EB' } }
        }
      }
    });
    this._charts.push(chart);
  },

  // Tableau détaillé + ligne de total
  renderTable: function(container, columns, rows, totals, emptyMsg) {
    if ((!rows || !rows.length) && !totals) {
      container.innerHTML = UI.renderEmptyState(emptyMsg || 'Aucune donnée sur la période.');
      return;
    }
    rows = rows || [];
    var html = '<div class="table-wrapper report-table"><table><thead><tr>';
    for (var i = 0; i < columns.length; i++) html += '<th>' + UI.escapeHtml(columns[i].label) + '</th>';
    html += '</tr></thead><tbody>';
    for (var r = 0; r < rows.length; r++) {
      var row = rows[r];
      html += '<tr>';
      for (var c = 0; c < columns.length; c++) html += '<td>' + this.cellHtml(columns[c], row[columns[c].key]) + '</td>';
      html += '</tr>';
    }
    if (totals) {
      html += '<tr class="report-total-row">';
      for (var t = 0; t < columns.length; t++) html += '<td><strong>' + this.cellHtml(columns[t], totals[columns[t].key]) + '</strong></td>';
      html += '</tr>';
    }
    html += '</tbody></table></div>';
    container.innerHTML = html;
    UI.initResponsiveTables();
  },

  cellHtml: function(col, v) {
    if (col.fmt === 'type') {
      var isEntree = String(v).indexOf('Entrée') === 0;
      return '<span class="badge ' + (isEntree ? 'badge-success' : 'badge-warning') + '">' + UI.escapeHtml(v) + '</span>';
    }
    if (col.fmt === 'badge') {
      var st = String(v || '');
      var cls = st === 'rupture' ? 'badge-danger' : st === 'alerte' || st === 'bas' ? 'badge-warning' : st === 'ok' ? 'badge-success' : 'badge-neutral';
      return '<span class="badge ' + cls + '">' + UI.escapeHtml(st) + '</span>';
    }
    return UI.escapeHtml(this.fmtVal(col.fmt, v));
  }
};
