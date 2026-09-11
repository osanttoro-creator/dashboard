/* =============================================================
   icons.js — camada de ícones do app
   ------------------------------------------------------------
   Fontes, ambas vendorizadas (sem CDN em runtime — funciona
   offline e em file://):
   · assets/vendor/bancos.js  — @edusites/bancos-brasil (MIT):
       41 bancos e carteiras brasileiras, silhueta monocromática
       + a cor de marca de cada um.
   · assets/vendor/icons.js   — Lucide (ISC): subconjunto curado
       de ícones de categoria.

   Se um arquivo vendorizado faltar, tudo cai para um ícone
   genérico: nada quebra.
   ============================================================= */
(function (global) {
  'use strict';

  const Icons = {};
  const DATA = global.IconData || { banks: {}, lucide: {} };
  const BR = global.BancosBR || { ICONES: {}, PRESETS: {} };
  const NS = 'http://www.w3.org/2000/svg';

  /* ============================================================
     1 · BANCOS
     ============================================================ */

  /** nome digitado/escolhido -> chave do pacote. Ordem importa. */
  const BANK_MATCH = [
    [/\bitau|ita[uú]\b|unibanco/, 'itau'],
    [/nubank|\bnu\b|nu pagamentos/, 'nubank'],
    [/bradesco/, 'bradesco'],
    [/santander/, 'santander'],
    [/caixa/, 'caixa'],
    [/banco do brasil|\bbb\b/, 'bancodobrasil'],
    [/\binter\b/, 'inter'],
    [/\bc6\b/, 'c6'],
    [/btg/, 'btg'],
    [/sicredi/, 'sicredi'],
    [/sicoob/, 'sicoob'],
    [/picpay/, 'picpay'],
    [/mercado ?pago/, 'mercadopago'],
    [/\bxp\b/, 'xp'],
    [/safra/, 'safra'],
    [/\bneon\b/, 'neon'],
    [/pagbank|pagseguro/, 'pagbank'],
    [/\bstone\b/, 'stone'],
    [/votorantim|\bbv\b/, 'bv'],
    [/mercantil/, 'mercantil'],
    [/\bcora\b/, 'cora'],
    [/infinite ?pay/, 'infinitepay'],
    [/\bdigio\b/, 'digio'],
    [/banco pan|\bpan\b/, 'pan'],
    [/\bwise\b/, 'wise'],
    [/paypal/, 'paypal'],
    [/stripe/, 'stripe'],
    [/\bnext\b/, 'next'],
    [/original/, 'original'],
    [/\brico\b/, 'rico'],
    [/revolut/, 'revolut'],
    [/\bbs2\b/, 'bs2'],
    [/efi ?bank|gerencianet/, 'efibank'],
    [/\bton\b/, 'ton'],
    [/\biugu\b/, 'iugu'],
    [/\basaas\b/, 'asaas'],
    [/ng ?cash/, 'ngcash'],
    [/avenue/, 'avenue'],
    [/nomad/, 'nomad'],
    [/\bbmg\b/, 'bmg'],
    [/agibank/, 'agibank']
  ];

  /** Resolve um nome livre ("Banco Itaú", "itau", "ITAÚ S.A.") para uma chave. */
  Icons.bankKey = function (name) {
    const n = U.norm(name);
    if (!n) return null;
    for (const [re, key] of BANK_MATCH) if (re.test(n)) return key;
    return BR.ICONES[n] ? n : null;
  };

  Icons.hasBank = (name) => !!BR.ICONES[Icons.bankKey(name)];

  /** Cores oficiais da marca: { fundo, cor }. Null quando o banco é desconhecido. */
  Icons.bankBrand = function (name) {
    const key = Icons.bankKey(name);
    const p = key && BR.PRESETS[key];
    return p ? { bg: p.fundo, fg: p.cor } : null;
  };

  /** Só os nomes que o app conhece — alimenta o autocompletar do cadastro. */
  Icons.bankKeys = () => Object.keys(BR.ICONES);

  /* O pacote entrega o miolo do <svg> sem fill próprio: a cor vem de fora.
     Guardamos viewBox e conteúdo já limpos, uma vez por banco. */
  const cache = {};
  function bankParts(key) {
    if (cache[key] !== undefined) return cache[key];
    const raw = BR.ICONES[key];
    if (!raw) return (cache[key] = null);
    const vb = (/viewBox=["']([^"']+)["']/.exec(raw) || [, '0 0 108 108'])[1];
    const body = (/<svg[^>]*>([\s\S]*)<\/svg>/.exec(raw) || [, ''])[1]
      .replace(/\s*fill="[^"]*"/g, '').trim();
    return (cache[key] = { vb, body });
  }

  /**
   * <svg> com a silhueta do banco, na cor pedida (padrão: currentColor).
   * Sem correspondência, devolve o ícone genérico de instituição.
   */
  Icons.bank = function (name, size, color) {
    const px = size || 22;
    const parts = bankParts(Icons.bankKey(name));
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('width', px);
    svg.setAttribute('height', px);
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    svg.classList.add('bank-icon');

    if (parts) {
      svg.setAttribute('viewBox', parts.vb);
      svg.setAttribute('fill', color || 'currentColor');
      svg.innerHTML = parts.body;
    } else {
      svg.setAttribute('viewBox', '0 0 24 24');
      svg.setAttribute('fill', 'none');
      svg.setAttribute('stroke', color || 'currentColor');
      svg.setAttribute('stroke-width', '2');
      svg.setAttribute('stroke-linecap', 'round');
      svg.setAttribute('stroke-linejoin', 'round');
      svg.innerHTML = DATA.lucide.landmark || '';
      svg.classList.add('is-generic');
    }
    return svg;
  };

  /**
   * Ladrilho arredondado no estilo carteira: silhueta na cor de contraste
   * sobre a cor da marca. É o que aparece nos cartões e nas contas.
   */
  Icons.bankTile = function (name, size, fallbackColor) {
    const px = size || 34;
    const brand = Icons.bankBrand(name);
    const bg = brand ? brand.bg : (fallbackColor || 'var(--plane-2)');
    const fg = brand ? brand.fg : U.inkFor(fallbackColor || '#A68B6B');
    const tile = U.el('span', {
      class: 'bank-tile' + (brand ? '' : ' is-generic'),
      style: { width: px + 'px', height: px + 'px', background: bg, color: fg },
      title: name || 'Instituição'
    });
    tile.appendChild(Icons.bank(name, Math.round(px * 0.62), fg));
    return tile;
  };

  /* ============================================================
     2 · CATEGORIAS (Lucide)
     ============================================================ */

  /** Ícones oferecidos no seletor, agrupados para o usuário achar rápido. */
  Icons.PICKER = [
    { grupo: 'Casa e contas', nomes: ['house', 'building', 'key', 'sofa', 'zap', 'droplet', 'flame', 'wifi', 'receipt', 'wrench', 'hammer'] },
    { grupo: 'Dia a dia', nomes: ['utensils', 'shopping-cart', 'shopping-bag', 'coffee', 'cake', 'shirt', 'scissors', 'package', 'tag'] },
    { grupo: 'Transporte', nomes: ['car', 'fuel', 'bus', 'plane', 'truck', 'map-pin'] },
    { grupo: 'Saúde e bem-estar', nomes: ['heart-pulse', 'pill', 'stethoscope', 'dumbbell', 'glasses', 'cigarette'] },
    { grupo: 'Lazer e pessoal', nomes: ['gamepad-2', 'film', 'music', 'ticket', 'book-open', 'graduation-cap', 'gift', 'dog', 'baby', 'sparkles', 'star', 'church', 'tv'] },
    { grupo: 'Dinheiro', nomes: ['banknote', 'wallet', 'coins', 'piggy-bank', 'hand-coins', 'credit-card', 'circle-dollar-sign', 'badge-dollar-sign', 'trending-up', 'chart-line', 'percent', 'landmark', 'arrow-left-right', 'banknote-arrow-down'] },
    { grupo: 'Trabalho e outros', nomes: ['briefcase', 'laptop', 'smartphone', 'building-2', 'users', 'heart-handshake', 'shield', 'umbrella', 'repeat', 'calendar', 'clock', 'folder', 'list', 'circle-help', 'circle-ellipsis'] }
  ];

  const ALL_PICKER = Icons.PICKER.reduce((a, g) => a.concat(g.nomes), []);
  Icons.pickerNames = () => ALL_PICKER.slice();

  /** Palpite por nome de categoria, para quem nunca escolheu um ícone. */
  const CAT_MATCH = [
    [/alimenta|mercado|supermercado|comida|restaurante|padaria|lanche/, 'utensils'],
    [/transporte|uber|combustivel|gasolina|carro|onibus|metro/, 'car'],
    [/moradia|aluguel|casa|condominio|imovel/, 'house'],
    [/saude|medic|farmacia|plano de saude|dentista|hospital/, 'heart-pulse'],
    [/lazer|entretenimento|cinema|jogo|game|viagem|passeio/, 'gamepad-2'],
    [/educa|escola|faculdade|curso|livro|estudo/, 'graduation-cap'],
    [/compras|vestuario|roupa|shopping|presente/, 'shopping-bag'],
    [/assinatura|streaming|netflix|spotify|mensalidade|recorrente/, 'repeat'],
    [/conta|imposto|taxa|tarifa|luz|agua|energia|internet|telefone/, 'receipt'],
    [/salario|remunera|pagamento|folha|proventos/, 'banknote'],
    [/invest|rendimento|dividendo|aporte|juros/, 'trending-up'],
    [/freelance|pj|autonomo|servico|trabalho/, 'briefcase'],
    [/reembolso|estorno|devolucao|cashback/, 'arrow-left-right'],
    [/venda|comercio/, 'tag'],
    [/pet|animal|cachorro|gato/, 'dog'],
    [/academia|esporte|treino/, 'dumbbell'],
    [/poupanca|reserva|emergencia/, 'piggy-bank'],
    [/doacao|caridade/, 'heart-handshake'],
    [/seguro/, 'shield']
  ];

  /** Ícone efetivo de uma categoria: o escolhido, ou o palpite, ou o padrão. */
  Icons.forCategory = function (cat) {
    if (!cat) return 'circle-ellipsis';
    if (cat.icon && DATA.lucide[cat.icon]) return cat.icon;
    return Icons.guessCategory(cat.name, cat.kind);
  };

  Icons.guessCategory = function (name, kind) {
    const n = U.norm(name);
    for (const [re, ic] of CAT_MATCH) if (re.test(n)) return ic;
    return kind === 'income' ? 'banknote' : 'circle-ellipsis';
  };

  /** <svg> Lucide que herda a cor do texto (ou a cor informada). */
  Icons.lucide = function (name, size, color) {
    const px = size || 16;
    const body = DATA.lucide[name] || DATA.lucide['circle-ellipsis'] || '';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('width', px);
    svg.setAttribute('height', px);
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', color || 'currentColor');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    svg.classList.add('lucide-icon');
    svg.innerHTML = body;
    return svg;
  };
  Icons.has = (name) => !!DATA.lucide[name];

  /**
   * Selo redondo da categoria: ícone na cor da categoria sobre um
   * fundo tênue da mesma cor. Substitui o antigo ponto colorido —
   * a forma passa a distinguir, não só a cor.
   */
  Icons.categoryBadge = function (categoryId, size) {
    const cat = Calc.categoryById(categoryId);
    const color = cat ? cat.color : '#9AA0AC';
    const px = size || 26;
    const wrap = U.el('span', {
      class: 'cat-badge',
      style: {
        width: px + 'px', height: px + 'px',
        background: 'color-mix(in srgb, ' + color + ' 18%, transparent)',
        color: color
      },
      title: cat ? cat.name : 'Sem categoria'
    });
    wrap.appendChild(Icons.lucide(Icons.forCategory(cat), Math.round(px * 0.58)));
    return wrap;
  };

  /* ============================================================
     3 · MEIO DE PAGAMENTO (débito × crédito)
     ============================================================ */

  Icons.METHOD = {
    account: { icon: 'landmark', label: 'Débito', full: 'Débito — sai da conta' },
    card: { icon: 'credit-card', label: 'Crédito', full: 'Crédito — entra na fatura' }
  };

  /** Selo "Débito"/"Crédito" com ícone — nunca só cor. */
  Icons.methodBadge = function (method, extraText) {
    const m = Icons.METHOD[method === 'card' ? 'card' : 'account'];
    const badge = U.el('span', {
      class: 'badge badge-method badge-' + (method === 'card' ? 'credito' : 'debito'),
      title: m.full
    });
    badge.appendChild(Icons.lucide(m.icon, 12));
    badge.appendChild(document.createTextNode(extraText || m.label));
    return badge;
  };

  /* ============================================================
     4 · A MARCA OAZE — o coqueiro sobre a água
     ------------------------------------------------------------
     UM DESENHO SÓ, EM UM LUGAR SÓ. Antes existiam três marcas
     diferentes no produto: um sol de raios no cabeçalho do app,
     um "horizonte sobre água" roxo no favicon e um terceiro
     desenho colado à mão em cada página pública. Três respostas
     para a pergunta "qual é a cara do OAZE".

     Este é o símbolo aprovado, e é o ÚNICO ícone figurativo da
     marca. O UGLEZ não tem desenho próprio -- sem mascote, sem
     robô, sem rosto: ele é partícula (ver uglez-particulas.js).

     As duas variantes existem por motivos diferentes:
       'cor'  — medalhão dourado com o coqueiro em azul-petróleo.
                É a marca. Serve fundo claro e escuro sem troca.
       'mono' — traço em currentColor, para onde o dourado não
                sobrevive: e-mail, uma tinta, estado desabilitado.
     ============================================================ */

  const MARCA_COPA = [
    'M32 10.5c3.2 5.3 3.9 11.4 1.9 18.4h-3.8c-2-7-1.3-13.1 1.9-18.4z',
    'M32.4 25.6C25.4 13.4 17.4 11.3 11.2 19.6c6.6-4 13-.7 18.6 8.9z',
    'M32.4 27.5C22.9 20.7 14.2 24.7 10.8 38.7c4.3-10.2 11.5-12.3 19.7-7.3z',
    'M31.6 25.6C38.6 13.4 46.6 11.3 52.8 19.6c-6.6-4-13-.7-18.6 8.9z',
    'M31.6 27.5C41.1 20.7 49.8 24.7 53.2 38.7c-4.3-10.2-11.5-12.3-19.7-7.3z',
    'M30.5 27.2h3c.6 5.7 1.3 11.2 2.2 16.4H28.3c.9-5.2 1.6-10.7 2.2-16.4z',
    'M10.9 46.3c6.8-4.9 12.9 4.7 21.1 4.7s14.3-9.6 21.1-4.7c-6.8 6.3-12.9 9-21.1 9s-14.3-2.7-21.1-9z'
  ];

  /* Anel monocromático: dois arcos, e não um <circle> com stroke,
     porque stroke escala com o transform e furaria a proporção
     quando alguém aplicar a marca dentro de outro grupo. */
  const MARCA_ANEL_MONO =
    'M32 3a29 29 0 100 58 29 29 0 000-58zm0 3.6a25.4 25.4 0 110 50.8 25.4 25.4 0 010-50.8z';

  let gradiente = 0;

  /**
   * A marca, como SVG inline.
   *
   * @param {number} px      lado do quadrado; 20 é o mínimo em que
   *                         o coqueiro ainda lê como coqueiro
   * @param {string} variante 'cor' (padrão) ou 'mono'
   */
  Icons.oaze = function (px, variante) {
    const lado = px || 24;
    const mono = variante === 'mono';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 64 64');
    svg.setAttribute('width', String(lado));
    svg.setAttribute('height', String(lado));
    /* Decorativo por padrão: a marca quase sempre acompanha o texto
       "OAZE" ou vive num botão que já tem aria-label. Anunciá-la de
       novo faria o leitor de tela dizer "OAZE OAZE". */
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');

    const caminho = (d, fill) => {
      const p = document.createElementNS(NS, 'path');
      p.setAttribute('d', d);
      if (fill) p.setAttribute('fill', fill);
      return p;
    };
    const circulo = (r, fill) => {
      const c = document.createElementNS(NS, 'circle');
      c.setAttribute('cx', '32'); c.setAttribute('cy', '32'); c.setAttribute('r', String(r));
      c.setAttribute('fill', fill);
      return c;
    };

    if (mono) {
      const g = document.createElementNS(NS, 'g');
      g.setAttribute('fill', 'currentColor');
      g.appendChild(caminho(MARCA_ANEL_MONO));
      MARCA_COPA.forEach((d) => g.appendChild(caminho(d)));
      svg.appendChild(g);
      return svg;
    }

    /* Cada instância precisa do próprio id de gradiente: dois SVGs
       com o mesmo id fazem o segundo herdar o primeiro, e o segundo
       some quando o primeiro sai do DOM. */
    const id = 'oazeGold' + (++gradiente);
    const defs = document.createElementNS(NS, 'defs');
    const grad = document.createElementNS(NS, 'linearGradient');
    grad.setAttribute('id', id);
    grad.setAttribute('x1', '10'); grad.setAttribute('y1', '4');
    grad.setAttribute('x2', '54'); grad.setAttribute('y2', '60');
    grad.setAttribute('gradientUnits', 'userSpaceOnUse');
    [['0', '#F0DA9B'], ['.45', '#D8B45E'], ['1', '#B8912F']].forEach(([off, cor]) => {
      const s = document.createElementNS(NS, 'stop');
      s.setAttribute('offset', off); s.setAttribute('stop-color', cor);
      grad.appendChild(s);
    });
    defs.appendChild(grad);
    svg.appendChild(defs);

    const ouro = 'url(#' + id + ')';
    svg.appendChild(circulo(31, ouro));
    svg.appendChild(circulo(27.2, '#23394D'));
    svg.appendChild(circulo(25.6, ouro));
    const g = document.createElementNS(NS, 'g');
    g.setAttribute('fill', '#23394D');
    MARCA_COPA.forEach((d) => g.appendChild(caminho(d)));
    svg.appendChild(g);
    return svg;
  };

  /** Pinta todo elemento com data-oaze-mark. Chamado no boot. */
  Icons.pintarMarcas = function (raiz) {
    const alvos = (raiz || document).querySelectorAll('[data-oaze-mark]');
    Array.prototype.forEach.call(alvos, (n) => {
      if (n.firstElementChild) return;          // já pintado
      n.appendChild(Icons.oaze(+n.dataset.oazeMark || 24, n.dataset.oazeVariante));
    });
  };

  Icons.available = () => Object.keys(DATA.lucide).length > 0;

  global.Icons = Icons;
})(window);
