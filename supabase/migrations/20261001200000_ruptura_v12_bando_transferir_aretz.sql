-- RUPTURA v1.2 — Bando: aretz entre a carteira de um personagem e o caixa
-- coletivo (Fase 8, "transferência bidirecional entre personagem e Bando").
--
-- O capítulo 10 trata o caixa coletivo como organização da mesa: "aretz
-- guardados nele continuam sendo aretz e podem ser divididos ou gastos com o
-- consentimento do grupo". Por isso:
--   · qualquer participante movimenta o caixa (decisão de 01/10/2026: todos
--     editam o bando);
--   · do lado do personagem, só quem pode editá-lo: narrador ou controlador
--     com permissão "editar";
--   · a transferência é atômica (as duas linhas na mesma transação, com
--     bloqueio), mexe só em `carteira.aretz_informal` e nunca deixa saldo
--     negativo; a revisão do bando avança, para a ficha aberta reler.

create or replace function public.transfer_crew_aretz(
  p_campaign_id uuid,
  p_character_id uuid,
  p_amount integer,
  p_to_crew boolean
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_char characters;
  v_crew campaign_crews;
  v_carteira jsonb;
  v_saldo numeric;
  v_caixa numeric;
begin
  if v_uid is null
     or not (is_campaign_member(p_campaign_id, v_uid) or is_campaign_owner(p_campaign_id, v_uid)) then
    raise exception 'Só participantes da campanha movimentam o caixa do bando.' using errcode = '42501';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Informe um valor positivo.' using errcode = '22023';
  end if;

  select * into v_crew from campaign_crews where campaign_id = p_campaign_id for update;
  if not found then
    raise exception 'Esta campanha ainda não fundou um bando.' using errcode = 'no_data_found';
  end if;
  select * into v_char from characters where id = p_character_id for update;
  if not found or v_char.campaign_id is distinct from p_campaign_id or v_char.archived_at is not null then
    raise exception 'Personagem não encontrado nesta campanha.' using errcode = 'no_data_found';
  end if;
  if not (is_campaign_owner(p_campaign_id, v_uid) or is_character_controller_for(p_character_id, p_campaign_id, v_uid)) then
    raise exception 'Você não pode movimentar a carteira deste personagem.' using errcode = '42501';
  end if;

  v_carteira := coalesce(v_char.payload->'carteira', '{}'::jsonb);
  v_saldo := coalesce((v_carteira->>'aretz_informal')::numeric, 0);
  v_caixa := coalesce((v_crew.state->>'caixa')::numeric, 0);

  if p_to_crew then
    if v_saldo < p_amount then
      raise exception 'Saldo insuficiente: % tem Ⱥ %.', v_char.name, v_saldo using errcode = '22023';
    end if;
    v_saldo := v_saldo - p_amount;
    v_caixa := v_caixa + p_amount;
  else
    if v_caixa < p_amount then
      raise exception 'Caixa insuficiente: o bando tem Ⱥ %.', v_caixa using errcode = '22023';
    end if;
    v_saldo := v_saldo + p_amount;
    v_caixa := v_caixa - p_amount;
  end if;

  v_carteira := jsonb_build_object(
    'aretz_informal', v_saldo,
    'cdi', coalesce((v_carteira->>'cdi')::numeric, 0),
    'cdi_craqueada', coalesce((v_carteira->>'cdi_craqueada')::numeric, 0)
  ) || (v_carteira - 'aretz_informal' - 'cdi' - 'cdi_craqueada');

  update characters
     set payload = jsonb_set(payload, '{carteira}', v_carteira), updated_at = now()
   where id = p_character_id;

  update campaign_crews
     set state = jsonb_set(state, '{caixa}', to_jsonb(v_caixa)), revision = revision + 1, updated_at = now()
   where campaign_id = p_campaign_id
  returning * into v_crew;

  return jsonb_build_object('saldo_personagem', v_saldo, 'caixa', v_caixa, 'revision', v_crew.revision);
end;
$$;

revoke all on function public.transfer_crew_aretz(uuid, uuid, integer, boolean) from public, anon;
grant execute on function public.transfer_crew_aretz(uuid, uuid, integer, boolean) to authenticated;
