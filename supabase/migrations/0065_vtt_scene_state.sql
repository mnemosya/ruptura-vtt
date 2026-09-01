-- =====================================================================
-- 0065 — Estado canônico da cena do VTT (fase 1 das ferramentas de mesa)
--
-- Substitui a cena de demonstração em memória (`_dados/cenaDemo.ts`) por
-- estado persistido e escopado à campanha. Escopo DELIBERADAMENTE
-- mínimo: só o que as quatro ferramentas desta fase (Interagir, Medir,
-- Marcar, Terreno) precisam. Sem paredes, portas, luzes, fog, camadas
-- ou catálogo de assets — esses viriam com abstrações que ainda não
-- sabemos a forma certa.
--
-- GRANULARIDADE: terreno é UMA LINHA POR CÉLULA, não um JSON de mapa.
-- Pintar uma célula vira um upsert de uma linha, e duas pessoas
-- pintando células diferentes ao mesmo tempo não se sobrescrevem. Um
-- blob monolítico transformaria cada pincelada numa reescrita do mapa
-- inteiro, com last-write-wins silencioso — exatamente o que o pedido
-- proíbe.
--
-- AUTORIZAÇÃO: no BANCO, via RLS, não só na interface. As três regras
-- que importam nesta fase:
--   • terreno e estrutura da cena: SÓ o narrador (`is_campaign_owner`);
--   • mover token: narrador OU quem controla o personagem vinculado
--     (`character_controllers`) — um token sem `character_id` é do
--     narrador por definição;
--   • marcação: qualquer membro cria a sua; apagar só o autor ou o
--     narrador.
-- Um jogador chamando o banco diretamente (fora da UI) esbarra nas
-- mesmas policies.
--
-- 1 célula = 1 metro (`docs/fontes/16 COMBATE` → ESPAÇOS E MEDIDAS).
-- Coordenadas são axiais (q, r), a mesma convenção de
-- `src/app/mesas/[campaignId]/vtt/_mapa/hex.ts`.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Cenas
-- ---------------------------------------------------------------------
create table if not exists vtt_scenes (
  id           uuid primary key default gen_random_uuid(),
  campaign_id  uuid not null references campaigns(id) on delete cascade,
  nome         text not null default 'Cena',
  local        text,
  resumo       text,
  -- Extensão da grade em CÉLULAS (= metros).
  largura      integer not null default 26 check (largura between 1 and 200),
  altura       integer not null default 18 check (altura between 1 and 200),
  ativa        boolean not null default true,
  -- Contador de revisão: quem escreve manda a revisão que leu, e a
  -- escrita só passa se ainda for a corrente. É o que impede
  -- sobrescrita silenciosa sem precisar travar a linha.
  revision     integer not null default 1,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (id, campaign_id)
);

create index if not exists vtt_scenes_campaign_idx on vtt_scenes (campaign_id) where ativa;

