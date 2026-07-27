-- =====================================================================
-- Ruptura VTT — Trilha de turnos (Rápidos/Lentos)
-- Migration: 0036_turn_track
--
-- PRD seção 6 "Combate e iniciativa por janelas": a rodada é dividida
-- em janela Rápida (ações até 2 PA) e janela Lenta (3+ PA), alternando
-- entre PJ e PNJ dentro de cada janela, com desempate por Reflexos.
-- Este é o primeiro estado persistente real desse sistema — antes
-- disto só existia o contador simples current_round/current_scene
-- (migration 0017) e um comentário explícito em TurnCounters.tsx
-- dizendo que rodada/janela não estavam implementadas.
--
-- Decisão de schema: uma coluna JSONB (`turn_track`) em vez de tabelas
-- normalizadas — o estado é pequeno, lido/escrito inteiro a cada
-- transição (mesmo padrão já usado para o payload de personagem), e
-- não precisa ser consultado por outras linhas. `turn_track_version`
-- é um inteiro incremental separado para concorrência otimista (igual
-- ao `expectedRound` já usado em endCampaignRound) — comparar o JSONB
-- inteiro seria frágil a reordenação de chaves.
-- =====================================================================

begin;

alter table campaigns
  add column if not exists turn_track jsonb not null default '{"window": null, "side": null, "round": 1, "participants": [], "order": [], "currentIndex": -1, "lastOverrideAt": null}'::jsonb,
  add column if not exists turn_track_version integer not null default 0;

comment on column campaigns.turn_track is
  'Estado da trilha de turnos (checkpoint pós-v0.94, migration 0036) — janela atual (rapida/lenta/null), lado ativo (pj/pnj), ordem computada com desempate por Reflexos, participantes que já agiram. Ver src/lib/table/turnTrack.ts para o motor puro e o shape completo (TurnTrackState).';
comment on column campaigns.turn_track_version is
  'Versão incremental para concorrência otimista nas Server Actions de turno — compare-and-swap, mesmo padrão de expectedRound em endCampaignRound (src/lib/table/endRound.ts).';

commit;
