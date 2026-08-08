// services/pdf.js — Generation PDF des fiches de reception (une seule page A4)
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

const LOGO_PATH = path.join(__dirname, '..', 'public', 'logo.jpeg');
const OUTPUT_DIR = require('./paths').uploadDir;

// S'assurer que le dossier de sortie existe
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

// Constantes de mise en page A4 (595.28 x 841.89 pt)
const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 45;
const CONTENT_W = PAGE_W - 2 * MARGIN;

// Couleurs Nizar
const TEAL = '#0EA5A0';
const BLACK = '#1A1A1A';
const WHITE = '#FFFFFF';
const LIGHT_GRAY = '#F5F5F5';
const MEDIUM_GRAY = '#888888';

/**
 * Genere le PDF d'une fiche de sortie sur UNE SEULE page A4.
 * Modele repris de « FICHE DE SORTIE.pdf » : logo en haut a gauche, titre
 * centre, Date/Destination a droite, tableau (Articles / N° Souche / Quantite /
 * Unite), signatures et note en bas. Pour un carnet, la plage de numeros est
 * ecrite « debut - fin » dans la colonne N° Souche (jamais entre parentheses).
 * @param {Object} fiche - { reference, numero_facture, date_envoi, date_creation, localite_nom, localite_type, localite_pays, localite_service, destinataire }
 * @param {Array} lignes - [{ article_nom, quantite, numero_debut, numero_fin, unite }]
 * @returns {string} chemin du fichier PDF genere
 */
