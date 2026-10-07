-- ═══════════════════════════════════════════════════════════════════
-- Cena NOVA nasce com o nome escondido dos jogadores.
--
-- A 20261006220000 criou `mostrar_nome` com padrão true para não mudar
-- nada nas cenas existentes. O narrador prefere revelar o nome quando
-- quiser, não esconder depois: o padrão vira false. Só afeta cenas
-- criadas daqui em diante — as que já existem continuam como estão.
-- ═══════════════════════════════════════════════════════════════════

alter table public.vtt_scenes alter column mostrar_nome set default false;
