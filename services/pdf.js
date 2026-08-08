// services/pdf.js — Generation PDF des bons de reception et de l'etat du stock
const PDFDocument = require('pdfkit');
const { PDFDocument: PDFLibDocument, StandardFonts, rgb } = require('pdf-lib');
const fs = require('fs');
const path = require('path');

const LOGO_PATH = path.join(__dirname, '..', 'public', 'logo.jpeg');
const OUTPUT_DIR = require('./paths').uploadDir;

// Modele officiel « Bon de reception » fourni par le gestionnaire de stock :
// on charge ce PDF tel quel et on y superpose les donnees (une ligne par article).
const MODEL_PATH = path.join(__dirname, 'modeles', 'bon-de-reception.pdf');

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
 * Genere le PDF d'un bon de reception en chargeant LE MODELE OFFICIEL
 * (services/modeles/bon-de-reception.pdf) et en y superposant les donnees :
 * date, destination, et une ligne par article (Articles / N° Souche / Quantite /
 * Unite). Le sous-seing, les signatures et la note du modele restent intacts.
 * @param {Object} fiche - { reference, date_envoi, date_creation, localite_nom, localite_type, localite_pays, localite_service }
 * @param {Array} lignes - [{ article_nom, quantite, numero_debut, numero_fin, unite }]
 * @returns {string} chemin du fichier PDF genere
 */
function generateFichePDF(fiche, lignes) {
  return new Promise((resolve, reject) => {
    (async () => {
      try {
        // Charger le modele officiel
        const modelBytes = fs.readFileSync(MODEL_PATH);
        const pdfDoc = await PDFLibDocument.load(modelBytes);
        const page = pdfDoc.getPage(0);
        const { height } = page.getSize(); // 841.92 pt pour A4

        const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
        const color = rgb(0.12, 0.12, 0.12);
        const grey = rgb(0.45, 0.45, 0.45);

        // Position du haut de ligne (top-down du modele) -> baseline pdf-lib
        const base = (topY, size) => height - topY - size * 0.72;

        const destFull = fiche.localite_nom || '';

        // === N° (référence de la fiche) : remplace « 000 » du modele ===
        // On couvre UNIQUEMENT l'ancien « 000 » (sans toucher au « ° » de « N° »)
        page.drawRectangle({ x: 296, y: height - 133, width: 20, height: 15, color: rgb(1, 1, 1) });
        page.drawText(fiche.reference || '', {
          x: 299, y: base(122, 9.5), size: 9.5, font, color
        });

        // === DATE / DESTINATION (alignés sur les libellés du modele) ===
        page.drawText(formatDate(fiche.date_envoi || fiche.date_creation), {
          x: 432, y: base(186, 10), size: 10, font, color
        });
        page.drawText(destFull, {
          x: 462, y: base(210, 9.5), size: 9.5, font, color
        });

        // === TABLEAU : UNE ligne par article (aucune ligne vide) ===
        // Positions des 12 lignes de la grille du modele (sous l'en-tete)
        const ROW_SEPS = [266.7, 287.6, 308.8, 330.1, 351.3, 372.5, 393.8, 415.0, 435.9, 457.1, 478.4, 499.6];
        const TABLE_LEFT = 70.8;
        const TABLE_W = 460.1;
        const PITCH = 21;
        const firstRowTop = 255;   // centre de la premiere ligne du tableau
        const filled = Math.min(lignes.length, ROW_SEPS.length);
        const whiteColor = rgb(1, 1, 1);

        for (let i = 0; i < filled; i++) {
          const l = lignes[i];
          const y = base(firstRowTop + i * PITCH, 9.5);

          page.drawText(String(l.article_nom || ''), {
            x: TABLE_LEFT + 4, y, size: 9.5, font, color, maxWidth: 215
          });
          // Plage de numeros : « debut - fin » (carnet), sinon un tiret
          const plage = (l.numero_debut && l.numero_fin) ? (String(l.numero_debut) + ' - ' + String(l.numero_fin)) : '-';
          page.drawText(plage, {
            x: 363 - font.widthOfTextAtSize(plage, 9.5) / 2, y, size: 9.5, font, color
          });
          const q = String(l.quantite);
          page.drawText(q, {
            x: 459 - font.widthOfTextAtSize(q, 9.5) / 2, y, size: 9.5, font, color
          });
          const u = uniteLabel(l.unite);
          page.drawText(u, {
            x: 510 - font.widthOfTextAtSize(u, 9.5) / 2, y, size: 9.5, font, color
          });
        }

        // === Masquer TOUS les tracés sous la derniere ligne remplie ===
        // (lignes horizontales ET verticales de la grille vide du modele)
        if (filled > 0 && filled < ROW_SEPS.length) {
          const lastRowBottom = ROW_SEPS[filled - 1];              // bas de la derniere ligne remplie (a garder)
          const gridBottom = ROW_SEPS[ROW_SEPS.length - 1] + 4;    // bas de la grille du modele + marge
          page.drawRectangle({
            x: TABLE_LEFT - 2, y: height - gridBottom,
            width: TABLE_W + 4, height: gridBottom - (lastRowBottom + 1),
            color: whiteColor
          });
        }

        if (lignes.length > ROW_SEPS.length) {
          page.drawText('… ' + (lignes.length - ROW_SEPS.length) + ' article(s) supplementaires (liste complete dans le systeme)', {
            x: TABLE_LEFT + 4, y: base(505, 8), size: 8, font, color: grey
          });
        }

        // === Enregistrement ===
        const pdfBytes = await pdfDoc.save();
        const filename = 'fiche-' + fiche.reference.replace(/[^a-zA-Z0-9]/g, '-') + '-' + Date.now() + '.pdf';
        const filepath = path.join(OUTPUT_DIR, filename);
        fs.writeFileSync(filepath, pdfBytes);
        resolve('/uploads/' + filename);
      } catch (err) {
        reject(err);
      }
    })();
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
