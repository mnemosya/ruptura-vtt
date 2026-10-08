-- =====================================================================
-- TOK-01 — "Criar ficha" para token avulso.
--
-- Cria um PN pendente (o mesmo de "+ Personagem → PN",
-- `create_pending_character_v2`) com o nome do token e o vincula ao
-- token, na MESMA transação: ou existem ficha e vínculo, ou nenhum.
--
-- ── Decisões ─────────────────────────────────────────────────────────
--
--   · Só o narrador. Token avulso é peça do narrador; a ficha nasce PN,
--     sem controlador. Dar controle a um jogador continua sendo o gesto
--     de sempre (`grantCharacterControl`).
--   · Herda do token: NOME e RETRATO (o `retrato_image_id`, se houver,
--     vira o avatar da ficha). Nada mais — PV, condições etc. do token
--     são de mesa, não de ficha.
--   · O token NÃO muda além de `character_id`: continua com nome e
--     retrato próprios. Daí em diante vale a regra de qualquer token
--     vinculado (avatar herdado quando o token não tem retrato próprio).
--   · Sem duplicidade: o token é travado (`for update`) e a RPC recusa
--     se ele já tiver ficha — dois cliques, duas abas, um vínculo só.
--   · `p_expected_revision` protege contra editar um token que mudou.
-- =====================================================================

begin;

create or replace function public.create_character_from_vtt_token(
  p_token_id uuid,
  p_expected_revision integer
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_token vtt_tokens;
  v_char characters;
begin
  select * into v_token from vtt_tokens where id = p_token_id for update;
  if v_token.id is null or not is_campaign_owner(v_token.campaign_id) then
    raise exception 'Só o narrador cria ficha a partir de um token.' using errcode = '42501';
  end if;
  if v_token.character_id is not null then
    raise exception 'Este token já tem uma ficha vinculada.' using errcode = '23505';
  end if;
  if v_token.revision <> p_expected_revision then
    raise exception 'O token mudou desde que você abriu. Tente de novo.' using errcode = '40001';
  end if;

  v_char := create_pending_character_v2(v_token.campaign_id, v_token.nome, true);

  if v_token.retrato_image_id is not null then
    update characters set avatar_image_id = v_token.retrato_image_id
     where id = v_char.id
    returning * into v_char;
  end if;

  update vtt_tokens
     set character_id = v_char.id, revision = revision + 1, updated_at = now()
   where id = p_token_id
  returning * into v_token;

  return jsonb_build_object(
    'characterId', v_char.id,
    'characterName', v_char.name,
    'tokenRevision', v_token.revision
  );
end;
$$;

revoke all on function public.create_character_from_vtt_token(uuid, integer) from public, anon;
grant execute on function public.create_character_from_vtt_token(uuid, integer) to authenticated;

commit;
