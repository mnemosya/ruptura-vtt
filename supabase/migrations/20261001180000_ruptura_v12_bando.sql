-- RUPTURA v1.2 — Bando Refratário (capítulo 10, Fase 8).
--
-- Decisão de 01/10/2026: entidade própria 1:1 com a campanha (não payload
-- de `campaigns`, que já carrega a trilha de turnos). Campanha sem linha é
-- campanha sem bando (a regra é opcional).
--
-- Estado em `state` (jsonb), no formato de `CrewStateV12`
-- (src/lib/rulesetV12/crew.ts). O banco garante os invariantes do capítulo
-- (Cobalto ≥ 0, Exposição até 6 pistas, Alerta 0–5, caixa ≥ 0, identidade
-- preenchida). Os limites por operação (−2..+3 de Cobalto, +2 de Exposição e
-- de Alerta) são do motor puro, usado pela interface do narrador.
--
-- Leitura: participantes da campanha. Escrita: narrador, só por RPC, com
-- revisão otimista (compare-and-swap). Conflito sai como `check_violation` com "revision_conflict" (nunca 40001; ver 0155).

create table if not exists public.campaign_crews (
  campaign_id uuid primary key references public.campaigns(id) on delete cascade,
  state jsonb not null,
  revision integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint campaign_crews_state_objeto check (jsonb_typeof(state) = 'object'),
  constraint campaign_crews_nome check (coalesce(trim(state->>'nome'), '') <> ''),
  constraint campaign_crews_cobalto check (jsonb_typeof(state->'cobalto') = 'number' and (state->>'cobalto')::numeric >= 0 and (state->>'cobalto')::numeric = trunc((state->>'cobalto')::numeric)),
  constraint campaign_crews_exposicao check (jsonb_typeof(state->'exposicao_pistas') = 'array' and jsonb_array_length(state->'exposicao_pistas') <= 6),
  constraint campaign_crews_alerta check (jsonb_typeof(state->'alerta') = 'number' and (state->>'alerta')::numeric between 0 and 5 and (state->>'alerta')::numeric = trunc((state->>'alerta')::numeric)),
  constraint campaign_crews_caixa check (jsonb_typeof(state->'caixa') = 'number' and (state->>'caixa')::numeric >= 0),
  constraint campaign_crews_qg check (jsonb_typeof(state->'qg') = 'object' and coalesce(state->'qg'->>'slug', '') <> '' and jsonb_typeof(state->'qg'->'melhorias') = 'array'),
  constraint campaign_crews_listas check (jsonb_typeof(state->'especialistas') = 'array' and jsonb_typeof(state->'coberturas') = 'array')
);

comment on table public.campaign_crews is 'Bando Refratário (RUPTURA v1.2, cap. 10): estado 1:1 com a campanha; escrita só pelo narrador via save_campaign_crew.';

alter table public.campaign_crews enable row level security;

drop policy if exists campaign_crews_member_select on public.campaign_crews;
create policy campaign_crews_member_select on public.campaign_crews
  for select to authenticated
  using (is_campaign_member(campaign_id, auth.uid()) or is_campaign_owner(campaign_id, auth.uid()));

revoke insert, update, delete on public.campaign_crews from authenticated, anon;

create or replace function public.save_campaign_crew(
  p_campaign_id uuid,
  p_state jsonb,
  p_expected_revision integer
) returns public.campaign_crews
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row campaign_crews;
begin
  if auth.uid() is null or not is_campaign_owner(p_campaign_id, auth.uid()) then
    raise exception 'Só o narrador altera o bando.' using errcode = '42501';
  end if;

  if p_expected_revision = 0 then
    insert into campaign_crews (campaign_id, state)
    values (p_campaign_id, p_state)
    on conflict (campaign_id) do nothing
    returning * into v_row;
    if v_row.campaign_id is null then
      raise exception 'revision_conflict: o bando já existe.' using errcode = 'check_violation';
    end if;
    return v_row;
  end if;

  update campaign_crews
     set state = p_state, revision = revision + 1, updated_at = now()
   where campaign_id = p_campaign_id and revision = p_expected_revision
  returning * into v_row;
  if v_row.campaign_id is null then
    raise exception 'revision_conflict: o bando foi alterado em outra janela.' using errcode = 'check_violation';
  end if;
  return v_row;
end;
$$;

revoke all on function public.save_campaign_crew(uuid, jsonb, integer) from public, anon;
grant execute on function public.save_campaign_crew(uuid, jsonb, integer) to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'campaign_crews') then
    alter publication supabase_realtime add table public.campaign_crews;
  end if;
end $$;
