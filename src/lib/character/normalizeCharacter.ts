import type {
  ActiveCondition,
  Character,
  CharacterAttributes,
  CharacterGameState,
  CharacterMetadata,
  CharacterResources,
  ConditionEffectHistoryEntry,
  ConditionResistanceCheck,
  DerivedStats,
  EvolutionHistoryEntry,
  PendingRuptureChoice,
  RuptureResolvedEntry,
} from "./types";

const DEFAULT_NOME = "Personagem sem nome";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Normaliza um payload de personagem vindo do banco (ou de qualquer
 * fonte externa), aceitando payload antigo/incompleto sem quebrar.
 *
 * Regras:
 *   - não inventa mecânicas: só preenche o que já existe no schema
 *     atual (nome, atributos, perícias, recursos_atuais, metadados);
 *   - não apaga campos desconhecidos do payload — eles são preservados
 *     via spread, para sobreviver a uma futura adição de inventário/
 *     magia/combate sem perder dados já gravados;
 *   - se `derived` for passado, preenche em recursos_atuais somente os
 *     valores AUSENTES (pv/pe/mana/integridade) com os _max
 *     correspondentes — nunca sobrescreve um valor que já existia;
 *   - garante estado_jogo (pa_gastos/reacoes_usadas) com padrão 0 quando
 *     ausente, preservando campos desconhecidos dentro do objeto e
 *     qualquer valor já existente (nunca reseta um contador salvo).
 */
