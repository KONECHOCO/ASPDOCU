-- Chiamata da IBM i (7.3 o successivo) verso ASPDOCU.
-- Sul PC o sul server dove gira il designer: npm start
-- Sostituisci l'indirizzo con quello mostrato nella pagina Programmi.
-- output=base64 restituisce il PDF in un campo carattere, comodo per HTTP_POST.
-- output=file lascia il PDF nella cartella output di ASPDOCU e risponde con il percorso.

VALUES QSYS2.HTTP_POST(
  CAST('http://192.168.0.10:4780/api/v1/print' AS VARCHAR(2048)),
  CAST('{
    "report": "fattura",
    "output": "base64",
    "fileName": "fattura-0158.pdf",
    "params": ["2026/0158"]
  }' AS CLOB(1M)),
  CAST('{"header":"content-type,application/json"}' AS CLOB(1K))
);

-- Se in Programmi hai impostato una chiave, aggiungi l'header:
-- {"header":"content-type,application/json,x-aspdocu-key,LA-CHIAVE"}

-- Variante: il programma RPG manda lui i dati, senza SQL su ASPDOCU.
-- VALUES QSYS2.HTTP_POST(
--   CAST('http://192.168.0.10:4780/api/v1/print' AS VARCHAR(2048)),
--   CAST('{"report":"fattura","output":"file","data":{"header":{"numero":"2026/0158"},"rows":[]}}' AS CLOB(1M)),
--   CAST('{"header":"content-type,application/json"}' AS CLOB(1K))
-- );
