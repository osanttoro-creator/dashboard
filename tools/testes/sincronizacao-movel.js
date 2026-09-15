/* Reproduz o ciclo que falhava em navegadores móveis:
   sessão duplicada, alteração antes da hidratação, suspensão da aba e
   volta da rede. O teste não usa credenciais nem toca no banco real. */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const RAIZ = path.resolve(__dirname, '..', '..');
const esperar = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function perfil(id, nome, updatedAt) {
  return {
    id, name: nome, updatedAt, createdAt: '2026-09-01', accounts: [],
    cards: [], budgets: {}, goals: [], categories: [], transactions: [],
    investments: [], invoices: {}
  };
}

(async function () {
  const falhas = [];
  const eventosJanela = {};
  const eventosDocumento = {};
  let aoMudar = null;
  let observacoes = 0;
  let publicacoes = 0;
  let releituras = 0;
  let servidor = { remoto: perfil('remoto', 'Minha conta', 200) };
  let removidosServidor = {};

  const estado = {
    profiles: [
      perfil('inicial-a', 'Pessoal', 10),
      perfil('inicial-b', 'PJ / Autônomo', 11)
    ],
    activeProfileId: 'inicial-a',
    removidos: {}
  };

  const sandbox = {
    console, Promise, Date,
    setTimeout, clearTimeout,
    setInterval: () => 1,
    navigator: { onLine: true, userAgent: 'teste móvel' },
    localStorage: { getItem: () => null, removeItem: () => {} },
    document: {
      hidden: false,
      getElementById: () => null,
      querySelector: () => null,
      addEventListener: (nome, fn) => { eventosDocumento[nome] = fn; }
    },
    addEventListener: (nome, fn) => { eventosJanela[nome] = fn; },
    U: { el: () => ({}), svg: () => ({ innerHTML: '' }) },
    UI: { toast: () => {}, confirm: async () => true },
    Store: {
      CATEGORIAS_PADRAO: [],
      state: () => estado,
      normalizeProfile: (p) => JSON.parse(JSON.stringify(p)),
      normalizarRemovidos: (r) => Object.assign({}, r || {}),
      onChange: (fn) => { aoMudar = fn; },
      commit: (razao) => { if (aoMudar) aoMudar(razao); }
    }
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(RAIZ, 'assets/js/sync.js'), 'utf8'),
    sandbox, { filename: 'sync.js' });

  const backend = {
    nome: 'teste', prioridade: 1, isConfigured: () => true,
    conectar: async () => {}, entrar: async () => {}, sair: async () => {},
    observar: async () => { observacoes++; }, soltar: () => {},
    publicar: async (payload) => {
      publicacoes++;
      servidor = JSON.parse(JSON.stringify(payload.profiles));
      removidosServidor = Object.assign({}, payload.removidos || {});
      return { profiles: servidor, removidos: removidosServidor };
    },
    recarregar: async () => {
      releituras++;
      sandbox.Sync._onRemote(servidor, removidosServidor);
      return true;
    },
    ajuda: () => ({})
  };

  sandbox.Sync.registerBackend(backend);
  sandbox.Sync.init();
  const usuario = { uid: 'usuario-1', email: 'teste@oaze.site' };
  sandbox.Sync._onUser(usuario);
  sandbox.Sync._onUser(usuario);
  if (observacoes !== 1) falhas.push('a mesma sessão abriu mais de um observador');

  /* Um commit local ocorre enquanto a primeira leitura ainda está no ar. */
  aoMudar('profile');
  await esperar(650);
  if (publicacoes !== 0) falhas.push('o aparelho enviou antes de ler a nuvem');

  sandbox.Sync._onRemote(servidor, {});
  await esperar(650);
  if (publicacoes !== 1) falhas.push('a alteração em espera não subiu após a hidratação');
  if (estado.activeProfileId !== 'remoto') falhas.push('o aparelho novo permaneceu no espaço demonstrativo');

  servidor.remoto.name = 'Atualizado no notebook';
  servidor.remoto.updatedAt = 400;
  await sandbox.Sync.atualizarAgora(true);
  if (releituras !== 1 || estado.profiles[0].name !== 'Atualizado no notebook') {
    falhas.push('a retomada da aba não releu o dado do outro aparelho');
  }

  sandbox.navigator.onLine = false;
  estado.profiles[0].name = 'Editado offline no celular';
  estado.profiles[0].updatedAt = 500;
  aoMudar('profile');
  await esperar(550);
  if (publicacoes !== 1) falhas.push('uma edição offline tentou acessar o servidor');
  sandbox.navigator.onLine = true;
  eventosJanela.online();
  await esperar(100);
  if (publicacoes !== 2 || servidor.remoto.name !== 'Editado offline no celular') {
    falhas.push('a edição do celular não subiu quando a rede voltou');
  }

  const backendFonte = fs.readFileSync(path.join(RAIZ, 'assets/js/supabase-auth.js'), 'utf8');
  if (!backendFonte.includes(".rpc('mesclar_dados'"))
    falhas.push('o backend ainda sobrescreve o documento inteiro');
  if (!backendFonte.includes("select('profiles, removidos')"))
    falhas.push('a leitura não inclui as exclusões sincronizadas');
  const storeFonte = fs.readFileSync(path.join(RAIZ, 'assets/js/store.js'), 'utf8');
  if (!storeFonte.includes("Store.commit('active-profile')"))
    falhas.push('abrir outro espaço ainda altera o relógio usado nos conflitos');
  const syncFonte = fs.readFileSync(path.join(RAIZ, 'assets/js/sync.js'), 'utf8');
  if (!syncFonte.includes("reason === 'active-profile'"))
    falhas.push('trocar apenas a visualização ainda agenda envio desnecessário');

  console.log('\n  sincronização móvel');
  if (falhas.length) {
    falhas.forEach((f) => console.log('  FALHA  ' + f));
    process.exitCode = 1;
    return;
  }
  console.log('  ok     primeira leitura bloqueia sobrescrita prematura');
  console.log('  ok     sessão duplicada não duplica observadores');
  console.log('  ok     retomada e volta da rede reconciliam os aparelhos');
  console.log('  ok     gravação usa mesclagem transacional no banco\n');
})();
