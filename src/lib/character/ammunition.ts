/**
 * Normalização e helpers puros de munição — checkpoint v0.59 (PRD
 * 13.4.1). Classifica armas e munições a partir do catálogo real
 * (`content_documents`, categoria "arma" e "municao"), sem hardcoding
 * de listas nem inventar capacidades ausentes.
 *
 * Auditoria do DB (db_equipamentos_normalizado_v1_2.json) — ANTES:
 *   - Armas de fogo (subtipo "fogo"): 100% têm `municao_max` (número)
 *     e `municao_compativel` (slug de família, ex.: "mun_pistola").
 *     Modo: "carregador".
 *   - Arcos (subtipo "arremesso_disparo", municao_compativel =
 *     "flecha_simples"): `municao_max: 1` representa "1 flecha por
 *     vez" — mas flechas ficam em aljava separada (PRD 13.4.1).
 *     Modo: "aljava". Aljava é estrutura especial na instância; não
 *     existe modelo de item no catálogo.
 *   - Bestas (subtipo "arremesso_disparo", municao_compativel =
 *     "virotes"): `municao_max: 1`, armazenam 1 virote por vez.
 *     Modo: "virote".
 *   - Dardos/shurikens: sem `municao_max` → não usam munição neste
 *     modelo. `inclui_na_compra` é texto livre, ignorado.
 *   - Munições (categoria "municao"): `estatisticas.kit` é string
 *     ("12 flechas") — parseia o primeiro inteiro. `compatibilidade.
 *     familia` identifica o tipo; `compatibilidade.itens` lista slugs
 *     compatíveis.
 *   - Discrepância PRD vs. DB: PRD diz kit 10/5 flechas; DB diz "12
 *     flechas". DB é fonte de verdade aqui — a divergência é editorial
 *     e deve ser corrigida no catálogo, não no código.
 *
 * Fallbacks defensivos documentados:
 *   - `kit` string sem número → kitQuantidade: null.
 *   - `municao_compativel` ausente → tiposMunicaoAceitos: [].
 *   - Aljava não existe como item do catálogo → instanciada na compra
 *     com capacidade padrão 15 + 10 flechas simples (PRD 13.4.1).
 *   - Rajada/Dispersão/múltiplos tiros → fora de escopo.
 */

import type { Character } from "./types";
import type { ItemContent, InventoryItemInstance } from "./inventory";

// ---------------------------------------------------------------------
// Tipos de modo de munição
// ---------------------------------------------------------------------

export type AmmoMode = "carregador" | "aljava" | "virote";

/**
 * Perfil de munição de uma arma, derivado do modelo (ItemContent).
 * Null em cada campo = dado ausente no catálogo, nunca inventado.
 */
export interface WeaponAmmoProfile {
  usaMunicao: boolean;
  modoMunicao: AmmoMode | null;
  municaoMax: number | null;
  /** Slug da família de munição compatível (ex.: "mun_pistola", "flecha_simples", "virotes"). */
  municaoCompativelSlug: string | null;
}

/**
 * Perfil de um item de munição (categoria "municao").
 */
export interface AmmoItemProfile {
  slug: string;
  nome: string;
  /** Família canônica lida de `compatibilidade.familia`. */
  familia: string | null;
  /** Slugs de armas compatíveis lidos de `compatibilidade.itens`. */
  armasCompativeis: string[];
  /** Número parsado do string `kit` ("12 flechas" → 12). Null se ausente/inválido. */
  kitQuantidade: number | null;
}

/**
 * Stack de flechas dentro de uma aljava — agrupadas por tipo.
 */
export interface AljavaStack {
  /** slug do item de munição no catálogo. */
  contentSlug: string;
  /** Nome exibível. */
  nome: string;
  quantidade: number;
}

/**
 * Aljava: instância especial para arcos. Não existe como item do catálogo —
 * é estrutura criada na compra do arco e guardada na instância da arma.
 */
