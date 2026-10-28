(function () {
  let selectedId = 'demo';
  let spoolAnchor = null;
  let spoolHover = null;
  let extracted = null;

  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[ch]));
  }

  function current() {
    return (window.Asp.systems || []).find((system) => system.id === selectedId) || null;
  }

  function layout() {
    if (!window.Asp.editorLayout) {
      const report = window.Asp.report;
      const existing = report && report.spoolLayout;
      if (existing && (existing.headerFields || []).length) window.Asp.editorLayout = JSON.parse(JSON.stringify(existing));
      else {
        window.Asp.editorLayout = {
          linesPerPage: 60,
          breakField: 'numero',
          headerFields: [],
          detail: { fromLine: 13, toLine: 36, fields: [] }
        };
      }
    }
    return window.Asp.editorLayout;
  }

  async function apiText(url) {
    const headers = {};
    if (window.Asp.key) headers['X-Aspdocu-Key'] = window.Asp.key;
    const response = await fetch(url, { headers });
    const text = await response.text();
    if (!response.ok) throw new Error(text);
    return text;
  }

  function paint() {
    const root = document.getElementById('as400-root');
    const drivers = (window.Asp.info && window.Asp.info.drivers) || { package: false, drivers: [], hint: '' };
    const driverNames = (drivers.drivers || []).join(', ') || 'nessuno';
    root.innerHTML = `
      <section class="as-hero">
        <p class="eyebrow">IBM i · iSeries · System i · AS/400</p>
        <h1>Connessione all'AS/400</h1>
        <p>ASPDOCU legge il DB2 e gli spool. I programmi sull'AS/400, e gli altri software, lo richiamano per ottenere il PDF del report scelto.</p>
        <ol class="steps">
          <li class="on">Sistema e driver</li>
          <li>Prova connessione</li>
          <li>SQL o spool</li>
          <li>Chiamata di stampa</li>
        </ol>
        <div class="driver-box ${drivers.ready ? 'ok' : 'wait'}">
          <strong>${drivers.ready ? 'Driver ODBC pronto' : 'Driver ODBC non pronto'}</strong>
          <span>Pacchetto Node odbc: ${drivers.package ? 'installato' : 'assente'}. Driver IBM i: ${esc(driverNames)}.</span>
          <span>${esc(drivers.hint || '')}</span>
        </div>
      </section>
      <div class="as-layout">
        <aside id="system-list"></aside>
        <section id="system-form"></section>
        <section id="as-work"></section>
      </div>`;
    paintSystems();
    paintForm();
    paintWork('sql');
  }

  function paintSystems() {
    const list = document.getElementById('system-list');
    list.innerHTML = `<h2>Sistemi</h2>` + window.Asp.systems.map((system) => `
      <button type="button" class="system ${system.id === selectedId ? 'on' : ''}" data-system="${esc(system.id)}">
        <strong>${esc(system.name)}</strong>
        <span>${system.type === 'demo' ? 'Dimostrazione' : system.type === 'ponte' ? 'Ponte HTTP' : 'ODBC'} · ${esc(system.host || 'senza host')}</span>
      </button>`).join('') + `<button type="button" id="new-system" class="ghost">Nuovo sistema IBM i</button>`;
    list.querySelectorAll('[data-system]').forEach((button) => {
      button.addEventListener('click', () => {
        selectedId = button.dataset.system;
        paintSystems();
        paintForm();
      });
    });
    document.getElementById('new-system').addEventListener('click', async () => {
      const id = 'ibm' + Math.floor(Math.random() * 900 + 100);
      const data = await window.AspApi.send('POST', '/api/v1/as400/systems', {
        id,
        name: 'IBM i di produzione',
        type: 'odbc',
        host: '',
        port: 8471,
        user: '',
        password: '',
        library: 'VENDITE',
        naming: 'sql',
        ccsid: 280,
        driver: 'IBM i Access ODBC Driver'
      });
      window.Asp.systems.push(data.system);
      selectedId = id;
      paintSystems();
      paintForm();
    });
  }

  function paintForm() {
    const system = current() || { id: '', name: '', type: 'odbc', host: '', port: 8471, user: '', library: '', naming: 'sql', ccsid: 280, driver: 'IBM i Access ODBC Driver', bridgeUrl: '' };
    const form = document.getElementById('system-form');
    const locked = system.type === 'demo';
    form.innerHTML = `
      <div class="form-head">
        <h2>${esc(system.name || 'Sistema')}</h2>
        <span class="badge ${locked ? 'demo' : 'live'}">${locked ? 'Dimostrazione' : system.type === 'ponte' ? 'Ponte' : 'Connessione reale'}</span>
      </div>
      <p class="muted">${locked ? 'Questo sistema non parla con una macchina vera: serve a provare SQL e spool. Crea un sistema ODBC per il tuo IBM i.' : 'La porta abituale del database è 8471. Il driver è quello di IBM i Access Client Solutions, Application Package.'}</p>
      <div class="form-grid">
        <label>Nome<input id="sy-name" value="${esc(system.name || '')}" ${locked ? 'disabled' : ''}></label>
        <label>Tipo<select id="sy-type" ${locked ? 'disabled' : ''}>
          <option value="odbc">ODBC IBM i Access</option>
          <option value="ponte">Ponte HTTP</option>
        </select></label>
        <label>Host o indirizzo IP<input id="sy-host" value="${esc(system.host || '')}" placeholder="192.168.0.20" ${locked ? 'disabled' : ''}></label>
        <label>Porta database<input id="sy-port" type="number" value="${system.port || 8471}" ${locked ? 'disabled' : ''}></label>
        <label>Utente<input id="sy-user" value="${esc(system.user || '')}" ${locked ? 'disabled' : ''}></label>
        <label>Password<input id="sy-pass" type="password" placeholder="${system.hasPassword ? 'già salvata' : ''}" ${locked ? 'disabled' : ''}></label>
        <label>Libreria di default<input id="sy-lib" value="${esc(system.library || '')}" ${locked ? 'disabled' : ''}></label>
        <label>CCSID<input id="sy-ccsid" type="number" value="${system.ccsid || 280}" ${locked ? 'disabled' : ''}></label>
        <label>Naming<select id="sy-naming" ${locked ? 'disabled' : ''}>
          <option value="sql">SQL (LIBRERIA.TABELLA)</option>
          <option value="system">Sistema (LIBRERIA/TABELLA)</option>
        </select></label>
        <label class="wide">Driver ODBC<input id="sy-driver" value="${esc(system.driver || 'IBM i Access ODBC Driver')}" ${locked ? 'disabled' : ''}></label>
        <label class="wide">URL ponte, solo se il tipo è Ponte<input id="sy-bridge" value="${esc(system.bridgeUrl || '')}" placeholder="http://192.168.0.5:8090/sql" ${locked ? 'disabled' : ''}></label>
      </div>
      <pre class="cs" id="cs-preview"></pre>
      <div class="row-buttons">
        <button type="button" id="sy-test">Prova connessione</button>
        <button type="button" id="sy-save" class="ghost">Salva sistema</button>
        ${locked ? '' : '<button type="button" id="sy-drop" class="ghost danger">Elimina</button>'}
      </div>
      <p id="sy-result" class="result"></p>`;
    const type = document.getElementById('sy-type');
    if (type && system.type !== 'demo') type.value = system.type || 'odbc';
    const naming = document.getElementById('sy-naming');
    if (naming) naming.value = system.naming || 'sql';
    previewCs();
    form.querySelectorAll('input, select').forEach((node) => node.addEventListener('input', previewCs));
    document.getElementById('sy-test').addEventListener('click', testConnection);
    document.getElementById('sy-save').addEventListener('click', saveSystem);
    const drop = document.getElementById('sy-drop');
    if (drop) drop.addEventListener('click', removeSystem);
  }

  function formPayload() {
    const system = current();
    if (system && system.type === 'demo') return system;
    return {
      id: system.id,
      name: value('sy-name'),
      type: value('sy-type') || 'odbc',
      host: value('sy-host'),
      port: Number(value('sy-port')) || 8471,
      user: value('sy-user'),
      password: value('sy-pass'),
      library: value('sy-lib'),
      naming: value('sy-naming') || 'sql',
      ccsid: Number(value('sy-ccsid')) || 280,
      driver: value('sy-driver'),
      bridgeUrl: value('sy-bridge')
    };
  }

  function value(id) {
    const node = document.getElementById(id);
    return node ? node.value.trim() : '';
  }

  function previewCs() {
    const node = document.getElementById('cs-preview');
    const system = current();
    if (!node) return;
    if (!system || system.type === 'demo') {
      node.textContent = 'Nessuna stringa ODBC: il sistema di esempio risponde in locale.';
      return;
    }
    const payload = formPayload();
    if (payload.type === 'ponte') {
      node.textContent = 'POST ' + (payload.bridgeUrl || '(url ponte)') + '\n{ "sql": "...", "params": [] }';
      return;
    }
    node.textContent = `Driver={${payload.driver}};System=${payload.host};Uid=${payload.user};Pwd=***;Port=${payload.port};DefaultLibraries=${payload.library};CCSID=${payload.ccsid};Naming=${payload.naming === 'system' ? '1' : '0'};`;
  }

  async function saveSystem() {
    const system = current();
    if (!system || system.type === 'demo') return toastResult('Il sistema di esempio è già pronto.');
    const data = await window.AspApi.send('POST', '/api/v1/as400/systems', formPayload());
    replaceSystem(data.system);
    toastResult('Sistema salvato su questo PC.');
  }

  async function testConnection() {
    const box = document.getElementById('sy-result');
    box.textContent = 'Connessione in corso…';
    try {
      const system = current();
      const data = system && system.type === 'demo'
        ? await window.AspApi.send('POST', '/api/v1/as400/test', { systemId: 'demo' })
        : await window.AspApi.send('POST', '/api/v1/as400/test', { system: formPayload() });
      if (system && system.type !== 'demo') {
        const fresh = await window.AspApi.send('GET', '/api/v1/as400/systems');
        window.Asp.systems = fresh.systems;
      }
      const row = data.row ? ' Server ' + (data.row.SERVER || data.row.server || '') + ' utente ' + (data.row.UTENTE || data.row.utente || '') : '';
      box.textContent = (data.message || 'Connesso.') + row;
      box.className = 'result ok';
    } catch (error) {
      box.textContent = error.message;
      box.className = 'result bad';
    }
  }

  async function removeSystem() {
    const system = current();
    if (!system || system.type === 'demo') return;
    if (!window.confirm('Eliminare il sistema ' + system.name + '?')) return;
    await window.AspApi.send('DELETE', '/api/v1/as400/systems/' + encodeURIComponent(system.id));
    window.Asp.systems = window.Asp.systems.filter((item) => item.id !== system.id);
    selectedId = 'demo';
    paintSystems();
    paintForm();
  }

  function replaceSystem(system) {
    const index = window.Asp.systems.findIndex((item) => item.id === system.id);
    if (index >= 0) window.Asp.systems[index] = system;
    else window.Asp.systems.push(system);
  }

  function toastResult(text) {
    const box = document.getElementById('sy-result');
    if (box) {
      box.textContent = text;
      box.className = 'result ok';
    }
  }

  function paintWork(tab) {
    const work = document.getElementById('as-work');
    const report = window.Asp.report;
    const sql = (report && report.source && report.source.sql) || "SELECT * FROM VENDITE.FATTURE WHERE NUMERO = ?";
    work.innerHTML = `
      <div class="tabs">
        <button type="button" data-tab="sql" class="${tab === 'sql' ? 'on' : ''}">SQL DB2</button>
        <button type="button" data-tab="spool" class="${tab === 'spool' ? 'on' : ''}">Spool e rimappatura</button>
        <button type="button" data-tab="call" class="${tab === 'call' ? 'on' : ''}">Chiamata dai programmi</button>
      </div>
      <div id="tab-body"></div>`;
    work.querySelectorAll('[data-tab]').forEach((button) => {
      button.addEventListener('click', () => paintWork(button.dataset.tab));
    });
    if (tab === 'sql') paintSql(sql);
    if (tab === 'spool') paintSpool();
    if (tab === 'call') paintCall();
  }

  function paintSql(sql) {
    const report = window.Asp.report;
    document.getElementById('tab-body').innerHTML = `
      <p>La query sta sul report <strong>${esc(report ? report.name : '')}</strong>. Il punto di domanda si lega al parametro che il programma invia, per esempio il numero fattura.</p>
      <textarea id="sql-text" spellcheck="false">${esc(sql)}</textarea>
      <label>Parametri, separati da virgola<input id="sql-params" placeholder="2026/0158"></label>
      <div class="row-buttons">
        <button type="button" id="sql-run">Esegui sul sistema selezionato</button>
        <button type="button" id="sql-use" class="ghost">Porta il risultato nel report</button>
      </div>
      <div id="sql-out"></div>`;
    document.getElementById('sql-run').addEventListener('click', runSql);
    document.getElementById('sql-use').addEventListener('click', useSql);
  }

  async function runSql() {
    const out = document.getElementById('sql-out');
    out.textContent = 'Esecuzione…';
    try {
      const params = document.getElementById('sql-params').value.split(',').map((item) => item.trim()).filter(Boolean);
      const data = await window.AspApi.send('POST', '/api/v1/as400/query', {
        systemId: selectedId,
        sql: document.getElementById('sql-text').value,
        params
      });
      extracted = data;
      const rows = data.detail || data.rows || [];
      const columns = data.columns || (rows[0] ? Object.keys(rows[0]) : []);
      out.innerHTML = `<p class="${data.demo ? 'result demo' : 'result ok'}">${esc(data.message || '')} · ${rows.length} righe</p>` + table(columns, rows.slice(0, 12));
    } catch (error) {
      out.innerHTML = `<p class="result bad">${esc(error.message)}</p>`;
    }
  }

  function table(columns, rows) {
    if (!rows.length) return '<p>Nessuna riga.</p>';
    return `<div class="grid-wrap"><table><thead><tr>${columns.map((column) => `<th>${esc(column)}</th>`).join('')}</tr></thead><tbody>
      ${rows.map((row) => `<tr>${columns.map((column) => `<td>${esc(row[column])}</td>`).join('')}</tr>`).join('')}
    </tbody></table></div>`;
  }

  function useSql() {
    if (!window.Asp.report) return window.AspUi.toast('Apri prima un report.');
    if (!extracted) return window.AspUi.toast('Esegui prima la query.');
    const rows = extracted.detail || extracted.rows || [];
    window.Asp.report.sample = extracted.detail
      ? { header: extracted.header || {}, rows: extracted.detail }
      : { header: Object.assign({}, rows[0] || {}), rows };
    window.Asp.report.source = {
      type: 'sql',
      systemId: selectedId,
      sql: document.getElementById('sql-text').value
    };
    if (window.AspDesigner) {
      window.Asp.report.fields = [];
      window.AspUi.show('design');
      window.AspDesigner.openReport(window.Asp.report);
      const button = document.getElementById('infer-fields');
      if (button) button.click();
    }
    window.AspDesigner.saveReport();
  }

  function paintSpool() {
    document.getElementById('tab-body').innerHTML = `
      <p>Come in Validoc: carichi uno spool di esempio, selezioni un tratto di riga e gli dai un nome. La testata si legge una volta, il dettaglio su ogni riga dell'intervallo.</p>
      <div class="row-buttons">
        <button type="button" id="spool-sample">Apri lo spool di esempio</button>
        <label class="file-btn">Carica file<input id="spool-file" type="file" accept=".txt,.spl,.spool,text/plain" hidden></label>
        <button type="button" id="spool-inbox" class="ghost">Elenco cartella spool</button>
      </div>
      <div class="spool-tools">
        <label>Righe per pagina<input id="sp-lpp" type="number" value="${layout().linesPerPage || 66}"></label>
        <label>Dettaglio dalla riga<input id="sp-from" type="number" value="${(layout().detail && layout().detail.fromLine) || 13}"></label>
        <label>alla riga<input id="sp-to" type="number" value="${(layout().detail && layout().detail.toLine) || 36}"></label>
        <label>Campo di rottura<input id="sp-break" value="${esc(layout().breakField || '')}" placeholder="numero"></label>
      </div>
      <div id="spool-grid" class="spool-grid"></div>
      <div class="spool-capture">
        <p id="spool-sel">Seleziona un tratto trascinando sul testo.</p>
        <label>Nome campo<input id="sp-name" placeholder="cliente"></label>
        <label>Zona<select id="sp-zone"><option value="header">Testata</option><option value="detail">Colonna di dettaglio</option></select></label>
        <button type="button" id="sp-add">Aggiungi campo</button>
      </div>
      <div id="spool-map"></div>
      <div class="row-buttons">
        <button type="button" id="sp-extract">Estrai i dati</button>
        <button type="button" id="sp-into" class="ghost">Porta nel report aperto</button>
        <button type="button" id="sp-create">Crea un report da questo spool</button>
      </div>
      <div id="spool-out"></div>`;
    document.getElementById('spool-sample').addEventListener('click', loadSampleSpool);
    document.getElementById('spool-file').addEventListener('change', loadSpoolFile);
    document.getElementById('spool-inbox').addEventListener('click', showInbox);
    document.getElementById('sp-add').addEventListener('click', addMappedField);
    document.getElementById('sp-extract').addEventListener('click', extractCurrent);
    document.getElementById('sp-into').addEventListener('click', spoolIntoReport);
    document.getElementById('sp-create').addEventListener('click', createFromSpool);
    ['sp-lpp', 'sp-from', 'sp-to', 'sp-break'].forEach((id) => {
      document.getElementById(id).addEventListener('change', () => {
        readLayoutFromForm();
        renderGrid();
      });
    });
    renderGrid();
    renderMap();
  }

  function readLayoutFromForm() {
    const map = layout();
    map.linesPerPage = Number(document.getElementById('sp-lpp').value) || 66;
    map.detail = map.detail || { fromLine: 1, toLine: 1, fields: [] };
    map.detail.fromLine = Number(document.getElementById('sp-from').value) || 1;
    map.detail.toLine = Number(document.getElementById('sp-to').value) || map.detail.fromLine;
    map.breakField = document.getElementById('sp-break').value.trim();
    return map;
  }

  async function loadSampleSpool() {
    const data = await window.AspApi.send('GET', '/api/v1/reports/fattura');
    window.Asp.spoolText = data.report.sampleSpool || '';
    window.Asp.editorLayout = JSON.parse(JSON.stringify(data.report.spoolLayout));
    const map = window.Asp.editorLayout;
    document.getElementById('sp-lpp').value = map.linesPerPage;
    document.getElementById('sp-from').value = map.detail.fromLine;
    document.getElementById('sp-to').value = map.detail.toLine;
    document.getElementById('sp-break').value = map.breakField || '';
    renderGrid();
    renderMap();
  }

  function loadSpoolFile(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      window.Asp.spoolText = String(reader.result || '');
      window.Asp.spoolName = file.name;
      await window.AspApi.send('POST', '/api/v1/spool/inbox', { name: file.name, text: window.Asp.spoolText });
      renderGrid();
    };
    reader.readAsText(file);
  }

  async function showInbox() {
    const data = await window.AspApi.send('GET', '/api/v1/spool/inbox');
    const out = document.getElementById('spool-out');
    out.innerHTML = data.files.map((file) => `<button type="button" class="linkish" data-file="${esc(file.name)}">${esc(file.name)}</button>`).join(' ') || 'Cartella vuota.';
    out.querySelectorAll('[data-file]').forEach((button) => {
      button.addEventListener('click', async () => {
        window.Asp.spoolText = await apiText('/api/v1/spool/inbox/' + encodeURIComponent(button.dataset.file));
        renderGrid();
      });
    });
  }

  function renderGrid() {
    const host = document.getElementById('spool-grid');
    if (!host) return;
    const text = window.Asp.spoolText || 'Nessuno spool caricato. Apri l\'esempio oppure carica un file.';
    const lines = text.split(/\r?\n/).slice(0, 80);
    const map = layout();
    const marks = (line, col) => {
      for (const field of map.headerFields || []) {
        if (field.line === line && col >= field.col && col < field.col + field.len) return 'mark-h';
      }
      const detail = map.detail || {};
      if (line >= detail.fromLine && line <= detail.toLine) {
        for (const field of detail.fields || []) {
          if (col >= field.col && col < field.col + field.len) return 'mark-d';
        }
      }
      return '';
    };
    const ruler = Array.from({ length: 80 }, (_, index) => `<i>${(index + 1) % 10 === 0 ? index + 1 : '·'}</i>`).join('');
    host.innerHTML = `<div class="sp-ruler"><b></b><span>${ruler}</span></div>` + lines.map((line, index) => {
      const chars = (line + ' '.repeat(80)).slice(0, 80).split('');
      return `<div class="sp-line"><b>${index + 1}</b><span>${chars.map((ch, col) => `<em class="ch ${marks(index + 1, col + 1)}" data-line="${index + 1}" data-col="${col + 1}">${esc(ch === ' ' ? ' ' : ch)}</em>`).join('')}</span></div>`;
    }).join('');
    host.onpointerdown = (event) => {
      const cell = event.target.closest('.ch');
      if (!cell) return;
      spoolAnchor = { line: Number(cell.dataset.line), col: Number(cell.dataset.col) };
    };
    host.onpointerover = (event) => {
      const cell = event.target.closest('.ch');
      if (cell) spoolHover = { line: Number(cell.dataset.line), col: Number(cell.dataset.col) };
    };
    host.onpointerup = () => finishSelection();
  }

  function finishSelection() {
    if (!spoolAnchor || !spoolHover) return;
    const map = layout();
    if (spoolAnchor.line !== spoolHover.line) {
      const from = Math.min(spoolAnchor.line, spoolHover.line);
      const to = Math.max(spoolAnchor.line, spoolHover.line);
      const fromInput = document.getElementById('sp-from');
      const toInput = document.getElementById('sp-to');
      if (fromInput) fromInput.value = from;
      if (toInput) toInput.value = to;
      readLayoutFromForm();
      const note = document.getElementById('spool-sel');
      if (note) note.textContent = 'Intervallo dettaglio impostato sulle righe ' + from + '–' + to + '.';
      renderGrid();
      return;
    }
    const col = Math.min(spoolAnchor.col, spoolHover.col);
    const len = Math.abs(spoolHover.col - spoolAnchor.col) + 1;
    const lines = (window.Asp.spoolText || '').split(/\r?\n/);
    const raw = lines[spoolAnchor.line - 1] || '';
    const text = raw.substring(col - 1, col - 1 + len);
    const note = document.getElementById('spool-sel');
    if (note) note.textContent = 'Riga ' + spoolAnchor.line + ', colonna ' + col + ', lunghezza ' + len + ' → “' + text.trim() + '”';
    const zone = document.getElementById('sp-zone');
    if (zone) {
      const detail = map.detail || {};
      zone.value = spoolAnchor.line >= detail.fromLine && spoolAnchor.line <= detail.toLine ? 'detail' : 'header';
    }
    window.Asp.spoolPick = { line: spoolAnchor.line, col, len, text: text.trim() };
  }

  function addMappedField() {
    const pick = window.Asp.spoolPick;
    if (!pick) return window.AspUi.toast('Seleziona prima un tratto dello spool.');
    const name = document.getElementById('sp-name').value.trim();
    if (!name) return window.AspUi.toast('Dai un nome al campo.');
    const map = readLayoutFromForm();
    if (document.getElementById('sp-zone').value === 'detail') {
      map.detail.fields = (map.detail.fields || []).filter((field) => field.name !== name);
      map.detail.fields.push({ name, col: pick.col, len: pick.len });
    } else {
      map.headerFields = (map.headerFields || []).filter((field) => field.name !== name);
      map.headerFields.push({ name, line: pick.line, col: pick.col, len: pick.len });
    }
    renderGrid();
    renderMap();
  }

  function renderMap() {
    const host = document.getElementById('spool-map');
    if (!host) return;
    const map = layout();
    const headers = (map.headerFields || []).map((field) => `<li>Testata <strong>${esc(field.name)}</strong> riga ${field.line} col ${field.col} len ${field.len} <button type="button" data-del-h="${esc(field.name)}">togli</button></li>`).join('');
    const details = ((map.detail && map.detail.fields) || []).map((field) => `<li>Dettaglio <strong>${esc(field.name)}</strong> col ${field.col} len ${field.len} <button type="button" data-del-d="${esc(field.name)}">togli</button></li>`).join('');
    host.innerHTML = `<ul class="map-list">${headers}${details}</ul>` || '';
    host.querySelectorAll('[data-del-h]').forEach((button) => button.addEventListener('click', () => {
      map.headerFields = map.headerFields.filter((field) => field.name !== button.dataset.delH);
      renderGrid();
      renderMap();
    }));
    host.querySelectorAll('[data-del-d]').forEach((button) => button.addEventListener('click', () => {
      map.detail.fields = map.detail.fields.filter((field) => field.name !== button.dataset.delD);
      renderGrid();
      renderMap();
    }));
  }

  async function extractCurrent() {
    const data = await window.AspApi.send('POST', '/api/v1/as400/spool/extract', {
      spool: window.Asp.spoolText,
      layout: readLayoutFromForm()
    });
    extracted = data;
    const doc = (data.documents || [])[0] || { header: {}, rows: [] };
    const out = document.getElementById('spool-out');
    out.innerHTML = `<p class="result ok">${(data.documents || []).length} documenti, ${doc.rows.length} righe nel primo.</p><pre>${esc(JSON.stringify(doc, null, 2).slice(0, 2500))}</pre>`;
    return doc;
  }

  async function spoolIntoReport() {
    if (!window.Asp.report) return window.AspUi.toast('Apri prima un report.');
    const doc = await extractCurrent();
    window.Asp.report.sample = { header: doc.header, rows: doc.rows };
    window.Asp.report.sampleSpool = window.Asp.spoolText;
    window.Asp.report.spoolLayout = readLayoutFromForm();
    window.Asp.report.source = { type: 'spool', systemId: selectedId, sql: window.Asp.report.source ? window.Asp.report.source.sql : '' };
    window.AspUi.show('design');
    window.AspDesigner.openReport(window.Asp.report);
    const button = document.getElementById('infer-fields');
    if (button) button.click();
    window.AspDesigner.saveReport();
  }

  async function createFromSpool() {
    const id = window.prompt('Codice del nuovo report', 'spool-' + Date.now().toString().slice(-4));
    if (!id) return;
    const data = await window.AspApi.send('POST', '/api/v1/reports', {
      id,
      name: 'Stampa da spool',
      from: 'spool',
      spool: window.Asp.spoolText,
      layout: readLayoutFromForm(),
      systemId: selectedId
    });
    await window.AspUi.refreshList();
    window.AspUi.show('design');
    window.AspDesigner.openReport(data.report);
  }

  function paintCall() {
    const id = window.Asp.report ? window.Asp.report.id : 'fattura';
    const urls = (window.Asp.info && window.Asp.info.urls) || [];
    document.getElementById('tab-body').innerHTML = `
      <p>Ogni programma chiama un report per nome. Fattura, etichetta, ordine: sono stampe diverse, stesso servizio.</p>
      <pre>POST ${esc(urls[0] || 'http://127.0.0.1:4780')}/api/v1/print
{
  "report": "${esc(id)}",
  "params": ["2026/0158"]
}</pre>
      <p>Dal JavaScript: <code>Aspdocu.stampa('${esc(id)}', { data })</code> nel file <code>sdk/aspdocu.js</code>. Dall'IBM i l'esempio è <code>examples/CHIAMATA.sql</code>.</p>
      <button type="button" id="goto-api">Apri la pagina Programmi</button>`;
    document.getElementById('goto-api').addEventListener('click', () => window.AspUi.show('api'));
  }

  window.AspAs400 = { paint, layout };
}());
