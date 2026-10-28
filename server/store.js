const fs = require('fs');
const path = require('path');
const {
  seedReports,
  demoSystem,
  blankReport,
  reportFromSpool,
  buildInvoiceSpool,
  invoiceHeader,
  invoiceRows
} = require('./samples');
const { extractSpool } = require('./spool');

const ROOT = path.join(__dirname, '..');
const DATA = path.join(ROOT, 'data');
const REPORTS = path.join(DATA, 'reports');
const SPOOL = path.join(DATA, 'spool');
const OUTPUT = path.join(ROOT, 'output');
const SETTINGS = path.join(DATA, 'settings.json');
const SYSTEMS = path.join(DATA, 'systems.json');

function safeId(id) {
  const value = String(id || '').trim();
  if (!/^[a-zA-Z0-9_-]{1,48}$/.test(value)) {
    const error = new Error('Codice non valido. Usa lettere, numeri, trattino o underscore.');
    error.status = 400;
    throw error;
  }
  return value;
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    return fallback;
  }
}

function ensureSeed() {
  fs.mkdirSync(REPORTS, { recursive: true });
  fs.mkdirSync(SPOOL, { recursive: true });
  fs.mkdirSync(OUTPUT, { recursive: true });
  for (const report of seedReports()) {
    const file = path.join(REPORTS, report.id + '.json');
    const existing = readJson(file, null);
    if (!existing || existing.seed === true) {
      fs.writeFileSync(file, JSON.stringify(report, null, 2));
    }
  }
  const systems = readJson(SYSTEMS, []);
  const list = Array.isArray(systems) ? systems : [];
  const demo = demoSystem();
  const index = list.findIndex((system) => system.id === 'demo');
  if (index < 0) list.unshift(demo);
  else list[index] = Object.assign({}, list[index], demo, { password: '', bridgeKey: '' });
  fs.writeFileSync(SYSTEMS, JSON.stringify(list, null, 2));
  const spoolFile = path.join(SPOOL, 'fattura-0158.txt');
  fs.writeFileSync(spoolFile, buildInvoiceSpool(invoiceHeader(), invoiceRows().slice(0, 5)));
  if (!fs.existsSync(SETTINGS)) fs.writeFileSync(SETTINGS, JSON.stringify({ token: '' }, null, 2));
}

function settings() {
  ensureSeed();
  return Object.assign({ token: '' }, readJson(SETTINGS, { token: '' }));
}

function saveSettings(next) {
  ensureSeed();
  const current = settings();
  const token = next.token == null ? current.token : String(next.token);
  fs.writeFileSync(SETTINGS, JSON.stringify({ token }, null, 2));
  return { tokenRequired: Boolean(token), token };
}

function listReports() {
  ensureSeed();
  return fs.readdirSync(REPORTS)
    .filter((name) => name.endsWith('.json'))
    .map((name) => readReport(name.replace(/\.json$/i, '')))
    .filter(Boolean)
    .map((report) => ({
      id: report.id,
      name: report.name,
      mode: report.mode,
      seed: Boolean(report.seed),
      source: report.source || { type: 'json' },
      page: report.page,
      updatedAt: report.updatedAt || null
    }));
}

function reportPath(id) {
  const safe = safeId(id);
  const exact = path.join(REPORTS, safe + '.json');
  if (fs.existsSync(exact)) return exact;
  const found = fs.readdirSync(REPORTS).find((name) => name.replace(/\.json$/i, '').toLowerCase() === safe.toLowerCase());
  if (!found) return null;
  return path.join(REPORTS, found);
}

function readReport(id) {
  ensureSeed();
  const file = reportPath(id);
  if (!file) return null;
  const report = readJson(file, null);
  if (report) report.id = path.basename(file, '.json');
  return report;
}

function writeReport(report) {
  ensureSeed();
  const id = safeId(report.id);
  const next = Object.assign({}, report, {
    id,
    seed: false,
    updatedAt: new Date().toISOString()
  });
  if (next.sampleSpool && String(next.sampleSpool).length > 1500000) {
    const error = new Error('Lo spool di esempio supera 1,5 MB.');
    error.status = 400;
    throw error;
  }
  fs.writeFileSync(path.join(REPORTS, id + '.json'), JSON.stringify(next, null, 2));
  return next;
}

function removeReport(id) {
  const file = reportPath(id);
  if (!file) return false;
  fs.unlinkSync(file);
  return true;
}

function createReport(body) {
  const id = safeId(body.id);
  if (reportPath(id)) {
    const error = new Error('Esiste già un report con questo codice.');
    error.status = 409;
    throw error;
  }
  const name = String(body.name || id).slice(0, 80);
  let report;
  if (body.from === 'blank' || !body.from) report = blankReport(id, name, body.preset || 'A4');
  else if (body.from === 'spool') {
    report = reportFromSpool(id, name, body.spool || body.spoolText || '', body.layout || body.spoolLayout, body.systemId);
    const extracted = extractSpool(report.sampleSpool, report.spoolLayout);
    report.sample = extracted.documents[0] || { header: {}, rows: [] };
    const fields = [];
    Object.keys(report.sample.header || {}).forEach((key) => fields.push({ name: key, role: 'header', format: 'text' }));
    Object.keys((report.sample.rows[0] || {})).forEach((key) => {
      if (!fields.some((field) => field.name === key)) fields.push({ name: key, role: 'detail', format: 'text' });
    });
    report.fields = fields;
  } else {
    const source = readReport(body.from);
    if (!source) {
      const error = new Error('Modello di partenza non trovato.');
      error.status = 404;
      throw error;
    }
    report = JSON.parse(JSON.stringify(source));
    report.id = id;
    report.name = name;
    report.seed = false;
  }
  return writeReport(report);
}

function listSpoolInbox() {
  ensureSeed();
  return fs.readdirSync(SPOOL)
    .filter((name) => name.endsWith('.txt') || name.endsWith('.spl') || name.endsWith('.spool'))
    .map((name) => ({ name, bytes: fs.statSync(path.join(SPOOL, name)).size }));
}

function readSpoolInbox(name) {
  const base = path.basename(String(name || ''));
  if (!/^[\w.\- ]+$/.test(base)) {
    const error = new Error('Nome spool non valido.');
    error.status = 400;
    throw error;
  }
  const file = path.join(SPOOL, base);
  if (!file.startsWith(SPOOL)) {
    const error = new Error('Percorso non consentito.');
    error.status = 400;
    throw error;
  }
  if (!fs.existsSync(file)) return null;
  return fs.readFileSync(file);
}

function saveSpoolInbox(name, text) {
  const base = path.basename(String(name || 'spool.txt')).replace(/[^\w.\-]+/g, '_');
  const fileName = base.includes('.') ? base : base + '.txt';
  fs.writeFileSync(path.join(SPOOL, fileName), String(text || ''), 'utf8');
  return fileName;
}

module.exports = {
  ROOT,
  DATA,
  OUTPUT,
  ensureSeed,
  settings,
  saveSettings,
  listReports,
  readReport,
  writeReport,
  removeReport,
  createReport,
  listSpoolInbox,
  readSpoolInbox,
  saveSpoolInbox,
  safeId
};
