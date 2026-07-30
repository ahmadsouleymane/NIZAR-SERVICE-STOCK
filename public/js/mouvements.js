// public/js/mouvements.js
var Mouvements = {
  render: function(container) {
    var today = new Date().toISOString().split('T')[0];
    var lastMonth = new Date();
    lastMonth.setMonth(lastMonth.getMonth() - 1);
    var lastMonthStr = lastMonth.toISOString().split('T')[0];

    container.innerHTML =
      '<div class="card">' +
      '<div class="card-header">' +
      '<h3 class="card-title">Historique des mouvements</h3>' +
      '<button class="btn btn-primary" id="btn-add-mvt">' +
      '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>' +
      ' Nouveau</button>' +
      '</div>' +
      '<div class="filter-bar">' +
      '<input type="date" class="form-input" id="filtre-debut" value="' + lastMonthStr + '" style="min-width:140px">' +
      '<input type="date" class="form-input" id="filtre-fin" value="' + today + '" style="min-width:140px">' +
      '<select class="form-select" id="filtre-type"><option value="">Tous types</option><option value="entree">Entrees</option><option value="sortie">Sorties</option></select>' +
      '<button class="btn btn-secondary btn-sm" id="btn-refresh">Actualiser</button>' +
      '</div>' +
      '<div id="mouvements-summary" class="summary-box">' +
      '<div class="summary-item">Entrees: <strong id="sum-entrees">-</strong></div>' +
      '<div class="summary-item">Sorties: <strong id="sum-sorties">-</strong></div>' +
      '<div class="summary-item">Solde: <strong id="sum-solde">-</strong></div>' +
      '</div>' +
      '<div id="mouvements-table">' + UI.renderSkeleton(10) + '</div>' +
      '</div>';

    this._loadMouvements();
    this._bindEvents();
  },

  _bindEvents: function() {
    var self = this;
    document.getElementById('btn-add-mvt').addEventListener('click', function() { self._showForm(); });
    document.getElementById('btn-refresh').addEventListener('click', function() { self._loadMouvements(); });
    document.getElementById('filtre-type').addEventListener('change', function() { self._loadMouvements(); });
  },

  _loadMouvements: function() {
    var self = this;
    var params = {
      debut: document.getElementById('filtre-debut').value,
      fin: document.getElementById('filtre-fin').value
    };
    var type = document.getElementById('filtre-type').value;
    if (type) params.type = type;

    API.getMouvements(params)
      .then(function(data) {
        self._renderTable(data.mouvements);
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

  _renderTable: function(mvts) {
    var el = document.getElementById('mouvements-table');
    if (!mvts || !mvts.length) {
      el.innerHTML = UI.renderEmptyState('Aucun mouvement sur cette periode');
      return;
    }

    var html = '<div class="table-wrapper"><table><thead><tr>' +
      '<th>Date</th><th>Article</th><th>Type</th><th>Qté</th><th>Motif</th><th>Demandeur</th><th>Fournisseur</th><th>Saisi par</th>' +
      '</tr></thead><tbody>';

    for (var i = 0; i < mvts.length; i++) {
      var m = mvts[i];
      html += '<tr>' +
        '<td>' + UI.formatDate(m.date) + '</td>' +
        '<td><strong>' + UI.escapeHtml(m.article_nom || '-') + '</strong><br><span class="text-sm text-muted">' + UI.escapeHtml(m.article_reference || '') + '</span></td>' +
        '<td><span class="badge ' + (m.type === 'entree' ? 'badge-success' : 'badge-warning') + '">' + (m.type === 'entree' ? 'Entree' : 'Sortie') + '</span></td>' +
        '<td><strong>' + m.quantite + '</strong></td>' +
        '<td>' + UI.escapeHtml(m.motif || '-') + '</td>' +
        '<td>' + UI.escapeHtml(m.demandeur || '-') + '</td>' +
        '<td>' + UI.escapeHtml(m.fournisseur_nom || '-') + '</td>' +
        '<td>' + UI.escapeHtml(m.username || '-') + '</td>' +
        '</tr>';
    }
    html += '</tbody></table></div>';
    el.innerHTML = html;
  },

  _showForm: function() {
    var self = this;

    Promise.all([API.getArticles(), API.getFournisseurs()])
      .then(function(results) {
        var articles = results[0].articles;
        var fournisseurs = results[1].fournisseurs;

        var articleOptions = '<option value="">Selectionner un article</option>';
        for (var i = 0; i < articles.length; i++) {
          articleOptions += '<option value="' + articles[i].id + '">' + UI.escapeHtml(articles[i].nom) + ' (' + articles[i].stock_actuel + ' ' + UI.escapeHtml(articles[i].unite) + ')</option>';
        }

        var fournOptions = '<option value="">Aucun</option>';
        for (var j = 0; j < fournisseurs.length; j++) {
          fournOptions += '<option value="' + fournisseurs[j].id + '">' + UI.escapeHtml(fournisseurs[j].nom) + '</option>';
        }

        var formHtml =
          '<div class="form-group"><label class="form-label">Type *</label><select class="form-select" id="mvt-type"><option value="entree">Entree</option><option value="sortie">Sortie</option></select></div>' +
          '<div class="form-group"><label class="form-label">Article *</label><select class="form-select" id="mvt-article">' + articleOptions + '</select></div>' +
          '<div class="form-group"><label class="form-label">Quantite *</label><input type="number" class="form-input" id="mvt-qte" value="1" min="1" required></div>' +
          '<div class="form-group" id="mvt-motif-group"><label class="form-label">Motif</label>' +
          '<select class="form-select" id="mvt-motif"><option value="">--</option><option>Distribution au personnel</option><option>Perime/Endommage</option><option>Transfert</option><option>Reception commande</option><option>Inventaire</option><option>Autre</option></select></div>' +
          '<div class="form-group"><label class="form-label">Demandeur</label><input type="text" class="form-input" id="mvt-demandeur" placeholder="Nom (optionnel)"></div>' +
          '<div class="form-group"><label class="form-label">Fournisseur</label><select class="form-select" id="mvt-fourn">' + fournOptions + '</select></div>';

        var modal = UI.modal('Nouveau mouvement', formHtml, [
          { label: 'Annuler', cls: 'btn-secondary', callback: function(m) { m.close(); } },
          { label: 'Enregistrer', cls: 'btn-primary', callback: function(m) { self._saveMouvement(m); } }
        ]);

        // Change motif label based on type
        document.getElementById('mvt-type').addEventListener('change', function() {
          var motifGroup = document.getElementById('mvt-motif-group').querySelector('.form-label');
          motifGroup.textContent = this.value === 'entree' ? 'Motif entree' : 'Motif sortie';
        });
      })
      .catch(function(err) { UI.toast(err.message, 'error'); });
  },

  _saveMouvement: function(modal) {
    var articleId = parseInt(document.getElementById('mvt-article').value);
    var type = document.getElementById('mvt-type').value;
    var qte = parseInt(document.getElementById('mvt-qte').value);
    var motif = document.getElementById('mvt-motif').value || null;
    var demandeur = document.getElementById('mvt-demandeur').value.trim() || null;
    var fournisseurId = document.getElementById('mvt-fourn').value || null;

    if (!articleId) { UI.toast('Selectionnez un article.', 'error'); return; }
    if (!qte || qte < 1) { UI.toast('Quantite invalide.', 'error'); return; }

    var self = this;
    API.createMouvement({
      article_id: articleId,
      type: type,
      quantite: qte,
      motif: motif,
      demandeur: demandeur,
      fournisseur_id: fournisseurId
    })
      .then(function() {
        UI.toast('Mouvement enregistre.', 'success');
        modal.close();
        self._loadMouvements();
      })
      .catch(function(err) { UI.toast(err.message, 'error'); });
  }
};
