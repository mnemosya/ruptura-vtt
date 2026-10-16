-- =====================================================================
-- Marcadores (ferramenta "Marcadores" do VTT)
--
-- RUPTURA 1.2, cap. 27: um marcador torna visível o avanço de um
-- objetivo, ameaça ou prazo em segmentos (`2/6`). Tipos: progresso e
-- pressão.
--
-- POR CAMPANHA, não por cena: o capítulo diz que encerrar uma sessão
-- não reinicia uma investigação, um projeto ou uma ameaça em andamento,
-- então o marcador não pode morrer junto com a cena.
--
-- Autorização: todo participante LÊ; só o narrador cria, avança, recua
-- e remove. Toda coluna é do narrador, então policies de tabela bastam
-- (diferente da trilha de turnos, 0088, onde avanço é de todos).
--
-- Sincronização: mesmo desenho das anotações (20261006000000) — um
-- trigger avisa por broadcast num canal privado e o cliente relê. A
-- tabela não entra na publicação `supabase_realtime`.
-- =====================================================================

create table if not exists public.vtt_markers (
  id           uuid primary key default gen_random_uuid(),
  campaign_id  uuid not null references public.campaigns(id) on delete cascade,
  tipo         text not null,
  -- `null` = sem nome. Quem cria sem digitar nada fica sem nome.
  nome         text,
  total        integer not null,
  preenchidos  integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  created_by   uuid references auth.users(id) on delete set null,

  constraint vtt_markers_tipo check (tipo in ('progresso', 'pressao')),
  constraint vtt_markers_nome check (nome is null or char_length(nome) between 1 and 60),
  constraint vtt_markers_total check (total between 2 and 12),
  constraint vtt_markers_preenchidos check (preenchidos between 0 and total)
);

create index if not exists vtt_markers_campaign_idx on public.vtt_markers (campaign_id, created_at);

create or replace function public.vtt_markers_tocar_updated_at() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists vtt_markers_tocar_updated_at on public.vtt_markers;
create trigger vtt_markers_tocar_updated_at before update on public.vtt_markers
  for each row execute function public.vtt_markers_tocar_updated_at();

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
alter table public.vtt_markers enable row level security;

revoke all on public.vtt_markers from anon, authenticated;
grant select, insert, update, delete on public.vtt_markers to authenticated;

drop policy if exists vtt_markers_select on public.vtt_markers;
create policy vtt_markers_select on public.vtt_markers for select to authenticated
  using (public.is_campaign_member(campaign_id));

drop policy if exists vtt_markers_insert on public.vtt_markers;
create policy vtt_markers_insert on public.vtt_markers for insert to authenticated
  with check (public.is_campaign_owner(campaign_id) and created_by = (select auth.uid()));

drop policy if exists vtt_markers_update on public.vtt_markers;
create policy vtt_markers_update on public.vtt_markers for update to authenticated
  using (public.is_campaign_owner(campaign_id))
  with check (public.is_campaign_owner(campaign_id));

drop policy if exists vtt_markers_delete on public.vtt_markers;
create policy vtt_markers_delete on public.vtt_markers for delete to authenticated
  using (public.is_campaign_owner(campaign_id));

-- ---------------------------------------------------------------------
-- Aviso de mudança: broadcast privado por campanha
-- ---------------------------------------------------------------------
create or replace function public.vtt_marcadores_canal_autorizado(p_topic text) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(
    public.is_campaign_member(
      (regexp_match(p_topic, '^campaign:([0-9a-fA-F-]{36}):vtt:markers-changed$'))[1]::uuid
    ),
    false
  );
$$;
revoke all on function public.vtt_marcadores_canal_autorizado(text) from public;
grant execute on function public.vtt_marcadores_canal_autorizado(text) to authenticated;

drop policy if exists campaign_members_receive_markers_changed_channel on realtime.messages;
create policy campaign_members_receive_markers_changed_channel
on realtime.messages for select to authenticated
using (public.vtt_marcadores_canal_autorizado(realtime.topic()));

create or replace function public.vtt_avisar_marcadores_alterados() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_linha public.vtt_markers;
begin
  if tg_op = 'DELETE' then v_linha := old; else v_linha := new; end if;
  perform realtime.send(
    jsonb_build_object('v', 1, 'campaignId', v_linha.campaign_id::text),
    'markers_changed',
    'campaign:' || v_linha.campaign_id::text || ':vtt:markers-changed',
    true
  );
  return null;
end $$;

drop trigger if exists vtt_avisar_marcadores_alterados on public.vtt_markers;
create trigger vtt_avisar_marcadores_alterados after insert or update or delete on public.vtt_markers
  for each row execute function public.vtt_avisar_marcadores_alterados();
