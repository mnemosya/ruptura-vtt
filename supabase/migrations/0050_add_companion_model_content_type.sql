-- =====================================================================
-- Ruptura VTT — novo content_type: companion_model
-- Migration: 0050_add_companion_model_content_type
--
-- Catálogo oficial de modelos de drone/robô (checkpoint "Catálogo
-- oficial de drones e robôs consumido pela ficha") — fonte dos dados:
-- docs/fontes/DRONES E ROBÔS 7a00a13635528396b33501c34c719d2a.md.
--
-- Mesmo padrão mínimo de 0035_add_capitulo_content_type.sql: o pipeline
-- (content_documents/content_drafts/publish_content_draft) já é
-- genérico por content_type, nenhuma delas faz branch condicional em
-- SQL — então adicionar um content_type novo ao schema Postgres exige
-- só estender o enum. `ALTER TYPE ... ADD VALUE` não pode rodar na
-- mesma transação que já consome o valor novo, por isso esta migration
-- fica sozinha, sem nenhum INSERT/seed acoplado (o seed dos 10 modelos
-- + 5 runas roda depois, via scripts/seed-content.ts).
-- =====================================================================

alter type content_type add value if not exists 'companion_model';
