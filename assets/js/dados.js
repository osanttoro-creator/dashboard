/* =============================================================
   dados.js — quem manda: o banco ou o aparelho
   -------------------------------------------------------------
   Este arquivo existe para inverter uma relação. Até aqui o
   localStorage era o original e o Supabase a cópia — a tabela
   `dados` tinha como comentário literal "espelho do localStorage".
   Agora é o contrário: quem tem conta tem o registro oficial no
   banco, e o localStorage passa a ser

     · cache, para a tela abrir sem esperar a rede
     · fila do que foi feito offline
     · recuperação temporária quando a leitura falha
     · backup da migração
     · preferências do aparelho (tema, mês em foco)

   Nada disso é "os dados". São a conveniência em volta deles.

   A REGRA QUE NÃO PODE SER QUEBRADA
   Não se sobrescreve o estado local enquanto houver tarefa na
   fila. Se alguém editou offline e a fila ainda não drenou, puxar
   do banco por cima apagaria exatamente o trabalho que ainda não
   chegou lá — silenciosamente, e sem forma de recuperar.
   Por isso toda leitura passa por `podeSobrescrever()`, e a
   resposta negativa dela NUNCA é contornada: primeiro a fila sobe,
   depois o banco desce.

   POR QUE A TELA ABRE COM O CACHE, E NÃO ESPERANDO O BANCO
   Esperar a rede para desenhar deixaria o app em branco por um
   tempo que depende da conexão de quem abre. O cache pinta na
   hora; o banco chega depois e corrige, se houver o que corrigir.
   O preço é uma janela curta em que a tela pode estar
   desatualizada — e é por isso que o estado da sincronização é
   visível, em vez de escondido.
   ============================================================= */
