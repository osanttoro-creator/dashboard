/* =============================================================
   site.js — o pouco de JavaScript que o site público usa
   -------------------------------------------------------------
   REGRA DESTE ARQUIVO: ele não sabe que existe um app.
   Não lê nem escreve localStorage, não conhece Store, Calc, App
   nem Supabase. Nada aqui depende de haver sessão, e nada aqui
   deixa rastro no aparelho de quem só está lendo a página.

   Isso não é purismo. O site é a primeira coisa que um estranho
   abre; ele não deve carregar 12 mil linhas de painel financeiro
   nem gravar nada antes de a pessoa decidir se quer uma conta.

   Tudo aqui é progressivo: sem JavaScript a página continua
   legível e navegável. O menu do celular é a única coisa que
   depende dele, e por isso ele é escrito no HTML já fechado, com
   o estado real no atributo -- não numa variável de módulo.
   ============================================================= */
(function () {
  'use strict';

  var menosMovimento = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------------------------------------------------------------
     0 · abertura com lente
     ---------------------------------------------------------------
     O mundo colorido existe inteiro desde o primeiro byte. Uma
     camada preta por cima recebe um furo circular cujo raio cresce
     de 0 a 150% do maior lado da tela conforme o scroll. Sem JS ou
     com movimento reduzido, a camada nem aparece e o conteúdo segue
     imediatamente legível e clicável.

     Sobre o preto, o "hello" se escreve sozinho, à mão, assim que a
     página abre. Não depende de rolar: quem não rola também precisa
     ver alguma coisa acontecer. Rolar é o que o faz passar -- ele
     cresce um pouco e se apaga enquanto a lente abre, como se a
     câmera atravessasse a palavra. */
  var lente = document.querySelector('[data-lens]');

  if (lente && !menosMovimento) {
    /* Avisa o CSS que há script vivo. Sem este aviso a cortina se
       recolhe sozinha em 4 s (ver site.css), para o título nunca
       ficar preso atrás do preto. */
    document.documentElement.classList.add('lente-viva');

    var saudacao = lente.querySelector('.lens-greeting');
    var traco = lente.querySelector('.hello-traco');

    if (saudacao && traco && traco.getTotalLength) {
      /* O comprimento real, e não pathLength="1": o Safari levou anos
         para respeitar pathLength no tracejado, e sem isso o hello
         viraria uma linha pontilhada. O tracejado é posto antes da
         primeira pintura, então o traço não pisca inteiro. */
      var comprimento = traco.getTotalLength();
      traco.style.strokeDasharray = comprimento + ' ' + (comprimento * 2);
      traco.style.strokeDashoffset = String(comprimento);

      var ATRASO = 350, DURACAO = 2600, inicio = null;
      var escrever = function (agora) {
        if (inicio === null) inicio = agora;
        var t = Math.max(0, Math.min(1, (agora - inicio - ATRASO) / DURACAO));
        /* ease-in-out: a caneta arranca devagar, corre no meio e pousa
           devagar -- o ritmo de quem escreve, não o de uma máquina */
        var e = t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
        traco.style.strokeDashoffset = (comprimento * (1 - e)).toFixed(2);
        if (t < 1) window.requestAnimationFrame(escrever);
        else saudacao.classList.add('escrito');
      };
      window.requestAnimationFrame(escrever);
    }

    var quadroLentePendente = false;

    var atualizarLente = function () {
      var faixa = Math.max(1, lente.offsetHeight - window.innerHeight);
      var percorrido = window.scrollY - lente.offsetTop;
      var progresso = Math.max(0, Math.min(1, percorrido / faixa));
      var suavizado = 1 - Math.pow(1 - progresso, 4); /* power4.out */
      var raio = Math.max(window.innerWidth, window.innerHeight) * 1.5 * suavizado;
      /* O hello some nos primeiros 10% da rolagem. Com mais que isso,
         a lente (que abre rápido no começo) já mostrava a página
         enquanto ainda sobrava um pedaço do hello na tela. A máscara
         no CSS garante que ele nunca fica POR CIMA da página; este
         prazo curto garante que ele nem divide a tela com ela. */
      var passagem = Math.min(1, progresso / .1);

      lente.style.setProperty('--lens-radius', raio.toFixed(1) + 'px');
      lente.style.setProperty('--lens-progress', suavizado.toFixed(4));
      lente.style.setProperty('--hello-opacity', (1 - passagem).toFixed(3));
      lente.style.setProperty('--hello-scale', (1 + passagem * .16).toFixed(4));
      quadroLentePendente = false;
    };

    var pedirQuadroLente = function () {
      if (quadroLentePendente) return;
      quadroLentePendente = true;
      window.requestAnimationFrame(atualizarLente);
    };

    window.addEventListener('scroll', pedirQuadroLente, { passive: true });
    window.addEventListener('resize', pedirQuadroLente);
    lente.addEventListener('focusin', function (e) {
      if (e.target.closest && e.target.closest('a, button, input, select, textarea')) {
        lente.classList.add('keyboard-reveal');
      }
    });
    atualizarLente();
  } else if (lente) {
    document.documentElement.classList.remove('lens-js');
  }

  /* ---------------------------------------------------------------
     1 · menu no celular
     --------------------------------------------------------------- */
  var topo = document.querySelector('.topo');
  var botaoMenu = document.querySelector('.hamburguer');

  if (topo && botaoMenu) {
    botaoMenu.addEventListener('click', function () {
      var aberto = topo.classList.toggle('aberto');
      /* O estado vive no DOM, não numa variável: assim o leitor de
         tela e o CSS leem a mesma verdade, e não há como as duas
         divergirem depois de um redimensionamento. */
      botaoMenu.setAttribute('aria-expanded', aberto ? 'true' : 'false');
      botaoMenu.setAttribute('aria-label', aberto ? 'Fechar menu' : 'Abrir menu');
    });

    /* Escape fecha e devolve o foco ao botão. Sem devolver o foco,
       quem navega por teclado fica com o cursor num menu que não
       está mais na tela. */
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && topo.classList.contains('aberto')) {
        topo.classList.remove('aberto');
        botaoMenu.setAttribute('aria-expanded', 'false');
        botaoMenu.focus();
      }
    });

    /* Clicar num link do menu fecha a folha. Sem isto, ao pular para
       uma âncora o menu continua aberto cobrindo o destino. */
    topo.addEventListener('click', function (e) {
      var a = e.target.closest && e.target.closest('.menu a, .acoes-topo a');
      if (a) {
        topo.classList.remove('aberto');
        botaoMenu.setAttribute('aria-expanded', 'false');
      }
    });

    /* Ao voltar para largura de desktop, o menu precisa perder o
       estado "aberto" -- senão a folha do celular reaparece
       ancorada no lugar errado. */
    if (window.matchMedia) {
      var largo = window.matchMedia('(min-width: 821px)');
      var aoTrocar = function (ev) {
        if (ev.matches) {
          topo.classList.remove('aberto');
          botaoMenu.setAttribute('aria-expanded', 'false');
        }
      };
      if (largo.addEventListener) largo.addEventListener('change', aoTrocar);
      else if (largo.addListener) largo.addListener(aoTrocar);
    }
  }

  /* ---------------------------------------------------------------
     2 · revelação ao rolar
     ---------------------------------------------------------------
     Quem pediu menos movimento recebe tudo visível de imediato, e o
     observador nem chega a ser criado. */
  var paraRevelar = document.querySelectorAll('.revela');

  if (menosMovimento || !('IntersectionObserver' in window)) {
    /* Tira a classe que autoriza o CSS a esconder. Só marcar
       'visivel' não bastaria: se algum bloco fosse acrescentado
       depois, ele nasceria invisível e nunca seria revelado, porque
       não há observador rodando neste caminho. */
    document.documentElement.classList.remove('anima');
    Array.prototype.forEach.call(paraRevelar, function (el) { el.classList.add('visivel'); });
  } else if (paraRevelar.length) {
    var obs = new IntersectionObserver(function (entradas) {
      entradas.forEach(function (entrada) {
        if (!entrada.isIntersecting) return;
        entrada.target.classList.add('visivel');
        obs.unobserve(entrada.target);   /* revela uma vez, não a cada rolagem */
      });
    }, { rootMargin: '0px 0px -12% 0px', threshold: 0.06 });

    Array.prototype.forEach.call(paraRevelar, function (el) { obs.observe(el); });
  }

  /* ---------------------------------------------------------------
     3 · alternância mensal / anual
     ---------------------------------------------------------------
     Os preços já estão escritos no HTML, nos dois ciclos, dentro de
     data-mensal e data-anual. O JavaScript só troca qual está à
     vista. Assim o buscador indexa os dois, e sem JavaScript a
     página mostra o mensal -- que é o preço de entrada.

     Os valores não são calculados aqui: eles vêm do assets/js/
     planos.js, que é a fonte única. Duplicar a conta no site criaria
     um segundo lugar para o preço mudar. */
  var alternador = document.querySelector('[data-alternador]');

  if (alternador) {
    var botoes = alternador.querySelectorAll('button[data-ciclo]');
    var campos = document.querySelectorAll('[data-mensal][data-anual]');

    var aplicar = function (ciclo) {
      Array.prototype.forEach.call(botoes, function (b) {
        b.setAttribute('aria-pressed', b.dataset.ciclo === ciclo ? 'true' : 'false');
      });
      Array.prototype.forEach.call(campos, function (c) {
        c.textContent = ciclo === 'anual' ? c.dataset.anual : c.dataset.mensal;
      });
      document.querySelectorAll('[data-so-anual]').forEach(function (el) {
        el.hidden = ciclo !== 'anual';
      });
      document.querySelectorAll('[data-link-plano]').forEach(function (a) {
        /* O link leva o ciclo para o checkout. O PREÇO não vai
           junto, nem aqui nem em lugar nenhum do frontend: o
           servidor é quem descobre quanto custa. */
        var separador = a.dataset.linkPlano.indexOf('?') === -1 ? '?' : '&';
        a.href = a.dataset.linkPlano + separador + 'ciclo=' + ciclo;
      });
    };

    alternador.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('button[data-ciclo]');
      if (b) aplicar(b.dataset.ciclo);
    });

    aplicar('mensal');
  }

  /* ---------------------------------------------------------------
     4 · ano no rodapé
     --------------------------------------------------------------- */
  var ano = document.querySelector('[data-ano]');
  if (ano) ano.textContent = String(new Date().getFullYear());
})();
