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
igual(valor, '1,00', 'primeiro dígito');
valor = U.moneyGrow(valor, '0', false);
igual(valor, '10,00', 'segundo dígito');
valor = U.moneyGrow(valor, '0', false);
igual(valor, '100,00', 'terceiro dígito');
valor = U.moneyGrow(valor, '0', false);
igual(valor, '1.000,00', 'milhar');
igual(U.moneyShrink(valor), '100,00', 'apagar inteiro');

valor = U.moneyFormatParts('1234', '00');
valor = U.moneySetCent(valor, '5', 0);
valor = U.moneySetCent(valor, '6', 1);
igual(valor, '1.234,56', 'centavos explícitos');

const app = ler('assets/js/app.js');
const html = ler('app.html');
const forms = ler('assets/js/forms.js');
if (!/addEventListener\('beforeinput'/.test(app) || !/U\.moneyGrow/.test(app)) {
  falhas.push('o controlador real não usa a máscara testada');
}
if (!/const posicaoCentavo\s*=/.test(app) ||
    !/posicaoCentavo\(campo, false\)/.test(app) ||
    !/tudoSelecionado \? -1 : posicaoCentavo\(campo, false\)/.test(app) ||
    /requestAnimationFrame\(\(\) => cursorInteiro\(campo\)\)/.test(app)) {
  falhas.push('o cursor ainda não permite editar os centavos diretamente');
}
const inputMarcado = (id) => {
  const tag = html.match(new RegExp(`<input[^>]*id=["']${id}["'][^>]*>|<input[^>]*data-money=["']true["'][^>]*id=["']${id}["'][^>]*>`));
  return tag && /data-money=["']true["']/.test(tag[0]);
};
if (!inputMarcado('projInitial') || !inputMarcado('projMonthly')) {
  falhas.push('os valores da projeção não foram marcados como dinheiro');
}
if (/id="projRate"[^>]*data-money/.test(html) ||
    /Rentabilidade estimada[^\n]*data-money/.test(forms) ||
    /placeholder:\s*'5,45'[^\n]*data-money/.test(forms)) {
  falhas.push('taxa ou cotação recebeu a máscara de dinheiro por engano');
}

if (falhas.length) {
  console.error('Contrato da entrada monetária quebrado:');
  falhas.forEach((f) => console.error('  - ' + f));
  process.exit(1);
}

console.log('OK — valores crescem antes da vírgula; taxas e cotações mantêm entrada decimal.');
