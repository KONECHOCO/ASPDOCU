const os = require('os');
const path = require('path');
const express = require('express');
const bwipjs = require('bwip-js');
const store = require('./store');
const as400 = require('./as400');
const { renderPdf } = require('./render');
const { extractSpool, decodeSpoolBuffer } = require('./spool');
const { PAGE_PRESETS, BAND_ROLES } = require('./samples');

const PORT = Number(process.env.PORT) || 4780;

function isLocal(req) {
  const ip = String(req.socket.remoteAddress || '');
  return ip === '127.0.0.1' || ip === '::1' || ip.endsWith('127.0.0.1');
}

function lanUrls(port) {
  const urls = ['http://127.0.0.1:' + port];
  const nets = os.networkInterfaces();
  for (const entries of Object.values(nets)) {
    for (const entry of entries || []) {
      if (entry.family === 'IPv4' && !entry.internal) urls.push('http://' + entry.address + ':' + port);
    }
  }
  return urls;
}

function wrap(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

function guard(req, res, next) {
  const token = store.settings().token || '';
  if (!token) return next();
  if ((req.get('X-Aspdocu-Key') || '') === token) return next();
  res.status(401).json({
    ok: false,
    error: 'Chiave ASPDOCU mancante o errata. Invia l\'header X-Aspdocu-Key.'
  });
}

async function resolveData(report, body) {
  if (body.data) return body.data;
  if (typeof body.spool === 'string' && body.spool.length) {
    return extractSpool(body.spool, body.layout || report.spoolLayout);
  }
  if (body.fromSpool) {
    if (!report.sampleSpool) {
      const error = new Error('Questo report non ha uno spool di esempio.');
      error.status = 400;
      throw error;
    }
    return extractSpool(report.sampleSpool, report.spoolLayout);
  }
  if (body.useSample) return report.sample || { header: {}, rows: [] };
  if (body.params || body.sql || body.query) {
    const systemId = body.system || (report.source && report.source.systemId);
    const system = as400.getSystem(systemId);
    const sql = body.sql || (report.source && report.source.sql) || '';
    if (!String(sql).trim()) {
      const error = new Error('Manca il comando SQL del report.');
      error.status = 400;
      throw error;
    }
    const result = await as400.runQuery(system, sql, body.params || []);
    if (result.detail) return { header: result.header || {}, rows: result.detail, demo: Boolean(result.demo) };
    return { header: Object.assign({}, result.rows[0] || {}), rows: result.rows || [], demo: Boolean(result.demo) };
  }
  const error = new Error('Manca il contenuto. Passa data, spool, params oppure useSample per la prova.');
  error.status = 400;
  throw error;
}

function fileNameOf(body, report) {
  const raw = String(body.fileName || (report.id || 'stampa') + '.pdf');
  const base = path.basename(raw).replace(/[^a-zA-Z0-9._-]/g, '_');
  return base.toLowerCase().endsWith('.pdf') ? base : base + '.pdf';
}

async function sendPdf(req, res, report, data, body) {
  const pdf = await renderPdf(report, data);
  const output = body.output || 'pdf';
  const fileName = fileNameOf(body, report);
  const demo = Boolean(data && data.demo);
  if (demo) res.setHeader('X-Aspdocu-Demo', '1');
  if (output === 'base64') {
    return res.json({ ok: true, fileName, bytes: pdf.length, demo, base64: pdf.toString('base64') });
  }
  if (output === 'file') {
    const fs = require('fs');
    fs.writeFileSync(path.join(store.OUTPUT, fileName), pdf);
    return res.json({
      ok: true,
      fileName,
      bytes: pdf.length,
      demo,
      file: 'output/' + fileName,
      url: '/output/' + encodeURIComponent(fileName)
    });
  }
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'inline; filename="' + fileName + '"');
  return res.send(pdf);
}

