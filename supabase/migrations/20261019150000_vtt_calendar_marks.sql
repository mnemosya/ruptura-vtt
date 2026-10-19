-- TIME-03: marcações no Calendário Imperial, feitas por jogadores e narrador.
-- Visibilidade: 'mesa' (todos), 'privada' (só o autor, nem o narrador vê),
-- 'narrador' (autor + dono da campanha). Marcação oficial só o narrador cria.
begin;

create table public.vtt_calendar_marks (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  author_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  game_year integer not null check (game_year between 0 and 9999),
  game_month integer not null check (game_month between 1 and 12),
  game_day integer not null check (game_day between 1 and 30),
  kind text not null check (kind in ('lembrete', 'prazo', 'evento', 'memoria')),
  title text not null check (char_length(btrim(title)) between 1 and 120),
  visibility text not null default 'mesa' check (visibility in ('mesa', 'privada', 'narrador')),
  official boolean not null default false,
  created_at timestamptz not null default now()
);
create index vtt_calendar_marks_mes on public.vtt_calendar_marks (campaign_id, game_year, game_month);

alter table public.vtt_calendar_marks enable row level security;
revoke all on public.vtt_calendar_marks from anon, authenticated;
grant select, delete on public.vtt_calendar_marks to authenticated;
grant insert (campaign_id, game_year, game_month, game_day, kind, title, visibility, official)
  on public.vtt_calendar_marks to authenticated;

create policy vtt_calendar_marks_read on public.vtt_calendar_marks for select to authenticated
  using (public.is_campaign_member(campaign_id) and (
    visibility = 'mesa'
    or author_id = auth.uid()
    or (visibility = 'narrador' and public.is_campaign_owner(campaign_id))
  ));
create policy vtt_calendar_marks_insert on public.vtt_calendar_marks for insert to authenticated
  with check (
    public.is_campaign_member(campaign_id)
    and author_id = auth.uid()
    and (not official or public.is_campaign_owner(campaign_id))
  );
create policy vtt_calendar_marks_delete on public.vtt_calendar_marks for delete to authenticated
  using (author_id = auth.uid() or (visibility <> 'privada' and public.is_campaign_owner(campaign_id)));

do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'vtt_calendar_marks') then
    alter publication supabase_realtime add table public.vtt_calendar_marks;
  end if;
end $$;

commit;
