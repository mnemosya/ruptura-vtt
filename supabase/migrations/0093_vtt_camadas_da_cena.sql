-- =====================================================================
-- 0093 — Camadas da CENA: visibilidade e bloqueio passam a valer pra mesa
--
-- Até aqui o painel de Camadas era preferência 100% local
-- (`localStorage`, por usuário e cena): esconder Objetos escondia só
-- da própria tela. Isso invertia o sentido da ferramenta. Camadas é do
-- narrador, e narrador dita o que está no tabuleiro — se ele esconde
-- uma camada, ela some pra mesa; se ele trava, ninguém mexe.
--
-- O estado vira coluna da cena, com a MESMA disciplina do resto do VTT:
--
--   · Escrita só do narrador, e só por RPC — a policy de UPDATE de
--     `vtt_scenes` continua sendo a da 0065; esta função é o caminho
--     estreito que toca uma coluna só.
--   · Concorrência otimista por `revision`, como as outras escritas de
--     cena: quem grava manda a revisão que leu.
--   · Leitura por quem é membro da campanha (a policy de SELECT já
--     existente) — o cliente precisa saber o que está escondido pra
--     não desenhar.
--
-- O que NÃO muda: nenhuma regra de jogo. Pathfinding, colisão, custo de
-- terreno e linha de visão continuam enxergando a camada escondida
-- exatamente como antes — esconder é sobre o que se DESENHA, não sobre
-- o que vale. E o narrador continua vendo o que escondeu (marcado como
-- oculto), pelo mesmo princípio que `vtt_tokens.visivel` já usa.
-- =====================================================================

begin;

alter table vtt_scenes
  add column if not exists camadas jsonb not null default '{}'::jsonb;

alter table vtt_scenes
  drop constraint if exists vtt_scenes_camadas_objeto;
alter table vtt_scenes
  add constraint vtt_scenes_camadas_objeto check (jsonb_typeof(camadas) = 'object');

-- ---------------------------------------------------------------------
-- Escrita: narrador, uma coluna, revisão conferida.
-- ---------------------------------------------------------------------
create or replace function public.set_vtt_scene_camadas(
  p_scene_id uuid,
  p_camadas jsonb,
  p_expected_revision integer
) returns vtt_scenes
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_scene vtt_scenes;
begin
  select * into v_scene from public.vtt_scenes where id = p_scene_id for update;
  if v_scene.id is null then
    raise exception 'Cena não encontrada.' using errcode = 'no_data_found';
  end if;
  if not public.is_campaign_owner(v_scene.campaign_id, auth.uid()) then
    raise exception 'Só o narrador ajusta as camadas da cena.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_camadas) <> 'object' then
    raise exception 'Camadas inválidas.' using errcode = 'invalid_parameter_value';
  end if;
  if v_scene.revision <> p_expected_revision then
    raise exception 'A cena mudou enquanto você editava.' using errcode = 'serialization_failure';
  end if;

  update public.vtt_scenes
     set camadas = p_camadas,
         revision = revision + 1
   where id = p_scene_id
  returning * into v_scene;
  return v_scene;
end;
$$;

revoke all on function public.set_vtt_scene_camadas(uuid, jsonb, integer) from public, anon;
grant execute on function public.set_vtt_scene_camadas(uuid, jsonb, integer) to authenticated;

-- ---------------------------------------------------------------------
-- Realtime: a cena precisa CHEGAR aos outros participantes sozinha.
-- `replica identity full` pelo mesmo motivo da 0088 — sem ela o
-- payload de UPDATE não traz o suficiente pra filtrar por campanha.
-- ---------------------------------------------------------------------
alter table vtt_scenes replica identity full;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'vtt_scenes'
  ) then
    alter publication supabase_realtime add table public.vtt_scenes;
  end if;
end $$;

commit;
