-- =====================================================================
-- Ruptura VTT — draft persistente do wizard de criação de personagem
-- Migration: 0047_character_creation_drafts
--
-- PROBLEMA: o wizard (`CreateCharacterWizardClient.tsx`) guarda todo o
-- estado em `useState` puro — fechar a aba antes da Etapa 7 perde tudo.
-- Pendência documentada desde `CHECKPOINT_CRIACAO_AUTONOMA_JOGADOR.md`
-- ("PRD 'salvar e sair / retomar / cancelar'"), adiada até o formato do
-- payload estabilizar (migration 0046). Escopo desta migration: só o
-- fluxo do JOGADOR (perfil já reivindicado, `auth.uid()` conhecido) —
-- o fluxo do narrador (criação ad-hoc sem perfil travado) fica fora.
--
-- O que é persistido: só ESCOLHAS mínimas (slugs/quantidades/níveis),
-- NUNCA dados derivados de conteúdo canônico (preço, nome) — carteira
-- e inventário são reconstruídos no client a partir do conteúdo efetivo
-- ATUAL no momento da restauração (replay de `purchaseItem`), nunca uma
-- foto congelada. Ver `src/lib/character/storage.ts` e
-- `CreateCharacterWizardClient.tsx` para o consumo.
--
-- SEGURANÇA (2 camadas, mesma filosofia de `complete_character_creation`
-- desde a migration 0044/0046):
--   1. RLS restrita a `select`/`delete` (carregar/cancelar), exigindo
--      não só `owner_id = auth.uid()` mas que o `profile_id` enviado
--      REALMENTE pertença a esse usuário NESSA campanha — sem isso, um
--      atacante que soubesse o UUID de outro perfil poderia ocupar a
--      linha `(campaign_id, profile_id)` primeiro (índice único) e
--      bloquear o dono real de salvar.
--   2. Gravação (`insert`/`update`) NUNCA é feita direto pelo client —
--      só através da RPC `security definer` `save_character_creation_draft`,
--      que repete a mesma checagem de posse de forma atômica, dentro da
--      MESMA transação que grava, e adicionalmente rejeita a gravação
--      se o perfil já tiver um personagem não arquivado (fecha a corrida
--      "autosave atrasado recria o draft depois da conclusão" no
--      servidor, não só no client) e faz compare-and-swap por `revision`
--      (protege contra duas abas/saves fora de ordem sobrescrevendo um
--      ao outro silenciosamente).
--
-- A exclusão do draft na CONCLUSÃO da criação é feita pela migration
-- 0048 (dentro da própria transação de `complete_character_creation`),
-- não aqui — não há dependência circular porque aquela migration só
-- referencia esta tabela depois dela existir.
-- =====================================================================

begin;

create table character_creation_drafts (
  id                   uuid primary key default gen_random_uuid(),
  campaign_id          uuid not null references campaigns(id) on delete cascade,
  profile_id           uuid not null references campaign_profiles(id) on delete cascade,
  owner_id             uuid not null default auth.uid() references auth.users(id) on delete cascade,
  creation_request_id  text not null,
  payload              jsonb not null,
  revision             integer not null default 1,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create unique index character_creation_drafts_campaign_profile_unique
  on character_creation_drafts (campaign_id, profile_id);

alter table character_creation_drafts enable row level security;

-- Camada 1 (RLS) — cobre select/delete diretos do client. A gravação
-- real (insert/update) é feita só pela RPC abaixo (security definer),
-- que roda como owner da função e não depende desta policy para
-- escrever — mas a policy continua como defesa em profundidade caso
-- algo tente inserir/atualizar direto na tabela.
create policy character_creation_drafts_owner_all
  on character_creation_drafts
  for all
  to authenticated
  using (
    owner_id = auth.uid()
    and exists (
      select 1 from campaign_profiles p
      where p.id = profile_id
        and p.campaign_id = campaign_id
        and p.user_id = auth.uid()
    )
  )
  with check (
    owner_id = auth.uid()
    and exists (
      select 1 from campaign_profiles p
      where p.id = profile_id
        and p.campaign_id = campaign_id
        and p.user_id = auth.uid()
    )
  );

revoke all on character_creation_drafts from anon;
grant select, insert, update, delete on character_creation_drafts to authenticated;

-- ---------------------------------------------------------------------
-- RPC atômica de gravação — único caminho de escrita real.
-- ---------------------------------------------------------------------
create or replace function save_character_creation_draft(
  p_campaign_id uuid,
  p_profile_id uuid,
  p_creation_request_id text,
  p_payload jsonb,
  p_expected_revision integer
)
returns table (revision integer)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_uid uuid := auth.uid();
  v_current character_creation_drafts%rowtype;
begin
  if v_uid is null then
    raise exception 'É necessário estar autenticado.' using errcode = 'insufficient_privilege';
  end if;

  if not exists (
    select 1 from campaign_profiles p
    where p.id = p_profile_id and p.campaign_id = p_campaign_id and p.user_id = v_uid
  ) then
    raise exception 'Perfil não pertence a você nesta campanha.' using errcode = 'insufficient_privilege';
  end if;

  -- Fecha a corrida "autosave atrasado recria o draft depois da
  -- conclusão" no servidor: mesmo que o client falhe em cancelar a
  -- tempo, esta checagem roda dentro da MESMA transação da gravação.
  if exists (
    select 1 from characters c
    where c.profile_id = p_profile_id and c.campaign_id = p_campaign_id and c.archived_at is null
  ) then
    raise exception 'Este perfil já tem um personagem — rascunho não pode ser salvo.' using errcode = 'insufficient_privilege';
  end if;

  select * into v_current from character_creation_drafts
    where campaign_id = p_campaign_id and profile_id = p_profile_id
    for update;

  if not found then
    -- `for update` não trava nada quando não há linha — duas primeiras
    -- gravações concorrentes para o mesmo par podem colidir no índice
    -- único; trata como conflito (mesmo sinal que revision_conflict),
    -- o client resincroniza chamando load de novo.
    begin
      insert into character_creation_drafts (campaign_id, profile_id, owner_id, creation_request_id, payload, revision, updated_at)
      values (p_campaign_id, p_profile_id, v_uid, p_creation_request_id, p_payload, 1, now());
    exception
      when unique_violation then
        raise exception 'revision_conflict' using errcode = 'P0001';
    end;
    return query select 1;
    return;
  end if;

  if p_expected_revision is distinct from v_current.revision then
    raise exception 'revision_conflict' using errcode = 'P0001';
  end if;

  update character_creation_drafts
    set payload = p_payload,
        creation_request_id = p_creation_request_id,
        revision = v_current.revision + 1,
        updated_at = now()
    where campaign_id = p_campaign_id and profile_id = p_profile_id;

  return query select v_current.revision + 1;
end;
$$;

revoke all on function save_character_creation_draft(uuid, uuid, text, jsonb, integer) from public, anon;
grant execute on function save_character_creation_draft(uuid, uuid, text, jsonb, integer) to authenticated;

commit;
