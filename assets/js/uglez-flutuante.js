/* =============================================================
   uglez-flutuante.js — o UGLEZ presente na área autenticada
   -------------------------------------------------------------
   QUEM VÊ ISTO
   Só quem tem o direito `uglez_assistente_flutuante` — Basic e
   Pro. No Grátis o UGLEZ existe e responde, mas apenas pela
   página própria. A pergunta é feita ao Limites, e nunca a um
   `plano !== 'free'` escrito aqui: no dia em que houver um quarto
   plano, a regra continua num lugar só.

   E ISTO NÃO É A TRAVA. Esconder um botão nunca é. Quem chamar a
   Edge Function direto continua esbarrando no plano e na cota do
   lado do servidor, que é onde a decisão vale. O papel deste
   arquivo é não oferecer o que a pessoa não tem — não impedir.

   O QUE ELE NÃO PODE COBRIR
   Menu, gráfico, formulário, campo, botão. No desktop mora no
   canto inferior ESQUERDO justamente porque o "+" de adicionar
   rápido já ocupa o direito; os dois no mesmo canto brigariam, e
   o brief pede que tenham o mesmo peso visual, não o mesmo lugar.
   No celular ele sobe acima da navegação inferior — sobrepor a
   barra de navegação é tirar do usuário a forma de sair da tela.

   SEM MASCOTE. O botão é a formação de partículas e mais nada:
   sem rosto, sem robô, sem personagem, sem ampulheta. O único
   ícone figurativo da marca é o coqueiro, e ele é do OAZE.
   ============================================================= */
