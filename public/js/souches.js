// public/js/souches.js — Recherche de numero de souche (billets / carnets)
var Souches = {
  render: function(container) {
    container.innerHTML =
      '<div class="card">' +
      '<div class="card-header"><h3 class="card-title">Recherche de numero de souche</h3></div>' +
      '<p class="text-sm text-muted mb-md">Entrez un numero de billet / carnet pour connaitre instantanement son article et son statut : en stock, envoye a une agence, retourne usage ou non utilise.</p>' +
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

        var html = '<div class="card" style="background:var(--color-muted);border:none">' +
          '<div class="flex-between"><div><strong>Numero :</strong> <span style="font-family:var(--font-heading)">' + UI.escapeHtml(String(data.numero)) + '</span></div>' +
          '<div><strong>Article :</strong> ' + UI.escapeHtml(data.series[0].article_nom || '-') + ' <span class="text-sm text-muted">' + UI.escapeHtml(data.series[0].reference || '') + '</span></div></div>';

        var statutBadge = '';
        if (data.statut.code === 'en_stock') statutBadge = '<span class="badge badge-success">En stock</span>';
        else if (data.statut.code === 'envoye') statutBadge = '<span class="badge badge-warning">Envoye</span>';
        else statutBadge = '<span class="badge badge-neutral">Retourne (archive)</span>';

        html += '<div class="flex-between mt-md"><div><strong>Statut actuel :</strong></div><div>' + statutBadge + ' ' + UI.escapeHtml(data.statut.label) + '</div></div></div>';

        // Trace chronologique
        html += '<div class="table-wrapper"><table><thead><tr><th>Date</th><th>Evenement</th><th>Plage</th><th>Qte</th><th>Details</th></tr></thead><tbody>';
        for (var i = 0; i < data.series.length; i++) {
          var s = data.series[i];
          var evt = '';
          var det = '';
          if (s.source_type === 'entree') { evt = '<span class="badge badge-success">Entree</span>'; det = 'Reception fournisseur'; }
          else if (s.source_type === 'sortie') { evt = '<span class="badge badge-warning">Sortie</span>'; det = (s.localite_nom || '-') + (s.destinataire ? ' — ' + s.destinataire : ''); }
          else { evt = s.type_retour === 'non_utilise' ? '<span class="badge badge-success">Retour (en stock)</span>' : '<span class="badge badge-neutral">Retour usage</span>'; det = s.type_retour === 'non_utilise' ? 'Remis en stock' : 'Archive'; }
          html += '<tr>' +
            '<td>' + UI.formatDate(s.date) + '</td>' +
            '<td>' + evt + '</td>' +
            '<td>' + UI.escapeHtml(s.numero_debut) + ' — ' + UI.escapeHtml(s.numero_fin) + '</td>' +
            '<td>' + s.quantite + '</td>' +
            '<td>' + UI.escapeHtml(det) + '</td>' +
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
