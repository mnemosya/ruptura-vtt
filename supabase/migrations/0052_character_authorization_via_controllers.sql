-- =====================================================================
-- Ruptura VTT — corrige lacunas 1 e 2 de autorização de personagem
-- Migration: 0052_character_authorization_via_controllers
--
-- Passo 2 da ordem interna segura (secao 13.7): adapta backend (aqui,
-- as funcoes/RLS que o backend consome) para o novo caminho, ANTES de
-- remover qualquer coisa de campaign_profiles/profile_sessions. Depois
-- desta migration, can_read_character/can_manage_character nao leem
-- mais campaign_profiles em nenhum caminho, mas a tabela ainda existe
-- (nada foi apagado ainda).
--
-- Lacuna 1 (controle exige participacao ativa): a clausula de
-- controlador agora exige is_character_controller_for(...) E
-- is_campaign_member(...) simultaneamente -- nao basta a linha em
-- character_controllers existir.
--
-- Lacuna 2 (owner_id nao contorna controle em personagem de campanha):
-- a clausula "owner_id = check_user_id" so vale quando
-- campaign_id IS NULL. Para personagem de campanha, owner_id nunca e
-- lido para autorizacao -- mesmo que a coluna tenha valor residual de
-- dados antigos/dev.
--
-- Lacuna 3 (escrita do jogador restrita por coluna): a policy de UPDATE
-- direto na tabela deixa de aceitar controlador -- so narrador (dono da
-- campanha) ou dono de personagem solto. O jogador controlador escreve
-- exclusivamente via update_character_sheet_payload (migration 0051),
-- que so toca a coluna payload.
-- =====================================================================

begin;

create or replace function can_read_character(
  p_character_id uuid,
  check_user_id uuid default auth.uid()
) returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select exists (
    select 1 from characters c
    where c.id = p_character_id
      and (
        (c.campaign_id is not null and is_campaign_owner(c.campaign_id, check_user_id))
        or (c.campaign_id is null and c.owner_id = check_user_id)
        or (
          c.campaign_id is not null
          and is_character_controller_for(c.id, c.campaign_id, check_user_id)
          and is_campaign_member(c.campaign_id, check_user_id)
        )
      )
  );
$$;

create or replace function can_manage_character(
  p_character_id uuid,
  check_user_id uuid default auth.uid()
) returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select can_read_character(p_character_id, check_user_id);
$$;

-- SELECT: dono da campanha, OU dono de personagem solto, OU controlador
-- com participacao ativa (can_read_character ja encapsula as 3 regras).
drop policy if exists characters_authenticated_select on characters;
create policy characters_authenticated_select on characters
  for select to authenticated
  using (can_read_character(id));

-- INSERT: narrador dono da campanha, OU dono de personagem SEM campanha.
-- A clausula de profile_id (insercao "como jogador dono do perfil") sai
-- daqui -- a criacao pelo jogador passa a ser via RPC
-- complete_character_creation (SECURITY DEFINER, migration 0054), que
-- nao depende desta policy.
drop policy if exists characters_authenticated_insert on characters;
create policy characters_authenticated_insert on characters
  for insert to authenticated
  with check (
    (campaign_id is not null and is_campaign_owner(campaign_id))
    or (campaign_id is null and owner_id = (select auth.uid()))
  );

-- UPDATE: SO narrador dono da campanha, OU dono de personagem SEM
-- campanha. NUNCA can_manage_character/controlador aqui -- essa e
-- exatamente a correcao da lacuna 3: o jogador controlador nao tem
-- nenhum caminho de UPDATE direto de tabela, so a RPC de escrita restrita
-- a coluna payload.
drop policy if exists characters_authenticated_update on characters;
create policy characters_authenticated_update on characters
  for update to authenticated
  using (
    (campaign_id is not null and is_campaign_owner(campaign_id))
    or (campaign_id is null and owner_id = (select auth.uid()))
  )
  with check (
    (campaign_id is not null and is_campaign_owner(campaign_id))
    or (campaign_id is null and owner_id = (select auth.uid()))
  );

-- DELETE: inalterada (ja era so-narrador) -- recriada aqui só por
-- completude/idempotencia da migration, mesmo texto de antes.
drop policy if exists characters_authenticated_delete on characters;
create policy characters_authenticated_delete on characters
  for delete to authenticated
  using (campaign_id is not null and is_campaign_owner(campaign_id));

commit;
