/* =============================================================
   _shared/asaas.ts — a única porta do OAZE para a API do Asaas
   -------------------------------------------------------------
   SEGREDOS (supabase secrets set, nunca no repositório)
     ASAAS_API_KEY        chave da conta Asaas
     ASAAS_AMBIENTE       "producao" ou "sandbox" (padrão: sandbox)

   Falha FECHADO: sem chave, nenhuma chamada sai. E o ambiente
   padrão é o sandbox — cobrar de verdade tem de ser escolha
   explícita, não o que acontece quando alguém esquece uma variável.

   A chave nunca é registrada em log, nem o corpo das respostas: o
   Asaas devolve nome, e-mail e CPF do cliente.
   ============================================================= */

export class AsaasErro extends Error {
  constructor(public status: number, public codigo: string) {
    super('asaas ' + status + ' ' + codigo);
  }
}

export function asaasConfigurado(): boolean {
  return !!Deno.env.get('ASAAS_API_KEY');
}

function base(): string {
  return Deno.env.get('ASAAS_AMBIENTE') === 'producao'
    ? 'https://api.asaas.com/v3'
    : 'https://api-sandbox.asaas.com/v3';
}

export async function asaas(metodo: string, caminho: string, corpo?: unknown): Promise<any> {
  const chave = Deno.env.get('ASAAS_API_KEY');
  if (!chave) throw new AsaasErro(0, 'sem_chave');

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 20_000);
  try {
    const r = await fetch(base() + caminho, {
      method: metodo,
      headers: {
        access_token: chave,
        'content-type': 'application/json',
        'User-Agent': 'OAZE'
      },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
      signal: ctrl.signal
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      /* Só o CÓDIGO do erro sobe; a descrição pode repetir dado
         pessoal que veio no pedido. */
      throw new AsaasErro(r.status, String(j?.errors?.[0]?.code || 'http_' + r.status));
    }
    return j;
  } finally {
    clearTimeout(t);
  }
}

/** Data de hoje no fuso do OAZE, AAAA-MM-DD. */
export function hojeSP(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
}

/** Valor do Asaas (reais, número) em centavos inteiros. */
export function centavos(valor: unknown): number {
  return Math.round(Number(valor) * 100);
}
