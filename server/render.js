const PDFDocument = require('pdfkit');
const bwipjs = require('bwip-js');
const { layoutAll } = require('./layout');

const MM = 72 / 25.4;

function pt(mm) {
  return (mm || 0) * MM;
}

function pdfBuffer(doc) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
}

function hexColor(value, fallback) {
  const text = String(value || '').trim();
  return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(text) ? text : fallback;
}

function barcodePng(item) {
  const text = String(item.text || '').trim();
  if (!text) return Promise.resolve(null);
  const bcid = item.barcode || 'code128';
  const options = {
    bcid,
    text,
    scale: 2,
    includetext: bcid !== 'qrcode',
    textxalign: 'center',
    backgroundcolor: 'FFFFFF'
  };
  if (bcid !== 'qrcode') options.height = Math.max(8, (item.h || 12) - 4);
  return new Promise((resolve, reject) => {
    bwipjs.toBuffer(options, (error, png) => (error ? reject(error) : resolve(png)));
  });
}

async function drawItem(doc, item) {
  const x = pt(item.x);
  const y = pt(item.y);
  const w = pt(item.w);
  const h = pt(item.h);
  if (item.kind === 'rect') {
    if (item.fill) doc.save().rect(x, y, w, h).fill(hexColor(item.fill, '#ffffff')).restore();
    if (item.borderWidth) {
      doc.save();
      doc.lineWidth(Math.max(0.3, pt(item.borderWidth)));
      doc.strokeColor(hexColor(item.borderColor, '#243044'));
      doc.rect(x, y, w, h).stroke();
      doc.restore();
    }
    return;
  }
  if (item.kind === 'line') {
    doc.save();
    doc.lineWidth(Math.max(0.4, item.orient === 'v' ? w : h));
    doc.strokeColor(hexColor(item.borderColor || item.color, '#243044'));
    if (item.orient === 'v') doc.moveTo(x + w / 2, y).lineTo(x + w / 2, y + h).stroke();
    else doc.moveTo(x, y + h / 2).lineTo(x + w, y + h / 2).stroke();
    doc.restore();
    return;
  }
  if (item.kind === 'image') {
    try {
      const match = String(item.src).match(/^data:image\/[a-zA-Z0-9.+-]+;base64,(.+)$/);
      if (!match) return;
      const buffer = Buffer.from(match[1], 'base64');
      doc.image(buffer, x, y, { fit: [w, h], align: 'center', valign: 'center' });
    } catch (error) {
      doc.font('Helvetica').fontSize(8).fillColor('#5c6570').text('Immagine non valida', x, y, { width: w, height: h });
    }
    return;
  }
  if (item.kind === 'barcode') {
    try {
      const png = await barcodePng(item);
      if (!png) {
        doc.font('Helvetica').fontSize(8).fillColor('#5c6570').text('Barcode vuoto', x, y, { width: w });
        return;
      }
      doc.image(png, x, y, { fit: [w, h], align: 'center', valign: 'center' });
    } catch (error) {
      doc.save();
      doc.lineWidth(0.6).strokeColor('#b8431f').rect(x, y, w, h).stroke();
      doc.font('Helvetica').fontSize(8).fillColor('#b8431f').text(String(item.text || 'Barcode'), x + 2, y + 4, { width: Math.max(10, w - 4) });
      doc.restore();
    }
    return;
  }
  if (!item.text) return;
  const size = item.size || 10;
  const textY = y + Math.max(0, (h - size) / 2);
  doc.font(item.font || 'Helvetica')
    .fontSize(size)
    .fillColor(hexColor(item.color, '#1b2330'))
    .text(String(item.text), x, textY, {
      width: Math.max(4, w),
      height: Math.max(size, h),
      align: item.align || 'left',
      lineBreak: false,
      ellipsis: true
    });
}

async function drawPage(doc, page) {
  doc.addPage({ size: [pt(page.width), pt(page.height)], margin: 0 });
  for (const item of page.items) await drawItem(doc, item);
}

async function renderPdf(report, data) {
  const laid = layoutAll(report, data);
  const doc = new PDFDocument({
    autoFirstPage: false,
    info: {
      Title: report.name || report.id || 'ASPDOCU',
      Author: 'ASPDOCU',
      Creator: 'ASPDOCU'
    }
  });
  const done = pdfBuffer(doc);
  try {
    for (const page of laid.pages) await drawPage(doc, page);
    if (!laid.pages.length) doc.addPage({ size: 'A4', margin: 0 });
    doc.end();
    return await done;
  } catch (error) {
    try { doc.end(); } catch (endError) { /* il buffer viene scartato */ }
    throw error;
  }
}

module.exports = { renderPdf, pt };
