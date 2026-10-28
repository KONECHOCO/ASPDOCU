const { formatValue } = require('./format');

const PAGE_PRESETS = {
  A4: { width: 210, height: 297 },
  A5: { width: 148, height: 210 },
  Letter: { width: 215.9, height: 279.4 },
  Etichetta: { width: 100, height: 150 }
};

const BAND_ROLES = [
  ['reportHeader', 'Intestazione report'],
  ['pageHeader', 'Intestazione pagina'],
  ['groupHeader', 'Intestazione gruppo'],
  ['detail', 'Dettaglio'],
  ['groupFooter', 'Piè di gruppo'],
  ['pageFooter', 'Piè di pagina'],
  ['reportFooter', 'Piè di report']
];

const SPOOL_MAP = {
  linesPerPage: 60,
  breakField: 'numero',
  headerFields: [
    { name: 'numero', line: 6, col: 60, len: 12 },
    { name: 'data', line: 7, col: 60, len: 12 },
    { name: 'cliente', line: 7, col: 1, len: 40 },
    { name: 'indirizzo', line: 8, col: 1, len: 40 },
    { name: 'localita', line: 9, col: 1, len: 40 },
    { name: 'pagamento', line: 8, col: 50, len: 28 }
  ],
  detail: {
    fromLine: 13,
    toLine: 36,
    fields: [
      { name: 'codice', col: 1, len: 10 },
      { name: 'descrizione', col: 12, len: 28 },
      { name: 'um', col: 42, len: 2 },
      { name: 'qta', col: 46, len: 8 },
      { name: 'prezzo', col: 56, len: 8 },
      { name: 'importo', col: 66, len: 10 }
    ]
  }
};

function el(partial) {
  return Object.assign({
    id: partial.id,
    type: 'label',
    x: 0,
    y: 0,
    w: 40,
    h: 6,
    text: '',
    field: '',
    format: 'text',
    font: 'Helvetica',
    size: 10,
    bold: false,
    italic: false,
    align: 'left',
    color: '#1b2330',
    fill: '',
    borderWidth: 0,
    borderColor: '#243044',
    barcode: 'code128',
    src: '',
    expr: '',
    orient: 'h'
  }, partial);
}

function band(role, height, elements) {
  return { role, height, elements: elements || [] };
}

function emptyLayout() {
  return {
    linesPerPage: 66,
    breakField: '',
    headerFields: [],
    detail: { fromLine: 1, toLine: 1, fields: [] }
  };
}

function invoiceRows() {
  const lines = [
    ['ART-1001', 'Carta riciclata A4', 'PZ', 10, 4.5],
    ['ART-1002', 'Buste commerciali', 'PZ', 6, 12],
    ['ART-1003', 'Registri IVA', 'PZ', 2, 38.5],
    ['ART-1004', 'Penne gel blu', 'PZ', 25, 1.2],
    ['ART-1005', 'Raccoglitori dorso 8', 'PZ', 4, 9.9],
    ['ART-1006', 'Timbratore autoinch.', 'PZ', 1, 54],
    ['ART-1007', 'Etichette bianche', 'PZ', 15, 2.3],
    ['ART-1008', 'Cartelline manilla', 'PZ', 3, 18]
  ];
  return lines.map(([codice, descrizione, um, qta, prezzo]) => ({
    codice,
    descrizione,
    um,
    qta,
    prezzo,
    importo: Math.round(qta * prezzo * 100) / 100
  }));
}

function invoiceHeader() {
  return {
    numero: '2026/0158',
    data: '28/10/2026',
    cliente: 'Cartoleria Bianchi S.n.c.',
    indirizzo: 'Via Garibaldi 4',
    localita: '10100 Torino TO',
    pagamento: 'Bonifico 30 gg d.f.'
  };
}

