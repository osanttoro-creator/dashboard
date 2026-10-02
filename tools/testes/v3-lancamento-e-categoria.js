'use strict';

/* =============================================================
   O LANÇAMENTO E A CATEGORIA, NA V3
   -------------------------------------------------------------
   Estas quatro coisas já foram construídas uma vez no painel
   anterior (assets/js/forms.js e ui.js) e não chegaram ao ar,
   porque /app serve app-v3.html e ele não carrega aqueles
   arquivos. A verificação existe para o erro não se repetir: se
   alguém reescrever o formulário da V3, é aqui que o sumiço
   aparece.
   ============================================================= */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..', '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const app = read('preview-v3/app.js');
const css = read('preview-v3/app.css');
const store = read('assets/js/store.js');
const calc = read('assets/js/calc.js');

/* ---- três estados, e não uma marca ---- */
assert.match(app, /name="situacao"/, 'o lançamento precisa do seletor de situação');
assert.match(app, /Cancelado — não entra em total nenhum/);
assert.match(app, /const situacaoInicial = editing/);
assert.match(app, /cancelado:String\(fd\.get\('situacao'\)\|\|''\)==='cancelado'/, 'o cancelado precisa ser salvo');
assert.match(app, /confirmed:String\(fd\.get\('situacao'\)\|\|'pago'\)==='pago'/);
assert.doesNotMatch(app, /fd\.get\('confirmed'\)==='true'/, 'o estado binário antigo não deve voltar');

/* O cancelado sai de TODO total — inclusive do previsto — mas não
   some da lista: sem isso, cancelar por engano seria irreversível. */
assert.match(calc, /opcoes && opcoes\.incluirCancelados/);
assert.match(app, /comCancelados: true/);
assert.match(app, /is-cancelada/);
assert.match(css, /\.v3-tx\.is-cancelada/);
assert.match(app, /entry\.cancelado \? 'pago' : entry\.confirmed \? 'pendente' : 'cancelado'/, 'o status gira nos três estados');
assert.match(app, /Store\.transactions\.setCancelado/);
assert.match(store, /setCancelado\(txId, ym, value\)/);

/* ---- por onde o dinheiro passou ---- */
assert.match(app, /function updateComposerMeios/);
assert.match(app, /Store\.meiosDaConta/, 'a lista de meios vem do que a conta declarou oferecer');
assert.match(app, /id="v3-tx-meio-label"/);
assert.match(app, /bloco\.hidden = type !== 'account'/, 'no crédito o meio é o próprio cartão');
assert.match(app, /meio:sourceType==='account'/);
assert.match(app, /fd\.getAll\('meios'\)/, 'a conta declara o que oferece');
assert.match(app, /O QUE A CONTA OFERECE/);
assert.match(app, /Store\.payInvoice\(cardId,ref,\{amount,paidAt,accountId,meio\}\)/, 'a fatura também registra o meio');
assert.match(store, /MEIOS_OFERECIVEIS/);

/* ---- ícone com forma, cor limitada por família ---- */
assert.match(app, /function iconPicker\(atual,choices\)/);
assert.match(app, /type="radio" name="icon"/, 'o ícone é caixa de seleção, não lista de nomes');
assert.doesNotMatch(app, /<label>ÍCONE<select name="icon">/, 'a lista de nomes não deve voltar');
assert.match(app, /function colorPicker\(atual\)/);
assert.match(app, /Store\.COLOR_FAMILIES/);
assert.doesNotMatch(app, /<input type="color" name="color"/, 'a cor não é seleção livre');
assert.match(app, /function corPadraoDeCategoria/, 'categoria nova nasce numa cor da paleta');
assert.match(css, /\.v3-color-fam/);
assert.match(css, /\.v3-icon-opt/);

/* ---- o calendário em três alcances ---- */
/* Cada vista responde uma pergunta diferente: em que meses eu sobro
   (ano), em que dias as coisas caem (mês), o que vem pela frente
   (semana). Com só a grade do mês, as outras duas viravam conta de
   cabeça. */
const calCss = read('preview-v3/calendar.css');
assert.match(app, /const CAL_VISTAS = \[\['year', 'Ano'\], \['month', 'Mês'\], \['week', 'Semana'\]\]/);
assert.match(app, /function calendarioAno\(\)/);
assert.match(app, /function calendarioSemana\(\)/);
assert.match(app, /function calendarioMes\(\)/);
assert.match(app, /data-cal-view/);
assert.match(app, /data-cal-goto/, 'tocar num mês do ano abre os dias dele');
assert.match(app, /data-cal-days/, 'a semana anda sete dias');
/* A semana atravessa a virada do mês: buscar eventos só do mês em
   exibição perderia metade dela. */
assert.match(app, /function eventosDoMes\(ym\)/);
assert.match(app, /if \(!porMes\[ym\]\) porMes\[ym\] = eventosDoMes\(ym\)/);
/* A barra do ano é comparável entre meses, não normalizada por mês. */
assert.match(app, /const teto = Math\.max\(1, \.\.\.linhas\.map/);
assert.match(app, /Number\(target\.dataset\.calStep\|\|1\)/, 'no ano a seta anda doze meses');
assert.match(calCss, /\.v3-cal-meses/);
assert.match(calCss, /\.v3-cal-dias/);

console.log('V3: três estados, meio de pagamento, seletores e as três vistas do calendário protegidos.');
