-- =====================================================================
-- 0087 — Medições PERMANENTES da régua (ferramenta "Medir")
--
-- A régua sempre foi efêmera e puramente local. O modo "Permanente"
-- do painel de Medir precisa que ela sobreviva ao reload e apareça
-- pros outros participantes — ou seja, vira estado de cena de
-- verdade, com persistência, autorização e realtime.
--
-- Modelada linha a linha em `vtt_marks` (0065), que já resolve
-- exatamente esta forma de autorização: qualquer participante cria
-- (como si mesmo), todo participante lê, e apaga quem criou OU o
-- narrador. Reaproveitar aquele desenho — em vez de inventar um
-- terceiro esquema de permissão — mantém uma regra só pra "conteúdo
-- de cena criado por jogador".
--
-- Diferente de `vtt_marks` num ponto de propósito: NÃO existe
-- `privada`. Uma medição é uma afirmação sobre distância no mapa (a
-- que todos precisam poder reagir: "não alcança", "cabe no
-- deslocamento"); uma régua que só o autor enxerga não teria função
-- numa mesa. Todos veem, sempre.
--
-- Guarda só os PONTOS em axial — nunca a distância calculada, nunca
-- pixels. Distância e custo dependem do terreno, que muda: recalcular
-- no cliente (`medir()`, `_dominio/movimento.ts`) faz a régua salva
-- reavaliar sozinha quando alguém pinta terreno difícil por baixo
-- dela. Congelar o número aqui produziria réguas mentirosas.
-- =====================================================================

create table if not exists vtt_measurements (
  id           uuid primary key default gen_random_uuid(),
  scene_id     uuid not null references vtt_scenes(id) on delete cascade,
  campaign_id  uuid not null references campaigns(id) on delete cascade,
  autor_id     uuid not null references auth.users(id) on delete cascade,
  -- Pontos em coordenada axial, na ordem: [{q,r}, …]. Origem, dobras
  -- fixadas com Q e ponta final. Pelo menos dois (uma régua de um
  -- ponto só não mede nada) — o check garante que nenhum cliente
  -- grave uma régua degenerada.
  pontos       jsonb not null,
  cor          text not null default 'ciano'
               check (cor in ('ciano', 'ambar', 'verde', 'vermelho', 'roxo', 'branco')),
  rotulo       text,
  created_at   timestamptz not null default now(),

  constraint vtt_measurements_pontos_min
    check (jsonb_typeof(pontos) = 'array' and jsonb_array_length(pontos) >= 2),
  -- Teto defensivo: a UI limita as dobras pelo gesto, mas nada impede
  -- um cliente adulterado de mandar um array gigante que viraria
  -- payload de realtime pra todo mundo na mesa.
  constraint vtt_measurements_pontos_max
    check (jsonb_array_length(pontos) <= 64)
);

create index if not exists vtt_measurements_scene_idx on vtt_measurements (scene_id);
create index if not exists vtt_measurements_campaign_idx on vtt_measurements (campaign_id);

-- Mesma trava de coerência da 0066 pras marcações: impede uma linha
-- apontar pra uma cena de OUTRA campanha, o que furaria a autorização
-- (que é sempre avaliada por `campaign_id`).
alter table vtt_measurements
  add constraint vtt_measurements_scene_campaign_fk
  foreign key (scene_id, campaign_id) references vtt_scenes (id, campaign_id) on delete cascade;

-- ---------------------------------------------------------------------
-- RLS — idêntica em espírito a `vtt_marks`, sem o recorte de privada.
-- ---------------------------------------------------------------------
alter table vtt_measurements enable row level security;

revoke all on vtt_measurements from anon, authenticated;
grant select, insert, delete on vtt_measurements to authenticated;

-- Todo participante da campanha lê todas as medições da cena.
create policy vtt_measurements_select on vtt_measurements
  for select to authenticated
  using (is_campaign_member(campaign_id));

-- Cria sempre como si mesmo: `autor_id = auth.uid()` no WITH CHECK é o
-- que impede forjar autoria de outro participante (e, por tabela, é o
-- que faz a policy de DELETE abaixo significar alguma coisa).
create policy vtt_measurements_insert on vtt_measurements
  for insert to authenticated
  with check (is_campaign_member(campaign_id) and autor_id = (select auth.uid()));

-- Apaga quem criou, ou o narrador (que precisa poder limpar o mapa).
create policy vtt_measurements_delete on vtt_measurements
  for delete to authenticated
  using (autor_id = (select auth.uid()) or is_campaign_owner(campaign_id));

-- ---------------------------------------------------------------------
-- Realtime
--
-- `replica identity full` pelo mesmo motivo de `vtt_marks`: o filtro
-- dos canais é `campaign_id=eq.<id>`, e num DELETE o registro "old" do
-- WAL só traria a PK (id) com a identidade padrão — sem FULL, apagar
-- uma medição nunca casaria o filtro e o sumiço não chegaria aos
-- outros participantes.
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'vtt_measurements'
  ) then
    alter publication supabase_realtime add table public.vtt_measurements;
  end if;
end $$;

alter table vtt_measurements replica identity full;

comment on table vtt_measurements is
  'Réguas permanentes da ferramenta Medir. Guarda só os pontos axiais — distância/custo são recalculados no cliente a partir do terreno atual. Todos os participantes leem; apaga o autor ou o narrador.';
