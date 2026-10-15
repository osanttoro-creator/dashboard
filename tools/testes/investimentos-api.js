/* Testa o contrato da Edge Function com provedores simulados; nunca usa credenciais reais. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { stripTypeScriptTypes } = require('node:module');
const path = require('node:path');
const file = path.resolve(__dirname, '../../supabase/functions/oaze-invest-data/index.ts');
let source = fs.readFileSync(file, 'utf8').replace(/^import .*;\r?\n/gm, '');
source = stripTypeScriptTypes(source, { mode: 'strip' });
let handler;
const env = new Map([
  ['OAZE_ALLOWED_ORIGINS', 'https://oaze.site'], ['SUPABASE_URL', 'https://test.supabase.co'],
  ['SUPABASE_ANON_KEY', 'public-test'], ['SUPABASE_SERVICE_ROLE_KEY', 'private-test'],
  ['OPENAI_API_KEY', 'server-only-test']
]);
const today = new Date().toISOString().slice(0, 10);
const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
const br = (date) => `${date.slice(8)}/${date.slice(5, 7)}/${date.slice(0, 4)}`;
const calls = [];
const context = {
  Date, Math, Number, String, Array, Object, Set, Map, Promise, JSON, URL, Request, Response,
  TextEncoder, AbortSignal, console,
  Deno: { env: { get: (key) => env.get(key) }, serve: (fn) => { handler = fn; } },
  createClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: 'test-user', email_confirmed_at: today } } }) } }),
  corpoCabeNoLimite: () => true,
  reservarRateLimit: async () => ({ permitido: true }),
  fetch: async (url, options) => {
    calls.push({ url, options });
    if (url.includes('api.openai.com')) return Response.json({ output: [{ content: [{ type: 'output_text',
      text: JSON.stringify({ type: 'Ações', ticker: 'PETR4', indexer: null, rate: null, confidence: 'high' }) }] }] });
    if (url.includes('bcdata.sgs.432')) return Response.json([
      { data: br(yesterday), valor: '13.65' }, { data: br(tomorrow), valor: '99.99' }
    ]);
    if (url.includes('bcdata.sgs.4389')) return Response.json([{ data: br(yesterday), valor: '13.55' }]);
    if (url.includes('bcdata.sgs.12')) return Response.json([{ data: br(yesterday), valor: '0.05' }]);
    if (url.includes('brapi.dev')) return Response.json({ results: [{ requestedSymbol: 'PETR4', symbol: 'PETR4', data: {
      regularMarketPrice: 50, currency: 'BRL', regularMarketTime: new Date().toISOString()
    } }] });
    throw new Error('provedor inesperado');
  }
};
vm.runInNewContext(source, context, { filename: file });
async function post(body, extra = {}) {
  const request = new Request('https://test.supabase.co/functions/v1/oaze-invest-data', {
    method: 'POST', headers: { Origin: 'https://oaze.site', Authorization: 'Bearer test',
      'content-type': 'application/json', ...extra }, body: JSON.stringify(body)
  });
  const response = await handler(request);
  return { status: response.status, data: await response.json() };
}
(async () => {
  const indices = await post({ action: 'indices' });
  assert.equal(indices.status, 200);
  assert.equal(indices.data.selicTarget.date, yesterday);
  assert.equal(indices.data.selicTarget.value, 13.65);
  assert.equal(indices.data.cdiDaily.value, 0.05);
  const invalid = await post({ action: 'quotes', symbols: ['PETR4/../../'] });
  assert.equal(invalid.status, 400);
  const missingKey = await post({ action: 'quotes', symbols: ['MXRF11'] });
  assert.equal(missingKey.status, 503);
  const quote = await post({ action: 'quotes', symbols: ['PETR4'] });
  assert.equal(quote.status, 200);
  assert.equal(quote.data.quotes[0].price, 50);
  assert.ok(!calls.some((call) => call.url.includes('MXRF11')));
  const old = await post({ action: 'cdi_history', start: '2010-01-01', end: today });
  assert.equal(old.status, 400);
  const invalidName = await post({ action: 'interpret', name: 'abc' });
  assert.equal(invalidName.status, 400);
  const interpreted = await post({ action: 'interpret', name: 'Ações Petrobras PETR4' });
  assert.equal(interpreted.status, 200);
  assert.equal(interpreted.data.suggestion.ticker, 'PETR4');
  const aiRequest = calls.find((call) => call.url.includes('api.openai.com'));
  assert.ok(aiRequest);
  assert.equal(JSON.parse(aiRequest.options.body).store, false);
  assert.equal(JSON.parse(aiRequest.options.body).input, 'Nome informado: Ações Petrobras PETR4');
  console.log('Investimentos API: autenticação simulada, datas, símbolos, limites e OpenAI OK');
})().catch((error) => { console.error(error); process.exitCode = 1; });
