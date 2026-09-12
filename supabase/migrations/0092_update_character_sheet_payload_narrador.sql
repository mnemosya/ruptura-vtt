-- =====================================================================
-- 0092 — update_character_sheet_payload aceita o NARRADOR da campanha
--
-- Sintoma: no Console do Personagem (dentro do VTT e da /ficha) o Modo
-- Evolução aplicava a mudança na tela e sumia com ela ao fechar. O
-- cliente chamava esta RPC — o único caminho de escrita de payload do
-- produto — e recebia 42501 insufficient_privilege quando quem editava
-- era o narrador da mesa.
--
-- Causa: o guard exige `is_character_controller_for`, isto é, uma linha
-- em `character_controllers`. Até a migration 0060,
-- `complete_character_creation` criava essa linha também para o
-- narrador que criasse um personagem na própria campanha; 0060 parou de
-- criá-la (era redundante para os filtros da página Personagens) e, com
-- isso, tirou do narrador o único passaporte que ele tinha para esta
-- RPC. O próprio corpo da função já provava que o narrador era esperado
-- aqui: existe um ramo `if not is_campaign_owner(...)` logo abaixo do
-- guard, inalcançável desde então.
--
-- Correção: aceitar também `is_campaign_owner`. Isto NÃO amplia
-- privilégio nenhum — o narrador já tem UPDATE direto e irrestrito na
-- tabela `characters` pela policy `characters_authenticated_update`
-- (migration 0052). Passar por aqui é estritamente mais estreito do que
-- o que ele já pode fazer: só a coluna `payload`.
--
-- O resto do corpo é idêntico ao da 0060, incluindo a reescrita
-- incondicional de `metadados.tipo_personagem` para quem NÃO é
-- narrador — que continua sendo a proteção contra o jogador
-- controlador mexer nesse campo administrativo.
-- =====================================================================

begin;

create or replace function update_character_sheet_payload(
  p_character_id uuid,
  p_payload jsonb
) returns characters
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_campaign_id uuid;
  v_result characters;
  v_existing_tipo jsonb;
  v_final_payload jsonb;
begin
  select campaign_id into v_campaign_id from characters where id = p_character_id;
  if v_campaign_id is null then
    raise exception 'character has no campaign; use narrator update path' using errcode = 'check_violation';
  end if;
  -- Narrador da campanha OU jogador controlador. Sem o primeiro, o
  -- Console do Personagem não conseguia gravar nada como narrador.
  if not (
    is_character_controller_for(p_character_id, v_campaign_id, auth.uid())
    or is_campaign_owner(v_campaign_id, auth.uid())
  ) then
    raise exception 'insufficient_privilege' using errcode = '42501';
  end if;

  v_final_payload := p_payload;

  if not is_campaign_owner(v_campaign_id, auth.uid()) then
    -- Quem chama é o jogador controlador (única outra possibilidade
    -- autorizada acima): tipo_personagem é metadado administrativo do
    -- narrador, não pode ser criado, alterado ou removido por um
    -- payload completo enviado pelo jogador — reescrito de volta ao
    -- valor já persistido, incondicionalmente.
    select payload->'metadados'->'tipo_personagem' into v_existing_tipo
      from characters where id = p_character_id;

    -- jsonb_set com caminho aninhado ("{metadados,tipo_personagem}") NÃO
    -- cria o objeto intermediário "metadados" quando ele está ausente do
    -- payload enviado — só cria o último nível do caminho. Por isso o
    -- objeto "metadados" é garantido primeiro, incondicionalmente.
    v_final_payload := jsonb_set(
      v_final_payload,
      '{metadados}',
      coalesce(v_final_payload->'metadados', '{}'::jsonb)
    );

    if v_existing_tipo is null then
      v_final_payload := jsonb_set(
        v_final_payload,
        '{metadados}',
        (v_final_payload->'metadados') - 'tipo_personagem'
      );
    else
      v_final_payload := jsonb_set(
        v_final_payload,
        '{metadados,tipo_personagem}',
        v_existing_tipo,
        true
      );
    end if;
  end if;

  update characters
     set payload = v_final_payload,
         updated_at = now()
   where id = p_character_id
  returning * into v_result;
  return v_result;
end;
$$;

revoke all on function update_character_sheet_payload(uuid, jsonb) from public;
revoke all on function update_character_sheet_payload(uuid, jsonb) from anon;
grant execute on function update_character_sheet_payload(uuid, jsonb) to authenticated;

commit;
