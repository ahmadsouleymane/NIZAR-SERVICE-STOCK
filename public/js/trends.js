// public/js/trends.js — Widget tendance entrées/sorties (14 jours) pour le tableau de bord
// Graphique SVG dessiné à la main (aucune librairie), inséré sous les KPI du dashboard.
var TrendsWidget = {

  render: function(container) {
    var card = document.createElement('div');
    card.className = 'card';
    card.innerHTML =
      '<div class="card-header" style="flex-wrap:wrap">' +
      '<h3 class="card-title">Entrées / Sorties — 14 derniers jours</h3>' +
      '<div style="display:flex;align-items:center;gap:0.75rem;font-size:0.75rem;color:var(--color-primary)">' +
      '<span style="display:inline-flex;align-items:center;gap:0.3rem"><span style="width:10px;height:10px;border-radius:2px;background:#0EA5A0;display:inline-block"></span>Entrées</span>' +
      '<span style="display:inline-flex;align-items:center;gap:0.3rem"><span style="width:10px;height:10px;border-radius:2px;background:#1A1A1A;display:inline-block"></span>Sorties</span>' +
      '</div></div>' +
      '<div id="trends-chart" style="width:100%">' + UI.renderSkeleton(3) + '</div>';

    // Insérer sous la grille KPI (après le render synchrone du dashboard)
    var kpi = document.getElementById('kpi-grid');
    if (kpi && kpi.parentNode) kpi.parentNode.insertBefore(card, kpi.nextSibling);
    else container.appendChild(card);

    API.getTrends()
      .then(function(data) {
        var el = document.getElementById('trends-chart');
        if (el) TrendsWidget._draw(el, data.jours || []);
      })
      .catch(function(err) {
        var el = document.getElementById('trends-chart');
        if (el) el.innerHTML = '<div class="empty-state"><p>' + UI.escapeHtml(err.message) + '</p></div>';
      });
  },

  _draw: function(el, jours) {
    if (!jours || !jours.length) {
      el.innerHTML = '<div class="empty-state"><p>Aucune donnée de mouvement.</p></div>';
      return;
    }

    var W = 700, H = 230;
    var padL = 34, padR = 8, padT = 12, padB = 24;
    var cw = W - padL - padR;
    var ch = H - padT - padB;

    var maxVal = 1;
    for (var i = 0; i < jours.length; i++) {
      if (jours[i].entrees > maxVal) maxVal = jours[i].entrees;
      if (jours[i].sorties > maxVal) maxVal = jours[i].sorties;
    }

    var groupW = cw / jours.length;
    var gap = 2;
    var barW = Math.max(3, Math.min(13, groupW * 0.30 - gap));

    var s = '';
    s += '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" style="display:block;max-width:100%;height:auto" role="img" aria-label="Graphique des entrees et sorties sur 14 jours">';

    // Grille horizontale + labels de valeurs
    var gridLines = 4;
    for (var g = 0; g <= gridLines; g++) {
      var y = padT + ch - (ch * g / gridLines);
      var val = Math.round(maxVal * g / gridLines);
      s += '<line x1="' + padL + '" y1="' + y + '" x2="' + (W - padR) + '" y2="' + y + '" stroke="#E5E7EB" stroke-width="1"/>';
      s += '<text x="' + (padL - 6) + '" y="' + (y + 4) + '" text-anchor="end" font-size="10" fill="#6B7280">' + val + '</text>';
    }

    // Barres groupées (entrée + sortie) + labels de dates espacés
    var labelStep = Math.max(1, Math.ceil(jours.length / 7));
    for (var i = 0; i < jours.length; i++) {
      var d = jours[i];
      var x = padL + i * groupW + (groupW - (barW * 2 + gap)) / 2;
      var hE = (d.entrees / maxVal) * ch;
      var hS = (d.sorties / maxVal) * ch;
      var base = padT + ch;

      if (hE > 0) s += '<rect x="' + x + '" y="' + (base - hE) + '" width="' + barW + '" height="' + hE + '" fill="#0EA5A0" rx="2"/>';
      if (hS > 0) s += '<rect x="' + (x + barW + gap) + '" y="' + (base - hS) + '" width="' + barW + '" height="' + hS + '" fill="#1A1A1A" rx="2"/>';

      if (i % labelStep === 0) {
        s += '<text x="' + (x + barW + gap / 2) + '" y="' + (base + 15) + '" text-anchor="middle" font-size="9" fill="#6B7280">' + TrendsWidget._shortLabel(d.date) + '</text>';
      }
    }

    s += '</svg>';
    el.innerHTML = s;
  },

  _shortLabel: function(iso) {
    var parts = String(iso).split('-');
    if (parts.length !== 3) return iso;
    return parts[2] + '/' + parts[1];
  }
};
