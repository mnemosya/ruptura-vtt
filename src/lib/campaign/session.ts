/**
 * Identidade do espectador DENTRO de uma campanha — quem é a conta
 * logada e quais personagens dela participam da sessão agora.
 *
 * Separado de `access.ts` de propósito: aquele responde "esta conta
 * pode entrar, e como qual papel?"; este responde "o que esta conta
 * controla aqui dentro?". O primeiro é autorização e decide se a rota
 * abre; o segundo é dado de sessão e só alimenta apresentação — a
 * trilha de turnos ("é a minha vez?", "encerrar meu turno") e a Mesa do
 * jogador ("meus personagens").
 *
 * SEM `"use server"` de propósito — este módulo só é chamado de dentro
 * de Server Components (`layout.tsx`), e `resolveCampaignSessionViewer`
 * usa `cache()` (memoização por request), que não tem semântica
 * definida quando invocado como Server Action via RPC do client (cada
 * chamada RPC é seu próprio request, então a memoização não faria
 * nada). A recarga client-side (`reloadControlledCharacterIds`) mora
 * num arquivo IRMÃO, `sessionActions.ts` — esse sim marcado
 * `"use server"`, exportando só uma função `async` simples, no mesmo
 * formato que todo outro Server Action deste projeto usa (evita
 * qualquer ambiguidade sobre se um export `cache(async function...)`
 * é reconhecido pelo transform de Server Actions do Next).
 */

import { cache } from "react";
import { listControlledCharacters } from "../character/storage";

/**
 * Núcleo SEM tratamento de erro — propaga qualquer falha de leitura pra
 * quem chama decidir o que fazer. Duas formas de lidar com isso, nunca
 * uma só:
 *
 *   - SSR (`resolveCampaignSessionViewer`, abaixo): TOLERANTE — degrada
 *     pra "não controla ninguém" (ver o porquê no comentário daquela
 *     função). Falha aqui não pode derrubar a casca inteira, e não há
 *     como oferecer retry antes da primeira pintura.
 *   - Recarga client-side (`reloadControlledCharacterIds`,
 *     `sessionActions.ts`): ESTRITA — deixa o erro subir. Achado real
 *     numa auditoria: as duas leituras compartilhavam esta função
 *     TOLERANTE, então uma falha de rede na recarga (não na leitura
 *     inicial) fazia `reloadViewer()` "ter sucesso" com `[]` — apagando
 *     personagens controlados de verdade e limpando qualquer erro
 *     anterior, em vez de preservar o estado antigo e mostrar o erro
 *     real (o mesmo padrão que todo outro `reload*` do provider segue).
 */
export async function fetchControlledCharacterIdsStrict(campaignId: string): Promise<string[]> {
  const controlados = await listControlledCharacters(campaignId);
  return controlados.filter((c) => !c.archived_at).map((c) => c.id);
}

/** Variante TOLERANTE — só para a leitura SSR inicial. Ver `fetchControlledCharacterIdsStrict`. */
export async function fetchControlledCharacterIds(campaignId: string): Promise<string[]> {
  try {
    return await fetchControlledCharacterIdsStrict(campaignId);
  } catch {
    return [];
  }
}

export interface CampaignSessionViewer {
  userId: string;
  /**
   * Personagens que esta conta controla NESTA campanha e que estão
   * ativos. Quatro garantias, todas verificadas contra
   * `listControlledCharacters` (src/lib/character/storage.ts):
   *
   *   1. Da campanha certa — a busca filtra `character_controllers` por
   *      `campaign_id`.
   *   2. Não arquivados — filtrado AQUI, não lá.
   *      `listControlledCharacters` devolve arquivados junto (cada
   *      chamador filtra por conta própria hoje, ver
   *      `personagens/page.tsx`); sem este filtro, um personagem
   *      arquivado entraria em "meus personagens" e no cálculo de "é a
   *      minha vez".
   *   3. Controlados por esta conta — a busca filtra por `user_id` da
   *      sessão, nunca por um id vindo do cliente.
   *   4. Autorizados — passa pelo cliente com RLS
   *      (`getScopedTableClient`) e pelas policies de
   *      `character_controllers`; nenhuma consulta privilegiada nova.
   */
  controlledCharacterIds: string[];
}

/**
 * Resolve o espectador da sessão.
 *
 * Recebe o `userId` já resolvido em vez de chamar `getCurrentUser()` de
 * novo: quem chama isto (o layout da campanha) acabou de rodar
 * `resolveCampaignAccess`, que já pagou essa ida ao Supabase Auth.
 * `getCurrentUser` não é memoizado, então re-chamá-lo aqui custaria uma
 * segunda validação de token por request. Dois argumentos `string`
 * também deixam o `cache()` funcionar de verdade — memoizar por um
 * objeto de usuário falharia, porque a chave seria a identidade do
 * objeto.
 *
 * Falha de leitura dos controles NÃO derruba a casca da campanha:
 * degrada para "não controla ninguém", que é o estado seguro — o dock
 * de turno fica só em leitura e nunca oferece "encerrar turno" por
 * engano. O oposto (assumir controle que não se confirmou) ofereceria
 * uma ação que o servidor recusaria depois.
 */
export const resolveCampaignSessionViewer = cache(async function resolveCampaignSessionViewer(
  campaignId: string,
  userId: string,
): Promise<CampaignSessionViewer> {
  return { userId, controlledCharacterIds: await fetchControlledCharacterIds(campaignId) };
});
