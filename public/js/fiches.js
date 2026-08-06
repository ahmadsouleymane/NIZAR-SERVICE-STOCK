// public/js/fiches.js — Fiches de reception avec PDF auto
var Fiches = {
  _lignes: [],
  _articleItems: [],
  _acLignes: [],

  render: function(container) {
    container.innerHTML =
      '<div class="card"><div class="card-header flex-between"><h3 class="card-title">Fiches de reception</h3>' +
      '<button class="btn btn-primary" id="btn-new-envoi"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> Nouvel envoi</button>' +
      '</div>' +
      '<div class="filter-bar">' +
      '<select class="form-select" id="fiche-statut"><option value="">Tous</option><option value="envoyee">Sortie validee</option><option value="signee">OK — Retour recu</option><option value="archivee">Archivee</option></select>' +
      '<select class="form-select" id="fiche-localite"><option value="">Toutes destinations</option></select>' +
      '<button class="btn btn-secondary btn-sm" id="btn-fiches-refresh">Actualiser</button>' +
      '</div><div id="fiches-table">' + UI.renderSkeleton(6) + '</div></div>';

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
    API.getLocalites().then(function(data) {
      var sel = document.getElementById('fiche-localite');
      var agences = '<optgroup label="Agences">';
      var services = '<optgroup label="Services (Siege)">';
      for (var i = 0; i < data.localites.length; i++) {
        var l = data.localites[i];
        var opt = '<option value="' + l.id + '">' + UI.escapeHtml(l.nom) + '</option>';
        if (l.est_service) services += opt; else agences += opt;
      }
      sel.innerHTML = '<option value="">Toutes destinations</option>' + agences + '</optgroup>' + services + '</optgroup>';
    }).catch(function() {});
  },

  _load: function() {
    var self = this;
    var params = {};
    var s = document.getElementById('fiche-statut').value;
    var l = document.getElementById('fiche-localite').value;
    if (s) params.statut = s;
    if (l) params.localite_id = l;

    API.getFiches(params).then(function(data) { self._renderTable(data.fiches); })
      .catch(function(err) { document.getElementById('fiches-table').innerHTML = '<div class="empty-state"><p>' + UI.escapeHtml(err.message) + '</p></div>'; });
  },

  _renderTable: function(fiches) {
    var el = document.getElementById('fiches-table');
    if (!fiches || !fiches.length) { el.innerHTML = UI.renderEmptyState('Aucune fiche', 'Creer un envoi', 'fiches'); return; }

    var self = this;
    var html = '<div class="table-wrapper"><table><thead><tr><th>Reference</th><th>Date</th><th>Destination</th><th>Statut</th><th>Lignes</th><th>PDF</th><th>Scan</th><th>Actions</th></tr></thead><tbody>';

    for (var i = 0; i < fiches.length; i++) {
      var f = fiches[i];
      var statutLabel = f.statut === 'envoyee' ? 'Sortie validee' : (f.statut === 'signee' ? 'OK — Retour recu' : 'Archivee');
      var statutCls = f.statut === 'envoyee' ? 'badge-info' : (f.statut === 'signee' ? 'badge-success' : 'badge-neutral');

      html += '<tr><td><strong style="font-family:var(--font-heading);font-size:0.8rem">' + UI.escapeHtml(f.reference) + '</strong></td>' +
        '<td>' + UI.formatDate(f.date_envoi || f.date_creation) + '</td>' +
        '<td><strong>' + UI.escapeHtml(f.localite_nom) + '</strong>' + (f.localite_service ? ' <span class="badge badge-success">Siege</span>' : '') + '</td>' +
        '<td><span class="badge ' + statutCls + '">' + statutLabel + '</span></td>' +
        '<td>' + (f.nb_lignes || 0) + '</td>' +
        '<td>' + (f.fichier_path ? '<a href="' + UI.escapeHtml(f.fichier_path) + '" target="_blank" class="btn btn-sm btn-accent" style="font-size:0.7rem">PDF</a>' : '<span class="text-sm text-muted">—</span>') + '</td>' +
        '<td>' + (f.fichier_path && (f.statut === 'archivee' || f.statut === 'signee') ? '<span class="badge badge-success">Scanne</span>' : '<span class="badge badge-warning">En attente</span>') + '</td>' +
        '<td class="actions">' +
        '<button class="btn btn-sm btn-info btn-view-fiche" data-id="' + f.id + '">Details</button>' +
        '<button class="btn btn-sm btn-accent btn-dl-pdf" data-id="' + f.id + '">PDF</button>';

      if (f.statut === 'envoyee') {
        html += '<button class="btn btn-sm btn-success btn-upload-scan" data-id="' + f.id + '">Scanner</button>';
      }

      if (f.statut === 'envoyee') {
        html += '<button class="btn btn-sm btn-success btn-ok-retour" data-id="' + f.id + '">OK — Retour</button>';
      }

      html += '</td></tr>';
    }
    html += '</tbody></table></div>';
    el.innerHTML = html;

    ['btn-view-fiche', 'btn-dl-pdf', 'btn-upload-scan', 'btn-ok-retour'].forEach(function(cls) {
      var btns = el.querySelectorAll('.' + cls);
      for (var j = 0; j < btns.length; j++) {
        btns[j].addEventListener('click', function() {
          var id = parseInt(this.getAttribute('data-id'));
          if (this.classList.contains('btn-view-fiche')) self._viewFiche(id);
          else if (this.classList.contains('btn-dl-pdf')) self._downloadPDF(id);
          else if (this.classList.contains('btn-upload-scan')) self._uploadScan(id);
          else if (this.classList.contains('btn-ok-retour')) self._okRetour(id);
        });
      }
    });
  },

  _showEnvoiForm: function() {
    var self = this;
    Promise.all([API.getLocalites(), API.getArticles()]).then(function(results) {
      var localites = results[0].localites;
      var articles = results[1].articles;

      var locOptions = '<option value="">Choisir la destination...</option>';
      var agences = '<optgroup label="Agences">';
      var services = '<optgroup label="Services (Siege)">';
      for (var i = 0; i < localites.length; i++) {
        var loc = localites[i];
        var opt = '<option value="' + loc.id + '">' + UI.escapeHtml(loc.nom) + (loc.type === 'international' ? ' [International]' : '') + '</option>';
        if (loc.est_service) services += opt; else agences += opt;
      }
      locOptions += agences + '</optgroup>' + services + '</optgroup>';

      self._articleItems = articles.map(function(a) {
        return { id: a.id, label: a.nom, meta: 'Stock: ' + a.stock_actuel + ' ' + a.unite, type: a.type_article };
      });
      self._lignes = [{ article_id: '', quantite: 1, numero_debut: '', numero_fin: '', article_type: '' }];
      self._acLignes = [];

      var body =
        '<div class="form-group"><label class="form-label">Destination *</label><select class="form-select" id="envoi-loc">' + locOptions + '</select></div>' +
        '<div class="form-group"><label class="form-label">Destinataire (qui recoit)</label><input type="text" class="form-input" id="envoi-destinataire" placeholder="Nom de la personne / du service..."></div>' +
        '<div class="flex-between mb-sm"><strong>Articles</strong><button class="btn btn-sm btn-secondary" id="btn-add-line">+ Ajouter</button></div>' +
        '<div id="lignes-envoi"></div>';

      UI.modal('Nouvel envoi', body, [
        { label: 'Annuler', cls: 'btn-secondary', callback: function(m) { m.close(); } },
        { label: 'Valider la sortie', cls: 'btn-primary', callback: function(m) { self._saveEnvoi(m); } }
      ]);

      document.getElementById('btn-add-line').addEventListener('click', function() {
        self._lignes.push({ article_id: '', quantite: 1, numero_debut: '', numero_fin: '', article_type: '' });
        self._renderLignesEnvoi();
      });
      self._renderLignesEnvoi();
    }).catch(function(err) { UI.toast(err.message, 'error'); });
  },

  _renderLignesEnvoi: function() {
    var lc = document.getElementById('lignes-envoi');
    if (!lc) return;
    var h = '';
    for (var k = 0; k < this._lignes.length; k++) {
      var l = this._lignes[k];
      var showNum = l.article_type === 'numerote' ? 'flex' : 'none';
      h += '<div class="commande-ligne" style="border:1px solid var(--color-border);border-radius:10px;padding:8px;margin-bottom:8px">' +
        '<div class="art-envoi-ac" data-idx="' + k + '"></div>' +
        '<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-top:6px">' +
        '<input type="number" class="form-input qte-envoi" data-idx="' + k + '" value="' + (l.quantite || 1) + '" min="1" placeholder="Qte" style="min-height:40px;width:90px">' +
        '<div class="num-fields" data-idx="' + k + '" style="display:' + showNum + ';gap:6px;flex-wrap:wrap">' +
        '<input type="text" class="form-input num-debut" data-idx="' + k + '" value="' + (l.numero_debut || '') + '" placeholder="N° debut" style="min-height:40px;width:110px">' +
        '<input type="text" class="form-input num-fin" data-idx="' + k + '" value="' + (l.numero_fin || '') + '" placeholder="N° fin" style="min-height:40px;width:110px">' +
        '</div>' +
        '<button class="btn btn-sm btn-danger btn-rm-line" data-idx="' + k + '" style="min-width:32px;min-height:40px">&times;</button>' +
        '</div></div>';
    }
    lc.innerHTML = h;
    this._bindLignes(lc);
  },

  _bindLignes: function(container) {
    var self = this;
    container.querySelectorAll('.art-envoi-ac').forEach(function(el) {
      var idx = parseInt(el.dataset.idx);
      var ac = UI.autocomplete(el, {
        items: self._articleItems,
        placeholder: 'Rechercher un article...',
        onSelect: function(item) {
          var l = self._lignes[idx];
          l.article_id = item.id;
          l.article_type = item.type;
          var nf = container.querySelector('.num-fields[data-idx="' + idx + '"]');
          if (nf) nf.style.display = item.type === 'numerote' ? 'flex' : 'none';
        }
      });
      self._acLignes[idx] = ac;
      if (self._lignes[idx] && self._lignes[idx].article_id) {
        ac.set(self._lignes[idx].article_id);
        var nf = container.querySelector('.num-fields[data-idx="' + idx + '"]');
        if (nf) nf.style.display = self._lignes[idx].article_type === 'numerote' ? 'flex' : 'none';
      }
    });
    container.querySelectorAll('.qte-envoi').forEach(function(el) {
      el.addEventListener('input', function() { self._lignes[parseInt(this.dataset.idx)].quantite = parseInt(this.value) || 1; });
    });
    container.querySelectorAll('.num-debut').forEach(function(el) {
      el.addEventListener('input', function() { self._lignes[parseInt(this.dataset.idx)].numero_debut = this.value; });
    });
    container.querySelectorAll('.num-fin').forEach(function(el) {
      el.addEventListener('input', function() { self._lignes[parseInt(this.dataset.idx)].numero_fin = this.value; });
    });
    container.querySelectorAll('.btn-rm-line').forEach(function(el) {
      el.addEventListener('click', function() {
        var idx = parseInt(this.dataset.idx);
        if (self._lignes.length <= 1) { UI.toast('Il faut au moins un article.', 'warning'); return; }
        self._lignes.splice(idx, 1);
        self._renderLignesEnvoi();
      });
    });
  },

  _saveEnvoi: function(modal) {
    var locId = parseInt(document.getElementById('envoi-loc').value);
    var destinataire = document.getElementById('envoi-destinataire').value.trim() || null;

    if (!locId) { UI.toast('Choisissez une destination.', 'error'); return; }

    var arts = [];
    for (var i = 0; i < this._lignes.length; i++) {
      var l = this._lignes[i];
      if (!l.article_id) { UI.toast('Tous les articles sont requis.', 'error'); return; }
      arts.push({ article_id: parseInt(l.article_id), quantite: l.quantite || 1, numero_debut: l.numero_debut || null, numero_fin: l.numero_fin || null });
    }

    var self = this;
    API.createFiche({ localite_id: locId, articles: arts, destinataire: destinataire })
      .then(function(data) {
        var f = data.fiche;
        UI.toast('Sortie validee — Fiche ' + f.reference + ' creee. PDF genere.', 'success');
        modal.close();
        self._load();

        // Proposer telechargement du PDF
        setTimeout(function() {
          UI.confirm('Le PDF a ete genere. Voulez-vous le telecharger maintenant ?')
            .then(function(ok) { if (ok) self._downloadPDF(f.id); });
        }, 400);
      })
      .catch(function(err) { UI.toast(err.message, 'error'); });
  },

  _viewFiche: function(id) {
    var self = this;
    API.getFiche(id).then(function(data) {
      var f = data.fiche, lignes = data.lignes;

      var html = '<div style="font-size:0.9rem">' +
        '<div class="flex-between mb-md"><div><strong>Ref:</strong> ' + UI.escapeHtml(f.reference) + '</div><div><span class="badge ' + (f.statut === 'envoyee' ? 'badge-info' : (f.statut === 'signee' ? 'badge-success' : 'badge-neutral')) + '">' + (f.statut === 'envoyee' ? 'Sortie validee' : (f.statut === 'signee' ? 'OK — Retour recu' : 'Archivee')) + '</span></div></div>' +
        '<div class="flex-between mb-md"><div><strong>Destination:</strong> ' + UI.escapeHtml(f.localite_nom) + (f.localite_service ? ' <span class="badge badge-success">Siege</span>' : '') + '</div><div><strong>Date:</strong> ' + UI.formatDate(f.date_envoi || f.date_creation) + '</div></div>' +
        (f.destinataire ? '<div class="flex-between mb-md"><div><strong>Destinataire:</strong> ' + UI.escapeHtml(f.destinataire) + '</div></div>' : '');

      if (f.notes) html += '<p class="mb-md"><strong>Notes:</strong> ' + UI.escapeHtml(f.notes) + '</p>';

      if (lignes.length) {
        html += '<div class="table-wrapper"><table><thead><tr><th>Article</th><th>Qté</th><th>N° debut</th><th>N° fin</th></tr></thead><tbody>';
        for (var i = 0; i < lignes.length; i++) {
          html += '<tr><td>' + UI.escapeHtml(lignes[i].article_nom || '-') + '</td><td>' + lignes[i].quantite + '</td><td>' + UI.escapeHtml(lignes[i].numero_debut || '-') + '</td><td>' + UI.escapeHtml(lignes[i].numero_fin || '-') + '</td></tr>';
        }
        html += '</tbody></table></div>';
      }

      if (f.fichier_path) {
        if (f.fichier_path.endsWith('.pdf')) {
          html += '<div class="mt-md"><a href="' + UI.escapeHtml(f.fichier_path) + '" target="_blank" class="btn btn-accent btn-sm">Telecharger le PDF</a></div>';
        } else {
          html += '<div class="mt-md"><strong>Scan signe:</strong><br><img src="' + UI.escapeHtml(f.fichier_path) + '" style="max-width:100%;max-height:250px;border:1px solid var(--color-border);border-radius:8px;margin-top:0.5rem"></div>';
        }
      }

      html += '</div>';

      var actions = [{ label: 'Fermer', cls: 'btn-secondary', callback: function(m) { m.close(); } }];
      if (f.statut === 'envoyee') {
        actions.unshift({ label: 'Archiver', cls: 'btn-secondary', callback: function(m) { m.close(); self._archiveFiche(id); } });
      }
      if (f.statut === 'envoyee') {
        actions.unshift({ label: 'OK — Retour recu', cls: 'btn-success', callback: function(m) { m.close(); self._okRetour(id); } });
      }
      if (f.fichier_path) {
        actions.unshift({ label: 'Telecharger PDF', cls: 'btn-accent', callback: function(m) { self._downloadPDF(id); } });
      }

      UI.modal('Fiche ' + UI.escapeHtml(f.reference), html, actions);
    }).catch(function(err) { UI.toast(err.message, 'error'); });
  },

  _downloadPDF: function(id) {
    var token = API.getToken();
    var a = document.createElement('a');
    a.href = '/api/fiches/' + id + '/pdf';
    a.target = '_blank';
    // Ajouter le token dans l'URL pour l'auth (le serveur attend un header Bearer, donc on passe par le navigateur)
    // Alternative: telecharger via fetch
    fetch('/api/fiches/' + id + '/pdf', { headers: { 'Authorization': 'Bearer ' + token } })
      .then(function(res) {
        if (!res.ok) throw new Error('Erreur');
        return res.blob();
      })
      .then(function(blob) {
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = 'fiche-' + id + '.pdf';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      })
      .catch(function() { UI.toast('Erreur lors du telechargement du PDF.', 'error'); });
  },

  _uploadScan: function(id) {
    var self = this;
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*,.pdf';
    input.capture = 'environment';

    input.addEventListener('change', function() {
      var file = this.files[0];
      if (!file) return;
      if (file.size > 10 * 1024 * 1024) { UI.toast('Fichier trop volumineux (max 10 Mo).', 'error'); return; }

      UI.toast('Upload en cours...', 'info');
      API.uploadScanFiche(id, file).then(function(data) {
        if (data.error) { UI.toast(data.error, 'error'); return; }
        UI.toast('Scan uploade. Fiche archivee.', 'success');
        self._load();
      }).catch(function(err) { UI.toast(err.message, 'error'); });
    });
    input.click();
  },

  _archiveFiche: function(id) {
    var self = this;
    UI.confirm('Archiver cette fiche ?').then(function(ok) {
      if (!ok) return;
      API.changeStatutFiche(id, 'archivee').then(function() { UI.toast('Fiche archivee.', 'success'); self._load(); })
        .catch(function(err) { UI.toast(err.message, 'error'); });
    });
  },

  _okRetour: function(id) {
    var self = this;
    UI.confirm('Marquer « OK » (retour signe recu) sur cette fiche ? Le document signe est renvoye par l agence.').then(function(ok) {
      if (!ok) return;
      API.changeStatutFiche(id, 'signee').then(function() {
        UI.toast('Retour valide — fiche marquee OK. Le PDF reste imprimable a tout moment.', 'success');
        self._load();
      }).catch(function(err) { UI.toast(err.message, 'error'); });
    });
  }
};
