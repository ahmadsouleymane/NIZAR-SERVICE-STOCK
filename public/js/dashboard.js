// public/js/dashboard.js
var Dashboard = {
  render: function(container) {
    var demandesCard = UI.isAdmin()
      ? '<div class="card" id="demandes-card" style="display:none"><div class="card-header"><h3 class="card-title">Demandes en attente</h3></div><div id="demandes-list"></div></div>'
      : '';
    container.innerHTML = '<div class="kpi-grid" id="kpi-grid">' + UI.renderSkeleton(4) + '</div>' +
      demandesCard +
      '<div class="card"><div class="card-header"><h3 class="card-title">Derniers mouvements</h3></div><div id="recent-mvts">' + UI.renderSkeleton(5) + '</div></div>' +
      '<div class="card"><div class="card-header"><h3 class="card-title">Dernières entrées fournisseur</h3></div><div id="recent-entrees">' + UI.renderSkeleton(4) + '</div></div>' +
      '<div class="card"><div class="card-header"><h3 class="card-title">Alertes stock bas</h3></div><div id="top-alertes">' + UI.renderSkeleton(3) + '</div></div>';

    API.getDashboard()
      .then(function(data) {
        Dashboard._renderKPI(data.kpi);
        Dashboard._renderMouvements(data.mouvementsRecents);
        Dashboard._renderAlertes(data.topAlertes);
        Dashboard._renderEntrees(data.entreesRecentes);
      })
      .catch(function(err) {
        container.innerHTML = '<div class="empty-state"><h3>Erreur</h3><p>' + UI.escapeHtml(err.message) + '</p></div>';
      });

    if (UI.isAdmin()) Dashboard._loadDemandes();
  },

  // Suppression selon le type de cible (utilise les endpoints admin existants).
  _executeurs: {
    sortie: function(id) { return API.deleteFiche(id); },
    entree: function(id) { return API.deleteEntree(id); },
    comptage: function(id) { return API.deleteInventaire(id); },
    inventaire: function(id) { return API.deleteInventaire(id); },
    article: function(id) { return API.deleteArticle(id); },
    fournisseur: function(id) { return API.deleteFournisseur(id); },
    localite: function(id) { return API.deleteLocalite(id); },
    categorie: function(id) { return API.deleteCategory(id); },
    unite: function(id) { return API.deleteUnite(id); },
    fiche_besoin: function(id) { return API.deleteFicheBesoin(id); }
  },
  // Page a ouvrir pour une demande de modification, par type de cible.
  _pageCible: {
    sortie: 'fiches', entree: 'entrees', comptage: 'comptage', inventaire: 'comptage',
    article: 'articles', fournisseur: 'fournisseurs', localite: 'parametres',
    categorie: 'parametres', unite: 'parametres', fiche_besoin: 'fiches_besoin'
  },

  _loadDemandes: function() {
    API.getDemandes({ statut: 'en_attente' })
      .then(function(data) { Dashboard._renderDemandes(data.demandes || []); })
      .catch(function() {});
  },

  _renderDemandes: function(demandes) {
    var card = document.getElementById('demandes-card');
    var el = document.getElementById('demandes-list');
    if (!card || !el) return;
    if (!demandes.length) { card.style.display = 'none'; return; }
    card.style.display = '';

    var html = '<div class="table-wrapper"><table><thead><tr>' +
      '<th>Demandeur</th><th>Type</th><th>Élément</th><th>Raison</th><th>Date</th><th>Actions</th>' +
      '</tr></thead><tbody>';
    for (var i = 0; i < demandes.length; i++) {
      var d = demandes[i];
      var badge = d.type === 'suppression' ? '<span class="badge badge-danger">Suppression</span>' : '<span class="badge badge-warning">Modification</span>';
      html += '<tr>' +
        '<td><strong>' + UI.escapeHtml(d.demandeur || d.username || '-') + '</strong></td>' +
        '<td>' + badge + '</td>' +
        '<td>' + UI.escapeHtml(d.cible_label || d.cible_type) + '</td>' +
        '<td class="text-sm">' + UI.escapeHtml(d.note || '') + '</td>' +
        '<td class="text-sm">' + UI.formatDate(d.date_creation) + '</td>' +
        '<td class="actions">' +
        (d.type === 'suppression'
          ? '<button class="btn btn-sm btn-danger btn-dem-exec" data-id="' + d.id + '">Exécuter</button>'
          : '<button class="btn btn-sm btn-primary btn-dem-modif" data-id="' + d.id + '">Aller modifier</button>') +
        '<button class="btn btn-sm btn-secondary btn-dem-refuse" data-id="' + d.id + '">Refuser</button>' +
        '</td></tr>';
    }
    html += '</tbody></table></div>';
    el.innerHTML = html;

    el.querySelectorAll('.btn-dem-exec').forEach(function(btn) {
      btn.addEventListener('click', function() { Dashboard._executerDemande(demandes.find(function(x){ return x.id === parseInt(btn.dataset.id, 10); })); });
    });
    el.querySelectorAll('.btn-dem-modif').forEach(function(btn) {
      btn.addEventListener('click', function() { Dashboard._modifierDemande(demandes.find(function(x){ return x.id === parseInt(btn.dataset.id, 10); })); });
    });
    el.querySelectorAll('.btn-dem-refuse').forEach(function(btn) {
      btn.addEventListener('click', function() { Dashboard._refuserDemande(parseInt(btn.dataset.id, 10)); });
    });
  },

  _executerDemande: function(d) {
    if (!d) return;
    var fn = Dashboard._executeurs[d.cible_type];
    if (!fn || !d.cible_id) { UI.toast('Suppression automatique non disponible pour ce type — à faire manuellement.', 'warning'); return; }
    UI.confirm('Exécuter la suppression demandée de « ' + (d.cible_label || d.cible_type) + ' » ?').then(function(ok) {
      if (!ok) return;
      fn(d.cible_id)
        .then(function() { return API.accepterDemande(d.id); })
        .then(function() { UI.toast('Suppression effectuée, demande acceptée.', 'success'); Dashboard._loadDemandes(); })
        .catch(function(err) { UI.toast(err.message, 'error'); });
    });
  },

  _modifierDemande: function(d) {
    if (!d) return;
    var page = Dashboard._pageCible[d.cible_type];
    // Marque la demande acceptee puis emmene l'admin sur la page concernee.
    API.accepterDemande(d.id).catch(function() {});
    UI.toast('Demande acceptée — ouvrez l\'élément à modifier.', 'info');
    if (page) window.location.hash = page;
  },

  _refuserDemande: function(id) {
    UI.confirm('Refuser cette demande ?').then(function(ok) {
      if (!ok) return;
      API.refuserDemande(id, '')
        .then(function() { UI.toast('Demande refusée.', 'success'); Dashboard._loadDemandes(); })
        .catch(function(err) { UI.toast(err.message, 'error'); });
    });
  },

  _renderKPI: function(kpi) {
    var grid = document.getElementById('kpi-grid');
    var items = [
      { label: 'Total articles', value: kpi.totalArticles, icon: '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>', cls: '' },
      { label: 'Alertes stock bas', value: kpi.alertesStock, icon: '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>', cls: kpi.alertesStock > 0 ? 'danger' : 'success' },
      { label: 'Mouvements du jour', value: kpi.mouvementsJour, icon: '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 014-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 01-4 4H3"/></svg>', cls: '' },
      { label: 'Valeur du stock', value: UI.formatPrice(kpi.valeurStock), icon: '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>', cls: '' }
    ];

    var html = '';
    for (var i = 0; i < items.length; i++) {
      // Les valeurs deja formatees (ex: prix en chaîne) ne repassent pas par formatNumber
      var display = typeof items[i].value === 'number' ? UI.formatNumber(items[i].value) : items[i].value;
      html += '<div class="kpi-card">' +
        '<div class="kpi-card-header">' + items[i].icon + '<span>' + items[i].label + '</span></div>' +
        '<div class="kpi-card-value' + (items[i].cls ? ' ' + items[i].cls : '') + '">' + display + '</div>' +
        '</div>';
    }
    grid.innerHTML = html;
  },

  _renderMouvements: function(mvts) {
    var el = document.getElementById('recent-mvts');
    if (!mvts || !mvts.length) {
      el.innerHTML = UI.renderEmptyState('Aucun mouvement recent');
      return;
    }

    var html = '<div class="table-wrapper"><table><thead><tr>' +
      '<th>Date</th><th>Article</th><th>Type</th><th>Qté</th><th>Par</th></tr></thead><tbody>';

    for (var i = 0; i < mvts.length; i++) {
      var m = mvts[i];
      html += '<tr>' +
        '<td>' + UI.formatDate(m.date) + '</td>' +
        '<td>' + UI.escapeHtml(m.article_nom || '-') + '</td>' +
        '<td><span class="badge ' + (m.type === 'entree' ? 'badge-success' : 'badge-warning') + '">' + (m.type === 'entree' ? 'Entrée' : 'Sortie') + '</span></td>' +
        '<td>' + m.quantite + '</td>' +
        '<td>' + UI.escapeHtml(m.username || '-') + '</td>' +
        '</tr>';
    }
    html += '</tbody></table></div>';
    el.innerHTML = html;
  },

  _renderEntrees: function(entrees) {
    var el = document.getElementById('recent-entrees');
    if (!el) return;
    if (!entrees || !entrees.length) {
      el.innerHTML = UI.renderEmptyState('Aucune entrée récente');
      return;
    }

    var html = '<div class="table-wrapper"><table><thead><tr>' +
      '<th>Reference</th><th>Date</th><th>Fournisseur</th><th>N° BL</th><th>N° facture</th></tr></thead><tbody>';

    for (var i = 0; i < entrees.length; i++) {
      var e = entrees[i];
      html += '<tr>' +
        '<td><strong>' + UI.escapeHtml(e.reference) + '</strong></td>' +
        '<td>' + UI.formatDate(e.date_entree) + '</td>' +
        '<td>' + UI.escapeHtml(e.fournisseur_nom || '-') + '</td>' +
        '<td>' + UI.escapeHtml(e.numero_bl || '-') + '</td>' +
        '<td>' + UI.escapeHtml(e.numero_facture || '-') + '</td>' +
        '</tr>';
    }
    html += '</tbody></table></div>';
    el.innerHTML = html;
  },

  _renderAlertes: function(alertes) {
    var el = document.getElementById('top-alertes');
    if (!alertes || !alertes.length) {
      el.innerHTML = '<p class="text-success text-center" style="padding:1rem">Tous les stocks sont au-dessus des seuils minimums.</p>';
      return;
    }

    var html = '<div class="table-wrapper"><table><thead><tr>' +
      '<th>Article</th><th>Référence</th><th>Stock</th><th>Min</th><th>Fournisseur</th>' +
      '</tr></thead><tbody>';

    for (var i = 0; i < alertes.length; i++) {
      var a = alertes[i];
      html += '<tr>' +
        '<td><strong>' + UI.escapeHtml(a.nom) + '</strong></td>' +
        '<td>' + UI.escapeHtml(a.reference) + '</td>' +
        '<td>' + UI.renderStockBadge(a.stock_actuel, a.stock_min) + ' ' + a.stock_actuel + ' ' + UI.escapeHtml(UI.uniteLabel(a.unite)) + '</td>' +
        '<td>' + a.stock_min + '</td>' +
        '<td>' + UI.escapeHtml(a.fournisseur_nom || '-') + '</td>' +
        '</tr>';
    }
    html += '</tbody></table></div>';
    el.innerHTML = html;
  }
};
