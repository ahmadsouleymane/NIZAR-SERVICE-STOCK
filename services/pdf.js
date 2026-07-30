// services/pdf.js — Generation PDF des fiches de reception
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

const LOGO_PATH = path.join(__dirname, '..', 'public', 'logo.jpeg');
const OUTPUT_DIR = path.join(__dirname, '..', 'public', 'uploads');

// S'assurer que le dossier de sortie existe
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

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
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const stream = fs.createWriteStream(filepath);

    doc.pipe(stream);

    // === EN-TETE AVEC LOGO ===
    try {
      if (fs.existsSync(LOGO_PATH)) {
        doc.image(LOGO_PATH, 50, 40, { width: 55, height: 55 });
      }
    } catch (e) { /* logo non disponible */ }

    doc.fontSize(16).font('Helvetica-Bold').text('NIZAR TRANSPORT VOYAGEUR', 120, 50, { align: 'left' });
    doc.fontSize(13).font('Helvetica-Bold').fillColor('#0EA5A0').text('FICHE DE RECEPTION', 120, 72, { align: 'left' });
    doc.fillColor('#000000');

    // Ligne de séparation
    doc.moveTo(50, 110).lineTo(545, 110).strokeColor('#0EA5A0').lineWidth(1.5).stroke();
    doc.strokeColor('#000000').lineWidth(0.5);

    // === BLOC INFOS ===
    const yInfo = 125;
    doc.fontSize(10).font('Helvetica-Bold');
    doc.text('REFERENCE :', 50, yInfo);
    doc.text('DATE ENVOI :', 280, yInfo);
    doc.font('Helvetica');
    doc.text(fiche.reference || '-', 140, yInfo);
    doc.text(formatDate(fiche.date_envoi || fiche.date_creation), 360, yInfo);

    doc.font('Helvetica-Bold');
    doc.text('DESTINATION :', 50, yInfo + 18);
    doc.font('Helvetica');
    const destLabel = fiche.localite_nom + (fiche.localite_type === 'international' ? ' (' + (fiche.localite_pays || 'International') + ')' : ' (National)');
    doc.text(destLabel, 140, yInfo + 18);

    if (fiche.notes) {
      doc.font('Helvetica-Bold');
      doc.text('NOTES :', 50, yInfo + 36);
      doc.font('Helvetica');
      doc.text(fiche.notes, 140, yInfo + 36, { width: 400 });
    }

    // === TABLEAU DES ARTICLES ===
    const tableTop = yInfo + (fiche.notes ? 70 : 55);
    const colX = [50, 180, 350, 420, 480]; // Article, Numero, Qté, Unité, Obs

    // En-tête du tableau
    doc.font('Helvetica-Bold').fontSize(9);
    const headerY = tableTop;
    doc.rect(50, headerY, 495, 20).fill('#1A1A1A');
    doc.fillColor('#FFFFFF');
    doc.text('ARTICLE', colX[0] + 5, headerY + 5, { width: colX[1] - colX[0] - 10 });
    doc.text('N° DEBUT - N° FIN', colX[1] + 5, headerY + 5, { width: colX[2] - colX[1] - 10 });
    doc.text('QTE', colX[2] + 5, headerY + 5, { width: colX[3] - colX[2] - 10 });
    doc.text('UNITE', colX[3] + 5, headerY + 5, { width: colX[4] - colX[3] - 10 });
    doc.fillColor('#000000');

    // Lignes du tableau
    let rowY = headerY + 22;
    for (let i = 0; i < lignes.length; i++) {
      const l = lignes[i];

      // Fond alterné
      if (i % 2 === 0) {
        doc.rect(50, rowY - 2, 495, 22).fill('#F9FAFB');
        doc.fillColor('#000000');
      }

      doc.font('Helvetica').fontSize(9);
      doc.text(l.article_nom || '-', colX[0] + 5, rowY + 2, { width: colX[1] - colX[0] - 10 });

      let numero = '-';
      if (l.numero_debut && l.numero_fin) numero = l.numero_debut + ' - ' + l.numero_fin;
      else if (l.numero_debut) numero = l.numero_debut;

      doc.text(numero, colX[1] + 5, rowY + 2, { width: colX[2] - colX[1] - 10 });
      doc.text(String(l.quantite), colX[2] + 5, rowY + 2, { width: colX[3] - colX[2] - 10 });
      doc.text(l.unite || 'piece', colX[3] + 5, rowY + 2, { width: colX[4] - colX[3] - 10 });

      rowY += 22;

      if (rowY > 680) {
        doc.addPage();
        rowY = 50;
      }
    }

    // === SIGNATURES ===
    const sigY = Math.max(rowY + 30, 600);
    doc.lineWidth(0.5);

    // Gauche : Gestionnaire de stock
    doc.moveTo(50, sigY).lineTo(250, sigY).stroke();
    doc.fontSize(9).font('Helvetica');
    doc.text('Gestionnaire de stock', 50, sigY + 5, { width: 200, align: 'center' });
    doc.fontSize(8).fillColor('#666666');
    doc.text('Cachet et signature', 50, sigY + 20, { width: 200, align: 'center' });
    doc.fillColor('#000000');

    // Droite : Chef d'agence
    doc.moveTo(300, sigY).lineTo(545, sigY).stroke();
    doc.fontSize(9).font('Helvetica');
    doc.text('Chef d\'agence', 300, sigY + 5, { width: 245, align: 'center' });
    doc.fontSize(8).fillColor('#666666');
    doc.text('Date et signature a la reception', 300, sigY + 20, { width: 245, align: 'center' });
    doc.fillColor('#000000');

    // === NOTE EN BAS ===
    doc.fontSize(8).font('Helvetica-Oblique').fillColor('#666666');
    doc.text('NB : A renvoyer au service stock des reception', 50, sigY + 50, { align: 'center', width: 495 });

    // === PIED DE PAGE ===
    doc.fontSize(7).font('Helvetica');
    doc.text('Nizar Stock — Document genere le ' + new Date().toLocaleDateString('fr-FR'), 50, 790, { align: 'center', width: 495 });

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
