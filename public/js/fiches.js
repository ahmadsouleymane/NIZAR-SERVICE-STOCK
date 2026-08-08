// public/js/fiches.js — Fiches de reception avec PDF auto
// Pipeline : envoyée -> retournée (photo obligatoire) -> archivée

var FICHE_STATUT = {
  envoyee:   { label: 'Envoyée',   cls: 'badge-info' },
  retournee: { label: 'Retournée', cls: 'badge-success' },
  archivee:  { label: 'Archivée',  cls: 'badge-neutral' }
};

var Fiches = {
  _lignes: [],
  _articleItems: [],
  _acLignes: [],

  render: function(container) {
    this._offset = 0;
    this._all = [];
    this._hasMore = true;

    container.innerHTML =
      '<div class="card"><div class="card-header flex-between"><h3 class="card-title">Sorties</h3>' +
      '<button class="btn btn-primary" id="btn-new-envoi"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> Nouvelle sortie</button>' +
      '</div>' +
      '<div class="filter-bar">' +
      '<select class="form-select" id="fiche-statut"><option value="">Tous</option><option value="envoyee">Envoyée</option><option value="retournee">Retournée</option><option value="archivee">Archivée</option></select>' +
      '<select class="form-select" id="fiche-localite"><option value="">Toutes destinations</option></select>' +
      '<button class="btn btn-secondary btn-sm" id="btn-fiches-refresh">Actualiser</button>' +
      '</div><div id="fiches-table">' + UI.renderSkeleton(6) + '</div>' +
      '<div id="fiches-more" class="text-center mt-md"></div></div>';

    this._loadLocalites();
    this._load(true);
    this._bindEvents();
  },

  _bindEvents: function() {
    var self = this;
    document.getElementById('btn-new-envoi').addEventListener('click', function() { self._showEnvoiForm(); });
    document.getElementById('fiche-statut').addEventListener('change', function() { self._load(true); });
    document.getElementById('fiche-localite').addEventListener('change', function() { self._load(true); });
    document.getElementById('btn-fiches-refresh').addEventListener('click', function() { self._load(true); });
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

  _load: function(reset) {
    var self = this;
    if (reset) { this._offset = 0; this._all = []; this._hasMore = true; }

    var params = { offset: this._offset };
    var s = document.getElementById('fiche-statut').value;
    var l = document.getElementById('fiche-localite').value;
    if (s) params.statut = s;
    if (l) params.localite_id = l;

    API.getFiches(params).then(function(data) {
      if (reset) self._all = data.fiches;
      else self._all = self._all.concat(data.fiches);
      self._hasMore = data.fiches.length >= 50;
      self._offset += data.fiches.length;
      self._renderTable(self._all);
      self._renderMore();
    })
      .catch(function(err) { document.getElementById('fiches-table').innerHTML = '<div class="empty-state"><p>' + UI.escapeHtml(err.message) + '</p></div>'; });
  },

  _renderMore: function() {
    var el = document.getElementById('fiches-more');
    if (!el) return;
    if (!this._hasMore) { el.innerHTML = ''; return; }
    var self = this;
    el.innerHTML = '<button class="btn btn-secondary btn-sm" id="btn-fiches-more">Voir plus</button>';
    document.getElementById('btn-fiches-more').addEventListener('click', function() { self._load(false); });
  },

  _statutBadge: function(st) {
    var s = FICHE_STATUT[st] || { label: st, cls: 'badge-neutral' };
    return '<span class="badge ' + s.cls + '">' + UI.escapeHtml(s.label) + '</span>';
  },

  _renderTable: function(fiches) {
    var el = document.getElementById('fiches-table');
    if (!fiches || !fiches.length) { el.innerHTML = UI.renderEmptyState('Aucune sortie', 'Créer une sortie', 'btn-new-envoi'); return; }

    var self = this;
    var html = '<div class="table-wrapper"><table><thead><tr><th>Référence</th><th>Date</th><th>Destination</th><th>Statut</th><th>Lignes</th><th>PDF</th><th>Photo retour</th><th>Actions</th></tr></thead><tbody>';

    for (var i = 0; i < fiches.length; i++) {
      var f = fiches[i];

      var scanCell = f.scan_path
        ? '<span class="badge badge-success">Photo</span>'
        : (f.statut === 'envoyee' ? '<span class="badge badge-warning">En attente</span>' : '<span class="text-muted">—</span>');

      html += '<tr><td><strong style="font-family:var(--font-heading);font-size:0.8rem">' + UI.escapeHtml(f.reference) + '</strong>' +
        (f.numero_facture ? '<div class="text-sm text-muted">' + UI.escapeHtml(f.numero_facture) + '</div>' : '') + '</td>' +
        '<td>' + UI.formatDate(f.date_envoi || f.date_creation) + '</td>' +
        '<td><strong>' + UI.escapeHtml(f.localite_nom) + '</strong>' + (f.localite_service ? ' <span class="badge badge-success">Siege</span>' : '') + '</td>' +
        '<td>' + this._statutBadge(f.statut) + '</td>' +
        '<td>' + (f.nb_lignes || 0) + '</td>' +
        '<td>' + (f.fichier_path ? '<a href="' + UI.escapeHtml(f.fichier_path) + '" target="_blank" class="btn btn-sm btn-accent" style="font-size:0.7rem">PDF</a>' : '<span class="text-sm text-muted">—</span>') + '</td>' +
        '<td>' + scanCell + '</td>' +
        '<td class="actions">' +
        '<button class="btn btn-sm btn-info btn-view-fiche" data-id="' + f.id + '">Details</button>' +
        '<button class="btn btn-sm btn-accent btn-dl-pdf" data-id="' + f.id + '">PDF</button>' +
        '<button class="btn btn-sm btn-secondary btn-print-fiche" data-id="' + f.id + '">Imprimer</button>';

      if (f.statut === 'envoyee') {
        html += '<button class="btn btn-sm btn-success btn-upload-scan" data-id="' + f.id + '">Scanner (retour)</button>';
      }
      if (f.statut === 'retournee') {
        html += '<button class="btn btn-sm btn-primary btn-archive-fiche" data-id="' + f.id + '">Archiver</button>';
      }

      html += '</td></tr>';
    }
    html += '</tbody></table></div>';
    el.innerHTML = html;

    ['btn-view-fiche', 'btn-dl-pdf', 'btn-upload-scan', 'btn-archive-fiche', 'btn-print-fiche'].forEach(function(cls) {
      var btns = el.querySelectorAll('.' + cls);
      for (var j = 0; j < btns.length; j++) {
        btns[j].addEventListener('click', function() {
          var id = parseInt(this.getAttribute('data-id'));
          if (this.classList.contains('btn-view-fiche')) self._viewFiche(id);
          else if (this.classList.contains('btn-dl-pdf')) self._downloadPDF(id);
          else if (this.classList.contains('btn-upload-scan')) self._uploadScan(id);
          else if (this.classList.contains('btn-archive-fiche')) self._archiveFiche(id);
          else if (this.classList.contains('btn-print-fiche')) self._imprimerPDF(id);
        });
      }
    });
  },

  // ===== Formulaire de sortie =====
  _uniteOptions: function(articleType, current) {
    // Billets / articles numérotés : gérés par lots de 500 ou 50
    var list = articleType === 'numerote'
      ? ['Lot de 500', 'Lot de 50']
      : ['Unité', 'Carton', 'Rouleau', 'Paquet', 'Lot', 'Boîte'];
    var html = '';
    for (var i = 0; i < list.length; i++) {
      html += '<option value="' + UI.escapeHtml(list[i]) + '"' + (list[i] === current ? ' selected' : '') + '>' + UI.escapeHtml(list[i]) + '</option>';
    }
    return html;
  },

  _showEnvoiForm: function() {
    var self = this;
    API.getLocalites().then(function(results) {
      var localites = results.localites;

      var locOptions = '<option value="">Choisir la destination...</option>';
      var agences = '<optgroup label="Agences">';
      var services = '<optgroup label="Services (Siege)">';
      for (var i = 0; i < localites.length; i++) {
        var loc = localites[i];
        var opt = '<option value="' + loc.id + '">' + UI.escapeHtml(loc.nom) + (loc.type === 'international' ? ' [International]' : '') + '</option>';
        if (loc.est_service) services += opt; else agences += opt;
      }
      locOptions += agences + '</optgroup>' + services + '</optgroup>';

      self._lignes = [{ article_id: '', quantite: 1, unite: '', numero_debut: '', numero_fin: '', article_type: '', article_nom: '' }];
      self._acLignes = [];

      var body =
        '<div class="form-group"><label class="form-label">Destination *</label><select class="form-select" id="envoi-loc">' + locOptions + '</select></div>' +
        '<div class="form-group"><label class="form-label">Date de la sortie</label><input type="date" class="form-input" id="envoi-date"></div>' +
        '<div class="flex-between mb-sm"><strong>Articles</strong><button class="btn btn-sm btn-secondary" id="btn-add-line">+ Ajouter</button></div>' +
        '<div id="lignes-envoi"></div>';

      UI.modal('Nouvelle sortie', body, [
        { label: 'Annuler', cls: 'btn-secondary', callback: function(m) { m.close(); } },
        { label: 'Valider la sortie', cls: 'btn-primary', callback: function(m) { self._saveEnvoi(m); } }
      ]);

      document.getElementById('btn-add-line').addEventListener('click', function() {
        self._lignes.push({ article_id: '', quantite: 1, unite: '', numero_debut: '', numero_fin: '', article_type: '', article_nom: '' });
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
      var showNum = l.article_type === 'numerote';
      h += '<div style="border:1px solid var(--color-border);border-radius:10px;padding:10px;margin-bottom:8px">' +
        '<div class="art-envoi-ac" data-idx="' + k + '"></div>' +
        '<div style="display:flex;flex-wrap:wrap;align-items:flex-end;gap:8px;margin-top:8px">' +
        '<div style="flex:1;min-width:120px"><label class="form-label text-sm">Unité</label>' +
        '<select class="form-select unite-envoi" data-idx="' + k + '" style="min-height:40px">' +
        (showNum ? this._uniteOptions('numerote', l.unite || 'Lot de 500') : this._uniteOptions('standard', l.unite || 'Unité')) +
        '</select></div>' +
        '<div style="width:90px"><label class="form-label text-sm">Qté</label>' +
        '<input type="number" class="form-input qte-envoi" data-idx="' + k + '" value="' + (l.quantite || 1) + '" min="1" placeholder="Qte" style="min-height:40px">' +
        '</div>' +
        '<div class="num-fields" data-idx="' + k + '" style="display:' + (showNum ? 'flex' : 'none') + ';gap:8px;align-items:flex-end">' +
        '<div><label class="form-label text-sm">N° début</label><input type="text" class="form-input num-debut" data-idx="' + k + '" value="' + (l.numero_debut || '') + '" placeholder="N° début" style="min-height:40px;width:100px"></div>' +
        '<span class="text-sm text-muted" style="padding-bottom:12px">—</span>' +
        '<div><label class="form-label text-sm">N° fin</label><input type="text" class="form-input num-fin" data-idx="' + k + '" value="' + (l.numero_fin || '') + '" placeholder="N° fin" style="min-height:40px;width:100px"></div>' +
        '</div>' +
        '<button class="btn btn-sm btn-danger btn-rm-line" data-idx="' + k + '" style="min-width:32px;min-height:40px" title="Retirer">&times;</button>' +
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
        items: [],
        placeholder: 'Rechercher un article...',
        search: function(term, cb) {
          API.getArticles({ search: term }).then(function(data) {
            cb(data.articles.map(function(a) {
              return { id: a.id, label: a.nom, meta: 'Stock: ' + a.stock_actuel + ' ' + UI.uniteLabel(a.unite), type: a.type_article, unite: a.unite };
            }));
          }).catch(function() { cb([]); });
        },
        onSelect: function(item) {
          var l = self._lignes[idx];
          l.article_id = item.id;
          l.article_type = item.type;
          l.article_nom = item.label;
          if (!l.unite) l.unite = item.type === 'numerote' ? 'Lot de 500' : (item.unite || 'Unité');
          // Met à jour le sélecteur d'unité + l'affichage des n° selon le type
          var us = container.querySelector('.unite-envoi[data-idx="' + idx + '"]');
          if (us) us.innerHTML = self._uniteOptions(item.type, l.unite);
          var nf = container.querySelector('.num-fields[data-idx="' + idx + '"]');
          if (nf) nf.style.display = item.type === 'numerote' ? 'flex' : 'none';
        }
      });
      self._acLignes[idx] = ac;
      if (self._lignes[idx] && self._lignes[idx].article_id) {
        ac.setItem({ id: self._lignes[idx].article_id, label: self._lignes[idx].article_nom || '', type: self._lignes[idx].article_type, unite: self._lignes[idx].unite });
        var us = container.querySelector('.unite-envoi[data-idx="' + idx + '"]');
        if (us) us.innerHTML = self._uniteOptions(self._lignes[idx].article_type, self._lignes[idx].unite);
        var nf = container.querySelector('.num-fields[data-idx="' + idx + '"]');
        if (nf) nf.style.display = self._lignes[idx].article_type === 'numerote' ? 'flex' : 'none';
      }
    });
    container.querySelectorAll('.qte-envoi').forEach(function(el) {
      el.addEventListener('input', function() { self._lignes[parseInt(this.dataset.idx)].quantite = parseInt(this.value) || 1; });
    });
    container.querySelectorAll('.unite-envoi').forEach(function(el) {
      el.addEventListener('change', function() { self._lignes[parseInt(this.dataset.idx)].unite = this.value; });
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

    if (!locId) { UI.toast('Choisissez une destination.', 'error'); return; }

    var arts = [];
    for (var i = 0; i < this._lignes.length; i++) {
      var l = this._lignes[i];
      if (!l.article_id) { UI.toast('Tous les articles sont requis.', 'error'); return; }
      arts.push({
        article_id: parseInt(l.article_id),
        quantite: l.quantite || 1,
        unite: (l.unite || '').trim(),
        numero_debut: l.numero_debut || null,
        numero_fin: l.numero_fin || null
      });
    }

    var self = this;
    var dateInput = document.getElementById('envoi-date');
    var dateEnvoi = dateInput ? (dateInput.value || null) : null;

    // Pre-ouvrir la fenetre d'impression pendant le geste utilisateur (anti-bloqueur de popup) :
    // on la redirigera vers la fiche creee une fois la creation terminee.
    var printWin = window.open('', '_blank');
    if (printWin) {
      printWin.document.write('<html><body style="font-family:sans-serif;color:#6B7280;padding:40px;text-align:center">Création de la fiche…</body></html>');
    }

    API.createFiche({ localite_id: locId, articles: arts, date_envoi: dateEnvoi })
      .then(function(data) {
        var f = data.fiche;
        UI.toast('Sortie enregistrée — Fiche ' + f.reference + ' créée (statut : envoyée). PDF généré.', 'success');
        modal.close();
        self._load();

        if (printWin) {
          printWin.location.href = '/imprimer.html?id=' + f.id;
        } else {
          self._imprimerPDF(f.id);
        }
      })
      .catch(function(err) {
        if (printWin) { try { printWin.close(); } catch (e) {} }
        UI.toast(err.message, 'error');
      });
  },

  _viewFiche: function(id) {
    var self = this;
    API.getFiche(id).then(function(data) {
      var f = data.fiche, lignes = data.lignes;

      var html = '<div style="font-size:0.9rem">' +
        '<div class="flex-between mb-md"><div><strong>Ref:</strong> ' + UI.escapeHtml(f.reference) + '</div><div>' + self._statutBadge(f.statut) + '</div></div>' +
        (f.numero_facture ? '<div class="flex-between mb-md"><div><strong>N° facture:</strong> ' + UI.escapeHtml(f.numero_facture) + '</div></div>' : '') +
        '<div class="flex-between mb-md"><div><strong>Destination:</strong> ' + UI.escapeHtml(f.localite_nom) + (f.localite_service ? ' <span class="badge badge-success">Siege</span>' : '') + '</div><div><strong>Date:</strong> ' + UI.formatDate(f.date_envoi || f.date_creation) + '</div></div>';

      if (f.notes) html += '<p class="mb-md"><strong>Notes:</strong> ' + UI.escapeHtml(f.notes) + '</p>';

      if (lignes.length) {
        html += '<div class="table-wrapper"><table><thead><tr><th>Article</th><th>Unité</th><th>Qté</th><th>N° début</th><th>N° fin</th></tr></thead><tbody>';
        for (var i = 0; i < lignes.length; i++) {
          var un = (lignes[i].unite || '').trim();
          var unLabel = (un && un !== 'unite' && un !== 'piece') ? un : '-';
          html += '<tr><td>' + UI.escapeHtml(lignes[i].article_nom || '-') + '</td><td>' + UI.escapeHtml(unLabel) + '</td><td>' + lignes[i].quantite + '</td><td>' + UI.escapeHtml(lignes[i].numero_debut || '-') + '</td><td>' + UI.escapeHtml(lignes[i].numero_fin || '-') + '</td></tr>';
        }
        html += '</tbody></table></div>';
      }

      if (f.fichier_path && f.fichier_path.endsWith('.pdf')) {
        html += '<div class="mt-md"><a href="' + UI.escapeHtml(f.fichier_path) + '" target="_blank" class="btn btn-accent btn-sm">Télécharger le PDF (ré-imprimable)</a></div>';
      }
      if (f.scan_path) {
        html += '<div class="mt-md"><strong>Photo du retour:</strong><br><img src="' + UI.escapeHtml(f.scan_path) + '" style="max-width:100%;max-height:250px;border:1px solid var(--color-border);border-radius:8px;margin-top:0.5rem"></div>';
      }

      html += '</div>';

      var actions = [{ label: 'Fermer', cls: 'btn-secondary', callback: function(m) { m.close(); } }];
      if (f.statut === 'envoyee') {
        actions.unshift({ label: 'Scanner (retour)', cls: 'btn-success', callback: function(m) { m.close(); self._uploadScan(id); } });
      }
      if (f.statut === 'retournee') {
        actions.unshift({ label: 'Archiver', cls: 'btn-primary', callback: function(m) { m.close(); self._archiveFiche(id); } });
      }
      if (f.fichier_path) {
        actions.unshift({ label: 'Télécharger PDF', cls: 'btn-accent', callback: function(m) { self._downloadPDF(id); } });
      }
      actions.unshift({ label: 'Imprimer', cls: 'btn-secondary', callback: function(m) { m.close(); self._imprimerPDF(id); } });

      UI.modal('Fiche ' + UI.escapeHtml(f.reference), html, actions);
    }).catch(function(err) { UI.toast(err.message, 'error'); });
  },

  _downloadPDF: function(id) {
    var token = API.getToken();
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
      .catch(function() { UI.toast('Erreur lors du téléchargement du PDF.', 'error'); });
  },

  // Ouvre la vue d'impression A4 (imprimer.html) : la boite d'impression s'ouvre
  // automatiquement. N'archive PAS (le statut suit le pipeline gestionnaire).
  _imprimerPDF: function(id) {
    var self = this;
    var w = window.open('/imprimer.html?id=' + id, '_blank');
    if (!w) { UI.toast('Autorisez les popups pour imprimer la fiche.', 'error'); }
    API.imprimerFiche(id)
      .then(function() { UI.toast('Fiche prête pour impression.', 'success'); })
      .catch(function(err) { UI.toast(err.message, 'error'); });
  },

  // Retour : photo OBLIGATOIRE (remplace la signature) -> statut « retournee »
  _uploadScan: function(id) {
    var self = this;
    UI.capturePhoto(function(file) {
      if (!file) return;
      if (file.size > 10 * 1024 * 1024) { UI.toast('Fichier trop volumineux (max 10 Mo).', 'error'); return; }

      UI.toast('Upload de la photo...', 'info');
      API.uploadScanFiche(id, file).then(function(data) {
        if (data.error) { UI.toast(data.error, 'error'); return; }
        UI.toast('Retour enregistré (photo) — fiche passée en « retournée ».', 'success');
        self._load();
      }).catch(function(err) { UI.toast(err.message, 'error'); });
    });
  },

  _archiveFiche: function(id) {
    var self = this;
    UI.confirm('Archiver cette fiche ? (le retour avec photo a été fait)').then(function(ok) {
      if (!ok) return;
      API.changeStatutFiche(id, 'archivee').then(function() { UI.toast('Fiche archivée.', 'success'); self._load(); })
        .catch(function(err) { UI.toast(err.message, 'error'); });
    });
  }
};
