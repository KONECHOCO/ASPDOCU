(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Aspdocu = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  async function request(report, body, options) {
    const base = (options && options.baseUrl) || 'http://127.0.0.1:4780';
    const headers = { 'Content-Type': 'application/json' };
    if (options && options.key) headers['X-Aspdocu-Key'] = options.key;
    const response = await fetch(base.replace(/\/$/, '') + '/api/v1/print', {
      method: 'POST',
      headers,
      body: JSON.stringify(Object.assign({ report: report }, body || {}))
    });
    if (!response.ok) throw new Error(await response.text());
    const output = (body && body.output) || 'pdf';
    if (output === 'pdf') {
      const bytes = await response.arrayBuffer();
      return typeof Buffer !== 'undefined' ? Buffer.from(bytes) : bytes;
    }
    return response.json();
  }

  return { stampa: request, print: request };
}));