function createApp() {
  const app = express();
  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', req.get('Origin') || '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Aspdocu-Key');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Cache-Control', 'no-store');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });
  app.use(express.json({ limit: '12mb' }));
  app.use(express.static(path.join(store.ROOT, 'public')));
  app.use('/output', express.static(store.OUTPUT));
  app.use('/sdk', express.static(path.join(store.ROOT, 'sdk')));

  app.get('/api/v1/info', wrap(async (req, res) => {
    const token = store.settings().token || '';
    const drivers = await as400.driverStatus();
    res.json({
      name: 'ASPDOCU',
      port: PORT,
      urls: lanUrls(PORT),
      tokenRequired: Boolean(token),
      token: isLocal(req) ? token : '',
      presets: PAGE_PRESETS,
      bands: BAND_ROLES,
      drivers
    });
  }));

  app.get('/api/v1/barcode', wrap(async (req, res) => {
    const text = String(req.query.text || '').trim();
    const bcid = String(req.query.type || 'code128');
    if (!text) return res.status(400).json({ ok: false, error: 'Testo barcode vuoto.' });
    const png = await new Promise((resolve, reject) => {
      const options = {
        bcid,
        text,
        scale: 2,
        includetext: bcid !== 'qrcode',
        textxalign: 'center',
        height: bcid === 'qrcode' ? undefined : 12,
        backgroundcolor: 'FFFFFF'
      };
      bwipjs.toBuffer(options, (error, buffer) => (error ? reject(error) : resolve(buffer)));
    });
    res.setHeader('Content-Type', 'image/png');
    res.send(png);
  }));

  app.use('/api/v1', guard);

  app.get('/api/v1/reports', (req, res) => res.json({ ok: true, reports: store.listReports() }));

  app.get('/api/v1/reports/:id', (req, res) => {
    const report = store.readReport(req.params.id);
    if (!report) return res.status(404).json({ ok: false, error: 'Report non trovato.' });
    res.json({ ok: true, report });
  });

  app.post('/api/v1/reports', wrap(async (req, res) => {
    const report = store.createReport(req.body || {});
    res.status(201).json({ ok: true, report });
  }));

  app.put('/api/v1/reports/:id', wrap(async (req, res) => {
    const report = Object.assign({}, req.body || {}, { id: req.params.id });
    res.json({ ok: true, report: store.writeReport(report) });
  }));

  app.delete('/api/v1/reports/:id', (req, res) => {
    const removed = store.removeReport(req.params.id);
    if (!removed) return res.status(404).json({ ok: false, error: 'Report non trovato.' });
    res.json({ ok: true });
  });

  app.post('/api/v1/preview', wrap(async (req, res) => {
    const body = req.body || {};
    const report = body.template || store.readReport(body.report);
    if (!report) return res.status(404).json({ ok: false, error: 'Report non trovato.' });
    const data = await resolveData(report, body);
    await sendPdf(req, res, report, data, Object.assign({}, body, { output: 'pdf' }));
  }));

  app.post('/api/v1/print', wrap(async (req, res) => {
    const body = req.body || {};
    const report = body.template || store.readReport(body.report);
    if (!report) return res.status(404).json({ ok: false, error: 'Report non trovato.' });
    const data = await resolveData(report, body);
    await sendPdf(req, res, report, data, body);
  }));

  app.get('/api/v1/as400/status', wrap(async (req, res) => {
    res.json({ ok: true, drivers: await as400.driverStatus() });
  }));

  app.get('/api/v1/as400/systems', (req, res) => {
    res.json({ ok: true, systems: as400.readSystems().map(as400.publicSystem) });
  });

  app.post('/api/v1/as400/systems', wrap(async (req, res) => {
    res.json({ ok: true, system: as400.saveSystem(req.body || {}) });
  }));

  app.delete('/api/v1/as400/systems/:id', (req, res) => {
    as400.deleteSystem(req.params.id);
    res.json({ ok: true });
  });

  app.post('/api/v1/as400/test', wrap(async (req, res) => {
    const body = req.body || {};
    let system = null;
    if (body.system) {
      const saved = as400.saveSystem(body.system);
      system = as400.getSystem(saved.id);
    } else system = as400.getSystem(body.systemId);
    if (!system) return res.status(404).json({ ok: false, error: 'Sistema non trovato.' });
    const result = await as400.testSystem(system);
    res.json(Object.assign({ ok: true }, result));
  }));

  app.post('/api/v1/as400/query', wrap(async (req, res) => {
    const body = req.body || {};
    const system = as400.getSystem(body.systemId || body.system);
    const result = await as400.runQuery(system, body.sql, body.params || []);
    res.json(Object.assign({ ok: true }, result));
  }));

  app.post('/api/v1/as400/spool/extract', (req, res) => {
    const extracted = as400.spoolFromBody(req.body || {});
    res.json(Object.assign({ ok: true }, extracted));
  });

  app.get('/api/v1/spool/inbox', (req, res) => {
    res.json({ ok: true, files: store.listSpoolInbox() });
  });

  app.get('/api/v1/spool/inbox/:name', (req, res) => {
    const buffer = store.readSpoolInbox(req.params.name);
    if (!buffer) return res.status(404).json({ ok: false, error: 'Spool non trovato.' });
    res.type('text/plain; charset=utf-8').send(decodeSpoolBuffer(buffer));
  });

  app.post('/api/v1/spool/inbox', (req, res) => {
    const name = store.saveSpoolInbox((req.body || {}).name, (req.body || {}).text);
    res.json({ ok: true, name });
  });

  app.put('/api/v1/settings', (req, res) => {
    if (!isLocal(req)) return res.status(403).json({ ok: false, error: 'La chiave si cambia solo dal PC dove gira ASPDOCU.' });
    res.json({ ok: true, settings: store.saveSettings(req.body || {}) });
  });

  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    const status = error.status || 500;
    res.status(status).json({ ok: false, error: error.message || 'Errore imprevisto.' });
  });

  return app;
}

function start() {
  store.ensureSeed();
  const app = createApp();
  const server = app.listen(PORT, '0.0.0.0', () => {
    const urls = lanUrls(PORT);
    console.log('ASPDOCU in ascolto');
    urls.forEach((url) => console.log('  ' + url));
  });
  return server;
}

if (require.main === module) start();

module.exports = { createApp, start, resolveData };
