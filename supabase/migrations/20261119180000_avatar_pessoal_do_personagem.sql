-- =====================================================================
-- Avatar do personagem SEM campanha
--
-- O avatar normal (`characters.avatar_image_id`, 0104) é uma imagem da
-- biblioteca da campanha (`vtt_image_assets.campaign_id not null`): um
-- personagem solto não tinha onde guardar a cara, e a Forja avisava
-- "o avatar é enviado depois que o personagem entrar numa campanha".
--
-- Agora o personagem solto guarda o avatar num bucket da CONTA do dono,
-- como o avatar da conta (`account-avatars`). Quando ele entra numa
-- campanha, o servidor copia a imagem para a biblioteca da campanha, liga
-- em `avatar_image_id` e limpa este caminho (`lib/character/avatarPessoal`).
--
-- Precedência na leitura: `avatar_image_id` (campanha) vence; o caminho
-- pessoal só aparece enquanto não houver o da campanha.
-- =====================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('character-avatars', 'character-avatars', false, 2097152, array['image/webp'])
on conflict (id) do nothing;

-- Sem policies em storage.objects: leitura e escrita passam pelo servidor
-- (service role), que só grava em `<owner_id>/<character_id>/...` depois
-- de conferir que o personagem é da pessoa e está sem campanha.

alter table characters
  add column if not exists avatar_path text;

comment on column characters.avatar_path is
  'Avatar do personagem sem campanha: caminho no bucket privado character-avatars (<owner_id>/<character_id>/<uuid>.webp). Promovido para avatar_image_id quando o personagem entra numa campanha.';

-- Reversão: copiar o que importar, esvaziar e excluir o bucket
-- `character-avatars` e `alter table characters drop column avatar_path`.
