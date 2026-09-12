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
 * só mora a ORDEM SEGURA de gravação e o log.
 *
 * INSTÂNCIA INTEIRA, nunca cópia rasa: o que atravessa é o objeto
 * `InventoryItemInstance` completo (cargas, munição carregada, Aljava,
 * runas instaladas, estados técnicos, propriedades). Transferência
 * PARCIAL de uma instância com estado individual é RECUSADA pelo
 * próprio `splitInventoryInstance` — nunca "resolvida" achatando o
 * payload.
 *
 * ORDEM SEGURA (não há transação cruzando `characters` e
 * `campaign_inventory_items`, tabelas separadas sem função Postgres
 * comum): grava primeiro no DESTINO, só então reduz a ORIGEM. Se o
 * segundo passo falhar, o pior caso é uma duplicata visível e
 * corrigível — nunca uma perda silenciosa do item.
 *
 * AUTORIZAÇÃO: nenhuma ampliada. Retirar do bando exige narrador dono
 * (a RLS da migration 0019 não concede UPDATE/DELETE em
 * `campaign_inventory_items` a jogador, e `updateCharacter` também
 * exige narrador); depositar no bando é aberto a participante ativo
 * (policy `campaign_inventory_items_member_insert`, migration 0038), e
 * a baixa na ficha do jogador passa pela RPC
 * `update_character_sheet_payload`, que revalida controle.
 */

import { getCharacter, updateCharacter, updateCharacterSheetPayload } from "../character/storage";
import {
  addInstanceToInventory,
  computeDerivedStats,
  normalizeCharacter,
  removeQuantityFromInventory,
  splitInventoryInstance,
  type InventoryItemInstance,
} from "../character";
import { getCharacterRules } from "../content";
import type { CharacterRulesPayload } from "../character/types";
import { addLog } from "./storage";
import {
  listCrewInventory,
  removeCrewInventoryItem,
  updateCrewInventoryItemInstance,
  upsertCrewInventoryItem,
} from "./crewInventory";

export interface ResultadoTransferencia {
  ok: boolean;
  erro?: string;
  /** Quanto de fato mudou de lado — pode ser menos que o pedido só quando o pedido foi a stack inteira. */
  quantidadeMovida?: number;
  itemNome?: string;
}

/**
 * Bando → personagem. Só o narrador dono chega até o fim (as duas
 * escritas exigem isso); um jogador recebe o erro de RLS, não uma
 * transferência pela metade.
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
    const regras = ((await getCharacterRules().catch(() => null))?.payload as CharacterRulesPayload | undefined) ?? null;
    const derivados = computeDerivedStats(proximo.atributos, regras, proximo.mana_bonus_ruptura ?? 0);
    const paraSalvar = normalizeCharacter(proximo, derivados);

    // 1) destino primeiro (ordem segura — ver cabeçalho).
    const salvo = await updateCharacter(params.characterId, paraSalvar);

    // 2) só então reduz/remove a origem.
    if (split.sourceRemainder == null) {
      await removeCrewInventoryItem(params.campaignId, linha.id);
    } else {
      await updateCrewInventoryItemInstance(params.campaignId, linha.id, split.sourceRemainder);
    }

    try {
      await addLog({
        campaignId: params.campaignId,
        characterId: salvo.id,
        type: "inventory_transfer",
        visibility: "public",
        payload: {
          campaignId: params.campaignId,
          direction: "crew_to_character",
          targetCharacterId: salvo.id,
          targetCharacterName: salvo.name,
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

    return { ok: true, quantidadeMovida: movida.quantidade, itemNome: movida.itemNome };
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : "Falha ao transferir o item do bando." };
  }
}

/**
 * Personagem → bando. Ordem segura INVERTIDA em relação à de cima
 * (grava no bando primeiro, só então tira da ficha) pelo mesmo
 * princípio: o destino é quem recebe primeiro.
 *
 * `usarCaminhoDoControlador` escolhe por qual porta a ficha é salva:
 * `true` (jogador controlador) usa a RPC restrita por coluna
 * `update_character_sheet_payload`, o ÚNICO caminho de escrita
 * autorizado pra ele; `false` (narrador) usa `updateCharacter`. Nunca
 * o contrário — a RLS de UPDATE direto em `characters` não autoriza
 * controlador desde a migration 0052.
 */
export async function transferCharacterItemToCrew(params: {
  campaignId: string;
  characterId: string;
  /** `InventoryItemInstance.id` dentro do inventário do personagem. */
  instanceId: string;
  quantidade: number;
  usarCaminhoDoControlador: boolean;
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

    // 1) bando primeiro — falhar aqui não tira nada do personagem.
    await upsertCrewInventoryItem(params.campaignId, remocao.removedInstance);

    // 2) só então a baixa na ficha, pelo caminho de escrita do papel.
    const regras = ((await getCharacterRules().catch(() => null))?.payload as CharacterRulesPayload | undefined) ?? null;
    const derivados = computeDerivedStats(remocao.character.atributos, regras, remocao.character.mana_bonus_ruptura ?? 0);
    const paraSalvar = normalizeCharacter(remocao.character, derivados);
    if (params.usarCaminhoDoControlador) {
      await updateCharacterSheetPayload(params.characterId, paraSalvar);
    } else {
      await updateCharacter(params.characterId, paraSalvar);
    }

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

    return { ok: true, quantidadeMovida: remocao.removedInstance.quantidade, itemNome: remocao.removedInstance.itemNome };
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : "Falha ao enviar o item ao bando." };
  }
}
