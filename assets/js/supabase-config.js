/* =============================================================
   supabase-config.js — credenciais do projeto Supabase
   ------------------------------------------------------------
   Este arquivo é o equivalente, aqui, ao que num projeto Next.js
   seriam as variáveis NEXT_PUBLIC_SUPABASE_*. A diferença é que
   este app não tem build: os scripts são carregados direto pelo
   navegador, e um `process.env` nunca chegaria até eles. O valor
   precisa estar num arquivo que o navegador leia — este.

   Quem guarda os valores de servidor é o Supabase, em secrets das
   Edge Functions — não há camada de servidor neste repositório.

   Onde encontrar os valores:
     supabase.com/dashboard → seu projeto
       → ⚙ Project Settings → API
       → "Project URL" e "Publishable key"

   Deixe vazio para NÃO sincronizar: o app funciona só com o
   localStorage, isolado por aparelho. Nada quebra — e o botão de
   entrar simplesmente não aparece.

   ------------------------------------------------------------
   A CHAVE PUBLICÁVEL É PÚBLICA POR PROJETO — não é segredo. O
   nome que o Supabase dá a ela ("publishable") diz exatamente
   isso: é feita para ir no front-end. Quem protege os seus dados
   é o RLS da tabela `dados`, que compara auth.uid() com user_id
   linha a linha. O SQL está em docs/supabase.sql.

   NUNCA cole aqui a chave `service_role` (nem uma `sb_secret_`).
   Ela ignora o RLS do projeto inteiro e daria acesso total ao
   banco a quem abrisse o site. Ela só existe para uso em servidor.
   ============================================================= */
window.SupabaseConfig = {
  url: 'https://gxwatircdhhetvzzlwwq.supabase.co',

  /* Chave publicável (formato sb_publishable_…), o padrão atual.
     `anonKey` continua aceito para projetos que ainda usam a chave
     legada em JWT. */
  publishableKey: 'sb_publishable_VsxS6BSgddkxRdx5I1AAqQ_1A6nRUxD',
  anonKey: '',

  /* ============================================================
     CLIENT ID DO GOOGLE — público, e precisa ser
     ------------------------------------------------------------
     Só o "num toque" usa este valor: para desenhar a bolha com a
     conta, o script da Google precisa saber de quem é o site antes
     de qualquer redirecionamento. O botão comum não usa nada disto
     -- ele sai para o Supabase, que guarda o par id+secret.

     Este é o identificador, não o segredo. Ele aparece na URL de
     qualquer site do mundo que tenha login do Google; o que nunca
     pode encostar aqui é o *client secret*, que fica só no painel
     do Supabase. Vazio desliga o num toque e não quebra nada. */
  googleClientId: '791319482863-rqbdu0mudbiepdiadggc59513lvp7db7.apps.googleusercontent.com',

  /* ============================================================
     ONDE A SESSÃO MORA — UMA CHAVE SÓ, E ESTA É A LINHA MAIS
     IMPORTANTE DESTE ARQUIVO
     ------------------------------------------------------------
     Existem DOIS clientes Supabase neste projeto, e é de propósito:
     site-auth.js atende as páginas públicas (leve, sem carregar as
     ~12.000 linhas do painel) e supabase-auth.js atende o
     aplicativo. Os dois falam com o mesmo projeto e devem
     compartilhar a MESMA sessão — "entrar em /entrar é estar
     dentro em /app" é a promessa do produto.

     E não compartilhavam. supabase-auth.js declarava
     storageKey: 'oaze.supabase.auth'; site-auth.js não declarava
     nada e caía no padrão do SDK, 'sb-<ref>-auth-token'. Duas
     gavetas diferentes no mesmo localStorage.

     O ESTRAGO, na ordem em que a pessoa encontrava:

       1. Criava a conta em /cadastro. A sessão ia para a gaveta A.
       2. Chegava em /app, que lia a gaveta B — vazia. O painel
          dizia "sem conta neste aparelho" e oferecia criar uma.
          Daí "o cadastro parece precisar ser feito duas vezes":
          precisava mesmo, porque eram dois cofres.
       3. Entrava de novo, agora por dentro do app. Sessão na
          gaveta B. Voltava para /precos e estava deslogado de
          novo.
       4. Fechava e reabria: dependendo de por onde entrasse, caía
          numa gaveta ou na outra. Daí "a sessão não fica salva".
       5. O link de confirmação de e-mail e o mágico usam PKCE, e o
          verificador é gravado em '<storageKey>-code-verifier'.
          Pedido numa gaveta, resgatado na outra: o link abria e não
          entrava, sem erro nenhum na tela.

     Um único nome, declarado aqui, encerra os cinco de uma vez. Ele
     não é derivado do id do projeto de propósito: assim uma
     migração de projeto não desloga todo mundo em silêncio.
     ============================================================ */
  storageKey: 'oaze.supabase.auth'
};
