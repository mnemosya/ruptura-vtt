-- Achados auditáveis; nenhum acesso direto de anon/authenticated.
begin;

create table if not exists public.ruptura_agent_findings (
  id uuid primary key default gen_random_uuid(),
  fingerprint text not null unique,
  category text not null check (category in ('editorial', 'terminology', 'rule_consistency', 'cross_reference', 'design_consistency', 'source_conflict')),
  detector text not null,
  severity text not null check (severity in ('high', 'medium', 'low', 'info')),
  status text not null default 'open' check (status in ('open', 'acknowledged', 'stale', 'resolved', 'ignored')),
  confidence numeric not null check (confidence between 0 and 1),
  source_id uuid not null references public.ruptura_agent_sources(id) on delete cascade,
  source_revision text not null,
  block_id text,
  related_source_ids uuid[] not null default '{}',
  title text not null,
  description text not null,
  rationale text not null,
  evidence jsonb not null check (jsonb_typeof(evidence) = 'array' and jsonb_array_length(evidence) > 0),
  suggested_action text,
  first_job_id uuid references public.ruptura_agent_jobs(id) on delete set null,
  last_job_id uuid references public.ruptura_agent_jobs(id) on delete set null,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  occurrences integer not null default 1 check (occurrences > 0),
  resolved_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists ruptura_agent_findings_status_idx
  on public.ruptura_agent_findings (status, severity, updated_at desc);
create index if not exists ruptura_agent_findings_source_idx
  on public.ruptura_agent_findings (source_id, status);
create index if not exists ruptura_agent_findings_related_idx
  on public.ruptura_agent_findings using gin (related_source_ids);

alter table public.ruptura_agent_findings enable row level security;
revoke all on table public.ruptura_agent_findings from public, anon, authenticated;
grant select, insert, update on table public.ruptura_agent_findings to service_role;

-- Persistência e ciclo de vida de uma auditoria determinística por fonte.
-- Os fingerprints ausentes são resolvidos somente quando a revisão auditada
-- ainda é a revisão corrente; falha parcial não resolve achados antigos.
create or replace function public.record_ruptura_agent_findings(
  p_source_notion_id text, p_revision text, p_findings jsonb, p_detectors text[], p_job_id uuid default null
) returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_source public.ruptura_agent_sources%rowtype;
  finding jsonb;
  fingerprints text[] := '{}';
  v_count integer := 0;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'service_role required'; end if;
  if jsonb_typeof(p_findings) is distinct from 'array' or p_detectors is null then
    raise exception 'findings and detectors are required';
  end if;
  select * into v_source from public.ruptura_agent_sources
    where notion_id = p_source_notion_id for update;
  if v_source.id is null or not v_source.active or v_source.snapshot_hash is distinct from p_revision then
    raise exception 'source revision is no longer current';
  end if;
  for finding in select value from jsonb_array_elements(p_findings) as t(value) loop
    if nullif(finding->>'fingerprint', '') is null or not (finding->>'detector' = any(p_detectors)) or
       jsonb_typeof(finding->'evidence') is distinct from 'array' or
       jsonb_array_length(finding->'evidence') = 0 then
      raise exception 'finding requires fingerprint and evidence';
    end if;
    fingerprints := array_append(fingerprints, finding->>'fingerprint');
    insert into public.ruptura_agent_findings (
      fingerprint, category, detector, severity, confidence, source_id,
      source_revision, block_id, related_source_ids, title, description,
      rationale, evidence, suggested_action, first_job_id, last_job_id
    ) values (
      finding->>'fingerprint', finding->>'category', finding->>'detector',
      finding->>'severity', (finding->>'confidence')::numeric, v_source.id,
      p_revision, finding->>'blockId', '{}', finding->>'title',
      finding->>'description', finding->>'rationale', finding->'evidence',
      finding->>'suggestedAction', p_job_id, p_job_id
    ) on conflict (fingerprint) do update set
      severity = excluded.severity, confidence = excluded.confidence,
      source_revision = excluded.source_revision, block_id = excluded.block_id,
      title = excluded.title, description = excluded.description,
      rationale = excluded.rationale, evidence = excluded.evidence,
      suggested_action = excluded.suggested_action, last_job_id = excluded.last_job_id,
      last_seen_at = now(), updated_at = now(),
      occurrences = public.ruptura_agent_findings.occurrences +
        case when excluded.last_job_id is null or public.ruptura_agent_findings.last_job_id is distinct from excluded.last_job_id then 1 else 0 end,
      status = case when public.ruptura_agent_findings.status in ('stale', 'resolved') then 'open'
        else public.ruptura_agent_findings.status end,
      resolved_at = null;
    v_count := v_count + 1;
  end loop;
  update public.ruptura_agent_findings set status = 'resolved', resolved_at = now(), updated_at = now()
    where source_id = v_source.id and detector = any(p_detectors)
      and status in ('open', 'stale') and not (fingerprint = any(fingerprints));
  return v_count;
end;
$$;

create or replace function public.stale_ruptura_agent_findings(p_source_id uuid, p_revision text)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_count integer;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'service_role required'; end if;
  update public.ruptura_agent_findings set status = 'stale', updated_at = now()
    where source_id = p_source_id and source_revision is distinct from p_revision
      and status in ('open', 'acknowledged');
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Achados semânticos não são resolvidos pela ausência em uma rodada posterior.
create or replace function public.record_ruptura_agent_semantic_findings(
  p_source_notion_id text, p_revision text, p_findings jsonb, p_job_id uuid default null
) returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_source public.ruptura_agent_sources%rowtype;
  finding jsonb;
  v_count integer := 0;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'service_role required'; end if;
  if jsonb_typeof(p_findings) is distinct from 'array' then raise exception 'findings must be array'; end if;
  select * into v_source from public.ruptura_agent_sources
    where notion_id = p_source_notion_id for update;
  if v_source.id is null or not v_source.active or v_source.snapshot_hash is distinct from p_revision then
    raise exception 'source revision is no longer current';
  end if;
  for finding in select value from jsonb_array_elements(p_findings) as t(value) loop
    if nullif(finding->>'fingerprint', '') is null or
       jsonb_typeof(finding->'evidence') is distinct from 'array' or
       jsonb_array_length(finding->'evidence') = 0 then
      raise exception 'semantic finding requires fingerprint and evidence';
    end if;
    insert into public.ruptura_agent_findings (
      fingerprint, category, detector, severity, confidence, source_id,
      source_revision, block_id, related_source_ids, title, description,
      rationale, evidence, suggested_action, first_job_id, last_job_id
    ) values (
      finding->>'fingerprint', finding->>'category', 'semantic:v1',
      finding->>'severity', (finding->>'confidence')::numeric, v_source.id,
      p_revision, finding->>'blockId',
      array(select s.id from public.ruptura_agent_sources s where s.notion_id in
        (select jsonb_array_elements_text(finding->'relatedSources'))),
      finding->>'title', finding->>'description', finding->>'rationale',
      finding->'evidence', finding->>'suggestedAction', p_job_id, p_job_id
    ) on conflict (fingerprint) do update set
      severity = excluded.severity, confidence = excluded.confidence,
      source_revision = excluded.source_revision, block_id = excluded.block_id,
      related_source_ids = excluded.related_source_ids,
      title = excluded.title, description = excluded.description,
      rationale = excluded.rationale, evidence = excluded.evidence,
      suggested_action = excluded.suggested_action, last_job_id = excluded.last_job_id,
      last_seen_at = now(), updated_at = now(),
      occurrences = public.ruptura_agent_findings.occurrences +
        case when excluded.last_job_id is null or public.ruptura_agent_findings.last_job_id is distinct from excluded.last_job_id then 1 else 0 end,
      status = case when public.ruptura_agent_findings.status in ('stale', 'resolved') then 'open'
        else public.ruptura_agent_findings.status end,
      resolved_at = null;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

create or replace function public.stale_ruptura_agent_findings_on_source_change()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.snapshot_hash is distinct from new.snapshot_hash or (old.active and not new.active) then
    update public.ruptura_agent_findings set status = 'stale', updated_at = now()
      where (source_id = new.id or related_source_ids @> array[new.id])
        and status in ('open', 'acknowledged');
  end if;
  return new;
end;
$$;

drop trigger if exists ruptura_agent_source_stales_findings on public.ruptura_agent_sources;
create trigger ruptura_agent_source_stales_findings
after update of snapshot_hash, active on public.ruptura_agent_sources
for each row execute function public.stale_ruptura_agent_findings_on_source_change();

revoke all on function public.record_ruptura_agent_findings(text, text, jsonb, text[], uuid) from public, anon, authenticated;
revoke all on function public.stale_ruptura_agent_findings(uuid, text) from public, anon, authenticated;
revoke all on function public.record_ruptura_agent_semantic_findings(text, text, jsonb, uuid) from public, anon, authenticated;
revoke all on function public.stale_ruptura_agent_findings_on_source_change() from public, anon, authenticated;
grant execute on function public.record_ruptura_agent_findings(text, text, jsonb, text[], uuid) to service_role;
grant execute on function public.stale_ruptura_agent_findings(uuid, text) to service_role;
grant execute on function public.record_ruptura_agent_semantic_findings(text, text, jsonb, uuid) to service_role;

commit;
