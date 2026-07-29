-- =====================================================================
-- Ruptura VTT — remove_campaign_member (limpeza transacional de controles)
-- Migration: 0055_remove_campaign_member
--
-- Comportamento administrativo exigido pela lacuna 1 (revisão 4, §13.2):
-- ao remover um participante, os controles de personagem associados a
-- ele são apagados NA MESMA TRANSAÇÃO — mas isso é limpeza de dados,
-- não o mecanismo real de negação de acesso. A negação de acesso já
-- acontece independentemente disso, porque is_character_controller_for/
-- can_read_character (migrations 0051/0052) exigem is_campaign_member
-- (status='active') além da linha em character_controllers — defesa em
-- profundidade, comprovada pelo teste comportamental 12 (§13.8), que
-- simula a limpeza falhando e confirma que o acesso ainda é negado.
-- =====================================================================

begin;

create or replace function remove_campaign_member(
  p_campaign_id uuid,
  p_user_id uuid
) returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_role text;
begin
  if not is_campaign_owner(p_campaign_id) then
    raise exception 'Só o narrador dono da campanha pode remover participantes.' using errcode = 'insufficient_privilege';
  end if;

  select role into v_role from campaign_members
    where campaign_id = p_campaign_id and user_id = p_user_id;

  if v_role = 'owner' then
    raise exception 'O narrador dono da campanha não pode remover a si mesmo.' using errcode = 'insufficient_privilege';
  end if;

  update campaign_members
     set status = 'removed', updated_at = now()
   where campaign_id = p_campaign_id and user_id = p_user_id;

  delete from character_controllers
   where campaign_id = p_campaign_id and user_id = p_user_id;
end;
$$;
revoke all on function remove_campaign_member(uuid, uuid) from public;
revoke all on function remove_campaign_member(uuid, uuid) from anon;
grant execute on function remove_campaign_member(uuid, uuid) to authenticated;

commit;
