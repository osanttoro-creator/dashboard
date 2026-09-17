/* Preferências de cookies e tecnologias equivalentes.
   Hoje o OAZE não carrega analytics, publicidade nem personalização
   opcional. A escolha já fica pronta para impedir essas categorias
   antes que qualquer integração futura seja iniciada. */
(function () {
  'use strict';

  /* =============================================================
     O AVISO FALA A LÍNGUA DA PÁGINA
     -------------------------------------------------------------
     As páginas em inglês, francês e espanhol são geradas a partir
     das em português (tools/gen-idiomas.js), mas este arquivo é o
     MESMO nas quatro. Sem esta tabela, um visitante do /en lia a
     página inteira em inglês e recebia o aviso de cookies em
     português — que é justamente o texto que a lei exige que se
     entenda. A chave é a frase em português; quem não tiver
     tradução cai nela de volta. */
  var IDIOMA = (document.documentElement.lang || 'pt').slice(0, 2).toLowerCase();
  var FRASES = {
    'Aviso de cookies e armazenamento': {
      en: 'Cookie and storage notice', fr: 'Avis sur les cookies et le stockage', es: 'Aviso de cookies y almacenamiento'
    },
    'O OAZE usa armazenamento necessário para sessão, segurança, preferências e funcionamento local. Hoje não usamos analytics nem publicidade. Escolha se futuras tecnologias opcionais poderão ser ativadas. ': {
      en: 'OAZE uses storage that is necessary for the session, security, preferences and local operation. Today we use no analytics and no advertising. Choose whether future optional technologies may be enabled. ',
      fr: 'OAZE utilise le stockage nécessaire à la session, à la sécurité, aux préférences et au fonctionnement local. Aujourd\'hui, nous n\'utilisons ni analytique ni publicité. Choisissez si de futures technologies optionnelles pourront être activées. ',
      es: 'OAZE usa almacenamiento necesario para la sesión, la seguridad, las preferencias y el funcionamiento local. Hoy no usamos analytics ni publicidad. Elige si en el futuro podrán activarse tecnologías opcionales. '
    },
    'Ver política de cookies': {
      en: 'See the cookie policy', fr: 'Voir la politique de cookies', es: 'Ver la política de cookies'
    },
    'Recusar opcionais': {
      en: 'Refuse optional', fr: 'Refuser les optionnels', es: 'Rechazar opcionales'
    },
    'Aceitar opcionais': {
      en: 'Accept optional', fr: 'Accepter les optionnels', es: 'Aceptar opcionales'
    }
  };
  function t(pt) {
    var e = FRASES[pt];
    return (e && e[IDIOMA]) || pt;
  }
  /* o link da política também é por idioma */
  function comIdioma(rota) {
    return IDIOMA === 'pt' ? rota : '/' + IDIOMA + rota;
  }
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
    aviso.setAttribute('aria-label', t('Aviso de cookies e armazenamento'));

    var texto = document.createElement('p');
    texto.appendChild(document.createTextNode(
      t('O OAZE usa armazenamento necessário para sessão, segurança, preferências e funcionamento local. Hoje não usamos analytics nem publicidade. Escolha se futuras tecnologias opcionais poderão ser ativadas. ')
    ));
    var politica = document.createElement('a');
    politica.href = comIdioma('/privacidade') + '#cookies';
    politica.textContent = t('Ver política de cookies');
    texto.appendChild(politica);

    var acoes = document.createElement('div');
    acoes.className = 'aviso-cookies-acoes';

    var recusar = document.createElement('button');
    recusar.type = 'button';
    recusar.className = 'aviso-cookies-botao aviso-cookies-recusar';
    recusar.textContent = t('Recusar opcionais');
    recusar.addEventListener('click', function () {
      salvar('recusados', aviso);
    });

    var aceitar = document.createElement('button');
    aceitar.type = 'button';
    aceitar.className = 'aviso-cookies-botao aviso-cookies-aceitar';
    aceitar.textContent = t('Aceitar opcionais');
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
