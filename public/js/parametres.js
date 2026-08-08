// public/js/parametres.js — Parametres, Categories, Localites, Utilisateurs, Import
var Parametres = {
  _user: null,

  render: function(container) {
    this._user = JSON.parse(localStorage.getItem('nizar_user') || '{}');
    var isAdmin = this._user.role === 'admin';

    container.innerHTML =
      // Categories (admin only)
      (isAdmin ? '<div class="card"><div class="card-header"><h3 class="card-title">Categories</h3></div>' +
      '<div class="flex-between mb-md gap-sm"><input type="text" class="form-input" id="new-cat-name" placeholder="Nouvelle categorie..." style="max-width:300px"><button class="btn btn-primary btn-sm" id="btn-add-cat">Ajouter</button></div>' +
      '<div id="categories-list">' + UI.renderSkeleton(3) + '</div></div>' : '') +

      // Localites (admin only)
      (isAdmin ? '<div class="card"><div class="card-header"><h3 class="card-title">Localités / Agences / Services</h3>' +
      '<button class="btn btn-primary btn-sm" id="btn-add-loc">Ajouter une localite</button></div>' +
      '<div id="localites-list">' + UI.renderSkeleton(5) + '</div></div>' : '') +

      // Utilisateurs (admin only)
      (isAdmin ? '<div class="card"><div class="card-header"><h3 class="card-title">Utilisateurs</h3>' +
      '<button class="btn btn-primary btn-sm" id="btn-add-user">Ajouter un utilisateur</button></div>' +
      '<div id="users-list">' + UI.renderSkeleton(3) + '</div></div>' : '') +

      // Import Excel (admin only)
      (isAdmin ? '<div class="card"><div class="card-header"><h3 class="card-title">Importer des données</h3></div>' +
      '<p class="text-sm text-muted mb-sm">Importer un fichier Excel (.xlsx) contenant l\'historique des mouvements.</p>' +
      '<div class="flex-between gap-sm"><input type="file" class="form-input" id="import-file" accept=".xlsx" style="max-width:350px">' +
      '<button class="btn btn-accent btn-sm" id="btn-import" style="background:var(--color-accent);color:#fff">Importer Excel</button></div>' +
      '<div id="import-result" class="mt-sm"></div></div>' : '') +

      // Anomalies d'import (admin only)
      (isAdmin ? '<div class="card"><div class="card-header"><h3 class="card-title">Anomalies d\'import</h3></div>' +
      '<p class="text-sm text-muted mb-sm">Mouvements de billets/carnets importes sans numero de souche valide — a corriger manuellement.</p>' +
      '<div id="anomalies-list">' + UI.renderSkeleton(3) + '</div></div>' : '') +

      // Sauvegarde de la base (admin only)
      (isAdmin ? '<div class="card"><div class="card-header"><h3 class="card-title">Sauvegarde de la base</h3></div>' +
      '<p class="text-sm text-muted mb-sm">Telecharger un instantane complet de la base (donnees + archives). Conservez ces fichiers dans un endroit sur.</p>' +
      '<button class="btn btn-accent btn-sm" id="btn-backup" style="background:var(--color-accent);color:#fff">Sauvegarder (.db)</button></div>' : '') +

      // Journal d'audit (admin only)
      (isAdmin ? '<div class="card"><div class="card-header"><h3 class="card-title">Journal d\'audit</h3></div>' +
      '<div id="audit-log">' + UI.renderSkeleton(4) + '</div></div>' : '') +

      // Preferences
      '<div class="card"><div class="card-header"><h3 class="card-title">Préférences</h3></div>' +
      '<div class="form-group"><label class="form-label">Mot de passe actuel</label>' +
      '<input type="password" class="form-input" id="current-password" placeholder="Votre mot de passe actuel" style="max-width:350px"></div>' +
      '<div class="form-group"><label class="form-label">Nouveau mot de passe</label>' +
      '<input type="password" class="form-input" id="new-password" placeholder="Min. 4 caracteres" style="max-width:350px"></div>' +
      '<button class="btn btn-primary" id="btn-change-password">Changer le mot de passe</button>' +
      '</div>';

    if (isAdmin) {
      this._loadCategories();
      this._loadLocalites();
      this._loadUsers();
      this._loadAuditLog();
      this._loadAnomalies();
    }
    this._bindEvents();
  },

  _bindEvents: function() {
    var self = this;
    var isAdmin = this._user.role === 'admin';

    if (isAdmin) {
      document.getElementById('btn-add-cat').addEventListener('click', function() { self._addCategory(); });
      document.getElementById('btn-add-loc').addEventListener('click', function() { self._showLocaliteForm(); });
      document.getElementById('btn-add-user').addEventListener('click', function() { self._showUserForm(); });
      document.getElementById('btn-import').addEventListener('click', function() { self._importExcel(); });
      document.getElementById('btn-backup').addEventListener('click', function() { self._backupDB(); });
    }
    document.getElementById('btn-change-password').addEventListener('click', function() { self._changePassword(); });
  },

  // === Categories ===
  _loadCategories: function() {
    var self = this;
    API.getCategories()
      .then(function(data) {
        var el = document.getElementById('categories-list');
        if (!data.categories.length) { el.innerHTML = '<p class="text-muted text-center">Aucune categorie.</p>'; return; }
        var html = '<div class="table-wrapper"><table><thead><tr><th>Nom</th><th>Description</th><th>Actions</th></tr></thead><tbody>';
        for (var i = 0; i < data.categories.length; i++) {
          var c = data.categories[i];
          html += '<tr><td><strong>' + UI.escapeHtml(c.name) + '</strong></td><td>' + UI.escapeHtml(c.description || '-') + '</td>' +
            '<td><button class="btn btn-sm btn-danger btn-del-cat" data-id="' + c.id + '">Supprimer</button></td></tr>';
        }
        html += '</tbody></table></div>';
        el.innerHTML = html;
        el.querySelectorAll('.btn-del-cat').forEach(function(btn) {
          btn.addEventListener('click', function() { self._deleteCategory(parseInt(this.getAttribute('data-id'))); });
        });
      }).catch(function() {});
  },

  // === Anomalies d'import ===
  _loadAnomalies: function() {
    var self = this;
    API.getAnomalies()
      .then(function(data) { self._renderAnomalies(data.anomalies); })
      .catch(function(err) {
        var el = document.getElementById('anomalies-list');
        if (el) el.innerHTML = '<p class="text-muted text-center">' + UI.escapeHtml(err.message) + '</p>';
      });
  },

  _renderAnomalies: function(anomalies) {
    var el = document.getElementById('anomalies-list');
    if (!el) return;
    if (!anomalies.length) { el.innerHTML = '<p class="text-muted text-center">Aucune anomalie.</p>'; return; }

    var self = this;
    var html = '<div class="table-wrapper"><table><thead><tr>' +
      '<th>Date</th><th>Article</th><th>Type</th><th>Qte</th><th>Localite</th><th>Correction</th>' +
      '</tr></thead><tbody>';
    for (var i = 0; i < anomalies.length; i++) {
      var a = anomalies[i];
      html += '<tr>' +
        '<td>' + UI.formatDate(a.date) + '</td>' +
        '<td>' + UI.escapeHtml(a.article_nom || '-') + '</td>' +
        '<td>' + (a.type === 'entree' ? 'Entree' : 'Sortie') + '</td>' +
        '<td>' + a.quantite + '</td>' +
        '<td>' + UI.escapeHtml(a.localite_nom || '-') + '</td>' +
        '<td style="display:flex;gap:6px;align-items:center">' +
        '<input type="text" class="form-input anomalie-debut" data-id="' + a.id + '" placeholder="N° debut" style="width:100px;min-height:36px">' +
        '<input type="text" class="form-input anomalie-fin" data-id="' + a.id + '" placeholder="N° fin" style="width:100px;min-height:36px">' +
        '<button class="btn btn-sm btn-primary btn-corriger-anomalie" data-id="' + a.id + '">Corriger</button>' +
        '</td></tr>';
    }
    html += '</tbody></table></div>';
    el.innerHTML = html;

    el.querySelectorAll('.btn-corriger-anomalie').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var id = this.dataset.id;
        var debut = el.querySelector('.anomalie-debut[data-id="' + id + '"]').value.trim();
        var fin = el.querySelector('.anomalie-fin[data-id="' + id + '"]').value.trim();
        if (!debut || !fin) { UI.toast('N° debut et N° fin requis.', 'error'); return; }
        API.corrigerNumeroMouvement(id, debut, fin)
          .then(function() { UI.toast('Anomalie corrigee.', 'success'); self._loadAnomalies(); })
          .catch(function(err) { UI.toast(err.message, 'error'); });
      });
    });
  },

  _addCategory: function() {
    var self = this;
    var name = document.getElementById('new-cat-name').value.trim();
    if (!name) { UI.toast('Nom requis.', 'error'); return; }
    API.createCategory({ name: name })
      .then(function() { UI.toast('Categorie ajoutee.', 'success'); document.getElementById('new-cat-name').value = ''; self._loadCategories(); })
      .catch(function(err) { UI.toast(err.message, 'error'); });
  },

  _deleteCategory: function(id) {
    var self = this;
    UI.confirm('Supprimer cette categorie ?')
      .then(function(ok) { if (!ok) return;
        API.deleteCategory(id).then(function() { UI.toast('Supprimee.', 'success'); self._loadCategories(); }).catch(function(err) { UI.toast(err.message, 'error'); }); });
  },

  // === Localites ===
  _loadLocalites: function() {
    var self = this;
    API.getLocalites()
      .then(function(data) {
        var el = document.getElementById('localites-list');
        if (!data.localites.length) { el.innerHTML = '<p class="text-muted text-center">Aucune localite.</p>'; return; }
        var html = '<div class="table-wrapper"><table><thead><tr><th>Nom</th><th>Type</th><th>Pays</th><th>Actions</th></tr></thead><tbody>';
        for (var i = 0; i < data.localites.length; i++) {
          var l = data.localites[i];
          html += '<tr><td><strong>' + UI.escapeHtml(l.nom) + '</strong></td>' +
            '<td><span class="badge ' + (l.est_service ? 'badge-success' : (l.type === 'international' ? 'badge-info' : 'badge-neutral')) + '">' + (l.est_service ? 'Service (Siege)' : l.type) + '</span></td>' +
            '<td>' + (l.est_service ? '—' : UI.escapeHtml(l.pays)) + '</td>' +
            '<td><button class="btn btn-sm btn-danger btn-del-loc" data-id="' + l.id + '">Supprimer</button></td></tr>';
        }
        html += '</tbody></table></div>';
        el.innerHTML = html;
        el.querySelectorAll('.btn-del-loc').forEach(function(btn) {
          btn.addEventListener('click', function() { self._deleteLocalite(parseInt(this.getAttribute('data-id'))); });
        });
      }).catch(function() {});
  },

  _showLocaliteForm: function() {
    var self = this;
    var html = '<div class="form-group"><label class="form-label">Nom *</label><input type="text" class="form-input" id="loc-nom" required></div>' +
      '<div class="form-row"><div class="form-group"><label class="form-label">Type</label><select class="form-select" id="loc-type"><option value="national">National</option><option value="international">International</option><option value="service">Service (Siege)</option></select></div>' +
      '<div class="form-group"><label class="form-label">Pays</label><input type="text" class="form-input" id="loc-pays" value="Niger"></div></div>';

    UI.modal('Ajouter une destination', html, [
      { label: 'Annuler', cls: 'btn-secondary', callback: function(m) { m.close(); } },
      { label: 'Ajouter', cls: 'btn-primary', callback: function(m) {
        var nom = document.getElementById('loc-nom').value.trim();
        if (!nom) { UI.toast('Nom requis.', 'error'); return; }
        var locType = document.getElementById('loc-type').value;
        var isService = locType === 'service';
        API.createLocalite({ nom: nom, type: isService ? 'national' : locType, pays: isService ? 'Niger' : document.getElementById('loc-pays').value.trim(), est_service: isService })
          .then(function() { UI.toast(isService ? 'Service ajoute.' : 'Localite ajoutee.', 'success'); m.close(); self._loadLocalites(); })
          .catch(function(err) { UI.toast(err.message, 'error'); });
      } }
    ]);
  },

  _deleteLocalite: function(id) {
    var self = this;
    UI.confirm('Supprimer cette localite ?').then(function(ok) { if (!ok) return;
      API.deleteLocalite(id).then(function() { UI.toast('Supprimee.', 'success'); self._loadLocalites(); }).catch(function(err) { UI.toast(err.message, 'error'); }); });
  },

  // === Utilisateurs ===
  _loadUsers: function() {
    var self = this;
    API.getUsers()
      .then(function(data) {
        var el = document.getElementById('users-list');
        if (!data.users.length) { el.innerHTML = '<p class="text-muted text-center">Aucun utilisateur.</p>'; return; }
        var html = '<div class="table-wrapper"><table><thead><tr><th>Nom</th><th>Role</th><th>Cree le</th><th>Actions</th></tr></thead><tbody>';
        for (var i = 0; i < data.users.length; i++) {
          var u = data.users[i];
          html += '<tr><td><strong>' + UI.escapeHtml(u.username) + '</strong></td>' +
            '<td><span class="badge ' + (u.role === 'admin' ? 'badge-info' : 'badge-neutral') + '">' + u.role + '</span></td>' +
            '<td>' + UI.formatDate(u.created_at) + '</td>' +
            '<td class="actions"><button class="btn btn-sm btn-secondary btn-edit-user" data-id="' + u.id + '">Modifier</button>' +
            (u.id !== self._user.id ? '<button class="btn btn-sm btn-danger btn-del-user" data-id="' + u.id + '">Supprimer</button>' : '') + '</td></tr>';
        }
        html += '</tbody></table></div>';
        el.innerHTML = html;
        el.querySelectorAll('.btn-edit-user').forEach(function(b) {
          b.addEventListener('click', function() { self._showUserForm(parseInt(this.getAttribute('data-id'))); });
        });
        el.querySelectorAll('.btn-del-user').forEach(function(b) {
          b.addEventListener('click', function() { self._deleteUser(parseInt(this.getAttribute('data-id'))); });
        });
      }).catch(function() {});
  },

  _showUserForm: function(id) {
    var self = this;
    var isEdit = !!id;
    var html = '<div class="form-group"><label class="form-label">Nom *</label><input type="text" class="form-input" id="user-username" required></div>' +
      '<div class="form-group"><label class="form-label">Mot de passe' + (isEdit ? ' (optionnel)' : ' *') + '</label><input type="password" class="form-input" id="user-password" ' + (isEdit ? '' : 'required') + '></div>' +
      '<div class="form-group"><label class="form-label">Role</label><select class="form-select" id="user-role"><option value="admin">Administrateur</option><option value="assistant" selected>Assistant</option></select></div>';

    UI.modal(isEdit ? 'Modifier' : 'Ajouter un utilisateur', html, [
      { label: 'Annuler', cls: 'btn-secondary', callback: function(m) { m.close(); } },
      { label: 'Enregistrer', cls: 'btn-primary', callback: function(m) {
        var username = document.getElementById('user-username').value.trim();
        var password = document.getElementById('user-password').value;
        var role = document.getElementById('user-role').value;
        if (!username) { UI.toast('Nom requis.', 'error'); return; }
        if (!isEdit && !password) { UI.toast('Mot de passe requis.', 'error'); return; }
        var data = { username: username, role: role };
        if (password) data.password = password;
        var promise = isEdit ? API.updateUser(id, data) : API.createUser(data);
        promise.then(function() { UI.toast(isEdit ? 'Modifie.' : 'Cree.', 'success'); m.close(); self._loadUsers(); }).catch(function(err) { UI.toast(err.message, 'error'); });
      } }
    ]);
  },

  _deleteUser: function(id) {
    var self = this;
    UI.confirm('Supprimer cet utilisateur ?').then(function(ok) { if (!ok) return;
      API.deleteUser(id).then(function() { UI.toast('Supprime.', 'success'); self._loadUsers(); }).catch(function(err) { UI.toast(err.message, 'error'); }); });
  },

  // === Import ===
  _importExcel: function() {
    var self = this;
    var input = document.getElementById('import-file');
    var file = input.files[0];
    if (!file) { UI.toast('Selectionnez un fichier Excel.', 'error'); return; }

    document.getElementById('btn-import').disabled = true;
    document.getElementById('btn-import').textContent = 'Import en cours...';
    document.getElementById('import-result').innerHTML = '';

    API.importExcel(file)
      .then(function(data) {
        document.getElementById('import-result').innerHTML =
          '<div class="badge badge-success" style="padding:0.5rem 1rem">' + data.message + '</div>';
        if (data.imported.erreurs.length) {
          document.getElementById('import-result').innerHTML +=
            '<p class="text-sm text-danger mt-sm">' + data.imported.erreurs.length + ' erreurs.</p>';
        }
        UI.toast(data.message, 'success');
      })
      .catch(function(err) {
        UI.toast(err.message, 'error');
        document.getElementById('import-result').innerHTML = '<p class="text-danger">' + UI.escapeHtml(err.message) + '</p>';
      })
      .finally(function() {
        document.getElementById('btn-import').disabled = false;
        document.getElementById('btn-import').textContent = 'Importer Excel';
        input.value = '';
      });
  },

  // === Sauvegarde de la base ===
  _backupDB: function() {
    var btn = document.getElementById('btn-backup');
    btn.disabled = true;
    var original = btn.textContent;
    btn.textContent = 'Sauvegarde en cours...';
    API.downloadBackup()
      .then(function() { UI.toast('Sauvegarde telechargee.', 'success'); })
      .catch(function(err) { UI.toast('Erreur sauvegarde: ' + err.message, 'error'); })
      .finally(function() { btn.disabled = false; btn.textContent = original; });
  },

  // === Journal d'audit ===
  _loadAuditLog: function() {
    API.getAuditLog().then(function(data) {
      var el = document.getElementById('audit-log');
      if (!el) return;
      if (!data.logs.length) { el.innerHTML = '<p class="text-muted text-center">Aucune operation sensible enregistree.</p>'; return; }
      var html = '<div class="table-wrapper"><table><thead><tr><th>Date</th><th>Utilisateur</th><th>Action</th><th>Details</th></tr></thead><tbody>';
      for (var i = 0; i < data.logs.length; i++) {
        var lg = data.logs[i];
        html += '<tr><td>' + UI.formatDate(lg.date) + '</td><td>' + UI.escapeHtml(lg.username || '-') + '</td><td>' + UI.escapeHtml(lg.action) + '</td><td>' + UI.escapeHtml(lg.details || '') + '</td></tr>';
      }
      html += '</tbody></table></div>';
      el.innerHTML = html;
    }).catch(function() {});
  },

  // === Preferences ===
  _changePassword: function() {
    var currentPassword = document.getElementById('current-password').value;
    var newPassword = document.getElementById('new-password').value;
    if (!currentPassword) { UI.toast('Entrez votre mot de passe actuel.', 'error'); return; }
    if (!newPassword) { UI.toast('Entrez un nouveau mot de passe.', 'error'); return; }
    if (newPassword.length < 4) { UI.toast('4 caracteres minimum.', 'error'); return; }
    var self = this;
    API.changePassword(currentPassword, newPassword)
      .then(function() {
        UI.toast('Mot de passe modifie avec succes.', 'success');
        document.getElementById('current-password').value = '';
        document.getElementById('new-password').value = '';
      })
      .catch(function(err) { UI.toast(err.message, 'error'); });
  }
};
