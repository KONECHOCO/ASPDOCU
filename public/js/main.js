(function () {
  const views = ['home', 'design', 'as400', 'api'];

  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[ch]));
  }

  function show(view) {
    window.Asp.view = view;
    views.forEach((name) => {
      document.getElementById('view-' + name).hidden = name !== view;
    });
    document.querySelectorAll('.nav button').forEach((button) => {
      button.classList.toggle('on', button.dataset.view === view);
    });
    if (view === 'home') paintHome();
    if (view === 'as400') window.AspAs400.paint();
    if (view === 'api') paintApi();
    if (view === 'design' && window.Asp.report) window.AspDesigner.paintCanvas();
  }

  function paintHome() {
    const reports = window.Asp.reports || [];
    const drivers = (window.Asp.info && window.Asp.info.drivers) || {};
    document.getElementById('view-home').innerHTML = `
      <section class="home">
        <div class="hero">
          <p class="eyebrow">Designer di stampe</p>
          <h1>Disegna il report, stampalo in PDF, fallo chiamare dai programmi.</h1>
          <p>Lo spazio di disegno è a sezioni, come i report di Access. La lettura dello spool e il collegamento al DB2 seguono il modo di lavorare di Validoc e degli altri impaginatori per IBM i. Ogni stampa ha un codice: fattura, etichetta, ordine.</p>
          <div class="hero-actions">
            <button type="button" id="home-design">Apri il disegno</button>
            <button type="button" id="home-as400" class="as400">Connessione AS/400</button>
            <button type="button" id="home-api" class="ghost">Programmi che chiamano</button>
          </div>
        </div>
        <div class="home-grid">
          <article>
            <h2>Report</h2>
            ${reports.map((report) => `
              <button type="button" class="report-card" data-open="${esc(report.id)}">
                <strong>${esc(report.name)}</strong>
                <span>${esc(report.id)} · ${(report.source && report.source.type) || 'json'} · ${esc(report.page && report.page.format || '')}</span>
              </button>`).join('') || '<p>Nessun report.</p>'}
          </article>
          <article class="as400-card">
            <h2>AS/400</h2>
            <p>${drivers.ready ? 'Il collegamento all\'IBM i è diretto: Java, senza driver ODBC.' : 'Java non risulta installato. Il collegamento diretto non usa ODBC: serve Java 8 o successivo. Puoi comunque disegnare e provare lo spool di esempio.'}</p>
            <p>${(window.Asp.systems || []).map((system) => esc(system.name)).join(' · ')}</p>
            <button type="button" id="home-as400-2">Configura la connessione</button>
          </article>
          <article>
            <h2>Cosa ci entra</h2>
            <ul>
              <li>Sezioni, campi, somme, righe, riquadri, immagini, barcode e QR</li>
              <li>Dati JSON mandati dal programma</li>
              <li>SQL sul DB2 for i, con parametri</li>
              <li>Spool a colonne fisse, anche in CCSID 280</li>
              <li>PDF, file su disco o Base64 per l'RPG</li>
            </ul>
          </article>
        </div>
      </section>`;
    document.getElementById('home-design').addEventListener('click', () => show('design'));
    document.getElementById('home-as400').addEventListener('click', () => show('as400'));
    document.getElementById('home-as400-2').addEventListener('click', () => show('as400'));
    document.getElementById('home-api').addEventListener('click', () => show('api'));
    document.querySelectorAll('[data-open]').forEach((button) => {
      button.addEventListener('click', () => openReport(button.dataset.open));
    });
  }

  function paintApi() {
    const info = window.Asp.info || { urls: ['http://127.0.0.1:4780'], token: '', tokenRequired: false };
    const base = info.urls[0] || 'http://127.0.0.1:4780';
    const id = window.Asp.report ? window.Asp.report.id : 'fattura';
    document.getElementById('view-api').innerHTML = `
      <section class="api">
        <p class="eyebrow">Chiamata esterna</p>
        <h1>Un servizio, tante stampe</h1>
        <p>Il programma non disegna. Dice il codice del report e consegna i dati, uno spool, oppure i parametri SQL. ASPDOCU risponde con il PDF.</p>
        <div class="url-list">${(info.urls || []).map((url) => `<code>${esc(url)}</code>`).join('')}</div>
        <div class="key-box">
          <label>Chiave per i programmi, vuota vuol dire rete fidata
            <input id="api-key" value="${esc(info.token || '')}" placeholder="nessuna chiave">
          </label>
          <button type="button" id="api-key-save">Salva chiave</button>
          <p class="muted">Header <code>X-Aspdocu-Key</code>. Si vede solo aprendo questa pagina dal PC dove gira ASPDOCU. Chi arriva da un altro indirizzo deve già conoscerla.</p>
        </div>
        <h2>JavaScript</h2>
        <pre id="js-sample">const Aspdocu = require('./sdk/aspdocu');

Aspdocu.stampa('${esc(id)}', {
  data: {
    header: { numero: '2026/0200', cliente: 'Cliente chiamato da JS' },
    rows: [{ codice: 'A1', descrizione: 'Riga', um: 'NR', qta: 1, prezzo: 10, importo: 10 }]
  },
  output: 'file',
  fileName: '${esc(id)}.pdf'
}, { baseUrl: '${esc(base)}'${info.token ? ", key: '" + esc(info.token) + "'" : ''} });</pre>
        <h2>Prova come se fossi un programma</h2>
        <label>Report<select id="call-report"></select></label>
        <label>Corpo della chiamata<textarea id="call-body" spellcheck="false"></textarea></label>
        <div class="row-buttons">
          <button type="button" id="call-run">Esegui la chiamata</button>
          <button type="button" id="call-sample" class="ghost">Dati di prova</button>
          <button type="button" id="call-sql" class="ghost">Parametro SQL</button>
          <button type="button" id="call-spool" class="ghost">Dallo spool</button>
        </div>
        <p id="call-result"></p>
        <h2>IBM i</h2>
        <pre>POST ${esc(base)}/api/v1/print
Content-Type: application/json
${info.token ? 'X-Aspdocu-Key: ' + esc(info.token) + '\n' : ''}
{"report":"${esc(id)}","output":"base64","params":["2026/0158"]}</pre>
        <p>L'esempio eseguibile su IBM i 7.3+ è <code>examples/CHIAMATA.sql</code>, con <code>QSYS2.HTTP_POST</code>. <code>output: "base64"</code> restituisce il PDF in un campo carattere. <code>output: "file"</code> lo lascia nella cartella <code>output</code> di questo PC.</p>
      </section>`;
    const select = document.getElementById('call-report');
    select.innerHTML = window.Asp.reports.map((report) => `<option value="${esc(report.id)}">${esc(report.name)}</option>`).join('');
    if (window.Asp.report) select.value = window.Asp.report.id;
    document.getElementById('call-body').value = JSON.stringify({ report: select.value, useSample: true, output: 'pdf' }, null, 2);
    document.getElementById('api-key-save').addEventListener('click', saveKey);
    document.getElementById('call-run').addEventListener('click', runCall);
    document.getElementById('call-sample').addEventListener('click', () => {
      document.getElementById('call-body').value = JSON.stringify({ report: select.value, useSample: true }, null, 2);
    });
    document.getElementById('call-sql').addEventListener('click', () => {
      document.getElementById('call-body').value = JSON.stringify({ report: select.value, params: ['2026/0158'], output: 'pdf' }, null, 2);
    });
    document.getElementById('call-spool').addEventListener('click', () => {
      document.getElementById('call-body').value = JSON.stringify({ report: select.value, fromSpool: true }, null, 2);
    });
    select.addEventListener('change', () => {
      const body = JSON.parse(document.getElementById('call-body').value || '{}');
      body.report = select.value;
      document.getElementById('call-body').value = JSON.stringify(body, null, 2);
    });
  }

  async function saveKey() {
    const token = document.getElementById('api-key').value;
    const data = await window.AspApi.send('PUT', '/api/v1/settings', { token });
    window.Asp.key = data.settings.token || '';
    localStorage.setItem('aspdocu-key', window.Asp.key);
    window.Asp.info.token = window.Asp.key;
    window.Asp.info.tokenRequired = Boolean(window.Asp.key);
    toast(window.Asp.key ? 'Chiave attiva' : 'Chiave tolta: la rete è aperta');
    paintApi();
  }

  async function runCall() {
    const result = document.getElementById('call-result');
    result.textContent = 'Chiamata in corso…';
    try {
      const body = JSON.parse(document.getElementById('call-body').value);
      const buffer = await window.AspApi.send('POST', '/api/v1/print', body);
      if (buffer instanceof ArrayBuffer) openPdf(buffer, 'Chiamata eseguita, PDF di ' + buffer.byteLength + ' byte');
      else result.textContent = JSON.stringify(buffer);
    } catch (error) {
      result.textContent = error.message;
    }
  }

  function openPdf(buffer, message) {
    const blob = new Blob([buffer], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const layer = document.getElementById('preview');
    layer.hidden = false;
    layer.innerHTML = `
      <div class="preview-bar">
        <strong>${esc(message || 'Anteprima PDF')}</strong>
        <a href="${url}" download="aspdocu.pdf">Scarica</a>
        <button type="button" id="close-preview">Chiudi</button>
      </div>
      <iframe title="Anteprima PDF" src="${url}"></iframe>`;
    document.getElementById('close-preview').addEventListener('click', () => {
      layer.hidden = true;
      layer.innerHTML = '';
      URL.revokeObjectURL(url);
    });
  }

  async function previewCurrent(extra) {
    if (!window.Asp.report) return toast('Apri un report');
    try {
      const buffer = await window.AspApi.send('POST', '/api/v1/preview', Object.assign({
        template: window.Asp.report,
        useSample: true
      }, extra || {}));
      openPdf(buffer, window.Asp.report.name);
    } catch (error) {
      toast(error.message);
    }
  }

  function newReport() {
    const modal = document.getElementById('modal');
    modal.hidden = false;
    modal.innerHTML = `
      <form class="dialog" id="new-form">
        <h2>Nuovo report</h2>
        <label>Codice, lo useranno i programmi<input name="id" required pattern="[A-Za-z0-9_-]{1,48}" placeholder="ordine"></label>
        <label>Nome<input name="name" required placeholder="Conferma d'ordine"></label>
        <label>Parti da<select name="from">
          <option value="blank">Foglio vuoto</option>
          <option value="fattura">Modello fattura</option>
          <option value="etichetta">Modello etichetta</option>
        </select></label>
        <label>Formato<select name="preset"><option>A4</option><option>A5</option><option>Letter</option><option>Etichetta</option></select></label>
        <div class="row-buttons">
          <button type="submit">Crea</button>
          <button type="button" id="modal-close" class="ghost">Annulla</button>
        </div>
      </form>`;
    document.getElementById('modal-close').addEventListener('click', () => { modal.hidden = true; });
    document.getElementById('new-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = new FormData(event.target);
      try {
        const data = await window.AspApi.send('POST', '/api/v1/reports', {
          id: form.get('id'),
          name: form.get('name'),
          from: form.get('from'),
          preset: form.get('preset')
        });
        await refreshList();
        modal.hidden = true;
        show('design');
        window.AspDesigner.openReport(data.report);
      } catch (error) {
        toast(error.message);
      }
    });
  }

  async function duplicateReport() {
    if (!window.Asp.report) return;
    const id = window.prompt('Codice della copia', window.Asp.report.id + '-copia');
    if (!id) return;
    const data = await window.AspApi.send('POST', '/api/v1/reports', {
      id,
      name: window.Asp.report.name + ' copia',
      from: window.Asp.report.id
    });
    await refreshList();
    window.AspDesigner.openReport(data.report);
  }

  async function deleteReport() {
    if (!window.Asp.report) return;
    if (!window.confirm('Eliminare ' + window.Asp.report.name + '?')) return;
    await window.AspApi.send('DELETE', '/api/v1/reports/' + encodeURIComponent(window.Asp.report.id));
    window.Asp.report = null;
    await refreshList();
    if (window.Asp.reports[0]) await openReport(window.Asp.reports[0].id);
    else paintHome();
  }

  async function openReport(id) {
    const data = await window.AspApi.send('GET', '/api/v1/reports/' + encodeURIComponent(id));
    show('design');
    window.AspDesigner.openReport(data.report);
  }

  async function refreshList() {
    const data = await window.AspApi.send('GET', '/api/v1/reports');
    window.Asp.reports = data.reports;
    const select = document.getElementById('report-select');
    if (select && window.Asp.report) {
      select.innerHTML = window.Asp.reports.map((report) => `<option value="${esc(report.id)}">${esc(report.name)}</option>`).join('');
      select.value = window.Asp.report.id;
    }
  }

  function toast(message) {
    const node = document.getElementById('toast');
    node.textContent = message;
    node.hidden = false;
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => { node.hidden = true; }, 3200);
  }

  function needKey(message) {
    toast(message || 'Serve la chiave ASPDOCU');
    show('api');
  }

  async function boot() {
    document.querySelectorAll('.nav button').forEach((button) => {
      button.addEventListener('click', () => show(button.dataset.view));
    });
    document.getElementById('btn-preview').addEventListener('click', () => previewCurrent());
    document.getElementById('btn-preview-spool').addEventListener('click', () => previewCurrent({ fromSpool: true, useSample: false }));
    document.getElementById('btn-save').addEventListener('click', () => window.AspDesigner.saveReport());
    window.AspDesigner.init();
    window.Asp.info = await window.AspApi.send('GET', '/api/v1/info');
    if (window.Asp.info.token) {
      window.Asp.key = window.Asp.info.token;
      localStorage.setItem('aspdocu-key', window.Asp.key);
    }
    const systems = await window.AspApi.send('GET', '/api/v1/as400/systems');
    window.Asp.systems = systems.systems;
    await refreshList();
    const preferred = window.Asp.reports.find((report) => report.id === 'fattura') || window.Asp.reports[0];
    if (preferred) {
      const data = await window.AspApi.send('GET', '/api/v1/reports/' + encodeURIComponent(preferred.id));
      window.AspDesigner.openReport(data.report);
    }
    show('home');
  }

  window.AspUi = {
    show, openReport, refreshList, newReport, duplicateReport, deleteReport, previewCurrent, toast, needKey
  };
  boot().catch((error) => {
    document.getElementById('view-home').innerHTML = '<p class="result bad">' + esc(error.message) + '</p>';
  });
}());
