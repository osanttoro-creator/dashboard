/* =============================================================
   tools/conferir-rls.js — nenhuma tabela exposta sem RLS
   -------------------------------------------------------------
   Roda com: node tools/conferir-rls.js
   Sai com código 1 quando encontra tabela sem RLS — serve para CI.

   O QUE ELE VERIFICA
   Que toda tabela criada em public.* nas migrações aparece em
   algum `alter table ... enable row level security`, direto ou
   pelo laço que percorre uma lista de nomes.

   O QUE ELE NÃO PROVA
   Que as POLÍTICAS estão corretas. RLS ligada sem política nenhuma
   nega tudo — seguro, e quebrado. RLS ligada com uma política
   `using (true)` é o contrário: parece protegida e não está. Ler o
   SQL continua sendo necessário; isto só garante que ninguém
   esqueceu de LIGAR, que é o descuido de longe mais comum e o de
   consequência mais grave.

   POR QUE ISTO EXISTE COMO FERRAMENTA
   Uma tabela nova entra numa migração e ninguém lembra de
   acrescentá-la à lista do laço de RLS. Nada quebra: o app
   continua funcionando, porque quem escreve é o dono dos dados. O
   defeito só aparece quando outra pessoa lê a tabela — e aí já
   vazou.
   ============================================================= */
'use strict';

const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '..', 'supabase', 'migrations');

const arquivos = fs.readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort();
const sql = arquivos.map((f) => fs.readFileSync(path.join(DIR, f), 'utf8')).join('\n');

/* Tabelas criadas em public. */
const criadas = new Set();
const reCriar = /create\s+table\s+(?:if\s+not\s+exists\s+)?public\.([a-z0-9_]+)/gi;
let m;
while ((m = reCriar.exec(sql))) criadas.add(m[1]);

/* Nomes citados em qualquer `alter table ... enable row level security`. */
const comRls = new Set();
const reDireta = /alter\s+table\s+public\.([a-z0-9_]+)\s+enable\s+row\s+level\s+security/gi;
while ((m = reDireta.exec(sql))) comRls.add(m[1]);

/* O projeto liga a RLS de várias tabelas por um laço sobre um
   array de nomes. Ler os arrays é a única forma de não acusar
   falsamente todas elas. */
const reLaco = /foreach\s+t\s+in\s+array\s+array\[([^\]]+)\]/gi;
while ((m = reLaco.exec(sql))) {
  for (const bruto of m[1].split(',')) {
    const nome = bruto.trim().replace(/^'|'$/g, '');
    if (nome) comRls.add(nome);
  }
}

/* Catálogo público de leitura: plans, plan_prices e
   plan_entitlements descrevem a oferta, não dados de ninguém. Se
   estiverem sem RLS é uma decisão, não um esquecimento — mas ela
   precisa estar escrita aqui para valer. */
const CATALOGO_PUBLICO = new Set(['plans', 'plan_prices', 'plan_entitlements']);

const semRls = [...criadas].filter((t) => !comRls.has(t) && !CATALOGO_PUBLICO.has(t)).sort();
const catalogoSemRls = [...CATALOGO_PUBLICO].filter((t) => criadas.has(t) && !comRls.has(t));

console.log('Tabelas em public: ' + criadas.size);
console.log('Com RLS ligada:    ' + [...criadas].filter((t) => comRls.has(t)).length);
if (catalogoSemRls.length) {
  console.log('Catálogo sem RLS (esperado, é oferta pública): ' + catalogoSemRls.join(', '));
}

if (!semRls.length) {
  console.log('\nOK — nenhuma tabela de dados de usuário sem RLS.');
  process.exit(0);
}

console.log('\nTABELAS SEM RLS (' + semRls.length + '):');
semRls.forEach((t) => console.log('  · public.' + t));
process.exit(1);
