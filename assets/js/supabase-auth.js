/* =============================================================
   supabase-auth.js — backend Supabase para o Sync
   ------------------------------------------------------------
   Registra-se em sync.js pelo contrato descrito lá. A diferença
   para o Firebase é o login: aqui ele acontece DENTRO do app —
   e-mail e senha num formulário nosso, sem pop-up do Google, que
   navegador em celular bloqueia com frequência.

   Três caminhos de entrada, todos opcionais no seu projeto:
     1. e-mail + senha        (Auth → Providers → Email)
     2. link mágico por e-mail (mesmo provider, sem senha)
     3. Google                 (Auth → Providers → Google)

   ONDE FICAM OS DADOS: tabela pública `dados`, uma linha por
   usuário, com os perfis num campo jsonb. O RLS garante que
   auth.uid() só alcança a própria linha. O SQL está em
   docs/supabase.sql — sem rodá-lo, nem você lê nada.

   TEMPO REAL: um canal do Postgres Changes filtrado por user_id
   avisa quando outro aparelho grava. É o equivalente ao
   .on('value') do Realtime Database.
   ============================================================= */
(function (global) {
  'use strict';

  const el = U.el;

  const CDN = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.113.0/dist/umd/supabase.js';
  const LOCAL = 'assets/vendor/supabase.js';
  const TABELA = 'dados';

  let cliente = null;
  let canal = null;
  let sdkPromise = null;

  /* O que ESTE projeto aceita. Preenchido por lerProvedores(); até lá,
     assume só e-mail — o mínimo que sempre existe. */
  let aceita = { email: true, google: false, cadastro: true, confirmaEmail: true };

  /**
   * /auth/v1/settings é público e diz quais provedores estão ligados.
   * Vale a chamada: um botão que só leva a "provider is not enabled" é
   * pior do que botão nenhum — promete uma porta que não existe.
   */
  async function lerProvedores(c) {
    try {
      const r = await fetch(c.url + '/auth/v1/settings', { headers: { apikey: c.chave } });
      if (!r.ok) return;
      const j = await r.json();
      aceita = {
        email: !!(j.external && j.external.email),
        google: !!(j.external && j.external.google),
        cadastro: !j.disable_signup,
        confirmaEmail: !j.mailer_autoconfirm
      };
    } catch (e) {
      /* sem rede a resposta não vem; seguimos com o padrão conservador */
    }
  }

  function cfg() {
    const c = global.SupabaseConfig;
    if (!c || typeof c !== 'object') return null;
    const url = String(c.url || '').trim();
    /* A publicável (sb_publishable_…) é o padrão atual; a anon em JWT
       continua valendo em projetos antigos. Aceitamos as duas — para o
       createClient, é o mesmo argumento. */
    const key = String(c.publishableKey || c.anonKey || '').trim();
    if (!url || !key) return null;
    return { url: url.replace(/\/+$/, ''), chave: key };
  }

  function loadSDK() {
    if (global.supabase && global.supabase.createClient) return Promise.resolve();
    if (!sdkPromise) {
      sdkPromise = Sync.loadScript(CDN, LOCAL).then(() => {
        if (!global.supabase || !global.supabase.createClient) {
          throw new Error('SDK do Supabase indisponível.');
        }
      }).catch((e) => { sdkPromise = null; throw e; });
    }
    return sdkPromise;
  }

  /** A sessão do Supabase vira o mesmo formato que o resto do app espera. */
  function mapUser(session) {
    const u = session && session.user;
    if (!u) return null;
    const m = u.user_metadata || {};
    return {
      uid: u.id,
      email: u.email || '',
      displayName: m.full_name || m.name || (u.email || '').split('@')[0] || 'Minha conta',
      photoURL: m.avatar_url || m.picture || ''
    };
  }

  /* ---------------- mensagens de erro ---------------- */

  /**
   * O Supabase responde em inglês e, em vários casos, de propósito
   * vago — "Invalid login credentials" cobre tanto senha errada
   * quanto e-mail inexistente, para não revelar quem tem conta.
   * Traduzimos mantendo essa vagueza.
   */
  function traduz(e) {
    const m = String((e && e.message) || '').toLowerCase();
    if (m.includes('invalid login credentials')) return 'E-mail ou senha incorretos.';
    if (m.includes('email not confirmed')) return 'Confirme o e-mail pelo link que enviamos antes de entrar.';
    if (m.includes('user already registered')) return 'Já existe uma conta com este e-mail. Tente entrar.';
    if (m.includes('password should be at least')) return 'A senha precisa de pelo menos 6 caracteres.';
    if (m.includes('unable to validate email') || m.includes('invalid email')) return 'E-mail inválido.';
    if (m.includes('email rate limit') || m.includes('too many requests') || m.includes('rate limit')) return 'Muitas tentativas seguidas. Espere um minuto e tente de novo.';
    if (m.includes('signups not allowed')) return 'O cadastro está desativado neste projeto (Auth → Providers → Email).';
    if (m.includes('provider is not enabled')) return 'Este método de login não está ativado no projeto (Auth → Providers).';
    if (m.includes('failed to fetch') || m.includes('networkerror')) return 'Sem conexão para falar com o Supabase.';
    return (e && e.message) || 'Não foi possível completar a operação.';
  }

  /* ---------------- formulário de login ---------------- */

  /**
   * O modal resolve sozinho e devolve uma Promise: entrar() espera
   * por ela. Fechar sem entrar rejeita com `silencioso`, para o
   * núcleo não gritar um toast de erro por um cancelamento.
   */
  function abrirLogin() {
    return new Promise((resolve, reject) => {
      let modo = 'entrar';        // entrar | criar
      let ocupado = false;

      const email = el('input', {
        class: 'input', type: 'email', autocomplete: 'email',
        placeholder: 'voce@exemplo.com', inputmode: 'email'
      });
      const senha = el('input', {
        class: 'input', type: 'password', autocomplete: 'current-password',
        placeholder: 'sua senha'
      });
      const nome = el('input', {
        class: 'input', type: 'text', autocomplete: 'name', maxlength: '60',
        placeholder: 'como quer ser chamado'
      });
      const campoNome = el('label', { class: 'field', style: { display: 'none' } }, [
        el('span', { class: 'field-label', text: 'Nome' }), nome
      ]);
      const aviso = el('p', { class: 'hint', style: { minHeight: '18px' } });

      function diz(texto, erro) {
        aviso.textContent = texto || '';
        aviso.style.color = erro ? 'var(--danger, #B3402F)' : '';
      }

      function trava(v) {
        ocupado = v;
        [email, senha, nome].forEach((c) => { c.disabled = v; });
        botaoPrincipal.disabled = v;
        botaoPrincipal.textContent = v
          ? 'Aguarde…'
          : (modo === 'entrar' ? 'Entrar' : 'Criar conta');
      }

      const alternar = el('button', {
        class: 'btn btn-ghost btn-sm', type: 'button',
        onclick: () => {
          modo = modo === 'entrar' ? 'criar' : 'entrar';
          campoNome.style.display = modo === 'criar' ? '' : 'none';
          senha.setAttribute('autocomplete', modo === 'criar' ? 'new-password' : 'current-password');
          titulo.textContent = modo === 'entrar' ? 'Entrar na sua conta' : 'Criar uma conta';
          alternar.textContent = modo === 'entrar' ? 'Não tenho conta' : 'Já tenho conta';
          botaoPrincipal.textContent = modo === 'entrar' ? 'Entrar' : 'Criar conta';
          esqueci.style.display = modo === 'entrar' ? '' : 'none';
          diz('');
        }
      }, 'Não tenho conta');

      const esqueci = el('button', {
        class: 'btn btn-ghost btn-sm', type: 'button',
        onclick: async () => {
          const e = email.value.trim();
          if (!e) { diz('Escreva o e-mail primeiro.', true); email.focus(); return; }
          trava(true);
          try {
            const { error } = await cliente.auth.resetPasswordForEmail(e, { redirectTo: location.href.split('#')[0] });
            if (error) throw error;
            diz('Enviamos um link para redefinir a senha. Confira a caixa de entrada.');
          } catch (err) { diz(traduz(err), true); }
          trava(false);
        }
      }, 'Esqueci a senha');

      const linkMagico = el('button', {
        class: 'btn btn-outline btn-sm', type: 'button',
        onclick: async () => {
          const e = email.value.trim();
          if (!e) { diz('Escreva o e-mail primeiro.', true); email.focus(); return; }
          trava(true);
          try {
            const { error } = await cliente.auth.signInWithOtp({
              email: e,
              options: { emailRedirectTo: location.href.split('#')[0] }
            });
            if (error) throw error;
            diz('Link enviado. Abra o e-mail neste mesmo aparelho para entrar.');
          } catch (err) { diz(traduz(err), true); }
          trava(false);
        }
      }, 'Receber link por e-mail');

      const comGoogle = el('button', {
        class: 'btn btn-outline btn-sm btn-google', type: 'button',
        onclick: async () => {
          trava(true);
          try {
            const { error } = await cliente.auth.signInWithOAuth({
              provider: 'google',
              options: { redirectTo: location.href.split('#')[0] }
            });
            if (error) throw error;
            // navega para o Google; a volta é tratada por detectSessionInUrl
          } catch (err) { diz(traduz(err), true); trava(false); }
        }
      }, [Sync._googleMark(), el('span', { text: 'Continuar com Google' })]);

      async function enviar() {
        if (ocupado) return;
        const e = email.value.trim();
        const s = senha.value;
        if (!e) { diz('Informe o e-mail.', true); email.focus(); return; }
        if (s.length < 6) { diz('A senha precisa de pelo menos 6 caracteres.', true); senha.focus(); return; }

        trava(true);
        try {
          if (modo === 'entrar') {
            const { error } = await cliente.auth.signInWithPassword({ email: e, password: s });
            if (error) throw error;
            UI.closeModal();
            resolve();
            return;
          }

          const { data, error } = await cliente.auth.signUp({
            email: e,
            password: s,
            options: {
              data: { full_name: nome.value.trim() || e.split('@')[0] },
              emailRedirectTo: location.href.split('#')[0]
            }
          });
          if (error) throw error;

          // Com "Confirm email" ligado no projeto, signUp não abre sessão:
          // devolve um usuário sem session. Aí o certo é avisar, não fingir
          // que entrou.
          if (data && data.session) {
            UI.closeModal();
            resolve();
          } else {
            modo = 'entrar';
            campoNome.style.display = 'none';
            diz('Conta criada. Confirme pelo link enviado ao seu e-mail e depois entre.');
          }
        } catch (err) {
          diz(traduz(err), true);
        }
        trava(false);
      }

      const botaoPrincipal = el('button', { class: 'btn btn-primary', type: 'button', onclick: enviar }, 'Entrar');
      const titulo = el('h3', { class: 'login-title', text: 'Entrar na sua conta' });

      [email, senha, nome].forEach((campo) => {
        campo.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); enviar(); } });
      });

      /* Só entra na tela o que o projeto realmente aceita. */
      if (!aceita.cadastro) alternar.style.display = 'none';
      const alternativas = [aceita.google ? comGoogle : null, linkMagico].filter(Boolean);

      const corpo = el('div', { class: 'login-box' }, [
        titulo,
        el('p', { class: 'login-sub', text: 'Sua conta serve para ver os mesmos dados no PC e no celular. Sem ela, o app continua funcionando neste aparelho.' }),
        el('label', { class: 'field' }, [el('span', { class: 'field-label', text: 'E-mail' }), email]),
        campoNome,
        el('label', { class: 'field' }, [el('span', { class: 'field-label', text: 'Senha' }), senha]),
        aviso,
        el('div', { class: 'login-actions' }, [botaoPrincipal, alternar, esqueci]),
        el('div', { class: 'login-sep' }, el('span', { text: 'ou' })),
        el('div', { class: 'login-alt' }, alternativas),
        aceita.confirmaEmail
          ? el('p', { class: 'hint', style: { marginTop: '10px' } },
            'Ao criar a conta você recebe um link de confirmação por e-mail. É preciso abri-lo antes do primeiro login.')
          : null
      ].filter(Boolean));

      UI.openModal({
        title: 'Conta OAZE',
        body: corpo,
        buttons: [{
          label: 'Agora não', class: 'btn-outline',
          onClick: () => {
            UI.closeModal();
            const err = new Error('Login cancelado.');
            err.silencioso = true;
            reject(err);
          }
        }]
      });

      setTimeout(() => email.focus(), 60);
    });
  }

  /* ---------------- o backend ---------------- */

  const SB = {
    nome: 'supabase',
    prioridade: 10,                 // vem antes do Firebase quando os dois existem
    rotuloEntrar: 'Entrar',
    marca: () => null,
    isConfigured: () => !!cfg(),

    async conectar() {
      const c = cfg();
      if (!c) throw new Error('Supabase não configurado.');
      await loadSDK();
      if (cliente) return;

      cliente = global.supabase.createClient(c.url, c.chave, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,   // volta do Google e do link mágico
          storageKey: 'oaze.supabase.auth',
          flowType: 'pkce'
        }
      });

      cliente.auth.onAuthStateChange((evento, session) => {
        if (evento === 'TOKEN_REFRESHED') return;   // não é troca de conta
        Sync._onUser(mapUser(session));
      });

      await lerProvedores(c);

      // sessão já existente neste aparelho
      const { data } = await cliente.auth.getSession();
      Sync._onUser(mapUser(data && data.session));
    },

    entrar: () => abrirLogin(),

    sair: () => cliente.auth.signOut(),

    async observar(u) {
      const { data, error } = await cliente
        .from(TABELA).select('profiles').eq('user_id', u.uid).maybeSingle();

      if (error) {
        console.error('Sync/leitura:', error);
        // 42P01 = relação não existe; PGRST116/42501 = barrado pelo RLS
        const falta = String(error.code || '') === '42P01';
        Sync._setState('offline', falta
          ? 'A tabela "dados" não existe no seu projeto. Rode docs/supabase.sql no SQL Editor.'
          : traduz(error));
        return;
      }

      Sync._onRemote(data && data.profiles);

      canal = cliente.channel('oaze-dados-' + u.uid)
        .on('postgres_changes', {
          event: '*', schema: 'public', table: TABELA, filter: 'user_id=eq.' + u.uid
        }, (msg) => {
          const novo = msg && msg.new;
          if (novo && novo.profiles) Sync._onRemote(novo.profiles);
        })
        .subscribe((status) => {
          // Sem Realtime ligado na tabela o canal nunca abre. Não é
          // motivo para dizer que está offline: gravar e ler seguem
          // funcionando; só não chega aviso de outro aparelho sozinho.
          if (status === 'CHANNEL_ERROR') {
            console.info('Sync: tempo real indisponível — ative Realtime na tabela "dados" se quiser atualização automática.');
          }
        });
    },

    async publicar(payload) {
      const u = Sync.currentUser();
      if (!u) return;
      const { error } = await cliente.from(TABELA).upsert({
        user_id: u.uid,
        profiles: payload.profiles,
        meta: payload.meta,
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id' });
      if (error) throw new Error(traduz(error));
    },

    soltar() {
      if (canal) { try { cliente.removeChannel(canal); } catch (e) { /* ignora */ } }
      canal = null;
    },

    ajuda() {
      return el('div', {}, [
        el('p', { style: { fontSize: '13.5px', lineHeight: '1.65', marginTop: '12px' } },
          'Este app está ligado a um projeto Supabase. O login acontece aqui dentro, com e-mail e senha.'),
        el('ol', { style: { paddingLeft: '20px', listStyle: 'decimal', fontSize: '13px', lineHeight: '1.75', marginTop: '10px' } }, [
          el('li', { html: 'Crie um projeto em <strong>supabase.com/dashboard</strong>.' }),
          el('li', { html: 'Em <strong>⚙ Project Settings → API</strong>, copie a <em>Project URL</em> e a chave <em>anon</em> para <code>assets/js/supabase-config.js</code>.' }),
          el('li', { html: 'No <strong>SQL Editor</strong>, rode o conteúdo de <code>docs/supabase.sql</code>: ele cria a tabela <code>dados</code> e as políticas de RLS.' }),
          el('li', { html: 'Em <strong>Authentication → Providers → Email</strong>, deixe ativado. Para testar sem confirmar e-mail, desligue <em>Confirm email</em>.' }),
          el('li', { html: 'Em <strong>Authentication → URL Configuration</strong>, ponha o endereço do site em <em>Site URL</em> e em <em>Redirect URLs</em>.' }),
          el('li', { html: 'Opcional: ative <strong>Google</strong> em Providers e ligue <strong>Realtime</strong> na tabela <code>dados</code> para atualização automática entre aparelhos.' })
        ]),
        el('p', {
          class: 'hint',
          html: 'A proteção de verdade é o RLS: cada conta só lê e grava a linha onde <code>user_id = auth.uid()</code>. ' +
            'A chave <code>anon</code> pode ser pública — o que não pode é publicar a <code>service_role</code>, que ignora o RLS.'
        })
      ]);
    }
  };

  /* O UGLEZ precisa do access token da sessão para chamar a Edge
     Function. Expor o cliente é mais honesto do que guardar uma
     cópia do token em outro lugar. */
  SB.cliente = () => cliente;

  Sync.registerBackend(SB);
  global.SupabaseBackend = SB;
})(window);
