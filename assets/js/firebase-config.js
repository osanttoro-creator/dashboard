/* =============================================================
   firebase-config.js — credenciais do SEU projeto Firebase
   ------------------------------------------------------------
   COLE AQUI os valores do seu projeto. Onde encontrar:

     console.firebase.google.com
       → seu projeto
       → ⚙ Configurações do projeto
       → aba "Geral" → role até "Seus apps"
       → registre um app da Web (</>) se ainda não tiver
       → copie o objeto firebaseConfig

   Deixe como está (vazio) para NÃO usar sincronização: o app
   funciona normalmente só com o localStorage, isolado por
   aparelho, e o botão de login nem aparece.

   ------------------------------------------------------------
   ESTES VALORES PODEM FICAR PÚBLICOS. Não são segredo: são
   identificadores do projeto, e o próprio Firebase os embute no
   front-end de qualquer app web. Quem protege os seus dados são
   as REGRAS do Realtime Database (veja o README), que só deixam
   cada conta ler e escrever em /usuarios/{o próprio uid}.

   Mesmo assim, vale restringir a chave em
   console.cloud.google.com → APIs e serviços → Credenciais →
   sua chave → "Restrições de aplicativo" → Sites, e listar só o
   domínio do seu site. Isso impede que alguém use a sua cota.
   ============================================================= */
window.FirebaseConfig = {
  apiKey: '',
  authDomain: '',        // ex.: seu-projeto.firebaseapp.com
  databaseURL: '',       // ex.: https://seu-projeto-default-rtdb.firebaseio.com
  projectId: '',         // ex.: seu-projeto
  storageBucket: '',     // opcional para este app
  messagingSenderId: '', // opcional para este app
  appId: ''              // opcional para este app
};
