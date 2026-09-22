/* =============================================================
   idioma-esfera.js — a bandeira redonda do topo
   -------------------------------------------------------------
   Um botão redondo com a bandeira da língua atual, sempre visível
   no alto da tela, que abre as quatro opções. O mesmo arquivo
   serve o site público e o app, porque a pergunta é a mesma e um
   controle que muda de forma entre as duas metades do produto
   ensina a pessoa a procurá-lo duas vezes.

   ONDE ELE ESTAVA ANTES, E POR QUE NÃO BASTAVA
     · site — uma lista de nomes ("Português English Français") no
       RODAPÉ. Quem chega pela primeira vez não rola até o rodapé
       para descobrir se o produto fala a língua dele.
     · app  — um <select> dentro de Configurações, três toques
       adiante.
   Em nenhum dos dois a língua era uma coisa visível na chegada.

   AS DUAS METADES TROCAM DE LÍNGUA DE JEITOS DIFERENTES
     site  cada língua é um ENDEREÇO (/precos, /en/precos…), e as
           páginas já nascem traduzidas pelo tools/gen-idiomas.js.
           Os destinos não são inventados aqui: saem do <nav
           data-idiomas> que toda página já carrega, então uma
           página nova entra sozinha, sem tocar neste arquivo.
     app   é uma página só, traduzida em tempo de execução. Quem
           troca é o I18n.escolher(), que grava a escolha e
           recarrega.

   E O PREÇO ACOMPANHA
   Trocar para inglês e continuar vendo o preço em reais é a mesma falha
   que mostrar o app em português para quem escolheu francês. No
   site isso já era verdade — as páginas em inglês têm a tabela em
   dólar escrita nelas. No app a moeda vivia numa gaveta própria
   (oaze.moeda), escolhida uma vez e nunca mais revisada: aqui ela
   passa a seguir a língua. A escolha manual na página de planos
   continua valendo depois — até a próxima troca de língua, que é
   quando a pergunta volta a ser feita.

   BANDEIRA DESENHADA, NÃO EMOJI
   🇧🇷 não existe no Windows: o sistema não traz as bandeiras e o
   navegador escreve "BR" em letras. Cada uma aqui é um SVG de
   poucas linhas, que aparece igual em todo lugar.
   ============================================================= */
