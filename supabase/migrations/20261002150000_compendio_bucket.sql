-- Bucket das imagens do Compêndio (PLANO_COMPENDIO_NOTION, Fase 1).
--
-- As imagens do livro no Notion vêm com link assinado que expira em
-- minutos; o sincronizador copia cada uma para cá e o Compêndio usa o
-- link público. Leitura pública (o livro é visível para todos); escrita
-- só pelo sincronizador, com a chave de serviço (que ignora RLS).
-- Idempotente.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('compendio', 'compendio', true, 52428800,
        array['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml', 'image/avif'])
on conflict (id) do update
   set public = excluded.public,
       file_size_limit = excluded.file_size_limit,
       allowed_mime_types = excluded.allowed_mime_types;
