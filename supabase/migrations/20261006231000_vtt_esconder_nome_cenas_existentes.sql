-- ═══════════════════════════════════════════════════════════════════
-- As cenas que já existiam também passam a esconder o nome.
--
-- A 20261006220000 nasceu com `mostrar_nome = true` para não mudar nada;
-- a 20261006230000 virou o padrão para false. Esta alinha o legado ao
-- padrão novo: o narrador revela, cena a cena, quando quiser.
-- (Em 06/10/2026 o projeto só tinha a autora e agentes de teste.)
-- ═══════════════════════════════════════════════════════════════════

update public.vtt_scenes set mostrar_nome = false where mostrar_nome;
