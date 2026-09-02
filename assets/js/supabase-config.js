/* =============================================================
   supabase-config.js — credenciais do SEU projeto Supabase
   ------------------------------------------------------------
   COLE AQUI os dois valores do seu projeto. Onde encontrar:

     supabase.com/dashboard
       → seu projeto
       → ⚙ Project Settings → API
       → "Project URL"  e  "Project API keys → anon / public"

   Deixe vazio para NÃO usar o Supabase: o app cai no Firebase
   (se configurado) ou funciona só com o localStorage, isolado
   por aparelho. Nada quebra.

   ------------------------------------------------------------
   A CHAVE ANON É PÚBLICA POR PROJETO — não é segredo. O próprio
   Supabase a chama de "publishable" e a embute no front-end de
   qualquer app web. Quem protege os seus dados é o RLS (Row
   Level Security) da tabela `dados`: cada linha só é legível e
   gravável pelo dono, comparando auth.uid() com user_id.

   O SQL que cria a tabela e as políticas está em
   docs/supabase.sql — sem rodá-lo, ninguém consegue ler nada,
   nem você.

   NUNCA cole aqui a chave `service_role`. Ela ignora o RLS por
   projeto e daria acesso total ao banco a quem abrisse o site.
   Ela só existe para uso em servidor.
   ============================================================= */
window.SupabaseConfig = {
  url: '',
  anonKey: ''
};
