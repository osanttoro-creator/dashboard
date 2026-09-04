/* =============================================================
   pages/precos.js — a página de planos
   ------------------------------------------------------------
   Todo número aqui vem de Planos. Nenhum preço é digitado nesta
   tela: se estivesse, um dia a página diria 14,90 e a cobrança
   diria outra coisa.

   O QUE ESTA PÁGINA NÃO FAZ
   Preço riscado que nunca existiu, contador regressivo, "últimas
   vagas". Nada disso — a economia do plano anual é calculada da
   diferença real entre doze mensais e um anual, e se um dia essa
   diferença for zero, a página deixa de anunciá-la sozinha.

   E não lista recurso que o produto ainda não faz. Colaboração,
   relatórios personalizados e exportação em PDF existem como
   direito no banco, prontos para quando forem construídos, mas
   prometer hoje o que só existe depois é vender o que não se tem.
   ============================================================= */
(function (global) {
  'use strict';

  const Precos = {};
  const el = U.el;

  let ciclo = 'monthly';

  Precos.render = function () {
    wire();
    cards();
    tabela();
    faq();
  };

  /* ---------------- alternância mensal/anual ---------------- */

  function wire() {
    U.$$('.ciclo-btn').forEach((b) => {
      if (b.dataset.ligado) return;
      b.dataset.ligado = '1';
      b.addEventListener('click', () => {
        ciclo = b.dataset.ciclo;
        U.$$('.ciclo-btn').forEach((x) => {
          const ativo = x.dataset.ciclo === ciclo;
          x.classList.toggle('is-active', ativo);
          x.setAttribute('aria-pressed', ativo ? 'true' : 'false');
        });
        cards();
      });
    });
  }

  /* ---------------- os três cartões ---------------- */

  function cards() {
    const box = U.clear(document.getElementById('precosCards'));
    if (!box) return;

    const atual = global.Limites ? Limites.plano() : 'free';
    const logado = !!(global.Sync && Sync.currentUser());

    Planos.LISTA.forEach((p) => {
      const centavos = Planos.preco(p, ciclo);
      const eAtual = p.id === atual && logado;

      const preco = el('div', { class: 'plano-preco' });
      if (centavos === 0) {
        preco.appendChild(el('span', { class: 'plano-valor', text: 'R$ 0' }));
        preco.appendChild(el('span', { class: 'plano-periodo', text: 'para sempre' }));
      } else if (ciclo === 'annual') {
        /* No anual, o número grande é o mensal equivalente: é ele
           que a pessoa compara com o plano mensal. O valor cobrado
           vem logo abaixo, sem letra miúda. */
        preco.appendChild(el('span', { class: 'plano-valor', text: Planos.moeda(Planos.mensalEquivalente(p)) }));
        preco.appendChild(el('span', { class: 'plano-periodo', text: 'por mês' }));
        preco.appendChild(el('p', { class: 'plano-cobranca', text: Planos.moeda(centavos) + ' cobrados uma vez por ano' }));
        const eco = Planos.economiaAnual(p);
        if (eco > 0) {
          preco.appendChild(el('p', { class: 'plano-economia', text: 'Economia de ' + Planos.moeda(eco) + ' por ano' }));
        }
      } else {
        preco.appendChild(el('span', { class: 'plano-valor', text: Planos.moeda(centavos) }));
        preco.appendChild(el('span', { class: 'plano-periodo', text: 'por mês' }));
      }

      const botao = el('button', {
        class: 'btn ' + (eAtual ? 'btn-outline' : p.destaque ? 'btn-primary' : 'btn-outline'),
        type: 'button',
        disabled: eAtual ? '' : null,
        text: eAtual ? 'Seu plano atual'
          : p.id === 'free' ? 'Começar grátis' : 'Assinar ' + p.nome,
        onclick: () => Precos.escolher(p, ciclo)
      });
      if (eAtual) botao.disabled = true;

      box.appendChild(el('article', {
        class: 'card plano-card' + (p.destaque ? ' is-destaque' : '') + (eAtual ? ' is-atual' : ''),
        'aria-labelledby': 'plano-' + p.id
      }, [
        p.destaque ? el('span', { class: 'plano-selo', text: 'Mais escolhido' }) : null,
        eAtual ? el('span', { class: 'plano-selo is-atual', text: 'Plano atual' }) : null,
        el('h3', { class: 'plano-nome', id: 'plano-' + p.id, text: p.nome }),
        el('p', { class: 'plano-desc', text: p.descricao }),
        preco,
        botao,
        el('ul', { class: 'plano-itens' },
          (Planos.DESTAQUES[p.id] || []).map((t) => el('li', {}, [
            el('span', { class: 'plano-check', 'aria-hidden': 'true' }, Icons.lucide('check', 14)),
            el('span', { text: t })
          ])))
      ].filter(Boolean)));
    });
  }

  /* ---------------- comparativo ---------------- */

  function celula(p, linha) {
    if (linha.tipo === 'fixo') return linha.valor;
    if (linha.tipo === 'recurso') return p.recursos[linha.chave] ? 'sim' : 'não';
    const v = p.limites[linha.chave];
    if (linha.tipo === 'meses') {
      return v === null ? 'Completo' : v + ' meses';
    }
    return Planos.textoLimite(v);
  }

  function tabela() {
    const t = U.clear(document.getElementById('precosTabela'));
    if (!t) return;

    t.appendChild(el('thead', {}, el('tr', {}, [
      el('th', { scope: 'col', text: 'Recurso' })
    ].concat(Planos.LISTA.map((p) => el('th', { scope: 'col', text: p.nome }))))));

    const tb = el('tbody', {});
    Planos.COMPARATIVO.forEach((linha) => {
      tb.appendChild(el('tr', {}, [
        el('th', { scope: 'row', text: linha.rotulo })
      ].concat(Planos.LISTA.map((p) => {
        const v = celula(p, linha);
        const negativo = v === 'não';
        return el('td', { class: negativo ? 'is-nao' : '' },
          negativo
            ? el('span', { 'aria-label': 'não incluído' }, '—')
            : el('span', { text: v === 'sim' ? '✓' : v, 'aria-label': v === 'sim' ? 'incluído' : null }));
      }))));
    });
    t.appendChild(tb);

    const nota = document.getElementById('precosNota');
    if (nota) {
      nota.textContent = 'Backup em JSON, lançamentos manuais e o painel completo estão em todos os planos, '
        + 'inclusive no Grátis. Colaboração, relatórios personalizados e exportação em PDF ainda não existem '
        + 'no produto e por isso não aparecem aqui.';
    }
  }

  /* ---------------- FAQ ---------------- */

  function faq() {
    const box = U.clear(document.getElementById('precosFaq'));
    if (!box) return;
    Planos.FAQ.forEach((f, i) => {
      const corpo = el('div', { class: 'faq-corpo', id: 'faq-c-' + i, hidden: true },
        el('p', { text: f.r }));
      const botao = el('button', {
        class: 'faq-p', type: 'button',
        'aria-expanded': 'false', 'aria-controls': 'faq-c-' + i,
        onclick: () => {
          const aberto = botao.getAttribute('aria-expanded') === 'true';
          botao.setAttribute('aria-expanded', aberto ? 'false' : 'true');
          corpo.hidden = aberto;
        }
      }, [el('span', { text: f.p }), el('span', { class: 'faq-seta', 'aria-hidden': 'true' })]);
      box.appendChild(el('div', { class: 'faq-item' }, [botao, corpo]));
    });
  }

  /* ---------------- escolher um plano ---------------- */

  Precos.escolher = function (plano, cicloEscolhido) {
    if (plano.id === 'free') {
      if (global.Sync && Sync.currentUser()) {
        UI.toast('Você já tem uma conta. O Grátis é o plano padrão.', 'success');
      } else {
        Sync.signIn();
      }
      return;
    }

    if (!(global.Sync && Sync.currentUser())) {
      UI.openModal({
        title: 'Antes de assinar',
        body: el('div', { style: { fontSize: '13.5px', lineHeight: '1.65' } },
          el('p', { text: 'Crie sua conta primeiro — é ela que vai guardar a assinatura e os seus dados.' })),
        buttons: [
          { label: 'Agora não', class: 'btn-outline', onClick: UI.closeModal },
          { label: 'Criar conta', class: 'btn-primary', onClick: () => { UI.closeModal(); Sync.signIn(); } }
        ]
      });
      return;
    }

    Checkout.iniciar(plano.id, cicloEscolhido);
  };

  global.Precos = Precos;
})(window);
