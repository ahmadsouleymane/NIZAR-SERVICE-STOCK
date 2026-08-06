// services/pdf.js — Generation PDF des fiches de reception (version professionnelle)
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
 * Calcule la hauteur necessaire pour une cellule de tableau
 */
function cellHeight(doc, text, width, fontSize) {
  if (!text) text = '-';
  // Mesurer avec la police standard
  doc.font('Helvetica').fontSize(fontSize);
  const h = doc.heightOfString(String(text), { width: width - 6 });
  return Math.max(h + 6, 20); // Minimum 20pt par ligne
}

/**
 * Genere un PDF pour une fiche de reception
 * @param {Object} fiche - { reference, date_envoi, localite_nom, localite_type, localite_pays, notes }
 * @param {Array} lignes - [{ article_nom, quantite, numero_debut, numero_fin, unite }]
 * @returns {string} chemin du fichier PDF genere
 */
function generateFichePDF(fiche, lignes) {
  return new Promise((resolve, reject) => {
    const filename = 'fiche-' + fiche.reference.replace(/[^a-zA-Z0-9]/g, '-') + '.pdf';
    const filepath = path.join(OUTPUT_DIR, filename);
    const doc = new PDFDocument({
      size: 'A4',
      margin: MARGIN,
      bufferPages: true
    });
    const stream = fs.createWriteStream(filepath);

    doc.pipe(stream);

    // === EN-TETE : LOGO + TITRE ===
    const logoSize = 50;
    let logoY = MARGIN;
    let hasLogo = false;

    try {
      if (fs.existsSync(LOGO_PATH)) {
        doc.image(LOGO_PATH, MARGIN, MARGIN, { width: logoSize, height: logoSize });
        hasLogo = true;
      }
    } catch (e) { /* logo non disponible */ }

    const titleX = hasLogo ? MARGIN + logoSize + 15 : MARGIN;

    // Nom de la societe (plus petit que le titre)
    doc.fontSize(11).font('Helvetica-Bold').fillColor(BLACK);
    doc.text('NIZAR TRANSPORT VOYAGEUR', titleX, MARGIN + 4, { align: 'left' });

    // Titre principal — l'element le plus visible
    doc.fontSize(20).font('Helvetica-Bold').fillColor(TEAL);
    doc.text('FICHE DE RECEPTION', titleX, MARGIN + 22, { align: 'left' });

    // Ligne de separation
    const sepY = MARGIN + logoSize + 12;
    doc.moveTo(MARGIN, sepY).lineTo(PAGE_W - MARGIN, sepY)
      .strokeColor(TEAL).lineWidth(2).stroke();
    doc.strokeColor(BLACK).lineWidth(0.5);

    // === BLOC INFORMATIONS ===
    const infoY = sepY + 20;

    // Colonne gauche : Reference + Destination
    doc.fontSize(9).font('Helvetica-Bold').fillColor(BLACK);
    doc.text('REFERENCE', MARGIN, infoY);
    doc.text('DESTINATION', MARGIN, infoY + 22);

    doc.font('Helvetica').fontSize(10);
    doc.text(fiche.reference || '-', MARGIN + 95, infoY, { width: 150 });
    const destFull = fiche.localite_nom +
      (fiche.localite_type === 'international' ? ' — ' + (fiche.localite_pays || 'International') : ' — National');
    doc.text(destFull, MARGIN + 95, infoY + 22, { width: 200 });

    // Colonne droite : Date
    doc.fontSize(9).font('Helvetica-Bold');
    doc.text('DATE', PAGE_W - MARGIN - 120, infoY);
    doc.font('Helvetica').fontSize(10);
    doc.text(formatDate(fiche.date_envoi || fiche.date_creation), PAGE_W - MARGIN - 120, infoY);

    // Notes (si presentes)
    let notesHeight = 0;
    if (fiche.notes && fiche.notes.trim()) {
      notesHeight = doc.heightOfString(fiche.notes, { width: CONTENT_W - 95 }) + 14;
      doc.fontSize(9).font('Helvetica-Bold');
      doc.text('NOTES', MARGIN, infoY + 44);
      doc.font('Helvetica').fontSize(9).fillColor('#555555');
      doc.text(fiche.notes.trim(), MARGIN + 95, infoY + 44, {
        width: CONTENT_W - 95,
        lineGap: 2
      });
      doc.fillColor(BLACK);
    }

    // === TABLEAU DES ARTICLES ===
    const tableTop = infoY + 44 + notesHeight + 16;
    const maxTableBottom = PAGE_H - 130; // Garder la place pour signatures + note + pied

    // Largeurs des colonnes (5 colonnes : Article | N° debut | N° fin | Qte | Unite)
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

    const headers = ['Article', 'N° debut', 'N° fin', 'Quantite', 'Unite'];
    const HEADER_H = 22;

    // Fonction pour dessiner l'en-tete du tableau
    function drawTableHeader(y) {
      doc.rect(MARGIN, y, CONTENT_W, HEADER_H).fill(BLACK);
      doc.fillColor(WHITE).font('Helvetica-Bold').fontSize(9);
      for (let i = 0; i < headers.length; i++) {
        doc.text(headers[i], colX[i] + 4, y + 5, {
          width: colW[i] - 8,
          align: i >= 3 ? 'center' : 'left'
        });
      }
      doc.fillColor(BLACK);
    }

    // En-tete du tableau
    drawTableHeader(tableTop);

    // Lignes du tableau
    let rowY = tableTop + HEADER_H;
    let currentPage = 1;

    for (let i = 0; i < lignes.length; i++) {
      const l = lignes[i];

      // Verifier si on doit changer de page
      if (rowY + 20 > maxTableBottom) {
        doc.addPage();
        currentPage++;
        rowY = MARGIN + 10;

        // Repeter l'en-tete du tableau
        drawTableHeader(rowY);
        rowY += HEADER_H;
      }

      // Fond alterne
      if (i % 2 === 0) {
        doc.rect(MARGIN, rowY, CONTENT_W, 22).fill(LIGHT_GRAY);
        doc.fillColor(BLACK);
      }

      doc.font('Helvetica').fontSize(8.5);

      // Article (peut etre long, tronque a 2 lignes max)
      const artText = l.article_nom || '-';
      doc.text(artText, colX[0] + 4, rowY + 3, {
        width: colW[0] - 8,
        height: 18,
        ellipsis: true
      });

      // N° debut
      doc.text(l.numero_debut || '-', colX[1] + 4, rowY + 3, {
        width: colW[1] - 8,
        align: 'center'
      });

      // N° fin
      doc.text(l.numero_fin || '-', colX[2] + 4, rowY + 3, {
        width: colW[2] - 8,
        align: 'center'
      });

      // Quantite
      doc.text(String(l.quantite), colX[3] + 4, rowY + 3, {
        width: colW[3] - 8,
        align: 'center'
      });

      // Unite
      doc.text(l.unite || 'piece', colX[4] + 4, rowY + 3, {
        width: colW[4] - 8,
        align: 'center'
      });

      rowY += 22;
    }

    // === SIGNATURES ===
    // S'assurer qu'il y a assez de place pour le bloc signatures
    const minSigY = rowY + 25;
    const sigY = Math.max(minSigY, PAGE_H - 170);

    // Verifier si on doit changer de page
    if (sigY + 80 > PAGE_H - 30) {
      doc.addPage();
      currentPage++;
      rowY = MARGIN + 10;
    }

    const finalSigY = currentPage > 1 ? MARGIN + 40 : sigY;

    // Ligne de separation avant signatures
    doc.moveTo(MARGIN, finalSigY - 10).lineTo(PAGE_W - MARGIN, finalSigY - 10)
      .strokeColor('#E5E5E5').lineWidth(0.5).stroke();
    doc.strokeColor(BLACK).lineWidth(0.5);

    // Gestionnaire de stock (gauche)
    doc.moveTo(MARGIN + 30, finalSigY + 40).lineTo(MARGIN + 220, finalSigY + 40).stroke();
    doc.fontSize(10).font('Helvetica-Bold').fillColor(BLACK);
    doc.text('Gestionnaire de stock', MARGIN + 30, finalSigY + 46, { width: 190, align: 'center' });
    doc.fontSize(8).font('Helvetica').fillColor(MEDIUM_GRAY);
    doc.text('Cachet et signature', MARGIN + 30, finalSigY + 62, { width: 190, align: 'center' });

    // Chef d'agence (droite)
    doc.fillColor(BLACK);
    doc.moveTo(PAGE_W - MARGIN - 220, finalSigY + 40).lineTo(PAGE_W - MARGIN - 30, finalSigY + 40).stroke();
    doc.fontSize(10).font('Helvetica-Bold');
    doc.text('Chef d\'agence', PAGE_W - MARGIN - 220, finalSigY + 46, { width: 190, align: 'center' });
    doc.fontSize(8).font('Helvetica').fillColor(MEDIUM_GRAY);
    doc.text('Date et signature a la reception', PAGE_W - MARGIN - 220, finalSigY + 62, { width: 190, align: 'center' });

    // === NOTE IMPORTANTE ===
    doc.fillColor(TEAL);
    doc.fontSize(9).font('Helvetica-Bold');
    doc.text('NB : A renvoyer au service stock dès réception', MARGIN, finalSigY + 90, {
      align: 'center',
      width: CONTENT_W
    });

    // === PIED DE PAGE ===
    doc.fillColor(MEDIUM_GRAY).fontSize(7).font('Helvetica');
    const footerText = 'Nizar Stock — Nizar Transport Voyageur — Document genere le ' +
      new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }) +
      ' a ' + new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    doc.text(footerText, MARGIN, PAGE_H - 35, { align: 'center', width: CONTENT_W });

    // Bordure fine autour de la page
    doc.rect(MARGIN - 5, MARGIN - 5, CONTENT_W + 10, PAGE_H - 2 * MARGIN + 10)
      .strokeColor(TEAL).lineWidth(0.5).opacity(0.3).stroke();
    doc.opacity(1);

    doc.end();

    stream.on('finish', () => resolve('/uploads/' + filename));
    stream.on('error', reject);
  });
}

function formatDate(isoStr) {
  if (!isoStr) return '-';
  const d = new Date(isoStr);
  if (isNaN(d.getTime())) return isoStr;
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

module.exports = { generateFichePDF };
