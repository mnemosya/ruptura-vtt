-- =====================================================================
-- 0121 — Cai a sobrecarga obsoleta de `atualizar_vtt_scene_image`
--
-- A 0100 criou a função com 11 parâmetros. A 0110 criou uma com 13,
-- acrescentando `p_centro_q`/`p_centro_r` para mover a imagem junto com
-- o redimensionamento pelo canto — e não removeu a primeira. As duas
-- ficaram vivas lado a lado.
--
-- O efeito não é cosmético. O PostgREST resolve a chamada pelos NOMES
-- dos argumentos; recebendo só os 11 comuns, as duas candidatas casam e
-- ele recusa:
--
--     Could not choose the best candidate function between:
--       atualizar_vtt_scene_image(… 11 parâmetros)
--       atualizar_vtt_scene_image(… 13 parâmetros)
--
-- O app nunca esbarrou nisso porque `imageActions.ts` sempre manda os
-- 13. Quem esbarrou foi `check-vtt-imagens-servidor.ts`, que chamava
-- com 11 e não conferia o erro: a colocação seguia visível e o critério
-- 26 media o estado anterior, passando por dois meses como se
-- estivesse testando a guarda de assinatura. A recusa era o defeito; o
-- critério cego foi o que a manteve invisível.
--
-- ── Por que a assinatura completa ────────────────────────────────────
--
-- `drop function atualizar_vtt_scene_image` sem argumentos derrubaria
-- AS DUAS quando há sobrecarga — ou falharia por ambiguidade, conforme
-- a versão. A assinatura inteira é o que torna esta migration uma
-- afirmação sobre UMA função, e não uma aposta.
--
-- ── O que foi conferido antes ────────────────────────────────────────
--
--   • os três chamadores do repositório (`imageActions.ts` e dois casos
--     do check) passam os 13 parâmetros — nenhum usa esta assinatura;
--   • nenhuma outra função do banco cita o nome no corpo;
--   • `pg_depend` não registra nenhum objeto dependente dela.
--
-- `if exists` porque aplicar duas vezes não deve falhar; `restrict` (o
-- padrão) porque se alguma dependência aparecer entre a conferência e a
-- aplicação, é melhor esta migration falhar do que derrubar junto o que
-- dependia.
-- =====================================================================

begin;

drop function if exists public.atualizar_vtt_scene_image(
  uuid,      -- p_id
  integer,   -- p_expected_revision
  numeric,   -- p_largura_m
  numeric,   -- p_altura_m
  numeric,   -- p_rotacao_graus
  numeric,   -- p_opacidade
  text,      -- p_camada
  integer,   -- p_z
  boolean,   -- p_visivel
  boolean,   -- p_travado
  boolean    -- p_limpar_altura
) restrict;

commit;
