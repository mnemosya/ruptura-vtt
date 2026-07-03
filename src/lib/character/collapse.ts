/**
 * Colapso por PV/PE 0 — checkpoint v0.38 (PRD 10.7), completado com o
 * ciclo automático de fim de rodada no checkpoint v0.51 (achado A3 da
 * auditoria v0.50).
 *
 * v0.38: detecta o início (PV ou PE cai a 0) e o fim por cura (PV ou PE
 * volta a 1+), aplica/remove Inconsciente via o sistema de condições já
 * existente (v0.32), e oferece avanço manual de segmento + estabilização.
 *
 * v0.51 (`resolveCollapseEndRound`): teste automático de fim de rodada
 * (Corpo se colapso de PV, Mente se de PE), avanço de segmento em falha,
 * e desfecho de morte/coma no 3º segmento — TUDO derivado da regra
 * canônica `regras_personagem.colapso`
 * (`db_regras_personagem_normalizado_v1_4.json`), nunca de limiares
 * hardcoded aqui. Função pura com RNG injetável (mesmo padrão de
 * `applyConditionEndRoundDamage`), sem tabela de regra paralela.
 */

import type { ActiveCondition, Character, CollapseRulesPayload } from "./types";

/** Marcador de 3 segmentos do Colapso (PRD 10.7) — exportado para a UI nunca repetir o número mágico. */
export const MAX_COLLAPSE_SEGMENTS = 3;

const COLLAPSE_INCONSCIENTE_ORIGENS = ["Colapso (PV a 0)", "Colapso (PE a 0)"] as const;

function buildCollapseInconsciente(nowIso: string, tipo: "pv" | "pe"): ActiveCondition {
  return {
    id: crypto.randomUUID(),
    conditionId: "inconsciente",
    nome: "Inconsciente",
    descricao: "Caído + sem ação ou reação.",
    origem: tipo === "pv" ? "Colapso (PV a 0)" : "Colapso (PE a 0)",
    duracao: "Enquanto o colapso estiver ativo",
    aplicadaEm: nowIso,
    removidaEm: null,
    ativa: true,
  };
}

/** Remove só o Inconsciente que o PRÓPRIO colapso aplicou — nunca um Inconsciente aplicado manualmente por outro motivo. */
function endCollapseInconsciente(condicoes: ActiveCondition[], nowIso: string): ActiveCondition[] {
  return condicoes.map((c) =>
    c.ativa && c.conditionId === "inconsciente" && (COLLAPSE_INCONSCIENTE_ORIGENS as readonly string[]).includes(c.origem ?? "")
      ? { ...c, ativa: false, removidaEm: nowIso }
      : c,
  );
}

export interface ResourceSnapshot {
  pv: number;
  pe: number;
}

export interface CollapseDetectionResult {
  character: Character;
  started: boolean;
  ended: boolean;
  tipo: "pv" | "pe" | null;
  warnings: string[];
}

/**
 * Detecta início/fim de colapso a partir de uma variação de PV/PE.
 * Início: recurso cai de >0 para <=0, sem colapso já ativo. Fim (cura):
 * o recurso do TIPO já colapsado sobe de <=0 para 1+ — encerra e marca
 * `cicatrizPendente: true`. Se já há colapso ativo de um tipo e o
 * OUTRO recurso também cai a 0, isso não inicia um segundo colapso
 * (PRD não descreve colapso duplo) — fica registrado como warning.
 */
