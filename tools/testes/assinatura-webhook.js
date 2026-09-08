/* =============================================================
   assinatura-webhook.js — o portão do webhook aguenta?
   -------------------------------------------------------------
   O webhook do Mercado Pago é a ÚNICA coisa no OAZE que libera um
   plano. Ele é público por necessidade — quem chama é o provedor,
   que não tem sessão no Supabase — e quem faz o papel da
   autenticação é a assinatura HMAC do cabeçalho x-signature.

   Se essa verificação tiver furo, qualquer um na internet ativa
   qualquer plano para qualquer conta com um POST.

   Este arquivo reimplementa a MESMA construção de manifesto da
   Edge Function e testa o que costuma dar errado. Não é o código
   de produção rodando — é a especificação, escrita duas vezes, de
   forma que uma divergência apareça.

   COMO RODAR
     node tools/testes/assinatura-webhook.js
   ============================================================= */
'use strict';

const crypto = require('crypto');

/* ---------------------------------------------------------------
   a construção do manifesto — espelho da Edge Function
   ---------------------------------------------------------------
   Formato documentado:
     id:{data.id};request-id:{x-request-id};ts:{ts};

   TRÊS REGRAS QUE NÃO SÃO ÓBVIAS:
   · data.id vem da QUERY STRING, não do corpo
   · data.id entra MINÚSCULO
   · segmento ausente é OMITIDO INTEIRO, não deixado vazio
   --------------------------------------------------------------- */
function manifesto(dataId, requestId, ts) {
  let m = '';
  if (dataId) m += `id:${String(dataId).toLowerCase()};`;
  if (requestId) m += `request-id:${requestId};`;
  m += `ts:${ts};`;
  return m;
}

function assinar(segredo, msg) {
  return crypto.createHmac('sha256', segredo).update(msg).digest('hex');
}

function partes(cabecalho) {
  const out = {};
  String(cabecalho || '').split(',').forEach((p) => {
    const i = p.indexOf('=');
    if (i > 0) out[p.slice(0, i).trim()] = p.slice(i + 1).trim();
  });
  return { ts: out.ts || '', v1: out.v1 || '' };
}

function igualSemVazar(a, b) {
  if (a.length !== b.length) return false;
  let dif = 0;
  for (let i = 0; i < a.length; i++) dif |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return dif === 0;
}

/**
 * O portão, como a Edge Function o implementa.
 * Devolve { ok, motivo }.
 */
function portao(opcoes) {
  const { segredo, cabecalho, dataId, requestId, agoraMs, janelaMs = 5 * 60 * 1000 } = opcoes;

  const { ts, v1 } = partes(cabecalho);
  if (!ts || !v1) return { ok: false, motivo: 'sem_assinatura' };

  const esperado = assinar(segredo, manifesto(dataId, requestId, ts));
  if (!igualSemVazar(esperado, v1)) return { ok: false, motivo: 'assinatura_invalida' };

  /* O ts do Mercado Pago vem em SEGUNDOS. agoraMs e em
     milissegundos. Sem converter, a diferenca da ~1,7 trilhao e
     TODO webhook legitimo e recusado -- a integracao pareceria
     configurada e nenhum pagamento seria aplicado.
     Este teste nao pegava o defeito porque usava milissegundos nos
     casos, repetindo a mesma suposicao errada da implementacao. */
  const tsNum = Number(ts);
  const tsMs = tsNum < 1e11 ? tsNum * 1000 : tsNum;
  const idade = Math.abs(agoraMs - tsMs);
  if (!Number.isFinite(idade) || idade > janelaMs) return { ok: false, motivo: 'fora_da_janela' };

  return { ok: true, motivo: 'aceita' };
}

/* ---------------------------------------------------------------
   os casos
   --------------------------------------------------------------- */
const SEGREDO = 'segredo-de-teste-nao-e-real';
const AGORA = 1789000000000;               /* milissegundos, como Date.now() */
const TS_SEG = Math.floor(AGORA / 1000);   /* segundos, como o Mercado Pago manda */
const TS = String(TS_SEG);

/* ATENÇÃO — POR QUE OS MANIFESTOS ABAIXO SÃO LITERAIS
   A primeira versão deste arquivo assinava os casos "bons" chamando
   a mesma função manifesto() que o portão usa. Isso testava
   autoconsistência, não correção: removi a minusculização de
   propósito, as duas pontas passaram a errar igual, e os 13 casos
   continuaram passando.

   Um teste em que a especificação e a implementação são o mesmo
   código não verifica nada. Aqui os manifestos são escritos à mão,
   exatamente como o Mercado Pago documenta. Se manifesto() divergir
   da documentação, a assinatura deixa de bater — que é o ponto. */
const assinaLiteral = (m, ts = TS, segredo = SEGREDO) =>
  `ts=${ts},v1=${assinar(segredo, m)}`;

