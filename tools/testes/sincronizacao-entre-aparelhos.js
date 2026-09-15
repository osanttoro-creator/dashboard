/* Prova a correção do primeiro login em um aparelho novo.
   O estado inicial vazio deve dar lugar aos perfis reais da nuvem;
   qualquer estado local já usado continua sendo mesclado, nunca apagado. */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const RAIZ = path.resolve(__dirname, '..', '..');

function perfil(id, name, updatedAt, contas) {
  return {
    id, name, updatedAt, createdAt: '2026-09-01', accounts: contas || [],
    cards: [], budgets: {}, goals: [], categories: [], transactions: [],
    investments: [], invoices: {}
  };
}

function montar(profiles, activeProfileId) {
  const estado = { profiles, activeProfileId };
  const sandbox = {
    console, setTimeout, clearTimeout, Promise,
    navigator: { onLine: true },
    localStorage: { getItem: () => null, removeItem: () => {} },
    document: {},
    U: { el: () => ({}) },
    Store: {
      state: () => estado,
      normalizeProfile: (p) => JSON.parse(JSON.stringify(p)),
      onChange: () => {}
    }
  };
  sandbox.window = sandbox;
  sandbox.global = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(RAIZ, 'assets', 'js', 'sync.js'), 'utf8'),
    sandbox, { filename: 'sync.js' });
  return { estado, Sync: sandbox.Sync };
}

const contaInicial = {
  id: 'acc-inicial', name: 'Conta corrente', openingBalance: 0, archived: false
};
const remoto = perfil('prf-remoto', 'Minha vida', 1700000000000, [
  { id: 'acc-real', name: 'Conta real', openingBalance: 1240 }
]);

const novo = montar([
  perfil('prf-local', 'Pessoal', 0, [contaInicial]),
  perfil('prf-pj', 'PJ / Autônomo', 0)
], 'prf-local');
const mudouNovo = novo.Sync._merge({ 'prf-remoto': remoto });

const usado = perfil('prf-usado', 'Pessoal', 1700000001000, [
  { id: 'acc-local', name: 'Conta local', openingBalance: 50 }
]);
const existente = montar([usado], 'prf-usado');
const mudouExistente = existente.Sync._merge({ 'prf-remoto': remoto });

const falhas = [];
if (!mudouNovo) falhas.push('o aparelho novo não reconheceu a chegada da nuvem');
if (novo.estado.profiles.length !== 1 || novo.estado.profiles[0].id !== 'prf-remoto')
  falhas.push('os perfis iniciais vazios não foram substituídos pelos perfis reais');
if (novo.estado.activeProfileId !== 'prf-remoto')
  falhas.push('a tela continuou apontando para um perfil local vazio');
if (!mudouExistente) falhas.push('a mesclagem do aparelho já usado não registrou mudança');
if (existente.estado.profiles.length !== 2 || !existente.estado.profiles.some((p) => p.id === 'prf-usado'))
  falhas.push('um perfil local usado foi apagado durante a mesclagem');
if (existente.estado.activeProfileId !== 'prf-usado')
  falhas.push('o perfil ativo do aparelho já usado foi trocado');

console.log('\n  sincronização entre aparelhos');
if (falhas.length) {
  falhas.forEach((f) => console.log('  FALHA  ' + f));
  process.exit(1);
}
console.log('  ok     aparelho novo abre os dados reais da conta');
console.log('  ok     aparelho já usado conserva seus dados locais\n');
