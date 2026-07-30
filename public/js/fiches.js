// public/js/fiches.js — Fiches de reception
var Fiches = {
  render: function(container) {
    container.innerHTML =
      '<div class="card"><div class="card-header flex-between">' +
      '<h3 class="card-title">Fiches de reception</h3>' +
      '<button class="btn btn-primary" id="btn-new-envoi">' +
      '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>' +
      ' Nouvel envoi</button>' +
      '</div>' +
      '<div class="filter-bar">' +
      '<select class="form-select" id="fiche-statut"><option value="">Tous statuts</option><option value="envoyee">Envoyee</option><option value="signee">Signee</option><option value="archivee">Archivee</option></select>' +
      '<select class="form-select" id="fiche-localite"><option value="">Toutes destinations</option></select>' +
      '<input type="date" class="form-input" id="fiche-debut" style="min-width:130px">' +
      '<input type="date" class="form-input" id="fiche-fin" style="min-width:130px">' +
      '<button class="btn btn-secondary btn-sm" id="btn-fiches-refresh">Actualiser</button>' +
      '</div>' +
      '<div id="fiches-table">' + UI.renderSkeleton(6) + '</div>' +
      '</div>';

    this._loadLocalites();
    this._load();
    this._bindEvents();
  },

  _bindEvents: function() {
    var self = this;
    document.getElementById('btn-new-envoi').addEventListener('click', function() { self._showEnvoiForm(); });
    document.getElementById('fiche-statut').addEventListener('change', function() { self._load(); });
    document.getElementById('fiche-localite').addEventListener('change', function() { self._load(); });
    document.getElementById('btn-fiches-refresh').addEventListener('click', function() { self._load(); });
  },

  _loadLocalites: function() {
    var self = this;
    API.getLocalites()
      .then(function(data) {
        var sel = document.getElementById('fiche-localite');
        for (var i = 0; i < data.localites.length; i++) {
          var opt = document.createElement('option');
          opt.value = data.localites[i].id;
          opt.textContent = data.localites[i].nom;
          sel.appendChild(opt);
        }
      })
      .catch(function() {});
  },

  _getFilterParams: function() {
    var params = {};
    var statut = document.getElementById('fiche-statut').value;
    var loc = document.getElementById('fiche-localite').value;
    var debut = document.getElementById('fiche-debut').value;
    var fin = document.getElementById('fiche-fin').value;
    if (statut) params.statut = statut;
    if (loc) params.localite_id = loc;
    if (debut) params.debut = debut;
    if (fin) params.fin = fin;
    return params;
  },

  _load: function() {
    var self = this;
    API.getFiches(this._getFilterParams())
      .then(function(data) { self._renderTable(data.fiches); })
      .catch(function(err) {
        document.getElementById('fiches-table').innerHTML = '<div class="empty-state"><p>' + UI.escapeHtml(err.message) + '</p></div>';
      });
  },

  _renderTable: function(fiches) {
    var el = document.getElementById('fiches-table');
    if (!fiches || !fiches.length) {
      el.innerHTML = UI.renderEmptyState('Aucune fiche de reception', 'Creer un envoi', '#');
      return;
    }

    var html = '<div class="table-wrapper"><table><thead><tr>' +
      '<th>Reference</th><th>Date</th><th>Destination</th><th>Statut</th><th>Lignes</th><th>Scan</th><th>Actions</th>' +
      '</tr></thead><tbody>';

    var self = this;
    for (var i = 0; i < fiches.length; i++) {
      var f = fiches[i];
      html += '<tr>' +
        '<td><strong style="font-family:var(--font-heading);font-size:0.85rem">' + UI.escapeHtml(f.reference) + '</strong></td>' +
        '<td>' + UI.formatDate(f.date_envoi || f.date_creation) + '</td>' +
        '<td><strong>' + UI.escapeHtml(f.localite_nom) + '</strong></td>' +
        '<td>' + UI.renderBadgeStatut(f.statut) + '</td>' +
        '<td>' + (f.nb_lignes || 0) + '</td>' +
        '<td>' + (f.fichier_path ? '<span class="badge badge-success">Scanne</span>' : '<span class="badge badge-warning">En attente</span>') + '</td>' +
        '<td class="actions">' +
        '<button class="btn btn-sm btn-info btn-view-fiche" data-id="' + f.id + '" title="Voir">Voir</button>' +
        '<button class="btn btn-sm btn-secondary btn-print-fiche" data-id="' + f.id + '" title="Imprimer">Imprimer</button>';

      if (f.statut === 'envoyee') {
        html += '<button class="btn btn-sm btn-success btn-upload-scan" data-id="' + f.id + '" title="Scanner la fiche signee">Scanner</button>';
      } else if (f.fichier_path && (f.statut === 'signee' || f.statut === 'archivee')) {
        html += '<a href="' + f.fichier_path + '" target="_blank" class="btn btn-sm btn-secondary">Voir scan</a>';
      }

      html += '</td></tr>';
    }
    html += '</tbody></table></div>';
    el.innerHTML = html;

    // Bind events
    ['btn-view-fiche', 'btn-print-fiche', 'btn-upload-scan'].forEach(function(cls) {
      var btns = el.querySelectorAll('.' + cls);
      for (var j = 0; j < btns.length; j++) {
        btns[j].addEventListener('click', function() {
          var id = parseInt(this.getAttribute('data-id'));
          if (this.classList.contains('btn-view-fiche')) self._viewFiche(id);
          else if (this.classList.contains('btn-print-fiche')) self._printFiche(id);
          else if (this.classList.contains('btn-upload-scan')) self._uploadScan(id);
        });
      }
    });
  },

  _showEnvoiForm: function() {
    var self = this;
    Promise.all([API.getLocalites(), API.getArticles()])
      .then(function(results) {
        var localites = results[0].localites;
        var articles = results[1].articles;

        var locOptions = '<option value="">Choisir la destination...</option>';
        for (var i = 0; i < localites.length; i++) {
          var badge = localites[i].type === 'international' ? ' [International]' : '';
          locOptions += '<option value="' + localites[i].id + '">' + UI.escapeHtml(localites[i].nom) + badge + '</option>';
        }

        var articleOptions = '';
        for (var j = 0; j < articles.length; j++) {
          var a = articles[j];
          articleOptions += '<option value="' + a.id + '" data-type="' + a.type_article + '" data-stock="' + a.stock_actuel + '">' +
            UI.escapeHtml(a.nom) + ' (stock: ' + a.stock_actuel + ' ' + UI.escapeHtml(a.unite) + ')' +
            (a.type_article === 'numerote' ? ' [NUMEROTE]' : '') + '</option>';
        }

        self._lignes = [{ article_id: '', quantite: 1, numero_debut: '', numero_fin: '', observation: '' }];

        function renderLignes() {
          var h = '';
          for (var k = 0; k < self._lignes.length; k++) {
            var l = self._lignes[k];
            h += '<div class="commande-ligne" data-index="' + k + '" style="grid-template-columns:2fr 1fr auto auto auto;align-items:end">' +
              '<div class="form-group" style="margin-bottom:0"><select class="form-select art-envoi" data-index="' + k + '"><option value="">Article</option>' + articleOptions + '</select></div>' +
              '<div class="form-group" style="margin-bottom:0"><input type="number" class="form-input qte-envoi" data-index="' + k + '" value="' + l.quantite + '" min="1" placeholder="Qte"></div>' +
              '<div class="form-group" style="margin-bottom:0"><input type="text" class="form-input num-debut" data-index="' + k + '" value="' + (l.numero_debut || '') + '" placeholder="N° debut"></div>' +
              '<div class="form-group" style="margin-bottom:0"><input type="text" class="form-input num-fin" data-index="' + k + '" value="' + (l.numero_fin || '') + '" placeholder="N° fin"></div>' +
              '<button type="button" class="btn btn-sm btn-danger btn-remove-ligne" data-index="' + k + '" style="min-width:32px">&times;</button>' +
              '</div>';
          }
          return h;
        }

        var formHtml =
          '<div class="form-group"><label class="form-label">Destination *</label><select class="form-select" id="envoi-localite">' + locOptions + '</select></div>' +
          '<div class="form-group"><label class="form-label">Notes</label><textarea class="form-textarea" id="envoi-notes" rows="2" placeholder="Observations..."></textarea></div>' +
          '<div class="flex-between mb-sm"><h4 style="font-size:0.9375rem">Articles a envoyer</h4><button type="button" class="btn btn-sm btn-secondary" id="btn-add-ligne-envoi">+ Ajouter</button></div>' +
          '<div id="lignes-envoi">' + renderLignes() + '</div>';

        var modal = UI.modal('Nouvel envoi', formHtml, [
          { label: 'Annuler', cls: 'btn-secondary', callback: function(m) { m.close(); } },
          { label: 'Creer et imprimer', cls: 'btn-primary', callback: function(m) { self._saveEnvoi(m); } }
        ]);

        var lignesContainer = document.getElementById('lignes-envoi');

        document.getElementById('btn-add-ligne-envoi').addEventListener('click', function() {
          self._lignes.push({ article_id: '', quantite: 1, numero_debut: '', numero_fin: '', observation: '' });
          lignesContainer.innerHTML = renderLignes();
          self._bindLignesEvents(lignesContainer);
        });

        self._bindLignesEvents(lignesContainer);
      })
      .catch(function(err) { UI.toast(err.message, 'error'); });
  },

  _bindLignesEvents: function(container) {
    var self = this;

    var selects = container.querySelectorAll('.art-envoi');
    for (var i = 0; i < selects.length; i++) {
      selects[i].addEventListener('change', function() {
        var idx = parseInt(this.getAttribute('data-index'));
        self._lignes[idx].article_id = this.value;
      });
    }

    var qtes = container.querySelectorAll('.qte-envoi');
    for (var j = 0; j < qtes.length; j++) {
      qtes[j].addEventListener('input', function() {
        var idx = parseInt(this.getAttribute('data-index'));
        self._lignes[idx].quantite = parseInt(this.value) || 1;
      });
    }

    var debuts = container.querySelectorAll('.num-debut');
    for (var k = 0; k < debuts.length; k++) {
      debuts[k].addEventListener('input', function() {
        var idx = parseInt(this.getAttribute('data-index'));
        self._lignes[idx].numero_debut = this.value;
      });
    }

    var fins = container.querySelectorAll('.num-fin');
    for (var f = 0; f < fins.length; f++) {
      fins[f].addEventListener('input', function() {
        var idx = parseInt(this.getAttribute('data-index'));
        self._lignes[idx].numero_fin = this.value;
      });
    }

    var removes = container.querySelectorAll('.btn-remove-ligne');
    for (var r = 0; r < removes.length; r++) {
      removes[r].addEventListener('click', function() {
        var idx = parseInt(this.getAttribute('data-index'));
        if (self._lignes.length <= 1) { UI.toast('Il faut au moins un article.', 'warning'); return; }
        self._lignes.splice(idx, 1);
        container.innerHTML = '';
        // Quick re-render
        var modal = this.closest('.modal-content');
        if (modal) { modal.querySelector('.btn-remove-ligne').closest('.commande-ligne').remove(); }
      });
    }
  },

  _saveEnvoi: function(modal) {
    var localiteId = parseInt(document.getElementById('envoi-localite').value);
    var notes = document.getElementById('envoi-notes').value.trim() || null;

    if (!localiteId) { UI.toast('Choisissez une destination.', 'error'); return; }

    var articles = [];
    for (var i = 0; i < this._lignes.length; i++) {
      var l = this._lignes[i];
      if (!l.article_id) { UI.toast('Tous les articles sont requis.', 'error'); return; }
      articles.push({
        article_id: parseInt(l.article_id),
        quantite: l.quantite || 1,
        numero_debut: l.numero_debut || null,
        numero_fin: l.numero_fin || null,
        observation: l.observation || null
      });
    }

    var self = this;
    API.createFiche({ localite_id: localiteId, articles: articles, notes: notes })
      .then(function(data) {
        UI.toast('Fiche de reception creee: ' + data.fiche.reference, 'success');
        modal.close();
        self._load();
        // Proposer l'impression
        setTimeout(function() {
          UI.confirm('Voulez-vous imprimer la fiche de reception maintenant ?')
            .then(function(ok) { if (ok) self._printFiche(data.fiche.id); });
        }, 500);
      })
      .catch(function(err) { UI.toast(err.message, 'error'); });
  },

  _viewFiche: function(id) {
    var self = this;
    API.getFiche(id)
      .then(function(data) {
        var f = data.fiche;
        var lignes = data.lignes;

        var html = '<div style="font-size:0.9rem">' +
          '<div class="flex-between mb-md"><div><strong>Reference:</strong> ' + UI.escapeHtml(f.reference) + '</div>' +
          '<div>' + UI.renderBadgeStatut(f.statut) + '</div></div>' +
          '<div class="flex-between mb-md"><div><strong>Destination:</strong> ' + UI.escapeHtml(f.localite_nom) + ' (' + (f.localite_type === 'international' ? 'International - ' + UI.escapeHtml(f.localite_pays) : 'National') + ')</div>' +
          '<div><strong>Date:</strong> ' + UI.formatDate(f.date_envoi || f.date_creation) + '</div></div>';

        if (f.notes) html += '<p class="mb-md"><strong>Notes:</strong> ' + UI.escapeHtml(f.notes) + '</p>';

        if (lignes.length) {
          html += '<div class="table-wrapper"><table><thead><tr><th>Article</th><th>Qté</th><th>N° debut</th><th>N° fin</th><th>Unite</th></tr></thead><tbody>';
          for (var i = 0; i < lignes.length; i++) {
            var l = lignes[i];
            html += '<tr><td><strong>' + UI.escapeHtml(l.article_nom || '-') + '</strong><br><span class="text-sm text-muted">' + UI.escapeHtml(l.reference || '') + '</span></td>' +
              '<td>' + l.quantite + '</td><td>' + (l.numero_debut || '-') + '</td><td>' + (l.numero_fin || '-') + '</td><td>' + UI.escapeHtml(l.unite || 'piece') + '</td></tr>';
          }
          html += '</tbody></table></div>';
        }

        // Fichier scan
        if (f.fichier_path) {
          html += '<div class="mt-md"><strong>Scan de la fiche signee:</strong><br><img src="' + f.fichier_path + '" style="max-width:100%;max-height:300px;border:1px solid var(--color-border);border-radius:var(--radius-sm);margin-top:0.5rem" alt="Scan fiche signee"></div>';
        }

        html += '</div>';

        // Actions
        var actions = [{ label: 'Fermer', cls: 'btn-secondary', callback: function(m) { m.close(); } }];
        if (f.statut === 'envoyee') {
          actions.unshift({ label: 'Marquer comme signee', cls: 'btn-success', callback: function(m) { m.close(); self._changeStatut(id, 'signee'); } });
        }
        if (f.statut === 'signee') {
          actions.unshift({ label: 'Archiver', cls: 'btn-secondary', callback: function(m) { m.close(); self._changeStatut(id, 'archivee'); } });
        }
        actions.unshift({ label: 'Imprimer', cls: 'btn-primary', callback: function(m) { self._printFiche(id); } });

        UI.modal('Fiche ' + UI.escapeHtml(f.reference), html, actions);
      })
      .catch(function(err) { UI.toast(err.message, 'error'); });
  },

  _printFiche: function(id) {
    var self = this;
    API.getFiche(id)
      .then(function(data) {
        var f = data.fiche;
        var lignes = data.lignes;

        // Construire la page d'impression
        var printHtml = '<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><title>Fiche ' + UI.escapeHtml(f.reference) + '</title>' +
          '<style>' +
          '@page { size: A4; margin: 15mm; }' +
          'body { font-family: Arial, sans-serif; font-size: 12px; color: #000; }' +
          '.header { text-align: center; margin-bottom: 20px; border-bottom: 2px solid #334155; padding-bottom: 15px; }' +
          '.header img { width: 70px; height: 70px; object-fit: contain; }' +
          '.header h1 { font-size: 18px; margin: 8px 0 4px; color: #334155; }' +
          '.header h2 { font-size: 14px; margin: 0; color: #059669; }' +
          '.info { display: flex; justify-content: space-between; margin-bottom: 15px; }' +
          '.info-box { border: 1px solid #ccc; padding: 8px 12px; border-radius: 4px; }' +
          '.info-label { font-size: 10px; color: #666; text-transform: uppercase; }' +
          '.info-value { font-size: 13px; font-weight: bold; }' +
          'table { width: 100%; border-collapse: collapse; margin: 15px 0; }' +
          'th { background: #334155; color: white; padding: 8px; text-align: left; font-size: 11px; }' +
          'td { padding: 8px; border-bottom: 1px solid #ddd; font-size: 12px; }' +
          '.signatures { display: flex; justify-content: space-between; margin-top: 50px; }' +
          '.sig-box { width: 45%; border-top: 1px solid #000; padding-top: 8px; text-align: center; font-size: 11px; }' +
          '.footer { margin-top: 40px; padding-top: 10px; border-top: 1px solid #ccc; font-size: 10px; color: #666; text-align: center; font-style: italic; }' +
          '@media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }' +
          '</style></head><body>' +

          // Header
          '<div class="header">' +
          '<img src="/logo.jpeg" alt="Nizar Transport">' +
          '<h1>NIZAR TRANSPORT VOYAGEUR</h1>' +
          '<h2>FICHE DE RECEPTION</h2>' +
          '</div>' +

          // Info
          '<div class="info">' +
          '<div class="info-box"><div class="info-label">Reference</div><div class="info-value">' + UI.escapeHtml(f.reference) + '</div></div>' +
          '<div class="info-box"><div class="info-label">Date envoi</div><div class="info-value">' + UI.formatDate(f.date_envoi || f.date_creation) + '</div></div>' +
          '<div class="info-box"><div class="info-label">Centre destinataire</div><div class="info-value">' + UI.escapeHtml(f.localite_nom) + ' (' + (f.localite_type === 'international' ? 'International' : 'National') + ')</div></div>' +
          '</div>' +

          // Table
          '<table><thead><tr><th>Article</th><th>Numero / Intervalle</th><th>Quantite</th><th>Unite</th></tr></thead><tbody>';

        for (var i = 0; i < lignes.length; i++) {
          var l = lignes[i];
          var numero = '';
          if (l.numero_debut && l.numero_fin) numero = l.numero_debut + ' - ' + l.numero_fin;
          else if (l.numero_debut) numero = l.numero_debut;
          printHtml += '<tr><td>' + UI.escapeHtml(l.article_nom || '-') + '</td>' +
            '<td>' + (numero || '-') + '</td>' +
            '<td>' + l.quantite + '</td><td>' + UI.escapeHtml(l.unite || 'piece') + '</td></tr>';
        }

        printHtml += '</tbody></table>' +

          // Signatures
          '<div class="signatures">' +
          '<div class="sig-box">Gestionnaire de stock<br><small>Cachet et signature</small></div>' +
          '<div class="sig-box">Chef d\'agence<br><small>Date et signature a la reception</small></div>' +
          '</div>' +

          // Note
          '<div class="footer">NB: A renvoyer au service stock des reception</div>' +
          '</body></html>';

        // Open print window
        var w = window.open('', '_blank', 'width=800,height=600');
        w.document.write(printHtml);
        w.document.close();
        setTimeout(function() { w.print(); }, 500);
      })
      .catch(function(err) { UI.toast(err.message, 'error'); });
  },

  _uploadScan: function(id) {
    var self = this;
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*,.pdf';
    input.capture = 'environment'; // Pour utiliser l'appareil photo sur mobile

    input.addEventListener('change', function() {
      var file = this.files[0];
      if (!file) return;
      if (file.size > 10 * 1024 * 1024) {
        UI.toast('Fichier trop volumineux (max 10 Mo).', 'error');
        return;
      }

      UI.toast('Upload en cours...', 'info');

      API.uploadScanFiche(id, file)
        .then(function(data) {
          if (data.error) { UI.toast(data.error, 'error'); return; }
          UI.toast('Scan uploade. Fiche marquee comme signee.', 'success');
          self._load();
        })
        .catch(function(err) { UI.toast(err.message, 'error'); });
    });

    input.click();
  },

  _changeStatut: function(id, statut) {
    var self = this;
    API.changeStatutFiche(id, statut)
      .then(function() {
        UI.toast('Statut mis a jour: ' + statut, 'success');
        self._load();
      })
      .catch(function(err) { UI.toast(err.message, 'error'); });
  }
};
