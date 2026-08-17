-- =====================================================================
-- Ruptura VTT — Reestrutura da área de campanha, Fase 0
-- Migration: 0061_campaign_roster
--
-- list_campaign_roster(campaign_id): lista os participantes ATIVOS de
-- uma campanha para QUALQUER participante ativo dela — nome de exibição
-- e papel, nada mais. É o contrato que alimenta o painel de
-- Participantes da sessão (sempre visível na casca da campanha), e
-- futuramente a base da presença online.
--
-- Por que uma função nova, e não as duas leituras que já existem:
--
--   - `campaign_members` direto (via RLS) devolve ao JOGADOR apenas a
--     própria linha (policy de 0026) — inútil para um roster.
--   - `get_campaign_participant_info` (0060) só responde ao NARRADOR e
--     inclui e-mail — não pode ser exposta a jogador.
--
-- Diferenças deliberadas em relação a `get_campaign_participant_info`:
--
--   1. NÃO retorna e-mail, e o fallback de nome NÃO deriva do e-mail
--      (nada de split_part(email,'@',1)). Aquela função responde só ao
--      narrador, que já enxerga o e-mail inteiro por outro caminho;
--      esta é lida por qualquer participante, e o local-part do e-mail
--      de um jogador não deve vazar para os colegas de mesa. Contas sem
--      nome de exibição aparecem como 'Jogador sem nome' — o caminho de
--      correção é a própria pessoa preencher o nome em "Conta e
--      preferências" (updateDisplayName, src/lib/auth/actions.ts).
--
--   2. O narrador é derivado de `campaigns.owner_id`, NUNCA de uma
--      linha 'owner' em `campaign_members`. A migration 0026 fez um
--      backfill único inserindo o dono como membro, mas `createCampaign`
--      (src/lib/table/storage.ts) só insere em `campaigns` e não há
--      trigger — então campanhas criadas DEPOIS de 0026 não têm essa
--      linha. Ler membros e confiar em role='owner' faria o narrador
--      sumir nas campanhas novas e, nas antigas, aparecer duas vezes.
--      O filtro `m.user_id is distinct from c.owner_id` no lado dos
--      jogadores é o que garante "exatamente uma vez" nos dois casos.
--
-- Autorização: `is_campaign_member` (cobre dono OU membro ativo), no
-- mesmo estilo do `where` de `get_campaign_participant_info`. Quem não
-- participa recebe zero linhas — nunca erro, nunca dado parcial.
-- =====================================================================

begin;

create or replace function list_campaign_roster(p_campaign_id uuid)
returns table(user_id uuid, display_name text, role text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with participantes as (
    -- Narrador — sempre de campaigns.owner_id (ver nota 2 no cabeçalho).
    select c.owner_id as user_id, 'narrator'::text as role
      from campaigns c
     where c.id = p_campaign_id
       and c.owner_id is not null

    union all

    -- Jogadores — membros ativos que não são o dono. Membros com
    -- status 'invited' ou 'removed' ficam de fora: o roster é de quem
    -- participa agora, não de quem foi convidado ou saiu.
    select m.user_id, 'player'::text as role
      from campaign_members m
      join campaigns c on c.id = m.campaign_id
     where m.campaign_id = p_campaign_id
       and m.status = 'active'
       and m.user_id is distinct from c.owner_id
  )
  select
    p.user_id,
    coalesce(
      nullif(trim(u.raw_user_meta_data->>'display_name'), ''),
      nullif(trim(u.raw_user_meta_data->>'full_name'), ''),
      'Jogador sem nome'
    ) as display_name,
    p.role
  from participantes p
  join auth.users u on u.id = p.user_id
  where is_campaign_member(p_campaign_id, auth.uid())
  order by (p.role = 'narrator') desc, 2;
$$;

revoke all on function list_campaign_roster(uuid) from public;
revoke all on function list_campaign_roster(uuid) from anon;
grant execute on function list_campaign_roster(uuid) to authenticated;

commit;
