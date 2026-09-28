# Catálogo de cards do chat (CHAT-01)

**Gerado por** `node scripts/dev/check-chat-catalogo.mjs --tabela`. Não editar à mão.

O inventário é gerado do código de propósito. Uma tabela escrita à mão envelhece na
primeira vez que alguém acrescenta um tipo e não a atualiza — e ninguém descobre,
porque `formatGenericLog` engole o desconhecido com elegância: o card sai legível,
só que montado por despejo de campos em vez de frase.

`node scripts/dev/check-chat-catalogo.mjs` (sem `--tabela`) **falha** quando um tipo
passa a ser escrito sem ganhar renderizador próprio. Foi assim que `attack_damage_applied`,
`turn_ended` e `turn_track_narrator_update` apareceram.

## Limite conhecido

A coluna "escrito em" só enxerga escrita ESTÁTICA: `type: "..."` em TypeScript junto de
`payload`/`visibility`, e literal na posição da coluna `type` num `insert into table_logs`.
Tipo escrito por expressão dinâmica não é inventariável assim, e o silêncio aqui é honesto —
por isso muitos tipos com card aparecem sem origem.

| tipo | escrito em | tem card próprio |
|---|---|---|
| `action_used` | — | sim |
| `attack_damage_applied` | app/mesas/[campaignId]/vtt/_painel/acoes/combatePainel.ts | sim |
| `attack_resolved` | — | sim |
| `character_evolution` | — | sim |
| `character_state_change` | — | sim |
| `chat` | — | sim |
| `compendio_compartilhado` | — | sim |
| `condition_applied` | — | sim |
| `condition_auto_removal_undone` | — | sim |
| `condition_auto_removed` | — | sim |
| `condition_end_round_check_created` | — | sim |
| `condition_end_round_check_resolved` | — | sim |
| `condition_end_round_damage` | — | sim |
| `condition_removed` | — | sim |
| `defense_reaction_used` | — | sim |
| `integrity_zero_pending` | — | sim |
| `inventory_transfer` | — | sim |
| `item_used` | — | sim |
| `overload_surge` | — | sim |
| `overload_surge_used` | — | sim |
| `overload_will_roll` | — | sim |
| `profile_event` | 0032_lockdown_profile_sessions_and_active_character.sql | sim |
| `rest_long` | — | sim |
| `rest_short` | — | sim |
| `rolagem_expressao` | app/mesas/[campaignId]/vtt/_painel/acoes/rolagemPainel.ts | sim |
| `rolagem_pericia` | app/mesas/[campaignId]/vtt/_painel/acoes/rolagemPainel.ts | sim |
| `round_end_processed` | — | sim |
| `round_ended` | lib/table/storage.ts | sim |
| `round_pa_reduced_by_condition` | — | sim |
| `rupture_choice_created` | — | sim |
| `rupture_choice_resolved` | — | sim |
| `rupture_resolved` | — | sim |
| `scene_effect_expired` | — | sim |
| `scene_end_processed` | — | sim |
| `scene_ended` | lib/table/storage.ts | sim |
| `scene_rupture_pending` | lib/table/storage.ts | sim |
| `spell_attack_resolved` | — | sim |
| `spell_attack_used` | — | sim |
| `spell_cast` | — | sim |
| `talent_used` | — | sim |
| `temporary_effect_added` | — | sim |
| `temporary_effect_expired` | — | sim |
| `temporary_effect_removed` | — | sim |
| `turn_ended` | 0037_turn_track_rpc.sql | sim |
| `turn_track_narrator_update` | 0037_turn_track_rpc.sql | sim |
