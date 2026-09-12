-- =====================================================================
-- 0107 — Trocar o avatar avisa a mesa
--
-- Correção de uma afirmação errada da 0104. Lá eu escrevi, em
-- `set_character_avatar_image`:
--
--     "Não há broadcast explícito aqui de propósito:
--      `vtt_hud_broadcast_character_changed` é função de TRIGGER, e o
--      `update characters` acima já a dispara."
--
-- A primeira metade é verdade; a segunda não. O trigger é
--
--     AFTER UPDATE OF payload ... WHEN (old.payload IS DISTINCT FROM
--     new.payload)
--
-- e `set_character_avatar_image` atualiza `avatar_image_id`, não
-- `payload`. A cláusula `OF payload` faz o trigger nem ser considerado.
-- Resultado relatado da mesa: o avatar só aparecia depois de recarregar
-- a página à mão.
--
-- ── POR QUE ESTENDER O TRIGGER, E NÃO CHAMAR À MÃO ──────────────────
-- Chamar o broadcast dentro da RPC daria DOIS caminhos para o mesmo
-- aviso — o trigger para `payload`, a chamada para o avatar — e o dia
-- em que o formato do evento mudasse, só um dos dois acompanharia.
-- Estender a condição mantém um caminho só, que é o argumento que a
-- 0104 usou corretamente e aplicou ao gatilho errado.
--
-- `avatar_image_id` entra tanto na lista de colunas quanto no `when`:
-- a lista decide se o trigger é AVALIADO, o `when` decide se ele
-- DISPARA. Sem a primeira, a segunda nunca é lida.
-- =====================================================================

begin;

drop trigger if exists characters_vtt_hud_invalidation on characters;

create trigger characters_vtt_hud_invalidation
after update of payload, avatar_image_id on characters
for each row
when (
  old.payload is distinct from new.payload
  or old.avatar_image_id is distinct from new.avatar_image_id
)
execute function vtt_hud_broadcast_character_changed();

commit;
