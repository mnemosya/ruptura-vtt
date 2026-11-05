"use server";

/**
 * Transferência de item entre o BANDO (`campaign_inventory_items`) e a
 * ficha de um personagem — a operação canônica, agora do lado do
 * SERVIDOR.
 *
 * Até aqui essa orquestração só existia dentro de dois componentes de
 * rota `/dev` (`TableClient.tsx`, bando→personagem; e o
 * `CharacterSheetClient.tsx`, personagem→bando). O painel da Mesa é o
 * terceiro consumidor, e copiar a sequência uma terceira vez seria
 * exatamente a duplicação de regra que este trabalho existe pra
 * evitar. As REGRAS DE DOMÍNIO continuam onde sempre estiveram —
 * `splitInventoryInstance` / `addInstanceToInventory` /
 * `removeQuantityFromInventory` em `lib/character/inventory.ts`; aqui
 * ficam a chamada transacional e o log.
 *
 * INSTÂNCIA INTEIRA, nunca cópia rasa: o que atravessa é o objeto
 * `InventoryItemInstance` completo (cargas, munição carregada, Aljava,
 * runas instaladas, estados técnicos, propriedades). Transferência
 * PARCIAL de uma instância com estado individual é RECUSADA pelo
 * próprio `splitInventoryInstance` — nunca "resolvida" achatando o
 * payload.
 *
 * As duas alterações acontecem na RPC `atomic_crew_item_transfer`, na
 * mesma transação e com comparação do snapshot lido. Uma falha reverte
 * ambas; uma alteração concorrente é recusada para evitar perda de itens.
 *
 * AUTORIZAÇÃO: a RPC exige narrador dono para retirar e controlador da
 * ficha ou narrador para depositar. A ficha continua passando por
 * `update_character_sheet_payload`, que revalida o controle.
 */

import { getCharacter } from "../character/storage";
import { getScopedTableClient } from "../auth/scopedClient";
import {
  addInstanceToInventory,
  normalizeCharacter,
  removeQuantityFromInventory,
  splitInventoryInstance,
  type InventoryItemInstance,
} from "../character";
import { addLog } from "./storage";
import { listCrewInventory } from "./crewInventory";

export interface ResultadoTransferencia {
  ok: boolean;
  erro?: string;
  /** Quantidade efetivamente transferida. */
  quantidadeMovida?: number;
  itemNome?: string;
  /** Payload já gravado pela transação, para sincronizar o Console. */
  character?: ReturnType<typeof normalizeCharacter>;
}

/**
 * Bando → personagem. Só o narrador dono pode retirar.
 */
export async function transferCrewItemToCharacter(params: {
  campaignId: string;
  /** `campaign_inventory_items.id` — a LINHA do bando, não o id da instância. */
  rowId: string;
  characterId: string;
  quantidade: number;
}): Promise<ResultadoTransferencia> {
  try {
    const linhas = await listCrewInventory(params.campaignId);
    const linha = linhas.find((l) => l.id === params.rowId);
    if (!linha) return { ok: false, erro: "Este item não está mais no bando." };

    const destinoAntes = await getCharacter(params.characterId);
    if (!destinoAntes) return { ok: false, erro: "Personagem de destino não encontrado." };
    if (destinoAntes.campaign_id !== params.campaignId) {
      return { ok: false, erro: "O personagem de destino não é desta campanha." };
    }

    const agoraIso = new Date().toISOString();
    const split = splitInventoryInstance(linha.payload, params.quantidade, agoraIso);
    if (!split.ok || !split.movedInstance) {
      return { ok: false, erro: split.reason ?? "Transferência não permitida." };
    }
    const movida: InventoryItemInstance = split.movedInstance;

    const destino = normalizeCharacter(destinoAntes.payload);
    const proximo = addInstanceToInventory(destino, movida);
    const client = await getScopedTableClient();
    const { data, error } = await client.rpc("atomic_crew_item_transfer", {
      p_campaign_id: params.campaignId,
      p_character_id: params.characterId,
      p_direction: "crew_to_character",
      p_expected_character: destinoAntes.payload,
      p_next_character: { ...destinoAntes.payload, inventario: proximo.inventario ?? [] },
      p_moved_instance: movida,
      p_crew_row_id: linha.id,
      p_expected_crew: linha.payload,
      p_next_crew: split.sourceRemainder,
    });
    if (error) throw error;
    const salvo = normalizeCharacter((data as { character: unknown }).character);

    try {
      await addLog({
        campaignId: params.campaignId,
        characterId: params.characterId,
        type: "inventory_transfer",
        visibility: "public",
        payload: {
          campaignId: params.campaignId,
          direction: "crew_to_character",
          targetCharacterId: params.characterId,
          targetCharacterName: destinoAntes.name,
          itemInstanceId: movida.id,
          itemName: movida.itemNome,
          itemSlug: movida.itemSlug,
          quantityMoved: movida.quantidade,
          quantityBeforeSource: linha.payload.quantidade,
          quantityAfterSource: split.sourceRemainder?.quantidade ?? 0,
          chargesMoved: movida.cargasAtual ?? null,
          payloadPreserved: true,
          source: "crew_inventory_transfer",
        },
      });
    } catch {
      // O item já mudou de lado; falhar o LOG não pode desfazer nem
      // travar a transferência (mesma decisão de `endRound`/`endScene`).
    }

    return { ok: true, quantidadeMovida: movida.quantidade, itemNome: movida.itemNome, character: salvo };
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : "Falha ao transferir o item do bando." };
  }
}