function putCell(lines, line, col, text, width) {
  const s = String(text ?? '');
  const chars = lines[line - 1].split('');
  for (let i = 0; i < s.length && col - 1 + i < width; i += 1) chars[col - 1 + i] = s[i];
  lines[line - 1] = chars.join('');
}

function buildInvoiceSpool(header, rows) {
  const width = 80;
  const lines = Array.from({ length: SPOOL_MAP.linesPerPage }, () => ' '.repeat(width));
  const put = (line, col, text) => putCell(lines, line, col, text, width);
  const money = (value) => formatValue(value, 'currency');
  const head = header || invoiceHeader();
  const body = rows || invoiceRows().slice(0, 5);
  put(1, 1, 'OFFICINA GRAFICA NORD SRL');
  put(2, 1, 'VIA ROMA 10');
  put(2, 60, 'FATTURA');
  put(3, 1, '20100 MILANO MI');
  put(4, 1, 'P.IVA 01234567890');
  put(6, 1, 'Spett.le');
  put(6, 50, 'Numero');
  put(6, 60, head.numero);
  put(7, 1, head.cliente);
  put(7, 50, 'Data');
  put(7, 60, head.data);
  put(8, 1, head.indirizzo);
  put(8, 50, head.pagamento);
  put(9, 1, head.localita);
  put(11, 1, 'Codice');
  put(11, 12, 'Descrizione');
  put(11, 42, 'UM');
  put(11, 46, 'Qta');
  put(11, 56, 'Prezzo');
  put(11, 66, 'Importo');
  put(12, 1, '-'.repeat(76));
  body.forEach((row, index) => {
    const line = SPOOL_MAP.detail.fromLine + index;
    put(line, 1, row.codice);
    put(line, 12, row.descrizione);
    put(line, 42, row.um);
    put(line, 46, money(row.qta));
    put(line, 56, money(row.prezzo));
    put(line, 66, money(row.importo));
  });
  return lines.join('\n');
}