export function detectCollapseOnResourceChange(
  character: Character,
  before: ResourceSnapshot,
  after: ResourceSnapshot,
  nowIso: string,
): CollapseDetectionResult {
  const colapso = character.colapso;
  const warnings: string[] = [];

  if (!colapso || !colapso.ativo) {
    if (before.pv > 0 && after.pv <= 0) {
      return {
        character: {
          ...character,
          colapso: { ativo: true, tipo: "pv", segmentos: 0, estabilizado: false, iniciadoEm: nowIso, encerradoEm: null, cicatrizPendente: false, ultimoEvento: "iniciado_pv" },
          condicoes_ativas: [...(character.condicoes_ativas ?? []), buildCollapseInconsciente(nowIso, "pv")],
        },
        started: true,
        ended: false,
        tipo: "pv",
        warnings,
      };
    }
    if (before.pe > 0 && after.pe <= 0) {
      return {
        character: {
          ...character,
          colapso: { ativo: true, tipo: "pe", segmentos: 0, estabilizado: false, iniciadoEm: nowIso, encerradoEm: null, cicatrizPendente: false, ultimoEvento: "iniciado_pe" },
          condicoes_ativas: [...(character.condicoes_ativas ?? []), buildCollapseInconsciente(nowIso, "pe")],
        },
        started: true,
        ended: false,
        tipo: "pe",
        warnings,
      };
    }
    return { character, started: false, ended: false, tipo: null, warnings };
  }

  // Colapso já ativo — checa cura do mesmo tipo.
  if (colapso.tipo === "pv" && before.pv <= 0 && after.pv >= 1) {
    return { character: endCollapseByHealing(character, nowIso), started: false, ended: true, tipo: "pv", warnings };
  }
  if (colapso.tipo === "pe" && before.pe <= 0 && after.pe >= 1) {
    return { character: endCollapseByHealing(character, nowIso), started: false, ended: true, tipo: "pe", warnings };
  }

  if (colapso.tipo === "pv" && before.pe > 0 && after.pe <= 0) {
    warnings.push("PE também caiu a 0 durante um colapso de PV já ativo — sem regra de colapso duplo no PRD; nada foi alterado além do registrado.");
  }
  if (colapso.tipo === "pe" && before.pv > 0 && after.pv <= 0) {
    warnings.push("PV também caiu a 0 durante um colapso de PE já ativo — sem regra de colapso duplo no PRD; nada foi alterado além do registrado.");
  }

  return { character, started: false, ended: false, tipo: null, warnings };
}

/** Avança 1 segmento (máx. 3) do colapso ativo — sempre manual (sem fim de rodada automático ainda). */
export interface AdvanceSegmentResult {
  character: Character;
  segmentos: number;
  thirdSegmentReached: boolean;
  warnings: string[];
}

export function advanceCollapseSegment(character: Character, reason: string, nowIso: string): AdvanceSegmentResult {
  const colapso = character.colapso;
  if (!colapso || !colapso.ativo) {
    return { character, segmentos: colapso?.segmentos ?? 0, thirdSegmentReached: false, warnings: ["Nenhum colapso ativo — nada avançado."] };
  }
  const segmentos = Math.min(MAX_COLLAPSE_SEGMENTS, colapso.segmentos + 1);
  const thirdSegmentReached = segmentos >= MAX_COLLAPSE_SEGMENTS;
  const warnings: string[] = [];
  if (thirdSegmentReached) {
    warnings.push(
      colapso.tipo === "pv"
        ? "3º segmento atingido — risco de morte (PRD 10.7). Resolução final (morte) não automatizada; registre manualmente."
        : "3º segmento atingido — risco de coma/fora de jogo (PRD 10.7). Resolução final não automatizada; registre manualmente.",
    );
  }
  return {
    character: { ...character, colapso: { ...colapso, segmentos, ultimoEvento: `avancado:${reason}` } },
    segmentos,
    thirdSegmentReached,
    warnings,
  };
}

/** Estabilizar interrompe o avanço de segmento — NÃO cura, NÃO remove Inconsciente (regra explícita do PRD). */
export function stabilizeCollapse(character: Character, nowIso: string): Character {
  if (!character.colapso?.ativo) return character;
  return { ...character, colapso: { ...character.colapso, estabilizado: true, ultimoEvento: "estabilizado" } };
}

/** Encerra o colapso por cura (1+ no recurso colapsado) — remove só o Inconsciente aplicado pelo colapso e marca cicatriz pendente. */
export function endCollapseByHealing(character: Character, nowIso: string): Character {
  if (!character.colapso?.ativo) return character;
  return {
    ...character,
    colapso: { ...character.colapso, ativo: false, encerradoEm: nowIso, cicatrizPendente: true, ultimoEvento: "encerrado_cura" },
    condicoes_ativas: endCollapseInconsciente(character.condicoes_ativas ?? [], nowIso),
  };
}

// ---------------------------------------------------------------------
// Fim de rodada automático (checkpoint v0.51) — teste/avanço/desfecho
// data-driven a partir de `regras_personagem.colapso`.
// ---------------------------------------------------------------------

