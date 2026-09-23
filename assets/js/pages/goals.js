/* =============================================================
   pages/goals.js — Metas
   ------------------------------------------------------------
   Uma meta é um alvo com dinheiro reservado. Guardar numa meta
   NÃO é despesa: é o mesmo dinheiro, com outro nome. Por isso o
   valor guardado vive na própria meta e não entra em Calc como
   lançamento — do contrário o saldo do mês afundaria sem motivo.
   ============================================================= */
(function (global) {
  'use strict';

  const el = U.el;
  const Goals = {};

  Goals.render = function () {
    const metas = Store.goals.all();
    const grid = U.clear(document.getElementById('goalGrid'));
    const nota = document.getElementById('goalsNote');

    if (!metas.length) {
      nota.textContent = '';
      grid.appendChild(el('div', { class: 'card empty-state' }, [
        el('span', { class: 'empty-ico' }, Icons.lucide('flag', 26)),
        el('p', { class: 'empty-title', text: 'Nenhuma meta ainda' }),
        el('p', { class: 'empty-sub', text: 'Uma reserva de emergência, uma viagem, a troca do carro. Defina o alvo e vá guardando.' }),
        el('button', { class: 'btn btn-primary btn-sm', text: '+ Nova meta', onclick: () => Goals.open() })
      ]));
      return;
    }

    const alvo = U.sum(metas, (g) => g.target);
    const guardado = U.sum(metas, (g) => g.saved);
    nota.innerHTML = `${U.fmtBRL(guardado)} de ${U.fmtBRL(alvo)} — <strong>${U.fmtPct(alvo > 0 ? (guardado / alvo) * 100 : 0, 0)}</strong>`;

    metas.forEach((g) => grid.appendChild(cartao(g)));
  };

  /** "R$ 1.200 saíram da Conta corrente" — ou duas contas, ou nada. */
  function origemDaReserva(g) {
    const porConta = new Map();
    (g.deposits || []).forEach((d) => {
      if (!d.accountId) return;
      porConta.set(d.accountId, U.round2((porConta.get(d.accountId) || 0) + d.amount));
    });
    if (!porConta.size) return '';
    const partes = Array.from(porConta.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([id, v]) => U.fmtBRL(v) + ' de ' + Calc.accountName(id));
    return partes.length === 1
      ? partes[0]
      : partes.slice(0, 2).join(' · ') + (partes.length > 2 ? ' · +' + (partes.length - 2) : '');
  }

  function cartao(g) {
    const pct = g.target > 0 ? Math.min(100, (g.saved / g.target) * 100) : 0;
    const falta = U.round2(Math.max(0, g.target - g.saved));
    const completa = g.saved >= g.target && g.target > 0;

    /* Quanto guardar por mês para chegar no prazo. É a informação que
       transforma "quero R$ 20 mil" em "são R$ 850 por mês". */
    let ritmo = null;
    if (g.deadline && falta > 0) {
      const meses = mesesAte(g.deadline);
      ritmo = meses > 0 ? U.round2(falta / meses) : null;
    }

    const anel = el('div', { class: 'goal-ring' + (completa ? ' is-done' : '') }, [
      U.svg('svg', { viewBox: '0 0 44 44', width: '52', height: '52', 'aria-hidden': 'true' }, [
        U.svg('circle', { cx: '22', cy: '22', r: '19', class: 'ring-bg' }),
        U.svg('circle', {
          cx: '22', cy: '22', r: '19', class: 'ring-fg',
          style: {
            stroke: g.color,
            // 2πr ≈ 119.4 — o traço desenha a fração conquistada
            strokeDasharray: '119.4',
            strokeDashoffset: String(119.4 * (1 - pct / 100))
          }
        })
      ]),
      el('span', { class: 'goal-ring-num', text: Math.round(pct) + '%' })
    ]);

    return el('article', { class: 'card goal-card' + (completa ? ' is-done' : '') }, [
      el('div', { class: 'goal-head' }, [
        el('span', {
          class: 'cat-badge',
          style: {
            width: '34px', height: '34px',
            background: 'color-mix(in srgb, ' + g.color + ' 18%, transparent)', color: g.color
          }
        }, Icons.lucide(g.icon || 'target', 17)),
        el('div', { class: 'goal-id' }, [
          el('h3', { class: 'goal-name', text: g.name, translate: 'no' }),
          el('p', { class: 'goal-sub', text: g.deadline ? 'até ' + U.fmtDateBR(g.deadline) : 'sem prazo' })
        ]),
        completa ? UI.badge('Concluída', 'ok') : null
      ].filter(Boolean)),

      el('div', { class: 'goal-body' }, [
        anel,
        el('div', { class: 'goal-figs' }, [
          el('p', { class: 'goal-saved', text: U.fmtBRL(g.saved) }),
          el('p', { class: 'muted', text: 'de ' + U.fmtBRL(g.target) }),
          falta > 0
            ? el('p', { class: 'goal-left', text: 'Faltam ' + U.fmtBRL(falta) })
            : el('p', { class: 'goal-left val-pos', text: 'Alvo alcançado' })
        ])
      ]),

      ritmo
        ? el('p', { class: 'goal-pace' }, [
          Icons.lucide('calendar-clock', 14),
          el('span', { text: `Guarde ${U.fmtBRL(ritmo)} por mês para chegar no prazo` })
        ])
        : null,

      /* De onde o dinheiro veio. Só aparece quando existe resposta:
         a meta que nunca teve conta de origem não ganha uma linha
         dizendo que não tem. */
      origemDaReserva(g)
        ? el('p', { class: 'goal-pace' }, [
          Icons.lucide('wallet', 14),
          el('span', { text: origemDaReserva(g) })
        ])
        : null,

      /* A contribuição planejada, e o CONFRONTO com o ritmo
         necessário. Mostrar só "R$ 300 todo dia 5" seria repetir o
         que a pessoa digitou; o que ela precisa saber é se esse
         valor chega lá. Quando não chega, o texto diz de quanto é a
         diferença — não "insuficiente", que informa zero. */
      g.contribution && falta > 0
        ? el('p', { class: 'goal-pace' + (ritmo && g.contribution.amount < ritmo ? ' is-curto' : '') }, [
          Icons.lucide('repeat', 14),
          el('span', {
            text: ritmo && g.contribution.amount < ritmo
              ? `Você planejou ${U.fmtBRL(g.contribution.amount)} todo dia ${g.contribution.day} — ` +
                `${U.fmtBRL(U.round2(ritmo - g.contribution.amount))} a menos do que o prazo pede`
              : `Você planejou ${U.fmtBRL(g.contribution.amount)} todo dia ${g.contribution.day}`
          })
        ])
        : null,

      el('div', { class: 'goal-actions' }, [
        el('button', { class: 'btn btn-primary btn-sm', text: '+ Guardar', onclick: () => depositar(g) }),
        el('button', { class: 'btn btn-ghost btn-sm', text: 'Editar', onclick: () => Goals.open(g.id) }),
        el('button', {
          class: 'icon-btn danger', title: 'Excluir meta', 'aria-label': 'Excluir ' + g.name,
          onclick: async () => {
            const ok = await UI.confirm({
              title: 'Excluir meta',
              message: `Excluir <strong translate="no">${U.escape(g.name)}</strong>? O valor guardado deixa de ser acompanhado, mas nenhum lançamento é apagado.`,
              confirmLabel: 'Excluir', danger: true
            });
            if (ok) { Store.goals.remove(g.id); UI.toast('Meta excluída.'); }
          }
        }, Icons.lucide('trash-2', 15))
      ])
    ].filter(Boolean));
  }

  function mesesAte(iso) {
    const hoje = U.todayISO();
    if (iso <= hoje) return 0;
    const a = new Date(hoje + 'T00:00:00'), b = new Date(iso + 'T00:00:00');
    return Math.max(1, (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth()));
  }

  /* =============================================================
     GUARDAR — e de onde o dinheiro sai
     -------------------------------------------------------------
     Guardar era só um número que subia: a reserva crescia, nenhuma
     conta baixava, e o painel passava a mostrar dinheiro que estava
     em dois lugares ao mesmo tempo. Faltava a pergunta óbvia — de
     onde ele saiu.

     Escolhida a conta, o saldo dela baixa de verdade e o aporte
     aparece no extrato. O patrimônio não muda: Calc.netWorth soma
     de volta o que está reservado, porque reservar não empobrece
     ninguém. Sem conta, continua valendo a marcação simples de
     antes, para quem guarda em papel ou em outro banco.
     ============================================================= */
  function depositar(g) {
    const prof = Store.profile();
    const campo = el('input', { class: 'input', type: 'text', inputmode: 'decimal', 'data-money': 'true', placeholder: '0,00' });
    const data = el('input', { class: 'input', type: 'date', value: U.todayISO() });
    const conta = el('select', { class: 'input' });
    UI.fillSelect(conta,
      (prof.accounts || []).filter((a) => !a.archived).map((a) => ({
        value: a.id, label: a.name + ' · ' + U.fmtBRL(Calc.accountBalance(a.id, U.todayISO()))
      })),
      g.accountId || '', 'Não tirar de nenhuma conta');

    const efeito = el('p', { class: 'hint', role: 'status' });
    function explica() {
      const v = U.parseMoney(campo.value) || 0;
      const a = prof.accounts.find((x) => x.id === conta.value);
      efeito.textContent = !a
        ? 'Sem conta escolhida, isto só marca o dinheiro como reservado: nenhum saldo muda.'
        : v > 0
          ? `Saem ${U.fmtBRL(v)} de ${a.name}. O saldo dela baixa; seu patrimônio continua o mesmo, porque o dinheiro passa a estar na reserva.`
          : `O valor sai de ${a.name} quando você confirmar.`;
    }
    campo.addEventListener('input', explica);
    conta.addEventListener('change', explica);
    explica();

    const falta = U.round2(Math.max(0, g.target - g.saved));
    UI.openModal({
      title: 'Guardar em "' + g.name + '"',
      body: el('div', { class: 'form-grid' }, [
        el('div', { class: 'field' }, [
          el('span', { class: 'field-label', text: 'Valor a guardar (R$)' }), campo,
          el('p', { class: 'hint', text: falta > 0 ? `Faltam ${U.fmtBRL(falta)} para o alvo.` : 'A meta já atingiu o alvo.' })
        ]),
        el('div', { class: 'field' }, [
          el('span', { class: 'field-label', text: 'Data' }), data
        ]),
        el('div', { class: 'field span-2' }, [
          el('span', { class: 'field-label', text: 'De onde sai o dinheiro' }), conta, efeito
        ])
      ]),
      buttons: [
        { label: 'Cancelar', class: 'btn-outline', onClick: UI.closeModal },
        {
          label: 'Guardar', class: 'btn-primary',
          onClick: () => {
            const v = U.parseMoney(campo.value) || 0;
            if (v <= 0) { UI.toast('Informe um valor maior que zero.', 'error'); return; }
            if (!U.isValidISO(data.value)) { UI.toast('Data inválida.', 'error'); return; }
            Store.goals.deposit(g.id, v, { accountId: conta.value || null, at: data.value });
            UI.toast('Guardado ' + U.fmtBRL(v) + '.', 'success');
            UI.closeModal();
          }
        }
      ]
    });
  }

  Goals.open = function (id) {
    /* Só na criação: editar o que já existe nunca é barrado —
       é isso que faz o downgrade não trancar dados que já são
       da pessoa. */
    if (!id && global.Limites && !Limites.exigirEspaco('goals')) return;

    const g = id ? Store.goals.get(id) : null;

    const nome = el('input', { class: 'input', type: 'text', maxlength: '60', value: g ? g.name : '', placeholder: 'Ex.: Reserva de emergência' });
    const alvo = el('input', { class: 'input', type: 'text', inputmode: 'decimal', 'data-money': 'true', value: g ? U.fmtNum(g.target) : '' });
    const guardado = el('input', { class: 'input', type: 'text', inputmode: 'decimal', 'data-money': 'true', value: g ? U.fmtNum(g.saved) : '0,00' });
    const prazo = el('input', { class: 'input', type: 'date', value: g && g.deadline ? g.deadline : '' });
    const cor = UI.colorPicker(g ? g.color : Store.PALETTE[0]);

    /* ============================================================
       CATEGORIA, CONTA E CONTRIBUIÇÃO — os três campos que faltavam
       ------------------------------------------------------------
       Os três são OPCIONAIS, e o placeholder diz isso em palavras.
       Um formulário de meta com seis campos obrigatórios é um
       formulário que ninguém termina, e "criar a primeira meta" é
       exatamente o momento em que se desiste com mais facilidade.

       A CONTRIBUIÇÃO NÃO VIRA LANÇAMENTO. Guardar dinheiro numa
       meta não é despesa: é o mesmo dinheiro com outro nome (ver o
       cabeçalho deste arquivo). Lançar automaticamente afundaria o
       saldo do mês por uma transferência interna. O que fica
       guardado é o PLANO — quanto e em que dia —, e é ele que
       permite dizer se o ritmo alcança o prazo.
       ============================================================ */
    const prof = Store.profile();

    const categoria = el('select', { class: 'input' });
    UI.fillSelect(categoria,
      (prof.categories || []).map((c) => ({ value: c.id, label: c.name })),
      g ? g.categoryId : '', 'Sem categoria');

    const conta = el('select', { class: 'input' });
    UI.fillSelect(conta,
      (prof.accounts || []).map((a) => ({ value: a.id, label: a.name })),
      g ? g.accountId : '', 'Nenhuma conta em especial');

    const contribValor = el('input', {
      class: 'input', type: 'text', inputmode: 'decimal', 'data-money': 'true',
      placeholder: '0,00',
      value: g && g.contribution ? U.fmtNum(g.contribution.amount) : ''
    });
    const contribDia = el('input', {
      class: 'input', type: 'number', min: '1', max: '31',
      value: g && g.contribution ? String(g.contribution.day) : '5'
    });

    const icones = ['target', 'flag', 'piggy-bank', 'plane', 'house', 'car', 'graduation-cap', 'heart-pulse', 'gift', 'shield'];
    let iconeAtual = g ? (g.icon || 'target') : 'target';
    const iconeBox = el('div', { class: 'icon-picker' });
    function pintaIcones() {
      U.clear(iconeBox);
      icones.forEach((n) => {
        iconeBox.appendChild(el('button', {
          type: 'button', class: 'icon-opt' + (n === iconeAtual ? ' is-active' : ''),
          title: n, 'aria-label': 'Ícone ' + n,
          onclick: () => { iconeAtual = n; pintaIcones(); }
        }, Icons.lucide(n, 17)));
      });
    }
    pintaIcones();

    UI.openModal({
      title: g ? 'Editar meta' : 'Nova meta',
      body: el('div', { class: 'form-grid' }, [
        el('label', { class: 'field span-2' }, [el('span', { class: 'field-label', text: 'Nome *' }), nome]),
        el('label', { class: 'field' }, [el('span', { class: 'field-label', text: 'Alvo (R$) *' }), alvo]),
        el('label', { class: 'field' }, [el('span', { class: 'field-label', text: 'Já guardado (R$)' }), guardado]),
        el('label', { class: 'field' }, [
          el('span', { class: 'field-label', text: 'Prazo' }), prazo,
          el('p', { class: 'hint', text: 'Opcional. Com prazo, o app calcula quanto guardar por mês.' })
        ]),
        el('label', { class: 'field' }, [
          el('span', { class: 'field-label', text: 'Categoria' }), categoria,
          el('p', { class: 'hint', text: 'Opcional. Serve para agrupar metas parecidas.' })
        ]),
        el('label', { class: 'field' }, [
          el('span', { class: 'field-label', text: 'Conta relacionada' }), conta,
          el('p', { class: 'hint', text: 'Opcional. Onde este dinheiro costuma ficar.' })
        ]),
        el('label', { class: 'field' }, [
          el('span', { class: 'field-label', text: 'Contribuição mensal (R$)' }), contribValor,
          el('p', { class: 'hint', text: 'Opcional. Quanto você pretende guardar por mês.' })
        ]),
        el('label', { class: 'field' }, [
          el('span', { class: 'field-label', text: 'Dia do mês' }), contribDia,
          el('p', { class: 'hint', text: 'Só o lembrete: o aporte continua sendo confirmado por você.' })
        ]),
        el('div', { class: 'field' }, [el('span', { class: 'field-label', text: 'Cor' }), cor]),
        el('div', { class: 'field span-2' }, [el('span', { class: 'field-label', text: 'Ícone' }), iconeBox])
      ]),
      buttons: [
        { label: 'Cancelar', class: 'btn-outline', onClick: UI.closeModal },
        {
          label: 'Salvar', class: 'btn-primary',
          onClick: () => {
            const n = nome.value.trim();
            const t = U.parseMoney(alvo.value) || 0;
            if (!n) { UI.toast('Informe o nome da meta.', 'error'); return; }
            if (t <= 0) { UI.toast('O alvo precisa ser maior que zero.', 'error'); return; }
            const aporte = U.parseMoney(contribValor.value) || 0;
            const dados = {
              name: n, target: t,
              saved: U.parseMoney(guardado.value) || 0,
              deadline: U.isValidISO(prazo.value) ? prazo.value : null,
              color: cor.getValue(), icon: iconeAtual,
              categoryId: categoria.value || null,
              accountId: conta.value || null,
              /* Valor zerado apaga a contribuição em vez de guardar
                 um objeto com zero: um plano de "guardar R$ 0 por
                 mês" apareceria no cartão como se fosse um plano. */
              contribution: aporte > 0
                ? { amount: aporte, day: Math.min(31, Math.max(1, parseInt(contribDia.value, 10) || 1)) }
                : null
            };
            if (g) { Store.goals.update(g.id, dados); UI.toast('Meta atualizada.', 'success'); }
            else { Store.goals.add(dados); UI.toast('Meta criada.', 'success'); }
            UI.closeModal();
          }
        }
      ]
    });
  };

  global.Goals = Goals;
})(window);
