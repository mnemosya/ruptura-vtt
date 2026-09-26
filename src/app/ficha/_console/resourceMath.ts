/**
 * Interpretação da edição inline de recurso (PV/PE/Mana) no Console.
 *
 * Função única e pura para o campo `atual/máximo` aceitar três formas:
 *   - absoluto:  "8"   → 8
 *   - adição:    "+2"  → atual + 2
 *   - subtração: "-3"  → atual - 3
 *
 * Só inteiros. O resultado é limitado entre `min` (zero por padrão) e
 * `max`; o máximo NUNCA é alterado por esta operação. O piso é
 * parâmetro porque o PE desce abaixo de zero, até −⌈pe_max/2⌉ — ver
 * `pisoPeNegativo` em `lib/character/consoleMutations.ts`. Entrada
 * inválida devolve `{ ok: false }` para a UI dar feedback sem mexer
 * no personagem.
 */

export type ResourceEditResult = { ok: true; value: number } | { ok: false; reason: "vazio" | "formato" };

/** Aceita apenas dígitos, com um "+"/"-" opcional na frente. */
const PADRAO = /^([+-]?)(\d+)$/;

export function parseResourceEdit(raw: string, atual: number, max: number, min = 0): ResourceEditResult {
  const texto = raw.trim();
  if (texto === "") return { ok: false, reason: "vazio" };

  const m = PADRAO.exec(texto);
  if (!m) return { ok: false, reason: "formato" };

  const [, sinal, digitos] = m;
  const n = Number.parseInt(digitos, 10);
  if (!Number.isFinite(n)) return { ok: false, reason: "formato" };

  // "+N" e "-N" são relativos ao atual; sem sinal é absoluto.
  const bruto = sinal === "+" ? atual + n : sinal === "-" ? atual - n : n;

  const teto = Number.isFinite(max) && max > 0 ? Math.trunc(max) : 0;
  const piso = Number.isFinite(min) ? Math.trunc(min) : 0;
  return { ok: true, value: Math.max(piso, Math.min(teto, bruto)) };
}
