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
      faltando: [
        'Publicar as Edge Functions oaze-checkout, oaze-mp-webhook e oaze-assinatura',
        'Configurar MERCADOPAGO_ACCESS_TOKEN e MERCADOPAGO_WEBHOOK_SECRET nos segredos do Supabase',
        'Cadastrar a URL do webhook no painel do Mercado Pago',
        'Testar em sandbox antes de trocar para as credenciais de produção'
      ]
    }
  };

  const PROVEDOR = 'mercadopago';
  Checkout.provedor = () => PROVEDORES[PROVEDOR];

  /* QUEM SABE SE O CHECKOUT ESTÁ PRONTO É O SERVIDOR.
     Isto já foi `pronto: () => false` — uma constante no código do
     navegador. Constante mente das duas formas: fica `false` depois
     de tudo pronto (e o botão continua recusando), ou vira `true`
     antes de o segredo existir (e o botão abre uma tela de
     pagamento que não cobra).

     Agora a tentativa é feita, e a Edge Function responde
     'nao_configurado' quando falta credencial. A verdade fica num
     lugar só, e é o lugar que tem como saber. */
  /* Não existe mais. Deixar um stub que devolve `false` seria pior
     do que remover: quem chamasse continuaria recebendo uma resposta
     plausível e errada para sempre. Sem o método, o erro aparece na
     primeira execução — que é onde ele deve aparecer. */

  /**
   * Inicia a assinatura. Enquanto o provedor não está conectado,
   * mostra exatamente onde o processo para — em vez de um botão
   * que não faz nada, ou pior, de um que finge.
   */
  Checkout.iniciar = async function (planoId, ciclo) {
    const plano = Planos.get(planoId);
    const prov = Checkout.provedor();
    const centavos = Planos.preco(plano, ciclo);

    /* ---- pergunta ao servidor ----
       O navegador manda plano e ciclo. NÃO manda preço: quem sabe
       quanto custa é o banco, e um frontend que envia valor é um
       frontend que decide quanto você recebe. */
    let r = null;
    let indisponivel = false;
    try {
      r = await Conta.chamarFuncao('oaze-checkout', { plano: planoId, ciclo });
      /* 'nao_configurado' vem da própria função quando falta a
         credencial do provedor. Não é erro do usuário nem defeito
         do app — é instalação incompleta, e a tela diz isso. */
      if (r && r.erro === 'nao_configurado') indisponivel = true;
    } catch (e) {
      /* A função ainda não publicada dá 404 aqui. Mesmo caso:
         instalação incompleta, não falha de uso. */
      indisponivel = true;
    }

    if (indisponivel) {
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

    /* ---- a resposta do servidor ---- */
    if (!r || r.erro) {
      UI.toast((r && r.mensagem) || 'Não foi possível iniciar a assinatura.', 'error');
      return;
    }

    /* CONFERÊNCIA, não cobrança. O valor que a tela mostrou tem de
       ser o que o servidor calculou. Divergir significa que a tabela
       de preços do navegador está velha — e mandar a pessoa para uma
       cobrança diferente da que ela leu é o tipo de surpresa que
       vira estorno. Parar aqui custa um clique; não parar custa
       confiança. */
    if (typeof r.centavos === 'number' && r.centavos !== centavos) {
      console.warn('[checkout] preço divergente: tela ' + centavos + ', servidor ' + r.centavos);
      UI.openModal({
        title: 'O preço mudou',
        body: el('div', { style: { fontSize: '13.5px', lineHeight: '1.65' } }, [
          el('p', { text: 'O valor desta página está desatualizado. Recarregue e confira antes de continuar.' }),
          el('p', { class: 'hint', style: { marginTop: '8px' },
            text: 'Nesta tela: ' + Planos.moeda(centavos) + ' · no servidor: ' + Planos.moeda(r.centavos) })
        ]),
        buttons: [
          { label: 'Recarregar', class: 'btn-primary', onClick: () => location.reload() },
          { label: 'Fechar', class: 'btn-outline', onClick: UI.closeModal }
        ]
      });
      return;
    }

    if (r.url) { location.href = r.url; return; }
    UI.toast('O provedor não devolveu um endereço de pagamento.', 'error');
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
            /* oaze-assinatura, e não oaze-checkout: cancelar não
               cobra nada, então não passa pelo caminho de cobrança.
               Antes apontava para a função errada — o cancelamento
               teria recebido "ação desconhecida". */
            let r;
            try {
              r = await Conta.chamarFuncao('oaze-assinatura', { acao: 'cancelar' });
            } catch (e) {
              UI.closeModal();
              UI.toast('O cancelamento ainda não está disponível neste ambiente. Nada foi alterado.', 'error', 7000);
              return;
            }
            UI.closeModal();
            /* A MENSAGEM VEM DO SERVIDOR. Ele sabe até que dia o
               acesso continua; a tela não. Escrever aqui "cancelado"
               sem a data faria a pessoa achar que perdeu o acesso na
               hora — e a maioria dos pedidos de suporte depois de um
               cancelamento é exatamente essa dúvida. */
            UI.toast(r && r.erro
              ? (r.mensagem || 'Falha ao cancelar.')
              : (r && r.mensagem) || 'Cancelamento agendado para o fim do período.',
              r && r.erro ? 'error' : 'success', 9000);
            if (global.Limites) Limites.carregar().then(() => Cfg.render());
          }
        }
      ]
    });
  };

  global.Checkout = Checkout;
})(window);
