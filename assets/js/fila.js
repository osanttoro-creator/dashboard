/* =============================================================
   fila.js — o que fazer quando não há rede
   ------------------------------------------------------------
   O app continua funcionando offline porque o localStorage segue
   respondendo na hora. O que falta é a nuvem saber — e é isso que
   a fila resolve: cada alteração vira uma tarefa persistida, e as
   tarefas são drenadas quando a conexão volta.

   POR QUE A FILA VIVE NO localStorage
   Se ela morasse na memória, fechar a aba offline perderia tudo
   que foi feito naquela sessão. Uma fila que não sobrevive ao
   fechamento da aba não é uma fila: é um adiamento.

   POR QUE NÃO DUPLICA
   Cada tarefa carrega a chave da linha que ela representa
   (espaço + legacy_id), e a fila guarda UMA tarefa por chave. Dez
   edições no mesmo lançamento offline viram um envio, com o estado
   final — que é o único que importa. É também o que impede a
   duplicata quando a mesma tarefa é reenviada após um erro de
   rede que na verdade chegou ao servidor.

   OS QUATRO ESTADOS
     offline      sem rede; as alterações estão na fila
     sincronizando  drenando
     sincronizado   fila vazia
     erro           uma tarefa falhou e vai ser tentada de novo
   ============================================================= */
(function (global) {
  'use strict';

  const Fila = {};
  const CHAVE = 'oaze.fila.v1';

  /* Espera crescente entre tentativas: insistir de um em um segundo
     numa rede caída só gasta bateria e enche o log. */
  const ESPERAS = [2000, 5000, 15000, 60000];

  let tarefas = carregar();
  let drenando = false;
  let tentativa = 0;
  let relogio = null;

  function carregar() {
    try { return JSON.parse(localStorage.getItem(CHAVE) || '[]'); } catch (e) { return []; }
  }
  function salvar() {
    try { localStorage.setItem(CHAVE, JSON.stringify(tarefas)); } catch (e) { /* cheio */ }
  }

  Fila.pendentes = () => tarefas.length;
  Fila.limpar = () => { tarefas = []; salvar(); };

  /**
   * Enfileira. Uma tarefa por chave: a nova substitui a anterior,
   * porque só o estado final é enviado.
   */
  Fila.push = function (tarefa) {
    const chave = tarefa.chave;
    const i = tarefas.findIndex((t) => t.chave === chave);
    const nova = Object.assign({}, tarefa, { em: Date.now() });
    if (i >= 0) tarefas[i] = nova; else tarefas.push(nova);
    salvar();
    Fila.pintar();
    Fila.drenar();
  };

  /* ---------------- estado visível ---------------- */

  Fila.estado = function () {
    if (!navigator.onLine) return 'offline';
    if (drenando) return 'sincronizando';
    if (tarefas.length) return tentativa ? 'erro' : 'sincronizando';
    return 'sincronizado';
  };

  const ROTULO = {
    offline: 'Sem conexão — alterações guardadas',
    sincronizando: 'Sincronizando…',
    sincronizado: 'Sincronizado',
    erro: 'Falha ao sincronizar — tentando de novo'
  };

  /**
   * O indicador vive na barra lateral e é anunciado por leitor de
   * tela: aria-live existe porque a mudança de "sincronizando" para
   * "sincronizado" não tem nenhum outro sinal para quem não vê.
   */
  Fila.pintar = function () {
    const alvo = document.getElementById('filaBox');
    if (!alvo) return;
    const e = Fila.estado();
    const n = tarefas.length;
    alvo.setAttribute('aria-live', 'polite');
    alvo.className = 'fila-chip is-' + e;
    alvo.textContent = ROTULO[e] + (n && e !== 'sincronizado' ? ' (' + n + ')' : '');
    alvo.hidden = e === 'sincronizado' && !n;
  };

  /* ---------------- drenagem ---------------- */

  Fila.drenar = async function () {
    if (drenando || !tarefas.length) return;
    if (!navigator.onLine) { Fila.pintar(); return; }
    if (!global.Sync || !Sync.currentUser()) return;

    drenando = true;
    Fila.pintar();

    try {
      /* Uma por vez, na ordem. Paralelizar aqui trocaria alguns
         milissegundos por uma ordem de gravação imprevisível. */
      while (tarefas.length) {
        const t = tarefas[0];
        await Fila.executar(t);
        tarefas.shift();
        salvar();
        Fila.pintar();
      }
      tentativa = 0;
    } catch (e) {
      console.warn('Fila:', e.message);
      /* A tarefa continua na frente da fila. Não é perda: é espera. */
      const espera = ESPERAS[Math.min(tentativa, ESPERAS.length - 1)];
      tentativa++;
      clearTimeout(relogio);
      relogio = setTimeout(() => { drenando = false; Fila.drenar(); }, espera);
      drenando = false;
      Fila.pintar();
      return;
    }

    drenando = false;
    Fila.pintar();
  };

  /** Executa uma tarefa. Upsert sempre — é o que torna o reenvio seguro. */
  Fila.executar = async function (t) {
    const sb = SupabaseBackend.cliente();
    if (!sb) throw new Error('sem cliente');

    if (t.tipo === 'espaco') {
      const perfil = Store.state().profiles.find((p) => p.id === t.perfilId);
      if (!perfil) return;                 // perfil apagado: a tarefa perdeu o objeto
      await Repo.enviarEspaco(perfil, Sync.currentUser().uid);
      return;
    }
    throw new Error('tipo de tarefa desconhecido: ' + t.tipo);
  };

  /** Tentar de novo agora, a pedido do usuário. */
  Fila.tentarAgora = function () {
    tentativa = 0;
    clearTimeout(relogio);
    drenando = false;
    Fila.drenar();
  };

  Fila.init = function () {
    /* A volta da conexão é o gatilho natural — melhor do que ficar
       perguntando de tempos em tempos se já deu. */
    global.addEventListener('online', () => { tentativa = 0; Fila.drenar(); });
    global.addEventListener('offline', () => Fila.pintar());

    /* Voltar para a aba também merece uma tentativa: o evento
       'online' não dispara quando a rede caiu e voltou com a aba
       em segundo plano. */
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) Fila.drenar();
    });

    Fila.pintar();
    Fila.drenar();
  };

  global.Fila = Fila;
})(window);
