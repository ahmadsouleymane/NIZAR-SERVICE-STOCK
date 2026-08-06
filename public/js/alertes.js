// public/js/alertes.js — Badge alerte stock bas dans la navigation (bottom-nav + drawer)
var Alertes = {
  _count: 0,
  _timer: null,

  // Démarre le rafraîchissement : immédiat + toutes les 5 minutes
  start: function() {
    var self = this;
    this.refresh();
    if (this._timer) return;
    this._timer = setInterval(function() { self.refresh(); }, 5 * 60 * 1000);
  },

  refresh: function() {
    var self = this;
    API.getAlertesCompte()
      .then(function(data) {
        self._count = data.count || 0;
        self._apply();
      })
      .catch(function() { /* silencieux : le badge reste tel quel en cas d'erreur réseau */ });
  },

  _apply: function() {
    var n = this._count;
    this._setBottomBadge(document.querySelector('#bottom-nav a[data-page="articles"]'), n);
    this._setDrawerBadge(document.querySelector('#drawer-nav a[data-page="articles"]'), n);
  },

  _setBottomBadge: function(link, n) {
    if (!link) return;
    var badge = link.querySelector('.nav-badge');
    if (n > 0) {
      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'nav-badge';
        link.appendChild(badge);
      }
      badge.textContent = n > 99 ? '99+' : String(n);
      badge.title = n + ' article(s) sous le seuil minimum';
    } else if (badge) {
      badge.remove();
    }
  },

  _setDrawerBadge: function(link, n) {
    if (!link) return;
    var badge = link.querySelector('.nav-badge-drawer');
    if (n > 0) {
      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'nav-badge-drawer';
        badge.style.cssText = 'margin-left:auto;background:#DC2626;color:#fff;border-radius:999px;min-width:18px;height:18px;font-size:0.65rem;font-weight:700;display:inline-flex;align-items:center;justify-content:center;padding:0 5px;line-height:1;flex-shrink:0';
        link.appendChild(badge);
      }
      badge.textContent = n > 99 ? '99+' : String(n);
      badge.title = n + ' article(s) sous le seuil minimum';
    } else if (badge) {
      badge.remove();
    }
  }
};
