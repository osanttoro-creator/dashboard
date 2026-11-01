/* =============================================================
   recursos-app.js — funções do app que não cabem no painel base
   (31/10/2026)

   · Coco em porcentagem: barras do dia e da semana.
   · Anúncio premiado no Semente (Android): +10 lançamentos no mês.
   · Avisos: vencimento na véspera e no dia, orçamento, metas, score,
     dólar e dicas — com preferências por tipo.
   · Central de permissões: notificações, localização, microfone,
     câmera, biometria e anúncios.
   · Local da compra (opcional) e aviso de viagem no lançamento.

   Este arquivo só desenha e agenda. Quem decide limite e cota é o
   servidor (meus_direitos, reservar_coco, oaze-anuncio).
   ============================================================= */
(function (global) {
  'use strict';

  /* ---------------- utilidades ---------------- */
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const brl = (n) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(n) || 0);
  const contexto = () => { try { return global.OAZE_REPORT_CONTEXT ? global.OAZE_REPORT_CONTEXT() : null; } catch { return null; } };
  const armazenado = {
    ler(chave, padrao) { try { const v = localStorage.getItem(chave); return v == null ? padrao : JSON.parse(v); } catch { return padrao; } },
    gravar(chave, valor) { try { localStorage.setItem(chave, JSON.stringify(valor)); } catch { /* armazenamento indisponível */ } }
  };
  const iso = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const hojeISO = () => iso(new Date());
  const ymDe = (s) => String(s).slice(0, 7);
  const somarMeses = (ym, n) => { const [y, m] = ym.split('-').map(Number); const d = new Date(y, m - 1 + n, 1); return iso(d).slice(0, 7); };
  const dias = (a, b) => Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 86400000);
  const usuarioId = () => { try { return global.V3Backend && V3Backend.user && V3Backend.user() ? V3Backend.user().id : null; } catch { return null; } };
  const plano = () => (global.Limites && Limites.plano ? Limites.plano() : 'free');

  function avisar(texto) {
    const el = document.getElementById('v3-toast');
    if (!el) return;
    el.textContent = texto; el.hidden = false;
    clearTimeout(avisar.t); avisar.t = setTimeout(() => { el.hidden = true; }, 4200);
  }

  /* Diálogo próprio, com o mesmo visual do relatório Estado do OAZE. */
  function dialogo(titulo, corpo, rotulo) {
    const volta = document.activeElement;
    const d = document.createElement('dialog');
    d.className = 'v3-estado-dialog oz-dialogo';
    d.setAttribute('aria-label', rotulo || titulo);
    d.innerHTML = '<form method="dialog"><header><img src="/assets/brand/oaze-logo-mono-milk.svg" alt="OAZE"><button type="submit" aria-label="Fechar">×</button></header>'
      + '<h2>' + esc(titulo) + '</h2>' + corpo + '</form>';
    document.body.appendChild(d);
    d.addEventListener('close', () => { d.remove(); if (volta && volta.isConnected) volta.focus(); });
    d.showModal();
    return d;
  }

  /* =============================================================
     COCO EM PORCENTAGEM
     ============================================================= */
  let ultimaConsulta = 0;
  function quando(isoData, semana) {
    if (!isoData) return semana ? 'renova na segunda' : 'renova à meia-noite';
    const d = new Date(isoData);
    if (!Number.isFinite(d.getTime())) return '';
    return semana
      ? 'renova ' + new Intl.DateTimeFormat('pt-BR', { weekday: 'long' }).format(d)
      : 'renova às ' + new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(d);
  }
  function barra(rotulo, pct, sub) {
    const nivel = pct >= 100 ? 'cheio' : pct >= 80 ? 'alto' : 'ok';
    return '<div class="oz-uso-linha"><span>' + esc(rotulo) + '</span><strong>' + pct + '%</strong></div>'
      + '<div class="oz-barra oz-' + nivel + '" role="progressbar" aria-label="' + esc(rotulo) + ' usado" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + pct + '"><i style="width:' + Math.min(100, pct) + '%"></i></div>'
      + '<small class="v3-muted">' + esc(sub) + '</small>';
  }
  function painelCoco() {
    if (!global.Limites || !Limites.consumoCoco) return '';
    const c = Limites.consumoCoco();
    if (!c.carregado || c.ilimitado) return '';
    const alto = Math.max(c.pct_dia, c.pct_semana) >= 80;
    return '<section class="v3-panel oz-coco-uso" data-oz-coco-uso aria-label="Uso da Coco">'
      + '<h2>uso da coco</h2>'
      + barra('Hoje', c.pct_dia, quando(c.renova_dia, false))
      + barra('Esta semana', c.pct_semana, quando(c.renova_semana, true))
      + (alto && plano() === 'free' ? '<p class="v3-muted">No Oásis, a Coco tem 10 vezes mais uso por dia e por semana. <button type="button" class="v3-link" data-go="plan">Ver planos</button></p>' : '')
      + '</section>';
  }
  async function atualizarCoco(forcar) {
    if (!global.Limites || !Limites.carregarConsumo) return;
    if (!forcar && Date.now() - ultimaConsulta < 15000) return;
    ultimaConsulta = Date.now();
    await Limites.carregarConsumo().catch(() => {});
    const atual = document.querySelector('[data-oz-coco-uso]');
    const novo = painelCoco();
    if (atual && novo) atual.outerHTML = novo;
    else if (!atual && novo) inserirCoco(estadoPagina);
  }
  function inserirCoco(pagina) {
    const html = painelCoco();
    if (!html || document.querySelector('[data-oz-coco-uso]')) return;
    const view = document.getElementById('v3-view');
    if (!view) return;
    if (pagina === 'coco') view.insertAdjacentHTML('afterbegin', html);
    if (pagina === 'settings') {
      const alvo = view.querySelector('.v3-settings-extra');
      if (alvo) alvo.insertAdjacentHTML('beforebegin', html); else view.insertAdjacentHTML('beforeend', html);
    }
  }

  /* =============================================================
     ANÚNCIO PREMIADO (Semente, app Android)
     ============================================================= */
  const OazeAnuncios = {
    estado() {
      const a = global.Limites && Limites.anuncios ? Limites.anuncios() : { hoje: 0, max_dia: 0, por_anuncio: 0, liberados_mes: 0 };
      return Object.assign({}, a, { restante: Math.max(0, (a.max_dia || 0) - (a.hoje || 0)) });
    },
    /* Android: AdMob. Windows, site e iOS sem SDK: vídeo do Ad Manager (anuncio-web.js). */
    nativo() { return !!global.OAZE_NATIVE_ADS || !!global.OazeAnuncioWeb; },
    disponivel() {
      const c = contexto();
      return this.nativo() && !(c && c.demo) && plano() === 'free' && !!usuarioId() && this.estado().restante > 0 && this.estado().por_anuncio > 0;
    },
    botao() {
      const e = this.estado();
      return '<button type="button" class="v3-primary oz-anuncio-botao" data-action="assistir-anuncio">Assistir anúncio e liberar +' + e.por_anuncio + ' lançamentos</button>'
        + '<p class="v3-muted oz-anuncio-nota">Sem limite de lançamentos: a cada ' + e.por_anuncio + ', um anúncio. Vale em todos os seus aparelhos até o fim do mês.</p>';
    },
    /* No Windows e no site não há anúncio: a dica aponta o celular. */
    dica() {
      const e = this.estado();
      if (this.nativo() || plano() !== 'free' || !(e.por_anuncio > 0)) return '';
      return '<p class="v3-muted" style="margin-top:12px">No app OAZE para Android, cada anúncio assistido libera +' + e.por_anuncio + ' lançamentos no mês. A liberação vale em todos os seus aparelhos.</p>';
    },
    painel() {
      const c = contexto();
      if (!c || c.demo || plano() !== 'free' || !usuarioId() || !global.Limites) return '';
      const e = this.estado();
      const limite = Limites.limite('transactions_per_month');
      const mes = new Intl.DateTimeFormat('pt-BR', { month: 'long' }).format(new Date());
      const usado = Limites.contar ? Limites.contar('transactions_per_month', hojeISO().slice(0, 7)) : 0;
      const corpo = this.nativo()
        ? (e.restante > 0 ? this.botao() : '<p class="v3-muted">Você já assistiu os ' + e.max_dia + ' anúncios de hoje. Amanhã libera de novo.</p>')
        : '<p class="v3-muted">No app OAZE para Android, cada anúncio assistido libera +' + (e.por_anuncio || 10) + ' lançamentos no mês, até ' + (e.max_dia || 5) + ' por dia. A liberação fica na sua conta e vale também aqui.</p>';
      return '<section class="v3-panel oz-anuncio-painel" data-oz-anuncio aria-label="Lançamentos do mês">'
        + '<h2>lançamentos de ' + esc(mes) + '</h2>'
        + '<p><strong>' + usado + '</strong> lançamentos · <strong>' + Math.max(0, (limite || 0) - usado) + '</strong> livres antes do próximo anúncio</p>'
        + corpo + '</section>';
    },
    async assistir(botao) {
      const id = usuarioId();
      if (!this.nativo() || !id) return;
      const antes = this.estado().liberados_mes || 0;
      if (botao) { botao.disabled = true; botao.setAttribute('aria-busy', 'true'); }
      try {
        if (!global.OAZE_NATIVE_ADS && global.OazeAnuncioWeb) {
          const w = await global.OazeAnuncioWeb.mostrar();
          if (!w || !w.recompensado) { avisar('O anúncio foi fechado antes do fim. Nada foi liberado.'); return; }
          await global.OazeAnuncioWeb.creditar(w.ima);
          await Limites.carregar();
          avisar('+' + this.estado().por_anuncio + ' lançamentos liberados.');
          if (typeof Limites.aoMudar === 'function') Limites.aoMudar();
          const fecharW = document.querySelector('#v3-overlay:not([hidden]) [data-action="close"]');
          if (fecharW) fecharW.click();
          atualizarAnuncio();
          return;
        }
        const r = await global.OAZE_NATIVE_ADS.mostrar({ userId: id });
        if (!r || !r.recompensado) { avisar('O anúncio foi fechado antes do fim. Nada foi liberado.'); return; }
        avisar('Conferindo a liberação com o Google…');
        for (let i = 0; i < 8; i++) {
          await new Promise((ok) => setTimeout(ok, 2500));
          await Limites.carregar();
          if ((this.estado().liberados_mes || 0) > antes) {
            avisar('+' + this.estado().por_anuncio + ' lançamentos liberados neste mês.');
            if (typeof Limites.aoMudar === 'function') Limites.aoMudar();
            const fechar = document.querySelector('#v3-overlay:not([hidden]) [data-action="close"]');
            if (fechar) fechar.click();
            atualizarAnuncio();
            return;
          }
        }
        avisar('O anúncio terminou, mas a confirmação do Google ainda não chegou. Pode levar alguns minutos.');
      } catch (e) {
        avisar(e && e.message ? e.message : 'Anúncio indisponível agora. Tente mais tarde.');
      } finally {
        if (botao && botao.isConnected) { botao.disabled = false; botao.removeAttribute('aria-busy'); }
      }
    }
  };
  function atualizarAnuncio() {
    const atual = document.querySelector('[data-oz-anuncio]');
    if (atual) atual.outerHTML = OazeAnuncios.painel();
  }

  /* =============================================================
     AVISOS
     ============================================================= */
  const PREF_PADRAO = { vencimentos: true, orcamento: true, metas: true, score: true, dolar: false, dicas: true, detalhes: false, hora: 9 };
  const prefs = () => Object.assign({}, PREF_PADRAO, armazenado.ler('oaze.avisos.prefs', {}));
  const enviados = () => armazenado.ler('oaze.avisos.enviados', {});
  let indicesCache = null;

  async function indices() {
    if (indicesCache && Date.now() - indicesCache.quando < 3 * 3600_000) return indicesCache.dados;
    if (!usuarioId()) return null;
    try {
      const cfg = global.SupabaseConfig || {};
      const base = String(cfg.url || '').replace(/\/+$/, '');
      const chave = String(cfg.publishableKey || cfg.anonKey || '');
      const token = global.AI && AI.tokenDaSessao
        ? await Promise.race([AI.tokenDaSessao(), new Promise((ok) => setTimeout(() => ok(null), 6000))]) : null;
      if (!base || !chave || !token) return null;
      const r = await fetch(base + '/functions/v1/oaze-invest-data', {
        signal: AbortSignal.timeout ? AbortSignal.timeout(6000) : undefined,
        method: 'POST', headers: { 'content-type': 'application/json', apikey: chave, authorization: 'Bearer ' + token },
        body: JSON.stringify({ action: 'indices' })
      });
      if (!r.ok) return null;
      const dados = await r.json();
      indicesCache = { quando: Date.now(), dados };
      return dados;
    } catch { return null; }
  }

  /* O que merece aviso agora. Cada item tem chave única para não repetir. */
  async function insights(perfil, p) {
    const lista = [];
    const hoje = hojeISO();
    const ym = hoje.slice(0, 7);
    if (p.orcamento && perfil.budgets && global.Calc) {
      const totais = Calc.categoryTotals('expense', ym + '-01', hoje, perfil);
      Object.entries(perfil.budgets).forEach(([cat, limite]) => {
        const linha = totais.find((t) => t.id === cat);
        if (!linha || !(limite > 0)) return;
        const pct = Math.round(linha.total / limite * 100);
        const faixa = pct >= 100 ? 100 : pct >= 80 ? 80 : 0;
        if (!faixa) return;
        lista.push({ chave: 'orc' + faixa + ':' + ym + ':' + cat, canal: 'insights',
          titulo: p.detalhes ? 'Orçamento de ' + linha.name + ' em ' + pct + '%' : 'Um orçamento passou de ' + faixa + '%',
          corpo: p.detalhes ? brl(linha.total) + ' de ' + brl(limite) + ' neste mês.' : 'Abra o OAZE para ver qual categoria.',
          texto: 'Orçamento de ' + linha.name + ': ' + pct + '% usado (' + brl(linha.total) + ' de ' + brl(limite) + ').' });
      });
    }
    /* Detecção no aparelho (sem banco conectado): gasto fora do padrão e
       possível cobrança duplicada. Usa só lançamentos já registrados. */
    if (p.orcamento && global.Calc && Calc.categoryTotals) {
      try {
        const dia = Number(hoje.slice(8, 10));
        const fimMes = new Date(+ym.slice(0, 4), +ym.slice(5, 7), 0).getDate();
        const atual = Calc.categoryTotals('expense', ym + '-01', hoje, perfil);
        const media = new Map();
        [1, 2, 3].forEach((n) => {
          const m = somarMeses(ym, -n);
          const fim = new Date(+m.slice(0, 4), +m.slice(5, 7), 0).getDate();
          Calc.categoryTotals('expense', m + '-01', m + '-' + String(fim).padStart(2, '0'), perfil)
            .forEach((r) => media.set(r.id, (media.get(r.id) || 0) + r.total / 3));
        });
        atual.forEach((r) => {
          const base = media.get(r.id) || 0;
          const esperadoAteHoje = base * dia / fimMes;
          if (base < 100 || dia < 7 || r.total < esperadoAteHoje * 1.5 || r.total - esperadoAteHoje < 80) return;
          lista.push({ chave: 'padrao:' + ym + ':' + r.id, canal: 'insights',
            titulo: p.detalhes ? r.name + ' acima do seu padrão' : 'Uma categoria está acima do seu padrão',
            corpo: p.detalhes ? brl(r.total) + ' até hoje; a média dos últimos meses é ' + brl(base) + ' no mês inteiro.' : 'Abra o OAZE para ver qual.',
            texto: r.name + ': ' + brl(r.total) + ' até hoje, contra média de ' + brl(base) + ' por mês nos últimos 3 meses.' });
        });
      } catch { /* sem histórico suficiente */ }
      try {
        const inicio = iso(new Date(Date.now() - 30 * 86400000));
        const gastos = Calc.entries(inicio, hoje, perfil).filter((e) => e.kind === 'expense' && e.amount > 0 && !e.installment);
        const vistos = new Set();
        gastos.forEach((a, i) => gastos.slice(i + 1).forEach((b) => {
          const mesma = String(a.description || '').trim().toLowerCase() === String(b.description || '').trim().toLowerCase();
          if (!mesma || Math.abs(a.amount - b.amount) > 0.009 || Math.abs(dias(a.date, b.date)) > 3) return;
          const chave = 'duplicada:' + [a.txId || a.id, b.txId || b.id].sort().join(':');
          if (vistos.has(chave) || (a.txId && a.txId === b.txId)) return;
          vistos.add(chave);
          lista.push({ chave, canal: 'insights',
            titulo: 'Possível cobrança duplicada',
            corpo: p.detalhes ? a.description + ': ' + brl(a.amount) + ' duas vezes em poucos dias.' : 'Dois lançamentos iguais em poucos dias. Confira no OAZE.',
            texto: a.description + ': ' + brl(a.amount) + ' em ' + a.date.split('-').reverse().slice(0, 2).join('/') + ' e ' + b.date.split('-').reverse().slice(0, 2).join('/') + '. Se for repetição, exclua um deles.' });
        }));
      } catch { /* sem lançamentos */ }
    }
    if (p.score && global.Calc && Calc.score) {
      try {
        const s = Calc.score(ym, perfil);
        const total = s && Number.isFinite(+s.total) ? Math.round(+s.total) : null;
        const anterior = armazenado.ler('oaze.avisos.score', null);
        if (total != null) {
          if (anterior != null && total - anterior >= 3) {
            lista.push({ chave: 'score:' + total + ':' + ym, canal: 'insights',
              titulo: 'Seu score OAZE subiu para ' + total, corpo: 'Eram ' + anterior + ' pontos. Veja o que melhorou no início.',
              texto: 'Score OAZE subiu de ' + anterior + ' para ' + total + '.' });
          }
          armazenado.gravar('oaze.avisos.score', total);
        }
      } catch { /* score indisponível neste perfil */ }
    }
    const precisaMercado = p.dolar || p.dicas;
    const mercado = precisaMercado ? await indices() : null;
    if (p.dolar && mercado && mercado.usdBrl && Number.isFinite(+mercado.usdBrl.value)) {
      const v = +mercado.usdBrl.value;
      const ant = mercado.usdBrlAnterior && +mercado.usdBrlAnterior.value;
      const varPct = ant ? (v - ant) / ant * 100 : null;
      const data = String(mercado.usdBrl.date || '').split('-').reverse().slice(0, 2).join('/');
      lista.push({ chave: 'dolar:' + mercado.usdBrl.date, canal: 'insights',
        titulo: 'Dólar: R$ ' + v.toFixed(4).replace('.', ',') + (varPct != null ? ' (' + (varPct >= 0 ? '+' : '') + varPct.toFixed(2).replace('.', ',') + '%)' : ''),
        corpo: 'Dólar comercial (venda) de ' + data + ', Banco Central.',
        texto: 'Dólar comercial de ' + data + ': R$ ' + v.toFixed(4).replace('.', ',') + (varPct != null ? ', ' + (varPct >= 0 ? 'alta' : 'queda') + ' de ' + Math.abs(varPct).toFixed(2).replace('.', ',') + '% no dia' : '') + '.' });
    }
    /* Dica educativa, nunca recomendação de produto: o OAZE não é
       consultor de valores mobiliários (CVM). */
    if (p.dicas && mercado && mercado.cdiAnnual && global.Calc && Calc.totalAccountsBalance) {
      try {
        const saldo = +Calc.totalAccountsBalance(hoje, perfil) || 0;
        const media = (() => {
          const meses = [1, 2, 3].map((n) => somarMeses(ym, -n));
          const tot = meses.map((m) => Calc.monthTotals ? (Calc.monthTotals(m, perfil).expense || 0) : 0);
          return tot.reduce((a, b) => a + b, 0) / 3;
        })();
        const semana = Math.floor(Date.now() / (7 * 86400000));
        if (media > 0 && saldo > media * 3) {
          const cdi = (+mercado.cdiAnnual.value).toFixed(2).replace('.', ',');
          lista.push({ chave: 'dica-reserva:' + semana, canal: 'insights',
            titulo: 'Dinheiro parado também pode render',
            corpo: 'Seu saldo em conta passa de 3 meses de gastos. O CDI está em ' + cdi + '% ao ano. Entenda as opções em Investimentos.',
            texto: 'Saldo em conta acima de 3 meses de gastos; CDI em ' + cdi + '% a.a. Conteúdo educativo, não é recomendação de investimento.' });
        }
      } catch { /* sem dados suficientes */ }
    }
    return lista;
  }

  function proximoHorario(p) {
    const d = new Date(); d.setHours(p.hora, 0, 0, 0);
    if (d.getTime() <= Date.now() + 60_000) return new Date(Date.now() + 60_000);
    return d;
  }

  function vencimentos(perfil, p) {
    const lista = [];
    if (!global.Calc || !Calc.calendarEvents) return lista;
    const hoje = hojeISO();
    const ym = hoje.slice(0, 7);
    [ym, somarMeses(ym, 1)].forEach((mes) => {
      const porDia = Calc.calendarEvents(mes, perfil) || {};
      Object.keys(porDia).forEach((dia) => {
        const data = mes + '-' + String(dia).padStart(2, '0');
        const falta = dias(hoje, data);
        if (falta < 0 || falta > 31) return;
        porDia[dia].filter((ev) => !ev.confirmado && (ev.tipo === 'due' || ev.tipo === 'out')).forEach((ev, i) => {
          [[1, 'amanhã'], [0, 'hoje']].forEach(([antes, palavra]) => {
            const quandoD = new Date(data + 'T00:00:00'); quandoD.setDate(quandoD.getDate() - antes); quandoD.setHours(p.hora, 0, 0, 0);
            if (quandoD.getTime() <= Date.now()) return;
            lista.push({ at: quandoD.toISOString(), canal: 'contas',
              titulo: p.detalhes ? ev.titulo + ' vence ' + palavra : (ev.tipo === 'due' ? 'Uma fatura' : 'Uma conta') + ' vence ' + palavra,
              corpo: p.detalhes ? brl(ev.valor) + ' · abra o OAZE para conferir ou marcar como paga.' : 'Abra o OAZE para ver os detalhes.',
              ordem: data + i });
          });
        });
      });
    });
    return lista;
  }

  function metas(perfil, p) {
    const lista = [];
    (perfil.goals || []).forEach((g) => {
      if (!g.deadline || !(g.target > 0) || (g.saved || 0) >= g.target) return;
      const aviso = new Date(g.deadline + 'T00:00:00'); aviso.setDate(aviso.getDate() - 7); aviso.setHours(p.hora, 0, 0, 0);
      if (aviso.getTime() <= Date.now() || dias(hojeISO(), g.deadline) > 60) return;
      lista.push({ at: aviso.toISOString(), canal: 'contas',
        titulo: p.detalhes ? 'Meta ' + g.name + ': faltam 7 dias' : 'Uma meta vence em 7 dias',
        corpo: p.detalhes ? 'Guardado ' + brl(g.saved || 0) + ' de ' + brl(g.target) + '.' : 'Abra o OAZE para ver o progresso.' });
    });
    return lista;
  }

  let assinaturaAgendada = '';
  const OazeAvisos = {
    prefs,
    async sincronizar() {
      const nativo = global.OAZE_NATIVE_NOTIFICATIONS;
      const c = contexto();
      if (!nativo || !c || c.demo || !c.profile) return;
      const p = prefs();
      /* Push do servidor: só o dólar, e só se a pessoa ligou esse aviso. */
      if (global.OAZE_NATIVE_PUSH) {
        const chave = 'oaze.push.topicos';
        const topicos = p.dolar ? ['dolar'] : [];
        if (armazenado.ler(chave, null) !== topicos.join(',')) {
          global.OAZE_NATIVE_PUSH.registrar(topicos).then((ok) => { if (ok) armazenado.gravar(chave, topicos.join(',')); }).catch(() => {});
        }
      }
      const agendados = [];
      if (p.vencimentos) agendados.push(...vencimentos(c.profile, p));
      if (p.metas) agendados.push(...metas(c.profile, p));
      if (global.OazeTeste) agendados.push(...global.OazeTeste.lembretes());
      if (global.OazeFuncoes) agendados.push(...global.OazeFuncoes.lembretes());
      const ja = enviados();
      const novos = (await insights(c.profile, p)).filter((x) => !ja[x.chave]);
      const slot = proximoHorario(p).toISOString();
      novos.slice(0, 3).forEach((x) => { agendados.push({ at: slot, canal: x.canal, titulo: x.titulo, corpo: x.corpo }); ja[x.chave] = hojeISO(); });
      agendados.sort((a, b) => a.at.localeCompare(b.at));
      const itens = agendados.slice(0, 60).map((x, i) => ({ id: 3100000 + i, at: x.at, title: x.titulo, body: x.corpo, channel: x.canal }));
      const assinatura = JSON.stringify(itens);
      if (assinatura === assinaturaAgendada) return;
      await nativo.schedule(itens);
      assinaturaAgendada = assinatura;
      /* Guarda as chaves só depois de agendar, e esquece as com mais de 60 dias. */
      const limite = new Date(Date.now() - 60 * 86400000).toISOString().slice(0, 10);
      Object.keys(ja).forEach((k) => { if (ja[k] < limite) delete ja[k]; });
      armazenado.gravar('oaze.avisos.enviados', ja);
    },
    /* Lista dentro da folha de notificações (funciona também no site). */
    listaInsights() {
      const html = (ultimosInsights || []).map((x) => '<div class="v3-notification-item oz-insight"><span class="oz-insight-marca" aria-hidden="true">•</span><span><strong>' + esc(x.titulo) + '</strong><small>' + esc(x.texto || x.corpo) + '</small></span></div>').join('');
      return html ? '<span class="v3-label v3-section-title">INSIGHTS</span><div class="v3-notification-list">' + html + '</div>' : '';
    },
    preferencias() {
      const p = prefs();
      const caixa = (k, rot, sub) => '<label class="oz-pref"><input type="checkbox" name="' + k + '"' + (p[k] ? ' checked' : '') + '><span><strong>' + esc(rot) + '</strong><small>' + esc(sub) + '</small></span></label>';
      const horas = [7, 8, 9, 10, 12, 18, 20].map((h) => '<option value="' + h + '"' + (p.hora === h ? ' selected' : '') + '>' + String(h).padStart(2, '0') + ':00</option>').join('');
      const d = dialogo('escolher avisos',
        '<p>Escolha o que o OAZE avisa neste aparelho. Os avisos são criados a partir dos seus dados quando o app é aberto.</p>'
        + '<fieldset class="oz-prefs"><legend>Contas</legend>'
        + caixa('vencimentos', 'Vencimentos', 'Na véspera e no dia: "conta X vence amanhã"')
        + caixa('metas', 'Metas', '7 dias antes do prazo de uma meta')
        + '</fieldset><fieldset class="oz-prefs"><legend>Complementares</legend>'
        + caixa('orcamento', 'Orçamento', 'Ao passar de 80% e de 100% de uma categoria')
        + caixa('score', 'Score OAZE', 'Quando o seu score subir')
        + caixa('dolar', 'Dólar do dia', 'Cotação comercial do Banco Central, uma vez por dia')
        + caixa('dicas', 'Dicas', 'Conteúdo educativo sobre reserva e juros; nunca indicação de produto')
        + '</fieldset><fieldset class="oz-prefs"><legend>Privacidade</legend>'
        + caixa('detalhes', 'Mostrar nomes e valores', 'Desligado: o aviso diz só "uma conta vence amanhã"')
        + '<label class="oz-pref-hora">Horário dos avisos<select name="hora">' + horas + '</select></label></fieldset>'
        + '<div class="v3-estado-actions"><button type="submit" class="v3-secondary">Cancelar</button><button type="button" class="v3-primary" data-oz-salvar-avisos>Salvar</button></div>',
        'Escolher avisos');
      d.querySelector('[data-oz-salvar-avisos]').addEventListener('click', async () => {
        const f = d.querySelector('form');
        const novo = { hora: Number(f.elements.hora.value) || 9 };
        Object.keys(PREF_PADRAO).forEach((k) => { if (k !== 'hora') novo[k] = !!(f.elements[k] && f.elements[k].checked); });
        armazenado.gravar('oaze.avisos.prefs', novo);
        assinaturaAgendada = '';
        d.close();
        try { await OazeAvisos.sincronizar(); avisar('Avisos atualizados.'); }
        catch { avisar('Preferências salvas. Ative as notificações para recebê-las.'); }
      });
    }
  };
  let ultimosInsights = [];
  async function calcularInsights() {
    const c = contexto();
    if (!c || c.demo || !c.profile) { ultimosInsights = []; return; }
    try { ultimosInsights = await insights(c.profile, Object.assign({}, prefs(), { dolar: true, dicas: true, orcamento: true })); } catch { ultimosInsights = []; }
    /* O Início já pode estar desenhado: redesenha só o bloco da Coco. */
    const bloco = document.querySelector('[data-oz-inicio]');
    if (bloco) bloco.outerHTML = blocoInicio();
  }

  /* =============================================================
     PERMISSÕES
     ============================================================= */
  async function consultar(nome) {
    try {
      if (!navigator.permissions || !navigator.permissions.query) return 'perguntar';
      const r = await navigator.permissions.query({ name: nome });
      return r.state === 'granted' ? 'permitida' : r.state === 'denied' ? 'negada' : 'perguntar';
    } catch { return 'perguntar'; }
  }
  const ITENS = [
    { id: 'notificacoes', nome: 'Notificações', por: 'Vencimentos na véspera e no dia, orçamento, metas, score e dólar. Você escolhe quais em "Escolher avisos".',
      async estado() {
        const n = global.OAZE_NATIVE_NOTIFICATIONS;
        if (n && n.status) { const s = await n.status().catch(() => 'prompt'); return s === 'granted' ? 'permitida' : s === 'denied' ? 'negada' : 'perguntar'; }
        if (!('Notification' in global)) return 'indisponível';
        return Notification.permission === 'granted' ? 'permitida' : Notification.permission === 'denied' ? 'negada' : 'perguntar';
      },
      async pedir() {
        const n = global.OAZE_NATIVE_NOTIFICATIONS;
        if (n) { const ok = await n.request().catch(() => false); if (ok) { try { localStorage.setItem('oaze.native.reminders', 'yes'); } catch {} await OazeAvisos.sincronizar().catch(() => {}); } return; }
        if ('Notification' in global) await Notification.requestPermission();
      } },
    { id: 'localizacao', nome: 'Localização', por: 'Opcional. Guarda o local de uma compra quando você toca em "Usar minha localização" (arredondado a ~100 m). Nunca em segundo plano.',
      estado: () => consultar('geolocation'),
      pedir: () => new Promise((ok) => navigator.geolocation ? navigator.geolocation.getCurrentPosition(() => ok(), () => ok(), { timeout: 15000, maximumAge: 600000 }) : ok()) },
    { id: 'microfone', nome: 'Microfone', por: 'Conversa por voz com a Coco. Fica ligado só durante a conversa.',
      estado: () => consultar('microphone'),
      async pedir() { const s = await navigator.mediaDevices.getUserMedia({ audio: true }); s.getTracks().forEach((t) => t.stop()); } },
    { id: 'camera', nome: 'Câmera', por: 'Foto de recibo para a Coco ler. Só quando você escolhe anexar uma foto.',
      estado: () => consultar('camera'),
      async pedir() { const s = await navigator.mediaDevices.getUserMedia({ video: true }); s.getTracks().forEach((t) => t.stop()); } }
  ];
  const OazePermissoes = {
    async abrir() {
      const estados = await Promise.all(ITENS.map((i) => i.estado().catch(() => 'perguntar')));
      const bio = global.OAZE_NATIVE_BIOMETRICS;
      const linhas = ITENS.map((item, n) => {
        const e = estados[n];
        const acao = e === 'permitida' ? '' : e === 'negada'
          ? '<small class="oz-perm-dica">Negada. Para liberar: Configurações do aparelho › Apps › OAZE › Permissões.</small>'
          : e === 'indisponível' ? '' : '<button type="button" class="v3-secondary" data-oz-permitir="' + item.id + '">Permitir</button>';
        return '<div class="oz-perm"><div><strong>' + esc(item.nome) + '</strong><span class="oz-chip oz-chip-' + e.replace('í', 'i') + '">' + esc(e) + '</span></div><p>' + esc(item.por) + '</p>' + acao + '</div>';
      }).join('')
        + '<div class="oz-perm"><div><strong>Biometria</strong><span class="oz-chip">' + (bio ? (bio.isEnabled() ? 'ativada' : 'desativada') : 'no app') + '</span></div><p>Desbloquear o OAZE com digital, rosto ou o bloqueio do aparelho. O PIN do cofre continua valendo.</p>'
        + (bio ? '<button type="button" class="v3-secondary" data-action="biometric-toggle">' + (bio.isEnabled() ? 'Desativar' : 'Ativar') + '</button>' : '') + '</div>'
        + '<div class="oz-perm"><div><strong>Anúncios</strong><span class="oz-chip">' + (plano() === 'free' ? 'plano Semente' : 'sem anúncios') + '</span></div><p>No plano Semente do app Android, o anúncio só aparece quando você escolhe assistir para liberar lançamentos. O Google pode usar o ID de publicidade do aparelho; você pode redefini-lo ou desativar a personalização nas configurações do Android.</p></div>';
      const d = dialogo('permissões do aparelho', '<p>O OAZE pede cada acesso só no momento de uso. Nada aqui é obrigatório para usar o app.</p><div class="oz-perms">' + linhas + '</div>'
        + '<div class="v3-estado-actions">' + (global.OAZE_NATIVE_NOTIFICATIONS ? '<button type="button" class="v3-secondary" data-oz-escolher-avisos>Escolher avisos</button>' : '') + '<button type="submit" class="v3-primary">Fechar</button></div>', 'Permissões do aparelho');
      d.addEventListener('click', async (ev) => {
        const alvo = ev.target.closest('[data-oz-permitir]');
        if (alvo) {
          const item = ITENS.find((i) => i.id === alvo.dataset.ozPermitir);
          alvo.disabled = true;
          try { await item.pedir(); } catch { /* recusada no diálogo do sistema */ }
          d.close(); OazePermissoes.abrir();
        }
        if (ev.target.closest('[data-oz-escolher-avisos]')) { d.close(); OazeAvisos.preferencias(); }
        if (ev.target.closest('[data-action="biometric-toggle"]')) d.close();
      });
    }
  };

  /* =============================================================
     LOCAL DA COMPRA E MODO VIAGEM
     ============================================================= */
  const FUSOS_BR = /^America\/(Sao_Paulo|Bahia|Fortaleza|Recife|Belem|Manaus|Cuiaba|Campo_Grande|Boa_Vista|Porto_Velho|Rio_Branco|Maceio|Araguaina|Santarem|Noronha|Eirunepe)$/;
  function fusoAtual() { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch { return ''; } }
  function emViagem() { const f = fusoAtual(); return !!f && !FUSOS_BR.test(f); }
  const mapa = (l) => 'https://www.openstreetmap.org/?mlat=' + l.lat + '&mlon=' + l.lng + '#map=17/' + l.lat + '/' + l.lng;
  function blocoLocal(form) {
    if (form.querySelector('[data-oz-local]')) return;
    const id = form.elements.id ? String(form.elements.id.value || '') : '';
    let existente = null;
    try { existente = id && global.Store && Store.transactions && Store.transactions.get(id) ? Store.transactions.get(id).local || null : null; } catch { existente = null; }
    const estrangeiras = (() => {
      const c = contexto();
      if (!c || !c.profile) return [];
      return (c.profile.accounts || []).concat(c.profile.cards || []).filter((x) => x.moeda && x.moeda !== 'BRL' && !x.archived && !x.hidden);
    })();
    const viagem = emViagem()
      ? '<p class="oz-viagem" role="note">Seu aparelho está no fuso ' + esc(fusoAtual()) + ', fora do Brasil. '
        + (estrangeiras.length ? 'Para lançar na moeda local, escolha ' + esc(estrangeiras.slice(0, 2).map((x) => x.name + ' (' + x.moeda + ')').join(' ou ')) + ' em "conta/cartão".'
          : 'Para lançar em outra moeda, cadastre uma conta ou cartão nessa moeda na carteira.') + '</p>'
      : '';
    const html = '<div class="oz-local" data-oz-local>'
      + '<input type="hidden" name="local" value="' + esc(existente ? JSON.stringify(existente) : '') + '">'
      + '<div class="oz-local-cabeca"><span>Local da compra <small>opcional</small></span>'
      + '<span data-oz-local-estado>' + (existente ? 'Salvo · <a href="' + esc(mapa(existente)) + '" target="_blank" rel="noopener noreferrer">ver no mapa</a>' : 'Não registrado') + '</span></div>'
      + '<div class="oz-local-acoes"><button type="button" class="v3-secondary" data-oz-local-usar>Usar minha localização</button>'
      + '<button type="button" class="v3-link" data-oz-local-remover' + (existente ? '' : ' hidden') + '>Remover</button></div>'
      + viagem + '</div>';
    const mais = form.querySelector('.v3-mais .v3-mais-corpo');
    if (mais) { mais.insertAdjacentHTML('beforeend', html); if (existente) form.querySelector('.v3-mais').open = true; return; }
    const enviar = form.querySelector('button[type="submit"]');
    const ancora = enviar ? enviar.closest('.v3-form-actions, .v3-sheet-actions, div') : null;
    if (ancora && ancora.parentElement === form) ancora.insertAdjacentHTML('beforebegin', html);
    else form.insertAdjacentHTML('beforeend', html);
  }
  document.addEventListener('click', (ev) => {
    const usar = ev.target.closest('[data-oz-local-usar]');
    const remover = ev.target.closest('[data-oz-local-remover]');
    if (!usar && !remover) return;
    const bloco = ev.target.closest('[data-oz-local]');
    const campo = bloco.querySelector('input[name="local"]');
    const estado = bloco.querySelector('[data-oz-local-estado]');
    const botaoRemover = bloco.querySelector('[data-oz-local-remover]');
    if (remover) { campo.value = ''; estado.textContent = 'Não registrado'; botaoRemover.hidden = true; return; }
    if (!navigator.geolocation) { estado.textContent = 'Localização indisponível neste aparelho.'; return; }
    usar.disabled = true; estado.textContent = 'Procurando…';
    navigator.geolocation.getCurrentPosition((pos) => {
      const l = { lat: Math.round(pos.coords.latitude * 1000) / 1000, lng: Math.round(pos.coords.longitude * 1000) / 1000 };
      campo.value = JSON.stringify(l);
      estado.innerHTML = 'Registrado · <a href="' + esc(mapa(l)) + '" target="_blank" rel="noopener noreferrer">ver no mapa</a>';
      botaoRemover.hidden = false; usar.disabled = false;
    }, (erro) => {
      estado.textContent = erro && erro.code === 1 ? 'Permissão negada. Você pode liberar em Permissões do aparelho.' : 'Não foi possível obter a localização.';
      usar.disabled = false;
    }, { enableHighAccuracy: false, timeout: 15000, maximumAge: 300000 });
  });
  new MutationObserver(() => {
    const form = document.getElementById('v3-form-tx');
    if (form) blocoLocal(form);
  }).observe(document.body, { childList: true, subtree: true });

  /* =============================================================
     INÍCIO: CONVERSA E INSIGHTS (inspiração Pierre)
     A Coco sai da aba e vira a primeira coisa do Início: uma barra
     de pergunta com atalhos e os insights do mês, antes de a pessoa
     precisar perguntar.
     ============================================================= */
  const ATALHOS = ['Para onde foi meu dinheiro este mês?', 'Quanto gastei no cartão?', 'Vou fechar o mês no azul?', 'Tenho conta vencendo esta semana?'];
  /* O widget da Coco é um widget como os outros (01/11/2026): entra na
     ordem escolhida, pode ser removido e editado (o que ele mostra). */
  const CHAVE_COCO = 'oaze.v3.inicio.coco';
  function opcoesCoco() {
    let o = {};
    try { o = JSON.parse(localStorage.getItem(CHAVE_COCO) || '{}') || {}; } catch { o = {}; }
    return { captura: o.captura !== false, atalhos: o.atalhos !== false, insights: o.insights !== false };
  }
  function editarCoco() {
    const o = opcoesCoco();
    const d = document.createElement('dialog');
    d.className = 'oz-coco-editar';
    d.setAttribute('aria-labelledby', 'oz-coco-editar-t');
    const linha = (k, t) => '<label class="v3-check"><input type="checkbox" name="' + k + '" ' + (o[k] ? 'checked' : '') + '> ' + t + '</label>';
    d.innerHTML = '<form method="dialog" class="v3-form"><h2 id="oz-coco-editar-t">Widget da Coco</h2><p class="v3-muted">A barra de pergunta fica sempre. Escolha o resto.</p>'
      + linha('captura', 'Botões "Foto do recibo" e "Lançar à mão"') + linha('atalhos', 'Perguntas prontas') + linha('insights', 'Insights do mês')
      + '<button type="submit" class="v3-primary" value="ok">Salvar</button><button type="button" class="v3-secondary" data-oz-coco-remover>Remover da Início</button><button type="submit" class="v3-link" value="cancelar">Cancelar</button></form>';
    document.body.appendChild(d);
    d.addEventListener('close', () => {
      if (d.returnValue === 'ok') {
        const f = d.querySelector('form');
        const novo = { captura: f.captura.checked, atalhos: f.atalhos.checked, insights: f.insights.checked };
        try { localStorage.setItem(CHAVE_COCO, JSON.stringify(novo)); } catch { /* só nesta sessão */ }
        const atual = document.querySelector('[data-oz-inicio]');
        if (atual) atual.outerHTML = blocoInicio();
      }
      d.remove();
    });
    d.querySelector('[data-oz-coco-remover]').addEventListener('click', () => {
      d.close('remover');
      if (global.OazeInicio) global.OazeInicio.remover('coco');
      avisar('Widget da Coco removido. Para trazer de volta: Gerenciar widgets.');
    });
    d.showModal();
  }
  function blocoInicio() {
    const o = opcoesCoco();
    const insightsHtml = o.insights ? (ultimosInsights || []).slice(0, 2).map((x) =>
      '<li><strong>' + esc(x.titulo) + '</strong><small>' + esc(x.texto || x.corpo) + '</small></li>').join('') : '';
    return '<section class="v3-panel oz-inicio-coco" data-oz-inicio aria-label="Converse com a Coco">'
      + '<div class="oz-coco-topo"><span class="v3-label">COCO</span><button type="button" class="v3-link oz-coco-editar-botao" data-oz-coco-editar aria-label="Editar widget da Coco">editar</button></div>'
      + '<form data-oz-pergunta><label class="oz-sr" for="oz-pergunta">Pergunte à Coco</label>'
      + '<input id="oz-pergunta" name="pergunta" maxlength="500" autocomplete="off" placeholder="Pergunte à Coco">'
      + '<button type="submit" class="v3-primary" aria-label="Enviar pergunta à Coco">›</button></form>'
      + '<div class="oz-captura"' + (o.captura ? '' : ' hidden') + '><button type="button" class="v3-secondary" data-oz-recibo>Foto do recibo</button>'
      + '<button type="button" class="v3-secondary" data-action="new">Lançar à mão</button>'
      + '<input id="v3-coco-file" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" hidden></div>'
      + (o.atalhos ? '<div class="oz-atalhos" role="group" aria-label="Perguntas prontas">' + ATALHOS.map((a) => '<button type="button" class="oz-atalho" data-oz-atalho="' + esc(a) + '">' + esc(a) + '</button>').join('') + '</div>' : '')
      + (insightsHtml ? '<ul class="oz-insights-inicio" aria-label="Insights do mês">' + insightsHtml + '</ul>' : '')
      + '</section>';
  }
  function inserirInicio() {
    const view = document.getElementById('v3-view');
    if (!view || view.querySelector('[data-oz-inicio]')) return;
    const vaga = view.querySelector('[data-oz-inicio-slot]');
    if (vaga) { vaga.outerHTML = blocoInicio(); return; }
    if (global.OazeInicio && !global.OazeInicio.ligado('coco')) return;
    if (view.querySelector('.v3-home-widgets')) return;
    const ancora = view.querySelector('.v3-home-identity');
    if (ancora) ancora.insertAdjacentHTML('afterend', blocoInicio());
    else view.insertAdjacentHTML('afterbegin', blocoInicio());
  }
  function perguntarCoco(texto) {
    const pergunta = String(texto || '').trim().slice(0, 500);
    if (!pergunta) return;
    const ir = document.querySelector('[data-go="coco"]');
    if (!ir) return;
    ir.click();
    let tentativas = 0;
    (function enviar() {
      const form = document.getElementById('v3-chat-form');
      if (form && form.elements.question) {
        form.elements.question.value = pergunta;
        if (form.requestSubmit) form.requestSubmit(); else form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        return;
      }
      if (++tentativas < 20) setTimeout(enviar, 50);
    })();
  }
  document.addEventListener('submit', (ev) => {
    const form = ev.target.closest && ev.target.closest('[data-oz-pergunta]');
    if (!form) return;
    ev.preventDefault();
    perguntarCoco(form.elements.pergunta.value);
  });
  document.addEventListener('click', (ev) => {
    const atalho = ev.target.closest('[data-oz-atalho]');
    if (atalho) perguntarCoco(atalho.dataset.ozAtalho);
    if (ev.target.closest('[data-oz-recibo]')) capturarRecibo();
    if (ev.target.closest('[data-oz-coco-editar]')) editarCoco();
  });
  /* Captura rápida: a foto vai à Coco (com o aviso de privacidade de
     sempre) e volta como proposta de lançamento já preenchida. */
  function capturarRecibo() {
    const c = contexto();
    if (c && c.demo) { avisar('Na demonstração a foto não é enviada.'); return; }
    let entrada = document.querySelector('[data-oz-inicio] #v3-coco-file');
    if (!entrada) {
      const ir = document.querySelector('[data-go="home"]');
      if (ir) ir.click();
      entrada = document.querySelector('[data-oz-inicio] #v3-coco-file');
    }
    if (!entrada) return;
    global.__ozCapturaRecibo = true;
    entrada.value = '';
    entrada.click();
  }
  /* Importar comprovante (31/10/2026, inspiração Kontto): galeria,
     câmera ou PDF. Foto vai à Coco e volta como proposta para revisar;
     PDF, CSV e OFX são lidos neste aparelho pelo leitor de extratos.
     O arquivo entra pelo mesmo caminho do anexo da Coco: um campo
     temporário com o id que o painel já escuta. */
  function entregarArquivo(arquivo) {
    const temp = document.createElement('input');
    temp.type = 'file'; temp.id = 'v3-coco-file'; temp.hidden = true;
    const dt = new DataTransfer(); dt.items.add(arquivo); temp.files = dt.files;
    global.__ozCapturaRecibo = /^image\//.test(arquivo.type);
    document.body.appendChild(temp);
    temp.dispatchEvent(new Event('change', { bubbles: true }));
    temp.remove();
  }
  function abrirComprovante() {
    const c = contexto();
    if (c && c.demo) { avisar('Na demonstração nenhum arquivo é enviado.'); return; }
    const opcoes = [
      ['galeria', 'Galeria', 'Print ou foto do comprovante', 'image/jpeg,image/png,image/webp', false],
      ['camera', 'Câmera', 'Tirar foto agora', 'image/jpeg,image/png,image/webp', true],
      ['pdf', 'PDF ou extrato', 'Comprovante ou extrato do banco (PDF, CSV, OFX)', 'application/pdf,text/csv,.pdf,.csv,.ofx,.qfx', false]
    ];
    const d = dialogo('Importar comprovante',
      '<p class="v3-muted">A Coco lê valor, descrição e data e monta o lançamento para você revisar antes de salvar.</p>'
      + '<div class="oz-comprovante">' + opcoes.map(([id, t, s, accept, cam]) =>
        '<label class="oz-comprovante-op" tabindex="0" role="button"><span><strong>' + esc(t) + '</strong><small>' + esc(s) + '</small></span><span aria-hidden="true">›</span>'
        + '<input type="file" class="oz-arquivo-oculto" tabindex="-1" data-oz-comp="' + id + '" accept="' + accept + '"' + (cam ? ' capture="environment"' : '') + '></label>').join('')
      + '</div><button type="submit" class="v3-secondary oz-comprovante-cancelar">Cancelar</button>', 'Importar comprovante');
    d.addEventListener('keydown', (ev) => { const op = ev.target.closest && ev.target.closest('.oz-comprovante-op'); if (op && (ev.key === 'Enter' || ev.key === ' ')) { ev.preventDefault(); op.querySelector('input').click(); } });
    d.addEventListener('change', (ev) => {
      const f = ev.target.files && ev.target.files[0];
      if (!f) return;
      d.close();
      entregarArquivo(f);
    });
  }
  global.OazeComprovante = { abrir: abrirComprovante };
  document.addEventListener('click', (ev) => {
    if (ev.target.closest('[data-oz-comprovante]')) { ev.preventDefault(); abrirComprovante(); }
  });
  /* Botão de comprovante no topo do "novo lançamento". */
  new MutationObserver(() => {
    const form = document.getElementById('v3-form-tx');
    if (!form || form.querySelector('[data-oz-comprovante]') || (form.elements.id && form.elements.id.value)) return;
    form.insertAdjacentHTML('afterbegin', '<button type="button" class="v3-secondary oz-comprovante-botao" data-oz-comprovante>Ler comprovante (foto ou PDF)</button>');
  }).observe(document.body, { childList: true, subtree: true });

  /* Atalhos do ícone no Android (pressionar e segurar): oaze://acao/... */
  global.addEventListener('oaze:acao', (ev) => {
    const acao = ev.detail;
    if (acao === 'recibo') { setTimeout(capturarRecibo, 300); return; }
    if (acao === 'novo') { const b = document.querySelector('[data-action="new"]'); if (b) b.click(); return; }
    if (acao === 'coco') { const b = document.querySelector('[data-go="coco"]'); if (b) b.click(); }
  });

  /* =============================================================
     LIGAÇÕES COM O PAINEL
     ============================================================= */
  let estadoPagina = 'home';
  document.addEventListener('oaze:render', (ev) => {
    const pagina = ev.detail && ev.detail.page;
    estadoPagina = pagina;
    if (pagina === 'home') { inserirInicio(); try { atualizarWidget(); } catch { /* conforto */ } }
    if (pagina === 'coco' || pagina === 'settings') { inserirCoco(pagina); void atualizarCoco(false); }
    if (pagina === 'plan' || pagina === 'settings') {
      const view = document.getElementById('v3-view');
      const html = OazeAnuncios.painel();
      if (view && html && !view.querySelector('[data-oz-anuncio]')) {
        if (pagina === 'plan') view.insertAdjacentHTML('afterbegin', html);
        else { const alvo = view.querySelector('[data-oz-coco-uso], .v3-settings-extra'); if (alvo) alvo.insertAdjacentHTML('beforebegin', html); else view.insertAdjacentHTML('beforeend', html); }
      }
    }
  });
  document.addEventListener('click', (ev) => {
    const anuncio = ev.target.closest('[data-action="assistir-anuncio"]');
    if (anuncio) { ev.preventDefault(); void OazeAnuncios.assistir(anuncio); return; }
    if (ev.target.closest('[data-action="avisos-preferencias"]')) {
      ev.preventDefault();
      const fechar = document.querySelector('#v3-overlay:not([hidden]) [data-action="close"]');
      if (fechar) fechar.click();
      OazeAvisos.preferencias();
    }
  });
  /* =============================================================
     WIDGET ANDROID: saldo e próximos vencimentos. Com "mostrar nomes e
     valores" desligado (padrão), o widget não exibe valor nem nome.
     ============================================================= */
  let ultimoWidget = '';
  function atualizarWidget() {
    const w = global.OAZE_NATIVE_WIDGET;
    if (!w) return;
    const c = contexto();
    if (!c || c.demo || !c.profile || !usuarioId()) { if (ultimoWidget) { ultimoWidget = ''; w.limpar(); } return; }
    const p = prefs();
    const hoje = hojeISO();
    let saldo = null;
    try { saldo = global.Calc && Calc.totalAccountsBalance ? Calc.totalAccountsBalance(hoje, c.profile) : null; } catch { saldo = null; }
    const proximos = [];
    try {
      [hoje.slice(0, 7), somarMeses(hoje.slice(0, 7), 1)].forEach((mes) => {
        const porDia = Calc.calendarEvents(mes, c.profile) || {};
        Object.keys(porDia).forEach((dia) => {
          const data = mes + '-' + String(dia).padStart(2, '0');
          const falta = dias(hoje, data);
          if (falta < 0 || falta > 15) return;
          porDia[dia].filter((ev) => !ev.confirmado && (ev.tipo === 'due' || ev.tipo === 'out')).forEach((ev) => proximos.push({ data, falta, ev }));
        });
      });
    } catch { /* agenda indisponível */ }
    proximos.sort((a, b) => a.data.localeCompare(b.data));
    const quando = (f) => f === 0 ? 'hoje' : f === 1 ? 'amanhã' : 'em ' + f + ' dias';
    const linhas = p.detalhes
      ? proximos.slice(0, 3).map((x) => x.ev.titulo + ' · ' + quando(x.falta) + ' · ' + brl(x.ev.valor))
      : [proximos.length ? proximos.length + (proximos.length === 1 ? ' conta vence' : ' contas vencem') + ' nos próximos 15 dias' : 'Nenhum vencimento nos próximos 15 dias',
        proximos.length ? 'A próxima vence ' + quando(proximos[0].falta) : '', ''];
    const dados = {
      titulo: 'OAZE · ' + (c.profile.name || 'Pessoal'),
      destaque: p.detalhes && saldo != null ? brl(saldo) : 'Saldo oculto',
      linha1: linhas[0] || '', linha2: linhas[1] || '', linha3: linhas[2] || '',
      rodape: 'Atualizado às ' + new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(new Date())
    };
    const assinatura = JSON.stringify(Object.assign({}, dados, { rodape: '' }));
    if (assinatura === ultimoWidget) return;
    ultimoWidget = assinatura;
    w.atualizar(dados);
  }

  /* Insights para a folha de notificações e agenda ao voltar ao app. */
  function aoAbrir() {
    try { atualizarWidget(); } catch { /* widget é conforto */ }
    void calcularInsights();
    try { if (localStorage.getItem('oaze.native.reminders') === 'yes') void OazeAvisos.sincronizar().catch(() => {}); } catch { /* sem armazenamento */ }
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) aoAbrir(); });
  setTimeout(aoAbrir, 4000);

  global.OazeAnuncios = OazeAnuncios;
  OazeAvisos.atualizarInsights = calcularInsights;
  global.OazeAvisos = OazeAvisos;
  global.OazePermissoes = OazePermissoes;
  global.OazeRecursos = { emViagem, fusoAtual, painelCoco };
})(window);
