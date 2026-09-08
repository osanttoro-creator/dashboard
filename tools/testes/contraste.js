/* =============================================================
   contraste.js — mede, não opina
   -------------------------------------------------------------
   Contraste é uma das poucas coisas de interface que tem resposta
   numérica. "Parece legível" é opinião; 1,13:1 é um fato — e foi
   exatamente esse o valor do cartão "Saldo do mês" antes desta
   correção: tinta marrom escura (#2A1D12) sobre um gradiente azul
   escuro (#17394C → #0F2C3D).

   Como o gradiente tem duas pontas, cada par é medido nas DUAS, e
   vale a pior. Medir só no meio esconde a ponta ruim.

   Referência: WCAG 2.2, contraste mínimo
     4,5:1  texto normal
     3,0:1  texto grande (>= 24px, ou >= 18.66px em negrito)
     3,0:1  componentes de interface e bordas informativas

   COMO RODAR
     node tools/testes/contraste.js
   ============================================================= */
'use strict';

/* ---------------------------------------------------------------
   a matemática da WCAG
   --------------------------------------------------------------- */
function canal(v) {
  const s = v / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

function luminancia(hex) {
  const h = hex.replace('#', '');
  const n = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const r = parseInt(n.slice(0, 2), 16);
  const g = parseInt(n.slice(2, 4), 16);
  const b = parseInt(n.slice(4, 6), 16);
  return 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b);
}

function razao(a, b) {
  const la = luminancia(a), lb = luminancia(b);
  const claro = Math.max(la, lb), escuro = Math.min(la, lb);
  return (claro + 0.05) / (escuro + 0.05);
}

/* ---------------------------------------------------------------
   o que medir
   ---------------------------------------------------------------
   O cartão em destaque do Financeiro e da Visão geral. O fundo é um
   gradiente, e há um gradiente diferente em cada tema.

   As TRÊS pontas entram: duas do tema claro e a do tema escuro, que
   é a mais clara de todas e portanto a pior para texto claro. Medir
   só um tema deixa o outro sem cobertura — e quem escolhe o tema é
   o usuário. */
const FUNDOS = [
  { nome: "claro, ponta A", cor: "#17394C" },
  { nome: "claro, ponta B", cor: "#0F2C3D" },
  { nome: "escuro, ponta A", cor: "#2D4F56" }
];

const casos = [
  { nome: 'valor do saldo (28px, negrito)', cor: '#F4F1EA', minimo: 3.0, grande: true },
  { nome: 'rótulo "Saldo do mês"',          cor: '#BCCBD3', minimo: 4.5 },
  { nome: 'texto de apoio (delta)',         cor: '#BCCBD3', minimo: 4.5 },
  { nome: 'valor positivo',                 cor: '#8BE0B4', minimo: 4.5 },
  { nome: 'valor negativo',                 cor: '#FFB09A', minimo: 4.5 },
  { nome: 'selo (badge) sobre o herói',     cor: '#E9F0F3', minimo: 3.0 }
];

/* ---------------------------------------------------------------
   roda
   --------------------------------------------------------------- */
console.log('');
console.log('  contraste — cartao em destaque, nos dois temas');
console.log('  fundos: ' + FUNDOS.map((f) => f.cor).join('  '));
console.log('  ' + '-'.repeat(64));

let falhas = 0;

casos.forEach((c) => {
  const pior = Math.min.apply(null, FUNDOS.map((f) => razao(c.cor, f.cor)));
  const ok = pior >= c.minimo;
  if (!ok) falhas++;
  console.log('    ' + (ok ? 'ok   ' : 'FALHA') + ' ' +
    c.nome.padEnd(32) + c.cor + '  ' +
    pior.toFixed(2).padStart(6) + ':1  (minimo ' + c.minimo.toFixed(1) + ')' +
    (c.grande ? '  [texto grande]' : ''));
});

/* A regressão que este arquivo existe para impedir. Deixá-la aqui,
   medida e nomeada, é mais útil do que um comentário dizendo "não
   use tinta escura no herói": o número mostra o tamanho do erro. */
const antes = Math.min.apply(null, FUNDOS.map((f) => razao("#2A1D12", f.cor)));
console.log('  ' + '-'.repeat(64));
console.log('    para referencia, a cor ANTERIOR (#2A1D12): ' +
  antes.toFixed(2) + ':1 — abaixo de qualquer minimo');

if (falhas) {
  console.log('');
  console.log('  ' + falhas + ' PAR(ES) ABAIXO DO MINIMO');
  console.log('');
  process.exit(1);
}
console.log('  todos os pares passam nas tres pontas, nos dois temas');
console.log('');
