-- Alterar uma regra exige apagar e confirmar outra. Sem UPDATE direto,
-- ninguém consegue mover uma memória para um perfil não autorizado.
drop policy if exists coco_memories_own_update on public.coco_memories;
revoke update on public.coco_memories from authenticated;
