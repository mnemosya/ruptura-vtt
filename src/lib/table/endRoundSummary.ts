/**
 * Formatação do resultado de `endCampaignRound` (checkpoint v0.44.1)
 * para a UI da mesa — função pura, sem "use server" (arquivos Server
 * Action só podem exportar async functions; esta é síncrona de
 * propósito, então vive num módulo separado de `endRound.ts`).
 */

import type { CampaignEndRoundResult } from "./endRound";

/** Resumo textual curto para a UI da mesa — nunca JSON cru. */
export function buildCampaignEndRoundSummary(result: CampaignEndRoundResult): string[] {
  const lines: string[] = [];
  lines.push(`Rodada ${result.previousRound} → ${result.nextRound} (cena ${result.scene}).`);
  lines.push(`${result.processedCharacters.length} personagem(ns) processado(s).`);
  if (result.damageEventCount > 0) lines.push(`${result.damageEventCount} evento(s) de dano de condição.`);
  if (result.pendingCheckCount > 0) lines.push(`${result.pendingCheckCount} pendência(s) de teste criada(s).`);
  if (result.paReductionCount > 0) lines.push(`${result.paReductionCount} redução(ões) de PA por condição.`);
  if (result.appliedConditionCount > 0) lines.push(`${result.appliedConditionCount} condição(ões) aplicada(s).`);
  if (result.removedConditionCount > 0) lines.push(`${result.removedConditionCount} condição(ões) removida(s).`);
  if (
    result.damageEventCount === 0 &&
    result.pendingCheckCount === 0 &&
    result.paReductionCount === 0 &&
    result.appliedConditionCount === 0 &&
    result.removedConditionCount === 0
  ) {
    lines.push("Nenhum efeito de condição foi aplicado.");
  }
  if (result.skippedCharacters.length > 0) {
    lines.push(
      `${result.skippedCharacters.length} personagem(ns) falharam ao processar: ${result.skippedCharacters
        .map((s) => `${s.characterNome} (${s.reason})`)
        .join("; ")}`,
    );
  }
  return lines;
}
