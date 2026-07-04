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

/**
 * itemSlug da instância de Aljava compartilhada no inventário.
 * Não é um item do catálogo — é criado automaticamente na compra do primeiro arco.
 */
export const ALJAVA_ITEM_SLUG = "aljava";

/** Encontra a instância de Aljava compartilhada do personagem. */
export function findSharedAljava(
  character: Pick<Character, "inventario">,
): (InventoryItemInstance & { aljava: Aljava }) | null {
  const inst = (character.inventario ?? []).find((i) => i.itemSlug === ALJAVA_ITEM_SLUG);
  if (!inst) return null;
  const aljava = (inst as InventoryItemInstance & Partial<WeaponAmmoInstanceFields>).aljava;
  if (!aljava) return null;
  return inst as InventoryItemInstance & { aljava: Aljava };
}

/**
 * Cria a instância de inventário da Aljava compartilhada, vazia
 * (capacidade padrão, sem flechas). Quem chama é responsável por
 * popular o conteúdo inicial: `purchaseItem` adiciona o kit da arma
 * comprada (`inclui_na_compra`); `migrateEmbeddedAljavas` mescla
 * stacks legados. Não tem model no catálogo — é um item especial do
 * personagem.
 */
export function createSharedAljavaInstance(nowIso: string): InventoryItemInstance {
  const inst: InventoryItemInstance = {
    id: crypto.randomUUID(),
    itemSlug: ALJAVA_ITEM_SLUG,
    itemNome: "Aljava",
    categoria: "ferramenta",
    subtipo: ALJAVA_ITEM_SLUG,
    quantidade: 1,
    estado: "mochila",
    adquiridoEm: nowIso,
    precoPago: 0,
    propriedadesTecnicas: [],
    estadosTecnicos: [],
    aljava: { capacidade: ALJAVA_CAPACIDADE_PADRAO, stacks: [] },
  };
  return inst;
}

/**
 * Migra personagens com aljava embutida em arcos para o modelo de
 * aljava compartilhada. Idempotente — seguro rodar múltiplas vezes.
 *
 * Algoritmo:
 * 1. Coleta stacks de todos os arcos com `aljava` embutida.
 * 2. Mescla com a aljava compartilhada existente (ou cria uma nova).
 * 3. Remove o campo `aljava` dos arcos.
 * 4. Excesso que não cabe na capacidade é descartado (sem duplicar flechas).
 */
export function migrateEmbeddedAljavas(character: Character): Character {
  const inventario = character.inventario ?? [];
  const jaTemShared = inventario.some((i) => i.itemSlug === ALJAVA_ITEM_SLUG);
  const arcosComAljava = inventario.filter(
    (i) => i.itemSlug !== ALJAVA_ITEM_SLUG && (i as InventoryItemInstance & Partial<WeaponAmmoInstanceFields>).aljava != null,
  );
  if (arcosComAljava.length === 0 && jaTemShared) return character; // nada a fazer

  // Obter ou criar aljava compartilhada (vazia — stacks vêm dos arcos migrados)
  const sharedInst = findSharedAljava(character);
  let aljava: Aljava = sharedInst?.aljava ?? { capacidade: ALJAVA_CAPACIDADE_PADRAO, stacks: [] };

  // Mesclar stacks dos arcos
  for (const arco of arcosComAljava) {
    const embutida = (arco as InventoryItemInstance & Partial<WeaponAmmoInstanceFields>).aljava!;
    for (const stack of embutida.stacks) {
      const { aljava: nova } = addFletchasToAljava(aljava, stack.contentSlug, stack.nome, stack.quantidade);
      aljava = nova;
    }
  }

  // Remover aljava dos arcos
  const inventarioLimpo = inventario.map((i) => {
    if ((i as InventoryItemInstance & Partial<WeaponAmmoInstanceFields>).aljava != null && i.itemSlug !== ALJAVA_ITEM_SLUG) {
      const { aljava: _removed, ...rest } = i as InventoryItemInstance & { aljava: Aljava };
      return rest as InventoryItemInstance;
    }
    return i;
  });

  // Atualizar ou criar instância compartilhada
  let nextInventario: InventoryItemInstance[];
  if (sharedInst) {
    nextInventario = inventarioLimpo.map((i) =>
      i.id === sharedInst.id ? { ...i, aljava } : i,
    );
  } else {
    const novaInst = createSharedAljavaInstance(new Date().toISOString());
    nextInventario = [...inventarioLimpo, { ...novaInst, aljava }];
  }

  return { ...character, inventario: nextInventario };
}