function generateFichePDF(fiche, lignes) {
  return new Promise((resolve, reject) => {
    // Nom de fichier avec suffixe aleatoire : les PDF ne sont pas enumerables sur le reseau
    const filename = 'fiche-' + fiche.reference.replace(/[^a-zA-Z0-9]/g, '-') + '-' + Date.now() + '.pdf';
    const filepath = path.join(OUTPUT_DIR, filename);
    const doc = new PDFDocument({ size: 'A4', margin: 0 });
    const stream = fs.createWriteStream(filepath);

    doc.pipe(stream);

    // Helper : ecrit un texte en bornant sa hauteur (height + ellipsis) pour que
    // pdfkit ne cree JAMAIS de page supplementaire, meme si le texte est long.
    function t(text, x, y, width, align, height) {
      var opts = { width: width, ellipsis: true };
      if (align) opts.align = align;
      if (height) opts.height = height;
      doc.text(String(text === null || text === undefined ? '' : text), x, y, opts);
    }

    const destFull = fiche.localite_nom +
      (fiche.localite_service ? ' — Siege' : (fiche.localite_type === 'international' ? ' — ' + (fiche.localite_pays || 'International') : ' — National'));

    // === LOGO (haut gauche) ===
    const logoSize = 88;
    try {
      if (fs.existsSync(LOGO_PATH)) {
        doc.image(LOGO_PATH, 58, 26, { width: logoSize, height: logoSize });
      }
    } catch (e) { /* logo non disponible */ }

    // === TITRES CENTRES ===
    doc.font('Helvetica-Bold').fillColor(BLACK);
    doc.fontSize(15);
    t('NIZAR TRANSPORT VOYAGEURS', 0, 60, PAGE_W, 'center', 20);
    doc.fontSize(25);
    t('BON DE RÉCEPTION', 0, 120, PAGE_W, 'center', 32);

    // Separateur sous le titre
    doc.moveTo(70, 155).lineTo(PAGE_W - 70, 155)
      .strokeColor('#D1D5DB').lineWidth(0.8).stroke();
    doc.strokeColor(BLACK).lineWidth(0.5);

    // === DATE / DESTINATION (droite) ===
    doc.fontSize(10).font('Helvetica-Bold').fillColor(BLACK);
    t('Date : ' + formatDate(fiche.date_envoi || fiche.date_creation), 398, 160, 190, 'left', 14);
    t('Destination : ' + destFull, 398, 180, 190, 'left', 14);

    // === TABLEAU DES ARTICLES ===
    // Colonnes du modele (A4 595.2 x 841.92 pt) — une ligne par article, sans ligne vide
    const colX = [70.8, 297.4, 429.6, 488.9];
    const colW = [226.6, 132.2, 59.3, 42];
    const headers = ['Articles', 'N° Souche', 'Quantité', 'Unité'];
    const HEADER_H = 17;
    const tableTop = 210;

    // Sous-seing et signatures fixes en bas de page
    const attestY = 510;
    const sigY = 630;
    const noteY = 750;
    const tableBottom = attestY - 5;
    const availableTableH = tableBottom - (tableTop + HEADER_H);
    // Hauteur de ligne : 21 pt comme le modele, reduite si beaucoup d'articles
    const rowH = lignes.length ? Math.min(21, Math.max(12, Math.floor(availableTableH / lignes.length))) : 21;

    // En-tete du tableau (fond noir, texte blanc)
    doc.rect(70.8, tableTop, 460.1, HEADER_H).fill(BLACK);
    doc.fillColor(WHITE).font('Helvetica-Bold').fontSize(8.5);
    for (let i = 0; i < headers.length; i++) {
      t(headers[i], colX[i] + 5, tableTop + 4, colW[i] - 10, i === 0 ? 'left' : 'center', 12);
    }
    doc.fillColor(BLACK);

    // Lignes (hauteur adaptee ; troncature si vraiment trop de lignes)
    let rowY = tableTop + HEADER_H;
    const fontRow = rowH >= 19 ? 8.5 : 7.5;
    const maxRows = Math.floor(availableTableH / 12);
    let truncated = false;

    for (let i = 0; i < lignes.length; i++) {
      if (i >= maxRows) { truncated = true; break; }
      const l = lignes[i];
      if (i % 2 === 0) {
        doc.rect(70.8, rowY, 460.1, rowH).fill(LIGHT_GRAY);
        doc.fillColor(BLACK);
      }
      doc.font('Helvetica').fontSize(fontRow);
      t(l.article_nom, colX[0] + 5, rowY + 3, colW[0] - 10, 'left', rowH - 4);
      // Plage de numeros : « debut - fin » (carnet), sinon un tiret
      const plage = (l.numero_debut && l.numero_fin) ? (String(l.numero_debut) + ' - ' + String(l.numero_fin)) : '-';
      t(plage, colX[1] + 5, rowY + 3, colW[1] - 10, 'center', rowH - 4);
      t(String(l.quantite), colX[2] + 5, rowY + 3, colW[2] - 10, 'center', rowH - 4);
      t(uniteLabel(l.unite), colX[3] + 5, rowY + 3, colW[3] - 10, 'center', rowH - 4);
      rowY += rowH;
    }

    if (truncated) {
      doc.fontSize(7.5).font('Helvetica').fillColor(MEDIUM_GRAY);
      t('… (' + (lignes.length - maxRows) + ' article(s) supplementaires — liste complete dans le systeme)', 70.8, rowY + 3, 460, 'left', 12);
    }

    // === SOUS-SEING (attestation de reception) ===
    doc.font('Helvetica').fillColor(BLACK);
    doc.fontSize(10);
    t('Je soussigné, atteste avoir reçu l\'ensemble des articles listés ci-dessus, en bon état apparent et conformes à la demande.', 71, attestY, 460, 'left', 30);

    // === SIGNATURES ===
    // Gestionnaire de stock (gauche)
    doc.fontSize(9).font('Helvetica-Bold').fillColor(BLACK);
    t('GESTIONNAIRE DE STOCK', 71, sigY, 210, 'left', 14);
    doc.moveTo(71, sigY + 30).lineTo(281, sigY + 30).strokeColor(BLACK).lineWidth(0.5).stroke();

    // Date et signature a la reception (droite)
    t('DATE ET SIGNATURE À LA RÉCEPTION', 308, sigY, 225, 'left', 14);
    doc.moveTo(308, sigY + 30).lineTo(533, sigY + 30).strokeColor(BLACK).lineWidth(0.5).stroke();
    doc.strokeColor(BLACK).lineWidth(0.5);

    // === NOTE IMPORTANTE ===
    doc.fontSize(9.5).font('Helvetica-Bold').fillColor(BLACK);
    t('NB : A renvoyer au service stock dès signature', 0, noteY, PAGE_W, 'center', 14);

    doc.end();

    stream.on('finish', () => resolve('/uploads/' + filename));
    stream.on('error', reject);
  });
}

