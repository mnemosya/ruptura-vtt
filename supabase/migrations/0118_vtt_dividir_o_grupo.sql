-- =====================================================================
-- 0118 — Dividir o grupo: jogadores em cenas diferentes
--
-- Até aqui "onde o jogador está" tinha uma resposta só:
-- `vtt_campaign_stage.presented_scene_id`. Esta migration acrescenta a
-- exceção — uma atribuição individual que vence o palco — e é a
-- primeira desde a 0112 a mexer nos predicados de autorização por cena.
--
-- ── Uma pergunta, uma função ─────────────────────────────────────────
--
-- A tentação era escrever `coalesce(atribuição, palco)` dentro de
-- `vtt_pode_ver_cena` e de novo dentro de `vtt_pode_interagir_cena`.
-- Duas cópias da mesma regra é como as regras divergem: a próxima
-- pessoa conserta uma e não sabe da outra. `vtt_cena_do_jogador` é a
-- pergunta "onde esta pessoa está", num lugar só, e os dois predicados
-- passam a consultá-la.
--
-- O mesmo vale para o cliente: ele NÃO recalcula palco + atribuição. Ele
-- pergunta `vtt_minha_cena` e obedece. Recalcular no navegador criaria
-- uma segunda implementação da regra, divergindo no primeiro caso
-- difícil — que aqui seria "fui atribuído e o palco mudou no mesmo
-- segundo".
--
-- ── A atribuição é do NARRADOR, sempre ───────────────────────────────
--
-- Ninguém se atribui a lugar nenhum: `move_players_to_scene` exige
-- `is_campaign_owner`. Sem isso, "dividir o grupo" viraria "cada um vai
-- para onde quiser", que é o oposto do gesto.
--
-- ── Arquivar e excluir precisam limpar ───────────────────────────────
--
-- Uma atribuição apontando para cena arquivada deixaria o jogador numa
-- cena congelada — vendo tudo, escrevendo nada, sem nada explicando.
-- Excluir já sairia por cascata; arquivar não sai, então
-- `archive_vtt_scene` passa a apagar as atribuições daquela cena. Quem
-- estava lá volta a seguir o palco, que é o padrão.
-- =====================================================================

begin;

create table if not exists vtt_player_scene_assignments (
  campaign_id uuid not null references campaigns(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  scene_id    uuid not null,
  updated_by  uuid references auth.users(id) on delete set null,
  updated_at  timestamptz not null default now(),
  primary key (campaign_id, user_id),
  -- A cena tem que ser DESTA campanha, estruturalmente — mesmo recurso
  -- que o palco usa desde a 0111. `on delete cascade`: apagar a cena
  -- devolve quem estava nela ao palco, em vez de deixar uma atribuição
  -- apontando para o vazio.
  constraint vtt_player_scene_assignments_cena_da_campanha
    foreign key (scene_id, campaign_id)
    references vtt_scenes (id, campaign_id) on delete cascade
);

comment on table vtt_player_scene_assignments is
  'Jogador que NÃO está onde a mesa está. Ausência de linha é o caso normal: sem atribuição, segue `vtt_campaign_stage`.';

create index if not exists vtt_player_scene_assignments_cena_idx
  on vtt_player_scene_assignments (scene_id);

alter table vtt_player_scene_assignments enable row level security;
revoke all on vtt_player_scene_assignments from anon, authenticated;
grant select on vtt_player_scene_assignments to authenticated;

drop policy if exists vtt_player_scene_assignments_select on vtt_player_scene_assignments;
-- O narrador lê todas (precisa, para os indicadores). O jogador lê só a
-- PRÓPRIA — é o que o Realtime exige para entregar a ele o evento da
-- sua própria mudança, e é também tudo que ele tem o que saber: onde os
-- outros estão é informação de quem conduz.
create policy vtt_player_scene_assignments_select on vtt_player_scene_assignments
  for select to authenticated
  using (
    is_campaign_owner(campaign_id)
    or user_id = (select auth.uid())
  );

-- `replica identity full` pelo mesmo motivo da 0111: sem ela o payload
-- de UPDATE/DELETE não traz `campaign_id` nem `user_id` para filtrar.
alter table vtt_player_scene_assignments replica identity full;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public'
      and tablename = 'vtt_player_scene_assignments'
  ) then
    alter publication supabase_realtime add table public.vtt_player_scene_assignments;
  end if;
