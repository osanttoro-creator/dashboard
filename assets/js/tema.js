/* =============================================================
   tema.js — claro, escuro, e a terceira opção que faltava
   -------------------------------------------------------------
   UM CONTROLE SÓ, E ELE FICA EM CONFIGURAÇÕES → APARÊNCIA.
   Antes havia dois: um botão "alternar tema" escondido no popover
   da engrenagem do cabeçalho e um seletor em Configurações. Dois
   controles para um estado é sempre a mesma história — um deles
   fica desatualizado, e a pessoa nunca sabe qual venceu.

   TRÊS ESTADOS, NÃO DOIS
     null    seguir o sistema operacional  (o padrão)
     'light' claro, escolhido    · ícone de sol
     'dark'  escuro, escolhido   · ícone de lua

   O terceiro estado não é luxo: sem ele, "respeitar o tema do
   sistema quando não houver escolha" seria impossível de alcançar
   de volta. Quem tocasse uma vez no seletor ficaria preso à
   escolha para sempre, mesmo tendo tocado por engano.

   A ESCOLHA É DA PESSOA, NÃO DO APARELHO
   Ela vive em user_settings.tema, no Supabase. O localStorage
   guarda uma cópia — e só como cópia, para a primeira pintura
   acontecer antes da rede. Sem conta, a cópia local é tudo o que
   existe, e isso está certo: não há a quem atribuir a preferência.

   POR QUE NÃO FICOU NO Store
   O Store é o estado FINANCEIRO, e ele viaja na sincronização de
   dados. Tema não é dado financeiro: misturar os dois faria a
   preferência visual entrar na resolução de conflito de
   lançamentos, que é onde ela menos deveria estar.
   ============================================================= */
