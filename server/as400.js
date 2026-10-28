const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { extractSpool, decodeSpoolBuffer } = require('./spool');
const { fatturaReport } = require('./samples');
const jdbc = require('./jdbc');

const DATA = path.join(__dirname, '..', 'data');
const SYSTEMS = path.join(DATA, 'systems.json');

function readSystems() {
  try {
    const parsed = JSON.parse(fs.readFileSync(SYSTEMS, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
}

function writeSystems(systems) {
  fs.mkdirSync(DATA, { recursive: true });
  fs.writeFileSync(SYSTEMS, JSON.stringify(systems, null, 2));
}

function publicSystem(system) {
  if (!system) return null;
  const copy = Object.assign({}, system);
  copy.hasPassword = Boolean(system.password);
  delete copy.password;
  delete copy.bridgeKey;
  copy.hasBridgeKey = Boolean(system.bridgeKey);
  return copy;
}

function getSystem(id) {
  return readSystems().find((system) => system.id === id) || null;
}

function saveSystem(input, previous) {
  const systems = readSystems();
  const id = String(input.id || '').trim();
  if (!/^[a-zA-Z0-9_-]{1,48}$/.test(id)) {
    const error = new Error('Codice sistema non valido. Usa lettere, numeri, _ o -.');
    error.status = 400;
    throw error;
  }
  const current = previous || systems.find((system) => system.id === id) || {};
  const password = input.password && input.password !== '********'
    ? input.password
    : (current.password || '');
  const bridgeKey = input.bridgeKey && input.bridgeKey !== '********'
    ? input.bridgeKey
    : (current.bridgeKey || '');
  const next = {
    id,
    name: String(input.name || id).slice(0, 80),
    type: ['demo', 'jdbc', 'odbc', 'ponte'].includes(input.type) ? input.type : 'jdbc',
    host: String(input.host || '').trim(),
    port: Number(input.port) || 8471,
    user: String(input.user || '').trim(),
    password,
    library: String(input.library || '').trim(),
    naming: input.naming === 'system' ? 'system' : 'sql',
    ccsid: Number(input.ccsid) || 280,
    driver: String(input.driver || 'IBM i Access ODBC Driver').trim(),
    bridgeUrl: String(input.bridgeUrl || '').trim(),
    bridgeKey
  };
  assertConnectionSafe(next);
  const index = systems.findIndex((system) => system.id === id);
  if (index >= 0) systems[index] = next;
  else systems.push(next);
  writeSystems(systems);
  return publicSystem(next);
}

function deleteSystem(id) {
  if (id === 'demo') {
    const error = new Error('Il sistema di esempio non si elimina.');
    error.status = 400;
    throw error;
  }
  writeSystems(readSystems().filter((system) => system.id !== id));
}

function assertConnectionSafe(system) {
  const fields = [system.host, system.user, system.library, system.driver];
  for (const field of fields) {
    if (/[;{}]/.test(field || '')) {
      const error = new Error('Host, utente, libreria e driver non possono contenere ; { }');
      error.status = 400;
      throw error;
    }
  }
  if (system.type === 'odbc' && /[;]/.test(system.password || '')) {
    const error = new Error('Con ODBC la password non può contenere ;. Il collegamento diretto, senza ODBC, non ha questo limite.');
    error.status = 400;
    throw error;
  }
}

function connectionString(system) {
  assertConnectionSafe(system);
  const parts = [
    `Driver={${system.driver}}`,
    `System=${system.host}`,
    `Uid=${system.user}`,
    `Pwd=${system.password || ''}`,
    `Port=${system.port || 8471}`,
    `CCSID=${system.ccsid || 280}`,
    'CommitMode=2'
  ];
  if (system.library) parts.push(`DefaultLibraries=${system.library}`);
  parts.push(system.naming === 'system' ? 'Naming=1' : 'Naming=0');
  return parts.join(';') + ';';
}

function loadOdbc() {
  try {
    return require('odbc');
  } catch (error) {
    return null;
  }
}

function withTimeout(promise, ms, message) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Object.assign(new Error(message), { status: 504 })), ms);
    promise.then((value) => {
      clearTimeout(timer);
      resolve(value);
    }, (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

let driverCache = { at: 0, names: [] };

function listInstalledDrivers() {
  if (process.platform !== 'win32') return Promise.resolve([]);
  if (Date.now() - driverCache.at < 20000) return Promise.resolve(driverCache.names);
  return new Promise((resolve) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', 'Get-OdbcDriver | Select-Object -ExpandProperty Name'],
      { timeout: 8000, windowsHide: true },
      (error, stdout) => {
        const names = error ? [] : String(stdout || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
        driverCache = { at: Date.now(), names };
        resolve(names);
      }
    );
  });
}

async function driverStatus() {
  const java = await jdbc.javaAvailable();
  const odbc = loadOdbc();
  const installed = await listInstalledDrivers();
  const ibm = installed.filter((name) => /IBM|iSeries|Client Access|AS\/400/i.test(name));
  return {
    java,
    package: Boolean(odbc),
    drivers: ibm,
    allDrivers: installed,
    ready: java,
    hint: java
      ? 'Collegamento diretto pronto: Java parla con l\'IBM i, senza driver ODBC.'
      : 'Installa Java 8 o successivo. Il collegamento diretto non usa ODBC.'
  };
}

function flattenSample(sample, params) {
  const header = Object.assign({}, sample.header || {});
  if (params && params.length && params[0]) header.numero = String(params[0]);
  const rows = (sample.rows || []).map((row) => Object.assign({}, header, row));
  return {
    demo: true,
    message: 'Sistema dimostrativo: queste righe sono locali. Un sistema diretto esegue il SQL sul DB2 for i, senza ODBC.',
    columns: rows[0] ? Object.keys(rows[0]) : [],
    rows,
    header,
    detail: sample.rows || []
  };
}

function normalizeRow(record) {
  const row = {};
  for (const [key, value] of Object.entries(record || {})) {
    if (typeof value === 'bigint') row[key] = Number(value);
    else if (value instanceof Date) row[key] = value.toLocaleDateString('it-IT');
    else if (Buffer.isBuffer(value)) row[key] = value.toString('utf8');
    else row[key] = value;
  }
  return row;
}

async function queryOdbc(system, sql, params) {
  const odbc = loadOdbc();
  if (!odbc) {
    const error = new Error('ODBC non installato. Nel tipo di connessione scegli «Diretto, senza ODBC»: usa Java e non chiede il driver.');
    error.status = 503;
    throw error;
  }
  if (!system.host || !system.user) {
    const error = new Error('Indica host e utente del sistema IBM i.');
    error.status = 400;
    throw error;
  }
  const connection = await withTimeout(
    odbc.connect(connectionString(system)),
    12000,
    'Connessione AS/400 scaduta. Controlla host, porta 8471, utente e che il server database sia avviato.'
  );
  try {
    const statement = String(sql || 'SELECT CURRENT_SERVER AS SERVER FROM SYSIBM.SYSDUMMY1');
    const bound = (params || []).map((value) => value == null ? null : String(value));
    const result = await withTimeout(connection.query(statement, bound), 20000, 'Query AS/400 scaduta.');
    const rows = Array.from(result || []).map(normalizeRow);
    return {
      demo: false,
      message: 'Query eseguita su ' + system.host,
      columns: rows[0] ? Object.keys(rows[0]) : [],
      rows
    };
  } finally {
    try { await connection.close(); } catch (error) { /* chiusura già avvenuta */ }
  }
}

async function queryBridge(system, sql, params) {
  if (!system.bridgeUrl) {
    const error = new Error('Indica l\'URL del ponte HTTP.');
    error.status = 400;
    throw error;
  }
  const headers = { 'Content-Type': 'application/json' };
  if (system.bridgeKey) headers['X-Aspdocu-Key'] = system.bridgeKey;
  const response = await withTimeout(fetch(system.bridgeUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify({ sql, params: params || [], library: system.library })
  }), 12000, 'Ponte AS/400 scaduto.');
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error || 'Il ponte ha risposto ' + response.status);
    error.status = 502;
    throw error;
  }
  const rows = Array.isArray(payload.rows) ? payload.rows : [];
  return {
    demo: false,
    message: 'Dati ricevuti dal ponte ' + system.bridgeUrl,
    columns: rows[0] ? Object.keys(rows[0]) : (payload.columns || []),
    rows
  };
}

