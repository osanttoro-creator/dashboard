/* =============================================================
   tools/testes/contraste.js — o texto tem de ser legível
   -------------------------------------------------------------
   Roda com: node tools/testes/contraste.js
   Sai com código 1 quando algum par fica abaixo do mínimo.

   O PROBLEMA QUE ELE RESOLVE
   Em 2026 o valor do saldo era uma tinta marrom escura (#2A1D12)
   sobre um gradiente azul quase preto: 1,13:1. O número mais
   importante da tela era o mais difícil de ler, e ninguém percebeu
   porque ninguém mede cor a olho.

   O QUE MUDOU EM 28/09/2026
   Este arquivo guardava uma CÓPIA À MÃO da paleta. Quando o app foi
   para a identidade V2.1, o style.css mudou inteiro e o teste
   continuou medindo as cores antigas — passou com louvor sem ter
   olhado para nada do que estava no ar. Uma segunda fonte de verdade
   sempre diverge; a única questão é quando.

   Agora ele LÊ os tokens do style.css. Trocar uma cor lá é o
   suficiente para ser medido aqui, e não existe mais o passo de
   "lembrar de atualizar o teste".
   ============================================================= */
'use strict';

const fs = require('fs');
const path = require('path');

const CSS = fs.readFileSync(path.join(__dirname, '..', '..', 'assets', 'css', 'style.css'), 'utf8');

/* ---------- leitura dos tokens ---------- */

function bloco(seletor) {
  const i = CSS.indexOf(seletor + ' {');
  if (i < 0) throw new Error('não achei o bloco ' + seletor + ' no style.css');
  const fim = CSS.indexOf('\n}', i);
  const corpo = CSS.slice(i, fim);
  const mapa = {};
  for (const linha of corpo.split('\n')) {
    const m = /^\s*(--[\w-]+)\s*:\s*([^;]+);/.exec(linha);
    if (m) mapa[m[1]] = m[2].trim();
  }
  return mapa;
}

const CLARO = bloco(':root');
const ESCURO = Object.assign({}, CLARO, bloco('[data-theme="dark"]'));

/* var(--x) resolvido até o fundo; para de seguir em 12 saltos, que é
   mais do que qualquer cadeia honesta precisa. */
function valor(mapa, nome, saltos = 0) {
  let v = mapa[nome];
  if (v == null) throw new Error('token ausente: ' + nome);
  const m = /^var\((--[\w-]+)\)$/.exec(v);
  if (m) {
    if (saltos > 12) throw new Error('var em círculo: ' + nome);
    return valor(mapa, m[1], saltos + 1);
  }
  return v;
}

/* ---------- cor ---------- */

function rgba(cor) {
  let m = /^#([0-9a-f]{6})$/i.exec(cor);
  if (m) {
    const n = parseInt(m[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1];
  }
  m = /^#([0-9a-f]{3})$/i.exec(cor);
  if (m) {
    const [r, g, b] = m[1].split('').map((h) => parseInt(h + h, 16));
    return [r, g, b, 1];
  }
  m = /^rgba?\(([^)]+)\)$/i.exec(cor);
  if (m) {
    const p = m[1].split(',').map((x) => parseFloat(x.trim()));
    return [p[0], p[1], p[2], p[3] == null ? 1 : p[3]];
  }
  return null;
}

/* Uma superfície translúcida não tem cor própria: quem lê o texto vê
   ela JÁ COMPOSTA sobre o fundo. Medir o rgba cru daria um número que
   ninguém enxerga. */
function sobre(frente, fundo) {
  const f = rgba(frente);
  const t = rgba(fundo);
  if (!f || !t) return null;
  const a = f[3];
  return [0, 1, 2].map((i) => f[i] * a + t[i] * (1 - a)).concat(1);
}

function luz(c) {
  const f = (v) => {
    const x = v / 255;
    return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
}

function razao(a, b) {
  const x = luz(a);
  const y = luz(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/* ---------- o que medir ----------
   Os nomes são de TOKEN, não de cor: é isso que sobrevive à próxima
   troca de identidade. */

const TINTAS = [
  ['valor e texto principal', '--text-primary'],
  ['rótulo e texto de apoio', '--text-muted'],
  ['receita / positivo', '--income'],
  ['despesa', '--expense'],
  ['acento como texto', '--accent'],
  ['a Coco como texto', '--uglez-texto'],
  ['investimento', '--invest']
];

/* fundo raso, fundo profundo, e as três camadas de material */
const FUNDOS = ['--bg', '--bg-deep', '--n1', '--n2', '--n3'];

const BOTOES = [
  ['tinta sobre o acento', '--on-accent', '--ouro']
];

let falhas = 0;
const MINIMO = 4.5;

function medirTema(rotulo, mapa) {
  console.log('');
  console.log('  contraste — ' + rotulo);
  console.log('  ' + '-'.repeat(66));

  const base = valor(mapa, '--bg');

  for (const [nomeFundo] of FUNDOS.map((f) => [f])) {
    const cru = valor(mapa, nomeFundo);
    const fundo = sobre(cru, base);
    if (!fundo) { console.log('    (pulei ' + nomeFundo + ': ' + cru + ')'); continue; }

    for (const [nomeTinta, token] of TINTAS) {
      const tinta = rgba(valor(mapa, token));
      if (!tinta) continue;
      const r = razao(tinta, fundo);
      const ok = r >= MINIMO;
      if (!ok) falhas++;
      console.log('    ' + (ok ? 'ok  ' : 'FALHA') + '  ' +
        (nomeTinta + ' sobre ' + nomeFundo).padEnd(44) +
        r.toFixed(2).padStart(6) + ':1');
    }
  }

  for (const [nome, tokenTexto, tokenFundo] of BOTOES) {
    const tinta = rgba(valor(mapa, tokenTexto));
    const fundo = sobre(valor(mapa, tokenFundo), base);
    const r = razao(tinta, fundo);
    const ok = r >= MINIMO;
    if (!ok) falhas++;
    console.log('    ' + (ok ? 'ok  ' : 'FALHA') + '  ' + nome.padEnd(44) + r.toFixed(2).padStart(6) + ':1');
  }
}

medirTema('tema claro', CLARO);
medirTema('tema escuro', ESCURO);

console.log('  ' + '-'.repeat(66));
if (falhas) {
  console.log('  ' + falhas + ' par(es) abaixo de ' + MINIMO + ':1.');
  process.exit(1);
}
console.log('  todos os pares passam, nos dois temas — medidos no style.css');
