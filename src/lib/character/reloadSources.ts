/**
 * FONTES DE RECARGA — de onde uma arma de carregador pode puxar munição.
 *
 * Regra (livro): a recarga sai de UMA fonte só, e o custo depende de
 * onde a munição está:
 *   - espaço de munição (cartucheira/aljava equipada) → 1 PA
 *   - acesso rápido                                   → 1 PA
 *   - mochila                                         → 2 PA
 * O Abrigo nunca é estoque de combate.
 *
 * `listarFontesRecarga` devolve cada pilha compatível como uma opção;
 * `recarregarDaFonte` move munição de UMA delas até encher a arma (ou
 * acabar a pilha). A arma pode guardar uma fonte PADRÃO
 * (`fonteRecargaPadrao`), que a interface usa para recarregar direto.
 *
 * Células de energia trocam a célula inteira e seguem o fluxo próprio
 * de `reloadFromInventory` — não passam por aqui.
 */

import type { Character } from "./types";
import type { InventoryItemInstance, ItemContent } from "./inventory";
import type { AmmoItemProfile, ReloadResult } from "./ammunition";

export type LocalFonteRecarga = "suporte" | "acesso_rapido" | "mochila";

export interface FonteRecarga {
  /** Chave estável da opção: `suporte:<idDoSuporte>:<slug>` ou `<local>:<idDaInstancia>`. */
  id: string;
  local: LocalFonteRecarga;
  /** Instância de onde a munição sai (o suporte, no caso do espaço de munição). */
  instanceId: string;
  contentSlug: string;
  nome: string;
  quantidade: number;
  custoPa: 1 | 2;
}

/** O que a arma guarda como fonte padrão: o TIPO de munição e o LUGAR, não uma instância (que muda). */
export interface FontePadrao {
  local: LocalFonteRecarga;
  contentSlug: string;
}

type ArmaDeCarregador = Pick<ItemContent, "slug"> & { municaoMax?: number | null; municaoCompativelSlug?: string | null };

function compativel(arma: ArmaDeCarregador, profiles: AmmoItemProfile[], slug: string): boolean {
  const familia = arma.municaoCompativelSlug;
  return profiles.some((p) => p.slug === slug && (p.familia === familia || p.armasCompativeis.includes(arma.slug)));
}

export function ehCelulaDeEnergia(arma: ArmaDeCarregador): boolean {
  return !!arma.municaoCompativelSlug?.startsWith("celula_energia");
}

export function listarFontesRecarga(
  character: Character,
  armaInstanceId: string,
  arma: ArmaDeCarregador,
  profiles: AmmoItemProfile[],
): FonteRecarga[] {
  const inventario = character.inventario ?? [];
  if (!arma.municaoMax || ehCelulaDeEnergia(arma)) return [];
  const nomeDe = (slug: string, fallback: string) => profiles.find((p) => p.slug === slug)?.nome ?? fallback;
  const fontes: FonteRecarga[] = [];

  for (const suporte of inventario) {
    if (suporte.estado !== "equipado" || !suporte.aljava) continue;
    for (const stack of suporte.aljava.stacks) {
      if (stack.quantidade <= 0 || !compativel(arma, profiles, stack.contentSlug)) continue;
      fontes.push({
        id: `suporte:${suporte.id}:${stack.contentSlug}`, local: "suporte", instanceId: suporte.id,
        contentSlug: stack.contentSlug, nome: nomeDe(stack.contentSlug, stack.nome), quantidade: stack.quantidade, custoPa: 1,
      });
    }
  }
  for (const inst of inventario) {
    if (inst.id === armaInstanceId || inst.quantidade <= 0) continue;
    if (inst.estado !== "acesso_rapido" && inst.estado !== "mochila") continue;
    if (!compativel(arma, profiles, inst.itemSlug)) continue;
    fontes.push({
      id: `${inst.estado}:${inst.id}`, local: inst.estado, instanceId: inst.id,
      contentSlug: inst.itemSlug, nome: nomeDe(inst.itemSlug, inst.itemNome), quantidade: inst.quantidade,
      custoPa: inst.estado === "mochila" ? 2 : 1,
    });
  }
  // Mais barata primeiro; no empate, a de mais munição.
  return fontes.sort((a, b) => a.custoPa - b.custoPa || b.quantidade - a.quantidade);
}

/** A fonte que corresponde ao padrão gravado na arma — `null` se ele não existe mais. */
export function fonteDoPadrao(fontes: FonteRecarga[], padrao: FontePadrao | undefined | null): FonteRecarga | null {
  if (!padrao) return null;
  return fontes.find((f) => f.local === padrao.local && f.contentSlug === padrao.contentSlug) ?? null;
}

export function recarregarDaFonte(
  character: Character,
  armaInstanceId: string,
  arma: ArmaDeCarregador,
  fonte: FonteRecarga,
): ReloadResult {
  const inventario = character.inventario ?? [];
  const instancia = inventario.find((i) => i.id === armaInstanceId);
  if (!instancia || !arma.municaoMax) return { character, carregada: 0, motivoFalha: "modo_nao_suportado" };
  const antes = instancia.municaoAtual ?? 0;
  const falta = arma.municaoMax - antes;
  if (falta <= 0) return { character, carregada: 0, motivoFalha: "ja_cheio" };

  let movida = 0;
  const proximo: InventoryItemInstance[] = inventario.map((i) => {
    if (fonte.local === "suporte" && i.id === fonte.instanceId && i.aljava) {
      const stacks = i.aljava.stacks.map((s) => {
        if (s.contentSlug !== fonte.contentSlug || movida > 0) return s;
        movida = Math.min(falta, s.quantidade);
        return { ...s, quantidade: s.quantidade - movida };
      }).filter((s) => s.quantidade > 0);
      return { ...i, aljava: { ...i.aljava, stacks } };
    }
    if (fonte.local !== "suporte" && i.id === fonte.instanceId) {
      movida = Math.min(falta, i.quantidade);
      return { ...i, quantidade: i.quantidade - movida };
    }
    return i;
  });
  if (movida <= 0) return { character, carregada: 0, motivoFalha: "sem_estoque" };

  const final = proximo
    .filter((i) => i.quantidade > 0)
    .map((i) => (i.id === armaInstanceId ? { ...i, municaoAtual: antes + movida, municaoCarregadaSlug: fonte.contentSlug } : i));
  return { character: { ...character, inventario: final }, carregada: movida, motivoFalha: null, custoPa: fonte.custoPa };
}