/** Rola "maior de Nd8" (teste de atributo puro do Ruptura, PRD 6.x) com RNG injetável. */
function rollHighestD8(quantidade: number, rng: () => number): { dados: number[]; maior: number } {
  const n = Math.max(0, Math.trunc(quantidade));
  const dados = Array.from({ length: n }, () => 1 + Math.floor(rng() * 8));
  return { dados, maior: dados.length > 0 ? Math.max(...dados) : 0 };
}

/**
 * Extrai o limiar do teste imediato do 3º segmento do NOME da chave
 * `resultado_N` do payload (ex.: `terceiro_segmento.resultado_8` → 8) —
 * o "8" mora no conteúdo canônico, não no código. Devolve `null` se a
 * regra não declarar essa chave (fallback defensivo).
 */
export function parseTerceiroSegmentoThreshold(rules: CollapseRulesPayload | null | undefined): number | null {
  const ts = rules?.terceiro_segmento;
  if (!ts) return null;
  for (const key of Object.keys(ts)) {
    const match = /^resultado_(\d+)$/.exec(key);
    if (match) return Number(match[1]);
  }
  return null;
}

export type CollapseEndRoundOutcome =
  | "no_collapse" // sem colapso ativo — nenhum teste.
  | "stabilized" // estabilizado — avanço interrompido, sem teste (PRD 10.7).
  | "no_rule" // regra canônica ausente/incompleta — fallback defensivo, nada aplicado.
  | "maintained" // teste ≥ limiar — segmento mantido.
  | "advanced" // falha — avançou 1 segmento (ainda antes do 3º).
  | "third_segment_survived" // no 3º segmento, teste imediato ≥ limiar — mantém por mais uma rodada.
  | "death" // 3º segmento, falha, colapso de PV (físico).
  | "coma"; // 3º segmento, falha, colapso de PE (mental).

export interface CollapseEndRoundTableLog {
  type: string;
  payload: Record<string, unknown>;
}

export interface CollapseEndRoundResult {
  character: Character;
  outcome: CollapseEndRoundOutcome;
  tipo: "pv" | "pe" | null;
  atributo?: string;
  rollDados?: number[];
  rollTotal?: number;
  threshold?: number;
  segmentosBefore: number;
  segmentosAfter: number;
  logs: string[];
  tableLogs: CollapseEndRoundTableLog[];
  warnings: string[];
}

/** Mapeia o desfecho textual do payload (`falha[tipo]`) para o enum interno. */
function mapDesfecho(falhaValor: string | undefined, tipo: "pv" | "pe"): "morte" | "coma" {
  if (falhaValor === "morte") return "morte";
  if (falhaValor && falhaValor.startsWith("coma")) return "coma";
  // Fallback defensivo alinhado ao tipo do gatilho, se o texto do payload variar.
  return tipo === "pv" ? "morte" : "coma";
}

/**
 * Resolve o teste imediato do 3º segmento (PRD 10.7: "8 mantém por mais
 * uma rodada; falha encerra → PV morte / PE coma"). Chamado tanto quando
 * uma falha regular ACABA de empurrar ao 3º segmento (`teste_imediato`)
 * quanto quando o personagem já estava no 3º de uma rodada anterior.
 */
