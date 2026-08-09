// public/js/rapports.js — Centre de rapports Nizar Stock
// Catalogue config-driven des rapports + orchestration de la page
// (sélecteur, filtres, KPI, graphique Chart.js, tableau, exports).

var Rapports = {

  // === Catalogue des rapports ===
  catalog: [
    // ----- Bloc 1 : Ventilation stock & valeur -----
    {
      slug: 'ventilation-stock', bloc: 'Ventilation stock & valeur', titre: 'Ventilation du stock',
      type: 'doughnut', groupBy: 'categorie', groupByOptions: ['categorie', 'fournisseur', 'type', 'unite'],
      filters: ['categorie', 'fournisseur', 'groupby'],
      kpis: [
        { label: 'Articles', key: 'nb_articles', fmt: 'num' },
        { label: 'Stock', key: 'stock_actuel', fmt: 'num' },
        { label: 'Valeur stock', key: 'valeur', fmt: 'fcfa' },
        { label: 'Ruptures', key: 'nb_ruptures', fmt: 'num' },
        { label: 'Alertes', key: 'nb_alertes', fmt: 'num' }
      ],
      datasets: [{ key: 'valeur', label: 'Valeur (FCFA)', fcfa: true }],
      columns: [
        { key: 'libelle', label: 'Dimension', fmt: 'text' },
        { key: 'nb_articles', label: 'Articles', fmt: 'num' },
        { key: 'stock_actuel', label: 'Stock', fmt: 'num' },
        { key: 'valeur', label: 'Valeur (FCFA)', fmt: 'fcfa' },
        { key: 'nb_ruptures', label: 'Ruptures', fmt: 'num' },
        { key: 'nb_alertes', label: 'Alertes', fmt: 'num' }
      ]
    },
    {
      slug: 'dormants', bloc: 'Ventilation stock & valeur', titre: 'Articles dormants',
      type: 'hbar', groupBy: null, groupByOptions: null, filters: ['seuil'], showTotal: false,
      kpis: [
        { label: 'Articles dormants', key: 'nb', fmt: 'num' },
        { label: 'Valeur dormante', key: 'valeur', fmt: 'fcfa' }
      ],
      datasets: [{ key: 'stock_actuel', label: 'Stock', color: '#6B7280' }],
      columns: [
        { key: 'reference', label: 'Référence', fmt: 'text' },
        { key: 'nom', label: 'Article', fmt: 'text' },
        { key: 'categorie', label: 'Catégorie', fmt: 'text' },
        { key: 'stock_actuel', label: 'Stock', fmt: 'num' },
        { key: 'unite', label: 'Unité', fmt: 'text' },
        { key: 'valeur', label: 'Valeur (FCFA)', fmt: 'fcfa' },
        { key: 'dernier_mouvement', label: 'Dernier mouvement', fmt: 'date' }
      ]
    },
    {
      slug: 'couverture', bloc: 'Ventilation stock & valeur', titre: 'Jours de couverture',
      type: 'hbar', groupBy: null, groupByOptions: null, filters: ['jours'], showTotal: false,
      kpis: [
        { label: 'Articles suivis', key: 'nb', fmt: 'num' },
        { label: 'Fenêtre (jours)', key: 'fenetre_jours', fmt: 'num' }
      ],
      datasets: [{ key: 'jours_couverture', label: 'Jours de couverture', color: '#0EA5A0' }],
      columns: [
        { key: 'libelle', label: 'Article', fmt: 'text' },
        { key: 'reference', label: 'Référence', fmt: 'text' },
        { key: 'categorie', label: 'Catégorie', fmt: 'text' },
        { key: 'stock_actuel', label: 'Stock', fmt: 'num' },
        { key: 'sorties_fenetre', label: 'Sorties (fenêtre)', fmt: 'num' },
        { key: 'jours_couverture', label: 'Jours de couverture', fmt: 'dec' },
        { key: 'valeur', label: 'Valeur (FCFA)', fmt: 'fcfa' }
      ]
    },
    {
      slug: 'top-valeur', bloc: 'Ventilation stock & valeur', titre: 'Top 10 — valeur de stock',
      type: 'hbar', groupBy: null, groupByOptions: null, filters: [], showTotal: false,
      kpis: [
        { label: 'Valeur Top 10', key: 'valeur_top', fmt: 'fcfa' },
        { label: 'Valeur totale', key: 'valeur_totale', fmt: 'fcfa' }
      ],
      datasets: [{ key: 'valeur', label: 'Valeur (FCFA)', color: '#0EA5A0', fcfa: true }],
      columns: [
        { key: 'reference', label: 'Référence', fmt: 'text' },
        { key: 'nom', label: 'Article', fmt: 'text' },
        { key: 'categorie', label: 'Catégorie', fmt: 'text' },
        { key: 'stock_actuel', label: 'Stock', fmt: 'num' },
        { key: 'prix_unitaire', label: 'P.U. (FCFA)', fmt: 'fcfa' },
        { key: 'valeur', label: 'Valeur (FCFA)', fmt: 'fcfa' }
      ]
    },
    {
      slug: 'valeur-evolution', bloc: 'Ventilation stock & valeur', titre: 'Évolution de la valeur du stock',
      type: 'line', groupBy: 'mois', groupByOptions: null, filters: ['dates'],
      kpis: [
        { label: 'Valeur entrées', key: 'valeur_entrees', fmt: 'fcfa' },
        { label: 'Valeur sorties', key: 'valeur_sorties', fmt: 'fcfa' },
        { label: 'Solde valeur', key: 'solde_valeur', fmt: 'fcfa' }
      ],
      datasets: [
        { key: 'valeur_entrees', label: 'Valeur entrées', color: '#0EA5A0', fcfa: true },
        { key: 'valeur_sorties', label: 'Valeur sorties', color: '#111827', fcfa: true },
        { key: 'solde_valeur', label: 'Solde', color: '#D97706', fcfa: true }
      ],
      columns: [
        { key: 'libelle', label: 'Mois', fmt: 'text' },
        { key: 'valeur_entrees', label: 'Valeur entrées (FCFA)', fmt: 'fcfa' },
        { key: 'valeur_sorties', label: 'Valeur sorties (FCFA)', fmt: 'fcfa' },
        { key: 'solde_valeur', label: 'Solde (FCFA)', fmt: 'fcfa' }
      ]
    },

    // ----- Bloc 2 : Mouvements & consommation -----
    {
      slug: 'mouvements', bloc: 'Mouvements & consommation', titre: 'Mouvements détaillés',
      type: 'stacked', groupBy: 'mois',
      groupByOptions: ['jour', 'mois', 'article', 'categorie', 'localite', 'fournisseur', 'type', 'utilisateur'],
      filters: ['dates', 'article', 'categorie', 'localite', 'fournisseur', 'type', 'user', 'groupby'],
      kpis: [
        { label: 'Mouvements', key: 'nb', fmt: 'num' },
        { label: 'Entrées', key: 'entrees', fmt: 'num' },
        { label: 'Sorties', key: 'sorties', fmt: 'num' },
        { label: 'Solde', key: 'solde', fmt: 'num' },
        { label: 'Valeur nette', key: 'valeur', fmt: 'fcfa' }
      ],
      datasets: [
        { key: 'entrees', label: 'Entrées', color: '#0EA5A0', stack: 's' },
        { key: 'sorties', label: 'Sorties', color: '#111827', stack: 's' }
      ],
      columns: [
        { key: 'libelle', label: 'Dimension', fmt: 'text' },
        { key: 'nb', label: 'Mouvements', fmt: 'num' },
        { key: 'entrees', label: 'Entrées', fmt: 'num' },
        { key: 'sorties', label: 'Sorties', fmt: 'num' },
        { key: 'solde', label: 'Solde', fmt: 'num' },
        { key: 'valeur', label: 'Valeur nette (FCFA)', fmt: 'fcfa' }
      ]
    },
    {
      slug: 'consommation', bloc: 'Mouvements & consommation', titre: 'Consommation',
      type: 'hbar', groupBy: 'article', groupByOptions: ['article', 'mois', 'localite'],
      filters: ['dates', 'article', 'categorie', 'localite', 'fournisseur', 'groupby', 'limit'], topN: [10, 25, 50, 0],
      kpis: [
        { label: 'Quantité consommée', key: 'quantite', fmt: 'num' },
        { label: 'Valeur', key: 'valeur', fmt: 'fcfa' },
        { label: 'Mouvements', key: 'nb_mouvements', fmt: 'num' }
      ],
      datasets: [{ key: 'quantite', label: 'Quantité consommée', color: '#0EA5A0' }],
      columns: [
        { key: 'libelle', label: 'Dimension', fmt: 'text' },
        { key: 'quantite', label: 'Quantité consommée', fmt: 'num' },
        { key: 'valeur', label: 'Valeur (FCFA)', fmt: 'fcfa' },
        { key: 'nb_mouvements', label: 'Mouvements', fmt: 'num' }
      ]
    },

    // ----- Bloc 3 : Flux par agence -----
    {
      slug: 'sorties-agence', bloc: 'Flux par agence', titre: 'Sorties par agence',
      type: 'bar', groupBy: 'localite', groupByOptions: null,
      filters: ['dates', 'article', 'categorie', 'fournisseur'],
      dataKey: 'resume', tableKey: 'detail',
      kpis: [
        { label: 'Sorties', key: 'nb_mouvements', fmt: 'num' },
        { label: 'Quantité', key: 'quantite', fmt: 'num' },
        { label: 'Valeur', key: 'valeur', fmt: 'fcfa' }
      ],
      datasets: [{ key: 'quantite', label: 'Quantité sortie', color: '#111827' }],
      columns: [
        { key: 'localite', label: 'Agence', fmt: 'text' },
        { key: 'reference', label: 'Référence', fmt: 'text' },
        { key: 'article', label: 'Article', fmt: 'text' },
        { key: 'unite', label: 'Unité', fmt: 'text' },
        { key: 'quantite', label: 'Quantité', fmt: 'num' },
        { key: 'prix_unitaire', label: 'P.U. (FCFA)', fmt: 'fcfa' },
        { key: 'valeur', label: 'Valeur (FCFA)', fmt: 'fcfa' }
      ]
    },
    {
      slug: 'retours', bloc: 'Flux par agence', titre: 'Retours de carnets',
      type: 'doughnut', groupBy: 'localite', groupByOptions: ['localite', 'type', 'article'],
      filters: ['dates', 'localite', 'groupby'],
      kpis: [
        { label: 'Retours', key: 'nb', fmt: 'num' },
        { label: 'Quantité', key: 'quantite', fmt: 'num' },
        { label: 'Usage', key: 'nb_usage', fmt: 'num' },
        { label: 'Non utilisé', key: 'nb_non_utilise', fmt: 'num' }
      ],
      datasets: [{ key: 'quantite', label: 'Quantité' }],
      columns: [
        { key: 'libelle', label: 'Dimension', fmt: 'text' },
        { key: 'nb', label: 'Retours', fmt: 'num' },
        { key: 'quantite', label: 'Quantité', fmt: 'num' },
        { key: 'nb_usage', label: 'Usage', fmt: 'num' },
        { key: 'nb_non_utilise', label: 'Non utilisé', fmt: 'num' }
      ]
    },
    {
      slug: 'fiches-reception', bloc: 'Flux par agence', titre: 'Fiches de réception',
      type: 'stacked', groupBy: 'localite', groupByOptions: ['localite', 'statut', 'mois'],
      filters: ['dates', 'localite', 'groupby'],
      kpis: [
        { label: 'Fiches', key: 'nb_fiches', fmt: 'num' },
        { label: 'Quantité', key: 'quantite', fmt: 'num' },
        { label: 'Envoyées', key: 'envoyees', fmt: 'num' },
        { label: 'Signées', key: 'signees', fmt: 'num' }
      ],
      datasets: [
        { key: 'envoyees', label: 'Envoyées', color: '#0EA5A0', stack: 's' },
        { key: 'signees', label: 'Signées', color: '#16A34A', stack: 's' },
        { key: 'archivees', label: 'Archivées', color: '#6B7280', stack: 's' }
      ],
      columns: [
        { key: 'libelle', label: 'Dimension', fmt: 'text' },
        { key: 'nb_fiches', label: 'Fiches', fmt: 'num' },
        { key: 'quantite', label: 'Quantité', fmt: 'num' },
        { key: 'envoyees', label: 'Envoyées', fmt: 'num' },
        { key: 'signees', label: 'Signées', fmt: 'num' },
        { key: 'archivees', label: 'Archivées', fmt: 'num' }
      ]
    },
    {
      slug: 'series', bloc: 'Flux par agence', titre: 'Billets en circulation par agence',
      type: 'bar', groupBy: null, groupByOptions: null, filters: [],
      kpis: [
        { label: 'Envoyés', key: 'envoyes', fmt: 'num' },
        { label: 'En circulation', key: 'en_circulation', fmt: 'num' },
        { label: 'Retournés usage', key: 'retournes_usage', fmt: 'num' },
        { label: 'Retournés stock', key: 'retournes_stock', fmt: 'num' }
      ],
      datasets: [{ key: 'envoyes', label: 'Envoyés', color: '#111827' }],
      columns: [
        { key: 'libelle', label: 'Agence', fmt: 'text' },
        { key: 'envoyes', label: 'Envoyés', fmt: 'num' },
        { key: 'retournes_usage', label: 'Retournés usage', fmt: 'num' },
        { key: 'retournes_stock', label: 'Retournés stock', fmt: 'num' },
        { key: 'en_circulation', label: 'En circulation', fmt: 'num' }
      ]
    },

    // ----- Bloc 4 : Suivi & écarts -----
    {
      slug: 'entrees', bloc: 'Suivi & écarts', titre: 'Entrées fournisseur',
      type: 'bar', groupBy: 'fournisseur', groupByOptions: ['fournisseur', 'mois'],
      filters: ['dates', 'fournisseur', 'groupby'],
      kpis: [
        { label: 'Fiches', key: 'nb_fiches', fmt: 'num' },
        { label: 'Quantité', key: 'quantite', fmt: 'num' },
        { label: 'Valeur', key: 'valeur', fmt: 'fcfa' }
      ],
      datasets: [{ key: 'valeur', label: 'Valeur (FCFA)', color: '#0EA5A0', fcfa: true }],
      columns: [
        { key: 'libelle', label: 'Dimension', fmt: 'text' },
        { key: 'nb_fiches', label: 'Fiches', fmt: 'num' },
        { key: 'quantite', label: 'Quantité', fmt: 'num' },
        { key: 'valeur', label: 'Valeur (FCFA)', fmt: 'fcfa' }
      ]
    },
    {
      slug: 'commandes', bloc: 'Suivi & écarts', titre: 'Commandes & délais fournisseur',
      type: 'bar', groupBy: 'fournisseur', groupByOptions: ['fournisseur', 'statut'],
      filters: ['dates', 'fournisseur', 'groupby'],
      kpis: [
        { label: 'Commandes', key: 'nb_commandes', fmt: 'num' },
        { label: 'Quantité', key: 'quantite', fmt: 'num' },
        { label: 'Délai moyen (j)', key: 'delai_moyen_j', fmt: 'dec' }
      ],
      datasets: [{ key: 'nb_commandes', label: 'Commandes', color: '#111827' }],
      columns: [
        { key: 'libelle', label: 'Dimension', fmt: 'text' },
        { key: 'nb_commandes', label: 'Commandes', fmt: 'num' },
        { key: 'quantite', label: 'Quantité', fmt: 'num' },
        { key: 'delai_moyen_j', label: 'Délai moyen (j)', fmt: 'dec' }
      ]
    },
    {
      slug: 'inventaires', bloc: 'Suivi & écarts', titre: 'Inventaires & écarts',
      type: 'bar', groupBy: 'article', groupByOptions: ['article', 'utilisateur'],
      filters: ['dates', 'article', 'user', 'groupby'],
      kpis: [
        { label: 'Inventaires', key: 'nb_inventaires', fmt: 'num' },
        { label: 'Théorique', key: 'stock_theorique', fmt: 'num' },
        { label: 'Compté', key: 'quantite_comptee', fmt: 'num' },
        { label: 'Écart', key: 'ecart', fmt: 'num' },
        { label: 'Écart (FCFA)', key: 'valeur_ecart', fmt: 'fcfa' }
      ],
      datasets: [{ key: 'ecart', label: 'Écart', color: '#D97706' }],
      columns: [
        { key: 'libelle', label: 'Dimension', fmt: 'text' },
        { key: 'nb_inventaires', label: 'Inventaires', fmt: 'num' },
        { key: 'stock_theorique', label: 'Théorique', fmt: 'num' },
        { key: 'quantite_comptee', label: 'Compté', fmt: 'num' },
        { key: 'ecart', label: 'Écart', fmt: 'num' },
        { key: 'valeur_ecart', label: 'Écart (FCFA)', fmt: 'fcfa' }
      ]
    },
    {
      slug: 'alertes', bloc: 'Suivi & écarts', titre: 'Alertes & ruptures',
      type: 'hbar', groupBy: null, groupByOptions: null, filters: [], showTotal: false,
      kpis: [
        { label: 'Alertes', key: 'nb_alertes', fmt: 'num' },
        { label: 'Ruptures', key: 'nb_ruptures', fmt: 'num' },
        { label: 'Valeur en risque', key: 'valeur_risque', fmt: 'fcfa' }
      ],
      datasets: [{ key: 'valeur', label: 'Valeur (FCFA)', color: '#DC2626', fcfa: true }],
      columns: [
        { key: 'reference', label: 'Référence', fmt: 'text' },
        { key: 'nom', label: 'Article', fmt: 'text' },
        { key: 'categorie', label: 'Catégorie', fmt: 'text' },
        { key: 'fournisseur', label: 'Fournisseur', fmt: 'text' },
        { key: 'stock_actuel', label: 'Stock', fmt: 'num' },
        { key: 'stock_min', label: 'Min', fmt: 'num' },
        { key: 'unite', label: 'Unité', fmt: 'text' },
        { key: 'valeur', label: 'Valeur (FCFA)', fmt: 'fcfa' },
        { key: 'statut', label: 'Statut', fmt: 'badge' }
      ]
    }
  ],

  // === État ===
  meta: null,
  container: null,
  current: null,
  state: {
    debut: '', fin: '', article_id: '', categorie_id: '', localite_id: '',
    fournisseur_id: '', user_id: '', type: '', group_by: '', limit: '',
    stock_min_jours: '30', jours: '90', period: ''
  },

  _pad: function(n) { return String(n).padStart(2, '0'); },

  _iso: function(d) { return d.getFullYear() + '-' + this._pad(d.getMonth() + 1) + '-' + this._pad(d.getDate()); },

  // === Page ===
  render: function(container) {
    var self = this;
    this.container = container;
    ReportUI.applyTheme();
    this.state.debut = '';
    this.state.fin = '';
    container.innerHTML = '<div class="report-layout">' + UI.renderSkeleton(6) + '</div>';

    API.getRapportMeta().then(function(meta) {
      self.meta = meta;
      self._renderPage();
      self.selectReport(self.catalog[0].slug);
    }).catch(function(err) {
      container.innerHTML = UI.renderEmptyState('Erreur de chargement : ' + err.message);
    });
  },

  _renderPage: function() {
    var self = this;
    var blocs = [];
    for (var i = 0; i < this.catalog.length; i++) {
      if (blocs.indexOf(this.catalog[i].bloc) === -1) blocs.push(this.catalog[i].bloc);
    }
    var selectHtml = '<option value="">— Choisir un rapport —</option>';
    for (var b = 0; b < blocs.length; b++) {
      selectHtml += '<optgroup label="' + UI.escapeHtml(blocs[b]) + '">';
      for (var j = 0; j < this.catalog.length; j++) {
        if (this.catalog[j].bloc === blocs[b]) {
          selectHtml += '<option value="' + this.catalog[j].slug + '">' + UI.escapeHtml(this.catalog[j].titre) + '</option>';
        }
      }
      selectHtml += '</optgroup>';
    }

    this.container.innerHTML =
      '<div class="report-layout">' +
        // En-tête de marque visible uniquement à l'impression
        '<div class="report-print-header">' +
          '<img src="/logo.jpeg" alt="Nizar Transport Voyageur" class="report-print-logo">' +
          '<div><h2>Nizar Transport Voyageur — Gestion de stock</h2>' +
          '<p><span id="print-report-title"></span> · Généré le <span id="print-date"></span></p></div>' +
        '</div>' +
        '<div class="report-head">' +
          '<div class="report-head-main"><h3 class="report-title" id="report-title"></h3></div>' +
          '<div class="report-actions">' +
            '<button type="button" class="btn btn-secondary" id="rpt-xlsx" title="Exporter en Excel">Excel</button>' +
            '<button type="button" class="btn btn-secondary" id="rpt-csv" title="Exporter en CSV">CSV</button>' +
            '<button type="button" class="btn btn-primary" id="rpt-print" title="Imprimer le rapport">Imprimer</button>' +
          '</div>' +
        '</div>' +
        '<div class="report-select-wrap"><label class="form-label">Rapport</label>' +
          '<select class="form-input" id="report-select">' + selectHtml + '</select></div>' +
        '<div class="report-filters" id="report-filters"></div>' +
        '<div class="report-kpis" id="report-kpis"></div>' +
        '<div class="card report-chart-card">' +
          '<div class="card-header"><h3 class="card-title" id="report-chart-title"></h3></div>' +
          '<div class="report-chart" id="report-chart"></div>' +
        '</div>' +
        '<div class="card">' +
          '<div class="card-header"><h3 class="card-title">Détail</h3></div>' +
          '<div id="report-table"></div>' +
        '</div>' +
      '</div>';

    document.getElementById('report-select').addEventListener('change', function(e) {
      self.selectReport(e.target.value);
    });
    document.getElementById('rpt-xlsx').addEventListener('click', function() { self._export('xlsx'); });
    document.getElementById('rpt-csv').addEventListener('click', function() { self._export('csv'); });
    document.getElementById('rpt-print').addEventListener('click', function() { window.print(); });
  },

  _renderFilters: function() {
    var cfg = this.current;
    var el = document.getElementById('report-filters');
    if (!cfg.filters || !cfg.filters.length) { el.innerHTML = ''; return; }
    el.innerHTML = ReportUI.renderFilters(this.meta, cfg, this.state);
    this._bindFilterEvents();
  },

  _bindFilterEvents: function() {
    var self = this;
    var ids = ['rf-debut', 'rf-fin', 'rf-article', 'rf-categorie', 'rf-localite', 'rf-fournisseur', 'rf-type', 'rf-user', 'rf-groupby', 'rf-limit', 'rf-seuil', 'rf-jours'];
    var map = {
      'rf-debut': 'debut', 'rf-fin': 'fin', 'rf-article': 'article_id', 'rf-categorie': 'categorie_id',
      'rf-localite': 'localite_id', 'rf-fournisseur': 'fournisseur_id', 'rf-type': 'type', 'rf-user': 'user_id',
      'rf-groupby': 'group_by', 'rf-limit': 'limit', 'rf-seuil': 'stock_min_jours', 'rf-jours': 'jours'
    };
    for (var i = 0; i < ids.length; i++) {
      (function(id) {
        var el = document.getElementById(id);
        if (el) el.addEventListener('change', function(e) {
          self.state[map[id]] = e.target.value;
          self._loadReport();
        });
      })(ids[i]);
    }
    var reset = document.getElementById('rf-reset');
    if (reset) reset.addEventListener('click', function() { self._resetFilters(); });

    // Boutons de periode rapide (7j / 30j / mois / annee / tout)
    var periodBtns = document.querySelectorAll('.report-period-btn');
    for (var pb = 0; pb < periodBtns.length; pb++) {
      (function(btn) {
        btn.addEventListener('click', function() {
          self._setPeriod(btn.getAttribute('data-period'));
        });
      })(periodBtns[pb]);
    }
  },

  // Applique une periode rapide aux filtres de dates puis recharge le rapport.
  _setPeriod: function(p) {
    var self = this;
    var debut = '';
    var fin = '';
    if (p) {
      var now = new Date();
      fin = this._iso(now);
      if (p === '7j') { var d = new Date(now); d.setDate(d.getDate() - 7); debut = this._iso(d); }
      else if (p === '30j') { var d2 = new Date(now); d2.setDate(d2.getDate() - 30); debut = this._iso(d2); }
      else if (p === 'mois') { debut = this._iso(new Date(now.getFullYear(), now.getMonth(), 1)); }
      else if (p === 'an') { debut = this._iso(new Date(now.getFullYear(), 0, 1)); }
    }
    this.state.debut = debut;
    this.state.fin = fin;
    this.state.period = p;
    this._renderFilters();
    this._loadReport();
  },

  _resetFilters: function() {
    var cfg = this.current;
    this.state.debut = '';
    this.state.fin = '';
    this.state.article_id = ''; this.state.categorie_id = ''; this.state.localite_id = '';
    this.state.fournisseur_id = ''; this.state.type = ''; this.state.user_id = '';
    this.state.group_by = cfg.groupBy || '';
    this.state.limit = cfg.topN ? String(cfg.topN[0]) : '';
    this.state.stock_min_jours = '30'; this.state.jours = '90'; this.state.period = '';
    this._renderFilters();
    this._loadReport();
  },

  // === Sélection & chargement ===
  selectReport: function(slug) {
    var cfg = null;
    for (var i = 0; i < this.catalog.length; i++) {
      if (this.catalog[i].slug === slug) cfg = this.catalog[i];
    }
    if (!cfg) return;
    this.current = cfg;
    this.state.group_by = cfg.groupBy || '';
    this.state.limit = cfg.topN ? String(cfg.topN[0]) : '';
    this._renderFilters();
    this._loadReport();
  },

  _currentParams: function(cfg, extra) {
    var s = this.state;
    var p = {};
    var has = function(f) { return cfg.filters.indexOf(f) !== -1; };
    if (has('dates')) { p.debut = s.debut; p.fin = s.fin; }
    if (has('article') && s.article_id) p.article_id = s.article_id;
    if (has('categorie') && s.categorie_id) p.categorie_id = s.categorie_id;
    if (has('localite') && s.localite_id) p.localite_id = s.localite_id;
    if (has('fournisseur') && s.fournisseur_id) p.fournisseur_id = s.fournisseur_id;
    if (has('type') && s.type) p.type = s.type;
    if (has('user') && s.user_id) p.user_id = s.user_id;
    if (has('groupby') && s.group_by) p.group_by = s.group_by;
    if (has('limit') && s.limit !== '') p.limit = s.limit;
    if (has('seuil') && s.stock_min_jours) p.stock_min_jours = s.stock_min_jours;
    if (has('jours') && s.jours) p.jours = s.jours;
    if (extra) { for (var k in extra) p[k] = extra[k]; }
    return p;
  },

  _loadReport: function() {
    var self = this;
    var cfg = this.current;
    if (!cfg) return;
    cfg.groupByCurrent = this.state.group_by || cfg.groupBy || '';

    var titleEl = document.getElementById('report-title');
    if (titleEl) titleEl.textContent = cfg.titre;
    var chartTitle = document.getElementById('report-chart-title');
    if (chartTitle) chartTitle.textContent = cfg.titre + (cfg.groupBy ? ' — ' + ReportUI.dimLabel(cfg.groupByCurrent) : '');

    document.getElementById('report-kpis').innerHTML = UI.renderSkeleton(4);
    document.getElementById('report-chart').innerHTML = '<div style="height:240px;display:flex;align-items:center;justify-content:center;padding:1rem">' + UI.renderSkeleton(3) + '</div>';
    document.getElementById('report-table').innerHTML = UI.renderSkeleton(4);
    ReportUI.destroyCharts();

    var p = this._currentParams(cfg);
    API.getRapportV2(cfg.slug, p).then(function(data) {
      var chartRows = data[cfg.dataKey || 'rows'] || [];
      var tableRows = data[cfg.tableKey || 'rows'] || [];
      var totals = data.totals || null;
      ReportUI.renderKpis(document.getElementById('report-kpis'), cfg.kpis, totals);
      ReportUI.renderChart(document.getElementById('report-chart'), cfg, chartRows);
      ReportUI.renderTable(
        document.getElementById('report-table'), cfg.columns, tableRows,
        cfg.showTotal === false ? null : totals,
        'Aucune donnée sur cette période.'
      );
      var pd = document.getElementById('print-date');
      if (pd) pd.textContent = new Date().toLocaleDateString('fr-FR');
      var pt = document.getElementById('print-report-title');
      if (pt) pt.textContent = cfg.titre + (data.meta && data.meta.periode ? ' — ' + data.meta.periode : '');
    }).catch(function(err) {
      document.getElementById('report-kpis').innerHTML = '';
      document.getElementById('report-chart').innerHTML = '';
      document.getElementById('report-table').innerHTML = UI.renderEmptyState('Erreur : ' + err.message);
    });
  },

  // === Exports ===
  _export: function(format) {
    var cfg = this.current;
    if (!cfg) return;
    var p = this._currentParams(cfg, { format: format });
    var url = API.getRapportV2Url(cfg.slug, p);
    API.downloadRapport(url, 'rapport-' + cfg.slug + '.' + format)
      .then(function() { UI.toast('Export téléchargé.', 'success'); })
      .catch(function(err) { UI.toast(err.message, 'error'); });
  }
};
