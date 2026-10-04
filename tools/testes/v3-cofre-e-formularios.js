'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..', '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const app = read('preview-v3/app.js');
const css = read('preview-v3/app.css');
const calendar = read('preview-v3/calendar.css');
const backend = read('preview-v3/live-backend.js');
const auth = read('assets/js/site-auth.js');
const register = read('cadastro.html');
const login = read('entrar.html');
const sql = read('supabase/migrations/20261003090000_cofre_pin.sql');
const edge = read('supabase/functions/oaze-cofre/index.ts');

assert.match(app, /d\.name\s*\|\|\s*d\.bank/, 'o cartão precisa usar o nome dado pelo usuário');
assert.match(app, /data-payment-kind/, 'o lançamento deve separar débito e crédito');
assert.match(app, /v3-repeat-fields/, 'os campos de recorrência devem ter visibilidade própria');
assert.match(app, /updateRepeatFields/, 'a recorrência deve responder à escolha do usuário');
assert.match(app, /v3-tx-fatura/, 'o crédito deve permitir escolher a fatura');
assert.match(app, /vaultUnlock/, 'o cofre deve pedir PIN antes de revelar dados');
assert.doesNotMatch(app, /name="bankPassword"|name="bankSenha"/, 'senha bancária não deve ser armazenada');
assert.match(css, /v3-goal-column\[data-column="goals"\]\{display:grid;grid-template-columns:repeat\(2,/, 'metas devem ter duas colunas');
assert.match(calendar, /grid-template-columns:\s*repeat\(7,/, 'semana deve manter sete dias lado a lado');

assert.match(auth, /A\.cadastrar[\s\S]*?auth\.signInWithOtp/, 'cadastro novo deve usar confirmação por e-mail');
assert.match(auth, /shouldCreateUser:\s*false/, 'login por link não pode criar conta sem aceite');
assert.doesNotMatch(register, /name="senha"/, 'cadastro novo não deve pedir senha');
assert.match(login, /id="form-magico"/, 'entrada deve oferecer link por e-mail');
assert.match(backend, /requirePinSetup\(\)/, 'usuário novo deve configurar o PIN antes do painel');

assert.match(sql, /enable row level security/i, 'cofre precisa de RLS');
assert.match(sql, /revoke all on public\.oaze_cofre from anon, authenticated/i, 'cliente não acessa tabela');
assert.match(sql, /gen_salt\('bf'/, 'PIN precisa de hash adaptativo');
assert.match(sql, /failures >= 5/, 'PIN precisa de bloqueio por tentativas');
assert.match(edge, /AES-GCM/, 'dados devem ser cifrados antes de gravar');
assert.match(edge, /auth\.auth\.getUser\(\)/, 'identidade deve ser confirmada no servidor');
assert.match(edge, /email_confirmed_at/, 'cofre exige e-mail confirmado');
assert.match(edge, /reservarRateLimit/, 'cofre exige limite de requisições');
assert.match(edge, /Cache-Control': 'no-store'/, 'resposta sensível não pode entrar no cache');

console.log('Fluxos V3 de cartão, calendário, entrada e cofre: ok');
