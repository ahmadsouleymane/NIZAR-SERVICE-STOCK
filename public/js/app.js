// public/js/app.js
// Routeur SPA principal - Nizar Stock

(function() {
  'use strict';

  var user = null;
  var currentPage = null;

  // Navigation definition
  var NAV_ITEMS = [
    { id: 'dashboard', label: 'Tableau de bord', icon: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>' },
    { id: 'articles', label: 'Articles', icon: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>' },
    { id: 'mouvements', label: 'Mouvements', icon: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 014-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 01-4 4H3"/></svg>' },
    { id: 'fournisseurs', label: 'Fournisseurs', icon: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>' },
    { id: 'commandes', label: 'Commandes', icon: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/></svg>' },
    { id: 'rapports', label: 'Rapports', icon: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="M8 13h2"/><path d="M8 17h2"/><path d="M14 13h2"/><path d="M14 17h2"/></svg>' },
    { id: 'parametres', label: 'Parametres', icon: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>' }
  ];

  // Build navigation
  function buildNav() {
    var sidebarNav = document.getElementById('sidebar-nav');
    var bottomNav = document.getElementById('bottom-nav');

    var sidebarHtml = '';
    var bottomHtml = '';

    for (var i = 0; i < NAV_ITEMS.length; i++) {
      var item = NAV_ITEMS[i];
      sidebarHtml += '<a href="#' + item.id + '" data-page="' + item.id + '">' + item.icon + '<span>' + item.label + '</span></a>';
      bottomHtml += '<a href="#' + item.id + '" data-page="' + item.id + '">' + item.icon + '<span>' + item.label + '</span></a>';
    }

    sidebarNav.innerHTML = sidebarHtml;
    bottomNav.innerHTML = bottomHtml;

    // Click handlers
    var links = document.querySelectorAll('.sidebar-nav a, .bottom-nav a');
    for (var j = 0; j < links.length; j++) {
      links[j].addEventListener('click', function(e) {
        e.preventDefault();
        navigate(this.getAttribute('data-page'));
      });
    }
  }

  // Update active nav state
  function updateNav(page) {
    var allLinks = document.querySelectorAll('.sidebar-nav a, .bottom-nav a');
    for (var i = 0; i < allLinks.length; i++) {
      allLinks[i].classList.remove('active');
    }
    var active = document.querySelectorAll('[data-page="' + page + '"]');
    for (var j = 0; j < active.length; j++) {
      active[j].classList.add('active');
    }

    // Update page title
    var titles = {};
    for (var k = 0; k < NAV_ITEMS.length; k++) {
      titles[NAV_ITEMS[k].id] = NAV_ITEMS[k].label;
    }
    document.getElementById('page-title').textContent = titles[page] || page;
  }

  // Navigate to a page
  function navigate(page) {
    if (currentPage === page) return;
    currentPage = page;
    window.location.hash = page;
    updateNav(page);
    renderPage(page);
  }

  // Render a page
  function renderPage(page) {
    var container = document.getElementById('page-content');

    // Show skeleton while loading
    container.innerHTML = '<div style="padding:1rem">' + UI.renderSkeleton(6) + '</div>';

    try {
      switch (page) {
        case 'dashboard':
          if (typeof Dashboard !== 'undefined' && Dashboard.render) Dashboard.render(container);
          else container.innerHTML = '<div class="empty-state"><h3>Module dashboard non disponible</h3></div>';
          break;
        case 'articles':
          if (typeof Articles !== 'undefined' && Articles.render) Articles.render(container);
          else container.innerHTML = '<div class="empty-state"><h3>Module articles non disponible</h3></div>';
          break;
        case 'mouvements':
          if (typeof Mouvements !== 'undefined' && Mouvements.render) Mouvements.render(container);
          else container.innerHTML = '<div class="empty-state"><h3>Module mouvements non disponible</h3></div>';
          break;
        case 'fournisseurs':
          if (typeof Fournisseurs !== 'undefined' && Fournisseurs.render) Fournisseurs.render(container);
          else container.innerHTML = '<div class="empty-state"><h3>Module fournisseurs non disponible</h3></div>';
          break;
        case 'commandes':
          if (typeof Commandes !== 'undefined' && Commandes.render) Commandes.render(container);
          else container.innerHTML = '<div class="empty-state"><h3>Module commandes non disponible</h3></div>';
          break;
        case 'rapports':
          if (typeof Rapports !== 'undefined' && Rapports.render) Rapports.render(container);
          else container.innerHTML = '<div class="empty-state"><h3>Module rapports non disponible</h3></div>';
          break;
        case 'parametres':
          if (typeof Parametres !== 'undefined' && Parametres.render) Parametres.render(container);
          else container.innerHTML = '<div class="empty-state"><h3>Module parametres non disponible</h3></div>';
          break;
        default:
          container.innerHTML = '<div class="empty-state"><h3>Page introuvable</h3></div>';
      }
    } catch (e) {
      container.innerHTML = '<div class="empty-state"><h3>Erreur</h3><p>' + UI.escapeHtml(e.message) + '</p></div>';
    }
  }

  // Show login screen
  function showLogin() {
    document.getElementById('login-screen').style.display = 'flex';
    document.getElementById('main-layout').style.display = 'none';
  }

  // Show main layout
  function showMain() {
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('main-layout').style.display = 'flex';
  }

  // Handle login form
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
          document.getElementById('sidebar-username').textContent = user.username;
          document.getElementById('sidebar-role').textContent = user.role;
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

  // Init logout
  function initLogout() {
    document.getElementById('logout-btn').addEventListener('click', function() {
      API.logout();
      user = null;
      currentPage = null;
      showLogin();
    });
  }

  // Init theme toggle
  function initTheme() {
    UI.initTheme();
    document.getElementById('theme-toggle').addEventListener('click', function() {
      UI.toggleTheme();
    });
  }

  // Init mobile menu toggle
  function initMenuToggle() {
    document.getElementById('menu-toggle').addEventListener('click', function() {
      var sidebar = document.getElementById('sidebar');
      if (sidebar.style.display === 'flex') {
        sidebar.style.display = 'none';
      } else {
        sidebar.style.display = 'flex';
        sidebar.style.position = 'fixed';
        sidebar.style.zIndex = '50';
      }
    });
  }

  // Handle hash changes
  function onHashChange() {
    var hash = window.location.hash.replace('#', '');
    if (!hash || !NAV_ITEMS.some(function(n) { return n.id === hash; })) {
      hash = 'dashboard';
    }

    if (!API.getToken()) {
      showLogin();
      return;
    }

    if (hash !== currentPage) {
      navigate(hash);
    }
  }

  // Init
  function init() {
    initLogin();
    initLogout();
    initTheme();
    initMenuToggle();
    window.addEventListener('hashchange', onHashChange);

    // Check if already authenticated
    if (API.getToken()) {
      var savedUser = localStorage.getItem('nizar_user');
      if (savedUser) {
        try {
          user = JSON.parse(savedUser);
          document.getElementById('sidebar-username').textContent = user.username;
          document.getElementById('sidebar-role').textContent = user.role;
          showMain();
          buildNav();
          onHashChange();
        } catch (e) {
          API.clearToken();
          showLogin();
        }
      } else {
        showLogin();
      }
    } else {
      showLogin();
    }
  }

  // Start app
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
