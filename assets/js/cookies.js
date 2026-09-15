/* Preferências de cookies e tecnologias equivalentes.
   Hoje o OAZE não carrega analytics, publicidade nem personalização
   opcional. A escolha já fica pronta para impedir essas categorias
   antes que qualquer integração futura seja iniciada. */
(function () {
  'use strict';
  var CHAVE = 'oaze.cookies.v2';

  function aplicar(valor) {
    document.documentElement.setAttribute('data-oaze-cookies', valor);
    window.dispatchEvent(new CustomEvent('oaze:preferencias-cookies', {
      detail: { opcionais: valor === 'aceitos' }
    }));
  }

  function salvar(valor, aviso) {
    try { localStorage.setItem(CHAVE, valor); } catch (e) {}
    aplicar(valor);
    aviso.remove();
  }

  function iniciar() {
    try {
      var salvo = localStorage.getItem(CHAVE);
      if (salvo === 'aceitos' || salvo === 'recusados') {
        aplicar(salvo);
        return;
      }
    } catch (e) {}

    var aviso = document.createElement('section');
    aviso.className = 'aviso-cookies';
    aviso.setAttribute('role', 'region');
    aviso.setAttribute('aria-label', 'Aviso de cookies e armazenamento');

    var texto = document.createElement('p');
    texto.appendChild(document.createTextNode(
      'O OAZE usa armazenamento necessário para sessão, segurança, preferências e funcionamento local. Hoje não usamos analytics nem publicidade. Escolha se futuras tecnologias opcionais poderão ser ativadas. '
    ));
    var politica = document.createElement('a');
    politica.href = '/privacidade#cookies';
    politica.textContent = 'Ver política de cookies';
    texto.appendChild(politica);

    var acoes = document.createElement('div');
    acoes.className = 'aviso-cookies-acoes';

    var recusar = document.createElement('button');
    recusar.type = 'button';
    recusar.className = 'aviso-cookies-botao aviso-cookies-recusar';
    recusar.textContent = 'Recusar opcionais';
    recusar.addEventListener('click', function () {
      salvar('recusados', aviso);
    });

    var aceitar = document.createElement('button');
    aceitar.type = 'button';
    aceitar.className = 'aviso-cookies-botao aviso-cookies-aceitar';
    aceitar.textContent = 'Aceitar opcionais';
    aceitar.addEventListener('click', function () {
      salvar('aceitos', aviso);
    });

    acoes.appendChild(recusar);
    acoes.appendChild(aceitar);
    aviso.appendChild(texto);
    aviso.appendChild(acoes);
    document.body.appendChild(aviso);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();
})();
