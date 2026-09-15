/* =============================================================
   narrativa.js — o movimento da página inicial, capítulo a capítulo
   -------------------------------------------------------------
   Cinco coisas, e nenhuma é necessária para ler a página:

     1. CENAS      cada visual toca só enquanto aparece na tela;
     2. NÚMEROS    os números grandes contam até o valor real;
     3. UGLEZ      a pergunta, o pensamento e a resposta, em ciclo;
     4. TELAS      notebook, tablet e celular presos à rolagem;
     5. BENTO      luz e inclinação que seguem o ponteiro nos
                   destaques — o MagicBento, contido.

   SEM ESTE ARQUIVO, A PÁGINA APARECE INTEIRA. O CSS só esconde o que
   vai animar debaixo da classe `.cenas`, e é este arquivo que a põe no
   <html>. Script bloqueado, erro de rede ou navegador sem
   IntersectionObserver: nada some.

   MENOS MOVIMENTO não é "o mesmo, mais devagar". Quem pede menos
   movimento recebe o estado final parado: números no valor, resposta
   escrita, cartões sem inclinação.

   DO MAGICBENTO, O QUE FICOU E O QUE SAIU
   Ficaram a luz que segue o ponteiro, o contorno que acende e a onda
   do clique. A inclinação ficou em 4°, não 8. Saíram o magnetismo —
   cartão que foge do cursor é alvo que se mexe — e as estrelas em
   todos os cartões: na identidade v1, só o UGLEZ emite luz, então a
   poeira existe só no cartão dele, em azul-royal.
   ============================================================= */
