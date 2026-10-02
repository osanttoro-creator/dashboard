/* =============================================================
   tools/idiomas-app-preencher.js — grava traduções do app
   -------------------------------------------------------------
     node tools/idiomas-app-preencher.js <mapa.json>

   O mapa é { "texto em português": ["en", "fr", "es"] } — ou
   { "texto em português": "ignorar" } para o que não é prosa:
   nome de banco, marca, chave de evento, prefixo de console.

   Casa pelo TEXTO, e não pela posição: um dicionário que ganhou
   uma linha no meio não desloca as traduções dos outros, e o mesmo
   texto em arquivos diferentes é preenchido de uma vez só.

   Não sobrescreve o que já está traduzido: rodar duas vezes com o
   mesmo mapa não desfaz uma correção feita à mão depois.
   ============================================================= */
'use strict';
const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const DIR = path.join(RAIZ, 'i18n', 'app');
const LINGUAS = ['en', 'fr', 'es'];

const arquivo = process.argv[2];
if (!arquivo) {
  console.error('uso: node tools/idiomas-app-preencher.js <mapa.json>');
  process.exit(1);
}
const mapa = JSON.parse(fs.readFileSync(arquivo, 'utf8'));

let preenchidos = 0, ignorados = 0, jaTinha = 0;
const usados = new Set();

for (const nome of fs.readdirSync(DIR).filter((f) => f.endsWith('.json'))) {
  const caminho = path.join(DIR, nome);
  const dic = JSON.parse(fs.readFileSync(caminho, 'utf8'));
  let mudou = false;

  for (const chave of Object.keys(dic)) {
    const linha = dic[chave];
    if (!linha || !linha.pt || linha.ignorar) continue;
    const valor = mapa[linha.pt];
    if (!valor) continue;
    usados.add(linha.pt);

    if (valor === 'ignorar') {
      linha.ignorar = true;
      LINGUAS.forEach((l) => { delete linha[l]; });
      ignorados++; mudou = true;
      continue;
    }
    if (!Array.isArray(valor) || valor.length !== 3) {
      console.error('mapa inválido para: ' + linha.pt);
      process.exit(1);
    }
    if (LINGUAS.every((l) => linha[l])) { jaTinha++; continue; }
    LINGUAS.forEach((l, i) => { if (!linha[l]) linha[l] = valor[i]; });
    preenchidos++; mudou = true;
  }
  if (mudou) fs.writeFileSync(caminho, JSON.stringify(dic, null, 2) + '\n');
}

const semUso = Object.keys(mapa).filter((k) => !usados.has(k));
console.log(`preenchidos: ${preenchidos} · ignorados: ${ignorados} · já tinham: ${jaTinha}`);
if (semUso.length) {
  console.log(`${semUso.length} entrada(s) do mapa não casaram com nenhum dicionário:`);
  semUso.slice(0, 8).forEach((s) => console.log('  · ' + s));
}