const casos = [
  {
    nome: 'assinatura correta',
    entrada: { cabecalho: assinaLiteral(`id:123456;request-id:req-abc;ts:${TS};`),
               dataId: '123456', requestId: 'req-abc' },
    espera: 'aceita'
  },
  {
    nome: 'id alfanumerico MAIUSCULO no cabecalho',
    /* O manifesto assinado usa minusculo; o id que chega pela query
       vem como veio. Se o portao nao minusculizar, isto reprova —
       e reprova SO em producao, onde os ids sao outros. */
    entrada: { cabecalho: assinaLiteral(`id:abc123;request-id:req-abc;ts:${TS};`),
               dataId: 'AbC123', requestId: 'req-abc' },
    espera: 'aceita'
  },
  {
    nome: 'sem x-request-id (segmento omitido)',
    entrada: { cabecalho: assinaLiteral(`id:123456;ts:${TS};`),
               dataId: '123456', requestId: '' },
    espera: 'aceita'
  },
  {
    nome: 'sem x-request-id, mas assinado COM segmento vazio',
    /* O erro classico: montar "request-id:;" em vez de omitir.
       Muda o hash, e a notificacao legitima e recusada. */
    entrada: {
      cabecalho: `ts=${TS},v1=${assinar(SEGREDO, `id:123456;request-id:;ts:${TS};`)}`,
      dataId: '123456', requestId: ''
    },
    espera: 'assinatura_invalida'
  },
  {
    nome: 'segredo errado (chave de teste em producao)',
    entrada: { cabecalho: assinaLiteral(`id:123456;request-id:req-abc;ts:${TS};`, TS, 'outro-segredo'),
               dataId: '123456', requestId: 'req-abc' },
    espera: 'assinatura_invalida'
  },
  {
    nome: 'data.id trocado depois de assinar',
    /* Alguem intercepta e troca o id do pagamento por outro,
       tentando aplicar um pagamento alheio a propria conta. */
    entrada: { cabecalho: assinaLiteral(`id:123456;request-id:req-abc;ts:${TS};`),
               dataId: '999999', requestId: 'req-abc' },
    espera: 'assinatura_invalida'
  },
  {
    nome: 'cabecalho ausente',
    entrada: { cabecalho: '', dataId: '123456', requestId: 'req-abc' },
    espera: 'sem_assinatura'
  },
  {
    nome: 'so ts, sem v1',
    entrada: { cabecalho: `ts=${TS}`, dataId: '123456', requestId: 'req-abc' },
    espera: 'sem_assinatura'
  },
  {
    nome: 'v1 vazio',
    entrada: { cabecalho: `ts=${TS},v1=`, dataId: '123456', requestId: 'req-abc' },
    espera: 'sem_assinatura'
  },
  {
    nome: 'replay de 1 hora atras',
    /* Assinatura perfeitamente valida, capturada e reenviada. Sem
       janela de tempo ela valeria para sempre. */
    entrada: {
      cabecalho: assinaLiteral(`id:123456;request-id:req-abc;ts:${TS_SEG - 3600};`, String(TS_SEG - 3600)),
      dataId: '123456', requestId: 'req-abc'
    },
    espera: 'fora_da_janela'
  },
  {
    nome: 'ts no futuro distante',
    entrada: {
      cabecalho: assinaLiteral(`id:123456;request-id:req-abc;ts:${TS_SEG + 3600};`, String(TS_SEG + 3600)),
      dataId: '123456', requestId: 'req-abc'
    },
    espera: 'fora_da_janela'
  },
  {
    nome: 'ts nao numerico',
    entrada: { cabecalho: `ts=ontem,v1=${assinar(SEGREDO, `id:123456;request-id:req-abc;ts:ontem;`)}`,
               dataId: '123456', requestId: 'req-abc' },
    espera: 'fora_da_janela'
  },
  {
    nome: 'v1 do tamanho certo, conteudo errado',
    /* Confere que a comparacao nao aceita por coincidencia de
       tamanho — e que o caminho de tempo constante foi exercitado. */
    entrada: { cabecalho: `ts=${TS},v1=${'0'.repeat(64)}`, dataId: '123456', requestId: 'req-abc' },
    espera: 'assinatura_invalida'
  }
];

/* ---------------------------------------------------------------
   roda
   --------------------------------------------------------------- */
console.log('');
console.log('  assinatura-webhook — o portao que libera planos');
console.log('  ' + '-'.repeat(62));

let falhas = 0;
casos.forEach((c) => {
  const r = portao(Object.assign({ segredo: SEGREDO, agoraMs: AGORA }, c.entrada));
  const ok = r.motivo === c.espera;
  if (!ok) falhas++;
  console.log('    ' + (ok ? 'ok   ' : 'FALHA') + ' ' +
    c.nome.padEnd(42) + r.motivo + (ok ? '' : '   (esperado ' + c.espera + ')'));
});

console.log('  ' + '-'.repeat(62));
if (falhas) {
  console.log('  ' + falhas + ' CASO(S) REPROVARAM — o portao tem furo');
  console.log('');
  process.exit(1);
}
console.log('  os ' + casos.length + ' casos passam');
console.log('');