async function testSystem(system) {
  if (!system || system.type === 'demo') {
    return {
      ok: true,
      demo: true,
      server: 'DEMO',
      user: 'DEMO',
      message: 'Collegamento di esempio attivo. Librerie finte: VENDITE, ANAGRAFICHE. Per il sistema vero scegli il tipo Diretto, senza ODBC.'
    };
  }
  const probe = 'SELECT CURRENT_SERVER AS SERVER, CURRENT_USER AS UTENTE FROM SYSIBM.SYSDUMMY1';
  if (system.type === 'ponte') {
    const result = await queryBridge(system, probe, []);
    return { ok: true, demo: false, message: result.message, row: result.rows[0] || null };
  }
  if (system.type === 'odbc') {
    const result = await queryOdbc(system, probe, []);
    return { ok: true, demo: false, message: 'Connesso a IBM i tramite ODBC.', row: result.rows[0] || null };
  }
  const result = await jdbc.queryJdbc(system, probe, []);
  return {
    ok: true,
    demo: false,
    message: 'Connesso a IBM i senza ODBC.',
    row: result.rows[0] || null
  };
}

async function runQuery(system, sql, params) {
  if (!system) {
    const error = new Error('Sistema AS/400 non trovato.');
    error.status = 404;
    throw error;
  }
  if (system.type === 'demo') return flattenSample(fatturaReport().sample, params);
  if (system.type === 'ponte') return queryBridge(system, sql, params);
  if (system.type === 'odbc') return queryOdbc(system, sql, params);
  return jdbc.queryJdbc(system, sql, params);
}

function spoolFromBody(body) {
  const layout = body.layout || body.spoolLayout;
  const text = body.spool || body.text || '';
  return extractSpool(text, layout);
}

module.exports = {
  readSystems,
  writeSystems,
  publicSystem,
  getSystem,
  saveSystem,
  deleteSystem,
  driverStatus,
  testSystem,
  runQuery,
  spoolFromBody,
  decodeSpoolBuffer,
  connectionString
};
