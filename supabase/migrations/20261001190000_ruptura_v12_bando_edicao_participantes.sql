-- RUPTURA v1.2 — Bando: edição por todos os participantes.
--
-- Decisão de 01/10/2026: todos os participantes editam a ficha do bando
-- (antes, só o narrador). A escrita continua só pela RPC, com revisão
-- otimista e os CHECKs de `campaign_crews`.

create or replace function public.save_campaign_crew(
  p_campaign_id uuid,
  p_state jsonb,
  p_expected_revision integer
) returns public.campaign_crews
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row campaign_crews;
begin
  if auth.uid() is null
     or not (is_campaign_member(p_campaign_id, auth.uid()) or is_campaign_owner(p_campaign_id, auth.uid())) then
    raise exception 'Só participantes da campanha alteram o bando.' using errcode = '42501';
  end if;

  if p_expected_revision = 0 then
    insert into campaign_crews (campaign_id, state)
    values (p_campaign_id, p_state)
    on conflict (campaign_id) do nothing
    returning * into v_row;
    if v_row.campaign_id is null then
      raise exception 'revision_conflict: o bando já existe.' using errcode = 'check_violation';
    end if;
    return v_row;
  end if;

  update campaign_crews
     set state = p_state, revision = revision + 1, updated_at = now()
   where campaign_id = p_campaign_id and revision = p_expected_revision
  returning * into v_row;
  if v_row.campaign_id is null then
    raise exception 'revision_conflict: o bando foi alterado em outra janela.' using errcode = 'check_violation';
  end if;
  return v_row;
end;
$$;

comment on table public.campaign_crews is 'Bando Refratário (RUPTURA v1.2, cap. 10): estado 1:1 com a campanha; participantes leem e editam via save_campaign_crew.';
