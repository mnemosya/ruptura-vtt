-- Dependências de plataforma necessárias para reproduzir as migrations do
-- projeto num container que executa apenas a imagem supabase/postgres.
--
-- Este arquivo NÃO é uma migration do produto. O schema realtime pertence ao
-- Supabase e, no stack completo, é criado pelo serviço Realtime antes das
-- migrations da aplicação. O replay isolado precisa apenas do contrato SQL
-- que as migrations do RUPTURA referenciam.

create schema if not exists realtime;

create table if not exists realtime.messages (
  topic text not null,
  extension text not null,
  payload jsonb,
  event text,
  private boolean default false,
  updated_at timestamp without time zone not null default now(),
  inserted_at timestamp without time zone not null default now(),
  id uuid primary key default gen_random_uuid(),
  binary_payload bytea,
  skip_broadcast boolean not null default false
);

alter table realtime.messages enable row level security;

create or replace function realtime.topic()
returns text
language sql
stable
as $$
  select nullif(current_setting('realtime.topic', true), '')::text;
$$;

create or replace function realtime.send(
  payload jsonb,
  event text,
  topic text,
  private boolean default true
)
returns void
language plpgsql
as $$
declare
  generated_id uuid;
  final_payload jsonb;
begin
  begin
    generated_id := gen_random_uuid();
    if payload ? 'id' then
      final_payload := payload;
    else
      final_payload := jsonb_set(payload, '{id}', to_jsonb(generated_id));
    end if;

    execute format('set local realtime.topic to %L', topic);
    insert into realtime.messages (id, payload, event, topic, private, extension)
    values (generated_id, final_payload, event, topic, private, 'broadcast');
  exception
    when others then
      raise warning 'WarnSendingBroadcastMessage: %', sqlerrm;
  end;
end;
$$;

-- A imagem atual mantém o schema de plataforma sob supabase_admin e não
-- concede membership ao role postgres. No replay isolado, as migrations do
-- app criam policies nesse objeto; transferimos somente os stubs locais para
-- o mesmo role que executa a cadeia. O catálogo de comparação ignora schemas
-- de plataforma e esta mudança nunca roda fora de localhost.
alter schema realtime owner to postgres;
alter table realtime.messages owner to postgres;
alter function realtime.topic() owner to postgres;
alter function realtime.send(jsonb, text, text, boolean) owner to postgres;

-- O serviço Storage também aplica migrations próprias fora da cadeia do app.
-- RUPTURA só precisa registrar a configuração do bucket privado; nenhum dado
-- de objeto é criado durante o replay.
create schema if not exists storage;

create table if not exists storage.buckets (
  id text primary key,
  name text not null,
  public boolean default false,
  file_size_limit bigint,
  allowed_mime_types text[]
);

alter schema storage owner to postgres;
alter table storage.buckets owner to postgres;
