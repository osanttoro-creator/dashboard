'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const app = fs.readFileSync(path.join(root, 'assets/app/app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'assets/app/app.css'), 'utf8');
const refino = fs.readFileSync(path.join(root, 'assets/app/refinement.css'), 'utf8');
const registry = app.match(/const BLOCOS_INICIO = \[([\s\S]*?)\n  \];/)?.[1] || '';
/* 01/11/2026: a Coco virou widget e a ordem é escolhida pela pessoa; indicadores e
   ações rápidas saíram da lista porque são fixos (24). */
assert.equal((registry.match(/\{ id:/g) || []).length, 24, '24 widgets devem estar disponíveis');
for (const id of ['faturas', 'fluxo', 'metas', 'categorias', 'receitas']) {
  assert.match(app, new RegExp(`if \\(id === '${id}'\\) return`), `${id} deve ser renderizado quando ligado`);
}
assert.match(app, /ordemBlocos\(\)\.filter\(\(id\) => blocoLigado\(id\)\)/, 'widgets devem respeitar a escolha e a ordem');
assert.match(app, /return extraHomeWidget\(id, extraContext\)/, 'widgets adicionais devem ser renderizados com dados compartilhados');
assert.match(app, /id === 'assinaturas'/, 'assinaturas precisam de conteúdo próprio');
assert.match(app, /class="v3-panel v3-widget-spending"/, 'o gráfico precisa de uma seção própria');
assert.match(refino, /\.v3-widget-slot\.is-largo\{grid-column:1\/-1\}/, 'widgets largos precisam ocupar a largura da grade');
assert.match(css, /@container \(min-width:650px\)/, 'a legenda deve ficar lado a lado só quando couber');
assert.match(app, /categoryBars\(5, 'income'\)/, 'receitas devem mostrar o mesmo resumo interativo das despesas');
assert.match(app, /data-go="categories" data-category-kind="income"/, 'o widget de receitas deve abrir a aba de receitas');
console.log('Início: 24 widgets conectados e gráficos com largura responsiva.');