(function (global) {
  'use strict';

  var LINGUAS = [
    { id: 'pt', nome: 'Português', moeda: 'BRL' },
    { id: 'en', nome: 'English', moeda: 'USD' },
    { id: 'fr', nome: 'Français', moeda: 'EUR' },
    { id: 'es', nome: 'Español', moeda: 'USD' }
  ];

  /* Rótulos do próprio controle, em cada língua. Poucos e fixos:
     não vale um dicionário para quatro frases que nunca mudam. */
  var TEXTOS = {
    pt: { abrir: 'Idioma', titulo: 'Escolha o idioma', atual: 'Idioma atual' },
    en: { abrir: 'Language', titulo: 'Choose your language', atual: 'Current language' },
    fr: { abrir: 'Langue', titulo: 'Choisissez la langue', atual: 'Langue actuelle' },
    es: { abrir: 'Idioma', titulo: 'Elige el idioma', atual: 'Idioma actual' }
  };

  var BANDEIRAS = {
    pt: '<rect width="28" height="20" fill="#2E9B45"/>' +
        '<path d="M14 2.4 25.4 10 14 17.6 2.6 10Z" fill="#F5D010"/>' +
        '<circle cx="14" cy="10" r="4.1" fill="#1F3D91"/>',
    en: '<rect width="28" height="20" fill="#F2F2F2"/>' +
        '<g fill="#B22234"><rect width="28" height="2.9"/><rect y="5.7" width="28" height="2.9"/>' +
        '<rect y="11.4" width="28" height="2.9"/><rect y="17.1" width="28" height="2.9"/></g>' +
        '<rect width="12" height="11.4" fill="#3C3B6E"/>',
    fr: '<rect width="28" height="20" fill="#F2F2F2"/>' +
        '<rect width="9.4" height="20" fill="#0055A4"/>' +
        '<rect x="18.6" width="9.4" height="20" fill="#EF4135"/>',
    es: '<rect width="28" height="20" fill="#AA151B"/>' +
        '<rect y="5" width="28" height="10" fill="#F1BF00"/>'
  };

  function bandeira(lingua, tamanho) {
    var s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('viewBox', '0 0 28 20');
    s.setAttribute('width', tamanho);
    s.setAttribute('height', tamanho);
    /* "slice" recorta as sobras: a bandeira preenche o círculo
       inteiro em vez de deixar duas tarjas vazias em cima e embaixo. */
    s.setAttribute('preserveAspectRatio', 'xMidYMid slice');
    s.setAttribute('aria-hidden', 'true');
    s.setAttribute('focusable', 'false');
    s.innerHTML = BANDEIRAS[lingua] || BANDEIRAS.pt;
    return s;
  }

  /* ---------------- a língua de agora ---------------- */

  function atual() {
    var raiz = document.documentElement;
    var doApp = raiz.getAttribute('data-idioma');
    if (doApp) return doApp;
    var doHtml = String(raiz.getAttribute('lang') || 'pt').slice(0, 2).toLowerCase();
    return TEXTOS[doHtml] ? doHtml : 'pt';
  }

  /* ---------------- os destinos, no site ---------------- */

  /**
   * O <nav data-idiomas> do rodapé já traz o endereço desta mesma
   * página em cada língua — inclusive as que ainda não existem hoje.
   * Ler dali é o que mantém a esfera e o rodapé concordando para
   * sempre; inventar caminhos aqui seria uma segunda fonte, que um
   * dia discorda da primeira.
   */
  function destinosDoSite() {
    var nav = document.querySelector('nav[data-idiomas]');
    if (!nav) return null;
    var mapa = {};
    var achou = false;
    Array.prototype.forEach.call(nav.querySelectorAll('a[data-idioma]'), function (a) {
      var l = String(a.getAttribute('hreflang') || a.getAttribute('lang') || '').slice(0, 2).toLowerCase();
      if (TEXTOS[l]) { mapa[l] = a.getAttribute('href'); achou = true; }
    });
    return achou ? mapa : null;
  }

  /* ---------------- a troca ---------------- */

  function guardarMoeda(lingua) {
    var l = LINGUAS.filter(function (x) { return x.id === lingua; })[0];
    if (!l) return;
    try { localStorage.setItem('oaze.moeda', l.moeda); } catch (e) { /* sem gaveta, o palpite decide */ }
  }

  function trocar(lingua, destinos) {
    if (lingua === atual()) return;
    guardarMoeda(lingua);
    /* A escolha vale para as duas metades: quem lê o site em
       francês abre o app em francês, e vice-versa. */
    try { localStorage.setItem('oaze.idioma.site', lingua); } catch (e) { /* segue */ }

    if (global.I18n && global.I18n.escolher) { global.I18n.escolher(lingua); return; }
    if (destinos && destinos[lingua]) { location.href = destinos[lingua]; return; }
    location.reload();
  }

  /* ---------------- o controle ---------------- */

  function montar() {
    if (document.querySelector('.idioma-esfera')) return;

    var lingua = atual();
    var t = TEXTOS[lingua] || TEXTOS.pt;
    var destinos = destinosDoSite();
    var noApp = !!(global.I18n && global.I18n.escolher);
    if (!destinos && !noApp) return;      // nada a oferecer: não desenha um botão morto

    var caixa = document.createElement('div');
    caixa.className = 'idioma-esfera';

    var botao = document.createElement('button');
    botao.type = 'button';
    botao.className = 'idioma-esfera-botao';
    botao.setAttribute('aria-expanded', 'false');
    botao.setAttribute('aria-haspopup', 'true');
    botao.setAttribute('aria-label', t.abrir + ': ' + (TEXTOS[lingua] ? nomeDe(lingua) : lingua));
    botao.title = t.abrir;
    botao.appendChild(bandeira(lingua, 26));
    caixa.appendChild(botao);

    var painel = document.createElement('div');
    painel.className = 'idioma-esfera-painel';
    painel.hidden = true;
    painel.setAttribute('role', 'menu');
    painel.setAttribute('aria-label', t.titulo);

    LINGUAS.forEach(function (l) {
      var item = document.createElement('button');
      item.type = 'button';
      item.className = 'idioma-esfera-item' + (l.id === lingua ? ' is-atual' : '');
      item.setAttribute('role', 'menuitem');
      item.setAttribute('lang', l.id);
      if (l.id === lingua) item.setAttribute('aria-current', 'true');
      item.appendChild(bandeira(l.id, 22));
      var nome = document.createElement('span');
      nome.textContent = l.nome;
      item.appendChild(nome);
      item.addEventListener('click', function () { trocar(l.id, destinos); });
      painel.appendChild(item);
    });
    caixa.appendChild(painel);

    function fechar() {
      painel.hidden = true;
      botao.setAttribute('aria-expanded', 'false');
      caixa.classList.remove('esta-aberta');
    }
    function abrir() {
      painel.hidden = false;
      botao.setAttribute('aria-expanded', 'true');
      caixa.classList.add('esta-aberta');
      var primeiro = painel.querySelector('.idioma-esfera-item');
      if (primeiro) primeiro.focus();
    }
    botao.addEventListener('click', function () {
      if (painel.hidden) abrir(); else fechar();
    });
    document.addEventListener('click', function (ev) {
      if (!painel.hidden && !caixa.contains(ev.target)) fechar();
    });
    document.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape' && !painel.hidden) { fechar(); botao.focus(); }
    });

    pendurar(caixa);
  }

  function nomeDe(lingua) {
    var l = LINGUAS.filter(function (x) { return x.id === lingua; })[0];
    return l ? l.nome : lingua;
  }

  /**
   * Onde ele mora em cada metade. Sempre dentro de uma barra que já
   * é fixa no alto: um elemento solto em position:fixed acabaria
   * por cima de um botão do cabeçalho em alguma largura de tela —
   * e descobrir isso é sempre depois de publicar.
   */
  function pendurar(caixa) {
    var barraApp = document.querySelector('.topbar');
    if (barraApp) { barraApp.appendChild(caixa); return; }
    var barraSite = document.querySelector('.topo .env');
    if (barraSite) { barraSite.appendChild(caixa); return; }
    document.body.appendChild(caixa);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', montar);
  else montar();

  global.IdiomaEsfera = { montar: montar, LINGUAS: LINGUAS };
})(window);