end
$$;

commit;

begin;

-- ---------------------------------------------------------------------
-- A pergunta, num lugar só
-- ---------------------------------------------------------------------
create or replace function public.vtt_cena_do_jogador(
  p_campaign_id uuid,
  p_user_id     uuid default auth.uid()
) returns uuid
language sql stable security definer set search_path = public, pg_temp
as $$
  select coalesce(
    (select a.scene_id from public.vtt_player_scene_assignments a
      where a.campaign_id = p_campaign_id and a.user_id = p_user_id),
    (select st.presented_scene_id from public.vtt_campaign_stage st
      where st.campaign_id = p_campaign_id)
  );
$$;

comment on function public.vtt_cena_do_jogador(uuid, uuid) is
  'Onde esta pessoa está: a atribuição individual, se houver; senão, o palco. Única fonte da resposta — os dois predicados de cena e o cliente consultam daqui.';

/** A própria cena, para o cliente. Wrapper de uma linha, de propósito:
 *  o cliente não deve conhecer a regra, só obedecê-la. */
create or replace function public.vtt_minha_cena(p_campaign_id uuid)
returns uuid
language sql stable security definer set search_path = public, pg_temp
as $$
  select case
    when public.is_campaign_member(p_campaign_id, auth.uid())
      then public.vtt_cena_do_jogador(p_campaign_id, auth.uid())
    else null
  end;
$$;

-- ---------------------------------------------------------------------
-- Os predicados, agora com a exceção
--
-- Regenerados a partir da 0111 trocando `st.presented_scene_id = s.id`
-- por `vtt_cena_do_jogador(...) = s.id`. O resto é idêntico: o narrador
-- continua vendo tudo, e arquivada continua sendo só leitura.
-- ---------------------------------------------------------------------
create or replace function public.vtt_pode_ver_cena(
  p_scene_id uuid,
  check_user_id uuid default auth.uid()
) returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select exists (
    select 1
      from public.vtt_scenes s
     where s.id = p_scene_id
       and (
         public.is_campaign_owner(s.campaign_id, check_user_id)
         or (
           public.is_campaign_member(s.campaign_id, check_user_id)
           and public.vtt_cena_do_jogador(s.campaign_id, check_user_id) = s.id
         )
       )
  );
$$;

comment on function public.vtt_pode_ver_cena(uuid, uuid) is
  'Quem pode LER esta cena: o narrador, sempre; qualquer outro membro, só a cena em que ELE está (atribuição individual ou, na falta, o palco).';

create or replace function public.vtt_pode_interagir_cena(
  p_scene_id uuid,
  check_user_id uuid default auth.uid()
) returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select exists (
    select 1
      from public.vtt_scenes s
     where s.id = p_scene_id
       and s.archived_at is null
       and (
         public.is_campaign_owner(s.campaign_id, check_user_id)
         or (
           public.is_campaign_member(s.campaign_id, check_user_id)
           and public.vtt_cena_do_jogador(s.campaign_id, check_user_id) = s.id
         )
       )
  );
$$;

comment on function public.vtt_pode_interagir_cena(uuid, uuid) is
  'Quem pode ESCREVER nesta cena: narrador em qualquer cena não arquivada; demais membros só na cena em que estão. Arquivada é só leitura, para todo mundo.';

revoke all on function public.vtt_cena_do_jogador(uuid, uuid) from public, anon;
revoke all on function public.vtt_minha_cena(uuid) from public, anon;
grant execute on function public.vtt_cena_do_jogador(uuid, uuid) to authenticated;
grant execute on function public.vtt_minha_cena(uuid) to authenticated;

