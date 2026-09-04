/* =============================================================
   migracao.js — do localStorage para o banco, uma única vez
   ------------------------------------------------------------
   A ordem dos passos não é burocracia: cada um existe porque a
   ausência dele causa um estrago específico.

     1. detecta         nada acontece sem dado antigo para migrar
     2. explica         o usuário aprova antes, não descobre depois
     3. registra        abre o diário ANTES de gravar qualquer coisa
     4. faz backup      arquivo baixado, na mão dele, antes de tocar
     5. valida          formato quebrado não vira linha no banco
     6. envia           por espaço, em lotes, idempotente
     7. confere         conta de volta o que o banco realmente tem
     8. conclui         só então marca; e a marca é única por origem
     9. preserva        o localStorage FICA, intacto

   O QUE NUNCA ACONTECE
   O conteúdo antigo não é apagado. Nem no fim, nem depois de
   conferir, nem nunca por esta função. Apagar seria a única ação
   irreversível de todo o processo, e não há motivo: o custo de
   manter é alguns kilobytes.

   IDEMPOTÊNCIA EM DUAS CAMADAS
   O diário (data_migrations) impede a segunda execução; o
   legacy_id impede a duplicata se ela acontecer mesmo assim —
   numa aba paralela, por exemplo. Uma camada só seria fé.
   ============================================================= */
