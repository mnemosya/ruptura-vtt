import type {
  ActiveCondition,
  Character,
  CharacterAttributes,
  CharacterGameState,
  CharacterMetadata,
  CharacterResources,
  DerivedStats,
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

  const estadoJogoRaw = isPlainObject(raw.estado_jogo) ? raw.estado_jogo : {};
  const estado_jogo: CharacterGameState = {
    ...estadoJogoRaw,
    pa_gastos: typeof estadoJogoRaw.pa_gastos === "number" ? estadoJogoRaw.pa_gastos : 0,
    reacoes_usadas: typeof estadoJogoRaw.reacoes_usadas === "number" ? estadoJogoRaw.reacoes_usadas : 0,
  };

  // condicoes_ativas (checkpoint v0.32): array livre, sem inventar
  // entradas — só garante que é sempre um array (payload antigo sem o
  // campo vira []), preservando qualquer entrada já existente como-é.
  const condicoes_ativas: ActiveCondition[] = Array.isArray(raw.condicoes_ativas)
    ? (raw.condicoes_ativas as ActiveCondition[])
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
  } as Character;
}
