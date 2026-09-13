/**
 * Apagar uma campanha de teste, na ORDEM que o banco aceita.
 *
 * ── Por que uma ordem, e por que compartilhada ───────────────────────
 *
 * Um inventário encontrou dezenas de campanhas de teste vivas em
 * produção. Nenhum script estava "esquecendo" de limpar: todos
 * limpavam, na ordem que fazia sentido no dia em que foram escritos, e
 * o schema mudou por baixo. Duas chaves estrangeiras, em particular,
 * recusam a exclusão em vez de cascatear:
 *
 *   `vtt_campaign_stage.presented_scene_id` → `on delete no action`
 *       (0111, deliberado). Apagar a CENA com uma linha de palco
 *       apontando para ela é recusado. O palco sai antes.
 *
 *   `vtt_scene_images.image_id` → `on delete restrict` (0100). Apagar
 *       o ARQUIVO com uma colocação apontando para ele é recusado. A
 *       colocação sai antes.
 *
 * Somadas a `character_controllers`, que segura personagem e campanha,
 * dão três jeitos de a limpeza falhar — e falhava em silêncio, porque
 * ninguém conferia o erro de um `delete`.
 *
 * Uma ordem só, num lugar só, é o que impede que o próximo schema
 * quebre sete limpezas diferentes sem ninguém notar.
 *
 * ── O que ele NÃO faz ────────────────────────────────────────────────
 *
 * Não engole erro. Devolve a lista do que não saiu, para quem chamou
 * transformar em critério. Uma limpeza silenciosa é indistinguível de
 * uma limpeza que parou de funcionar.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Filhos antes dos pais. `vtt_scene_images` antes de
 * `vtt_image_assets`; `vtt_campaign_stage` antes de `vtt_scenes`;
 * `character_controllers` antes de `characters`.
 */
const POR_CAMPANHA = [
  "table_logs",
  "vtt_measurements",
  "vtt_marks",
  "vtt_areas",
  "vtt_objects",
  "vtt_turn_tracks",
  "vtt_terrain",
  "vtt_tokens",
  "vtt_scene_images",
  "vtt_image_upload_reservations",
  "vtt_image_assets",
  "vtt_campaign_storage_usage",
  "vtt_player_scene_assignments",
  "vtt_campaign_stage",
  "vtt_scenes",
  "vtt_scene_folders",
  "character_controllers",
  "characters",
  "campaign_members",
];

/**
 * Tabela que não existe neste schema não é resíduo — é uma tabela que
 * não existe. O check não deve falhar por causa disso.
 */
function tabelaAusente(mensagem: string): boolean {
  return /does not exist|schema cache|Could not find the table/i.test(mensagem);
}

export interface ResultadoLimpeza {
  /** O que NÃO saiu, com a razão. Vazio = limpou tudo. */
  restos: string[];
  campanhas: number;
  contas: number;
}

/**
 * Apaga as campanhas e as contas indicadas. Devolve o que sobrou em vez
 * de lançar: a limpeza roda num `finally`, e lançar ali esconderia a
 * falha original do teste.
 */
export async function limparCampanhasDeTeste(
  admin: SupabaseClient,
  ids: { campanhas: string[]; usuarios?: string[] },
): Promise<ResultadoLimpeza> {
  const restos: string[] = [];

  for (const campaignId of ids.campanhas) {
    for (const tabela of POR_CAMPANHA) {
      const { error } = await admin.from(tabela).delete().eq("campaign_id", campaignId);
      if (error && !tabelaAusente(error.message)) {
        restos.push(`${tabela} (${campaignId.slice(0, 8)}): ${error.message}`);
      }
    }
    const { error } = await admin.from("campaigns").delete().eq("id", campaignId);
    if (error) restos.push(`campaigns (${campaignId.slice(0, 8)}): ${error.message}`);
  }

  for (const userId of ids.usuarios ?? []) {
    const { error } = await admin.auth.admin.deleteUser(userId);
    // Conta já removida por outra passada não é resto.
    if (error && !/not found/i.test(error.message)) {
      restos.push(`usuário ${userId.slice(0, 8)}: ${error.message}`);
    }
  }

  return { restos, campanhas: ids.campanhas.length, contas: (ids.usuarios ?? []).length };
}
