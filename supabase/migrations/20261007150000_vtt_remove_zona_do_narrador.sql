-- =====================================================================
-- Desfaz 20261007130500 (zona do narrador em polígono).
--
-- TOK-03 era a camada do narrador no estilo da camada GM do Roll20 — um
-- modo do rail, não uma região do mapa. A camada não precisa de schema:
-- "estar na camada do narrador" é `vtt_tokens.visivel = false` (TOK-02),
-- já protegido por RLS e pelo `tokens_changed`.
-- =====================================================================

begin;

drop trigger if exists vtt_tokens_zona_narrador on public.vtt_tokens;
drop trigger if exists vtt_areas_zona_narrador on public.vtt_areas;
drop function if exists public.vtt_tokens_aplica_zona_narrador();
drop function if exists public.vtt_areas_aplica_zona_narrador();
drop function if exists public.set_vtt_area_zona_narrador(uuid, boolean, integer);
drop function if exists public.vtt_celula_em_zona_narrador(uuid, numeric, numeric);
drop function if exists public.vtt_poligono_contem(jsonb, numeric, numeric);
drop index if exists public.vtt_areas_zona_narrador_idx;
alter table public.vtt_areas drop constraint if exists vtt_areas_zona_narrador_forma;
alter table public.vtt_areas drop column if exists zona_narrador;

commit;
