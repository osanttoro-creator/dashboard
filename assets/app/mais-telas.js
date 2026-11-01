/* =============================================================
   mais-telas.js — telas novas do "Mais" (31/10/2026)
   Inspiração Kontto: Tags, Projeções, Financiamentos, Empréstimos,
   Quem me deve e Relatório personalizado.

   Cada tela abre por cima do painel (dialog em tela cheia, com
   voltar), lê o perfil ativo pelo Store e grava pelo mesmo caminho
   dos outros dados (V3Backend.mutate), então sincroniza igual.
   Na demonstração tudo funciona na memória e nada é gravado.

   Dados (normalizados em store.js):
   - profile.tags      [{id, nome, cor}]   e  transaction.tags [ids]
   - profile.dividas   [{id, tipo, nome, instituicao, valorTotal,
                         parcela, parcelas, pagas, dia, juros}]
   - profile.aReceber  [{id, pessoa, descricao, valor, recebido,
                         data, vence, quitado}]
   ============================================================= */
(function (global) {
  'use strict';

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const reais = (v) => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const num = (v) => { const n = global.U && U.parseMoney ? U.parseMoney(String(v || '')) : parseFloat(String(v || '').replace(/\./g, '').replace(',', '.')); return Number.isFinite(n) ? n : 0; };
  const hoje = () => (global.U && U.todayISO ? U.todayISO() : new Date().toISOString().slice(0, 10));
  const ymDe = (iso) => iso.slice(0, 7);
  const somaMes = (ym, n) => { const [y, m] = ym.split('-').map(Number); const d = new Date(y, m - 1 + n, 1); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); };
  const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const nomeMes = (ym) => MESES[Number(ym.slice(5, 7)) - 1] + '/' + ym.slice(2, 4);
  const uid = (p) => (global.U && U.uid ? U.uid(p) : p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6));
  const P = () => { try { const c = global.OAZE_REPORT_CONTEXT && OAZE_REPORT_CONTEXT(); if (c && c.profile) return c.profile; } catch { /* segue */ } return global.Store.profile(); };
  const demo = () => { try { return !!(global.OAZE_REPORT_CONTEXT && OAZE_REPORT_CONTEXT().demo); } catch { return true; } };
  const avisar = (t) => { const el = document.getElementById('v3-toast'); if (el) { el.textContent = t; el.hidden = false; clearTimeout(avisar.t); avisar.t = setTimeout(() => { el.hidden = true; }, 4000); } };
  const CORES = ['#5FA99B', '#3ECF8E', '#6AA8FF', '#A78BFA', '#F472B6', '#EE8F72', '#F2B33D', '#94A3B8'];

  /* Grava como o resto do app; na demonstração, só na memória. */
  async function mudar(fn, msg) {
    try {
      if (!demo() && global.V3Backend && V3Backend.mutate) await V3Backend.mutate(fn);
      else { fn(); if (!demo() && global.Store.commit) Store.commit('extras'); }
      if (msg) avisar(msg);
      return true;
    } catch (e) { avisar((e && e.message) || 'Não consegui salvar. Nada foi alterado.'); return false; }
  }

  /* ---------- casca: tela cheia com voltar ---------- */
  let tela = null;
  function abrirTela(titulo, desenhar) {
    fecharTela();
    const volta = document.activeElement;
    const d = document.createElement('dialog');
    d.className = 'oz-tela';
    d.setAttribute('aria-labelledby', 'oz-tela-titulo');
    d.innerHTML = '<header class="oz-tela-topo"><button type="button" class="oz-tela-voltar" data-oz-voltar aria-label="Voltar">‹</button><h1 id="oz-tela-titulo">' + esc(titulo) + '</h1><span></span></header><div class="oz-tela-corpo"></div>';
    document.body.appendChild(d);
    d.addEventListener('close', () => { d.remove(); if (tela && tela.el === d) tela = null; if (volta && volta.isConnected) volta.focus(); });
    d.addEventListener('click', (ev) => { if (ev.target.closest('[data-oz-voltar]')) d.close(); });
    tela = { el: d, desenhar };
    redesenhar();
    d.showModal();
    d.querySelector('.oz-tela-voltar').focus();
  }
  function redesenhar() { if (!tela) return; const c = tela.el.querySelector('.oz-tela-corpo'); const y = c.scrollTop; c.innerHTML = tela.desenhar(); c.scrollTop = y; }
  function fecharTela() { if (tela && tela.el.open) tela.el.close(); }

  /* =============================================================
     1. TAGS
     ============================================================= */
  function totaisPorTag(ym) {
    const t = {};
    const ini = ym + '-01', fim = ym + '-31';
    (global.Calc ? Calc.entries(ini, fim, P()) : []).forEach((e) => {
      if (e.kind === 'transfer' || !e.tx || !e.tx.tags) return;
      e.tx.tags.forEach((id) => { const x = t[id] || (t[id] = { qtd: 0, gasto: 0, entrada: 0 }); x.qtd++; if (e.kind === 'expense') x.gasto += e.amount; else x.entrada += e.amount; });
    });
    return t;
  }
  function telaTags() {
    const ym = ymDe(hoje()), tot = totaisPorTag(ym), tags = P().tags || [];
    return '<p class="oz-tela-intro">Tags cruzam categorias: "viagem", "casamento", "reforma". Marque nos lançamentos e veja quanto cada uma custou.</p>'
      + '<form class="oz-linha-form" data-oz-form="tag-nova"><input name="nome" maxlength="30" placeholder="Nova tag, ex.: viagem" aria-label="Nome da nova tag" required><button class="v3-primary" type="submit">Criar</button></form>'
      + (tags.length ? '<ul class="oz-lista">' + tags.map((t) => {
        const x = tot[t.id] || { qtd: 0, gasto: 0, entrada: 0 };
        return '<li><span class="oz-tag-cor" style="background:' + esc(t.cor) + '"></span><span class="oz-lista-txt"><strong>#' + esc(t.nome) + '</strong><small>' + x.qtd + ' lançamento' + (x.qtd === 1 ? '' : 's') + ' em ' + nomeMes(ym) + (x.gasto ? ' · ' + reais(x.gasto) + ' gastos' : '') + '</small></span>'
          + '<button type="button" class="v3-link" data-oz-tag-renomear="' + esc(t.id) + '">Renomear</button><button type="button" class="v3-link oz-perigo" data-oz-tag-excluir="' + esc(t.id) + '">Excluir</button></li>';
      }).join('') + '</ul>' : '<p class="oz-vazio">Nenhuma tag ainda. Crie a primeira acima e escolha no formulário de lançamento.</p>');
  }
  async function criarTag(nome) {
    nome = String(nome || '').trim().replace(/^#/, '').slice(0, 30);
    if (!nome) return null;
    const ja = (P().tags || []).find((t) => t.nome.toLowerCase() === nome.toLowerCase());
    if (ja) return ja;
    const nova = { id: uid('tag'), nome, cor: CORES[(P().tags || []).length % CORES.length] };
    const ok = await mudar(() => { const p = P(); p.tags = (p.tags || []).concat(nova); });
    return ok ? nova : null;
  }

  /* Campo de tags no formulário de lançamento. */
  function campoTags(form) {
    if (!form || form.querySelector('[data-oz-tags]')) return;
    const desc = form.querySelector('[name="description"]');
    const ancora = desc ? desc.closest('label') : null;
    if (!ancora) return;
    const id = form.elements.id && form.elements.id.value;
    const tx = id ? (P().transactions || []).find((t) => t.id === id) : null;
    const marcadas = new Set((tx && tx.tags) || []);
    const html = '<fieldset class="oz-tags-campo" data-oz-tags><legend>TAGS (OPCIONAL)</legend><input type="hidden" name="tags" value="' + esc([...marcadas].join(',')) + '"><div class="oz-tags-chips"></div></fieldset>';
    const mais = form.querySelector('.v3-mais .v3-mais-corpo');
    if (mais) { mais.insertAdjacentHTML('afterbegin', html); if (marcadas.size) form.querySelector('.v3-mais').open = true; }
    else ancora.insertAdjacentHTML('afterend', html);
    pintarChips(form);
  }
  function pintarChips(form) {
    const campo = form.querySelector('[data-oz-tags]'); if (!campo) return;
    const input = campo.querySelector('[name="tags"]');
    const sel = new Set(input.value.split(',').filter(Boolean));
    campo.querySelector('.oz-tags-chips').innerHTML = (P().tags || []).map((t) =>
      '<button type="button" class="oz-chip" data-oz-chip="' + esc(t.id) + '" aria-pressed="' + sel.has(t.id) + '" style="--chip:' + esc(t.cor) + '">#' + esc(t.nome) + '</button>').join('')
      + '<button type="button" class="oz-chip oz-chip-nova" data-oz-chip-nova>+ nova</button>';
  }

  /* =============================================================
     2. PROJEÇÕES
     ============================================================= */
  /* Saldo de hoje; a demonstração não tem o histórico completo que o Calc espera. */
  function saldoHoje(agora) {
    try { return Calc.currentBalance(agora, P()); }
    catch { return (P().accounts || []).reduce((t, a) => t + (Number(a.balance != null ? a.balance : a.openingBalance) || 0), 0); }
  }
  function projecao(meses) {
    if (!global.Calc) return null;
    const agora = hoje(), ym = ymDe(agora);
    /* gasto variável: média dos 3 meses fechados, sem fixos e parcelas */
    /* e renda avulsa (salário lançado à mão todo mês, freela): média dos mesmos meses */
    let soma = 0, n = 0, somaR = 0, nR = 0;
    for (let i = 1; i <= 3; i++) {
      const m = somaMes(ym, -i);
      const avulsos = Calc.entriesForMonth(m, P()).filter((e) => !e.recurring && !e.installment && e.contaNosTotais !== false);
      const v = avulsos.filter((e) => e.kind === 'expense').reduce((s, e) => s + e.amount, 0);
      const rv = avulsos.filter((e) => e.kind === 'income').reduce((s, e) => s + e.amount, 0);
      if (v > 0) { soma += v; n++; }
      if (rv > 0) { somaR += rv; nR++; }
    }
    const variavel = n ? soma / n : 0, rendaVar = nR ? somaR / nR : 0;
    const dia = Number(agora.slice(8)), diasMes = new Date(Number(ym.slice(0, 4)), Number(ym.slice(5)), 0).getDate();
    let saldo = saldoHoje(agora);
    const linhas = [];
    for (let i = 0; i < meses; i++) {
      const m = somaMes(ym, i);
      const ents = Calc.entriesForMonth(m, P()).filter((e) => e.kind !== 'transfer' && e.contaNosTotais !== false && (i > 0 || e.date > agora || !e.confirmed));
      const entra = ents.filter((e) => e.kind === 'income').reduce((s, e) => s + e.amount, 0);
      const fixo = ents.filter((e) => e.kind === 'expense').reduce((s, e) => s + e.amount, 0);
      const resto = i === 0 ? Math.max(0, (diasMes - dia) / diasMes) : 1;
      const varMes = variavel * resto;
      /* renda avulsa só entra se o mês ainda não tem receita lançada */
      const rendaMes = entra > 0 ? 0 : rendaVar * resto;
      saldo = saldo + entra + rendaMes - fixo - varMes;
      linhas.push({ ym: m, entra: entra + rendaMes, fixo, variavel: varMes, saldo });
    }
    return { variavel, rendaVar, linhas, inicial: saldoHoje(agora) };
  }
  let mesesProj = 6;
  function telaProjecoes() {
    const p = projecao(mesesProj);
    if (!p) return '<p class="oz-vazio">Projeção indisponível.</p>';
    const max = Math.max(1, ...p.linhas.map((l) => Math.abs(l.saldo)));
    const pior = p.linhas.find((l) => l.saldo < 0);
    return '<p class="oz-tela-intro">Saldo de hoje nas contas, mais o que já está lançado para frente (fixos, parcelas, receitas), mais a renda e menos o gasto variável médios dos últimos 3 meses.</p>'
      + '<div class="v3-segment oz-seg" role="group" aria-label="Horizonte">' + [3, 6, 12].map((m) => '<button type="button" data-oz-meses="' + m + '" class="' + (m === mesesProj ? 'is-active' : '') + '" aria-pressed="' + (m === mesesProj) + '">' + m + ' meses</button>').join('') + '</div>'
      + '<div class="oz-resumo"><div><small>Saldo hoje</small><strong>' + reais(p.inicial) + '</strong></div><div><small>Gasto variável médio</small><strong>' + reais(p.variavel) + '/mês</strong></div>' + (p.rendaVar ? '<div><small>Renda avulsa média</small><strong>' + reais(p.rendaVar) + '/mês</strong></div>' : '') + '</div>'
      + (pior ? '<p class="oz-alerta">Pelo ritmo atual, o saldo fica negativo em <strong>' + nomeMes(pior.ym) + '</strong>. Veja o que dá para cortar ou adiar.</p>' : '<p class="oz-ok">No ritmo atual, o saldo segue positivo nos próximos ' + mesesProj + ' meses.</p>')
      + '<ol class="oz-proj">' + p.linhas.map((l) => '<li><span class="oz-proj-mes">' + esc(nomeMes(l.ym)) + '</span><span class="oz-proj-barra"><i class="' + (l.saldo < 0 ? 'neg' : '') + '" style="width:' + Math.max(2, Math.round(Math.abs(l.saldo) / max * 100)) + '%"></i></span><strong class="' + (l.saldo < 0 ? 'oz-neg' : '') + '">' + reais(l.saldo) + '</strong>'
        + '<small>entra ' + reais(l.entra) + ' · sai ' + reais(l.fixo + l.variavel) + '</small></li>').join('') + '</ol>'
      + '<p class="oz-nota">É estimativa, não promessa: compras novas no cartão e receitas não lançadas mudam o resultado.</p>';
  }

  /* =============================================================
     3 e 4. FINANCIAMENTOS E EMPRÉSTIMOS
     ============================================================= */
  function telaDividas(tipo) {
    const lista = (P().dividas || []).filter((d) => d.tipo === tipo);
    const nome = tipo === 'financiamento' ? 'financiamento' : 'empréstimo';
    const restante = lista.reduce((s, d) => s + d.parcela * (d.parcelas - d.pagas), 0);
    const mensal = lista.filter((d) => d.pagas < d.parcelas).reduce((s, d) => s + d.parcela, 0);
    return '<p class="oz-tela-intro">' + (tipo === 'financiamento' ? 'Carro, imóvel, moto: o que falta pagar e quando termina.' : 'Empréstimo pessoal, consignado, crédito com amigo: parcelas e saldo devedor.') + '</p>'
      + (lista.length ? '<div class="oz-resumo"><div><small>Falta pagar</small><strong>' + reais(restante) + '</strong></div><div><small>Por mês</small><strong>' + reais(mensal) + '</strong></div></div>' : '')
      + (lista.length ? '<ul class="oz-cards">' + lista.map((d) => {
        const falta = d.parcelas - d.pagas, pct = Math.round(d.pagas / d.parcelas * 100);
        const fim = somaMes(ymDe(hoje()), Math.max(0, falta - 1));
        return '<li class="oz-card"><div class="oz-card-topo"><span><strong>' + esc(d.nome) + '</strong><small>' + esc(d.instituicao || nome) + (d.juros != null ? ' · ' + String(d.juros).replace('.', ',') + '% a.m.' : '') + '</small></span><strong>' + reais(d.parcela) + '<small>/mês</small></strong></div>'
          + '<div class="oz-barra-p" role="progressbar" aria-label="Parcelas pagas" aria-valuemin="0" aria-valuemax="' + d.parcelas + '" aria-valuenow="' + d.pagas + '"><i style="width:' + pct + '%"></i></div>'
          + '<small class="oz-card-sub">' + d.pagas + ' de ' + d.parcelas + ' parcelas pagas · ' + (falta ? 'falta ' + reais(d.parcela * falta) + ' · termina em ' + nomeMes(fim) : 'quitado') + ' · vence dia ' + d.dia + '</small>'
          + '<div class="oz-card-acoes">' + (falta ? '<button type="button" class="v3-secondary" data-oz-div-paga="' + esc(d.id) + '">Paguei uma parcela</button>' : '') + '<button type="button" class="v3-link" data-oz-div-editar="' + esc(d.id) + '">Editar</button><button type="button" class="v3-link oz-perigo" data-oz-div-excluir="' + esc(d.id) + '">Excluir</button></div></li>';
      }).join('') + '</ul>' : '<p class="oz-vazio">Nenhum ' + nome + ' cadastrado.</p>')
      + formDivida(tipo, null);
  }
  function formDivida(tipo, d) {
    const v = (x) => (x == null ? '' : esc(String(x).replace('.', ',')));
    return '<details class="oz-form-box"' + (d ? ' open' : '') + '><summary>' + (d ? 'Editar ' + esc(d.nome) : 'Adicionar ' + (tipo === 'financiamento' ? 'financiamento' : 'empréstimo')) + '</summary>'
      + '<form class="v3-form" data-oz-form="divida"><input type="hidden" name="tipo" value="' + tipo + '"><input type="hidden" name="id" value="' + (d ? esc(d.id) : '') + '">'
      + '<label>NOME<input name="nome" maxlength="60" required placeholder="' + (tipo === 'financiamento' ? 'Ex.: Carro' : 'Ex.: Empréstimo pessoal') + '" value="' + (d ? esc(d.nome) : '') + '"></label>'
      + '<label>INSTITUIÇÃO (OPCIONAL)<input name="instituicao" maxlength="60" value="' + (d ? esc(d.instituicao) : '') + '"></label>'
      + '<div class="v3-form-row"><label>VALOR DA PARCELA<input name="parcela" inputmode="decimal" required placeholder="0,00" value="' + (d ? v(d.parcela.toFixed(2)) : '') + '"></label><label>DIA DO VENCIMENTO<input name="dia" type="number" min="1" max="31" value="' + (d ? d.dia : 10) + '"></label></div>'
      + '<div class="v3-form-row"><label>TOTAL DE PARCELAS<input name="parcelas" type="number" min="1" max="600" required value="' + (d ? d.parcelas : '') + '"></label><label>JÁ PAGAS<input name="pagas" type="number" min="0" max="600" value="' + (d ? d.pagas : 0) + '"></label></div>'
      + '<div class="v3-form-row"><label>VALOR CONTRATADO (OPCIONAL)<input name="valorTotal" inputmode="decimal" placeholder="0,00" value="' + (d && d.valorTotal ? v(d.valorTotal.toFixed(2)) : '') + '"></label><label>JUROS % AO MÊS (OPCIONAL)<input name="juros" inputmode="decimal" value="' + (d && d.juros != null ? v(d.juros) : '') + '"></label></div>'
      + '<button class="v3-primary" type="submit">' + (d ? 'Salvar' : 'Adicionar') + '</button></form></details>';
  }

  /* =============================================================
     5. QUEM ME DEVE
     ============================================================= */
  function telaReceber() {
    const lista = (P().aReceber || []).slice().sort((a, b) => (a.quitado - b.quitado) || (a.data < b.data ? 1 : -1));
    const aberto = lista.filter((x) => !x.quitado).reduce((s, x) => s + (x.valor - x.recebido), 0);
    const pessoas = new Set(lista.filter((x) => !x.quitado).map((x) => x.pessoa.toLowerCase())).size;
    return '<p class="oz-tela-intro">Dinheiro emprestado, conta dividida, rachadinha do aluguel. Anote e marque quando receber.</p>'
      + '<div class="oz-resumo"><div><small>A receber</small><strong>' + reais(aberto) + '</strong></div><div><small>Pessoas</small><strong>' + pessoas + '</strong></div></div>'
      + '<details class="oz-form-box"><summary>Anotar valor a receber</summary><form class="v3-form" data-oz-form="receber">'
      + '<label>QUEM<input name="pessoa" maxlength="60" required placeholder="Nome"></label>'
      + '<label>DO QUÊ (OPCIONAL)<input name="descricao" maxlength="120" placeholder="Ex.: metade do jantar"></label>'
      + '<div class="v3-form-row"><label>VALOR<input name="valor" inputmode="decimal" required placeholder="0,00"></label><label>COMBINADO PARA (OPCIONAL)<input name="vence" type="date"></label></div>'
      + '<button class="v3-primary" type="submit">Anotar</button></form></details>'
      + (lista.length ? '<ul class="oz-lista">' + lista.map((x) => {
        const falta = x.valor - x.recebido, atrasado = !x.quitado && x.vence && x.vence < hoje();
        return '<li class="' + (x.quitado ? 'is-quitado' : '') + '"><span class="oz-avatar" aria-hidden="true">' + esc(x.pessoa.slice(0, 1).toUpperCase()) + '</span><span class="oz-lista-txt"><strong>' + esc(x.pessoa) + '</strong><small>' + esc(x.descricao || 'sem descrição') + ' · ' + (x.quitado ? 'recebido' : (x.recebido ? 'recebeu ' + reais(x.recebido) + ' · falta ' + reais(falta) : 'em aberto') + (x.vence ? (atrasado ? ' · <b class="oz-neg">atrasado desde ' + x.vence.split('-').reverse().join('/') + '</b>' : ' · até ' + x.vence.split('-').reverse().join('/')) : '')) + '</small></span>'
          + '<strong class="oz-valor">' + reais(x.quitado ? x.valor : falta) + '</strong>'
          + (x.quitado ? '<button type="button" class="v3-link oz-perigo" data-oz-rec-excluir="' + esc(x.id) + '">Apagar</button>' : '<button type="button" class="v3-link" data-oz-rec-parcial="' + esc(x.id) + '">Parte</button><button type="button" class="v3-secondary" data-oz-rec-tudo="' + esc(x.id) + '">Recebi</button>') + '</li>';
      }).join('') + '</ul>' : '<p class="oz-vazio">Ninguém te deve nada por aqui.</p>');
  }

  /* =============================================================
     6. RELATÓRIO PERSONALIZADO
     ============================================================= */
  const filtro = { de: '', ate: '', tipo: 'expense', agrupar: 'categoria', contas: '', tag: '' };
  function relatorio() {
    if (!filtro.de) { const h = hoje(); filtro.de = h.slice(0, 8) + '01'; filtro.ate = h; }
    const prof = P();
    const ents = (global.Calc ? Calc.entries(filtro.de, filtro.ate, P()) : []).filter((e) => e.kind !== 'transfer' && e.contaNosTotais !== false
      && (filtro.tipo === 'ambos' || e.kind === filtro.tipo)
      && (!filtro.contas || e.accountId === filtro.contas || e.cardId === filtro.contas)
      && (!filtro.tag || (e.tx && (e.tx.tags || []).includes(filtro.tag))));
    const nomeCat = (id) => (prof.categories.find((c) => c.id === id) || {}).name || 'Sem categoria';
    const nomeConta = (e) => (e.cardId ? (prof.cards.find((c) => c.id === e.cardId) || {}).name : (prof.accounts.find((a) => a.id === e.accountId) || {}).name) || 'Sem conta';
    const chave = (e) => filtro.agrupar === 'categoria' ? nomeCat(e.categoryId) : filtro.agrupar === 'conta' ? nomeConta(e)
      : filtro.agrupar === 'mes' ? nomeMes(e.ym) : filtro.agrupar === 'tag' ? ((e.tx && e.tx.tags && e.tx.tags.length) ? e.tx.tags.map((id) => '#' + ((prof.tags || []).find((t) => t.id === id) || {}).nome).join(' ') : 'Sem tag') : 'Total';
    const grupos = {};
    ents.forEach((e) => { const k = chave(e); const g = grupos[k] || (grupos[k] = { nome: k, entra: 0, sai: 0, qtd: 0 }); g.qtd++; if (e.kind === 'income') g.entra += e.amount; else g.sai += e.amount; });
    const linhas = Object.values(grupos).sort((a, b) => filtro.agrupar === 'mes' ? 0 : (b.sai + b.entra) - (a.sai + a.entra));
    return { ents, linhas, nomeCat, nomeConta };
  }
  function telaRelatorio() {
    const prof = P(), r = relatorio();
    const total = r.linhas.reduce((s, l) => s + l.entra + l.sai, 0) || 1;
    const opc = (v, t, atual) => '<option value="' + esc(v) + '"' + (v === atual ? ' selected' : '') + '>' + esc(t) + '</option>';
    const totEntra = r.linhas.reduce((s, l) => s + l.entra, 0), totSai = r.linhas.reduce((s, l) => s + l.sai, 0);
    return '<form class="v3-form oz-rel-filtros" data-oz-form="relatorio">'
      + '<div class="v3-form-row"><label>DE<input type="date" name="de" value="' + esc(filtro.de) + '"></label><label>ATÉ<input type="date" name="ate" value="' + esc(filtro.ate) + '"></label></div>'
      + '<div class="v3-form-row"><label>MOSTRAR<select name="tipo">' + opc('expense', 'Despesas', filtro.tipo) + opc('income', 'Receitas', filtro.tipo) + opc('ambos', 'Receitas e despesas', filtro.tipo) + '</select></label>'
      + '<label>AGRUPAR POR<select name="agrupar">' + opc('categoria', 'Categoria', filtro.agrupar) + opc('conta', 'Conta ou cartão', filtro.agrupar) + opc('mes', 'Mês', filtro.agrupar) + opc('tag', 'Tag', filtro.agrupar) + '</select></label></div>'
      + '<div class="v3-form-row"><label>CONTA OU CARTÃO<select name="contas">' + opc('', 'Todos', filtro.contas) + prof.accounts.filter((a) => !a.archived).map((a) => opc(a.id, a.name, filtro.contas)).join('') + prof.cards.map((c) => opc(c.id, c.name + ' (crédito)', filtro.contas)).join('') + '</select></label>'
      + '<label>TAG<select name="tag">' + opc('', 'Todas', filtro.tag) + (prof.tags || []).map((t) => opc(t.id, '#' + t.nome, filtro.tag)).join('') + '</select></label></div></form>'
      + '<div class="oz-resumo">' + (filtro.tipo !== 'expense' ? '<div><small>Entradas</small><strong>' + reais(totEntra) + '</strong></div>' : '') + (filtro.tipo !== 'income' ? '<div><small>Saídas</small><strong>' + reais(totSai) + '</strong></div>' : '') + '<div><small>Lançamentos</small><strong>' + r.ents.length + '</strong></div></div>'
      + (r.linhas.length ? '<ul class="oz-rel">' + r.linhas.map((l) => { const v = l.entra + l.sai; return '<li><span class="oz-lista-txt"><strong>' + esc(l.nome) + '</strong><small>' + l.qtd + ' lançamento' + (l.qtd === 1 ? '' : 's') + ' · ' + Math.round(v / total * 100) + '%</small></span><strong>' + (filtro.tipo === 'ambos' ? '<span class="oz-pos">+' + reais(l.entra) + '</span> <span class="oz-neg">−' + reais(l.sai) + '</span>' : reais(v)) + '</strong><span class="oz-rel-barra"><i style="width:' + Math.max(2, Math.round(v / total * 100)) + '%"></i></span></li>'; }).join('') + '</ul>'
        + '<div class="oz-rel-acoes"><button type="button" class="v3-secondary" data-oz-rel-csv>Baixar CSV</button><button type="button" class="v3-secondary" data-oz-rel-imprimir>Imprimir ou salvar PDF</button></div>'
        : '<p class="oz-vazio">Nada encontrado com esses filtros.</p>');
  }
  function csvRelatorio() {
    if (global.Limites && Limites.exigirRecurso && !Limites.exigirRecurso('csvExport', 'A exportação em CSV')) return;
    const r = relatorio();
    const q = (s) => '"' + String(s == null ? '' : s).replace(/"/g, '""') + '"';
    const linhas = [['Data', 'Descrição', 'Tipo', 'Valor', 'Categoria', 'Conta', 'Tags'].map(q).join(';')].concat(r.ents.map((e) => [
      e.date.split('-').reverse().join('/'), e.description, e.kind === 'income' ? 'Receita' : 'Despesa', e.amount.toFixed(2).replace('.', ','),
      r.nomeCat(e.categoryId), r.nomeConta(e), ((e.tx && e.tx.tags) || []).map((id) => ((P().tags || []).find((t) => t.id === id) || {}).nome).filter(Boolean).join(' ')].map(q).join(';')));
    const nome = 'oaze-relatorio-' + filtro.de + '-a-' + filtro.ate + '.csv';
    U.download(nome, '﻿' + linhas.join('\r\n'), 'text/csv');
    avisar('CSV exportado.');
  }

  /* =============================================================
     NAVEGAÇÃO E EVENTOS
     ============================================================= */
  const TELAS = {
    tags: ['Tags', telaTags], projecoes: ['Projeções', telaProjecoes],
    financiamentos: ['Financiamentos', () => telaDividas('financiamento')], emprestimos: ['Empréstimos', () => telaDividas('emprestimo')],
    receber: ['Quem me deve', telaReceber], relatorio: ['Relatório personalizado', telaRelatorio]
  };
  function abrir(qual) { const t = TELAS[qual]; if (t) abrirTela(t[0], t[1]); }

  document.addEventListener('click', async (ev) => {
    const alvo = ev.target.closest('[data-oz-mais]');
    if (alvo) { ev.preventDefault(); abrir(alvo.dataset.ozMais); return; }
    const chip = ev.target.closest('[data-oz-chip]');
    if (chip) {
      const form = chip.closest('form'), input = form.querySelector('[name="tags"]');
      const sel = new Set(input.value.split(',').filter(Boolean));
      sel.has(chip.dataset.ozChip) ? sel.delete(chip.dataset.ozChip) : sel.add(chip.dataset.ozChip);
      input.value = [...sel].join(','); chip.setAttribute('aria-pressed', sel.has(chip.dataset.ozChip)); return;
    }
    if (ev.target.closest('[data-oz-chip-nova]')) {
      const form = ev.target.closest('form');
      const nome = global.prompt('Nome da nova tag');
      const t = await criarTag(nome);
      if (t) { const input = form.querySelector('[name="tags"]'); input.value = [...new Set(input.value.split(',').filter(Boolean).concat(t.id))].join(','); pintarChips(form); }
      return;
    }
    if (!tela || !tela.el.contains(ev.target)) return;
    const b = ev.target.closest('button'); if (!b) return;
    const d = b.dataset;
    if (d.ozMeses) { mesesProj = Number(d.ozMeses); redesenhar(); }
    else if (d.ozTagRenomear) { const t = P().tags.find((x) => x.id === d.ozTagRenomear); const nome = t && global.prompt('Novo nome da tag', t.nome); if (nome && nome.trim()) { await mudar(() => { const x = P().tags.find((y) => y.id === t.id); if (x) x.nome = nome.trim().replace(/^#/, '').slice(0, 30); }); redesenhar(); } }
    else if (d.ozTagExcluir) { if (global.confirm('Excluir esta tag? Os lançamentos continuam, só perdem a marcação.')) { await mudar(() => { const p = P(); p.tags = p.tags.filter((x) => x.id !== d.ozTagExcluir); p.transactions.forEach((t) => { if (t.tags && t.tags.includes(d.ozTagExcluir)) t.tags = t.tags.filter((x) => x !== d.ozTagExcluir); }); }, 'Tag excluída.'); redesenhar(); } }
    else if (d.ozDivPaga) { await mudar(() => { const x = P().dividas.find((y) => y.id === d.ozDivPaga); if (x && x.pagas < x.parcelas) x.pagas++; }, 'Parcela marcada como paga.'); redesenhar(); }
    else if (d.ozDivExcluir) { if (global.confirm('Excluir este registro?')) { await mudar(() => { const p = P(); p.dividas = p.dividas.filter((y) => y.id !== d.ozDivExcluir); }); redesenhar(); } }
    else if (d.ozDivEditar) { const x = P().dividas.find((y) => y.id === d.ozDivEditar); if (x) { const c = tela.el.querySelector('.oz-tela-corpo'); c.querySelector('.oz-form-box:last-of-type')?.remove(); c.insertAdjacentHTML('beforeend', formDivida(x.tipo, x)); c.querySelector('.oz-form-box:last-of-type input[name="nome"]').focus(); } }
    else if (d.ozRecTudo) { await mudar(() => { const x = P().aReceber.find((y) => y.id === d.ozRecTudo); if (x) { x.recebido = x.valor; x.quitado = true; } }, 'Marcado como recebido.'); redesenhar(); }
    else if (d.ozRecParcial) { const x = P().aReceber.find((y) => y.id === d.ozRecParcial); const v = x && num(global.prompt('Quanto você recebeu agora?', '')); if (v > 0) { await mudar(() => { const y = P().aReceber.find((z) => z.id === x.id); y.recebido = Math.min(y.valor, Math.round((y.recebido + v) * 100) / 100); y.quitado = y.recebido >= y.valor; }); redesenhar(); } }
    else if (d.ozRecExcluir) { await mudar(() => { const p = P(); p.aReceber = p.aReceber.filter((y) => y.id !== d.ozRecExcluir); }); redesenhar(); }
    else if (b.hasAttribute('data-oz-rel-csv')) csvRelatorio();
    else if (b.hasAttribute('data-oz-rel-imprimir')) { document.documentElement.classList.add('oz-imprimindo'); global.print(); setTimeout(() => document.documentElement.classList.remove('oz-imprimindo'), 500); }
  });

  document.addEventListener('submit', async (ev) => {
    const f = ev.target.closest('[data-oz-form]'); if (!f) return;
    ev.preventDefault();
    const fd = new FormData(f), qual = f.dataset.ozForm;
    if (qual === 'tag-nova') { if (await criarTag(fd.get('nome'))) redesenhar(); }
    else if (qual === 'divida') {
      const dados = { tipo: fd.get('tipo'), nome: String(fd.get('nome') || '').trim(), instituicao: String(fd.get('instituicao') || '').trim(),
        parcela: num(fd.get('parcela')), parcelas: parseInt(fd.get('parcelas'), 10) || 1, pagas: parseInt(fd.get('pagas'), 10) || 0,
        dia: parseInt(fd.get('dia'), 10) || 10, valorTotal: num(fd.get('valorTotal')), juros: String(fd.get('juros') || '').trim() ? num(fd.get('juros')) : null };
      if (!dados.nome || !(dados.parcela > 0)) { avisar('Preencha o nome e o valor da parcela.'); return; }
      dados.pagas = Math.min(dados.pagas, dados.parcelas);
      const id = fd.get('id');
      await mudar(() => { const p = P(); p.dividas = p.dividas || []; const x = id && p.dividas.find((y) => y.id === id); if (x) Object.assign(x, dados); else p.dividas.push(Object.assign({ id: uid('div'), criadoEm: hoje() }, dados)); }, id ? 'Salvo.' : 'Adicionado.');
      redesenhar();
    } else if (qual === 'receber') {
      const item = { id: uid('rec'), pessoa: String(fd.get('pessoa') || '').trim(), descricao: String(fd.get('descricao') || '').trim(), valor: num(fd.get('valor')), recebido: 0, data: hoje(), vence: fd.get('vence') || null, quitado: false };
      if (!item.pessoa || !(item.valor > 0)) { avisar('Preencha quem e quanto.'); return; }
      await mudar(() => { const p = P(); p.aReceber = (p.aReceber || []).concat(item); }, 'Anotado.');
      redesenhar();
    }
  });
  document.addEventListener('change', (ev) => {
    const f = ev.target.closest('[data-oz-form="relatorio"]'); if (!f) return;
    const fd = new FormData(f);
    Object.keys(filtro).forEach((k) => { filtro[k] = String(fd.get(k) || ''); });
    if (filtro.de > filtro.ate) { const t = filtro.de; filtro.de = filtro.ate; filtro.ate = t; }
    redesenhar();
  });
  /* tags no formulário de lançamento */
  new MutationObserver(() => { const f = document.getElementById('v3-form-tx'); if (f && global.Store) campoTags(f); })
    .observe(document.body, { childList: true, subtree: true });

  /* As telas de funcoes-oaze.js (caixinhas, busca, IR...) usam a mesma casca. */
  function registrar(qual, titulo, desenhar) { TELAS[qual] = [titulo, desenhar]; }
  global.OazeMais = { abrir, projecao, registrar, redesenhar, fecharTela, mudar, P, demo, avisar, esc, reais, num, hoje, nomeMes, somaMes, uid, ymDe, saldoHoje, aberta: () => (tela ? tela.el : null) };
})(window);
