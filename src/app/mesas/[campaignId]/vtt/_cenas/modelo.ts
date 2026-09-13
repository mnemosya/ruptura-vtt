/**
 * A CENA QUE O NARRADOR ESTÁ OLHANDO — e só ele.
 *
 * A Fase 1 separou três coisas que `vtt_scenes.ativa` respondia
 * sozinha: a cena que existe, a cena apresentada à mesa
 * (`vtt_campaign_stage`) e a cena aberta por quem prepara. As duas
 * primeiras são do banco porque valem pra mesa inteira. A terceira é
 * daqui, e é LOCAL de propósito.
 *
 * Por que `localStorage` e não uma tabela: "onde eu estava mexendo" é
 * preferência de tela, não fato da campanha. Gravar no banco custaria
 * uma escrita por clique de cartão e um round-trip no caminho de
 * abertura da mesa, para persistir algo que ninguém mais consulta.
 * Quando continuar na mesma cena entre computadores virar requisito,
 * `vtt_user_scene_state` entra sem mexer em nada aqui: este módulo já
 * é o único lugar que sabe onde a resposta mora.
 *
 * O JOGADOR nunca passa por aqui. A cena dele é `presented_scene_id`,
 * decidida no servidor — se ela viesse do storage do navegador, uma
 * aba velha manteria o jogador numa cena da qual o narrador já o tirou.
 */

/** Uma chave por campanha: quem joga em duas mesas tem duas memórias. */
export function chaveCenaVista(campaignId: string): string {
  return `ruptura:vtt:last-scene:${campaignId}`;
}

/**
 * A última cena que este narrador abriu nesta campanha, se houver.
 *
 * Devolve `null` e nunca lança: storage desabilitado, cheio ou em
 * navegação privativa é caso NORMAL, e nenhum deles é motivo pra
 * impedir a mesa de abrir — sem a memória, cai na cena apresentada,
 * que é o comportamento que existia antes desta fase.
 */
export function lerCenaVista(campaignId: string): string | null {
  try {
    const bruto = window.localStorage.getItem(chaveCenaVista(campaignId));
    return bruto && bruto.length > 0 ? bruto : null;
  } catch {
    return null;
  }
}

/**
 * Lembra a cena aberta.
 *
 * O id gravado NÃO é autoridade nenhuma: na próxima abertura ele passa
 * por `lerCenaAction`, que responde `null` se a cena foi excluída,
 * arquivada ou nunca foi de quem pede. Guardar aqui é um atalho, e
 * todo atalho é conferido no servidor antes de valer.
 */
export function gravarCenaVista(campaignId: string, sceneId: string): void {
  try {
    window.localStorage.setItem(chaveCenaVista(campaignId), sceneId);
  } catch {
    /* sem memória a mesa continua abrindo — na cena apresentada */
  }
}

/** Esquece a cena lembrada (ela sumiu, ou o servidor recusou). */
export function esquecerCenaVista(campaignId: string): void {
  try {
    window.localStorage.removeItem(chaveCenaVista(campaignId));
  } catch {
    /* idem */
  }
}
