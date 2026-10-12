-- Jobs do RUPTURA Agent. Apenas service_role pode invocar as RPCs.
begin;

create table if not exists public.ruptura_agent_jobs (
  id uuid primary key default gen_random_uuid(),
  job_key text not null unique,
  kind text not null check (kind in ('crawl', 'source_changed', 'source_created', 'source_removed', 'guide_changed', 'baseline_audit')),
  status text not null default 'pending' check (status in ('pending', 'running', 'completed', 'retry', 'failed', 'incomplete')),
  source_id uuid references public.ruptura_agent_sources(id) on delete set null,
  source_revision text,
  analyzer_version text not null,
  priority smallint not null default 50,
  attempts integer not null default 0 check (attempts >= 0),
  max_attempts integer not null default 3 check (max_attempts > 0),
  available_at timestamptz not null default now(),
  locked_at timestamptz,
  locked_by text,
  started_at timestamptz,
  finished_at timestamptz,
  input jsonb not null default '{}'::jsonb,
  result jsonb not null default '{}'::jsonb,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ruptura_agent_jobs_lock_ck check ((locked_at is null) = (locked_by is null))
);

create index if not exists ruptura_agent_jobs_claim_idx
  on public.ruptura_agent_jobs (priority desc, available_at, created_at)
  where status in ('pending', 'retry', 'running');
create index if not exists ruptura_agent_jobs_source_idx
  on public.ruptura_agent_jobs (source_id, created_at desc);

alter table public.ruptura_agent_jobs enable row level security;
revoke all on table public.ruptura_agent_jobs from public, anon, authenticated;
grant select, insert, update on table public.ruptura_agent_jobs to service_role;

-- Cada lote é atômico: nunca gravamos uma revisão sem seu job correspondente.
create or replace function public.persist_ruptura_agent_batch(p_items jsonb, p_seen_at timestamptz)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  item jsonb;
  s jsonb;
  old_row public.ruptura_agent_sources%rowtype;
  saved_id uuid;
  v_kind text;
  v_count integer := 0;
  v_version text;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'service_role required'; end if;
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) > 25 then
    raise exception 'p_items must be an array of at most 25 sources';
  end if;
  for item in select value from jsonb_array_elements(p_items) as t(value)
    order by value->'source'->>'notion_id'
  loop
    s := item->'source';
    if s is null or s->>'notion_id' is null or s->>'snapshot_hash' is null then
      raise exception 'invalid source payload';
    end if;
    -- Serializa inclusive a primeira inserção, quando ainda não há linha para FOR UPDATE.
    perform pg_catalog.pg_advisory_xact_lock(746202, pg_catalog.hashtext(s->>'notion_id'));
    v_version := coalesce(nullif(item->>'analyzer_version', ''), 'sources-v1');
    select * into old_row from public.ruptura_agent_sources
      where notion_id = s->>'notion_id' for update;
    insert into public.ruptura_agent_sources (
      notion_id, source_type, role, title, path, root_section, parent_notion_id,
      data_source_notion_id, notion_last_edited_at, content_hash, structure_hash,
      snapshot_hash, plain_text, properties, structure, active, last_seen_at, synced_at
    ) values (
      s->>'notion_id', s->>'source_type', s->>'role', s->>'title',
      array(select jsonb_array_elements_text(s->'path')), s->>'root_section',
      s->>'parent_notion_id', s->>'data_source_notion_id',
      nullif(s->>'notion_last_edited_at', '')::timestamptz,
      s->>'content_hash', s->>'structure_hash', s->>'snapshot_hash',
      coalesce(s->>'plain_text', ''), coalesce(s->'properties', '{}'::jsonb),
      coalesce(s->'structure', '{}'::jsonb), true, p_seen_at, now()
    ) on conflict (notion_id) do update set
      source_type = excluded.source_type, role = excluded.role, title = excluded.title,
      path = excluded.path, root_section = excluded.root_section,
      parent_notion_id = excluded.parent_notion_id,
      data_source_notion_id = excluded.data_source_notion_id,
      notion_last_edited_at = excluded.notion_last_edited_at,
      content_hash = excluded.content_hash, structure_hash = excluded.structure_hash,
      snapshot_hash = excluded.snapshot_hash, plain_text = excluded.plain_text,
      properties = excluded.properties, structure = excluded.structure,
      active = true, last_seen_at = excluded.last_seen_at, synced_at = excluded.synced_at
    returning id into saved_id;

    if not found then raise exception 'source upsert failed'; end if;
    if old_row.id is null then v_kind := 'source_created';
    elsif old_row.snapshot_hash is distinct from s->>'snapshot_hash' or not old_row.active then
      if s->>'role' in ('editorial_guide', 'design_guide') then v_kind := 'guide_changed';
      else v_kind := 'source_changed'; end if;
    else v_kind := null; end if;

    if v_kind is not null then
      insert into public.ruptura_agent_jobs (
        job_key, kind, source_id, source_revision, analyzer_version, priority, input
      ) values (
        v_kind || ':' || (s->>'notion_id') || ':' || (s->>'snapshot_hash') || ':' || v_version || ':' || p_seen_at::text,
        v_kind, saved_id, s->>'snapshot_hash', v_version,
        case v_kind when 'guide_changed' then 90 when 'source_changed' then 60 else 20 end,
        jsonb_build_object('notion_id', s->>'notion_id', 'before_hash', old_row.snapshot_hash,
          'after_hash', s->>'snapshot_hash', 'diff', coalesce(item->'diff', '{}'::jsonb))
      ) on conflict (job_key) do nothing;
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end;
$$;

