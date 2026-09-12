/* =============================================================
   cartoes-integrados.js — um mesmo baralho nas três superfícies
   ============================================================= */
'use strict';

const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..', '..');
const cards = fs.readFileSync(path.join(RAIZ, 'assets', 'js', 'cards.js'), 'utf8');
const home = fs.readFileSync(path.join(RAIZ, 'assets', 'js', 'pages', 'home.js'), 'utf8');
const accounts = fs.readFileSync(path.join(RAIZ, 'assets', 'js', 'pages', 'accounts.js'), 'utf8');
const css = fs.readFileSync(path.join(RAIZ, 'assets', 'css', 'style.css'), 'utf8');

const falhas = [];

if (!/function collectionDeck\s*\(/.test(cards)) {
  falhas.push('débito e crédito não compartilham a base do baralho');
}
if (!/Cards\.walletDeck\(prof\.accounts, prof\.cards/.test(home)) {
  falhas.push('a Visão geral não usa a carteira integrada');
}
if (!/Cards\.accountDeck\(prof\.accounts[\s\S]*?stacked:\s*true/.test(accounts)) {
  falhas.push('a aba Débito não usa o baralho interativo');
}
if (!/Cards\.deck\(prof\.cards[\s\S]*?stacked:\s*true/.test(accounts)) {
  falhas.push('a aba Crédito não usa o baralho interativo');
}
if (!/data-wallet-surface/.test(cards) || !/aria-posinset/.test(cards) || !/aria-setsize/.test(cards)) {
  falhas.push('o baralho integrado perdeu identificação ou posição acessível');
}
if (!/@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.wallet-deck-stack/.test(css)) {
  falhas.push('o baralho não respeita movimento reduzido');
}

if (falhas.length) {
  console.error('Integração dos cartões quebrada:');
  falhas.forEach((falha) => console.error('  - ' + falha));
  process.exit(1);
}

console.log('OK — o mesmo baralho atende Visão geral, Débito e Crédito.');
