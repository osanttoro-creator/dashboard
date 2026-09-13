/* Aviso de armazenamento essencial. O OAZE não ativa publicidade
   nem analytics; por isso há ciência, não um falso botão de recusa
   que quebraria sessão, tema e dados locais. */
(function () {
  'use strict';
  var CHAVE = 'oaze.aviso-cookies.v1';

  function iniciar() {
    try { if (localStorage.getItem(CHAVE) === 'aceito') return; } catch (e) {}

    var aviso = document.createElement('section');
    aviso.className = 'aviso-cookies';
    aviso.setAttribute('role', 'region');
    aviso.setAttribute('aria-label', 'Aviso de cookies e armazenamento');

    var texto = document.createElement('p');
    texto.appendChild(document.createTextNode(
      'O OAZE usa cookies e armazenamento essenciais para manter sua sessão, preferências e dados locais. Não usamos cookies de publicidade. '
    ));
    var politica = document.createElement('a');
    politica.href = '/privacidade#local';
    politica.textContent = 'Entenda o que fica no aparelho';
    texto.appendChild(politica);

    var botao = document.createElement('button');
    botao.type = 'button';
    botao.className = 'aviso-cookies-aceitar';
    botao.textContent = 'Entendi';
    botao.addEventListener('click', function () {
      try { localStorage.setItem(CHAVE, 'aceito'); } catch (e) {}
      aviso.remove();
    });

    aviso.appendChild(texto);
    aviso.appendChild(botao);
    document.body.appendChild(aviso);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();
})();
