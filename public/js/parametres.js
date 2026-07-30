// public/js/parametres.js
var Parametres = {
  _user: null,

  render: function(container) {
    this._user = JSON.parse(localStorage.getItem('nizar_user') || '{}');
    var isAdmin = this._user.role === 'admin';

    container.innerHTML =
      // Categories
      (isAdmin ? '<div class="card"><div class="card-header"><h3 class="card-title">Categories</h3></div>' +
      '<div class="flex-between mb-md"><input type="text" class="form-input" id="new-cat-name" placeholder="Nouvelle categorie..." style="max-width:300px"><button class="btn btn-primary btn-sm" id="btn-add-cat">Ajouter</button></div>' +
      '<div id="categories-list">' + UI.renderSkeleton(3) + '</div></div>' : '') +

      // Utilisateurs
      (isAdmin ? '<div class="card"><div class="card-header"><h3 class="card-title">Utilisateurs</h3>' +
      '<button class="btn btn-primary btn-sm" id="btn-add-user">Ajouter un utilisateur</button></div>' +
      '<div id="users-list">' + UI.renderSkeleton(3) + '</div></div>' : '') +

      // Preferences
      '<div class="card"><div class="card-header"><h3 class="card-title">Preferences</h3></div>' +
      '<div class="form-group"><label class="form-label">Nouveau mot de passe</label>' +
      '<input type="password" class="form-input" id="new-password" placeholder="Laisser vide pour ne pas changer" style="max-width:350px"></div>' +
      '<button class="btn btn-primary" id="btn-change-password">Changer le mot de passe</button>' +
      '</div>';

    this._loadCategories();
    if (isAdmin) this._loadUsers();
    this._bindEvents();
  },

  _bindEvents: function() {
    var self = this;
    if (this._user.role === 'admin') {
      document.getElementById('btn-add-cat').addEventListener('click', function() { self._addCategory(); });
      document.getElementById('btn-add-user').addEventListener('click', function() { self._showUserForm(); });
    }
    document.getElementById('btn-change-password').addEventListener('click', function() { self._changePassword(); });
  },

  _loadCategories: function() {
    var self = this;
    API.getCategories()
      .then(function(data) {
        var el = document.getElementById('categories-list');
        if (!el) return;
        if (!data.categories.length) {
          el.innerHTML = '<p class="text-muted text-center">Aucune categorie.</p>';
          return;
        }
        var html = '<div class="table-wrapper"><table><thead><tr><th>Nom</th><th>Description</th><th>Actions</th></tr></thead><tbody>';
        for (var i = 0; i < data.categories.length; i++) {
          var c = data.categories[i];
          html += '<tr><td><strong>' + UI.escapeHtml(c.name) + '</strong></td><td>' + UI.escapeHtml(c.description || '-') + '</td>' +
            '<td><button class="btn btn-sm btn-danger btn-del-cat" data-id="' + c.id + '">Supprimer</button></td></tr>';
        }
        html += '</tbody></table></div>';
        el.innerHTML = html;

        var btns = el.querySelectorAll('.btn-del-cat');
        for (var j = 0; j < btns.length; j++) {
          btns[j].addEventListener('click', function() {
            var id = parseInt(this.getAttribute('data-id'));
            self._deleteCategory(id);
          });
        }
      })
      .catch(function(err) { /* silent */ });
  },

  _addCategory: function() {
    var self = this;
    var name = document.getElementById('new-cat-name').value.trim();
    if (!name) { UI.toast('Nom de categorie requis.', 'error'); return; }
    API.createCategory({ name: name })
      .then(function() { UI.toast('Categorie ajoutee.', 'success'); document.getElementById('new-cat-name').value = ''; self._loadCategories(); })
      .catch(function(err) { UI.toast(err.message, 'error'); });
  },

  _deleteCategory: function(id) {
    var self = this;
    UI.confirm('Supprimer cette categorie ? Les articles associes resteront (sans categorie).')
      .then(function(ok) {
        if (!ok) return;
        API.deleteCategory(id)
          .then(function() { UI.toast('Categorie supprimee.', 'success'); self._loadCategories(); })
          .catch(function(err) { UI.toast(err.message, 'error'); });
      });
  },

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

        ['btn-edit-user', 'btn-del-user'].forEach(function(cls) {
          var btns = el.querySelectorAll('.' + cls);
          for (var j = 0; j < btns.length; j++) {
            btns[j].addEventListener('click', function() {
              var id = parseInt(this.getAttribute('data-id'));
              if (this.classList.contains('btn-edit-user')) self._showUserForm(id);
              else if (this.classList.contains('btn-del-user')) self._deleteUser(id);
            });
          }
        });
      })
      .catch(function(err) { /* silent */ });
  },

  _showUserForm: function(id) {
    var self = this;
    var isEdit = !!id;

    var formHtml =
      '<div class="form-group"><label class="form-label">Nom d\'utilisateur *</label><input type="text" class="form-input" id="user-username" required></div>' +
      '<div class="form-group"><label class="form-label">Mot de passe' + (isEdit ? ' (optionnel)' : ' *') + '</label><input type="password" class="form-input" id="user-password" ' + (isEdit ? '' : 'required') + '></div>' +
      '<div class="form-group"><label class="form-label">Role</label><select class="form-select" id="user-role"><option value="admin">Administrateur</option><option value="assistant" selected>Assistant</option></select></div>';

    var modal = UI.modal(isEdit ? 'Modifier l\'utilisateur' : 'Ajouter un utilisateur', formHtml, [
      { label: 'Annuler', cls: 'btn-secondary', callback: function(m) { m.close(); } },
      { label: 'Enregistrer', cls: 'btn-primary', callback: function(m) { self._saveUser(m, isEdit, id); } }
    ]);
  },

  _saveUser: function(modal, isEdit, id) {
    var username = document.getElementById('user-username').value.trim();
    var password = document.getElementById('user-password').value;
    var role = document.getElementById('user-role').value;

    if (!username) { UI.toast('Nom d\'utilisateur requis.', 'error'); return; }
    if (!isEdit && !password) { UI.toast('Mot de passe requis.', 'error'); return; }

    var data = { username: username, role: role };
    if (password) data.password = password;

    var self = this;
    var promise = isEdit ? API.updateUser(id, data) : API.createUser(data);

    promise
      .then(function() {
        UI.toast(isEdit ? 'Utilisateur modifie.' : 'Utilisateur cree.', 'success');
        modal.close();
        self._loadUsers();
      })
      .catch(function(err) { UI.toast(err.message, 'error'); });
  },

  _deleteUser: function(id) {
    var self = this;
    UI.confirm('Supprimer cet utilisateur ?')
      .then(function(ok) {
        if (!ok) return;
        API.deleteUser(id)
          .then(function() { UI.toast('Utilisateur supprime.', 'success'); self._loadUsers(); })
          .catch(function(err) { UI.toast(err.message, 'error'); });
      });
  },

  _changePassword: function() {
    var password = document.getElementById('new-password').value;
    if (!password) { UI.toast('Entrez un nouveau mot de passe.', 'error'); return; }
    if (password.length < 4) { UI.toast('Le mot de passe doit faire au moins 4 caracteres.', 'error'); return; }

    var self = this;
    API.updateUser(this._user.id, { password: password })
      .then(function() { UI.toast('Mot de passe modifie.', 'success'); document.getElementById('new-password').value = ''; })
      .catch(function(err) { UI.toast(err.message, 'error'); });
  }
};
