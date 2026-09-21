/* =============================================================
   contato.js — o formulário da página de suporte
   -------------------------------------------------------------
   Manda nome, e-mail e mensagem para a função oaze-contato, que
   GRAVA no Supabase antes de tentar o e-mail. Por isso "recebido"
   é verdade mesmo quando o correio falha: a mensagem está no banco.

   Sem biblioteca do Supabase: é um POST simples. A função é
   pública (verify_jwt = false) e se protege pela origem, pelo
   limite de envio e pelo campo-isca — ver o cabeçalho dela.

   O MESMO ARQUIVO NAS QUATRO LÍNGUAS
   As páginas em inglês, francês e espanhol são geradas a partir da
   em português (tools/gen-idiomas.js), mas este script é um só. As
   frases que ele escreve na tela saem da tabela abaixo, pela
   língua da página; o que estiver faltando cai no português.
   ============================================================= */
(function () {
  'use strict';

  var IDIOMA = (document.documentElement.lang || 'pt').slice(0, 2).toLowerCase();
  var FRASES = {
    'Enviando…': { en: 'Sending…', fr: 'Envoi…', es: 'Enviando…' },
    'Enviar mensagem': { en: 'Send message', fr: 'Envoyer le message', es: 'Enviar mensaje' },
    'Mensagem recebida. Respondemos no e-mail que você informou.': {
      en: 'Message received. We will reply to the email you entered.',
      fr: 'Message reçu. Nous répondrons à l’adresse e-mail indiquée.',
      es: 'Mensaje recibido. Responderemos al correo que indicaste.'
    },
    'Protocolo': { en: 'Reference', fr: 'Référence', es: 'Protocolo' },
    'Muitas mensagens em pouco tempo. Tente de novo daqui a alguns minutos.': {
      en: 'Too many messages in a short time. Please try again in a few minutes.',
      fr: 'Trop de messages en peu de temps. Réessayez dans quelques minutes.',
      es: 'Demasiados mensajes en poco tiempo. Vuelve a intentarlo en unos minutos.'
    },
    'Não foi possível enviar agora. Verifique a conexão e tente de novo.': {
      en: 'Could not send right now. Check your connection and try again.',
      fr: 'Envoi impossible pour le moment. Vérifiez la connexion et réessayez.',
      es: 'No se pudo enviar ahora. Revisa la conexión e inténtalo de nuevo.'
    },
    'Confira os campos marcados.': {
      en: 'Please check the highlighted fields.',
      fr: 'Vérifiez les champs signalés.',
      es: 'Revisa los campos marcados.'
    }
  };
  function t(pt) {
    var e = FRASES[pt];
    return (e && e[IDIOMA]) || pt;
  }

  /* O endereço da função vem do mesmo projeto das outras páginas;
     sem ele o formulário não teria para onde ir. */
  var PROJETO = 'https://gxwatircdhhetvzzlwwq.supabase.co';
  var ROTA = PROJETO + '/functions/v1/oaze-contato';
  var EMAIL = /^[^\s@<>"]{1,64}@[^\s@<>"]{1,190}\.[a-z]{2,}$/i;

  function iniciar() {
    var form = document.getElementById('formContato');
    if (!form) return;
    var nome = document.getElementById('contatoNome');
    var email = document.getElementById('contatoEmail');
    var msg = document.getElementById('contatoMensagem');
    var isca = document.getElementById('contatoSite');
    var botao = document.getElementById('contatoEnviar');
    var recado = document.getElementById('contatoRecado');

    function marca(campo, idErro, invalido) {
      campo.setAttribute('aria-invalid', invalido ? 'true' : 'false');
      var e = document.getElementById(idErro);
      if (e) e.hidden = !invalido;
      if (invalido) campo.setAttribute('aria-describedby', idErro);
      else if (campo === email) campo.setAttribute('aria-describedby', 'contatoEmailDica');
      else campo.removeAttribute('aria-describedby');
    }

    function avisa(texto, tipo) {
      recado.textContent = texto;
      recado.className = 'recado' + (tipo ? ' recado-' + tipo : '');
      recado.hidden = !texto;
    }

    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      avisa('', '');
      var nv = nome.value.trim(), ev2 = email.value.trim(), mv = msg.value.trim();
      var erroNome = !nv, erroEmail = !EMAIL.test(ev2), erroMsg = mv.length < 10;
      marca(nome, 'contatoNomeErro', erroNome);
      marca(email, 'contatoEmailErro', erroEmail);
      marca(msg, 'contatoMensagemErro', erroMsg);
      if (erroNome || erroEmail || erroMsg) {
        avisa(t('Confira os campos marcados.'), 'erro');
        (erroNome ? nome : erroEmail ? email : msg).focus();
        return;
      }

      botao.disabled = true;
      botao.setAttribute('aria-busy', 'true');
      botao.textContent = t('Enviando…');

      fetch(ROTA, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nome: nv, email: ev2, mensagem: mv, site: isca ? isca.value : '',
          idioma: IDIOMA, pagina: location.pathname
        })
      }).then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (d) { return { status: r.status, d: d }; });
      }).then(function (res) {
        if (res.status === 200 && res.d && res.d.ok) {
          form.reset();
          [nome, email, msg].forEach(function (c) { c.setAttribute('aria-invalid', 'false'); });
          avisa(t('Mensagem recebida. Respondemos no e-mail que você informou.') +
            (res.d.protocolo ? ' ' + t('Protocolo') + ': ' + res.d.protocolo + '.' : ''), 'ok');
        } else if (res.status === 429) {
          avisa(t('Muitas mensagens em pouco tempo. Tente de novo daqui a alguns minutos.'), 'erro');
        } else if (res.status === 400 && res.d && res.d.campos) {
          marca(nome, 'contatoNomeErro', res.d.campos.indexOf('nome') >= 0);
          marca(email, 'contatoEmailErro', res.d.campos.indexOf('email') >= 0);
          marca(msg, 'contatoMensagemErro', res.d.campos.indexOf('mensagem') >= 0);
          avisa(t('Confira os campos marcados.'), 'erro');
        } else {
          avisa(t('Não foi possível enviar agora. Verifique a conexão e tente de novo.'), 'erro');
        }
      }).catch(function () {
        avisa(t('Não foi possível enviar agora. Verifique a conexão e tente de novo.'), 'erro');
      }).then(function () {
        botao.disabled = false;
        botao.removeAttribute('aria-busy');
        botao.textContent = t('Enviar mensagem');
      });
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();
})();