-- ---------------------------------------------------------------------
-- 2. Tokens
-- ---------------------------------------------------------------------
create table if not exists vtt_tokens (
  id            uuid primary key default gen_random_uuid(),
  scene_id      uuid not null references vtt_scenes(id) on delete cascade,
  -- `campaign_id` denormalizado de propósito: é o filtro do canal de
  -- Realtime e o alvo das policies. Sem ele, toda checagem viraria um
  -- join com `vtt_scenes` dentro da policy.
  campaign_id   uuid not null references campaigns(id) on delete cascade,
  -- Vínculo opcional com personagem. NULL = token só do narrador (PN
  -- genérico, objeto animado), que nenhum jogador pode mover.
  character_id  uuid references characters(id) on delete set null,
  nome          text not null,
  sigla         text not null default '??',
  lado          text not null default 'pn' check (lado in ('pj', 'pn', 'neutro')),
  vertente      text not null default 'nenhuma',
  -- Posição axial. 1 célula = 1 metro.
  q             integer not null,
  r             integer not null,
  tamanho       text not null default 'medio'
                check (tamanho in ('pequeno', 'medio', 'grande', 'enorme', 'colossal')),
  -- Travado: nem o dono move sem destravar (evita arrastar sem querer).
  bloqueado     boolean not null default false,
  -- Visibilidade básica: token oculto some pra jogador, nunca pro narrador.
  visivel       boolean not null default true,
  revision      integer not null default 1,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists vtt_tokens_scene_idx on vtt_tokens (scene_id);
create index if not exists vtt_tokens_campaign_idx on vtt_tokens (campaign_id);
create index if not exists vtt_tokens_character_idx on vtt_tokens (character_id) where character_id is not null;

-- ---------------------------------------------------------------------
-- 3. Terreno — uma linha por célula pintada
-- ---------------------------------------------------------------------
create table if not exists vtt_terrain (
  scene_id     uuid not null references vtt_scenes(id) on delete cascade,
  campaign_id  uuid not null references campaigns(id) on delete cascade,
  q            integer not null,
  r            integer not null,
  -- Só os dois tipos desta fase. `elevado`, `zona_morta` e cobertura
  -- ficam FORA do enum de propósito: reservar valor que nenhuma regra
  -- consome ainda seria abstração sem uso — o check é fácil de ampliar
  -- na migration que trouxer a regra junto.
  tipo         text not null check (tipo in ('dificil', 'bloqueado')),
  updated_at   timestamptz not null default now(),
  updated_by   uuid references auth.users(id) on delete set null,
  primary key (scene_id, q, r)
);

create index if not exists vtt_terrain_campaign_idx on vtt_terrain (campaign_id);

-- ---------------------------------------------------------------------
-- 4. Marcações persistentes (linha, seta, desenho, texto)
--
-- Ping NÃO entra aqui: é efêmero por natureza e trafega por broadcast
-- de Realtime, sem tocar o banco.
-- ---------------------------------------------------------------------
create table if not exists vtt_marks (
  id           uuid primary key default gen_random_uuid(),
  scene_id     uuid not null references vtt_scenes(id) on delete cascade,
  campaign_id  uuid not null references campaigns(id) on delete cascade,
  autor_id     uuid not null references auth.users(id) on delete cascade,
  tipo         text not null check (tipo in ('linha', 'seta', 'desenho', 'texto')),
  -- Pontos em coordenada axial: [{q,r}, …]. Texto usa o primeiro ponto
  -- como âncora.
  pontos       jsonb not null,
  texto        text,
  cor          text not null default 'ciano'
               check (cor in ('ciano', 'ambar', 'verde', 'vermelho', 'roxo', 'branco')),
  espessura    integer not null default 2 check (espessura between 1 and 6),
  opacidade    numeric(3, 2) not null default 0.9 check (opacidade between 0.1 and 1.0),
  -- Privada: visível só pro autor e pro narrador.
  privada      boolean not null default false,
  created_at   timestamptz not null default now()
);

create index if not exists vtt_marks_scene_idx on vtt_marks (scene_id);
create index if not exists vtt_marks_campaign_idx on vtt_marks (campaign_id);

-- ---------------------------------------------------------------------
-- 5. Quem controla o token?
--
-- Função dedicada porque a regra aparece em policy de UPDATE, em
-- Server Action e em teste — três lugares que não podem divergir.
-- Token sem `character_id` é do narrador; com `character_id`, vale o
-- controle registrado em `character_controllers`.
-- ---------------------------------------------------------------------
create or replace function can_move_vtt_token(p_token_id uuid, check_user_id uuid default auth.uid())
returns boolean
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select exists (
    select 1
    from vtt_tokens t
    where t.id = p_token_id
      and (
        is_campaign_owner(t.campaign_id, check_user_id)
        or (
          t.character_id is not null
          and exists (
            select 1 from character_controllers cc
            where cc.character_id = t.character_id and cc.user_id = check_user_id
          )
        )
      )
  );
$$;

revoke all on function can_move_vtt_token(uuid, uuid) from public;
grant execute on function can_move_vtt_token(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 6. RLS
-- ---------------------------------------------------------------------
alter table vtt_scenes  enable row level security;
alter table vtt_tokens  enable row level security;
alter table vtt_terrain enable row level security;
alter table vtt_marks   enable row level security;

revoke all on vtt_scenes  from anon, authenticated;
revoke all on vtt_tokens  from anon, authenticated;
revoke all on vtt_terrain from anon, authenticated;
revoke all on vtt_marks   from anon, authenticated;

grant select on vtt_scenes to authenticated;
grant select, update on vtt_tokens to authenticated;
grant select, insert, update, delete on vtt_terrain to authenticated;
grant select, insert, delete on vtt_marks to authenticated;

-- Cenas: todo membro lê; só o narrador escreve (via service role /
-- Server Action — não há policy de escrita para `authenticated`, então
-- criar/renomear cena não é alcançável direto do cliente nesta fase).
create policy vtt_scenes_select on vtt_scenes
  for select to authenticated
  using (is_campaign_member(campaign_id));

-- Tokens: membro lê os visíveis (narrador lê todos); UPDATE só de quem
-- pode mover aquele token E com o token destravado.
create policy vtt_tokens_select on vtt_tokens
  for select to authenticated
  using (is_campaign_member(campaign_id) and (visivel or is_campaign_owner(campaign_id)));

create policy vtt_tokens_update on vtt_tokens
  for update to authenticated
  using (can_move_vtt_token(id) and (not bloqueado or is_campaign_owner(campaign_id)))
  with check (can_move_vtt_token(id));

-- Terreno: membro lê, SÓ narrador escreve. É a regra que o pedido
-- exige valer "mesmo por chamadas diretas ao servidor ou ao banco".
create policy vtt_terrain_select on vtt_terrain
  for select to authenticated
  using (is_campaign_member(campaign_id));

create policy vtt_terrain_insert on vtt_terrain
  for insert to authenticated
  with check (is_campaign_owner(campaign_id));

create policy vtt_terrain_update on vtt_terrain
  for update to authenticated
  using (is_campaign_owner(campaign_id))
  with check (is_campaign_owner(campaign_id));

create policy vtt_terrain_delete on vtt_terrain
  for delete to authenticated
  using (is_campaign_owner(campaign_id));

-- Marcações: membro lê as públicas; privada só pro autor e pro
-- narrador. Insere sempre como si mesmo (`autor_id = auth.uid()` no
-- WITH CHECK impede forjar autoria). Apaga se autor ou narrador.
create policy vtt_marks_select on vtt_marks
  for select to authenticated
  using (
    is_campaign_member(campaign_id)
    and (not privada or autor_id = (select auth.uid()) or is_campaign_owner(campaign_id))
  );

create policy vtt_marks_insert on vtt_marks
  for insert to authenticated
  with check (is_campaign_member(campaign_id) and autor_id = (select auth.uid()));

create policy vtt_marks_delete on vtt_marks
  for delete to authenticated
  using (autor_id = (select auth.uid()) or is_campaign_owner(campaign_id));

-- ---------------------------------------------------------------------
-- 7. Realtime
--
-- Publicação: sem isto o canal conecta mas nunca recebe evento.
-- REPLICA IDENTITY FULL: o filtro dos canais é `campaign_id=eq.<id>`,
-- e num DELETE o registro "old" do WAL só traz as colunas da PK com a
-- identidade padrão — `vtt_terrain` tem PK (scene_id,q,r) e `vtt_marks`
-- PK (id), então sem FULL o DELETE nunca casaria o filtro e apagar
-- terreno/marcação não chegaria aos outros participantes.
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['vtt_scenes', 'vtt_tokens', 'vtt_terrain', 'vtt_marks'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

alter table vtt_tokens  replica identity full;
alter table vtt_terrain replica identity full;
alter table vtt_marks   replica identity full;
