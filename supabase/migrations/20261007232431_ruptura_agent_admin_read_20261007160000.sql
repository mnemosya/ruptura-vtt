-- Interface administrativa: leitura restrita e transições de status controladas.
begin;

grant select on table public.ruptura_agent_sources to authenticated;
grant select on table public.ruptura_agent_findings to authenticated;

drop policy if exists ruptura_agent_sources_admin_read on public.ruptura_agent_sources;
create policy ruptura_agent_sources_admin_read on public.ruptura_agent_sources
  for select to authenticated using ((select public.is_content_admin()));

drop policy if exists ruptura_agent_findings_admin_read on public.ruptura_agent_findings;
create policy ruptura_agent_findings_admin_read on public.ruptura_agent_findings
  for select to authenticated using ((select public.is_content_admin()));

create or replace function public.set_ruptura_agent_finding_status(p_finding_id uuid, p_status text)
returns public.ruptura_agent_findings language plpgsql security definer set search_path = '' as $$
declare
  changed public.ruptura_agent_findings%rowtype;
  v_current_revision text;
  v_finding_revision text;
  v_current_status text;
begin
  if coalesce((select public.is_content_admin()), false) = false then raise exception 'content admin required'; end if;
  if p_status not in ('open', 'acknowledged', 'resolved', 'ignored') then
    raise exception 'invalid status transition';
  end if;
  select s.snapshot_hash, f.source_revision, f.status
    into v_current_revision, v_finding_revision, v_current_status
    from public.ruptura_agent_findings f
    join public.ruptura_agent_sources s on s.id = f.source_id
    where f.id = p_finding_id for share of s;
  if v_current_revision is null then raise exception 'finding not found'; end if;
  if p_status in ('open', 'acknowledged') and
     (v_current_revision is distinct from v_finding_revision or v_current_status = 'stale') then
    raise exception 'stale finding requires a new audit';
  end if;
  update public.ruptura_agent_findings set status = p_status,
    resolved_at = case when p_status = 'resolved' then now() else null end,
    updated_at = now()
    where id = p_finding_id returning * into changed;
  if changed.id is null then raise exception 'finding not found'; end if;
  return changed;
end;
$$;

revoke all on function public.set_ruptura_agent_finding_status(uuid, text) from public, anon;
grant execute on function public.set_ruptura_agent_finding_status(uuid, text) to authenticated;

commit;
