/* OAZE V3: apresentação nova; Store, Calc e Sync continuam sendo a fonte dos dados. */
(function (global) {
  'use strict';

  const $ = (s) => document.querySelector(s);
  // A prévia continua isolada; somente app-v3.html habilita a conta real.
  const demo = document.documentElement.dataset.oazeMode !== 'live';
  const routes = ['home', 'transactions', 'wallet', 'investments', 'categories', 'goals', 'reminders', 'settings', 'plan'];
  const names = { home: 'início', transactions: 'lançamentos', wallet: 'carteira', investments: 'investimentos', categories: 'categorias', goals: 'metas e orçamentos', reminders: 'lembretes', settings: 'configurações', plan: 'plano', more: 'mais' };
  const initialPaths = { '/app': 'home', '/app/financeiro': 'transactions', '/app/carteira': 'wallet', '/app/investimentos': 'investments', '/app/categorias': 'categories', '/app/metas': 'goals', '/app/orcamento': 'goals', '/app/recorrencias': 'reminders', '/app/calendario': 'reminders', '/app/configuracoes': 'settings', '/app/planos': 'plan', '/app/limites': 'plan', '/app/analises': 'investments', '/app/uglez': 'home' };
  const classicPaths = { transactions: '/app/financeiro', wallet: '/app/carteira', investments: '/app/investimentos', categories: '/app/categorias', goals: '/app/metas', reminders: '/app/recorrencias', settings: '/app/configuracoes', plan: '/app/planos' };
  const iconPaths = {
    home: '<path d="m3 10 9-7 9 7v10H3z"/><path d="M9 20v-7h6v7"/>',
    transactions: '<path d="M3 7h17m0 0-4-4m4 4-4 4M21 17H4m0 0 4-4m-4 4 4 4"/>',
    wallet: '<rect x="3" y="6" width="18" height="15" rx="2"/><path d="M3 10h18M16 15h5"/>',
    investments: '<path d="m3 17 6-6 4 4 8-9m-5 0h5v5"/>',
    categories: '<path d="M12 3 8 9h8zM4 14h7v7H4z"/><circle cx="18" cy="18" r="3"/>',
    goals: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
    reminders: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>',
    settings: '<path d="M10 2h4l1 3 3 1 3-1 2 4-2 2v3l2 2-2 4-3-1-3 1-1 3h-4l-1-3-3-1-3 1-2-4 2-2v-3L1 9l2-4 3 1 3-1z"/><circle cx="12" cy="12" r="3"/>',
    plan: '<path d="M12 21V9m0 5c-5 0-7-3-7-7 4 0 7 2 7 7Zm0-2c0-5 3-7 7-7 0 4-2 7-7 7Z"/>',
    more: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
    plus: '<path d="M12 4v16M4 12h16"/>',
    arrow: '<path d="M5 18 19 4M9 4h10v10"/>',
    down: '<path d="M5 6 19 20M19 20V10M19 20H9"/>',
    utensils: '<path d="M4 3v8m3-8v8m3-8v8M4 11h6M7 11v10M17 21V3c-3 1-4 4-4 9h4"/>',
    car: '<path d="m5 16 2-8h10l2 8M3 13h18v6H3zM6 19v2m12-2v2M7 10h10"/>',
    heart: '<path d="M12 20 4 12C0 8 5 2 10 6l2 2 2-2c5-4 10 2 6 6z"/>',
    leisure: '<path d="M6 9 4 13c-2 5 0 7 3 7l5-4 5 4c3 0 5-2 3-7l-2-4H6zM8 11v4m-2-2h4m6-1h.01M18 14h.01"/>',
    subscription: '<path d="M5 7h13l-3-3m3 3-3 3M19 17H6l3 3m-3-3 3-3"/>'
  };
  const icon = (name) => `<svg aria-hidden="true" viewBox="0 0 24 24">${iconPaths[name] || iconPaths.more}</svg>`;
  const esc = (x) => String(x == null ? '' : x).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = (n) => 'R$ ' + Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const pct = (n) => Math.max(0, Math.min(100, Number(n) || 0));
  const safeColor = (x) => /^#[0-9a-f]{6}$/i.test(String(x || '')) ? x : '#5fa99b';
  const shortDate = (s) => s ? `${s.slice(8, 10)} ${['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'][+s.slice(5, 7) - 1]}` : '';
  const ymOf = (d) => String(d || '').slice(0, 7);
  const periodLabel = (ym) => `${['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'][+ym.slice(5, 7) - 1]} ${ym.slice(0, 4)}`;
  const niceMonth = (ym) => `${['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'][+ym.slice(5, 7) - 1]} de ${ym.slice(0, 4)}`;
  const state = { page: 'home', ym: demo ? '2026-09' : U.todayYM(), filter: 'Todos', catKind: 'expense', goalTab: 'goals', selected: null, cocoTab: 'Agora', hideMoney: false, sim: { aporte: 500, taxa: 10, meses: 24 }, chat: [] };
  let limitsPromise = Promise.resolve(demo);
  global.App = { get ym() { return state.ym; }, goTo: (page) => go(page === 'accounts' ? 'wallet' : page) };

  const sample = {
    owner: 'ana souza', plan: 'OAZE mensal', balance: 18420.35, accountsBalance: 12180.35,
    accounts: [
      { id: 'a1', name: 'Itaú', bank: 'Itaú', last4: '0917', openingBalance: 12180.35, color: '#477486' },
      { id: 'a2', name: 'Nubank', bank: 'Nubank', last4: '2204', openingBalance: 0, color: '#196e58' }
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
      { id: 'i1', name: 'Tesouro Selic', currentValue: 3200, type: 'Renda fixa' },
      { id: 'i2', name: 'CDB 110% do CDI', currentValue: 2040, type: 'Renda fixa' },
      { id: 'i3', name: 'Fundo imobiliário', currentValue: 1000, type: 'FII' }
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
  function currentTransactions() {
    if (demo) return sample.transactions.filter((t) => ymOf(t.date) === state.ym);
    try { return Calc.entriesForMonth(state.ym).map((t) => ({ ...t, kind: t.kind, confirmed: t.confirmed })); }
    catch (e) { console.error('V3/lançamentos:', e); return []; }
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
  function categoryIcon(name) { const map={house:'home',utensils:'utensils',car:'car','heart-pulse':'heart','gamepad-2':'leisure',repeat:'subscription','circle-ellipsis':'more',banknote:'investments','trending-up':'investments'}; return map[name] || name; }
  function categoryTotals(kind) {
    if (demo && kind === 'expense') return Object.entries(sample.categoryAmounts).map(([id,value]) => ({ id, name: categoryName(id), value, color: sample.categories.find((c) => c.id === id).color })).sort((a,b) => b.value - a.value);
    const map = new Map();
    currentTransactions().filter((t) => t.confirmed && t.kind === kind).forEach((t) => map.set(t.categoryId || 'other', (map.get(t.categoryId || 'other') || 0) + +t.amount));
    return [...map].map(([id, value]) => ({ id, name: categoryName(id), value, color: safeColor((profile().categories.find((c) => c.id === id) || {}).color) })).sort((a, b) => b.value - a.value);
  }
  function items() {
    return [...profile().accounts.filter((a) => !a.archived).map((a) => ({ kind: 'debit', data: a })), ...profile().cards.map((c) => ({ kind: 'credit', data: c }))];
  }
  function itemById(id) { return items().find((x) => x.data.id === id); }
  function selectedItem() { return itemById(state.selected) || items()[0] || null; }
  function navButton(page) { return `<button class="v3-nav${state.page === page ? ' is-active' : ''}" type="button" data-go="${page}">${icon(page)}<span>${esc(names[page])}</span></button>`; }
  function renderNav() {
    $('#v3-desktop-nav').innerHTML = ['home','transactions','wallet'].map(navButton).join('') + '<span class="v3-nav-label">MAIS</span>' + ['investments','categories','goals','reminders','settings','plan'].map(navButton).join('');
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
    $('#v3-notification-dot').hidden = !reminders().length;
  }
  function bankMark(bank) { const b = String(bank || '').toLowerCase(); return b.includes('nubank') ? 'nu' : b.includes('inter') ? 'in' : b.includes('itaú') || b.includes('itau') ? 'it' : b.slice(0, 2) || '•'; }
  function bankColor(bank) { const b = String(bank || '').toLowerCase(); return b.includes('nubank') ? '#8500c8' : b.includes('inter') ? '#ff7600' : b.includes('itaú') || b.includes('itau') ? '#f17900' : '#355565'; }
  function cardButton(item, selected) {
    const d = item.data, name = d.bank || d.name;
    const tint = item.kind === 'credit' ? '#315769' : '#477689';
    return `<button type="button" data-select="${esc(d.id)}" class="v3-wallet-item${selected ? ' is-selected' : ''}" style="--card-light:${tint};--card-dark:#1b3443;--brand:${bankColor(name)}"><span class="v3-bankmark">${esc(bankMark(name))}</span><strong>${esc(name)}</strong><span class="v3-last">•• ${esc(d.last4 || '••••')}</span><span class="v3-type">${item.kind === 'credit' ? 'CRÉDITO' : 'DÉBITO'}</span>${selected ? `<span class="v3-chip" aria-hidden="true"></span><span class="v3-contactless" aria-hidden="true">)))</span><span class="v3-card-number">•••• &nbsp; •••• &nbsp; •••• &nbsp; ${esc(d.last4 || '••••')}</span><span class="v3-card-footer"><span><small>TITULAR</small>${esc((demo ? 'ANA SOUZA' : Store.ownerName() || 'TITULAR').toUpperCase())}</span>${d.validThru?`<span><small>VALIDADE</small>${esc(d.validThru)}</span>`:''}<em>${esc(d.network || (item.kind === 'credit' ? 'CRÉDITO' : 'DÉBITO'))}</em></span>` : ''}</button>`;
  }
  function wallet(pocketLabel, expanded) {
    const list = items(), chosen = selectedItem();
    if (!list.length) return `<div class="v3-panel v3-empty"><img src="/assets/brand/oaze-isologo.svg" alt=""><h2>sua carteira começa aqui</h2><p>Adicione uma conta ou cartão para ver seus saldos neste bolso.</p><button type="button" data-action="add-account" class="v3-primary" style="margin-top:20px">Adicionar conta</button></div>`;
    const ordered = expanded && chosen ? [chosen, ...list.filter((x) => x.data.id !== chosen.data.id)] : list;
    const bills=demo?2622.3:profile().cards.reduce((n,c)=>n+Calc.cardUsed(c.id),0);
    return `<div class="v3-wallet${expanded ? ' v3-wallet-expanded' : ''}"><div class="v3-wallet-list">${ordered.map((x) => cardButton(x, !!expanded && chosen && chosen.data.id === x.data.id)).join('')}</div><div class="v3-wallet-pocket"><span class="v3-label">${esc(pocketLabel || 'SALDO TOTAL')}${!expanded && demo ? ' · ▲ 4,2%' : ''}</span><strong class="v3-money v3-sensitive">${money(pocketLabel === 'SALDO EM CONTAS' ? accountsBalance() : balance())}</strong><span class="v3-muted">${pocketLabel === 'SALDO EM CONTAS' ? `Faturas abertas: ${money(bills)}` : `${money(accountsBalance())} em contas · ${money(invested())} investidos`}</span>${!expanded ? '<span class="v3-pocket-hint">♧ &nbsp; toque num cartão para abrir</span>' : ''}</div></div>`;
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
    const rows = currentTransactions().filter((t) => state.filter === 'Todos' || (state.filter === 'Crédito' ? !!t.cardId : state.filter === 'Débito' ? !t.cardId : state.filter === 'Cartões' ? !!t.cardId : (t.methodLabel || '').toUpperCase().includes('PIX'))).sort((a, b) => b.date.localeCompare(a.date));
    const t = totals();
    const cells = rows.map((x) => {
      const card = profile().cards.find((c) => c.id === x.cardId) || profile().accounts.find((a) => a.id === x.accountId);
      const method = x.methodLabel || (x.cardId ? 'CARTÃO' : x.kind === 'transfer' ? 'TRANSFERÊNCIA' : 'CONTA');
      return `<div class="v3-tx${x.confirmed ? '' : ' is-pending'}"><span class="v3-mini-card" style="--card-light:${esc((card || {}).color || '#446779')};--card-dark:#1d3442" data-last="${esc((card || {}).last4 || '')}"></span><span class="v3-mono v3-muted">${esc(shortDate(x.date))}</span><strong>${esc(x.description)}</strong><span>${esc(categoryName(x.categoryId))}<small class="v3-mobile-only">${esc(shortDate(x.date))} · ${esc(method)}</small></span><span class="v3-mono">${esc(method)}</span><span class="v3-mono ${x.kind === 'income' ? 'v3-positive' : 'v3-negative'} v3-sensitive">${x.kind === 'income' ? '+' : '−'} ${money(x.amount)}</span><button class="v3-status${x.confirmed ? ' is-done' : ''}" type="button" data-confirm="${esc(x.id)}" aria-label="${x.confirmed ? 'Marcar como pendente' : 'Confirmar lançamento'}">${x.confirmed ? '✓' : ''}</button></div>`;
    }).join('');
    return `<div class="v3-transactions"><div class="v3-trans-head"><div class="v3-filter">${['Todos','Pix','Cartões','Débito','Crédito'].map((f) => `<button type="button" data-filter="${f}" class="v3-pill${state.filter === f ? ' is-active' : ''}">${f}</button>`).join('')}</div><div class="v3-totals"><div><span class="v3-label">ENTROU</span><strong class="v3-positive v3-sensitive">▲ ${money(t.income)}</strong></div><div><span class="v3-label">SAIU</span><strong class="v3-negative v3-sensitive">▼ ${money(t.expense)}</strong></div></div></div><p class="v3-muted">Só o que está confirmado entra nos totais. ${demo ? 'Na demonstração, os controles não alteram sua conta.' : 'Toque no círculo para confirmar.'}</p><section class="v3-panel v3-table"><div class="v3-table-header"><span>CARTÃO</span><span>DATA</span><span>DESCRIÇÃO</span><span>CATEGORIA</span><span>COMO FOI PAGO</span><span>VALOR</span><span></span></div>${cells || '<p class="v3-muted" style="padding:20px 0">Nenhum lançamento neste filtro.</p>'}</section></div>`;
  }
  function renderWallet() {
    const chosen = selectedItem();
    const related = chosen ? currentTransactions().filter((x) => x.cardId === chosen.data.id || x.accountId === chosen.data.id).slice(0, 8) : [];
    const invoice=chosen && chosen.kind==='credit' && !demo ? Calc.invoice(chosen.data.id,state.ym) : null;
    const itemAmount=chosen ? (chosen.kind==='credit' ? (demo ? 1982.3 : invoice?.planned || 0) : (demo ? sample.accountsBalance : Calc.accountBalance(chosen.data.id,U.monthEnd(state.ym)))) : 0;
    return `<div class="v3-grid v3-account-layout"><div>${wallet('SALDO EM CONTAS',true)}<button class="v3-wallet-add" type="button" data-action="add-account">＋ &nbsp; Adicionar conta ou cartão</button></div><section class="v3-panel v3-detail">${chosen ? `<div class="v3-row"><div><span class="v3-label">${chosen.kind === 'credit' ? `FATURA DE ${esc(niceMonth(state.ym).split(' de ')[0].toUpperCase())}` : 'EXTRATO DA CONTA'}</span><h2>${esc(chosen.data.bank || chosen.data.name)} •• ${esc(chosen.data.last4 || '••••')}</h2><small>${chosen.kind === 'credit' ? `fecha dia ${esc(chosen.data.closingDay)} · vence dia ${esc(chosen.data.dueDay)}` : 'Movimentações confirmadas'}</small></div><strong class="v3-money v3-sensitive">${money(itemAmount)}</strong></div>${chosen.kind === 'credit' ? `<div style="margin-top:16px"><small>Limite usado · ${money(itemAmount)} de ${money(chosen.data.limit)}</small><div class="v3-bar"><span style="width:${pct(100 * itemAmount / (+chosen.data.limit || 1))}%"></span></div></div>` : ''}<div class="v3-detail-actions"><button class="v3-primary" type="button" data-action="new">Novo lançamento</button><button class="v3-secondary" type="button" data-action="add-account">Adicionar</button></div>${related.length ? related.map((x) => `<div class="v3-detail-row"><span class="v3-mono v3-muted">${esc(shortDate(x.date))}</span><strong>${esc(x.description)}</strong><span class="v3-mono">${esc(x.methodLabel || (x.cardId ? 'CARTÃO' : 'CONTA'))}</span><span class="v3-mono ${x.kind==='income'?'v3-positive':'v3-negative'} v3-sensitive">${x.kind==='income'?'+':'−'} ${money(x.amount)}</span></div>`).join('') : '<p class="v3-muted">Nenhum movimento deste item no período.</p>'}` : '<h2>adicione uma conta ou cartão</h2><p class="v3-muted">A carteira mostrará faturas e extratos reais aqui.</p>'}</section></div>`;
  }
  function renderInvestments() {
    const list = profile().investments || [], total = invested(), sim = state.sim;
    const mensal = sim.taxa / 100 / 12, estimate = mensal ? sim.aporte * ((Math.pow(1 + mensal, sim.meses) - 1) / mensal) : sim.aporte * sim.meses;
    const distribution = list.length ? list.map((x, i) => ({ name: x.name, value: +(x.currentValue == null ? x.amount : x.currentValue) || 0, color: ['#5fa99b','#8fb0c0','#f0e5cf','#729cab'][i % 4] })).filter((x)=>x.value>0) : [];
    return `<div class="v3-grid v3-invest"><div class="v3-stack"><section class="v3-panel v3-wave"><span class="v3-label">PATRIMÔNIO INVESTIDO</span><div class="v3-row"><strong class="v3-money v3-sensitive">${money(total)}</strong><span class="v3-mono v3-positive">${demo ? '▲ R$ 340,00 no mês · valor estimado' : 'Valor informado nos seus investimentos'}</span></div>${distribution.length ? `<svg viewBox="0 0 720 150" preserveAspectRatio="none" aria-label="Distribuição visual dos investimentos"><path d="M0 138 L100 120 L160 108 L240 102 L340 82 L450 60 L550 40 L720 12 L720 150 H0Z" fill="rgba(95,169,155,.16)"/><path d="M0 138 L100 120 L160 108 L240 102 L340 82 L450 60 L550 40 L720 12" fill="none" stroke="#5fa99b" stroke-width="2"/></svg><div class="v3-axis"><span>início</span><span>${esc(periodLabel(state.ym))}</span></div>` : '<p class="v3-muted" style="margin:auto 0">Adicione investimentos para acompanhar seu patrimônio.</p>'}</section><section class="v3-panel"><h2>distribuição</h2>${distribution.length ? `<div class="v3-distribution">${distribution.map((x) => `<span style="width:${pct(100*x.value/total)}%;background:${esc(x.color)}"></span>`).join('')}</div>${distribution.map((x) => `<div class="v3-row" style="margin:8px 0"><strong><span style="display:inline-block;width:11px;height:11px;border-radius:3px;background:${esc(x.color)};margin-right:10px"></span>${esc(x.name)}</strong><span class="v3-mono v3-sensitive">${Math.round(100*x.value/total)}% &nbsp; ${money(x.value)}</span></div>`).join('')}` : '<p class="v3-muted">A distribuição aparece quando você cadastrar investimentos.</p>'}</section></div><section class="v3-panel"><h2>simular juros compostos</h2><div class="v3-range">${[['aporte','Aporte mensal',50,5000,50,money(sim.aporte)],['taxa','Taxa ao ano',0,30,0.5,`${sim.taxa}%`],['meses','Prazo',1,360,1,`${sim.meses} meses`]].map(([key,label,min,max,step,value]) => `<label><span><strong>${label}</strong><strong class="v3-mono">${value}</strong></span><input type="range" data-sim="${key}" min="${min}" max="${max}" step="${step}" value="${sim[key]}"></label>`).join('')}</div><div class="v3-estimate"><span class="v3-label">ESTIMATIVA AO FINAL</span><strong class="v3-money">${money(estimate)}</strong><p class="v3-muted">${money(estimate - sim.aporte*sim.meses)} de juros. Estimativa, sem garantia de rentabilidade.</p></div><button class="v3-coco-call" type="button" data-action="coco"><img src="/assets/coco/corpo-analisando_grafico.webp" alt=""><span>Pedir para a Coco montar um plano de aportes com esse valor</span></button></section></div>`;
  }
  function renderCategories() {
    const rows = categoryTotals(state.catKind), total = rows.reduce((n,r)=>n+r.value,0);
    let start=0; const stops = rows.length ? rows.map((r)=>{const prev=start;start+=100*r.value/total;return `${safeColor(r.color)} ${prev}% ${start}%`}).join(', ') : '#355565 0 100%';
    return `<div class="v3-stack"><div class="v3-segment" style="max-width:330px"><button type="button" data-cat-kind="expense" class="${state.catKind==='expense'?'is-active':''}">Despesas</button><button type="button" data-cat-kind="income" class="${state.catKind==='income'?'is-active':''}">Receitas</button></div><div class="v3-grid v3-categories"><section class="v3-panel"><div class="v3-donut" style="--donut:conic-gradient(${esc(stops)})" data-total="${esc(money(total))}"></div><p class="v3-muted" style="text-align:center">${rows.length ? `${esc(rows[0].name)} é ${Math.round(rows[0].value/total*100)}% do total em ${esc(niceMonth(state.ym).split(' de ')[0])}.` : 'As categorias aparecem com lançamentos confirmados.'}</p></section><div class="v3-cat-grid">${rows.map((r) => `<div class="v3-cat-tile"><span class="v3-cat-icon" style="--swatch:${safeColor(r.color)}">${icon(categoryIcon((profile().categories.find((c)=>c.id===r.id)||{}).icon) || 'categories')}</span><span><strong>${esc(r.name)}</strong><small>${Math.round(r.value/total*100)}% do total</small></span><strong class="v3-mono v3-sensitive">${money(r.value)}</strong></div>`).join('') || '<p class="v3-muted">Nenhuma categoria neste período.</p>'}</div></div></div>`;
  }
  function renderGoals() {
    const gs = profile().goals || [], budgets = Object.entries(profile().budgets || {}).map(([id,limit]) => ({id,limit,used:(categoryTotals('expense').find((x)=>x.id===id)||{}).value||0}));
    const goalsHtml = gs.length ? gs.map((g) => `<section class="v3-panel v3-goal"><div class="v3-row"><h2>${esc(g.name)}</h2><small class="v3-mono">${g.deadline ? 'até '+esc(shortDate(g.deadline)) : ''}</small></div><p class="v3-money v3-sensitive">${money(g.saved)} <span class="v3-muted" style="font:400 12px var(--mono)">de ${money(g.target)}</span></p><div class="v3-bar"><span style="width:${pct(100*g.saved/(g.target||1))}%"></span></div><p style="margin-top:12px">● &nbsp; Faltam ${money(Math.max(0,g.target-g.saved))}.</p></section>`).join('') : '<section class="v3-panel"><p class="v3-muted">Você ainda não definiu metas.</p></section>';
    const budgetsHtml = budgets.length ? budgets.map((b) => `<div class="v3-budget-row"><div class="v3-row"><strong>${esc(categoryName(b.id))}</strong><strong class="v3-mono v3-sensitive">${money(b.used)} / ${money(b.limit)}</strong></div><div class="v3-bar"><span style="width:${pct(100*b.used/b.limit)}%;background:${b.used>b.limit?'var(--blue)':'var(--teal)'}"></span></div><small>${b.used>b.limit?'Passou '+money(b.used-b.limit)+' do planejado.':'Restam '+money(b.limit-b.used)+' neste mês.'}</small></div>`).join('') : '<p class="v3-muted">Nenhum orçamento definido para categorias.</p>';
    return `<div class="v3-segment v3-mobile-only" style="margin-bottom:16px"><button type="button" data-goal-tab="goals" class="${state.goalTab==='goals'?'is-active':''}">Metas</button><button type="button" data-goal-tab="budgets" class="${state.goalTab==='budgets'?'is-active':''}">Orçamentos</button></div><div class="v3-grid v3-goals"><div class="v3-goal-column" data-column="goals"><span class="v3-label v3-section-title">METAS</span>${goalsHtml}</div><div class="v3-budget-column" data-column="budgets"><span class="v3-label v3-section-title">ORÇAMENTOS DE ${esc(niceMonth(state.ym).split(' de ')[0].toUpperCase())}</span><section class="v3-panel">${budgetsHtml}</section></div></div>`;
  }
  function reminders() {
    if (demo) return sample.reminders;
    const today = U.todayISO(), until = new Date(); until.setDate(until.getDate()+30); const max = until.toISOString().slice(0,10);
    return profile().transactions.filter((t)=>!t.confirmed && t.date>=today && t.date<=max).map((t)=>({title:t.description,date:t.date,amount:t.amount,sub:categoryName(t.categoryId)})).sort((a,b)=>a.date.localeCompare(b.date));
  }
  function renderReminders() {
    const rs = reminders();
    return `<div class="v3-grid v3-reminders"><div><span class="v3-label v3-section-title">PRÓXIMOS 30 DIAS</span><section class="v3-panel" style="padding:0">${rs.length?rs.map((r)=>`<div class="v3-reminder-row"><span class="v3-date">${esc(r.date.slice(8,10))}<small>${esc(shortDate(r.date).split(' ')[1].toUpperCase())}</small></span><span><strong>${esc(r.title)}</strong><small>${esc(r.sub)}</small></span><strong class="v3-mono v3-negative v3-sensitive">${money(r.amount)}</strong></div>`).join(''):'<p class="v3-muted" style="padding:20px">Nenhum compromisso pendente registrado nos próximos 30 dias.</p>'}</section></div><div><span class="v3-label v3-section-title">PRÉVIA DA NOTIFICAÇÃO</span><section class="v3-panel"><div class="v3-row"><img src="/assets/brand/oaze-isologo.svg" width="37" height="37" alt=""><span style="flex:1"><strong>OAZE</strong><small style="display:block">${rs.length?esc(rs[0].title)+' está próximo do vencimento':'Nenhum aviso pendente'}</small></span><small>agora</small></div></section><div class="v3-segment" style="margin:12px 0"><button type="button" class="is-active">Sem valor</button><button type="button" disabled>Com valores</button><button type="button" disabled>Genérico</button></div><section class="v3-panel"><h3>avisar sobre</h3>${['Fatura do cartão','Despesa fixa não confirmada','Recorrência do dia'].map((x)=>`<div class="v3-setting-row"><span>${x}<small>Preferências de aviso no app atual</small></span><span class="v3-muted">—</span></div>`).join('')}</section></div></div>`;
  }
  function renderSettings() {
    const signed = !demo && global.V3Backend && V3Backend.user();
    return `<div class="v3-grid v3-settings"><div><span class="v3-label v3-section-title">SEGURANÇA</span><section class="v3-panel"><div class="v3-setting-row"><span>Biometria ao abrir<small>Depende do app nativo; indisponível no navegador.</small></span><span class="v3-muted">—</span></div><div class="v3-setting-row"><span>PIN de 6 números<small>Não configurado nesta V3 web.</small></span><span class="v3-muted">—</span></div><div class="v3-setting-row"><span>Sessão em outros aparelhos</span><span class="v3-muted">${signed?'ativa':'entre na conta'}</span></div></section></div><div><span class="v3-label v3-section-title">COCO</span><section class="v3-panel"><div class="v3-setting-row"><span>Consentimento<small>Somente os agregados necessários à conversa.</small></span><span class="v3-muted">${signed?'verificar':'sem sessão'}</span></div><div class="v3-setting-row"><span>Aprender com meus lançamentos<small>Memória ainda não implementada no backend.</small></span><span class="v3-muted">—</span></div><div class="v3-setting-row"><span>Memória da Coco<small>Não armazenamos memória fictícia.</small></span><span class="v3-muted">—</span></div></section></div><div><span class="v3-label v3-section-title">CONTA E DADOS</span><section class="v3-panel"><button type="button" class="v3-setting-row" data-go="reminders" style="border:0;background:none;color:inherit;width:100%;text-align:left"><span>Notificações</span><span class="v3-muted">lembretes ›</span></button><button type="button" class="v3-setting-row" data-go="plan" style="border:0;background:none;color:inherit;width:100%;text-align:left"><span>Plano</span><span class="v3-muted">ver plano ›</span></button><button type="button" class="v3-setting-row" data-action="profiles" style="border:0;background:none;color:inherit;width:100%;text-align:left"><span>Perfil ativo</span><span class="v3-muted">${esc(profile().name || 'Pessoal')} ›</span></button><div class="v3-setting-row"><span>Sincronização<small>${signed?'Conectada à sua conta':'Dados apenas neste aparelho'}</small></span></div>${demo?'':`<a class="v3-setting-row" href="/app?classic=1"><span>Ferramentas anteriores<small>Edição completa de recursos ainda em migração.</small></span><span class="v3-muted">abrir ›</span></a>`}</section></div></div>`;
  }
  function renderPlan() {
    const list = global.Planos ? Planos.LISTA : [];
    return `<p class="v3-muted" style="max-width:65ch;margin:0 0 19px">Estes são os planos vigentes no sistema. Os preços do protótipo são uma proposta visual e não alteram a cobrança.</p><div class="v3-grid v3-plan-grid">${list.map((p)=>`<section class="v3-panel v3-plan${p.destaque?' highlight':''}"><div class="v3-row"><h2>${esc(p.nome)}</h2>${p.destaque?'<span class="v3-label" style="color:inherit">PLANO PRINCIPAL</span>':''}</div><p class="v3-money">${money(p.mensalCentavos/100)} <span style="font:400 13px var(--body)">por mês</span></p><p>${esc(p.descricao)}</p><ul><li>${p.limites.workspaces==null?'Espaços sem limite':'Até '+p.limites.workspaces+' espaços'}</li><li>${p.limites.accounts==null?'Contas sem limite':'Até '+p.limites.accounts+' contas'}</li><li>${p.limites.credit_cards==null?'Cartões sem limite':'Até '+p.limites.credit_cards+' cartões'}</li><li>${p.limites.ai_queries_per_month==null?'Coco sem limite':p.limites.ai_queries_per_month+' pedidos à Coco por mês'}</li></ul><button type="button" class="${p.destaque?'v3-secondary':'v3-primary'}" data-action="plan-info">Ver detalhes do plano</button></section>`).join('')}</div>`;
  }
  function renderMore() {
    const desc = { investments: `${money(invested())} investidos`, categories: `${profile().categories.length} em uso`, goals: `${profile().goals.length} metas ativas`, reminders: `${reminders().length} nos próximos 30 dias`, settings: 'segurança, dados', plan: demo ? 'OAZE mensal' : 'planos vigentes' };
    return `<div class="v3-row" style="margin-bottom:22px"><span class="v3-avatar" style="width:55px;height:55px;font-size:23px">${esc((demo?sample.owner:Store.ownerName()||'o').charAt(0).toLowerCase())}</span><span style="flex:1"><h2>${esc(demo?sample.owner:Store.ownerName()||'Seu OAZE')}</h2><small>Perfil ${esc(profile().name||'Pessoal')}</small></span></div><div class="v3-more">${['investments','categories','goals','reminders','settings','plan'].map((p)=>`<button type="button" data-go="${p}">${icon(p)}<strong>${esc(names[p])}</strong><small>${esc(desc[p])}</small></button>`).join('')}</div>`;
  }
  function render() {
    renderHead(); renderNav();
    const screens = { home:renderHome, transactions:renderTransactions, wallet:renderWallet, investments:renderInvestments, categories:renderCategories, goals:renderGoals, reminders:renderReminders, settings:renderSettings, plan:renderPlan, more:renderMore };
    $('#v3-view').innerHTML = (screens[state.page]||renderHome)();
    if (!demo && classicPaths[state.page]) $('#v3-view').insertAdjacentHTML('beforeend', `<p class="v3-classic-link">Precisa editar algo que ainda não está nesta tela? <a href="${classicPaths[state.page]}?classic=1">Abrir ferramentas completas</a></p>`);
    document.body.classList.toggle('v3-hide-money',state.hideMoney);
    document.body.classList.toggle('v3-home-screen',state.page==='home');
    if (state.page==='goals') updateGoalTabs();
  }
  function updateGoalTabs() {
    const mobile = matchMedia('(max-width:900px)').matches;
    const gs = $('[data-column="goals"]'), bs = $('[data-column="budgets"]');
    if (gs&&bs) { gs.hidden = mobile && state.goalTab!=='goals'; bs.hidden = mobile && state.goalTab!=='budgets'; }
  }
  function go(page) { if (!names[page]) return; state.page=page; if (demo && page==='wallet' && !state.selected) state.selected='c1'; render(); window.scrollTo({top:0,behavior:'instant'}); history.replaceState(null,'',`${!demo && location.pathname.startsWith('/app') && location.pathname !== '/app-v3.html' ? '/app' : location.pathname}${location.search}#${page}`); }

  function toast(message) {
    const el=$('#v3-toast'); el.textContent=message; el.hidden=false;
    clearTimeout(toast.timer); toast.timer=setTimeout(()=>{el.hidden=true;},4500);
  }
  function closeSheet() { $('#v3-overlay').hidden=true; $('#v3-sheet').innerHTML=''; document.body.style.overflow=''; }
  function openSheet(html,label) { $('#v3-sheet').setAttribute('aria-label',label||'Painel'); $('#v3-sheet').innerHTML=html; $('#v3-overlay').hidden=false; document.body.style.overflow='hidden'; $('#v3-sheet').querySelector('button')?.focus(); }
  function sheetTop(title,sub,img) { return `<div class="v3-sheet-top">${img?`<img src="${img}" alt="">`:''}<span><h2>${esc(title)}</h2>${sub?`<small>${esc(sub)}</small>`:''}</span><button type="button" data-action="close" class="v3-sheet-close" aria-label="Fechar">×</button></div>`; }
  function openCoco() {
    let body='';
    if (state.cocoTab==='Agora') {
      if (demo) body=`<h2 style="margin:10px 0 20px">quatro coisas<br>esperando por você.</h2><div class="v3-suggestion"><span class="v3-label">FEITO POR MIM</span><p>Categorizei 12 lançamentos de setembro do jeito que você costuma fazer.</p><button class="v3-primary" type="button" data-action="demo-only">Tudo certo</button><button class="v3-secondary" type="button" data-action="demo-only">Revisar</button></div><div class="v3-suggestion"><span class="v3-label">PADRÃO VISTO 3 VEZES</span><p>Vi 3 cobranças parecidas da academia perto do dia 5. Quer transformar isso em recorrência?</p><button class="v3-primary" type="button" data-action="demo-only">Criar recorrência</button><button class="v3-secondary" type="button" data-action="demo-only">Agora não</button></div><div class="v3-suggestion"><span class="v3-label">PREVISÃO</span><p>A fatura do Nubank fecha em 2 dias. Outubro começa com R$ 955,30 de sobra.</p><button class="v3-primary" type="button" data-action="demo-only">Lembrar 3 dias antes</button></div>`;
      else {
        const pending=currentTransactions().filter((x)=>!x.confirmed).length, rs=reminders();
        body=`<h2 style="margin:10px 0 20px">o que precisa<br>da sua atenção</h2>${pending?`<div class="v3-suggestion"><span class="v3-label">LANÇAMENTOS PENDENTES</span><p>${pending} ${pending===1?'lançamento aguarda':'lançamentos aguardam'} confirmação neste mês.</p><button class="v3-primary" type="button" data-go="transactions">Revisar</button></div>`:''}${rs.length?`<div class="v3-suggestion"><span class="v3-label">PRÓXIMOS 30 DIAS</span><p>${rs.length} ${rs.length===1?'compromisso registrado':'compromissos registrados'} para acompanhar.</p><button class="v3-primary" type="button" data-go="reminders">Ver lembretes</button></div>`:''}${!pending&&!rs.length?'<p class="v3-muted">Não há pendências registradas agora. A Coco não inventa alertas.</p>':''}`;
      }
    } else if (state.cocoTab==='Conversa') {
      body=`<div class="v3-chat" id="v3-chat">${state.chat.length?state.chat.map((x)=>`<p class="${x.who==='user'?'user':''}">${esc(x.text)}</p>`).join(''):'<p>Posso ler os totais do mês e ajudar a organizar suas próximas decisões.</p>'}</div><form class="v3-chat-form" id="v3-chat-form"><input name="question" maxlength="500" placeholder="Peça para lançar, analisar ou planejar" aria-label="Pergunta para a Coco" required><button type="submit" aria-label="Enviar">↑</button></form><small>O servidor recebe agregados; confira qualquer proposta antes de confirmar.</small>`;
    } else {
      body=`<h2 style="margin:15px 0">o que aprendi sobre você</h2><p class="v3-muted">A memória editável do protótipo ainda não existe no backend. Não vou exibir lembranças inventadas nem guardar preferências sem um controle de exclusão.</p>`;
    }
    openSheet(`${sheetTop('coco',demo?'demonstração de interface':'sua assistente','/assets/coco/corpo-neutra_acolhedora.webp')}<div class="v3-segment">${['Agora','Conversa','Memória'].map((x)=>`<button type="button" data-coco-tab="${x}" class="${state.cocoTab===x?'is-active':''}">${x}</button>`).join('')}</div>${body}`,'Coco');
  }
  function composer(kind) {
    const current=kind||'Despesa';
    const categoryOptions=profile().categories.filter((c)=>c.kind===(current==='Receita'?'income':'expense')).map((c)=>`<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('');
    const accounts=profile().accounts.filter((a)=>!a.archived), cards=profile().cards;
    const targets=accounts.map((a)=>`<option value="account:${esc(a.id)}">${esc(a.bank||a.name)} •• ${esc(a.last4||'')}</option>`).join('')+(current==='Despesa'?cards.map((c)=>`<option value="card:${esc(c.id)}">${esc(c.bank||c.name)} •• ${esc(c.last4||'')}</option>`).join(''):'');
    openSheet(`${sheetTop('novo lançamento',demo?'demonstração sem gravação':'seu registro financeiro')}<div class="v3-segment">${['Despesa','Receita','Transferir','Aporte'].map((x)=>`<button type="button" data-compose-kind="${x}" class="${current===x?'is-active':''}">${x}</button>`).join('')}</div>${current==='Aporte'?'<div class="v3-suggestion"><p>O aporte ainda não possui histórico próprio nesta V3. Registrar apenas um valor aqui alteraria o patrimônio sem um lançamento rastreável.</p></div>':`<form class="v3-form" id="v3-form-tx"><input type="hidden" name="kind" value="${current}"><label>VALOR (R$)<input name="amount" inputmode="decimal" data-money="true" autocomplete="off" placeholder="0,00" required></label><label>DESCRIÇÃO<input name="description" maxlength="120" placeholder="Ex.: mercado" required></label>${current==='Transferir'?'':`<label>CATEGORIA<select name="category" required><option value="">Escolha uma categoria</option>${categoryOptions}</select></label>`}<label>${current==='Transferir'?'CONTA DE ORIGEM':'COMO FOI PAGO / RECEBIDO'}<select name="source" required><option value="">Selecione</option>${targets}</select></label>${current==='Transferir'?`<label>CONTA DE DESTINO<select name="destination" required><option value="">Selecione</option>${accounts.map((a)=>`<option value="${esc(a.id)}">${esc(a.bank||a.name)}</option>`).join('')}</select></label>`:''}<div class="v3-form-row"><label>DATA<input type="date" name="date" value="${esc(U.todayISO())}" required></label><label>ESTADO<select name="confirmed"><option value="true">Já foi pago / recebido</option><option value="false">Previsto</option></select></label></div><button type="submit" class="v3-primary">${demo?'Ver na demonstração':'Salvar lançamento'}</button></form>`}`,'Novo lançamento');
  }
  function accountForm() {
    openSheet(`${sheetTop('adicionar à carteira',demo?'demonstração sem gravação':'conta ou cartão')}<div class="v3-segment"><button type="button" data-account-type="account" class="is-active">Conta</button><button type="button" data-account-type="card">Cartão</button></div><form class="v3-form" id="v3-form-account"><input type="hidden" name="type" value="account"><label>NOME<input name="name" maxlength="60" placeholder="Ex.: Conta corrente" required></label><label>BANCO<input name="bank" maxlength="50" placeholder="Ex.: Itaú"></label><label>ÚLTIMOS 4 DÍGITOS (OPCIONAL)<input name="last4" inputmode="numeric" pattern="[0-9]{0,4}" maxlength="4"></label><label>VALOR INICIAL / LIMITE (R$)<input name="amount" inputmode="decimal" data-money="true" placeholder="0,00"></label><div class="v3-form-row" id="v3-card-dates" hidden><label>DIA DE FECHAMENTO<input name="closing" type="number" min="1" max="31" value="28"></label><label>DIA DE VENCIMENTO<input name="due" type="number" min="1" max="31" value="5"></label></div><button type="submit" class="v3-primary">${demo?'Ver na demonstração':'Adicionar à carteira'}</button></form>`,'Adicionar à carteira');
  }
  function periodSheet() {
    openSheet(`${sheetTop('escolher mês','período exibido em todas as telas')}<form class="v3-form" id="v3-form-period"><label>MÊS E ANO<input type="month" name="ym" value="${esc(state.ym)}" required></label><button class="v3-primary" type="submit">Mostrar período</button></form>`,'Escolher período');
  }
  function profilesSheet() {
    const ps=demo?[{id:'sample',name:'Pessoal'}]:Store.state().profiles;
    openSheet(`${sheetTop('seus espaços','perfil financeiro ativo')}<div class="v3-stack" style="margin-top:22px">${ps.map((p)=>`<button type="button" class="v3-pill${p.id===profile().id?' is-active':''}" data-profile="${esc(p.id)}">${esc(p.name)}</button>`).join('')}</div>${demo?'<p class="v3-muted" style="margin-top:20px">O perfil de demonstração é isolado dos seus dados.</p>':''}`,'Perfis financeiros');
  }
  function parseMoney(raw) { const n=U.parseMoney(String(raw||'')); return n==null?NaN:U.round2(n); }
  function canAdd(limit,ym) { return !global.Limites || !Limites.cabe || Limites.cabe(limit,ym); }
  async function saveTransaction(form) {
    if (demo) { toast('Demonstração: nenhum dado foi salvo.'); return; }
    if (!await limitsPromise) { toast('Não consegui confirmar os limites da conta. Tente novamente.'); return; }
    const fd=new FormData(form), kind=fd.get('kind'), amount=parseMoney(fd.get('amount')), date=String(fd.get('date')||''), description=String(fd.get('description')||'').trim(), source=String(fd.get('source')||'');
    if (!(amount>0) || !U.isValidISO(date) || !description || !source) { toast('Confira valor, descrição, data e conta/cartão.'); return; }
    if (!canAdd('transactions_per_month',ymOf(date))) { toast('Este lançamento ultrapassa o limite do seu plano.'); return; }
    const [sourceType,sourceId]=source.split(':'), transfer=kind==='Transferir', destination=String(fd.get('destination')||'');
    if (!((sourceType==='account' && profile().accounts.some((a)=>a.id===sourceId && !a.archived)) || (sourceType==='card' && kind==='Despesa' && profile().cards.some((c)=>c.id===sourceId)))) { toast('Escolha uma conta ou cartão válido.'); return; }
    if (transfer && (!destination || destination===sourceId || sourceType!=='account' || !profile().accounts.some((a)=>a.id===destination && !a.archived))) { toast('Escolha duas contas diferentes para transferir.'); return; }
    const tx={kind:transfer?'transfer':kind==='Receita'?'income':'expense',description,amount,date,categoryId:transfer?null:String(fd.get('category')||''),accountId:sourceType==='account'?sourceId:null,cardId:sourceType==='card'?sourceId:null,toAccountId:transfer?destination:null,confirmed:fd.get('confirmed')==='true',source:'manual'};
    if (!transfer && !tx.categoryId) { toast('Escolha uma categoria.'); return; }
    try {
      await V3Backend.mutate(() => Store.transactions.add(tx));
      closeSheet(); render(); toast('Lançamento salvo na sua conta.');
    } catch (e) { console.error('V3/lançamento:', e); toast(e.message || 'Não foi possível salvar.'); }
  }
  async function saveAccount(form) {
    if (demo) { toast('Demonstração: nenhum dado foi salvo.'); return; }
    if (!await limitsPromise) { toast('Não consegui confirmar os limites da conta. Tente novamente.'); return; }
    const fd=new FormData(form), type=fd.get('type'),name=String(fd.get('name')||'').trim(),bank=String(fd.get('bank')||'').trim(),last4=String(fd.get('last4')||'').replace(/\D/g,'').slice(-4),amount=parseMoney(fd.get('amount'));
    if (!name || (!Number.isFinite(amount) && String(fd.get('amount')||'').trim()) || amount<0) { toast('Confira nome e valor.'); return; }
    if (!canAdd(type==='card'?'credit_cards':'accounts',state.ym)) { toast('Esta inclusão ultrapassa o limite do seu plano.'); return; }
    const initial=Number.isFinite(amount)?amount:0;
    try {
      await V3Backend.mutate(() => {
        if (type==='card') Store.cards.add({name,bank,last4,limit:initial,closingDay:+fd.get('closing')||28,dueDay:+fd.get('due')||5,color:'#355565',moeda:'BRL'});
        else Store.accounts.add({name,bank,last4,openingBalance:initial,openedAt:U.todayISO(),type:'Conta corrente',color:'#355565',moeda:'BRL'});
      });
      closeSheet(); render(); toast('Item salvo na sua conta.');
    } catch (e) { console.error('V3/carteira:', e); toast(e.message || 'Não foi possível salvar.'); }
  }
  async function askCoco(form) {
    const q=String(new FormData(form).get('question')||'').trim(); if (!q) return;
    if (demo) { toast('A conversa de demonstração não envia perguntas.'); return; }
    if (!global.Sync || !Sync.currentUser || !Sync.currentUser()) { toast('Entre na sua conta para conversar com a Coco.'); return; }
    state.chat.push({who:'user',text:q}); openCoco();
    try {
      const r=await AI.chamarFuncao(AI.corpoDaPergunta(q));
      state.chat.push({who:'coco',text:r.texto || r.mensagem || (r.acao_proposta?'A Coco preparou uma ação. A revisão e confirmação dessa ação ainda não estão conectadas à V3.':'Não consegui responder agora.')});
    } catch (e) { console.error('V3/Coco:',e); state.chat.push({who:'coco',text:'A conversa está indisponível agora. Tente de novo.'}); }
    openCoco();
  }
  function handleClick(ev) {
    const target=ev.target.closest('[data-go],[data-action],[data-select],[data-filter],[data-cat-kind],[data-goal-tab],[data-coco-tab],[data-compose-kind],[data-account-type],[data-confirm],[data-profile]');
    if (!target) return;
    if (target.dataset.go) { closeSheet(); go(target.dataset.go); return; }
    if (target.dataset.select) { state.selected=target.dataset.select; if(state.page==='home')go('wallet');else render(); return; }
    if (target.dataset.filter) { state.filter=target.dataset.filter; render(); return; }
    if (target.dataset.catKind) { state.catKind=target.dataset.catKind; render(); return; }
    if (target.dataset.goalTab) { state.goalTab=target.dataset.goalTab; render(); return; }
    if (target.dataset.cocoTab) { state.cocoTab=target.dataset.cocoTab; openCoco(); return; }
    if (target.dataset.composeKind) { composer(target.dataset.composeKind); return; }
    if (target.dataset.accountType) { const f=$('#v3-form-account');f.elements.type.value=target.dataset.accountType;$('#v3-card-dates').hidden=target.dataset.accountType!=='card';document.querySelectorAll('[data-account-type]').forEach((b)=>b.classList.toggle('is-active',b===target));return; }
    if (target.dataset.profile) { if(!demo){Store.setActiveProfile(target.dataset.profile);closeSheet();render();}return; }
    if (target.dataset.confirm) { if(demo){toast('Demonstração: nenhum dado foi alterado.');return;}const tx=Store.transactions.get(target.dataset.confirm);if(!tx){toast('Esse registro é uma ocorrência recorrente; abra o período de origem para editar.');return;}V3Backend.mutate(()=>Store.transactions.update(tx.id,{confirmed:!tx.confirmed})).then(()=>toast('Estado salvo na sua conta.')).catch((e)=>toast(e.message||'Não foi possível salvar.'));return; }
    const action=target.dataset.action;
    if (action==='close'){closeSheet();return;}
    if (action==='back'){go('more');return;}
    if (action==='new'){const k={despesa:'Despesa',receita:'Receita',transferir:'Transferir',aporte:'Aporte'}[target.dataset.kind]||'Despesa';composer(k);return;}
    if (action==='add-account'){accountForm();return;}
    if (action==='coco'){state.cocoTab='Agora';openCoco();return;}
    if (action==='period'){periodSheet();return;}
    if (action==='profiles'){profilesSheet();return;}
    if (action==='privacy'){state.hideMoney=!state.hideMoney;render();return;}
    if (action==='notifications'){go('reminders');return;}
    if (action==='plan-info'){go('plan');return;}
    if (action==='demo-only'){toast('Esta é uma proposta visual; não houve nenhuma ação na sua conta.');return;}
  }
  function handleSubmit(ev) {
    if(!['v3-form-tx','v3-form-account','v3-form-period','v3-chat-form'].includes(ev.target.id))return;
    ev.preventDefault();
    if(ev.target.id==='v3-form-tx')saveTransaction(ev.target);
    if(ev.target.id==='v3-form-account')saveAccount(ev.target);
    if(ev.target.id==='v3-form-period'){state.ym=String(new FormData(ev.target).get('ym'));closeSheet();render();}
    if(ev.target.id==='v3-chat-form')askCoco(ev.target);
  }
  async function boot() {
    if(!demo){try { if(!global.V3Backend || !await V3Backend.start()) return; } catch(e){ console.error('V3/dados:',e); $('#v3-view').innerHTML='<p>Não foi possível carregar sua conta. Seus dados não foram alterados.</p><p><button type="button" id="v3-retry">Tentar novamente</button> ou abra as ferramentas anteriores em <a href="/app?classic=1">/app?classic=1</a>.</p>';$('#v3-retry').addEventListener('click',()=>location.reload());return; }}
    if(!demo)Store.onChange(()=>render());
    if(!demo && global.Limites) limitsPromise=V3Backend.withTimeout(Limites.carregar()).catch((e)=>{console.error('V3/limites:',e);return null;});
    const path=location.pathname.replace(/\/+$/,'') || '/app';
    const requested=location.hash.slice(1) || initialPaths[path];state.page=names[requested]?requested:'home';
    if(!demo && global.OazeCookies) OazeCookies.mostrar();
    if(demo&&state.page==='wallet'&&!state.selected)state.selected='c1';
    document.addEventListener('click',handleClick);document.addEventListener('submit',handleSubmit);
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
    document.addEventListener('input',(ev)=>{if(ev.target.dataset.sim){state.sim[ev.target.dataset.sim]=+ev.target.value;render();}});
    document.addEventListener('keydown',(ev)=>{if(ev.key==='Escape'&&!$('#v3-overlay').hidden){closeSheet();return;}if(ev.key.toLowerCase()==='n'&&!ev.ctrlKey&&!ev.altKey&&!ev.metaKey&&!['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName)){ev.preventDefault();composer('Despesa');}});
    addEventListener('resize',()=>{if(state.page==='goals')updateGoalTabs();});
    render();
    if(!demo && path==='/app/uglez') { state.cocoTab='Conversa'; openCoco(); }
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})(window);
