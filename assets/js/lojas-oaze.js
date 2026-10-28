/* Preencha somente depois de conferir a ficha pública oficial de cada loja.
   Sem URL verificada, os controles continuam desabilitados. */
(function () {
  'use strict';

  var urls = {
    play: '',
    windows: ''
  };
  var padroes = {
    play: /^https:\/\/play\.google\.com\/store\/apps\/details\?(?:[^#]*&)?id=[\w.]+(?:&|$)/i,
    windows: /^https:\/\/(?:apps\.microsoft\.com\/detail\/|www\.microsoft\.com\/store\/apps\/)[\w.-]+(?:[/?#]|$)/i
  };

  Object.keys(urls).forEach(function (loja) {
    var botao = document.querySelector('[data-loja="' + loja + '"]');
    var url = urls[loja];
    if (!botao || !url || !padroes[loja].test(url)) return;

    var card = botao.closest('.loja-cartao');
    var link = document.createElement('a');
    link.href = url;
    link.className = botao.className.replace(/\bis-pending\b/g, '').trim();
    link.textContent = card.querySelector('.loja-link-label').textContent;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    botao.replaceWith(link);

    var descricao = card.querySelector('p');
    if (descricao) descricao.textContent = card.querySelector('.loja-ready-copy').textContent;
  });
})();
