-- =====================================================================
-- 0155 — Nenhuma função de negócio sinaliza conflito com SQLSTATE 40001
--
-- A 0067 já tinha achado isto em `move_vtt_token`, mas o padrão voltou
-- em 11 funções (cenas, áreas, HUD, publicação de conteúdo). O PostgREST
-- REPETE sozinho, sem limite, a transação que falha com
-- `serialization_failure`: um conflito de revisão que nunca se resolve
-- vira um laço infinito dentro do servidor. Em 2026-09-30 uma única
-- chamada de `set_vtt_scene_config` com revisão velha gerou ~100 erros
-- por segundo por mais de uma hora (o cliente já tinha desistido por
-- timeout; o laço continuava).
--
-- Troca por `check_violation` (23514), como na 0067. Mesma mensagem —
-- o front lê a mensagem, não o código. Reescreve a definição VIVA de
-- cada função, então não depende de qual migration a definiu por último.
--
-- Regra daqui pra frente: conflito de revisão = `check_violation`.
-- =====================================================================

do $$
declare
  f record;
  v_def text;
begin
  for f in
    select p.oid
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.prosrc ilike '%serialization_failure%'
  loop
    v_def := replace(pg_get_functiondef(f.oid),
                     'serialization_failure', 'check_violation');
    execute v_def;
  end loop;
end;
$$;
