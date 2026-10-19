-- Paleta das ferramentas da mesa = as 6 cores das vertentes + branco.
-- Os nomes antigos continuam (o hex é que mudou no cliente: vermelho =
-- Cinética, ambar = Material, verde = Biótica, ciano = Sináptica, roxo =
-- Cognitiva). Entra só `laranja`, a Energética.

alter table public.vtt_areas drop constraint vtt_areas_cor_check;
alter table public.vtt_areas add constraint vtt_areas_cor_check
  check (cor = any (array['ciano', 'ambar', 'verde', 'vermelho', 'roxo', 'branco', 'laranja']));

alter table public.vtt_measurements drop constraint vtt_measurements_cor_check;
alter table public.vtt_measurements add constraint vtt_measurements_cor_check
  check (cor = any (array['ciano', 'ambar', 'verde', 'vermelho', 'roxo', 'branco', 'laranja']));

alter table public.vtt_marks drop constraint vtt_marks_cor_check;
alter table public.vtt_marks add constraint vtt_marks_cor_check
  check (cor = any (array['ciano', 'ambar', 'verde', 'vermelho', 'roxo', 'branco', 'laranja']));

alter table public.vtt_scene_annotations drop constraint vtt_scene_annotations_cor_check;
alter table public.vtt_scene_annotations add constraint vtt_scene_annotations_cor_check
  check (cor = any (array['ciano', 'ambar', 'verde', 'vermelho', 'roxo', 'branco', 'laranja']) or cor ~ '^#[0-9a-fA-F]{6}$');
