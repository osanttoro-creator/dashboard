/* =============================================================
   onboarding.js — configuração progressiva
   ------------------------------------------------------------
   Substitui a pergunta antiga ("começar do zero ou carregar
   exemplos?") por etapas que constroem o produto de verdade. A
   diferença não é cosmética: dado de exemplo dentro da conta de
   alguém some entre os lançamentos reais e viaja na sincronização.
   Aqui, tudo que aparece no painel ao final foi a pessoa que criou.

   O PROGRESSO É SALVO A CADA ETAPA
   No Supabase quando há sessão, no localStorage quando não há —
   e o local é reenviado quando a conta aparece. Fechar a aba na
   etapa 4 e voltar amanhã continua na 4, com o que já foi digitado.

   NADA É DUPLICADO AO RECARREGAR
   Cada etapa guarda o id do que criou. Voltar a ela edita aquele
   registro em vez de criar outro — que é o que aconteceria se o
   critério fosse "existe alguma conta?".

   SÓ O OPCIONAL PODE SER PULADO
   Importar extrato e criar orçamento são conveniências. Ter uma
   conta e um lançamento não é: sem isso o painel abre vazio e a
   pessoa conclui que o produto não funciona.
   ============================================================= */
(function (global) {
  'use strict';

  const Ob = {};
  const el = U.el;
  const CHAVE_LOCAL = 'oaze.onboarding.v1';

  /* ---------------- as etapas ---------------- */

  const ETAPAS = [
    { id: 'voce', titulo: 'Sobre você', opcional: false },
    { id: 'espaco', titulo: 'Seu espaço financeiro', opcional: false },
    { id: 'conta', titulo: 'Onde está seu dinheiro', opcional: false },
    { id: 'categorias', titulo: 'Categorias', opcional: false },
    { id: 'importar', titulo: 'Importar extrato', opcional: true },
    { id: 'lancamento', titulo: 'Primeira movimentação', opcional: false },
    { id: 'planejar', titulo: 'Orçamento ou meta', opcional: true },
    { id: 'fim', titulo: 'Tudo pronto', opcional: false }
  ];

  let estado = { etapa: 'voce', dados: {} };
  let indice = 0;

  /* ---------------- persistência ---------------- */

  function lerLocal() {
    try { return JSON.parse(localStorage.getItem(CHAVE_LOCAL) || 'null'); } catch (e) { return null; }
  }
  function gravarLocal() {
    try { localStorage.setItem(CHAVE_LOCAL, JSON.stringify(estado)); } catch (e) { /* cheio */ }
  }

  function sb() {
    try {
      return (global.SupabaseBackend && SupabaseBackend.cliente && SupabaseBackend.cliente()) || null;
    } catch (e) { return null; }
  }

  /** Salva a etapa atual. Falha de rede não interrompe: o local basta. */
  Ob.salvar = async function () {
    gravarLocal();
    const c = sb();
    const u = global.Sync && Sync.currentUser();
    if (!c || !u) return;
    try {
      await c.from('onboarding_progress').upsert({
        user_id: u.uid,
        etapa: estado.etapa,
        dados: estado.dados,
        concluido_em: estado.etapa === 'fim' ? new Date().toISOString() : null
      }, { onConflict: 'user_id' });
    } catch (e) {
      console.warn('Onboarding: progresso não subiu agora, ficou salvo aqui.', e.message);
    }
  };

  /** Onde a pessoa parou. O servidor manda; o local é a rede. */
  Ob.carregar = async function () {
    const local = lerLocal();
    const c = sb();
    const u = global.Sync && Sync.currentUser();
    if (c && u) {
      try {
        const { data } = await c.from('onboarding_progress')
          .select('etapa, dados, concluido_em').eq('user_id', u.uid).maybeSingle();
        if (data) {
          if (data.concluido_em) return { concluido: true };
          estado = { etapa: data.etapa || 'voce', dados: data.dados || {} };
          gravarLocal();
          return { concluido: false };
        }
      } catch (e) { /* offline: segue com o local */ }
    }
    if (local) {
      if (local.concluido) return { concluido: true };
      estado = local;
    }
    return { concluido: !!(local && local.concluido) };
  };

  /* ---------------- quando oferecer ---------------- */

  /**
   * Só para quem não tem nada. Um painel com dados não precisa de
   * tour, e insistir com quem já usa é a forma mais rápida de virar
   * ruído.
   */
  Ob.deveOferecer = async function () {
    const p = Store.profile();
    if (!p) return false;
    if ((p.transactions || []).length) return false;
    if ((p.accounts || []).length > 1 || (p.cards || []).length) return false;
    const r = await Ob.carregar();
    return !r.concluido;
  };

  Ob.iniciar = function () {
    indice = Math.max(0, ETAPAS.findIndex((e) => e.id === estado.etapa));
    if (indice < 0) indice = 0;
    desenhar();
  };

  Ob.reabrir = function () {
    /* Reabrir manualmente ignora a conclusão: é escolha da pessoa,
       não estado do sistema. */
    indice = 0;
    estado.etapa = 'voce';
    desenhar();
  };

  /* ---------------- navegação ---------------- */

  function irPara(i) {
    indice = Math.min(ETAPAS.length - 1, Math.max(0, i));
    estado.etapa = ETAPAS[indice].id;
    Ob.salvar();
    desenhar();
  }

  const proxima = () => irPara(indice + 1);
  const anterior = () => irPara(indice - 1);

  /* ---------------- desenho ---------------- */

  function barra() {
    const total = ETAPAS.length - 1;   // "fim" não é trabalho
    const pct = Math.round((indice / total) * 100);
    return el('div', { class: 'ob-progresso' }, [
      el('div', {
        class: 'ob-barra', role: 'progressbar',
        'aria-valuenow': String(indice), 'aria-valuemin': '0', 'aria-valuemax': String(total),
        'aria-label': 'Etapa ' + (indice + 1) + ' de ' + (total + 1)
      }, el('i', { style: { width: pct + '%' } })),
      el('p', { class: 'ob-passo', text: 'Etapa ' + Math.min(indice + 1, total) + ' de ' + total })
    ]);
  }

  function campo(rotulo, entrada, dica) {
    const id = 'ob-' + Math.random().toString(36).slice(2, 8);
    entrada.id = id;
    return el('label', { class: 'field', for: id }, [
      el('span', { class: 'field-label', text: rotulo }),
      entrada,
      dica ? el('p', { class: 'hint', text: dica }) : null
    ].filter(Boolean));
  }

  function desenhar() {
    const etapa = ETAPAS[indice];
    const corpo = el('div', { class: 'ob-corpo' });
    const montar = TELAS[etapa.id];
    const acoes = montar(corpo);

    const botoes = [];
    if (indice > 0 && etapa.id !== 'fim') {
      botoes.push({ label: 'Voltar', class: 'btn-outline', onClick: anterior });
    }
    if (etapa.opcional) {
      botoes.push({ label: 'Pular', class: 'btn-ghost', onClick: proxima });
    }
    (acoes || []).forEach((a) => botoes.push(a));

    UI.openModal({
      title: etapa.titulo,
      wide: etapa.id === 'categorias' || etapa.id === 'importar',
      body: el('div', {}, [etapa.id === 'fim' ? null : barra(), corpo].filter(Boolean)),
      buttons: botoes,
      noAutofocus: false
    });
  }

  /* ---------------- as telas ---------------- */

  const TELAS = {

    /* --- 1 · quem é a pessoa --- */
    voce(box) {
      const d = estado.dados;
      const nome = el('input', { class: 'input', type: 'text', maxlength: '40', value: d.nome || Store.ownerName() || '', placeholder: 'como quer ser chamado' });
      const moeda = el('select', { class: 'input' });
      const pais = el('select', { class: 'input' });

      UI.fillSelect(moeda, [
        { value: 'BRL', label: 'Real (R$)' },
        { value: 'USD', label: 'Dólar (US$)' },
        { value: 'EUR', label: 'Euro (€)' }
      ], d.moeda || 'BRL');
      UI.fillSelect(pais, [
        { value: 'BR', label: 'Brasil' },
        { value: 'PT', label: 'Portugal' },
        { value: 'US', label: 'Estados Unidos' },
        { value: 'OUTRO', label: 'Outro' }
      ], d.pais || 'BR');

      box.appendChild(el('p', { class: 'ob-texto', text: 'Vamos configurar o essencial. São poucos minutos, e você pode sair e continuar depois de onde parou.' }));
      box.appendChild(campo('Nome', nome, 'Aparece na saudação do painel.'));
      box.appendChild(el('div', { class: 'ob-dupla' }, [
        campo('Moeda', moeda),
        campo('País', pais)
      ]));
      /* O fuso vem do próprio navegador: perguntar seria pedir que a
         pessoa soubesse algo que o sistema já sabe. */
      const fuso = (Intl.DateTimeFormat().resolvedOptions().timeZone) || 'America/Sao_Paulo';
      box.appendChild(el('p', { class: 'hint', text: 'Fuso detectado: ' + fuso }));

      setTimeout(() => nome.focus(), 60);

      return [{
        label: 'Continuar', class: 'btn-primary',
        onClick: async () => {
          d.nome = nome.value.trim();
          d.moeda = moeda.value; d.pais = pais.value; d.fuso = fuso;
          if (d.nome) Store.setOwnerName(d.nome);
          await Ob.gravarPerfil(d);
          proxima();
        }
      }];
    },

    /* --- 2 · o espaço --- */
    espaco(box) {
      const d = estado.dados;
      const atual = Store.profile();
      const nome = el('input', {
        class: 'input', type: 'text', maxlength: '40',
        value: d.espacoNome || (atual && atual.name) || 'Pessoal'
      });

      box.appendChild(el('p', { class: 'ob-texto', text: 'Um espaço financeiro guarda contas, cartões e lançamentos separados dos demais. A maioria das pessoas usa só um.' }));
      box.appendChild(campo('Nome do espaço', nome, 'Exemplos: Pessoal, Casa, Empresa. Dá para criar outros depois.'));

      return [{
        label: 'Continuar', class: 'btn-primary',
        onClick: () => {
          d.espacoNome = nome.value.trim() || 'Pessoal';
          /* Renomeia o espaço que já existe em vez de criar outro —
             recarregar a página não pode gerar "Pessoal (2)". */
          if (atual && atual.name !== d.espacoNome) Store.renameProfile(atual.id, d.espacoNome);
          proxima();
        }
      }];
    },

    /* --- 3 · a primeira conta --- */
    conta(box) {
      const d = estado.dados;
      const nome = el('input', { class: 'input', type: 'text', maxlength: '40', value: d.contaNome || '', placeholder: 'Ex.: Conta corrente' });
      const banco = el('input', { class: 'input', type: 'text', maxlength: '40', value: d.contaBanco || '', placeholder: 'Ex.: Itaú' });
      const saldo = el('input', { class: 'input', type: 'text', inputmode: 'decimal', value: d.contaSaldo || '', placeholder: '0,00' });

      box.appendChild(el('p', { class: 'ob-texto', text: 'Cadastre onde seu dinheiro está hoje. O saldo que você informar é o ponto de partida — tudo que entrar e sair depois é contado a partir dele.' }));
      box.appendChild(campo('Nome da conta', nome));
      box.appendChild(el('div', { class: 'ob-dupla' }, [
        campo('Banco', banco),
        campo('Saldo hoje (R$)', saldo)
      ]));
      box.appendChild(el('p', { class: 'hint', text: 'Cartões de crédito você cadastra depois, em Contas e cartões.' }));

      setTimeout(() => nome.focus(), 60);

      return [{
        label: 'Continuar', class: 'btn-primary',
        onClick: () => {
          const n = nome.value.trim();
          if (!n) { UI.toast('Dê um nome para a conta.', 'error'); nome.focus(); return; }
          d.contaNome = n; d.contaBanco = banco.value.trim(); d.contaSaldo = saldo.value;

          const dados = {
            name: n, bank: d.contaBanco, type: 'Conta corrente',
            openingBalance: U.parseMoney(saldo.value) || 0,
            openedAt: U.todayISO()
          };
          /* Guardamos o id: voltar a esta etapa edita a mesma conta.
             E se ainda não há id, aproveitamos a conta padrão que o
             app cria sozinho — senão a pessoa terminaria a
             configuração com uma conta fantasma que nunca pediu. */
          if (!d.contaId) {
            const contas = Store.accounts.list();
            const usadas = new Set(Store.transactions.list().map((t) => t.accountId));
            const virgem = contas.length === 1 && !usadas.has(contas[0].id) ? contas[0] : null;
            if (virgem) d.contaId = virgem.id;
          }
          if (d.contaId && Store.accounts.get(d.contaId)) {
            Store.accounts.update(d.contaId, dados);
          } else {
            const criada = Store.accounts.add(dados);
            d.contaId = criada.id;
          }
          proxima();
        }
      }];
    },

    /* --- 4 · categorias --- */
    categorias(box) {
      const p = Store.profile();
      const desp = p.categories.filter((c) => c.kind === 'expense');
      const rec = p.categories.filter((c) => c.kind === 'income');

      box.appendChild(el('p', { class: 'ob-texto', text: 'Estas categorias já vêm prontas. Remova as que não fazem sentido para você — dá para criar outras a qualquer momento.' }));

      function lista(titulo, itens) {
        const grade = el('div', { class: 'ob-cats' });
        itens.forEach((c) => {
          const chip = el('button', {
            class: 'ob-cat', type: 'button',
            'aria-pressed': 'true',
            title: 'Remover ' + c.name,
            onclick: () => {
              /* Categoria em uso não sai: o lançamento ficaria órfão e
                 sumiria dos gráficos por categoria sem explicação.
                 Aqui isso quase nunca acontece — a lista está vazia —
                 mas a etapa pode ser reaberta depois de meses. */
              const emUso = Store.transactions.list().some((t) => t.categoryId === c.id);
              if (emUso) {
                UI.toast('Esta categoria já tem lançamentos e não pode sair.', 'error');
                return;
              }
              Store.categories.remove(c.id);
              chip.remove();
            }
          }, [
            UI.catDot(c.color),
            el('span', { text: c.name }),
            el('span', { class: 'ob-cat-x', text: '×', 'aria-hidden': 'true' })
          ]);
          grade.appendChild(chip);
        });
        return el('div', {}, [
          el('p', { class: 'ob-sub', text: titulo }),
          grade
        ]);
      }

      box.appendChild(lista('Despesas', desp));
      box.appendChild(lista('Receitas', rec));

      return [{ label: 'Continuar', class: 'btn-primary', onClick: proxima }];
    },

    /* --- 5 · importar (opcional) --- */
    importar(box) {
      box.appendChild(el('p', { class: 'ob-texto', text: 'Se você tem um extrato em CSV ou OFX, dá para trazer tudo de uma vez em vez de digitar lançamento por lançamento.' }));
      box.appendChild(el('div', { class: 'parse-info' }, el('div', {
        html: 'A importação abre em <strong>Contas e cartões → Importar extratos</strong>, ' +
          'onde você confere cada linha antes de confirmar. Nada entra sem a sua revisão.'
      })));
      box.appendChild(el('p', { class: 'hint', style: { marginTop: '10px' }, text: 'Pode pular e fazer isso depois — não muda nada no resto da configuração.' }));

      return [{
        label: 'Abrir importação', class: 'btn-primary',
        onClick: () => {
          /* Marca a etapa como vista ANTES de sair, senão voltar ao
             app perderia o lugar. */
          estado.dados.importouVisto = true;
          irPara(indice + 1);
          UI.closeModal();
          App.goTo('accounts', { tab: 'import' });
        }
      }];
    },

    /* --- 6 · o primeiro lançamento --- */
    lancamento(box) {
      const d = estado.dados;
      const p = Store.profile();
      const desc = el('input', { class: 'input', type: 'text', maxlength: '80', value: d.lancDesc || '', placeholder: 'Ex.: Salário, Aluguel, Mercado' });
      const valor = el('input', { class: 'input', type: 'text', inputmode: 'decimal', value: d.lancValor || '', placeholder: '0,00' });
      const tipo = el('select', { class: 'input' });
      const cat = el('select', { class: 'input' });

      UI.fillSelect(tipo, [
        { value: 'expense', label: 'Despesa' },
        { value: 'income', label: 'Receita' }
      ], d.lancTipo || 'expense');

      function pintaCategorias() {
        const kind = tipo.value;
        UI.fillSelect(cat, p.categories.filter((c) => c.kind === kind)
          .map((c) => ({ value: c.id, label: c.name })), d.lancCat || '');
      }
      tipo.addEventListener('change', pintaCategorias);
      pintaCategorias();

      box.appendChild(el('p', { class: 'ob-texto', text: 'Registre uma movimentação real — a última que você lembra. É ela que faz o painel sair do zero.' }));
      box.appendChild(campo('Descrição', desc));
      box.appendChild(el('div', { class: 'ob-dupla' }, [
        campo('Valor (R$)', valor),
        campo('Tipo', tipo)
      ]));
      box.appendChild(campo('Categoria', cat));

      setTimeout(() => desc.focus(), 60);

      return [{
        label: 'Registrar', class: 'btn-primary',
        onClick: () => {
          const t = desc.value.trim();
          const v = U.parseMoney(valor.value) || 0;
          if (!t) { UI.toast('Descreva a movimentação.', 'error'); desc.focus(); return; }
          if (v <= 0) { UI.toast('Informe um valor maior que zero.', 'error'); valor.focus(); return; }

          d.lancDesc = t; d.lancValor = valor.value; d.lancTipo = tipo.value; d.lancCat = cat.value;

          const dados = {
            kind: tipo.value, description: t, amount: v,
            date: U.todayISO(), categoryId: cat.value || null,
            accountId: d.contaId || (p.accounts[0] && p.accounts[0].id) || null,
            confirmed: true
          };
          if (d.lancId && p.transactions.some((x) => x.id === d.lancId)) {
            Store.transactions.update(d.lancId, dados);
          } else {
            const criado = Store.transactions.add(dados);
            d.lancId = criado.id;
          }
          proxima();
        }
      }];
    },

    /* --- 7 · planejar (opcional) --- */
    planejar(box) {
      const d = estado.dados;
      const p = Store.profile();
      const meta = el('input', { class: 'input', type: 'text', maxlength: '40', value: d.metaNome || '', placeholder: 'Ex.: Reserva de emergência' });
      const alvo = el('input', { class: 'input', type: 'text', inputmode: 'decimal', value: d.metaAlvo || '', placeholder: '0,00' });

      box.appendChild(el('p', { class: 'ob-texto', text: 'Uma meta dá direção ao dinheiro que sobra. Você pode criar uma agora ou deixar para depois.' }));
      box.appendChild(campo('Nome da meta', meta));
      box.appendChild(campo('Quanto quer juntar (R$)', alvo));
      box.appendChild(el('p', { class: 'hint', text: 'Orçamentos por categoria ficam em Orçamento, quando você já tiver alguns meses de histórico para comparar.' }));

      return [{
        label: 'Criar meta', class: 'btn-primary',
        onClick: () => {
          const n = meta.value.trim();
          const a = U.parseMoney(alvo.value) || 0;
          if (!n || a <= 0) { UI.toast('Preencha o nome e o valor, ou use "Pular".', 'error'); return; }
          d.metaNome = n; d.metaAlvo = alvo.value;
          const dados = { name: n, target: a, saved: 0, color: Store.PALETTE[0], icon: 'target' };
          if (d.metaId && Store.goals.get(d.metaId)) Store.goals.update(d.metaId, dados);
          else d.metaId = Store.goals.add(dados).id;
          proxima();
        }
      }];
    },

    /* --- 8 · fim --- */
    fim(box) {
      box.appendChild(el('div', { class: 'ob-fim' }, [
        el('span', { class: 'empty-ico' }, Icons.lucide('check', 28)),
        el('p', { class: 'ob-titulo', text: 'Seu painel está de pé' }),
        el('p', { class: 'ob-texto', text: 'Tudo que aparece ali foi você que cadastrou — nenhum número é de exemplo. Conforme você for lançando, os gráficos e o OAZE Score ganham sentido.' })
      ]));

      const proximos = [
        ['Cadastrar um cartão de crédito', () => App.goTo('accounts', { tab: 'cards' })],
        ['Importar um extrato', () => App.goTo('accounts', { tab: 'import' })],
        ['Definir orçamento por categoria', () => App.goTo('budget')]
      ];
      box.appendChild(el('p', { class: 'ob-sub', style: { marginTop: '14px' }, text: 'Bons próximos passos' }));
      box.appendChild(el('div', { class: 'ob-proximos' },
        proximos.map(([t, fn]) => el('button', {
          class: 'btn btn-outline btn-sm', type: 'button', text: t,
          onclick: () => { Ob.concluir(); UI.closeModal(); fn(); }
        }))));

      return [{
        label: 'Abrir o painel', class: 'btn-primary',
        onClick: () => { Ob.concluir(); UI.closeModal(); App.goTo('home'); }
      }];
    }
  };

  /* ---------------- gravações auxiliares ---------------- */

  Ob.gravarPerfil = async function (d) {
    const c = sb();
    const u = global.Sync && Sync.currentUser();
    if (!c || !u) return;
    try {
      await c.from('profiles').upsert({
        user_id: u.uid, nome: d.nome || null,
        moeda: d.moeda || 'BRL', pais: d.pais || 'BR',
        fuso: d.fuso || 'America/Sao_Paulo'
      }, { onConflict: 'user_id' });
    } catch (e) { console.warn('Onboarding/perfil:', e.message); }
  };

  Ob.concluir = function () {
    estado.etapa = 'fim';
    estado.concluido = true;
    Ob.salvar();
    UI.toast('Configuração concluída.', 'success');
  };

  /* ---------------- entrada ---------------- */

  Ob.talvezOferecer = async function () {
    try {
      if (await Ob.deveOferecer()) {
        Ob.iniciar();
      }
    } catch (e) { console.error('Onboarding:', e); }
  };

  global.Ob = Ob;
})(window);
