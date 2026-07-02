/**
 * Efeitos ativos derivados de condições — checkpoint v0.33.
 *
 * Primeira camada de automação real das condições registradas em
 * `character.condicoes_ativas` (v0.32, ainda puro registro manual sem
 * nenhum efeito). Este módulo é uma função pura: dado o personagem,
 * devolve a lista de efeitos ativos correntes (SEM tocar em estado,
 * sem persistir nada) — quem consome (RollsTab/ConditionsTab) decide o
 * que fazer com eles (somar modificador, mostrar aviso, etc).
 *
 * Escopo explícito deste checkpoint (ver PRD seção 9 e checkpoint
 * v0.32.1): só modificadores diretos em rolagem e avisos informativos.
 * NADA de ações derivadas (Escapar/Levantar/apagar Queimando), fim de
 * rodada, dano recorrente ou remoção automática por cura — isso é
 * trabalho futuro, listado como pendência no relatório.
 */

import type { ActiveCondition, Character } from "./types";

/** Fonte do efeito — hoje só "condition" existe; outros tipos (item, talento...) são trabalho futuro. */
export type ActiveEffectSourceType = "condition";

/**
 * Natureza do efeito:
 *   - "modifier": soma um valor numérico às rolagens com tag compatível.
 *   - "warning": informativo, não altera nenhum cálculo (ex.: "desloca-
 *     mento 0") — mostrado na ficha, nunca somado numa rolagem.
 *   - "lock": bloqueia uma categoria de ação (reservado para uso
 *     futuro — nenhuma condição mapeada neste checkpoint gera "lock"
 *     ainda, já que ações derivadas/travamento de console não estão no
 *     escopo do v0.33).
 *   - "auto_fail": a categoria de teste falha automaticamente (ex.:
 *     Cego em testes de visão) — hoje só informativo na UI; o
 *     RollsTab não impede a rolagem sozinho (ver pendências).
 */
export type ActiveEffectKind = "modifier" | "warning" | "lock" | "auto_fail";

export interface ActiveEffect {
  /** Estável enquanto a condição de origem existir — `${conditionInstanceId}:${index}`. */
  id: string;
  sourceType: ActiveEffectSourceType;
  /** slug da Biblioteca (content_documents) quando a condição veio de lá; senão o id local da condição. */
  sourceId: string;
  sourceName: string;
  /** Tags de rolagem afetadas (ver RollsTab) — vazio para efeitos puramente informativos (ex.: aviso de deslocamento). */
  affectedTags: string[];
  /** Valor a somar quando kind="modifier" — 0 para os demais kinds. */
  modifier: number;
  explanation: string;
  enabledByDefault: boolean;
  kind: ActiveEffectKind;
  /** Sempre true neste checkpoint — automação sem override reversível não é implementada (ver PRD princípio 2). */
  reversible: true;
}

interface ConditionEffectTemplate {
  affectedTags: string[];
  modifier: number;
  explanation: string;
  kind: ActiveEffectKind;
}

/**
 * Mapeamento condição (slug da Biblioteca) → efeitos gerados, seguindo
 * a tabela 9.2 do PRD. Só as condições explicitamente pedidas neste
 * checkpoint têm modificador real — as demais condições publicadas na
 * Biblioteca (Atordoado, Envenenado, Imobilizado, Inconsciente,
 * Insaturado, Queimando, Sangrando, Saturado, Surdo) ainda não têm
 * entrada aqui de propósito: caem no fallback informativo (ver
 * `deriveActiveEffectsFromConditions`), não é omissão.
 */
