// public/js/wake.js — Gestion du réveil du back-end (plan Render gratuit).
// Le service dort après ~15 min d'inactivité et met ~1 min à se réveiller.
// Ce module :
//   1. déclenche un « pré-réveil » dès l'ouverture de la page (le cold start
//      démarre pendant que l'utilisateur se connecte) ;
//   2. affiche un écran de chargement de marque tant que le serveur n'est pas prêt ;
//   3. expose un « waitReady » silencieux pour réessayer une requête échouée.
var WakeManager = {

  _overlay: null,

  // Ping léger : le back-end répond-il ? (déclenche aussi le démarrage Render)
  ping: function(timeoutMs) {
    timeoutMs = timeoutMs || 4000;
    return new Promise(function(resolve) {
      var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
      var t = setTimeout(function() { if (ctrl) ctrl.abort(); resolve(false); }, timeoutMs);
      fetch('/api/health', { cache: 'no-store', signal: ctrl ? ctrl.signal : undefined })
        .then(function(r) { clearTimeout(t); resolve(!!r && r.ok); })
        .catch(function() { clearTimeout(t); resolve(false); });
    });
  },

  // Pré-réveil : fire-and-forget, lance le cold start dès l'ouverture
  prewake: function() {
    try { fetch('/api/health', { cache: 'no-store' }).catch(function() {}); } catch (e) { /* ignoré */ }
  },

  _showOverlay: function() {
    if (this._overlay) return;
    var o = document.createElement('div');
    o.id = 'wake-overlay';
    o.className = 'wake-overlay';
    o.innerHTML =
      '<div class="wake-card">' +
        '<img src="/logo.jpeg" alt="Nizar Transport Voyageur" class="wake-logo">' +
        '<h2>Réveil du serveur…</h2>' +
        '<div class="wake-spinner"></div>' +
        '<p id="wake-msg">L\'application démarre. Après une pause, la première ouverture peut prendre environ une minute.</p>' +
        '<button type="button" class="btn btn-secondary" id="wake-retry">Réessayer maintenant</button>' +
      '</div>';
    document.body.appendChild(o);
    this._overlay = o;
    var btn = document.getElementById('wake-retry');
    if (btn) btn.addEventListener('click', function() { WakeManager._retryNow(); });
  },

  _hideOverlay: function() {
    if (this._overlay) { this._overlay.remove(); this._overlay = null; }
  },

  // Écran de chargement simple pendant qu'une requête attend le réveil du serveur.
  _waitEl: null,
  showWait: function(msg) {
    if (this._waitEl) return;
    var o = document.createElement('div');
    o.id = 'wait-overlay';
    o.className = 'wake-overlay';
    o.innerHTML =
      '<div class="wake-card">' +
        '<div class="wake-spinner"></div>' +
        '<h2>' + (msg || 'En attente du serveur…') + '</h2>' +
        '<p>L\'application se reconnecte, un instant.</p>' +
      '</div>';
    document.body.appendChild(o);
    this._waitEl = o;
  },
  hideWait: function() {
    if (this._waitEl) { this._waitEl.remove(); this._waitEl = null; }
  },

  _retryNow: function() {
    // Réévalue immédiatement l'état (le serveur a peut-être fini de démarrer)
    var cb = this._pendingDone;
    if (!cb) return;
    this._pendingDone = null;
    this.ensureReady(cb, { intervalMs: 1500 });
  },

  // Attend que le back-end soit prêt puis appelle done().
  // opts.silent = true → pas d'écran de chargement (retry en arrière-plan).
  ensureReady: function(done, opts) {
    var self = this;
    opts = opts || {};
    var intervalMs = opts.intervalMs || 3000;
    this.prewake();
    this._pendingDone = done;
    var attempt = function(showOverlay) {
      self.ping().then(function(ok) {
        if (ok) {
          self._hideOverlay();
          var cb = self._pendingDone;
          self._pendingDone = null;
          if (cb) cb();
          return;
        }
        // Premier ping sans overlay (évite un flash si le serveur répond vite)
        if (showOverlay && !opts.silent) self._showOverlay();
        setTimeout(function() { attempt(true); }, intervalMs);
      });
    };
    attempt(false);
  },

  // Variante silencieuse : Promise résolue quand le back-end répond.
  // maxMs : temps d'attente maximal (évite un hang infini en cas de vraie panne).
  waitReady: function(intervalMs, maxMs) {
    var self = this;
    intervalMs = intervalMs || 3000;
    maxMs = maxMs || 75000;
    return new Promise(function(resolve) {
      var started = Date.now();
      var attempt = function() {
        self.ping(3000).then(function(ok) {
          if (ok) { resolve(); return; }
          if (Date.now() - started > maxMs) { resolve(); return; }
          setTimeout(attempt, intervalMs);
        });
      };
      attempt();
    });
  }
};
