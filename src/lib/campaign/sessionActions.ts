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

export async function reloadControlledCharacterIds(campaignId: string): Promise<string[]> {
  return fetchControlledCharacterIdsStrict(campaignId);
}
