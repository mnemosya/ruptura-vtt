-- =====================================================================
-- 0096 — Uma assinatura só para `move_vtt_token`
--
-- A 0094 acrescentou `p_offset_q`/`p_offset_r` COM DEFAULT achando que
-- substituiria a função. Não substitui: em Postgres, assinatura
-- diferente é FUNÇÃO diferente, então passaram a existir as duas —
-- a de 3 argumentos (antiga) e a de 5 (nova). Toda chamada com 3
-- argumentos virou ambígua e o Postgres recusou com
-- "could not choose the best candidate function", que é exatamente o
-- caminho que o produto usa pra mover token.
--
-- Aqui a antiga é removida. As chamadas de 3 argumentos passam a
-- resolver para a de 5 pelos defaults, sem nenhuma mudança de cliente.
-- =====================================================================

begin;

drop function if exists public.move_vtt_token(uuid, jsonb, integer);

commit;