const CONDITION_EFFECT_TEMPLATES: Record<string, ConditionEffectTemplate[]> = {
  agarrado: [
    { affectedTags: ["ofensiva"], modifier: -1, explanation: "Agarrado: -1 em ações ofensivas.", kind: "modifier" },
    { affectedTags: ["defensiva"], modifier: -1, explanation: "Agarrado: -1 em ações defensivas.", kind: "modifier" },
    {
      affectedTags: ["deslocamento"],
      modifier: 0,
      explanation: "Agarrado: deslocamento total 0 (aviso — sem automação de movimento ainda).",
      kind: "warning",
    },
  ],
  agarrando: [
    { affectedTags: ["ofensiva"], modifier: -1, explanation: "Agarrando: -1 em ações ofensivas.", kind: "modifier" },
    { affectedTags: ["defensiva"], modifier: -1, explanation: "Agarrando: -1 em ações defensivas.", kind: "modifier" },
    {
      affectedTags: ["deslocamento"],
      modifier: 0,
      explanation: "Agarrando: deslocamento à metade (aviso — sem automação de movimento ainda).",
      kind: "warning",
    },
  ],
  caido: [
    { affectedTags: ["ofensiva"], modifier: -1, explanation: "Caído: -1 nas próprias ações ofensivas.", kind: "modifier" },
    {
      affectedTags: ["deslocamento"],
      modifier: 0,
      explanation: "Caído: deslocamento à metade (aviso — sem automação de movimento ainda).",
      kind: "warning",
    },
  ],
  cego: [
    { affectedTags: ["ofensiva"], modifier: -2, explanation: "Cego: -2 em ações ofensivas.", kind: "modifier" },
    {
      affectedTags: ["visao"],
      modifier: 0,
      explanation: "Cego: testes de visão falham automaticamente.",
      kind: "auto_fail",
    },
  ],
  contundido: [
    { affectedTags: ["luta"], modifier: -1, explanation: "Contundido: -1 em Luta.", kind: "modifier" },
    { affectedTags: ["mobilidade"], modifier: -1, explanation: "Contundido: -1 em Mobilidade.", kind: "modifier" },
    { affectedTags: ["reflexos"], modifier: -1, explanation: "Contundido: -1 em Reflexos.", kind: "modifier" },
  ],
  lento: [
    { affectedTags: ["reflexos"], modifier: -1, explanation: "Lento: -1 em Reflexos.", kind: "modifier" },
    { affectedTags: ["mobilidade"], modifier: -1, explanation: "Lento: -1 em Mobilidade.", kind: "modifier" },
    {
      affectedTags: ["deslocamento"],
      modifier: 0,
      explanation: "Lento: deslocamento à metade (aviso — sem automação de movimento ainda).",
      kind: "warning",
    },
  ],
  ofuscado: [{ affectedTags: ["visao"], modifier: -1, explanation: "Ofuscado: -1 em testes de visão.", kind: "modifier" }],
  sufocando: [{ affectedTags: ["corpo"], modifier: -1, explanation: "Sufocando: -1 em testes de Corpo.", kind: "modifier" }],
};

function effectsForCondition(condition: ActiveCondition): ActiveEffect[] {
  const templates = condition.conditionId ? CONDITION_EFFECT_TEMPLATES[condition.conditionId] : undefined;

  if (!templates) {
    // Condição sem mapeamento ainda (manual, ou da Biblioteca mas fora
    // da tabela deste checkpoint) — efeito puramente informativo, sem
    // inventar modificador (item 4 do pedido).
    return [
      {
        id: `${condition.id}:0`,
        sourceType: "condition",
        sourceId: condition.conditionId ?? condition.id,
        sourceName: condition.nome,
        affectedTags: [],
        modifier: 0,
        explanation: "Condição registrada — automação de modificador ainda não implementada para ela.",
        enabledByDefault: true,
        kind: "warning",
        reversible: true,
      },
    ];
  }

  return templates.map((template, index) => ({
    id: `${condition.id}:${index}`,
    sourceType: "condition",
    sourceId: condition.conditionId as string,
    sourceName: condition.nome,
    affectedTags: template.affectedTags,
    modifier: template.modifier,
    explanation: template.explanation,
    enabledByDefault: true,
    kind: template.kind,
    reversible: true,
  }));
}

/**
 * Deriva os efeitos ativos correntes do personagem a partir das
 * condições com `ativa: true` em `condicoes_ativas`. Função pura —
 * não lê nem escreve nada fora do argumento recebido. Chamar de novo
 * sempre que `character.condicoes_ativas` mudar (ver useMemo em
 * CharacterSheetClient).
 */
export function deriveActiveEffectsFromConditions(character: Pick<Character, "condicoes_ativas">): ActiveEffect[] {
  const condicoesAtivas = (character.condicoes_ativas ?? []).filter((c) => c.ativa);
  return condicoesAtivas.flatMap(effectsForCondition);
}
