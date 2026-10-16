'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const app = fs.readFileSync(path.join(root, 'preview-v3/app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'preview-v3/app.css'), 'utf8');
const registry = app.match(/const BLOCOS_INICIO = \[([\s\S]*?)\n  \];/)?.[1] || '';
assert.equal((registry.match(/\{ id:/g) || []).length, 24, '24 widgets devem estar disponíveis');
for (const id of ['faturas', 'fluxo', 'metas', 'categorias']) {
  assert.match(app, new RegExp(`blocoLigado\\('${id}'\\)\\s*\\?`), `${id} deve ser renderizado quando ligado`);
}
assert.match(app, /BLOCOS_INICIO\.slice\(10\)\.filter\(\(b\)=>blocoLigado\(b\.id\)\)/, 'widgets adicionais devem respeitar a escolha');
assert.match(app, /extraIds\.map\(\(b\)=>extraHomeWidget\(b\.id, extraContext\)\)/, 'widgets adicionais devem ser renderizados com dados compartilhados');
assert.match(app, /id === 'assinaturas'/, 'assinaturas precisam de conteúdo próprio');
assert.match(app, /class="v3-panel v3-widget-spending"/, 'o gráfico precisa de uma seção própria');
assert.match(css, /\.v3-home>\.v3-widget-spending[^\n]*grid-column:1\/-1/, 'o gráfico precisa ocupar a largura da grade');
assert.match(css, /@container \(min-width:650px\)/, 'a legenda deve ficar lado a lado só quando couber');
console.log('Início: 24 widgets conectados e gráfico com largura responsiva.');