(function (global) {
  'use strict';

  const Tema = {};
  const CHAVE = 'oaze.tema';
  const VALIDOS = ['light', 'dark'];

  /* null = seguir o sistema. Começa indefinido e é resolvido no
     init, para que ninguém leia antes de haver resposta. */
  let escolha = null;
  let consultaSO = null;
  const ouvintes = [];

  function sb() {
    try {
      return (global.SupabaseBackend && SupabaseBackend.cliente && SupabaseBackend.cliente()) || null;
    } catch (e) { return null; }
  }

  function lerLocal() {
    try {
      const v = localStorage.getItem(CHAVE);
      return VALIDOS.indexOf(v) >= 0 ? v : null;
    } catch (e) { return null; }
  }

  function gravarLocal(v) {
    try {
      if (v) localStorage.setItem(CHAVE, v);
      else localStorage.removeItem(CHAVE);
    } catch (e) { /* navegador bloqueando armazenamento: segue sem cópia */ }
  }

  /* ---------------- leitura ---------------- */

  /** A escolha explícita, ou null quando é para seguir o sistema. */
  Tema.escolha = () => escolha;

  /** O que o sistema operacional está pedindo agora. */
  Tema.doSistema = function () {
    if (!consultaSO) return 'dark';
    return consultaSO.matches ? 'dark' : 'light';
  };

  /** O tema que está de fato pintado na tela. */
  Tema.efetivo = () => escolha || Tema.doSistema();

  Tema.aoMudar = (fn) => { ouvintes.push(fn); };

  function anunciar() {
    ouvintes.forEach((fn) => { try { fn(Tema.efetivo(), escolha); } catch (e) { console.error(e); } });
  }

  /* ---------------- aplicação ---------------- */

  function pintar() {
    const efetivo = Tema.efetivo();
    document.documentElement.setAttribute('data-theme', efetivo);

    /* A barra do sistema no celular acompanha. Sem isto, o topo do
       navegador fica claro sobre um app escuro — e é a primeira
       coisa que se vê ao abrir. */
    const cor = efetivo === 'dark' ? '#081A24' : '#F2EDE4';
    document.querySelectorAll('meta[name="theme-color"]').forEach((m) => {
      /* As duas <meta> com media continuam valendo para quem segue o
         sistema; quando há escolha explícita, uma terceira sem media
         vence as duas. */
      if (!m.getAttribute('media')) m.setAttribute('content', cor);
    });
    if (escolha && !document.querySelector('meta[name="theme-color"]:not([media])')) {
      const m = document.createElement('meta');
      m.setAttribute('name', 'theme-color');
      m.setAttribute('content', cor);
      document.head.appendChild(m);
    }

    /* O Store mantém uma cópia porque telas antigas leem dela. Ela
       é ESPELHO, nunca fonte: quem decide é este arquivo. */
    if (global.Store && Store.state) {
      try { Store.state().theme = efetivo; } catch (e) { /* antes do load */ }
    }
    anunciar();
  }

  /* ---------------- escrita ---------------- */

  /**
   * Define o tema. `valor` é 'light', 'dark' ou null para voltar a
   * seguir o sistema.
   *
   * Pinta ANTES de gravar no servidor: a resposta visual não deve
   * esperar a rede, e uma falha de gravação não é motivo para a
   * tela ignorar o clique. O preço é que uma gravação que falha
   * deixa os dois lados diferentes até o próximo login — e é por
   * isso que a falha aparece como aviso em vez de sumir.
   */
  Tema.definir = function (valor) {
    escolha = VALIDOS.indexOf(valor) >= 0 ? valor : null;
    gravarLocal(escolha);
    pintar();
    salvarNoServidor(escolha);
  };

  async function salvarNoServidor(valor) {
    const c = sb();
    const u = global.Sync && Sync.currentUser();
    if (!c || !u) return;
    try {
      const { error } = await c.from('user_settings')
        .upsert({ user_id: u.uid, tema: valor }, { onConflict: 'user_id' });
      if (error) throw error;
    } catch (e) {
      console.warn('Tema: a escolha ficou neste aparelho, mas não subiu —', e.message);
    }
  }

  /* ---------------- ciclo ---------------- */

  Tema.init = function () {
    consultaSO = global.matchMedia && matchMedia('(prefers-color-scheme: dark)');
    escolha = lerLocal();
    pintar();

    /* Mudança do sistema operacional só move a tela de quem NÃO
       escolheu. Sobrepor uma escolha explícita porque anoiteceu
       seria desfazer uma decisão sem avisar. */
    if (consultaSO && consultaSO.addEventListener) {
      consultaSO.addEventListener('change', () => { if (!escolha) pintar(); });
    }
  };

  /**
   * Ao entrar na conta, o servidor manda — é lá que mora a
   * preferência da PESSOA. O aparelho só ganha quando o servidor
   * não tem resposta.
   *
   * O CASO QUE PARECE ERRADO E NÃO É: escolher claro num aparelho e
   * entrar em outro traz o claro junto. É o comportamento pedido —
   * quem escolhe claro costuma ter um motivo que viaja com a
   * pessoa, não com o computador.
   */
  Tema.aoEntrar = async function () {
    const c = sb();
    const u = global.Sync && Sync.currentUser();
    if (!c || !u) return;
    try {
      const { data } = await c.from('user_settings')
        .select('tema').eq('user_id', u.uid).maybeSingle();

      if (data && VALIDOS.indexOf(data.tema) >= 0) {
        escolha = data.tema;
        gravarLocal(escolha);
        pintar();
        return;
      }

      /* O servidor não sabe e este aparelho sabe: a escolha local
         sobe, e a conta passa a lembrar. Sem isto, quem configurou
         antes de criar a conta perderia a configuração ao criá-la. */
      if (data && data.tema === null && escolha) salvarNoServidor(escolha);
      else if (!data && escolha) salvarNoServidor(escolha);
    } catch (e) {
      /* Offline: o que está pintado continua pintado. */
    }
  };

  Tema.aoSair = function () {
    /* A escolha local FICA. Sair da conta não é motivo para o app
       mudar de cor na cara de quem está olhando. */
  };

  global.Tema = Tema;
})(window);
