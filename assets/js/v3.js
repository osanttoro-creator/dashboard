/* =============================================================
   site.js — o pouco de comportamento que a página precisa
   -------------------------------------------------------------
   Quatro coisas: o menu do celular, a linha do cabeçalho ao rolar,
   a revelação dos blocos e o alternador mensal/anual dos planos.

   Sem JavaScript a página continua inteira e legível — a classe
   `anima` no <html> é escrita no <head> justamente para que o CSS
   só esconda o que este arquivo sabe revelar. O preço mensal é o
   que está no HTML, então quem chega sem script vê um preço certo,
   não um espaço vazio.
   ============================================================= */
(function () {
  'use strict';

  /* ---------------- menu do celular ---------------- */

  var topo = document.getElementById('topo');
  var botao = topo && topo.querySelector('.hamburguer');

  if (topo && botao) {
    var fechar = function () {
      topo.classList.remove('aberto');
      botao.setAttribute('aria-expanded', 'false');
      botao.setAttribute('aria-label', 'Abrir menu');
    };

    botao.addEventListener('click', function () {
      var aberto = topo.classList.toggle('aberto');
      botao.setAttribute('aria-expanded', aberto ? 'true' : 'false');
      botao.setAttribute('aria-label', aberto ? 'Fechar menu' : 'Abrir menu');
    });

    /* Escolher um destino fecha o menu: ele cobre o topo da página,
       e ficar aberto sobre a seção recém-aberta é uma porta que não
       se fecha sozinha. */
    topo.addEventListener('click', function (ev) {
      if (ev.target.closest && ev.target.closest('.menu a') && topo.classList.contains('aberto')) fechar();
    });

    document.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape' && topo.classList.contains('aberto')) { fechar(); botao.focus(); }
    });
  }

  /* ---------------- a linha do cabeçalho ---------------- */

  /* O cabeçalho é de vidro e nasce sem borda: a linha só entra
     quando há conteúdo passando por baixo. Antes disso ela seria um
     traço separando o nada. */
  if (topo) {
    var marcar = function () { topo.classList.toggle('rolou', window.scrollY > 8); };
    marcar();
    window.addEventListener('scroll', marcar, { passive: true });
  }

  /* ---------------- mensal × anual ----------------
     Os dois preços moram no HTML, em data-mensal e data-anual. O
     script só troca qual está à mostra: assim não existe um preço
     que só o JavaScript conhece, e o que aparece sem script é o
     mensal, que é o principal. */

  var ciclo = document.querySelector('.ciclo');
  if (ciclo) {
    var botoes = ciclo.querySelectorAll('button[data-ciclo]');
    ciclo.addEventListener('click', function (ev) {
      var b = ev.target.closest && ev.target.closest('button[data-ciclo]');
      if (!b) return;
      var qual = b.dataset.ciclo;
      Array.prototype.forEach.call(botoes, function (x) {
        x.setAttribute('aria-pressed', x === b ? 'true' : 'false');
      });
      document.querySelectorAll('[data-mensal][data-anual]').forEach(function (n) {
        n.textContent = qual === 'anual' ? n.dataset.anual : n.dataset.mensal;
      });
    });
  }

  /* ---------------- revelar ao rolar ---------------- */

  var alvos = document.querySelectorAll('.revela');
  if (!alvos.length) return;

  var querMenos = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!('IntersectionObserver' in window) || querMenos) {
    Array.prototype.forEach.call(alvos, function (n) { n.classList.add('visivel'); });
    return;
  }

  var observador = new IntersectionObserver(function (entradas) {
    entradas.forEach(function (e) {
      if (!e.isIntersecting) return;
      /* Escalonamento curto entre irmãos: o bloco inteiro entrando
         de uma vez lê como salto, não como chegada. */
      var irmaos = e.target.parentElement ? e.target.parentElement.children : [e.target];
      var i = Array.prototype.indexOf.call(irmaos, e.target);
      e.target.style.transitionDelay = Math.min(i, 4) * 70 + 'ms';
      e.target.classList.add('visivel');
      observador.unobserve(e.target);
    });
  }, { rootMargin: '0px 0px -12% 0px', threshold: 0.05 });

  Array.prototype.forEach.call(alvos, function (n) { observador.observe(n); });
})();


/* =============================================================
   O PORTAL
   -------------------------------------------------------------
   Duas contas, e só. Quanto da seção já passou vira --p (0 a 1) no
   palco; quanto do palco dos aparelhos já subiu vira --a, --b e --c.
   Quem desenha é o CSS.

   Tudo sai da POSIÇÃO da rolagem, nunca de um relógio: a abertura
   anda para a frente e para trás na velocidade do dedo de quem lê,
   e nada acontece sozinho enquanto a pessoa está parada lendo.
   ============================================================= */
