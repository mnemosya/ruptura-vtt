-- =====================================================================
-- Ruptura VTT — isolamento real de campaigns e table_logs
-- Migration: 0043_campaign_table_logs_isolation
--
-- Achado da rodada de fechamento de segurança (confirmado AO VIVO com
-- sessões autenticadas reais, nunca service role): `campaigns_dev_transition_select`
-- e `table_logs_dev_transition_select` (migration 0003, `using (true)`
-- para `anon, authenticated`) permitiam que QUALQUER usuário
-- autenticado — sem nenhum vínculo com a campanha — lesse a linha
-- inteira de `campaigns` (nome, rodada, cena, estado da trilha) e TODOS
-- os `table_logs` de QUALQUER campanha, só por conhecer o id.
--
-- Auditoria dos consumidores reais antes de remover a policy aberta:
--   • `/mesas/[campaignId]` (narrador): já usa `campaigns_owner_select`
--     (dono autenticado) — não depende da policy aberta.
--   • `/ficha` (jogador, produto real): a sessão de perfil é validada
--     via `validate_profile_session_token` (RPC SECURITY DEFINER,
--     migration 0016/0032) — já retorna o `campaign` sem depender de
--     SELECT direto em `campaigns`/`table_logs`. `listLogsForViewer`
--     (leitura de log da ficha) roda com o client escopado
--     (`getScopedTableClient`), que anexa o JWT real do jogador quando
--     há sessão — e desde a Etapa 12 (`/join/[token]`, correção 2),
--     TODO jogador do fluxo de produto real passa por login real do
--     Supabase Auth antes de conseguir reivindicar perfil/ler qualquer
--     conteúdo — logo, é sempre `authenticated`, nunca `anon`, no
--     caminho de produto atual.
--   • `/join/[token]` (convite, ANTES do login): é o ÚNICO consumidor
--     real que precisa mostrar o NOME da campanha a um visitante
--     completamente anônimo (`resolveCampaignInvite` → `getCampaign`)
--     — substituído abaixo por uma RPC SECURITY DEFINER mínima
--     (`resolve_campaign_invite_public`) que valida o token
--     (hash + expiração + revogação, mesmo critério de
--     `accept_campaign_invite`) e retorna SÓ `id`/`name`, nunca a linha
--     inteira nem outros metadados.
--
-- `table_logs`: a policy de INSERT aberta (`table_logs_dev_transition_insert`)
-- e a tabela `campaign_invites` (policy de SELECT igualmente aberta)
-- NÃO são tocadas nesta migration — fora do escopo explícito desta
-- rodada (isolamento de LEITURA de campaigns/table_logs); registradas
-- em `CHECKPOINT_SEGURANCA_ATOMICIDADE.md` como achados adjacentes para
-- rodada dedicada.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. campaigns — troca a policy aberta por leitura escopada a
--    membership real (owner já coberto por campaigns_owner_select).
-- ---------------------------------------------------------------------

drop policy if exists campaigns_dev_transition_select on campaigns;

create policy campaigns_member_select
  on campaigns
  for select
  to authenticated
  using (is_campaign_member(id));

-- ---------------------------------------------------------------------
-- 2. table_logs — mesma troca: leitura escopada a membership real.
--    INSERT (table_logs_dev_transition_insert/table_logs_owner_insert)
--    inalterado nesta migration.
-- ---------------------------------------------------------------------

drop policy if exists table_logs_dev_transition_select on table_logs;

create policy table_logs_member_select
  on table_logs
  for select
  to authenticated
  using (is_campaign_member(campaign_id));

-- ---------------------------------------------------------------------
-- 3. RPC mínima para o preview anônimo de /join/[token] — substitui a
--    dependência de SELECT amplo em `campaigns` para mostrar o nome da
--    mesa antes do login. Mesmo critério de validação de
--    `accept_campaign_invite` (migration 0027): hash do token,
--    revogação, ativo, expiração — nunca aceita `auth.uid()` (deve
--    funcionar para visitante 100% anônimo, ao contrário de
--    accept_campaign_invite, que exige login).
-- ---------------------------------------------------------------------

create or replace function resolve_campaign_invite_public(p_token text)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_invite campaign_invites%rowtype;
  v_token_hash text;
  v_campaign_name text;
begin
  v_token_hash := encode(extensions.digest(p_token, 'sha256'), 'hex');
  select * into v_invite from campaign_invites where token_hash = v_token_hash;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  if v_invite.revoked_at is not null then
    return jsonb_build_object('ok', false, 'reason', 'revoked');
  end if;
  if not v_invite.is_active then
    return jsonb_build_object('ok', false, 'reason', 'inactive');
  end if;
  if v_invite.expires_at is not null and v_invite.expires_at < now() then
    return jsonb_build_object('ok', false, 'reason', 'expired');
  end if;

  select name into v_campaign_name from campaigns where id = v_invite.campaign_id;
  if v_campaign_name is null then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  return jsonb_build_object(
    'ok', true,
    'inviteId', v_invite.id,
    'campaignId', v_invite.campaign_id,
    'campaignName', v_campaign_name
  );
end;
$$;

revoke all on function resolve_campaign_invite_public(text) from public;
grant execute on function resolve_campaign_invite_public(text) to anon, authenticated;

commit;
