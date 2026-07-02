/**
 * Teste do "Encerrar Cena" CANÔNICO da mesa (checkpoint v0.45).
 *
 * Mesma solução técnica de `test-campaign-end-round.ts` (v0.44.1): só
 * este processo de teste aponta `SUPABASE_ANON_KEY` para a service
 * role key ANTES de qualquer chamada de storage, para poder exercitar
 * `createCampaign`/`endCampaignScene`/`endScene` (que fazem
 * insert/update em `campaigns`, restrito a `authenticated`) sem uma
 * sessão real de narrador — RLS em si nunca é alterado. Ver comentário
 * completo em `test-campaign-end-round.ts`.
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
import { endCampaignScene } from "../src/lib/table/endScene";
import {
  createCharacterForCampaign,
  getCharacter,
  updateCharacter,
  deleteCharacter,
} from "../src/lib/character/storage";
import { createInitialCharacter, resolvePendingRuptureChoice } from "../src/lib/character";
import type { Character } from "../src/lib/character";

const TEST_CAMPAIGN_NAME = "__TESTE_CAMPAIGN_END_SCENE__";
const TEST_CHARACTER_PREFIX = "__TESTE_CES__";

const serviceClient = createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false },
});

async function deleteCampaignRaw(id: string): Promise<void> {
  const { error } = await serviceClient.from("campaigns").delete().eq("id", id);
  if (error) throw new Error(`Falha ao apagar mesa de teste "${id}": ${error.message}`);
}

function characterWithRupture(nome: string, opts: { pending?: boolean; level?: number; integridade?: number; animo?: number } = {}): Character {
  const base = createInitialCharacter(null, nome);
  return {
    ...base,
    atributos: { ...base.atributos, animo: opts.animo ?? base.atributos.animo },
    recursos_atuais: { ...base.recursos_atuais, integridade: opts.integridade ?? 10 },
    ruptura_pendente: opts.pending ?? false,
    ruptura_nivel_pendente: opts.level,
  };
}

async function main(): Promise<void> {
  console.log("=== test-campaign-end-scene ===\n");

  const campaign = await createCampaign(TEST_CAMPAIGN_NAME);
  const createdCharacterIds: string[] = [];

  try {
    // -------------------------------------------------------------
    // 1. Campanha com 2 personagens: A com Ruptura pendente, B sem.
    // -------------------------------------------------------------
    const charA = await createCharacterForCampaign(
      campaign.id,
      characterWithRupture(`${TEST_CHARACTER_PREFIX}A_ruptura`, { pending: true, level: 1, integridade: 10, animo: 2 }),
    );
    const charB = await createCharacterForCampaign(
      campaign.id,
      characterWithRupture(`${TEST_CHARACTER_PREFIX}B_sem_ruptura`, { pending: false, integridade: 10 }),
    );
    createdCharacterIds.push(charA.id, charB.id);

    const sceneBefore = campaign.current_scene;
    const result1 = await endCampaignScene({ campaignId: campaign.id, expectedScene: sceneBefore });

    assert.equal(result1.previousScene, sceneBefore);
    assert.equal(result1.nextScene, sceneBefore + 1);
    assert.equal(result1.processedCharacters.length, 2, "Ambos os personagens devem ser processados.");
    assert.equal(result1.skippedCharacters.length, 0);
    assert.equal(result1.ruptureResolvedCount, 1, "Só A tem Ruptura pendente.");

    const summaryA = result1.processedCharacters.find((p) => p.characterId === charA.id);
    const summaryB = result1.processedCharacters.find((p) => p.characterId === charB.id);
    assert.equal(summaryA?.ruptureResolved, true);
    assert.equal(summaryB?.ruptureResolved, false);
    assert.equal(summaryA?.integridadeDepois, 9, "Integridade de A deve reduzir 1 (nível 1).");
    assert.equal(summaryB?.integridadeAntes, summaryB?.integridadeDepois, "B não perde Integridade.");

    const reloadedA = await getCharacter(charA.id);
    const reloadedB = await getCharacter(charB.id);
    assert.equal(reloadedA?.payload.recursos_atuais?.integridade, 9);
    assert.equal(reloadedA?.payload.ruptura_pendente, false, "ruptura_pendente deve ser limpa.");
    assert.equal(reloadedA?.payload.mana_bonus_ruptura, 4, "Mana máxima deve aumentar em Ânimo(2)+2=4.");
    assert.ok((reloadedA?.payload.pending_rupture_choices ?? []).length >= 1, "A deve receber pendência de Marca/Traço.");
    assert.equal(reloadedB?.payload.recursos_atuais?.integridade, 10, "B não é tocado.");
    console.log("1. Campanha com 2 personagens (A com Ruptura, B sem) — OK");

    // -------------------------------------------------------------
    // 2. Ruptura nível 1 — já coberto acima; reforça nível/limpeza.
    // -------------------------------------------------------------
    assert.equal(reloadedA?.payload.ruptura_nivel_pendente, 0, "ruptura_nivel_pendente deve ser limpa/zerada.");
    console.log("2. Ruptura pendente nível 1 — OK");

    // -------------------------------------------------------------
    // 3. Ruptura com nível maior (2).
    // -------------------------------------------------------------
    const charC = await createCharacterForCampaign(
      campaign.id,
      characterWithRupture(`${TEST_CHARACTER_PREFIX}C_nivel2`, { pending: true, level: 2, integridade: 10, animo: 1 }),
    );
    createdCharacterIds.push(charC.id);

    const sceneBefore2 = result1.nextScene;
    const result2 = await endCampaignScene({ campaignId: campaign.id, expectedScene: sceneBefore2 });
    const summaryC = result2.processedCharacters.find((p) => p.characterId === charC.id);
    assert.equal(summaryC?.integridadeDepois, 8, "Integridade deve reduzir 2 (nível 2).");
    const reloadedC = await getCharacter(charC.id);
    assert.equal(reloadedC?.payload.mana_bonus_ruptura, 3, "Mana máxima aumenta em Ânimo(1)+2=3, independente do nível.");
    const logsAfter2 = await listLogs(campaign.id);
    assert.ok(
      logsAfter2.some((l) => l.type === "rupture_resolved" && l.payload.ruptureLevel === 2),
      "Log deve registrar o nível 2 usado.",
    );
    console.log("3. Ruptura nível maior (2) — OK");

    // -------------------------------------------------------------
    // 4. Integridade chegando a 0.
    // -------------------------------------------------------------
    const charD = await createCharacterForCampaign(
      campaign.id,
      characterWithRupture(`${TEST_CHARACTER_PREFIX}D_zero`, { pending: true, level: 1, integridade: 1, animo: 1 }),
    );
    createdCharacterIds.push(charD.id);

    const sceneBefore3 = result2.nextScene;
    const result3 = await endCampaignScene({ campaignId: campaign.id, expectedScene: sceneBefore3 });
    const summaryD = result3.processedCharacters.find((p) => p.characterId === charD.id);
    assert.equal(summaryD?.integridadeDepois, 0);
    assert.equal(summaryD?.ultimaVontadePendente, true);
    assert.equal(result3.integrityZeroCount, 1);
    const reloadedD = await getCharacter(charD.id);
    assert.equal(reloadedD?.payload.ultima_vontade_pendente, true);
    assert.ok(reloadedD, "Personagem D não deve ser apagado.");
    const logsAfter4 = await listLogs(campaign.id);
    assert.ok(logsAfter4.some((l) => l.type === "integrity_zero_pending"), "Log integrity_zero_pending deve ser criado.");
    console.log("4. Integridade chegando a 0 — Última Vontade pendente — OK");

    // -------------------------------------------------------------
    // 5. Marca/Traço — resolução da pendência (nível de personagem, função pura).
    // -------------------------------------------------------------
    const pendingChoice = (reloadedA?.payload.pending_rupture_choices ?? []).find((c) => c.status === "pending");
    assert.ok(pendingChoice, "Deve haver uma pendência de Marca/Traço para A.");
    const nowIso = new Date().toISOString();
    const characterWithChoiceResolved = resolvePendingRuptureChoice(
      reloadedA!.payload,
      pendingChoice!.id,
      "Cicatriz na mão direita",
      "Desconfia de promessas fáceis",
      nowIso,
    );
    await updateCharacter(charA.id, characterWithChoiceResolved);
    const reloadedAAfterChoice = await getCharacter(charA.id);
    const resolvedChoice = (reloadedAAfterChoice?.payload.pending_rupture_choices ?? []).find((c) => c.id === pendingChoice!.id);
    assert.equal(resolvedChoice?.status, "resolved");
    assert.equal(resolvedChoice?.marca, "Cicatriz na mão direita");
    assert.equal(resolvedChoice?.traco, "Desconfia de promessas fáceis");
    console.log("5. Marca/Traço resolvido — OK");

    // -------------------------------------------------------------
    // 6. Idempotência — cena já avançou, reprocessar a cena antiga deve falhar.
    // -------------------------------------------------------------
    let threw = false;
    try {
      await endCampaignScene({ campaignId: campaign.id, expectedScene: sceneBefore3 }); // cena antiga, já processada no passo 4
    } catch {
      threw = true;
    }
    assert.equal(threw, true, "Reprocessar uma cena já avançada deve falhar (expectedScene não bate).");
    console.log("6. Idempotência (cena já avançada rejeitada) — OK");

    // -------------------------------------------------------------
    // 7. Cena sem nenhuma Ruptura pendente.
    // -------------------------------------------------------------
    const sceneBefore4 = result3.nextScene;
    const result4 = await endCampaignScene({ campaignId: campaign.id, expectedScene: sceneBefore4 });
    assert.equal(result4.nextScene, sceneBefore4 + 1, "Cena deve incrementar mesmo sem Ruptura.");
    assert.equal(result4.ruptureResolvedCount, 0, "Nenhuma Ruptura pendente restante neste passo.");
    console.log("7. Cena sem Ruptura pendente — OK");

    // -------------------------------------------------------------
    // 8. Mana máxima — bônus acumulado, Ânimo intacto, Mana atual preservada.
    // -------------------------------------------------------------
    const reloadedAFinal = await getCharacter(charA.id);
    assert.equal(reloadedAFinal?.payload.atributos.animo, 2, "Ânimo não deve mudar.");
    assert.equal(reloadedAFinal?.payload.mana_bonus_ruptura, 4, "Bônus acumulado permanece.");
    assert.equal(
      reloadedAFinal?.payload.recursos_atuais?.mana,
      charA.payload.recursos_atuais?.mana,
      "Mana atual não deve ser alterada pela resolução de Ruptura.",
    );
    console.log("8. Mana máxima por Ruptura (acumulado, sem alterar Ânimo/Mana atual) — OK");

    // -------------------------------------------------------------
    // 9. Efeitos de duração de cena — fora de escopo neste checkpoint.
    // -------------------------------------------------------------
    console.log(
      "9. Efeitos de duração de cena — FORA DE ESCOPO neste checkpoint (sem estrutura de duração " +
        "estruturada em ActiveCondition; expiredSceneEffectCount sempre 0, documentado no relatório).",
    );
    assert.equal(result4.processedCharacters.every(() => true), true); // placeholder sem asserção de comportamento não implementado

    // -------------------------------------------------------------
    // 10. Logs.
    // -------------------------------------------------------------
    const allLogs = await listLogs(campaign.id);
    assert.ok(allLogs.some((l) => l.type === "scene_end_processed"), "scene_end_processed deve ser criado.");
    assert.ok(allLogs.some((l) => l.type === "rupture_resolved"), "rupture_resolved deve ser criado.");
    assert.ok(allLogs.some((l) => l.type === "rupture_choice_created"), "rupture_choice_created deve ser criado.");
    assert.ok(allLogs.some((l) => l.type === "integrity_zero_pending"), "integrity_zero_pending deve ser criado.");
    console.log("10. Logs (scene_end_processed + rupture_* + integrity_zero_pending) — OK");

    console.log("\ntest-campaign-end-scene — todos os cenários passaram.");
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
  console.error("\ntest-campaign-end-scene FALHOU:", err instanceof Error ? err.message : err);
  process.exit(1);
});
