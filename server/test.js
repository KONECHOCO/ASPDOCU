const http = require('http');
const { fatturaReport, etichettaReport, buildInvoiceSpool, invoiceHeader, invoiceRows } = require('./samples');
const { extractSpool } = require('./spool');
const { layoutAll } = require('./layout');
const { evalFormula, formatValue } = require('./format');
const { renderPdf } = require('./render');
const { createApp } = require('./index');
const { pingJdbc } = require('./jdbc');
const store = require('./store');

let failed = 0;
let passed = 0;

function assert(condition, message) {
  if (!condition) {
    failed += 1;
    console.error('FAIL  ' + message);
  } else {
    passed += 1;
    console.log('ok    ' + message);
  }
}

function textsOf(laid) {
  return laid.pages.flatMap((page) => page.items.map((item) => item.text).filter(Boolean));
}

async function request(app, method, urlPath, body, headers) {
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const { port } = server.address();
  try {
    return await new Promise((resolve, reject) => {
      const payload = body == null ? null : Buffer.from(JSON.stringify(body));
      const req = http.request({
        host: '127.0.0.1',
        port,
        path: urlPath,
        method,
        headers: Object.assign({
          'Content-Type': 'application/json',
          'Content-Length': payload ? payload.length : 0
        }, headers || {})
      }, (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          const buffer = Buffer.concat(chunks);
          resolve({ status: res.statusCode, headers: res.headers, buffer, text: buffer.toString('utf8') });
        });
      });
      req.on('error', reject);
      if (payload) req.write(payload);
      req.end();
    });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function main() {
  const spool = buildInvoiceSpool(invoiceHeader(), invoiceRows().slice(0, 5));
  const extracted = extractSpool(spool, fatturaReport().spoolLayout);
  assert(extracted.documents.length === 1, 'lo spool produce un documento');
  assert(extracted.documents[0].header.numero === '2026/0158', 'numero letto dallo spool: ' + extracted.documents[0].header.numero);
  assert(extracted.documents[0].header.cliente === 'Cartoleria Bianchi S.n.c.', 'cliente letto dallo spool');
  assert(extracted.documents[0].rows.length === 5, 'cinque righe di dettaglio dallo spool');
  assert(extracted.documents[0].rows[0].codice === 'ART-1001', 'codice prima riga spool');
  assert(extracted.documents[0].rows[0].descrizione === 'Carta riciclata A4', 'descrizione prima riga spool');

  const fattura = fatturaReport();
  const laid = layoutAll(fattura, fattura.sample);
  const texts = textsOf(laid);
  const total = formatValue(evalFormula('sum(importo)+percent(importo, 22)', fattura.sample.rows), 'currency');
  assert(laid.pages.length === 1, 'la fattura di esempio sta in una pagina (' + laid.pages.length + ')');
  const title = laid.pages[0].items.find((item) => item.text === 'FATTURA');
  assert(title && title.x > 100, 'FATTURA sta a destra della pagina');
  assert(texts.includes('FATTURA'), 'titolo FATTURA nel layout');
  assert(texts.includes('Cartoleria Bianchi S.n.c.'), 'cliente nel layout');
  assert(texts.includes('Carta riciclata A4'), 'prima riga nel layout');
  assert(texts.includes(total), 'totale ' + total + ' nel layout');
  assert(texts.includes('Pagina 1 di 1'), 'numero pagina');

  const many = {
    header: fattura.sample.header,
    rows: Array.from({ length: 40 }, (_, index) => Object.assign({}, fattura.sample.rows[index % fattura.sample.rows.length], {
      codice: 'R' + index
    }))
  };
  const paged = layoutAll(fattura, many);
  const pageTexts = paged.pages.map((page) => page.items.map((item) => item.text).filter(Boolean));
  assert(paged.pages.length >= 2, '40 righe vanno su più pagine (' + paged.pages.length + ')');
  assert(pageTexts[1].includes('FATTURA'), 'intestazione ripetuta a pagina 2');
  assert(pageTexts[paged.pages.length - 1].some((text) => String(text).startsWith('Pagina ')), 'piè di pagina sull\'ultima');

  const labels = layoutAll(etichettaReport(), etichettaReport().sample);
  assert(labels.pages.length === 3, 'tre etichette, una per collo');
  assert(labels.pages[0].items.some((item) => item.kind === 'barcode' && item.text === 'COLLO-0158-01'), 'barcode del primo collo');

  const pdf = await renderPdf(fattura, fattura.sample);
  assert(pdf.slice(0, 4).toString() === '%PDF', 'PDF binario valido');
  assert(pdf.length > 2000, 'PDF non vuoto (' + pdf.length + ')');
  const labelPdf = await renderPdf(etichettaReport(), etichettaReport().sample);
  assert(labelPdf.slice(0, 4).toString() === '%PDF', 'PDF etichette valido');

  store.ensureSeed();
  const app = createApp();
  const preview = await request(app, 'POST', '/api/v1/preview', {
    template: fattura,
    useSample: true
  });
  assert(preview.status === 200, 'anteprima HTTP 200 (' + preview.status + ')');
  assert(preview.buffer.slice(0, 4).toString() === '%PDF', 'anteprima è un PDF');

  const printed = await request(app, 'POST', '/api/v1/print', {
    report: 'fattura',
    params: ['2026/0999'],
    output: 'base64'
  });
  assert(printed.status === 200, 'stampa da SQL demo 200');
  const body = JSON.parse(printed.text);
  assert(body.ok === true && body.base64.length > 100, 'risposta base64 per IBM i');
  assert(printed.headers['x-aspdocu-demo'] === '1', 'header demo sulla stampa di esempio');

  const missing = await request(app, 'POST', '/api/v1/print', { report: 'fattura' });
  assert(missing.status === 400, 'senza dati la stampa viene rifiutata');

  const spoolPrint = await request(app, 'POST', '/api/v1/print', {
    report: 'fattura',
    fromSpool: true,
    output: 'base64'
  });
  assert(spoolPrint.status === 200, 'stampa dallo spool di esempio');

  const systems = await request(app, 'GET', '/api/v1/as400/systems');
  const systemBody = JSON.parse(systems.text);
  assert(systems.status === 200 && systemBody.systems.some((system) => system.id === 'demo'), 'elenco sistemi AS/400 include demo');
  assert(systemBody.systems.every((system) => !Object.prototype.hasOwnProperty.call(system, 'password')), 'le password non escono dall\'API');

  const status = await request(app, 'GET', '/api/v1/as400/status');
  const statusBody = JSON.parse(status.text);
  assert(status.status === 200 && statusBody.drivers && statusBody.drivers.java === true && statusBody.drivers.ready === true, 'collegamento diretto pronto, senza ODBC');

  const ping = await pingJdbc();
  assert(ping.pong === true, 'ponte Java IBM Toolbox risponde');

  console.log('\n' + passed + ' ok, ' + failed + ' falliti');
  if (failed) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