function fatturaReport() {
  const header = invoiceHeader();
  const rows = invoiceRows();
  return {
    id: 'fattura',
    name: 'Fattura di vendita',
    seed: true,
    mode: 'document',
    page: {
      format: 'A4',
      orientation: 'portrait',
      width: 210,
      height: 297,
      marginTop: 12,
      marginRight: 12,
      marginBottom: 12,
      marginLeft: 12
    },
    groupBy: '',
    source: {
      type: 'sql',
      systemId: 'demo',
      sql: "SELECT NUMERO, DATA_DOC, CLIENTE, INDIRIZZO, LOCALITA, PAGAMENTO,\n       CODICE, DESCRIZIONE, UM, QTA, PREZZO, IMPORTO\nFROM VENDITE.FATTURE\nWHERE NUMERO = ?"
    },
    fields: [
      { name: 'numero', role: 'header', format: 'text' },
      { name: 'data', role: 'header', format: 'date' },
      { name: 'cliente', role: 'header', format: 'text' },
      { name: 'indirizzo', role: 'header', format: 'text' },
      { name: 'localita', role: 'header', format: 'text' },
      { name: 'pagamento', role: 'header', format: 'text' },
      { name: 'codice', role: 'detail', format: 'text' },
      { name: 'descrizione', role: 'detail', format: 'text' },
      { name: 'um', role: 'detail', format: 'text' },
      { name: 'qta', role: 'detail', format: 'number' },
      { name: 'prezzo', role: 'detail', format: 'currency' },
      { name: 'importo', role: 'detail', format: 'currency' }
    ],
    sample: { header, rows },
    sampleSpool: buildInvoiceSpool(header, rows.slice(0, 5)),
    spoolLayout: SPOOL_MAP,
    bands: [
      band('reportHeader', 0, []),
      band('pageHeader', 82, [
        el({ id: 'logo', type: 'box', x: 0, y: 0, w: 22, h: 16, fill: '#243044' }),
        el({ id: 'mono', type: 'label', text: 'OGN', x: 0, y: 4, w: 22, h: 8, align: 'center', bold: true, size: 12, color: '#f4f1ea' }),
        el({ id: 'company', type: 'label', text: 'Officina Grafica Nord S.r.l.', x: 26, y: 0, w: 96, h: 7, bold: true, size: 13 }),
        el({ id: 'addr', type: 'label', text: 'Via Roma 10 — 20100 Milano', x: 26, y: 7, w: 90, h: 5, size: 9, color: '#5c6570' }),
        el({ id: 'vat', type: 'label', text: 'P.IVA 01234567890', x: 26, y: 12, w: 70, h: 5, size: 8, color: '#5c6570' }),
        el({ id: 'title', type: 'label', text: 'FATTURA', x: 124, y: 0, w: 62, h: 8, align: 'right', bold: true, size: 18, color: '#b8431f' }),
        el({ id: 'lnum', type: 'label', text: 'Numero', x: 124, y: 11, w: 22, h: 5, size: 8, color: '#5c6570' }),
        el({ id: 'num', type: 'field', field: 'numero', x: 146, y: 9, w: 40, h: 7, align: 'right', bold: true, size: 12 }),
        el({ id: 'ldate', type: 'label', text: 'Data', x: 124, y: 19, w: 22, h: 5, size: 8, color: '#5c6570' }),
        el({ id: 'date', type: 'field', field: 'data', format: 'date', x: 146, y: 17, w: 40, h: 6, align: 'right', size: 10 }),
        el({ id: 'cbox', type: 'box', x: 0, y: 28, w: 114, h: 30, fill: '#f6f3ec', borderWidth: 0.25, borderColor: '#c8c1b4' }),
        el({ id: 'cdest', type: 'label', text: 'DESTINATARIO', x: 3, y: 30, w: 40, h: 4, size: 7, color: '#5c6570' }),
        el({ id: 'cli', type: 'field', field: 'cliente', x: 3, y: 35, w: 106, h: 6, bold: true, size: 12 }),
        el({ id: 'ind', type: 'field', field: 'indirizzo', x: 3, y: 42, w: 106, h: 5, size: 10 }),
        el({ id: 'loc', type: 'field', field: 'localita', x: 3, y: 48, w: 106, h: 5, size: 10 }),
        el({ id: 'pbox', type: 'box', x: 118, y: 28, w: 68, h: 30, borderWidth: 0.25, borderColor: '#c8c1b4' }),
        el({ id: 'lpay', type: 'label', text: 'PAGAMENTO', x: 121, y: 30, w: 40, h: 4, size: 7, color: '#5c6570' }),
        el({ id: 'pay', type: 'field', field: 'pagamento', x: 121, y: 36, w: 62, h: 10, size: 10 }),
        el({ id: 'rule1', type: 'line', x: 0, y: 64, w: 186, h: 0.3, borderColor: '#243044' }),
        el({ id: 'hcod', type: 'label', text: 'Codice', x: 0, y: 67, w: 24, h: 5, size: 8, bold: true, color: '#5c6570' }),
        el({ id: 'hdes', type: 'label', text: 'Descrizione', x: 26, y: 67, w: 70, h: 5, size: 8, bold: true, color: '#5c6570' }),
        el({ id: 'hum', type: 'label', text: 'U.M.', x: 108, y: 67, w: 12, h: 5, size: 8, bold: true, color: '#5c6570' }),
        el({ id: 'hqty', type: 'label', text: 'Quantità', x: 120, y: 67, w: 20, h: 5, size: 8, bold: true, align: 'right', color: '#5c6570' }),
        el({ id: 'hprz', type: 'label', text: 'Prezzo', x: 142, y: 67, w: 18, h: 5, size: 8, bold: true, align: 'right', color: '#5c6570' }),
        el({ id: 'himp', type: 'label', text: 'Importo', x: 162, y: 67, w: 24, h: 5, size: 8, bold: true, align: 'right', color: '#5c6570' }),
        el({ id: 'rule2', type: 'line', x: 0, y: 74, w: 186, h: 0.25, borderColor: '#c8c1b4' })
      ]),
      band('groupHeader', 0, []),
      band('detail', 7, [
        el({ id: 'dcod', type: 'field', field: 'codice', x: 0, y: 0.4, w: 24, h: 5.5, size: 9 }),
        el({ id: 'ddes', type: 'field', field: 'descrizione', x: 26, y: 0.4, w: 80, h: 5.5, size: 9 }),
        el({ id: 'dum', type: 'field', field: 'um', x: 108, y: 0.4, w: 12, h: 5.5, size: 9 }),
        el({ id: 'dqty', type: 'field', field: 'qta', format: 'number', x: 120, y: 0.4, w: 20, h: 5.5, size: 9, align: 'right' }),
        el({ id: 'dprz', type: 'field', field: 'prezzo', format: 'currency', x: 142, y: 0.4, w: 18, h: 5.5, size: 9, align: 'right' }),
        el({ id: 'dimp', type: 'field', field: 'importo', format: 'currency', x: 162, y: 0.4, w: 24, h: 5.5, size: 9, align: 'right' })
      ]),
      band('groupFooter', 0, []),
      band('pageFooter', 12, [
        el({ id: 'fline', type: 'line', x: 0, y: 1, w: 186, h: 0.2, borderColor: '#c8c1b4' }),
        el({ id: 'ffoot', type: 'label', text: 'Officina Grafica Nord S.r.l. · documento di esempio ASPDOCU', x: 0, y: 4, w: 120, h: 5, size: 8, color: '#5c6570' }),
        el({ id: 'fpage', type: 'pageNumber', text: 'Pagina {PAGE} di {PAGES}', x: 120, y: 4, w: 66, h: 5, size: 8, align: 'right', color: '#5c6570' })
      ]),
      band('reportFooter', 46, [
        el({ id: 'tline', type: 'line', x: 108, y: 2, w: 78, h: 0.3, borderColor: '#243044' }),
        el({ id: 'limp', type: 'label', text: 'Imponibile', x: 108, y: 6, w: 32, h: 6, size: 9, align: 'right' }),
        el({ id: 'simp', type: 'formula', expr: 'sum(importo)', format: 'currency', x: 142, y: 5, w: 44, h: 7, size: 10, align: 'right' }),
        el({ id: 'liva', type: 'label', text: 'IVA 22%', x: 108, y: 15, w: 32, h: 6, size: 9, align: 'right' }),
        el({ id: 'siva', type: 'formula', expr: 'percent(importo, 22)', format: 'currency', x: 142, y: 14, w: 44, h: 7, size: 10, align: 'right' }),
        el({ id: 'tline2', type: 'line', x: 108, y: 24, w: 78, h: 0.25, borderColor: '#c8c1b4' }),
        el({ id: 'ltot', type: 'label', text: 'Totale', x: 108, y: 28, w: 32, h: 8, size: 12, bold: true, align: 'right' }),
        el({ id: 'stot', type: 'formula', expr: 'sum(importo)+percent(importo, 22)', format: 'currency', x: 142, y: 28, w: 44, h: 8, size: 12, bold: true, align: 'right' }),
        el({ id: 'note', type: 'label', text: 'Esempio grafico. I dati di prova si sostituiscono con SQL, spool o con il JSON inviato dal programma.', x: 0, y: 8, w: 100, h: 16, size: 8, color: '#5c6570' })
      ])
    ]
  };
}

