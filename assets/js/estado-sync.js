/* =============================================================
   estado-sync.js — o único lugar que desenha o estado da sincronia
   -------------------------------------------------------------
   Duas fontes contam a mesma história por ângulos diferentes:

     Fila   — o que este aparelho tem para SUBIR
     Dados  — o que conseguimos DESCER do banco

   Elas podem discordar num instante qualquer (a fila vazia e a
   leitura falhando, por exemplo), e por isso existe uma regra de
   precedência escrita num lugar só. Antes cada uma escrevia direto
   no mesmo elemento e o último a rodar vencia: um "Sincronizado"
   apagava um "não foi possível trazer do servidor" ou o contrário,
   conforme a ordem — que ninguém controlava.

   POR QUE "SINCRONIZADO" NÃO FICA NA TELA PARA SEMPRE
   Um selo permanente dizendo que está tudo bem vira mobília: em
   duas semanas ninguém enxerga, e quando ele mudar para "erro"
   também não vão enxergar. Ele aparece por alguns segundos depois
   de sincronizar e some. Os estados que exigem atenção — offline,
   erro — ficam até deixarem de ser verdade.
   ============================================================= */
(function (global) {
  'use strict';

  const ES = {};
  const SEGUNDOS_DO_OK = 4000;

  let sumir = null;

  /* Precedência, do mais grave ao menos. O primeiro que se aplicar
     é o que aparece. */
  function decidir() {
    const eFila = global.Fila ? Fila.estado() : 'sincronizado';
    const eDados = global.Dados ? Dados.estado() : 'local';
    const pendentes = global.Fila ? Fila.pendentes() : 0;
    const temSync = global.Sync && Sync.status;
    const conta = temSync && Sync.currentUser();
    const sSync = temSync ? Sync.status().state : 'off';
    const legadoPendente = temSync && Sync.temPendencia && Sync.temPendencia();

    if (temSync && Sync.restaurando && Sync.restaurando()) {
      return { chave: 'sincronizando', texto: 'Verificando sua conta…' };
    }

    /* O app ainda persiste o painel usado na tabela `dados`; este é o
       estado que descreve a sincronização que a pessoa realmente vê.
       A camada normalizada abaixo continua como fallback de migração. */
    if (conta) {
      if (!navigator.onLine || sSync === 'offline') {
        return {
          chave: 'offline',
          texto: legadoPendente
            ? 'Sem conexão — alteração guardada neste aparelho'
            : 'Sem conexão'
        };
      }
      if (sSync === 'connecting' || sSync === 'syncing' || legadoPendente) {
        return { chave: 'sincronizando', texto: 'Sincronizando…' };
      }
      if (sSync === 'ok') return { chave: 'sincronizado', texto: 'Sincronizado' };
    }

    /* Sem conta: não há sincronização para relatar, e chamar isso de
       estado degradado seria mentira. É um modo de uso. */
    if (eDados === 'local') {
      return { chave: 'local', texto: 'Dados só neste aparelho', acao: 'entrar' };
    }

    /* Offline vem antes de tudo: com a rede caída, qualquer outro
       diagnóstico é ruído sobre a mesma causa. */
    if (!navigator.onLine) {
      return {
        chave: 'offline',
        texto: pendentes
          ? 'Sem conexão — ' + pendentes + (pendentes > 1 ? ' alterações guardadas' : ' alteração guardada')
          : 'Sem conexão'
      };
    }

    if (eFila === 'erro') {
      return {
        chave: 'erro',
        texto: 'Não foi possível enviar ' + pendentes +
          (pendentes > 1 ? ' alterações' : ' alteração'),
        detalhe: 'Elas continuam guardadas aqui. Nada foi perdido.',
        acao: 'tentar'
      };
    }

    if (eDados === 'erro') {
      return {
        chave: 'erro',
        texto: 'Não foi possível trazer seus dados',
        detalhe: Dados.erro() || 'O que está na tela é a última cópia deste aparelho.',
        acao: 'tentar'
      };
    }

    if (eFila === 'sincronizando' || eDados === 'carregando' || eDados === 'sincronizando') {
      return { chave: 'sincronizando', texto: 'Sincronizando…' };
    }

    return { chave: 'sincronizado', texto: 'Sincronizado' };
  }

  ES.pintar = function () {
    const alvo = document.getElementById('filaBox');
    if (!alvo) return;

    const s = decidir();
    clearTimeout(sumir);

    alvo.className = 'fila-chip is-' + s.chave;
    alvo.hidden = false;
    alvo.textContent = '';

    /* aria-live no elemento, não criado junto com o texto: uma
       região viva só é anunciada se já existia na árvore antes de o
       conteúdo mudar dentro dela. */
    alvo.setAttribute('aria-live', 'polite');
    /* Erro não é 'polite': quem está no meio de um lançamento
       precisa saber que ele não subiu, e 'polite' pode esperar o
       leitor de tela terminar tudo o que está fazendo. */
    alvo.setAttribute('role', s.chave === 'erro' ? 'alert' : 'status');

    const txt = document.createElement('span');
    txt.textContent = s.texto;
    alvo.appendChild(txt);

    if (s.detalhe) {
      /* O detalhe é para quem lê a tela e para o leitor de tela --
         não é tooltip, que não existe no toque nem no teclado. */
      const det = document.createElement('span');
      det.className = 'fila-detalhe';
      det.textContent = s.detalhe;
      alvo.appendChild(det);
    }

    if (s.acao === 'tentar') {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'fila-acao';
      b.textContent = 'Tentar novamente';
      b.addEventListener('click', function () {
        b.disabled = true;
        b.textContent = 'Tentando…';
        const tentativas = [];
        if (global.Sync && Sync.atualizarAgora) tentativas.push(Sync.atualizarAgora(true));
        if (global.Dados && Dados.tentarNovamente) tentativas.push(Dados.tentarNovamente());
        Promise.all(tentativas).then(ES.pintar, ES.pintar);
      });
      alvo.appendChild(b);
    }

    if (s.acao === 'entrar') {
      const a = document.createElement('a');
      a.className = 'fila-acao';
      a.href = '/entrar?destino=/app';
      a.textContent = 'Entrar para sincronizar';
      alvo.appendChild(a);
    }

    /* Só o estado bom desaparece sozinho. Os outros ficam até
       deixarem de ser verdade. */
    if (s.chave === 'sincronizado') {
      sumir = setTimeout(function () { alvo.hidden = true; }, SEGUNDOS_DO_OK);
    }
  };

  ES.init = function () {
    if (global.Fila && Fila.aoMudar) Fila.aoMudar(ES.pintar);
    if (global.Dados && Dados.aoMudar) Dados.aoMudar(ES.pintar);
    if (global.Sync && Sync.aoMudarEstado) Sync.aoMudarEstado(ES.pintar);
    global.addEventListener('online', ES.pintar);
    global.addEventListener('offline', ES.pintar);
    ES.pintar();
  };

  global.EstadoSync = ES;
})(window);