export function normalizeCharacter(character: unknown, derived?: DerivedStats): Character {
  const raw = isPlainObject(character) ? character : {};

  const nome = typeof raw.nome === "string" && raw.nome.trim() !== "" ? raw.nome : DEFAULT_NOME;

  const atributosRaw = isPlainObject(raw.atributos) ? raw.atributos : {};
  const atributos: CharacterAttributes = {
    corpo: typeof atributosRaw.corpo === "number" ? atributosRaw.corpo : 1,
    mente: typeof atributosRaw.mente === "number" ? atributosRaw.mente : 1,
    animo: typeof atributosRaw.animo === "number" ? atributosRaw.animo : 1,
  };

  const pericias: Record<string, number> = isPlainObject(raw.pericias)
    ? { ...(raw.pericias as Record<string, number>) }
    : {};

  const metadadosRaw = isPlainObject(raw.metadados) ? raw.metadados : {};
  const metadados: CharacterMetadata = {
    ...metadadosRaw,
    schema_version: typeof metadadosRaw.schema_version === "number" ? metadadosRaw.schema_version : 1,
  };

  const recursosRaw = isPlainObject(raw.recursos_atuais) ? raw.recursos_atuais : {};
  const recursos_atuais: CharacterResources = { ...(recursosRaw as CharacterResources) };
  if (derived) {
    if (recursos_atuais.pv === undefined && typeof derived.pv_max === "number") {
      recursos_atuais.pv = derived.pv_max;
    }
    if (recursos_atuais.pe === undefined && typeof derived.pe_max === "number") {
      recursos_atuais.pe = derived.pe_max;
    }
    if (recursos_atuais.mana === undefined && typeof derived.mana_max === "number") {
      recursos_atuais.mana = derived.mana_max;
    }
    if (recursos_atuais.integridade === undefined && typeof derived.integridade_max === "number") {
      recursos_atuais.integridade = derived.integridade_max;
    }
  }
  // pv_temporario/mana_temporaria (checkpoint v0.36, PRD 10.2/10.3):
  // ausência vira 0, nunca undefined — para o descanso longo sempre
  // ter um número para zerar/comparar, mesmo em payload antigo.
  if (recursos_atuais.pv_temporario === undefined) recursos_atuais.pv_temporario = 0;
  if (recursos_atuais.mana_temporaria === undefined) recursos_atuais.mana_temporaria = 0;

  const estadoJogoRaw = isPlainObject(raw.estado_jogo) ? raw.estado_jogo : {};
  const estado_jogo: CharacterGameState = {
    ...estadoJogoRaw,
    pa_gastos: typeof estadoJogoRaw.pa_gastos === "number" ? estadoJogoRaw.pa_gastos : 0,
    reacoes_usadas: typeof estadoJogoRaw.reacoes_usadas === "number" ? estadoJogoRaw.reacoes_usadas : 0,
    defesas_sem_reacao:
      typeof estadoJogoRaw.defesas_sem_reacao === "number" &&
      Number.isFinite(estadoJogoRaw.defesas_sem_reacao) &&
      estadoJogoRaw.defesas_sem_reacao >= 0
        ? Math.trunc(estadoJogoRaw.defesas_sem_reacao)
        : 0,
  };

  // condicoes_ativas (checkpoint v0.32): array livre, sem inventar
  // entradas — só garante que é sempre um array (payload antigo sem o
  // campo vira []), preservando qualquer entrada já existente como-é.
  const condicoes_ativas: ActiveCondition[] = Array.isArray(raw.condicoes_ativas)
    ? (raw.condicoes_ativas as ActiveCondition[])
    : [];

  // sobrecarga_usada_dia (checkpoint v0.36, PRD 10.5): mesmo critério —
  // ausência vira 0, nunca undefined.
  const sobrecarga_usada_dia =
    typeof raw.sobrecarga_usada_dia === "number" ? raw.sobrecarga_usada_dia : 0;

  // pm_total/pm_disponivel/historico_evolucao (checkpoint v0.40, PRD
  // 3.3/4.3): mesmo critério — ausência vira 0/[], nunca undefined.
  const pm_total = typeof raw.pm_total === "number" ? raw.pm_total : 0;
  const pm_disponivel = typeof raw.pm_disponivel === "number" ? raw.pm_disponivel : 0;
  const historico_evolucao: EvolutionHistoryEntry[] = Array.isArray(raw.historico_evolucao)
    ? (raw.historico_evolucao as EvolutionHistoryEntry[])
    : [];

  // pending_condition_checks/condition_effect_history/current_round/
  // current_scene (checkpoint v0.44): mesmo critério dos demais campos
  // operacionais — payload antigo sem eles vira array/objeto vazio e
  // rodada/cena 1, nunca undefined (para o motor de fim de rodada
  // sempre ter algo consistente para ler/comparar).
  const pending_condition_checks: ConditionResistanceCheck[] = Array.isArray(raw.pending_condition_checks)
    ? (raw.pending_condition_checks as ConditionResistanceCheck[])
    : [];
  const condition_effect_history: Record<string, ConditionEffectHistoryEntry> = isPlainObject(
    raw.condition_effect_history,
  )
    ? (raw.condition_effect_history as Record<string, ConditionEffectHistoryEntry>)
    : {};
  const current_round =
    typeof raw.current_round === "number" && Number.isFinite(raw.current_round) && raw.current_round >= 1
      ? Math.trunc(raw.current_round)
      : 1;
  const current_scene =
    typeof raw.current_scene === "number" && Number.isFinite(raw.current_scene) && raw.current_scene >= 1
      ? Math.trunc(raw.current_scene)
      : 1;

  // mana_bonus_ruptura/pending_rupture_choices/ultima_vontade_pendente/
  // historico_ruptura (checkpoint v0.45): mesmo critério — ausência
  // vira 0/[]/false, nunca undefined.
  const mana_bonus_ruptura =
    typeof raw.mana_bonus_ruptura === "number" && Number.isFinite(raw.mana_bonus_ruptura) && raw.mana_bonus_ruptura >= 0
      ? raw.mana_bonus_ruptura
      : 0;
  const pending_rupture_choices: PendingRuptureChoice[] = Array.isArray(raw.pending_rupture_choices)
    ? (raw.pending_rupture_choices as PendingRuptureChoice[])
    : [];
  const ultima_vontade_pendente = raw.ultima_vontade_pendente === true;
  const historico_ruptura: RuptureResolvedEntry[] = Array.isArray(raw.historico_ruptura)
    ? (raw.historico_ruptura as RuptureResolvedEntry[])
    : [];

  return {
    ...raw,
    nome,
    atributos,
    pericias,
    recursos_atuais,
    metadados,
    estado_jogo,
    condicoes_ativas,
    sobrecarga_usada_dia,
    pm_total,
    pm_disponivel,
    historico_evolucao,
    pending_condition_checks,
    condition_effect_history,
    current_round,
    current_scene,
    mana_bonus_ruptura,
    pending_rupture_choices,
    ultima_vontade_pendente,
    historico_ruptura,
  } as Character;
}
