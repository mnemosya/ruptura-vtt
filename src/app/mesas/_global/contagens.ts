import "server-only";
import { listCampaigns } from "../../../lib/table/storage";
import { listCharactersForNarratorCampaign, listControlledCharacters } from "../../../lib/character/storage";

export interface ContagensDoMenu { campanhas: number; personagens: number }

/**
 * Os números ao lado de "Campanhas" e "Personagens" no menu da área
 * global. Mesma regra das páginas: narrador conta os personagens não
 * arquivados da mesa; jogador, os que controla. Falhou, não mostra
 * número (null) — nunca um zero que não é verdade.
 */
export async function contagensDoMenu(userId: string): Promise<ContagensDoMenu | null> {
  try {
    const campanhas = await listCampaigns();
    const porCampanha = await Promise.all(campanhas.map(async (c) => {
      try {
        return c.owner_id === userId
          ? (await listCharactersForNarratorCampaign(c.id)).filter((p) => !p.archived_at).length
          : (await listControlledCharacters(c.id)).length;
      } catch {
        return 0;
      }
    }));
    return { campanhas: campanhas.length, personagens: porCampanha.reduce((a, b) => a + b, 0) };
  } catch {
    return null;
  }
}
