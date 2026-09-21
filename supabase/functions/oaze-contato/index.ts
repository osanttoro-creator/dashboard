/* =============================================================
   oaze-contato — o formulário da página de suporte
   -------------------------------------------------------------
   O QUE FAZ, NESTA ORDEM
     1. confere origem, tamanho e campos;
     2. aplica o limite de envio por origem (5 por hora);
     3. GRAVA a mensagem em public.mensagens_contato;
     4. só então tenta mandar o e-mail para a caixa do OAZE.

   A ordem 3 → 4 é o motivo de esta função existir. Antes o site
   apontava para um endereço que ninguém tinha confirmado que
   recebia; se o e-mail falhar agora — chave do provedor ausente,
   provedor fora do ar —, a mensagem está guardada e aparece no
   painel do Supabase. A pessoa que escreveu recebe "recebido" nos
   dois casos, porque nos dois casos foi recebido.

   SEGREDOS (supabase secrets set, nunca no repositório)
     RESEND_API_KEY      chave do Resend (resend.com). Sem ela, a
                         função grava e não envia — falha fechado.
     CONTATO_DESTINO     o e-mail que recebe as mensagens. No plano
                         gratuito do Resend, sem domínio verificado,
                         precisa ser o e-mail da própria conta Resend.
     CONTATO_REMETENTE   opcional. Padrão "OAZE <onboarding@resend.dev>",
                         o remetente de teste do Resend, que funciona
                         sem mexer no DNS. Com o domínio verificado,
                         trocar por algo como "OAZE <contato@oaze.site>".
     OAZE_ALLOWED_ORIGINS  as origens do site (já existe).

   PÚBLICA DE PROPÓSITO (verify_jwt = false no config.toml): quem
   escreve para o suporte muitas vezes é justamente quem não consegue
   entrar. O que protege a rota é a origem, o limite de envio, o
   campo-isca e os limites de tamanho — não o login.

   O que NUNCA vai para log: nome, e-mail e texto da mensagem.
   ============================================================= */

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { corpoCabeNoLimite, origemDoCliente, reservarRateLimit, sha256 } from '../_shared/security.ts';

const LIMITE_POR_HORA = 5;
const MAX_CORPO = 16 * 1024;
const IDIOMAS = ['pt', 'en', 'fr', 'es'];

/* ---------------- CORS ---------------- */

function origensPermitidas(): string[] {
  return (Deno.env.get('OAZE_ALLOWED_ORIGINS') ?? '')
    .split(',').map((o) => o.trim()).filter(Boolean);
}

function cors(origem: string | null): Record<string, string> {
  const ok = origem && origensPermitidas().includes(origem);
  return {
    'Access-Control-Allow-Origin': ok ? origem! : 'null',
    'Access-Control-Allow-Headers': 'content-type, apikey, x-client-info',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '3600',
    Vary: 'Origin'
  };
}

function json(corpo: unknown, status: number, origem: string | null) {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { ...cors(origem), 'Content-Type': 'application/json; charset=utf-8' }
  });
}

/* ---------------- campos ---------------- */

const EMAIL = /^[^\s@<>"]{1,64}@[^\s@<>"]{1,190}\.[a-z]{2,}$/i;

function limpo(v: unknown, max: number): string {
  return String(v ?? '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')   // controle, menos \n e \t
    .trim()
    .slice(0, max);
}

