/* Aceite obrigatório da Política de privacidade, da tela ao banco. */
'use strict';

const fs = require('fs');
const path = require('path');
const RAIZ = path.join(__dirname, '..', '..');
const ler = (...p) => fs.readFileSync(path.join(RAIZ, ...p), 'utf8');
const falhas = [];
const exigir = (ok, msg) => { if (!ok) falhas.push(msg); };

/* 12/11/2026: o site deixou de ter cadastro e entrada; a única conta
   criada pelo site é a de /assinar, e ela também pede o aceite antes. */
const assinar = ler('assinar.html');
exigir(/id="aceite"/.test(assinar), 'assinar.html não mostra o aceite');
exigir(assinar.indexOf('id="aceite"') < assinar.indexOf('id="btn-google"'),
  'assinar.html mostra os métodos de conta antes da privacidade');
exigir((assinar.match(/if \(!aceiteOk\(\)\) return;/g) || []).length >= 2,
  'assinar.html deixa algum caminho passar sem o aceite');
exigir(/A\.novoAceite\('assinar_email'\)/.test(assinar) && /A\.novoAceite\('assinar_google'\)/.test(assinar),
  'assinar.html não envia a versão aceita');

const auth = ler('assets', 'js', 'site-auth.js');
/* O bloqueio do primeiro uso mudou de casa: era um modal trancado
   do painel anterior, hoje é a própria tela do aplicativo, que não
   carrega dado nenhum antes do aceite. É uma trava melhor — não há
   modal para fechar por engano. */
const gate = ler('assets/app', 'live-backend.js');
const sql = ler('supabase', 'migrations', '20260917211553_exigir_aceite_privacidade.sql');
const config = ler('supabase', 'config.toml');

exigir(/privacy_policy_version/.test(auth) && /privacy_accepted_at/.test(auth),
  'cadastro por e-mail não envia versão e data do aceite');
exigir(/privacy_acceptances/.test(gate) && /\.eq\('user_id', user\.id\)/.test(gate),
  'o app não verifica o aceite da própria conta');
exigir(/await requireConsent\(\)/.test(gate),
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

/* A AUTORIZAÇÃO ÚNICA, NA PORTA
   O OAZE pedia três vezes: privacidade depois de entrar, Coco na
   primeira conversa, avisos pelo caminho. Agora a pergunta é uma só
   e acontece antes de a sessão existir. Estas verificações guardam
   as duas metades disso: a caixa existe e vem antes dos botões de
   entrada, e NENHUM dos caminhos (Google/Apple, link mágico, senha)
   passa sem consultá-la. */
/* entrar.html saiu com o painel web (12/11/2026). */
exigir(/coco: true/.test(auth), 'o aceite não cobre a Coco, e ela voltaria a perguntar');
exigir(/localStorage\.setItem\(CHAVE_ACEITE_PENDENTE/.test(auth),
  'o aceite não sobrevive à volta do link mágico, que abre outra aba');
exigir(/pendente\.coco/.test(gate), 'o app não aproveita a autorização da Coco feita na porta');

if (falhas.length) {
  console.error('Aceite de privacidade incompleto:');
  falhas.forEach((f) => console.error('  - ' + f));
  process.exit(1);
}
console.log('OK — privacidade é aceita antes do cadastro e conferida antes do primeiro uso.');
