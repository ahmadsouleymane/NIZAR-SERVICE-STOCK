// public/js/app.js — Nizar Stock v2 Router
(function() {
  'use strict';

  var user = null;
  var currentPage = null;

  // Tous les items du drawer
  var ALL_ITEMS = [
    { id: 'dashboard', label: 'Tableau de bord', icon: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>' },
    { id: 'articles', label: 'Articles', icon: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>' },
    { id: 'fiches', label: 'Sortie', icon: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="M12 18v-6"/><path d="M9 15l3-3 3 3"/></svg>' },
    { id: 'entrees', label: 'Entrées', icon: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>' },
    { id: 'mouvements', label: 'Mouvements', icon: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 014-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 01-4 4H3"/></svg>' },
    { id: 'fournisseurs', label: 'Fournisseurs', icon: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>' },
    { id: 'commandes', label: 'Commandes', icon: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/></svg>' },
    { id: 'retours', label: 'Retours carnets', icon: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 102.13-9.36L1 10"/></svg>' },
    { id: 'souches', label: 'Souches (n° recherche)', icon: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="9" x2="20" y2="9"/><line x1="4" y1="15" x2="20" y2="15"/><line x1="10" y1="3" x2="8" y2="21"/><line x1="16" y1="3" x2="14" y2="21"/></svg>' },
    { id: 'billets', label: 'Billets en circulation', icon: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9V5a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 010 4v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4a2 2 0 010-4z"/><line x1="7" y1="9" x2="7" y2="15"/><line x1="11" y1="9" x2="11" y2="15"/></svg>' },
    { id: 'inventaire', label: 'Inventaire', icon: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21V8l9-5 9 5v13"/><path d="M3 21h18"/><path d="M9 21v-6h6v6"/></svg>' },
    { id: 'comptage', label: 'Comptage', icon: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>' },
    { id: 'rapports', label: 'Rapports', icon: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="M8 13h2"/><path d="M8 17h2"/><path d="M14 13h2"/><path d="M14 17h2"/></svg>' },
    { id: 'parametres', label: 'Paramètres', icon: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>' }
  ];

  // 4 items principaux pour la bottom nav (autour du bouton d'action central)
  var BOTTOM_ITEMS = ['dashboard', 'articles', 'fiches', 'entrees'];
  var BOTTOM_LABELS = { dashboard: 'Accueil', articles: 'Articles', fiches: 'Sortie', entrees: 'Entrées' };

  // Actions rapides accessibles via le bouton central (+)
  var QUICK_ACTIONS = [
    { label: 'Nouvelle entrée', page: 'entrees', open: true },
    { label: 'Nouvelle sortie', page: 'fiches', open: true },
    { label: 'Nouveau retour', page: 'retours', open: true },
    { label: 'Nouveau comptage', page: 'comptage', open: true },
    { label: 'Mouvements', page: 'mouvements' },
    { label: 'Souches (n° recherche)', page: 'souches' },
    { label: 'Billets en circulation', page: 'billets' },
    { label: 'Fournisseurs', page: 'fournisseurs' },
    { label: 'Commandes', page: 'commandes' },
    { label: 'Rapports', page: 'rapports' },
    { label: 'Paramètres', page: 'parametres' }
  ];
  // Méthode « nouveau » à ouvrir automatiquement après navigation
  var QUICK_OPEN = { entrees: '_showForm', fiches: '_showEnvoiForm', retours: '_showForm', comptage: '_showForm' };
  var __pendingAction = null;

  // Construire les navigations
  function buildNav() {
    var drawerNav = document.getElementById('drawer-nav');
    var bottomNav = document.getElementById('bottom-nav');

    // Drawer : tous les items
    var drawerHtml = '';
    drawerHtml += '<div class="drawer-section-label">Principal</div>';
    var mainIds = ['dashboard', 'articles', 'inventaire', 'fiches', 'entrees', 'mouvements'];
    for (var i = 0; i < mainIds.length; i++) {
      var item = findItem(mainIds[i]);
      if (item) drawerHtml += '<a href="#' + item.id + '" data-page="' + item.id + '">' + item.icon + '<span>' + item.label + '</span></a>';
    }
    drawerHtml += '<div class="drawer-section-label">Operations</div>';
    var opIds = ['retours', 'souches', 'billets', 'comptage'];
    for (var o = 0; o < opIds.length; o++) {
      var oitem = findItem(opIds[o]);
      if (oitem) drawerHtml += '<a href="#' + oitem.id + '" data-page="' + oitem.id + '">' + oitem.icon + '<span>' + oitem.label + '</span></a>';
    }
    drawerHtml += '<div class="drawer-section-label">Gestion</div>';
    var secIds = ['fournisseurs', 'commandes', 'rapports', 'parametres'];
    for (var j = 0; j < secIds.length; j++) {
      var sitem = findItem(secIds[j]);
      if (sitem) drawerHtml += '<a href="#' + sitem.id + '" data-page="' + sitem.id + '">' + sitem.icon + '<span>' + sitem.label + '</span></a>';
    }
    drawerNav.innerHTML = drawerHtml;

    // Bottom nav : 4 onglets autour du bouton d'action central (FAB +)
    var leftItems = ['dashboard', 'articles'];
    var rightItems = ['fiches', 'entrees'];
    var bottomHtml = '';
    for (var k = 0; k < leftItems.length; k++) {
      var litem = findItem(leftItems[k]);
      if (litem) bottomHtml += '<a href="#' + litem.id + '" data-page="' + litem.id + '">' + litem.icon + '<span>' + (BOTTOM_LABELS[litem.id] || litem.label) + '</span></a>';
    }
    // Bouton central : actions rapides
    bottomHtml += '<button type="button" id="nav-fab" class="nav-fab" aria-label="Actions rapides">' +
      '<svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>' +
      '</button>';
    for (var r = 0; r < rightItems.length; r++) {
      var ritem = findItem(rightItems[r]);
      if (ritem) bottomHtml += '<a href="#' + ritem.id + '" data-page="' + ritem.id + '">' + ritem.icon + '<span>' + (BOTTOM_LABELS[ritem.id] || ritem.label) + '</span></a>';
    }
    bottomNav.innerHTML = bottomHtml;

    // Click handlers : drawer links
    var drawerLinks = drawerNav.querySelectorAll('a[data-page]');
    for (var d = 0; d < drawerLinks.length; d++) {
      drawerLinks[d].addEventListener('click', function(e) {
        e.preventDefault();
        navigate(this.getAttribute('data-page'));
        closeDrawer();
      });
    }

    // Click handlers : bottom nav links
    var bottomLinks = bottomNav.querySelectorAll('a[data-page]');
    for (var b = 0; b < bottomLinks.length; b++) {
      bottomLinks[b].addEventListener('click', function(e) {
        e.preventDefault();
        navigate(this.getAttribute('data-page'));
      });
    }

    // Bouton central : ouvre les actions rapides
    document.getElementById('nav-fab').addEventListener('click', function(e) {
      e.preventDefault();
      openQuickActions();
    });

    // Widgets globaux : badge alerte stock bas + recherche rapide dans la topbar
    if (typeof Alertes !== 'undefined') Alertes.start();
    if (typeof GlobalSearch !== 'undefined') GlobalSearch.init();
  }

  // === Feuille d'actions rapides (bouton central +) ===
  function buildQuickSheet() {
    var overlay = document.getElementById('quick-sheet');
    if (overlay) return overlay;

    overlay = document.createElement('div');
    overlay.id = 'quick-sheet';
    overlay.className = 'sheet-overlay';

    var html = '<div class="quick-sheet">' +
      '<div class="quick-sheet-header"><h3 class="quick-sheet-title">Actions rapides</h3>' +
      '<button type="button" id="quick-sheet-close" class="btn btn-icon" aria-label="Fermer">&times;</button></div>' +
      '<div class="quick-sheet-section">Créer</div>' +
      '<div class="quick-sheet-grid">';
    for (var i = 0; i < QUICK_ACTIONS.length; i++) {
      var qa = QUICK_ACTIONS[i];
      var icon = qa.open
        ? '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>'
        : '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>';
      html += '<button type="button" class="quick-action' + (qa.open ? ' quick-action-primary' : '') + '" data-page="' + qa.page + '"' + (qa.open ? ' data-open="1"' : '') + '>' +
        '<span class="quick-action-icon">' + icon + '</span>' +
        '<span class="quick-action-label">' + UI.escapeHtml(qa.label) + '</span></button>';
    }
    html += '</div></div>';
    overlay.innerHTML = html;
    document.body.appendChild(overlay);

    var actions = overlay.querySelectorAll('.quick-action');
    for (var a = 0; a < actions.length; a++) {
      actions[a].addEventListener('click', function() {
        var page = this.getAttribute('data-page');
        var open = this.getAttribute('data-open') === '1';
        closeQuickActions();
        if (open) __pendingAction = page;
        navigate(page);
      });
    }
    document.getElementById('quick-sheet-close').addEventListener('click', closeQuickActions);
    overlay.addEventListener('click', function(e) { if (e.target === overlay) closeQuickActions(); });

    return overlay;
  }

  function openQuickActions() {
    buildQuickSheet().classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  function closeQuickActions() {
    var o = document.getElementById('quick-sheet');
    if (o) o.classList.remove('open');
    document.body.style.overflow = '';
  }

  function findItem(id) {
    for (var i = 0; i < ALL_ITEMS.length; i++) {
      if (ALL_ITEMS[i].id === id) return ALL_ITEMS[i];
    }
    return null;
  }

  // Drawer open/close
  function openDrawer() {
    document.getElementById('drawer').classList.add('open');
    document.getElementById('sidebar-overlay').classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  function closeDrawer() {
    document.getElementById('drawer').classList.remove('open');
    document.getElementById('sidebar-overlay').classList.remove('open');
    document.body.style.overflow = '';
  }

  // Update active state
  function updateNav(page) {
    // Drawer
    var drawerLinks = document.querySelectorAll('#drawer-nav a[data-page]');
    for (var i = 0; i < drawerLinks.length; i++) {
      drawerLinks[i].classList.toggle('active', drawerLinks[i].getAttribute('data-page') === page);
    }
    // Bottom nav
    var bottomLinks = document.querySelectorAll('#bottom-nav a[data-page]');
    for (var j = 0; j < bottomLinks.length; j++) {
      bottomLinks[j].classList.toggle('active', bottomLinks[j].getAttribute('data-page') === page);
    }

    var item = findItem(page);
    document.getElementById('page-title').textContent = item ? item.label : page;
  }

  function navigate(page) {
    // Fermer toute modale ouverte : elle ne doit pas survivre au changement de page
    var overlay = document.getElementById('modal-overlay');
    if (overlay) overlay.style.display = 'none';
    if (currentPage === page) {
      closeDrawer();
      firePending(page);
      return;
    }
    currentPage = page;
    window.location.hash = page;
    updateNav(page);
    renderPage(page);
    closeDrawer();
    document.getElementById('page-content').scrollTop = 0;
    // Rafraîchir le badge d'alerte à chaque navigation (comptage léger)
    if (typeof Alertes !== 'undefined') Alertes.refresh();
    firePending(page);
  }

  // Ouvre le formulaire « nouveau » demandé via le bouton central (+), meme si on est deja sur la page
  function firePending(page) {
    if (__pendingAction !== page) return;
    __pendingAction = null;
    var method = QUICK_OPEN[page];
    if (!method) return;
    var pagesMap = {
      entrees: typeof Entrees !== 'undefined' ? Entrees : null,
      fiches: typeof Fiches !== 'undefined' ? Fiches : null,
      retours: typeof Retours !== 'undefined' ? Retours : null,
      comptage: typeof Inventaire !== 'undefined' ? Inventaire : null
    };
    var m = pagesMap[page];
    if (m && typeof m[method] === 'function') {
      setTimeout(function() { try { m[method](); } catch (e) {} }, 200);
    }
  }

  function renderPage(page) {
    var container = document.getElementById('page-content');
    container.innerHTML = '<div style="padding:1rem">' + UI.renderSkeleton(5) + '</div>';

    var pages = {
      dashboard: typeof Dashboard !== 'undefined' ? Dashboard : null,
      articles: typeof Articles !== 'undefined' ? Articles : null,
      mouvements: typeof Mouvements !== 'undefined' ? Mouvements : null,
      fiches: typeof Fiches !== 'undefined' ? Fiches : null,
      entrees: typeof Entrees !== 'undefined' ? Entrees : null,
      fournisseurs: typeof Fournisseurs !== 'undefined' ? Fournisseurs : null,
      commandes: typeof Commandes !== 'undefined' ? Commandes : null,
      retours: typeof Retours !== 'undefined' ? Retours : null,
      souches: typeof Souches !== 'undefined' ? Souches : null,
      billets: typeof Billets !== 'undefined' ? Billets : null,
      inventaire: typeof InventaireStock !== 'undefined' ? InventaireStock : null,
      comptage: typeof Inventaire !== 'undefined' ? Inventaire : null,
      rapports: typeof Rapports !== 'undefined' ? Rapports : null,
      parametres: typeof Parametres !== 'undefined' ? Parametres : null
    };

    try {
      if (pages[page] && pages[page].render) {
        pages[page].render(container);
        // Widget tendance entrées/sorties inséré sous les KPI du tableau de bord
        if (page === 'dashboard' && typeof TrendsWidget !== 'undefined') {
          try { TrendsWidget.render(container); } catch (e) { /* non bloquant */ }
        }
      } else {
        container.innerHTML = '<div class="empty-state"><h3>Page introuvable</h3></div>';
      }
    } catch (e) {
      container.innerHTML = '<div class="empty-state"><h3>Erreur</h3><p>' + UI.escapeHtml(e.message) + '</p></div>';
    }
  }

  // Login
  function showLogin() {
    document.getElementById('login-screen').style.display = 'flex';
    document.getElementById('main-layout').style.display = 'none';
  }

  function showMain() {
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('main-layout').style.display = 'block';
  }

  function initLogin() {
    var form = document.getElementById('login-form');
    form.addEventListener('submit', function(e) {
      e.preventDefault();
      var username = document.getElementById('username').value.trim();
      var password = document.getElementById('password').value;
      var errorEl = document.getElementById('login-error');
      var btn = document.getElementById('login-btn');
      var btnText = btn.querySelector('.btn-text');
      var btnSpinner = btn.querySelector('.btn-spinner');

      if (!username || !password) {
        errorEl.textContent = 'Veuillez remplir tous les champs.';
        errorEl.style.display = 'block';
        return;
      }

      errorEl.style.display = 'none';
      btn.disabled = true;
      btnText.style.display = 'none';
      btnSpinner.style.display = 'inline-block';

      API.login(username, password)
        .then(function(data) {
          user = data.user;
          document.getElementById('drawer-username').textContent = user.username;
          document.getElementById('drawer-role').textContent = user.role;
          showMain();
          buildNav();
          navigate('dashboard');
          form.reset();
        })
        .catch(function(err) {
          errorEl.textContent = err.message;
          errorEl.style.display = 'block';
          btn.disabled = false;
          btnText.style.display = 'inline';
          btnSpinner.style.display = 'none';
        });
    });
  }

  // Events
  function initEvents() {
    document.getElementById('logout-btn-header').addEventListener('click', function() {
      API.logout();
      user = null;
      currentPage = null;
      showLogin();
      closeDrawer();
    });

    document.getElementById('menu-toggle').addEventListener('click', function() { openDrawer(); });
    document.getElementById('drawer-close').addEventListener('click', function() { closeDrawer(); });
    document.getElementById('sidebar-overlay').addEventListener('click', function() { closeDrawer(); });

    window.addEventListener('hashchange', onHashChange);

    // Swipe right to open drawer on mobile
    var touchStartX = 0;
    document.addEventListener('touchstart', function(e) { touchStartX = e.touches[0].clientX; }, { passive: true });
    document.addEventListener('touchend', function(e) {
      var diff = e.changedTouches[0].clientX - touchStartX;
      if (diff > 80 && touchStartX < 30 && window.innerWidth < 768) {
        openDrawer();
      }
    });
  }

  function onHashChange() {
    var hash = window.location.hash.replace('#', '');
    if (!hash || !findItem(hash)) hash = 'dashboard';
    if (!API.getToken()) { showLogin(); return; }
    if (hash !== currentPage) navigate(hash);
  }

  // Init
  function init() {
    UI.initTheme();
    UI.initResponsiveTables();
    initLogin();
    initEvents();

    if (API.getToken()) {
      var savedUser = localStorage.getItem('nizar_user');
      if (savedUser) {
        try {
          user = JSON.parse(savedUser);
          document.getElementById('drawer-username').textContent = user.username;
          document.getElementById('drawer-role').textContent = user.role;
          showMain();
          buildNav();
          onHashChange();
        } catch (e) { API.clearToken(); showLogin(); }
      } else { showLogin(); }
    } else { showLogin(); }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else { init(); }
})();
