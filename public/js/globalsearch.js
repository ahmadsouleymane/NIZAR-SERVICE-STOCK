// public/js/globalsearch.js — Recherche rapide globale (articles + numéros de souche) depuis la topbar
var GlobalSearch = {
  _init: false,
  _panel: null,
  _input: null,
  _results: null,
  _selected: 0,
  _matches: { articles: [], series: [], fiches: [] },

  init: function() {
    if (this._init) return;
    this._init = true;

    var right = document.querySelector('.topbar-right');
    if (!right) return;

    // Bouton loupe
    var btn = document.createElement('button');
    btn.className = 'btn btn-icon';
    btn.setAttribute('aria-label', 'Recherche rapide');
    btn.setAttribute('title', 'Recherche rapide : article, référence ou n° de souche');
    btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>';
    right.insertBefore(btn, right.firstChild);

    // Panneau déroulant ancré sous la topbar
    var panel = document.createElement('div');
    panel.id = 'global-search-panel';
    panel.style.cssText = 'position:absolute;top:100%;left:0;right:0;background:#fff;border-bottom:1px solid #E5E7EB;box-shadow:0 8px 20px rgba(0,0,0,0.10);padding:0.625rem 0.75rem;display:none;z-index:90';
    panel.innerHTML =
      '<div style="position:relative">' +
      '<input type="search" id="global-search-input" class="form-input" placeholder="Article, référence ou n° de souche..." autocomplete="off" style="padding-right:2.5rem">' +
      '<span id="gs-close" style="position:absolute;right:0.75rem;top:50%;transform:translateY(-50%);cursor:pointer;color:#6B7280;font-size:1.25rem;line-height:1">&times;</span>' +
      '</div>' +
      '<div id="global-search-results" style="margin-top:0.5rem;max-height:60vh;overflow-y:auto"></div>';

    var topbar = document.querySelector('.topbar');
    topbar.appendChild(panel);

    this._panel = panel;
    this._input = document.getElementById('global-search-input');
    this._results = document.getElementById('global-search-results');
    this._closeBtn = document.getElementById('gs-close');

    var self = this;
    btn.addEventListener('click', function(e) { e.stopPropagation(); self._open(); });
    this._closeBtn.addEventListener('click', function() { self._close(); });
    this._input.addEventListener('input', UI.debounce(function() { self._onSearch(); }, 250));
    this._input.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') { self._close(); return; }
      if (e.key === 'ArrowDown') { e.preventDefault(); self._move(1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); self._move(-1); }
      else if (e.key === 'Enter') { e.preventDefault(); self._select(self._selected); }
    });

    // Fermer au clic extérieur
    document.addEventListener('click', function(e) {
      if (self._panel.style.display !== 'none' && !topbar.contains(e.target)) self._close();
    });
  },

  _open: function() {
    this._panel.style.display = 'block';
    this._input.focus();
  },

  _close: function() {
    this._panel.style.display = 'none';
    this._input.value = '';
    this._results.innerHTML = '';
    this._matches = { articles: [], series: [], fiches: [] };
    this._selected = 0;
  },

  _onSearch: function() {
    var q = this._input.value.trim();
    if (!q) { this._results.innerHTML = ''; this._matches = { articles: [], series: [], fiches: [] }; return; }

    var self = this;
    this._results.innerHTML = '<div style="padding:0.5rem 0.25rem;color:#6B7280;font-size:0.85rem">Recherche...</div>';
    API.searchGlobal(q)
      .then(function(data) {
        self._matches = data;
        self._selected = 0;
        self._renderResults(q);
      })
      .catch(function() {
        self._results.innerHTML = '<div style="padding:0.5rem 0.25rem;color:#DC2626;font-size:0.85rem">Erreur de recherche.</div>';
      });
  },

  _renderResults: function(q) {
    var arts = this._matches.articles || [];
    var series = this._matches.series || [];
    var fiches = this._matches.fiches || [];
    var html = '';

    if (!arts.length && !series.length && !fiches.length) {
      this._results.innerHTML = '<div style="padding:0.75rem;color:#6B7280;font-size:0.85rem;text-align:center">Aucun résultat pour « ' + UI.escapeHtml(q) + ' »</div>';
      return;
    }

    if (arts.length) {
      html += '<div style="font-size:0.65rem;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:#6B7280;padding:0.25rem 0.375rem">Articles</div>';
      for (var i = 0; i < arts.length; i++) {
        html += this._itemHtml(i, 'article', UI.escapeHtml(arts[i].nom) + ' <span style="color:#6B7280">' + UI.escapeHtml(arts[i].reference) + '</span>', 'Stock: ' + arts[i].stock_actuel + ' ' + UI.escapeHtml(UI.uniteLabel(arts[i].unite)));
      }
    }
    if (series.length) {
      html += '<div style="font-size:0.65rem;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:#6B7280;padding:0.25rem 0.375rem">N° de souche</div>';
      for (var j = 0; j < series.length; j++) {
        var so = series[j];
        html += this._itemHtml(arts.length + j, 'serie', 'Souche n° ' + UI.escapeHtml(so.numero_debut) + ' — ' + UI.escapeHtml(so.numero_fin), UI.escapeHtml(so.article_nom) + ' <span style="color:#6B7280">' + UI.escapeHtml(so.reference) + '</span>');
      }
    }
    if (fiches.length) {
      html += '<div style="font-size:0.65rem;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:#6B7280;padding:0.25rem 0.375rem">Bons de réception</div>';
      for (var k = 0; k < fiches.length; k++) {
        var f = fiches[k];
        var statut = f.statut === 'envoyee' ? 'Sortie' : (f.statut === 'signee' ? 'OK' : 'Archivée');
        html += this._itemHtml(arts.length + series.length + k, 'fiche',
          'N° ' + UI.escapeHtml(f.reference),
          UI.escapeHtml(f.localite_nom || '-') + ' <span style="color:#6B7280">' + UI.formatDate(f.date_creation) + ' · ' + statut + '</span>');
      }
    }

    this._results.innerHTML = html;

    var self = this;
    var items = this._results.querySelectorAll('.gs-item');
    for (var k = 0; k < items.length; k++) {
      items[k].addEventListener('click', function() {
        self._select(parseInt(this.getAttribute('data-idx'), 10));
      });
    }
    this._highlight();
  },

  _itemHtml: function(idx, kind, label, meta) {
    return '<div class="gs-item" data-idx="' + idx + '" data-kind="' + kind + '" style="padding:0.5rem 0.625rem;cursor:pointer;border-radius:8px;font-size:0.85rem">' +
      '<div>' + label + '</div>' +
      '<div style="font-size:0.75rem;color:#6B7280">' + meta + '</div>' +
      '</div>';
  },

  _highlight: function() {
    var items = this._results.querySelectorAll('.gs-item');
    for (var i = 0; i < items.length; i++) {
      items[i].style.background = i === this._selected ? '#E6F5F4' : '';
    }
  },

  _move: function(dir) {
    var count = this._results.querySelectorAll('.gs-item').length;
    if (!count) return;
    this._selected = (this._selected + dir + count) % count;
    this._highlight();
  },

  _select: function(idx) {
    var items = this._results.querySelectorAll('.gs-item');
    if (idx < 0 || idx >= items.length) return;
    var kind = items[idx].getAttribute('data-kind');
    var artsLen = (this._matches.articles || []).length;
    var seriesLen = (this._matches.series || []).length;
    var q = this._input.value.trim();

    if (kind === 'article') {
      var art = this._matches.articles[idx];
      if (art) this._gotoArticle(art);
    } else if (kind === 'serie') {
      var ser = this._matches.series[idx - artsLen];
      var num = /^\d+$/.test(q) ? q : (ser ? ser.numero_debut : '');
      if (ser) this._gotoSerie(num);
    } else if (kind === 'fiche') {
      var fiche = this._matches.fiches[idx - artsLen - seriesLen];
      if (fiche) this._gotoFiche(fiche);
    }
    this._close();
  },

  // Ouvre la page articles avec le filtre de recherche prérempli
  _gotoArticle: function(art) {
    var ref = art.reference || art.nom || '';
    window.location.hash = 'articles';
    var self = this;
    setTimeout(function() {
      var input = document.getElementById('search-articles');
      if (input) {
        input.value = ref;
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }, 150);
  },

  // Ouvre la page souches avec le numéro prérempli et lance la recherche
  _gotoSerie: function(numero) {
    window.location.hash = 'souches';
    setTimeout(function() {
      var input = document.getElementById('souche-numero');
      var btn = document.getElementById('btn-souche-search');
      if (input && btn) { input.value = String(numero); btn.click(); }
    }, 150);
  },

  // Ouvre la page « Sortie » et affiche le détail du bon de réception trouvé
  _gotoFiche: function(fiche) {
    window.location.hash = 'fiches';
    var self = this;
    setTimeout(function() {
      if (typeof Fiches !== 'undefined' && Fiches._viewFiche) {
        try { Fiches._viewFiche(fiche.id); } catch (e) { /* le détail reste accessible via la liste */ }
      }
    }, 300);
  }
};