/**
 * Atualiza a aljava na instância compartilhada.
 */
function updateSharedAljava(character: Character, novaAljava: Aljava): Character {
  const shared = findSharedAljava(character);
  if (!shared) return character;
  return {
    ...character,
    inventario: (character.inventario ?? []).map((i) =>
      i.id === shared.id ? { ...i, aljava: novaAljava } : i,
    ),
  };
}

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
 * Ajuste manual da quantidade de um stack na aljava.
 * Clampeia levando em conta as OUTRAS stacks — o total nunca passa da
 * capacidade. Remove o stack se a quantidade cair para 0.
 */
export function setFlechaQuantidadeInAljava(
  aljava: Aljava,
  contentSlug: string,
  quantidade: number,
): Aljava {
  const outrasStacks = aljava.stacks.filter((s) => s.contentSlug !== contentSlug);
  const totalOutras = outrasStacks.reduce((sum, s) => sum + s.quantidade, 0);
  const maxParaEsta = Math.max(0, aljava.capacidade - totalOutras);
  const clamped = Math.max(0, Math.min(maxParaEsta, Math.trunc(quantidade)));
  if (clamped === 0) return { ...aljava, stacks: outrasStacks };
  const stackAtual = aljava.stacks.find((s) => s.contentSlug === contentSlug);
  return {
    ...aljava,
    stacks: stackAtual
      ? aljava.stacks.map((s) => (s.contentSlug === contentSlug ? { ...s, quantidade: clamped } : s))
      : [...outrasStacks, { contentSlug, nome: contentSlug, quantidade: clamped }],
  };
}

export interface StoreFletchasResult {
  character: Character;
  /** Flechas efetivamente guardadas na aljava. */
  moved: number;
  /** Flechas que não couberam (aljava cheia). */
  excedente: number;
}

/**
 * Move flechas de um item de munição do inventário para a Aljava compartilhada.
 * Respeita a capacidade — o excedente permanece no inventário.
 * Remove o item de munição se ele zerar.
 */
export function storeFletchasInAljava(
  character: Character,
  ammoInstanceId: string,
  contentSlug: string,
  nome: string,
  quantidade: number,
): StoreFletchasResult {
  const inventario = character.inventario ?? [];
  const sharedAljava = findSharedAljava(character);
  const ammoInst = inventario.find((i) => i.id === ammoInstanceId);
  if (!sharedAljava || !ammoInst) return { character, moved: 0, excedente: quantidade };

  const disponivel = Math.min(quantidade, ammoInst.quantidade);
  if (disponivel <= 0) return { character, moved: 0, excedente: 0 };

  const { aljava: novaAljava, excedente } = addFletchasToAljava(sharedAljava.aljava, contentSlug, nome, disponivel);
  const moved = disponivel - excedente;
  if (moved <= 0) return { character, moved: 0, excedente: disponivel };

  const novaQtdAmmo = ammoInst.quantidade - moved;
  const nextInventario = inventario
    .filter((i) => i.id !== ammoInstanceId || novaQtdAmmo > 0)
    .map((i) => {
      if (i.id === sharedAljava.id) return { ...i, aljava: novaAljava };
      if (i.id === ammoInstanceId && novaQtdAmmo > 0) return { ...i, quantidade: novaQtdAmmo };
      return i;
    });

  return { character: { ...character, inventario: nextInventario }, moved, excedente };
}

export interface WithdrawFletchasResult {
  character: Character;
  /** Flechas efetivamente retiradas da aljava e devolvidas ao inventário. */
  withdrawn: number;
}

/**
 * Retira flechas da Aljava compartilhada e devolve ao inventário.
 * Se já houver item do mesmo tipo no inventário, incrementa a quantidade.
 * Caso contrário, cria nova instância com precoPago: 0 (sem valor de venda).
 */
