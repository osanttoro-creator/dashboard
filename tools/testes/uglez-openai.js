/* Contrato da integração UGLEZ -> OpenAI. */
'use strict';

const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..', '..');
const ler = (...partes) => fs.readFileSync(path.join(RAIZ, ...partes), 'utf8');
const funcao = ler('supabase', 'functions', 'oaze-assistant', 'index.ts');
const cliente = ler('assets', 'js', 'ai.js');
const config = ler('supabase', 'config.toml');
const falhas = [];

const exigir = (condicao, mensagem) => { if (!condicao) falhas.push(mensagem); };

exigir(/https:\/\/api\.openai\.com\/v1\/responses/.test(funcao),
  'a Edge Function não chama a Responses API');
exigir(/Deno\.env\.get\(['"]OPENAI_API_KEY['"]\)/.test(funcao),
  'a chave da OpenAI não vem do ambiente do servidor');
exigir(/\bstore:\s*false\b/.test(funcao),
  'a resposta financeira pode ser armazenada pela API');
exigir(/X-Client-Request-Id/.test(funcao),
  'a chamada não permite correlacionar falhas sem registrar conteúdo');
exigir(/<dados_financeiros>/.test(funcao) && /dados não confiáveis/.test(funcao),
  'dados controlados pelo usuário não estão separados das instruções');
exigir(/\\u0000-\\u001F/.test(funcao),
  'textos do resumo ainda aceitam caracteres de controle');
exigir(/auth\.getUser\(\)/.test(funcao),
  'a função não confirma o usuário autenticado');
exigir(/\[functions\.oaze-assistant\][\s\S]*?verify_jwt\s*=\s*true/.test(config),
  'o gateway não exige JWT para o UGLEZ');
exigir(/reservar_ia/.test(funcao) && /estornar_ia/.test(funcao),
  'a cota não tem reserva e estorno no servidor');
exigir(!/resposta\.status\s*===\s*429\s*\?\s*['"]limite['"]/.test(funcao),
  'a cota da OpenAI ainda é confundida com a cota do usuário');

exigir(/const porDia = new Map\(\)/.test(cliente),
  'despesas previstas não são agregadas por dia');
exigir(!/titulo:\s*String\(e\.description/.test(cliente),
  'a descrição individual de um lançamento ainda pode sair do navegador');
exigir(!/const SYSTEM\s*=/.test(cliente),
  'há um prompt de sistema morto ou controlável no navegador');
exigir(!/api\.openai\.com/.test(cliente),
  'o navegador fala diretamente com a OpenAI');
exigir(/name:\s*['"]propor_lancamento['"]/.test(funcao) && /strict:\s*true/.test(funcao),
  'a proposta de lançamento não usa uma ferramenta estrita');
exigir(/acao_proposta/.test(funcao) && /extrairAcao/.test(funcao),
  'a saída estruturada não é reconstruída e validada no servidor');
exigir(!/Store\.transactions\.(add|update)/.test(funcao),
  'a Edge Function ganhou acesso direto para alterar a carteira');
exigir(/renderAcaoProposta/.test(cliente) && /Forms\.openTransaction/.test(cliente),
  'a proposta não passa pelo formulário oficial para revisão');
exigir(/investimentos:\s*\{/.test(cliente) && /porTipo/.test(cliente),
  'a carteira de investimentos agregada não acompanha a pergunta');

if (falhas.length) {
  console.error('Contrato OpenAI do UGLEZ quebrado:');
  falhas.forEach((falha) => console.error('  - ' + falha));
  process.exit(1);
}

console.log('OK — UGLEZ usa a Responses API pelo servidor e só propõe ações revisáveis.');
