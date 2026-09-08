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
        a.href = a.dataset.linkPlano + '?ciclo=' + ciclo;
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