function etichettaReport() {
  return {
    id: 'etichetta',
    name: 'Etichetta collo',
    seed: true,
    mode: 'label',
    page: {
      format: 'Etichetta',
      orientation: 'portrait',
      width: 100,
      height: 150,
      marginTop: 6,
      marginRight: 6,
      marginBottom: 6,
      marginLeft: 6
    },
    groupBy: '',
    source: { type: 'json', systemId: 'demo', sql: '' },
    fields: [
      { name: 'cliente', role: 'detail', format: 'text' },
      { name: 'indirizzo', role: 'detail', format: 'text' },
      { name: 'localita', role: 'detail', format: 'text' },
      { name: 'collo', role: 'detail', format: 'text' }
    ],
    sample: {
      header: {},
      rows: [
        { cliente: 'Cartoleria Bianchi S.n.c.', indirizzo: 'Via Garibaldi 4', localita: '10100 Torino TO', collo: 'COLLO-0158-01' },
        { cliente: 'Cartoleria Bianchi S.n.c.', indirizzo: 'Via Garibaldi 4', localita: '10100 Torino TO', collo: 'COLLO-0158-02' },
        { cliente: 'Studio Neri Architetti', indirizzo: 'Corso Italia 18', localita: '35100 Padova PD', collo: 'COLLO-0160-01' }
      ]
    },
    sampleSpool: '',
    spoolLayout: emptyLayout(),
    bands: [
      band('reportHeader', 0, []),
      band('pageHeader', 0, []),
      band('groupHeader', 0, []),
      band('detail', 138, [
        el({ id: 'lm', type: 'label', text: 'MITTENTE', x: 0, y: 1, w: 40, h: 4, size: 7, color: '#5c6570' }),
        el({ id: 'co', type: 'label', text: 'Officina Grafica Nord S.r.l.', x: 0, y: 6, w: 80, h: 6, size: 10, bold: true }),
        el({ id: 'ca', type: 'label', text: 'Via Roma 10, 20100 Milano', x: 0, y: 12, w: 80, h: 5, size: 8, color: '#5c6570' }),
        el({ id: 'ln', type: 'line', x: 0, y: 20, w: 88, h: 0.4, borderColor: '#243044' }),
        el({ id: 'ld', type: 'label', text: 'DESTINATARIO', x: 0, y: 24, w: 40, h: 4, size: 7, color: '#5c6570' }),
        el({ id: 'cl', type: 'field', field: 'cliente', x: 0, y: 30, w: 88, h: 10, size: 13, bold: true }),
        el({ id: 'in', type: 'field', field: 'indirizzo', x: 0, y: 42, w: 88, h: 6, size: 11 }),
        el({ id: 'lo', type: 'field', field: 'localita', x: 0, y: 50, w: 88, h: 6, size: 11 }),
        el({ id: 'bc', type: 'barcode', field: 'collo', barcode: 'code128', x: 6, y: 68, w: 76, h: 28 }),
        el({ id: 'cn', type: 'field', field: 'collo', x: 0, y: 98, w: 88, h: 6, align: 'center', size: 9 }),
        el({ id: 'lb', type: 'label', text: 'Etichetta di spedizione', x: 0, y: 120, w: 88, h: 5, size: 8, color: '#5c6570' })
      ]),
      band('groupFooter', 0, []),
      band('pageFooter', 0, []),
      band('reportFooter', 0, [])
    ]
  };
}

