/* Segurança comum das Edge Functions do OAZE.
   Nenhum identificador pessoal vai em claro para a tabela de limite. */

export async function sha256(valor: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(valor));
  return Array.from(new Uint8Array(bytes))
    .map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function corpoCabeNoLimite(req: Request, maxBytes: number): boolean {
  const declarado = Number(req.headers.get('content-length') || '0');
  return !Number.isFinite(declarado) || declarado <= 0 || declarado <= maxBytes;
}

export async function reservarRateLimit(
  admin: any,
  escopo: string,
  identificador: string,
  limite: number,
  janelaSegundos: number
): Promise<{ permitido: boolean; restante: number; tentarEm: number }> {
  const identificadorHash = await sha256('oaze:' + escopo + ':' + identificador);
  const { data, error } = await admin.rpc('reservar_rate_limit', {
    p_identificador_hash: identificadorHash,
    p_escopo: escopo,
    p_limite: limite,
    p_janela_segundos: janelaSegundos
  });
  if (error) throw new Error('rate_limit_indisponivel');
  const r = Array.isArray(data) ? data[0] : data;
  if (!r) throw new Error('rate_limit_indisponivel');
  return {
    permitido: !!r.out_permitido,
    restante: Number(r.out_restante ?? 0),
    tentarEm: Number(r.out_tentar_em ?? janelaSegundos)
  };
}

export function origemDoCliente(req: Request): string {
  const encaminhado = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim();
  return encaminhado || req.headers.get('cf-connecting-ip') || 'sem-ip';
}
