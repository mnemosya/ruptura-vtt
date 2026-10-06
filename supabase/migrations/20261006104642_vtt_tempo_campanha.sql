-- TIME-01/02: Calendário Imperial (12 meses de 30 dias) e clima da campanha.
-- Data/hora só mudam por edição manual; o sorteio é prévia no cliente.
begin;

create table public.vtt_campaign_time (
  campaign_id uuid primary key references public.campaigns(id) on delete cascade,
  game_year integer check (game_year between 0 and 9999),
  game_month integer check (game_month between 1 and 12),
  game_day integer check (game_day between 1 and 30),
  game_time time without time zone,
  region text not null default 'Vastra' check (region in ('Vastra', 'Beldran', 'Talesh', 'Kravus', 'Torvash')),
  condition text not null default 'ceu_limpo' check (condition in (
    'ceu_limpo', 'parcialmente_nublado', 'nublado', 'neblina', 'chuva_leve', 'chuva',
    'chuva_forte', 'tempestade', 'neve_leve', 'neve', 'nevasca', 'chuva_iridescente',
    'nevoeiro_cristalino', 'tempestade_arcana')),
  temperature_c numeric(5,2) check (temperature_c between -100 and 100),
  target_temperature_c numeric(5,2) check (target_temperature_c between -100 and 100),
  weather_since_minute bigint check (weather_since_minute between 0 and 5183999999),
  weather_until_minute bigint check (weather_until_minute between 0 and 5183999999),
  weather_seed bigint not null default 1 check (weather_seed between 0 and 4294967295),
  wind text not null default 'calmo' check (wind in ('calmo', 'fraco', 'moderado', 'forte', 'violento')),
  aurora boolean not null default false,
  description text not null default '' check (char_length(description) <= 300),
  revision integer not null default 1,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  constraint vtt_campaign_time_complete_date check (
    (game_year is null and game_month is null and game_day is null and game_time is null)
    or (game_year is not null and game_month is not null and game_day is not null and game_time is not null)
  ),
  constraint vtt_campaign_time_hour check (game_time is null or game_time < time '24:00'),
  constraint vtt_campaign_time_weather_window check (weather_since_minute is null or weather_until_minute is null or weather_until_minute > weather_since_minute)
);

create function public.vtt_stamp_campaign_time() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if tg_op = 'UPDATE' then
    new.revision := old.revision + 1;
  end if;
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;
create trigger vtt_stamp_campaign_time before insert or update on public.vtt_campaign_time
  for each row execute function public.vtt_stamp_campaign_time();

alter table public.vtt_campaign_time enable row level security;
revoke all on public.vtt_campaign_time from anon, authenticated;
grant select on public.vtt_campaign_time to authenticated;
grant insert (campaign_id, game_year, game_month, game_day, game_time, region, condition, temperature_c, target_temperature_c, weather_since_minute, weather_until_minute, weather_seed, wind, aurora, description) on public.vtt_campaign_time to authenticated;
grant update (game_year, game_month, game_day, game_time, region, condition, temperature_c, target_temperature_c, weather_since_minute, weather_until_minute, weather_seed, wind, aurora, description)
  on public.vtt_campaign_time to authenticated;
create policy vtt_campaign_time_read on public.vtt_campaign_time for select to authenticated
  using (public.is_campaign_member(campaign_id));
create policy vtt_campaign_time_insert on public.vtt_campaign_time for insert to authenticated
  with check (public.is_campaign_owner(campaign_id));
create policy vtt_campaign_time_update on public.vtt_campaign_time for update to authenticated
  using (public.is_campaign_owner(campaign_id))
  with check (public.is_campaign_owner(campaign_id));

do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'vtt_campaign_time') then
    alter publication supabase_realtime add table public.vtt_campaign_time;
  end if;
end $$;

commit;
