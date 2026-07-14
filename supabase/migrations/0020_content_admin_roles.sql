-- =====================================================================
-- Ruptura VTT — Papel de administrador da Biblioteca (leitura administrativa)
-- Migration: 0020_content_admin_roles
--
-- Etapa 2 do aditivo do Editor Universal
-- (docs/PLANO_IMPLEMENTACAO_EDITOR_UNIVERSAL.md). A auditoria da Etapa 0
-- confirmou que não existe hoje NENHUM papel administrativo no projeto —
-- só Supabase Auth (identifica QUEM está logado), sem nenhum conceito de
-- O QUE essa pessoa pode fazer (docs/AUDITORIA_EDITOR_UNIVERSAL_CONTEUDO.md
-- §9). Esta migration cria a camada mínima necessária para a primeira
-- tela administrativa read-only (/admin/biblioteca): uma tabela de
-- administradores + uma função SECURITY DEFINER que checa associação
-- sem expor a tabela via RLS a ninguém além do dono do banco.
--
-- Esta migration NÃO altera content_documents/content_packs/
-- content_changelog nem suas policies existentes — a leitura
-- administrativa desta etapa usa o MESMO client anon-key/RLS já
-- existente (todo o conteúdo hoje é status='published', então a
-- visibilidade não muda). Só a AUTORIZAÇÃO de acesso à ROTA admin é nova;
-- nenhuma policy de escrita é criada para content_documents nesta etapa.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- admin_users
-- Uma linha por pessoa autorizada a acessar rotas administrativas da
-- Biblioteca. Nada de email/senha/segredo aqui — só o `user_id` do
-- Supabase Auth (auth.users), concedido via scripts/grant-content-admin.ts
-- (fora do repositório em texto, ver docs/CHECKPOINT_ETAPA2_ADMIN_BIBLIOTECA_READONLY.md).
-- ---------------------------------------------------------------------
create table if not exists admin_users (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  granted_at  timestamptz not null default now(),
  granted_by  text,
  note        text
);

alter table admin_users enable row level security;

-- Nenhuma policy de select/insert/update/delete para anon/authenticated:
-- com RLS habilitado e SEM NENHUMA policy correspondente, a tabela não é
-- legível nem gravável via PostgREST por ninguém além do service_role
-- (que ignora RLS) ou da função SECURITY DEFINER abaixo. Isso é
-- deliberado — "não abrir policies para anon" e "não liberar escrita
-- genérica" valem também para esta tabela nova.

-- ---------------------------------------------------------------------
-- is_content_admin(uid)
-- Função SECURITY DEFINER: roda com o privilégio de quem a criou (o
-- dono do banco), não com o privilégio de quem chama — por isso
-- consegue ler admin_users mesmo sem policy de select para
-- anon/authenticated. Só responde true/false; nunca vaza a lista de
-- administradores. `check_user_id` default `auth.uid()` para que o
-- client chame `.rpc("is_content_admin")` sem argumento, sempre
-- verificando a própria sessão.
-- ---------------------------------------------------------------------
create or replace function is_content_admin(check_user_id uuid default auth.uid())
returns boolean
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select exists (
    select 1 from admin_users where user_id = check_user_id
  );
$$;

-- Revoga a permissão default (PUBLIC inclui anon) e concede só a
-- authenticated — usuários anônimos não conseguem nem executar a função
-- de checagem (o pior caso para eles é "permission denied", nunca uma
-- resposta true/false).
revoke all on function is_content_admin(uuid) from public;
grant execute on function is_content_admin(uuid) to authenticated;

commit;
