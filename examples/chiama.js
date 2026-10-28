/*
  Chiamata da un programma Node, o da qualsiasi altro processo che parla HTTP.
  Avvia prima ASPDOCU con: npm start
  Poi: node examples/chiama.js
*/
const http = require('http');

const body = JSON.stringify({
  report: 'fattura',
  output: 'file',
  fileName: 'fattura-da-programma.pdf',
  data: {
    header: {
      numero: '2026/0200',
      data: '28/10/2026',
      cliente: 'Programma esterno S.r.l.',
      indirizzo: 'Via del Codice 1',
      localita: '00100 Roma RM',
      pagamento: 'Vista fattura'
    },
    rows: [
      { codice: 'SRV-01', descrizione: 'Stampa richiamata da JavaScript', um: 'NR', qta: 1, prezzo: 120, importo: 120 },
      { codice: 'SRV-02', descrizione: 'Seconda riga inviata dal chiamante', um: 'NR', qta: 2, prezzo: 15, importo: 30 }
    ]
  }
});

const req = http.request({
  host: '127.0.0.1',
  port: 4780,
  path: '/api/v1/print',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body)
  }
}, (res) => {
  const chunks = [];
  res.on('data', (chunk) => chunks.push(chunk));
  res.on('end', () => {
    const text = Buffer.concat(chunks).toString('utf8');
    console.log(res.statusCode, text);
    if (res.statusCode === 200) {
      const payload = JSON.parse(text);
      console.log('PDF pronto: output/' + payload.fileName);
    }
  });
});

req.on('error', (error) => {
  console.error('ASPDOCU non risponde. Avvia npm start. ' + error.message);
  process.exit(1);
});
req.write(body);
req.end();
