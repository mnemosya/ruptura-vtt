"use server";

/**
 * Aba Bando do painel — o inventário REAL da campanha
 * (`campaign_inventory_items`, migration 0019/0038), lido por
 * `listCrewInventory` e transferido pela operação canônica de
 * `lib/table/crewTransfer.ts`.
 *
 * Nada de "Aretz do bando", "créditos de favor", "contato" ou
 * "veículo": aqueles quatro itens do painel antigo eram texto de
 * demonstração de recursos que NÃO existem no modelo. O modelo real é
 * inventário de instâncias de item, e é isso que esta aba mostra.
 *
 * A leitura devolve só o que a linha precisa desenhar (nome, slug,
 * categoria, quantidade, resumo técnico), MAS o payload completo da
 * instância viaja junto no detalhe — o cartão de detalhe mostra
 * cargas/munição/runas sem uma segunda ida ao servidor, e a
 * transferência sempre trabalha com a instância inteira do lado de lá.
 */

import { listCrewInventory, removeCrewInventoryItem, type CrewInventoryItem } from "../../../../../../lib/table/crewInventory";
import { transferCrewItemToCharacter } from "../../../../../../lib/table/crewTransfer";
import { exigirAcessoPainel, exigirNarradorPainel, mensagemDeErro, type ResultadoPainel } from "./comum";

export interface ItemBandoPainel {
  /** `campaign_inventory_items.id` — a linha, o que as mutações endereçam. */
  id: string;
  nome: string;
  slug: string | null;
  categoria: string | null;
  subtipo: string | null;
  quantidade: number;
  /** Instância inteira — cargas, munição carregada, runas, estados técnicos. Nunca achatada. */
  payload: CrewInventoryItem["payload"];
}

export interface BandoPainel {
  itens: ItemBandoPainel[];
  /** `true` só para o narrador dono: retirar e transferir exigem isso (RLS da 0019). */
  podeAdministrar: boolean;
}

export async function lerBandoPainelAction(campaignId: string): Promise<ResultadoPainel<BandoPainel>> {
  const v = await exigirAcessoPainel(campaignId);
  if (!v.ok) return { ok: false, erro: v.erro };
  try {
    const linhas = await listCrewInventory(campaignId);
    return {
      ok: true,
      dados: {
        podeAdministrar: v.acesso.role === "narrator",
        itens: linhas.map((l) => ({
          id: l.id,
          nome: l.itemName ?? l.payload?.itemNome ?? "(item sem nome)",
          slug: l.itemSlug ?? l.payload?.itemSlug ?? null,
          categoria: l.payload?.categoria ?? null,
          subtipo: l.payload?.subtipo ?? null,
          quantidade: l.quantity ?? l.payload?.quantidade ?? 1,
          payload: l.payload,
        })),
      },
    };
  } catch (e) {
    return { ok: false, erro: mensagemDeErro(e, "Falha ao carregar o inventário do bando.") };
  }
}

/** Retirada destrutiva de uma linha inteira — narrador; a interface confirma antes de chamar. */
export async function removerItemBandoAction(campaignId: string, rowId: string): Promise<ResultadoPainel> {
  const v = await exigirNarradorPainel(campaignId);
  if (!v.ok) return { ok: false, erro: v.erro };
  try {
    await removeCrewInventoryItem(campaignId, rowId);
    return { ok: true };
  } catch (e) {
    return { ok: false, erro: mensagemDeErro(e, "Falha ao remover o item do bando.") };
  }
}

/**
 * Bando → personagem, pela operação canônica. Toda a mecânica
 * (divisão de stack, preservação de cargas/munição, ordem segura de
 * gravação, log) vive em `crewTransfer.ts`; aqui só a checagem de
 * papel, que dá um erro cedo e legível antes do erro de RLS.
 */
export async function transferirItemBandoAction(params: {
  campaignId: string;
  rowId: string;
  characterId: string;
  quantidade: number;
}): Promise<ResultadoPainel<{ quantidadeMovida: number; itemNome: string }>> {
  const v = await exigirNarradorPainel(params.campaignId);
  if (!v.ok) return { ok: false, erro: v.erro };
  const r = await transferCrewItemToCharacter(params);
  if (!r.ok) return { ok: false, erro: r.erro ?? "Transferência recusada." };
  return { ok: true, dados: { quantidadeMovida: r.quantidadeMovida ?? 0, itemNome: r.itemNome ?? "" } };
}
