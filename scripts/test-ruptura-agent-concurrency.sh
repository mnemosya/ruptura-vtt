#!/usr/bin/env bash
set -euo pipefail

# Requer um Postgres local descartável com as migrations do Agent aplicadas.
container="${1:-ruptura-agent-pg-concurrency}"
results_dir="$(mktemp -d)"
trap 'rm -rf "$results_dir"' EXIT

run_sql() {
  docker exec "$container" psql -v ON_ERROR_STOP=1 -At -U postgres -d postgres -c "$1"
}

source_sql="select set_config('request.jwt.claim.role', 'service_role', false);
select public.persist_ruptura_agent_batch(jsonb_build_array(jsonb_build_object(
  'source', jsonb_build_object(
    'notion_id', 'agent-concurrent-source', 'source_type', 'page', 'role', 'book',
    'title', 'Concorrência', 'path', jsonb_build_array('Concorrência'),
    'content_hash', repeat('a',64), 'structure_hash', repeat('b',64),
    'snapshot_hash', repeat('c',64), 'plain_text', 'Concorrência',
    'properties', '{}'::jsonb, 'structure', '{}'::jsonb),
  'analyzer_version', 'concurrency-v1')), now());"

pids=()
for i in {1..12}; do
  (run_sql "$source_sql" > "$results_dir/write-$i") &
  pids+=("$!")
done
for pid in "${pids[@]}"; do wait "$pid"; done

counts="$(run_sql "select (select count(*) from public.ruptura_agent_sources where notion_id = 'agent-concurrent-source')::text || '/' || (select count(*) from public.ruptura_agent_jobs where source_revision = repeat('c',64));")"
[[ "$counts" == "1/1" ]] || { echo "upsert concorrente: esperado 1/1, encontrado $counts" >&2; exit 1; }

seed_sql="select set_config('request.jwt.claim.role', 'service_role', false);
select public.persist_ruptura_agent_batch(
  (select jsonb_agg(jsonb_build_object('source', jsonb_build_object(
    'notion_id', 'agent-claim-' || n, 'source_type', 'page', 'role', 'book',
    'title', 'Claim ' || n, 'path', jsonb_build_array('Claim ' || n),
    'content_hash', repeat('a',64), 'structure_hash', repeat('b',64),
    'snapshot_hash', repeat('d',64), 'plain_text', 'Claim',
    'properties', '{}'::jsonb, 'structure', '{}'::jsonb),
    'analyzer_version', 'concurrency-v1')) from generate_series(1,12) n), now());"
run_sql "$seed_sql" > /dev/null

pids=()
for i in {1..12}; do
  (run_sql "select set_config('request.jwt.claim.role', 'service_role', false); select (public.claim_ruptura_agent_job('worker-$i')).id;" | tail -n 1 > "$results_dir/claim-$i") &
  pids+=("$!")
done
for pid in "${pids[@]}"; do wait "$pid"; done
cat "$results_dir"/claim-* | rg -v '^$' > "$results_dir/claimed"
claim_count="$(wc -l < "$results_dir/claimed" | tr -d ' ')"
unique_count="$(sort -u "$results_dir/claimed" | wc -l | tr -d ' ')"
[[ "$claim_count" == "12" && "$unique_count" == "12" ]] || {
  echo "claim concorrente: $claim_count recebidos, $unique_count únicos" >&2; exit 1;
}

pids=()
for i in 1 2; do
  (
    if run_sql "select set_config('request.jwt.claim.role', 'service_role', false); select (public.start_ruptura_agent_crawl('concurrent-crawl-$i', 'worker-$i')).id;" > "$results_dir/crawl-$i.out" 2> "$results_dir/crawl-$i.err"; then
      echo success > "$results_dir/crawl-$i.status"
    else
      echo blocked > "$results_dir/crawl-$i.status"
    fi
  ) &
  pids+=("$!")
done
for pid in "${pids[@]}"; do wait "$pid"; done
success_count="$(rg -l '^success$' "$results_dir"/crawl-*.status | wc -l | tr -d ' ')"
blocked_count="$(rg -l '^blocked$' "$results_dir"/crawl-*.status | wc -l | tr -d ' ')"
[[ "$success_count" == "1" && "$blocked_count" == "1" ]] || {
  echo "crawl concorrente: $success_count iniciados, $blocked_count bloqueados" >&2; exit 1;
}
rg -q 'another RUPTURA Agent crawl is running' "$results_dir"/crawl-*.err || {
  echo "segundo crawl falhou por motivo inesperado" >&2; exit 1;
}

echo "Concorrência: 12 upserts → 1 source/1 job; 12 claims → 12 jobs distintos; 2 crawls → 1 bloqueado."
