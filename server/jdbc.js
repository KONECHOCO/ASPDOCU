const fs = require('fs');
const path = require('path');
const { spawn, execFile } = require('child_process');

const ROOT = path.join(__dirname, '..');
const TOOLS = path.join(ROOT, 'tools');
const JAR = path.join(TOOLS, 'jt400.jar');
const SOURCE = path.join(__dirname, 'jdbc-bridge', 'AspJdbc.java');
const CLASS_FILE = path.join(TOOLS, 'AspJdbc.class');
const JAR_URL = 'https://repo1.maven.org/maven2/net/sf/jt400/jt400/11.1/jt400-11.1.jar';

function exec(command, args) {
  return new Promise((resolve, reject) => {
    execFile(command, args, { timeout: 60000, windowsHide: true }, (error, stdout, stderr) => {
      if (error) {
        error.stderr = stderr;
        error.stdout = stdout;
        reject(error);
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

function javaAvailable() {
  return new Promise((resolve) => {
    execFile('java', ['-version'], { timeout: 8000, windowsHide: true }, (error) => {
      resolve(!error);
    });
  });
}

async function ensureJar() {
  if (fs.existsSync(JAR) && fs.statSync(JAR).size > 1000000) return JAR;
  fs.mkdirSync(TOOLS, { recursive: true });
  const response = await fetch(JAR_URL);
  if (!response.ok) {
    const error = new Error('Non riesco a scaricare IBM Toolbox (JT400) da Maven.');
    error.status = 503;
    throw error;
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(JAR, bytes);
  return JAR;
}

async function ensureClass() {
  const jar = await ensureJar();
  const fresh = fs.existsSync(CLASS_FILE) && fs.statSync(CLASS_FILE).mtimeMs >= fs.statSync(SOURCE).mtimeMs;
  if (fresh) return jar;
  fs.mkdirSync(TOOLS, { recursive: true });
  try {
    await exec('javac', ['--release', '8', '-encoding', 'UTF-8', '-cp', jar, '-d', TOOLS, SOURCE]);
  } catch (error) {
    const detail = (error.stderr || error.stdout || error.message || '').toString().trim();
    const wrapped = new Error(detail
      ? 'Compilazione del collegamento IBM i non riuscita. ' + detail.split(/\r?\n/)[0]
      : 'Manca javac. Installa un JDK, non solo il runtime Java. Il driver ODBC non serve.');
    wrapped.status = 503;
    throw wrapped;
  }
  return jar;
}

function frame(value) {
  const body = Buffer.from(String(value ?? ''), 'utf8');
  return Buffer.concat([Buffer.from(String(body.length) + '\n', 'ascii'), body]);
}

function requestBuffer(system, sql, params, maxRows) {
  const parts = [
    frame(system.host),
    frame(system.user),
    frame(system.password || ''),
    frame(system.port || ''),
    frame(system.library || ''),
    frame(system.naming || 'sql'),
    Buffer.from(String(maxRows || 2000) + '\n' + String((params || []).length) + '\n', 'ascii')
  ];
  (params || []).forEach((param) => parts.push(frame(param == null ? '' : param)));
  parts.push(frame(sql));
  return Buffer.concat(parts);
}

function runJava(args, input, timeoutMs) {
  return new Promise((resolve, reject) => {
    const child = spawn('java', args, { windowsHide: true });
    const out = [];
    const err = [];
    const timer = setTimeout(() => {
      child.kill();
      const error = new Error('Connessione IBM i scaduta. Controlla host, utente, password e che le porte del server (8471 e 8476) siano raggiungibili.');
      error.status = 504;
      reject(error);
    }, timeoutMs || 25000);
    child.stdout.on('data', (chunk) => out.push(chunk));
    child.stderr.on('data', (chunk) => err.push(chunk));
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', () => {
      clearTimeout(timer);
      resolve({
        stdout: Buffer.concat(out).toString('utf8'),
        stderr: Buffer.concat(err).toString('utf8')
      });
    });
    child.stdin.end(input);
  });
}

function parseResult(stdout, stderr) {
  const line = String(stdout || '').trim().split(/\r?\n/).reverse().find((item) => item.startsWith('{'));
  if (!line) {
    const error = new Error((stderr || 'Java non ha risposto. Verifica che Java sia installato.').trim().slice(0, 500));
    error.status = 503;
    throw error;
  }
  let payload;
  try {
    payload = JSON.parse(line);
  } catch (error) {
    const wrapped = new Error('Risposta IBM i illeggibile.');
    wrapped.status = 502;
    throw wrapped;
  }
  if (!payload.ok) {
    const wrapped = new Error(payload.error || 'IBM i ha rifiutato la connessione.');
    wrapped.status = 502;
    throw wrapped;
  }
  return payload;
}

async function pingJdbc() {
  const jar = await ensureClass();
  const result = await runJava(['-cp', jar + path.delimiter + TOOLS, 'AspJdbc', 'ping'], Buffer.alloc(0), 20000);
  return parseResult(result.stdout, result.stderr);
}

async function queryJdbc(system, sql, params) {
  if (!await javaAvailable()) {
    const error = new Error('Java non è installato. Il collegamento diretto non usa ODBC: serve solo Java 8 o successivo.');
    error.status = 503;
    throw error;
  }
  if (!system.host || !system.user) {
    const error = new Error('Indica host e utente del sistema IBM i.');
    error.status = 400;
    throw error;
  }
  const jar = await ensureClass();
  const classpath = jar + path.delimiter + TOOLS;
  const result = await runJava(
    ['-cp', classpath, 'AspJdbc'],
    requestBuffer(system, sql, params, 2000),
    30000
  );
  const payload = parseResult(result.stdout, result.stderr);
  const rows = payload.rows || [];
  return {
    demo: false,
    message: 'Query eseguita su ' + system.host + ' senza ODBC.',
    columns: payload.columns || (rows[0] ? Object.keys(rows[0]) : []),
    rows
  };
}

module.exports = { javaAvailable, ensureClass, pingJdbc, queryJdbc };
