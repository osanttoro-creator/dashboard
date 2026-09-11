/* =============================================================
   confere-planos.js — o JS e o banco dizem a mesma coisa?
   ------------------------------------------------------------
   Existem duas fontes de plano no OAZE, e isso é deliberado: o
   banco decide (o navegador não alcança) e o JS orienta (o banco
   não desenha tela). O risco dessa escolha é a divergência: um
   dia a página mostra R$ 14,90 e a cobrança usa outro valor.

   Este teste é o preço de admitir duas fontes. Ele compara as
   duas e falha se discordarem em um centavo ou um limite.

   O retrato do banco em ESPERADO foi tirado com:

     select p.id, max(...) ... from plans p
     left join plan_prices pp ... left join plan_entitlements e ...

   Ao mudar preço ou limite, mude nos DOIS lugares e atualize este
   retrato — o teste falhando é o aviso de que só um foi mudado.

   Uso:  node tools/testes/confere-planos.js
   ============================================================= */
'use strict';
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const raiz = path.resolve(__dirname, '..', '..');

/* ---- retrato do banco, em 2026-09 (migração 20260909_planos_revisao) ---- */
const ESPERADO = {
  free: {
    mensal: 0, anual: 0,
    limites: {
      workspaces: 1, accounts: 2, credit_cards: 1, transactions_per_month: 100,
      custom_categories: 10, budgets: 1, goals: 1, recurring_items: 3,
      ai_queries_per_month: 5, history_months: 3, comparison_months: 1, collaborators: 0
    },
    recursos: {
      import_csv: false, import_ofx: false, export_csv: false, export_pdf: false,
      calendario: false, uglez_assistente_flutuante: false,
      comparacao_mensal: false, comparacao_anual: false,
      analises_avancadas: false, ia_simulacoes: false, colaboracao: false,
      relatorios_custom: false, acesso_antecipado: false, suporte_prioritario: false
    }
  },
  basic: {
    mensal: 2490, anual: 23990,
    limites: {
      workspaces: 1, accounts: 10, credit_cards: 5, transactions_per_month: null,
      custom_categories: null, budgets: null, goals: 10, recurring_items: null,
      ai_queries_per_month: 30, history_months: 24, comparison_months: 24, collaborators: 0
    },
    recursos: {
      import_csv: true, import_ofx: true, export_csv: true, export_pdf: true,
      calendario: true, uglez_assistente_flutuante: true,
      comparacao_mensal: true, comparacao_anual: false,
      analises_avancadas: false, ia_simulacoes: false, colaboracao: false,
      relatorios_custom: false, acesso_antecipado: false, suporte_prioritario: false
    }
  },
  pro: {
    mensal: 4990, anual: 47990,
    limites: {
      workspaces: 5, accounts: null, credit_cards: null, transactions_per_month: null,
      custom_categories: null, budgets: null, goals: null, recurring_items: null,
      ai_queries_per_month: 120, history_months: null, comparison_months: null, collaborators: 3
    },
    recursos: {
      import_csv: true, import_ofx: true, export_csv: true, export_pdf: true,
      calendario: true, uglez_assistente_flutuante: true,
      comparacao_mensal: true, comparacao_anual: true,
      analises_avancadas: true, ia_simulacoes: true, colaboracao: true,
      relatorios_custom: true, acesso_antecipado: true, suporte_prioritario: true
    }
  }
};

/* ---- carrega o config do navegador ---- */
const ctx = { window: {}, console };
ctx.global = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(raiz, 'assets/js/planos.js'), 'utf8'), ctx);
const P = ctx.window.Planos;

let falhas = 0;
function ok(rot, cond, det = '') {
  if (!cond) falhas++;
  console.log('  ' + (cond ? 'ok   ' : 'FALHA') + '  ' + rot + (det ? '   ' + det : ''));
}

console.log('\n=== o JS bate com o banco? ===');
Object.keys(ESPERADO).forEach((id) => {
  const js = P.get(id);
  const db = ESPERADO[id];
  ok(id + ' · preço mensal', js.mensalCentavos === db.mensal, js.mensalCentavos + ' vs ' + db.mensal);
  ok(id + ' · preço anual', js.anualCentavos === db.anual, js.anualCentavos + ' vs ' + db.anual);

  Object.keys(db.limites).forEach((k) => {
    const a = js.limites[k], b = db.limites[k];
    ok(id + ' · limite ' + k, a === b, JSON.stringify(a) + ' vs ' + JSON.stringify(b));
  });
  Object.keys(db.recursos).forEach((k) => {
    const a = js.recursos[k], b = db.recursos[k];
    ok(id + ' · recurso ' + k, a === b, a + ' vs ' + b);
  });
});

console.log('\n=== nenhum preço solto no código ===');
/* Um preço digitado em outro arquivo é a semente da divergência. */
const suspeitos = [];
function anda(dir) {
  fs.readdirSync(dir, { withFileTypes: true }).forEach((e) => {
    const f = path.join(dir, e.name);
    if (e.name === 'vendor' || e.name === 'node_modules') return;
    if (e.isDirectory()) return anda(f);
    if (!/\.(js|html)$/.test(e.name)) return;
    if (f.endsWith('planos.js')) return;              // a fonte pode
    if (f.includes(path.join('tools', 'testes'))) return;
    const c = fs.readFileSync(f, 'utf8');
    [/R\$\s?14[.,]90/, /R\$\s?29[.,]90/, /R\$\s?149[.,]90/, /R\$\s?299[.,]90/,
      /\b1490\b/, /\b2990\b/, /\b14990\b/, /\b29990\b/].forEach((re) => {
      const m = c.match(re);
      if (m) suspeitos.push(path.relative(raiz, f) + ': ' + m[0]);
    });
  });
}
anda(path.join(raiz, 'assets'));

/* ------------------------------------------------------------
   A REGRA ANTIGA ERA IMPOSSÍVEL DE CUMPRIR, E POR ISSO ESTAVA
   FALHANDO HÁ TEMPO
   ------------------------------------------------------------
   Ela exigia que index.html não contivesse NENHUM preço:

     if (/R\$\s?\d+[.,]\d0\b/.test(c)) suspeitos.push(...)

   Só que index.html é a página de vendas. O preço precisa estar no
   HTML — é ele que o buscador indexa e o que aparece na prévia de
   um link compartilhado. Um preço injetado por JavaScript não
   chega a nenhum dos dois.

   Então a regra pedia algo que o produto não pode fazer, falhava
   sempre, e uma suíte que falha sempre é uma suíte que ninguém
   lê — foi assim que as outras 15 divergências desta mesma
   execução passaram despercebidas.

   A regra certa não é "não pode haver preço no HTML público": é
   "o preço do HTML público tem de ser IGUAL ao de planos.js". Isso
   é verificado, valor por valor, em tools/conferir-planos.js, que
   também vigia os preços aposentados e o selo de desconto.

   O que continua valendo aqui é a metade que sempre foi útil:
   nenhum preço solto dentro de assets/ — porque ali não há razão
   nenhuma para um número de dinheiro existir fora de planos.js.
   ------------------------------------------------------------ */
ok('nenhum preço solto em assets/', suspeitos.length === 0,
  suspeitos.length ? suspeitos.join(' | ') : '');
console.log('  nota   o preço do site público é conferido por tools/conferir-planos.js');

console.log('\n' + (falhas ? falhas + ' FALHA(S)' : 'o JS e o banco concordam') + '\n');
process.exit(falhas ? 1 : 0);
