-- Preserva as seis cores nomeadas e permite cor personalizada opaca em hexadecimal.
begin;

alter table public.vtt_scene_annotations
  drop constraint if exists vtt_scene_annotations_cor_check;
alter table public.vtt_scene_annotations
  add constraint vtt_scene_annotations_cor_check
  check (cor in ('ciano', 'ambar', 'verde', 'vermelho', 'roxo', 'branco')
    or cor ~ '^#[0-9a-fA-F]{6}$');

commit;
