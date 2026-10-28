const { evalFormula, formatValue, toNumber } = require('./format');

const FONTS = {
  Helvetica: ['Helvetica', 'Helvetica-Bold', 'Helvetica-Oblique', 'Helvetica-BoldOblique'],
  Times: ['Times-Roman', 'Times-Bold', 'Times-Italic', 'Times-BoldItalic'],
  Courier: ['Courier', 'Courier-Bold', 'Courier-Oblique', 'Courier-BoldOblique']
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function bandByRole(bands, role) {
  return (bands || []).find((band) => band.role === role) || { role, height: 0, elements: [] };
}

function normalizeData(data) {
  if (!data) return { header: {}, rows: [] };
  if (Array.isArray(data.documents)) return data;
  if (Array.isArray(data)) {
    const rows = data;
    return { header: Object.assign({}, rows[0] || {}), rows };
  }
  return {
    header: Object.assign({}, data.header || {}),
    rows: Array.isArray(data.rows) ? data.rows : []
  };
}

function groupRows(rows, field) {
  const source = field
    ? rows.slice().sort((a, b) => String(a[field] ?? '').localeCompare(String(b[field] ?? ''), 'it'))
    : rows.slice();
  if (!field) return [{ key: '', rows: source }];
  const groups = [];
  for (const row of source) {
    const key = row[field] == null ? '' : String(row[field]);
    const last = groups[groups.length - 1];
    if (!last || last.key !== key) groups.push({ key, rows: [row] });
    else last.rows.push(row);
  }
  return groups.length ? groups : [{ key: '', rows: [] }];
}

function fontName(element) {
  const family = FONTS[element.font] ? element.font : 'Helvetica';
  const index = (element.bold ? 1 : 0) + (element.italic ? 2 : 0);
  return FONTS[family][index];
}

function interpolate(text, ctx, knownPages) {
  return String(text ?? '').replace(/\{([A-Za-z0-9_.]+)\}/g, (_, key) => {
    if (key === 'PAGE') return ctx.PAGE == null ? '' : String(ctx.PAGE);
    if (key === 'PAGES') return knownPages == null ? '00' : String(knownPages);
    if (Object.prototype.hasOwnProperty.call(ctx, key) && ctx[key] != null) return String(ctx[key]);
    return '';
  });
}

function elementText(report, element, ctx, rows, pageNo, knownPages) {
  const local = Object.assign({}, ctx, { PAGE: pageNo, PAGES: knownPages == null ? '00' : knownPages });
  if (element.type === 'label' || element.type === 'pageNumber') {
    return interpolate(element.text, local, knownPages);
  }
  if (element.type === 'dateNow') return new Date().toLocaleDateString('it-IT');
  if (element.type === 'field') {
    const value = local[element.field];
    return value == null ? '' : formatValue(value, element.format || 'text');
  }
  if (element.type === 'formula') {
    try {
      return formatValue(evalFormula(element.expr, rows), element.format || 'currency');
    } catch (error) {
      return '#FORMULA';
    }
  }
  if (element.type === 'barcode' || element.type === 'qr') {
    const value = element.field ? local[element.field] : element.text;
    return value == null || value === '' ? String(element.text || '') : String(value);
  }
  return '';
}

function makeItem(report, element, x, y, ctx, rows, pageNo, knownPages) {
  const base = {
    x: x || 0,
    y: y || 0,
    w: element.w || 0,
    h: element.h || 0,
    color: element.color || '#1b2330',
    fill: element.fill || '',
    borderWidth: element.borderWidth || 0,
    borderColor: element.borderColor || '#243044'
  };
  if (element.type === 'box') {
    if (!base.fill && !base.borderWidth) return null;
    return Object.assign(base, { kind: 'rect' });
  }
  if (element.type === 'line') {
    return Object.assign(base, { kind: 'line', orient: element.orient || 'h' });
  }
  if (element.type === 'image') {
    if (!element.src) return null;
    return Object.assign(base, { kind: 'image', src: element.src });
  }
  if (element.type === 'barcode' || element.type === 'qr') {
    const text = elementText(report, element, ctx, rows, pageNo, knownPages);
    return Object.assign(base, {
      kind: 'barcode',
      text,
      barcode: element.type === 'qr' ? 'qrcode' : (element.barcode || 'code128')
    });
  }
  const text = elementText(report, element, ctx, rows, pageNo, knownPages);
  if (!String(text || '').trim()) return null;
  return Object.assign(base, {
    kind: 'text',
    text,
    font: fontName(element),
    size: element.size || 10,
    align: element.align || 'left'
  });
}

function pageMetrics(report) {
  const page = report.page || {};
  return {
    width: page.width || 210,
    height: page.height || 297,
    marginTop: page.marginTop ?? 12,
    marginRight: page.marginRight ?? 12,
    marginBottom: page.marginBottom ?? 12,
    marginLeft: page.marginLeft ?? 12
  };
}

function drawBand(state, band, ctx, rows, canBreak) {
  if (!band || !(band.height > 0)) return;
  const room = state.bottom - state.marginTop - (state.pageHeaderHeight || 0);
  if (canBreak && state.y + band.height > state.bottom) {
    if (band.height <= Math.max(8, room)) state.newPage();
  }
  const top = state.y;
  const page = state.pages[state.pages.length - 1];
  for (const element of band.elements || []) {
    const item = makeItem(
      state.report,
      element,
      state.contentLeft + (toNumber(element.x) || element.x || 0),
      top + (element.y || 0),
      ctx,
      rows,
      state.pages.length,
      state.knownPages
    );
    if (item) page.items.push(item);
  }
  state.y += band.height;
}

function layoutDocument(report, data, knownPages) {
  const page = pageMetrics(report);
  const bands = {
    reportHeader: bandByRole(report.bands, 'reportHeader'),
    pageHeader: bandByRole(report.bands, 'pageHeader'),
    groupHeader: bandByRole(report.bands, 'groupHeader'),
    detail: bandByRole(report.bands, 'detail'),
    groupFooter: bandByRole(report.bands, 'groupFooter'),
    pageFooter: bandByRole(report.bands, 'pageFooter'),
    reportFooter: bandByRole(report.bands, 'reportFooter')
  };
  const norm = normalizeData(data);
  const footerH = bands.pageFooter.height || 0;
  const state = {
    report,
    pages: [],
    y: 0,
    knownPages,
    contentLeft: page.marginLeft,
    marginTop: page.marginTop,
    bottom: page.height - page.marginBottom - footerH,
    pageHeaderHeight: bands.pageHeader.height || 0,
    newPage() {}
  };
  state.newPage = () => {
    if (state.pages.length >= 400) {
      const error = new Error('Il report supera 400 pagine.');
      error.status = 400;
      throw error;
    }
    state.pages.push({ width: page.width, height: page.height, items: [] });
    state.y = page.marginTop;
    const ctx = Object.assign({}, norm.header, { PAGE: state.pages.length });
    drawBand(state, bands.pageHeader, ctx, norm.rows, false);
    if (state.y >= state.bottom) {
      const error = new Error('Intestazione di pagina più alta dello spazio utile. Riduci intestazione o margini.');
      error.status = 400;
      throw error;
    }
  };

  state.newPage();
  drawBand(state, bands.reportHeader, Object.assign({}, norm.header), norm.rows, true);
  const groups = groupRows(norm.rows, report.groupBy || '');
  for (const group of groups) {
    const groupCtx = Object.assign({}, norm.header);
    if (report.groupBy) groupCtx[report.groupBy] = group.key;
    if (report.groupBy) drawBand(state, bands.groupHeader, groupCtx, group.rows, true);
    for (const row of group.rows) {
      drawBand(state, bands.detail, Object.assign({}, norm.header, row), group.rows, true);
    }
    if (report.groupBy) drawBand(state, bands.groupFooter, groupCtx, group.rows, true);
  }
  drawBand(state, bands.reportFooter, Object.assign({}, norm.header), norm.rows, true);

  const total = knownPages || state.pages.length || 1;
  state.pages.forEach((sheet, index) => {
    const ctx = Object.assign({}, norm.header, { PAGE: index + 1, PAGES: total });
    const footerY = page.height - page.marginBottom - footerH;
    for (const element of bands.pageFooter.elements || []) {
      const item = makeItem(
        report,
        element,
        page.marginLeft + (element.x || 0),
        footerY + (element.y || 0),
        ctx,
        norm.rows,
        index + 1,
        total
      );
      if (item) sheet.items.push(item);
    }
  });
  return { pages: state.pages };
}

function layoutLabels(report, data, knownPages) {
  const page = pageMetrics(report);
  const norm = normalizeData(data);
  const rows = norm.rows.length ? norm.rows : [{}];
  const roles = ['pageHeader', 'detail', 'reportFooter', 'pageFooter'];
  const total = knownPages || rows.length;
  const pages = rows.map((row, index) => {
    const ctx = Object.assign({}, norm.header, row, { PAGE: index + 1, PAGES: total });
    const items = [];
    let y = page.marginTop;
    for (const role of roles) {
      const band = bandByRole(report.bands, role);
      if (!(band.height > 0)) continue;
      for (const element of band.elements || []) {
        const item = makeItem(
          report,
          element,
          page.marginLeft + (element.x || 0),
          y + (element.y || 0),
          ctx,
          [row],
          index + 1,
          total
        );
        if (item) items.push(item);
      }
      y += band.height;
    }
    return { width: page.width, height: page.height, items };
  });
  return { pages };
}

function layout(report, data, knownPages) {
  if (report.mode === 'label') return layoutLabels(report, data, knownPages);
  return layoutDocument(report, data, knownPages);
}

function layoutAll(report, data) {
  const docs = data && Array.isArray(data.documents) ? data.documents : [data];
  const pages = [];
  const list = docs.length ? docs : [{ header: {}, rows: [] }];
  for (const doc of list) {
    const draft = layout(report, doc, null);
    const count = draft.pages.length || 1;
    pages.push(...layout(report, doc, count).pages);
  }
  return { pages: pages.length ? pages : layout(report, { header: {}, rows: [] }, 1).pages };
}

module.exports = {
  clone,
  normalizeData,
  groupRows,
  layout,
  layoutAll,
  fontName
};
