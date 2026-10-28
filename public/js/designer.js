(function () {
  const BANDS = [
    ['reportHeader', 'Intestazione report', 'Una volta, all\'inizio'],
    ['pageHeader', 'Intestazione pagina', 'Si ripete in ogni pagina'],
    ['groupHeader', 'Intestazione gruppo', 'Quando cambia il gruppo'],
    ['detail', 'Dettaglio', 'Una volta per ogni riga'],
    ['groupFooter', 'Piè di gruppo', 'Totali del gruppo'],
    ['pageFooter', 'Piè di pagina', 'In fondo a ogni pagina'],
    ['reportFooter', 'Piè di report', 'Una volta, dopo l\'ultima riga']
  ];
  const TOOLS = [
    ['select', 'Selezione'],
    ['label', 'Etichetta'],
    ['field', 'Campo'],
    ['formula', 'Formula'],
    ['box', 'Rettangolo'],
    ['line', 'Linea'],
    ['image', 'Immagine'],
    ['barcode', 'Barcode'],
    ['qr', 'QR'],
    ['pageNumber', 'N. pagina'],
    ['dateNow', 'Data']
  ];
  const SCALE = 3.15;
  let saveTimer = null;
  let histTimer = null;

  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[ch]));
  }

  function px(mm) {
    return (Number(mm) || 0) * SCALE * window.Asp.zoom;
  }

  function contentWidth(report) {
    const page = report.page;
    return Math.max(20, page.width - page.marginLeft - page.marginRight);
  }

  function bandOf(role) {
    return window.Asp.report.bands.find((band) => band.role === role);
  }

  function findElement(id) {
    const report = window.Asp.report;
    if (!report || !id) return null;
    for (const band of report.bands) {
      const element = (band.elements || []).find((item) => item.id === id);
      if (element) return { band, element };
    }
    return null;
  }

  function sampleContext() {
    const sample = window.Asp.report.sample || { header: {}, rows: [] };
    return Object.assign({ PAGE: 1, PAGES: 1 }, sample.header || {}, (sample.rows || [])[0] || {});
  }

  function designText(element) {
    const ctx = sampleContext();
    const rows = (window.Asp.report.sample && window.Asp.report.sample.rows) || [];
    if (element.type === 'label' || element.type === 'pageNumber') return window.AspFormat.interpolate(element.text, ctx) || element.text || '';
    if (element.type === 'dateNow') return new Date().toLocaleDateString('it-IT');
    if (element.type === 'field') {
      const value = ctx[element.field];
      if (value == null || value === '') return '«' + (element.field || 'campo') + '»';
      return window.AspFormat.formatValue(value, element.format || 'text');
    }
    if (element.type === 'formula') {
      const value = window.AspFormat.evalFormula(element.expr, rows);
      if (!Number.isFinite(value)) return element.expr || 'formula';
      return window.AspFormat.formatValue(value, element.format || 'currency');
    }
    if (element.type === 'barcode' || element.type === 'qr') return String(ctx[element.field] || element.text || element.field || '');
    return '';
  }

  function newElement(type, x, y) {
    const report = window.Asp.report;
    const fields = report.fields || [];
    const detail = fields.find((field) => field.role === 'detail') || fields[0];
    const base = {
      id: 'e' + Math.random().toString(36).slice(2, 8),
      type,
      x: snap(Math.max(0, x)),
      y: snap(Math.max(0, y)),
      w: 42,
      h: 6,
      text: '',
      field: detail ? detail.name : '',
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
    };
    if (type === 'label') base.text = 'Testo';
    if (type === 'box') { base.w = 46; base.h = 18; base.borderWidth = 0.3; base.fill = '#f6f3ec'; }
    if (type === 'line') { base.w = 50; base.h = 0.35; base.borderColor = '#243044'; }
    if (type === 'image') { base.w = 32; base.h = 22; }
    if (type === 'barcode') { base.w = 48; base.h = 16; base.barcode = 'code128'; }
    if (type === 'qr') { base.type = 'qr'; base.w = 22; base.h = 22; base.barcode = 'qrcode'; }
    if (type === 'pageNumber') { base.text = 'Pagina {PAGE} di {PAGES}'; base.w = 46; base.size = 8; base.color = '#5c6570'; }
    if (type === 'dateNow') { base.w = 28; }
    if (type === 'formula') {
      base.expr = fields.some((field) => field.name === 'importo') ? 'sum(importo)' : 'sum(' + (detail ? detail.name : 'importo') + ')';
      base.format = 'currency';
      base.align = 'right';
      base.w = 32;
    }
    if (type === 'field' && detail) base.format = detail.format || 'text';
    return base;
  }

  function snap(value) {
    const n = Math.round(Number(value) * 10) / 10;
    if (!window.Asp.snap) return n;
    const grid = window.Asp.grid || 1;
    return Math.round(n / grid) * grid;
  }

  function touch(full) {
    if (full) paintCanvas();
    scheduleHistory();
    scheduleSave();
    paintSource();
    const found = findElement(window.Asp.selectedId);
    const box = document.getElementById('sel-readout');
    if (box) {
      box.textContent = found
        ? found.element.type + '  x ' + found.element.x + '  y ' + found.element.y + ' mm'
        : 'Nessuna selezione';
    }
  }

  function scheduleHistory() {
    clearTimeout(histTimer);
    histTimer = setTimeout(pushHistory, 350);
  }

  function pushHistory() {
    const report = window.Asp.report;
    if (!report) return;
    const snapText = JSON.stringify(report);
    if (window.Asp.history[window.Asp.hist] === snapText) return;
    window.Asp.history = window.Asp.history.slice(0, window.Asp.hist + 1);
    window.Asp.history.push(snapText);
    if (window.Asp.history.length > 60) {
      window.Asp.history.shift();
    }
    window.Asp.hist = window.Asp.history.length - 1;
  }

  function loadHistory(index) {
    window.Asp.hist = index;
    window.Asp.report = JSON.parse(window.Asp.history[index]);
    if (!findElement(window.Asp.selectedId)) window.Asp.selectedId = null;
    paintCanvas();
    paintInspector();
    paintPageForm();
    scheduleSave();
  }

  function scheduleSave() {
    const label = document.getElementById('save-state');
    if (label) label.textContent = 'Modifiche in sospeso';
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveReport, 700);
  }

  async function saveReport() {
    const report = window.Asp.report;
    const label = document.getElementById('save-state');
    if (!report) return;
    try {
      if (label) label.textContent = 'Salvataggio…';
      const data = await window.AspApi.send('PUT', '/api/v1/reports/' + encodeURIComponent(report.id), report);
      window.Asp.report.updatedAt = data.report.updatedAt;
      window.Asp.report.seed = false;
      if (label) label.textContent = 'Salvato';
      if (window.AspUi) window.AspUi.refreshList();
    } catch (error) {
      if (label) label.textContent = error.message;
    }
  }

  function paintShell() {
    const rail = document.getElementById('tool-rail');
    rail.innerHTML = `
      <div class="tool-block">
        <h2>Strumenti</h2>
        <div class="tools">${TOOLS.map(([id, name]) => `<button type="button" class="tool ${id === 'select' ? 'on' : ''}" data-tool="${id}">${name}</button>`).join('')}</div>
      </div>
      <div class="tool-block">
        <h2>Report</h2>
        <select id="report-select"></select>
        <div class="row-buttons">
          <button type="button" id="btn-new" class="ghost">Nuovo</button>
          <button type="button" id="btn-duplicate" class="ghost">Duplica</button>
          <button type="button" id="btn-delete" class="ghost danger">Elimina</button>
        </div>
      </div>
      <div class="tool-block">
        <h2>Pagina</h2>
        <label>Formato<select id="page-format"><option>A4</option><option>A5</option><option>Letter</option><option>Etichetta</option></select></label>
        <label>Orientamento<select id="page-orient"><option value="portrait">Verticale</option><option value="landscape">Orizzontale</option></select></label>
        <label>Modalità<select id="page-mode"><option value="document">Documento, righe in sequenza</option><option value="label">Etichetta, una pagina per riga</option></select></label>
        <div class="margins">
          <label>Alto<input id="m-top" type="number" min="0" step="1"></label>
          <label>Destra<input id="m-right" type="number" min="0" step="1"></label>
          <label>Basso<input id="m-bottom" type="number" min="0" step="1"></label>
          <label>Sinistra<input id="m-left" type="number" min="0" step="1"></label>
        </div>
        <label class="check"><input id="snap" type="checkbox" checked> Griglia 2 mm</label>
      </div>
      <div class="tool-block source-card" id="source-card"></div>`;
    document.getElementById('stage-bar').innerHTML = `
      <button type="button" id="zoom-out" title="Riduci">−</button>
      <span id="zoom-label">100%</span>
      <button type="button" id="zoom-in" title="Ingrandisci">+</button>
      <button type="button" id="undo" class="ghost">Annulla</button>
      <button type="button" id="redo" class="ghost">Ripeti</button>
      <button type="button" id="align-left" class="ghost">Sinistra</button>
      <button type="button" id="align-center" class="ghost">Centro</button>
      <button type="button" id="align-right" class="ghost">Destra</button>
      <button type="button" id="delete-el" class="ghost danger">Cancella</button>
      <span id="sel-readout">Nessuna selezione</span>`;
    rail.querySelectorAll('[data-tool]').forEach((button) => {
      button.addEventListener('click', () => {
        window.Asp.tool = button.dataset.tool;
        rail.querySelectorAll('[data-tool]').forEach((item) => item.classList.toggle('on', item === button));
        document.getElementById('desk').dataset.tool = window.Asp.tool;
      });
    });
    document.getElementById('report-select').addEventListener('change', (event) => window.AspUi.openReport(event.target.value));
    document.getElementById('btn-new').addEventListener('click', () => window.AspUi.newReport());
    document.getElementById('btn-duplicate').addEventListener('click', () => window.AspUi.duplicateReport());
    document.getElementById('btn-delete').addEventListener('click', () => window.AspUi.deleteReport());
    document.getElementById('page-format').addEventListener('change', applyPage);
    document.getElementById('page-orient').addEventListener('change', applyPage);
    document.getElementById('page-mode').addEventListener('change', applyPage);
    ['m-top', 'm-right', 'm-bottom', 'm-left'].forEach((id) => {
      document.getElementById(id).addEventListener('input', applyPage);
    });
    document.getElementById('snap').addEventListener('change', (event) => {
      window.Asp.snap = event.target.checked;
    });
    document.getElementById('zoom-in').addEventListener('click', () => setZoom(window.Asp.zoom + 0.1));
    document.getElementById('zoom-out').addEventListener('click', () => setZoom(window.Asp.zoom - 0.1));
    document.getElementById('undo').addEventListener('click', () => { if (window.Asp.hist > 0) loadHistory(window.Asp.hist - 1); });
    document.getElementById('redo').addEventListener('click', () => {
      if (window.Asp.hist < window.Asp.history.length - 1) loadHistory(window.Asp.hist + 1);
    });
    document.getElementById('align-left').addEventListener('click', () => align('left'));
    document.getElementById('align-center').addEventListener('click', () => align('center'));
    document.getElementById('align-right').addEventListener('click', () => align('right'));
    document.getElementById('delete-el').addEventListener('click', removeSelected);
    document.getElementById('desk').addEventListener('pointerdown', onDeskPointer);
    document.addEventListener('keydown', onKey);
  }

  function setZoom(value) {
    window.Asp.zoom = Math.min(1.8, Math.max(0.5, Math.round(value * 10) / 10));
    const label = document.getElementById('zoom-label');
    if (label) label.textContent = Math.round(window.Asp.zoom * 100) + '%';
    paintCanvas();
  }

  function presets() {
    return (window.Asp.info && window.Asp.info.presets) || {
      A4: { width: 210, height: 297 },
      A5: { width: 148, height: 210 },
      Letter: { width: 215.9, height: 279.4 },
      Etichetta: { width: 100, height: 150 }
    };
  }

  function applyPage() {
    const report = window.Asp.report;
    if (!report) return;
    const format = document.getElementById('page-format').value;
    const orientation = document.getElementById('page-orient').value;
    const size = presets()[format] || presets().A4;
    let width = size.width;
    let height = size.height;
    if (orientation === 'landscape') { const swap = width; width = height; height = swap; }
    report.page.format = format;
    report.page.orientation = orientation;
    report.page.width = width;
    report.page.height = height;
    report.page.marginTop = numberValue('m-top', report.page.marginTop);
    report.page.marginRight = numberValue('m-right', report.page.marginRight);
    report.page.marginBottom = numberValue('m-bottom', report.page.marginBottom);
    report.page.marginLeft = numberValue('m-left', report.page.marginLeft);
    report.mode = document.getElementById('page-mode').value;
    paintCanvas();
    scheduleHistory();
    scheduleSave();
  }

  function numberValue(id, fallback) {
    const value = Number(document.getElementById(id).value);
    return Number.isFinite(value) ? value : fallback;
  }

  function paintPageForm() {
    const page = window.Asp.report.page;
    setIfIdle('page-format', page.format || 'A4');
    setIfIdle('page-orient', page.orientation || 'portrait');
    setIfIdle('page-mode', window.Asp.report.mode || 'document');
    setIfIdle('m-top', page.marginTop);
    setIfIdle('m-right', page.marginRight);
    setIfIdle('m-bottom', page.marginBottom);
    setIfIdle('m-left', page.marginLeft);
    const select = document.getElementById('report-select');
    if (select) {
      select.innerHTML = window.Asp.reports.map((report) => `<option value="${esc(report.id)}">${esc(report.name)}</option>`).join('');
      select.value = window.Asp.report.id;
    }
  }

  function setIfIdle(id, value) {
    const node = document.getElementById(id);
    if (!node || document.activeElement === node) return;
    node.value = value;
  }

  function paintSource() {
    const card = document.getElementById('source-card');
    const report = window.Asp.report;
    if (!card || !report) return;
    const source = report.source || { type: 'json' };
    const names = { json: 'JSON del programma', sql: 'SQL su IBM i', spool: 'Spool AS/400' };
    const system = (window.Asp.systems || []).find((item) => item.id === source.systemId);
    card.innerHTML = `
      <h2>AS/400 e dati</h2>
      <p class="source-kicker">${esc(names[source.type] || source.type)}</p>
      <p>${system ? esc(system.name) : 'Nessun sistema collegato a questo report'}</p>
      <p class="muted">${source.sql ? 'SQL pronto nel report.' : ''} ${report.sampleSpool ? 'Spool di esempio presente.' : ''}</p>
      <button type="button" id="goto-as400">Apri connessione AS/400</button>`;
    document.getElementById('goto-as400').addEventListener('click', () => window.AspUi.show('as400'));
  }

  function paintCanvas() {
    const desk = document.getElementById('desk');
    const report = window.Asp.report;
    if (!desk || !report) return;
    const page = report.page;
    const inner = contentWidth(report);
    const rows = BANDS.map(([role, title, hint]) => {
      const band = bandOf(role);
      const height = band ? band.height : 0;
      const elements = (band && band.elements) || [];
      if (!(height > 0)) {
        return `<div class="band-row collapsed" data-role="${role}">
          <div class="rail"><strong>${title}</strong><span>${hint}</span>
            <button type="button" class="expand" data-expand="${role}">Mostra sezione</button>
          </div>
        </div>`;
      }
      const body = elements.map((element, index) => elementHtml(element, index)).join('');
      const group = role === 'groupHeader' || role === 'groupFooter'
        ? `<label class="group-by">Campo <select data-group>${fieldOptions(report.groupBy)}</select></label>`
        : '';
      return `<div class="band-row" data-role="${role}">
        <div class="rail"><strong>${title}</strong><span>${hint}</span>${group}</div>
        <div class="band-slot" style="padding:0 ${px(page.marginRight)}px 0 ${px(page.marginLeft)}px">
          <div class="band ${role}" data-role="${role}" data-mm="${height}" style="width:${px(inner)}px;height:${px(height)}px;background-size:${px(window.Asp.grid)}px ${px(window.Asp.grid)}px">
            ${body}
            <div class="band-resizer" data-resize-band="${role}"></div>
          </div>
        </div>
      </div>`;
    }).join('');
    desk.innerHTML = `
      <div class="sheet-wrap">
        <div class="ruler" style="width:${px(inner)}px;margin-left:${140 + px(page.marginLeft)}px">${ruler(inner)}</div>
        <div class="paper-edge top" style="width:${px(page.width)}px;margin-left:140px;height:${px(page.marginTop)}px"></div>
        ${rows}
        <div class="paper-edge bottom" style="width:${px(page.width)}px;margin-left:140px;height:${px(page.marginBottom)}px"></div>
        <p class="sheet-note">${esc(page.format)} ${page.width} × ${page.height} mm · il dettaglio si ripete nel PDF, qui lo disegni una volta come in Access</p>
      </div>`;
    desk.dataset.tool = window.Asp.tool;
    desk.querySelectorAll('[data-expand]').forEach((button) => {
      button.addEventListener('click', () => {
        const band = bandOf(button.dataset.expand);
        band.height = 16;
        pushHistory();
        paintCanvas();
        scheduleSave();
      });
    });
    desk.querySelectorAll('[data-group]').forEach((select) => {
      select.addEventListener('click', (event) => event.stopPropagation());
      select.addEventListener('change', () => {
        window.Asp.report.groupBy = select.value;
        desk.querySelectorAll('[data-group]').forEach((other) => { other.value = select.value; });
        scheduleHistory();
        scheduleSave();
      });
    });
  }

  function fieldOptions(selected) {
    const names = fieldNames();
    return `<option value="">(nessun gruppo)</option>` + names.map((name) => `<option ${name === selected ? 'selected' : ''}>${esc(name)}</option>`).join('');
  }

  function fieldNames() {
    const report = window.Asp.report;
    const names = new Set((report.fields || []).map((field) => field.name));
    Object.keys((report.sample && report.sample.header) || {}).forEach((name) => names.add(name));
    Object.keys(((report.sample && report.sample.rows && report.sample.rows[0]) || {})).forEach((name) => names.add(name));
    return Array.from(names);
  }

  function ruler(width) {
    let html = '';
    for (let mm = 0; mm <= width; mm += 10) html += `<span style="left:${px(mm)}px">${mm}</span>`;
    return html;
  }

  function elementHtml(element, index) {
    const selected = element.id === window.Asp.selectedId ? ' selected' : '';
    const text = designText(element);
    let inner = esc(text);
    if (element.type === 'box') inner = '';
    if (element.type === 'line') inner = '';
    if (element.type === 'image') {
      inner = element.src
        ? `<img alt="" src="${esc(element.src)}">`
        : '<em>Immagine</em>';
    }
    if (element.type === 'barcode' || element.type === 'qr') {
      const value = text || 'DEMO';
      const type = element.type === 'qr' ? 'qrcode' : (element.barcode || 'code128');
      inner = `<img alt="" src="/api/v1/barcode?type=${encodeURIComponent(type)}&text=${encodeURIComponent(value)}">`;
    }
    const bg = element.fill ? 'background:' + element.fill + ';' : '';
    const border = element.borderWidth ? 'border:' + Math.max(1, element.borderWidth * SCALE) + 'px solid ' + (element.borderColor || '#243044') + ';' : '';
    return `<div class="el t-${element.type}${selected}" data-id="${esc(element.id)}" style="left:${px(element.x)}px;top:${px(element.y)}px;width:${px(element.w)}px;height:${px(Math.max(element.h, element.type === 'line' ? 1.2 : element.h))}px;z-index:${index + 1};${bg}${border}color:${element.color || '#1b2330'};font-size:${(element.size || 10) * window.Asp.zoom}px;text-align:${element.align || 'left'};font-weight:${element.bold ? 700 : 400};font-style:${element.italic ? 'italic' : 'normal'};font-family:${element.font === 'Courier' ? 'Consolas,monospace' : element.font === 'Times' ? 'Georgia,serif' : 'Segoe UI,sans-serif'}">
      <span>${inner}</span>
      <i class="handle nw" data-handle="nw"></i><i class="handle ne" data-handle="ne"></i><i class="handle sw" data-handle="sw"></i><i class="handle se" data-handle="se"></i>
    </div>`;
  }

  function onDeskPointer(event) {
    const desk = document.getElementById('desk');
    if (event.target.closest('[data-expand], select, option')) return;
    const resizer = event.target.closest('[data-resize-band]');
    if (resizer) return startBandResize(event, resizer.dataset.resizeBand);
    const handle = event.target.closest('[data-handle]');
    const node = event.target.closest('.el');
    if (handle && node) return startResize(event, node.dataset.id, handle.dataset.handle);
    if (node) return startMove(event, node.dataset.id);
    const bandNode = event.target.closest('.band');
    if (!bandNode) {
      window.Asp.selectedId = null;
      paintInspector();
      paintCanvas();
      return;
    }
    if (window.Asp.tool !== 'select') {
      const band = bandOf(bandNode.dataset.role);
      const point = pointIn(event, bandNode, contentWidth(window.Asp.report), band.height);
      const element = newElement(window.Asp.tool, point.x, point.y);
      band.elements.push(element);
      window.Asp.selectedId = element.id;
      window.Asp.tool = 'select';
      desk.dataset.tool = 'select';
      document.querySelectorAll('[data-tool]').forEach((button) => button.classList.toggle('on', button.dataset.tool === 'select'));
      pushHistory();
      paintCanvas();
      paintInspector();
      scheduleSave();
    } else {
      window.Asp.selectedId = null;
      paintInspector();
      desk.querySelectorAll('.el.selected').forEach((item) => item.classList.remove('selected'));
    }
  }

  function pointIn(event, node, widthMm, heightMm) {
    const rect = node.getBoundingClientRect();
    return {
      x: rect.width ? ((event.clientX - rect.left) / rect.width) * widthMm : 0,
      y: rect.height ? ((event.clientY - rect.top) / rect.height) * heightMm : 0
    };
  }

  function startMove(event, id) {
    const found = findElement(id);
    if (!found) return;
    window.Asp.selectedId = id;
    paintInspector();
    document.querySelectorAll('.el').forEach((item) => item.classList.toggle('selected', item.dataset.id === id));
    const node = event.target.closest('.el');
    const origin = { x: found.element.x, y: found.element.y, px: event.clientX, py: event.clientY };
    const bandNode = node.closest('.band');
    const scale = bandNode.getBoundingClientRect().width / contentWidth(window.Asp.report);
    node.setPointerCapture(event.pointerId);
    function move(ev) {
      found.element.x = snap(Math.max(0, origin.x + (ev.clientX - origin.px) / scale));
      found.element.y = snap(Math.max(0, origin.y + (ev.clientY - origin.py) / scale));
      node.style.left = px(found.element.x) + 'px';
      node.style.top = px(found.element.y) + 'px';
      const readout = document.getElementById('sel-readout');
      if (readout) readout.textContent = 'x ' + found.element.x + '  y ' + found.element.y + ' mm';
    }
    function up() {
      node.removeEventListener('pointermove', move);
      node.removeEventListener('pointerup', up);
      pushHistory();
      scheduleSave();
      syncGeom();
    }
    node.addEventListener('pointermove', move);
    node.addEventListener('pointerup', up);
  }

  function startResize(event, id, handle) {
    event.stopPropagation();
    const found = findElement(id);
    const node = event.target.closest('.el');
    const origin = { x: found.element.x, y: found.element.y, w: found.element.w, h: found.element.h, px: event.clientX, py: event.clientY };
    const bandNode = node.closest('.band');
    const scale = bandNode.getBoundingClientRect().width / contentWidth(window.Asp.report);
    node.setPointerCapture(event.pointerId);
    function move(ev) {
      const dx = (ev.clientX - origin.px) / scale;
      const dy = (ev.clientY - origin.py) / scale;
      let x = origin.x;
      let y = origin.y;
      let w = origin.w;
      let h = origin.h;
      if (handle.includes('e')) w = origin.w + dx;
      if (handle.includes('s')) h = origin.h + dy;
      if (handle.includes('w')) { w = origin.w - dx; x = origin.x + dx; }
      if (handle.includes('n')) { h = origin.h - dy; y = origin.y + dy; }
      found.element.x = snap(Math.max(0, x));
      found.element.y = snap(Math.max(0, y));
      found.element.w = Math.max(4, snap(w));
      found.element.h = Math.max(found.element.type === 'line' ? 0.2 : 3, snap(h));
      node.style.left = px(found.element.x) + 'px';
      node.style.top = px(found.element.y) + 'px';
      node.style.width = px(found.element.w) + 'px';
      node.style.height = px(Math.max(found.element.h, found.element.type === 'line' ? 1.2 : found.element.h)) + 'px';
    }
    function up() {
      node.removeEventListener('pointermove', move);
      node.removeEventListener('pointerup', up);
      pushHistory();
      scheduleSave();
      syncGeom();
    }
    node.addEventListener('pointermove', move);
    node.addEventListener('pointerup', up);
  }

  function startBandResize(event, role) {
    event.stopPropagation();
    const band = bandOf(role);
    const row = event.target.closest('.band-row').querySelector('.band');
    const origin = { h: band.height, py: event.clientY };
    const scale = row.getBoundingClientRect().height / band.height;
    function move(ev) {
      band.height = Math.max(6, snap(origin.h + (ev.clientY - origin.py) / scale));
      row.style.height = px(band.height) + 'px';
      row.dataset.mm = band.height;
    }
    function up() {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      pushHistory();
      scheduleSave();
    }
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  function syncGeom() {
    const found = findElement(window.Asp.selectedId);
    if (!found) return;
    ['x', 'y', 'w', 'h'].forEach((key) => {
      const input = document.getElementById('prop-' + key);
      if (input && document.activeElement !== input) input.value = found.element[key];
    });
  }

  function align(mode) {
    const found = findElement(window.Asp.selectedId);
    if (!found) return;
    const width = contentWidth(window.Asp.report);
    if (mode === 'left') found.element.x = 0;
    if (mode === 'center') found.element.x = snap((width - found.element.w) / 2);
    if (mode === 'right') found.element.x = snap(width - found.element.w);
    pushHistory();
    paintCanvas();
    scheduleSave();
  }

  function removeSelected() {
    const found = findElement(window.Asp.selectedId);
    if (!found) return;
    found.band.elements = found.band.elements.filter((element) => element.id !== window.Asp.selectedId);
    window.Asp.selectedId = null;
    pushHistory();
    paintCanvas();
    paintInspector();
    scheduleSave();
  }

  function onKey(event) {
    if (document.getElementById('view-design').hidden) return;
    const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName);
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
      event.preventDefault();
      pushHistory();
      saveReport();
      return;
    }
    if (typing) return;
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      if (window.Asp.hist > 0) loadHistory(window.Asp.hist - 1);
    } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') {
      event.preventDefault();
      if (window.Asp.hist < window.Asp.history.length - 1) loadHistory(window.Asp.hist + 1);
    } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'd') {
      event.preventDefault();
      duplicateElement();
    } else if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      removeSelected();
    } else if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
      const found = findElement(window.Asp.selectedId);
      if (!found) return;
      event.preventDefault();
      const step = event.shiftKey ? 5 : 1;
      if (event.key === 'ArrowLeft') found.element.x = Math.max(0, found.element.x - step);
      if (event.key === 'ArrowRight') found.element.x += step;
      if (event.key === 'ArrowUp') found.element.y = Math.max(0, found.element.y - step);
      if (event.key === 'ArrowDown') found.element.y += step;
      pushHistory();
      paintCanvas();
      scheduleSave();
    }
  }

  function duplicateElement() {
    const found = findElement(window.Asp.selectedId);
    if (!found) return;
    const copy = JSON.parse(JSON.stringify(found.element));
    copy.id = 'e' + Math.random().toString(36).slice(2, 8);
    copy.x += 2;
    copy.y += 2;
    found.band.elements.push(copy);
    window.Asp.selectedId = copy.id;
    pushHistory();
    paintCanvas();
    paintInspector();
    scheduleSave();
  }

  function paintInspector() {
    const root = document.getElementById('inspector');
    const found = findElement(window.Asp.selectedId);
    const names = fieldNames();
    const props = found ? propertyForm(found.element, names) : '<p class="muted">Seleziona un oggetto sul foglio, oppure scegli uno strumento e fai clic nella sezione.</p>';
    root.innerHTML = `
      <div class="tool-block">
        <h2>Proprietà</h2>
        ${props}
      </div>
      <div class="tool-block">
        <h2>Campi</h2>
        <div id="field-list">${fieldEditor()}</div>
        <button type="button" id="add-field" class="ghost">Aggiungi campo</button>
        <button type="button" id="infer-fields" class="ghost">Leggi i campi dai dati</button>
      </div>
      <div class="tool-block">
        <h2>Dati di prova</h2>
        <textarea id="sample-json" spellcheck="false"></textarea>
        <button type="button" id="apply-sample">Applica JSON</button>
        <p id="sample-error" class="danger-text"></p>
      </div>`;
    const sample = document.getElementById('sample-json');
    sample.value = JSON.stringify(window.Asp.report.sample || { header: {}, rows: [] }, null, 2);
    if (found) bindProperties(found.element);
    bindFieldRows();
    document.getElementById('add-field').addEventListener('click', () => {
      window.Asp.report.fields.push({ name: 'campo' + (window.Asp.report.fields.length + 1), role: 'detail', format: 'text' });
      pushHistory();
      paintInspector();
      scheduleSave();
    });
    document.getElementById('infer-fields').addEventListener('click', () => {
      window.Asp.report.fields = inferFields();
      pushHistory();
      paintInspector();
      scheduleSave();
    });
    document.getElementById('apply-sample').addEventListener('click', () => {
      try {
        const parsed = JSON.parse(sample.value);
        window.Asp.report.sample = parsed.header || parsed.rows ? parsed : { header: {}, rows: Array.isArray(parsed) ? parsed : [] };
        document.getElementById('sample-error').textContent = '';
        if (!window.Asp.report.fields.length) window.Asp.report.fields = inferFields();
        pushHistory();
        paintCanvas();
        paintInspector();
        scheduleSave();
      } catch (error) {
        document.getElementById('sample-error').textContent = 'JSON non valido';
      }
    });
    }

  function inferFields() {
    const report = window.Asp.report;
    const previous = new Map((report.fields || []).map((field) => [field.name, field]));
    const header = (report.sample && report.sample.header) || {};
    const row = (report.sample && report.sample.rows && report.sample.rows[0]) || {};
    const fields = [];
    Object.keys(header).forEach((name) => {
      fields.push(previous.get(name) || { name, role: 'header', format: window.AspFormat.guessFormat(name, header[name]) });
    });
    Object.keys(row).forEach((name) => {
      if (!fields.some((field) => field.name === name)) {
        fields.push(previous.get(name) || { name, role: 'detail', format: window.AspFormat.guessFormat(name, row[name]) });
      }
    });
    return fields;
  }

  function fieldEditor() {
    return (window.Asp.report.fields || []).map((field, index) => `
      <div class="field-row">
        <input data-field-name="${index}" value="${esc(field.name)}">
        <select data-field-role="${index}"><option value="header" ${field.role === 'header' ? 'selected' : ''}>Testata</option><option value="detail" ${field.role !== 'header' ? 'selected' : ''}>Dettaglio</option></select>
        <select data-field-format="${index}">
          ${['text', 'number', 'currency', 'date', 'upper'].map((format) => `<option ${field.format === format ? 'selected' : ''}>${format}</option>`).join('')}
        </select>
        <button type="button" data-field-del="${index}" class="icon">×</button>
      </div>`).join('');
  }

  function bindFieldRows() {
    const root = document.getElementById('inspector');
    root.querySelectorAll('[data-field-name]').forEach((node) => {
      node.addEventListener('change', () => {
        const index = Number(node.dataset.fieldName);
        const before = window.Asp.report.fields[index].name;
        const after = node.value.trim();
        window.Asp.report.fields[index].name = after;
        window.Asp.report.bands.forEach((band) => band.elements.forEach((element) => {
          if (element.field === before) element.field = after;
        }));
        pushHistory();
        scheduleSave();
      });
    });
    root.querySelectorAll('[data-field-role]').forEach((node) => {
      node.addEventListener('change', () => {
        window.Asp.report.fields[Number(node.dataset.fieldRole)].role = node.value;
        scheduleSave();
      });
    });
    root.querySelectorAll('[data-field-format]').forEach((node) => {
      node.addEventListener('change', () => {
        window.Asp.report.fields[Number(node.dataset.fieldFormat)].format = node.value;
        scheduleSave();
      });
    });
    root.querySelectorAll('[data-field-del]').forEach((node) => {
      node.addEventListener('click', () => {
        window.Asp.report.fields.splice(Number(node.dataset.fieldDel), 1);
        pushHistory();
        paintInspector();
        scheduleSave();
      });
    });
  }

  function propertyForm(element, names) {
    const options = names.map((name) => `<option ${name === element.field ? 'selected' : ''}>${esc(name)}</option>`).join('');
    return `
      <p class="source-kicker">${esc(element.type)}</p>
      <div class="geom">
        <label>X<input id="prop-x" type="number" step="0.5" value="${element.x}"></label>
        <label>Y<input id="prop-y" type="number" step="0.5" value="${element.y}"></label>
        <label>L<input id="prop-w" type="number" step="0.5" value="${element.w}"></label>
        <label>H<input id="prop-h" type="number" step="0.5" value="${element.h}"></label>
      </div>
      ${element.type === 'label' || element.type === 'pageNumber' ? `<label>Testo<textarea id="prop-text">${esc(element.text)}</textarea></label>` : ''}
      ${element.type === 'field' || element.type === 'barcode' || element.type === 'qr' || element.type === 'formula' ? `<label>Campo<select id="prop-field"><option value=""></option>${options}</select></label>` : ''}
      ${element.type === 'formula' ? `<label>Formula<input id="prop-expr" value="${esc(element.expr)}"><small>sum(importo) · percent(importo, 22) · sum(importo)+percent(importo, 22)</small></label>` : ''}
      ${element.type === 'barcode' ? `<label>Simbologia<select id="prop-barcode"><option>code128</option><option>code39</option><option>ean13</option></select></label>` : ''}
      <label>Carattere<select id="prop-font"><option>Helvetica</option><option>Times</option><option>Courier</option></select></label>
      <div class="geom">
        <label>Corpo<input id="prop-size" type="number" min="6" max="48" value="${element.size}"></label>
        <label>Formato<select id="prop-format"><option>text</option><option>number</option><option>currency</option><option>date</option><option>upper</option></select></label>
      </div>
      <label>Allinea<select id="prop-align"><option value="left">Sinistra</option><option value="center">Centro</option><option value="right">Destra</option></select></label>
      <div class="checks">
        <label class="check"><input id="prop-bold" type="checkbox" ${element.bold ? 'checked' : ''}> Grassetto</label>
        <label class="check"><input id="prop-italic" type="checkbox" ${element.italic ? 'checked' : ''}> Corsivo</label>
      </div>
      <label>Colore testo<input id="prop-color" type="color" value="${toColor(element.color)}"></label>
      <label>Riempimento<input id="prop-fill" type="color" value="${toColor(element.fill || '#f6f3ec')}"></label>
      <label class="check"><input id="prop-fill-on" type="checkbox" ${element.fill ? 'checked' : ''}> Usa riempimento</label>
      <label>Bordo mm<input id="prop-border" type="number" min="0" step="0.1" value="${element.borderWidth || 0}"></label>
      ${element.type === 'image' ? `<label>File immagine<input id="prop-image" type="file" accept="image/*"></label>` : ''}
      ${element.type === 'line' ? `<label>Verso<select id="prop-orient"><option value="h">Orizzontale</option><option value="v">Verticale</option></select></label>` : ''}`;
  }

  function toColor(value) {
    return /^#[0-9a-fA-F]{6}$/.test(value || '') ? value : '#1b2330';
  }

  function bindProperties(element) {
    const set = (id, key, parse) => {
      const node = document.getElementById(id);
      if (!node) return;
      if (node.tagName === 'SELECT' || node.type === 'checkbox') node.value = element[key];
      const eventName = node.type === 'checkbox' || node.tagName === 'SELECT' ? 'change' : 'input';
      node.addEventListener(eventName, () => {
        element[key] = parse ? parse(node) : node.value;
        paintCanvas();
        scheduleHistory();
        scheduleSave();
      });
    };
    ['x', 'y', 'w', 'h', 'size'].forEach((key) => {
      const node = document.getElementById('prop-' + key);
      if (!node) return;
      node.addEventListener('input', () => {
        element[key] = Number(node.value);
        paintCanvas();
        scheduleHistory();
        scheduleSave();
      });
    });
    const text = document.getElementById('prop-text');
    if (text) text.addEventListener('input', () => { element.text = text.value; paintCanvas(); scheduleHistory(); scheduleSave(); });
    const field = document.getElementById('prop-field');
    if (field) field.addEventListener('change', () => { element.field = field.value; paintCanvas(); scheduleHistory(); scheduleSave(); });
    const expr = document.getElementById('prop-expr');
    if (expr) expr.addEventListener('input', () => { element.expr = expr.value; paintCanvas(); scheduleHistory(); scheduleSave(); });
    set('prop-font', 'font');
    set('prop-format', 'format');
    set('prop-align', 'align');
    set('prop-barcode', 'barcode');
    set('prop-orient', 'orient');
    const bold = document.getElementById('prop-bold');
    if (bold) bold.addEventListener('change', () => { element.bold = bold.checked; paintCanvas(); scheduleHistory(); scheduleSave(); });
    const italic = document.getElementById('prop-italic');
    if (italic) italic.addEventListener('change', () => { element.italic = italic.checked; paintCanvas(); scheduleHistory(); scheduleSave(); });
    const color = document.getElementById('prop-color');
    if (color) color.addEventListener('input', () => { element.color = color.value; paintCanvas(); scheduleHistory(); scheduleSave(); });
    const fillOn = document.getElementById('prop-fill-on');
    const fill = document.getElementById('prop-fill');
    if (fillOn && fill) {
      const applyFill = () => {
        element.fill = fillOn.checked ? fill.value : '';
        paintCanvas();
        scheduleHistory();
        scheduleSave();
      };
      fillOn.addEventListener('change', applyFill);
      fill.addEventListener('input', applyFill);
    }
    const border = document.getElementById('prop-border');
    if (border) border.addEventListener('input', () => { element.borderWidth = Number(border.value); paintCanvas(); scheduleHistory(); scheduleSave(); });
    const image = document.getElementById('prop-image');
    if (image) image.addEventListener('change', () => {
      const file = image.files && image.files[0];
      if (!file) return;
      if (file.size > 400000) {
        window.AspUi.toast('Immagine oltre 400 KB');
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        element.src = reader.result;
        pushHistory();
        paintCanvas();
        scheduleSave();
      };
      reader.readAsDataURL(file);
    });
    ['prop-font', 'prop-format', 'prop-align', 'prop-barcode', 'prop-orient'].forEach((id) => {
      const node = document.getElementById(id);
      if (!node) return;
      const key = id.replace('prop-', '');
      if (element[key]) node.value = element[key];
    });
  }

  function openReport(report) {
    window.Asp.report = report;
    window.Asp.selectedId = null;
    window.Asp.history = [JSON.stringify(report)];
    window.Asp.hist = 0;
    window.Asp.spoolText = report.sampleSpool || '';
    if (!report.bands) report.bands = [];
    if (!report.fields) report.fields = [];
    if (!report.sample) report.sample = { header: {}, rows: [] };
    if (!report.page) report.page = { format: 'A4', orientation: 'portrait', width: 210, height: 297, marginTop: 12, marginRight: 12, marginBottom: 12, marginLeft: 12 };
    BANDS.forEach(([role]) => {
      if (!report.bands.some((band) => band.role === role)) report.bands.push({ role, height: 0, elements: [] });
    });
    paintPageForm();
    paintSource();
    paintCanvas();
    paintInspector();
    const label = document.getElementById('save-state');
    if (label) label.textContent = report.name;
  }

  window.AspDesigner = {
    init() {
      paintShell();
      document.getElementById('snap').checked = true;
    },
    openReport,
    saveReport,
    paintCanvas,
    paintInspector,
    removeSelected
  };
}());
