-- =====================================================================
-- 0079 — `vtt_alocar_nome_automatico` (migration 0078) é um HELPER
-- interno: existe só para `create_vtt_token`/`edit_vtt_token`
-- chamarem durante sua própria transação (já sob a trava
-- `pg_advisory_xact_lock` do scene_id), nunca para ser invocado
-- diretamente por um cliente autenticado. `security definer` sozinho
-- não restringe QUEM pode chamar — só troca o papel de execução; sem
-- revogar o `grant` de 0078, qualquer jogador podia chamar o RPC
-- diretamente (fora de qualquer criação/edição real de token) e:
--   - "queimar" números da sequência sem criar token nenhum (a trava é
--     transacional e a transação da CHAMADA DIRETA sempre commita,
--     mesmo sem inserir nada — não há mais nenhuma outra escrita pra
--     reverter);
--   - sondar quantos tokens "#N" já existem numa cena que não é dele.
--
-- Revoga de `public`/`anon`/`authenticated` — nenhum papel de cliente
-- mantém EXECUTE. `create_vtt_token`/`edit_vtt_token` continuam
-- chamando o helper normalmente: os dois são `security definer`
-- também, então a chamada interna roda como o DONO da função (quem
-- aplicou a migration), que sempre tem EXECUTE implícito nas próprias
-- funções — revogar de papéis de CLIENTE nunca afeta chamada
-- função-a-função dentro de um `security definer` do mesmo dono.
-- =====================================================================

begin;

revoke execute on function vtt_alocar_nome_automatico(uuid, uuid) from public;
revoke execute on function vtt_alocar_nome_automatico(uuid, uuid) from anon;
revoke execute on function vtt_alocar_nome_automatico(uuid, uuid) from authenticated;

commit;
