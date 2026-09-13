/* =============================================================
   asaas-seguro.js — as travas da cobrança continuam no lugar?
   -------------------------------------------------------------
   Leitura estática. Falha se alguém, por pressa, desfizer uma das
   garantias que tornam a cobrança confiável:

   · o navegador nunca fala com a API do Asaas nem conhece a chave;
   · o preço cobrado sai do banco (plan_prices), não do corpo;
   · o aviso do Asaas é autenticado pelo token, em tempo constante;
   · o aviso é conferido na API do Asaas antes de liberar plano;
   · só o aviso libera plano pago — oaze-pagamento não o faz;
   · CPF e cartão não viram log;
   · excluir a conta encerra a assinatura antes.
   ============================================================= */
'use strict';
const fs = require('fs');
const path = require('path');

const raiz = path.join(__dirname, '..', '..');
const ler = (a) => fs.readFileSync(path.join(raiz, a), 'utf8');
const falhas = [];
const exige = (cond, msg) => { if (!cond) falhas.push(msg); };

/* ---- 1 · nada do Asaas no que vai ao navegador ---- */
function anda(dir, fora) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const f = path.join(dir, e.name);
    if (['vendor', 'node_modules', '.git', 'supabase', 'tools', 'docs', 'public_html'].includes(e.name)) continue;
    if (e.isDirectory()) anda(f, fora);
    else if (/\.(js|html)$/.test(e.name)) fora.push(f);
  }
  return fora;
}
for (const f of anda(raiz, [])) {
  const c = fs.readFileSync(f, 'utf8');
  const rel = path.relative(raiz, f);
  exige(!/api(-sandbox)?\.asaas\.com/i.test(c), rel + ': chama a API do Asaas direto do navegador');
  exige(!/ASAAS_API_KEY|\$aact_/i.test(c), rel + ': menciona a chave do Asaas');
}

/* ---- 2 · oaze-pagamento ---- */
const pag = ler('supabase/functions/oaze-pagamento/index.ts');
exige(/from\('plan_prices'\)/.test(pag), 'oaze-pagamento: o preço não vem de plan_prices');
exige(!/corpo\?\.(valor|value|centavos|preco)/.test(pag), 'oaze-pagamento: aceita valor vindo do navegador');
exige(!/from\('subscriptions'\)\s*\.(upsert|insert)/.test(pag), 'oaze-pagamento: grava plano pago sem confirmação do Asaas');
exige(/billingType:\s*'CREDIT_CARD'/.test(pag), 'oaze-pagamento: a cobrança deixou de ser só no cartão');
exige(!/log\([^)]*cpf/i.test(pag), 'oaze-pagamento: CPF em log');

/* ---- 3 · webhook ---- */
const wh = ler('supabase/functions/oaze-asaas-webhook/index.ts');
exige(/asaas-access-token/.test(wh), 'webhook: não lê o cabeçalho asaas-access-token');
exige(/function iguais\(/.test(wh) && /iguais\(recebido, segredo\)/.test(wh), 'webhook: token sem comparação em tempo constante');
exige(/asaas\('GET', '\/payments\/'/.test(wh), 'webhook: não confere o pagamento na API do Asaas');
exige(/centavos\(pagamento\.value\) !== intencao\.centavos/.test(wh), 'webhook: não confere o valor combinado');
exige(/asaas_eventos/.test(wh) && /processado/.test(wh), 'webhook: sem idempotência');

/* ---- 4 · excluir conta encerra a cobrança ---- */
const conta = ler('supabase/functions/oaze-conta/index.ts');
const iCancela = conta.indexOf("asaas('DELETE'");
const iApaga = conta.indexOf('deleteUser(');
exige(iCancela > 0 && iCancela < iApaga, 'oaze-conta: exclui a conta sem encerrar a assinatura antes');

/* ---- 5 · segredos ---- */
const shared = ler('supabase/functions/_shared/asaas.ts');
exige(/ASAAS_AMBIENTE'\) === 'producao'/.test(shared), 'asaas.ts: o padrão deixou de ser o sandbox');

if (falhas.length) {
  console.error(falhas.join('\n'));
  process.exit(1);
}
console.log('OK - cobrança pelo Asaas com as travas no lugar');
