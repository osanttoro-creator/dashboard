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

/* ---- retrato do banco, em 2026-09 ---- */
const ESPERADO = {
  free: {
    mensal: 0, anual: 0,
    limites: {
      workspaces: 1, accounts: 2, credit_cards: 1, custom_categories: 10,
      budgets: 2, goals: 1, recurring_items: 3, ai_queries_per_month: 5,
      history_months: 6, comparison_months: 3, collaborators: 0
    },
    recursos: {
      import_csv: false, import_ofx: false, export_csv: false, export_pdf: false,
      colaboracao: false, analises_avancadas: false, ia_simulacoes: false,
      relatorios_custom: false, suporte_prioritario: false
    }
  },
  basic: {
    mensal: 1490, anual: 14990,
    limites: {
      workspaces: 2, accounts: 10, credit_cards: 5, custom_categories: null,
      budgets: null, goals: null, recurring_items: null, ai_queries_per_month: 50,
      history_months: null, comparison_months: 12, collaborators: 0
    },
    recursos: {
      import_csv: true, import_ofx: false, export_csv: true, export_pdf: false,
      colaboracao: false, analises_avancadas: false, ia_simulacoes: false,
      relatorios_custom: false, suporte_prioritario: false
    }
  },
  pro: {
    mensal: 2990, anual: 29990,
    limites: {
      workspaces: 5, accounts: null, credit_cards: null, custom_categories: null,
      budgets: null, goals: null, recurring_items: null, ai_queries_per_month: 200,
      history_months: null, comparison_months: null, collaborators: 3
    },
    recursos: {
      import_csv: true, import_ofx: true, export_csv: true, export_pdf: true,
      colaboracao: true, analises_avancadas: true, ia_simulacoes: true,
      relatorios_custom: true, suporte_prioritario: true
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
['index.html'].forEach((f) => {
  const c = fs.readFileSync(path.join(raiz, f), 'utf8');
  if (/R\$\s?\d+[.,]\d0\b/.test(c)) suspeitos.push(f + ': preço no HTML');
});
ok('preço aparece só em planos.js', suspeitos.length === 0,
  suspeitos.length ? suspeitos.join(' | ') : '');

console.log('\n' + (falhas ? falhas + ' FALHA(S)' : 'o JS e o banco concordam') + '\n');
process.exit(falhas ? 1 : 0);
