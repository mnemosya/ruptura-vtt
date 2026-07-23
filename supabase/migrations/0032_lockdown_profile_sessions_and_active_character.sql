-- =====================================================================
-- Ruptura VTT — fechamento de profile_sessions e proteção de
-- active_character_id (Etapa 12, correção 7)
-- Migration: 0032_lockdown_profile_sessions_and_active_character
--
-- AUDITORIA DESTA CORREÇÃO (revalidada linha a linha, não presumida):
--
--   ACHADO 0 (NÃO estava no relatório da auditoria anterior — encontrado
--   só agora, ao reler o diff real das migrations 0004/0006/0007/0030/
--   0031): `campaign_profiles` NUNCA teve sua policy `anon` removida de
--   verdade. A migration 0004 criou `campaign_profiles_dev_anon_*`
--   (anon+authenticated, USING(true)); a migration 0007 RENOMEOU essas
--   4 policies para `campaign_profiles_dev_transition_*` (`alter
--   policy ... rename to ...`) — esse passou a ser o nome REAL em vigor
--   desde então. As migrations 0030 e 0031 tentaram remover o acesso
--   anônimo desta tabela, mas ambas erraram o nome: fizeram
--   `drop policy if exists campaign_profiles_dev_anon_select` (e
--   variantes) — um NO-OP, porque esse nome não existe mais desde a
--   migration 0007 — e em seguida CRIARAM políticas novas com esse
--   MESMO nome antigo (`campaign_profiles_dev_anon_*`, só para `anon`),
--   que a migration 0031 finalmente removeu. Resultado: as políticas
--   REAIS e ainda ATIVAS até este exato momento são
--   `campaign_profiles_dev_transition_{select,insert,update,delete}`
--   — CRUD completo aberto a `anon, authenticated`, `USING(true)`/
--   `WITH CHECK(true)` — nunca tocadas por nenhuma das seis correções
--   anteriores. Ou seja: apesar de toda a correção 5/6, `anon` (e
--   qualquer `authenticated`) SEMPRE pôde ler/criar/editar/apagar
--   QUALQUER linha de `campaign_profiles`, inclusive `user_id`,
--   `active_character_id`, `claimed_at`. Esta migration corrige isso
--   pelo nome CORRETO e verificado.
--
--   ACHADO 1 (relatado pela auditoria anterior, confirmado de novo):
--   `profile_sessions_dev_transition_{select,insert,update,delete}`
--   (migration 0009, nunca renomeada nem removida) continuam abertas a
--   `anon, authenticated`, `USING(true)`. Como as RPCs de personagem
--   (`get/save_character_for_profile_session`) confiam em
--   `profile_sessions.session_token_hash` como o "hard check" de
--   autoridade (migration 0016), qualquer client com a anon key pode
--   gravar diretamente um `session_token_hash` de um token escolhido
--   por ele (ou inserir uma linha nova) e depois passar no hard check
--   com esse mesmo token — anulando a proteção da migration 0016.
--
--   ACHADO 2 (relatado pela auditoria anterior, confirmado de novo):
--   `campaign_profiles_authenticated_update` (migration 0030/0031)
--   permite que o PRÓPRIO JOGADOR autenticado atualize a própria linha
--   inteira (`with check (is_campaign_owner(campaign_id) or user_id =
--   auth.uid())`) — sem nenhuma restrição por COLUNA. Isso inclui
--   `active_character_id`: nada impede o jogador de apontar esse campo
--   para o UUID de um personagem de OUTRO perfil (ou de outra
--   campanha), e como as RPCs de personagem derivam "qual personagem
--   esta sessão pode tocar" apenas de `campaign_profiles.
--   active_character_id` (decisão explícita da migration 0015, item 5:
--   "a autoridade real é active_character_id, não characters.
--   profile_id"), o jogador pode redirecionar sua PRÓPRIA sessão válida
--   (token real, dele mesmo) para ler/escrever o personagem de outro
--   jogador, mesmo depois do reforço de auth.uid() da migration 0029
--   (que valida a posse do PERFIL de origem, nunca do PERSONAGEM alvo).
--
-- MODELO CANÔNICO DE PROPRIEDADE DE PERSONAGEM (decisão desta correção,
-- substituindo a formulação da migration 0015 que a auditoria pediu
-- para não perpetuar): `characters.profile_id` (migration 0011) É o
-- vínculo canônico real de "personagem pertence a qual perfil" — já é
-- usado dessa forma pelas policies `characters_authenticated_*`
-- (migration 0030) e pelos helpers `can_read_character`/
-- `can_manage_character`. `campaign_profiles.active_character_id`
-- continua sendo "qual dos personagens DO PERFIL está em uso agora",
-- mas deixa de ser uma autoridade independente: esta migration garante
-- (a) que só pode ser gravado apontando para um personagem cujo
-- `profile_id` já é esse mesmo perfil (RPC dedicada abaixo) e (b) que
-- as RPCs de leitura/escrita de personagem revalidam esse vínculo
-- (`characters.profile_id = profile_id` E `characters.campaign_id =
-- campaign_id`) TODA VEZ, nunca confiando só no ponteiro.
--
-- DIAGNÓSTICO DE DADOS LEGADOS (documentado, NÃO executado — sem
-- Supabase real conectado nesta sessão): antes de aplicar esta
-- migration contra um banco com dados reais, rodar a consulta abaixo
-- para encontrar personagens ativos cujo vínculo já está inconsistente
-- com o novo modelo canônico (isso pode acontecer se algum
-- active_character_id foi gravado por um caminho antigo, incluindo o
-- próprio ataque descrito no ACHADO 2, antes desta correção existir):
--
--   select p.id as profile_id, p.campaign_id, p.active_character_id,
--          c.id as character_id, c.profile_id as character_profile_id,
--          c.campaign_id as character_campaign_id
--   from campaign_profiles p
--   join characters c on c.id = p.active_character_id
--   where c.profile_id is distinct from p.id
--      or c.campaign_id is distinct from p.campaign_id;
--
-- Se essa consulta retornar linhas, NÃO reassociar nem apagar
-- automaticamente — decidir manualmente (religar o personagem certo ao
-- perfil via assignCharacterToProfile, ou limpar active_character_id)
-- antes de aplicar esta migration em produção. Esta migration NÃO faz
-- esse backfill.
--
-- SUPORTE A PERFIS NÃO REIVINDICADOS (decisão explícita — Opção B,
-- preservada): perfis com `user_id is null` continuam funcionando só
-- por token de sessão (sem exigir auth.uid()), porque ainda há
-- consumidor legítimo real (qualquer campanha cujo jogador nunca
-- reivindicou o perfil, e o fluxo legado de convite não removido nesta
-- etapa). A diferença desta correção: o token agora só pode ser
-- criado/rotacionado pelas RPCs abaixo (nunca por INSERT/UPDATE direto
-- em profile_sessions), `session_token_hash` nunca é lido diretamente
-- por ninguém (nem pelo próprio jogador — as RPCs nunca o devolvem), e
-- a sessão continua vinculada a uma campanha/perfil reais, validados a
-- cada chamada.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. campaign_profiles — remove as policies REALMENTE ativas (nome
--    correto, confirmado por leitura do histórico de renomeações).
-- ---------------------------------------------------------------------
drop policy if exists campaign_profiles_dev_transition_select on campaign_profiles;
drop policy if exists campaign_profiles_dev_transition_insert on campaign_profiles;
drop policy if exists campaign_profiles_dev_transition_update on campaign_profiles;
drop policy if exists campaign_profiles_dev_transition_delete on campaign_profiles;

-- Redundante com a 0031 (que já revogou grants de anon) — reafirmado
-- aqui por segurança, já que o achado 0 mostra que nomes de policy
-- podem enganar; um `revoke` explícito não depende de acertar nome de
-- policy nenhuma.
revoke all on campaign_profiles from anon;

-- UPDATE direto deixa de ser possível para o jogador (mesmo na própria
-- linha) — só o owner administra campaign_profiles por acesso direto à
-- tabela daqui em diante. Toda escrita legítima de jogador
-- (entrar/heartbeat/sair) passa a ser só pelas RPCs da seção 3.
drop policy if exists campaign_profiles_authenticated_update on campaign_profiles;
create policy campaign_profiles_authenticated_update
  on campaign_profiles
  for update
  to authenticated
  using (is_campaign_owner(campaign_id))
  with check (is_campaign_owner(campaign_id));

-- SELECT/INSERT/DELETE (migration 0031) — inalteradas: já eram
-- corretas (owner administra tudo; jogador só lê o próprio perfil;
-- insert/delete só owner).

-- ---------------------------------------------------------------------
-- 2. profile_sessions — remove as policies dev_transition (nunca
--    tocadas por nenhuma correção anterior) e revoga grant de anon.
--    `profile_sessions_owner_all` (migration 0009) é mantida —
--    continua dando ao NARRADOR acesso direto completo às sessões da
--    própria campanha (papel confiável, sem necessidade de RPC).
-- ---------------------------------------------------------------------
drop policy if exists profile_sessions_dev_transition_select on profile_sessions;
drop policy if exists profile_sessions_dev_transition_insert on profile_sessions;
drop policy if exists profile_sessions_dev_transition_update on profile_sessions;
drop policy if exists profile_sessions_dev_transition_delete on profile_sessions;

revoke all on profile_sessions from anon;

-- Depois desta migration, `authenticated` sem ser owner e `anon` não
-- têm NENHUMA policy permissiva restante nesta tabela — toda leitura/
-- escrita de jogador passa exclusivamente pelas RPCs abaixo (que
-- ignoram RLS como SECURITY DEFINER, revalidando tudo internamente).

-- ---------------------------------------------------------------------
-- 3. RPCs de sessão de perfil (jogador) — cada uma faz UMA operação
--    concreta, nunca um UPDATE genérico. Todas SECURITY DEFINER,
--    search_path explícito, nunca devolvem session_token_hash.
-- ---------------------------------------------------------------------

-- 3.1 expire_stale_profile_sessions — varredura de sessões velhas.
--     Corrige, de passagem, um bug latente herdado da versão TypeScript
--     (table/storage.ts): a versão antiga liberava o lock comparando
--     sha256(lock_session_id) com session_token_hash — mas desde a
--     migration 0016 o token real não tem NENHUMA relação com
--     lock_session_id (que é só um id local de navegador, não secreto
--     desde então), então essa comparação praticamente nunca batia, e
--     o perfil raramente era liberado automaticamente por esta rotina.
--     Corrigido aqui: libera o lock quando a sessão que está expirando
--     é a única/última sessão ATIVA daquele perfil (condição
--     logicamente equivalente à intenção original, sem depender de um
--     campo que não é mais o identificador da sessão).
create or replace function expire_stale_profile_sessions(
  p_campaign_id uuid default null,
  p_stale_after_seconds integer default 30
)
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_row record;
  v_count integer := 0;
  v_stale_before timestamptz := now() - (p_stale_after_seconds || ' seconds')::interval;
begin
  for v_row in
    select id, campaign_id, profile_id
    from profile_sessions
    where status = 'active'
      and last_seen_at < v_stale_before
      and (p_campaign_id is null or campaign_id = p_campaign_id)
  loop
    update profile_sessions set status = 'expired' where id = v_row.id and status = 'active';
    if found then
      v_count := v_count + 1;

      update campaign_profiles
      set is_locked = false, lock_session_id = null, locked_at = null
      where id = v_row.profile_id
        and is_locked = true
        and not exists (
          select 1 from profile_sessions ps2
          where ps2.profile_id = v_row.profile_id and ps2.status = 'active'
        );

      if found then
        insert into table_logs (campaign_id, type, visibility, profile_id, profile_session_id, payload)
        values (
          v_row.campaign_id, 'profile_event', 'gm', v_row.profile_id, v_row.id,
          jsonb_build_object('evento', 'expirado_automatico', 'profileId', v_row.profile_id)
        );
      end if;
    end if;
  end loop;
  return v_count;
end;
$$;

revoke all on function expire_stale_profile_sessions(uuid, integer) from public;
grant execute on function expire_stale_profile_sessions(uuid, integer) to anon, authenticated;

-- 3.2 enter_campaign_profile — substitui o INSERT/UPDATE direto de
--     enterCampaignProfile(). Gera o token bruto NO SERVIDOR
--     (extensions.gen_random_bytes, nunca escolhido pelo cliente);
--     devolve o token bruto uma única vez (nunca mais lido do banco).
create or replace function enter_campaign_profile(
  p_profile_id uuid,
  p_session_id text,
  p_invite_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_profile campaign_profiles%rowtype;
  v_now timestamptz := now();
  v_raw_token text;
  v_token_hash text;
  v_profile_session_id uuid;
begin
  select * into v_profile from campaign_profiles where id = p_profile_id for update;
  if not found then
    raise exception 'Perfil não encontrado.' using errcode = 'no_data_found';
  end if;

  perform expire_stale_profile_sessions(v_profile.campaign_id, 30);

  select * into v_profile from campaign_profiles where id = p_profile_id for update;

  if v_profile.is_locked
     and v_profile.lock_session_id is distinct from p_session_id
     and v_profile.last_seen_at is not null
     and (v_now - v_profile.last_seen_at) <= interval '30 seconds'
  then
    raise exception 'Perfil "%" está em uso por outra sessão (sem expirar ainda).', v_profile.nickname
      using errcode = 'insufficient_privilege';
  end if;

  update campaign_profiles
  set is_locked = true, lock_session_id = p_session_id, locked_at = v_now, last_seen_at = v_now
  where id = p_profile_id
  returning * into v_profile;

  update profile_sessions set status = 'released', released_at = v_now
  where profile_id = p_profile_id and status = 'active';

  v_raw_token := encode(extensions.gen_random_bytes(32), 'hex');
  v_token_hash := encode(extensions.digest(convert_to(v_raw_token, 'UTF8'), 'sha256'), 'hex');

  insert into profile_sessions (campaign_id, profile_id, invite_id, session_token_hash, status, last_seen_at)
  values (v_profile.campaign_id, p_profile_id, p_invite_id, v_token_hash, 'active', v_now)
  returning id into v_profile_session_id;

  return jsonb_build_object(
    'profile', to_jsonb(v_profile),
    'profileSessionId', v_profile_session_id,
    'rawSessionToken', v_raw_token
  );
end;
$$;

revoke all on function enter_campaign_profile(uuid, text, uuid) from public;
grant execute on function enter_campaign_profile(uuid, text, uuid) to anon, authenticated;

-- 3.3 heartbeat_profile_session — substitui o UPDATE direto de
--     heartbeatCampaignProfile(). Hard check de token, igual ao já
--     feito nas RPCs de personagem.
create or replace function heartbeat_profile_session(
  p_profile_id uuid,
  p_profile_session_id uuid,
  p_raw_session_token text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_session profile_sessions%rowtype;
  v_profile campaign_profiles%rowtype;
  v_token_hash text;
  v_now timestamptz := now();
begin
  v_token_hash := encode(extensions.digest(convert_to(p_raw_session_token, 'UTF8'), 'sha256'), 'hex');

  select * into v_session from profile_sessions
  where id = p_profile_session_id and profile_id = p_profile_id;
  if not found then
    raise exception 'Sessão de perfil "%" não encontrada.', p_profile_session_id using errcode = 'no_data_found';
  end if;
  if v_session.session_token_hash <> v_token_hash then
    raise exception 'Heartbeat rejeitado — token de sessão inválido.' using errcode = 'insufficient_privilege';
  end if;
  if v_session.status <> 'active' then
    raise exception 'Heartbeat rejeitado — sessão de perfil não está mais ativa (status: "%").', v_session.status
      using errcode = 'insufficient_privilege';
  end if;

  update campaign_profiles
  set last_seen_at = v_now
  where id = p_profile_id and is_locked = true
  returning * into v_profile;
  if not found then
    raise exception 'Heartbeat rejeitado para o perfil "%" — perfil não está mais bloqueado.', p_profile_id
      using errcode = 'insufficient_privilege';
  end if;

  update profile_sessions set last_seen_at = v_now where id = p_profile_session_id;

  return to_jsonb(v_profile);
end;
$$;

revoke all on function heartbeat_profile_session(uuid, uuid, text) from public;
grant execute on function heartbeat_profile_session(uuid, uuid, text) to anon, authenticated;

-- 3.4 leave_campaign_profile — substitui o UPDATE direto de
--     leaveCampaignProfile().
create or replace function leave_campaign_profile(
  p_profile_id uuid,
  p_profile_session_id uuid,
  p_raw_session_token text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_session profile_sessions%rowtype;
  v_profile campaign_profiles%rowtype;
  v_token_hash text;
begin
  v_token_hash := encode(extensions.digest(convert_to(p_raw_session_token, 'UTF8'), 'sha256'), 'hex');

  select * into v_session from profile_sessions
  where id = p_profile_session_id and profile_id = p_profile_id;
  if not found then
    raise exception 'Sessão de perfil "%" não encontrada.', p_profile_session_id using errcode = 'no_data_found';
  end if;
  if v_session.session_token_hash <> v_token_hash then
    raise exception 'Não foi possível sair do perfil — token de sessão inválido.' using errcode = 'insufficient_privilege';
  end if;
  if v_session.status <> 'active' then
    raise exception 'Não foi possível sair do perfil — sessão não está mais ativa (status: "%").', v_session.status
      using errcode = 'insufficient_privilege';
  end if;

  update campaign_profiles
  set is_locked = false, lock_session_id = null, locked_at = null
  where id = p_profile_id
  returning * into v_profile;

  update profile_sessions
  set status = 'exited', exited_at = now()
  where id = p_profile_session_id and status = 'active';

  return to_jsonb(v_profile);
end;
$$;

revoke all on function leave_campaign_profile(uuid, uuid, text) from public;
grant execute on function leave_campaign_profile(uuid, uuid, text) to anon, authenticated;

-- 3.5 validate_profile_session_token — substitui a leitura direta feita
--     por validateProfileSessionToken() (table/storage.ts). Nunca
--     devolve session_token_hash (removido do jsonb explicitamente).
create or replace function validate_profile_session_token(
  p_campaign_id uuid,
  p_profile_id uuid,
  p_profile_session_id uuid,
  p_raw_session_token text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_profile campaign_profiles%rowtype;
  v_session profile_sessions%rowtype;
  v_campaign campaigns%rowtype;
  v_token_hash text;
begin
  perform expire_stale_profile_sessions(p_campaign_id, 30);

  select * into v_profile from campaign_profiles where id = p_profile_id;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'profile_not_found');
  end if;
  if v_profile.campaign_id <> p_campaign_id then
    return jsonb_build_object('ok', false, 'reason', 'wrong_campaign');
  end if;
  if not v_profile.is_locked then
    return jsonb_build_object('ok', false, 'reason', 'not_locked');
  end if;

  v_token_hash := encode(extensions.digest(convert_to(p_raw_session_token, 'UTF8'), 'sha256'), 'hex');
  select * into v_session from profile_sessions
  where id = p_profile_session_id and profile_id = p_profile_id and campaign_id = p_campaign_id;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'session_not_found');
  end if;
  if v_session.session_token_hash <> v_token_hash then
    return jsonb_build_object('ok', false, 'reason', 'session_not_found');
  end if;
  if v_session.status <> 'active' then
    return jsonb_build_object('ok', false, 'reason', 'session_inactive');
  end if;

  select * into v_campaign from campaigns where id = p_campaign_id;

  return jsonb_build_object(
    'ok', true,
    'campaign', to_jsonb(v_campaign),
    'profile', to_jsonb(v_profile),
    'profileSession', (to_jsonb(v_session) - 'session_token_hash')
  );
end;
$$;

revoke all on function validate_profile_session_token(uuid, uuid, uuid, text) from public;
grant execute on function validate_profile_session_token(uuid, uuid, uuid, text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- 4. RPCs administrativas (narrador) — substituem UPDATE direto que
--    dependia de policies agora restritas, e fecham o ACHADO 2.
-- ---------------------------------------------------------------------

-- 4.1 force_release_campaign_profile — substitui a parte de
--     campaign_profiles em forceReleaseCampaignProfile(). A parte de
--     profile_sessions dessa função (markProfileSessions) continua
--     funcionando via profile_sessions_owner_all (inalterada), mas
--     movida para dentro desta RPC por coesão (uma operação, uma
--     função, uma transação).
create or replace function force_release_campaign_profile(p_profile_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_profile campaign_profiles%rowtype;
begin
  select * into v_profile from campaign_profiles where id = p_profile_id for update;
  if not found then
    raise exception 'Perfil não encontrado.' using errcode = 'no_data_found';
  end if;
  if not is_campaign_owner(v_profile.campaign_id) then
    raise exception 'Sem acesso de narrador a esta campanha.' using errcode = 'insufficient_privilege';
  end if;

  update campaign_profiles
  set is_locked = false, lock_session_id = null, locked_at = null
  where id = p_profile_id
  returning * into v_profile;

  update profile_sessions
  set status = 'released', released_at = now()
  where profile_id = p_profile_id and status = 'active';

  return to_jsonb(v_profile);
end;
$$;

revoke all on function force_release_campaign_profile(uuid) from public;
grant execute on function force_release_campaign_profile(uuid) to authenticated;

-- 4.2 set_campaign_profile_active_character — FECHA O ACHADO 2. Exige
--     auth.uid() de narrador dono da campanha (setCampaignProfileActiveCharacter
--     hoje só é chamada por MesaDetailClient — rota exclusiva do
--     narrador, confirmado por grep; nenhum consumidor de jogador
--     existe). Valida que o personagem, quando não-nulo:
--       - pertence à MESMA campanha do perfil;
--       - tem characters.profile_id = ESTE perfil (vínculo canônico,
--         migration 0011 — nunca characters de outro perfil);
--       - não está arquivado.
create or replace function set_campaign_profile_active_character(
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
begin
  select * into v_profile from campaign_profiles where id = p_profile_id for update;
  if not found then
    raise exception 'Perfil não encontrado.' using errcode = 'no_data_found';
  end if;
  if not is_campaign_owner(v_profile.campaign_id) then
    raise exception 'Sem acesso de narrador a esta campanha.' using errcode = 'insufficient_privilege';
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
      raise exception 'Este personagem não está vinculado a este perfil — use assignCharacterToProfile primeiro.'
        using errcode = 'insufficient_privilege';
    end if;
    if v_character.archived_at is not null then
      raise exception 'Este personagem está arquivado e não pode ser definido como ativo.' using errcode = 'insufficient_privilege';
    end if;
  end if;

  update campaign_profiles
  set active_character_id = p_character_id
  where id = p_profile_id
  returning * into v_profile;

  return to_jsonb(v_profile);
end;
$$;

revoke all on function set_campaign_profile_active_character(uuid, uuid) from public;
grant execute on function set_campaign_profile_active_character(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 5. Reforço das RPCs de personagem — nunca confiar só em
--    active_character_id. Mesma assinatura da migration 0029 (não
--    precisa DROP). Acrescenta, em ambas: characters.profile_id =
--    p_profile_id (vínculo canônico) além de characters.campaign_id =
--    p_campaign_id (já existia desde a 0015). Defesa em profundidade:
--    mesmo que set_campaign_profile_active_character tenha um bug
--    futuro, ou que dados legados estejam inconsistentes (ver
--    diagnóstico no cabeçalho), estas duas RPCs continuam recusando
--    servir/salvar um personagem que não aponte de volta para o
--    mesmo perfil.
-- ---------------------------------------------------------------------
create or replace function get_character_for_profile_session(
  p_campaign_id uuid,
  p_profile_id uuid,
  p_profile_session_id uuid,
  p_raw_session_token text
)
returns setof public.characters
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.profile_sessions%rowtype;
  v_profile public.campaign_profiles%rowtype;
  v_token_hash text;
begin
  v_token_hash := encode(extensions.digest(convert_to(p_raw_session_token, 'UTF8'), 'sha256'), 'hex');

  select * into v_session
  from public.profile_sessions
  where id = p_profile_session_id
    and profile_id = p_profile_id
    and campaign_id = p_campaign_id
    and session_token_hash = v_token_hash
    and status = 'active';

  if not found then
    return;
  end if;

  select * into v_profile
  from public.campaign_profiles
  where id = p_profile_id
    and campaign_id = p_campaign_id
    and is_locked = true;

  if not found then
    return;
  end if;

  if v_profile.user_id is not null and v_profile.user_id <> auth.uid() then
    return;
  end if;

  if v_profile.active_character_id is null then
    return;
  end if;

  -- Correção 7: revalida o vínculo canônico characters.profile_id,
  -- nunca confia só em active_character_id.
  return query
    select * from public.characters
    where id = v_profile.active_character_id
      and campaign_id = p_campaign_id
      and profile_id = p_profile_id;
end;
$$;

revoke all on function get_character_for_profile_session(uuid, uuid, uuid, text) from public;
grant execute on function get_character_for_profile_session(uuid, uuid, uuid, text) to anon, authenticated;

create or replace function save_character_for_profile_session(
  p_campaign_id uuid,
  p_profile_id uuid,
  p_profile_session_id uuid,
  p_raw_session_token text,
  p_character_id uuid,
  p_name text,
  p_payload jsonb
)
returns setof public.characters
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.profile_sessions%rowtype;
  v_profile public.campaign_profiles%rowtype;
  v_token_hash text;
begin
  v_token_hash := encode(extensions.digest(convert_to(p_raw_session_token, 'UTF8'), 'sha256'), 'hex');

  select * into v_session
  from public.profile_sessions
  where id = p_profile_session_id
    and profile_id = p_profile_id
    and campaign_id = p_campaign_id
    and session_token_hash = v_token_hash
    and status = 'active';

  if not found then
    raise exception 'Sessão de perfil inválida, expirada ou token incorreto.';
  end if;

  select * into v_profile
  from public.campaign_profiles
  where id = p_profile_id
    and campaign_id = p_campaign_id
    and is_locked = true;

  if not found then
    raise exception 'Perfil não está mais bloqueado por nenhuma sessão — entre novamente pelo convite.';
  end if;

  if v_profile.user_id is not null and v_profile.user_id <> auth.uid() then
    raise exception 'Este perfil pertence a outro jogador — sessão rejeitada.' using errcode = 'insufficient_privilege';
  end if;

  if v_profile.active_character_id is distinct from p_character_id then
    raise exception 'Personagem "%" não é mais o ativo desta sessão de perfil.', p_character_id;
  end if;

  -- Correção 7: revalida o vínculo canônico DENTRO da mesma transação
  -- do UPDATE, imediatamente antes de gravar — nunca confia que a
  -- leitura anterior (get_character_for_profile_session, ou a
  -- validação em TypeScript) já garantiu isso; evita TOCTOU.
  return query
    update public.characters
    set name = p_name, payload = p_payload
    where id = p_character_id
      and campaign_id = p_campaign_id
      and profile_id = p_profile_id
    returning *;
end;
$$;

revoke all on function save_character_for_profile_session(uuid, uuid, uuid, text, uuid, text, jsonb) from public;
grant execute on function save_character_for_profile_session(uuid, uuid, uuid, text, uuid, text, jsonb) to anon, authenticated;

commit;
