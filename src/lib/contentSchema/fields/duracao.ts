/**
 * Normalização de duração — a auditoria encontrou 4 formatos legados
 * (objeto em magias, string|null em condições, "qualquer coisa" em
 * efeitos de talento/item/runa/escalpo). Esta é a única função que deve
 * interpretar esses formatos; adapters nunca leem `duracao`/`duracao_padrao`
 * diretamente.
 */

import type { DuracaoCanonica, TipoDuracao } from "../types";

const TEXTO_PARA_TIPO: Array<{ padrao: RegExp; tipo: TipoDuracao }> = [
  { padrao: /instant/i, tipo: "instantaneo" },
  { padrao: /rodada/i, tipo: "rodadas" },
  { padrao: /turno/i, tipo: "turno" },
  { padrao: /cena/i, tipo: "cena" },
  { padrao: /combate/i, tipo: "combate" },
  { padrao: /manual/i, tipo: "manual" },
];

function tipoPorTexto(texto: string): TipoDuracao {
  for (const { padrao, tipo } of TEXTO_PARA_TIPO) {
    if (padrao.test(texto)) return tipo;
  }
  return "texto_narrativo";
}

/** Extrai `{valor, unidade}` de textos como "3 rodadas" ou "1 minuto". */
function parseValorUnidade(texto: string): { valor?: number; unidade?: string } {
  const match = texto.match(/(\d+)\s*([a-zãé]+)/i);
  if (!match) return {};
  return { valor: Number(match[1]), unidade: match[2].toLowerCase() };
}

/**
 * Normaliza qualquer representação legada de duração encontrada no
 * conteúdo real: objeto `{texto, sustentavel}` (magias), string ou
 * `null` (condições `duracao_padrao`), ou ausente (item/talento, quando
 * a duração vive dentro do próprio efeito).
 */
export function normalizarDuracao(bruto: unknown): DuracaoCanonica | undefined {
  if (bruto == null) return undefined;

  if (typeof bruto === "string") {
    const trimmed = bruto.trim();
    if (!trimmed) return undefined;
    return { tipo: tipoPorTexto(trimmed), texto: trimmed, ...parseValorUnidade(trimmed) };
  }

  if (typeof bruto === "object" && !Array.isArray(bruto)) {
    const obj = bruto as Record<string, unknown>;
    const texto = typeof obj.texto === "string" ? obj.texto : undefined;
    const sustentavel = typeof obj.sustentavel === "boolean" ? obj.sustentavel : undefined;
    if (texto) {
      return { tipo: tipoPorTexto(texto), texto, sustentavel, ...parseValorUnidade(texto) };
    }
    if (typeof obj.valor === "number" && typeof obj.unidade === "string") {
      return { tipo: tipoPorTexto(obj.unidade), valor: obj.valor, unidade: obj.unidade, sustentavel };
    }
    return { tipo: "desconhecido", sustentavel };
  }

  return { tipo: "desconhecido" };
}
