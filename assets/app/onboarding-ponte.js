/* =============================================================
   onboarding-ponte.js — o assistente de primeiros passos na V3
   -------------------------------------------------------------
   O onboarding são 522 linhas em assets/js/onboarding.js: sete
   etapas que constroem conta, categorias, primeiro lançamento e um
   orçamento ou meta de verdade, salvando o progresso a cada passo —
   parar na etapa 4 e voltar amanhã continua na 4.

   Reescrever isso na linguagem da V3 daria duas implementações da
   mesma conversa, e a segunda nasceria sem os detalhes que a
   primeira aprendeu. Então ele continua sendo UM arquivo: esta
   ponte oferece as cinco funções que ele chama, traduzidas para a
   folha (sheet) da V3.

   O onboarding vive em assets/js/, que é a camada compartilhada
   com store.js e calc.js — ele não é "da V2", é do produto.
   ============================================================= */
(function (global) {
  'use strict';

  if (global.UI && global.UI.openModal) return;   // o painel anterior já tem o seu

  const el = global.U && U.el;
  const UI = global.UI || {};

  function folha() { return document.getElementById('v3-sheet'); }
  function cobertura() { return document.getElementById('v3-overlay'); }

  /* O onboarding monta o corpo como NÓ e pede botões num array; a
     folha da V3 recebe HTML. A ponte monta a casca em HTML e
     pendura o nó dentro, para não serializar o que já é DOM. */
  UI.openModal = function (opcoes) {
    const o = opcoes || {};
    const alvo = folha();
    if (!alvo) return;
    alvo.setAttribute('aria-label', o.title || 'Primeiros passos');
    alvo.innerHTML = '<div class="v3-sheet-top"><span><h2>' + U.escape(o.title || '') + '</h2></span>'
      + '<button type="button" data-action="close" class="v3-sheet-close" aria-label="Fechar">×</button></div>'
      + '<div class="v3-ob-corpo"></div><div class="v3-ob-pe"></div>';
    const corpo = alvo.querySelector('.v3-ob-corpo');
    if (o.body) corpo.appendChild(o.body);

    const pe = alvo.querySelector('.v3-ob-pe');
    (o.buttons || []).forEach((b) => {
      if (!b) return;
      const botao = el('button', {
        type: 'button',
        class: b.class === 'btn-primary' ? 'v3-primary' : 'v3-secondary',
        text: b.label
      });
      if (b.onClick) botao.addEventListener('click', b.onClick);
      if (b.align === 'left') botao.classList.add('esta-a-esquerda');
      pe.appendChild(botao);
    });

    cobertura().hidden = false;
    document.body.style.overflow = 'hidden';
    const primeiro = corpo.querySelector('input, select, textarea, button');
    if (primeiro && !o.noAutofocus) primeiro.focus();
  };

  UI.closeModal = function () {
    cobertura().hidden = true;
    document.body.style.overflow = '';
    folha().innerHTML = '';
  };

  /* O aviso da V3 é um elemento fixo com id próprio; o onboarding
     chama UI.toast(texto, tipo) e o tipo aqui não muda nada. */
  UI.toast = function (texto) {
    const n = document.getElementById('v3-toast');
    if (!n) return;
    n.textContent = texto;
    n.hidden = false;
    clearTimeout(UI._toastTimer);
    UI._toastTimer = setTimeout(() => { n.hidden = true; }, 3600);
  };

  UI.fillSelect = function (select, options, value, placeholder) {
    if (!select) return;
    select.innerHTML = (placeholder ? '<option value="">' + U.escape(placeholder) + '</option>' : '')
      + (options || []).map((o) => '<option value="' + U.escape(o.value) + '"'
        + (String(o.value) === String(value) ? ' selected' : '') + '>' + U.escape(o.label) + '</option>').join('');
    if (value != null && select.value !== String(value)) select.value = String(value);
  };

  /* A bolinha colorida da categoria. */
  UI.catDot = function (cor) {
    return el('span', { class: 'v3-ob-ponto', style: { background: cor || '#5fa99b' } });
  };

  global.UI = UI;

  /* O onboarding chama App.goTo quando termina, para levar a pessoa
     ao painel. Na V3 quem navega é o próprio app, por hash. */
  global.App = global.App || {};
  if (!global.App.goTo) {
    global.App.goTo = function (pagina) {
      const mapa = { overview: 'home', transactions: 'transactions', accounts: 'wallet' };
      location.hash = '#' + (mapa[pagina] || pagina || 'home');
      dispatchEvent(new HashChangeEvent('hashchange'));
    };
  }
})(window);
