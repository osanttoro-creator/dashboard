/* =============================================================
   site-auth.js — autenticação das páginas públicas
   -------------------------------------------------------------
   Autônomo de propósito. Não depende de Store, Sync, App nem de
   nenhuma das ~12.000 linhas do painel: quem abre /entrar não
   precisa baixar o aplicativo inteiro para digitar um e-mail.

   O módulo do app (supabase-auth.js) continua existindo e cuida da
   sessão de lá. Este cuida das telas de entrada. Os dois falam com
   o mesmo projeto e compartilham a sessão pelo armazenamento do
   próprio SDK -- entrar aqui é estar dentro lá.

   POR QUE getClaims E NÃO getSession
   getSession devolve a sessão SEM validar o JWT: um token expirado
   ou adulterado no armazenamento local passa por ela. Para decidir
   se alguém entra numa página protegida isso não serve. getClaims
   valida a assinatura. getSession fica só para quando o que se quer
   é o access token em si.
   ============================================================= */
(function (global) {
  'use strict';

  var A = {};
  var cliente = null;

  /* ---------------------------------------------------------------
     cliente
     --------------------------------------------------------------- */
  A.cliente = function () {
    if (cliente) return cliente;

    var c = global.SupabaseConfig;
    var chave = c && (c.publishableKey || c.anonKey);
    if (!c || !c.url || !chave) return null;
    if (!global.supabase || !global.supabase.createClient) return null;

    cliente = global.supabase.createClient(c.url, chave, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        /* A MESMA gaveta do aplicativo. Sem esta linha o SDK usa
           'sb-<ref>-auth-token' e o painel usa 'oaze.supabase.auth':
           entrar aqui não é estar dentro lá, e a pessoa acaba
           criando a conta duas vezes. O nome vem de
           supabase-config.js justamente para não haver dois lugares
           onde ele possa divergir de novo. */
        storageKey: (c.storageKey || 'oaze.supabase.auth'),
        /* O link de recuperação e o de confirmação chegam com o token
           no fragmento da URL. Sem isto o SDK ignora o fragmento e a
           pessoa clica no e-mail, cai na página e continua deslogada
           -- sem erro nenhum aparecendo. */
        detectSessionInUrl: true,
        flowType: 'pkce'
      }
    });
    return cliente;
  };

  /* ---------------------------------------------------------------
     mensagens
     ---------------------------------------------------------------
     O texto do Supabase vem em inglês e às vezes técnico demais.
     Traduzir aqui evita "Invalid login credentials" numa tela em
     português -- e evita repassar detalhe que não ajuda ninguém. */
  var FRASES = [
    [/invalid login credentials/i,        'E-mail ou senha incorretos.'],
    [/email not confirmed/i,              'Confirme seu e-mail antes de entrar. Procure a mensagem que enviamos.'],
    [/user already registered|already registered/i, 'Já existe uma conta com esse e-mail. Tente entrar, ou recupere a senha.'],
    [/password should be at least (\d+)/i, 'A senha precisa ter pelo menos $1 caracteres.'],
    [/unable to validate email|invalid email/i, 'Esse e-mail não parece válido.'],
    [/rate limit|too many requests/i,     'Muitas tentativas seguidas. Espere um minuto e tente de novo.'],
    [/token has expired|invalid token|expired/i, 'Esse link expirou. Peça um novo.'],
    [/network|fetch|failed to fetch/i,    'Sem conexão com o servidor. Verifique sua internet.'],
    [/same as the old password/i,         'A senha nova precisa ser diferente da anterior.']
  ];

  A.frase = function (erro) {
    var m = (erro && (erro.message || erro.msg)) || String(erro || '');
    for (var i = 0; i < FRASES.length; i++) {
      var achou = m.match(FRASES[i][0]);
      if (achou) return FRASES[i][1].replace('$1', achou[1] || '');
    }
    /* Sem tradução conhecida: uma frase genérica, e o original só no
       console. Erro cru na tela costuma vazar detalhe de servidor e
       não ajuda quem está tentando entrar. */
    if (m) console.warn('[auth]', m);
    return 'Não foi possível concluir agora. Tente de novo em instantes.';
  };

  /* ---------------------------------------------------------------
     para onde ir depois de entrar
     ---------------------------------------------------------------
     Aceita ?destino=/app/algo para levar de volta ao que a pessoa
     tentou abrir antes de ser mandada para o login.

     SÓ CAMINHO INTERNO. Sem esta checagem, ?destino=https://outro.site
     transforma a nossa página de login num trampolim: o link parece
     nosso, a pessoa entra, e sai no site de quem mandou o link. É o
     redirecionamento aberto -- e é assim que se rouba sessão. */
  A.destino = function () {
    var p = new URLSearchParams(global.location.search).get('destino') || '';
    if (!p || p.charAt(0) !== '/' || p.charAt(1) === '/' || p.indexOf('\\') >= 0) return '/app';
    return p;
  };

  /* Endereço absoluto para os links que chegam por e-mail. Precisa
     estar na lista de Redirect URLs do painel do Supabase, senão o
     link volta para a Site URL e a pessoa cai na página errada. */
  A.voltarPara = function (caminho) {
    return global.location.origin + caminho;
  };

  /* ---------------------------------------------------------------
     entrada social
     ---------------------------------------------------------------
     /auth/v1/settings é público e diz quais provedores estão LIGADOS
     no projeto. O botão só existe se a porta existir: um "Continuar
     com a Apple" que responde "provider is not enabled" promete uma
     porta que não há — pior do que botão nenhum. O painel já faz
     assim (supabase-auth.js); aqui é a mesma regra.

     Sem rede a resposta não vem, nenhum botão aparece, e o e-mail
     continua ali: a página nunca fica esperando por esta chamada. */
  var provedoresPromessa = null;

  A.provedores = function () {
    if (provedoresPromessa) return provedoresPromessa;
    var c = global.SupabaseConfig;
    var chave = c && (c.publishableKey || c.anonKey);
    if (!c || !c.url || !chave) return Promise.resolve({});
    provedoresPromessa = fetch(c.url + '/auth/v1/settings', { headers: { apikey: chave } })
      .then(function (r) { return r.ok ? r.json() : {}; })
      .then(function (j) { return (j && j.external) || {}; })
      .catch(function () { return {}; });
    return provedoresPromessa;
  };

  /* Entrar com Google ou Apple — e criar conta é a mesma porta: na
     primeira vez o Supabase cria o usuário sozinho.

     A volta cai em /app (ou no ?destino= que trouxe a pessoa até
     aqui) com ?code= na URL, e o SDK troca o código pela sessão
     sozinho (detectSessionInUrl). A SESSÃO FICA SALVA: vai para o
     localStorage na mesma gaveta do resto do produto, sobrevive a
     fechar o navegador e se renova sozinha enquanto valer.

     O endereço de volta precisa estar em Authentication → URL
     Configuration → Redirect URLs no painel do Supabase. Fora da
     lista, o provedor devolve para a Site URL e a pessoa cai na
     página errada, sem erro nenhum na tela. */
  A.entrarCom = function (provedor) {
    var c = A.cliente();
    if (!c) return Promise.reject(new Error('config'));
    var opcoes = { redirectTo: A.voltarPara(A.destino()) };
    /* Sem isto, quem tem mais de uma conta Google entra sempre na
       última usada, sem chance de escolher qual. */
    if (provedor === 'google') opcoes.queryParams = { prompt: 'select_account' };
    return c.auth.signInWithOAuth({ provider: provedor, options: opcoes });
  };

  /* ---------------------------------------------------------------
     operações
     --------------------------------------------------------------- */
  A.cadastrar = function (email, senha, nome) {
    var c = A.cliente();
    if (!c) return Promise.reject(new Error('config'));
    return c.auth.signUp({
      email: email,
      password: senha,
      options: {
        data: { nome: nome || '' },
        emailRedirectTo: A.voltarPara('/confirmar-email')
      }
    });
  };

  A.entrar = function (email, senha) {
    var c = A.cliente();
    if (!c) return Promise.reject(new Error('config'));
    return c.auth.signInWithPassword({ email: email, password: senha });
  };

  A.linkMagico = function (email) {
    var c = A.cliente();
    if (!c) return Promise.reject(new Error('config'));
    return c.auth.signInWithOtp({
      email: email,
      options: {
        emailRedirectTo: A.voltarPara('/app'),
        /* false: o link mágico ENTRA numa conta que já existe, não
           cria uma nova. Deixar true faria de um endereço digitado
           errado uma conta nova e vazia, sem ninguém perceber. */
        shouldCreateUser: false
      }
    });
  };

  A.recuperarSenha = function (email) {
    var c = A.cliente();
    if (!c) return Promise.reject(new Error('config'));
    return c.auth.resetPasswordForEmail(email, {
      redirectTo: A.voltarPara('/redefinir-senha')
    });
  };

  A.trocarSenha = function (senha) {
    var c = A.cliente();
    if (!c) return Promise.reject(new Error('config'));
    return c.auth.updateUser({ password: senha });
  };

  A.sair = function () {
    var c = A.cliente();
    if (!c) return Promise.resolve();
    return c.auth.signOut();
  };

  /* Quem está logado, com o JWT validado. Devolve null quando não há
     sessão válida -- e null aqui significa "não entre", nunca
     "provavelmente não". */
  A.quemEsta = async function () {
    var c = A.cliente();
    if (!c) return null;
    try {
      var r = await c.auth.getClaims();
      var claims = r && r.data && r.data.claims;
      if (!claims || !claims.sub) return null;
      return { id: claims.sub, email: claims.email || '' };
    } catch (e) {
      return null;
    }
  };

  /* ---------------------------------------------------------------
     ajudantes de formulário
     --------------------------------------------------------------- */

  /* Mostra uma mensagem numa região viva. role e aria-live ficam no
     HTML, não são postos aqui: uma região anunciada só é lida se já
     existia na árvore antes do texto chegar. Criada junto com o
     texto, o leitor de tela não anuncia nada. */
  A.diz = function (caixa, texto, tipo) {
    if (!caixa) return;
    caixa.textContent = texto || '';
    caixa.hidden = !texto;
    caixa.className = 'recado' + (tipo ? ' recado-' + tipo : '');
  };

  /* Erro colado no campo, ligado por aria-describedby e marcado com
     aria-invalid. Sem os dois, o leitor de tela lê o campo e não
     lê o motivo de ele estar errado. */
  A.erroNoCampo = function (campo, texto) {
    if (!campo) return;
    var alvo = document.getElementById(campo.id + '-erro');
    if (alvo) { alvo.textContent = texto || ''; alvo.hidden = !texto; }
    campo.setAttribute('aria-invalid', texto ? 'true' : 'false');
  };

  A.ocupado = function (botao, sim, textoOcupado) {
    if (!botao) return;
    /* Botão com ícone guarda o texto num <span data-rotulo>. Trocar o
       textContent do botão inteiro apagaria o SVG junto — e o botão
       voltaria sem marca nenhuma depois do "Aguarde…". */
    var alvo = botao.querySelector('[data-rotulo]') || botao;
    if (sim) {
      alvo.dataset.textoAntes = alvo.textContent;
      alvo.textContent = textoOcupado || 'Aguarde…';
      botao.disabled = true;
      botao.setAttribute('aria-busy', 'true');
    } else {
      if (alvo.dataset.textoAntes) alvo.textContent = alvo.dataset.textoAntes;
      botao.disabled = false;
      botao.removeAttribute('aria-busy');
    }
  };

  /* Falta configuração do Supabase: é falha de instalação, não do
     usuário. Dizer "e-mail ou senha incorretos" aqui mandaria a
     pessoa tentar de novo para sempre. */
  A.semConfig = function (caixa) {
    A.diz(caixa, 'A autenticação não está configurada neste ambiente. ' +
      'Se você é quem instalou, confira assets/js/supabase-config.js.', 'erro');
  };

  global.SiteAuth = A;
})(window);
