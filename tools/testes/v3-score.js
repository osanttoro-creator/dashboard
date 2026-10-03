'use strict';

/* =============================================================
   O OAZE SCORE — O QUE NÃO PODE SE PERDER
   -------------------------------------------------------------
   O score é a única tela do app que faz um JULGAMENTO sobre a vida
   financeira de quem usa. Cada regra abaixo existe porque, sem ela,
   o julgamento passa a afirmar coisas que o motor não sabe — e um
   número desses, dito com confiança, é pior do que número nenhum.
   ============================================================= */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const raiz = path.join(__dirname, '..', '..');
const ler = (f) => fs.readFileSync(path.join(raiz, f), 'utf8');
const calc = ler('assets/js/calc.js');
const app = ler('preview-v3/app.js');
const css = ler('preview-v3/app.css');

/* ---- o motor ---- */

/* Peso igual para perguntas desiguais era o defeito da versão
   anterior: ter reserva de emergência e ter patrimônio crescendo
   valiam os mesmos 20 pontos. */
assert.match(calc, /chave: 'poupanca', nome: '[^']+', peso: 16/, 'cada pergunta carrega o seu peso');
for (const parte of ['poupanca', 'credito', 'reserva', 'patrimonio', 'dia', 'previsivel', 'tetos', 'metas']) {
  assert.match(calc, new RegExp("chave: '" + parte + "'"), 'o score perdeu a pergunta ' + parte);
}

/* UMA PERGUNTA QUE NÃO SE APLICA NÃO VALE ZERO. Quem não tem meta
   nenhuma não falhou nas metas, e pontuar zero ali afirmaria uma
   coisa falsa sobre a pessoa — além de prender o total num teto
   inalcançável sem explicação. */
assert.match(calc, /if \(!p\.aplica\) p\.pontos = 0;/);
assert.match(calc, /const validas = partes\.filter\(\(p\) => p\.aplica\);/);
assert.match(calc, /const pesoAplicado = U\.sum\(validas, \(p\) => p\.peso\);/);
assert.match(calc, /pesoAplicado > 0[\s\S]{0,120}U\.sum\(validas, \(p\) => p\.pontos\) \/ pesoAplicado/);

/* Um teto num mês sem gasto nenhum não foi respeitado: não houve o
   que respeitar. Sem isto, todo mês antigo da retrospectiva ganhava
   dez pontos de graça. */
assert.match(calc, /const gastouNoMes = Calc\.monthTotals\(ym, prof\)\.expense > 0;/);
assert.match(calc, /aplica: tetos\.length > 0 && gastouNoMes/);

/* A retrospectiva só pode refazer o que o passado responde. Fatura
   em aberto, saldo, patrimônio e metas são o estado de HOJE: o motor
   não tem como saber se uma fatura estava paga em março. */
assert.match(calc, /Calc\.scoreHistory = function \(ym, meses, profile\)/);
assert.match(calc, /partes\.filter\(\(p\) => p\.retro && p\.aplica\)/);
assert.match(calc, /chave: 'metas', nome: 'Metas andando', peso: 8, retro: false/,
  'metas dependem do guardado de hoje: não podem entrar na retrospectiva');
assert.match(calc, /chave: 'credito'[^\n]*retro: false/);
assert.match(calc, /chave: 'reserva'[^\n]*retro: false/);
assert.match(calc, /chave: 'patrimonio'[^\n]*retro: false/);
/* Mês sem nenhuma pergunta aplicável devolve null: "sem dados" não é
   zero, e desenhar zero inventaria um mês ruim que nunca houve. */
assert.match(calc, /total: pesoRetro > 0 \?[\s\S]{0,120}: null/);

/* Com menos de 6 meses de registro, "subiu 100%" é só o efeito de
   não haver passado. */
assert.match(calc, /aplica: antes !== 0,/);

/* Dois defeitos antigos, consertados junto e fáceis de voltar: a
   parte "contas em dia" perguntava ao perfil ATIVO mesmo quando o
   score era de outro; e a memória de cálculo estourava onde não há
   estado carregado no Store, que é o caso da prévia pública. */
assert.match(calc, /Calc\.currentInvoiceRef\(c, ym, prof\)/);
assert.match(calc, /try \{ ativo = P\(\); \} catch \(e\) \{ ativo = null; \}/);

/* ---- a tela ---- */

assert.match(app, /function painelScore\(\)/);
assert.match(app, /function historicoDoScore\(\)/);
/* O painel mora no INÍCIO, abaixo da carteira, e não mais dentro de
   Análises: foi onde ele foi pedido. */
assert.match(app, /\$\{quickActions\(\)\}<\/div>/);
assert.ok(/\$\{painelScore\(\)\}<\/div>`;/.test(app), 'o painel fecha a grade do início, abaixo das duas colunas');
assert.doesNotMatch(app, /\+ painelScore\(\)\n/, 'o score saiu de Análises quando foi para o início');

/* A frase do que há mais a ganhar compara FRAÇÃO do peso: ponto
   bruto não se compara entre perguntas de pesos diferentes. */
assert.match(app, /\(a\.pontos \/ a\.peso\) - \(b\.pontos \/ b\.peso\)/);

/* A demonstração mostra o score de verdade do perfil de exemplo: o
   motor precisa do perfil normalizado, que a amostra escrita à mão
   não tem. */
assert.match(app, /Store\.normalizeProfile\(JSON\.parse\(JSON\.stringify\(sample\)\)\)/);

/* Com os valores ocultos, só os dígitos de dinheiro somem: mês,
   meses e porcentagem continuam, senão a frase para de dizer algo. */
assert.match(app, /replace\(\/R\\\$\\s\?\[\\d\.,\]\+\/g, \(m\) => ocultarDigitos\(m\)\)/);

/* A barra do histórico troca o mês e nada mais. */
assert.match(app, /data-score-mes/);
assert.match(app, /\[data-score-mes\]/, 'o clique precisa estar na lista de alvos');
assert.match(app, /if \(target\.dataset\.scoreMes\) \{ state\.ym=target\.dataset\.scoreMes/);

/* A altura da coluna só resolve dentro de um pai com altura
   DEFINIDA; com trilha automática a barra vira zero e o histórico
   some sem erro nenhum no console. */
assert.match(css, /\.v3-score-barra\{display:grid;grid-template-rows:minmax\(0,1fr\) auto/);
assert.match(css, /\.v3-score-barra>span\{display:flex;align-items:flex-end/);
assert.match(css, /height:calc\(var\(--alto,10\) \* 1%\)/);
/* O que não se aplica aparece dizendo isso, em cinza e sem barra. */
assert.match(css, /\.v3-score-lista li\.fora-da-conta\{opacity/);

console.log('OAZE Score: pesos, o que não se aplica, a retrospectiva honesta e o histórico protegidos.');
