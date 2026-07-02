-- =====================================================================
-- Ruptura VTT — RLS controlada de characters
-- Migration: 0014_characters_rls_controlled
--
-- Checkpoint v0.29. NÃO é o endurecimento final de `characters` — os
-- blockers documentados no checkpoint v0.28 continuam de pé (sem
-- autenticação real de jogador; /dev/character-sheet e
-- scripts/test-character-storage.ts dependem de acesso anon
-- irrestrito a QUALQUER linha, por design de diagnóstico/teste).
-- Full audit + rationale em docs/RELATORIO_MESAS_LOG_V0_1.md
-- (checkpoint v0.29).
--
-- O QUE MUDA nesta migration:
--
--   1. Adiciona policies `characters_owner_*` (authenticated,
--      owner_id = auth.uid()) — mesmo padrão já usado desde as
--      migrations 0006/0007 em campaigns/campaign_invites/
--      campaign_profiles/profile_sessions/table_logs. Puramente
--      aditivo: coexiste com `characters_dev_transition_*` (que
--      continua permitindo tudo), sem mudar nenhum comportamento
--      hoje — só cria a base real para quando dev_transition puder
--      ser removida (ver blockers no relatório).
--
--   2. Cria duas funções SQL `security definer` — a ALTERNATIVA
--      escolhida a service role para a operação mais sensível desta
--      tabela: o jogador anônimo lendo/salvando o personagem ATIVO da
--      própria sessão de perfil (/ficha, checkpoint v0.24/v0.28).
--      Antes desta migration, esse caminho ia direto na tabela via
--      client anon (client.from("characters")...), dependendo 100% da
--      RLS aberta continuar aberta — ou seja, se `dev_transition`
--      fosse restringida amanhã sem essa mudança, /ficha quebraria
--      instantaneamente, e ENQUANTO ela continua aberta, qualquer
--      pessoa com a anon key pode ler/escrever qualquer personagem
--      direto na tabela, sem nenhuma validação de sessão.
--
--      As funções abaixo fazem a MESMA validação que
--      validateProductSession() (TypeScript, table/storage.ts) já
--      fazia — perfil pertence à mesa, está bloqueado, e o
--      lock_session_id bate com o sessionId do navegador — só que
--      DENTRO do banco, atomicamente, e devolvem/gravam o personagem
--      SEM depender da policy aberta de `characters` (security
--      definer roda com os privilégios de quem criou a função,
--      ignorando RLS nas tabelas que toca). Isso NÃO usa a service
--      role key em lugar nenhum do app — é só Postgres, chamado via
--      `client.rpc(...)` com a mesma anon key de sempre.
--
--      Por que RPC/security definer em vez de service role: a service
--      role key precisaria ser importada em algum client server-only
--      novo, criando uma superfície de erro (importar sem querer num
--      Client Component, vazar em log, etc.) para resolver um
--      problema que uma função SQL escopada resolve com risco muito
--      menor (a função só pode fazer EXATAMENTE a query que está
--      escrita nela — não "qualquer coisa como admin"). Ver decisão
--      completa no relatório.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. Policies owner-scoped (authenticated, owner_id = auth.uid())
--
-- Aditivas — coexistem com characters_dev_transition_* (que ainda
-- permite tudo a anon+authenticated). Não restringem nada hoje; são a
-- base real para quando dev_transition puder ser removida (narrador
-- autenticado já usa getScopedTableClient() desde v0.28 — quando
-- estiver logado, essas policies já bastam sozinhas).
-- ---------------------------------------------------------------------

drop policy if exists characters_owner_select on characters;
create policy characters_owner_select
  on characters
  for select
  to authenticated
  using (owner_id = (select auth.uid()));

drop policy if exists characters_owner_insert on characters;
create policy characters_owner_insert
  on characters
  for insert
  to authenticated
  with check (owner_id = (select auth.uid()));

drop policy if exists characters_owner_update on characters;
create policy characters_owner_update
  on characters
  for update
  to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

drop policy if exists characters_owner_delete on characters;
create policy characters_owner_delete
  on characters
  for delete
  to authenticated
  using (owner_id = (select auth.uid()));

-- ---------------------------------------------------------------------
-- 2. dev_transition — mantidas, agora com o motivo documentado por
--    policy (comment on policy). Nenhuma foi removida nesta etapa:
--    remover qualquer uma quebraria pelo menos uma rota/teste
--    protegido explicitamente pelo checkpoint (ver comentário de cada
--    uma). "Condição para remoção futura" também documentada.
-- ---------------------------------------------------------------------

comment on policy characters_dev_transition_select on characters is
  'v0.29: MANTIDA. Consumidores anônimos legítimos que ainda precisam de SELECT irrestrito: /join/[token] (listCharactersForCampaign, escopado à mesa mas sem auth.uid()), /dev/character-sheet e /dev/table (listLegacyCharactersDev — diagnóstico, lista TODAS as linhas por design), scripts/test-character-storage.ts (roda sem login). A leitura do personagem ATIVO de uma sessão de jogador (/ficha) não depende mais desta policy — usa get_character_for_profile_session() (security definer), que ignora RLS. Condição para remoção futura: /dev/character-sheet exigir narrador logado para listar, E test-character-storage.ts autenticar antes de rodar.';