(function () {
  'use strict';

  if (!('IntersectionObserver' in window)) return;

  var raiz = document.documentElement;
  var mm = function (q) { return !!(window.matchMedia && window.matchMedia(q).matches); };
  var menosMovimento = mm('(prefers-reduced-motion: reduce)');
  var semPonteiroFino = mm('(hover: none), (pointer: coarse)');

  raiz.classList.add('cenas');

  /* ---------------------------------------------------------------
     1 · cenas
     --------------------------------------------------------------- */
  var aoEntrar = {};
  var aoSair = {};

  var obsCena = new IntersectionObserver(function (entradas) {
    entradas.forEach(function (e) {
      var cena = e.target;
      var dentro = e.isIntersecting;
      if (cena.classList.contains('em-cena') === dentro) return;
      cena.classList.toggle('em-cena', dentro);
      var fn = dentro ? aoEntrar[cena.id] : aoSair[cena.id];
      if (fn) fn(cena);
    });
  }, { threshold: 0.22 });

  Array.prototype.forEach.call(document.querySelectorAll('[data-cena]'), function (c) {
    obsCena.observe(c);
  });

  /* O cabeçalho sobre os capítulos claros. A faixa observada é a
     do próprio cabeçalho, no topo da janela: um capítulo claro que
     passa por ali liga a classe; nenhum, desliga. Em porcentagem, e
     não em pixels, para não precisar recalcular ao girar o celular. */
  var topo = document.querySelector('.topo');
  var claros = document.querySelectorAll('.cap-areia');
  if (topo && claros.length) {
    var sobre = new Set();
    var obsTopo = new IntersectionObserver(function (entradas) {
      entradas.forEach(function (e) {
        if (e.isIntersecting) sobre.add(e.target); else sobre.delete(e.target);
      });
      topo.classList.toggle('sobre-claro', sobre.size > 0);
    }, { rootMargin: '0px 0px -92% 0px' });
    Array.prototype.forEach.call(claros, function (c) { obsTopo.observe(c); });
  }

  /* ---------------------------------------------------------------
     2 · números que contam
     ---------------------------------------------------------------
     O valor real já está no HTML: leitor de tela e buscador leem 41,
     não 0. A contagem só reescreve o texto por um instante, e uma vez
     só — contar de novo a cada rolagem vira tique. */
  var obsNumero = new IntersectionObserver(function (entradas) {
    entradas.forEach(function (e) {
      if (!e.isIntersecting) return;
      obsNumero.unobserve(e.target);
      contar(e.target);
    });
  }, { threshold: 0.6 });

  function contar(el) {
    var alvo = parseInt(el.getAttribute('data-conta'), 10);
    if (!alvo || menosMovimento) return;
    var inicio = null;
    var duracao = 900;
    var quadro = function (agora) {
      if (inicio === null) inicio = agora;
      var t = Math.min(1, (agora - inicio) / duracao);
      var suave = 1 - Math.pow(1 - t, 3);
      el.textContent = String(Math.round(alvo * suave));
      if (t < 1) requestAnimationFrame(quadro);
      else el.textContent = String(alvo);
    };
    requestAnimationFrame(quadro);
  }

  Array.prototype.forEach.call(document.querySelectorAll('[data-conta]'), function (el) {
    obsNumero.observe(el);
  });

  /* ---------------------------------------------------------------
     3 · UGLEZ: pergunta, pensamento, resposta
     ---------------------------------------------------------------
     O ciclo espelha o que o assistente faz de verdade, na ordem dos
     estados do uglez-particulas.js: recebendo → pensando →
     respondendo → sucesso → repouso. A resposta nasce escrita no HTML
     e só é apagada para ser digitada de novo; sem este script, ela
     continua lá, inteira. */
  var capUglez = document.getElementById('uglez');
  var caixaOrbe = capUglez && capUglez.querySelector('[data-uglez-orbe]');
  var pergunta = capUglez && capUglez.querySelector('.v-pergunta');
  var resposta = capUglez && capUglez.querySelector('.v-resposta');
  var textoResposta = resposta ? resposta.textContent.trim() : '';
  var orbe = null;
  var relogios = [];
  var rodando = false;

  var depois = function (ms, fn) { relogios.push(setTimeout(fn, ms)); };
  var limparRelogios = function () { relogios.forEach(clearTimeout); relogios = []; };

  function ciclo() {
    if (!rodando || !resposta) return;
    limparRelogios();
    pergunta.classList.remove('visivel');
    resposta.classList.remove('visivel');
    resposta.textContent = '';
    if (orbe) orbe.estado('repouso');

    depois(500, function () {
      pergunta.classList.add('visivel');
      if (orbe) orbe.estado('recebendo');
    });
    depois(1500, function () { if (orbe) orbe.estado('pensando'); });
    depois(2900, function () {
      if (orbe) { orbe.estado('respondendo'); orbe.onda(); }
      resposta.classList.add('visivel');
      digitar(0);
    });
  }

  function digitar(i) {
    if (!rodando) return;
    resposta.textContent = textoResposta.slice(0, i);
    if (i < textoResposta.length) {
      /* Pausa curta depois de pontuação: lê como frase, não como fita. */
      var ch = textoResposta.charAt(i - 1);
      depois(/[.,—]/.test(ch) ? 190 : 18, function () { digitar(i + 1); });
      return;
    }
    if (orbe) { orbe.estado('sucesso'); orbe.pulsar(); }
    depois(1400, function () { if (orbe) orbe.estado('repouso'); });
    depois(6200, ciclo);
  }

  if (capUglez) {
    aoEntrar.uglez = function () {
      if (!orbe && caixaOrbe && window.UglezParticulas) {
        orbe = window.UglezParticulas.montar(caixaOrbe, { estado: 'repouso' });
      }
      if (menosMovimento) {
        pergunta.classList.add('visivel');
        resposta.classList.add('visivel');
        resposta.textContent = textoResposta;
        return;
      }
      rodando = true;
      ciclo();
    };
    aoSair.uglez = function () {
      rodando = false;
      limparRelogios();
      /* Fora da tela, a resposta volta inteira: quem voltar rolando
         encontra o texto, e o ciclo recomeça do início ao reentrar. */
      if (resposta) resposta.textContent = textoResposta;
    };
  }

  /* ---------------------------------------------------------------
     4 · em todas as telas
     ---------------------------------------------------------------
     A seção fica presa enquanto a página rola por ela, e o quanto já
     rolou vira quatro variáveis de CSS. As fases se sobrepõem de
     propósito: o tablet chega enquanto o notebook termina de abrir,
     para a cena nunca parar num quadro vazio.

     Só calcula enquanto a seção está na tela. Com menos movimento, a
     classe .is-viva nunca entra e a composição final fica parada. */
  var telas = document.querySelector('[data-telas]');
  if (telas && !menosMovimento) {
    telas.classList.add('is-viva');
    var passos = telas.querySelectorAll('[data-passo]');
    var quadrosTablet = telas.querySelectorAll('.tablet .tela-quadro');
    var quadrosCelular = telas.querySelectorAll('.celular .tela-quadro');
    var fase = function (p, de, ate) { return Math.max(0, Math.min(1, (p - de) / (ate - de))); };
    var suave = function (t) { return 1 - Math.pow(1 - t, 3); };
    var ativa = function (lista, i) {
      Array.prototype.forEach.call(lista, function (q, k) { q.classList.toggle('is-ativo', k === i); });
    };
    var pedidoTelas = 0;
    var visivelTelas = false;

    var desenhar = function () {
      pedidoTelas = 0;
      var r = telas.getBoundingClientRect();
      var curso = r.height - window.innerHeight;
      var p = curso > 0 ? Math.max(0, Math.min(1, -r.top / curso)) : 1;

      telas.style.setProperty('--a', suave(fase(p, 0, 0.26)).toFixed(4));
      telas.style.setProperty('--b', suave(fase(p, 0.2, 0.46)).toFixed(4));
      telas.style.setProperty('--c', suave(fase(p, 0.34, 0.6)).toFixed(4));
      telas.style.setProperty('--s', fase(p, 0.28, 0.95).toFixed(4));

      var passo = p < 0.3 ? 0 : p < 0.52 ? 1 : 2;
      Array.prototype.forEach.call(passos, function (li) {
        li.classList.toggle('is-agora', +li.getAttribute('data-passo') === passo);
      });
      ativa(quadrosTablet, p < 0.66 ? 0 : 1);
      ativa(quadrosCelular, p < 0.62 ? 0 : p < 0.82 ? 1 : 2);
    };
    var pedir = function () { if (visivelTelas && !pedidoTelas) pedidoTelas = requestAnimationFrame(desenhar); };

    new IntersectionObserver(function (entradas) {
      visivelTelas = entradas[0].isIntersecting;
      if (visivelTelas) pedir();
    }).observe(telas);
    window.addEventListener('scroll', pedir, { passive: true });
    window.addEventListener('resize', pedir);
    desenhar();
  }

  /* ---------------------------------------------------------------
     5 · bento
     --------------------------------------------------------------- */
  var bento = document.querySelector('[data-bento]');
  if (bento && !semPonteiroFino && !menosMovimento) {
    var cartoes = Array.prototype.slice.call(bento.querySelectorAll('.bento-card > a'));
    var ultimoEvento = null;
    var pedido = 0;

    var atualizar = function () {
      pedido = 0;
      var ev = ultimoEvento;
      cartoes.forEach(function (a) {
        var r = a.getBoundingClientRect();
        var x = ev.clientX - r.left;
        var y = ev.clientY - r.top;
        a.style.setProperty('--mx', x.toFixed(0) + 'px');
        a.style.setProperty('--my', y.toFixed(0) + 'px');
        var dentro = x >= 0 && y >= 0 && x <= r.width && y <= r.height;
        if (dentro) {
          a.style.setProperty('--rx', (((y / r.height) - 0.5) * -4).toFixed(2) + 'deg');
          a.style.setProperty('--ry', (((x / r.width) - 0.5) * 4).toFixed(2) + 'deg');
        } else {
          a.style.removeProperty('--rx');
          a.style.removeProperty('--ry');
        }
      });
    };

    bento.addEventListener('pointermove', function (ev) {
      ultimoEvento = ev;
      if (!pedido) pedido = requestAnimationFrame(atualizar);
    });

    bento.addEventListener('pointerleave', function () {
      cartoes.forEach(function (a) {
        a.style.removeProperty('--rx');
        a.style.removeProperty('--ry');
      });
    });

    bento.addEventListener('pointerdown', function (ev) {
      var a = ev.target.closest && ev.target.closest('.bento-card > a');
      if (!a) return;
      var r = a.getBoundingClientRect();
      var onda = document.createElement('span');
      onda.className = 'bento-onda';
      onda.setAttribute('aria-hidden', 'true');
      onda.style.left = (ev.clientX - r.left) + 'px';
      onda.style.top = (ev.clientY - r.top) + 'px';
      a.appendChild(onda);
      onda.addEventListener('animationend', function () { onda.remove(); });
    });
  }
})();
