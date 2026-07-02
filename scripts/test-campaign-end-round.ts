/**
 * Teste do "Encerrar Rodada" CANÔNICO da mesa (checkpoint v0.44.1).
 *
 * `campaigns` restringe insert/update/delete a `authenticated` desde a
 * migration 0006 (policies `campaigns_owner_*`) — no produto real isso
 * sempre funciona porque o dashboard `/mesas/[campaignId]` só é
 * acessível com narrador logado (cookie de sessão, checkpoint v0.21).
 * Um script Node solto não tem esse cookie/contexto de request
 * (`getScopedTableClient()` cai em anon puro fora de uma request —
 * documentado no próprio `scopedClient.ts`), então não há como este
 * teste autenticar como narrador de verdade sem subir um servidor.
 *
 * Solução adotada, só para este processo de teste: apontar
 * `SUPABASE_ANON_KEY` para a service role key ANTES de importar
 * qualquer módulo de storage (nenhum client é cacheado como singleton
 * fora de request — todos leem `process.env` a cada chamada). Isso
 * NÃO altera nenhuma policy de RLS — só troca, dentro deste processo
 * isolado, qual chave o próprio script usa para exercitar o caminho de
 * produção real (`createCampaign`/`endCampaignRound`/`endRound` como
 * estão, sem duplicar lógica). `table_logs.campaign_id` tem `on delete
 * cascade` — apagar a mesa de teste também limpa os logs gerados.
 */

import { config as loadDotenv } from "dotenv";
loadDotenv({ path: ".env.local" });

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`Variável de ambiente obrigatória ausente: ${name}`);
    process.exit(1);
  }
  return v;
}

// Ver nota acima — só para este processo de teste, nunca em runtime do app.
process.env.SUPABASE_ANON_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

import { createClient } from "@supabase/supabase-js";
import assert from "node:assert/strict";
import { createCampaign, listLogs } from "../src/lib/table/storage";
import { endCampaignRound } from "../src/lib/table/endRound";
import {
  createCharacterForCampaign,
  getCharacter,
  deleteCharacter,
} from "../src/lib/character/storage";
import { createInitialCharacter } from "../src/lib/character";
import type { Character } from "../src/lib/character";

const TEST_CAMPAIGN_NAME = "__TESTE_CAMPAIGN_END_ROUND__";
const TEST_CHARACTER_PREFIX = "__TESTE_CER__";

const serviceClient = createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false },
});

async function deleteCampaignRaw(id: string): Promise<void> {
  const { error } = await serviceClient.from("campaigns").delete().eq("id", id);
  if (error) throw new Error(`Falha ao apagar mesa de teste "${id}": ${error.message}`);
}

function condition(slug: string) {
  return {
    id: `cond-${slug}`,
    conditionId: slug,
    nome: slug.charAt(0).toUpperCase() + slug.slice(1),
    aplicadaEm: "2026-07-02T10:00:00.000Z",
    removidaEm: null,
    ativa: true,
  };
}

function characterWithCondition(nome: string, slug?: string): Character {
  const base = createInitialCharacter(null, nome);
  return {
    ...base,
    recursos_atuais: { ...base.recursos_atuais, pv: 20, pe: 20 },
    condicoes_ativas: slug ? [condition(slug)] : [],
    estado_jogo: { pa_gastos: 2, reacoes_usadas: 1, defesas_sem_reacao: 2 },
  };
}

