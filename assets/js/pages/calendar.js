/* =============================================================
   pages/calendar.js — Calendário financeiro
   ------------------------------------------------------------
   Três escalas no mesmo lugar, alternadas no topo da página:

     Semana  os sete dias da semana escolhida, com o que entra,
             sai e vence em cada um
     Mês     a grade de sempre: pontos, saldo do dia e a lista do
             dia selecionado
     Ano     um painel por mês com TODOS os lançamentos — fixos,
             previstos e confirmados — e a soma de cada mês, mais
             as barras do ano inteiro para a visão geral

   Os eventos vêm de Calc (calendarEvents e entriesForMonth): a
   página não sabe somar nada além de juntar o que o Calc entregou.
   Como App.render roda a cada mudança no Store, um lançamento novo
   aparece nas três escalas no instante em que é salvo.
   ============================================================= */
(function (global) {
  'use strict';

  const el = U.el;
  const Cal = {};

  const CHAVE_VISTA = 'oaze.calendario.vista';
  const VISTAS = ['semana', 'mes', 'ano'];
  const DIAS_CURTOS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

  /* A escala é uma conveniência de quem olha, não um dado: fica no
     aparelho e, se o armazenamento falhar, a página abre no mês. */
  function vistaSalva() {
    try {
      const v = localStorage.getItem(CHAVE_VISTA);
      return VISTAS.includes(v) ? v : 'mes';
    } catch (e) { return 'mes'; }
  }
  function guardaVista(v) {
    try { localStorage.setItem(CHAVE_VISTA, v); } catch (e) { /* segue na memória */ }
  }

  Cal.render = function () {
    if (!App.calVista) App.calVista = vistaSalva();
    const vista = App.calVista;

    U.$$('#calVistas [data-vista]').forEach((b) => {
      const ativo = b.dataset.vista === vista;
      b.classList.toggle('is-active', ativo);
      b.setAttribute('aria-pressed', ativo ? 'true' : 'false');
    });
    U.$$('[data-cal-vista]').forEach((n) => { n.hidden = n.dataset.calVista !== vista; });

    if (vista === 'semana') renderSemana();
    else if (vista === 'ano') renderAno();
    else renderMes();
  };

  /** Liga os controles fixos da página. Chamado uma vez, no boot. */
  Cal.init = function () {
    U.$$('#calVistas [data-vista]').forEach((b) => b.addEventListener('click', () => {
      App.calVista = b.dataset.vista;
      guardaVista(App.calVista);
      Cal.render();
    }));
    document.getElementById('btnSemanaAnterior').addEventListener('click', () => andaSemana(-7));
    document.getElementById('btnSemanaSeguinte').addEventListener('click', () => andaSemana(7));
    document.getElementById('btnSemanaAtual').addEventListener('click', () => {
      irParaSemana(inicioDaSemana(U.todayISO()));
    });
  };

  /* ============================================================
     RESUMO — os mesmos quatro números nas três escalas
     ============================================================ */

  /**
   * Soma lançamentos (não faturas: a compra no cartão já é a
   * despesa, e somar a fatura de novo contaria o mesmo dinheiro
   * duas vezes).
   *
   * SÓ O QUE FOI PAGO ENTRA EM RECEITAS E DESPESAS. Antes as duas
   * somavam tudo o que estava lançado, pago ou não, e o total de
   * gastos do mês incluía o aluguel que ainda não tinha saído. O que
   * está lançado e não foi pago fica em "previsto", e o saldo com
   * tudo aparece à parte, como "se tudo se confirmar" — o mesmo nome
   * do painel inicial. Contas e cartões fora dos totais não entram.
   */
  function totais(entradas) {
    const t = {
      receitas: 0, despesas: 0, aConfirmar: 0, fixas: 0, qtdFixas: 0,
      /* PREVISTO = o que está lançado e ainda não foi confirmado.
         Ele já está dentro de "receitas" e "despesas" acima — aqui
         ele aparece separado porque é a parte que ainda pode não
         acontecer, e quem olha o calendário está justamente
         perguntando "o que ainda vem?". */
      previstoReceitas: 0, previstoDespesas: 0, qtdPrevistos: 0
    };
    entradas.forEach((e) => {
      if (e.kind === 'transfer' || e.contaNosTotais === false) return;
      if (e.confirmed) {
        if (e.kind === 'income') t.receitas += e.amount; else t.despesas += e.amount;
      } else {
        t.aConfirmar += e.kind === 'income' ? 0 : e.amount;
        t.qtdPrevistos++;
        if (e.kind === 'income') t.previstoReceitas += e.amount; else t.previstoDespesas += e.amount;
      }
      if (e.recurring && e.kind === 'expense') { t.fixas += e.amount; t.qtdFixas++; }
    });
    t.receitas = U.round2(t.receitas);
    t.despesas = U.round2(t.despesas);
    t.aConfirmar = U.round2(t.aConfirmar);
    t.fixas = U.round2(t.fixas);
    t.previstoReceitas = U.round2(t.previstoReceitas);
    t.previstoDespesas = U.round2(t.previstoDespesas);
    t.previstoSaldo = U.round2(t.previstoReceitas - t.previstoDespesas);
    t.saldo = U.round2(t.receitas - t.despesas);
    t.seTudo = U.round2(t.saldo + t.previstoSaldo);
    return t;
  }

  function pintaResumo(t, rotuloPeriodo, extra) {
    const box = U.clear(document.getElementById('calResumo'));
    const fig = (k, v, cls, sub) => el('div', { class: 'cal-resumo-fig' }, [
      el('span', { class: 'k', text: k }),
      el('span', { class: 'v ' + (cls || ''), text: v }),
      sub ? el('span', { class: 's', text: sub }) : null
    ].filter(Boolean));

    const sinal = (v) => (v < 0 ? '− ' : '') + U.fmtBRL(Math.abs(v));
    box.appendChild(fig('Recebido ' + rotuloPeriodo, U.fmtBRL(t.receitas), 'val-pos',
      t.previstoReceitas > 0 ? U.fmtBRL(t.previstoReceitas) + ' ainda a receber' : 'nada pendente'));
    box.appendChild(fig('Pago ' + rotuloPeriodo, U.fmtBRL(t.despesas), 'val-neg',
      t.aConfirmar > 0 ? U.fmtBRL(t.aConfirmar) + ' ainda a pagar' : 'nada pendente'));
    box.appendChild(fig('Saldo ' + rotuloPeriodo, sinal(t.saldo), t.saldo < 0 ? 'val-neg' : '',
      'se tudo se confirmar: ' + sinal(t.seTudo)));

    /* A soma do que ainda não aconteceu, nas três escalas. Sem ela,
       "despesas do mês" misturava o que já saiu com o que talvez
       saia, e as duas coisas exigem decisões diferentes. */
    box.appendChild(fig(
      'Previsto ' + rotuloPeriodo,
      t.qtdPrevistos ? U.fmtBRL(t.previstoDespesas) : U.fmtBRL(0),
      t.previstoDespesas > 0 ? 'val-neg' : '',
      !t.qtdPrevistos ? 'nada a confirmar'
        : (t.qtdPrevistos === 1 ? '1 lançamento' : t.qtdPrevistos + ' lançamentos')
          + (t.previstoReceitas > 0 ? ' · ' + U.fmtBRL(t.previstoReceitas) + ' a receber' : '')
    ));

    box.appendChild(extra || fig('Despesas fixas', U.fmtBRL(t.fixas), '',
      t.qtdFixas === 1 ? '1 lançamento' : t.qtdFixas + ' lançamentos'));
  }

  /* ============================================================
     MÊS — a grade
     ============================================================ */

  function renderMes() {
    const ym = App.ym;
    const p = U.ymParts(ym);
    const eventos = eventosComFixas(ym);

    document.getElementById('calTitle').textContent = U.smartCase(U.monthLabel(ym));
    pintaResumo(totais(Calc.entriesForMonth(ym)), 'do mês');
    montaGrade(p, eventos);
    montaDia(eventos, ym);
  }

  function montaGrade(p, eventos) {
    const grade = U.clear(document.getElementById('calGrid'));

    // cabeçalho da semana: domingo primeiro, como o calendário brasileiro
    DIAS_CURTOS.forEach((d) => {
      grade.appendChild(el('span', { class: 'cal-dow', text: d }));
    });

    const primeiro = new Date(p.y, p.m, 1).getDay();   // 0 = domingo
    const dias = U.daysInMonth(p.y, p.m);
    const hoje = U.todayISO();

    // casas vazias antes do dia 1, para o mês cair na coluna certa
    for (let i = 0; i < primeiro; i++) grade.appendChild(el('span', { class: 'cal-cell is-empty' }));

    for (let d = 1; d <= dias; d++) {
      const iso = U.isoOf(p.y, p.m, d);
      const evs = eventos[d] || [];
      const liquido = liquidoDoDia(evs);
      const selecionado = App.calDay === d;

      const cell = el('button', {
        type: 'button',
        class: 'cal-cell'
          + (iso === hoje ? ' is-today' : '')
          + (selecionado ? ' is-sel' : '')
          + (evs.length ? '' : ' is-quiet'),
        'aria-label': `${d} de ${U.MONTHS[p.m]}` + (evs.length ? `, ${evs.length} evento(s)` : ', sem eventos'),
        'aria-pressed': selecionado ? 'true' : 'false',
        onclick: () => { App.calDay = d; Cal.render(); }
      }, [
        el('span', { class: 'cal-num', text: String(d) }),
        evs.length ? pontos(evs) : null,
        evs.length
          ? el('span', {
            class: 'cal-sum ' + (liquido >= 0 ? 'val-pos' : 'val-neg'),
            text: (liquido >= 0 ? '+' : '−') + U.fmtCompact(Math.abs(liquido))
          })
          : null
      ].filter(Boolean));

      grade.appendChild(cell);
    }
  }

  function liquidoDoDia(evs) {
    const entrada = U.sum(evs.filter((e) => e.tipo === 'in'), (e) => e.valor);
    const saida = U.sum(evs.filter((e) => e.tipo === 'out' || e.tipo === 'due'), (e) => e.valor);
    return U.round2(entrada - saida);
  }

  function pontos(evs) {
    return el('span', { class: 'cal-dots' }, [
      evs.some((e) => e.tipo === 'in') ? el('i', { class: 'dot-in' }) : null,
      evs.some((e) => e.tipo === 'out') ? el('i', { class: 'dot-out' }) : null,
      evs.some((e) => e.tipo === 'due') ? el('i', { class: 'dot-due' }) : null
    ].filter(Boolean));
  }

  function montaDia(eventos, ym) {
    const titulo = document.getElementById('calDayTitle');
    const box = U.clear(document.getElementById('calDayList'));

    if (!App.calDay) {
      titulo.textContent = 'Selecione um dia';
      box.appendChild(UI.empty('Toque em um dia da grade para ver o que acontece nele.'));
      return;
    }

    const p = U.ymParts(ym);
    const iso = U.isoOf(p.y, p.m, U.clampDay(p.y, p.m, App.calDay));
    const evs = eventos[App.calDay] || [];
    titulo.textContent = U.fmtDateBR(iso);

    if (!evs.length) {
      box.appendChild(UI.empty('Nenhuma movimentação neste dia.'));
      return;
    }
    box.appendChild(listaDeEventos(evs));
  }

  function listaDeEventos(evs) {
    const ul = el('ul', { class: 'tx-list cal-lista' });
    evs.forEach((e) => {
      const sinal = e.tipo === 'in' ? '+ ' : e.tipo === 'tr' ? '' : '− ';
      const classe = e.tipo === 'in' ? 'val-pos' : e.tipo === 'tr' ? '' : 'val-neg';

      ul.appendChild(el('li', {
        class: 'tx-item cal-evento' + (e.confirmado ? '' : ' is-pending')
      }, [
        el('span', { class: 'cal-kind is-' + e.tipo, title: rotulo(e.tipo) },
          Icons.lucide(e.tipo === 'due' ? 'credit-card' : e.tipo === 'in' ? 'arrow-up-right' : e.tipo === 'tr' ? 'arrow-left-right' : 'arrow-down-right', 15)),
        el('div', { class: 'tx-main' }, [
          el('div', { class: 'tx-name', text: e.titulo }),
          el('div', { class: 'tx-meta' }, [
            el('span', { text: e.categoria }),
            e.fixa ? UI.badge('Fixa', 'fix') : null,
            !e.confirmado ? UI.badge(e.tipo === 'due' ? 'Em aberto' : 'Previsto', 'pend') : null
          ].filter(Boolean))
        ]),
        el('span', { class: 'tx-amount ' + classe, text: sinal + U.fmtBRL(e.valor) }),
        el('div', { class: 'tx-actions' }, [
          e.txId
            ? el('button', {
              class: 'icon-btn', title: 'Editar lançamento', 'aria-label': 'Editar ' + e.titulo,
              onclick: () => Forms.openTransaction(null, e.txId)
            }, Icons.lucide('pencil', 14))
            : el('button', {
              class: 'icon-btn', title: 'Ver fatura', 'aria-label': 'Ver fatura',
              onclick: () => App.goTo('accounts', { tab: 'cards', cardId: e.cardId, invoiceRef: e.ref })
            }, Icons.lucide('chevron-right', 14))
        ])
      ]));
    });
    return ul;
  }

  function rotulo(tipo) {
    return tipo === 'in' ? 'Entrada' : tipo === 'out' ? 'Saída'
      : tipo === 'due' ? 'Vencimento de fatura' : 'Transferência';
  }

  /* ============================================================
     SEMANA — sete dias, de domingo a sábado
     ============================================================ */

  function inicioDaSemana(iso) {
    const d = U.parseISO(iso);
    return U.addDaysISO(iso, -d.getDay());
  }

  /** A semana precisa tocar o mês do cabeçalho; senão, recomeça nele. */
  function semanaValida() {
    const ini = App.calSemana;
    if (!ini) return false;
    return U.ymOf(ini) === App.ym || U.ymOf(U.addDaysISO(ini, 6)) === App.ym;
  }

  function ancoraDaSemana() {
    if (semanaValida()) return App.calSemana;
    const p = U.ymParts(App.ym);
    const base = App.calDay ? U.isoOf(p.y, p.m, U.clampDay(p.y, p.m, App.calDay))
      : App.noMesAtual() ? U.todayISO() : U.monthStart(App.ym);
    return inicioDaSemana(base);
  }

  function andaSemana(dias) {
    irParaSemana(U.addDaysISO(ancoraDaSemana(), dias));
  }

  /* Uma semana que já não toca o mês do cabeçalho leva o cabeçalho
     junto — o mês da quarta-feira dela —, para os dois nunca
     discordarem sobre o período que está na tela. */
  function irParaSemana(inicio) {
    App.calSemana = inicio;
    if (semanaValida()) { Cal.render(); return; }
    App.setYM(U.ymOf(U.addDaysISO(inicio, 3)));
  }

  /** Os eventos do Calc, marcados quando vêm de um lançamento fixo. */
  function eventosComFixas(ym) {
    const fixas = new Set(Calc.entriesForMonth(ym).filter((e) => e.recurring).map((e) => e.txId));
    const evs = Calc.calendarEvents(ym);
    Object.keys(evs).forEach((d) => {
      evs[d] = evs[d].map((e) => Object.assign({ fixa: !!(e.txId && fixas.has(e.txId)) }, e));
    });
    return evs;
  }

  /** Eventos de um intervalo de datas que pode atravessar dois meses. */
  function eventosDoIntervalo(de, ate) {
    const porData = {};
    U.monthRange(U.ymOf(de), U.ymOf(ate)).forEach((ym) => {
      const evs = eventosComFixas(ym);
      const p = U.ymParts(ym);
      Object.keys(evs).forEach((d) => {
        const iso = U.isoOf(p.y, p.m, +d);
        if (iso >= de && iso <= ate) porData[iso] = evs[d];
      });
    });
    return porData;
  }

  function renderSemana() {
    const ini = ancoraDaSemana();
    App.calSemana = ini;
    const fim = U.addDaysISO(ini, 6);
    const hoje = U.todayISO();
    const porData = eventosDoIntervalo(ini, fim);

    const di = U.parseISO(ini), df = U.parseISO(fim);
    const titulo = di.getMonth() === df.getMonth()
      ? `${di.getDate()} a ${df.getDate()} de ${U.MONTHS[df.getMonth()].toLowerCase()}`
      : `${di.getDate()} de ${U.MONTHS_SHORT[di.getMonth()]} a ${df.getDate()} de ${U.MONTHS_SHORT[df.getMonth()]}`;
    document.getElementById('calTitle').textContent = 'Semana de ' + titulo;
    document.getElementById('calSemanaTitulo').textContent = hoje >= ini && hoje <= fim ? 'Esta semana' : 'Semana';
    document.getElementById('btnSemanaAtual').hidden = hoje >= ini && hoje <= fim;

    pintaResumo(totais(Calc.entries(ini, fim)), 'da semana');

    const box = U.clear(document.getElementById('calSemana'));
    for (let i = 0; i < 7; i++) {
      const iso = U.addDaysISO(ini, i);
      const d = U.parseISO(iso);
      const evs = porData[iso] || [];
      const liquido = liquidoDoDia(evs);

      box.appendChild(el('div', {
        class: 'cal-semana-dia' + (iso === hoje ? ' is-today' : '') + (evs.length ? '' : ' is-quiet')
          + (U.ymOf(iso) !== App.ym ? ' is-fora' : '')
      }, [
        el('div', { class: 'cal-semana-dia-topo' }, [
          el('span', { class: 'cal-semana-dow', text: DIAS_CURTOS[d.getDay()] }),
          el('span', { class: 'cal-semana-num', text: String(d.getDate()) }),
          evs.length
            ? el('span', {
              class: 'cal-semana-soma ' + (liquido >= 0 ? 'val-pos' : 'val-neg'),
              text: (liquido >= 0 ? '+ ' : '− ') + U.fmtBRL(Math.abs(liquido))
            })
            : el('span', { class: 'cal-semana-soma is-vazio', text: 'livre' })
        ]),
        evs.length ? listaCompacta(evs) : null
      ].filter(Boolean)));
    }
  }

  /** Linhas curtas: o que é, quanto, e se é fixo ou previsto. */
  function listaCompacta(evs) {
    return el('ul', { class: 'cal-mini' }, evs.map((e) => el('li', {
      class: 'cal-mini-item is-' + e.tipo + (e.confirmado ? '' : ' is-pending'),
      title: e.titulo + ' · ' + U.fmtBRL(e.valor)
    }, [
      el('span', { class: 'cal-mini-marca', 'aria-hidden': 'true' }),
      el('span', { class: 'cal-mini-nome' }, [
        document.createTextNode(e.titulo),
        e.fixa ? el('span', { class: 'cal-mini-tag', text: 'fixa' }) : null,
        !e.confirmado ? el('span', { class: 'cal-mini-tag is-pend', text: e.tipo === 'due' ? 'aberta' : 'prevista' }) : null
      ].filter(Boolean)),
      el('span', {
        class: 'cal-mini-valor ' + (e.tipo === 'in' ? 'val-pos' : e.tipo === 'tr' ? '' : 'val-neg'),
        text: (e.tipo === 'in' ? '+' : e.tipo === 'tr' ? '' : '−') + U.fmtBRL(e.valor)
      })
    ])));
  }

  /* ============================================================
     ANO — doze painéis e as barras do ano
     ============================================================ */

  function renderAno() {
    const ano = U.ymParts(App.ym).y;
    const meses = U.monthRange(`${ano}-01`, `${ano}-12`);
    const hojeYM = U.todayYM();

    const dados = meses.map((ym) => {
      const entradas = Calc.entriesForMonth(ym).filter((e) => e.kind !== 'transfer');
      return { ym, entradas, t: totais(entradas) };
    });

    const doAno = totais([].concat(...dados.map((m) => m.entradas)));
    document.getElementById('calTitle').textContent = 'Ano de ' + ano;

    const comGasto = dados.filter((m) => m.t.despesas > 0);
    const maior = comGasto.slice().sort((a, b) => b.t.despesas - a.t.despesas)[0];
    const media = comGasto.length ? U.round2(doAno.despesas / comGasto.length) : 0;
    const extra = el('div', { class: 'cal-resumo-fig' }, [
      el('span', { class: 'k', text: 'Gasto médio por mês' }),
      el('span', { class: 'v', text: U.fmtBRL(media) }),
      el('span', { class: 's', text: maior ? 'maior em ' + U.MONTHS[U.ymParts(maior.ym).m].toLowerCase() : 'sem despesas no ano' })
    ]);
    pintaResumo(doAno, 'do ano', extra);

    barrasDoAno(dados, hojeYM);

    const box = U.clear(document.getElementById('calAno'));
    dados.forEach((m) => box.appendChild(painelDoMes(m, hojeYM)));
  }

  function barrasDoAno(dados, hojeYM) {
    const box = U.clear(document.getElementById('calAnoBarras'));
    /* A barra tem a altura de TUDO o que está lançado; a parte cheia
       é o que já foi pago ou recebido, e o resto fica vazado. Assim
       os meses futuros continuam mostrando o que vem — só não se
       passam por dinheiro que já se moveu. */
    const recTotal = (m) => m.t.receitas + m.t.previstoReceitas;
    const desTotal = (m) => m.t.despesas + m.t.previstoDespesas;
    const teto = Math.max(1, ...dados.map((m) => Math.max(recTotal(m), desTotal(m))));
    const barra = (classe, total, pago) => {
      const h = (total / teto) * 100;
      return el('i', {
        class: classe + (total > pago + 0.005 ? ' tem-previsto' : ''),
        style: { height: Math.max(total > 0 ? 3 : 0, h) + '%', '--pago': (total > 0 ? (pago / total) * 100 : 0) + '%' }
      });
    };

    dados.forEach((m) => {
      const p = U.ymParts(m.ym);
      box.appendChild(el('button', {
        type: 'button',
        class: 'cal-barra' + (m.ym === App.ym ? ' is-sel' : '') + (m.ym === hojeYM ? ' is-hoje' : ''),
        'aria-label': `${U.MONTHS[p.m]}: recebido ${U.fmtBRL(m.t.receitas)}, pago ${U.fmtBRL(m.t.despesas)}`
          + (m.t.qtdPrevistos ? `, previsto ${U.fmtBRL(m.t.previstoDespesas)} a pagar e ${U.fmtBRL(m.t.previstoReceitas)} a receber` : ''),
        onclick: () => abreMes(m.ym)
      }, [
        el('span', { class: 'cal-barra-valor', text: m.t.despesas > 0 ? U.fmtCompact(m.t.despesas) : '' }),
        el('span', { class: 'cal-barra-par' }, [
          barra('is-in', recTotal(m), m.t.receitas),
          barra('is-out', desTotal(m), m.t.despesas)
        ]),
        el('span', { class: 'cal-barra-mes', text: U.MONTHS_SHORT[p.m] })
      ]));
    });
  }

  function abreMes(ym) {
    App.calVista = 'mes';
    guardaVista('mes');
    App.setYM(ym);
    global.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function painelDoMes(m, hojeYM) {
    const p = U.ymParts(m.ym);
    const t = m.t;
    const maior = Math.max(t.receitas, t.despesas, 1);
    const itens = m.entradas.slice().sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : b.amount - a.amount));
    const passado = m.ym < hojeYM;

    return el('article', {
      class: 'cal-mes' + (m.ym === hojeYM ? ' is-hoje' : '') + (m.ym === App.ym ? ' is-sel' : '')
        + (itens.length ? '' : ' is-vazio')
    }, [
      el('header', { class: 'cal-mes-topo' }, [
        el('h3', { text: U.MONTHS[p.m] }),
        m.ym === hojeYM ? el('span', { class: 'cal-mes-selo', text: 'agora' })
          : passado ? null : el('span', { class: 'cal-mes-selo is-futuro', text: 'previsto' }),
        el('button', {
          type: 'button', class: 'btn btn-ghost btn-sm cal-mes-abrir',
          'aria-label': 'Abrir a grade de ' + U.MONTHS[p.m], onclick: () => abreMes(m.ym)
        }, [document.createTextNode('Abrir'), Icons.lucide('chevron-right', 14)])
      ].filter(Boolean)),

      el('div', { class: 'cal-mes-somas' }, [
        el('div', {}, [el('span', { class: 'k', text: 'Recebido' }), el('span', { class: 'v val-pos', text: U.fmtBRL(t.receitas) })]),
        el('div', {}, [el('span', { class: 'k', text: 'Pago' }), el('span', { class: 'v val-neg', text: U.fmtBRL(t.despesas) })]),
        el('div', {}, [el('span', { class: 'k', text: 'Saldo' }), el('span', {
          class: 'v' + (t.saldo < 0 ? ' val-neg' : ''), text: (t.saldo < 0 ? '− ' : '') + U.fmtBRL(Math.abs(t.saldo))
        })])
      ]),
      el('div', { class: 'cal-mes-medidor', 'aria-hidden': 'true' }, [
        el('i', { class: 'is-in', style: { width: (t.receitas / maior) * 100 + '%' } }),
        el('i', { class: 'is-out', style: { width: (t.despesas / maior) * 100 + '%' } })
      ]),

      itens.length
        ? el('ul', { class: 'cal-mes-lista' }, itens.map((e) => el('li', {
          class: 'cal-mes-item' + (e.confirmed ? '' : ' is-pending'),
          title: e.description
        }, [
          el('span', { class: 'cal-mes-dia', text: e.date.slice(8, 10) }),
          el('span', { class: 'cal-mes-nome' }, [
            el('span', { class: 't', text: e.description }),
            e.recurring ? el('span', { class: 'cal-mini-tag', text: 'fixa' }) : null,
            e.installment ? el('span', { class: 'cal-mini-tag', text: `${e.installment.index}/${e.installment.total}` }) : null,
            !e.confirmed ? el('span', { class: 'cal-mini-tag is-pend', text: 'prevista' }) : null
          ].filter(Boolean)),
          el('span', {
            class: 'cal-mes-valor ' + (e.kind === 'income' ? 'val-pos' : 'val-neg'),
            text: (e.kind === 'income' ? '+' : '−') + U.fmtBRL(e.amount)
          })
        ])))
        : el('p', { class: 'cal-mes-vazio', text: passado ? 'Nada lançado neste mês.' : 'Nada previsto ainda.' }),

      /* Cada painel do ano diz quanto ainda é previsão — é o que
         separa "gastei" de "vou gastar" na hora de olhar doze meses
         de uma vez. */
      t.qtdFixas || t.qtdPrevistos
        ? el('p', { class: 'cal-mes-rodape' }, [
          t.qtdPrevistos
            ? el('span', { class: 'is-previsto', text: `Previsto: ${U.fmtBRL(t.previstoDespesas)} em ${t.qtdPrevistos} lançamento${t.qtdPrevistos > 1 ? 's' : ''}` })
            : null,
          t.qtdFixas
            ? el('span', { text: `${t.qtdFixas} fixa${t.qtdFixas > 1 ? 's' : ''} · ${U.fmtBRL(t.fixas)}` })
            : null
        ].filter(Boolean))
        : null
    ].filter(Boolean));
  }

  global.Cal = Cal;
})(window);
