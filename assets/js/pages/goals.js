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
      el('svg', { viewBox: '0 0 44 44', width: '52', height: '52' }, [
        el('circle', { cx: '22', cy: '22', r: '19', class: 'ring-bg' }),
        el('circle', {
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
          el('h3', { class: 'goal-name', text: g.name }),
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

      el('div', { class: 'goal-actions' }, [
        el('button', { class: 'btn btn-primary btn-sm', text: '+ Guardar', onclick: () => depositar(g) }),
        el('button', { class: 'btn btn-ghost btn-sm', text: 'Editar', onclick: () => Goals.open(g.id) }),
        el('button', {
          class: 'icon-btn danger', title: 'Excluir meta', 'aria-label': 'Excluir ' + g.name,
          onclick: async () => {
            const ok = await UI.confirm({
              title: 'Excluir meta',
              message: `Excluir <strong>${U.escape(g.name)}</strong>? O valor guardado deixa de ser acompanhado, mas nenhum lançamento é apagado.`,
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

  function depositar(g) {
    const campo = el('input', { class: 'input', type: 'text', inputmode: 'decimal', placeholder: '0,00' });
    const falta = U.round2(Math.max(0, g.target - g.saved));
    UI.openModal({
      title: 'Guardar em "' + g.name + '"',
      body: el('div', { class: 'field' }, [
        el('span', { class: 'field-label', text: 'Valor a guardar (R$)' }),
        campo,
        el('p', { class: 'hint', text: falta > 0 ? `Faltam ${U.fmtBRL(falta)} para o alvo.` : 'A meta já atingiu o alvo.' }),
        el('p', { class: 'hint', text: 'Isto marca o dinheiro como reservado. Não cria despesa nem muda o saldo das suas contas.' })
      ]),
      buttons: [
        { label: 'Cancelar', class: 'btn-outline', onClick: UI.closeModal },
        {
          label: 'Guardar', class: 'btn-primary',
          onClick: () => {
            const v = U.parseMoney(campo.value) || 0;
            if (v <= 0) { UI.toast('Informe um valor maior que zero.', 'error'); return; }
            Store.goals.deposit(g.id, v);
            UI.toast('Guardado ' + U.fmtBRL(v) + '.', 'success');
            UI.closeModal();
          }
        }
      ]
    });
  }

  Goals.open = function (id) {
    const g = id ? Store.goals.get(id) : null;

    const nome = el('input', { class: 'input', type: 'text', maxlength: '60', value: g ? g.name : '', placeholder: 'Ex.: Reserva de emergência' });
    const alvo = el('input', { class: 'input', type: 'text', inputmode: 'decimal', value: g ? U.fmtNum(g.target) : '' });
    const guardado = el('input', { class: 'input', type: 'text', inputmode: 'decimal', value: g ? U.fmtNum(g.saved) : '0,00' });
    const prazo = el('input', { class: 'input', type: 'date', value: g && g.deadline ? g.deadline : '' });
    const cor = UI.colorPicker(g ? g.color : Store.PALETTE[0]);

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
            const dados = {
              name: n, target: t,
              saved: U.parseMoney(guardado.value) || 0,
              deadline: U.isValidISO(prazo.value) ? prazo.value : null,
              color: cor.getValue(), icon: iconeAtual
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
