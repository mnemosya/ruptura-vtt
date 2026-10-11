/**
 * BANCADA DO ESPAÇO DE MUNIÇÃO — montar a carga da cartucheira/aljava.
 *
 * Abastecer o suporte é preparação (fora de combate, sem custo e sem
 * trava de regra). A pessoa diz QUANTO de cada munição quer dentro; esta
 * função faz a transferência:
 *   - para AUMENTAR, puxa do acesso rápido e depois da mochila;
 *   - para DIMINUIR, devolve para a mochila (junta na pilha que já
 *     existir lá, ou cria uma).
 * Capacidade e peso são regra (livro): precisão, escopeta e virote
 * ocupam 2 (`ammoCapacityWeight`); quem aceita o quê é `supportAccepts`.
 * O Abrigo nunca entra.
 */

import type { Character } from "./types";
import type { InventoryItemInstance } from "./inventory";
import type { AmmoItemProfile } from "./ammunition";
import { ammoCapacityWeight, supportAccepts } from "./ammunitionSupport";

export interface LinhaBancada {
  contentSlug: string;
  nome: string;
  /** Capacidade ocupada por unidade (1 ou 2). */
  peso: number;
  dentro: number;
  /** Fora do suporte e ao alcance (acesso rápido + mochila). */
  fora: number;
  /** De onde vem o "fora", para o rótulo da linha. */
  locais: ("acesso_rapido" | "mochila")[];
}

export interface Bancada {
  capacidade: number;
  linhas: LinhaBancada[];
}

type Suporte = NonNullable<InventoryItemInstance["aljava"]>;

export function montarBancada(character: Character, suporteId: string, profiles: AmmoItemProfile[]): Bancada | null {
  const inventario = character.inventario ?? [];
  const suporte = inventario.find((i) => i.id === suporteId)?.aljava as Suporte | undefined;
  if (!suporte) return null;
  const linhas = new Map<string, LinhaBancada>();
  const linha = (slug: string, nome: string) => {
    let l = linhas.get(slug);
    if (!l) {
      const perfil = profiles.find((p) => p.slug === slug);
      l = { contentSlug: slug, nome: perfil?.nome ?? nome, peso: ammoCapacityWeight(perfil?.familia ?? null), dentro: 0, fora: 0, locais: [] };
      linhas.set(slug, l);
    }
    return l;
  };
  for (const s of suporte.stacks) linha(s.contentSlug, s.nome).dentro += s.quantidade;
  for (const i of inventario) {
    if (i.id === suporteId || (i.estado !== "acesso_rapido" && i.estado !== "mochila") || i.quantidade <= 0) continue;
    const perfil = profiles.find((p) => p.slug === i.itemSlug);
    if (!perfil || !supportAccepts(suporte, perfil.familia)) continue;
    const l = linha(i.itemSlug, i.itemNome);
    l.fora += i.quantidade;
    if (!l.locais.includes(i.estado)) l.locais.push(i.estado);
  }
  return {
    capacidade: suporte.capacidade,
    linhas: [...linhas.values()].sort((a, b) => b.dentro - a.dentro || a.nome.localeCompare(b.nome, "pt-BR")),
  };
}

export function ocupacao(linhas: Pick<LinhaBancada, "peso">[], quantidades: number[]): number {
  return linhas.reduce((t, l, i) => t + l.peso * (quantidades[i] ?? 0), 0);
}

/**
 * Leva o suporte à composição pedida (`alvo[slug] = quantidade dentro`).
 * Devolve `null` se a composição não cabe ou pede mais do que existe.
 */
export function aplicarBancada(character: Character, suporteId: string, alvo: Record<string, number>, profiles: AmmoItemProfile[]): Character | null {
  const bancada = montarBancada(character, suporteId, profiles);
  if (!bancada) return null;
  const quantidades = bancada.linhas.map((l) => Math.max(0, Math.trunc(alvo[l.contentSlug] ?? l.dentro)));
  if (ocupacao(bancada.linhas, quantidades) > bancada.capacidade) return null;
  if (bancada.linhas.some((l, i) => quantidades[i] > l.dentro + l.fora)) return null;

  let inventario = (character.inventario ?? []).map((i) => ({ ...i }));
  const suporte = inventario.find((i) => i.id === suporteId)!;
  const stacks = (suporte.aljava as Suporte).stacks.map((s) => ({ ...s }));

  bancada.linhas.forEach((l, idx) => {
    const delta = quantidades[idx] - l.dentro;
    if (delta === 0) return;
    if (delta > 0) {
      // Puxa do acesso rápido primeiro (é o que está mais à mão), depois da mochila.
      let falta = delta;
      for (const estado of ["acesso_rapido", "mochila"] as const) {
        for (const i of inventario) {
          if (falta <= 0) break;
          if (i.id === suporteId || i.estado !== estado || i.itemSlug !== l.contentSlug) continue;
          const tira = Math.min(falta, i.quantidade);
          i.quantidade -= tira;
          falta -= tira;
        }
      }
    } else {
      const volta = -delta;
      const naMochila = inventario.find((i) => i.estado === "mochila" && i.itemSlug === l.contentSlug && i.id !== suporteId);
      if (naMochila) naMochila.quantidade += volta;
      else inventario.push({ id: crypto.randomUUID(), itemSlug: l.contentSlug, itemNome: l.nome, categoria: "municao", quantidade: volta, estado: "mochila" } as InventoryItemInstance);
    }
    const s = stacks.find((x) => x.contentSlug === l.contentSlug);
    if (s) { s.quantidade = quantidades[idx]; s.pesoCapacidade = l.peso; }
    else stacks.push({ contentSlug: l.contentSlug, nome: l.nome, quantidade: quantidades[idx], pesoCapacidade: l.peso });
  });

  inventario = inventario
    .map((i) => (i.id === suporteId ? { ...i, aljava: { ...(i.aljava as Suporte), stacks: stacks.filter((s) => s.quantidade > 0) } } : i))
    .filter((i) => i.quantidade > 0);
  return { ...character, inventario };
}