export interface Aljava {
  /** Capacidade total de flechas (padrão: 15, conforme PRD 13.4.1). */
  capacidade: number;
  stacks: AljavaStack[];
}

// ---------------------------------------------------------------------
// Extensão dos campos de instância de arma com munição
// (adicionados opcionalmente a InventoryItemInstance via merge de tipos)
// ---------------------------------------------------------------------

export interface WeaponAmmoInstanceFields {
  /**
   * Munição atual no carregador/câmara da arma.
   * Ausente = arma sem munição ou nunca inicializada (fallback defensivo).
   * Para arcos, a munição fica na aljava (`aljava`), não aqui.
   */
  municaoAtual?: number;
  /**
   * Aljava associada a este arco. Ausente em armas que não são arcos
   * ou em instâncias antigas.
   */
  aljava?: Aljava;
}

// ---------------------------------------------------------------------
// Helpers de normalização — puramente a partir do modelo (ItemContent)
// ---------------------------------------------------------------------

function asRecord(v: unknown): Record<string, unknown> | null {
  return typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

/** Extrai o primeiro inteiro de uma string como "12 flechas" → 12. */
export function parseKitQuantidade(raw: unknown): number | null {
  if (typeof raw !== "string") return null;
  const match = raw.match(/\d+/);
  if (!match) return null;
  const n = parseInt(match[0], 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Determina o modo de munição a partir dos campos do modelo bruto.
 * Arcos: compatível com família "flechas" (slug "flecha_simples" ou
 * similar que não seja "virotes"). Bestas: compatível com "virotes".
 */
export function deriveModoMunicao(
  subtipo: string | undefined,
  municaoMax: number | null,
  municaoCompativelSlug: string | null,
): AmmoMode | null {
  if (municaoMax === null) return null;
  if (!municaoCompativelSlug) return "carregador";
  if (municaoCompativelSlug === "virotes") return "virote";
  if (municaoCompativelSlug === "flecha_simples") return "aljava";
  // armas de fogo e outras com carregador
  return "carregador";
}

/** Derivar perfil de munição de uma arma a partir do ItemContent normalizado. */
export function getWeaponAmmoProfile(item: Pick<ItemContent, "slug" | "subtipo" | "usesAmmunition"> & { municaoMax?: number | null; municaoCompativelSlug?: string | null }): WeaponAmmoProfile {
  if (!item.usesAmmunition) {
    return { usaMunicao: false, modoMunicao: null, municaoMax: null, municaoCompativelSlug: null };
  }
  const municaoMax = item.municaoMax ?? null;
  const municaoCompativelSlug = item.municaoCompativelSlug ?? null;
  const modoMunicao = deriveModoMunicao(item.subtipo, municaoMax, municaoCompativelSlug);
  return { usaMunicao: true, modoMunicao, municaoMax, municaoCompativelSlug };
}

/**
 * Derivar perfil de item de munição a partir do payload bruto.
 * Nunca inventa campos ausentes.
 */
export function normalizeAmmoItemProfile(raw: Record<string, unknown>): AmmoItemProfile {
  const slug = String(raw.slug ?? raw.id ?? "");
  const nome = String(raw.nome ?? slug ?? "Munição");
  const estatisticas = asRecord(raw.estatisticas);
  const compatibilidade = asRecord(estatisticas?.compatibilidade);
  const familia = typeof compatibilidade?.familia === "string" ? compatibilidade.familia : null;
  const armasCompativeis = asStringArray(compatibilidade?.itens);
  const kitQuantidade = parseKitQuantidade(estatisticas?.kit);
  return { slug, nome, familia, armasCompativeis, kitQuantidade };
}

/** Verificar se um item (pelo slug) é compatível com uma arma (pelo slug). */
export function isAmmoCompatibleWithWeapon(ammo: AmmoItemProfile, weaponSlug: string): boolean {
  return ammo.armasCompativeis.includes(weaponSlug);
}

/**
 * A partir do inventário do personagem, listar todos os itens de
 * munição compatíveis com uma arma específica.
 */
export function getCompatibleAmmoInstances(
  character: Pick<Character, "inventario">,
  weaponSlug: string,
  allAmmoProfiles: AmmoItemProfile[],
): { instance: InventoryItemInstance; profile: AmmoItemProfile }[] {
  const result: { instance: InventoryItemInstance; profile: AmmoItemProfile }[] = [];
  for (const inst of character.inventario ?? []) {
    const profile = allAmmoProfiles.find((p) => p.slug === inst.itemSlug);
    if (!profile) continue;
    if (isAmmoCompatibleWithWeapon(profile, weaponSlug)) {
      result.push({ instance: inst, profile });
    }
  }
  return result;
}

/** Total de munição compatível disponível no inventário. */
export function getTotalCompatibleAmmo(
  character: Pick<Character, "inventario">,
  weaponSlug: string,
  allAmmoProfiles: AmmoItemProfile[],
): number {
  return getCompatibleAmmoInstances(character, weaponSlug, allAmmoProfiles).reduce(
    (sum, { instance }) => sum + instance.quantidade,
    0,
  );
}

// ---------------------------------------------------------------------
// Helpers de instância de arma com munição
// ---------------------------------------------------------------------

/** Munição atual de uma instância de arma (carregador/virote). */
export function getWeaponAmmoAtual(
  instance: Pick<InventoryItemInstance, "id"> & Partial<WeaponAmmoInstanceFields>,
): number {
  return instance.municaoAtual ?? 0;
}

/** Munição máxima de uma arma (do modelo). */
export function getWeaponAmmoMax(item: Pick<ItemContent, "usesAmmunition"> & { municaoMax?: number | null }): number | null {
  if (!item.usesAmmunition) return null;
  return item.municaoMax ?? null;
}

/**
 * Atualiza a munição atual de uma instância de arma no inventário.
 * Clampeia entre 0 e max (se disponível).
 */
export function setWeaponAmmoAtual(
  character: Character,
  instanceId: string,
  value: number,
  max?: number | null,
): Character {
  const safeMax = typeof max === "number" && max > 0 ? max : Infinity;
  const clamped = Math.max(0, Math.min(safeMax, Math.trunc(value)));
  return {
    ...character,
    inventario: (character.inventario ?? []).map((inst) =>
      inst.id === instanceId ? { ...inst, municaoAtual: clamped } : inst,
    ),
  };
}

// ---------------------------------------------------------------------
// Helpers de aljava
// ---------------------------------------------------------------------

export const ALJAVA_CAPACIDADE_PADRAO = 15;
export const ALJAVA_FLECHAS_INICIAIS_SLUG = "flecha_simples";
export const ALJAVA_FLECHAS_INICIAIS_NOME = "Flecha simples";
export const ALJAVA_FLECHAS_INICIAIS_QUANTIDADE = 10;

/** Total de flechas em uma aljava. */
export function getAljavaTotalFlechas(aljava: Aljava): number {
  return aljava.stacks.reduce((sum, s) => sum + s.quantidade, 0);
}

/** Quantidade de espaços livres na aljava. */
export function getAljavaEspacoLivre(aljava: Aljava): number {
  return Math.max(0, aljava.capacidade - getAljavaTotalFlechas(aljava));
}

/**
 * Adiciona flechas a uma aljava, agrupando por tipo e respeitando a
 * capacidade. Retorna a aljava atualizada e quantas flechas não
 * couberam (excedente).
 */
export function addFletchasToAljava(
  aljava: Aljava,
  contentSlug: string,
  nome: string,
  quantidade: number,
): { aljava: Aljava; excedente: number } {
  const livre = getAljavaEspacoLivre(aljava);
  const adicionando = Math.min(quantidade, livre);
  const excedente = quantidade - adicionando;
  if (adicionando <= 0) return { aljava, excedente };

  const found = aljava.stacks.some((s) => s.contentSlug === contentSlug);
  const stacksAtualizados = found
    ? aljava.stacks.map((s) =>
        s.contentSlug === contentSlug ? { ...s, quantidade: s.quantidade + adicionando } : s,
      )
    : [...aljava.stacks, { contentSlug, nome, quantidade: adicionando }];

  return { aljava: { ...aljava, stacks: stacksAtualizados }, excedente };
}

/**
 * Consome 1 flecha de um stack específico da aljava.
 * Retorna null se o stack não existir ou estiver vazio.
 */
export function consumeFletchaFromAljava(
  aljava: Aljava,
  contentSlug: string,
): Aljava | null {
  const stackIndex = aljava.stacks.findIndex((s) => s.contentSlug === contentSlug);
  if (stackIndex === -1) return null;
  const stack = aljava.stacks[stackIndex];
  if (stack.quantidade <= 0) return null;

  const newStacks = [...aljava.stacks];
  if (stack.quantidade === 1) {
    newStacks.splice(stackIndex, 1);
  } else {
    newStacks[stackIndex] = { ...stack, quantidade: stack.quantidade - 1 };
  }
  return { ...aljava, stacks: newStacks };
}

/**
 * Atualiza a aljava de uma instância de arco no inventário.
 */
export function setAljavaOnInstance(
  character: Character,
  instanceId: string,
  aljava: Aljava,
): Character {
  return {
    ...character,
    inventario: (character.inventario ?? []).map((inst) =>
      inst.id === instanceId ? { ...inst, aljava } : inst,
    ),
  };
}

/** Criar aljava inicial padrão (PRD 13.4.1). */
export function createDefaultAljava(): Aljava {
  return {
    capacidade: ALJAVA_CAPACIDADE_PADRAO,
    stacks: [
      {
        contentSlug: ALJAVA_FLECHAS_INICIAIS_SLUG,
        nome: ALJAVA_FLECHAS_INICIAIS_NOME,
        quantidade: ALJAVA_FLECHAS_INICIAIS_QUANTIDADE,
      },
    ],
  };
}

/**
 * Verificar se um personagem já tem um arco com aljava inicializada.
 * Usado para evitar criar aljava duplicada ao comprar segundo arco.
 */
export function hasExistingAljava(character: Pick<Character, "inventario">): boolean {
  return (character.inventario ?? []).some(
    (inst) => (inst as InventoryItemInstance & Partial<WeaponAmmoInstanceFields>).aljava != null,
  );
}

// ---------------------------------------------------------------------
// Helpers de classificação de arma/munição
// ---------------------------------------------------------------------

export function isAmmoItem(item: Pick<ItemContent, "categoria">): boolean {
  return item.categoria === "municao";
}

export function isBowWeapon(item: Pick<ItemContent, "categoria" | "subtipo"> & { municaoCompativelSlug?: string | null }): boolean {
  return item.categoria === "arma" && item.subtipo === "arremesso_disparo" && item.municaoCompativelSlug === "flecha_simples";
}

export function isCrossbowWeapon(item: Pick<ItemContent, "categoria" | "subtipo"> & { municaoCompativelSlug?: string | null }): boolean {
  return item.categoria === "arma" && item.subtipo === "arremesso_disparo" && item.municaoCompativelSlug === "virotes";
}

export function isFirearmWeapon(item: Pick<ItemContent, "categoria" | "subtipo">): boolean {
  return item.categoria === "arma" && item.subtipo === "fogo";
}

export function isMagazineWeapon(item: Pick<ItemContent, "categoria" | "subtipo"> & { municaoCompativelSlug?: string | null }): boolean {
  return isFirearmWeapon(item) || isCrossbowWeapon(item);
}
