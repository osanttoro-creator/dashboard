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

  /* =============================================================
     A CONTA À VISTA
     -------------------------------------------------------------
     O selo acima mora na barra lateral, que não aparece nem no
     celular nem no computador desde a navegação nova. Resultado
     medido em 15/09/2026: o celular estava sem sessão, o app
     mostrava os dados só daquele navegador, e nada na tela dizia
     isso — parecia que a sincronização não funcionava.

     Dois lugares passam a dizer:
       · o topo do Menu do celular: com quem sincroniza, e um
         "Sincronizar agora"; ou o botão de entrar;
       · um aviso acima do conteúdo, só SEM conta, que pode ser
         fechado por 7 dias — o uso sem conta é legítimo e não deve
         virar insistência.
     ============================================================= */
  const CHAVE_AVISO = 'oaze.aviso-conta.fechado';
  const SETE_DIAS = 7 * 24 * 60 * 60 * 1000;

  function avisoFechadoRecente() {
    try { return Date.now() - (+localStorage.getItem(CHAVE_AVISO) || 0) < SETE_DIAS; }
    catch (e) { return false; }
  }

  function botao(classe, texto, aoClicar) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = classe;
    b.textContent = texto;
    b.addEventListener('click', aoClicar);
    return b;
  }

  function entrar() {
    if (global.Shell && Shell.fecharMenuMovel) Shell.fecharMenuMovel();
    if (global.Sync && Sync.signIn) Sync.signIn();
    else global.location.href = '/entrar?destino=/app';
  }

  /* =============================================================
     O BOTÃO DE SINCRONIZAR
     -------------------------------------------------------------
     Um botão só, com três papéis, porque as três perguntas são a
     mesma: "isto aqui está junto com meus outros aparelhos?"

       sem conta        leva para entrar
       com conta        puxa os dados agora
       ocupado/erro     diz o que está acontecendo, e não some

     O rótulo muda com o estado em vez de dizer sempre
     "Sincronizar": um botão que afirma a mesma coisa em todas as
     situações não é informação, é enfeite. E o título carrega a
     hora da última sincronização, que é o que responde "isso aqui
     está velho?".
     ============================================================= */
  function quandoFoi(ms) {
    if (!ms) return '';
    const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
    if (s < 60) return 'agora mesmo';
    const m = Math.round(s / 60);
    if (m < 60) return 'há ' + m + (m === 1 ? ' minuto' : ' minutos');
    const h = Math.round(m / 60);
    if (h < 24) return 'há ' + h + (h === 1 ? ' hora' : ' horas');
    return 'em ' + new Date(ms).toLocaleDateString('pt-BR');
  }

  let sincronizando = false;

  function pintarBotaoSync(s) {
    const btn = document.getElementById('btnSync');
    if (!btn) return;
    const rot = document.getElementById('btnSyncLabel');
    const temSync = !!(global.Sync && Sync.isConfigured && Sync.isConfigured());
    btn.hidden = !temSync;
    if (!temSync) return;

    const restaurando = !!(global.Sync && Sync.restaurando && Sync.restaurando());
    const u = global.Sync && Sync.currentUser ? Sync.currentUser() : null;
    const ocupado = sincronizando || restaurando || s.chave === 'sincronizando';

    let texto, dica, classe;
    if (restaurando) {
      texto = 'Verificando'; dica = 'Verificando sua conta…'; classe = 'is-sincronizando';
    } else if (!u) {
      texto = 'Entrar'; classe = 'is-local';
      dica = 'Estes dados estão só neste aparelho. Entrar para sincronizar.';
    } else if (ocupado) {
      texto = 'Sincronizando'; dica = 'Sincronizando…'; classe = 'is-sincronizando';
    } else if (s.chave === 'offline') {
      texto = 'Sem conexão'; classe = 'is-offline';
      dica = 'Sem conexão. As alterações ficam guardadas e sobem quando a rede voltar.';
    } else if (s.chave === 'erro') {
      texto = 'Erro'; classe = 'is-erro';
      dica = s.texto + ' Toque para tentar de novo.';
    } else {
      const quando = quandoFoi(global.Sync && Sync.ultimaSincronia ? Sync.ultimaSincronia() : 0);
      texto = 'Sincronizar'; classe = 'is-ok';
      dica = (quando ? 'Sincronizado ' + quando + '. ' : '') + 'Toque para atualizar agora.';
    }

    if (rot) rot.textContent = texto;
    btn.className = 'pill pill-btn pill-sync ' + classe;
    btn.disabled = ocupado;
    btn.setAttribute('aria-label', dica);
    btn.setAttribute('data-dica', dica);
    btn.title = dica;
  }

  function sincronizarAgora() {
    if (!(global.Sync && Sync.currentUser && Sync.currentUser())) { entrar(); return; }
    sincronizando = true;
    ES.pintar();
    const fim = function () { sincronizando = false; ES.pintar(); };
    Promise.resolve(Sync.atualizarAgora && Sync.atualizarAgora(true))
      .then(function () {
        setTimeout(fim, 400);   // um piscar de 40ms não se lê como resposta
      }, fim);
  }
  ES.sincronizarAgora = sincronizarAgora;

  function pintarConta(s) {
    const temSync = !!(global.Sync && Sync.isConfigured && Sync.isConfigured());
    const restaurando = !!(global.Sync && Sync.restaurando && Sync.restaurando());
    const u = temSync && Sync.currentUser ? Sync.currentUser() : null;

    const menu = document.getElementById('menuMovelConta');
    if (menu) {
      menu.textContent = '';
      menu.hidden = !temSync;
      if (temSync) {
        const inicial = document.createElement('span');
        inicial.className = 'conta-inicial' + (u ? '' : ' is-vazia');
        inicial.setAttribute('aria-hidden', 'true');
        inicial.textContent = u ? String(u.displayName || u.email || '?').charAt(0).toUpperCase() : '·';

        const textos = document.createElement('span');
        textos.className = 'conta-textos';
        const t = document.createElement('strong');
        const sub = document.createElement('span');
        if (restaurando) {
          t.textContent = 'Verificando sua conta…';
          sub.textContent = 'Um instante.';
        } else if (u) {
          t.textContent = u.email || u.displayName || 'Sua conta';
          sub.textContent = s.chave === 'offline' ? s.texto
            : s.chave === 'erro' ? s.texto
              : s.chave === 'sincronizando' ? 'Sincronizando…'
                : 'Sincronizado com seus outros aparelhos';
          sub.className = 'is-' + s.chave;
        } else {
          t.textContent = 'Dados só neste aparelho';
          sub.textContent = 'Entre com a mesma conta do computador para ver tudo aqui.';
          sub.className = 'is-local';
        }
        textos.appendChild(t);
        textos.appendChild(sub);
        menu.appendChild(inicial);
        menu.appendChild(textos);

        if (!restaurando && u) {
          menu.appendChild(botao('btn btn-ghost btn-sm conta-acao', 'Sincronizar agora', function (ev) {
            const b = ev.currentTarget;
            b.disabled = true;
            b.textContent = 'Sincronizando…';
            const fim = function () { b.disabled = false; b.textContent = 'Sincronizar agora'; ES.pintar(); };
            Promise.resolve(Sync.atualizarAgora && Sync.atualizarAgora(true)).then(fim, fim);
          }));
        } else if (!restaurando) {
          menu.appendChild(botao('btn btn-primary btn-sm conta-acao', 'Entrar', entrar));
        }
      }
    }

    const aviso = document.getElementById('avisoConta');
    if (aviso) {
      const mostrar = temSync && !restaurando && !u && !avisoFechadoRecente();
      aviso.hidden = !mostrar;
      aviso.textContent = '';
      if (mostrar) {
        const texto = document.createElement('p');
        const forte = document.createElement('strong');
        forte.textContent = 'Estes dados estão só neste aparelho. ';
        texto.appendChild(forte);
        texto.appendChild(document.createTextNode(
          'Entre com a mesma conta do computador ou do tablet para ver tudo sincronizado aqui.'));
        aviso.appendChild(texto);
        const acoes = document.createElement('div');
        acoes.className = 'aviso-conta-acoes';
        acoes.appendChild(botao('btn btn-primary btn-sm', 'Entrar e sincronizar', entrar));
        acoes.appendChild(botao('btn btn-ghost btn-sm', 'Agora não', function () {
          try { localStorage.setItem(CHAVE_AVISO, String(Date.now())); } catch (e) { /* segue */ }
          aviso.hidden = true;
        }));
        aviso.appendChild(acoes);
      }
    }
  }

  ES.pintar = function () {
    const s = decidir();
    pintarConta(s);
    pintarBotaoSync(s);

    const alvo = document.getElementById('filaBox');
    if (!alvo) return;
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
    const btn = document.getElementById('btnSync');
    if (btn) btn.addEventListener('click', sincronizarAgora);
    /* O rótulo "há 3 minutos" envelhece sozinho; sem este relógio ele
       continuaria dizendo "agora mesmo" uma hora depois. */
    global.setInterval(function () {
      if (!document.hidden) ES.pintar();
    }, 60000);
    if (global.Fila && Fila.aoMudar) Fila.aoMudar(ES.pintar);
    if (global.Dados && Dados.aoMudar) Dados.aoMudar(ES.pintar);
    if (global.Sync && Sync.aoMudarEstado) Sync.aoMudarEstado(ES.pintar);
    global.addEventListener('online', ES.pintar);
    global.addEventListener('offline', ES.pintar);
    ES.pintar();
  };

  global.EstadoSync = ES;
})(window);