async function main(): Promise<void> {
  console.log("=== test-campaign-end-round ===\n");

  const campaign = await createCampaign(TEST_CAMPAIGN_NAME);
  const createdCharacterIds: string[] = [];

  try {
    // -------------------------------------------------------------
    // 1. Campanha com 2 personagens (Queimando + Sangrando).
    // -------------------------------------------------------------
    const charA = await createCharacterForCampaign(
      campaign.id,
      characterWithCondition(`${TEST_CHARACTER_PREFIX}A_queimando`, "queimando"),
    );
    const charB = await createCharacterForCampaign(
      campaign.id,
      characterWithCondition(`${TEST_CHARACTER_PREFIX}B_sangrando`, "sangrando"),
    );
    createdCharacterIds.push(charA.id, charB.id);

    const roundBefore = campaign.current_round;
    const result1 = await endCampaignRound({ campaignId: campaign.id, expectedRound: roundBefore });

    assert.equal(result1.previousRound, roundBefore);
    assert.equal(result1.nextRound, roundBefore + 1);
    assert.equal(result1.processedCharacters.length, 2, "Ambos os personagens devem ser processados.");
    assert.equal(result1.skippedCharacters.length, 0);

    const summaryA = result1.processedCharacters.find((p) => p.characterId === charA.id);
    const summaryB = result1.processedCharacters.find((p) => p.characterId === charB.id);
    assert.ok(summaryA && summaryA.pvAfter < summaryA.pvBefore, "Queimando deve reduzir PV do personagem A.");
    assert.ok(summaryB && summaryB.pvAfter < summaryB.pvBefore, "Sangrando deve reduzir PV do personagem B.");
    assert.equal(result1.damageEventCount, 2, "Um evento de dano por personagem.");

    const reloadedA = await getCharacter(charA.id);
    const reloadedB = await getCharacter(charB.id);
    assert.equal(reloadedA?.payload.recursos_atuais?.pv, summaryA?.pvAfter, "PV persistido de A deve bater com o resumo.");
    assert.equal(reloadedB?.payload.recursos_atuais?.pv, summaryB?.pvAfter, "PV persistido de B deve bater com o resumo.");
    const queimandoAtivaA = reloadedA?.payload.condicoes_ativas?.find((c) => c.conditionId === "queimando");
    const sangrandoAtivaB = reloadedB?.payload.condicoes_ativas?.find((c) => c.conditionId === "sangrando");
    assert.equal(queimandoAtivaA?.ativa, true, "Queimando continua ativo após o fim de rodada.");
    assert.equal(sangrandoAtivaB?.ativa, true, "Sangrando continua ativo após o fim de rodada.");
    console.log("1. Campanha com 2 personagens (Queimando + Sangrando) — OK");

    // -------------------------------------------------------------
    // 2. Personagem sem condição — PA/Reações renovam, penalidade zera, sem dano.
    // -------------------------------------------------------------
    const charC = await createCharacterForCampaign(
      campaign.id,
      characterWithCondition(`${TEST_CHARACTER_PREFIX}C_sem_condicao`),
    );
    createdCharacterIds.push(charC.id);

    const roundBefore2 = result1.nextRound;
    const result2 = await endCampaignRound({ campaignId: campaign.id, expectedRound: roundBefore2 });
    const summaryC = result2.processedCharacters.find((p) => p.characterId === charC.id);
    assert.ok(summaryC, "Personagem C deve ser processado mesmo sem condição.");
    assert.equal(summaryC?.damageEvents, 0);
    const reloadedC = await getCharacter(charC.id);
    assert.equal(reloadedC?.payload.estado_jogo?.pa_gastos, 0, "PA deve renovar (pa_gastos=0).");
    assert.equal(reloadedC?.payload.estado_jogo?.reacoes_usadas, 0, "Reações devem renovar.");
    assert.equal(reloadedC?.payload.estado_jogo?.defesas_sem_reacao, 0, "Penalidade de defesa sem Reação deve zerar.");
    console.log("2. Personagem sem condição — OK");

    // -------------------------------------------------------------
    // 3. Envenenado — PA renova e reduz 1; pendência criada; log de redução.
    // -------------------------------------------------------------
    const charD = await createCharacterForCampaign(
      campaign.id,
      characterWithCondition(`${TEST_CHARACTER_PREFIX}D_envenenado`, "envenenado"),
    );
    createdCharacterIds.push(charD.id);

    const roundBefore3 = result2.nextRound;
    const result3 = await endCampaignRound({ campaignId: campaign.id, expectedRound: roundBefore3 });
    const summaryD = result3.processedCharacters.find((p) => p.characterId === charD.id);
    assert.ok(summaryD);
    const reloadedD = await getCharacter(charD.id);
    // PA renova para 0 gastos e Envenenado reduz 1 -> pa_gastos final = 1
    // (equivalente a "PA final = PA máximo - 1", sem precisar recomputar
    // derivados aqui — a mesma asserção já é feita em detalhe no script
    // de unidade endRoundConditions, test:end-round-conditions cenário 3).
    assert.equal(reloadedD?.payload.estado_jogo?.pa_gastos, 1, "Envenenado deve deixar pa_gastos=1 após renovar+reduzir.");
    assert.ok((summaryD?.pendingChecks ?? 0) >= 1, "Envenenado deve criar pendência Vigor CD 7.");
    const pendingD = reloadedD?.payload.pending_condition_checks ?? [];
    assert.ok(pendingD.some((p) => p.conditionId === "envenenado" && p.status === "pending"));
    const logsAfter3 = await listLogs(campaign.id);
    assert.ok(logsAfter3.some((l) => l.type === "round_pa_reduced_by_condition"));
    console.log("3. Envenenado — PA + pendência — OK");

    // -------------------------------------------------------------
    // 4. Idempotência — campanha já avançou, reprocessar a rodada antiga deve falhar.
    // -------------------------------------------------------------
    let threw = false;
    try {
      await endCampaignRound({ campaignId: campaign.id, expectedRound: roundBefore3 }); // rodada antiga, já processada no passo 3
    } catch {
      threw = true;
    }
    assert.equal(threw, true, "Reprocessar uma rodada já avançada deve falhar (expectedRound não bate).");
    console.log("4. Idempotência (rodada já avançada rejeitada) — OK");

    // -------------------------------------------------------------
    // 5. Pendência aparece no personagem (já verificado no passo 3, reforça aqui).
    // -------------------------------------------------------------
    const reloadedD2 = await getCharacter(charD.id);
    assert.ok((reloadedD2?.payload.pending_condition_checks ?? []).length >= 1);
    console.log("5. Pendência de condição aparece no personagem — OK");

    // -------------------------------------------------------------
    // 6. Logs agregados.
    // -------------------------------------------------------------
    const allLogs = await listLogs(campaign.id);
    assert.ok(allLogs.some((l) => l.type === "round_end_processed"), "round_end_processed deve ser criado.");
    assert.ok(allLogs.some((l) => l.type === "condition_end_round_damage"), "condition_end_round_damage deve ser criado.");
    assert.ok(
      allLogs.some((l) => l.type === "condition_end_round_check_created"),
      "condition_end_round_check_created deve ser criado quando aplicável (Envenenado).",
    );
    console.log("6. Logs agregados (round_end_processed + condition_end_round_*) — OK");

    console.log("\ntest-campaign-end-round — todos os cenários passaram.");
  } finally {
    for (const id of createdCharacterIds) {
      try {
        await deleteCharacter(id);
      } catch {
        // best-effort — não deve travar a limpeza dos demais.
      }
    }
    await deleteCampaignRaw(campaign.id);
  }
}

main().catch((err) => {
  console.error("\ntest-campaign-end-round FALHOU:", err instanceof Error ? err.message : err);
  process.exit(1);
});