-- Chamado somente depois de o crawl inteiro terminar. Remoção e job são atômicos.
create or replace function public.sweep_ruptura_agent_sources(p_seen_at timestamptz, p_analyzer_version text default 'sources-v1')
returns integer language plpgsql security definer set search_path = '' as $$
declare
  source_row public.ruptura_agent_sources%rowtype;
  v_count integer := 0;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'service_role required'; end if;
  for source_row in
    select * from public.ruptura_agent_sources
    where active and last_seen_at < p_seen_at order by notion_id for update
  loop
    update public.ruptura_agent_sources set active = false, synced_at = now()
      where id = source_row.id;
    insert into public.ruptura_agent_jobs (
      job_key, kind, source_id, source_revision, analyzer_version, priority, input
    ) values (
      'source_removed:' || source_row.notion_id || ':' || source_row.snapshot_hash || ':' || p_analyzer_version || ':' || p_seen_at::text,
      'source_removed', source_row.id, source_row.snapshot_hash, p_analyzer_version, 80,
      jsonb_build_object('notion_id', source_row.notion_id, 'path', source_row.path)
    ) on conflict (job_key) do nothing;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

create or replace function public.claim_ruptura_agent_job(p_worker_id text, p_lease_seconds integer default 3600)
returns public.ruptura_agent_jobs language plpgsql security definer set search_path = '' as $$
declare
  claimed public.ruptura_agent_jobs%rowtype;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'service_role required'; end if;
  if nullif(trim(p_worker_id), '') is null or p_lease_seconds <> 3600 then
    raise exception 'invalid worker or lease';
  end if;
  update public.ruptura_agent_jobs set status = 'failed', locked_at = null, locked_by = null,
    finished_at = now(), updated_at = now(), last_error = 'lease expired after max_attempts'
    where status = 'running' and locked_at < now() - make_interval(secs => p_lease_seconds)
      and attempts >= max_attempts;
  select * into claimed from public.ruptura_agent_jobs
    where kind <> 'crawl' and attempts < max_attempts and available_at <= now()
      and (status in ('pending', 'retry') or
        (status = 'running' and locked_at < now() - make_interval(secs => p_lease_seconds)))
    order by priority desc, available_at, created_at
    for update skip locked limit 1;
  if claimed.id is null then return null; end if;
  update public.ruptura_agent_jobs set status = 'running', attempts = attempts + 1,
    locked_at = now(), locked_by = p_worker_id, started_at = now(),
    finished_at = null, updated_at = now()
    where id = claimed.id returning * into claimed;
  return claimed;
