-- =====================================================================
-- Ruptura VTT — Gatilhos mínimos de rodada e cena
-- Migration: 0017_campaign_round_scene
--
-- Checkpoint v0.39. PRD seção 5 define quatro gatilhos de tempo
-- (Encerrar turno, Encerrar rodada, Encerrar cena, Descanso) — descanso
-- já existe (checkpoint v0.36). Esta migration adiciona só os dois
-- contadores mínimos de mesa que faltavam: rodada atual e cena atual.
-- Sem trilha de iniciativa, sem alternância PJ/PN, sem dano recorrente
-- automático — isso é trabalho futuro (fora de escopo deste checkpoint).
--
-- Decisão de "menor risco" (pedida no checkpoint): `campaigns` é uma
-- tabela relacional simples, sem coluna JSONB de payload livre — ao
-- invés de inventar um payload novo ou derivar o número da rodada
-- contando linhas de `table_logs` (frágil: convites revogados, logs
-- filtrados por visibilidade, etc.), a forma mais simples e segura é
-- duas colunas inteiras aditivas, com default seguro, sem afetar
-- nenhuma linha existente.
-- =====================================================================

begin;

alter table campaigns
  add column if not exists current_round integer not null default 1,
  add column if not exists current_scene integer not null default 1;

comment on column campaigns.current_round is
  'Rodada atual da mesa (checkpoint v0.39) — incrementada por "Encerrar rodada". Não é iniciativa real, só um contador.';
comment on column campaigns.current_scene is
  'Cena atual da mesa (checkpoint v0.39) — incrementada por "Encerrar cena".';

commit;
