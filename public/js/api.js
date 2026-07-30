// public/js/api.js
// Client HTTP pour l'API Nizar Stock

const API = {
  _token: null,

  _headers() {
    const h = { 'Content-Type': 'application/json' };
    const token = this.getToken();
    if (token) h['Authorization'] = 'Bearer ' + token;
    return h;
  },

  getToken() {
    if (!this._token) this._token = localStorage.getItem('nizar_token');
    return this._token;
  },

  setToken(token) {
    this._token = token;
    localStorage.setItem('nizar_token', token);
  },

  clearToken() {
    this._token = null;
    localStorage.removeItem('nizar_token');
    localStorage.removeItem('nizar_user');
  },

  async fetch(url, options = {}) {
    try {
      const res = await fetch(url, {
        headers: this._headers(),
        ...options
      });

      if (res.status === 401) {
        this.clearToken();
        window.location.hash = '#login';
        throw new Error('Session expirée. Veuillez vous reconnecter.');
      }

      // Pour les exports Excel (blob)
      const ct = res.headers.get('content-type') || '';
      if (ct.includes('spreadsheet') || ct.includes('officedocument')) {
        return res.blob();
      }

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Erreur ' + res.status);
      }

      return data;
    } catch (err) {
      if (err.message === 'Failed to fetch') {
        throw new Error('Impossible de contacter le serveur.');
      }
      throw err;
    }
  },

  // Auth
  async login(username, password) {
    const data = await this.fetch('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password })
    });
    this.setToken(data.token);
    localStorage.setItem('nizar_user', JSON.stringify(data.user));
    return data;
  },

  async getMe() {
    return this.fetch('/api/auth/me');
  },

  logout() {
    this.clearToken();
  },

  // Dashboard
  async getDashboard() {
    return this.fetch('/api/dashboard');
  },

  // Articles
  async getArticles(params = {}) {
    const qs = new URLSearchParams(params).toString();
    return this.fetch('/api/articles' + (qs ? '?' + qs : ''));
  },

  async getArticle(id) {
    return this.fetch('/api/articles/' + id);
  },

  async createArticle(data) {
    return this.fetch('/api/articles', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  },

  async updateArticle(id, data) {
    return this.fetch('/api/articles/' + id, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  },

  async deleteArticle(id) {
    return this.fetch('/api/articles/' + id, {
      method: 'DELETE'
    });
  },

  // Categories
  async getCategories() {
    return this.fetch('/api/categories');
  },

  async createCategory(data) {
    return this.fetch('/api/categories', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  },

  async deleteCategory(id) {
    return this.fetch('/api/categories/' + id, {
      method: 'DELETE'
    });
  },

  // Mouvements
  async getMouvements(params = {}) {
    const qs = new URLSearchParams(params).toString();
    return this.fetch('/api/mouvements' + (qs ? '?' + qs : ''));
  },

  async createMouvement(data) {
    return this.fetch('/api/mouvements', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  },

  // Fournisseurs
  async getFournisseurs() {
    return this.fetch('/api/fournisseurs');
  },

  async getFournisseur(id) {
    return this.fetch('/api/fournisseurs/' + id);
  },

  async createFournisseur(data) {
    return this.fetch('/api/fournisseurs', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  },

  async updateFournisseur(id, data) {
    return this.fetch('/api/fournisseurs/' + id, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  },

  async deleteFournisseur(id) {
    return this.fetch('/api/fournisseurs/' + id, {
      method: 'DELETE'
    });
  },

  // Commandes
  async getCommandes(params = {}) {
    const qs = new URLSearchParams(params).toString();
    return this.fetch('/api/commandes' + (qs ? '?' + qs : ''));
  },

  async getCommande(id) {
    return this.fetch('/api/commandes/' + id);
  },

  async createCommande(data) {
    return this.fetch('/api/commandes', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  },

  async updateCommande(id, data) {
    return this.fetch('/api/commandes/' + id, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  },

  async changeStatutCommande(id, statut) {
    return this.fetch('/api/commandes/' + id + '/statut', {
      method: 'PATCH',
      body: JSON.stringify({ statut })
    });
  },

  async deleteCommande(id) {
    return this.fetch('/api/commandes/' + id, {
      method: 'DELETE'
    });
  },

  // Rapports
  getRapportStockUrl() { return '/api/rapports/stock'; },
  getRapportMouvementsUrl(params = {}) {
    const qs = new URLSearchParams(params).toString();
    return '/api/rapports/mouvements' + (qs ? '?' + qs : '');
  },
  getRapportConsommationUrl(params = {}) {
    const qs = new URLSearchParams(params).toString();
    return '/api/rapports/consommation' + (qs ? '?' + qs : '');
  },

  async downloadRapport(url, filename) {
    const token = this.getToken();
    const res = await fetch(url, {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    if (!res.ok) throw new Error('Erreur lors du telechargement.');
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
  },

  // Users
  async getUsers() {
    return this.fetch('/api/users');
  },

  async createUser(data) {
    return this.fetch('/api/users', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  },

  async updateUser(id, data) {
    return this.fetch('/api/users/' + id, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  },

  async deleteUser(id) {
    return this.fetch('/api/users/' + id, {
      method: 'DELETE'
    });
  }
};
