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
    let networkRetry = 0;
    let slowTimer = null;
    // Écran de chargement simple si la requête traîne (réveil du serveur) :
    // Render garde la requête ~1 min pendant le cold start avant de répondre.
    const stopWait = () => {
      if (slowTimer) { clearTimeout(slowTimer); slowTimer = null; }
      WakeManager.hideWait();
    };
    for (;;) {
      if (!slowTimer) {
        slowTimer = setTimeout(function() { WakeManager.showWait('Connexion au serveur…'); }, 6000);
      }
      try {
        const res = await fetch(url, {
          headers: this._headers(),
          ...options
        });

        // Un 401 sur /api/auth/login est un identifiant/mot de passe incorrect,
        // pas une session expirée (il n'y a pas encore de session) : laisser
        // passer pour que le vrai message d'erreur (JSON) s'affiche normalement.
        if (res.status === 401 && !url.includes('/api/auth/login')) {
          stopWait();
          this.clearToken();
          window.location.hash = '#login';
          throw new Error('Session expirée. Veuillez vous reconnecter.');
        }

        // Pour les exports Excel (blob)
        const ct = res.headers.get('content-type') || '';
        if (ct.includes('spreadsheet') || ct.includes('officedocument')) {
          stopWait();
          return res.blob();
        }

        const data = await res.json();

        if (!res.ok) {
          stopWait();
          throw new Error(data.error || 'Erreur ' + res.status);
        }

        stopWait();
        return data;
      } catch (err) {
        stopWait();
        // Réseau injoignable : le back-end dort peut-être (mise en veille Render).
        // On affiche un écran de chargement simple, on attend son réveil, puis on
        // réessaie une fois.
        if (err && err.message === 'Failed to fetch' && networkRetry === 0) {
          networkRetry++;
          WakeManager.showWait('Connexion au serveur…');
          try { await WakeManager.waitReady(2500, 75000); } catch (e) { /* ignoré */ }
          WakeManager.hideWait();
          continue;
        }
        if (err && err.message === 'Failed to fetch') {
          throw new Error('Impossible de contacter le serveur.');
        }
        throw err;
      }
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

  async changePassword(current_password, new_password) {
    return this.fetch('/api/users/me/password', {
      method: 'PATCH',
      body: JSON.stringify({ current_password, new_password })
    });
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

  // Unites
  async getUnites() {
    return this.fetch('/api/unites');
  },

  async createUnite(data) {
    return this.fetch('/api/unites', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  },

  async deleteUnite(id) {
    return this.fetch('/api/unites/' + id, {
      method: 'DELETE'
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

  // Mouvements
  async getMouvements(params = {}) {
    const qs = new URLSearchParams(params).toString();
    return this.fetch('/api/mouvements' + (qs ? '?' + qs : ''));
  },

  async getMouvementsResume() {
    return this.fetch('/api/mouvements/resume');
  },

  async createMouvement(data) {
    return this.fetch('/api/mouvements', {
      method: 'POST',
      body: JSON.stringify(data)
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
  getRapportSortiesAgenceUrl(params = {}) {
    const qs = new URLSearchParams(params).toString();
    return '/api/rapports/sorties-agence' + (qs ? '?' + qs : '');
  },
  getRapportStockPdfUrl() { return '/api/rapports/stock-pdf'; },

  // Centre de rapports V2
  async getRapportMeta() {
    return this.fetch('/api/rapports/v2/meta');
  },
  async getRapportV2(slug, params = {}) {
    const qs = new URLSearchParams(params).toString();
    return this.fetch('/api/rapports/v2/' + slug + (qs ? '?' + qs : ''));
  },
  getRapportV2Url(slug, params = {}) {
    const qs = new URLSearchParams(params).toString();
    return '/api/rapports/v2/' + slug + (qs ? '?' + qs : '');
  },

  // Sauvegarde de la base (admin)
  async downloadBackup() {
    return this.downloadRapport('/api/backup', 'sauvegarde-nizar.db');
  },

  // Journal d'audit (admin)
  async getAuditLog(params = {}) {
    const qs = new URLSearchParams(params).toString();
    return this.fetch('/api/audit' + (qs ? '?' + qs : ''));
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
  },

  // Localites
  async getLocalites() {
    return this.fetch('/api/localites');
  },

  async createLocalite(data) {
    return this.fetch('/api/localites', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  },

  async deleteLocalite(id) {
    return this.fetch('/api/localites/' + id, {
      method: 'DELETE'
    });
  },

  // Fiches de reception
  async getFiches(params) {
    var qs = new URLSearchParams(params).toString();
    return this.fetch('/api/fiches' + (qs ? '?' + qs : ''));
  },

  async getFiche(id) {
    return this.fetch('/api/fiches/' + id);
  },

  async createFiche(data) {
    return this.fetch('/api/fiches', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  },

  async changeStatutFiche(id, statut) {
    return this.fetch('/api/fiches/' + id + '/statut', {
      method: 'PATCH',
      body: JSON.stringify({ statut: statut })
    });
  },

  async imprimerFiche(id) {
    return this.fetch('/api/fiches/' + id + '/imprimer', {
      method: 'POST'
    });
  },

  async uploadScanFiche(id, file) {
    var token = this.getToken();
    var formData = new FormData();
    formData.append('scan', file);
    var res = await fetch('/api/fiches/' + id + '/upload', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token },
      body: formData
    });
    return res.json();
  },

  async updateFiche(id, data) {
    return this.fetch('/api/fiches/' + id, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  },

  async deleteFiche(id) {
    return this.fetch('/api/fiches/' + id, {
      method: 'DELETE'
    });
  },

  // Retours de carnets
  async getRetours(params) {
    var qs = new URLSearchParams(params).toString();
    return this.fetch('/api/retours' + (qs ? '?' + qs : ''));
  },

  async createRetour(data) {
    return this.fetch('/api/retours', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  },

  // Entrees
  async getEntrees(params) {
    var qs = new URLSearchParams(params).toString();
    return this.fetch('/api/entrees' + (qs ? '?' + qs : ''));
  },

  async getEntree(id) {
    return this.fetch('/api/entrees/' + id);
  },

  async createEntree(data) {
    return this.fetch('/api/entrees', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  },

  async validerEntree(id) {
    return this.fetch('/api/entrees/' + id + '/valider', {
      method: 'POST'
    });
  },

  async updateEntree(id, data) {
    return this.fetch('/api/entrees/' + id, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  },

  async deleteEntree(id) {
    return this.fetch('/api/entrees/' + id, {
      method: 'DELETE'
    });
  },

  async uploadEntreePhoto(id, file, type) {
    var token = this.getToken();
    var formData = new FormData();
    formData.append('photo', file);
    formData.append('type', type);
    var res = await fetch('/api/entrees/' + id + '/photos', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token },
      body: formData
    });
    return res.json();
  },

  async genererBonLivraison(id) {
    return this.fetch('/api/entrees/' + id + '/bon-livraison', { method: 'POST' });
  },

  getEntreePdfUrl(id) {
    return '/api/entrees/' + id + '/pdf';
  },

  async getSeries(params = {}) {
    const qs = new URLSearchParams(params).toString();
    return this.fetch('/api/series' + (qs ? '?' + qs : ''));
  },

  async getSeriesArticle(article_id) {
    return this.fetch('/api/series/' + article_id);
  },

  async searchSerie(numero) {
    return this.fetch('/api/series/recherche?numero=' + encodeURIComponent(numero));
  },

  // Comptage physique
  async getInventaires(params = {}) {
    const qs = new URLSearchParams(params).toString();
    return this.fetch('/api/inventaires' + (qs ? '?' + qs : ''));
  },

  async createInventaire(data) {
    return this.fetch('/api/inventaires', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  },

  // Inventaire (grand livre)
  async getJournal(params = {}) {
    const qs = new URLSearchParams(params).toString();
    return this.fetch('/api/inventaires/journal' + (qs ? '?' + qs : ''));
  },

  getJournalExportUrl(params = {}) {
    const qs = new URLSearchParams(params).toString();
    return '/api/inventaires/journal/export' + (qs ? '?' + qs : '');
  },

  // Import Excel
  async importEntrees(file) {
    var token = this.getToken();
    var formData = new FormData();
    formData.append('file', file);
    var res = await fetch('/api/import/entrees', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token },
      body: formData
    });
    return res.json();
  },

  async importExcel(file) {
    var token = this.getToken();
    var formData = new FormData();
    formData.append('file', file);
    var res = await fetch('/api/import/excel', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token },
      body: formData
    });
    return res.json();
  },

  // Tendance entrées/sorties des 14 derniers jours (tableau de bord)
  async getTrends() {
    return this.fetch('/api/trends');
  },

  // Compte des articles sous le seuil minimum (badge navigation)
  async getAlertesCompte() {
    return this.fetch('/api/alertes/compte');
  },

  // Recherche rapide globale : articles (nom/référence) + numéros de souche
  async searchGlobal(q) {
    return this.fetch('/api/recherche?q=' + encodeURIComponent(q));
  },

  // Billets en circulation (articles numérotés)
  async getBillets() {
    return this.fetch('/api/billets');
  },

  // Anomalies d'import (admin)
  async getAnomalies() {
    return this.fetch('/api/mouvements/anomalies');
  },

  async corrigerNumeroMouvement(id, numero_debut, numero_fin) {
    return this.fetch('/api/mouvements/' + id + '/numero', {
      method: 'PATCH',
      body: JSON.stringify({ numero_debut, numero_fin })
    });
  },

  // Fiches de besoin
  async getFichesBesoin(params = {}) {
    const qs = new URLSearchParams(params).toString();
    return this.fetch('/api/fiches-besoin' + (qs ? '?' + qs : ''));
  },

  async getFicheBesoin(id) {
    return this.fetch('/api/fiches-besoin/' + id);
  },

  async createFicheBesoin(data) {
    return this.fetch('/api/fiches-besoin', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  },

  async changeStatutFicheBesoin(id, statut) {
    return this.fetch('/api/fiches-besoin/' + id + '/statut', {
      method: 'PATCH',
      body: JSON.stringify({ statut })
    });
  },

  async uploadScanFicheBesoin(id, file) {
    var token = this.getToken();
    var formData = new FormData();
    formData.append('scan', file);
    var res = await fetch('/api/fiches-besoin/' + id + '/scan', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token },
      body: formData
    });
    return res.json();
  },

  async deleteFicheBesoin(id) {
    return this.fetch('/api/fiches-besoin/' + id, {
      method: 'DELETE'
    });
  }
};
