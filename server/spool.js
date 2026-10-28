function sliceField(lines, line, col, len) {
  const raw = lines[(line || 1) - 1] || '';
  const start = Math.max(0, (col || 1) - 1);
  const size = Math.max(0, len || 0);
  return raw.substring(start, start + size).trim();
}

function splitPages(text, linesPerPage) {
  const normalized = String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const chunks = normalized.includes('\f') ? normalized.split('\f') : null;
  if (chunks) return chunks.map((chunk) => chunk.split('\n'));
  const lines = normalized.split('\n');
  const size = Math.max(1, linesPerPage || lines.length || 66);
  const pages = [];
  for (let i = 0; i < lines.length; i += size) pages.push(lines.slice(i, i + size));
  return pages.length ? pages : [[]];
}

function extractDetail(lines, detail) {
  if (!detail) return [];
  const from = detail.fromLine || 1;
  const to = detail.toLine || from;
  const fields = detail.fields || [];
  const rows = [];
  for (let line = from; line <= to; line += 1) {
    const row = {};
    let empty = true;
    for (const field of fields) {
      const value = sliceField(lines, line, field.col, field.len);
      row[field.name] = value;
      if (value) empty = false;
    }
    if (!empty) rows.push(row);
  }
  return rows;
}

function extractSpool(text, layout) {
  const map = layout || {};
  const pages = splitPages(text, map.linesPerPage || 66);
  const documents = [];
  let current = null;
  for (const lines of pages) {
    const header = {};
    for (const field of map.headerFields || []) {
      header[field.name] = sliceField(lines, field.line, field.col, field.len);
    }
    const rows = extractDetail(lines, map.detail);
    const breakField = map.breakField;
    const sameDoc = current && breakField && current.header[breakField] && current.header[breakField] === header[breakField];
    if (sameDoc) current.rows.push(...rows);
    else {
      current = { header, rows };
      documents.push(current);
    }
  }
  return { documents };
}

function decodeSpoolBuffer(buffer) {
  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer || '');
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    return buf.slice(3).toString('utf8');
  }
  const utf = buf.toString('utf8');
  if (!utf.includes('\uFFFD') && /[A-Za-z]/.test(utf)) return utf;
  for (const encoding of ['ibm280', 'cp037', 'latin1']) {
    try {
      const text = new TextDecoder(encoding).decode(buf);
      if (/[A-Za-z0-9]/.test(text)) return text;
    } catch (error) {
      /* prova la codifica successiva */
    }
  }
  return buf.toString('latin1');
}

module.exports = { sliceField, splitPages, extractSpool, decodeSpoolBuffer };
