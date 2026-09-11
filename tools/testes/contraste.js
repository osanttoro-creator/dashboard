/* =============================================================
   contraste.js — mede, não opina
   -------------------------------------------------------------
   Contraste é uma das poucas coisas de interface que tem resposta
   numérica. "Parece legível" é opinião; 1,13:1 é um fato — e foi
   exatamente esse o valor do cartão "Saldo do mês" em 2026: tinta
   marrom escura (#2A1D12) sobre um gradiente azul escuro
   (#17394C → #0F2C3D). O número mais importante da tela era, na
   prática, invisível.

   Desde a identidade visual v1 (setembro de 2026) o cartão em
   destaque é do mesmo material dos outros — Cal no tema claro,
   Petróleo no escuro — e as cores de texto são as da paleta
   travada. Cada par é medido contra os DOIS fundos de cada tema
   (a superfície e o fundo atrás dela, porque o material é
   translúcido), e vale o pior.

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
   o que medir — os mesmos valores do style.css
   --------------------------------------------------------------- */
const TEMAS = [
  {
    nome: 'claro',
    fundos: [
      { nome: 'Cal (cartão)', cor: '#FBF8F2' },
      { nome: 'Areia (fundo)', cor: '#F4EFE6' }
    ],
    casos: [
      { nome: 'valor do saldo',           cor: '#11262F', minimo: 4.5 },
      { nome: 'rótulo e texto de apoio',  cor: '#4E6068', minimo: 4.5 },
      { nome: 'receita / positivo',       cor: '#1F6B4F', minimo: 4.5 },
      { nome: 'despesa',                  cor: '#9C5029', minimo: 4.5 },
      { nome: 'crítico / negativo',       cor: '#A33A22', minimo: 4.5 },
      { nome: 'acento como texto',        cor: '#7E601A', minimo: 4.5 },
      { nome: 'UGLEZ como texto',         cor: '#2842BE', minimo: 4.5 }
    ]
  },
  {
    nome: 'escuro',
    fundos: [
      { nome: 'Petróleo (cartão)', cor: '#0F2A38' },
      { nome: 'Raso (elevado)',    cor: '#16384A' }
    ],
    casos: [
      { nome: 'valor do saldo',           cor: '#F1ECE3', minimo: 4.5 },
      { nome: 'rótulo e texto de apoio',  cor: '#9FB2B8', minimo: 4.5 },
      { nome: 'receita / positivo',       cor: '#86CFA4', minimo: 4.5 },
      { nome: 'despesa',                  cor: '#E9A178', minimo: 4.5 },
      { nome: 'crítico / negativo',       cor: '#F09070', minimo: 4.5 },
      { nome: 'acento (ouro)',            cor: '#D8B45E', minimo: 4.5 },
      { nome: 'UGLEZ como texto',         cor: '#9FB4FF', minimo: 4.5 }
    ]
  }
];

/* Os botões: tinta sobre a cor da ação, nos dois temas. */
const BOTOES = [
  { nome: 'primário: petróleo sobre ouro', texto: '#071822', fundo: '#D8B45E', minimo: 4.5 },
  { nome: 'UGLEZ claro: branco sobre royal', texto: '#FFFFFF', fundo: '#2842BE', minimo: 4.5 },
  { nome: 'UGLEZ escuro: branco sobre royal', texto: '#FFFFFF', fundo: '#4669F0', minimo: 4.5 },
  { nome: 'despesa: branco sobre terracota', texto: '#FFFFFF', fundo: '#9C5029', minimo: 4.5 },
  { nome: 'receita: branco sobre verde', texto: '#FFFFFF', fundo: '#1F6B4F', minimo: 4.5 },
  { nome: 'investimento: branco sobre água', texto: '#FFFFFF', fundo: '#276070', minimo: 4.5 }
];

/* ---------------------------------------------------------------
   roda
   --------------------------------------------------------------- */
let falhas = 0;
const linha = (ok, nome, cor, valor, minimo) => {
  if (!ok) falhas++;
  console.log('    ' + (ok ? 'ok   ' : 'FALHA') + ' ' + nome.padEnd(34) + cor + '  ' +
    valor.toFixed(2).padStart(6) + ':1  (minimo ' + minimo.toFixed(1) + ')');
};

console.log('');
for (const t of TEMAS) {
  console.log('  contraste — tema ' + t.nome + ', contra ' + t.fundos.map((f) => f.nome + ' ' + f.cor).join(' e '));
  console.log('  ' + '-'.repeat(66));
  for (const c of t.casos) {
    const pior = Math.min.apply(null, t.fundos.map((f) => razao(c.cor, f.cor)));
    linha(pior >= c.minimo, c.nome, c.cor, pior, c.minimo);
  }
  console.log('');
}
console.log('  contraste — texto dos botões');
console.log('  ' + '-'.repeat(66));
for (const b of BOTOES) {
  const r = razao(b.texto, b.fundo);
  linha(r >= b.minimo, b.nome, b.texto, r, b.minimo);
}

/* A regressão que este arquivo nasceu para impedir. Deixá-la aqui,
   medida e nomeada, mostra o tamanho do erro. */
const antes = Math.min(razao('#2A1D12', '#17394C'), razao('#2A1D12', '#0F2C3D'));
console.log('  ' + '-'.repeat(66));
console.log('    para referencia, a tinta de 2026 no herói antigo (#2A1D12): ' +
  antes.toFixed(2) + ':1 — abaixo de qualquer minimo');

if (falhas) {
  console.log('');
  console.log('  ' + falhas + ' PAR(ES) ABAIXO DO MINIMO');
  console.log('');
  process.exit(1);
}
console.log('  todos os pares passam, nos dois temas');
console.log('');
