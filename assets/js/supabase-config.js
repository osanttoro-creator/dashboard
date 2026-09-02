/* =============================================================
   supabase-config.js — credenciais do projeto Supabase
   ------------------------------------------------------------
   Este arquivo é o equivalente, aqui, ao que num projeto Next.js
   seriam as variáveis NEXT_PUBLIC_SUPABASE_*. A diferença é que
   este app não tem build: os scripts são carregados direto pelo
   navegador, e um `process.env` nunca chegaria até eles. O valor
   precisa estar num arquivo que o navegador leia — este.

   O .env na raiz existe e traz os mesmos valores, mas quem o lê é
   só a camada de servidor (as funções em api/, via `vercel dev`).
   Ao trocar de projeto, troque nos DOIS lugares.

   Onde encontrar os valores:
     supabase.com/dashboard → seu projeto
       → ⚙ Project Settings → API
       → "Project URL" e "Publishable key"

   Deixe vazio para NÃO usar o Supabase: o app cai no Firebase (se
   configurado) ou funciona só com o localStorage, isolado por
   aparelho. Nada quebra.

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
  anonKey: ''
};
