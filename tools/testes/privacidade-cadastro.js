/* Aceite obrigatório da Política de privacidade, da tela ao banco. */
'use strict';

const fs = require('fs');
const path = require('path');
const RAIZ = path.join(__dirname, '..', '..');
const ler = (...p) => fs.readFileSync(path.join(RAIZ, ...p), 'utf8');
const falhas = [];
const exigir = (ok, msg) => { if (!ok) falhas.push(msg); };

const paginas = ['cadastro.html', 'en/cadastro.html', 'fr/cadastro.html', 'es/cadastro.html'];
paginas.forEach((pagina) => {
  const h = ler(pagina);
  exigir(/id="aceite-privacidade"/.test(h), pagina + ' não mostra o aceite');
  exigir(h.indexOf('id="aceite-privacidade"') < h.indexOf('id="social"'),
    pagina + ' mostra os métodos de cadastro antes da privacidade');
  exigir(/id="botao-cadastrar" disabled/.test(h), pagina + ' libera cadastro antes do aceite');
  exigir(/aceiteObrigatorio\(\)/.test(h), pagina + ' não valida o aceite no envio');
  exigir(/A\.novoAceite\(['"]cadastro_email['"]\)/.test(h), pagina + ' não envia a versão aceita');
  exigir(/oauth_/.test(h) && /guardarAceitePendente/.test(h), pagina + ' deixa OAuth sem evidência pendente');
});

const auth = ler('assets', 'js', 'site-auth.js');
/* O bloqueio do primeiro uso mudou de casa: era um modal trancado
   do painel anterior, hoje é a própria tela do aplicativo, que não
   carrega dado nenhum antes do aceite. É uma trava melhor — não há
   modal para fechar por engano. */
const gate = ler('preview-v3', 'live-backend.js');
const sql = ler('supabase', 'migrations', '20260917211553_exigir_aceite_privacidade.sql');
const config = ler('supabase', 'config.toml');

exigir(/privacy_policy_version/.test(auth) && /privacy_accepted_at/.test(auth),
  'cadastro por e-mail não envia versão e data do aceite');
exigir(/privacy_acceptances/.test(gate) && /\.eq\('user_id', user\.id\)/.test(gate),
  'o app não verifica o aceite da própria conta');
exigir(/await requirePrivacyAcceptance\(\)/.test(gate),
  'o boot não exige a verificação de privacidade antes de carregar dados');
exigir(/v3-privacy-decline[\s\S]{0,400}?auth\.signOut/.test(gate),
  'recusar o aceite não encerra a sessão');
exigir(/enable row level security/i.test(sql), 'privacy_acceptances está sem RLS');
exigir(/for select[\s\S]*?auth\.uid\(\)[\s\S]*?for insert[\s\S]*?auth\.uid\(\)/i.test(sql),
  'as políticas não limitam leitura e inserção ao próprio usuário');
exigir(!/grant\s+(update|delete)/i.test(sql), 'o aceite imutável ganhou UPDATE ou DELETE');
exigir(/validar_aceite_privacidade/.test(sql) && /privacy_policy_required/.test(sql),
  'o hook de criação não recusa e-mail sem aceite');
exigir(/\[auth\.hook\.before_user_created\][\s\S]*?enabled\s*=\s*true/.test(config),
  'o hook antes de criar usuário não está ligado');

if (falhas.length) {
  console.error('Aceite de privacidade incompleto:');
  falhas.forEach((f) => console.error('  - ' + f));
  process.exit(1);
}
console.log('OK — privacidade é aceita antes do cadastro e conferida antes do primeiro uso.');