// Libelle d'unite pour le PDF (meme rendu que l'UI)
function uniteLabel(u) {
  const map = {
    'unite': 'Unité', 'piece': 'Unité', 'carton': 'Carton', 'lot': 'Lot',
    'rouleau': 'Rouleau', 'paquet': 'Paquet', 'boite': 'Boîte',
    'flacon': 'Flacon', 'ramette': 'Ramette'
  };
  return map[(u || '').toLowerCase()] || (u || '');
}

/**
 * Genere un PDF « Etat du stock » et le streame directement dans la reponse HTTP.
 * @param {Array} articles - [{ reference, nom, stock_actuel, stock_min, prix_unitaire, fournisseur }]
 * @param {Object} res - reponse Express (Content-Type et Content-Disposition a positionner avant)
 */
function generateStockPDF(articles, res) {
  const doc = new PDFDocument({ size: 'A4', margin: MARGIN });
  doc.pipe(res);

  // === EN-TETE : LOGO + TITRE ===
  const logoSize = 44;
  let hasLogo = false;
  try {
    if (fs.existsSync(LOGO_PATH)) {
      doc.image(LOGO_PATH, MARGIN, MARGIN, { width: logoSize, height: logoSize });
      hasLogo = true;
    }
  } catch (e) { /* logo non disponible */ }

  const titleX = hasLogo ? MARGIN + logoSize + 14 : MARGIN;

  doc.fontSize(10).font('Helvetica-Bold').fillColor(BLACK);
  doc.text('NIZAR TRANSPORT VOYAGEUR', titleX, MARGIN + 2, { align: 'left' });
  doc.fontSize(17).font('Helvetica-Bold').fillColor(TEAL);
  doc.text('ETAT DU STOCK', titleX, MARGIN + 17, { align: 'left' });

  doc.fontSize(8).font('Helvetica').fillColor(MEDIUM_GRAY);
  doc.text('Généré le ' + new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }), titleX, MARGIN + 40, { align: 'left' });

  const sepY = MARGIN + logoSize + 8;
  doc.moveTo(MARGIN, sepY).lineTo(PAGE_W - MARGIN, sepY)
    .strokeColor(TEAL).lineWidth(2).stroke();
  doc.strokeColor(BLACK).lineWidth(0.5);

  // === TABLEAU DES ARTICLES ===
  const colW = [70, 100, 40, 40, 65, 100, 70];
  const colX = [MARGIN, MARGIN + 70, MARGIN + 170, MARGIN + 210, MARGIN + 250, MARGIN + 315, MARGIN + 415];
  const headers = ['Reference', 'Nom', 'Stock', 'Min', 'Statut', 'Fournisseur', 'Valeur'];
  const HEADER_H = 20;
  const tableTop = sepY + 22;
  const maxBottom = PAGE_H - 100;

  function drawHeader(y) {
    doc.rect(MARGIN, y, CONTENT_W, HEADER_H).fill(BLACK);
    doc.fillColor(WHITE).font('Helvetica-Bold').fontSize(8);
    for (let i = 0; i < headers.length; i++) {
      doc.text(headers[i], colX[i] + 3, y + 5, { width: colW[i] - 6, align: i === 0 || i === 1 || i === 5 ? 'left' : 'center' });
    }
    doc.fillColor(BLACK);
  }

  drawHeader(tableTop);

  let rowY = tableTop + HEADER_H;
  let totalValeur = 0;

  for (let i = 0; i < articles.length; i++) {
    const a = articles[i];
    const statut = a.stock_actuel <= 0 ? 'RUPTURE' : (a.stock_actuel <= a.stock_min ? 'ALERTE' : 'OK');
    const valeur = (a.prix_unitaire || 0) * (a.stock_actuel || 0);
    totalValeur += valeur;

    if (rowY + 20 > maxBottom) {
      doc.addPage();
      rowY = MARGIN + 10;
      drawHeader(rowY);
      rowY += HEADER_H;
    }

    if (i % 2 === 0) {
      doc.rect(MARGIN, rowY, CONTENT_W, 20).fill(LIGHT_GRAY);
      doc.fillColor(BLACK);
    }

    doc.font('Helvetica').fontSize(8);
    doc.text(a.reference || '-', colX[0] + 3, rowY + 2, { width: colW[0] - 6 });
    doc.text(a.nom || '-', colX[1] + 3, rowY + 2, { width: colW[1] - 6, ellipsis: true, height: 16 });
    doc.text(String(a.stock_actuel), colX[2] + 3, rowY + 2, { width: colW[2] - 6, align: 'center' });
    doc.text(String(a.stock_min), colX[3] + 3, rowY + 2, { width: colW[3] - 6, align: 'center' });
    doc.font('Helvetica-Bold').fontSize(7.5);
    doc.fillColor(statut === 'RUPTURE' ? '#DC2626' : (statut === 'ALERTE' ? '#D97706' : '#16A34A'));
    doc.text(statut, colX[4] + 3, rowY + 2, { width: colW[4] - 6, align: 'center' });
    doc.fillColor(BLACK).font('Helvetica').fontSize(8);
    doc.text(a.fournisseur || '-', colX[5] + 3, rowY + 2, { width: colW[5] - 6, ellipsis: true, height: 16 });
    doc.text(formatFCFA(valeur), colX[6] + 3, rowY + 2, { width: colW[6] - 6, align: 'center' });

    rowY += 20;
  }

  // === TOTAL ===
  let totalY = rowY + 10;
  if (totalY + 36 > PAGE_H - 30) { totalY = PAGE_H - 90; }
  doc.moveTo(MARGIN, totalY).lineTo(PAGE_W - MARGIN, totalY)
    .strokeColor('#E5E5E5').lineWidth(0.5).stroke();
  doc.strokeColor(BLACK).lineWidth(0.5);
  doc.font('Helvetica-Bold').fontSize(9).fillColor(BLACK);
  doc.text('VALEUR TOTALE DU STOCK', MARGIN, totalY + 7, { width: 300 });
  doc.fillColor(TEAL);
  doc.text(formatFCFA(totalValeur), colX[6], totalY + 7, { width: colW[6], align: 'center' });

  // === PIED DE PAGE ===
  doc.fillColor(MEDIUM_GRAY).fontSize(7).font('Helvetica');
  doc.text('Nizar Stock — Nizar Transport Voyageur — Document généré le ' +
    new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }), MARGIN, PAGE_H - 35, { align: 'center', width: CONTENT_W });

  doc.rect(MARGIN - 5, MARGIN - 5, CONTENT_W + 10, PAGE_H - 2 * MARGIN + 10)
    .strokeColor(TEAL).lineWidth(0.5).opacity(0.3).stroke();
  doc.opacity(1);

  doc.end();
}

function formatFCFA(n) {
  return Number(n || 0).toLocaleString('fr-FR');
}

function formatDate(isoStr) {
  if (!isoStr) return '-';
  const d = new Date(isoStr);
  if (isNaN(d.getTime())) return isoStr;
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

module.exports = { generateFichePDF, generateStockPDF };
