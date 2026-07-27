-- =====================================================================
-- Ruptura VTT — jogador define o PRÓPRIO personagem ativo
-- Migration: 0039_claim_own_active_character
--
-- Achado da rodada de consolidação (browser real, Cenário 2): o wizard
-- de criação pelo jogador (fase 2/3) termina chamando
-- `setCampaignProfileActiveCharacter`, que usa a RPC
-- `set_campaign_profile_active_character` (migration 0032) — travada a
-- SÓ o narrador de propósito, porque na época "nenhum consumidor de
-- jogador existe" (comentário original da 0032). Isso deixou de ser
-- verdade quando o jogador passou a criar o próprio personagem: o
-- personagem é criado com sucesso, mas a chamada seguinte falha com
-- "Sem acesso de narrador a esta campanha" — o personagem fica órfão
-- (existe, mas nunca vira "personagem ativo" do perfil), reproduzido
-- ao vivo no navegador durante esta rodada.
--
-- `set_campaign_profile_active_character` NÃO é alterada (migration
-- aplicada, comportamento do narrador já aceito permanece idêntico).
-- Esta é uma função NOVA, estritamente mais restrita: só permite ao
-- perfil reivindicado (`campaign_profiles.user_id = auth.uid()`) — ou
-- ao narrador dono, para não regredir nenhum fluxo existente — definir
-- como ativo um personagem que JÁ aponta de volta para ESTE MESMO
-- perfil (`characters.profile_id`), na MESMA campanha, não arquivado.
-- Nunca permite apontar para o personagem de outro perfil.
-- =====================================================================

begin;

create or replace function claim_own_active_character(
  p_profile_id uuid,
  p_character_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_profile campaign_profiles%rowtype;
  v_character characters%rowtype;
  v_result jsonb;
begin
  select * into v_profile from campaign_profiles where id = p_profile_id for update;
  if not found then
    raise exception 'Perfil não encontrado.' using errcode = 'no_data_found';
  end if;

  if v_profile.user_id is distinct from (select auth.uid()) and not is_campaign_owner(v_profile.campaign_id) then
    raise exception 'Você só pode definir o personagem ativo do PRÓPRIO perfil.' using errcode = 'insufficient_privilege';
  end if;

  if p_character_id is not null then
    select * into v_character from characters where id = p_character_id for update;
    if not found then
      raise exception 'Personagem não encontrado.' using errcode = 'no_data_found';
    end if;
    if v_character.campaign_id is distinct from v_profile.campaign_id then
      raise exception 'Este personagem não pertence a esta campanha.' using errcode = 'insufficient_privilege';
    end if;
    if v_character.profile_id is distinct from p_profile_id then
      raise exception 'Este personagem não está vinculado a este perfil.' using errcode = 'insufficient_privilege';
    end if;
    if v_character.archived_at is not null then
      raise exception 'Este personagem está arquivado e não pode ser definido como ativo.' using errcode = 'insufficient_privilege';
    end if;
  end if;

  update campaign_profiles
  set active_character_id = p_character_id
  where id = p_profile_id
  returning to_jsonb(campaign_profiles.*) into v_result;

  return v_result;
end;
$$;

revoke all on function claim_own_active_character(uuid, uuid) from public, anon;
grant execute on function claim_own_active_character(uuid, uuid) to authenticated;

commit;
