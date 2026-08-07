// services/pdf.js — Generation PDF des fiches de reception (une seule page A4)
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

const LOGO_PATH = path.join(__dirname, '..', 'public', 'logo.jpeg');
const OUTPUT_DIR = path.join(__dirname, '..', 'public', 'uploads');

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
 * Genere le PDF d'une fiche de reception sur UNE SEULE page A4.
 * Le tableau s'adapte au nombre d'articles (hauteur de ligne calculee) et
 * les signatures restent fixees en bas de page. Aucune page supplementaire.
 * @param {Object} fiche - { reference, numero_facture, date_envoi, date_creation, localite_nom, localite_type, localite_pays, localite_service, destinataire }
 * @param {Array} lignes - [{ article_nom, quantite, numero_debut, numero_fin, unite }]
 * @returns {string} chemin du fichier PDF genere
 */
function generateFichePDF(fiche, lignes) {
  return new Promise((resolve, reject) => {
    const filename = 'fiche-' + fiche.reference.replace(/[^a-zA-Z0-9]/g, '-') + '.pdf';
    const filepath = path.join(OUTPUT_DIR, filename);
    const doc = new PDFDocument({ size: 'A4', margin: MARGIN });
    const stream = fs.createWriteStream(filepath);

    doc.pipe(stream);

    // Helper : ecrit un texte en bornant sa hauteur (height + ellipsis) pour que
    // pdfkit ne cree JAMAIS de page supplementaire, meme si le texte est long.
    function t(text, x, y, width, align, height) {
      var opts = { width: width, ellipsis: true };
      if (align) opts.align = align;
      if (height) opts.height = height;
      doc.text(String(text === null || text === undefined ? '-' : text), x, y, opts);
    }

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
    t('NIZAR TRANSPORT VOYAGEUR', titleX, MARGIN + 2, CONTENT_W, 'left', 14);
    doc.fontSize(17).font('Helvetica-Bold').fillColor(TEAL);
    t('FICHE DE RECEPTION', titleX, MARGIN + 17, CONTENT_W, 'left', 22);

    const sepY = MARGIN + logoSize + 8;
    doc.moveTo(MARGIN, sepY).lineTo(PAGE_W - MARGIN, sepY)
      .strokeColor(TEAL).lineWidth(2).stroke();
    doc.strokeColor(BLACK).lineWidth(0.5);

    // === BLOC INFORMATIONS ===
    const infoY = sepY + 14;
    const infoValX = MARGIN + 100;
    const rightValX = PAGE_W - MARGIN - 75;

    doc.fontSize(8).font('Helvetica-Bold').fillColor(BLACK);
    t('REFERENCE', MARGIN, infoY, 80, 'left', 12);
    t('DESTINATION', MARGIN, infoY + 19, 80, 'left', 12);
    t('DATE', PAGE_W - MARGIN - 150, infoY, 70, 'left', 12);
    t('N° FACTURE', PAGE_W - MARGIN - 150, infoY + 19, 70, 'left', 12);
    t('DESTINATAIRE', PAGE_W - MARGIN - 150, infoY + 38, 70, 'left', 12);

    doc.font('Helvetica').fontSize(9);
    t(fiche.reference, infoValX, infoY, 200, 'left', 14);
    const destFull = fiche.localite_nom +
      (fiche.localite_service ? ' — Siege' : (fiche.localite_type === 'international' ? ' — ' + (fiche.localite_pays || 'International') : ' — National'));
    t(destFull, infoValX, infoY + 19, 220, 'left', 14);
    t(formatDate(fiche.date_envoi || fiche.date_creation), rightValX, infoY, 110, 'left', 14);
    t(fiche.numero_facture, rightValX, infoY + 19, 110, 'left', 14);
    t(fiche.destinataire, rightValX, infoY + 38, 110, 'left', 14);

    // === TABLEAU DES ARTICLES (tient TOUJOURS sur la page) ===
    const sigY = PAGE_H - 158; // signatures fixees en bas de page
    const tableTop = infoY + 60;
    const availableTableH = sigY - tableTop - 32;
    const rowH = lignes.length ? Math.max(14, Math.min(21, availableTableH / lignes.length)) : 21;

    const colW = [
      CONTENT_W * 0.38,  // Article
      CONTENT_W * 0.18,  // N° debut
      CONTENT_W * 0.18,  // N° fin
      CONTENT_W * 0.11,  // Qte
      CONTENT_W * 0.15   // Unite
    ];
    const colX = [
      MARGIN,
      MARGIN + colW[0],
      MARGIN + colW[0] + colW[1],
      MARGIN + colW[0] + colW[1] + colW[2],
      MARGIN + colW[0] + colW[1] + colW[2] + colW[3]
    ];
    const headers = ['Article', 'N° debut', 'N° fin', 'Qte', 'Unite'];
    const HEADER_H = 18;

    // En-tete du tableau
    doc.rect(MARGIN, tableTop, CONTENT_W, HEADER_H).fill(BLACK);
    doc.fillColor(WHITE).font('Helvetica-Bold').fontSize(8);
    for (let i = 0; i < headers.length; i++) {
      t(headers[i], colX[i] + 4, tableTop + 4, colW[i] - 8, i >= 3 ? 'center' : 'left', 12);
    }
    doc.fillColor(BLACK);

    // Lignes (hauteur adaptee ; troncature si vraiment trop de lignes pour rester lisible)
    let rowY = tableTop + HEADER_H;
    const fontRow = rowH >= 19 ? 8.5 : 7.5;
    const maxRows = Math.floor(availableTableH / 13);
    let truncated = false;

    for (let i = 0; i < lignes.length; i++) {
      if (i >= maxRows) { truncated = true; break; }
      const l = lignes[i];
      if (i % 2 === 0) {
        doc.rect(MARGIN, rowY, CONTENT_W, rowH).fill(LIGHT_GRAY);
        doc.fillColor(BLACK);
      }
      doc.font('Helvetica').fontSize(fontRow);
      t(l.article_nom, colX[0] + 4, rowY + 3, colW[0] - 8, 'left', rowH - 4);
      t(l.numero_debut, colX[1] + 4, rowY + 3, colW[1] - 8, 'center', rowH - 4);
      t(l.numero_fin, colX[2] + 4, rowY + 3, colW[2] - 8, 'center', rowH - 4);
      t(String(l.quantite), colX[3] + 4, rowY + 3, colW[3] - 8, 'center', rowH - 4);
      t(l.unite || 'piece', colX[4] + 4, rowY + 3, colW[4] - 8, 'center', rowH - 4);
      rowY += rowH;
    }

    if (truncated) {
      doc.fontSize(7.5).font('Helvetica').fillColor(MEDIUM_GRAY);
      t('… (' + (lignes.length - maxRows) + ' article(s) supplementaires — liste complete dans le systeme)', MARGIN, rowY + 3, CONTENT_W, 'left', 12);
    }

    // === SIGNATURES (fixees en bas, meme page) ===
    doc.moveTo(MARGIN, sigY - 8).lineTo(PAGE_W - MARGIN, sigY - 8)
      .strokeColor('#E5E5E5').lineWidth(0.5).stroke();
    doc.strokeColor(BLACK).lineWidth(0.5);

    // Gestionnaire de stock (gauche)
    doc.moveTo(MARGIN + 30, sigY + 38).lineTo(MARGIN + 220, sigY + 38).stroke();
    doc.fontSize(10).font('Helvetica-Bold').fillColor(BLACK);
    t('Gestionnaire de stock', MARGIN + 30, sigY + 44, 190, 'center', 14);
    doc.fontSize(8).font('Helvetica').fillColor(MEDIUM_GRAY);
    t('Cachet et signature', MARGIN + 30, sigY + 60, 190, 'center', 12);

    // Chef d'agence (droite)
    doc.fillColor(BLACK);
    doc.moveTo(PAGE_W - MARGIN - 220, sigY + 38).lineTo(PAGE_W - MARGIN - 30, sigY + 38).stroke();
    doc.fontSize(10).font('Helvetica-Bold');
    t('Chef d\'agence', PAGE_W - MARGIN - 220, sigY + 44, 190, 'center', 14);
    doc.fontSize(8).font('Helvetica').fillColor(MEDIUM_GRAY);
    t('Date et signature à la réception', PAGE_W - MARGIN - 220, sigY + 60, 190, 'center', 12);

    // === NOTE IMPORTANTE ===
    doc.fillColor(TEAL);
    doc.fontSize(8.5).font('Helvetica-Bold');
    t('NB : A renvoyer au service stock dès réception', MARGIN, sigY + 92, CONTENT_W, 'center', 14);

    // === PIED DE PAGE ===
    doc.fillColor(MEDIUM_GRAY).fontSize(7).font('Helvetica');
    t('Nizar Stock — Nizar Transport Voyageur — Document généré le ' +
      new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }),
      MARGIN, PAGE_H - 30, CONTENT_W, 'center', 12);

    // === BORDURE (une seule page) ===
    doc.rect(MARGIN - 5, MARGIN - 5, CONTENT_W + 10, PAGE_H - 2 * MARGIN + 10)
      .strokeColor(TEAL).lineWidth(0.5).opacity(0.3).stroke();
    doc.opacity(1);

    doc.end();

    stream.on('finish', () => resolve('/uploads/' + filename));
    stream.on('error', reject);
  });
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
