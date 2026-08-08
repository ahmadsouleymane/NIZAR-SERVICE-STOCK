// public/js/souches.js — Recherche precise de numero de souche (billets / carnets)
var Souches = {
  render: function(container) {
    container.innerHTML =
      '<div class="card">' +
      '<div class="card-header"><h3 class="card-title">Recherche de numero de souche</h3></div>' +
      '<p class="text-sm text-muted mb-md">Entrez un numero de billet / carnet pour savoir exactement ou il se trouve : son article, sa position dans le carnet, la localite ou l\'agence qui l\'a recu, et tout son historique.</p>' +
      '<div class="flex-between gap-sm">' +
      '<input type="number" class="form-input" id="souche-numero" placeholder="Ex: 160003" style="min-width:160px" inputmode="numeric">' +
      '<button class="btn btn-primary" id="btn-souche-search">Rechercher</button>' +
      '</div>' +
      '<div id="souche-result" class="mt-md"></div>' +
      '</div>';

    this._bindEvents();
  },

  _bindEvents: function() {
    var self = this;
    var doSearch = function() { self._search(); };
    document.getElementById('btn-souche-search').addEventListener('click', doSearch);
    document.getElementById('souche-numero').addEventListener('keydown', function(e) {
      if (e.key === 'Enter') doSearch();
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