export function withdrawFletchasFromAljava(
  character: Character,
  contentSlug: string,
  quantidade: number,
  nomeFlexa: string,
  nowIso: string,
): WithdrawFletchasResult {
  const inventario = character.inventario ?? [];
  const sharedAljava = findSharedAljava(character);
  if (!sharedAljava) return { character, withdrawn: 0 };

  const stack = sharedAljava.aljava.stacks.find((s) => s.contentSlug === contentSlug);
  if (!stack || stack.quantidade <= 0) return { character, withdrawn: 0 };

  const retiradas = Math.max(0, Math.min(quantidade, stack.quantidade));
  if (retiradas === 0) return { character, withdrawn: 0 };

  const novaAljava = setFlechaQuantidadeInAljava(sharedAljava.aljava, contentSlug, stack.quantidade - retiradas);
  const existingAmmo = inventario.find((i) => i.itemSlug === contentSlug && i.id !== sharedAljava.id);

  let nextInventario: InventoryItemInstance[];
  if (existingAmmo) {
    nextInventario = inventario.map((i) => {
      if (i.id === sharedAljava.id) return { ...i, aljava: novaAljava };
      if (i.id === existingAmmo.id) return { ...i, quantidade: i.quantidade + retiradas };
      return i;
    });
  } else {
    const novaInst: InventoryItemInstance = {
      id: crypto.randomUUID(),
      itemSlug: contentSlug,
      itemNome: nomeFlexa,
      categoria: "municao",
      subtipo: "municao",
      quantidade: retiradas,
      estado: "mochila",
      adquiridoEm: nowIso,
      precoPago: 0,
      propriedadesTecnicas: [],
      estadosTecnicos: [],
    };
    nextInventario = [
      ...inventario.map((i) => (i.id === sharedAljava.id ? { ...i, aljava: novaAljava } : i)),
      novaInst,
    ];
  }

  return { character: { ...character, inventario: nextInventario }, withdrawn: retiradas };
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
 * Verificar se o personagem já tem a Aljava compartilhada no inventário.
 * Usado para evitar criar duplicata ao comprar segundo arco.
 */
export function hasExistingAljava(character: Pick<Character, "inventario">): boolean {
  return (character.inventario ?? []).some((inst) => inst.itemSlug === ALJAVA_ITEM_SLUG);
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

// ---------------------------------------------------------------------
// Fase 3 — Recarregar a partir do estoque do inventário
// ---------------------------------------------------------------------

export interface ReloadResult {
  character: Character;
  /** Quantidade realmente carregada nesta recarga. */
  carregada: number;
  /** Razão para não ter carregado nada, ou null se ok. */
  motivoFalha: "sem_estoque" | "ja_cheio" | "modo_nao_suportado" | null;
}

/**
 * Recarrega uma arma (carregador ou virote) a partir do primeiro item
 * de munição compatível encontrado no inventário.
 *
 * Algoritmo PRD 13.4.1 (FPS):
 *   faltante = municaoMax - municaoAtual
 *   carregada = min(faltante, estoqueCompativel)
 *   Consome exatamente `carregada` do estoque — remove instância se zerar.
 */
export function reloadMagazineWeapon(
  character: Character,
  weaponInstanceId: string,
  weaponItem: Pick<ItemContent, "slug" | "subtipo" | "usesAmmunition"> & { municaoMax?: number | null; municaoCompativelSlug?: string | null },
  allAmmoProfiles: AmmoItemProfile[],
): ReloadResult {
  const modoMunicao = deriveModoMunicao(weaponItem.subtipo, weaponItem.municaoMax ?? null, weaponItem.municaoCompativelSlug ?? null);
  if (modoMunicao !== "carregador" && modoMunicao !== "virote") {
    return { character, carregada: 0, motivoFalha: "modo_nao_suportado" };
  }

  const inventario = character.inventario ?? [];
  const weaponInst = inventario.find((i) => i.id === weaponInstanceId);
  if (!weaponInst) return { character, carregada: 0, motivoFalha: "sem_estoque" };

  const municaoMax = weaponItem.municaoMax ?? 0;
  const municaoAtual = (weaponInst as InventoryItemInstance & Partial<WeaponAmmoInstanceFields>).municaoAtual ?? 0;
  const faltante = Math.max(0, municaoMax - municaoAtual);
  if (faltante === 0) return { character, carregada: 0, motivoFalha: "ja_cheio" };

  // Encontrar compatíveis no inventário (não é a própria arma)
  const compativelSlug = weaponItem.municaoCompativelSlug;
  const ammoInsts = inventario.filter((inst) => {
    if (inst.id === weaponInstanceId) return false;
    const profile = allAmmoProfiles.find((p) => p.slug === inst.itemSlug);
    if (!profile) return false;
    // Verifica compatibilidade por família (slug compatível da arma == familia da munição)
    return profile.familia === compativelSlug || profile.armasCompativeis.includes(weaponItem.slug);
  });

  if (ammoInsts.length === 0) return { character, carregada: 0, motivoFalha: "sem_estoque" };

  // Consome do primeiro disponível (mais simples)
  let restanteCarregar = faltante;
  let nextInventario = [...inventario];

  for (const ammoInst of ammoInsts) {
    if (restanteCarregar <= 0) break;
    const idx = nextInventario.findIndex((i) => i.id === ammoInst.id);
    if (idx === -1) continue;
    const disponivelNeste = nextInventario[idx].quantidade;
    const consumir = Math.min(restanteCarregar, disponivelNeste);
    restanteCarregar -= consumir;
    const novaQtd = disponivelNeste - consumir;
    if (novaQtd <= 0) {
      nextInventario.splice(idx, 1);
    } else {
      nextInventario[idx] = { ...nextInventario[idx], quantidade: novaQtd };
    }
  }

  const carregada = faltante - restanteCarregar;
  const novaMunicao = municaoAtual + carregada;
  const withAmmo: Character = {
    ...character,
    inventario: nextInventario.map((inst) =>
      inst.id === weaponInstanceId ? { ...inst, municaoAtual: novaMunicao } : inst,
    ),
  };

  return { character: withAmmo, carregada, motivoFalha: null };
}

/**
 * Recarrega a Aljava compartilhada movendo flechas do inventário para ela.
 * Cada item de munição de flecha no inventário é consumido em ordem
 * até a aljava ficar cheia ou o estoque acabar.
 */
export function reloadAljava(
  character: Character,
  allAmmoProfiles: AmmoItemProfile[],
): ReloadResult {
  const inventario = character.inventario ?? [];
  const sharedAljava = findSharedAljava(character);
  if (!sharedAljava) return { character, carregada: 0, motivoFalha: "sem_estoque" };

  const livre = getAljavaEspacoLivre(sharedAljava.aljava);
  if (livre === 0) return { character, carregada: 0, motivoFalha: "ja_cheio" };

  // Itens de munição de flecha no inventário (excluindo a própria aljava)
  const fletchaInsts = inventario.filter((inst) => {
    if (inst.id === sharedAljava.id) return false;
    const profile = allAmmoProfiles.find((p) => p.slug === inst.itemSlug);
    return profile != null && (profile.familia === "flecha_simples" || profile.familia === "flecha_especial" || profile.familia?.startsWith("flecha"));
  });

  if (fletchaInsts.length === 0) return { character, carregada: 0, motivoFalha: "sem_estoque" };

  let aljava = sharedAljava.aljava;
  let nextInventario = [...inventario];
  let totalCarregada = 0;

  for (const fletchaInst of fletchaInsts) {
    if (getAljavaEspacoLivre(aljava) <= 0) break;
    const profile = allAmmoProfiles.find((p) => p.slug === fletchaInst.itemSlug);
    if (!profile) continue;
    const idx = nextInventario.findIndex((i) => i.id === fletchaInst.id);
    if (idx === -1) continue;

    const disponivelNeste = nextInventario[idx].quantidade;
    const livre2 = getAljavaEspacoLivre(aljava);
    const mover = Math.min(disponivelNeste, livre2);

    const { aljava: novaAljava, excedente } = addFletchasToAljava(aljava, profile.slug, profile.nome, mover);
    const realmenterMovido = mover - excedente;
    if (realmenterMovido <= 0) break;

    aljava = novaAljava;
    totalCarregada += realmenterMovido;

    const novaQtd = disponivelNeste - realmenterMovido;
    if (novaQtd <= 0) {
      nextInventario.splice(idx, 1);
    } else {
      nextInventario[idx] = { ...nextInventario[idx], quantidade: novaQtd };
    }
  }

  if (totalCarregada === 0) return { character, carregada: 0, motivoFalha: "sem_estoque" };

  const withAljava: Character = {
    ...character,
    inventario: nextInventario.map((inst) =>
      inst.id === sharedAljava.id ? { ...inst, aljava } : inst,
    ),
  };

  return { character: withAljava, carregada: totalCarregada, motivoFalha: null };
}

// ---------------------------------------------------------------------
// Fase 4 — Consumo de munição ao atacar
// ---------------------------------------------------------------------

export type ConsumeAmmoMotivoFalha =
  | "sem_municao"
  | "flecha_nao_selecionada"
  | "flecha_sem_estoque"
  | "nenhuma_arma_empunhada"
  | null;

export interface ConsumeAmmoResult {
  character: Character;
  consumedFromInstanceId: string | null;
  /** Slug da flecha consumida (aljava) ou null para carregador/sem consumo. */
  consumedFlechaSlug: string | null;
  /** True se a flecha consumida não é flecha_simples (efeito especial a ser sugerido ao mestre). */
  isFlechaEspecial: boolean;
  motivoFalha: ConsumeAmmoMotivoFalha;
}

/**
 * Verifica se a primeira arma empunhada com ammo pode atacar.
 * Retorna a razão de bloqueio ou null se tudo ok.
 *
 * Regras:
 * - Carregador/virote: bloqueia se `municaoAtual === 0`.
 * - Aljava: bloqueia se vazia; exige `selectedFlechaSlug` quando há
 *   múltiplos tipos (retorna "flecha_nao_selecionada" caso contrário).
 */
export function checkAttackAmmoBlock(
  character: Character,
  itemsModelo: (Pick<ItemContent, "slug" | "subtipo" | "usesAmmunition"> & { municaoMax?: number | null; municaoCompativelSlug?: string | null })[],
  opts?: { selectedFlechaSlug?: string | null },
): ConsumeAmmoMotivoFalha {
  const inventario = character.inventario ?? [];
  let foundWeaponWithAmmo = false;

  for (const inst of inventario) {
    if (inst.estado !== "empunhado") continue;
    const modelo = itemsModelo.find((m) => m.slug === inst.itemSlug);
    if (!modelo?.usesAmmunition) continue;

    const modoMunicao = deriveModoMunicao(modelo.subtipo, modelo.municaoMax ?? null, modelo.municaoCompativelSlug ?? null);
    if (!modoMunicao) continue;
    foundWeaponWithAmmo = true;

    if (modoMunicao === "carregador" || modoMunicao === "virote") {
      const atual = (inst as InventoryItemInstance & Partial<WeaponAmmoInstanceFields>).municaoAtual ?? 0;
      if (atual <= 0) return "sem_municao";
      return null;
    }

    if (modoMunicao === "aljava") {
      const sharedAljava = findSharedAljava(character);
      if (!sharedAljava || getAljavaTotalFlechas(sharedAljava.aljava) === 0) return "sem_municao";
      const stacksComFlechas = sharedAljava.aljava.stacks.filter((s) => s.quantidade > 0);
      if (stacksComFlechas.length === 0) return "sem_municao";
      if (stacksComFlechas.length > 1 && !opts?.selectedFlechaSlug) return "flecha_nao_selecionada";
      if (opts?.selectedFlechaSlug) {
        const stackEscolhido = sharedAljava.aljava.stacks.find((s) => s.contentSlug === opts.selectedFlechaSlug && s.quantidade > 0);
        if (!stackEscolhido) return "flecha_sem_estoque";
      }
      return null;
    }
  }

  return foundWeaponWithAmmo ? null : null;
}

/**
 * Consome 1 unidade de munição da primeira arma "empunhada" no
 * inventário que usa munição.
 *
 * - Carregador/virote: decrementa `municaoAtual` em 1. Bloqueia se === 0.
 * - Aljava: consome da flecha em `opts.selectedFlechaSlug` quando fornecido;
 *   auto-seleciona quando há apenas 1 tipo. Bloqueia se vazia ou se há
 *   múltiplos tipos sem seleção.
 *
 * Não-automatizado para Rajada/Dispersão — apenas 1 projétil por chamada.
 */
export function consumeAttackAmmo(
  character: Character,
  itemsModelo: (Pick<ItemContent, "slug" | "subtipo" | "usesAmmunition"> & { municaoMax?: number | null; municaoCompativelSlug?: string | null })[],
  opts?: { selectedFlechaSlug?: string | null },
): ConsumeAmmoResult {
  const inventario = character.inventario ?? [];
  const nenhuma: ConsumeAmmoResult = { character, consumedFromInstanceId: null, consumedFlechaSlug: null, isFlechaEspecial: false, motivoFalha: null };

  for (const inst of inventario) {
    if (inst.estado !== "empunhado") continue;
    const modelo = itemsModelo.find((m) => m.slug === inst.itemSlug);
    if (!modelo?.usesAmmunition) continue;

    const modoMunicao = deriveModoMunicao(modelo.subtipo, modelo.municaoMax ?? null, modelo.municaoCompativelSlug ?? null);

    if (modoMunicao === "carregador" || modoMunicao === "virote") {
      const atual = (inst as InventoryItemInstance & Partial<WeaponAmmoInstanceFields>).municaoAtual ?? 0;
      if (atual <= 0) return { ...nenhuma, motivoFalha: "sem_municao" };
      const novoChar: Character = {
        ...character,
        inventario: inventario.map((i) =>
          i.id === inst.id ? { ...i, municaoAtual: atual - 1 } : i,
        ),
      };
      return { character: novoChar, consumedFromInstanceId: inst.id, consumedFlechaSlug: null, isFlechaEspecial: false, motivoFalha: null };
    }

    if (modoMunicao === "aljava") {
      const sharedAljava = findSharedAljava(character);
      if (!sharedAljava || getAljavaTotalFlechas(sharedAljava.aljava) === 0) return { ...nenhuma, motivoFalha: "sem_municao" };

      const stacksComFlechas = sharedAljava.aljava.stacks.filter((s) => s.quantidade > 0);
      if (stacksComFlechas.length === 0) return { ...nenhuma, motivoFalha: "sem_municao" };

      // Determinar qual flecha usar
      let slugAlvo: string;
      if (opts?.selectedFlechaSlug) {
        const stackEscolhido = stacksComFlechas.find((s) => s.contentSlug === opts.selectedFlechaSlug);
        if (!stackEscolhido) return { ...nenhuma, motivoFalha: "flecha_sem_estoque" };
        slugAlvo = stackEscolhido.contentSlug;
      } else if (stacksComFlechas.length === 1) {
        // Auto-seleciona quando há apenas 1 tipo
        slugAlvo = stacksComFlechas[0].contentSlug;
      } else {
        // Múltiplos tipos sem seleção explícita — bloqueia
        return { ...nenhuma, motivoFalha: "flecha_nao_selecionada" };
      }

      const novaAljava = consumeFletchaFromAljava(sharedAljava.aljava, slugAlvo);
      if (!novaAljava) return { ...nenhuma, motivoFalha: "flecha_sem_estoque" };

      const novoChar: Character = {
        ...character,
        inventario: inventario.map((i) =>
          i.id === sharedAljava.id ? { ...i, aljava: novaAljava } : i,
        ),
      };
      const isFlechaEspecial = slugAlvo !== ALJAVA_FLECHAS_INICIAIS_SLUG;
      return { character: novoChar, consumedFromInstanceId: sharedAljava.id, consumedFlechaSlug: slugAlvo, isFlechaEspecial, motivoFalha: null };
    }
  }

  return nenhuma;
}

/**
 * Ajusta a quantidade de um stack específico na Aljava compartilhada.
 * Wrapper de conveniência sobre setFlechaQuantidadeInAljava + updateSharedAljava.
 */
export function setSharedAljavaFlechaQuantidade(
  character: Character,
  contentSlug: string,
  quantidade: number,
): Character {
  const sharedAljava = findSharedAljava(character);
  if (!sharedAljava) return character;
  const novaAljava = setFlechaQuantidadeInAljava(sharedAljava.aljava, contentSlug, quantidade);
  return updateSharedAljava(character, novaAljava);
}
