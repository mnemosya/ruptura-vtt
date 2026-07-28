-- =====================================================================
-- Ruptura VTT — bloqueia insert/update diretos em character_creation_drafts
-- Migration: 0049_lockdown_character_creation_drafts_writes
--
-- CORREÇÃO: a migration 0047 concedeu `insert, update` na tabela para
-- `authenticated` "como defesa em profundidade" — mas isso contradiz o
-- desenho pretendido (documentado no mesmo arquivo): a gravação real
-- deveria passar SÓ pela RPC `save_character_creation_draft` (que
-- valida posse, ausência de personagem já criado, e faz
-- compare-and-swap por `revision`). Com `insert`/`update` liberados na
-- tabela, um usuário autenticado que satisfizesse a RLS (dono real do
-- perfil) podia gravar DIRETO na tabela, contornando TODAS as checagens
-- de negócio da RPC (ex.: sobrescrever `revision` livremente, ou salvar
-- um draft para um perfil que já tem personagem).
--
-- Achado durante a rodada de aceite em browser + testes concorrentes
-- (verificação exigida antes de declarar a fase concluída) — nenhuma
-- exploração externa, achado por releitura da própria migration antes
-- de rodar os testes hostis.
--
-- `select`/`delete` continuam concedidos (carregar draft, "Cancelar
-- criação") — só `insert`/`update` são revogados. A RPC, por ser
-- `security definer`, não depende desta concessão para gravar (roda
-- com os privilégios do dono da função, não do chamador).
-- =====================================================================

begin;

revoke insert, update on character_creation_drafts from authenticated;

commit;
