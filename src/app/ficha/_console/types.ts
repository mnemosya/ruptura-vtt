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
import type { TableLogVisibility } from "../../../lib/table";
import type { BodySlotId } from "./slots";
import type { ItemLoadoutState } from "../../../lib/character/inventory";
import type { ResumoDeCarga } from "../../../lib/character/carga";

export type RecursoEditavel = "pv" | "pe" | "mana";

/**
 * Modo da ficha. `jogo` é a sessão (nada permanente muda por acidente);
 * `evolucao` destrava as alterações permanentes — atributos, perícias,
 * talentos, vertentes — que já passam por `logPermanentAdjustment` e
 * pelo `table_logs`. É o MESMO `SheetMode` de `ModeToggle.tsx`; o
 * Console só ganhou uma porta pra ele.
 */
export type ConsoleModo = "jogo" | "evolucao";

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
  /**
   * Rola uma perícia de defesa (Esquivar/Bloquear/Aparar/Resistir) já
   * gastando a Reação pela regra data-driven de `combat_flow`
   * (`spendReactionForDefense`, `lib/character/reactions.ts`) — mesma
   * regra do controle manual de Reação do harness de dev. Sem Reação
   * disponível, a defesa ainda acontece, mas com a penalidade
   * cumulativa (`-1`, `-2`...) já aplicada como modificador da rolagem.
   */
  rolarDefesa: (periciaId: string) => ConsoleDefenseRollResult;

  /**
   * Mesa a que esta ficha está ligada. `null` na ficha solta (harness,
   * personagem ainda não salvo): sem mesa não há o que publicar, e o
   * painel de rolagem esconde a escolha de quem enxerga.
   */
  mesa: { campaignId: string; characterId: string } | null;

  /** Atributo primário de uma perícia (com o fallback de sempre: Corpo). */
  atributoDaPericia: (periciaId: string) => keyof CharacterAttributes;
  /**
   * Declara a defesa e GASTA a Reação, sem rolar — a rolagem vem depois,
   * quando a pessoa apertar o botão no painel. Devolve a penalidade
   * cumulativa (se houver) pra entrar como modificador daquela rolagem.
   */
  prepararDefesa: () => { usouReacao: boolean; penalidade: number; defesasSemReacao: number };
  /**
   * A rolagem do painel: atributo, perícia, modificador e CD como
   * configurados, com as faces vindas dos dados 3D em `dados` (ausente
   * = sorteia internamente). Registra no log e publica na mesa com a
   * visibilidade escolhida.
   */
  rolarTeste: (p: {
    atributoId: keyof CharacterAttributes;
    periciaId: string | null;
    modificador: number;
    cd: number | null;
    dados?: number[];
    visibilidade: TableLogVisibility;
    /**
     * O que a pessoa QUIS rolar, quando isso não é a própria perícia:
     * "Aparar" usa Luta, "Esquivar" usa Reflexos. Sem isto o feed
     * mostra a perícia e a intenção se perde.
     */
    intencao?: { tipo: string; nome: string } | null;
  }) => RupturaRollResult;

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

  // ── Inventário (aba Inventário) ───────────────────────────────────
  /**
   * Move a instância entre os CINCO estados de loadout, incluindo
   * "abrigo". Difere de `equiparNoSlot`/`desequipar`, que existem para
   * o paper doll e decidem o estado a partir do slot do corpo; aqui
   * quem escolhe o estado é quem chama, porque a aba Inventário mexe
   * em estados que não têm slot (mochila, abrigo).
   */
  moverItemPara: (instanceId: string, estado: ItemLoadoutState) => void;
  /** Usa o item — consome carga/quantidade e aplica o que o conteúdo automatiza. */
  usarItem: (instanceId: string) => void;
  /** Ajusta a quantidade da pilha. Nunca abaixo de 1 — para zerar, `descartarItem`. */
  ajustarQuantidade: (instanceId: string, delta: number) => void;
  /** Remove a instância inteira do inventário. */
  descartarItem: (instanceId: string) => void;
  /** Espaços ocupados e capacidade — a regra vive em `lib/character/carga.ts`. */
  carga: ResumoDeCarga;
  /**
   * Termos de regra citáveis dentro de um texto — ações de combate e
   * condições publicadas. É o que alimenta o tooltip de "Resistir" ou
   * "Atordoado" no meio da descrição de um item. Vem do conteúdo
   * real; o Console não mantém glossário próprio.
   */
  glossario: TermoDeRegra[];

  adicionarCondicao: (input: { conditionId: string | null; nome: string; descricao: string; origem: string; duracao: string }) => void;
  removerCondicao: (id: string) => void;
  /** Condições publicadas na Biblioteca, para o seletor. */
  condicoesDisponiveis: { slug: string; nome: string; descricao_curta?: string }[];

  /** Modo atual da ficha — o Console só LÊ e alterna; a regra de quem pode editar continua no client. */
  modo: ConsoleModo;
  definirModo: (modo: ConsoleModo) => void;
  /**
   * Alteração PERMANENTE de atributo/perícia (só em Modo Evolução).
   * São os mesmos `updateAtributo`/`updatePericia` do client: clampam
   * pelo mín/máx das regras, recalculam derivados, sobem os recursos
   * atuais na medida aplicável e gravam no histórico de evolução.
   * Em Modo Jogo o próprio handler recusa — a UI só esconde o controle.
   */
  editarAtributo: (id: keyof CharacterAttributes, valor: number) => void;
  editarPericia: (id: string, valor: number) => void;
  /** PM de evolução — `null` quando a ficha nunca registrou PM. */
  pm: { disponivel: number; total: number } | null;

  /** Pins (referência tipada, nunca cópia da entidade). */
  pins: ConsolePin[];
  removerPin: (id: string) => void;

  /** Erro não fatal para exibir sem derrubar a janela. */
  erro: string | null;
}

/** Resultado de `rolarDefesa` — a rolagem em si (`resultado`) mais o
    que aconteceu com a Reação, pra UI poder mostrar a penalidade. */
export interface ConsoleDefenseRollResult {
  resultado: RupturaRollResult;
  usouReacao: boolean;
  /** Sempre `<= 0` — modificador cumulativo já aplicado a `resultado.total`. */
  penalidade: number;
  /** Quantas defesas sem Reação já foram feitas nesta rodada, incluindo esta. */
  defesasSemReacao: number;
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

/**
 * Um termo que pode aparecer GRIFADO dentro de um texto de regra. Os
 * dois tipos vêm de conteúdo publicado: `combat_action` (28) e
 * `condition` (17). O `nome` é o que se procura no texto; a
 * `descricao` é o que o tooltip mostra.
 */
export interface TermoDeRegra {
  tipo: "acao" | "condicao";
  slug: string;
  nome: string;
  descricao: string | null;
}

export interface SlotOcupado {
  instancia: InventoryItemInstance;
  modelo: ItemContent | undefined;
}

export type { ActiveCondition, InventoryItemInstance, ItemContent };
