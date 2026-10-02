'use strict';

const assert = require('node:assert/strict');
const { parseCsv, parsePdfItems } = require('../../preview-v3/coco-import.js');

const csv = [
  'Data;Lançamento;Crédito (R$);Débito (R$);Saldo (R$)',
  '01/10/2026;SALDO INICIAL;0,00;0,00;100,00',
  '01/10/2026;"Mercado; bairro";0,00;25,50;74,50',
  '02/10/2026;Salário;50,00;0,00;124,50'
].join('\r\n');
const parsed = parseCsv(csv);
assert.equal(parsed.rows.length, 2);
assert.deepEqual(parsed.rows.map(({ cents }) => cents), [-2550, 5000]);
assert.equal(parsed.rows[0].description, 'Mercado; bairro');
assert.deepEqual(parsed.checks, { passed: 2, failed: 0 });

const badCsv = csv.replace('124,50', '124,51');
assert.equal(parseCsv(badCsv).checks.failed, 1);
assert.throws(() => parseCsv('Data;Descrição;Valor\n01/10/2026;Pix;10,00'), /Layout CSV não reconhecido/);
assert.throws(() => parseCsv(csv.replace('02/10/2026;Salário;50,00;0,00', '02/10/2026;Salário;50,00;50,00')), /ambíguo/);

function line(y, text) { return { str: text, transform: [1, 0, 0, 1, 45, y] }; }
const pdf = [[
  line(740, 'EXTRATO'),
  line(710, '01/10/2026 SALDO DO DIA 100,00'),
  line(690, '02/10/2026 PIX RECEBIDO 50,00'),
  line(670, '02/10/2026 COMPRA -25,50'),
  line(650, '02/10/2026 SALDO DO DIA 124,50')
]];
const parsedPdf = parsePdfItems(pdf);
assert.equal(parsedPdf.rows.length, 2);
assert.deepEqual(parsedPdf.checks, { passed: 1, failed: 0 });
assert.throws(() => parsePdfItems([[line(700, 'COMPROVANTE DE PIX')]]), /layout de extrato reconhecido/);

console.log('Coco: extratos CSV/PDF reconhecidos, saldos conferidos e layouts desconhecidos bloqueados.');
