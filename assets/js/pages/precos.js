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

  /* ============================================================
     EM QUE MOEDA ESTA PESSOA PAGA
     ------------------------------------------------------------
     Desde que o site existe em quatro línguas, quem chega por
     /en/precos e clica em "assinar" cai aqui. O palpite inicial vem,
     nesta ordem:

       1. ?moeda= na URL — é assim que a página pública em inglês
          traz a escolha dela junto;
       2. o que a pessoa já escolheu antes, neste aparelho;
       3. fuso e idioma do navegador (Planos.moedaSugerida).

     Palpite, não decisão: o seletor ao lado do mensal/anual troca a
     qualquer momento. E o que a tela mostra não cobra nada — quem
     cobra é o servidor, que lê o valor de plan_prices pela mesma
     tripla (plano, ciclo, moeda).
     ============================================================ */
  const GAVETA_MOEDA = 'oaze.moeda';
  let moeda = Planos.MOEDA_PADRAO;

  function moedaInicial() {
    let daUrl = '';
    try { daUrl = new URLSearchParams(location.search).get('moeda') || ''; } catch (e) { /* sem URL útil */ }
    /* Guardar o que veio da URL não é detalhe: a pessoa entrou pelo
       /en/precos, viu US$ 7.99, e daqui a dois cliques dentro do app
       a query já não existe mais. Sem guardar, ela voltaria a esta
       tela em real, sem ter pedido nada. */
    if (daUrl) { guardarMoeda(daUrl); return moeda; }
    try {
      const guardada = localStorage.getItem(GAVETA_MOEDA);
      if (guardada) return Planos.moedaValida(guardada);
    } catch (e) { /* aparelho sem armazenamento: segue o palpite */ }
    return Planos.moedaSugerida();
  }

  function guardarMoeda(nova) {
    moeda = Planos.moedaValida(nova);
    try { localStorage.setItem(GAVETA_MOEDA, moeda); } catch (e) { /* palpite por sessão, e tudo bem */ }
  }

  Precos.render = function () {
    moeda = moedaInicial();
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
    seletorDeMoeda();
    seloDoAnual();
  }

  /* O selo do botão "Anual" vinha fixo no HTML: "2 meses grátis". Isso
     é o desconto do real (16%) — em dólar e em euro o anual desconta
     27%, quase três meses e meio. Um selo que promete menos do que
     entrega ainda é um selo errado, e um que promete mais é pior.
     Daqui em diante ele é calculado, arredondado para baixo e pelo
     MENOR desconto entre os planos, porque o botão é um só. */
  function seloDoAnual() {
    const selo = document.querySelector('.ciclo-btn[data-ciclo="annual"] .ciclo-selo');
    if (!selo) return;
    const descontos = Planos.LISTA
      .filter((p) => Planos.preco(p, 'monthly', moeda) > 0)
      .map((p) => Planos.economiaAnual(p, moeda) / (Planos.preco(p, 'monthly', moeda) * 12));
    if (!descontos.length) { selo.hidden = true; return; }
    selo.hidden = false;
    selo.textContent = '−' + Math.floor(Math.min.apply(null, descontos) * 100) + '%';
  }

  /* O seletor nasce em JS, ao lado do mensal/anual: assim ele não
     existe em nenhuma tela que não tenha planos, e some junto com
     ela. Só aparece porque há mais de uma moeda na tabela. */
  function seletorDeMoeda() {
    const grupo = document.querySelector('.precos-ciclo');
    if (!grupo || grupo.parentNode.querySelector('.precos-moeda')) return;
    if (Planos.MOEDAS.length < 2) return;

    const select = el('select', {
      class: 'input precos-moeda-select', 'aria-label': 'Moeda da cobrança',
      onchange: () => { guardarMoeda(select.value); seloDoAnual(); cards(); }
    }, Planos.MOEDAS.map((m) => el('option', { value: m.id, text: m.rotulo })));
    select.value = moeda;

    grupo.parentNode.insertBefore(
      el('div', { class: 'precos-moeda' }, [
        el('span', { class: 'precos-moeda-rotulo', text: 'Pagar em' }), select
      ]),
      grupo.nextSibling
    );
  }

  /* ---------------- os três cartões ---------------- */

  function cards() {
    const box = U.clear(document.getElementById('precosCards'));
    if (!box) return;

    const atual = global.Limites ? Limites.plano() : 'free';
    const logado = !!(global.Sync && Sync.currentUser());

    Planos.LISTA.forEach((p) => {
      const centavos = Planos.preco(p, ciclo, moeda);
      const eAtual = p.id === atual && logado;

      const preco = el('div', { class: 'plano-preco' });
      if (centavos === 0) {
        preco.appendChild(el('span', { class: 'plano-valor', text: Planos.gratis(moeda) }));
        preco.appendChild(el('span', { class: 'plano-periodo', text: 'para sempre' }));
      } else if (ciclo === 'annual') {
        /* No anual, o número grande é o mensal equivalente: é ele
           que a pessoa compara com o plano mensal. O valor cobrado
           vem logo abaixo, sem letra miúda. */
        preco.appendChild(el('span', { class: 'plano-valor', text: Planos.moeda(Planos.mensalEquivalente(p, moeda), moeda) }));
        preco.appendChild(el('span', { class: 'plano-periodo', text: 'por mês' }));
        preco.appendChild(el('p', { class: 'plano-cobranca', text: Planos.moeda(centavos, moeda) + ' cobrados uma vez por ano' }));
        const eco = Planos.economiaAnual(p, moeda);
        if (eco > 0) {
          preco.appendChild(el('p', { class: 'plano-economia', text: 'Economia de ' + Planos.moeda(eco, moeda) + ' por ano' }));
        }
      } else {
        preco.appendChild(el('span', { class: 'plano-valor', text: Planos.moeda(centavos, moeda) }));
        preco.appendChild(el('span', { class: 'plano-periodo', text: 'por mês' }));
      }

      const botao = el('button', {
        class: 'btn ' + (eAtual ? 'btn-outline' : p.destaque ? 'btn-primary' : 'btn-outline'),
        type: 'button',
        text: eAtual ? 'Seu plano atual'
          : p.id === 'free' ? 'Começar grátis' : 'Assinar o ' + p.nome,
        onclick: eAtual ? null : () => Precos.escolher(p)
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
      nota.textContent = 'Lançamentos manuais, sincronização entre aparelhos e o painel completo estão em todos '
        + 'os planos, inclusive no Semente. Colaboração e relatórios personalizados ainda não existem no produto '
        + 'e por isso não aparecem aqui.';
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

  Precos.escolher = function (plano) {
    if (plano.id === 'free') {
      if (global.Sync && Sync.currentUser()) {
        UI.toast('Você já tem uma conta. O Semente é o plano padrão.', 'success');
      } else {
        Sync.signIn();
      }
      return;
    }

    const u = global.Sync && Sync.currentUser();
    if (!u) {
      UI.toast('Entre na sua conta para assinar.', 'info');
      Sync.signIn();
      return;
    }

    /* Troca de plano pago exige cancelar antes — o servidor recusa
       de qualquer jeito; aqui só se explica antes de abrir o Checkout. */
    const d = Limites.direitos();
    if (d.plano !== 'free' && !d.cancelaNoFim) {
      UI.openModal({
        title: 'Você já assina o ' + Planos.get(d.plano).nome,
        body: el('p', { style: { fontSize: '13.5px', lineHeight: '1.65' },
          text: 'Para trocar de plano, cancele a assinatura atual em Configurações. Você continua com ela até o fim do período pago e pode assinar o ' + plano.nome + ' em seguida.' }),
        buttons: [
          { label: 'Fechar', class: 'btn-outline', onClick: UI.closeModal },
          { label: 'Abrir Configurações', class: 'btn-primary', onClick: () => { UI.closeModal(); App.goTo('settings'); } }
        ]
      });
      return;
    }

    const centavos = Planos.preco(plano, ciclo, moeda);
    const valor = Planos.moeda(centavos, moeda) + (ciclo === 'annual' ? ' por ano' : ' por mês');
    const aviso = el('p', { class: 'hint', role: 'status', style: { minHeight: '18px' } });
    const diz = (t, erro) => { aviso.textContent = t || ''; aviso.style.color = erro ? 'var(--critical)' : ''; };

    /* ============================================================
       CUPOM DE DESCONTO
       ------------------------------------------------------------
       Fechado por padrão: um campo de cupom aberto para todo mundo
       ensina quem não tem um a sair da página para procurar. Quem tem,
       toca em "Tenho um cupom". O servidor pergunta à Stripe se o
       código vale e devolve o preço com desconto; o preço cheio fica
       riscado ao lado, para ninguém ter dúvida do que vai pagar.
       ============================================================ */
    let cupomAplicado = null;
    const precoTexto = el('strong', { text: valor });
    const precoAntigo = el('s', { class: 'cupom-antigo', hidden: true });
    const campoCupom = el('input', {
      class: 'input', type: 'text', maxlength: '40', autocomplete: 'off',
      autocapitalize: 'characters', spellcheck: 'false', placeholder: 'Código do cupom',
      'aria-label': 'Código do cupom de desconto'
    });
    const avisoCupom = el('p', { class: 'hint', role: 'status' });
    const botaoAplicar = el('button', { class: 'btn btn-outline btn-sm', type: 'button', text: 'Aplicar' });
    const caixaCupom = el('div', { class: 'cupom-caixa', hidden: true }, [
      el('div', { class: 'cupom-linha' }, [campoCupom, botaoAplicar]), avisoCupom
    ]);
    const abrirCupom = el('button', {
      class: 'link-btn cupom-abrir', type: 'button', text: 'Tenho um cupom de desconto',
      onclick: () => { abrirCupom.hidden = true; caixaCupom.hidden = false; campoCupom.focus(); }
    });

    function tirarCupom() {
      cupomAplicado = null;
      precoTexto.textContent = valor;
      precoAntigo.hidden = true;
      botaoAplicar.textContent = 'Aplicar';
      campoCupom.disabled = false;
    }

    async function aplicarCupom() {
      if (cupomAplicado) { tirarCupom(); avisoCupom.textContent = 'Cupom removido.'; campoCupom.focus(); return; }
      const codigo = campoCupom.value.trim().toUpperCase();
      avisoCupom.style.color = '';
      if (!/^[A-Z0-9_-]{3,40}$/.test(codigo)) {
        avisoCupom.textContent = 'Digite o código como recebeu, sem espaços.';
        avisoCupom.style.color = 'var(--critical)';
        return;
      }
      botaoAplicar.disabled = true;
      avisoCupom.textContent = 'Conferindo o cupom…';
      try {
        const r = await Conta.chamarFuncao('oaze-pagamento', { acao: 'cupom', plano: plano.id, ciclo, moeda, codigo });
        if (r.ok === true && Number.isInteger(r.centavosPrimeira)) {
          cupomAplicado = r.codigo || codigo;
          campoCupom.value = cupomAplicado;
          campoCupom.disabled = true;
          botaoAplicar.textContent = 'Remover';
          precoAntigo.textContent = valor;
          precoAntigo.hidden = false;
          precoTexto.textContent = Planos.moeda(r.centavosPrimeira, moeda) + (ciclo === 'annual' ? ' no primeiro ano' : ' no primeiro mês');
          avisoCupom.textContent = '✓ ' + cupomAplicado + ': ' + (r.descricao || 'desconto aplicado') + '.';
          avisoCupom.style.color = 'var(--good-text)';
        } else {
          avisoCupom.textContent = r.mensagem || 'Esse cupom não existe ou não vale mais.';
          avisoCupom.style.color = 'var(--critical)';
        }
      } catch (e) {
        avisoCupom.textContent = 'Não foi possível conferir o cupom agora.';
        avisoCupom.style.color = 'var(--critical)';
      }
      botaoAplicar.disabled = false;
    }
    botaoAplicar.addEventListener('click', aplicarCupom);
    campoCupom.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') { ev.preventDefault(); aplicarCupom(); }
    });

    let enviando = false;
    UI.openModal({
      title: 'Assinar o ' + plano.nome,
      noAutofocus: true,
      body: el('div', { style: { fontSize: '13.5px', lineHeight: '1.65' } }, [
        el('p', {}, [
          precoTexto, document.createTextNode(' '), precoAntigo,
          el('span', { text: ', no cartão de crédito. Renova sozinho; cancele quando quiser em Configurações.' })
        ]),
        abrirCupom,
        caixaCupom,
        el('p', { class: 'hint', style: { marginTop: '8px' },
          text: 'Você informa os dados de pagamento na página segura da Stripe. Número do cartão e código de segurança não passam pelo OAZE.' }),
        /* Quem paga em dólar ou euro com cartão brasileiro vê no
           extrato um valor maior que o anunciado — IOF e spread do
           banco. Dizer isso antes é mais barato que explicar depois. */
        moeda === 'BRL' ? null : el('p', { class: 'hint', style: { marginTop: '4px' },
          text: 'Cobrança internacional: seu banco pode somar imposto e taxa de câmbio ao valor acima.' }),
        aviso
      ]),
      buttons: [
        { label: 'Cancelar', class: 'btn-outline', onClick: UI.closeModal },
        {
          label: 'Continuar para o pagamento', class: 'btn-primary',
          onClick: async () => {
            if (enviando) return;
            enviando = true;
            diz('Preparando o pagamento…');
            try {
              const pedido = { acao: 'assinar', plano: plano.id, ciclo, moeda };
              if (cupomAplicado) pedido.cupom = cupomAplicado;
              const r = await Conta.chamarFuncao('oaze-pagamento', pedido);
              if (r.ok === true && /^https:\/\/checkout\.stripe\.com\//.test(r.url || '')) {
                diz('Abrindo o pagamento seguro…');
                location.assign(r.url);
                return;
              }
              diz(r.mensagem || 'Não foi possível abrir o pagamento agora. Nada foi cobrado.', true);
            } catch (e) {
              diz('Falha ao falar com o servidor. Nada foi cobrado.', true);
            }
            enviando = false;
          }
        }
      ]
    });
  };

  global.Precos = Precos;
})(window);
