"use server";

/**
 * Recarga client-side de `CampaignSessionViewer.controlledCharacterIds`
 * — separada de `session.ts` porque aquele usa `cache()` (memoização
 * por request), sem semântica útil quando chamado via RPC do client, e
 * porque manter os Server Actions de verdade num arquivo `"use server"`
 * dedicado, com só funções `async` simples, segue o mesmo formato de
 * todo outro Server Action deste projeto (`table/storage.ts`,
 * `character/storage.ts`) — sem ambiguidade sobre o que o transform do
 * Next reconhece como action exportável.
 *
 * Gatilhos previstos (`CampaignRealtimeProvider`): a janela recuperando
 * o foco, e um botão manual — não há Realtime em `character_controllers`
 * hoje, então um narrador atribuindo/removendo controle de personagem
 * enquanto o jogador está com a campanha aberta só reflete quando um
 * desses dois dispara isto.
 *
 * Usa a variante ESTRITA (`fetchControlledCharacterIdsStrict`), não a
 * tolerante que a leitura SSR usa — deixa o erro propagar até
 * `reloadViewer()`, que preserva `controlledCharacterIds` antigo e
 * mostra o erro, em vez de "ter sucesso" com uma lista vazia.
 */

import { fetchControlledCharacterIdsStrict } from "./session";
import { getCurrentUser } from "../auth/session";
import { getScopedTableClient } from "../auth/scopedClient";
import { resolveCampaignAccess } from "./access";

export async function reloadControlledCharacterIds(campaignId: string): Promise<string[]> {
  return fetchControlledCharacterIdsStrict(campaignId);
}

/**
 * Permissão da conta logada sobre UM personagem — decide se a ficha
 * abre editável ou só para leitura (migration 0151).
 *
 * `"editar"` para o narrador dono da campanha e para o dono de
 * personagem solto; para jogador, o que estiver em
 * `character_controllers`. `null` quando não há leitura possível (a
 * própria ficha não carregaria). É só ergonomia: quem barra a escrita
 * de verdade é `update_character_sheet_payload`, que exige "editar".
 */
export async function lerPermissaoNaFicha(characterId: string): Promise<"editar" | "visualizar" | null> {
  const user = await getCurrentUser();
  if (!user) return null;
  const client = await getScopedTableClient();
  const { data: personagem } = await client.from("characters").select("campaign_id").eq("id", characterId).maybeSingle();
  if (!personagem) return null;
  const campaignId = (personagem as { campaign_id: string | null }).campaign_id;
  if (!campaignId) return "editar";
  const acesso = await resolveCampaignAccess(campaignId);
  if (acesso.kind === "ok" && acesso.role === "narrator") return "editar";
  const { data: linha } = await client
    .from("character_controllers")
    .select("permissao")
    .eq("character_id", characterId)
    .eq("user_id", user.id)
    .maybeSingle();
  const permissao = (linha as { permissao?: string } | null)?.permissao;
  return permissao === "editar" || permissao === "visualizar" ? permissao : null;
}