function resolveThirdSegmentTest(params: {
  character: Character;
  colapso: NonNullable<Character["colapso"]>;
  rules: CollapseRulesPayload;
  gatilho: NonNullable<CollapseRulesPayload["gatilhos"]>[number];
  atributoId: string;
  atributoValor: number;
  segmentos: number;
  round: number;
  scene: number;
  nowIso: string;
  rng: () => number;
}): CollapseEndRoundResult {
  const { character, colapso, rules, gatilho, atributoId, atributoValor, segmentos, round, scene, nowIso, rng } = params;
  const tipo = colapso.tipo === "pe" ? "pe" : "pv";
  const threshold = parseTerceiroSegmentoThreshold(rules);

  if (threshold == null) {
    return {
      character,
      outcome: "no_rule",
      tipo,
      segmentosBefore: colapso.segmentos,
      segmentosAfter: segmentos,
      logs: [],
      tableLogs: [],
      warnings: ["Regra do 3º segmento de Colapso sem limiar (`resultado_N`) no payload — desfecho não resolvido automaticamente."],
    };
  }

  const { dados, maior } = rollHighestD8(atributoValor, rng);
  const mantem = maior >= threshold;
  const recursoLabel = tipo === "pv" ? "Corpo" : "Mente";

  if (mantem) {
    const nextColapso = { ...colapso, segmentos, ultimoEvento: "terceiro_segmento_mantido" };
    return {
      character: { ...character, colapso: nextColapso },
      outcome: "third_segment_survived",
      tipo,
      atributo: atributoId,
      rollDados: dados,
      rollTotal: maior,
      threshold,
      segmentosBefore: colapso.segmentos,
      segmentosAfter: segmentos,
      logs: [`Colapso (${tipo.toUpperCase()}): 3º segmento — teste de ${recursoLabel} ${maior} ≥ ${threshold}, mantém por mais uma rodada.`],
      tableLogs: [
        {
          type: "collapse_third_segment_test",
          payload: { tipo, atributo: atributoId, rollTotal: maior, threshold, result: "survived", segmentos, round, scene },
        },
      ],
      warnings: [],
    };
  }

  // Desfecho vem do payload canônico: `terceiro_segmento.falha[gatilho.tipo]`
  // (ex.: fisico → "morte", mental → "coma_profundo_fora_de_jogo").
  const desfecho = mapDesfecho(rules.terceiro_segmento?.falha?.[gatilho.tipo], tipo);
  const nextColapso = {
    ...colapso,
    segmentos,
    ativo: false,
    desfecho,
    encerradoEm: nowIso,
    ultimoEvento: desfecho === "morte" ? "desfecho_morte" : "desfecho_coma",
  };
  const desfechoLabel = desfecho === "morte" ? "morte" : "coma / fora de jogo";
  return {
    character: { ...character, colapso: nextColapso },
    outcome: desfecho === "morte" ? "death" : "coma",
    tipo,
    atributo: atributoId,
    rollDados: dados,
    rollTotal: maior,
    threshold,
    segmentosBefore: colapso.segmentos,
    segmentosAfter: segmentos,
    logs: [`Colapso (${tipo.toUpperCase()}): 3º segmento — teste de ${recursoLabel} ${maior} < ${threshold} → ${desfechoLabel}.`],
    tableLogs: [
      {
        type: "collapse_outcome",
        payload: { tipo, atributo: atributoId, rollTotal: maior, threshold, desfecho, segmentos, round, scene },
      },
    ],
    warnings: [`${desfecho === "morte" ? "Morte" : "Coma"} por Colapso (${tipo.toUpperCase()}) — resolução narrativa final a cargo do narrador.`],
  };
}

/**
 * Resolve o Colapso no fim de rodada a partir da regra canônica
 * `regras_personagem.colapso`. Ordem de decisão:
 *   - sem colapso ativo → nada;
 *   - estabilizado → avanço interrompido (PRD), sem teste;
 *   - sem regra/gatilho canônico para o recurso → fallback defensivo
 *     (não inventa teste);
 *   - já no último segmento → teste imediato do 3º segmento (8+ mantém);
 *   - senão → teste regular (Corpo/Mente); ≥ `falha_se_menor_que` mantém,
 *     abaixo avança 1 segmento; se o avanço atingir o último segmento,
 *     dispara o teste imediato na mesma resolução (`teste_imediato`).
 * Puro: não persiste nada, RNG injetável. NÃO inicia colapso novo (isso
 * é `detectCollapseOnResourceChange`) nem processa "dano adicional da
 * mesma dimensão" (ver pendência no relatório) — só o ciclo de teste.
 */