(function () {
  'use strict';

  var menos = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (menos) return;

  var portal = document.querySelector('[data-portal]');
  var palco = portal && portal.querySelector('.portal-palco');
  /* DOIS PALCOS, NÃO UM
     O do herói vive dentro do portal e segue a abertura dele; o da
     seção "no bolso e na mesa" está solto na página e segue a
     própria posição na tela. Tratar os dois pelo mesmo caminho foi o
     que deixou o segundo parado: ele herdava um progresso que, fora
     do portal, nunca mudava. */
  var cena = document.querySelector('.portal [data-palco3]');
  var cenas = Array.prototype.slice.call(document.querySelectorAll('[data-palco3]'))
    .filter(function (n) { return n !== cena; });
  if (!portal && !cena && !cenas.length) return;

  var fase = function (p, de, ate) { return Math.max(0, Math.min(1, (p - de) / (ate - de))); };
  var suave = function (t) { return 1 - Math.pow(1 - t, 3); };

  var pedido = 0;

  var desenhar = function () {
    pedido = 0;

    if (palco) {
      var curso = Math.max(1, portal.offsetHeight - window.innerHeight);
      var andado = window.scrollY - portal.offsetTop;
      var p = Math.max(0, Math.min(1, andado / curso));
      /* power2.out: abre com vontade no primeiro gesto e assenta no
         fim. Linear faria a abertura parecer uma persiana elétrica. */
      palco.style.setProperty('--p', (1 - Math.pow(1 - p, 2)).toFixed(4));
    }

    if (cena) {
      /* A CENA SEGUE O PORTAL, E NÃO A PRÓPRIA POSIÇÃO NA TELA
         A primeira versão media onde a cena estava na janela. Só que
         ela mora DENTRO do palco fixo: assim que o portal abre, o
         palco para de subir e o retângulo da cena congela — o
         notebook entrava, o tablet entrava pela metade e o celular
         nunca aparecia, sem erro nenhum no console. Medido: --c
         travava em 0,00 com o portal já aberto.

         Agora as três fases saem da abertura do portal. Fora dele,
         quando não há portal (menos movimento), o CSS já deixa tudo
         em 1. As fases se sobrepõem de propósito: o tablet começa a
         chegar antes de a tampa terminar de abrir, e o celular antes
         de o tablet assentar — sem sobreposição a cena para num
         quadro morto entre um aparelho e o outro. */
      var q = palco ? parseFloat(palco.style.getPropertyValue('--p')) || 0 : 1;
      cena.style.setProperty('--a', suave(fase(q, 0.30, 0.60)).toFixed(4));
      cena.style.setProperty('--b', suave(fase(q, 0.44, 0.76)).toFixed(4));
      cena.style.setProperty('--c', suave(fase(q, 0.58, 0.92)).toFixed(4));
    }

    desenharSoltos();
  };

  /* Os palcos soltos seguem a própria subida na tela. */
  var desenharSoltos = function () {
    cenas.forEach(function (n) {
      var r = n.getBoundingClientRect();
      var total = window.innerHeight + r.height;
      var q = total > 0 ? Math.max(0, Math.min(1, (window.innerHeight - r.top) / total)) : 1;
      n.style.setProperty('--a', suave(fase(q, 0.16, 0.52)).toFixed(4));
      n.style.setProperty('--b', suave(fase(q, 0.28, 0.64)).toFixed(4));
      n.style.setProperty('--c', suave(fase(q, 0.34, 0.72)).toFixed(4));
    });
  };

  var pedir = function () {
    if (pedido) return;
    pedido = requestAnimationFrame(desenhar);
  };

  window.addEventListener('scroll', pedir, { passive: true });
  window.addEventListener('resize', pedir);

  /* Quem chega pelo teclado e tabula para dentro do herói não pode
     ficar preso atrás dos painéis. */
  if (portal) {
    portal.addEventListener('focusin', function () {
      if (palco) palco.style.setProperty('--p', '1');
    });
  }

  /* ---- os quadros do celular ----
     Um relógio só, e ele só troca quando a cena está em quadro e a
     aba está visível: revezar fora de vista é bateria jogada fora. */
  /* Um relógio por celular da página, e cada um só troca quando o
     próprio aparelho está em quadro: revezar fora de vista é bateria
     jogada fora, e em celular isso se sente. */
  document.querySelectorAll('[data-palco3]').forEach(function (p) {
    var quadros = p.querySelectorAll('.ap-fone .quadro');
    if (quadros.length < 2) return;
    var i = 0;
    setInterval(function () {
      if (document.hidden) return;
      var r2 = p.getBoundingClientRect();
      if (r2.bottom < 0 || r2.top > window.innerHeight) return;
      i = (i + 1) % quadros.length;
      Array.prototype.forEach.call(quadros, function (q, k) {
        q.classList.toggle('is-ativo', k === i);
      });
    }, 3000);
  });

  desenhar();
})();
