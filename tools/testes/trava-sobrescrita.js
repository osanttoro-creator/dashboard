/* =============================================================
   trava-sobrescrita.js — o banco não pode apagar o aparelho
   -------------------------------------------------------------
   A fase 2 inverteu quem manda: o Supabase virou o original e o
   localStorage o cache. Essa inversão tem um jeito de dar errado, e
   ele é silencioso e irreversível:

     alguém edita offline → a alteração fica na fila
     a rede volta        → o app traz o banco
     o banco desce por cima → a edição some, sem erro, sem aviso

   O mesmo vale para quem nunca migrou: o aparelho tem um ano de
   lançamentos que nunca estiveram na conta, e uma leitura do banco
   por cima leva tudo.

   Este teste prova que `Dados.carregarDoBanco` RECUSA aplicar nos
   dois casos, e que aplica quando -- e só quando -- não há nada
   local esperando.

   COMO RODAR
     node tools/testes/trava-sobrescrita.js
   ============================================================= */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const RAIZ = path.resolve(__dirname, '..', '..');

/* ---------------------------------------------------------------
   ambiente
   --------------------------------------------------------------- */
function montar(cenario) {
  const estadoDoApp = { profiles: [{ id: 'prf_1', name: 'LOCAL' }], activeProfileId: 'prf_1' };
  const registro = { aplicou: false, commits: [] };

  const sandbox = {
    console: { log: () => {}, warn: () => {}, error: () => {} },
    setTimeout, clearTimeout, Promise,
    navigator: { onLine: cenario.online !== false },
    addEventListener: () => {},

    Store: {
      state: () => estadoDoApp,
      normalizeProfile: (p) => p,
      commit: (motivo) => { registro.commits.push(motivo); registro.aplicou = true; }
    },

    Sync: {
      isConfigured: () => true,
      currentUser: () => ({ uid: 'user-1' })
    },

    Fila: {
      pendentes: () => cenario.pendentes || 0,
      /* Drenar NÃO resolve nada neste cenário: é o caso de a rede
         estar ruim e a fila continuar cheia. É justamente aí que a
         trava precisa segurar. */
      drenar: async () => {},
      tentarAgora: () => {},
      aoMudar: () => {},
      estado: () => 'erro'
    },

    Mig: {
      pendente: () => !!cenario.migracaoPendente,
      emAndamento: () => !!cenario.migracaoRodando
    },

    Repo: {
      listarEspacos: async () => [{ id: 'ws-1', name: 'DO BANCO', legacy_id: 'prf_1' }],
      carregarEspaco: async () => ({ id: 'prf_1', name: 'DO BANCO' })
    }
  };
  sandbox.window = sandbox;
  sandbox.global = sandbox;

  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(RAIZ, 'assets', 'js', 'dados.js'), 'utf8'),
    sandbox, { filename: 'dados.js' });

  return { Dados: sandbox.Dados, estadoDoApp, registro };
}

/* ---------------------------------------------------------------
   os casos
   --------------------------------------------------------------- */
const casos = [
  {
    nome: 'fila com 3 tarefas pendentes',
    cenario: { pendentes: 3 },
    esperaAplicar: false,
    porque: 'edicoes offline ainda nao subiram'
  },
  {
    nome: 'migracao nunca feita',
    cenario: { migracaoPendente: true },
    esperaAplicar: false,
    porque: 'o aparelho tem dados que nunca estiveram na conta'
  },
  {
    nome: 'migracao acontecendo agora',
    cenario: { migracaoPendente: true, migracaoRodando: true },
    esperaAplicar: false,
    porque: 'o banco esta pela metade'
  },
  {
    nome: 'fila E migracao pendentes',
    cenario: { pendentes: 2, migracaoPendente: true },
    esperaAplicar: false,
    porque: 'as duas travas fechadas'
  },
  {
    nome: 'sem rede',
    cenario: { online: false },
    esperaAplicar: false,
    porque: 'nao ha o que ler'
  },
  {
    nome: 'nada pendente, com rede',
    cenario: {},
    esperaAplicar: true,
    porque: 'e o unico caso em que sobrescrever e seguro'
  }
];

(async function () {
  console.log('');
  console.log('  trava-sobrescrita — o banco nao pode apagar o aparelho');
  console.log('  ' + '-'.repeat(58));

  let falhas = 0;

  for (const c of casos) {
    const { Dados, estadoDoApp, registro } = montar(c.cenario);
    await Dados.carregarDoBanco();

    const aplicou = registro.aplicou;
    const nomeFinal = estadoDoApp.profiles[0].name;
    const ok = aplicou === c.esperaAplicar;

    /* O nome do perfil é a prova material: 'LOCAL' significa que o
       aparelho continua intacto; 'DO BANCO' que foi substituído. */
    const esperado = c.esperaAplicar ? 'DO BANCO' : 'LOCAL';
    const okNome = nomeFinal === esperado;

    if (!ok || !okNome) falhas++;
    console.log('    ' + (ok && okNome ? 'ok   ' : 'FALHA') + ' ' +
      c.nome.padEnd(30) + ' perfil=' + nomeFinal.padEnd(9) +
      ' estado=' + Dados.estado());
    if (!ok || !okNome) {
      console.log('           esperado perfil=' + esperado + ' (' + c.porque + ')');
    }
  }

  console.log('  ' + '-'.repeat(58));
  if (falhas) {
    console.log('  ' + falhas + ' CASO(S) REPROVARAM — risco de perda de dados');
    console.log('');
    process.exit(1);
  }
  console.log('  a trava segura nos ' + (casos.length - 1) + ' casos de risco,');
  console.log('  e libera no unico caso seguro');
  console.log('');
})();