function blankReport(id, name, preset) {
  const key = PAGE_PRESETS[preset] ? preset : 'A4';
  const size = PAGE_PRESETS[key];
  return {
    id,
    name: name || 'Nuovo report',
    seed: false,
    mode: key === 'Etichetta' ? 'label' : 'document',
    page: {
      format: key,
      orientation: 'portrait',
      width: size.width,
      height: size.height,
      marginTop: 12,
      marginRight: 12,
      marginBottom: 12,
      marginLeft: 12
    },
    groupBy: '',
    source: { type: 'json', systemId: '', sql: '' },
    fields: [],
    sample: { header: { titolo: name || 'Nuovo report' }, rows: [{}] },
    sampleSpool: '',
    spoolLayout: emptyLayout(),
    bands: [
      band('reportHeader', 0, []),
      band('pageHeader', 24, [
        el({ id: 'title', type: 'label', text: name || 'Nuovo report', x: 0, y: 2, w: 120, h: 8, size: 16, bold: true })
      ]),
      band('groupHeader', 0, []),
      band('detail', 8, []),
      band('groupFooter', 0, []),
      band('pageFooter', 10, [
        el({ id: 'pg', type: 'pageNumber', text: 'Pagina {PAGE} di {PAGES}', x: 0, y: 2, w: 60, h: 5, size: 8, color: '#5c6570' })
      ]),
      band('reportFooter', 0, [])
    ]
  };
}

