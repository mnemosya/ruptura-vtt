-- =====================================================================
-- 0091 — Passos de WORKFLOW de combate (idempotência de escrita)
--
-- O painel da Mesa passou a oferecer resolução interativa no card do
-- ataque ("Aplicar dano"). Aplicar dano é uma escrita DESTRUTIVA e
-- REPETÍVEL pela interface (duplo clique, retry de rede, duas pessoas
-- olhando o mesmo card), e `characters.payload` não tem como distinguir
-- "aplicar 15 de dano" de "aplicar 15 de dano de novo".
--
-- Esta tabela é a trava. Uma linha por (workflow, passo), com PK
-- composta: o SEGUNDO `insert` do mesmo passo viola a PK e o servidor
-- devolve "já aplicado" em vez de subtrair PV outra vez. Não é um
-- "melhor esforço" de UI — é uma garantia do banco, que sobrevive a
-- concorrência real entre duas sessões.
--
-- Por que uma tabela e não um índice único em `table_logs`: o log é
-- append-only e propositalmente sem restrição de unicidade (dois
-- eventos idênticos são dois eventos). A trava de idempotência é um
-- conceito diferente e merece o próprio lugar.
--
-- AUTORIZAÇÃO: leitura para participante ativo (o card precisa saber se
-- já foi aplicado); escrita só pelo narrador dono — que é quem as RPCs
-- e a RLS de `characters` já autorizam a mexer em PV alheio. Nenhuma
-- permissão nova é criada aqui.
-- =====================================================================

begin;

create table if not exists campaign_workflow_steps (
  campaign_id uuid not null references campaigns(id) on delete cascade,
  /* Id do workflow — normalmente o `table_logs.id` do evento que abriu
     a resolução (o ataque declarado). Texto, não uuid: um workflow pode
     nascer de um evento que ainda não é linha (`local-…`) e ser
     reconciliado depois. */
  workflow_id text not null,
  /* Passo dentro do workflow: 'aplicar_dano', 'rolar_defesa', … */
  step text not null,
  /* Linha de `table_logs` gerada por este passo — para o card reencontrar o resultado sem reprocessar. */
  log_id uuid references table_logs(id) on delete set null,
  resultado jsonb not null default '{}'::jsonb,
  applied_by uuid references auth.users(id) on delete set null,
  applied_at timestamptz not null default now(),
  primary key (workflow_id, step),
  constraint campaign_workflow_steps_step_ck check (length(btrim(step)) between 1 and 40)
);

create index if not exists campaign_workflow_steps_campanha_idx
  on campaign_workflow_steps (campaign_id, applied_at desc);

comment on table campaign_workflow_steps is
  'Trava de idempotência dos passos de resolução interativa do painel da Mesa (aplicar dano etc.). PK (workflow_id, step): o segundo envio do mesmo passo é recusado pelo banco.';

alter table campaign_workflow_steps enable row level security;

drop policy if exists campaign_workflow_steps_member_select on campaign_workflow_steps;
create policy campaign_workflow_steps_member_select on campaign_workflow_steps
  for select to authenticated
  using (is_campaign_member(campaign_id));

drop policy if exists campaign_workflow_steps_owner_insert on campaign_workflow_steps;
create policy campaign_workflow_steps_owner_insert on campaign_workflow_steps
  for insert to authenticated
  with check (is_campaign_owner(campaign_id));

revoke all on campaign_workflow_steps from anon, authenticated;
grant select, insert on campaign_workflow_steps to authenticated;

commit;
