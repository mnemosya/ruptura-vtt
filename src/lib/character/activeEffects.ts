/**
 * Efeitos ativos derivados de condições — checkpoint v0.33, refeito no
 * checkpoint v0.51 (achado A1 da auditoria v0.50) para ler
 * `payload_automacao.efeitos` de `content_documents`
 * (content_type="condition", `db_condicoes_normalizado_v1_5.json`) em
 * vez de uma tabela de modificadores hardcoded por condição. Mesmo
 * padrão já usado por talentos (`deriveActiveEffectsFromTalents`,
 * v0.48) e pelo motor de fim de rodada (`endRoundConditions.ts`, v0.44):
 * o payload é a fonte de verdade, este módulo só interpreta os `tipo`
 * de efeito que mapeiam 1:1 para o modelo de `ActiveEffect` já usado
 * pela ficha (RollsTab/ConditionsTab). Função pura: dado o personagem e
 * o catálogo de condições, devolve a lista de efeitos ativos correntes
 * (SEM tocar em estado, sem persistir nada).
 *
 * Escopo explícito (ver PRD seção 9 e checkpoint v0.32.1): só
 * modificadores diretos em rolagem e avisos informativos. `tipo` fora
 * do mapeamento abaixo (habilitar_acao, dano_fim_de_rodada, testes de
 * resistência, aplicar_condicao_*, reduzir_pa, alterar_custo_mana,
 * exigir_teste_conjuracao, remover_ao_recuperar_pv, manter_condicao_no_alvo,
 * morte_apos_tempo) já são tratados em outros módulos
 * (endRoundConditions.ts, actionConsole.ts, autoHeal.ts) ou ficam de
 * fora silenciosamente aqui — não geram warning genérico para não
 * duplicar informação já mostrada na aba Condições.
 */

import { normalizeConditionSlug } from "./actionConsole";
import { getConditionEndRoundEffects, type ConditionContent, type ConditionEndRoundEffect } from "./endRoundConditions";
import type { ActiveCondition, Character } from "./types";

/** Fonte do efeito — "talent" adicionado no checkpoint v0.48, "escalpo" no v0.55, "rune" no v0.57, "temporary" no pós-v0.71 (buff temporário rastreado); outros tipos (magia...) são trabalho futuro. */
export type ActiveEffectSourceType = "condition" | "reaction_overflow" | "talent" | "escalpo" | "rune" | "temporary";

/**
 * Natureza do efeito:
 *   - "modifier": soma um valor numérico às rolagens com tag compatível.
 *   - "warning": informativo, não altera nenhum cálculo (ex.: "desloca-
 *     mento 0", ou um modificador cujo `payload_automacao` depende de
 *     contexto/alvo que a ficha ainda não avalia, ex.: "quando dependem
 *     de visão") — mostrado na ficha, nunca somado numa rolagem.
 *   - "lock": bloqueia uma categoria de ação (`bloquear_acoes`/
 *     `bloquear_reacoes` do payload) — hoje só informativo na UI, o
 *     Console de Ação não impede a ação sozinho por causa disto.
 *   - "auto_fail": a categoria de teste falha automaticamente (ex.:
 *     Cego em testes de visão) — bloqueia a rolagem de verdade via
 *     `getAutoFailReason` (RollsTab.tsx), não só um aviso.
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

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === "string");
}

function fallbackWarning(condition: ActiveCondition): ActiveEffect[] {
  // Condição sem mapeamento aproveitável — manual, fora da Biblioteca,
  // não publicada, ou cujo payload não contém nenhum `tipo` de efeito
  // interpretado abaixo. Efeito puramente informativo, sem inventar
  // modificador.
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

/**
 * Converte um único efeito de `payload_automacao.efeitos` num
 * `ActiveEffect`, ou `null` quando o `tipo` está fora do mapeamento
 * (tratado em outro módulo, ou puramente sobre OUTRO alvo — ex.:
 * `modificador_recebido` descreve o bônus de quem ataca este
 * personagem, não um modificador nas próprias rolagens dele).
 */