function reportFromSpool(id, name, spoolText, layout, systemId) {
  const map = layout || emptyLayout();
  const content = 186;
  const headerFields = map.headerFields || [];
  const detailFields = (map.detail && map.detail.fields) || [];
  const gap = 2;
  const detailWidth = detailFields.length
    ? Math.max(16, Math.min(48, (content - gap * (detailFields.length - 1)) / detailFields.length))
    : 40;
  const headerElements = [
    el({ id: 'sp-title', type: 'label', text: name || 'Stampa da spool', x: 0, y: 0, w: 120, h: 8, size: 14, bold: true })
  ];
  headerFields.forEach((field, index) => {
    const y = 12 + index * 8;
    headerElements.push(el({
      id: 'hl-' + field.name,
      type: 'label',
      text: field.name,
      x: 0,
      y,
      w: 28,
      h: 6,
      size: 8,
      color: '#5c6570'
    }));
    headerElements.push(el({
      id: 'hf-' + field.name,
      type: 'field',
      field: field.name,
      x: 30,
      y,
      w: 80,
      h: 6,
      size: 10
    }));
  });
  const tableY = 12 + headerFields.length * 8 + 4;
  detailFields.forEach((field, index) => {
    headerElements.push(el({
      id: 'th-' + field.name,
      type: 'label',
      text: field.name,
      x: index * (detailWidth + gap),
      y: tableY,
      w: detailWidth,
      h: 5,
      size: 8,
      bold: true,
      color: '#5c6570'
    }));
  });
  const headerHeight = Math.max(24, tableY + 8);
  const detailElements = detailFields.map((field, index) => el({
    id: 'df-' + field.name,
    type: 'field',
    field: field.name,
    x: index * (detailWidth + gap),
    y: 0.5,
    w: detailWidth,
    h: 6,
    size: 9
  }));
  const report = blankReport(id, name, 'A4');
  report.seed = false;
  report.source = { type: 'spool', systemId: systemId || '', sql: '' };
  report.sampleSpool = spoolText || '';
  report.spoolLayout = map;
  report.bands = [
    band('reportHeader', 0, []),
    band('pageHeader', headerHeight, headerElements),
    band('groupHeader', 0, []),
    band('detail', 7, detailElements),
    band('groupFooter', 0, []),
    band('pageFooter', 10, [
      el({ id: 'pg', type: 'pageNumber', text: 'Pagina {PAGE} di {PAGES}', x: 120, y: 2, w: 60, h: 5, size: 8, align: 'right', color: '#5c6570' })
    ]),
    band('reportFooter', 0, [])
  ];
  return report;
}

function demoSystem() {
  return {
    id: 'demo',
    name: 'AS/400 di esempio',
    type: 'demo',
    host: 'demo.local',
    port: 8471,
    user: 'DEMO',
    password: '',
    library: 'VENDITE',
    naming: 'sql',
    ccsid: 280,
    driver: 'IBM i Access ODBC Driver',
    bridgeUrl: '',
    bridgeKey: ''
  };
}

function seedReports() {
  return [fatturaReport(), etichettaReport()];
}

module.exports = {
  PAGE_PRESETS,
  BAND_ROLES,
  SPOOL_MAP,
  invoiceHeader,
  invoiceRows,
  buildInvoiceSpool,
  fatturaReport,
  etichettaReport,
  blankReport,
  reportFromSpool,
  demoSystem,
  seedReports,
  emptyLayout
};
