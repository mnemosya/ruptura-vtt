-- Auditoria pós-Fase-4 — REPLICA IDENTITY FULL. Achado ao verificar a
-- publicação da migration 0063: com a identidade padrão (só a chave
-- primária), o registro "old" que o Postgres inclui no WAL para um
-- DELETE contém SÓ as colunas da PK. `character_controllers` tem PK
-- `(character_id, user_id)` — sem `campaign_id` no "old", o filtro
-- `campaign_id=eq.<id>` do canal Realtime
-- (`subscribeToCampaignCharacterControllersRealtime`) nunca casa num
-- DELETE, e o evento de REVOGAR controle nunca chega ao cliente
-- (confirmado com teste: critério 12 do check da Fase 4 passava, 13
-- falhava, até este fix). Mesmo problema, mesma causa, afeta
-- `characters` (PK só `id`, sem `campaign_id`) — o canal de
-- `subscribeToCampaignCharactersRealtime` assina `event: "*"` (inclui
-- DELETE) filtrado por `campaign_id`, e `deleteCharacter`
-- (src/lib/character/storage.ts) faz um DELETE de verdade, não só
-- arquivamento — caminho alcançável, não só teórico.
--
-- INSERT/UPDATE não sofrem disto (o registro "new" sempre vem
-- completo, independente da replica identity — confirmado empírico:
-- UPDATE de PV filtrado por `campaign_id`, critério 11, sempre
-- funcionou). Só DELETE precisa da imagem "old" completa.
--
-- `campaigns`/`table_logs` NÃO precisam: `campaigns` só assina UPDATE
-- filtrado pela própria PK (`id`); `table_logs` só assina INSERT
-- (sempre usa "new"). `ALTER TABLE ... REPLICA IDENTITY FULL` é
-- idempotente por natureza (redefinir pro mesmo valor não é erro nem
-- duplica nada).

alter table public.character_controllers replica identity full;
alter table public.characters replica identity full;