(function (global) {
  'use strict';

  const F = {};
  const el = U.el;

  let raiz = null;         // o contêiner inteiro
  let botao = null;
  let painel = null;
  let campo = null;
  let caixaResposta = null;
  let enviar = null;
  let particulas = null;
  let particulasPainel = null;
  let aberto = false;
  let ligado = false;
  let ultimoFoco = null;

  /* ---------------- direito ---------------- */

  function temDireito() {
    if (!global.Limites) return false;
    /* O nome do brief e o nome interno valem os dois; Limites
       traduz. Ver Planos.CHAVES. */
    return Limites.pode('uglezFloatingAssistant');
  }

  /* ---------------- construção ---------------- */

  function construir() {
    if (raiz) return;

    caixaResposta = el('div', { class: 'ai-answer', id: 'uglezFlutResposta', hidden: true });

    campo = el('textarea', {
      class: 'input textarea-plain', id: 'uglezFlutCampo', rows: 2,
      'aria-label': 'Sua pergunta para o UGLEZ',
      placeholder: 'Pergunte sobre o mês que você está vendo…'
    });
    campo.addEventListener('keydown', (ev) => {
      /* Enter envia; Shift+Enter quebra linha. É a convenção de
         todo campo de conversa, e inverter isso faz a pessoa mandar
         meia pergunta. */
      if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); perguntar(); }
    });

    enviar = el('button', { class: 'btn btn-ai', type: 'button', text: 'Perguntar', onclick: perguntar });

    const cota = el('p', { class: 'uglez-cota', id: 'uglezFlutCota', hidden: true });

    painel = el('div', {
      class: 'uglez-flut-painel', id: 'uglezFlutPainel', hidden: true,
      role: 'dialog', 'aria-label': 'UGLEZ', 'aria-modal': 'false'
    }, [
      el('div', { class: 'uglez-flut-topo' }, [
        el('span', { class: 'uglez-flut-marca', id: 'uglezFlutMarca', 'aria-hidden': 'true' }),
        el('div', { class: 'uglez-flut-id' }, [
          el('strong', { text: 'UGLEZ' }),
          el('span', { class: 'uglez-flut-periodo', id: 'uglezFlutPeriodo' })
        ]),
        el('button', {
          class: 'icon-btn', type: 'button', 'aria-label': 'Fechar UGLEZ',
          text: '✕', onclick: () => F.fechar(true)
        })
      ]),

      el('div', { class: 'uglez-flut-corpo' }, [
        el('div', { class: 'uglez-chips', id: 'uglezFlutChips' }),
        caixaResposta
      ]),

      el('div', { class: 'uglez-flut-pe' }, [
        cota,
        el('div', { class: 'ai-ask' }, [campo, enviar]),
        el('p', { class: 'hint', text: 'Respostas orientativas, sobre o mês exibido. Não são consultoria financeira.' })
      ])
    ]);

    /* O botão É a formação. Não há ícone dentro dele: o canvas
       ocupa a área toda, e o nome acessível vem do aria-label —
       que é o que um leitor de tela anuncia, já que partícula não
       tem texto alternativo possível. */
    botao = el('button', {
      class: 'uglez-flut-botao', id: 'uglezFlutBotao', type: 'button',
      'aria-label': 'Abrir UGLEZ',
      'aria-expanded': 'false',
      'aria-controls': 'uglezFlutPainel',
      title: 'Abrir UGLEZ'
    });

    /* Tooltip próprio além do title: o title do navegador demora
       ~1s e não aparece no foco por teclado. Quem chega aqui de Tab
       precisa ver o rótulo. */
    const dica = el('span', { class: 'uglez-flut-dica', 'aria-hidden': 'true', text: 'Abrir UGLEZ' });

    raiz = el('div', { class: 'uglez-flut', id: 'uglezFlut' }, [painel, botao, dica]);
    document.body.appendChild(raiz);

    botao.addEventListener('click', () => F.alternar());
    /* Enter e Espaço já funcionam por ser <button>. O que falta é o
       estado visual de foco/hover mover as partículas. */
    ['mouseenter', 'focus'].forEach((ev) =>
      botao.addEventListener(ev, () => { if (!aberto && particulas) particulas.estado('foco'); }));
    ['mouseleave', 'blur'].forEach((ev) =>
      botao.addEventListener(ev, () => { if (!aberto && particulas) particulas.estado('repouso'); }));

    document.addEventListener('keydown', aoTeclar);

    particulas = UglezParticulas.montar(botao, { qtd: qtdBotao() });
    particulasPainel = UglezParticulas.montar(
      painel.querySelector('#uglezFlutMarca'), { qtd: 18 });
  }

  /**
   * Menos partículas no botão do celular — o brief pede isso, e o
   * motivo é físico: 44px de lado com 60 pontos vira uma mancha,
   * não uma formação.
   */
  function qtdBotao() {
    return global.innerWidth < 768 ? 26 : 40;
  }

  /* ---------------- abrir e fechar ---------------- */

  F.alternar = function () { if (aberto) F.fechar(true); else F.abrir(); };

  F.abrir = function () {
    if (!raiz || aberto) return;
    aberto = true;
    ultimoFoco = document.activeElement;
    painel.hidden = false;
    raiz.classList.add('is-aberto');
    /* O '+' de adicionar rápido sai de cena enquanto o painel está
       aberto: no celular ele fica exatamente sobre o campo de
       digitar do bottom sheet. Ver style.css, .uglez-flut. */
    document.body.classList.add('uglez-aberto');
    botao.setAttribute('aria-expanded', 'true');
    botao.setAttribute('aria-label', 'Fechar UGLEZ');
    botao.title = 'Fechar UGLEZ';
    if (particulas) particulas.estado('repouso');
    /* O painel estava hidden até agora: a formação de dentro dele
       foi construída sem tamanho. O ResizeObserver já cobre isso,
       mas ele dispara no quadro seguinte — remedir aqui evita o
       piscar de um quadro errado. */
    if (particulasPainel) particulasPainel.medir();
    F.renderContexto();
    renderChips();
    setTimeout(() => campo && campo.focus(), 60);
  };

  /**
   * Fecha e CONTINUA NA MESMA PÁGINA. O painel nunca navega: quem
   * abriu o UGLEZ no meio de um lançamento precisa voltar
   * exatamente para onde estava, com o formulário como deixou.
   *
   * @param {boolean} devolveFoco true quando o fechamento foi
   *   deliberado (Esc, botão, clique fora). Devolver o foco ao
   *   gatilho é o que impede a pessoa de ser largada no início da
   *   página depois de fechar.
   */
  F.fechar = function (devolveFoco) {
    if (!raiz || !aberto) return;
    aberto = false;
    painel.hidden = true;
    raiz.classList.remove('is-aberto');
    document.body.classList.remove('uglez-aberto');
    botao.setAttribute('aria-expanded', 'false');
    botao.setAttribute('aria-label', 'Abrir UGLEZ');
    botao.title = 'Abrir UGLEZ';
    if (particulas) particulas.estado('repouso');
    if (devolveFoco) {
      /* De volta ao botão, não ao que tinha o foco antes: no
         celular o painel é tela cheia, e devolver a um campo que
         está fora da vista rolaria a página sozinha. */
      botao.focus();
    }
    ultimoFoco = null;
  };

  function aoTeclar(ev) {
    if (ev.key === 'Escape' && aberto) { ev.preventDefault(); F.fechar(true); }
  }

  /* Clique fora fecha — mas só no desktop. No celular o painel
     ocupa a tela inteira e "fora" não existe. */
  document.addEventListener('click', (ev) => {
    if (!aberto || !raiz) return;
    if (global.innerWidth < 768) return;
    if (raiz.contains(ev.target)) return;
    F.fechar(false);
  });

  /* ---------------- conteúdo ---------------- */

  function renderChips() {
    const box = painel && painel.querySelector('#uglezFlutChips');
    if (!box || !global.Ug) return;
    U.clear(box);
    /* As MESMAS sugestões da página. Duas listas diferentes para o
       mesmo assistente ensinariam que ele responde coisas
       diferentes em cada lugar. */
    (Ug.sugestoes ? Ug.sugestoes() : Ug.SUGESTOES).forEach((s) => {
      box.appendChild(el('button', {
        class: 'ai-chip', type: 'button', text: s.rotulo,
        onclick: () => { campo.value = s.q; perguntar(); }
      }));
    });
  }

  F.renderContexto = function () {
    const p = painel && painel.querySelector('#uglezFlutPeriodo');
    if (p) p.textContent = U.smartCase(U.monthLabel(App.ym));
    F.renderCota();
  };

  F.renderCota = function () {
    const alvo = painel && painel.querySelector('#uglezFlutCota');
    if (!alvo || !global.Limites) return;
    const c = Limites.consumoIA();
    if (c.limite === null || c.limite === undefined) { alvo.hidden = true; return; }
    const resta = Math.max(0, c.limite - c.usado);
    alvo.hidden = false;
    alvo.className = 'uglez-cota' + (resta === 0 ? ' is-esgotada' : resta <= 2 ? ' is-pouca' : '');
    alvo.textContent = resta === 0
      ? 'Você usou as ' + c.limite + ' consultas do seu plano neste mês. Elas voltam no dia 1º.'
      : resta + ' de ' + c.limite + ' consultas restantes neste mês.';
  };

  function perguntar() {
    if (!campo) return;
    const q = campo.value;
    if (!String(q).trim()) { campo.focus(); return; }
    AI.perguntar(q, {
      caixa: caixaResposta,
      botao: enviar,
      estado: (e) => {
        if (particulas) {
          if (e === 'sucesso' || e === 'erro') particulas.pulsar(e, 1.1);
          else particulas.estado(e);
        }
        if (particulasPainel) {
          if (e === 'sucesso' || e === 'erro') particulasPainel.pulsar(e, 1.1);
          else particulasPainel.estado(e);
        }
      }
    });
  }

  /* ---------------- ciclo ---------------- */

  /**
   * Mostra ou esconde conforme o direito. Chamado no boot, ao
   * entrar na conta e quando o plano muda — um upgrade precisa
   * fazer o assistente aparecer sem recarregar a página, senão a
   * pessoa acabou de pagar e não vê diferença nenhuma.
   */
  F.sincronizar = function () {
    const pode = temDireito();
    if (pode && !ligado) {
      construir();
      ligado = true;
      raiz.hidden = false;
    } else if (!pode && ligado) {
      /* Downgrade: some, sem drama e sem apagar nada. */
      F.fechar(false);
      ligado = false;
      if (raiz) raiz.hidden = true;
    } else if (pode && raiz) {
      raiz.hidden = false;
    }
    if (ligado && aberto) F.renderContexto();
  };

  F.init = function () {
    F.sincronizar();
    /* O período muda com o seletor do cabeçalho, e o painel afirma
       QUAL mês está analisando. Uma afirmação que não acompanha o
       seletor é pior do que nenhuma. */
    if (global.Store && Store.onChange) Store.onChange(() => { if (aberto) F.renderContexto(); });
  };

  F.aoEntrar = function () { F.sincronizar(); };
  F.aoSair = function () { F.sincronizar(); };

  /** Solta tudo. Existe para o app poder ser desmontado em teste. */
  F.destruir = function () {
    document.removeEventListener('keydown', aoTeclar);
    if (particulas) { particulas.destruir(); particulas = null; }
    if (particulasPainel) { particulasPainel.destruir(); particulasPainel = null; }
    document.body.classList.remove('uglez-aberto');
    if (raiz && raiz.parentNode) raiz.parentNode.removeChild(raiz);
    raiz = botao = painel = campo = caixaResposta = enviar = null;
    ligado = false; aberto = false;
  };

  global.UglezFlutuante = F;
})(window);
