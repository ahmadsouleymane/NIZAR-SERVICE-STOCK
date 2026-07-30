// public/js/ui.js
// Composants UI reutilisables pour Nizar Stock

const UI = {
  // Toast notifications
  _toastContainer: null,

  _getContainer() {
    if (!this._toastContainer) {
      this._toastContainer = document.getElementById('toast-container');
    }
    return this._toastContainer;
  },

  toast(message, type = 'info') {
    const container = this._getContainer();
    const icons = {
      success: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#16A34A" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg>',
      error: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#DC2626" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
      warning: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
      info: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2563EB" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>'
    };

    const toast = document.createElement('div');
    toast.className = 'toast toast-' + type;
    toast.innerHTML = '<span class="toast-icon">' + (icons[type] || icons.info) + '</span>' +
      '<span class="toast-msg">' + this.escapeHtml(message) + '</span>' +
      '<button class="toast-close" aria-label="Fermer">&times;</button>';

    const closeBtn = toast.querySelector('.toast-close');
    closeBtn.addEventListener('click', function() { toast.remove(); });

    container.appendChild(toast);

    setTimeout(function() {
      if (toast.parentNode) {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100%)';
        toast.style.transition = 'all 200ms ease';
        setTimeout(function() { if (toast.parentNode) toast.remove(); }, 200);
      }
    }, 4000);
  },

  // Confirmation modal
  confirm(message) {
    return new Promise(function(resolve) {
      var overlay = document.getElementById('modal-overlay');
      var content = document.getElementById('modal-content');

      content.innerHTML = '<div class="modal-header">' +
        '<h3 class="modal-title">Confirmation</h3>' +
        '<button class="btn btn-icon" id="modal-close-btn" aria-label="Fermer">&times;</button>' +
        '</div>' +
        '<p>' + UI.escapeHtml(message) + '</p>' +
        '<div class="modal-actions">' +
        '<button class="btn btn-secondary" id="modal-cancel">Annuler</button>' +
        '<button class="btn btn-danger" id="modal-confirm">Confirmer</button>' +
        '</div>';

      overlay.style.display = 'flex';

      function close(val) {
        overlay.style.display = 'none';
        resolve(val);
      }

      document.getElementById('modal-cancel').addEventListener('click', function() { close(false); });
      document.getElementById('modal-confirm').addEventListener('click', function() { close(true); });
      document.getElementById('modal-close-btn').addEventListener('click', function() { close(false); });
      overlay.addEventListener('click', function(e) { if (e.target === overlay) close(false); });
    });
  },

  // Generic modal
  modal(title, contentHtml, actions) {
    var overlay = document.getElementById('modal-overlay');
    var content = document.getElementById('modal-content');

    var actionsHtml = '';
    if (actions) {
      actionsHtml = '<div class="modal-actions">';
      for (var i = 0; i < actions.length; i++) {
        var a = actions[i];
        actionsHtml += '<button class="btn ' + (a.cls || 'btn-secondary') + '" id="modal-action-' + i + '">' + UI.escapeHtml(a.label) + '</button>';
      }
      actionsHtml += '</div>';
    }

    content.innerHTML = '<div class="modal-header">' +
      '<h3 class="modal-title">' + UI.escapeHtml(title) + '</h3>' +
      '<button class="btn btn-icon" id="modal-close-btn" aria-label="Fermer">&times;</button>' +
      '</div>' +
      '<div class="modal-body">' + contentHtml + '</div>' +
      actionsHtml;

    overlay.style.display = 'flex';

    var result = { close: function() { overlay.style.display = 'none'; } };

    if (actions) {
      for (var j = 0; j < actions.length; j++) {
        (function(index, action) {
          var btn = document.getElementById('modal-action-' + index);
          if (btn) {
            btn.addEventListener('click', function() {
              if (action.callback) action.callback(result);
            });
          }
        })(j, actions[j]);
      }
    }

    document.getElementById('modal-close-btn').addEventListener('click', function() { result.close(); });
    overlay.addEventListener('click', function(e) { if (e.target === overlay) result.close(); });

    return result;
  },

  // Format date ISO -> JJ/MM/AAAA HH:MM
  formatDate(isoString) {
    if (!isoString) return '-';
    var d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;
    var day = String(d.getDate()).padStart(2, '0');
    var month = String(d.getMonth() + 1).padStart(2, '0');
    var year = d.getFullYear();
    var hours = String(d.getHours()).padStart(2, '0');
    var minutes = String(d.getMinutes()).padStart(2, '0');
    return day + '/' + month + '/' + year + ' ' + hours + ':' + minutes;
  },

  // Badge statut commande
  renderBadgeStatut(statut) {
    var map = {
      'brouillon': 'badge-neutral',
      'envoyee': 'badge-info',
      'recue': 'badge-success',
      'annulee': 'badge-danger'
    };
    var labels = {
      'brouillon': 'Brouillon',
      'envoyee': 'Envoyee',
      'recue': 'Recue',
      'annulee': 'Annulee'
    };
    return '<span class="badge ' + (map[statut] || 'badge-neutral') + '">' + (labels[statut] || statut) + '</span>';
  },

  // Badge niveau de stock
  renderStockBadge(stockActuel, stockMin) {
    if (stockActuel <= 0) {
      return '<span class="badge badge-danger">Rupture</span>';
    } else if (stockActuel <= stockMin) {
      return '<span class="badge badge-warning">Bas</span>';
    } else {
      return '<span class="badge badge-success">OK</span>';
    }
  },

  // Etat vide
  renderEmptyState(message, actionLabel, actionUrl) {
    var html = '<div class="empty-state">' +
      '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/></svg>' +
      '<h3>' + UI.escapeHtml(message) + '</h3>';
    if (actionLabel && actionUrl) {
      html += '<a href="' + actionUrl + '" class="btn btn-primary">' + UI.escapeHtml(actionLabel) + '</a>';
    }
    html += '</div>';
    return html;
  },

  // Skeleton loader
  renderSkeleton(rows) {
    rows = rows || 5;
    var html = '';
    for (var i = 0; i < rows; i++) {
      html += '<div class="skeleton skeleton-text" style="width:' + (80 + Math.random() * 20) + '%"></div>';
    }
    return html;
  },

  // Theme toggle
  toggleTheme() {
    var html = document.documentElement;
    var current = html.getAttribute('data-theme');
    var next = current === 'dark' ? 'light' : 'dark';
    html.setAttribute('data-theme', next);
    localStorage.setItem('nizar_theme', next);
  },

  initTheme() {
    var saved = localStorage.getItem('nizar_theme');
    if (saved) {
      document.documentElement.setAttribute('data-theme', saved);
    } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      document.documentElement.setAttribute('data-theme', 'dark');
    }
  },

  // Debounce
  debounce(fn, delay) {
    var timer;
    return function() {
      var context = this;
      var args = arguments;
      clearTimeout(timer);
      timer = setTimeout(function() { fn.apply(context, args); }, delay);
    };
  },

  // Escape HTML
  escapeHtml(str) {
    if (!str) return '';
    var div = document.createElement('div');
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
  },

  // Format number
  formatNumber(n) {
    if (n === null || n === undefined) return '0';
    return Number(n).toLocaleString('fr-FR');
  },

  // Format price
  formatPrice(n) {
    if (n === null || n === undefined || n === 0) return '-';
    return Number(n).toLocaleString('fr-FR', { style: 'currency', currency: 'MAD', minimumFractionDigits: 0 });
  }
};
