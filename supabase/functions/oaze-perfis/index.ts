/* Convites de perfil: um link, uma conta convidada, leitura ou edição.
   O documento financeiro do dono nunca e exposto pela Data API. */
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { corpoCabeNoLimite, reservarRateLimit, sha256 } from '../_shared/security.ts';

const origins = (Deno.env.get('OAZE_ALLOWED_ORIGINS') ?? '').split(',').map((x) => x.trim()).filter(Boolean);
const cors = (origin: string | null) => ({
  'Access-Control-Allow-Origin': origin && origins.includes(origin) ? origin : 'null',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  Vary: 'Origin', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer'
});
const reply = (origin: string | null, status: number, body: unknown) => new Response(JSON.stringify(body), {
  status, headers: { ...cors(origin), 'content-type': 'application/json; charset=utf-8' }
});
const idOk = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(value);
const uuidOk = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9-]{36}$/i.test(value);

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('Origin');
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(origin) });
  if (req.method !== 'POST') return reply(origin, 405, { erro: 'Metodo nao permitido.' });
  if (origin && !origins.includes(origin)) return reply(origin, 403, { erro: 'Origem nao autorizada.' });
  if (!corpoCabeNoLimite(req, 2048)) return reply(origin, 413, { erro: 'Requisicao grande demais.' });
  const url = Deno.env.get('SUPABASE_URL') ?? '';
  const anon = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!url || !anon || !service) return reply(origin, 503, { erro: 'Compartilhamento indisponivel.' });
  const authorization = req.headers.get('Authorization') ?? '';
  if (!authorization.startsWith('Bearer ')) return reply(origin, 401, { erro: 'Entre na sua conta.' });
  const auth = createClient(url, anon, { global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false } });
  const { data: verified, error: authError } = await auth.auth.getUser();
  const user = verified?.user;
  if (authError || !user || !user.email_confirmed_at) return reply(origin, 401, { erro: 'Confirme seu e-mail e entre novamente.' });
  const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
  let body: Record<string, unknown>;
  try {
    const raw = await req.text();
    if (new TextEncoder().encode(raw).length > 2048) return reply(origin, 413, { erro: 'Requisicao grande demais.' });
    body = JSON.parse(raw);
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('body');
  } catch { return reply(origin, 400, { erro: 'Requisicao invalida.' }); }
  const action = body.action;
  if (!['list', 'create', 'accept', 'read', 'revoke', 'set_permission'].includes(String(action))) return reply(origin, 400, { erro: 'Acao invalida.' });
  try {
    const rate = await reservarRateLimit(admin, action === 'read' ? 'perfis_leitura' : 'perfis',
      user.id, action === 'read' ? 600 : 120, 3600);
    if (!rate.permitido) return reply(origin, 429, { erro: 'Muitas tentativas. Aguarde um pouco.' });
    if (action === 'create') {
      if (!idOk(body.profileId)) return reply(origin, 400, { erro: 'Perfil invalido.' });
      const permission = body.permission === undefined ? 'read' : body.permission;
      if (permission !== 'read' && permission !== 'edit') return reply(origin, 400, { erro: 'Permissao invalida.' });
      if (body.label !== undefined && typeof body.label !== 'string') return reply(origin, 400, { erro: 'Identificacao invalida.' });
      const label = String(body.label ?? '').trim();
      if (label.length > 60) return reply(origin, 400, { erro: 'Identificacao longa demais.' });
      const { data: doc, error: docError } = await admin.from('dados').select('profiles').eq('user_id', user.id).maybeSingle();
      if (docError) throw docError;
      const profile = doc?.profiles?.[body.profileId];
      if (!profile) return reply(origin, 404, { erro: 'Perfil nao encontrado.' });
      const { count, error: countError } = await admin.from('oaze_profile_shares').select('id', { count: 'exact', head: true })
        .eq('owner_id', user.id).is('revoked_at', null);
      if (countError) throw countError;
      if ((count ?? 0) >= 20) return reply(origin, 409, { erro: 'Revogue um convite antes de criar outro.' });
      const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) => b.toString(16).padStart(2, '0')).join('');
      const { data, error } = await admin.from('oaze_profile_shares').insert({
        owner_id: user.id, profile_id: body.profileId, permission, label, token_hash: await sha256(token),
        expires_at: new Date(Date.now() + 7 * 86400000).toISOString()
      }).select('id,expires_at').single();
      if (error) throw error;
      return reply(origin, 200, { id: data.id, permission, expiresAt: data.expires_at,
        link: 'https://oaze.site/app?convite=' + token });
    }
    if (action === 'accept') {
      const token = body.token;
      if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) return reply(origin, 400, { erro: 'Convite invalido.' });
      const hash = await sha256(token);
      const { data: invite, error: inviteError } = await admin.from('oaze_profile_shares')
        .select('id,owner_id,profile_id,recipient_id,revoked_at,expires_at,permission')
        .eq('token_hash', hash).maybeSingle();
      if (inviteError) throw inviteError;
      if (invite?.recipient_id === user.id && !invite.revoked_at) return reply(origin, 200, { id: invite.id, permission: invite.permission, ok: true });
      if (!invite || invite.owner_id === user.id || invite.recipient_id || invite.revoked_at ||
          new Date(invite.expires_at).getTime() <= Date.now())
        return reply(origin, 410, { erro: 'Convite expirado, ja usado ou indisponivel.' });
      const { data: doc, error: docError } = await admin.from('dados').select('profiles')
        .eq('user_id', invite.owner_id).maybeSingle();
      if (docError) throw docError;
      if (!doc?.profiles?.[invite.profile_id]) return reply(origin, 410, { erro: 'Este perfil nao existe mais.' });
      const { data, error } = await admin.from('oaze_profile_shares').update({
        recipient_id: user.id, accepted_at: new Date().toISOString()
      }).eq('id', invite.id).is('recipient_id', null).is('revoked_at', null)
        .gt('expires_at', new Date().toISOString()).select('id').maybeSingle();
      if (error) throw error;
      if (!data) return reply(origin, 410, { erro: 'Convite ja utilizado.' });
      return reply(origin, 200, { id: data.id, permission: invite.permission, ok: true });
    }
    if (action === 'list') {
      const { data: owned, error: ownedError } = await admin.from('oaze_profile_shares')
        .select('id,profile_id,recipient_id,created_at,expires_at,accepted_at,revoked_at,permission,label')
        .eq('owner_id', user.id).is('revoked_at', null).order('created_at', { ascending: false }).limit(30);
      const { data: received, error: receivedError } = await admin.from('oaze_profile_shares')
        .select('id,owner_id,profile_id,accepted_at,permission').eq('recipient_id', user.id)
        .is('revoked_at', null).order('accepted_at', { ascending: false }).limit(30);
      if (ownedError || receivedError) throw ownedError || receivedError;
      const owners = [...new Set((received ?? []).map((row) => row.owner_id))];
      const docs = await Promise.all(owners.map(async (ownerId) => {
        const { data, error } = await admin.from('dados').select('profiles').eq('user_id', ownerId).maybeSingle();
        if (error) throw error;
        return [ownerId, data?.profiles ?? {}] as const;
      }));
      const maps = new Map(docs);
      return reply(origin, 200, {
        owned: (owned ?? []).map((row) => ({ id: row.id, profile_id: row.profile_id, label: row.label,
          accepted: !!row.recipient_id, permission: row.permission, created_at: row.created_at, expires_at: row.expires_at })),
        received: (received ?? []).filter((row) => maps.get(row.owner_id)?.[row.profile_id])
          .map((row) => ({ id: row.id, permission: row.permission,
            name: String(maps.get(row.owner_id)?.[row.profile_id]?.name ?? 'Perfil compartilhado').slice(0, 60) }))
      });
    }
    if (!uuidOk(body.id)) return reply(origin, 400, { erro: 'Compartilhamento invalido.' });
    if (action === 'set_permission') {
      if (body.permission !== 'read' && body.permission !== 'edit') return reply(origin, 400, { erro: 'Permissao invalida.' });
      const { data, error } = await admin.from('oaze_profile_shares').update({ permission: body.permission })
        .eq('id', body.id).eq('owner_id', user.id).is('revoked_at', null)
        .select('id,permission').maybeSingle();
      if (error) throw error;
      return reply(origin, data ? 200 : 404, data ? { ok: true, permission: data.permission } : { erro: 'Convite nao encontrado.' });
    }
    if (action === 'revoke') {
      const { data, error } = await admin.from('oaze_profile_shares').update({ revoked_at: new Date().toISOString() })
        .eq('id', body.id).is('revoked_at', null).or(`owner_id.eq.${user.id},recipient_id.eq.${user.id}`)
        .select('id').maybeSingle();
      if (error) throw error;
      return reply(origin, data ? 200 : 404, data ? { ok: true } : { erro: 'Acesso nao encontrado.' });
    }
    const { data: share, error: shareError } = await admin.from('oaze_profile_shares')
      .select('id,owner_id,profile_id,permission').eq('id', body.id).eq('recipient_id', user.id)
      .is('revoked_at', null).not('accepted_at', 'is', null).maybeSingle();
    if (shareError) throw shareError;
    if (!share) return reply(origin, 404, { erro: 'Acesso nao encontrado ou revogado.' });
    const { data: doc, error: docError } = await admin.from('dados').select('profiles')
      .eq('user_id', share.owner_id).maybeSingle();
    if (docError) throw docError;
    const profile = doc?.profiles?.[share.profile_id];
    if (!profile) return reply(origin, 404, { erro: 'O perfil foi removido pelo dono.' });
    const { data: subscription, error: subscriptionError } = await admin.from('subscriptions')
      .select('plan_id,status,current_period_end').eq('user_id', share.owner_id).maybeSingle();
    if (subscriptionError) throw subscriptionError;
    const paid = subscription && ['active','past_due','canceled'].includes(subscription.status)
      && (!subscription.current_period_end || new Date(subscription.current_period_end).getTime() > Date.now());
    const planId = paid ? subscription.plan_id : 'free';
    const { data: entitlements, error: entitlementError } = await admin.from('plan_entitlements')
      .select('chave,tipo,limite,ativo').eq('plan_id', planId);
    if (entitlementError) throw entitlementError;
    const rights = { limites: {} as Record<string, number | null>, recursos: {} as Record<string, boolean> };
    for (const entry of entitlements ?? []) {
      if (entry.tipo === 'limite') rights.limites[entry.chave] = entry.limite;
      if (entry.tipo === 'recurso') rights.recursos[entry.chave] = !!entry.ativo;
    }
    const fields = ['id', 'name', 'updatedAt', 'accounts', 'cards', 'categories',
      'transactions', 'investments', 'invoices', 'automation', 'budgets', 'goals'];
    const visible = Object.fromEntries(fields.filter((key) => Object.hasOwn(profile, key))
      .map((key) => [key, profile[key]]));
    return reply(origin, 200, { profile: visible, shareId: share.id,
      permission: share.permission, readOnly: share.permission !== 'edit', rights });
  } catch (error) {
    console.error('oaze-perfis:', error);
    return reply(origin, 500, { erro: 'Nao foi possivel concluir. Tente novamente.' });
  }
});
