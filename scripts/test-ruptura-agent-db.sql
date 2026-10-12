-- Executar apenas em Postgres local descartável após as migrations do Agent.
begin;
select set_config('request.jwt.claim.role', 'service_role', true);

do $$
declare
  source jsonb;
  batch jsonb;
  v_source_id uuid;
  job public.ruptura_agent_jobs%rowtype;
  finding jsonb;
begin
  source := jsonb_build_object(
    'notion_id', 'agent-db-test-page', 'source_type', 'page', 'role', 'book',
    'title', 'Página teste', 'path', jsonb_build_array('RUPTURA (1.2)', 'Página teste'),
    'content_hash', repeat('a', 64), 'structure_hash', repeat('b', 64),
    'snapshot_hash', repeat('c', 64), 'plain_text', 'Texto teste',
    'properties', '{}'::jsonb, 'structure', '{}'::jsonb
  );
  batch := jsonb_build_array(jsonb_build_object('source', source, 'analyzer_version', 'test-v1'));
  if public.persist_ruptura_agent_batch(batch, '2026-10-07 00:00:00+00') <> 1 then
    raise exception 'primeira inserção não criou job';
  end if;
  if public.persist_ruptura_agent_batch(batch, '2026-10-07 00:01:00+00') <> 0 then
    raise exception 'snapshot idêntico criou job duplicado';
  end if;
  select id into v_source_id from public.ruptura_agent_sources where notion_id = 'agent-db-test-page';
  if (select count(*) from public.ruptura_agent_jobs where source_id = v_source_id) <> 1 then
    raise exception 'quantidade incorreta de jobs';
  end if;

  job := public.claim_ruptura_agent_job('db-test-worker');
  if job.kind <> 'source_created' or job.status <> 'running' or job.attempts <> 1 then
    raise exception 'claim incorreto';
  end if;
  job := public.finish_ruptura_agent_job(job.id, 'db-test-worker', 'retry', '{}'::jsonb, 'falha simulada', 0);
  if job.status <> 'retry' then raise exception 'retry não persistido'; end if;
  job := public.claim_ruptura_agent_job('db-test-worker');
  if job.attempts <> 2 then raise exception 'retry não recuperado'; end if;
  perform public.finish_ruptura_agent_job(job.id, 'db-test-worker', 'completed');

  finding := jsonb_build_object(
    'fingerprint', 'db-test-finding', 'category', 'editorial', 'detector', 'test',
    'severity', 'low', 'confidence', 1, 'title', 'Teste', 'description', 'Descrição',
    'rationale', 'Rationale', 'evidence', jsonb_build_array(jsonb_build_object('blockId', 'b1', 'quote', 'Texto teste'))
  );
  if public.record_ruptura_agent_findings('agent-db-test-page', repeat('c',64), jsonb_build_array(finding), array['test'], job.id) <> 1 then
    raise exception 'finding não registrado';
  end if;
  perform public.record_ruptura_agent_findings('agent-db-test-page', repeat('c',64), jsonb_build_array(finding), array['test'], job.id);
  if (select occurrences from public.ruptura_agent_findings where fingerprint = 'db-test-finding') <> 1 then
    raise exception 'finding duplicado no mesmo job';
  end if;

  source := jsonb_set(source, '{snapshot_hash}', to_jsonb(repeat('d', 64)));
  batch := jsonb_build_array(jsonb_build_object('source', source, 'analyzer_version', 'test-v1'));
  if public.persist_ruptura_agent_batch(batch, '2026-10-07 00:02:00+00') <> 1 then
    raise exception 'mudança não criou job';
  end if;
  if (select status from public.ruptura_agent_findings where fingerprint = 'db-test-finding') <> 'stale' then
    raise exception 'mudança não marcou finding stale';
  end if;
  if (select count(*) from public.ruptura_agent_jobs where kind = 'source_changed') <> 1 then
    raise exception 'mudança criou quantidade incorreta de jobs';
  end if;
  if public.sweep_ruptura_agent_sources('2026-10-07 00:03:00+00', 'test-v1') <> 1 then
    raise exception 'remoção não detectada';
  end if;
  if (select active from public.ruptura_agent_sources where id = v_source_id) then
    raise exception 'fonte removida continuou ativa';
  end if;
  if (select count(*) from public.ruptura_agent_jobs where kind = 'source_removed') <> 1 then
    raise exception 'remoção não criou job único';
  end if;
end $$;

-- Conferência de RLS e EXECUTE sem depender de uma conta real.
do $$
begin
  if has_table_privilege('anon', 'public.ruptura_agent_sources', 'select') then
    raise exception 'anon recebeu leitura do corpus';
  end if;
  if has_function_privilege('anon', 'public.persist_ruptura_agent_batch(jsonb,timestamptz)', 'execute') then
    raise exception 'anon recebeu RPC de escrita';
  end if;
  if has_function_privilege('authenticated', 'public.claim_ruptura_agent_job(text,integer)', 'execute') then
    raise exception 'authenticated recebeu claim';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.ruptura_agent_sources'::regclass) then
    raise exception 'RLS ausente em sources';
  end if;
end $$;

set local role authenticated;
do $$
begin
  if (select count(*) from public.ruptura_agent_sources) <> 0 then
    raise exception 'usuário sem papel admin leu corpus';
  end if;
  if (select count(*) from public.ruptura_agent_findings) <> 0 then
    raise exception 'usuário sem papel admin leu findings';
  end if;
  begin
    perform public.set_ruptura_agent_finding_status(gen_random_uuid(), 'ignored');
    raise exception 'usuário sem papel admin alterou finding';
  exception when others then
    if sqlerrm <> 'content admin required' then raise; end if;
  end;
end $$;
reset role;

rollback;
