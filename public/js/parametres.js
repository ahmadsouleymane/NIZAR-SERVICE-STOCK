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
      (isAdmin ? '<div class="card"><div class="card-header"><h3 class="card-title">Localites / Destinations</h3>' +
      '<button class="btn btn-primary btn-sm" id="btn-add-loc">Ajouter une localite</button></div>' +
      '<div id="localites-list">' + UI.renderSkeleton(5) + '</div></div>' : '') +

      // Utilisateurs (admin only)
      (isAdmin ? '<div class="card"><div class="card-header"><h3 class="card-title">Utilisateurs</h3>' +
      '<button class="btn btn-primary btn-sm" id="btn-add-user">Ajouter un utilisateur</button></div>' +
      '<div id="users-list">' + UI.renderSkeleton(3) + '</div></div>' : '') +

      // Import Excel (admin only)
      (isAdmin ? '<div class="card"><div class="card-header"><h3 class="card-title">Importer des donnees</h3></div>' +
      '<p class="text-sm text-muted mb-sm">Importer un fichier Excel (.xlsx) contenant l\'historique des mouvements.</p>' +
      '<div class="flex-between gap-sm"><input type="file" class="form-input" id="import-file" accept=".xlsx" style="max-width:350px">' +
      '<button class="btn btn-accent btn-sm" id="btn-import" style="background:var(--color-accent);color:#fff">Importer Excel</button></div>' +
      '<div id="import-result" class="mt-sm"></div></div>' : '') +

      // Preferences
      '<div class="card"><div class="card-header"><h3 class="card-title">Preferences</h3></div>' +
      '<div class="form-group"><label class="form-label">Nouveau mot de passe</label>' +
      '<input type="password" class="form-input" id="new-password" placeholder="Laisser vide pour ne pas changer" style="max-width:350px"></div>' +
      '<button class="btn btn-primary" id="btn-change-password">Changer le mot de passe</button>' +
      '</div>';

    if (isAdmin) {
      this._loadCategories();
      this._loadLocalites();
      this._loadUsers();
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
            '<td><span class="badge ' + (l.type === 'international' ? 'badge-info' : 'badge-neutral') + '">' + l.type + '</span></td>' +
            '<td>' + UI.escapeHtml(l.pays) + '</td>' +
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
      '<div class="form-row"><div class="form-group"><label class="form-label">Type</label><select class="form-select" id="loc-type"><option value="national">National</option><option value="international">International</option></select></div>' +
      '<div class="form-group"><label class="form-label">Pays</label><input type="text" class="form-input" id="loc-pays" value="Niger"></div></div>';

    UI.modal('Ajouter une localite', html, [
      { label: 'Annuler', cls: 'btn-secondary', callback: function(m) { m.close(); } },
      { label: 'Ajouter', cls: 'btn-primary', callback: function(m) {
        var nom = document.getElementById('loc-nom').value.trim();
        if (!nom) { UI.toast('Nom requis.', 'error'); return; }
        API.createLocalite({ nom: nom, type: document.getElementById('loc-type').value, pays: document.getElementById('loc-pays').value.trim() })
          .then(function() { UI.toast('Localite ajoutee.', 'success'); m.close(); self._loadLocalites(); })
          .catch(function(err) { UI.toast(err.message, 'error'); });
      }}]
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
      }}]
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

  // === Preferences ===
  _changePassword: function() {
    var password = document.getElementById('new-password').value;
    if (!password) { UI.toast('Entrez un nouveau mot de passe.', 'error'); return; }
    if (password.length < 4) { UI.toast('4 caracteres minimum.', 'error'); return; }
    var self = this;
    API.updateUser(this._user.id, { password: password })
      .then(function() { UI.toast('Mot de passe modifie.', 'success'); document.getElementById('new-password').value = ''; })
      .catch(function(err) { UI.toast(err.message, 'error'); });
  }
};