/**
 * Personagem → bando. O jogador controlador também pode depositar.
 * A RPC usa `update_character_sheet_payload` para narrador e controlador,
 * preservando as validações de ficha já existentes.
 */
export async function transferCharacterItemToCrew(params: {
  campaignId: string;
  characterId: string;
  /** `InventoryItemInstance.id` dentro do inventário do personagem. */
  instanceId: string;
  quantidade: number;
}): Promise<ResultadoTransferencia> {
  try {
    const origemAntes = await getCharacter(params.characterId);
    if (!origemAntes) return { ok: false, erro: "Personagem de origem não encontrado." };
    if (origemAntes.campaign_id !== params.campaignId) {
      return { ok: false, erro: "O personagem de origem não é desta campanha." };
    }

    const origem = normalizeCharacter(origemAntes.payload);
    const instanciaAntes = (origem.inventario ?? []).find((i) => i.id === params.instanceId);
    if (!instanciaAntes) return { ok: false, erro: "Este item não está mais no inventário do personagem." };

    const agoraIso = new Date().toISOString();
    const remocao = removeQuantityFromInventory(origem, params.instanceId, params.quantidade, agoraIso);
    if (!remocao.ok) return { ok: false, erro: remocao.reason };

    const client = await getScopedTableClient();
    const { data, error } = await client.rpc("atomic_crew_item_transfer", {
      p_campaign_id: params.campaignId,
      p_character_id: params.characterId,
      p_direction: "character_to_crew",
      p_expected_character: origemAntes.payload,
      p_next_character: { ...origemAntes.payload, inventario: remocao.character.inventario ?? [] },
      p_moved_instance: remocao.removedInstance,
    });
    if (error) throw error;
    const salvo = normalizeCharacter((data as { character: unknown }).character);

    try {
      await addLog({
        campaignId: params.campaignId,
        characterId: params.characterId,
        type: "inventory_transfer",
        visibility: "public",
        payload: {
          campaignId: params.campaignId,
          direction: "character_to_crew",
          sourceCharacterId: params.characterId,
          sourceCharacterName: origemAntes.name,
          itemInstanceId: remocao.removedInstance.id,
          itemName: remocao.removedInstance.itemNome,
          itemSlug: remocao.removedInstance.itemSlug,
          quantityMoved: remocao.removedInstance.quantidade,
          quantityBeforeSource: instanciaAntes.quantidade,
          quantityAfterSource: remocao.character.inventario?.find((i) => i.id === params.instanceId)?.quantidade ?? 0,
          chargesMoved: remocao.removedInstance.cargasAtual ?? null,
          payloadPreserved: true,
          source: "crew_inventory_transfer",
        },
      });
    } catch {
      // Ver a nota equivalente acima.
    }

    return { ok: true, quantidadeMovida: remocao.removedInstance.quantidade, itemNome: remocao.removedInstance.itemNome, character: salvo };
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : "Falha ao enviar o item ao bando." };
  }
}
