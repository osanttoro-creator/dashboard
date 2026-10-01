-- Memórias só podem ser criadas no espaço que pertence ao usuário,
-- com consentimento ativo e aprendizado ligado. O cliente não é autoridade.
drop policy if exists coco_memories_own_insert on public.coco_memories;
create policy coco_memories_own_insert on public.coco_memories for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.dados d
      where d.user_id = (select auth.uid())
        and d.profiles ? profile_id
    )
    and exists (
      select 1 from public.coco_settings s
      where s.user_id = (select auth.uid())
        and s.consented_at is not null
        and s.revoked_at is null
        and s.learning_paused = false
    )
  );
