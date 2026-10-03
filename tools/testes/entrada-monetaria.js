/* Contrato da digitação monetária no celular e no computador. */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const RAIZ = path.resolve(__dirname, '..', '..');
const ler = (p) => fs.readFileSync(path.join(RAIZ, p), 'utf8');
const janela = { I18n: { lang: 'pt', locale: 'pt-BR' } };
vm.runInNewContext(ler('assets/js/utils.js'), {
  window: janela,
  Intl,
  Number,
  Math,
  Date,
  String,
  RegExp,
  parseFloat,
  document: {}
}, { filename: 'assets/js/utils.js' });

const U = janela.U;
const falhas = [];
const igual = (atual, esperado, caso) => {
  if (atual !== esperado) falhas.push(`${caso}: veio "${atual}", esperado "${esperado}"`);
};

let valor = U.moneyGrow('', '1', true);
igual(valor, '0,01', 'primeiro dígito');
valor = U.moneyGrow(valor, '2', false);
igual(valor, '0,12', 'segundo dígito');
valor = U.moneyGrow(valor, '3', false);
igual(valor, '1,23', 'reais e centavos juntos');
valor = U.moneyGrow(valor, '4', false);
igual(valor, '12,34', 'dezena com centavos');
valor = U.moneyGrow(valor, '5', false);
valor = U.moneyGrow(valor, '6', false);
igual(valor, '1.234,56', 'milhar com centavos');
igual(U.moneyShrink(valor), '123,45', 'apagar desloca toda a sequência');

valor = U.moneyFormatParts('1234', '00');
valor = U.moneySetCent(valor, '5', 0);
valor = U.moneySetCent(valor, '6', 1);
igual(valor, '1.234,56', 'centavos explícitos');

/* A máscara é a mesma; quem a aplica mudou de arquivo. O painel
   anterior foi apagado, e o controlador vive na interface da V3. */
const app = ler('preview-v3/app.js');
if (!/addEventListener\('beforeinput'/.test(app) || !/U\.moneyGrow/.test(app)) {
  falhas.push('o controlador real não usa a máscara testada');
}
if (!/U\.moneyGrow\(input\.value,\s*text,\s*replace\)/.test(app) ||
    !/U\.moneyShrink\(input\.value\)/.test(app) ||
    /posicaoCentavo|moneyParte|moneyCentavo/.test(app)) {
  falhas.push('reais e centavos ainda são tratados como blocos separados');
}
/* Dinheiro recebe a máscara; taxa e cotação, não — a entrada ali é
   decimal livre, e mascarar 5,45 como R$ 5,45 pediria à pessoa um
   valor que ela não tem. */
if (!/data-money="true"/.test(app)) falhas.push('nenhum campo de dinheiro foi marcado');
for (const campo of ['rate', 'cotacao']) {
  const tag = new RegExp('name="' + campo + '"[^>]*').exec(app);
  if (!tag) { falhas.push('campo ' + campo + ' sumiu do formulário'); continue; }
  if (/data-money/.test(tag[0])) falhas.push('taxa ou cotação recebeu a máscara de dinheiro por engano');
}

if (falhas.length) {
  console.error('Contrato da entrada monetária quebrado:');
  falhas.forEach((f) => console.error('  - ' + f));
  process.exit(1);
}

console.log('OK — reais e centavos avançam juntos; taxas e cotações mantêm entrada decimal.');