commit;

begin;

-- ---------------------------------------------------------------------
-- Mover e reagrupar
-- ---------------------------------------------------------------------
create or replace function public.move_players_to_scene(
  p_campaign_id uuid,
  p_user_ids    uuid[],
  p_scene_id    uuid
) returns integer
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_uid    uuid := auth.uid();
  v_scene  vtt_scenes;
  v_palco  uuid;
  v_fora   integer;
  v_total  integer;
begin
  if not public.is_campaign_owner(p_campaign_id, v_uid) then
    raise exception 'Só o narrador move jogadores entre cenas.' using errcode = '42501';
  end if;
  if p_user_ids is null or array_length(p_user_ids, 1) is null then
    raise exception 'Nenhum jogador informado.' using errcode = 'invalid_parameter_value';
  end if;

  select * into v_scene from vtt_scenes
   where id = p_scene_id and campaign_id = p_campaign_id;
  if v_scene.id is null then
    raise exception 'Cena não encontrada nesta campanha.' using errcode = 'no_data_found';
  end if;
  if v_scene.archived_at is not null then
    raise exception 'Não dá para mandar jogadores para uma cena arquivada.'
      using errcode = 'invalid_parameter_value';
  end if;

  -- Um id que não é membro ATIVO desta campanha não é "ignorável": é
  -- sinal de que quem chamou está trabalhando com uma lista que não é
  -- desta mesa. Mesmo princípio de `reorder_vtt_scenes`.
  select count(*) into v_fora
    from unnest(p_user_ids) as x(id)
    left join campaign_members m
      on m.user_id = x.id and m.campaign_id = p_campaign_id and m.status = 'active'
   where m.user_id is null;
  if v_fora > 0 then
    raise exception 'A lista traz gente que não participa desta campanha.'
      using errcode = 'invalid_parameter_value';
  end if;

  select presented_scene_id into v_palco
    from vtt_campaign_stage where campaign_id = p_campaign_id;

  -- Mandar alguém para a cena do PALCO é reagrupá-lo: a linha some em
  -- vez de virar uma atribuição que repete o padrão. Sem isto, um
  -- jogador "atribuído ao palco" deixaria de acompanhar a próxima
  -- apresentação — ficaria preso numa cena que a mesa abandonou.
  if v_palco = p_scene_id then
    delete from vtt_player_scene_assignments
     where campaign_id = p_campaign_id and user_id = any(p_user_ids);
    get diagnostics v_total = row_count;
    return v_total;
  end if;

  insert into vtt_player_scene_assignments (campaign_id, user_id, scene_id, updated_by)
  select p_campaign_id, x.id, p_scene_id, v_uid
    from unnest(p_user_ids) as x(id)
  on conflict (campaign_id, user_id) do update
    set scene_id = excluded.scene_id, updated_by = excluded.updated_by, updated_at = now();
  get diagnostics v_total = row_count;
  return v_total;
end;
$$;

comment on function public.move_players_to_scene(uuid, uuid[], uuid) is
  'Manda jogadores para uma cena específica. Mandar para a cena do palco REMOVE a atribuição — senão o jogador ficaria preso onde a mesa não está mais. Narrador-only.';

create or replace function public.regroup_vtt_players(
  p_campaign_id uuid
) returns integer
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_uid   uuid := auth.uid();
  v_total integer;
begin
  if not public.is_campaign_owner(p_campaign_id, v_uid) then
    raise exception 'Só o narrador reagrupa a mesa.' using errcode = '42501';
  end if;
  delete from vtt_player_scene_assignments where campaign_id = p_campaign_id;
  get diagnostics v_total = row_count;
  return v_total;
end;
$$;

comment on function public.regroup_vtt_players(uuid) is
  'Apaga todas as atribuições: todo mundo volta a seguir o palco. É o botão de "juntar a mesa".';