export function resolveCollapseEndRound(params: {
  character: Character;
  rules: CollapseRulesPayload | null | undefined;
  round: number;
  scene: number;
  nowIso: string;
  rng?: () => number;
}): CollapseEndRoundResult {
  const { character, rules, round, scene, nowIso } = params;
  const rng = params.rng ?? Math.random;
  const colapso = character.colapso;
  const segBefore = colapso?.segmentos ?? 0;
  const tipo: "pv" | "pe" | null = colapso?.tipo === "pe" ? "pe" : colapso?.tipo === "pv" ? "pv" : null;

  const base = {
    character,
    tipo,
    segmentosBefore: segBefore,
    segmentosAfter: segBefore,
    logs: [] as string[],
    tableLogs: [] as CollapseEndRoundTableLog[],
    warnings: [] as string[],
  };

  if (!colapso || !colapso.ativo || tipo == null) {
    return { ...base, outcome: "no_collapse" };
  }
  if (colapso.estabilizado) {
    return { ...base, outcome: "stabilized", logs: [`Colapso (${tipo.toUpperCase()}) estabilizado — sem teste de fim de rodada (avanço interrompido).`] };
  }

  const gatilho = (rules?.gatilhos ?? []).find((g) => g.recurso === tipo);
  const teste = gatilho?.teste_fim_rodada;
  if (!gatilho || !teste || typeof teste.atributo !== "string" || typeof teste.falha_se_menor_que !== "number") {
    return { ...base, outcome: "no_rule", warnings: [`Sem regra canônica de Colapso para o recurso "${tipo}" — nenhum teste automático aplicado.`] };
  }

  const maxSegments = typeof rules?.segmentos === "number" && rules.segmentos > 0 ? rules.segmentos : MAX_COLLAPSE_SEGMENTS;
  const atributoId = teste.atributo; // "corpo" | "mente"
  const atributoValor = (character.atributos as unknown as Record<string, number>)[atributoId] ?? 0;
  const recursoLabel = tipo === "pv" ? "Corpo" : "Mente";

  // Já no último segmento (sobreviveu ao teste imediato numa rodada anterior) — reteste imediato.
  if (segBefore >= maxSegments) {
    return resolveThirdSegmentTest({
      character, colapso, rules: rules!, gatilho, atributoId, atributoValor, segmentos: segBefore, round, scene, nowIso, rng,
    });
  }

  // Teste regular de fim de rodada.
  const threshold = teste.falha_se_menor_que;
  const { dados, maior } = rollHighestD8(atributoValor, rng);

  if (maior >= threshold) {
    const nextColapso = { ...colapso, ultimoEvento: "fim_rodada_mantido" };
    return {
      ...base,
      character: { ...character, colapso: nextColapso },
      outcome: "maintained",
      atributo: atributoId,
      rollDados: dados,
      rollTotal: maior,
      threshold,
      logs: [`Colapso (${tipo.toUpperCase()}): teste de ${recursoLabel} ${maior} ≥ ${threshold}, segmento mantido (${segBefore}/${maxSegments}).`],
      tableLogs: [
        { type: "collapse_end_round_test", payload: { tipo, atributo: atributoId, rollTotal: maior, threshold, result: "maintained", segmentos: segBefore, round, scene } },
      ],
    };
  }

  // Falha — avança 1 segmento.
  const segAfter = Math.min(maxSegments, segBefore + 1);
  const advancedColapso = { ...colapso, segmentos: segAfter, ultimoEvento: "fim_rodada_avancado" };
  const advancedCharacter: Character = { ...character, colapso: advancedColapso };

  // Se o avanço atingiu o último segmento, o 3º segmento tem teste imediato.
  if (segAfter >= maxSegments) {
    const immediate = resolveThirdSegmentTest({
      character: advancedCharacter, colapso: advancedColapso, rules: rules!, gatilho, atributoId, atributoValor, segmentos: segAfter, round, scene, nowIso, rng,
    });
    return {
      ...immediate,
      segmentosBefore: segBefore,
      logs: [
        `Colapso (${tipo.toUpperCase()}): teste de ${recursoLabel} ${maior} < ${threshold} → avança ao 3º segmento (${segAfter}/${maxSegments}).`,
        ...immediate.logs,
      ],
      tableLogs: [
        { type: "collapse_end_round_test", payload: { tipo, atributo: atributoId, rollTotal: maior, threshold, result: "advanced", segmentos: segAfter, round, scene } },
        ...immediate.tableLogs,
      ],
    };
  }

  return {
    ...base,
    character: advancedCharacter,
    outcome: "advanced",
    atributo: atributoId,
    rollDados: dados,
    rollTotal: maior,
    threshold,
    segmentosAfter: segAfter,
    logs: [`Colapso (${tipo.toUpperCase()}): teste de ${recursoLabel} ${maior} < ${threshold} → avança segmento (${segAfter}/${maxSegments}).`],
    tableLogs: [
      { type: "collapse_end_round_test", payload: { tipo, atributo: atributoId, rollTotal: maior, threshold, result: "advanced", segmentos: segAfter, round, scene } },
    ],
  };
}