end;
$$;

create or replace function public.start_ruptura_agent_crawl(p_run_id text, p_worker_id text)
returns public.ruptura_agent_jobs language plpgsql security definer set search_path = '' as $$
declare started public.ruptura_agent_jobs%rowtype;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'service_role required'; end if;
  if nullif(trim(p_run_id), '') is null or nullif(trim(p_worker_id), '') is null then
    raise exception 'run and worker are required';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(746201, 1);
  update public.ruptura_agent_jobs set status = 'failed', finished_at = now(),
    locked_at = null, locked_by = null, updated_at = now(), last_error = 'crawler stopped before completion'
    where kind = 'crawl' and status = 'running' and started_at < now() - interval '4 hours';
  if exists (select 1 from public.ruptura_agent_jobs where kind = 'crawl' and status = 'running') then
    raise exception 'another RUPTURA Agent crawl is running';
  end if;
  insert into public.ruptura_agent_jobs (
    job_key, kind, status, analyzer_version, priority, attempts,
    locked_at, locked_by, started_at, input
  ) values (
    'crawl:' || p_run_id, 'crawl', 'running', 'sources-v1', 100, 1,
    now(), p_worker_id, now(), jsonb_build_object('run_id', p_run_id)
  ) on conflict (job_key) do nothing;
  select * into started from public.ruptura_agent_jobs where job_key = 'crawl:' || p_run_id;
  if started.status <> 'running' or started.locked_by <> p_worker_id then
    raise exception 'crawl run already finished or owned by another worker';
  end if;
  return started;
end;
$$;

create or replace function public.finish_ruptura_agent_job(
  p_job_id uuid, p_worker_id text, p_status text, p_result jsonb default '{}'::jsonb,
  p_error text default null, p_retry_seconds integer default 60
) returns public.ruptura_agent_jobs language plpgsql security definer set search_path = '' as $$
declare
  finished public.ruptura_agent_jobs%rowtype;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'service_role required'; end if;
  if p_status not in ('completed', 'retry', 'failed', 'incomplete') or p_retry_seconds < 0 then
    raise exception 'invalid finish status';
  end if;
  update public.ruptura_agent_jobs set
    status = case when p_status = 'retry' and attempts >= max_attempts then 'failed' else p_status end,
    result = coalesce(p_result, '{}'::jsonb), last_error = left(p_error, 2000),
    available_at = case when p_status = 'retry' then now() + make_interval(secs => p_retry_seconds) else available_at end,
    locked_at = null, locked_by = null,
    finished_at = case when p_status = 'retry' and attempts < max_attempts then null else now() end,
    updated_at = now()
  where id = p_job_id and status = 'running' and locked_by = p_worker_id
  returning * into finished;
  if finished.id is null then raise exception 'job lock lost or job not running'; end if;
  return finished;
end;
$$;

revoke all on function public.persist_ruptura_agent_batch(jsonb, timestamptz) from public, anon, authenticated;
revoke all on function public.sweep_ruptura_agent_sources(timestamptz, text) from public, anon, authenticated;
revoke all on function public.claim_ruptura_agent_job(text, integer) from public, anon, authenticated;
revoke all on function public.start_ruptura_agent_crawl(text, text) from public, anon, authenticated;
revoke all on function public.finish_ruptura_agent_job(uuid, text, text, jsonb, text, integer) from public, anon, authenticated;
grant execute on function public.persist_ruptura_agent_batch(jsonb, timestamptz) to service_role;
grant execute on function public.sweep_ruptura_agent_sources(timestamptz, text) to service_role;
grant execute on function public.claim_ruptura_agent_job(text, integer) to service_role;
grant execute on function public.start_ruptura_agent_crawl(text, text) to service_role;
grant execute on function public.finish_ruptura_agent_job(uuid, text, text, jsonb, text, integer) to service_role;

commit;
