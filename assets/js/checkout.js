/* =============================================================
   checkout.js — a jornada de compra, até onde ela pode ir
   ------------------------------------------------------------
   O PROVEDOR ESCOLHIDO É O MERCADO PAGO. O que falta não é a
   decisão: são os identificadores de preço criados lá dentro
   (external_price_id) e a chave de acesso do vendedor. Sem eles,
   qualquer "checkout" que este arquivo abrisse seria encenação.

   Por isso o fluxo vai até a borda e PARA, com honestidade na
   tela: diz o que vai acontecer, o que já está pronto e o que
   falta. Uma tela de "pagamento aprovado" sem pagamento é a
   mentira mais cara que um produto financeiro pode contar.

   O QUE O NAVEGADOR MANDA
   Duas coisas: o id do plano e o ciclo. Nunca o valor. O preço
   vive em plan_prices, no servidor, e é de lá que o checkout o
   busca — se o cliente pudesse mandar o valor, o valor seria
   sugestão.

   O QUE LIBERA O PLANO
   O webhook assinado, e só ele. O retorno visual do provedor diz
   apenas que o navegador voltou; quem confirma que o dinheiro
   entrou é o servidor conversando com o servidor.
   ============================================================= */
(function (global) {
  'use strict';

  const Checkout = {};
  const el = U.el;

  /* Interface independente de provedor. Trocar de provedor é
     escrever outro objeto com estes três métodos — nada além
     deste arquivo precisa saber qual é. */
  const PROVEDORES = {
    mercadopago: {
      nome: 'Mercado Pago',
      /* Precisa do id do preço criado no painel do provedor. */
      pronto: () => false,
      faltando: [
        'Criar os quatro preços no painel do Mercado Pago (Basic e Pro, mensal e anual)',
        'Preencher external_price_id em plan_prices com os ids gerados lá',
        'Configurar MERCADOPAGO_ACCESS_TOKEN nos segredos do Supabase',
        'Publicar a Edge Function de checkout e a de webhook',
        'Cadastrar a URL do webhook no painel do provedor'
      ]
    }
  };

  const PROVEDOR = 'mercadopago';

  Checkout.provedor = () => PROVEDORES[PROVEDOR];
  Checkout.pronto = () => PROVEDORES[PROVEDOR].pronto();

  /**
   * Inicia a assinatura. Enquanto o provedor não está conectado,
   * mostra exatamente onde o processo para — em vez de um botão
   * que não faz nada, ou pior, de um que finge.
   */
  Checkout.iniciar = async function (planoId, ciclo) {
    const plano = Planos.get(planoId);
    const prov = Checkout.provedor();
    const centavos = Planos.preco(plano, ciclo);

    if (!Checkout.pronto()) {
      UI.openModal({
        title: 'Assinatura ainda não disponível',
        wide: true,
        body: el('div', { style: { fontSize: '13.5px', lineHeight: '1.65' } }, [
          el('div', { class: 'parse-info' }, el('div', {}, [
            el('strong', { text: 'Plano ' + plano.nome + ' · ' + (ciclo === 'annual' ? 'anual' : 'mensal') }),
            el('p', { style: { marginTop: '4px' }, text: Planos.moeda(centavos) + (ciclo === 'annual' ? ' por ano' : ' por mês') })
          ])),
          el('p', { style: { marginTop: '12px' } }, [
            el('span', { text: 'A cobrança será pelo ' }),
            el('strong', { text: prov.nome }),
            el('span', { text: ', e a conexão final ainda não foi feita. Não vamos abrir uma tela de pagamento que não cobra de verdade.' })
          ]),
          el('p', { class: 'ob-sub', style: { marginTop: '14px' }, text: 'O que já está pronto' }),
          el('ul', { class: 'lista-check' }, [
            'Planos, preços e limites no banco, com histórico de versão',
            'Limites aplicados no servidor, não só na tela',
            'Cota do UGLEZ contada de forma atômica, com estorno em erro',
            'Assinatura que só o webhook pode alterar'
          ].map((t) => el('li', {}, [
            el('span', { class: 'plano-check', 'aria-hidden': 'true' }, Icons.lucide('check', 14)),
            el('span', { text: t })
          ]))),
          el('p', { class: 'ob-sub', style: { marginTop: '14px' }, text: 'O que falta' }),
          el('ol', { class: 'lista-passos' }, prov.faltando.map((t) => el('li', { text: t }))),
          el('p', { class: 'hint', style: { marginTop: '12px' }, text: 'Enquanto isso, o plano Grátis continua funcionando por completo — e seus dados são os mesmos em qualquer plano.' })
        ]),
        buttons: [{ label: 'Entendi', class: 'btn-primary', onClick: UI.closeModal }]
      });
      return;
    }

    /* ---- daqui para baixo, só roda quando o provedor estiver
       conectado. O navegador manda plano e ciclo; o valor é
       decidido no servidor. ---- */
    try {
      const r = await Conta.chamarFuncao('oaze-checkout', { plano: planoId, ciclo });
      if (r.erro) { UI.toast(r.mensagem || 'Não foi possível iniciar a assinatura.', 'error'); return; }
      if (r.url) { location.href = r.url; return; }
      UI.toast('O provedor não devolveu um endereço de pagamento.', 'error');
    } catch (e) {
      UI.toast('Falha ao falar com o servidor: ' + e.message, 'error');
    }
  };

  /**
   * Cancelar. Mantém o plano até o fim do período já pago — quem
   * pagou trinta dias tem direito a trinta dias, e encerrar antes
   * seria ficar com dinheiro por serviço não prestado.
   */
  Checkout.cancelar = function () {
    const d = Limites.direitos();
    if (d.plano === 'free') { UI.toast('Você já está no plano Grátis.', 'success'); return; }

    const fim = d.fimPeriodo ? U.fmtDateBR(String(d.fimPeriodo).slice(0, 10)) : null;

    UI.openModal({
      title: 'Cancelar a assinatura',
      body: el('div', { style: { fontSize: '13.5px', lineHeight: '1.65' } }, [
        el('p', { text: fim
          ? 'Seu plano continua valendo até ' + fim + '. Depois disso, a conta volta para o Grátis.'
          : 'Seu plano continua valendo até o fim do período já pago. Depois, a conta volta para o Grátis.' }),
        el('p', { style: { marginTop: '10px' } }, [
          el('strong', { text: 'Nenhum dado é apagado. ' }),
          el('span', { text: 'Se você tiver mais contas ou cartões do que o Grátis permite, eles continuam visíveis e utilizáveis — o que muda é que você não cria novos até ficar dentro do limite.' })
        ]),
        el('p', { style: { marginTop: '10px' }, text: 'Baixe um backup antes se quiser guardar uma cópia fora do app.' })
      ]),
      buttons: [
        { label: 'Manter assinatura', class: 'btn-outline', onClick: UI.closeModal },
        {
          label: 'Cancelar mesmo assim', class: 'btn-outline danger',
          onClick: async () => {
            if (!Checkout.pronto()) {
              UI.closeModal();
              UI.toast('O cancelamento passa pelo provedor, que ainda não está conectado.', 'error', 7000);
              return;
            }
            const r = await Conta.chamarFuncao('oaze-checkout', { acao: 'cancelar' });
            UI.closeModal();
            UI.toast(r.erro ? (r.mensagem || 'Falha ao cancelar.') : 'Cancelamento agendado para o fim do período.',
              r.erro ? 'error' : 'success');
            if (global.Limites) Limites.carregar().then(() => Cfg.render());
          }
        }
      ]
    });
  };

  global.Checkout = Checkout;
})(window);
