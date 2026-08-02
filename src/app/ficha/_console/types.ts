"use client";

/**
 * Contrato entre o Console e a ficha.
 *
 * O Console NÃO implementa regra de domínio: ele recebe o estado já
 * calculado e as ações que `CharacterSheetClient` já expõe (rolagem,
 * recursos com efeitos colaterais, sobrecarga, colapso, inventário,
 * condições). Assim nenhuma regra é duplicada e o Console pode ser
 * removido sem levar lógica junto.
 */

import type {
  ActiveCondition,
  Character,
  CharacterAttributes,
  CharacterRulesPayload,
  DerivedStats,
  InventoryItemInstance,
  ItemContent,
} from "../../../lib/character";
import type { RupturaRollResult } from "../../../lib/dice/types";
import type { BodySlotId } from "./slots";

export type RecursoEditavel = "pv" | "pe" | "mana";

export interface ConsoleApi {
  /** Estado atual do personagem (fonte única — vem do client). */
  character: Character;
  /** Derivados já calculados por `computeDerivedStats`. */
  derivados: DerivedStats;
  regras: CharacterRulesPayload | null;
  /** Catálogo publicado, indexado por slug — para ler dados do modelo do item. */
  catalogo: Map<string, ItemContent>;

  /** Rola um atributo (Nd8, maior dado) usando o motor real e registra no log. */
  rolarAtributo: (id: keyof CharacterAttributes) => RupturaRollResult;
  /** Rola uma perícia usando o motor real e registra no log. */
  rolarPericia: (periciaId: string) => RupturaRollResult;

  /** Grava PV/PE/Mana — passa por `updateRecursoAtual` (cura automática + colapso). */
  editarRecurso: (id: RecursoEditavel, valor: number) => void;
  /** Idem, para a trilha de Integridade (mesmo `updateRecursoAtual`, chave "integridade"). */
  editarIntegridade: (valor: number) => void;

  /** Delta em PA gastos / Reações usadas (`adjustEstadoJogo`). */
  ajustarPa: (delta: number) => void;
  ajustarReacoes: (delta: number) => void;

  /** Aplica um surto de Sobrecarga pelo fluxo existente (inclui Ruptura no 3º). */
  usarSobrecarga: (tipo: string) => void;
  /** Rótulos de surto publicados nas regras. */
  tiposDeSurto: readonly string[];
  /** `false` quando novos surtos estão bloqueados até o próximo descanso longo. */
  podeUsarSobrecarga: boolean;

  avancarColapso: () => void;
  estabilizarColapso: () => void;

  /** Move um item entre mochila/equipado/empunhado/acesso rápido. */
  equiparNoSlot: (instanceId: string, slot: BodySlotId) => void;
  desequipar: (instanceId: string) => void;
  /** MIT (armadura) e PD (escudo) atuais da instância. */
  definirMit: (instanceId: string, valor: number) => void;
  definirPd: (instanceId: string, valor: number) => void;
  /** Recarga real (carregador ou aljava compartilhada). */
  recarregar: (instanceId: string) => void;

  adicionarCondicao: (input: { conditionId: string | null; nome: string; descricao: string; origem: string; duracao: string }) => void;
  removerCondicao: (id: string) => void;
  /** Condições publicadas na Biblioteca, para o seletor. */
  condicoesDisponiveis: { slug: string; nome: string; descricao_curta?: string }[];

  /** Pins (referência tipada, nunca cópia da entidade). */
  pins: ConsolePin[];
  removerPin: (id: string) => void;

  /** Erro não fatal para exibir sem derrubar a janela. */
  erro: string | null;
}

export type ConsolePinTipo = "magia" | "item" | "arma" | "consumivel" | "talento" | "habilidade" | "acao";

export interface ConsolePin {
  id: string;
  tipo: ConsolePinTipo;
  /** Referência ao objeto real (slug/instanceId) — nunca uma cópia dos dados. */
  ref: string;
  nome: string;
  info?: string;
}

export interface SlotOcupado {
  instancia: InventoryItemInstance;
  modelo: ItemContent | undefined;
}

export type { ActiveCondition, InventoryItemInstance, ItemContent };
