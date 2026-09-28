-- 0144 — Restaura os acentos das mensagens de grant/revoke_character_control.
--
-- `check-migrations-vs-banco.mjs` acusava estas duas funções como
-- divergentes do repositório. A comparação mostrou que a diferença é
-- INTEIRAMENTE de acentuação em literais de string: o corpo vivo dizia
-- "nao", "So", "usuario-alvo nao e", onde a 0051 diz "não", "Só",
-- "usuário-alvo não é". Lógica, security definer e search_path são
-- idênticos — a verificação por texto normalizado sem acentos deu igual.
--
-- Não é cosmético, porém: `mensagemDeErro` (acoes/comum.ts) devolve
-- `e.message` cru, então essas frases aparecem para o narrador. A mesa
-- exibia português sem acento.
--
-- A causa provável é a 0051 ter sido aplicada por um caminho que
-- destratou UTF-8 — nenhuma migration posterior redefine estas funções,
-- e nenhuma outra função do banco diverge. Não dá para afirmar qual
-- caminho foi; o que dá para afirmar é que o repositório sempre teve o
-- texto certo.
--
-- Reaplicar a 0051 inteira resolveria, mas ela também cria tabela,
-- índices e políticas: mexeria em muito mais do que o necessário.
begin;

create or replace function grant_character_control(
  p_character_id uuid,
  p_user_id uuid
) returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_campaign_id uuid;
begin
  select campaign_id into v_campaign_id from characters where id = p_character_id;
  if v_campaign_id is null then
    raise exception 'Personagem sem campanha não pode ter controlador.' using errcode = 'check_violation';
  end if;
  if not is_campaign_owner(v_campaign_id) then
    raise exception 'Só o narrador dono da campanha pode conceder controle.' using errcode = 'insufficient_privilege';
  end if;
  if not is_campaign_member(v_campaign_id, p_user_id) then
    raise exception 'O usuário-alvo não é um participante ativo desta campanha.' using errcode = 'check_violation';
  end if;

  insert into character_controllers (character_id, campaign_id, user_id, granted_by)
  values (p_character_id, v_campaign_id, p_user_id, auth.uid())
  on conflict (character_id, user_id) do nothing;
end;
$$;
revoke all on function grant_character_control(uuid, uuid) from public;
revoke all on function grant_character_control(uuid, uuid) from anon;
grant execute on function grant_character_control(uuid, uuid) to authenticated;

create or replace function revoke_character_control(
  p_character_id uuid,
  p_user_id uuid
) returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_campaign_id uuid;
begin
  select campaign_id into v_campaign_id from characters where id = p_character_id;
  if v_campaign_id is null or not is_campaign_owner(v_campaign_id) then
    raise exception 'Só o narrador dono da campanha pode remover controle.' using errcode = 'insufficient_privilege';
  end if;

  delete from character_controllers
  where character_id = p_character_id and user_id = p_user_id;
end;
$$;
revoke all on function revoke_character_control(uuid, uuid) from public;
revoke all on function revoke_character_control(uuid, uuid) from anon;
grant execute on function revoke_character_control(uuid, uuid) to authenticated;

commit;
