import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const sourcePath = existsSync('assets/app/app.js')
  ? 'assets/app/app.js' : 'live-site/assets/app/app.js';
const source = readFileSync(sourcePath, 'utf8');
const start = source.indexOf('  async function saveCocoImport(');
const end = source.indexOf('  async function readCocoMedia(', start);
assert.ok(start >= 0 && end > start, 'salvamento automático precisa existir no painel');
const implementation = source.slice(start, end);

function scenario(rows, { existing = [], fail = false } = {}) {
  const state = {
    importPreview: { rows, checks: { failed: 0 } },
    importAccountId: 'conta', importSelection: {}, importRemoved: {},
    importEdits: {}, importSaving: false
  };
  const saved = [], messages = [];
  let opened = 0, route = '';
  const current = {
    accounts: [{ id: 'conta', archived: false, moeda: 'BRL' }],
    categories: [{ id: 'despesa', kind: 'expense' }, { id: 'receita', kind: 'income' }],
    transactions: existing
  };
  const deps = {
    demo: false, state, profile: () => current,
    importEligible: (item) => !item.creditCard && !item.dateConcern && !item.balanceConcern,
    importIsSelected: (_item, index) => !!state.importSelection[index],
    importDraft: (item) => ({
      description: item.description, date: item.date,
      categoryId: item.cents > 0 ? 'receita' : 'despesa', meio: null
    }),
    syncImportSelectionUI: () => {}, openCoco: () => { opened++; },
    toast: (message) => messages.push(message),
    U: { isValidISO: (date) => /^\d{4}-\d{2}-\d{2}$/.test(date), round2: (value) => value },
    Store: { MEIOS: [], transactions: { addMany: (list) => saved.push(...list) } },
    V3Backend: { mutate: async (fn) => { if (fail) throw new Error('offline'); fn(); } },
    global: { CocoImport: { normalized: (value) => value.toLowerCase() } },
    Limites: { limite: () => null, contar: () => 0 },
    go: (page) => { route = page; }
  };
  const save = new Function(...Object.keys(deps), implementation + '; return saveCocoImport;')(...Object.values(deps));
  return { state, saved, messages, save, get opened() { return opened; }, get route() { return route; } };
}

const rows = [
  { cents: -1500, description: 'Mercado', date: '2026-09-30' },
  { cents: 500, description: 'Salário', date: '2026-10-01' },
  { cents: -2000, description: 'Fatura cartão', date: '2026-10-02', creditCard: true },
  { cents: -700, description: 'Data incerta', date: '2026-10-03', dateConcern: true },
  { cents: -100, description: 'Já existe', date: '2026-10-04' }
];
const existing = [{
  accountId: 'conta', cancelado: false, date: '2026-10-04',
  kind: 'expense', amount: 1, description: 'Já existe'
}];
const basic = scenario(rows, { existing });
await basic.save(true);
assert.deepEqual(basic.saved.map((item) => item.date), ['2026-09-30', '2026-10-01']);
assert.ok(basic.saved.every((item) => item.confirmed && item.source === 'import'));
assert.equal(basic.state.importRemoved[2], undefined, 'cartão de crédito não é gravado');
assert.equal(basic.state.importRemoved[3], undefined, 'data incerta fica pendente');
assert.equal(basic.state.importRemoved[4], true, 'arquivo já importado não duplica');
assert.ok(basic.state.importPreview, 'pendências continuam visíveis');

const same = [
  { cents: -1000, description: 'Duas compras iguais', date: '2026-10-02' },
  { cents: -1000, description: 'Duas compras iguais', date: '2026-10-02' }
];
const repeated = scenario(same);
await repeated.save(true);
assert.equal(repeated.saved.length, 1);
assert.equal(repeated.state.importRemoved[1], undefined, 'linhas iguais no mesmo arquivo exigem conferência');

const offline = scenario([rows[0]], { fail: true });
await offline.save(true);
assert.equal(offline.saved.length, 0);
assert.ok(offline.state.importPreview, 'falha de sincronização preserva o arquivo para tentar novamente');
assert.equal(offline.state.importSaving, false);
assert.ok(offline.messages.some((message) => message.includes('Não consegui salvar')));

console.log('Importação automática: datas, duplicatas, cartão e falha de sincronização conferidos.');
