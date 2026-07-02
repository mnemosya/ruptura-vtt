/**
 * Formatação do resultado de `endCampaignScene` (checkpoint v0.45)
 * para a UI da mesa — função pura, sem "use server" (mesmo motivo de
 * `endRoundSummary.ts`: um arquivo Server Action só pode exportar
 * async functions).
 */

import type { CampaignEndSceneResult } from "./endScene";

/** Resumo textual curto para a UI da mesa — nunca JSON cru. */
export function buildCampaignEndSceneSummary(result: CampaignEndSceneResult): string[] {
  const lines: string[] = [];
  lines.push(`Cena ${result.previousScene} → ${result.nextScene} (rodada ${result.round}).`);
  lines.push(`${result.processedCharacters.length} personagem(ns) processado(s).`);
  if (result.ruptureResolvedCount > 0) {
    lines.push(`${result.ruptureResolvedCount} Ruptura(s) resolvida(s).`);
    lines.push(`${result.pendingChoiceCount} pendência(s) de Marca/Traço criada(s).`);
  } else {
    lines.push("Nenhuma Ruptura pendente foi resolvida.");
  }
  if (result.integrityZeroCount > 0) {
    lines.push(`${result.integrityZeroCount} personagem(ns) com Integridade zerada — Última Vontade pendente.`);
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
