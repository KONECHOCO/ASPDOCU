const fs = require('fs');
const path = require('path');
const { readReport, ensureSeed, OUTPUT } = require('./store');
const { renderPdf } = require('./render');
const { extractSpool } = require('./spool');

function arg(name, fallback) {
  const index = process.argv.indexOf(name);
  if (index === -1) return fallback;
  return process.argv[index + 1];
}

async function main() {
  ensureSeed();
  const id = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'fattura';
  const report = readReport(id);
  if (!report) {
    console.error('Report non trovato: ' + id);
    process.exit(1);
  }
  const spoolPath = arg('--spool');
  const dataPath = arg('--data');
  let data = report.sample;
  if (spoolPath) data = extractSpool(fs.readFileSync(spoolPath, 'utf8'), report.spoolLayout);
  else if (dataPath) data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  const pdf = await renderPdf(report, data);
  const out = arg('--out', path.join(OUTPUT, id + '.pdf'));
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, pdf);
  console.log(out + ' (' + pdf.length + ' byte)');
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
