/**
 * Teste puro (sem WebSocket real) do Realtime mínimo — checkpoint
 * v0.46. WebSocket/Realtime de verdade é instável num script local
 * (rede, timing de canal), então este teste cobre as funções puras de
 * `src/lib/realtime/tableRealtime.ts` (nomes de canal, chave/dedupe de
 * evento, roteamento, debounce, merge de logs) e a formatação de log
 * já existente (`formatTableLogEntry`, `MesaTab.tsx`) — exatamente o
 * que o pedido definiu como obrigatório, deixando o smoke de WebSocket
 * de verdade para o teste manual (ver relatório).
 *
 * Fase 3 (divisão do antigo MesaDetailClient.tsx monolítico): o
 * formatador exercitado aqui passou a ser `formatTableLogEntry`
 * (MesaTab.tsx) — o mesmo já usado pela ficha e agora também por
 * `TableLogSection.tsx` (Mesa). `formatCampaignRoundLog`, que este
 * teste exercitava antes, nunca era chamado por nenhuma tela real
 * (código morto superado por `formatTableLogEntry`, que já cobre os
 * mesmos tipos) — removido junto com o resto do MesaDetailClient.tsx.
 */

import assert from "node:assert/strict";
import {
  buildCampaignChannelName,
  buildCharacterChannelName,
  buildTableLogsChannelName,
  makeRealtimeEventKey,
  dedupeRealtimeEvent,
  mergeTableLogsById,
  createDebouncedRefetcher,
  routeRealtimePayload,
  subscribeToCampaignRealtime,
  describeRealtimeStatus,
} from "../src/lib/realtime/tableRealtime";
import { formatTableLogEntry } from "../src/lib/table/logPresentation";
import type { TableLogEntry } from "../src/lib/table";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main(): Promise<void> {
  console.log("=== test-realtime-minimal ===\n");

  // -------------------------------------------------------------
  // 1. Channel names — estáveis (mesmo input → mesmo output) e distintos por recurso.
  // -------------------------------------------------------------
  const campaignId = "11111111-1111-1111-1111-111111111111";
  const characterId = "22222222-2222-2222-2222-222222222222";
  assert.equal(buildCampaignChannelName(campaignId), buildCampaignChannelName(campaignId));
  assert.equal(buildCharacterChannelName(characterId), buildCharacterChannelName(characterId));
  assert.equal(buildTableLogsChannelName(campaignId), buildTableLogsChannelName(campaignId));
  assert.notEqual(buildCampaignChannelName(campaignId), buildCharacterChannelName(campaignId));
  assert.notEqual(buildCampaignChannelName(campaignId), buildTableLogsChannelName(campaignId));
  console.log("1. Nomes de canal estáveis e distintos por recurso — OK");

  // -------------------------------------------------------------
  // 2. Event key/dedupe.
  // -------------------------------------------------------------
  const eventoA = { table: "characters", eventType: "UPDATE", commit_timestamp: "2026-07-02T10:00:00Z", new: { id: characterId } };
  const eventoAIgual = { table: "characters", eventType: "UPDATE", commit_timestamp: "2026-07-02T10:00:00Z", new: { id: characterId } };
  const eventoBDiferente = { table: "characters", eventType: "UPDATE", commit_timestamp: "2026-07-02T10:00:05Z", new: { id: characterId } };
  assert.equal(makeRealtimeEventKey(eventoA), makeRealtimeEventKey(eventoAIgual), "Dois eventos iguais devem gerar a mesma chave.");
  assert.notEqual(makeRealtimeEventKey(eventoA), makeRealtimeEventKey(eventoBDiferente), "Eventos com timestamp diferente devem gerar chaves diferentes.");

  const seen = new Set<string>();
  assert.equal(dedupeRealtimeEvent(seen, makeRealtimeEventKey(eventoA)), true, "Primeiro evento deve ser aceito.");
  assert.equal(dedupeRealtimeEvent(seen, makeRealtimeEventKey(eventoAIgual)), false, "Evento duplicado deve ser ignorado.");
  assert.equal(dedupeRealtimeEvent(seen, makeRealtimeEventKey(eventoBDiferente)), true, "Evento novo deve ser aceito.");
  console.log("2. Chave de evento + dedupe — OK");

  // -------------------------------------------------------------
  // 3. Table log dedupe (mergeTableLogsById) — sem duplicar id, ordem preservada (mais novo primeiro).
  // -------------------------------------------------------------
  const logsExistentes = [
    { id: "log-2", created_at: "2026-07-02T10:02:00Z" },
    { id: "log-1", created_at: "2026-07-02T10:01:00Z" },
  ];
  const semNovidade = mergeTableLogsById(logsExistentes, [{ id: "log-1", created_at: "2026-07-02T10:01:00Z" }]);
  assert.equal(semNovidade.length, 2, "Log com mesmo id não deve duplicar.");
  assert.equal(semNovidade, logsExistentes, "Sem novidade, devolve a MESMA referência (sem re-render à toa).");

  const comNovidade = mergeTableLogsById(logsExistentes, [{ id: "log-3", created_at: "2026-07-02T10:03:00Z" }]);
  assert.equal(comNovidade.length, 3, "Log novo deve entrar.");
  assert.deepEqual(comNovidade.map((l) => l.id), ["log-3", "log-2", "log-1"], "Ordem final deve ficar mais novo → mais antigo.");
  console.log("3. Table log dedupe (mergeTableLogsById) — OK");

  // -------------------------------------------------------------
  // 4. Debounce/refetch scheduling.
  // -------------------------------------------------------------
  let chamadasRajada = 0;
  const debounceRajada = createDebouncedRefetcher(() => chamadasRajada++, 40);
  debounceRajada.schedule();
  debounceRajada.schedule();
  debounceRajada.schedule();
  await sleep(80);
  assert.equal(chamadasRajada, 1, "Múltiplos eventos em rajada devem gerar um único refetch agendado.");

  let chamadasSeparadas = 0;
  const debounceSeparado = createDebouncedRefetcher(() => chamadasSeparadas++, 40);
  debounceSeparado.schedule();
  await sleep(80);
  debounceSeparado.schedule();
  await sleep(80);
  assert.equal(chamadasSeparadas, 2, "Eventos fora da janela de debounce devem gerar refetches separados.");
  console.log("4. Debounce/refetch scheduling — OK");

  // -------------------------------------------------------------
  // 5. Cleanup — unsubscribe/cancel funcionam; evento após cleanup não chama refetch.
  // -------------------------------------------------------------
  let chamadasAposCleanup = 0;
  const debounceCleanup = createDebouncedRefetcher(() => chamadasAposCleanup++, 30);
  debounceCleanup.schedule();
  debounceCleanup.cancel();
  await sleep(60);
  assert.equal(chamadasAposCleanup, 0, "cancel() antes do disparo não deve chamar o refetch.");

  // subscribeToCampaignRealtime sem env pública de browser configurada
  // neste processo de teste (NEXT_PUBLIC_SUPABASE_URL/ANON_KEY não são
  // lidas por scripts Node comuns) deve reportar "disabled" e devolver
  // um cleanup no-op, sem lançar — mesmo contrato usado quando Realtime
  // está indisponível em produção.
  let statusRecebido: string | null = null;
  const unsubscribe = subscribeToCampaignRealtime({
    campaignId,
    onChange: () => {},
    onStatusChange: (s) => { statusRecebido = s; },
  });
  assert.equal(statusRecebido, "disabled", "Sem client de browser, o status deve ser 'disabled'.");
  assert.doesNotThrow(() => unsubscribe(), "unsubscribe() deve ser chamável sem lançar mesmo em modo disabled.");
  console.log("5. Cleanup (cancel/unsubscribe) — OK");

  // -------------------------------------------------------------
  // 6. Payload routing.
  // -------------------------------------------------------------
  assert.equal(routeRealtimePayload("characters", "UPDATE"), "refetch_character");
  assert.equal(routeRealtimePayload("characters", "INSERT"), "refetch_character");
  assert.equal(routeRealtimePayload("characters", "DELETE"), "refetch_character");
  assert.equal(routeRealtimePayload("campaigns", "UPDATE"), "refetch_campaign");
  assert.equal(routeRealtimePayload("campaigns", "INSERT"), "ignore", "campaigns só reage a UPDATE.");
  assert.equal(routeRealtimePayload("table_logs", "INSERT"), "refetch_table_logs");
  assert.equal(routeRealtimePayload("table_logs", "UPDATE"), "ignore", "table_logs é append-only, sem UPDATE.");
  assert.equal(routeRealtimePayload("tabela_nao_suportada", "UPDATE"), "ignore", "Tabela não suportada deve ser ignorada.");
  console.log("6. Payload routing — OK");

  // -------------------------------------------------------------
  // 7. Regressão de formatação — nenhum log recente cai em JSON cru.
  // -------------------------------------------------------------
  const tiposRecentes: [string, Record<string, unknown>][] = [
    ["condition_end_round_damage", { characterNome: "Teste", conditionName: "Queimando", damage: 4, damageType: "igneo" }],
    ["condition_end_round_check_created", { characterNome: "Teste", conditionName: "Envenenado", resistance: { pericia: "vigor", cd: 7 } }],
    ["condition_end_round_check_resolved", { characterNome: "Teste", conditionName: "Envenenado", result: "success" }],
    ["condition_applied", { characterNome: "Teste", conditionName: "Lento" }],
    ["condition_removed", { characterNome: "Teste", conditionName: "Lento" }],
    ["round_pa_reduced_by_condition", { characterNome: "Teste", conditionName: "Envenenado", value: 1 }],
    ["round_end_processed", { processedCharacterNames: ["A", "B"], damageCount: 2, pendingCheckCount: 1 }],
    ["scene_end_processed", { processedCharacterNames: ["A"], ruptureResolvedCount: 1, pendingChoiceCount: 1 }],
    ["rupture_resolved", { characterNome: "Teste", ruptureLevel: 1, integrityBefore: 10, integrityAfter: 9, manaBonusApplied: 4 }],
    ["rupture_choice_created", { characterNome: "Teste" }],
    ["rupture_choice_resolved", { characterNome: "Teste", marca: "Cicatriz", traco: "Desconfiado" }],
    ["integrity_zero_pending", { characterNome: "Teste" }],
    ["scene_effect_expired", { characterNome: "Teste", effectName: "Postura Ofensiva" }],
    ["round_ended", { previousRound: 1, newRound: 2 }],
    ["scene_ended", { previousScene: 1, newScene: 2 }],
    ["scene_rupture_pending", { characterNames: ["A"] }],
  ];
  for (const [type, payload] of tiposRecentes) {
    const entry: TableLogEntry = {
      id: "log-teste",
      campaign_id: campaignId,
      character_id: null,
      type,
      visibility: "public",
      payload,
      created_at: "2026-07-02T10:00:00Z",
      created_by_user_id: null,
    };
    const formatado = formatTableLogEntry(entry);
    assert.ok(formatado.length > 0, `Tipo "${type}" não deve produzir texto vazio.`);
    assert.ok(!formatado.trim().startsWith("{"), `Tipo "${type}" não deve cair em JSON cru.`);
  }
  console.log(`7. Regressão de formatação — ${tiposRecentes.length} tipos de log verificados, nenhum JSON cru — OK`);

  // -------------------------------------------------------------
  // Extra: describeRealtimeStatus nunca deixa a UI sem texto/cor.
  // -------------------------------------------------------------
  for (const status of ["connecting", "subscribed", "error", "disabled"] as const) {
    for (const contexto of ["mesa", "ficha"] as const) {
      const { texto, cor } = describeRealtimeStatus(status, contexto);
      assert.ok(texto.length > 0);
      assert.ok(cor.startsWith("#"));
    }
  }
  console.log("Extra. describeRealtimeStatus sempre devolve texto/cor válidos — OK");

  console.log("\ntest-realtime-minimal — todos os cenários passaram.");
}

main().catch((err) => {
  console.error("\ntest-realtime-minimal FALHOU:", err instanceof Error ? err.message : err);
  process.exit(1);
});