comment on policy characters_dev_transition_insert on characters is
  'v0.29: MANTIDA. Consumidores anônimos legítimos: createCharacter() legado (scripts/test-character-storage.ts, botão "Novo personagem"/"Salvar" em /dev/character-sheet quando não há narrador logado). Narrador autenticado já tem characters_owner_insert equivalente. Condição para remoção futura: test-character-storage.ts autenticar antes de criar, e /dev/character-sheet exigir login para salvar novo personagem.';

comment on policy characters_dev_transition_update on characters is
  'v0.29: MANTIDA. Consumidor anônimo remanescente: updateCharacter() legado, usado por scripts/test-character-storage.ts e pelo modo dev de /dev/character-sheet (que permite carregar e editar QUALQUER personagem da lista global, incluindo já vinculados a mesa/perfil — por design de diagnóstico). O salvamento do personagem ATIVO de uma sessão de jogador (/ficha) NÃO usa mais esta policy — usa save_character_for_profile_session() (security definer), que valida a sessão dentro do banco e ignora RLS. Condição para remoção futura: /dev/character-sheet restringir edição a personagens sem vínculo de mesa, OU exigir narrador logado (usando characters_owner_update); test-character-storage.ts autenticar.';

comment on policy characters_dev_transition_delete on characters is
  'v0.29: MANTIDA. Único consumidor: scripts/test-character-storage.ts (limpeza do próprio registro de teste) e o botão "Apagar" em /dev/character-sheet (SavedCharactersTab, diagnóstico). Nenhuma rota de produto (narrador ou jogador) apaga personagem — arquivar (archived_at) é o mecanismo real desde v0.25. Condição para remoção futura: test-character-storage.ts autenticar antes de apagar o próprio registro de teste; /dev/character-sheet exigir login para apagar.';

-- ---------------------------------------------------------------------
-- 3. Funções SQL security definer — acesso ao personagem ATIVO de uma
--    sessão de perfil validada (substituem o acesso direto à tabela
--    em getCharacterForProfileSession/saveCharacterForProfileSession,
--    src/lib/character/storage.ts). Mesma validação que
--    validateProductSession() já fazia em TypeScript, agora também
--    aplicada dentro do banco, atomicamente, sem depender da RLS de
--    characters estar aberta.
--
--    security definer roda com os privilégios de quem criou a função
--    (o "postgres" da migration, que ignora RLS) — por isso o
--    `revoke`+`grant` explícito abaixo: só concede EXECUTE (rodar a
--    função com os parâmetros exatos que ela aceita), nunca acesso
--    direto à tabela por trás.
-- ---------------------------------------------------------------------

create or replace function get_character_for_profile_session(
  p_campaign_id uuid,
  p_profile_id uuid,
  p_session_id text
)
returns setof characters
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile campaign_profiles%rowtype;
begin
  select * into v_profile
  from campaign_profiles
  where id = p_profile_id
    and campaign_id = p_campaign_id
    and is_locked = true
    and lock_session_id = p_session_id;

  if not found then
    return; -- sessão inválida: conjunto vazio, sem lançar erro (mesmo padrão de validateProductSession)
  end if;

  if v_profile.active_character_id is null then
    return; -- sessão válida, mas perfil sem personagem ativo
  end if;

  return query
    select * from characters where id = v_profile.active_character_id;
end;
$$;

revoke all on function get_character_for_profile_session(uuid, uuid, text) from public;
grant execute on function get_character_for_profile_session(uuid, uuid, text) to anon, authenticated;

create or replace function save_character_for_profile_session(
  p_campaign_id uuid,
  p_profile_id uuid,
  p_session_id text,
  p_character_id uuid,
  p_name text,
  p_payload jsonb
)
returns setof characters
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile campaign_profiles%rowtype;
begin
  select * into v_profile
  from campaign_profiles
  where id = p_profile_id
    and campaign_id = p_campaign_id
    and is_locked = true
    and lock_session_id = p_session_id;

  if not found then
    raise exception 'Sessão de perfil inválida — não é possível salvar o personagem.';
  end if;

  if v_profile.active_character_id is distinct from p_character_id then
    raise exception 'Personagem "%" não é mais o ativo desta sessão de perfil.', p_character_id;
  end if;

  return query
    update characters
    set name = p_name, payload = p_payload
    where id = p_character_id
    returning *;
end;
$$;

revoke all on function save_character_for_profile_session(uuid, uuid, text, uuid, text, jsonb) from public;
grant execute on function save_character_for_profile_session(uuid, uuid, text, uuid, text, jsonb) to anon, authenticated;

commit;
