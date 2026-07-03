import { computeDerivedStats } from "./derived";
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
 * recursos_atuais já nasce preenchido com os _max calculados aqui
 * (checkpoint v0.45.1 — antes ficava `{}` até o primeiro
 * normalizeCharacter()/save, e a ficha mostrava "Integridade 0"/"fim
 * da ficha" para um personagem novo por ausência de campo, não por
 * estado real). `computeDerivedStats` já cai no fallback fixo do PRD
 * (`derived.fallback.ts`) quando `regras` é null/incompleto.
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

  const atributos = {
    corpo: valorInicial,
    mente: valorInicial,
    animo: valorInicial,
  };
  const derived = computeDerivedStats(atributos, regras);

  return {
    nome,
    atributos,
    pericias,
    recursos_atuais: {
      pv: derived.pv_max,
      pe: derived.pe_max,
      mana: derived.mana_max,
      integridade: derived.integridade_max,
    },
    estado_jogo: {
      pa_gastos: 0,
      reacoes_usadas: 0,
      defesas_sem_reacao: 0,
    },
    metadados: {
      schema_version: 1,
      criado_em: new Date().toISOString(),
    },
  };
}
