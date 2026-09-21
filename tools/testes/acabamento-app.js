/* Regressões dos ajustes finais de uso e acabamento do app. */
'use strict';

const fs = require('fs');
const path = require('path');
const RAIZ = path.resolve(__dirname, '..', '..');
const ler = (p) => fs.readFileSync(path.join(RAIZ, p), 'utf8');

const html = ler('app.html');
const app = ler('assets/js/app.js');
const css = ler('assets/css/style.css');
const settings = ler('assets/js/pages/settings.js');
const store = ler('assets/js/store.js');
const forms = ler('assets/js/forms.js');
const cards = ler('assets/js/cards.js');
const shell = ler('assets/js/shell.js');
const falhas = [];
const exigir = (cond, msg) => { if (!cond) falhas.push(msg); };

exigir(!/Registrato/i.test(html), 'a função/propaganda do Registrato ainda existe');
/* Antes o app prometia ler o extrato do banco e explicava por que
   não aceitava PDF. Não aceita mais formato nenhum: a importação
   inteira saiu em 16/09/2026 porque lia errado o arquivo de parte
   dos bancos. O teste guarda a remoção. */
exigir(!/importFile|btnParseImport|data-tab="import"/.test(html), 'a aba de importar extratos voltou ao app');
exigir(/uso-detalhes/.test(settings) && /uso-resumo/.test(css), 'consumo do plano não está recolhível');
exigir(/prepararSeletoresContexto/.test(app) && /oaze-select-menu/.test(css), 'menus de contexto próprios não foram ligados');
exigir(/limitarEntradasNumericas/.test(app) && /\[inputmode="decimal"\]/.test(app), 'campos de valor não têm filtro numérico');
exigir(/grid-template-columns:\s*30px minmax\(0, 1fr\)/.test(css), 'categoria ainda não reserva espaço para o ícone');
exigir(/\.pill-btn > \[data-ico\]/.test(css) && /\.notif-count\s*\{[^}]*position:\s*absolute/s.test(css),
  'ícones ou contador do cabeçalho continuam sem alinhamento explícito');
exigir(/Store\.accountColor\s*=/.test(store) && /color:\s*preset\s*\?\s*preset\.color/.test(store),
  'contas conhecidas não normalizam para a cor predeterminada');
exigir(/const corDaConta\s*=/.test(forms) && /color:\s*corDaConta\(\)/.test(forms) &&
  /bank:\s*acc\.bank/.test(cards), 'formulário ou cartão da conta ainda ignora a cor do banco');
exigir(/class="menu-movel esta-pronta"/.test(html) &&
  /id="menuMovel"[^>]*aria-hidden="true"[^>]*inert/.test(html) &&
  !/requestIdleCallback\(aquecerFolha/.test(shell), 'menu móvel ainda depende de aquecimento tardio');

console.log('\n  acabamento final do app');
if (falhas.length) {
  falhas.forEach((f) => console.log('  FALHA  ' + f));
  process.exit(1);
}
console.log('  ok     importação, plano, seletores, valores, categorias e cabeçalho\n');