/**
 * Quem está onde — para os indicadores do catálogo.
 *
 * Narrador-only. O nome sai de `get_campaign_participant_info` (0060),
 * que já é a leitura restrita e com fallback humano; refazer o join com
 * `auth.users` aqui seria um segundo caminho para o mesmo dado.
 */
create or replace function public.list_vtt_player_placements(
  p_campaign_id uuid
) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp
as $$
begin
  if not public.is_campaign_owner(p_campaign_id, auth.uid()) then
    return '[]'::jsonb;
  end if;

  return coalesce((
    select jsonb_agg(
             jsonb_build_object(
               'user_id', m.user_id,
               'nome', coalesce(i.display_name, 'Jogador'),
               'scene_id', public.vtt_cena_do_jogador(p_campaign_id, m.user_id),
               -- Distinguir "foi mandado para cá" de "está aqui porque
               -- a mesa está": o primeiro é uma decisão que alguém tomou
               -- e pode desfazer, o segundo é o padrão.
               'atribuido', exists (
                 select 1 from vtt_player_scene_assignments a
                  where a.campaign_id = p_campaign_id and a.user_id = m.user_id
               )
             )
             order by coalesce(i.display_name, 'Jogador')
           )
      from campaign_members m
      left join get_campaign_participant_info(p_campaign_id) i on i.user_id = m.user_id
     where m.campaign_id = p_campaign_id
       and m.status = 'active'
       and m.role = 'player'
  ), '[]'::jsonb);
end;
$$;

comment on function public.list_vtt_player_placements(uuid) is
  'Cada jogador e a cena em que ele está, com a marca de quem foi mandado para lá. Narrador-only; qualquer outro recebe lista vazia.';

revoke all on function public.move_players_to_scene(uuid, uuid[], uuid) from public, anon;
revoke all on function public.regroup_vtt_players(uuid) from public, anon;
revoke all on function public.list_vtt_player_placements(uuid) from public, anon;
grant execute on function public.move_players_to_scene(uuid, uuid[], uuid) to authenticated;
grant execute on function public.regroup_vtt_players(uuid) to authenticated;
grant execute on function public.list_vtt_player_placements(uuid) to authenticated;

commit;

begin;

-- ---------------------------------------------------------------------
-- Arquivar passa a devolver quem estava na cena
--
-- Regenerada da 0116 com um `delete` a mais. Sem ele, arquivar uma cena
-- com gente dentro deixaria essas pessoas numa cena congelada: veriam
-- tudo (`vtt_pode_ver_cena` não olha arquivo) e não poderiam escrever
-- nada (`vtt_pode_interagir_cena` olha), sem nada na tela dizendo por
-- quê.
-- ---------------------------------------------------------------------
create or replace function public.archive_vtt_scene(
  p_scene_id uuid
) returns vtt_scenes
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_uid   uuid := auth.uid();
  v_scene vtt_scenes;
  v_palco uuid;
begin
  select * into v_scene from vtt_scenes where id = p_scene_id;
  if v_scene.id is null then
    raise exception 'Cena não encontrada.' using errcode = 'no_data_found';
  end if;
  if not public.is_campaign_owner(v_scene.campaign_id, v_uid) then
    raise exception 'Só o narrador arquiva cenas.' using errcode = '42501';
  end if;

  select presented_scene_id into v_palco
    from vtt_campaign_stage where campaign_id = v_scene.campaign_id;
  if v_palco = p_scene_id then
    raise exception 'Esta cena está apresentada aos jogadores — leve a mesa para outra antes de arquivar.'
      using errcode = 'invalid_parameter_value';
  end if;

  if v_scene.archived_at is not null then
    return v_scene;
  end if;

  -- Quem estava aqui volta a seguir o palco.
  delete from vtt_player_scene_assignments where scene_id = p_scene_id;

  update vtt_scenes
     set archived_at = now(), updated_by = v_uid, updated_at = now()
   where id = p_scene_id
  returning * into v_scene;
  return v_scene;
end;
$$;

commit;