function escapar(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/* ---------------- envio ---------------- */

async function enviar(m: { nome: string; email: string; mensagem: string; idioma: string; pagina: string; id: string }):
  Promise<{ ok: true } | { ok: false; erro: string }> {
  const chave = Deno.env.get('RESEND_API_KEY');
  const destino = Deno.env.get('CONTATO_DESTINO');
  if (!chave || !destino) return { ok: false, erro: 'envio_nao_configurado' };

  const remetente = Deno.env.get('CONTATO_REMETENTE') || 'OAZE <onboarding@resend.dev>';
  const assunto = 'Contato pelo site — ' + m.nome.slice(0, 60);
  const texto =
    'Nome: ' + m.nome + '\n' +
    'E-mail: ' + m.email + '\n' +
    'Idioma: ' + m.idioma + (m.pagina ? '\nPágina: ' + m.pagina : '') + '\n' +
    'Protocolo: ' + m.id + '\n\n' +
    m.mensagem + '\n\n' +
    '— Responda este e-mail para responder a quem escreveu.';
  const html =
    '<p><strong>Nome:</strong> ' + escapar(m.nome) + '<br>' +
    '<strong>E-mail:</strong> ' + escapar(m.email) + '<br>' +
    '<strong>Idioma:</strong> ' + escapar(m.idioma) +
    (m.pagina ? '<br><strong>Página:</strong> ' + escapar(m.pagina) : '') + '<br>' +
    '<strong>Protocolo:</strong> ' + escapar(m.id) + '</p>' +
    '<p style="white-space:pre-wrap">' + escapar(m.mensagem) + '</p>' +
    '<p style="color:#666">Responda este e-mail para responder a quem escreveu.</p>';

  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + chave, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: remetente,
        to: [destino],
        /* Responder no próprio programa de e-mail já vai para quem
           escreveu — sem copiar e colar endereço. */
        reply_to: m.email,
        subject: assunto,
        text: texto,
        html
      }),
      signal: AbortSignal.timeout(10000)
    });
    if (r.ok) return { ok: true };
    /* O corpo do erro do Resend pode repetir o destinatário; sai só o
       status, que é o que diz o que houve (401 chave, 403 domínio…). */
    return { ok: false, erro: 'resend_' + r.status };
  } catch (_e) {
    return { ok: false, erro: 'resend_indisponivel' };
  }
}

/* ---------------- a rota ---------------- */

Deno.serve(async (req) => {
  const origem = req.headers.get('origin');
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origem) });
  if (req.method !== 'POST') return json({ erro: 'metodo' }, 405, origem);
  if (!origem || !origensPermitidas().includes(origem)) return json({ erro: 'origem' }, 403, origem);
  if (!corpoCabeNoLimite(req, MAX_CORPO)) return json({ erro: 'grande_demais' }, 413, origem);

  let corpo: Record<string, unknown>;
  try { corpo = await req.json(); } catch (_e) { return json({ erro: 'formato' }, 400, origem); }

  /* Campo-isca: invisível para pessoas, irresistível para robôs.
     Preenchido, responde "ok" e não grava nada — dizer ao robô que
     ele foi pego só o ensina a desviar. */
  if (limpo(corpo.site, 200)) return json({ ok: true }, 200, origem);

  const nome = limpo(corpo.nome, 100);
  const email = limpo(corpo.email, 200).toLowerCase();
  const mensagem = limpo(corpo.mensagem, 5000);
  const idioma = IDIOMAS.includes(String(corpo.idioma)) ? String(corpo.idioma) : 'pt';
  const pagina = limpo(corpo.pagina, 200);

  const faltas: string[] = [];
  if (!nome) faltas.push('nome');
  if (!EMAIL.test(email)) faltas.push('email');
  if (mensagem.length < 10) faltas.push('mensagem');
  if (faltas.length) return json({ erro: 'campos', campos: faltas }, 400, origem);

  const url = Deno.env.get('SUPABASE_URL') ?? '';
  const chaveServico = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const admin = createClient(url, chaveServico, { auth: { persistSession: false } });

  const quem = origemDoCliente(req);
  try {
    const limite = await reservarRateLimit(admin, 'contato', quem, LIMITE_POR_HORA, 3600);
    if (!limite.permitido) {
      return json({ erro: 'limite', tentarEm: limite.tentarEm }, 429, origem);
    }
  } catch (_e) {
    /* Sem o limitador, não aceitar: uma rota pública e aberta sem
       freio é convite. A pessoa recebe o erro e tenta de novo. */
    return json({ erro: 'indisponivel' }, 503, origem);
  }

  const { data, error } = await admin.from('mensagens_contato').insert({
    nome, email, mensagem, idioma, pagina: pagina || null,
    origem_hash: await sha256('oaze:contato:origem:' + quem)
  }).select('id').single();
  if (error || !data) {
    console.error('contato: falha ao gravar', error && error.code);
    return json({ erro: 'indisponivel' }, 503, origem);
  }

  const envio = await enviar({ nome, email, mensagem, idioma, pagina, id: data.id });
  await admin.from('mensagens_contato').update(
    envio.ok ? { enviado_em: new Date().toISOString() } : { erro_envio: envio.erro }
  ).eq('id', data.id);
  if (!envio.ok) console.warn('contato: gravada sem e-mail —', envio.erro);

  return json({ ok: true, protocolo: String(data.id).slice(0, 8) }, 200, origem);
});
