-- =====================================================================
-- ANDAIME DE PLATAFORMA — não é uma migration deste projeto
--
-- Este arquivo NÃO mora em `supabase/migrations/` de propósito: nada
-- aqui é nosso. São objetos que a plataforma Supabase cria sozinha, e
-- que as nossas migrations pressupõem existir.
--
-- Por que ele existe: o replay em banco limpo precisa de um banco que
-- se pareça com um Supabase de verdade. A maior parte disso vem de
-- graça — a imagem `supabase/postgres` já traz `auth`, `extensions`,
-- `vault`, a publicação `supabase_realtime` — e `realtime.messages` sai
-- de rodar o serviço de realtime uma vez contra o banco.
--
-- O que NÃO sai é o schema de storage: quem cria as tabelas de
-- `storage` é o serviço `storage-api`, e a imagem dele não executa
-- nesta máquina (o Node dela dá SIGSEGV sob o Docker Desktop 29.7.2 em
-- arm64 — `docker run … node -e 'console.log(1)'` já basta para
-- reproduzir). Sem poder rodar o serviço, a alternativa honesta é
-- declarar o que ele criaria.
--
-- ESCOPO EXATO: de todas as migrations, UMA linha executável toca
-- storage — o `insert into storage.buckets` da 0099. Todo o resto das
-- menções a "storage" nas migrations é prosa em comentário. Então é
-- só esta tabela que o andaime precisa fornecer.
--
-- A definição abaixo segue a de `storage.buckets` do Supabase. Se ela
-- divergir da real, o replay passa a testar uma ficção — por isso a
-- comparação de catálogo (`db:verificar-replay`) IGNORA o schema
-- `storage`: ele não é nosso e não é o que está sob verificação.
-- =====================================================================

create schema if not exists storage;

create table if not exists storage.buckets (
  id                 text primary key,
  name               text not null,
  owner              uuid,
  created_at         timestamptz default now(),
  updated_at         timestamptz default now(),
  public             boolean default false,
  avif_autodetection boolean default false,
  file_size_limit    bigint,
  allowed_mime_types text[],
  owner_id           text
);

create unique index if not exists bname on storage.buckets (name);

-- No Supabase real, `storage.buckets` pertence a `supabase_storage_admin`
-- e o `postgres` enxerga e escreve nela. Como o replay conecta como
-- `postgres`, o andaime precisa conceder o mesmo — senão a 0099 falha
-- por permissão, que seria um erro do andaime disfarçado de achado.
grant usage on schema storage to postgres, anon, authenticated, service_role;
grant all on storage.buckets to postgres, service_role;
grant select on storage.buckets to anon, authenticated;
