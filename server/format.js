function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function toNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (value == null) return 0;
  let s = String(value).trim();
  if (!s) return 0;
  s = s.replace(/\s/g, '').replace(/€/g, '');
  if (s.includes(',') && s.includes('.')) s = s.replace(/\./g, '').replace(',', '.');
  else if (s.includes(',')) s = s.replace(',', '.');
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

function sumField(rows, name) {
  const cents = (rows || []).reduce((sum, row) => sum + Math.round(toNumber(row[name]) * 100), 0);
  return cents / 100;
}

function evalFormula(expr, rows) {
  const source = String(expr || '').trim();
  if (!source) return 0;
  const tokens = source.replace(/\s+/g, '').replace(/-/g, '+-').split('+').filter(Boolean);
  let total = 0;
  for (let token of tokens) {
    let sign = 1;
    if (token.startsWith('-')) {
      sign = -1;
      token = token.slice(1);
    }
    const sum = token.match(/^sum\(([A-Za-z0-9_]+)\)$/i);
    const pct = token.match(/^percent\(([A-Za-z0-9_]+),([0-9]+(?:[.,][0-9]+)?)\)$/i);
    const num = token.match(/^([0-9]+(?:[.,][0-9]+)?)$/);
    if (sum) total += sign * sumField(rows, sum[1]);
    else if (pct) {
      const rate = parseFloat(pct[2].replace(',', '.'));
      total += sign * round2(sumField(rows, pct[1]) * rate / 100);
    } else if (num) total += sign * parseFloat(num[1].replace(',', '.'));
    else {
      const error = new Error('Formula non valida: ' + expr);
      error.status = 400;
      throw error;
    }
  }
  return round2(total);
}

function formatValue(value, format) {
  if (value == null) return '';
  if (format === 'currency' || format === 'number') {
    return round2(toNumber(value)).toLocaleString('it-IT', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }
  if (format === 'integer') {
    return Math.round(toNumber(value)).toLocaleString('it-IT');
  }
  if (format === 'upper') return String(value).toUpperCase();
  return String(value);
}

function guessFormat(name, value) {
  const key = String(name || '').toLowerCase();
  if (/data|date/.test(key)) return 'date';
  if (typeof value === 'number' || (typeof value === 'string' && /^-?\d[\d.,]*$/.test(value.trim()))) {
    if (/importo|prezzo|totale|iva|imponibile/.test(key)) return 'currency';
    return 'number';
  }
  return 'text';
}

module.exports = { round2, toNumber, sumField, evalFormula, formatValue, guessFormat };