(function (global) {
  'use strict';

  const Dados = {};

  /* Estados possíveis, e o que cada um significa para quem lê:
       local          sem conta — os dados vivem só neste aparelho
       carregando     buscando o registro oficial no banco
       sincronizado   o que está na tela é o que está no banco
       offline        sem rede; alterações guardadas para depois
       sincronizando  drenando a fila
       erro           falhou; há o que tentar de novo             */
  let estado = 'local';
  let ultimoErro = null;
  let carregando = false;
  const ouvintes = [];

  function anunciar(novo, erro) {
    if (novo) estado = novo;
    ultimoErro = erro || null;
    ouvintes.forEach((fn) => { try { fn(estado, ultimoErro); } catch (e) { console.error(e); } });
  }

  Dados.estado = () => estado;
  Dados.erro = () => ultimoErro;
  Dados.aoMudar = (fn) => { ouvintes.push(fn); };

  /** Há sessão válida e backend configurado? */
  function temConta() {
    return !!(global.Sync && Sync.isConfigured() && Sync.currentUser());
  }

  /**
   * A trava. Só é seguro trazer o banco por cima do local quando
   * não há nada local esperando para subir.
   */
  function podeSobrescrever() {
    /* Duas travas, por dois motivos diferentes.

       A FILA: há edição feita neste aparelho que ainda não subiu.
       Trazer o banco por cima apagaria justamente ela.

       A MIGRAÇÃO: há dado local que nunca esteve na conta, ou uma
       migração acontecendo agora e portanto um banco pela metade.
       Ler dele e aplicar seria substituir o inteiro pelo pedaço. */
    if (global.Fila && Fila.pendentes() > 0) return false;
    if (global.Mig && Mig.pendente && Mig.pendente()) return false;
    return true;
  }

  /** Qual das duas travas está fechada — para dizer ao usuário. */
  function motivoDaTrava() {
    if (global.Mig && Mig.pendente && Mig.pendente()) {
      return global.Mig.emAndamento && Mig.emAndamento()
        ? 'A cópia dos seus dados para a conta está em andamento.'
        : 'Este aparelho tem dados que ainda não foram copiados para a sua conta. ' +
          'Eles sobem primeiro — nada foi substituído.';
    }
    return 'Há alterações deste aparelho ainda não enviadas. ' +
      'Elas sobem primeiro — seus dados do servidor não foram trazidos por cima.';
  }

  /* ---------------------------------------------------------------
     leitura
     --------------------------------------------------------------- */

  /**
   * Traz do banco todos os espaços do usuário e substitui o estado.
   *
   * @param {object} opcoes
   *   forcar  — ignora a checagem de "já carregou nesta sessão"
   */
  Dados.carregarDoBanco = async function (opcoes) {
    const op = opcoes || {};

    if (!temConta()) { anunciar('local'); return { ok: false, motivo: 'sem-conta' }; }
    if (carregando) return { ok: false, motivo: 'em-andamento' };

    if (!navigator.onLine) {
      anunciar('offline');
      return { ok: false, motivo: 'offline' };
    }

    /* A fila primeiro, sempre. Se ela não esvaziar, a leitura não
       acontece -- e isso não é falha: é a proteção funcionando. */
    if (!podeSobrescrever()) {
      anunciar('sincronizando');
      /* Drenar a fila pode destravar; a migração, não -- ela depende
         de o usuário decidir. Por isso tenta uma e, se ainda estiver
         travado, explica QUAL das duas travas é. */
      if (global.Fila) { try { await Fila.drenar(); } catch (e) { /* o estado abaixo cobre */ } }
      if (!podeSobrescrever()) {
        anunciar('erro', motivoDaTrava());
        return { ok: false, motivo: 'travado' };
      }
    }

    carregando = true;
    anunciar('carregando');

    try {
      const u = Sync.currentUser();
      const espacos = await Repo.listarEspacos(u.uid);

      /* Conta sem espaço nenhum no banco: é conta nova, ou conta
         cujos dados ainda não migraram. Em nenhum dos dois casos se
         deve esvaziar a tela -- o local é o que existe, e a migração
         é quem resolve. */
      if (!espacos.length) {
        carregando = false;
        anunciar(op.silencioso ? estado : 'sincronizado');
        return { ok: true, vazio: true };
      }

      const perfis = [];
      for (let i = 0; i < espacos.length; i++) {
        const e = espacos[i];
        perfis.push(await Repo.carregarEspaco(e.id, e.name, e.legacy_id));
      }

      /* Última checagem antes de trocar. A leitura levou tempo; se
         alguém mexeu no app enquanto ela corria, a fila cresceu e a
         troca voltou a ser destrutiva. */
      if (!podeSobrescrever()) {
        carregando = false;
        anunciar('erro', 'Algo mudou enquanto os dados chegavam. Nada foi substituído.');
        return { ok: false, motivo: 'travou-no-meio' };
      }

      Dados.aplicar(perfis);
      carregando = false;
      anunciar('sincronizado');
      return { ok: true, espacos: perfis.length };

    } catch (e) {
      carregando = false;
      console.error('[dados] leitura falhou:', e);
      /* O cache continua na tela. Dizer "erro" sem apagar nada é o
         comportamento certo: o usuário vê os dados que tinha, e sabe
         que eles podem estar velhos. */
      anunciar('erro', 'Não foi possível trazer seus dados do servidor. ' +
        'O que está na tela é a última cópia deste aparelho.');
      return { ok: false, motivo: 'falhou', erro: e };
    }
  };

  /**
   * Troca os perfis do estado pelos que vieram do banco e grava o
   * cache. Preferências do aparelho — tema, perfil ativo — são
   * mantidas: elas não pertencem ao banco.
   */
  Dados.aplicar = function (perfis) {
    const st = Store.state();
    const ativoAntes = st.activeProfileId;

    st.profiles = perfis.map(Store.normalizeProfile);

    /* Se o perfil que estava aberto ainda existe, continua aberto.
       Trocar a tela por baixo de quem estava trabalhando é
       desorientador mesmo quando os dados estão certos. */
    st.activeProfileId = st.profiles.some((p) => p.id === ativoAntes)
      ? ativoAntes
      : (st.profiles[0] && st.profiles[0].id);

    /* 'sync-apply' faz o Store gravar o cache e avisar as telas SEM
       recarimbar updatedAt -- recarimbar faria isto parecer uma
       edição local e devolveria tudo para a fila, num laço. */
    Store.commit('sync-apply');
  };

  /* ---------------------------------------------------------------
     tentar de novo
     --------------------------------------------------------------- */
  Dados.tentarNovamente = function () {
    if (global.Fila && Fila.pendentes()) Fila.tentarAgora();
    return Dados.carregarDoBanco({ forcar: true });
  };

  /* ---------------------------------------------------------------
     início
     --------------------------------------------------------------- */
  Dados.init = function () {
    /* Sem conta, o estado é 'local' e não há nada a sincronizar. Não
       é um estado degradado: é um modo de uso legítimo, e a tela
       diz isso com essas palavras em vez de mostrar um erro. */
    if (!temConta()) { anunciar('local'); }

    /* A fila e a leitura contam a mesma história para o usuário, mas
       vêm de dois lugares. Espelhar aqui evita que a interface
       precise consultar os dois e decidir qual vence. */
    if (global.Fila && Fila.aoMudar) {
      Fila.aoMudar(function (e) {
        if (!temConta()) return;
        if (e === 'sincronizado' && estado !== 'carregando') anunciar('sincronizado');
        else if (e !== 'sincronizado') anunciar(e);
      });
    }

    global.addEventListener('online', function () {
      if (!temConta()) return;
      /* Voltar a ter rede não é motivo para puxar do banco na hora:
         primeiro sobe o que ficou pendente. carregarDoBanco já faz
         essa ordem, e chamá-lo aqui é a forma de garanti-la. */
      Dados.carregarDoBanco({ silencioso: true });
    });

    global.addEventListener('offline', function () {
      if (temConta()) anunciar('offline');
    });
  };

  global.Dados = Dados;
})(window);
