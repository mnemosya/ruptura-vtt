-- =====================================================================
-- Ruptura VTT — trava de concorrência do fim de rodada
-- Migration: 0042_campaign_round_end_lock
--
-- Achado da rodada de fechamento (Fase 1, cenário 5 — fim de rodada):
-- `endCampaignRound` (src/lib/table/endRound.ts) já documentava a
-- própria lacuna no comentário ("NÃO é uma transação atômica no
-- Postgres... suficiente só para F5/duplo-clique de UM narrador").
-- O fluxo faz um preflight (lê `current_round`), depois processa TODOS
-- os personagens da mesa em várias chamadas separadas (cada uma sua
-- própria transação PostgREST) e só ao final avança `current_round` —
-- duas chamadas concorrentes (dois cliques quase simultâneos, ou clique
-- + retry de rede) passam AMBAS pelo preflight antes de qualquer uma
-- terminar, processando PA/Reações/condições/efeitos e gravando table_logs
-- em DOBRO.
--
-- Não é viável (nem desejável, fora do escopo desta rodada) reescrever
-- o processamento de fim de rodada inteiro como uma única transação
-- SQL — ele já reaproveita motores puros de personagem via várias
-- idas ao Postgres. A correção mínima e real: um campo de trava
-- (`round_processing`) na própria linha de `campaigns`, marcado por um
-- UPDATE...WHERE condicional de UMA linha só — atômico por construção
-- (o Postgres serializa updates concorrentes na mesma linha; só uma
-- das duas chamadas concorrentes recebe a linha de volta) — antes de
-- processar qualquer personagem. A segunda chamada recebe erro
-- controlado IMEDIATO, nunca processa nada em duplicidade.
-- =====================================================================

begin;

alter table campaigns
  add column if not exists round_processing boolean not null default false;

commit;
