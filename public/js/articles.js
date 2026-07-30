// public/js/articles.js
var Articles = {
  _currentFilter: {},

  render: function(container) {
    container.innerHTML =
      '<div class="card">' +
      '<div class="card-header">' +
      '<h3 class="card-title">Catalogue articles</h3>' +
      '<button class="btn btn-primary" id="btn-add-article">' +
      '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>' +
      ' Ajouter</button>' +
      '</div>' +
      '<div class="filter-bar">' +
      '<input type="search" class="form-input" id="search-articles" placeholder="Rechercher par nom ou reference...">' +
      '<select class="form-select" id="filter-categorie"><option value="">Toutes categories</option></select>' +
      '<label style="display:flex;align-items:center;gap:0.375rem;font-size:0.875rem;white-space:nowrap;min-height:44px;cursor:pointer">' +
      '<input type="checkbox" id="filter-alerte"> Alertes uniquement</label>' +
      '</div>' +
      '<div id="articles-table">' + UI.renderSkeleton(8) + '</div>' +
      '</div>';

    this._loadCategories();
    this._loadArticles();
    this._bindEvents();
  },

  _bindEvents: function() {
    var self = this;
    document.getElementById('btn-add-article').addEventListener('click', function() { self._showForm(); });

    var debouncedSearch = UI.debounce(function() { self._loadArticles(); }, 300);
    document.getElementById('search-articles').addEventListener('input', debouncedSearch);
    document.getElementById('filter-categorie').addEventListener('change', function() { self._loadArticles(); });
    document.getElementById('filter-alerte').addEventListener('change', function() { self._loadArticles(); });
  },

  _loadCategories: function() {
    var self = this;
    API.getCategories()
      .then(function(data) {
        var sel = document.getElementById('filter-categorie');
        for (var i = 0; i < data.categories.length; i++) {
          var opt = document.createElement('option');
          opt.value = data.categories[i].id;
          opt.textContent = data.categories[i].name;
          sel.appendChild(opt);
        }
      })
      .catch(function(err) { UI.toast('Erreur categories: ' + err.message, 'error'); });
  },

  _loadArticles: function() {
    var self = this;
    var params = {};
    var search = document.getElementById('search-articles').value.trim();
    var cat = document.getElementById('filter-categorie').value;
    var alerte = document.getElementById('filter-alerte').checked;

    if (search) params.search = search;
    if (cat) params.categorie_id = cat;
    if (alerte) params.alerte = '1';

    this._currentFilter = params;

    API.getArticles(params)
      .then(function(data) { self._renderTable(data.articles); })
      .catch(function(err) {
        document.getElementById('articles-table').innerHTML = '<div class="empty-state"><h3>Erreur</h3><p>' + UI.escapeHtml(err.message) + '</p></div>';
      });
  },

  _renderTable: function(articles) {
    var el = document.getElementById('articles-table');
    if (!articles || !articles.length) {
      el.innerHTML = UI.renderEmptyState('Aucun article trouve', 'Ajouter un article', '#articles');
      return;
    }

    var html = '<div class="table-wrapper"><table><thead><tr>' +
      '<th>Reference</th><th>Nom</th><th>Categorie</th><th>Stock</th><th>Min</th><th>Prix</th><th>Fournisseur</th><th>Actions</th></tr></thead><tbody>';

    var self = this;
    for (var i = 0; i < articles.length; i++) {
      var a = articles[i];
      html += '<tr>' +
        '<td><span style="font-family:var(--font-heading);font-size:0.8125rem">' + UI.escapeHtml(a.reference) + '</span></td>' +
        '<td><strong>' + UI.escapeHtml(a.nom) + '</strong></td>' +
        '<td>' + UI.escapeHtml(a.categorie_nom || '-') + '</td>' +
        '<td>' + UI.renderStockBadge(a.stock_actuel, a.stock_min) + ' <strong>' + a.stock_actuel + '</strong> ' + UI.escapeHtml(a.unite) + '</td>' +
        '<td>' + a.stock_min + '</td>' +
        '<td>' + UI.formatPrice(a.prix_unitaire) + '</td>' +
        '<td>' + UI.escapeHtml(a.fournisseur_nom || '-') + '</td>' +
        '<td class="actions">' +
        '<button class="btn btn-sm btn-success btn-mvt" data-id="' + a.id + '" data-type="entree" title="Entree rapide">+</button>' +
        '<button class="btn btn-sm btn-warning btn-mvt" data-id="' + a.id + '" data-type="sortie" title="Sortie rapide" style="background:var(--color-warning);color:#000">-</button>' +
        '<button class="btn btn-sm btn-secondary btn-edit" data-id="' + a.id + '" title="Modifier">Modifier</button>' +
        '<button class="btn btn-sm btn-danger btn-delete" data-id="' + a.id + '" title="Supprimer">Suppr.</button>' +
        '</td>' +
        '</tr>';
    }
    html += '</tbody></table></div>';
    el.innerHTML = html;

    // Bind events
    var btns = el.querySelectorAll('.btn-edit, .btn-delete, .btn-mvt');
    for (var j = 0; j < btns.length; j++) {
      var btn = btns[j];
      btn.addEventListener('click', function() {
        var id = parseInt(this.getAttribute('data-id'));
        if (this.classList.contains('btn-edit')) self._showForm(id);
        else if (this.classList.contains('btn-delete')) self._deleteArticle(id);
        else if (this.classList.contains('btn-mvt')) self._showMouvementRapide(id, this.getAttribute('data-type'));
      });
    }
  },

  _showForm: function(id) {
    var self = this;
    var isEdit = !!id;
    var title = isEdit ? 'Modifier l\'article' : 'Ajouter un article';

    // Load categories and fournisseurs for selects
    Promise.all([API.getCategories(), API.getFournisseurs()])
      .then(function(results) {
        var categories = results[0].categories;
        var fournisseurs = results[1].fournisseurs;

        var catOptions = '<option value="">Aucune</option>';
        for (var i = 0; i < categories.length; i++) {
          catOptions += '<option value="' + categories[i].id + '">' + UI.escapeHtml(categories[i].name) + '</option>';
        }
        var fournOptions = '<option value="">Aucun</option>';
        for (var j = 0; j < fournisseurs.length; j++) {
          fournOptions += '<option value="' + fournisseurs[j].id + '">' + UI.escapeHtml(fournisseurs[j].nom) + '</option>';
        }

        var formHtml =
          '<div class="form-group"><label class="form-label">Reference *</label><input type="text" class="form-input" id="art-ref" required></div>' +
          '<div class="form-group"><label class="form-label">Nom *</label><input type="text" class="form-input" id="art-nom" required></div>' +
          '<div class="form-row">' +
          '<div class="form-group"><label class="form-label">Categorie</label><select class="form-select" id="art-cat">' + catOptions + '</select></div>' +
          '<div class="form-group"><label class="form-label">Unite</label><select class="form-select" id="art-unite"><option>piece</option><option>carton</option><option>ramette</option><option>lot</option><option>boite</option><option>flacon</option><option>rouleau</option><option>paquet</option></select></div>' +
          '</div>' +
          '<div class="form-row">' +
          '<div class="form-group"><label class="form-label">Stock minimum</label><input type="number" class="form-input" id="art-min" value="10" min="0"></div>' +
          '<div class="form-group"><label class="form-label">Prix unitaire</label><input type="number" class="form-input" id="art-prix" value="0" min="0" step="0.01"></div>' +
          '</div>' +
          '<div class="form-group"><label class="form-label">Fournisseur principal</label><select class="form-select" id="art-fourn">' + fournOptions + '</select></div>' +
          '<div class="form-group"><label class="form-label">Description</label><textarea class="form-textarea" id="art-desc" rows="2"></textarea></div>';

        var modal = UI.modal(title, formHtml, [
          { label: 'Annuler', cls: 'btn-secondary', callback: function(m) { m.close(); } },
          { label: 'Enregistrer', cls: 'btn-primary', callback: function(m) { self._saveArticle(m, isEdit, id); } }
        ]);

        // Pre-fill if editing
        if (isEdit) {
          API.getArticle(id).then(function(data) {
            var a = data.article;
            document.getElementById('art-ref').value = a.reference;
            document.getElementById('art-nom').value = a.nom;
            document.getElementById('art-cat').value = a.categorie_id || '';
            document.getElementById('art-unite').value = a.unite;
            document.getElementById('art-min').value = a.stock_min;
            document.getElementById('art-prix').value = a.prix_unitaire;
            document.getElementById('art-fourn').value = a.fournisseur_id || '';
            document.getElementById('art-desc').value = a.description || '';
          }).catch(function(err) { UI.toast(err.message, 'error'); modal.close(); });
        }
      })
      .catch(function(err) { UI.toast(err.message, 'error'); });
  },

  _saveArticle: function(modal, isEdit, id) {
    var data = {
      reference: document.getElementById('art-ref').value.trim(),
      nom: document.getElementById('art-nom').value.trim(),
      categorie_id: document.getElementById('art-cat').value || null,
      unite: document.getElementById('art-unite').value,
      stock_min: parseInt(document.getElementById('art-min').value) || 0,
      prix_unitaire: parseFloat(document.getElementById('art-prix').value) || 0,
      fournisseur_id: document.getElementById('art-fourn').value || null,
      description: document.getElementById('art-desc').value.trim() || null
    };

    if (!data.reference || !data.nom) {
      UI.toast('Reference et nom sont requis.', 'error');
      return;
    }

    var self = this;
    var promise = isEdit ? API.updateArticle(id, data) : API.createArticle(data);

    promise
      .then(function() {
        UI.toast(isEdit ? 'Article modifie.' : 'Article cree.', 'success');
        modal.close();
        self._loadArticles();
      })
      .catch(function(err) { UI.toast(err.message, 'error'); });
  },

  _deleteArticle: function(id) {
    var self = this;
    UI.confirm('Supprimer definitivement cet article ? Les mouvements associes seront conserves.')
      .then(function(ok) {
        if (!ok) return;
        API.deleteArticle(id)
          .then(function() { UI.toast('Article supprime.', 'success'); self._loadArticles(); })
          .catch(function(err) { UI.toast(err.message, 'error'); });
      });
  },

  _showMouvementRapide: function(articleId, type) {
    var self = this;
    API.getArticle(articleId)
      .then(function(data) {
        var a = data.article;
        var titre = type === 'entree' ? 'Entree rapide - ' + a.nom : 'Sortie rapide - ' + a.nom;

        var motifsSortie = ['Distribution au personnel', 'Perime/Endommage', 'Transfert', 'Autre'];
        var motifOptions = '<option value="">--</option>';
        for (var i = 0; i < motifsSortie.length; i++) {
          motifOptions += '<option value="' + motifsSortie[i] + '">' + motifsSortie[i] + '</option>';
        }

        var formHtml =
          '<p style="margin-bottom:0.75rem">Stock actuel: <strong>' + a.stock_actuel + ' ' + UI.escapeHtml(a.unite) + '</strong></p>' +
          '<div class="form-group"><label class="form-label">Quantite *</label><input type="number" class="form-input" id="mvt-qte" value="1" min="1" required></div>' +
          '<div class="form-group"><label class="form-label">Motif</label>' +
          (type === 'sortie' ? '<select class="form-select" id="mvt-motif">' + motifOptions + '</select>' : '<input type="text" class="form-input" id="mvt-motif" value="Reapprovisionnement">') +
          '</div>' +
          '<div class="form-group"><label class="form-label">Demandeur</label><input type="text" class="form-input" id="mvt-demandeur" placeholder="Nom du collaborateur (optionnel)"></div>';

        var modal = UI.modal(titre, formHtml, [
          { label: 'Annuler', cls: 'btn-secondary', callback: function(m) { m.close(); } },
          { label: 'Enregistrer', cls: 'btn-primary', callback: function(m) {
            var qte = parseInt(document.getElementById('mvt-qte').value);
            var motif = document.getElementById('mvt-motif').value || null;
            var demandeur = document.getElementById('mvt-demandeur').value.trim() || null;

            if (!qte || qte < 1) { UI.toast('Quantite requise.', 'error'); return; }

            API.createMouvement({ article_id: articleId, type: type, quantite: qte, motif: motif, demandeur: demandeur })
              .then(function() {
                UI.toast('Mouvement enregistre.', 'success');
                m.close();
                self._loadArticles();
              })
              .catch(function(err) { UI.toast(err.message, 'error'); });
          } }]
        ]);
      })
      .catch(function(err) { UI.toast(err.message, 'error'); });
  }
};
