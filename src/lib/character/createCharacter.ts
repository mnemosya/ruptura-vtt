import type { Character, CharacterRulesPayload } from "./types";

const DEFAULT_NOME = "Novo Personagem";
/** Usado só se regras.criacao_personagem.atributos.valor_inicial não vier no payload. */
const FALLBACK_VALOR_INICIAL_ATRIBUTO = 1;

/**
 * Cria o estado inicial de um personagem usando os valores de partida
 * definidos em regras_personagem.criacao_personagem (valor inicial de
 * atributo) e o valor_minimo de cada perícia — não um número inventado.
 *
 * Não aplica o sistema de pontos de criação (point-buy) ainda; isso é
 * escopo de personagem completo, fora da ficha mínima.
 *
 * recursos_atuais começa vazio: nesta etapa createInitialCharacter não
 * tem acesso aos derivados calculados (depende de computeDerivedStats,
 * que roda na UI), então não inventa valores — quem preenche
 * recursos_atuais com os _max corretos é normalizeCharacter() na hora
 * de salvar (ver storage.ts/CharacterSheetClient).
 */
export function createInitialCharacter(
  regras: CharacterRulesPayload | null,
  nome: string = DEFAULT_NOME,
): Character {
  const valorInicial =
    regras?.criacao_personagem?.atributos?.valor_inicial ?? FALLBACK_VALOR_INICIAL_ATRIBUTO;

  const pericias: Record<string, number> = {};
  for (const skill of regras?.pericias ?? []) {
    pericias[skill.id] = skill.valor_minimo ?? 0;
  }

  return {
    nome,
    atributos: {
      corpo: valorInicial,
      mente: valorInicial,
      animo: valorInicial,
    },
    pericias,
    recursos_atuais: {},
    estado_jogo: {
      pa_gastos: 0,
      reacoes_usadas: 0,
    },
    metadados: {
      schema_version: 1,
      criado_em: new Date().toISOString(),
    },
  };
}
