-- Avatar da conta: bucket privado próprio. O caminho fica em
-- auth.users.user_metadata.avatar_path (como display_name), sem tabela.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('account-avatars', 'account-avatars', false, 2097152, array['image/webp'])
on conflict (id) do nothing;

-- Sem policies em storage.objects: leitura e escrita passam pelo servidor
-- (service role), que só aceita caminhos dentro da pasta `<user_id>/`.
-- Reversão: limpar avatar_path dos usuários, esvaziar e excluir o bucket.
