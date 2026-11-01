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


  /* Bandeiras, vales-benefício e cartões de loja (31/10/2026). O pacote de bancos não
     traz essas marcas, e logotipo de terceiro não entra no app sem
     licença: aqui vira um selo com a sigla nas cores da marca. Vêm
     depois dos bancos no casamento de nomes, então "Nubank Mastercard"
     continua sendo Nubank. */
  const MARCAS_EXTRAS = {
    caju: { nome: 'Caju', sigla: 'caju', fundo: '#F2353B', cor: '#FFFFFF', re: /\bcaju\b/, grupo: 'vale' },
    ifoodbeneficios: { nome: 'iFood Benefícios', sigla: 'iF', fundo: '#EA1D2C', cor: '#FFFFFF', re: /ifood/, grupo: 'vale' },
    alelo: { nome: 'Alelo', sigla: 'alelo', fundo: '#C4D600', cor: '#00573F', re: /\balelo\b/, grupo: 'vale' },
    pluxee: { nome: 'Pluxee', sigla: 'P', fundo: '#00EB5E', cor: '#221C46', re: /pluxee|sodexo/, grupo: 'vale' },
    ticket: { nome: 'Ticket', sigla: 'T', fundo: '#E30613', cor: '#FFFFFF', re: /\bticket\b/, grupo: 'vale' },
    vr: { nome: 'VR', sigla: 'VR', fundo: '#00A13A', cor: '#FFFFFF', re: /^vr\b|\bvr (beneficio|refeicao|alimentacao)/, grupo: 'vale' },
    flash: { nome: 'Flash', sigla: 'flash', fundo: '#FF2C83', cor: '#FFFFFF', re: /\bflash\b/, grupo: 'vale' },
    ben: { nome: 'Ben', sigla: 'ben', fundo: '#111111', cor: '#FFFFFF', re: /^ben\b|\bben visa/, grupo: 'vale' },
    swile: { nome: 'Swile', sigla: 'swile', fundo: '#111111', cor: '#FFFFFF', re: /\bswile\b/, grupo: 'vale' },
    wiipo: { nome: 'Wiipo', sigla: 'wiipo', fundo: '#5B2BE0', cor: '#FFFFFF', re: /\bwiipo\b/, grupo: 'vale' },
    lecard: { nome: 'LeCard', sigla: 'LC', fundo: '#FFC20E', cor: '#1A1A1A', re: /le ?card/, grupo: 'vale' },
    visa: { nome: 'Visa', sigla: 'VISA', fundo: '#1A1F71', cor: '#FFFFFF', re: /\bvisa\b/, grupo: 'bandeira' },
    mastercard: { nome: 'Mastercard', sigla: 'MC', fundo: '#252525', cor: '#F79E1B', re: /master ?card/, grupo: 'bandeira' },
    elo: { nome: 'Elo', sigla: 'elo', fundo: '#000000', cor: '#FFCB05', re: /^elo\b|\belo (credito|debito|nanquim|grafite|mais)/, grupo: 'bandeira' },
    amex: { nome: 'Amex', sigla: 'AMEX', fundo: '#2E77BC', cor: '#FFFFFF', re: /\bamex\b|american express/, grupo: 'bandeira' },
    hipercard: { nome: 'Hipercard', sigla: 'H', fundo: '#B3131B', cor: '#FFFFFF', re: /hipercard/, grupo: 'bandeira' },
    shopee: { nome: 'Shopee', sigla: 'S', fundo: '#EE4D2D', cor: '#FFFFFF', re: /shopee/, grupo: 'loja' },
    amazon: { nome: 'Amazon', sigla: 'a', fundo: '#232F3E', cor: '#FF9900', re: /amazon/, grupo: 'loja' },
    magalu: { nome: 'Magalu', sigla: 'M', fundo: '#0086FF', cor: '#FFFFFF', re: /magalu|magazine luiza/, grupo: 'loja' },
    mercadolivre: { nome: 'Mercado Livre', sigla: 'ML', fundo: '#FFE600', cor: '#2D3277', re: /mercado ?livre/, grupo: 'loja' },
    americanas: { nome: 'Americanas', sigla: 'a', fundo: '#E60014', cor: '#FFFFFF', re: /americanas/, grupo: 'loja' },
    casasbahia: { nome: 'Casas Bahia', sigla: 'CB', fundo: '#0033C6', cor: '#FFFFFF', re: /casas bahia/, grupo: 'loja' },
    renner: { nome: 'Renner', sigla: 'R', fundo: '#D2001F', cor: '#FFFFFF', re: /renner/, grupo: 'loja' },
    riachuelo: { nome: 'Riachuelo', sigla: 'Ri', fundo: '#111111', cor: '#FFFFFF', re: /riachuelo|midway/, grupo: 'loja' },
    cea: { nome: 'C&A', sigla: 'C&A', fundo: '#00539F', cor: '#FFFFFF', re: /^c ?& ?a\b|^cea\b/, grupo: 'loja' },
    carrefour: { nome: 'Carrefour', sigla: 'C', fundo: '#004E9F', cor: '#FFFFFF', re: /carrefour|atacadao/, grupo: 'loja' },
    pernambucanas: { nome: 'Pernambucanas', sigla: 'P', fundo: '#E30613', cor: '#FFFFFF', re: /pernambucanas/, grupo: 'loja' },
    marisa: { nome: 'Marisa', sigla: 'M', fundo: '#E6007E', cor: '#FFFFFF', re: /^marisa\b/, grupo: 'loja' },
    havan: { nome: 'Havan', sigla: 'H', fundo: '#003DA5', cor: '#FFFFFF', re: /\bhavan\b/, grupo: 'loja' },
    shein: { nome: 'Shein', sigla: 'S', fundo: '#000000', cor: '#FFFFFF', re: /shein/, grupo: 'loja' },
    aliexpress: { nome: 'AliExpress', sigla: 'AE', fundo: '#E62E04', cor: '#FFFFFF', re: /aliexpress/, grupo: 'loja' },
    /* Bancos fora do pacote MIT (01/11/2026): selo com sigla na cor aproximada da marca. */
    banrisul: { nome: 'Banrisul', sigla: 'B', fundo: '#004B8D', cor: '#FFFFFF', re: /banrisul/, grupo: 'banco' },
    brb: { nome: 'BRB', sigla: 'BRB', fundo: '#0B3B8C', cor: '#FFFFFF', re: /^brb\b|banco de brasilia/, grupo: 'banco' },
    bancodaamazonia: { nome: 'Banco da Amazônia', sigla: 'BASA', fundo: '#006E3C', cor: '#FFFFFF', re: /amazonia|\bbasa\b/, grupo: 'banco' },
    bnb: { nome: 'Banco do Nordeste', sigla: 'BNB', fundo: '#A6192E', cor: '#FFFFFF', re: /banco do nordeste|\bbnb\b/, grupo: 'banco' },
    banestes: { nome: 'Banestes', sigla: 'b', fundo: '#00529B', cor: '#FFFFFF', re: /banestes/, grupo: 'banco' },
    banese: { nome: 'Banese', sigla: 'b', fundo: '#005CA9', cor: '#FFFFFF', re: /banese/, grupo: 'banco' },
    banpara: { nome: 'Banpará', sigla: 'b', fundo: '#0067B1', cor: '#FFFFFF', re: /banpara/, grupo: 'banco' },
    citi: { nome: 'Citibank', sigla: 'citi', fundo: '#056DAE', cor: '#FFFFFF', re: /\bciti(bank)?\b/, grupo: 'banco' },
    daycoval: { nome: 'Daycoval', sigla: 'D', fundo: '#00205B', cor: '#FFFFFF', re: /daycoval/, grupo: 'banco' },
    sofisa: { nome: 'Sofisa', sigla: 'S', fundo: '#0A2240', cor: '#F5A800', re: /sofisa/, grupo: 'banco' },
    willbank: { nome: 'Will Bank', sigla: 'will', fundo: '#FFD400', cor: '#1A1A1A', re: /will ?bank/, grupo: 'banco' },
    bancopine: { nome: 'Banco Pine', sigla: 'P', fundo: '#F26F21', cor: '#FFFFFF', re: /banco pine|^pine\b/, grupo: 'banco' },
    modal: { nome: 'Modal', sigla: 'M', fundo: '#111111', cor: '#FFFFFF', re: /modal(mais)?\b/, grupo: 'banco' },
    genial: { nome: 'Genial', sigla: 'G', fundo: '#1B2A4A', cor: '#FFFFFF', re: /genial/, grupo: 'banco' },
    toro: { nome: 'Toro', sigla: 'T', fundo: '#5A2D82', cor: '#FFFFFF', re: /^toro\b|toro invest/, grupo: 'banco' },
    warren: { nome: 'Warren', sigla: 'W', fundo: '#E02B56', cor: '#FFFFFF', re: /warren/, grupo: 'banco' },
    ailos: { nome: 'Ailos', sigla: 'A', fundo: '#00A859', cor: '#FFFFFF', re: /ailos/, grupo: 'banco' },
    cresol: { nome: 'Cresol', sigla: 'C', fundo: '#00843D', cor: '#FFFFFF', re: /cresol/, grupo: 'banco' },
    unicred: { nome: 'Unicred', sigla: 'U', fundo: '#004C3F', cor: '#FFFFFF', re: /unicred/, grupo: 'banco' },
    portobank: { nome: 'Porto Bank', sigla: 'P', fundo: '#0046C0', cor: '#FFFFFF', re: /porto ?(seguro|bank)/, grupo: 'banco' },
    credicard: { nome: 'Credicard', sigla: 'cc', fundo: '#00205B', cor: '#FFFFFF', re: /credicard/, grupo: 'banco' },
    superdigital: { nome: 'Superdigital', sigla: 'S', fundo: '#E2001A', cor: '#FFFFFF', re: /superdigital/, grupo: 'banco' },
    recargapay: { nome: 'RecargaPay', sigla: 'R', fundo: '#00C08B', cor: '#FFFFFF', re: /recarga ?pay/, grupo: 'banco' },
    ame: { nome: 'Ame Digital', sigla: 'ame', fundo: '#E60014', cor: '#FFFFFF', re: /\bame\b/, grupo: 'banco' },
    tribanco: { nome: 'Tribanco', sigla: 'T', fundo: '#003D7C', cor: '#FFFFFF', re: /tribanco/, grupo: 'banco' }
  };
  Icons.MARCAS_EXTRAS = MARCAS_EXTRAS;

  /** Resolve um nome livre ("Banco Itaú", "itau", "ITAÚ S.A.") para uma chave. */
  Icons.bankKey = function (name) {
    const n = U.norm(name);
    if (!n) return null;
    for (const [re, key] of BANK_MATCH) if (re.test(n)) return key;
    if (BR.ICONES[n]) return n;
    for (const key in MARCAS_EXTRAS) if (MARCAS_EXTRAS[key].re.test(n)) return key;
    return null;
  };

  Icons.hasBank = (name) => { const k = Icons.bankKey(name); return !!(BR.ICONES[k] || MARCAS_EXTRAS[k]); };

  /** Cores oficiais da marca: { fundo, cor }. Null quando o banco é desconhecido. */
  Icons.bankBrand = function (name) {
    const key = Icons.bankKey(name);
    const p = key && (BR.PRESETS[key] || MARCAS_EXTRAS[key]);
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

    const extra = !parts && MARCAS_EXTRAS[Icons.bankKey(name)];
    if (extra) {
      const t = extra.sigla, fs = t.length <= 1 ? 64 : t.length === 2 ? 50 : t.length === 3 ? 42 : t.length === 4 ? 32 : 26;
      svg.setAttribute('viewBox', '0 0 100 100');
      const txt = document.createElementNS(NS, 'text');
      txt.setAttribute('x', '50'); txt.setAttribute('y', '52');
      txt.setAttribute('text-anchor', 'middle'); txt.setAttribute('dominant-baseline', 'central');
      txt.setAttribute('font-family', 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif');
      txt.setAttribute('font-weight', '800'); txt.setAttribute('font-size', String(fs));
      txt.setAttribute('fill', color || 'currentColor');
      txt.textContent = t;
      svg.appendChild(txt);
      svg.classList.add('is-sigla');
    } else if (parts) {
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

  /* Marca oficial do kit V2.1; não há desenho alternativo em JavaScript. */
  Icons.oaze = function (px, variante) {
    const lado = px || 24;
    const img = document.createElement('img');
    img.src = variante === 'mono'
      ? '/assets/brand/oaze-isologo-mono-milk.svg'
      : '/assets/brand/oaze-isologo.svg';
    img.width = lado;
    img.height = lado;
    img.alt = '';
    /* Decorativa por padrão: a marca quase sempre acompanha a
       palavra "OAZE" ou vive num botão que já tem aria-label.
       Anunciá-la de novo faria o leitor de tela dizer "OAZE OAZE". */
    img.setAttribute('aria-hidden', 'true');
    img.setAttribute('decoding', 'async');
    img.style.display = 'block';
    return img;
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