function buildEffectFromPayload(
  condition: ActiveCondition,
  content: ConditionContent,
  efeito: ConditionEndRoundEffect,
  index: number,
): ActiveEffect | null {
  const base = {
    id: `${condition.id}:${index}`,
    sourceType: "condition" as const,
    sourceId: content.slug,
    sourceName: condition.nome,
    enabledByDefault: true,
    reversible: true as const,
  };

  switch (efeito.tipo) {
    case "modificador": {
      const valor = efeito.valor;
      const alvoTags = isStringArray(efeito.alvo_tags) ? efeito.alvo_tags : [];
      if (typeof valor !== "number" || alvoTags.length === 0) return null;
      const sinal = valor >= 0 ? "+" : "";
      if (efeito.quando != null) {
        // Efeito condicional (depende de alvo/contexto que a ficha
        // ainda não avalia, ex.: "dependem_de_visao") — preservado como
        // aviso, NUNCA somado como modificador incondicional (evita
        // aplicar um número indevido a rolagens que não se encaixam).
        return {
          ...base,
          affectedTags: alvoTags,
          modifier: 0,
          explanation: `${condition.nome}: ${sinal}${valor} em ${alvoTags.join(", ")} quando ${String(efeito.quando)} (condição de contexto ainda não avaliada automaticamente).`,
          kind: "warning",
        };
      }
      return {
        ...base,
        affectedTags: alvoTags,
        modifier: valor,
        explanation: `${condition.nome}: ${sinal}${valor} em ${alvoTags.join(", ")}.`,
        kind: "modifier",
      };
    }
    case "falha_automatica": {
      const alvoTags = isStringArray(efeito.alvo_tags) ? efeito.alvo_tags : [];
      if (alvoTags.length === 0) return null;
      return {
        ...base,
        affectedTags: alvoTags,
        modifier: 0,
        explanation: `${condition.nome}: testes de ${alvoTags.join(", ")} falham automaticamente.`,
        kind: "auto_fail",
      };
    }
    case "definir_deslocamento": {
      const valor = efeito.valor;
      if (typeof valor !== "number") return null;
      return {
        ...base,
        affectedTags: ["deslocamento"],
        modifier: 0,
        explanation: `${condition.nome}: deslocamento total ${valor} (aviso — sem automação de movimento ainda).`,
        kind: "warning",
      };
    }
    case "multiplicar_deslocamento": {
      const multiplicador = efeito.multiplicador;
      if (typeof multiplicador !== "number") return null;
      return {
        ...base,
        affectedTags: ["deslocamento"],
        modifier: 0,
        explanation: `${condition.nome}: deslocamento x${multiplicador} (aviso — sem automação de movimento ainda).`,
        kind: "warning",
      };
    }
    case "bloquear_acoes": {
      const alvoTags = isStringArray(efeito.alvo_tags) ? efeito.alvo_tags : [];
      return {
        ...base,
        affectedTags: alvoTags,
        modifier: 0,
        explanation: `${condition.nome}: não pode realizar ações.`,
        kind: "lock",
      };
    }
    case "bloquear_reacoes": {
      return {
        ...base,
        affectedTags: [],
        modifier: 0,
        explanation: `${condition.nome}: não pode realizar reações.`,
        kind: "lock",
      };
    }
    default:
      // modificador_recebido (sobre quem ataca o alvo, não sobre as
      // próprias rolagens dele), habilitar_acao, manter_condicao_no_alvo,
      // aplicar_condicao_associada/apos_tempo, dano_fim_de_rodada,
      // teste_fim_de_rodada*, teste_apos_exposicao, reduzir_pa,
      // remover_ao_recuperar_pv, exigir_teste_conjuracao,
      // alterar_custo_mana, morte_apos_tempo — fora do escopo de
      // ActiveEffect (já tratados em endRoundConditions.ts/
      // actionConsole.ts/autoHeal.ts, ou puramente narrativos).
      return null;
  }
}

function effectsForCondition(condition: ActiveCondition, conditionBySlug: Map<string, ConditionContent>): ActiveEffect[] {
  const slug = condition.conditionId ? normalizeConditionSlug(condition.conditionId) : undefined;
  const content = slug ? conditionBySlug.get(slug) : undefined;

  if (!content || content.status !== "published") {
    return fallbackWarning(condition);
  }

  const effects = getConditionEndRoundEffects(content)
    .map((efeito, index) => buildEffectFromPayload(condition, content, efeito, index))
    .filter((e): e is ActiveEffect => e !== null);

  return effects.length > 0 ? effects : fallbackWarning(condition);
}

/**
 * Deriva os efeitos ativos correntes do personagem a partir das
 * condições com `ativa: true` em `condicoes_ativas`, cruzando com o
 * catálogo de condições publicadas (`content_documents`,
 * content_type="condition") para ler `payload_automacao.efeitos`.
 * `conditions` ausente/vazio é um caso válido (ex.: catálogo ainda não
 * carregado) — todas as condições caem no aviso genérico, nunca
 * inventam modificador. Função pura — não lê nem escreve nada fora dos
 * argumentos recebidos. Chamar de novo sempre que `character.condicoes_ativas`
 * ou o catálogo mudarem (ver useMemo em CharacterSheetClient).
 */
export function deriveActiveEffectsFromConditions(
  character: Pick<Character, "condicoes_ativas">,
  conditions: ConditionContent[] = [],
): ActiveEffect[] {
  const conditionBySlug = new Map(conditions.map((c) => [normalizeConditionSlug(c.slug), c]));
  const condicoesAtivas = (character.condicoes_ativas ?? []).filter((c) => c.ativa);
  return condicoesAtivas.flatMap((c) => effectsForCondition(c, conditionBySlug));
}

/**
 * Motivo de bloqueio "falha automática" para um teste com estas tags —
 * `undefined` = liberado. Espelha `getConditionLockReason`
 * (`actionConsole.ts`) para o mesmo padrão de enforcement real: função
 * pura, chamada tanto para desabilitar o botão "Rolar" na UI quanto
 * como guard dentro do handler que executa a rolagem (defesa em
 * profundidade — RollsTab.tsx).
 */
export function getAutoFailReason(rollTags: string[], activeEffects: ActiveEffect[]): string | undefined {
  for (const effect of activeEffects) {
    if (effect.kind !== "auto_fail") continue;
    if (effect.affectedTags.some((tag) => rollTags.includes(tag))) return effect.explanation;
  }
  return undefined;
}
