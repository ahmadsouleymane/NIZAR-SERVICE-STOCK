// public/js/ui.js — Composants UI Nizar Stock v2
var UI = {
  _toastContainer: null,
  _toastTimer: null,

  _getToastContainer: function() {
    if (!this._toastContainer) this._toastContainer = document.getElementById('toast-container');
    return this._toastContainer;
  },

  // Toast notification
  toast: function(message, type) {
    type = type || 'info';
    var container = this._getToastContainer();
    var icons = {
      success: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#16A34A" stroke-width="2.5"><path d="M20 6L9 17l-5-5"/></svg>',
      error: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#DC2626" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
      warning: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" stroke-width="2.5"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
      info: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0EA5A0" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>'
    };

    var toast = document.createElement('div');
    toast.className = 'toast toast-' + type;
    toast.innerHTML = '<span class="toast-icon">' + (icons[type] || icons.info) + '</span>' +
      '<span class="toast-msg">' + this.escapeHtml(message) + '</span>' +
      '<button class="toast-close" aria-label="Fermer">&times;</button>';

    toast.querySelector('.toast-close').addEventListener('click', function() { toast.remove(); });
    container.appendChild(toast);

    setTimeout(function() {
      if (toast.parentNode) {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(20px)';
        toast.style.transition = 'all 200ms ease';
        setTimeout(function() { if (toast.parentNode) toast.remove(); }, 200);
      }
    }, 4000);
  },

  // Confirmation dialog
  confirm: function(message) {
    return new Promise(function(resolve) {
      var overlay = document.getElementById('modal-overlay');
      var content = document.getElementById('modal-content');

      content.innerHTML =
        '<div class="modal-header"><h3 class="modal-title">Confirmation</h3></div>' +
        '<p>' + UI.escapeHtml(message) + '</p>' +
        '<div class="modal-actions">' +
        '<button class="btn btn-secondary" id="confirm-cancel">Annuler</button>' +
        '<button class="btn btn-danger" id="confirm-ok">Confirmer</button>' +
        '</div>';

      overlay.style.display = 'flex';

      function close(val) {
        overlay.style.display = 'none';
        resolve(val);
      }

      document.getElementById('confirm-cancel').addEventListener('click', function() { close(false); });
      document.getElementById('confirm-ok').addEventListener('click', function() { close(true); });
    });
  },

  // Modal generique (titre + body HTML + boutons d'action)
  modal: function(title, bodyHtml, actions) {
    var overlay = document.getElementById('modal-overlay');
    var content = document.getElementById('modal-content');

    // Construire les boutons
    var actionsHtml = '';
    if (actions && actions.length) {
      actionsHtml = '<div class="modal-actions">';
      for (var i = 0; i < actions.length; i++) {
        var a = actions[i];
        actionsHtml += '<button class="btn ' + (a.cls || 'btn-secondary') + '" id="modal-btn-' + i + '">' + UI.escapeHtml(a.label) + '</button>';
      }
      actionsHtml += '</div>';
    }

    content.innerHTML =
      '<div class="modal-header">' +
      '<h3 class="modal-title">' + UI.escapeHtml(title) + '</h3>' +
      '</div>' +
      '<div class="modal-body">' + bodyHtml + '</div>' +
      actionsHtml;

    overlay.style.display = 'flex';

    // Objet retourne
    var modal = {
      close: function() { overlay.style.display = 'none'; }
    };

    // Binder les actions
    if (actions && actions.length) {
      for (var j = 0; j < actions.length; j++) {
        (function(index, action) {
          var btn = document.getElementById('modal-btn-' + index);
          if (btn) {
            btn.addEventListener('click', function(e) {
              e.preventDefault();
              if (action.callback) action.callback(modal);
            });
          }
        })(j, actions[j]);
      }
    }

    // Fermer au clic sur l'overlay
    overlay.onclick = function(e) {
      if (e.target === overlay) modal.close();
    };

    return modal;
  },

  // Autocompletion (recherche avec suggestions) — articles, fournisseurs, etc.
  // options: { items:[{id,label,meta}], onSelect(item), onAdd(text), placeholder, allowAdd }
  // Retourne un controleur : { value() -> item|null, text() -> string, set(id), clear(), destroy() }
  autocomplete: function(container, options) {
    var self = this;
    options = options || {};
    var items = options.items || [];
    var selected = null;

    var input = document.createElement('input');
    input.type = 'text';
    input.className = 'form-input';
    input.placeholder = options.placeholder || 'Rechercher...';
    input.setAttribute('autocomplete', 'off');

    var dropdown = document.createElement('div');
    dropdown.className = 'ac-dropdown';
    dropdown.style.cssText = 'position:absolute;top:100%;left:0;right:0;z-index:1000;background:#fff;border:1px solid #e6e8ea;border-radius:8px;max-height:220px;overflow-y:auto;display:none;box-shadow:0 8px 20px rgba(0,0,0,0.12);margin-top:4px;text-align:left';

    var wrapper = document.createElement('div');
    wrapper.style.cssText = 'position:relative';
    wrapper.appendChild(input);
    wrapper.appendChild(dropdown);
    container.appendChild(wrapper);

    function render(filter) {
      filter = (filter || '').toLowerCase();
      var matches = [];
      for (var i = 0; i < items.length; i++) {
        var it = items[i];
        if (!filter || (it.label + ' ' + (it.meta || '')).toLowerCase().indexOf(filter) !== -1) matches.push(it);
        if (matches.length >= 40) break;
      }
      var html = '';
      for (var j = 0; j < matches.length; j++) {
        var m = matches[j];
        html += '<div class="ac-item" data-idx="' + j + '" style="padding:9px 12px;cursor:pointer;border-bottom:1px solid #e6e8ea;font-size:0.9rem">' +
          '<div>' + self.escapeHtml(m.label) + '</div>' +
          (m.meta ? '<div style="font-size:0.75rem;color:#888">' + self.escapeHtml(m.meta) + '</div>' : '') +
          '</div>';
      }
      if (options.allowAdd && filter) {
        html += '<div class="ac-add" style="padding:9px 12px;cursor:pointer;font-size:0.9rem;color:#0EA5A0;font-weight:600">+ Creer « ' + self.escapeHtml(filter) + ' »</div>';
      }
      if (!matches.length && !options.allowAdd) {
        html = '<div style="padding:9px 12px;color:#888;font-size:0.85rem">Aucun resultat.</div>';
      }
      dropdown.innerHTML = html;
      dropdown.style.display = 'block';
      dropdown.querySelectorAll('.ac-item').forEach(function(el) {
        el.addEventListener('click', function() {
          var item = matches[parseInt(this.getAttribute('data-idx'))];
          if (!item) return;
          selected = item;
          input.value = item.label;
          dropdown.style.display = 'none';
          if (options.onSelect) options.onSelect(item);
        });
      });
      var addEl = dropdown.querySelector('.ac-add');
      if (addEl) addEl.addEventListener('click', function() {
        dropdown.style.display = 'none';
        if (options.onAdd) options.onAdd(filter);
      });
    }

    input.addEventListener('input', function() {
      selected = null;
      var v = input.value.trim();
      if (!v) { dropdown.style.display = 'none'; return; }
      render(v);
    });
    input.addEventListener('focus', function() {
      if (input.value.trim()) render(input.value.trim());
    });
    document.addEventListener('click', function outside(e) {
      if (!wrapper.contains(e.target)) dropdown.style.display = 'none';
    });

    return {
      value: function() { return selected; },
      text: function() { return input.value.trim(); },
      set: function(id) {
        for (var i = 0; i < items.length; i++) {
          if (String(items[i].id) === String(id)) {
            selected = items[i];
            input.value = items[i].label;
            return;
          }
        }
      },
      clear: function() { selected = null; input.value = ''; },
      destroy: function() {}
    };
  },

  // Helpers
  formatDate: function(isoString) {
    if (!isoString) return '-';
    var d = new Date(isoString);
    if (isNaN(d.getTime())) return String(isoString);
    return ('0' + d.getDate()).slice(-2) + '/' + ('0' + (d.getMonth() + 1)).slice(-2) + '/' + d.getFullYear() + ' ' +
      ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
  },

  renderBadgeStatut: function(statut) {
    var map = { brouillon: 'badge-neutral', envoyee: 'badge-info', recue: 'badge-success', signee: 'badge-success', archivee: 'badge-neutral', annulee: 'badge-danger' };
    var labels = { brouillon: 'Brouillon', envoyee: 'Envoyee', recue: 'Recue', signee: 'Signee', archivee: 'Archivee', annulee: 'Annulee' };
    return '<span class="badge ' + (map[statut] || 'badge-neutral') + '">' + (labels[statut] || statut) + '</span>';
  },

  renderStockBadge: function(stock, min) {
    if (stock <= 0) return '<span class="badge badge-danger">Rupture</span>';
    if (stock <= min) return '<span class="badge badge-warning">Bas</span>';
    return '<span class="badge badge-success">OK</span>';
  },

  renderEmptyState: function(msg, actionLabel, actionHash) {
    var html = '<div class="empty-state">' +
      '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/></svg>' +
      '<h3>' + UI.escapeHtml(msg) + '</h3>';
    if (actionLabel) {
      if (actionHash && actionHash !== '#') {
        html += '<a href="#' + actionHash + '" class="btn btn-primary" style="margin-top:0.5rem">' + UI.escapeHtml(actionLabel) + '</a>';
      } else {
        html += '<span class="btn btn-primary" style="margin-top:0.5rem">' + UI.escapeHtml(actionLabel) + '</span>';
      }
    }
    html += '</div>';
    return html;
  },

  renderSkeleton: function(rows) {
    rows = rows || 5;
    var html = '';
    for (var i = 0; i < rows; i++) {
      html += '<div class="skeleton skeleton-text" style="width:' + (70 + Math.random() * 30) + '%"></div>';
    }
    return html;
  },

  toggleTheme: function() {
    var html = document.documentElement;
    var current = html.getAttribute('data-theme');
    var next = current === 'dark' ? 'light' : 'dark';
    html.setAttribute('data-theme', next);
    localStorage.setItem('nizar_theme', next);
  },

  initTheme: function() {
    // Light mode uniquement pour Nizar Stock
    document.documentElement.setAttribute('data-theme', 'light');
  },

  debounce: function(fn, delay) {
    var timer;
    return function() { clearTimeout(timer); timer = setTimeout(fn.bind(this), delay); };
  },

  escapeHtml: function(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  },

  formatNumber: function(n) { return Number(n || 0).toLocaleString('fr-FR'); },
  formatPrice: function(n) {
    if (!n) return '-';
    return Number(n).toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ' F';
  }
};
