/* OAZE V3: apresentação nova; Store, Calc e Sync continuam sendo a fonte dos dados. */
(function (global) {
  'use strict';

  const $ = (s) => document.querySelector(s);
  // A prévia continua isolada; somente app-v3.html habilita a conta real.
  const demo = document.documentElement.dataset.oazeMode !== 'live';
  const routes = ['home', 'transactions', 'wallet', 'investments', 'categories', 'goals', 'calendar', 'reminders', 'settings', 'plan'];
  const names = { home: 'início', transactions: 'lançamentos', wallet: 'carteira', investments: 'investimentos', categories: 'categorias', goals: 'metas e orçamentos', calendar: 'calendário', reminders: 'lembretes', settings: 'configurações', plan: 'plano', more: 'mais' };
  const initialPaths = { '/app': 'home', '/app/financeiro': 'transactions', '/app/carteira': 'wallet', '/app/investimentos': 'investments', '/app/categorias': 'categories', '/app/metas': 'goals', '/app/orcamento': 'goals', '/app/recorrencias': 'reminders', '/app/calendario': 'calendar', '/app/configuracoes': 'settings', '/app/planos': 'plan', '/app/limites': 'plan', '/app/analises': 'investments', '/app/uglez': 'home' };
  const classicPaths = { transactions: '/app/financeiro', wallet: '/app/carteira', investments: '/app/investimentos', categories: '/app/categorias', goals: '/app/metas', reminders: '/app/recorrencias', settings: '/app/configuracoes', plan: '/app/planos' };
  const uiIcons = new Set(['home','transactions','wallet','investments','categories','goals','calendar','reminders','settings','plan','more','plus','arrow','down','utensils','car','heart','leisure','subscription','contactless','education','shopping','receipt','work','exchange','sales']);
  const icon = (name) => `<span class="v3-fi v3-fi-${uiIcons.has(name) ? name : 'more'}" aria-hidden="true"></span>`;
  const cocoMediaIcon = (name) => {
    const paths = {
      attach: '<path d="m21.4 11.6-8.8 8.8a6 6 0 0 1-8.5-8.5L13.6 2.4a4 4 0 0 1 5.7 5.7l-9.5 9.5a2 2 0 0 1-2.8-2.8l8.8-8.8"/>',
      mic: '<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0M12 17v5m-4 0h8"/>',
      stop: '<rect x="5" y="5" width="14" height="14" rx="2"/>'
    };
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]}</svg>`;
  };
  const esc = (x) => String(x == null ? '' : x).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = (n) => 'R$ ' + Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const pct = (n) => Math.max(0, Math.min(100, Number(n) || 0));
  const safeColor = (x) => /^#[0-9a-f]{6}$/i.test(String(x || '')) ? x : '#5fa99b';
  const shortDate = (s) => s ? `${s.slice(8, 10)} ${['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'][+s.slice(5, 7) - 1]}` : '';
  const ymOf = (d) => String(d || '').slice(0, 7);
  const periodLabel = (ym) => `${['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'][+ym.slice(5, 7) - 1]} ${ym.slice(0, 4)}`;
  const niceMonth = (ym) => `${['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'][+ym.slice(5, 7) - 1]} de ${ym.slice(0, 4)}`;
  const state = { page: 'home', ym: demo ? '2026-09' : U.todayYM(), filter: 'Todos', catKind: 'expense', goalTab: 'goals', calDay: null, selected: null, walletKind: 'debit', walletOpen: true, cocoTab: 'Agora', hideMoney: false, sim: { aporte: 500, taxa: 10, meses: 24 }, billing: 'monthly', subscription: null, billingError: '', paymentBusy: false, chat: [], cocoSettings: null, cocoMemories: [], cocoLoading: false, cocoError: '', mediaDraft: '' };
  let recorder = null;
  let microphone = null;
  let limitsPromise = Promise.resolve(demo);
  global.App = { get ym() { return state.ym; }, goTo: (page) => go(page === 'accounts' ? 'wallet' : page) };

  const sample = {
    owner: 'ana souza', plan: 'OAZE mensal', balance: 18420.35, accountsBalance: 12180.35, cardInvoices: { c1: 1982.3, c2: 640 },
    accounts: [
      { id: 'a1', name: 'Itaú', bank: 'Itaú', last4: '0917', openingBalance: 10830.35, color: '#477486' },
      { id: 'a2', name: 'Nubank', bank: 'Nubank', last4: '2204', openingBalance: 1350, color: '#196e58' }
    ],
    cards: [
      { id: 'c2', name: 'Inter', bank: 'Inter', last4: '1130', limit: 3000, closingDay: 25, dueDay: 10, color: '#626d72' },
      { id: 'c1', name: 'Nubank', bank: 'Nubank', last4: '4821', limit: 6000, closingDay: 28, dueDay: 5, color: '#335768', validThru: '06/31', network: 'Mastercard' }
    ],
    categories: [
      { id: 'moradia', name: 'Moradia', kind: 'expense', color: '#5fa99b', icon: 'home' },
      { id: 'alimentacao', name: 'Alimentação', kind: 'expense', color: '#8fb0c0', icon: 'categories' },
      { id: 'outros', name: 'Outros', kind: 'expense', color: '#f0e5cf', icon: 'more' },
      { id: 'transporte', name: 'Transporte', kind: 'expense', color: '#729cab', icon: 'transactions' },
      { id: 'lazer', name: 'Lazer', kind: 'expense', color: '#b2d6cd', icon: 'goals' },
      { id: 'saude', name: 'Saúde', kind: 'expense', color: '#d5e0df', icon: 'goals' },
      { id: 'assinaturas', name: 'Assinaturas', kind: 'expense', color: '#5b998f', icon: 'reminders' },
      { id: 'compras', name: 'Compras', kind: 'expense', color: '#8caeb4', icon: 'wallet' },
      { id: 'salario', name: 'Salário', kind: 'income', color: '#5fa99b', icon: 'investments' },
      { id: 'rendimentos', name: 'Rendimentos', kind: 'income', color: '#8fb0c0', icon: 'investments' }
    ],
    transactions: [
      { id: 't1', description: 'Mercado Pão de Açúcar', amount: 286.4, date: '2026-09-26', kind: 'expense', categoryId: 'alimentacao', cardId: 'c1', confirmed: true, methodLabel: 'CARTÃO FÍSICO' },
      { id: 't2', description: 'Salário', amount: 6500, date: '2026-09-25', kind: 'income', categoryId: 'salario', accountId: 'a1', confirmed: true, methodLabel: 'TED' },
      { id: 't3', description: 'Aluguel', amount: 1850, date: '2026-09-25', kind: 'expense', categoryId: 'moradia', accountId: 'a1', confirmed: true, methodLabel: 'PIX' },
      { id: 't4', description: 'Uber', amount: 38.9, date: '2026-09-24', kind: 'expense', categoryId: 'transporte', cardId: 'c1', confirmed: true, methodLabel: 'CARTÃO VIRTUAL' },
      { id: 't5', description: 'Freela identidade visual', amount: 1350, date: '2026-09-23', kind: 'income', categoryId: 'rendimentos', accountId: 'a2', confirmed: true, methodLabel: 'PIX' },
      { id: 't6', description: 'Internet', amount: 119.9, date: '2026-09-30', kind: 'expense', categoryId: 'assinaturas', accountId: 'a1', confirmed: false, methodLabel: 'DÉBITO AUTOMÁTICO' },
      { id: 't7', description: 'Farmácia', amount: 74.2, date: '2026-09-22', kind: 'expense', categoryId: 'saude', accountId: 'a1', confirmed: true, methodLabel: 'CARTÃO FÍSICO' },
      { id: 't8', description: 'Cinema', amount: 62, date: '2026-09-21', kind: 'expense', categoryId: 'lazer', cardId: 'c2', confirmed: true, methodLabel: 'CARTÃO VIRTUAL' },
      { id: 't9', description: 'Feira', amount: 48, date: '2026-09-20', kind: 'expense', categoryId: 'alimentacao', accountId: 'a1', confirmed: true, methodLabel: 'DINHEIRO' }
    ],
    investments: [
      { id: 'i1', name: 'Tesouro Selic', amount: 3000, currentValue: 3200, date: '2026-03-10', type: 'Renda fixa' },
      { id: 'i2', name: 'CDB 110% do CDI', amount: 2000, currentValue: 2040, date: '2026-06-08', type: 'Renda fixa' },
      { id: 'i3', name: 'Fundo imobiliário', amount: 1000, currentValue: 1000, date: '2026-09-12', type: 'FII' }
    ],
    goals: [
      { id: 'g1', name: 'Reserva de emergência', saved: 9000, target: 15000, deadline: '2027-12-01' },
      { id: 'g2', name: 'Viagem para a Chapada', saved: 2100, target: 6000, deadline: '2027-07-01' },
      { id: 'g3', name: 'Notebook novo', saved: 1800, target: 4500, deadline: '2027-03-01' }
    ],
    budgets: { alimentacao: 1000, transporte: 600, lazer: 500, assinaturas: 200 },
    categoryAmounts: { moradia: 1850, alimentacao: 1120.4, outros: 533.8, transporte: 486, lazer: 412.3, compras: 315.7, assinaturas: 120, saude: 74.2 },
    reminders: [
      { title: 'Internet', date: '2026-09-30', amount: 119.9, sub: 'débito automático · no dia, às 9h' },
      { title: 'Fatura Nubank', date: '2026-10-05', amount: 1982.3, sub: 'avisos em 02/out e 05/out, às 9h' },
      { title: 'Aluguel', date: '2026-10-05', amount: 1850, sub: 'pix · no dia, às 9h' },
      { title: 'Fatura Inter', date: '2026-10-10', amount: 640, sub: 'avisos em 07/out e 10/out, às 9h' }
    ]
  };

  function profile() { return demo ? sample : Store.profile(); }
  /* O CANCELADO NÃO SOME DA LISTA
     Calc.entries filtra o cancelado de todo total — inclusive do
     previsto —, que é o certo. Mas tirá-lo também da LISTA o tornaria
     irreversível: quem cancelou por engano não teria onde desfazer.
     Aqui ele volta, marcado, e a lista o mostra riscado. */
  function currentTransactions(opcoes) {
    if (demo) return sample.transactions.filter((t) => ymOf(t.date) === state.ym);
    try {
      const todos = Calc.entriesForMonth(state.ym, null, { incluirCancelados: true });
      return todos
        .filter((t) => (opcoes && opcoes.comCancelados) || !t.cancelado)
        .map((t) => ({ ...t, id: t.txId, kind: t.kind, confirmed: t.confirmed, cancelado: !!t.cancelado }));
    } catch (e) { console.error('V3/lançamentos:', e); return []; }
  }
  function totals() {
    if (demo) return { income: 7850, expense: 4912.4, balance: 2937.6 };
    try { return Calc.monthTotals(state.ym); }
    catch (e) { console.error('V3/totais:', e); return { income: 0, expense: 0, balance: 0 }; }
  }
  function invested() {
    if (demo) return 6240;
    try { return Calc.investedTotal(U.monthEnd(state.ym)); }
    catch (e) { return profile().investments.reduce((s, x) => s + (+x.currentValue || +x.amount || 0), 0); }
  }
  function balance() {
    if (demo) return sample.balance;
    try { return Calc.netWorth(U.monthEnd(state.ym)); }
    catch (e) { return 0; }
  }
  function accountsBalance() {
    if (demo) return sample.accountsBalance;
    try { return Calc.totalAccountsBalance(U.monthEnd(state.ym)); }
    catch (e) { return 0; }
  }
  function categoryName(id) { return (profile().categories.find((c) => c.id === id) || {}).name || 'Sem categoria'; }
  function categoryIcon(name) { const map={house:'home',utensils:'utensils',car:'car','heart-pulse':'heart','gamepad-2':'leisure',repeat:'subscription','circle-ellipsis':'more',banknote:'investments','trending-up':'investments','graduation-cap':'education','shopping-bag':'shopping',receipt:'receipt',briefcase:'work','arrow-left-right':'exchange',tag:'sales'}; return map[name] || name; }
  function categoryTotals(kind) {
    if (demo && kind === 'expense') return Object.entries(sample.categoryAmounts).map(([id,value]) => ({ id, name: categoryName(id), value, color: sample.categories.find((c) => c.id === id).color })).sort((a,b) => b.value - a.value);
    const map = new Map();
    currentTransactions().filter((t) => t.confirmed && t.kind === kind).forEach((t) => map.set(t.categoryId || 'other', (map.get(t.categoryId || 'other') || 0) + +t.amount));
    return [...map].map(([id, value]) => ({ id, name: categoryName(id), value, color: safeColor((profile().categories.find((c) => c.id === id) || {}).color) })).sort((a, b) => b.value - a.value);
  }
  function items() {
    return [...profile().accounts.filter((a) => !a.archived).map((a) => ({ kind: 'debit', data: a })), ...profile().cards.map((c) => ({ kind: 'credit', data: c }))];
  }
  function walletItems() { return items().filter((x) => x.kind === state.walletKind); }
  function itemById(id) { return items().find((x) => x.data.id === id); }
  function selectedItem() { return walletItems().find((x) => x.data.id === state.selected) || walletItems()[0] || null; }
  function navButton(page) { return `<button class="v3-nav${state.page === page ? ' is-active' : ''}" type="button" data-go="${page}">${icon(page)}<span>${esc(names[page])}</span></button>`; }
  function renderNav() {
    $('#v3-desktop-nav').innerHTML = ['home','transactions','wallet'].map(navButton).join('') + '<span class="v3-nav-label">MAIS</span>' + ['investments','categories','goals','calendar','reminders','settings','plan'].map(navButton).join('');
    $('#v3-mobile-nav').innerHTML = ['home','transactions'].map((p) => `<button type="button" data-go="${p}" class="${state.page === p ? 'is-active' : ''}">${icon(p)}${esc(names[p])}</button>`).join('') + '<button type="button" data-action="new" class="v3-bottom-plus" aria-label="Novo lançamento">+</button>' + ['wallet','more'].map((p) => `<button type="button" data-go="${p}" class="${(p === 'more' ? !['home','transactions','wallet'].includes(state.page) : state.page === p) ? 'is-active' : ''}">${icon(p)}${esc(names[p])}</button>`).join('');
  }
  function renderHead() {
    $('#v3-title').textContent = names[state.page] || 'início';
    $('#v3-eyebrow').textContent = ['home','transactions','wallet'].includes(state.page) ? (state.page === 'transactions' ? niceMonth(state.ym) : 'VISÃO GERAL') : 'MAIS';
    $('.v3-top').dataset.home = state.page === 'home' ? 'true' : 'false';
    $('#v3-period').innerHTML = `‹ &nbsp; ${esc(periodLabel(state.ym))} &nbsp; ›`;
    const owner = demo ? sample.owner : (Store.ownerName() || 'Seu OAZE');
    $('#v3-owner').textContent = owner;
    $('#v3-avatar').textContent = owner.trim().charAt(0).toLowerCase() || 'o';
    $('#v3-profile-name').textContent = demo ? 'OAZE mensal' : profile().name;
    $('#v3-demo-note').hidden = false;
    if (!demo) $('#v3-demo-note').textContent = global.V3Backend?.saving()
      ? 'Salvando na sua conta…' : 'Dados carregados da sua conta';
    $('#v3-coco-count').hidden = !demo;
    if (demo) $('#v3-coco-count').textContent = '4';
    const notificationCount = reminders().length;
    $('#v3-notification-dot').hidden = !notificationCount;
    $('#v3-notification-dot').textContent = notificationCount > 9 ? '9+' : String(notificationCount);
    $('[data-action="privacy"]').setAttribute('aria-pressed', String(state.hideMoney));
    $('[data-action="privacy"]').setAttribute('aria-label', state.hideMoney ? 'Mostrar valores' : 'Ocultar valores');
  }
  const BANK_NAMES = {
    bancodobrasil:'Banco do Brasil', btg:'BTG Pactual', c6:'C6 Bank', efibank:'Efí Bank',
    itau:'Itaú', mercadopago:'Mercado Pago', ngcash:'NG.CASH', nubank:'Nubank',
    pagbank:'PagBank', pan:'Banco PAN', picpay:'PicPay', sicoob:'Sicoob',
    sicredi:'Sicredi', xp:'XP', bs2:'Banco BS2', bv:'Banco BV', bmg:'Banco BMG',
    asaas:'Asaas', infinitepay:'InfinitePay', ton:'Ton', iugu:'Iugu',
    agibank:'Agibank', bradesco:'Bradesco', caixa:'Caixa', cora:'Cora',
    digio:'Digio', inter:'Inter', mercantil:'Mercantil', neon:'Neon',
    next:'Next', nomad:'Nomad', original:'Original', paypal:'PayPal',
    revolut:'Revolut', rico:'Rico', safra:'Safra', santander:'Santander',
    stone:'Stone', wise:'Wise', avenue:'Avenue'
  };
  const BANK_GROUPS = [
    ['Bancos e cooperativas', 'agibank bancodobrasil bmg bradesco bs2 btg bv c6 caixa digio inter itau mercantil neon next nubank original pan safra santander sicoob sicredi'],
    ['Contas digitais e pagamentos', 'asaas cora efibank infinitepay iugu mercadopago ngcash pagbank paypal picpay stone ton'],
    ['Investimentos e exterior', 'avenue nomad revolut rico wise xp']
  ];
  const CARD_PLASTIC = { itau:'#F3BC45', bancodobrasil:'#F8D71A', c6:'#242424',
    xp:'#20252A', btg:'#0F3978', safra:'#1D2959', nomad:'#FFCE04',
    mercadopago:'#00AEEF', pan:'#0098DA', bv:'#223AD2', paypal:'#253B80',
    iugu:'#202020', ngcash:'#222222', revolut:'#262626', wise:'#9FE870' };
  function bankKey(name) { return global.Icons?.bankKey(name) || null; }
  function bankBrand(name, fallback) {
    const key=bankKey(name), preset=global.BancosBR?.PRESETS?.[key];
    return safeColor(CARD_PLASTIC[key] || (preset?.fundo === '#FFFFFF' ? preset.cor : preset?.fundo) || fallback || '#355565');
  }
  function cardInk(hex) {
    const rgb=[1,3,5].map((i)=>parseInt(hex.slice(i,i+2),16)/255);
    const l=rgb.map((v)=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);
    return .2126*l[0]+.7152*l[1]+.0722*l[2]>.38?'#14212A':'#F8F4E9';
  }
  function bankLogo(name, color) { return global.Icons?.bank(name, 26, color).outerHTML || icon('wallet'); }
  function walletItemValue(item) {
    if (!item) return 0;
    if (demo) return item.kind === 'credit'
      ? Number(sample.cardInvoices[item.data.id] || 0)
      : Number(item.data.openingBalance || 0);
    try { return item.kind === 'credit'
      ? Number(Calc.invoice(item.data.id, state.ym)?.planned || 0)
      : Number(Calc.accountBalance(item.data.id, U.monthEnd(state.ym)) || 0); }
    catch (e) { return 0; }
  }
  function bankPicker(selected) {
    const known=global.BancosBR?.PRESETS || {};
    const selectedKey=bankKey(selected);
    const groups=BANK_GROUPS.map(([label, keys], index)=>`<details class="v3-bank-group" ${index===0?'open':''}><summary>${esc(label)}</summary><div class="v3-bank-options">${keys.split(' ').filter((key)=>known[key]).map((key)=>{
      const name=BANK_NAMES[key] || key, color=bankBrand(name), ink=cardInk(color);
      return `<label class="v3-bank-option"><input type="radio" name="bank" value="${esc(name)}" ${key==='itau'?'required':''} ${selectedKey===key?'checked':''}><span class="v3-bank-option-logo" style="--bank-bg:${color};--bank-ink:${ink}">${bankLogo(name,ink)}</span><span>${esc(name)}</span></label>`;
    }).join('')}</div></details>`).join('');
    return `<fieldset class="v3-bank-picker"><legend>BANCO OU INSTITUIÇÃO</legend><p>Escolha a instituição; o nome da conta pode ser personalizado.</p>${groups}<label class="v3-bank-option v3-bank-other"><input type="radio" name="bank" value="Outro" ${selected && !selectedKey?'checked':''}><span class="v3-bank-option-logo">${icon('wallet')}</span><span>Outro</span></label><label>Se escolheu Outro, informe a instituição<input name="customBank" maxlength="60" value="${esc(selected && !selectedKey && selected!=='Outro'?selected:'')}" placeholder="Nome da instituição"></label></fieldset>`;
  }
  function cardButton(item, selected, i) {
    const d = item.data, name = d.bank || d.name;
    const plastic=bankBrand(name,d.color), ink=cardInk(plastic);
    const last=String(d.last4||'').replace(/\D/g,'').slice(-4);
    return `<button type="button" data-select="${esc(d.id)}" aria-pressed="${selected}" aria-label="${esc(name)} ${item.kind==='credit'?'crédito':'débito'} ${last?'final '+esc(last):''}" class="v3-wallet-item${selected ? ' is-selected' : ''}" style="--deck-i:${i || 0};--card-plastic:${plastic};--card-ink:${ink}"><span class="v3-card-top"><span class="v3-bankmark">${bankLogo(name,ink)}</span><strong>${esc(name)}</strong><span class="v3-type">${item.kind === 'credit' ? 'CRÉDITO' : 'DÉBITO'}</span></span><span class="v3-card-body" aria-hidden="${!selected}"><span class="v3-card-number"><small>${item.kind==='credit'?'NÚMERO DO CARTÃO':'NÚMERO DA CONTA'}</small><span>${item.kind==='credit'?'••••  ••••  ••••  ':''}${esc(last||'••••')}</span></span><span class="v3-chip" aria-hidden="true"></span><span class="v3-contactless" aria-hidden="true">${icon('contactless')}</span><span class="v3-card-footer"><span><small>TITULAR</small>${esc((demo ? 'ANA SOUZA' : Store.ownerName() || 'TITULAR').toUpperCase())}</span>${d.validThru?`<span><small>VALIDADE</small>${esc(d.validThru)}</span>`:''}<em>${esc(d.network || (item.kind === 'credit' ? 'CRÉDITO' : 'DÉBITO'))}</em></span></span></button>`;
  }
  /* O bolso fala do cartão do meio, e muda enquanto o dedo arrasta.
     Reescrever só estes três nós, e não a tela inteira, é o que
     permite o número acompanhar o gesto: um render no meio do
     arrasto destruiria o cartão que está na mão. */
  function atualizarBolso(id) {
    const bolso = $('.v3-wallet-pocket');
    if (!bolso) return;
    const item = itemById(id);
    if (!item) return;
    state.selected = id;
    const credit = item.kind === 'credit';
    const rot = bolso.querySelector('.v3-label');
    const val = bolso.querySelector('.v3-money');
    const meta = bolso.querySelector('.v3-muted');
    if (rot) rot.textContent = `${credit ? 'FATURA' : 'SALDO'} · ${item.data.bank || item.data.name}`;
    if (val) val.textContent = money(walletItemValue(item));
    if (meta) meta.textContent = `${credit ? 'Cartão' : 'Conta'} ${item.data.last4 ? 'final ' + item.data.last4 : 'selecionado(a)'}`;
  }

  /* Remontado a cada render porque a V3 redesenha por innerHTML: o
     gesto e a mola morrem junto com os nós antigos. */
  let carrossel = null;
  function montarCarteira() {
    if (carrossel) { carrossel.destruir(); carrossel = null; }
    const raiz = $('.v3-wallet.is-open');
    if (!raiz || !global.V3Carteira) return;
    carrossel = V3Carteira.montar(raiz, {
      superficie: 'v3-' + state.walletKind,
      inicial: state.selected,
      aoTrocar: atualizarBolso
    });
  }

  function wallet(pocketLabel, expanded) {
    const list = walletItems();
    /* Aberta, a carteira mostra UM cartão — o último que foi aberto.
       Fechada, mostra o total. Era essa a diferença entre um índice
       de cartões e uma carteira. */
    const chosen = state.walletOpen && list.length ? selectedItem() : null;
    const tabs=`<div class="v3-wallet-head"><span class="v3-label">SUA CARTEIRA</span><div class="v3-wallet-tabs" role="group" aria-label="Visualizar contas ou cartões"><button type="button" data-wallet-kind="debit" aria-pressed="${state.walletKind==='debit'}" class="${state.walletKind==='debit'?'is-active':''}">Débito</button><button type="button" data-wallet-kind="credit" aria-pressed="${state.walletKind==='credit'}" class="${state.walletKind==='credit'?'is-active':''}">Crédito</button></div></div>`;
    if (!items().length) return `<div class="v3-panel v3-empty"><img src="/assets/brand/oaze-isologo.svg" alt=""><h2>sua carteira começa aqui</h2><p>Adicione uma conta ou cartão para ver seus saldos neste bolso.</p><button type="button" data-action="add-account" class="v3-primary" style="margin-top:20px">Adicionar conta</button></div>`;
    const credit=state.walletKind==='credit';
    const total=chosen ? walletItemValue(chosen) : credit ? list.reduce((sum,item)=>sum+walletItemValue(item),0) : accountsBalance();
    const summaryLabel=chosen ? `${credit?'FATURA':'SALDO'} · ${chosen.data.bank || chosen.data.name}` : credit?'FATURAS ABERTAS':'SALDO EM CONTAS';
    const summaryMeta=chosen ? `${credit?'Cartão':'Conta'} ${chosen.data.last4?'final '+esc(chosen.data.last4):'selecionado(a)'}` : credit?`${list.length} cartão(ões) de crédito`:`${list.length} conta(s) de débito`;
    return `<section class="v3-wallet${expanded ? ' v3-wallet-expanded' : ''}${chosen?' has-selected':''}${state.walletOpen?' is-open':' is-closed'}" aria-label="Carteira de ${credit?'crédito':'débito'}">${tabs}<div class="v3-wallet-stack"><div class="v3-wallet-list" id="v3-wallet-list" aria-hidden="${!state.walletOpen}" ${state.walletOpen?'':'inert'}>${list.length?list.map((x,i)=>cardButton(x,chosen?.data.id===x.data.id,i)).join(''):`<div class="v3-wallet-no-cards">Nenhum ${credit?'cartão de crédito':'conta de débito'} neste espaço.</div>`}</div>${list.length>1?`<button class="v3-carteira-seta v3-carteira-ant" type="button" data-carteira-ant aria-label="Cartão anterior"><span aria-hidden="true">&lsaquo;</span></button><button class="v3-carteira-seta v3-carteira-prox" type="button" data-carteira-prox aria-label="Próximo cartão"><span aria-hidden="true">&rsaquo;</span></button><div class="v3-carteira-pontos" aria-hidden="true">${list.map(()=>'<i data-carteira-ponto></i>').join('')}</div>`:''}<button class="v3-wallet-pocket" type="button" data-action="wallet-toggle" aria-expanded="${state.walletOpen}" aria-controls="v3-wallet-list"><img class="v3-pocket-logo" src="/assets/brand/oaze-isologo-mono-milk.svg" alt=""><span class="v3-label">${esc(summaryLabel)}</span><strong class="v3-money v3-sensitive">${money(total)}</strong><span class="v3-muted">${summaryMeta}</span><span class="v3-pocket-hint">Toque na carteira para ${state.walletOpen?'fechar':'abrir'} <span class="v3-pocket-chevron" aria-hidden="true">⌃</span></span></button></div></section>`;
  }
  function quickActions() { return `<div class="v3-quick">${[['Despesa','down'],['Receita','arrow'],['Transferir','transactions'],['Aporte','investments']].map(([n,i]) => `<button type="button" data-action="new" data-kind="${n.toLowerCase()}">${icon(i)}${n}</button>`).join('')}</div>`; }
  function chartPath() {
    if (demo) return 'M0 120 C85 105 140 65 200 59 S305 128 375 110 S485 42 550 38 S660 80 720 68';
    const count = +state.ym.slice(5) === 2 ? new Date(+state.ym.slice(0,4), 2, 0).getDate() : new Date(+state.ym.slice(0,4), +state.ym.slice(5), 0).getDate();
    const byDay = Array(count).fill(0);
    currentTransactions().filter((x) => x.confirmed && ['income','expense'].includes(x.kind)).forEach((x) => {
      const day = Number(String(x.date).slice(8,10)) - 1;
      if (day >= 0 && day < count) byDay[day] += (x.kind === 'income' ? 1 : -1) * Number(x.amount || 0);
    });
    let sum = 0; const values = byDay.map((x) => (sum += x));
    const min = Math.min(0,...values), max = Math.max(0,...values), range = Math.max(1,max-min);
    return 'M' + values.map((v,i) => `${(i * 720 / Math.max(1,count-1)).toFixed(1)} ${(135 - (v-min)/range*105).toFixed(1)}`).join(' L');
  }
  function wave() {
    const t = totals();
    const path=chartPath();
    return `<section class="v3-panel v3-wave"><div class="v3-row"><div><span class="v3-label">SOBRA DE ${esc(niceMonth(state.ym).split(' de ')[0].toUpperCase())}</span><strong class="v3-money v3-sensitive">${money(t.balance)}</strong></div><div class="v3-meta"><div><span class="v3-label">ENTROU</span><strong class="v3-mono v3-positive v3-sensitive">▲ ${money(t.income)}</strong></div><div><span class="v3-label">SAIU</span><strong class="v3-mono v3-negative v3-sensitive">▼ ${money(t.expense)}</strong></div></div></div><button class="v3-wave-period" type="button" data-action="period">‹ &nbsp; ${esc(periodLabel(state.ym))} &nbsp; ›</button>${(demo || currentTransactions().length) ? `<svg viewBox="0 0 720 150" preserveAspectRatio="none" aria-label="${demo?'Curva de exemplo':'Fluxo acumulado dos lançamentos confirmados no mês'}"><path d="${path} L720 150 H0 Z" fill="rgba(95,169,155,.16)"/><path d="${path}" fill="none" stroke="#5fa99b" stroke-width="3"/>${demo?'<line x1="550" y1="38" x2="550" y2="150"/><circle cx="550" cy="38" r="5" fill="#0d1821" stroke="#5fa99b" stroke-width="2"/>':''}</svg><div class="v3-axis"><span>01</span><span>08</span><span>15</span><span>22</span><span>30</span></div>` : '<p class="v3-muted" style="margin:auto 0">A curva aparece quando houver movimentações no mês.</p>'}</section>`;
  }
  function categoryBars(max) {
    const rows = categoryTotals('expense').slice(0, max || 5), total = rows.reduce((n, x) => n + x.value, 0);
    if (!rows.length) return '<p class="v3-muted">Suas categorias aparecem depois da primeira despesa confirmada.</p>';
    return rows.map((r) => `<div class="v3-cat-row" style="--swatch:${safeColor(r.color)}"><span class="v3-cat-icon">${icon(categoryIcon((profile().categories.find((c) => c.id === r.id) || {}).icon) || 'categories')}</span><span><strong>${esc(r.name)}</strong><div class="v3-bar"><span style="width:${pct(100 * r.value / total)}%"></span></div></span><span class="v3-mono v3-sensitive">${money(r.value)}</span></div>`).join('');
  }
  function upcoming() {
    const rs = reminders().slice(0, 3);
    if (!rs.length) return '<p class="v3-muted">Nenhum vencimento próximo registrado.</p>';
    return `<div class="v3-timeline">${rs.map((r) => `<div><span><small class="v3-mono">${esc(shortDate(r.date).toUpperCase())} · ${esc(r.sub || 'previsto')}</small><strong>${esc(r.title)}</strong></span><span class="v3-mono v3-negative v3-sensitive" style="margin-left:auto">− ${money(r.amount)}</span></div>`).join('')}</div>`;
  }
  function renderHome() {
    if (!demo && !items().length && !currentTransactions().length) return `<div class="v3-panel v3-empty"><img src="/assets/brand/oaze-isologo.svg" alt=""><h2>seu painel começa aqui</h2><p>Cadastre onde seu dinheiro está. Depois, o OAZE mostra a carteira, a sobra do mês e o que precisa da sua atenção.</p>${quickActions()}<button type="button" data-action="add-account" class="v3-primary" style="margin-top:15px">Cadastrar primeira conta</button></div>`;
    const owner=demo?sample.owner:Store.ownerName()||'seu espaço';
    const hour=new Date().getHours(), greeting=hour<12?'bom dia':hour<18?'boa tarde':'boa noite';
    return `<div class="v3-mobile-greeting"><span class="v3-avatar">${esc(owner.charAt(0))}</span><span><small>${greeting},</small><strong>${esc(owner)}</strong></span></div><div class="v3-grid v3-home"><div class="v3-stack">${wallet('SALDO TOTAL',false)}${quickActions()}<button class="v3-coco-call" type="button" data-action="coco"><img src="/assets/coco/corpo-neutra_acolhedora.webp" alt=""><span>${demo ? 'Quatro coisas para ver' : 'Conversar com a Coco'}</span>›</button></div><div class="v3-stack">${wave()}<div class="v3-grid v3-half"><section class="v3-panel"><div class="v3-row"><h2>onde foi o mês</h2><button type="button" class="v3-link" data-go="categories">ver tudo</button></div>${categoryBars(5)}</section><section class="v3-panel"><h2>até o fim do mês</h2>${upcoming()}</section></div></div></div>`;
  }
  function renderTransactions() {
    const rows = currentTransactions({ comCancelados: true }).filter((t) => state.filter === 'Todos' || (state.filter === 'Crédito' ? !!t.cardId : state.filter === 'Débito' ? !t.cardId : state.filter === 'Cartões' ? !!t.cardId : (t.methodLabel || '').toUpperCase().includes('PIX'))).sort((a, b) => b.date.localeCompare(a.date));
    const t = totals();
    const cells = rows.map((x) => {
      const card = profile().cards.find((c) => c.id === x.cardId) || profile().accounts.find((a) => a.id === x.accountId);
      const method = x.methodLabel || (x.cardId ? 'CARTÃO' : x.kind === 'transfer' ? 'TRANSFERÊNCIA' : 'CONTA');
      return `<div class="v3-tx${x.cancelado ? ' is-cancelada' : x.confirmed ? '' : ' is-pending'}"><span class="v3-mini-card" style="--card-light:${esc((card || {}).color || '#446779')};--card-dark:#1d3442" data-last="${esc((card || {}).last4 || '')}"></span><span class="v3-mono v3-muted">${esc(shortDate(x.date))}</span><button class="v3-tx-open" type="button" data-transaction="${esc(x.id)}" aria-label="Editar ${esc(x.description)}">${esc(x.description)}</button><span>${esc(categoryName(x.categoryId))}<small class="v3-mobile-only">${esc(shortDate(x.date))} · ${esc(method)}</small></span><span class="v3-mono">${esc(method)}</span><span class="v3-mono ${x.kind === 'income' ? 'v3-positive' : 'v3-negative'} v3-sensitive">${x.kind === 'income' ? '+' : '−'} ${money(x.amount)}</span><button class="v3-status${x.cancelado ? ' is-cancel' : x.confirmed ? ' is-done' : ''}" type="button" data-confirm="${esc(x.id)}" data-confirm-month="${esc(x.ym || ymOf(x.date))}" aria-label="${x.cancelado ? 'Cancelado — tocar para voltar a pago' : x.confirmed ? 'Pago — tocar para marcar como não pago' : 'Não pago — tocar para cancelar'}" title="${x.cancelado ? 'Cancelado' : x.confirmed ? 'Pago' : 'Não pago'}">${x.cancelado ? '🚫' : x.confirmed ? '✓' : '✗'}</button></div>`;
    }).join('');
    return `<div class="v3-transactions"><div class="v3-trans-head"><div class="v3-filter">${['Todos','Pix','Cartões','Débito','Crédito'].map((f) => `<button type="button" data-filter="${f}" class="v3-pill${state.filter === f ? ' is-active' : ''}">${f}</button>`).join('')}</div><div class="v3-totals"><div><span class="v3-label">ENTROU</span><strong class="v3-positive v3-sensitive">▲ ${money(t.income)}</strong></div><div><span class="v3-label">SAIU</span><strong class="v3-negative v3-sensitive">▼ ${money(t.expense)}</strong></div></div></div><p class="v3-muted">Só o que está confirmado entra nos totais. ${demo ? 'Na demonstração, os controles não alteram sua conta.' : 'Toque no círculo para confirmar.'}</p><section class="v3-panel v3-table"><div class="v3-table-header"><span>CARTÃO</span><span>DATA</span><span>DESCRIÇÃO</span><span>CATEGORIA</span><span>COMO FOI PAGO</span><span>VALOR</span><span></span></div>${cells || '<p class="v3-muted" style="padding:20px 0">Nenhum lançamento neste filtro.</p>'}</section></div>`;
  }
  function renderWallet() {
    const chosen = state.walletOpen && state.selected ? selectedItem() : null;
    const related = chosen ? currentTransactions().filter((x) => x.cardId === chosen.data.id || x.accountId === chosen.data.id).slice(0, 8) : [];
    const itemAmount=walletItemValue(chosen);
    return `<div class="v3-grid v3-account-layout"><div>${wallet('SALDO EM CONTAS',true)}<button class="v3-wallet-add" type="button" data-action="add-account">＋ &nbsp; Adicionar conta ou cartão</button></div><section class="v3-panel v3-detail">${chosen ? `<div class="v3-row"><div><span class="v3-label">${chosen.kind === 'credit' ? `FATURA DE ${esc(niceMonth(state.ym).split(' de ')[0].toUpperCase())}` : 'EXTRATO DA CONTA'}</span><h2>${esc(chosen.data.bank || chosen.data.name)} •• ${esc(chosen.data.last4 || '••••')}</h2><small>${chosen.kind === 'credit' ? `fecha dia ${esc(chosen.data.closingDay)} · vence dia ${esc(chosen.data.dueDay)}` : 'Movimentações confirmadas'}</small></div><strong class="v3-money v3-sensitive">${money(itemAmount)}</strong></div>${chosen.kind === 'credit' ? `<div style="margin-top:16px"><small>Limite usado · ${money(itemAmount)} de ${money(chosen.data.limit)}</small><div class="v3-bar"><span style="width:${pct(100 * itemAmount / (+chosen.data.limit || 1))}%"></span></div></div>` : ''}<div class="v3-detail-actions"><button class="v3-primary" type="button" data-action="new">Novo lançamento</button><button class="v3-secondary" type="button" data-action="edit-wallet-item" data-wallet-id="${esc(chosen.data.id)}">Editar ${chosen.kind==='credit'?'cartão':'conta'}</button>${chosen.kind==='credit'?`<button class="v3-secondary" type="button" data-action="pay-invoice" data-wallet-id="${esc(chosen.data.id)}">Pagar fatura</button>`:''}</div>${related.length ? related.map((x) => `<div class="v3-detail-row"><span class="v3-mono v3-muted">${esc(shortDate(x.date))}</span><strong>${esc(x.description)}</strong><span class="v3-mono">${esc(x.methodLabel || (x.cardId ? 'CARTÃO' : 'CONTA'))}</span><span class="v3-mono ${x.kind==='income'?'v3-positive':'v3-negative'} v3-sensitive">${x.kind==='income'?'+':'−'} ${money(x.amount)}</span></div>`).join('') : '<p class="v3-muted">Nenhum movimento deste item no período.</p>'}` : (items().length ? `<h2>escolha uma conta ou cartão</h2><p class="v3-muted">${state.walletOpen?'Toque no item que quer acompanhar.':'Abra a carteira e toque no item que quer acompanhar.'}</p>` : '<h2>adicione uma conta ou cartão</h2><p class="v3-muted">A carteira mostrará faturas e extratos reais aqui.</p>')}</section></div>`;
  }
  function renderInvestments() {
    const at = U.monthEnd(state.ym), list = (profile().investments || []).filter((x) => x.date <= at).slice().sort((a, b) => b.date.localeCompare(a.date));
    const valueAt = (x) => demo ? Number(x.currentValue == null ? x.amount : x.currentValue) || 0 : Calc.investmentValueAt(x, at, profile());
    const total = list.reduce((sum, x) => sum + valueAt(x), 0);
    const contributed = list.reduce((sum, x) => sum + Number(x.amount || 0), 0);
    const gain = total - contributed, sim = state.sim;
    const monthlyRate = Math.pow(1 + sim.taxa / 100, 1 / 12) - 1;
    const estimate = monthlyRate ? sim.aporte * ((Math.pow(1 + monthlyRate, sim.meses) - 1) / monthlyRate) : sim.aporte * sim.meses;
    const byType = new Map();
    list.forEach((x) => byType.set(x.type || 'Outro', (byType.get(x.type || 'Outro') || 0) + valueAt(x)));
    const colors = ['#5fa99b', '#8fb0c0', '#f0e5cf', '#729cab'];
    const distribution = [...byType].map(([name, value], i) => ({ name, value, color: colors[i % colors.length] })).filter((x) => x.value > 0);
    const first = list.length ? list.reduce((min, x) => x.date < min ? x.date : min, list[0].date) : null;
    const series = !demo && first ? Calc.investmentSeries(ymOf(first), state.ym, profile()).slice(-12) : [];
    const max = Math.max(1, ...series.map((x) => x.value));
    const chart = series.length > 1 ? `M${series.map((x, i) => `${(i * 720 / (series.length - 1)).toFixed(1)} ${(138 - x.value / max * 115).toFixed(1)}`).join(' L')}` : '';
    const rows = list.map((x) => `<div class="v3-invest-row"><span><strong>${esc(x.name)}</strong><small>${esc(x.type || 'Outro')} · ${esc(shortDate(x.date))}</small></span><span><strong class="v3-mono v3-sensitive">${money(valueAt(x))}</strong><small>Aportado: ${money(x.amount)}</small></span><button type="button" data-investment="${esc(x.id)}" aria-label="Editar ${esc(x.name)}">Editar</button></div>`).join('');
    return `<div class="v3-invest-page"><div class="v3-grid v3-invest"><div class="v3-stack"><section class="v3-panel v3-wave"><span class="v3-label">PATRIMÔNIO INVESTIDO</span><div class="v3-row"><strong class="v3-money v3-sensitive">${money(total)}</strong><span class="v3-mono ${gain >= 0 ? 'v3-positive' : 'v3-negative'} v3-sensitive">${gain >= 0 ? '+' : '−'} ${money(Math.abs(gain))} sobre o aportado</span></div>${chart ? `<svg viewBox="0 0 720 150" preserveAspectRatio="none" aria-label="Evolução estimada dos investimentos"><path d="${chart}" fill="none" stroke="#5fa99b" stroke-width="3"/></svg><div class="v3-axis"><span>${esc(periodLabel(series[0].ym))}</span><span>${esc(periodLabel(state.ym))}</span></div>` : '<p class="v3-muted" style="margin:auto 0">A evolução aparece depois de dois meses de aportes.</p>'}</section><section class="v3-panel"><div class="v3-row"><h2>seus aportes</h2><button type="button" class="v3-link" data-action="add-investment">Novo aporte</button></div>${rows || '<p class="v3-muted">Nenhum aporte registrado neste período.</p>'}</section></div><div class="v3-stack"><section class="v3-panel"><h2>distribuição por tipo</h2>${distribution.length ? `<div class="v3-distribution">${distribution.map((x) => `<span style="width:${pct(100 * x.value / total)}%;background:${x.color}"></span>`).join('')}</div>${distribution.map((x) => `<div class="v3-row v3-invest-mix"><strong><i style="background:${x.color}"></i>${esc(x.name)}</strong><span class="v3-mono v3-sensitive">${Math.round(100 * x.value / total)}% · ${money(x.value)}</span></div>`).join('')}` : '<p class="v3-muted">A distribuição aparece com o primeiro aporte.</p>'}</section><section class="v3-panel"><h2>simular juros compostos</h2><div class="v3-range">${[['aporte','Aporte mensal',50,5000,50,money(sim.aporte)],['taxa','Taxa ao ano',0,30,0.5,`${sim.taxa}%`],['meses','Prazo',1,360,1,`${sim.meses} meses`]].map(([key,label,min,max,step,value]) => `<label><span><strong>${label}</strong><strong class="v3-mono">${value}</strong></span><input type="range" data-sim="${key}" min="${min}" max="${max}" step="${step}" value="${sim[key]}"></label>`).join('')}</div><div class="v3-estimate"><span class="v3-label">ESTIMATIVA AO FINAL</span><strong class="v3-money">${money(estimate)}</strong><p class="v3-muted">${money(estimate - sim.aporte * sim.meses)} de juros estimados. Não é promessa de rentabilidade.</p></div></section></div></div></div>`;
  }
  function renderCategories() {
    const rows = categoryTotals(state.catKind), total = rows.reduce((n,r)=>n+r.value,0);
    const defined=profile().categories.filter((c)=>c.kind===state.catKind).sort((a,b)=>a.name.localeCompare(b.name,'pt-BR'));
    let start=0; const stops = rows.length ? rows.map((r)=>{const prev=start;start+=100*r.value/total;return `${safeColor(r.color)} ${prev}% ${start}%`}).join(', ') : '#355565 0 100%';
    return `<div class="v3-stack"><div class="v3-row"><div class="v3-segment" style="max-width:330px"><button type="button" data-cat-kind="expense" class="${state.catKind==='expense'?'is-active':''}">Despesas</button><button type="button" data-cat-kind="income" class="${state.catKind==='income'?'is-active':''}">Receitas</button></div><button type="button" class="v3-link" data-action="add-category">Nova categoria</button></div><div class="v3-grid v3-categories"><section class="v3-panel"><div class="v3-donut" style="--donut:conic-gradient(${esc(stops)})" data-total="${esc(money(total))}"></div><p class="v3-muted" style="text-align:center">${rows.length ? `${esc(rows[0].name)} é ${Math.round(rows[0].value/total*100)}% do total em ${esc(niceMonth(state.ym).split(' de ')[0])}.` : 'As categorias aparecem com lançamentos confirmados.'}</p></section><div class="v3-cat-grid">${rows.map((r) => `<div class="v3-cat-tile"><span class="v3-cat-icon" style="--swatch:${safeColor(r.color)}">${icon(categoryIcon((profile().categories.find((c)=>c.id===r.id)||{}).icon) || 'categories')}</span><span><strong>${esc(r.name)}</strong><small>${Math.round(r.value/total*100)}% do total</small></span><strong class="v3-mono v3-sensitive">${money(r.value)}</strong></div>`).join('') || '<p class="v3-muted">Nenhuma movimentação confirmada neste período.</p>'}</div></div><section class="v3-panel"><div class="v3-row"><h2>suas categorias</h2><span class="v3-muted">${defined.length} cadastradas</span></div><div class="v3-cat-manage">${defined.map((c)=>`<button type="button" data-category="${esc(c.id)}"><span class="v3-cat-icon" style="--swatch:${safeColor(c.color)}">${icon(categoryIcon(c.icon))}</span><span>${esc(c.name)}</span><small>Editar ›</small></button>`).join('')}</div></section></div>`;
  }
  function renderGoals() {
    const gs = profile().goals || [], budgets = Object.entries(profile().budgets || {}).map(([id,limit]) => ({id,limit,used:(categoryTotals('expense').find((x)=>x.id===id)||{}).value||0}));
    const goalsHtml = gs.length ? gs.map((g) => `<section class="v3-panel v3-goal"><div class="v3-row"><h2>${esc(g.name)}</h2><button type="button" class="v3-link" data-goal="${esc(g.id)}">Editar</button></div><small class="v3-mono">${g.deadline ? 'até '+esc(shortDate(g.deadline)) : 'sem prazo'}</small><p class="v3-money v3-sensitive">${money(g.saved)} <span class="v3-muted" style="font:400 12px var(--mono)">de ${money(g.target)}</span></p><div class="v3-bar"><span style="width:${pct(100*g.saved/(g.target||1))}%"></span></div><p style="margin-top:12px">● &nbsp; Faltam ${money(Math.max(0,g.target-g.saved))}.</p></section>`).join('') : '<section class="v3-panel"><p class="v3-muted">Você ainda não definiu metas.</p></section>';
    const budgetsHtml = budgets.length ? budgets.map((b) => `<div class="v3-budget-row"><div class="v3-row"><strong>${esc(categoryName(b.id))}</strong><button type="button" class="v3-link" data-budget="${esc(b.id)}" aria-label="Editar orçamento de ${esc(categoryName(b.id))}">Editar</button></div><strong class="v3-mono v3-sensitive">${money(b.used)} / ${money(b.limit)}</strong><div class="v3-bar"><span style="width:${pct(100*b.used/b.limit)}%;background:${b.used>b.limit?'var(--blue)':'var(--teal)'}"></span></div><small>${b.used>b.limit?'Passou '+money(b.used-b.limit)+' do planejado.':'Restam '+money(b.limit-b.used)+' neste mês.'}</small></div>`).join('') : '<p class="v3-muted">Nenhum orçamento definido para categorias.</p>';
    return `<div class="v3-segment v3-mobile-only" style="margin-bottom:16px"><button type="button" data-goal-tab="goals" class="${state.goalTab==='goals'?'is-active':''}">Metas</button><button type="button" data-goal-tab="budgets" class="${state.goalTab==='budgets'?'is-active':''}">Orçamentos</button></div><div class="v3-grid v3-goals"><div class="v3-goal-column" data-column="goals"><div class="v3-row"><span class="v3-label v3-section-title">METAS</span><button type="button" class="v3-link" data-action="add-goal">Nova meta</button></div>${goalsHtml}</div><div class="v3-budget-column" data-column="budgets"><div class="v3-row"><span class="v3-label v3-section-title">ORÇAMENTOS DE ${esc(niceMonth(state.ym).split(' de ')[0].toUpperCase())}</span><button type="button" class="v3-link" data-action="add-budget">Novo orçamento</button></div><section class="v3-panel">${budgetsHtml}</section></div></div>`;
  }
  function reminders() {
    if (demo) return sample.reminders;
    const today = U.todayISO(), until = new Date(); until.setDate(until.getDate()+30); const max = until.toISOString().slice(0,10);
    const entries=Calc.entries(today,max,profile()).filter((entry)=>!entry.confirmed).map((entry)=>({id:entry.txId,title:entry.description,date:entry.date,amount:entry.amount,sub:categoryName(entry.categoryId)}));
    const bills=profile().cards.flatMap((card)=>[ymOf(today),U.addMonths(ymOf(today),1)].map((ym)=>Calc.invoice(card.id,ym,profile()))
      .filter((invoice)=>invoice&&invoice.restante>0&&invoice.dueDate>=today&&invoice.dueDate<=max)
      .map((invoice)=>({title:`Fatura ${invoice.card.name}`,date:invoice.dueDate,amount:invoice.restante,sub:'Cartão de crédito'})));
    return [...entries,...bills].sort((a,b)=>a.date.localeCompare(b.date));
  }
  function calendarEvents() {
    if (!demo) return Calc.calendarEvents(state.ym, profile());
    const grouped = {};
    sample.transactions.filter((t) => ymOf(t.date) === state.ym).forEach((t) => {
      const day = Number(t.date.slice(8));
      (grouped[day] ||= []).push({ tipo: t.kind === 'income' ? 'in' : 'out', titulo: t.description, valor: t.amount, confirmado: t.confirmed, categoria: categoryName(t.categoryId) });
    });
    sample.reminders.filter((r) => ymOf(r.date) === state.ym && r.title.startsWith('Fatura')).forEach((r) => {
      const day = Number(r.date.slice(8));
      (grouped[day] ||= []).push({ tipo: 'due', titulo: r.title, valor: r.amount, confirmado: false, categoria: 'Cartão de crédito' });
    });
    return grouped;
  }
  function renderCalendar() {
    const [year, month] = state.ym.split('-').map(Number);
    const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const offset = (new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 6) % 7;
    const today = U.todayISO();
    const day = Math.max(1, Math.min(days, Number(state.calDay) || (ymOf(today) === state.ym ? Number(today.slice(8)) : 1)));
    const events = calendarEvents(), selected = events[day] || [];
    const entries = Object.values(events).flat().filter((e) => e.tipo !== 'due');
    const incoming = entries.filter((e) => e.tipo === 'in' && e.confirmado).reduce((n, e) => n + Number(e.valor || 0), 0);
    const outgoing = entries.filter((e) => e.tipo === 'out' && e.confirmado).reduce((n, e) => n + Number(e.valor || 0), 0);
    const pending = entries.filter((e) => !e.confirmado).length;
    const cells = Array.from({ length: Math.ceil((offset + days) / 7) * 7 }, (_, index) => {
      const n = index - offset + 1;
      if (n < 1 || n > days) return '<span class="v3-cal-empty" aria-hidden="true"></span>';
      const iso = `${state.ym}-${String(n).padStart(2, '0')}`;
      const rows = events[n] || [];
      return `<button type="button" class="v3-cal-day${n === day ? ' is-active' : ''}${iso === today ? ' is-today' : ''}" data-cal-day="${n}" aria-label="${n} de ${esc(niceMonth(state.ym))}, ${rows.length} evento(s)" aria-pressed="${n === day}"><span>${n}</span><span class="v3-cal-marks" aria-hidden="true">${rows.slice(0, 3).map((e) => `<i class="${e.tipo === 'in' ? 'in' : e.tipo === 'due' ? 'due' : 'out'}"></i>`).join('')}</span></button>`;
    }).join('');
    return `<div class="v3-calendar"><div class="v3-row v3-cal-heading"><div><span class="v3-label">AGENDA FINANCEIRA</span><h2>${esc(niceMonth(state.ym))}</h2></div><div class="v3-cal-nav"><button type="button" data-cal-month="-1" aria-label="Mês anterior">‹</button><button type="button" data-cal-today>Hoje</button><button type="button" data-cal-month="1" aria-label="Próximo mês">›</button></div></div><div class="v3-cal-summary"><span><small>Recebido</small><strong class="v3-positive v3-sensitive">${money(incoming)}</strong></span><span><small>Pago</small><strong class="v3-negative v3-sensitive">${money(outgoing)}</strong></span><span><small>Pendente</small><strong>${pending} ${pending === 1 ? 'lançamento' : 'lançamentos'}</strong></span></div><div class="v3-grid v3-cal-layout"><section class="v3-panel v3-cal-grid" aria-label="Dias de ${esc(niceMonth(state.ym))}"><div class="v3-cal-weekdays">${['Seg','Ter','Qua','Qui','Sex','Sáb','Dom'].map((d) => `<span>${d}</span>`).join('')}</div><div class="v3-cal-days">${cells}</div></section><section class="v3-panel v3-cal-detail"><span class="v3-label">DIA ${String(day).padStart(2, '0')}</span><h2>${esc(shortDate(`${state.ym}-${String(day).padStart(2, '0')}`))}</h2>${selected.length ? selected.map((e) => `<div class="v3-cal-event"><span class="v3-cal-event-kind ${e.tipo === 'in' ? 'in' : e.tipo === 'due' ? 'due' : 'out'}"></span><span><strong>${esc(e.titulo)}</strong><small>${esc(e.categoria || (e.tipo === 'due' ? 'Vencimento' : 'Lançamento'))} · ${e.confirmado ? 'confirmado' : 'previsto'}</small></span><strong class="v3-mono v3-sensitive">${e.tipo === 'in' ? '+' : '−'} ${money(e.valor)}</strong></div>`).join('') : '<p class="v3-muted">Nada registrado neste dia.</p>'}<button type="button" class="v3-secondary" data-action="new" data-date="${state.ym}-${String(day).padStart(2, '0')}">Novo lançamento neste dia</button></section></div></div>`;
  }
  function renderReminders() {
    const rs = reminders();
    const recurring=demo?[]:profile().transactions.filter((t)=>t.recurring);
    return `<div class="v3-grid v3-reminders"><div><span class="v3-label v3-section-title">PRÓXIMOS 30 DIAS</span><section class="v3-panel" style="padding:0">${rs.length?rs.map((r)=>`<div class="v3-reminder-row"><span class="v3-date">${esc(r.date.slice(8,10))}<small>${esc(shortDate(r.date).split(' ')[1].toUpperCase())}</small></span><span><strong>${esc(r.title)}</strong><small>${esc(r.sub)}</small></span><strong class="v3-mono v3-negative v3-sensitive">${money(r.amount)}</strong>${r.id?`<button type="button" class="v3-link" data-transaction="${esc(r.id)}">Editar</button>`:''}</div>`).join(''):'<p class="v3-muted" style="padding:20px">Nenhum compromisso pendente registrado nos próximos 30 dias.</p>'}</section><section class="v3-panel" style="margin-top:16px"><div class="v3-row"><h2>lançamentos fixos</h2><button type="button" class="v3-link" data-action="new">Novo</button></div>${recurring.length?recurring.map((t)=>`<div class="v3-setting-row"><span><strong>${esc(t.description)}</strong><small>Todo dia ${esc(t.date.slice(8))}${t.recurEnd?' · até '+esc(periodLabel(t.recurEnd)):''}</small></span><strong class="v3-mono v3-sensitive">${money(t.amount)}</strong><button type="button" class="v3-link" data-transaction="${esc(t.id)}">Editar</button></div>`).join(''):'<p class="v3-muted">Nenhum lançamento fixo cadastrado. Ao criar um lançamento, marque “Repetir mensalmente”.</p>'}</section></div><div><span class="v3-label v3-section-title">PRÉVIA DA NOTIFICAÇÃO</span><section class="v3-panel"><div class="v3-row"><img src="/assets/brand/oaze-isologo.svg" width="37" height="37" alt=""><span style="flex:1"><strong>OAZE</strong><small style="display:block">${rs.length?esc(rs[0].title)+' está próximo do vencimento':'Nenhum aviso pendente'}</small></span><small>agora</small></div></section><p class="v3-muted">Esta tela mostra compromissos salvos. Avisos do navegador dependem de permissão e ainda precisam de validação neste dispositivo.</p></div></div>`;
  }
  function renderSettings() {
    const signed = !demo && global.V3Backend && V3Backend.user();
    return `<div class="v3-grid v3-settings"><div><span class="v3-label v3-section-title">SEGURANÇA</span><section class="v3-panel"><div class="v3-setting-row"><span>Biometria ao abrir<small>Depende do app nativo; indisponível no navegador.</small></span><span class="v3-muted">—</span></div><div class="v3-setting-row"><span>PIN de 6 números<small>Não configurado nesta V3 web.</small></span><span class="v3-muted">—</span></div><div class="v3-setting-row"><span>Sessão em outros aparelhos</span><span class="v3-muted">${signed?'ativa':'entre na conta'}</span></div></section></div><div><span class="v3-label v3-section-title">COCO</span><section class="v3-panel"><button type="button" class="v3-setting-row" data-action="coco" style="border:0;background:none;color:inherit;width:100%;text-align:left"><span>Consentimento<small>Pedido, agregados e últimas trocas. Foto e áudio só com envio confirmado.</small></span><span class="v3-muted">${!signed?'sem sessão':cocoAllowed()?'autorizado ›':'configurar ›'}</span></button><button type="button" class="v3-setting-row" data-action="coco-memory" style="border:0;background:none;color:inherit;width:100%;text-align:left"><span>Memória da Coco<small>Revise, pause ou esqueça regras confirmadas.</small></span><span class="v3-muted">abrir ›</span></button></section></div><div><span class="v3-label v3-section-title">CONTA E DADOS</span><section class="v3-panel"><button type="button" class="v3-setting-row" data-go="reminders" style="border:0;background:none;color:inherit;width:100%;text-align:left"><span>Notificações</span><span class="v3-muted">lembretes ›</span></button><button type="button" class="v3-setting-row" data-go="plan" style="border:0;background:none;color:inherit;width:100%;text-align:left"><span>Plano</span><span class="v3-muted">ver plano ›</span></button><button type="button" class="v3-setting-row" data-action="profiles" style="border:0;background:none;color:inherit;width:100%;text-align:left"><span>Perfil ativo</span><span class="v3-muted">${esc(profile().name || 'Pessoal')} ›</span></button><div class="v3-setting-row"><span>Sincronização<small>${signed?'Conectada à sua conta':'Dados apenas neste aparelho'}</small></span></div>${demo?'':`<a class="v3-setting-row" href="/app?classic=1"><span>Ferramentas anteriores<small>Edição completa de recursos ainda em migração.</small></span><span class="v3-muted">abrir ›</span></a>`}</section></div></div>`;
  }
  function renderPlan() {
    const list = global.Planos ? Planos.LISTA : [];
    const sub = state.subscription, current = sub?.plan_id || 'free';
    const paid = current !== 'free' && ['active', 'past_due', 'canceled'].includes(sub?.status) && (!sub?.current_period_end || new Date(sub.current_period_end) > new Date());
    const period = state.billing === 'annual' ? 'ano' : 'mês';
    const status = demo ? 'Prévia: nenhuma assinatura é criada aqui.' : state.billingError ? `Não consegui consultar sua assinatura: ${esc(state.billingError)}` : !sub ? 'Consultando sua assinatura…' : paid ? `Plano ${esc(Planos.get(current).nome)} · ${sub.cancel_at_period_end ? 'cancelamento agendado' : sub.status === 'past_due' ? 'pagamento pendente' : 'ativo'}` : 'Seu plano atual é Semente.';
    return `<div class="v3-plan-head"><p class="v3-muted">O cartão é informado na página segura da Stripe. Seu plano só muda após a confirmação do pagamento.</p><div class="v3-segment" role="group" aria-label="Ciclo de cobrança"><button type="button" data-billing="monthly" class="${state.billing === 'monthly' ? 'is-active' : ''}" aria-pressed="${state.billing === 'monthly'}">Mensal</button><button type="button" data-billing="annual" class="${state.billing === 'annual' ? 'is-active' : ''}" aria-pressed="${state.billing === 'annual'}">Anual</button></div></div><p class="v3-plan-status" role="status">${status}</p><div class="v3-grid v3-plan-grid">${list.map((p) => {
      const isCurrent = p.id === current && (p.id === 'free' || paid);
      const disabled = demo || !sub || !!state.billingError || state.paymentBusy || isCurrent || (paid && !sub.cancel_at_period_end) || p.id === 'free';
      const price = state.billing === 'annual' ? p.anualCentavos : p.mensalCentavos;
      const label = isCurrent ? 'Plano atual' : p.id === 'free' ? 'Plano inicial' : paid && !sub.cancel_at_period_end ? 'Cancele o plano atual antes' : demo ? 'Disponível no app' : 'Assinar com Stripe';
      return `<section class="v3-panel v3-plan${p.destaque ? ' highlight' : ''}"><div class="v3-row"><h2>${esc(p.nome)}</h2>${p.destaque ? '<span class="v3-label" style="color:inherit">PLANO PRINCIPAL</span>' : ''}</div><p class="v3-money">${money(price / 100)} <span style="font:400 13px var(--body)">por ${period}</span></p><p>${esc(p.descricao)}</p><ul><li>${p.limites.workspaces == null ? 'Espaços sem limite' : 'Até ' + p.limites.workspaces + ' espaços'}</li><li>${p.limites.accounts == null ? 'Contas sem limite' : 'Até ' + p.limites.accounts + ' contas'}</li><li>${p.limites.credit_cards == null ? 'Cartões sem limite' : 'Até ' + p.limites.credit_cards + ' cartões'}</li><li>${p.limites.ai_queries_per_month == null ? 'Coco sem limite' : p.limites.ai_queries_per_month + ' pedidos à Coco por mês'}</li></ul><button type="button" class="${p.destaque ? 'v3-secondary' : 'v3-primary'}" data-action="subscribe" data-plan="${esc(p.id)}" ${disabled ? 'disabled' : ''}>${label}</button></section>`;
    }).join('')}</div>${!demo && paid && !sub.cancel_at_period_end && (sub.stripe_subscription_id || sub.asaas_subscription_id) ? '<button type="button" class="v3-secondary v3-plan-cancel" data-action="cancel-subscription">Cancelar renovação da assinatura</button>' : ''}`;
  }
  function renderMore() {
    const desc = { investments: `${money(invested())} investidos`, categories: `${profile().categories.length} em uso`, goals: `${profile().goals.length} metas ativas`, calendar: 'entradas, saídas e vencimentos', reminders: `${reminders().length} nos próximos 30 dias`, settings: 'segurança, dados', plan: demo ? 'OAZE mensal' : 'planos vigentes' };
    return `<div class="v3-row" style="margin-bottom:22px"><span class="v3-avatar" style="width:55px;height:55px;font-size:23px">${esc((demo?sample.owner:Store.ownerName()||'o').charAt(0).toLowerCase())}</span><span style="flex:1"><h2>${esc(demo?sample.owner:Store.ownerName()||'Seu OAZE')}</h2><small>Perfil ${esc(profile().name||'Pessoal')}</small></span></div><div class="v3-more">${['investments','categories','goals','calendar','reminders','settings','plan'].map((p)=>`<button type="button" data-go="${p}">${icon(p)}<strong>${esc(names[p])}</strong><small>${esc(desc[p])}</small></button>`).join('')}</div>`;
  }
  function render() {
    renderHead(); renderNav();
    const screens = { home:renderHome, transactions:renderTransactions, wallet:renderWallet, investments:renderInvestments, categories:renderCategories, goals:renderGoals, calendar:renderCalendar, reminders:renderReminders, settings:renderSettings, plan:renderPlan, more:renderMore };
    $('#v3-view').innerHTML = (screens[state.page]||renderHome)();
    if (state.page === 'settings') $('#v3-view').insertAdjacentHTML('beforeend', '<p class="v3-icon-credit">Ícones de interface: <a href="https://www.flaticon.com/uicons" target="_blank" rel="noopener noreferrer">Uicons by Flaticon</a>.</p>');
    if (!demo && classicPaths[state.page]) $('#v3-view').insertAdjacentHTML('beforeend', `<p class="v3-classic-link">Precisa editar algo que ainda não está nesta tela? <a href="${classicPaths[state.page]}?classic=1">Abrir ferramentas completas</a></p>`);
    document.body.classList.toggle('v3-hide-money',state.hideMoney);
    document.body.classList.toggle('v3-home-screen',state.page==='home');
    if (state.page==='goals') updateGoalTabs();
    montarCarteira();
  }
  function updateGoalTabs() {
    const mobile = matchMedia('(max-width:900px)').matches;
    const gs = $('[data-column="goals"]'), bs = $('[data-column="budgets"]');
    if (gs&&bs) { gs.hidden = mobile && state.goalTab!=='goals'; bs.hidden = mobile && state.goalTab!=='budgets'; }
  }
  function go(page) { if (!names[page]) return; state.page=page; render(); window.scrollTo({top:0,behavior:'instant'}); history.replaceState(null,'',`${!demo && location.pathname.startsWith('/app') && location.pathname !== '/app-v3.html' ? '/app' : location.pathname}${location.search}#${page}`); }

  function toast(message) {
    const el=$('#v3-toast'); el.textContent=message; el.hidden=false;
    clearTimeout(toast.timer); toast.timer=setTimeout(()=>{el.hidden=true;},4500);
  }
  function closeSheet() {
    if (recorder?.state==='recording') { recorder.onstop=null;recorder.stop();microphone?.getTracks().forEach((track)=>track.stop());recorder=null;microphone=null; }
    $('#v3-overlay').hidden=true; $('#v3-sheet').innerHTML=''; document.body.style.overflow='';
  }
  function openSheet(html,label) { $('#v3-sheet').setAttribute('aria-label',label||'Painel'); $('#v3-sheet').innerHTML=html; $('#v3-overlay').hidden=false; document.body.style.overflow='hidden'; $('#v3-sheet').querySelector('button')?.focus(); }
  function sheetTop(title,sub,img) { return `<div class="v3-sheet-top">${img?`<img src="${img}" alt="">`:''}<span><h2>${esc(title)}</h2>${sub?`<small>${esc(sub)}</small>`:''}</span><button type="button" data-action="close" class="v3-sheet-close" aria-label="Fechar">×</button></div>`; }
  function cocoAllowed() { return demo || !!(state.cocoSettings?.consented_at && !state.cocoSettings?.revoked_at); }
  function cocoMediaControls() {
    const audio = recorder?.state === 'recording'
      ? `<button type="button" class="v3-coco-icon is-recording" data-action="record-audio" aria-label="Parar gravação" title="Parar gravação" aria-pressed="true">${cocoMediaIcon('stop')}</button>`
      : `<details class="v3-coco-audio-options"><summary class="v3-coco-icon" aria-label="Opções de áudio" title="Áudio: gravar ou escolher arquivo">${cocoMediaIcon('mic')}</summary><div class="v3-coco-audio-menu"><button type="button" data-action="record-audio">Gravar áudio</button><button type="button" data-action="choose-coco-audio">Enviar áudio do aparelho</button></div></details>`;
    return `<form class="v3-chat-form" id="v3-chat-form"><div class="v3-coco-media"><button type="button" class="v3-coco-icon" data-action="choose-coco-file" aria-label="Anexar foto ou arquivo de imagem" title="Foto ou imagem: JPG, PNG, WebP">${cocoMediaIcon('attach')}</button><input id="v3-coco-file" type="file" accept="image/jpeg,image/png,image/webp" hidden>${audio}<input id="v3-coco-audio-file" type="file" accept="audio/webm,audio/mpeg,audio/mp4,audio/x-m4a,audio/wav" hidden></div><input name="question" maxlength="500" value="${esc(state.mediaDraft)}" placeholder="Peça para lançar, analisar ou planejar" aria-label="Pergunta para a Coco" required><button type="submit" aria-label="Enviar">↑</button></form><small>Fotos e áudios viram texto para você revisar. PDF e planilhas ainda não são lidos pela Coco.</small>`;
  }
  async function refreshCoco() {
    if (demo || state.cocoLoading) return;
    state.cocoLoading = true;
    state.cocoError='';
    try {
      state.cocoSettings = await V3Backend.cocoSettings();
      state.cocoMemories = await V3Backend.cocoMemories(profile().id);
    } catch (error) { state.cocoSettings=null;state.cocoError=error.message || 'Não consegui carregar as configurações da Coco.'; }
    finally { state.cocoLoading = false; if (!$('#v3-overlay').hidden) openCoco(); }
  }
  function openCoco() {
    if (!demo && !state.cocoSettings) {
      openSheet(`${sheetTop('coco','preparando sua assistente','/assets/coco/corpo-neutra_acolhedora.webp')}<p class="v3-muted">${state.cocoError?esc(state.cocoError):'Carregando consentimento e memória…'}</p>${state.cocoError?'<button type="button" class="v3-secondary" data-action="retry-coco">Tentar novamente</button>':''}`,'Coco');
      return;
    }
    if (!cocoAllowed() && state.cocoTab!=='Memória') {
      openSheet(`${sheetTop('coco','seus dados, suas regras','/assets/coco/corpo-neutra_acolhedora.webp')}<div class="v3-coco-consent"><p>Para conversar, o OAZE envia à OpenAI seu pedido, as últimas trocas e resumos financeiros necessários. Fotos e áudios só são enviados quando você escolher um arquivo ou iniciar uma gravação e confirmar o envio. A Coco guarda apenas regras que você aprovar; pode esquecer ou pausar depois.</p><p>Não mande senhas, documentos de identidade ou números completos de conta. Revogue o acesso aqui quando quiser.</p><form id="v3-coco-consent-form" class="v3-form"><label class="v3-check"><input type="checkbox" name="accept" required> Autorizo esse uso dos meus dados pela Coco.</label><button class="v3-primary" type="submit">Autorizar Coco</button></form><button type="button" class="v3-secondary" data-action="coco-memory">Ver ou apagar memórias</button></div>`,'Consentimento da Coco');
      return;
    }
    let body='';
    if (state.cocoTab==='Agora') {
      if (demo) body=`<h2 style="margin:10px 0 20px">quatro coisas<br>esperando por você.</h2><div class="v3-suggestion"><span class="v3-label">FEITO POR MIM</span><p>Categorizei 12 lançamentos de setembro do jeito que você costuma fazer.</p><button class="v3-primary" type="button" data-action="demo-only">Tudo certo</button><button class="v3-secondary" type="button" data-action="demo-only">Revisar</button></div><div class="v3-suggestion"><span class="v3-label">PADRÃO VISTO 3 VEZES</span><p>Vi 3 cobranças parecidas da academia perto do dia 5. Quer transformar isso em recorrência?</p><button class="v3-primary" type="button" data-action="demo-only">Criar recorrência</button><button class="v3-secondary" type="button" data-action="demo-only">Agora não</button></div><div class="v3-suggestion"><span class="v3-label">PREVISÃO</span><p>A fatura do Nubank fecha em 2 dias. Outubro começa com R$ 955,30 de sobra.</p><button class="v3-primary" type="button" data-action="demo-only">Lembrar 3 dias antes</button></div>`;
      else {
        const pending=currentTransactions().filter((x)=>!x.confirmed).length, rs=reminders();
        body=`<h2 style="margin:10px 0 20px">o que precisa<br>da sua atenção</h2>${pending?`<div class="v3-suggestion"><span class="v3-label">LANÇAMENTOS PENDENTES</span><p>${pending} ${pending===1?'lançamento aguarda':'lançamentos aguardam'} confirmação neste mês.</p><button class="v3-primary" type="button" data-go="transactions">Revisar</button></div>`:''}${rs.length?`<div class="v3-suggestion"><span class="v3-label">PRÓXIMOS 30 DIAS</span><p>${rs.length} ${rs.length===1?'compromisso registrado':'compromissos registrados'} para acompanhar.</p><button class="v3-primary" type="button" data-go="reminders">Ver lembretes</button></div>`:''}${!pending&&!rs.length?'<p class="v3-muted">Não há pendências registradas agora. A Coco não inventa alertas.</p>':''}`;
      }
    } else if (state.cocoTab==='Conversa') {
      body=`<div class="v3-chat" id="v3-chat">${state.chat.length?state.chat.map((x,i)=>`<div class="v3-chat-message ${x.who==='user'?'user':''}"><p>${esc(x.text)}</p>${x.proposal?`<div class="v3-suggestion"><span class="v3-label">LANÇAMENTO PARA REVISAR</span><strong>${esc(x.proposal.descricao)}</strong><small>${money(x.proposal.valor)} · ${esc(shortDate(x.proposal.data))}</small><button type="button" class="v3-primary" data-action="review-proposal" data-proposal-index="${i}">Revisar no formulário</button><small>Nada será salvo sem sua confirmação.</small></div>`:''}${x.memory?`<div class="v3-suggestion"><span class="v3-label">MEMÓRIA PARA APROVAR</span><strong>${esc(x.memory.label)}</strong><small>${esc(x.memory.value)}</small><button type="button" class="v3-primary" data-action="remember-proposal" data-proposal-index="${i}">Guardar esta regra</button><small>Você poderá apagá-la na aba Memória.</small></div>`:''}</div>`).join(''):'<p>Posso ler os totais do mês e ajudar a organizar suas próximas decisões.</p>'}</div>${cocoMediaControls()}`;
    } else {
      body=`<h2 style="margin:15px 0">o que aprendi sobre você</h2><p class="v3-muted">Só regras que você confirmou. A memória não autoriza pagamentos nem altera lançamentos.</p>${cocoAllowed()?`<button type="button" class="v3-secondary" data-action="pause-learning">${state.cocoSettings?.learning_paused?'Retomar aprendizado':'Pausar aprendizado'}</button>`:'<p class="v3-muted">Acesso revogado; você ainda pode apagar estas regras.</p>'}<div class="v3-coco-memories">${state.cocoMemories.length?state.cocoMemories.map((m)=>`<div class="v3-suggestion"><span class="v3-label">${esc(m.kind.toUpperCase())} · CONFIRMADA</span><strong>${esc(m.label)}</strong><p>${esc(m.value)}</p><small>${esc(new Date(m.created_at).toLocaleDateString('pt-BR'))}</small><button type="button" class="v3-secondary" data-action="forget-memory" data-memory-id="${esc(m.id)}">Esquecer</button></div>`).join(''):'<p class="v3-muted">Nenhuma preferência confirmada ainda.</p>'}</div>${!cocoAllowed()||state.cocoSettings?.learning_paused?'':`<form id="v3-memory-form" class="v3-form"><label>TIPO<select name="kind"><option value="categoria">Categoria</option><option value="conta">Conta</option><option value="recorrencia">Recorrência</option><option value="preferencia">Preferência</option><option value="meta">Meta</option><option value="outro">Outro</option></select></label><label>NOME DA REGRA<input name="label" maxlength="100" required placeholder="Ex.: Uber"></label><label>COMO DEVO LEMBRAR<input name="value" maxlength="240" required placeholder="Ex.: Categorizar como Transporte"></label><button class="v3-primary" type="submit">Guardar regra</button></form>`}${cocoAllowed()?'<button type="button" class="v3-link" data-action="revoke-coco">Revogar acesso da Coco</button>':'<button type="button" class="v3-link" data-coco-tab="Conversa">Voltar ao consentimento</button>'}`;
    }
    openSheet(`${sheetTop('coco',demo?'demonstração de interface':'sua assistente','/assets/coco/corpo-neutra_acolhedora.webp')}<div class="v3-segment">${['Agora','Conversa','Memória'].map((x)=>`<button type="button" data-coco-tab="${x}" class="${state.cocoTab===x?'is-active':''}">${x}</button>`).join('')}</div>${body}`,'Coco');
  }
  function composer(kind, selectedDate, editId, proposal) {
    const editing = editId ? profile().transactions.find((t) => t.id === editId) : null;
    if (editId && !editing) { toast('Lançamento não encontrado. Atualize a página.'); return; }
    const current = editing ? ({ expense:'Despesa', income:'Receita', transfer:'Transferir' }[editing.kind]) : (kind || 'Despesa');
    if (current === 'Aporte') { investmentForm(); return; }
    const accounts = profile().accounts.filter((a) => !a.archived), cards = profile().cards;
    const sourceValue = editing ? (editing.cardId ? `card:${editing.cardId}` : `account:${editing.accountId || ''}`) : proposal?.source || '';
    const targets = accounts.map((a) => `<option value="account:${esc(a.id)}" ${sourceValue === `account:${a.id}` ? 'selected' : ''}>${esc(a.bank || a.name)} •• ${esc(a.last4 || '')} · ${esc(a.moeda || 'BRL')}</option>`).join('')
      + (current === 'Despesa' ? cards.map((c) => `<option value="card:${esc(c.id)}" ${sourceValue === `card:${c.id}` ? 'selected' : ''}>${esc(c.bank || c.name)} •• ${esc(c.last4 || '')} · ${esc(c.moeda || 'BRL')}</option>`).join('') : '');
    const categoryOptions = profile().categories.filter((c) => c.kind === (current === 'Receita' ? 'income' : 'expense'))
      .map((c) => `<option value="${esc(c.id)}" ${(editing?.categoryId || proposal?.categoryId) === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('');
    const amount = editing ? (editing.moeda && editing.valorMoeda ? editing.valorMoeda : editing.amount) : proposal?.valor;
    const fmt = (n) => n == null ? '' : Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    /* TRÊS ESTADOS, E NÃO UMA MARCA
       "Previsto" cobria duas coisas que não são a mesma: a conta que
       ainda vai ser paga — uma promessa que vale, e entra no previsto
       — e a compra cancelada, que deixou de existir. Enquanto a
       segunda contava como previsto, o mês inteiro mentia. */
    const situacaoInicial = editing
      ? (editing.cancelado ? 'cancelado' : (editing.confirmed ? 'pago' : 'pendente'))
      : ((proposal?.confirmado) === false ? 'pendente' : 'pago');
    const meioInicial = editing ? (editing.meio || '') : '';
    openSheet(`${sheetTop(editing ? 'editar lançamento' : proposal ? 'revisar proposta da Coco' : 'novo lançamento', demo ? 'demonstração sem gravação' : 'seu registro financeiro')}${editing || proposal ? '' : `<div class="v3-segment">${['Despesa','Receita','Transferir','Aporte'].map((x) => `<button type="button" data-compose-kind="${x}" class="${current === x ? 'is-active' : ''}">${x}</button>`).join('')}</div>`}<form class="v3-form" id="v3-form-tx"><input type="hidden" name="id" value="${esc(editing?.id || '')}"><input type="hidden" name="kind" value="${esc(current)}"><input type="hidden" name="sourceTag" value="${proposal?'uglez':'manual'}"><label id="v3-tx-amount-label">VALOR (R$)<input name="amount" inputmode="decimal" data-money="true" autocomplete="off" value="${esc(fmt(amount))}" placeholder="0,00" required></label><small id="v3-tx-currency-hint" class="v3-muted"></small><label>DESCRIÇÃO<input name="description" maxlength="120" value="${esc(editing?.description || proposal?.descricao || '')}" placeholder="Ex.: mercado" required></label>${current === 'Transferir' ? '' : `<label>CATEGORIA<select name="category" required><option value="">Escolha uma categoria</option>${categoryOptions}</select></label>`}<label>${current === 'Transferir' ? 'CONTA DE ORIGEM' : 'COMO FOI PAGO / RECEBIDO'}<select name="source" required><option value="">Selecione</option>${targets}</select></label><label id="v3-tx-meio-label">COMO<select name="meio"><option value="">Não informado</option></select><small class="v3-muted">Como o dinheiro entrou ou saiu dessa conta.</small></label>${current === 'Transferir' ? `<label>CONTA DE DESTINO<select name="destination" required><option value="">Selecione</option>${accounts.map((a) => `<option value="${esc(a.id)}" ${editing?.toAccountId === a.id ? 'selected' : ''}>${esc(a.bank || a.name)}</option>`).join('')}</select></label>` : ''}<div class="v3-form-row"><label>DATA<input type="date" name="date" value="${esc(editing?.date || proposal?.data || (selectedDate && U.isValidISO(selectedDate) ? selectedDate : U.todayISO()))}" required></label><label>SITUAÇÃO<select name="situacao">${[['pago','✓ Pago — entra nos totais'],['pendente','✗ Não pago — fica previsto'],['cancelado','🚫 Cancelado — não entra em total nenhum']].map(([v,t])=>`<option value="${v}" ${situacaoInicial===v?'selected':''}>${esc(t)}</option>`).join('')}</select></label></div><label class="v3-check"><input type="checkbox" name="recurring" ${editing?.recurring ? 'checked' : ''}> Repetir mensalmente</label><label>TERMINAR RECORRÊNCIA EM (OPCIONAL)<input type="month" name="recurEnd" value="${esc(editing?.recurEnd || '')}"></label>${editing ? '' : `<label>PARCELAS (SOMENTE DESPESA NÃO RECORRENTE)<input type="number" name="installments" min="1" max="72" value="1"></label>`}<label>OBSERVAÇÕES<input name="notes" maxlength="500" value="${esc(editing?.notes || '')}" placeholder="Opcional"></label><p class="v3-muted">${proposal?'Revise valor, data, categoria e origem. Nada será salvo automaticamente.':'Cartões entram na fatura conforme a data da compra. Na transferência, o dinheiro não é contado como gasto.'}</p><button type="submit" class="v3-primary">${demo ? 'Ver na demonstração' : 'Salvar lançamento'}</button>${editing ? `<button type="button" class="v3-secondary" data-action="delete-transaction" data-transaction="${esc(editing.id)}">Excluir lançamento</button>` : ''}</form>`, editing ? 'Editar lançamento' : 'Novo lançamento');
    updateComposerCurrency(document.getElementById('v3-form-tx'), meioInicial);
  }

  /* =============================================================
     POR ONDE O DINHEIRO PASSOU
     -------------------------------------------------------------
     "Conta: Nubank" diz de onde saiu; não diz como. Pix, cartão de
     débito e transferência caem todos na mesma conta e deixam
     rastros diferentes no extrato — é por esse rastro que a pessoa
     reconhece o lançamento quando vai conferir.

     A lista vem do que a própria conta declarou oferecer: uma conta
     sem cartão virtual não mostra cartão virtual, porque esse
     lançamento não existiria. No crédito o meio é o próprio cartão,
     então o campo some.
     ============================================================= */
  function updateComposerMeios(form, escolhido) {
    const campo = form?.elements.meio;
    const bloco = form?.querySelector('#v3-tx-meio-label');
    if (!campo || !bloco) return;
    const [type, id] = String(form.elements.source.value || '').split(':');
    bloco.hidden = type !== 'account';
    if (type !== 'account') { campo.value = ''; return; }
    const conta = profile().accounts.find((a) => a.id === id);
    const atual = escolhido != null ? escolhido : campo.value;
    const lista = (Store.meiosDaConta ? Store.meiosDaConta(conta) : []);
    campo.innerHTML = '<option value="">Não informado</option>'
      + lista.map((m) => `<option value="${esc(m.id)}" ${atual === m.id ? 'selected' : ''}>${esc(m.nome)}</option>`).join('');
  }

  function updateComposerCurrency(form, meioEscolhido) {
    updateComposerMeios(form, meioEscolhido);
    const source = String(form?.elements.source.value || '');
    const [type, id] = source.split(':');
    const instrument = type === 'card' ? profile().cards.find((c) => c.id === id) : profile().accounts.find((a) => a.id === id);
    const currency = instrument?.moeda || 'BRL';
    const label = form?.querySelector('#v3-tx-amount-label');
    const hint = form?.querySelector('#v3-tx-currency-hint');
    if (!label || !hint) return;
    label.firstChild.textContent = `VALOR (${currency === 'BRL' ? 'R$' : currency})`;
    hint.textContent = currency === 'BRL' ? '' : instrument?.cotacao > 0
      ? `Cotação cadastrada: 1 ${currency} = ${money(instrument.cotacao)}. O total será convertido para reais.`
      : `Cadastre a cotação desta conta/cartão antes de lançar em ${currency}.`;
  }
  function accountForm(id, typeHint) {
    const account=id?profile().accounts.find((a)=>a.id===id):null;
    const card=id?profile().cards.find((c)=>c.id===id):null;
    const existing=account||card, type=card?'card':typeHint==='card'?'card':'account';
    if (id && !existing) { toast('Conta ou cartão não encontrado.'); return; }
    const fmt=(n)=>n==null?'':Number(n).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
    const currencies=[{code:'BRL',nome:'Real'}].concat(Store.MOEDAS||[]);
    const currencyOptions=currencies.map((m)=>`<option value="${esc(m.code)}" ${m.code===(existing?.moeda||'BRL')?'selected':''}>${esc(m.nome)} (${esc(m.code)})</option>`).join('');
    const accountTypes=(Store.ACCOUNT_TYPES||['Conta corrente']).map((name)=>`<option value="${esc(name)}" ${name===(existing?.type||'Conta corrente')?'selected':''}>${esc(name)}</option>`).join('');
    const billAccounts=profile().accounts.filter((a)=>!a.archived).map((a)=>`<option value="${esc(a.id)}" ${card?.accountId===a.id?'selected':''}>${esc(a.name)}</option>`).join('');
    /* O QUE ESTA CONTA TEM
       Toda conta oferecia tudo, e na hora de lançar a pessoa escolhia
       "cartão virtual" numa conta que não emite cartão virtual — o
       extrato ficava com uma informação que nunca aconteceu. Aqui ela
       diz uma vez; depois o lançamento só mostra isso. */
    const oferecidos=Array.isArray(account?.meios)?account.meios:(Store.MEIOS_PADRAO||[]);
    openSheet(`${sheetTop(existing?'editar '+(card?'cartão':'conta'):'adicionar à carteira',demo?'demonstração sem gravação':'conta ou cartão')}${existing?'':`<div class="v3-segment"><button type="button" data-account-type="account" class="${type==='account'?'is-active':''}">Conta</button><button type="button" data-account-type="card" class="${type==='card'?'is-active':''}">Cartão</button></div>`}<form class="v3-form" id="v3-form-account"><input type="hidden" name="id" value="${esc(existing?.id||'')}"><input type="hidden" name="type" value="${type}"><label>NOME DA CONTA OU CARTÃO<input name="name" maxlength="60" value="${esc(existing?.name||'')}" placeholder="Ex.: Conta corrente" required></label>${bankPicker(existing?.bank)}<label>ÚLTIMOS 4 DÍGITOS (OPCIONAL)<input name="last4" inputmode="numeric" pattern="[0-9]{0,4}" maxlength="4" value="${esc(existing?.last4||'')}"></label><label>MOEDA<select name="moeda">${currencyOptions}</select></label><label>COTAÇÃO (R$ POR 1 UNIDADE, SE NÃO FOR BRL)<input name="cotacao" inputmode="decimal" value="${esc(existing?.cotacao==null?'':String(existing.cotacao).replace('.',','))}" placeholder="Ex.: 5,45"></label><label>VALOR INICIAL / LIMITE NA MOEDA ESCOLHIDA<input name="amount" inputmode="decimal" data-money="true" value="${esc(fmt(card?card.limit:account?.openingBalance))}" placeholder="0,00"></label><div id="v3-account-fields" ${type==='card'?'hidden':''}><label>TIPO DE CONTA<select name="accountType">${accountTypes}</select></label><label>CONSIDERAR SALDO A PARTIR DE<input type="date" name="openedAt" value="${esc(account?.openedAt||U.todayISO())}"></label><fieldset class="v3-meios"><legend>O QUE A CONTA OFERECE</legend>${(Store.MEIOS_OFERECIVEIS||[]).map((m)=>`<label class="v3-check"><input type="checkbox" name="meios" value="${esc(m.id)}" ${oferecidos.includes(m.id)?'checked':''}> ${esc(m.nome)}</label>`).join('')}<small class="v3-muted">Só o que estiver marcado aqui aparece como forma de pagamento nos lançamentos desta conta.</small></fieldset></div><div id="v3-card-dates" ${type==='account'?'hidden':''}><div class="v3-form-row"><label>DIA DE FECHAMENTO<input name="closing" type="number" min="1" max="31" value="${esc(card?.closingDay||28)}"></label><label>DIA DE VENCIMENTO<input name="due" type="number" min="1" max="31" value="${esc(card?.dueDay||5)}"></label></div><label>CONTA PARA PAGAR A FATURA<select name="billAccount"><option value="">Nenhuma</option>${billAccounts}</select></label></div><label class="v3-check"><input type="checkbox" name="considerado" ${existing?.considerado===false?'':'checked'}> Considerar nos totais</label>${account?`<label class="v3-check"><input type="checkbox" name="archived" ${account.archived?'checked':''}> Arquivar conta</label>`:''}<button type="submit" class="v3-primary">${demo?'Ver na demonstração':existing?'Salvar alterações':'Adicionar à carteira'}</button>${existing?`<button type="button" class="v3-secondary" data-action="delete-wallet-item" data-wallet-id="${esc(existing.id)}" data-wallet-type="${card?'card':'account'}">Excluir ${card?'cartão':'conta'}</button>`:''}</form>`,'Conta ou cartão');
  }
  function invoicePaymentForm(cardId) {
    const card=profile().cards.find((c)=>c.id===cardId);
    const invoice=card?(demo?{planned:sample.cardInvoices[cardId]||0,pago:0,restante:sample.cardInvoices[cardId]||0,paidAccountId:null}:Calc.invoice(cardId,state.ym,profile())):null;
    if (!invoice || !(invoice.restante>0)) { toast('Não há valor pendente nesta fatura.'); return; }
    const accounts=profile().accounts.filter((a)=>!a.archived).map((a)=>`<option value="${esc(a.id)}" ${invoice.paidAccountId===a.id?'selected':''}>${esc(a.name)}</option>`).join('');
    const fmt=(n)=>Number(n).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
    openSheet(`${sheetTop('pagar fatura',`${card.name} · ${niceMonth(state.ym)}`)}<form class="v3-form" id="v3-form-invoice"><input type="hidden" name="cardId" value="${esc(cardId)}"><input type="hidden" name="ref" value="${esc(state.ym)}"><p>Fatura: <strong>${money(invoice.planned)}</strong> · já pago: <strong>${money(invoice.pago)}</strong> · falta: <strong>${money(invoice.restante)}</strong></p><label>VALOR PAGO (R$)<input name="amount" data-money="true" inputmode="decimal" value="${esc(fmt(invoice.restante))}" required></label><label>DATA DO PAGAMENTO<input type="date" name="date" value="${U.todayISO()}" required></label><label>SAIU DA CONTA<select name="accountId"><option value="">Não descontar de conta</option>${accounts}</select></label><label>COMO<select name="meio"><option value="">Não informado</option>${(Store.MEIOS||[]).map((m)=>`<option value="${esc(m.id)}">${esc(m.nome)}</option>`).join('')}</select></label><p class="v3-muted">É um pagamento da fatura, não uma nova despesa. Se escolher uma conta, o valor sai do saldo dela.</p><button type="submit" class="v3-primary">${demo?'Ver na demonstração':'Registrar pagamento'}</button></form>`,'Pagamento de fatura');
  }
  function investmentForm(id) {
    const item = id ? profile().investments.find((x) => x.id === id) : null;
    const options = Store.INVESTMENT_TYPES.map((type) => `<option value="${esc(type)}" ${item?.type === type ? 'selected' : ''}>${esc(type)}</option>`).join('');
    const accounts = profile().accounts.filter((a) => !a.archived).map((a) => `<option value="${esc(a.id)}" ${item?.accountId === a.id ? 'selected' : ''}>${esc(a.name)}</option>`).join('');
    const amount = (n) => n == null ? '' : Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    openSheet(`${sheetTop(item ? 'editar aporte' : 'novo aporte', demo ? 'demonstração sem gravação' : 'carteira de investimentos')}<form class="v3-form" id="v3-form-investment"><input type="hidden" name="id" value="${esc(item?.id || '')}"><label>NOME DO INVESTIMENTO<input name="name" maxlength="60" value="${esc(item?.name || '')}" placeholder="Ex.: Tesouro Selic" required></label><label>TIPO<select name="type">${options}</select></label><div class="v3-form-row"><label>VALOR APORTADO (R$)<input name="amount" data-money="true" inputmode="decimal" value="${esc(amount(item?.amount))}" placeholder="0,00" required></label><label>DATA DO APORTE<input type="date" name="date" value="${esc(item?.date || U.todayISO())}" required></label></div><div class="v3-form-row"><label>TAXA ESTIMADA (% A.A.)<input name="rate" inputmode="decimal" value="${esc(item?.rate == null ? '' : String(item.rate).replace('.', ','))}" placeholder="Opcional"></label><label>VALOR ATUAL INFORMADO (R$)<input name="currentValue" data-money="true" inputmode="decimal" value="${esc(amount(item?.currentValue))}" placeholder="Opcional"></label></div><label>DEBITAR DE UMA CONTA<select name="accountId"><option value="">Não debitar</option>${accounts}</select></label><label>OBSERVAÇÕES<input name="notes" maxlength="240" value="${esc(item?.notes || '')}" placeholder="Opcional"></label><p class="v3-muted">Se escolher uma conta, o aporte será descontado do saldo dela. O valor atual informado substitui a estimativa de rentabilidade.</p><button type="submit" class="v3-primary">${demo ? 'Ver na demonstração' : item ? 'Salvar alterações' : 'Registrar aporte'}</button>${item ? `<button type="button" class="v3-secondary" data-action="delete-investment" data-investment="${esc(item.id)}">Excluir aporte</button>` : ''}</form>`,'Investimento');
  }
  function goalForm(id) {
    const goal = id ? profile().goals.find((g) => g.id === id) : null;
    const fmt = (n) => n == null ? '' : Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    openSheet(`${sheetTop(goal ? 'editar meta' : 'nova meta', 'planejamento financeiro')}<form class="v3-form" id="v3-form-goal"><input type="hidden" name="id" value="${esc(goal?.id || '')}"><label>NOME DA META<input name="name" maxlength="80" value="${esc(goal?.name || '')}" required></label><div class="v3-form-row"><label>VALOR ALVO (R$)<input name="target" data-money="true" inputmode="decimal" value="${esc(fmt(goal?.target))}" required></label><label>VALOR JÁ GUARDADO (R$)<input name="saved" data-money="true" inputmode="decimal" value="${esc(fmt(goal?.saved || 0))}" required></label></div><label>PRAZO (OPCIONAL)<input name="deadline" type="date" value="${esc(goal?.deadline || '')}"></label><p class="v3-muted">O valor guardado aqui acompanha sua meta. Não movimenta uma conta automaticamente.</p><button type="submit" class="v3-primary">${demo ? 'Ver na demonstração' : 'Salvar meta'}</button>${goal ? `<button type="button" class="v3-secondary" data-action="delete-goal" data-goal="${esc(goal.id)}">Excluir meta</button>` : ''}</form>`, 'Meta financeira');
    if (goal) {
      const savedInput = document.querySelector('#v3-form-goal [name="saved"]');
      savedInput.readOnly = true;
      savedInput.removeAttribute('data-money');
      savedInput.closest('label').insertAdjacentHTML('afterend', '<small class="v3-muted">Para alterar o valor guardado, use “Guardar valor”.</small>');
      document.querySelector('#v3-form-goal [type="submit"]').insertAdjacentHTML('afterend', `<button type="button" class="v3-secondary" data-action="deposit-goal" data-goal="${esc(goal.id)}">Guardar valor</button>`);
    }
  }
  function goalDepositForm(id) {
    const goal = profile().goals.find((g) => g.id === id);
    if (!goal) { toast('Esta meta não existe mais.'); return; }
    const options = profile().accounts.filter((a) => !a.archived).map((a) => `<option value="${esc(a.id)}">${esc(a.name)}</option>`).join('');
    openSheet(`${sheetTop('guardar na meta', goal.name)}<form class="v3-form" id="v3-form-goal-deposit"><input type="hidden" name="id" value="${esc(id)}"><label>VALOR (R$)<input name="amount" data-money="true" inputmode="decimal" placeholder="0,00" required></label><label>SAIR DE UMA CONTA<select name="accountId"><option value="">Não descontar de conta</option>${options}</select></label><p class="v3-muted">Se escolher uma conta, o valor sai do saldo dela e entra na meta. Esta ação não gera uma despesa.</p><button type="submit" class="v3-primary">${demo ? 'Ver na demonstração' : 'Guardar valor'}</button></form>`, 'Guardar valor');
  }
  /* =============================================================
     ESCOLHER ÍCONE E COR
     -------------------------------------------------------------
     O ícone era uma lista de nomes: "Alimentação", "Transporte" — a
     pessoa escolhia a palavra e só via o desenho depois de salvar.
     Agora cada opção é uma caixa com o ícone à mostra, porque é o
     ícone que ela vai reconhecer na lista, não o nome dele.

     A cor era um seletor livre do sistema: dezesseis milhões de
     opções, das quais a esmagadora maioria briga com a tela. Agora
     são seis matizes da paleta, dois tons cada, em colunas. A
     quantidade por cor é visivelmente limitada — são dois tons, e
     acabou.

     Quem separa vinte categorias é o ÍCONE, que tem forma; a cor
     agrupa. É por isso que o ícone tem doze opções e a cor, seis.
     ============================================================= */
  /* Categoria nova nasce numa cor DA PALETA. Antes nascia no teal do
     acento, que não é uma das famílias — e aí toda categoria nova
     abria o seletor com uma sétima coluna de "cor herdada", que é um
     recurso para dados antigos e não para o caso comum. A cor de
     partida gira entre as famílias, para duas categorias seguidas não
     saírem iguais. */
  function corPadraoDeCategoria() {
    const paleta = Store.PALETTE || [];
    if (!paleta.length) return '#5fa99b';
    return paleta[profile().categories.length % paleta.length];
  }
  function iconPicker(atual,choices) {
    return `<fieldset class="v3-icon-picker"><legend>ÍCONE</legend><div class="v3-icon-grid">${choices.map(([key,label])=>
      `<label class="v3-icon-opt" title="${esc(label)}"><input type="radio" name="icon" value="${esc(key)}" ${key===atual?'checked':''} required><span aria-hidden="true">${icon(key)}</span><small>${esc(label)}</small></label>`
    ).join('')}</div></fieldset>`;
  }
  function colorPicker(atual) {
    const familias=(Store.COLOR_FAMILIES||[]).slice();
    const conhecidas=familias.reduce((acc,f)=>acc.concat(f.tons),[]);
    /* Uma cor herdada de dados antigos ganha a própria coluna: ninguém
       perde a categoria que pintou só porque a paleta mudou. */
    if (atual && !conhecidas.some((c)=>c.toLowerCase()===String(atual).toLowerCase())) {
      familias.push({ nome:(Store.colorName?Store.colorName(atual):atual), tons:[atual], herdada:true });
    }
    const ehAtual=(c)=>String(c).toLowerCase()===String(atual).toLowerCase();
    return `<fieldset class="v3-color-picker"><legend>COR</legend><div class="v3-color-tira">${familias.map((f)=>
      `<div class="v3-color-fam${f.herdada?' is-herdada':''}">${f.tons.map((c)=>
        `<label class="v3-color-opt" title="${esc(Store.colorName?Store.colorName(c):c)}" style="--cor:${esc(c)}"><input type="radio" name="color" value="${esc(c)}" ${ehAtual(c)?'checked':''} required><span aria-hidden="true"></span></label>`
      ).join('')}</div>`
    ).join('')}</div></fieldset>`;
  }

  function categoryForm(id) {
    const item=id?profile().categories.find((c)=>c.id===id):null;
    if (id&&!item) { toast('Esta categoria não existe mais.'); return; }
    const choices=[['home','Casa'],['utensils','Alimentação'],['car','Transporte'],['heart','Saúde'],['leisure','Lazer'],['subscription','Assinatura'],['shopping','Compras'],['work','Trabalho'],['education','Educação'],['receipt','Conta'],['investments','Investimento'],['more','Outros']];
    const currentIcon=categoryIcon(item?.icon||'more');
    openSheet(`${sheetTop(item?'editar categoria':'nova categoria',state.catKind==='income'?'receita':'despesa')}<form class="v3-form" id="v3-form-category"><input type="hidden" name="id" value="${esc(item?.id||'')}"><input type="hidden" name="kind" value="${esc(item?.kind||state.catKind)}"><label>NOME<input name="name" maxlength="40" value="${esc(item?.name||'')}" required></label>${iconPicker(currentIcon,choices)}${colorPicker(safeColor(item?.color||corPadraoDeCategoria()))}<button type="submit" class="v3-primary">${demo?'Ver na demonstração':'Salvar categoria'}</button>${item?`<button type="button" class="v3-secondary" data-action="delete-category" data-category="${esc(item.id)}">Excluir categoria</button>`:''}</form>`,'Categoria');
  }
  function budgetForm(categoryId) {
    const categories = profile().categories.filter((c) => c.kind === 'expense');
    const selected = categoryId || categories.find((c) => !profile().budgets?.[c.id])?.id || categories[0]?.id || '';
    const options = categories.map((c) => `<option value="${esc(c.id)}" ${c.id === selected ? 'selected' : ''}>${esc(c.name)}</option>`).join('');
    const value = profile().budgets?.[selected];
    const amount = value == null ? '' : Number(value).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    openSheet(`${sheetTop(categoryId ? 'editar orçamento' : 'novo orçamento', 'limite mensal por categoria')}<form class="v3-form" id="v3-form-budget">${categoryId ? `<input type="hidden" name="category" value="${esc(categoryId)}"><p>Categoria: <strong>${esc(categoryName(categoryId))}</strong></p>` : `<label>CATEGORIA<select name="category" required>${options}</select></label>`}<label>LIMITE POR MÊS (R$)<input name="limit" data-money="true" inputmode="decimal" value="${esc(amount)}" placeholder="0,00" required></label><button type="submit" class="v3-primary">${demo ? 'Ver na demonstração' : 'Salvar orçamento'}</button>${categoryId ? `<button type="button" class="v3-secondary" data-action="delete-budget" data-budget="${esc(categoryId)}">Excluir orçamento</button>` : ''}</form>`, 'Orçamento mensal');
  }
  function periodSheet() {
    openSheet(`${sheetTop('escolher mês','período exibido em todas as telas')}<form class="v3-form" id="v3-form-period"><label>MÊS E ANO<input type="month" name="ym" value="${esc(state.ym)}" required></label><button class="v3-primary" type="submit">Mostrar período</button></form>`,'Escolher período');
  }
  function profilesSheet() {
    const ps=demo?[{id:'sample',name:'Pessoal'}]:Store.state().profiles;
    openSheet(`${sheetTop('seus espaços','perfil financeiro ativo')}<div class="v3-stack" style="margin-top:22px">${ps.map((p)=>`<button type="button" class="v3-pill${p.id===profile().id?' is-active':''}" data-profile="${esc(p.id)}">${esc(p.name)}</button>`).join('')}</div>${demo?'<p class="v3-muted" style="margin-top:20px">O perfil de demonstração é isolado dos seus dados.</p>':`<form class="v3-form" id="v3-form-profile"><label>NOVO ESPAÇO<input name="name" maxlength="60" placeholder="Ex.: Família ou trabalho" required></label><button type="submit" class="v3-secondary">Criar espaço</button></form>`}`,'Perfis financeiros');
  }
  function parseMoney(raw) { const n=U.parseMoney(String(raw||'')); return n==null?NaN:U.round2(n); }
  function canAdd(limit,ym) { return !global.Limites || !Limites.cabe || Limites.cabe(limit,ym); }
  async function saveTransaction(form) {
    if (demo) { toast('Demonstração: nenhum dado foi salvo.'); return; }
    if (!await limitsPromise) { toast('Não consegui confirmar os limites da conta. Tente novamente.'); return; }
    const fd=new FormData(form), id=String(fd.get('id')||''), kind=fd.get('kind'), amount=parseMoney(fd.get('amount')), date=String(fd.get('date')||''), description=String(fd.get('description')||'').trim(), source=String(fd.get('source')||'');
    if (!(amount>0) || !U.isValidISO(date) || !description || !source) { toast('Confira valor, descrição, data e conta/cartão.'); return; }
    const editing=id ? Store.transactions.get(id) : null;
    if (id && !editing) { toast('Este lançamento não existe mais. Atualize a página.'); return; }
    const [sourceType,sourceId]=source.split(':'), transfer=kind==='Transferir', destination=String(fd.get('destination')||'');
    const instrument=sourceType==='account' ? profile().accounts.find((a)=>a.id===sourceId && !a.archived)
      : sourceType==='card' && kind==='Despesa' ? profile().cards.find((c)=>c.id===sourceId) : null;
    if (!instrument) { toast('Escolha uma conta ou cartão válido.'); return; }
    if (transfer && (!destination || destination===sourceId || sourceType!=='account' || !profile().accounts.some((a)=>a.id===destination && !a.archived))) { toast('Escolha duas contas diferentes para transferir.'); return; }
    const recurring=fd.get('recurring')==='on', recurEnd=String(fd.get('recurEnd')||'');
    const installments=editing ? 1 : Number(fd.get('installments')||1);
    if ((recurring && recurEnd && (!/^\d{4}-\d{2}$/.test(recurEnd) || recurEnd<ymOf(date)))
      || !Number.isInteger(installments) || installments<1 || installments>72 || (recurring && installments>1) || (kind!=='Despesa' && installments>1)) {
      toast('Confira a recorrência e as parcelas.'); return;
    }
    if (!editing && recurring && !canAdd('recurring_items',ymOf(date))) { toast('Esta recorrência ultrapassa o limite do seu plano.'); return; }
    if (editing && recurring && !editing.recurring && !canAdd('recurring_items',ymOf(date))) { toast('Esta recorrência ultrapassa o limite do seu plano.'); return; }
    if (!editing) {
      const months=Array.from({length:installments},(_,i)=>U.addMonths(ymOf(date),i));
      if (months.some((month)=>!canAdd('transactions_per_month',month))) { toast('Uma das parcelas ultrapassa o limite mensal do seu plano.'); return; }
    }
    const currency=instrument.moeda && instrument.moeda!=='BRL' ? instrument.moeda : null;
    const rate=currency ? Number(instrument.cotacao) : 1;
    if (!(rate>0) || !Number.isFinite(rate)) { toast(`Cadastre a cotação de ${instrument.name} antes de lançar em ${currency}.`); return; }
    const categoryId=transfer?null:String(fd.get('category')||'');
    if (!transfer && !profile().categories.some((c)=>c.id===categoryId && c.kind===(kind==='Receita'?'income':'expense'))) { toast('Escolha uma categoria válida.'); return; }
    const base={kind:transfer?'transfer':kind==='Receita'?'income':'expense',description,amount:U.round2(amount*rate),moeda:currency,valorMoeda:currency?amount:null,date,categoryId,accountId:sourceType==='account'?sourceId:null,cardId:sourceType==='card'?sourceId:null,toAccountId:transfer?destination:null,confirmed:String(fd.get('situacao')||'pago')==='pago',cancelado:String(fd.get('situacao')||'')==='cancelado',meio:sourceType==='account'?(String(fd.get('meio')||'')||null):null,recurring,recurEnd:recurring?(recurEnd||null):null,notes:String(fd.get('notes')||'').trim().slice(0,500),source:editing?(editing.source||'manual'):fd.get('sourceTag')==='uglez'?'uglez':'manual'};
    if (installments>1 && amount/installments<0.01) { toast('Cada parcela precisa ter pelo menos um centavo.'); return; }
    try {
      await V3Backend.mutate(() => {
        if (editing) { Store.transactions.update(id,base); return; }
        if (installments===1) { Store.transactions.add(base); return; }
        const cents=Math.round(amount*100), each=Math.floor(cents/installments), groupId=U.uid('grp'), day=Number(date.slice(8));
        const list=Array.from({length:installments},(_,index)=>{
          const installmentAmount=(index===installments-1?cents-each*(installments-1):each)/100;
          const partYM=U.addMonths(ymOf(date),index), parts=U.ymParts(partYM);
          return {...base,description:`${description} (${index+1}/${installments})`,amount:U.round2(installmentAmount*rate),valorMoeda:currency?installmentAmount:null,date:U.isoOf(parts.y,parts.m,U.clampDay(parts.y,parts.m,day)),installment:{total:installments,index:index+1,groupId},confirmed:index===0?base.confirmed:false};
        });
        Store.transactions.addMany(list);
      });
      closeSheet(); render(); toast(editing?'Lançamento atualizado.':installments>1?`${installments} parcelas salvas na sua conta.`:'Lançamento salvo na sua conta.');
    } catch (e) { console.error('V3/lançamento:', e); toast(e.message || 'Não foi possível salvar.'); }
  }
  async function saveAccount(form) {
    if (demo) { toast('Demonstração: nenhum dado foi salvo.'); return; }
    if (!await limitsPromise) { toast('Não consegui confirmar os limites da conta. Tente novamente.'); return; }
    const fd=new FormData(form), id=String(fd.get('id')||''), type=String(fd.get('type')||''),name=String(fd.get('name')||'').trim();
    const selectedBank=String(fd.get('bank')||'').trim(),bank=selectedBank==='Outro'?(String(fd.get('customBank')||'').trim()||'Outro'):selectedBank;
    const last4=String(fd.get('last4')||'').replace(/\D/g,'').slice(-4),amount=parseMoney(fd.get('amount'));
    const existing=id?(type==='card'?Store.cards.get(id):Store.accounts.get(id)):null;
    const moeda=String(fd.get('moeda')||'BRL'),cotacao=moeda==='BRL'?null:parseMoney(fd.get('cotacao'));
    const knownCurrency=moeda==='BRL'||Store.MOEDAS.some((m)=>m.code===moeda);
    if (!['card','account'].includes(type) || (id&&!existing) || !name || !selectedBank || (selectedBank!=='Outro'&&!bankKey(bank)) || !knownCurrency || (moeda!=='BRL'&&!(cotacao>0)) || (!Number.isFinite(amount)&&String(fd.get('amount')||'').trim()) || amount<0) {
      toast('Confira nome, instituição, moeda, cotação e valor.'); return;
    }
    if (!existing&&!canAdd(type==='card'?'credit_cards':'accounts',state.ym)) { toast('Esta inclusão ultrapassa o limite do seu plano.'); return; }
    if (moeda!=='BRL'&&(!existing||existing.moeda==='BRL')&&global.Limites&&!Limites.pode('cartoes_internacionais')) { toast('Conta ou cartão em outra moeda não está disponível no seu plano.'); return; }
    const initial=Number.isFinite(amount)?amount:0, considerado=fd.get('considerado')==='on';
    try {
      await V3Backend.mutate(() => {
        if (type==='card') {
          const closingDay=Number(fd.get('closing')),dueDay=Number(fd.get('due')),accountId=String(fd.get('billAccount')||'')||null;
          if (![closingDay,dueDay].every((n)=>Number.isInteger(n)&&n>=1&&n<=31)|| (accountId&&!profile().accounts.some((a)=>a.id===accountId&&!a.archived))) throw new Error('Confira fechamento, vencimento e conta da fatura.');
          const data={name,bank,last4,limit:initial,closingDay,dueDay,accountId,considerado,color:bankBrand(bank,existing?.color),moeda,cotacao};
          if (existing) Store.cards.update(id,data); else Store.cards.add(data);
        } else {
          const openedAt=String(fd.get('openedAt')||''),accountType=String(fd.get('accountType')||'');
          if (!U.isValidISO(openedAt)||!Store.ACCOUNT_TYPES.includes(accountType)) throw new Error('Confira a data e o tipo de conta.');
          const meios=fd.getAll('meios').map(String).filter((m)=>(Store.MEIOS_OFERECIVEIS||[]).some((x)=>x.id===m));
          const data={name,bank,last4,openingBalance:initial,openedAt,type:accountType,considerado,meios,archived:fd.get('archived')==='on',color:bankBrand(bank,existing?.color),moeda,cotacao};
          if (existing) Store.accounts.update(id,data); else Store.accounts.add(data);
        }
      });
      closeSheet(); render(); toast(existing?'Alterações salvas na sua conta.':'Item salvo na sua conta.');
    } catch (e) { console.error('V3/carteira:', e); toast(e.message || 'Não foi possível salvar.'); }
  }
  async function saveCategory(form) {
    if (demo) { toast('Demonstração: nenhum dado foi salvo.'); return; }
    if (!await limitsPromise) { toast('Não consegui confirmar os limites da conta. Tente novamente.'); return; }
    const fd=new FormData(form),id=String(fd.get('id')||''),kind=String(fd.get('kind')||''),name=String(fd.get('name')||'').trim();
    const iconName=String(fd.get('icon')||''),color=String(fd.get('color')||'');
    const editing=id?Store.categories.get(id):null;
    if ((id&&!editing)||!['income','expense'].includes(kind)||!name||name.length>40||!uiIcons.has(iconName)||!/^#[0-9a-f]{6}$/i.test(color)) { toast('Confira nome, ícone e cor.'); return; }
    if (profile().categories.some((c)=>c.kind===kind&&c.id!==id&&U.norm(c.name)===U.norm(name))) { toast('Já existe uma categoria com esse nome.'); return; }
    if (!editing&&!canAdd('custom_categories',state.ym)) { toast('Esta categoria ultrapassa o limite do seu plano.'); return; }
    try {
      await V3Backend.mutate(()=>editing?Store.categories.update(id,{name,icon:iconName,color}):Store.categories.add({name,kind,icon:iconName,color}));
      closeSheet();render();toast('Categoria salva na sua conta.');
    } catch(e) { toast(e.message||'Não foi possível salvar a categoria.'); }
  }
  async function saveProfile(form) {
    if (demo) { toast('Demonstração: nenhum espaço foi criado.'); return; }
    if (!await limitsPromise) { toast('Não consegui confirmar os limites da conta. Tente novamente.'); return; }
    const name=String(new FormData(form).get('name')||'').trim();
    if (!name) { toast('Dê um nome ao novo espaço.'); return; }
    if (!canAdd('workspaces',state.ym)) { toast('Este espaço ultrapassa o limite do seu plano.'); return; }
    try {
      await V3Backend.createProfile(name);
      closeSheet();state.selected=null;render();toast('Novo espaço criado na sua conta.');
    } catch(error) { toast(error.message||'Não foi possível criar o espaço.'); }
  }
  async function saveInvoicePayment(form) {
    if (demo) { toast('Demonstração: nenhum dado foi salvo.'); return; }
    const fd=new FormData(form),cardId=String(fd.get('cardId')||''),ref=String(fd.get('ref')||''),amount=parseMoney(fd.get('amount'));
    const paidAt=String(fd.get('date')||''),accountId=String(fd.get('accountId')||'')||null;
    const meio=accountId?(String(fd.get('meio')||'')||null):null;
    const invoice=/^\d{4}-\d{2}$/.test(ref)?Calc.invoice(cardId,ref,profile()):null;
    if (!invoice || !(amount>0) || amount>invoice.restante+0.005 || !U.isValidISO(paidAt)
      || (accountId&&!profile().accounts.some((a)=>a.id===accountId&&!a.archived))) {
      toast('Confira a fatura, o valor, a data e a conta.'); return;
    }
    try {
      await V3Backend.mutate(()=>Store.payInvoice(cardId,ref,{amount,paidAt,accountId,meio}));
      closeSheet();render();toast('Pagamento registrado na sua conta.');
    } catch(error) { toast(error.message||'Não foi possível registrar o pagamento.'); }
  }
  async function saveInvestment(form) {
    if (demo) { toast('Demonstração: nenhum dado foi salvo.'); return; }
    const fd = new FormData(form), id = String(fd.get('id') || '');
    const name = String(fd.get('name') || '').trim(), type = String(fd.get('type') || '');
    const amount = parseMoney(fd.get('amount')), date = String(fd.get('date') || '');
    const rawCurrent = String(fd.get('currentValue') || '').trim();
    const currentValue = rawCurrent ? parseMoney(rawCurrent) : null;
    const rawRate = String(fd.get('rate') || '').trim().replace(',', '.');
    const rate = rawRate ? Number(rawRate) : 0;
    const accountId = String(fd.get('accountId') || '') || null;
    if (!name || !Store.INVESTMENT_TYPES.includes(type) || !(amount > 0) || !U.isValidISO(date) || !Number.isFinite(rate) || rate < -100 || rate > 100 || (currentValue != null && (!Number.isFinite(currentValue) || currentValue < 0)) || (accountId && !profile().accounts.some((a) => a.id === accountId && !a.archived))) {
      toast('Confira nome, tipo, valor, data, taxa e conta.'); return;
    }
    if (id && !profile().investments.some((x) => x.id === id)) { toast('Este aporte não existe mais. Atualize a página.'); return; }
    const data = { name, type, amount, date, rate, currentValue, accountId, notes: String(fd.get('notes') || '').trim().slice(0, 240) };
    try {
      await V3Backend.mutate(() => id ? Store.investments.update(id, data) : Store.investments.add(data));
      closeSheet(); render(); toast('Aporte salvo na sua conta.');
    } catch (e) { console.error('V3/investimento:', e); toast(e.message || 'Não foi possível salvar o aporte.'); }
  }
  async function saveGoal(form) {
    if (demo) { toast('Demonstração: nenhum dado foi salvo.'); return; }
    if (!await limitsPromise) { toast('Não consegui confirmar os limites da conta. Tente novamente.'); return; }
    const fd = new FormData(form), id = String(fd.get('id') || '');
    const name = String(fd.get('name') || '').trim(), target = parseMoney(fd.get('target'));
    const existing = id ? Store.goals.get(id) : null;
    const saved = existing ? Number(existing.saved || 0) : parseMoney(fd.get('saved'));
    const deadline = String(fd.get('deadline') || '');
    if (!name || !(target > 0) || !Number.isFinite(saved) || saved < 0 || (deadline && !U.isValidISO(deadline)) || (id && !Store.goals.get(id))) { toast('Confira nome, valores e prazo.'); return; }
    if (!id && !canAdd('goals', state.ym)) { toast('Esta meta ultrapassa o limite do seu plano.'); return; }
    try {
      await V3Backend.mutate(() => id ? Store.goals.update(id, { name, target, saved, deadline: deadline || null }) : Store.goals.add({ name, target, saved, deadline: deadline || null }));
      closeSheet(); render(); toast('Meta salva na sua conta.');
    } catch (error) { toast(error.message || 'Não foi possível salvar a meta.'); }
  }
  async function saveGoalDeposit(form) {
    if (demo) { toast('Demonstração: nenhum dado foi salvo.'); return; }
    const fd = new FormData(form), id = String(fd.get('id') || ''), amount = parseMoney(fd.get('amount'));
    const accountId = String(fd.get('accountId') || '');
    if (!Store.goals.get(id) || !(amount > 0) || (accountId && !profile().accounts.some((a) => a.id === accountId && !a.archived))) { toast('Confira a meta, o valor e a conta.'); return; }
    try {
      await V3Backend.mutate(() => Store.goals.deposit(id, amount, { accountId: accountId || null, at: U.todayISO() }));
      closeSheet(); render(); toast('Valor guardado na meta.');
    } catch (error) { toast(error.message || 'Não foi possível guardar o valor.'); }
  }
  async function saveBudget(form) {
    if (demo) { toast('Demonstração: nenhum dado foi salvo.'); return; }
    if (!await limitsPromise) { toast('Não consegui confirmar os limites da conta. Tente novamente.'); return; }
    const fd = new FormData(form), categoryId = String(fd.get('category') || ''), limit = parseMoney(fd.get('limit'));
    if (!profile().categories.some((c) => c.id === categoryId && c.kind === 'expense') || !(limit > 0)) { toast('Escolha uma categoria e um valor válido.'); return; }
    if (!Store.budgets.get(categoryId) && !canAdd('budgets', state.ym)) { toast('Este orçamento ultrapassa o limite do seu plano.'); return; }
    try {
      await V3Backend.mutate(() => Store.budgets.set(categoryId, limit));
      closeSheet(); render(); toast('Orçamento salvo na sua conta.');
    } catch (error) { toast(error.message || 'Não foi possível salvar o orçamento.'); }
  }
  async function refreshSubscription() {
    if (demo) return;
    try {
      state.subscription = await V3Backend.subscription();
      state.billingError = '';
      if (global.Limites) await Limites.carregar();
    } catch (error) {
      state.billingError = error.message || 'Conexão indisponível.';
    }
    if (state.page === 'plan') render();
  }
  async function startCheckout(planId) {
    if (demo || state.paymentBusy || !['basic', 'pro'].includes(planId) || !state.subscription || state.billingError) return;
    state.paymentBusy = true; render();
    try {
      const result = await V3Backend.payment({ acao: 'assinar', plano: planId, ciclo: state.billing, moeda: 'BRL' });
      if (!/^https:\/\/checkout\.stripe\.com\//.test(String(result.url || ''))) throw new Error('O servidor não retornou uma página segura de pagamento.');
      global.location.assign(result.url);
    } catch (error) {
      toast(error.message || 'Não foi possível iniciar o pagamento. Nada foi cobrado.');
      state.paymentBusy = false; render();
    }
  }
  async function cancelSubscription() {
    if (demo || state.paymentBusy || !state.subscription) return;
    state.paymentBusy = true; closeSheet(); render();
    try {
      await V3Backend.payment({ acao: 'cancelar' });
      await refreshSubscription();
      toast('Renovação cancelada. O acesso segue até o fim do período pago.');
    } catch (error) { toast(error.message || 'Não foi possível cancelar a renovação.'); }
    finally { state.paymentBusy = false; render(); }
  }
  function proposalForReview(raw) {
    if (!raw || !['income','expense'].includes(raw.tipo) || !['account','card'].includes(raw.forma_pagamento) || (raw.tipo==='income'&&raw.forma_pagamento==='card')) return null;
    const valor=Number(raw.valor),data=String(raw.data||''),descricao=String(raw.descricao||'').trim().slice(0,90);
    if (!(valor>0) || !Number.isFinite(valor) || !U.isValidISO(data) || !descricao) return null;
    const sourceText=U.norm(String(raw.origem||''));
    const pool=raw.forma_pagamento==='card'?profile().cards:profile().accounts.filter((a)=>!a.archived);
    const matches=sourceText?pool.filter((item)=>[item.name,item.bank,item.last4].some((value)=>value&&U.norm(String(value))===sourceText)):[];
    const categoryText=U.norm(String(raw.categoria||''));
    const categories=categoryText?profile().categories.filter((item)=>item.kind===raw.tipo&&U.norm(item.name)===categoryText):[];
    return {tipo:raw.tipo,descricao,valor:U.round2(valor),data,confirmado:raw.confirmado===true,source:matches.length===1?`${raw.forma_pagamento}:${matches[0].id}`:'',categoryId:categories.length===1?categories[0].id:''};
  }
  async function askCoco(form) {
    const q=String(new FormData(form).get('question')||'').trim(); if (!q) return;
    if (demo) { toast('A conversa de demonstração não envia perguntas.'); return; }
    if (!global.Sync || !Sync.currentUser || !Sync.currentUser()) { toast('Entre na sua conta para conversar com a Coco.'); return; }
    if (!cocoAllowed()) { toast('Autorize a Coco antes de conversar.'); return; }
    state.mediaDraft='';
    const previous=[];
    for(let i=0;i<state.chat.length-1;i++) {
      const question=state.chat[i],answer=state.chat[i+1];
      if(question?.who==='user'&&answer?.who==='coco'&&answer.text) {
        previous.push({pergunta:String(question.text).slice(0,500),resposta:String(answer.text).slice(0,600)});
        i++;
      }
    }
    state.chat.push({who:'user',text:q}); openCoco();
    try {
      const body=AI.corpoDaPergunta(q);
      body.conversa=previous.slice(-3);
      body.profile_id=profile().id;
      const r=await AI.chamarFuncao(body);
      if (r.erro) throw new Error(r.mensagem || 'A Coco está indisponível agora.');
      const proposal=proposalForReview(r.acao_proposta);
      const memory=r.memoria_proposta && ['categoria','conta','recorrencia','preferencia','meta','outro'].includes(r.memoria_proposta.kind)
        ? {kind:r.memoria_proposta.kind,label:String(r.memoria_proposta.label||'').slice(0,100),value:String(r.memoria_proposta.value||'').slice(0,240)} : null;
      state.chat.push({who:'coco',text:r.texto || (proposal?'Preparei um lançamento para você revisar.':memory?'Posso guardar esta preferência, se você confirmar.':'Não consegui responder agora.'),proposal,memory});
    } catch (e) { console.error('V3/Coco:',e); state.chat.push({who:'coco',text:e.message || 'A conversa está indisponível agora. Tente de novo.'}); }
    openCoco();
  }
  async function saveCocoMemory(memory) {
    if (demo || !cocoAllowed() || state.cocoSettings?.learning_paused) { toast('O aprendizado da Coco está pausado.'); return; }
    const kind=String(memory.kind||''),label=String(memory.label||'').trim().slice(0,100),value=String(memory.value||'').trim().slice(0,240);
    if (!['categoria','conta','recorrencia','preferencia','meta','outro'].includes(kind) || !label || !value || state.cocoMemories.length>=50) {
      toast('Confira a regra ou apague uma memória antiga antes de continuar.'); return;
    }
    try { await V3Backend.cocoRemember(profile().id,{kind,label,value}); await refreshCoco(); toast('Regra guardada. Você pode esquecê-la quando quiser.'); return true; }
    catch (error) { toast(error.message || 'Não consegui guardar a regra.'); return false; }
  }
  async function readCocoMedia(file) {
    if (demo || !cocoAllowed() || !file) return;
    const image=['image/jpeg','image/png','image/webp'].includes(file.type);
    const audio=['audio/webm','audio/mpeg','audio/mp4','audio/x-m4a','audio/wav','audio/wave'].includes(file.type);
    if (!image && !audio) { toast('A Coco aceita imagens e áudios. PDF e planilhas ainda não são lidos.'); return; }
    const max=image?4_000_000:8_000_000;
    if (file.size>max || file.size<100) { toast('Arquivo fora do limite: foto até 4 MB, áudio até 8 MB.'); return; }
    if (!global.confirm(`Enviar ${image?'esta foto':'este áudio'} à OpenAI para leitura? O conteúdo pode incluir dados sensíveis. O arquivo não ficará guardado no OAZE. A leitura usa uma consulta do plano; enviar o texto revisado usa outra.`)) return;
    toast('Lendo arquivo…');
    try {
      const result=await V3Backend.cocoReadMedia(file,profile().id);
      state.cocoTab='Conversa';state.mediaDraft=String(result.texto||'').slice(0,500);
      if (!$('#v3-overlay').hidden) { openCoco();$('#v3-chat-form [name="question"]')?.focus(); }
      toast('Revise o texto antes de enviar à Coco.');
    } catch (error) { toast(error.message || 'Não consegui ler o arquivo.'); }
  }
  async function toggleCocoRecording() {
    if (recorder?.state==='recording') { recorder.stop(); return; }
    if (!navigator.mediaDevices?.getUserMedia || !global.MediaRecorder) { toast('Gravação indisponível neste navegador. Envie um arquivo de áudio.'); return; }
    try {
      microphone=await navigator.mediaDevices.getUserMedia({audio:true});
      const mime=['audio/webm','audio/mp4'].find((type)=>MediaRecorder.isTypeSupported(type));
      recorder=new MediaRecorder(microphone,mime?{mimeType:mime}:undefined);
      const chunks=[];
      recorder.ondataavailable=(event)=>{if(event.data.size)chunks.push(event.data);};
      recorder.onstop=()=>{
        microphone?.getTracks().forEach((track)=>track.stop()); microphone=null;
        const type=(recorder.mimeType||mime||'audio/webm').split(';')[0];
        const file=new File(chunks,'coco-audio.'+(type==='audio/mp4'?'m4a':'webm'),{type});
        recorder=null;openCoco();readCocoMedia(file);
      };
      recorder.start();openCoco();toast('Gravando. Toque em “Parar gravação” quando terminar.');
    } catch { microphone?.getTracks().forEach((track)=>track.stop());microphone=null;toast('Não consegui abrir o microfone. Confira a permissão do navegador.'); }
  }
  function handleClick(ev) {
    const target=ev.target.closest('[data-go],[data-action],[data-select],[data-wallet-kind],[data-filter],[data-cat-kind],[data-goal-tab],[data-coco-tab],[data-compose-kind],[data-account-type],[data-confirm],[data-profile],[data-cal-day],[data-cal-month],[data-cal-today],[data-investment],[data-transaction],[data-goal],[data-budget],[data-billing]');
    if (!target) return;
    if (target.dataset.go) { closeSheet(); go(target.dataset.go); return; }
    /* Com o carrossel, quem traz um cartão para o meio é o gesto (ou
       a seta), e isso não redesenha a tela. Aqui sobra o caso do
       cartão do meio: ele já está escolhido, e clicar de novo não
       deve desescolhê-lo — a carteira ficaria sem cartão aberto. */
    if (target.dataset.select) { state.selected=target.dataset.select; render(); return; }
    if (target.dataset.walletKind) { state.walletKind=target.dataset.walletKind; state.selected=null; render(); return; }
    if (target.dataset.filter) { state.filter=target.dataset.filter; render(); return; }
    if (target.dataset.catKind) { state.catKind=target.dataset.catKind; render(); return; }
    if (target.dataset.goalTab) { state.goalTab=target.dataset.goalTab; render(); return; }
    if (target.dataset.cocoTab) { state.cocoTab=target.dataset.cocoTab; openCoco(); return; }
    if (target.dataset.composeKind) { composer(target.dataset.composeKind); return; }
    if (target.dataset.accountType) { const f=$('#v3-form-account');f.elements.type.value=target.dataset.accountType;$('#v3-card-dates').hidden=target.dataset.accountType!=='card';$('#v3-account-fields').hidden=target.dataset.accountType!=='account';document.querySelectorAll('[data-account-type]').forEach((b)=>b.classList.toggle('is-active',b===target));return; }
    if (target.dataset.profile) { if(!demo){Store.setActiveProfile(target.dataset.profile);state.chat=[];state.cocoMemories=[];state.mediaDraft='';closeSheet();render();}return; }
    if (target.dataset.billing) { state.billing=target.dataset.billing;render();return; }
    if (target.dataset.calDay) { state.calDay=Number(target.dataset.calDay);render();return; }
    if (target.dataset.calMonth) { state.ym=U.addMonths(state.ym,Number(target.dataset.calMonth));state.calDay=1;render();return; }
    if (target.hasAttribute('data-cal-today')) { state.ym=U.todayYM();state.calDay=Number(U.todayISO().slice(8));render();return; }
    if (target.dataset.investment && !target.dataset.action) { investmentForm(target.dataset.investment); return; }
    if (target.dataset.transaction && !target.dataset.action) { composer(null, null, target.dataset.transaction); return; }
    if (target.dataset.category && !target.dataset.action) { categoryForm(target.dataset.category); return; }
    if (target.dataset.goal && !target.dataset.action) { goalForm(target.dataset.goal); return; }
    if (target.dataset.budget && !target.dataset.action) { budgetForm(target.dataset.budget); return; }
    if (target.dataset.confirm) {
      if (demo) { toast('Demonstração: nenhum dado foi alterado.'); return; }
      const id = target.dataset.confirm, ym = target.dataset.confirmMonth;
      const entry = currentTransactions({ comCancelados: true }).find((item) => item.id === id && (item.ym || ymOf(item.date)) === ym);
      if (!entry || !Store.transactions.get(id)) { toast('Esse lançamento mudou. Atualize a página e tente novamente.'); return; }
      /* Três estados, em roda: pago → não pago → cancelado → pago.
         Cancelar não some com o lançamento; ele fica riscado na
         lista, e o próximo toque o traz de volta. */
      const proxima = entry.cancelado ? 'pago' : entry.confirmed ? 'pendente' : 'cancelado';
      const aviso = { pago: 'Pago — entrou nos totais.', pendente: 'Voltou a previsto — saiu dos totais.', cancelado: 'Cancelado — fora de todo total.' }[proxima];
      V3Backend.mutate(() => {
        Store.transactions.setCancelado(id, ym, proxima === 'cancelado');
        Store.transactions.setConfirmed(id, ym, proxima === 'pago');
      }).then(() => { render(); toast(aviso); })
        .catch((e) => toast(e.message || 'Não foi possível salvar.'));
      return;
    }
    const action=target.dataset.action;
    /* Fechar NÃO esquece qual cartão estava aberto: reabrir tem de
       voltar nele, que é como uma carteira de verdade se comporta. */
    if (action==='wallet-toggle'){state.walletOpen=!state.walletOpen;render();return;}
    if (action==='review-proposal') {
      const proposal=state.chat[Number(target.dataset.proposalIndex)]?.proposal;
      if (!proposal) { toast('Esta proposta não está mais disponível.'); return; }
      composer(proposal.tipo==='income'?'Receita':'Despesa',proposal.data,null,proposal);
      return;
    }
    if (action==='remember-proposal') {
      const row=state.chat[Number(target.dataset.proposalIndex)];
      if (!row?.memory) { toast('Esta proposta não está mais disponível.'); return; }
      const candidate=row.memory;
      saveCocoMemory(candidate).then((saved)=>{if(saved){row.memory=null;openCoco();}});
      return;
    }
    if (action==='forget-memory') {
      const item=state.cocoMemories.find((m)=>m.id===target.dataset.memoryId);
      if (!item || !global.confirm(`Esquecer a regra “${item.label}”?`)) return;
      V3Backend.cocoForget(item.id).then(()=>refreshCoco()).catch((e)=>toast(e.message||'Não consegui apagar a regra.'));
      return;
    }
    if (action==='pause-learning') {
      V3Backend.cocoPauseLearning(!state.cocoSettings?.learning_paused)
        .then(()=>refreshCoco()).catch((e)=>toast(e.message||'Não consegui mudar a pausa.'));
      return;
    }
    if (action==='revoke-coco') {
      if (!global.confirm('Revogar o acesso da Coco? As memórias ficam guardadas para você apagar, mas não serão usadas enquanto o acesso estiver revogado.')) return;
      V3Backend.cocoConsent(false).then(()=>{state.chat=[];state.mediaDraft='';refreshCoco();})
        .catch((e)=>toast(e.message||'Não consegui revogar o acesso.'));
      return;
    }
    if (action==='choose-coco-file'){$('#v3-coco-file')?.click();return;}
    if (action==='choose-coco-audio'){$('#v3-coco-audio-file')?.click();return;}
    if (action==='record-audio'){toggleCocoRecording();return;}
    if (action==='retry-coco'){refreshCoco();return;}
    if (action==='close'){closeSheet();return;}
    if (action==='back'){go('more');return;}
    if (action==='new'){const k={despesa:'Despesa',receita:'Receita',transferir:'Transferir',aporte:'Aporte'}[target.dataset.kind]||'Despesa';composer(k,target.dataset.date);return;}
    if (action==='add-account'){accountForm();return;}
    if (action==='add-category'){categoryForm();return;}
    if (action==='delete-category') {
      const item=profile().categories.find((c)=>c.id===target.dataset.category);
      if (!item) { toast('Esta categoria não existe mais.'); return; }
      if (profile().transactions.some((t)=>t.categoryId===item.id)||profile().budgets?.[item.id]) { toast('Esta categoria tem lançamentos ou orçamento. Mantenha-a para preservar seus dados.'); return; }
      openSheet(`${sheetTop('excluir categoria','confirme esta alteração')}<p>Excluir ${esc(item.name)}? Esta ação não pode ser desfeita.</p><div class="v3-form-row" style="margin-top:24px"><button type="button" class="v3-secondary" data-action="close">Manter</button><button type="button" class="v3-primary" data-action="confirm-delete-category" data-category="${esc(item.id)}">Excluir</button></div>`,'Confirmar exclusão');
      return;
    }
    if (action==='confirm-delete-category') {
      if (demo) { toast('Demonstração: nenhum dado foi alterado.'); return; }
      const id=target.dataset.category;
      if (!Store.categories.get(id)||profile().transactions.some((t)=>t.categoryId===id)||profile().budgets?.[id]) { toast('A categoria mudou ou está em uso. Atualize a página.'); return; }
      V3Backend.mutate(()=>Store.categories.remove(id)).then(()=>{closeSheet();render();toast('Categoria excluída.');}).catch((e)=>toast(e.message||'Não foi possível excluir.'));
      return;
    }
    if (action==='edit-wallet-item'){accountForm(target.dataset.walletId);return;}
    if (action==='pay-invoice'){invoicePaymentForm(target.dataset.walletId);return;}
    if (action==='delete-wallet-item') {
      const id=target.dataset.walletId,isCard=target.dataset.walletType==='card';
      const item=isCard?profile().cards.find((c)=>c.id===id):profile().accounts.find((a)=>a.id===id);
      if (!item) { toast('Este item não existe mais.'); return; }
      const used=isCard ? profile().transactions.some((t)=>t.cardId===id)||Object.keys(profile().invoices||{}).some((key)=>key.startsWith(id+'|'))
        : profile().transactions.some((t)=>t.accountId===id||t.toAccountId===id)||profile().cards.some((c)=>c.accountId===id)
          ||profile().investments.some((x)=>x.accountId===id)||profile().goals.some((g)=>(g.deposits||[]).some((d)=>d.accountId===id))
          ||Object.values(profile().invoices||{}).some((record)=>(Calc.invoiceMovements(record)||[]).some((m)=>m.accountId===id));
      if (used) { toast('Este item tem movimentos vinculados. Arquive a conta ou mantenha o cartão para preservar o histórico.'); return; }
      openSheet(`${sheetTop(isCard?'excluir cartão':'excluir conta','confirme esta alteração')}<p>Excluir ${esc(item.name)}? Esta ação não pode ser desfeita.</p><div class="v3-form-row" style="margin-top:24px"><button type="button" class="v3-secondary" data-action="close">Manter</button><button type="button" class="v3-primary" data-action="confirm-delete-wallet-item" data-wallet-id="${esc(id)}" data-wallet-type="${isCard?'card':'account'}">Excluir</button></div>`,'Confirmar exclusão');
      return;
    }
    if (action==='confirm-delete-wallet-item') {
      if (demo) { toast('Demonstração: nenhum dado foi alterado.'); return; }
      const id=target.dataset.walletId,isCard=target.dataset.walletType==='card';
      if (!(isCard?Store.cards.get(id):Store.accounts.get(id))) { toast('Este item não existe mais.'); return; }
      V3Backend.mutate(()=>isCard?Store.cards.remove(id):Store.accounts.remove(id)).then(()=>{state.selected=null;closeSheet();render();toast('Item excluído.');}).catch((e)=>toast(e.message||'Não foi possível excluir.'));
      return;
    }
    if (action==='add-investment'){investmentForm();return;}
    if (action==='delete-transaction') {
      const tx=profile().transactions.find((item)=>item.id===target.dataset.transaction);
      if (!tx) { toast('Este lançamento não existe mais.'); return; }
      const detail=tx.installment?'Todas as parcelas do grupo serão removidas.':tx.recurring?'Todas as ocorrências mensais serão removidas.':'';
      openSheet(`${sheetTop('excluir lançamento','confirme esta alteração')}<p>Excluir ${esc(tx.description)}? ${detail}</p><div class="v3-form-row" style="margin-top:24px"><button type="button" class="v3-secondary" data-action="close">Manter</button><button type="button" class="v3-primary" data-action="confirm-delete-transaction" data-transaction="${esc(tx.id)}">Excluir</button></div>`,'Confirmar exclusão');
      return;
    }
    if (action==='confirm-delete-transaction') {
      if (demo) { toast('Demonstração: nenhum dado foi alterado.'); return; }
      const id=target.dataset.transaction;
      if (!Store.transactions.get(id)) { toast('Este lançamento não existe mais.'); return; }
      V3Backend.mutate(()=>Store.transactions.remove(id)).then(()=>{closeSheet();render();toast('Lançamento excluído.');}).catch((e)=>toast(e.message||'Não foi possível excluir.'));
      return;
    }
    if (action==='add-goal'){goalForm();return;}
    if (action==='deposit-goal'){goalDepositForm(target.dataset.goal);return;}
    if (action==='add-budget'){budgetForm();return;}
    if (action==='delete-goal' || action==='delete-budget') {
      const isGoal = action === 'delete-goal', id = target.dataset[isGoal ? 'goal' : 'budget'];
      openSheet(`${sheetTop(isGoal ? 'excluir meta' : 'excluir orçamento', 'confirme esta alteração')}<p>${isGoal ? 'A meta e o histórico de aportes vinculados a ela deixarão de aparecer.' : 'O limite mensal desta categoria deixará de aparecer.'}</p><div class="v3-form-row" style="margin-top:24px"><button type="button" class="v3-secondary" data-action="close">Manter</button><button type="button" class="v3-primary" data-action="${isGoal ? 'confirm-delete-goal' : 'confirm-delete-budget'}" data-id="${esc(id)}">Excluir</button></div>`, 'Confirmar exclusão');
      return;
    }
    if (action==='confirm-delete-goal' || action==='confirm-delete-budget') {
      if (demo) { toast('Demonstração: nenhum dado foi alterado.'); return; }
      const id = target.dataset.id, isGoal = action === 'confirm-delete-goal';
      if (!(isGoal ? Store.goals.get(id) : Store.budgets.get(id))) { toast('Esse item não existe mais.'); return; }
      V3Backend.mutate(() => isGoal ? Store.goals.remove(id) : Store.budgets.remove(id)).then(() => { closeSheet(); render(); toast(isGoal ? 'Meta excluída.' : 'Orçamento excluído.'); }).catch((e) => toast(e.message || 'Não foi possível excluir.'));
      return;
    }
    if (action==='subscribe'){startCheckout(target.dataset.plan);return;}
    if (action==='cancel-subscription') {
      openSheet(`${sheetTop('cancelar renovação','o plano não termina hoje')}<p>Você mantém o plano até o fim do período já pago. Depois, sua conta volta ao Semente.</p><div class="v3-form-row" style="margin-top:24px"><button type="button" class="v3-secondary" data-action="close">Manter assinatura</button><button type="button" class="v3-primary" data-action="confirm-cancel-subscription">Cancelar renovação</button></div>`,'Confirmar cancelamento');
      return;
    }
    if (action==='confirm-cancel-subscription'){cancelSubscription();return;}
    if (action==='delete-investment') {
      const item=profile().investments.find((x)=>x.id===target.dataset.investment);
      if(!item)return;
      openSheet(`${sheetTop('excluir aporte','esta ação altera seu patrimônio')}<p>Excluir ${esc(item.name)}? O valor e o débito vinculado à conta deixarão de aparecer.</p><div class="v3-form-row" style="margin-top:24px"><button type="button" class="v3-secondary" data-action="close">Manter aporte</button><button type="button" class="v3-primary" data-action="confirm-delete-investment" data-investment="${esc(item.id)}">Excluir aporte</button></div>`,'Confirmar exclusão');
      return;
    }
    if (action==='confirm-delete-investment') {
      if(demo){toast('Demonstração: nenhum dado foi alterado.');return;}
      const id=target.dataset.investment;
      V3Backend.mutate(()=>Store.investments.remove(id)).then(()=>{closeSheet();render();toast('Aporte excluído.');}).catch((e)=>toast(e.message||'Não foi possível excluir.'));
      return;
    }
    if (action==='coco'){state.cocoTab='Agora';openCoco();refreshCoco();return;}
    if (action==='coco-memory'){state.cocoTab='Memória';openCoco();refreshCoco();return;}
    if (action==='period'){periodSheet();return;}
    if (action==='profiles'){profilesSheet();return;}
    if (action==='privacy'){state.hideMoney=!state.hideMoney;render();return;}
    if (action==='notifications'){go('reminders');return;}
    if (action==='plan-info'){go('plan');return;}
    if (action==='demo-only'){toast('Esta é uma proposta visual; não houve nenhuma ação na sua conta.');return;}
  }
  function handleSubmit(ev) {
    const formId=ev.target.getAttribute('id');
    if(!['v3-form-tx','v3-form-account','v3-form-category','v3-form-profile','v3-form-invoice','v3-form-investment','v3-form-goal','v3-form-goal-deposit','v3-form-budget','v3-form-period','v3-chat-form','v3-coco-consent-form','v3-memory-form'].includes(formId))return;
    ev.preventDefault();
    if(formId==='v3-form-tx')saveTransaction(ev.target);
    if(formId==='v3-form-account')saveAccount(ev.target);
    if(formId==='v3-form-category')saveCategory(ev.target);
    if(formId==='v3-form-profile')saveProfile(ev.target);
    if(formId==='v3-form-invoice')saveInvoicePayment(ev.target);
    if(formId==='v3-form-investment')saveInvestment(ev.target);
    if(formId==='v3-form-goal')saveGoal(ev.target);
    if(formId==='v3-form-goal-deposit')saveGoalDeposit(ev.target);
    if(formId==='v3-form-budget')saveBudget(ev.target);
    if(formId==='v3-form-period'){state.ym=String(new FormData(ev.target).get('ym'));closeSheet();render();}
    if(formId==='v3-chat-form')askCoco(ev.target);
    if(formId==='v3-coco-consent-form')V3Backend.cocoConsent(true).then(()=>refreshCoco()).catch((e)=>toast(e.message||'Não consegui registrar o consentimento.'));
    if(formId==='v3-memory-form')saveCocoMemory(Object.fromEntries(new FormData(ev.target)));
  }
  async function boot() {
    if(!demo){try { if(!global.V3Backend || !await V3Backend.start()) return; } catch(e){ console.error('V3/dados:',e); $('#v3-view').innerHTML='<p>Não foi possível carregar sua conta. Seus dados não foram alterados.</p><p><button type="button" id="v3-retry">Tentar novamente</button> ou abra as ferramentas anteriores em <a href="/app?classic=1">/app?classic=1</a>.</p>';$('#v3-retry').addEventListener('click',()=>location.reload());return; }}
    if(!demo)Store.onChange(()=>render());
    if(!demo && global.Limites) limitsPromise=V3Backend.withTimeout(Limites.carregar()).catch((e)=>{console.error('V3/limites:',e);return null;});
    const path=location.pathname.replace(/\/+$/,'') || '/app';
    const requested=location.hash.slice(1) || initialPaths[path];state.page=names[requested]?requested:'home';
    if(!demo && global.OazeCookies) OazeCookies.mostrar();
    document.addEventListener('click',handleClick);document.addEventListener('submit',handleSubmit);
    document.addEventListener('change',(event)=>{
      if (!['v3-coco-file','v3-coco-audio-file'].includes(event.target?.id)) return;
      const file=event.target.files?.[0];
      if (file) readCocoMedia(file);
    });
    document.addEventListener('beforeinput',(ev)=>{
      const input=ev.target;
      if(!(input instanceof HTMLInputElement)||input.dataset.money!=='true')return;
      const text=String(ev.data??''),replace=input.selectionStart===0&&input.selectionEnd===input.value.length;
      if(ev.inputType==='insertText'||ev.inputType==='insertCompositionText'){
        if(text===','||text==='.') {ev.preventDefault();return;}
        if(/^\d$/.test(text)){ev.preventDefault();input.value=U.moneyGrow(input.value,text,replace);input.setSelectionRange(input.value.length,input.value.length);}
      } else if(ev.inputType==='deleteContentBackward'){
        ev.preventDefault();input.value=replace?U.fmtNum(0):U.moneyShrink(input.value);input.setSelectionRange(input.value.length,input.value.length);
      }
    });
    document.addEventListener('paste',(ev)=>{const input=ev.target;if(!(input instanceof HTMLInputElement)||input.dataset.money!=='true')return;ev.preventDefault();const n=U.parseMoney(ev.clipboardData?.getData('text')||'');if(n!=null&&n>=0)input.value=U.fmtNum(n);});
    document.addEventListener('change',(ev)=>{
      if(ev.target.dataset.sim){state.sim[ev.target.dataset.sim]=+ev.target.value;render();}
      if(ev.target.name==='source' && ev.target.closest('#v3-form-tx')) updateComposerCurrency(ev.target.form);
    });
    document.addEventListener('keydown',(ev)=>{if(ev.key==='Escape'&&!$('#v3-overlay').hidden){closeSheet();return;}if(ev.key.toLowerCase()==='n'&&!ev.ctrlKey&&!ev.altKey&&!ev.metaKey&&!['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName)){ev.preventDefault();composer('Despesa');}});
    addEventListener('resize',()=>{if(state.page==='goals')updateGoalTabs();});
    render();
    if (!demo) {
      const params = new URLSearchParams(location.search);
      const paymentReturn = params.get('pagamento');
      if (paymentReturn === 'sucesso' || paymentReturn === 'cancelado') {
        params.delete('pagamento'); params.delete('sessao');
        const query = params.toString();
        history.replaceState(null, '', location.pathname + (query ? '?' + query : '') + location.hash);
      }
      refreshSubscription();
      if (paymentReturn === 'sucesso') {
        toast('Pagamento enviado. O plano será liberado após confirmação da Stripe.');
        let attempts = 0;
        const poll = async () => {
          await refreshSubscription();
          if (state.subscription?.plan_id !== 'free' && ['active', 'past_due'].includes(state.subscription?.status)) {
            toast('Plano confirmado na sua conta.'); return;
          }
          if (++attempts < 12) setTimeout(poll, 5000);
          else toast('A confirmação está demorando. Seu plano aparece assim que a Stripe confirmar.');
        };
        setTimeout(poll, 3000);
      } else if (paymentReturn === 'cancelado') toast('Pagamento cancelado. Nada foi cobrado.');
    }
    if(!demo && path==='/app/uglez') { state.cocoTab='Conversa'; openCoco(); }
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})(window);
