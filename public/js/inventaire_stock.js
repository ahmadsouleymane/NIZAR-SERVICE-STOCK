// public/js/inventaire_stock.js — Inventaire de tous les produits (stock + valeur)
var InventaireStock = {
  _currentFilter: {},

  render: function(container) {
    container.innerHTML =
      '<div class="kpi-grid" id="inv-kpi-grid" style="grid-template-columns:repeat(auto-fit,minmax(180px,1fr))">' + UI.renderSkeleton(4) + '</div>' +
      '<div class="card">' +
      '<div class="card-header">' +
      '<h3 class="card-title">Inventaire de tous les produits</h3>' +
      '<a href="#rapports" class="btn btn-secondary btn-sm">Exporter (Excel)</a>' +
      '</div>' +
      '<div class="filter-bar">' +
      '<input type="search" class="form-input" id="inv-search" placeholder="Rechercher par nom ou reference...">' +
      '<select class="form-select" id="inv-categorie"><option value="">Toutes categories</option></select>' +
      '<label style="display:flex;align-items:center;gap:0.375rem;font-size:0.875rem;white-space:nowrap;min-height:44px;cursor:pointer">' +
      '<input type="checkbox" id="inv-alerte"> Alertes uniquement</label>' +
      '</div>' +
      '<div id="inventaire-stock-table">' + UI.renderSkeleton(8) + '</div>' +
      '</div>';

    this._loadCategories();
    this._load();
    this._bindEvents();
  },

  _bindEvents: function() {
    var self = this;
    var debouncedSearch = UI.debounce(function() { self._load(); }, 300);
    document.getElementById('inv-search').addEventListener('input', debouncedSearch);
    document.getElementById('inv-categorie').addEventListener('change', function() { self._load(); });
    document.getElementById('inv-alerte').addEventListener('change', function() { self._load(); });
  },

  _loadCategories: function() {
    var self = this;
    API.getCategories()
      .then(function(data) {
        var sel = document.getElementById('inv-categorie');
        for (var i = 0; i < data.categories.length; i++) {
          var opt = document.createElement('option');
          opt.value = data.categories[i].id;
          opt.textContent = data.categories[i].name;
          sel.appendChild(opt);
        }
      })
      .catch(function() {});
  },

  _load: function() {
    var self = this;
    var params = {};
    var search = document.getElementById('inv-search').value.trim();
    var cat = document.getElementById('inv-categorie').value;
    var alerte = document.getElementById('inv-alerte').checked;
    if (search) params.search = search;
    if (cat) params.categorie_id = cat;
    if (alerte) params.alerte = '1';

    this._currentFilter = params;

    API.getArticles(params)
      .then(function(data) {
        self._renderKPI(data.articles);
        self._renderTable(data.articles);
      })
      .catch(function(err) {
        document.getElementById('inventaire-stock-table').innerHTML = '<div class="empty-state"><h3>Erreur</h3><p>' + UI.escapeHtml(err.message) + '</p></div>';
      });
  },

  _renderKPI: function(articles) {
    var grid = document.getElementById('inv-kpi-grid');
    if (!grid) return;
    var valeurTotale = 0;
    var nbAlerte = 0;
    var nbRupture = 0;
    for (var i = 0; i < articles.length; i++) {
      var a = articles[i];
      valeurTotale += (a.prix_unitaire || 0) * (a.stock_actuel || 0);
      if (a.stock_actuel <= 0) nbRupture++;
      else if (a.stock_actuel <= a.stock_min) nbAlerte++;
    }

    var items = [
      { label: 'Valeur du stock', value: UI.formatPrice(valeurTotale), cls: '' },
      { label: 'Articles', value: UI.formatNumber(articles.length), cls: '' },
      { label: 'Alertes', value: UI.formatNumber(nbAlerte), cls: nbAlerte > 0 ? 'danger' : '' },
      { label: 'Ruptures', value: UI.formatNumber(nbRupture), cls: nbRupture > 0 ? 'danger' : '' }
    ];

    var html = '';
    for (var j = 0; j < items.length; j++) {
      html += '<div class="kpi-card">' +
        '<div class="kpi-card-header">' + items[j].label + '</div>' +
        '<div class="kpi-card-value' + (items[j].cls ? ' ' + items[j].cls : '') + '">' + items[j].value + '</div>' +
        '</div>';
    }
    grid.innerHTML = html;
  },

  _renderTable: function(articles) {
    var el = document.getElementById('inventaire-stock-table');
    if (!articles || !articles.length) {
      el.innerHTML = UI.renderEmptyState('Aucun article trouve');
      return;
    }

    var html = '<div class="table-wrapper"><table><thead><tr>' +
      '<th>Référence</th><th>Article</th><th>Catégorie</th><th>Stock</th><th>Min</th><th>Prix unitaire</th><th>Valeur stock</th></tr></thead><tbody>';

    for (var i = 0; i < articles.length; i++) {
      var a = articles[i];
      var valeur = (a.prix_unitaire || 0) * (a.stock_actuel || 0);
      html += '<tr>' +
        '<td><span style="font-family:var(--font-heading);font-size:0.8125rem">' + UI.escapeHtml(a.reference) + '</span></td>' +
        '<td><strong>' + UI.escapeHtml(a.nom) + '</strong></td>' +
        '<td>' + UI.escapeHtml(a.categorie_nom || '-') + '</td>' +
        '<td>' + UI.renderStockBadge(a.stock_actuel, a.stock_min) + ' <strong>' + a.stock_actuel + '</strong> ' + UI.escapeHtml(UI.uniteLabel(a.unite)) + '</td>' +
        '<td>' + a.stock_min + '</td>' +
        '<td>' + UI.formatPrice(a.prix_unitaire) + '</td>' +
        '<td><strong>' + UI.formatPrice(valeur) + '</strong></td>' +
        '</tr>';
    }
    html += '</tbody></table></div>';
    el.innerHTML = html;
  }
};
