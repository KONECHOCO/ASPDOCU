window.Asp = {
  view: 'home',
  reports: [],
  report: null,
  selectedId: null,
  tool: 'select',
  zoom: 1,
  snap: true,
  grid: 2,
  history: [],
  hist: -1,
  clip: null,
  info: null,
  systems: [],
  key: localStorage.getItem('aspdocu-key') || '',
  spoolText: '',
  spoolName: '',
  dragging: false
};

window.AspApi = {
  async send(method, url, body) {
    const headers = {};
    if (window.Asp.key) headers['X-Aspdocu-Key'] = window.Asp.key;
    const options = { method, headers };
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(body);
    }
    const response = await fetch(url, options);
    const type = response.headers.get('content-type') || '';
    if (type.includes('application/pdf')) {
      if (!response.ok) throw new Error('Anteprima PDF non riuscita (' + response.status + ')');
      return response.arrayBuffer();
    }
    if (type.includes('image/')) {
      if (!response.ok) throw new Error('Immagine non riuscita');
      return response.arrayBuffer();
    }
    const data = await response.json().catch(() => ({}));
    if (response.status === 401) {
      window.Asp.key = '';
      localStorage.removeItem('aspdocu-key');
      if (window.AspUi) window.AspUi.needKey(data.error);
    }
    if (!response.ok) throw new Error(data.error || ('Errore ' + response.status));
    return data;
  }
};
