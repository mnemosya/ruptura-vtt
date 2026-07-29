-- =====================================================================
-- Ruptura VTT — desacopla table_logs de campaign_profiles/profile_sessions
-- Migration: 0057_table_logs_decouple_profile
--
-- Passo 2 (continuação) da ordem interna segura — dependência adicional
-- descoberta durante a auditoria de dependências (§13.7 passo 5):
-- table_logs.profile_id (FK -> campaign_profiles) e
-- table_logs.profile_session_id (FK -> profile_sessions) precisavam ser
-- removidas ANTES de campaign_profiles/profile_sessions poderem ser
-- dropadas. `created_by_user_id` (já existente, sempre = auth.uid() de
-- quem registrou o evento) passa a ser a única forma de identificar
-- "meus logs privados" — substitui profile_id para o filtro de
-- visibilidade em listLogsForViewer (camada de aplicação).
-- =====================================================================

begin;

drop function if exists append_table_log(uuid, text, text, jsonb, uuid, uuid, uuid);

create or replace function append_table_log(
  p_campaign_id uuid,
  p_type text,
  p_visibility text,
  p_payload jsonb,
  p_character_id uuid default null
) returns table_logs
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_row table_logs;
begin
  if v_uid is null then
    raise exception 'É necessário estar autenticado para registrar um evento.' using errcode = 'insufficient_privilege';
  end if;

  if not is_campaign_member(p_campaign_id) then
    raise exception 'Você não é membro desta campanha.' using errcode = 'insufficient_privilege';
  end if;

  if p_visibility not in ('public', 'private', 'gm') then
    raise exception 'Visibilidade inválida.' using errcode = '22023';
  end if;

  if p_type is null or length(trim(both from p_type)) = 0 then
    raise exception 'Tipo de evento inválido.' using errcode = '22023';
  end if;

  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'Payload de log inválido — precisa ser um objeto.' using errcode = '22023';
  end if;

  if p_character_id is not null then
    if not can_manage_character(p_character_id) then
      raise exception 'Você não pode registrar eventos para este personagem.' using errcode = 'insufficient_privilege';
    end if;
    if not exists (select 1 from characters c where c.id = p_character_id and c.campaign_id = p_campaign_id) then
      raise exception 'Este personagem não pertence a esta campanha.' using errcode = 'insufficient_privilege';
    end if;
  end if;

  insert into table_logs (campaign_id, character_id, type, visibility, payload, created_by_user_id)
  values (p_campaign_id, p_character_id, p_type, p_visibility, p_payload, v_uid)
  returning * into v_row;

  return v_row;
end;
$$;
revoke all on function append_table_log(uuid, text, text, jsonb, uuid) from public;
revoke all on function append_table_log(uuid, text, text, jsonb, uuid) from anon;
grant execute on function append_table_log(uuid, text, text, jsonb, uuid) to authenticated;

alter table table_logs drop constraint if exists table_logs_profile_id_fkey;
alter table table_logs drop constraint if exists table_logs_profile_session_id_fkey;
alter table table_logs drop column if exists profile_id;
alter table table_logs drop column if exists profile_session_id;

commit;