(function (global) {
  'use strict';

  const Mig = {};
  const el = U.el;
  const CHAVE_LOCAL = 'financas.v1';

  /**
   * A "origem" identifica O QUE está sendo migrado, não de onde.
   * O índice único em data_migrations é por (user_id, origem), então
   * este texto é o que garante uma migração por conjunto de dados.
   */
  const ORIGEM = 'localStorage:financas.v1';

  /* ---------------- 1 · detectar ---------------- */

  /** Há dado antigo com substância? Perfil vazio não é migração. */
  Mig.temDadoAntigo = function () {
    try {
      const bruto = localStorage.getItem(CHAVE_LOCAL);
      if (!bruto) return false;
      const st = JSON.parse(bruto);
      if (!st || !Array.isArray(st.profiles)) return false;
      return st.profiles.some((p) =>
        (p.transactions || []).length || (p.accounts || []).length > 1 ||
        (p.cards || []).length || (p.goals || []).length);
    } catch (e) { return false; }
  };

  /** Já migrou? A pergunta vai ao banco, não ao navegador. */
  Mig.jaMigrou = async function () {
    try {
      const sb = SupabaseBackend.cliente();
      const u = Sync.currentUser();
      if (!sb || !u) return null;
      const { data } = await sb.from('data_migrations')
        .select('id, status, contagens, concluido_em')
        .eq('user_id', u.uid).eq('origem', ORIGEM)
        .eq('status', 'concluida').maybeSingle();
      return data || null;
    } catch (e) { return null; }
  };

  /* ---------------- 5 · validar ---------------- */

  /**
   * Formato quebrado não vira linha no banco. Este é o último
   * ponto em que um dado estranho pode ser recusado de graça —
   * depois dele, o estrago já está gravado.
   */
  Mig.validar = function (st) {
    const erros = [];
    if (!st || typeof st !== 'object') return { ok: false, erros: ['arquivo não é um objeto'] };
    if (!Array.isArray(st.profiles) || !st.profiles.length) erros.push('nenhum perfil encontrado');

    (st.profiles || []).forEach((p, i) => {
      const onde = 'perfil ' + (i + 1) + (p && p.name ? ' (' + p.name + ')' : '');
      if (!p || typeof p !== 'object') { erros.push(onde + ': não é um objeto'); return; }
      if (!p.id) erros.push(onde + ': sem identificador');
      ['accounts', 'cards', 'categories', 'transactions', 'investments', 'goals'].forEach((campo) => {
        if (p[campo] != null && !Array.isArray(p[campo])) erros.push(onde + ': ' + campo + ' não é uma lista');
      });
      (p.transactions || []).forEach((t, j) => {
        if (!t || !t.id) erros.push(onde + ': lançamento ' + (j + 1) + ' sem identificador');
        else if (!U.isValidISO(t.date)) erros.push(onde + ': lançamento "' + (t.description || t.id) + '" com data inválida');
        else if (!isFinite(+t.amount)) erros.push(onde + ': lançamento "' + (t.description || t.id) + '" com valor não numérico');
      });
    });
    /* Uma lista infinita de erros não ajuda ninguém a decidir. */
    return { ok: !erros.length, erros: erros.slice(0, 12), total: erros.length };
  };

  /** Quanto há para migrar — mostrado antes de começar. */
  Mig.inventario = function (st) {
    const c = { perfis: (st.profiles || []).length, contas: 0, cartoes: 0, categorias: 0, lancamentos: 0, investimentos: 0, metas: 0 };
    (st.profiles || []).forEach((p) => {
      c.contas += (p.accounts || []).length;
      c.cartoes += (p.cards || []).length;
      c.categorias += (p.categories || []).length;
      c.lancamentos += (p.transactions || []).length;
      c.investimentos += (p.investments || []).length;
      c.metas += (p.goals || []).length;
    });
    return c;
  };

  /* ---------------- o fluxo ---------------- */

  /**
   * Abre a conversa. Só executa depois que a pessoa aceita —
   * migração silenciosa é a forma mais rápida de perder confiança
   * quando algo dá errado.
   */
  Mig.oferecer = async function () {
    if (!Mig.temDadoAntigo()) return;
    if (!Sync.currentUser()) return;
    if (await Mig.jaMigrou()) return;

    let st;
    try { st = JSON.parse(localStorage.getItem(CHAVE_LOCAL)); } catch (e) { return; }

    const inv = Mig.inventario(st);
    const v = Mig.validar(st);

    const corpo = el('div', { style: { fontSize: '13.5px', lineHeight: '1.65' } }, [
      el('p', { text: 'Seus dados estão neste aparelho. Vamos copiá-los para a sua conta, para que apareçam também no celular.' }),

      el('div', { class: 'parse-info', style: { marginTop: '12px' } },
        el('div', {}, [
          el('strong', { text: 'O que será copiado' }),
          el('ul', { style: { marginTop: '6px', paddingLeft: '18px', listStyle: 'disc' } }, [
            el('li', { text: inv.perfis + ' perfil(is)' }),
            el('li', { text: inv.lancamentos + ' lançamento(s)' }),
            el('li', { text: inv.contas + ' conta(s) e ' + inv.cartoes + ' cartão(ões)' }),
            el('li', { text: inv.categorias + ' categoria(s), ' + inv.investimentos + ' investimento(s), ' + inv.metas + ' meta(s)' })
          ])
        ])),

      v.ok ? null : el('div', { class: 'parse-info is-warn', style: { marginTop: '12px' } },
        el('div', {}, [
          el('strong', { text: 'Encontramos ' + v.total + ' problema(s) nos dados' }),
          el('ul', { style: { marginTop: '6px', paddingLeft: '18px', listStyle: 'disc' } },
            v.erros.map((e) => el('li', { text: e }))),
          el('p', { style: { marginTop: '6px' }, text: 'A cópia não vai começar enquanto isso não for resolvido. Baixe o backup e me procure com ele.' })
        ])),

      el('p', { style: { marginTop: '12px' } }, [
        el('strong', { text: 'Nada é apagado. ' }),
        el('span', { text: 'Os dados continuam neste aparelho depois da cópia, e você baixa um backup antes de começar.' })
      ])
    ].filter(Boolean));

    UI.openModal({
      title: 'Levar seus dados para a conta',
      wide: true,
      body: corpo,
      buttons: [
        { label: 'Agora não', class: 'btn-outline', onClick: UI.closeModal },
        {
          label: 'Baixar backup', class: 'btn-outline',
          onClick: () => Mig.baixarBackup()
        },
        v.ok
          ? { label: 'Copiar para a conta', class: 'btn-primary', onClick: () => Mig.executar(st) }
          : null
      ].filter(Boolean)
    });
  };

  /* ---------------- 4 · backup ---------------- */

  Mig.baixarBackup = function () {
    const bruto = localStorage.getItem(CHAVE_LOCAL) || '{}';
    U.download('oaze-antes-da-migracao-' + U.todayISO() + '.json', bruto);
    /* E uma segunda cópia dentro do próprio navegador: se a pessoa
       fechar a aba antes de salvar o arquivo, ainda há de onde voltar. */
    try { localStorage.setItem(CHAVE_LOCAL + '.backup', bruto); } catch (e) { /* cheio: o arquivo já saiu */ }
    UI.toast('Backup baixado. Guarde-o antes de continuar.', 'success');
  };

  /* ---------------- 6..8 · executar ---------------- */

  Mig.executar = async function (st) {
    const u = Sync.currentUser();
    if (!u) { UI.toast('Entre na sua conta primeiro.', 'error'); return; }

    /* Uma segunda checagem, agora que o clique aconteceu: entre
       abrir o modal e clicar, outra aba pode ter migrado. */
    if (await Mig.jaMigrou()) {
      UI.closeModal();
      UI.toast('Seus dados já estão na conta.', 'success');
      return;
    }

    const sb = SupabaseBackend.cliente();
    const painel = el('div', { style: { fontSize: '13.5px', lineHeight: '1.7' } });
    const linha = (t) => { painel.appendChild(el('p', { text: t })); };

    UI.openModal({
      title: 'Copiando…',
      body: el('div', {}, [
        el('p', { class: 'hint', text: 'Não feche esta aba. Se algo falhar, nada é perdido — os dados continuam no aparelho.' }),
        painel
      ]),
      buttons: [],
      noAutofocus: true
    });

    let registro = null;
    try {
      /* 4 · backup ANTES de tocar em qualquer coisa */
      Mig.baixarBackup();
      linha('✓ Backup baixado');

      /* 3 · abre o diário. Se o processo morrer no meio, fica a
         linha "em_andamento" — e ela conta a história. */
      const { data: reg, error: eReg } = await sb.from('data_migrations').insert({
        user_id: u.uid, origem: ORIGEM, status: 'em_andamento'
      }).select('id').single();
      if (eReg) throw new Error('não foi possível registrar a migração: ' + eReg.message);
      registro = reg.id;

      /* 6 · envio, espaço por espaço */
      const totalEnviado = {};
      const totalNoBanco = {};
      const espacos = [];

      for (const perfil of st.profiles) {
        linha('→ ' + (perfil.name || 'perfil') + '…');
        const r = await Repo.enviarEspaco(Store.normalizeProfile(perfil), u.uid,
          (o, n) => { if (n) linha('   ' + n + ' ' + o); });
        espacos.push(r.workspaceId);
        Object.keys(r.contagens).forEach((k) => {
          totalEnviado[k] = (totalEnviado[k] || 0) + r.contagens[k];
        });
      }

      /* 7 · conferência: conta de volta o que o banco tem */
      linha('→ Conferindo…');
      for (const wsId of espacos) {
        const c = await Repo.contarNoBanco(wsId);
        Object.keys(c).forEach((k) => { totalNoBanco[k] = (totalNoBanco[k] || 0) + c[k]; });
      }
      const conf = Repo.conferir(totalEnviado, totalNoBanco);
      if (!conf.ok) throw new Error('conferência falhou — ' + conf.problemas.join('; '));

      /* 8 · só agora conclui */
      await sb.from('data_migrations').update({
        status: 'concluida',
        contagens: { enviado: totalEnviado, no_banco: totalNoBanco },
        concluido_em: new Date().toISOString()
      }).eq('id', registro);

      linha('✓ ' + (totalNoBanco.lancamentos || 0) + ' lançamentos conferidos no servidor');
      UI.closeModal();
      UI.openModal({
        title: 'Pronto',
        body: el('div', { style: { fontSize: '13.5px', lineHeight: '1.65' } }, [
          el('p', { text: 'Seus dados agora estão na conta e aparecem em qualquer aparelho onde você entrar.' }),
          el('p', { style: { marginTop: '10px' } }, [
            el('strong', { text: 'O que estava aqui continua aqui. ' }),
            el('span', { text: 'Nada foi apagado deste navegador, e o backup está na sua pasta de downloads.' })
          ])
        ]),
        buttons: [{ label: 'Entendi', class: 'btn-primary', onClick: UI.closeModal }]
      });
    } catch (e) {
      console.error('Migração:', e);
      /* O diário guarda a falha: na próxima tentativa sabemos que
         houve uma, e o índice único só bloqueia as CONCLUÍDAS. */
      if (registro) {
        try {
          await sb.from('data_migrations').update({
            status: 'falhou', erro: String(e.message || e).slice(0, 500)
          }).eq('id', registro);
        } catch (e2) { /* sem rede: a linha fica em_andamento */ }
      }
      UI.closeModal();
      UI.openModal({
        title: 'A cópia não terminou',
        body: el('div', { style: { fontSize: '13.5px', lineHeight: '1.65' } }, [
          el('p', { text: 'Algo falhou no meio do caminho:' }),
          el('p', { class: 'hint', style: { marginTop: '6px' }, text: String(e.message || e) }),
          el('p', { style: { marginTop: '10px' } }, [
            el('strong', { text: 'Seus dados estão intactos. ' }),
            el('span', { text: 'Nada foi apagado deste aparelho e o backup está na sua pasta de downloads. Pode tentar de novo — o que já foi copiado não será duplicado.' })
          ])
        ]),
        buttons: [{ label: 'Fechar', class: 'btn-primary', onClick: UI.closeModal }]
      });
    }
  };

  /* ---------------- gancho ---------------- */

  /**
   * Chamado quando a sessão abre. O atraso deixa a interface
   * desenhar antes: um modal que aparece sobre a tela em branco
   * assusta mais do que informa.
   */
  Mig.aoEntrar = function () {
    setTimeout(() => { Mig.oferecer().catch((e) => console.error('Migração:', e)); }, 1200);
  };

  global.Mig = Mig;
})(window);
