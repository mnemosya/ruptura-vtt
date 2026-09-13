/**
 * RPC de MONTAGEM DE CENÁRIO — a que não pode falhar em silêncio.
 *
 * Um check tem dois tipos de chamada, e confundi-los é como um teste
 * passa sem testar:
 *
 *   VERIFICAÇÃO — o que está sob julgamento. O erro é o resultado
 *                 (`recusa(...)` espera um; `criterio(...)` espera a
 *                 ausência de um). Já é conferido por construção.
 *
 *   MONTAGEM    — põe o mundo no estado que a verificação seguinte
 *                 pressupõe. Se falhar, a verificação continua rodando
 *                 e mede OUTRA COISA — em geral passando, porque o
 *                 estado que ela nega é justamente o que não chegou a
 *                 existir.
 *
 * Dois casos reais já aconteceram neste repositório:
 *
 *   • `check-vtt-imagens-servidor`, critério 26: o RPC que escondia a
 *     colocação era recusado por ambiguidade de sobrecarga, o caso não
 *     conferia, e por dois meses ele mediu o estado anterior;
 *   • `check-vtt-dividir-grupo`: mandar a Alma para as Catacumbas é
 *     montagem. Se falhasse, "Alma não ficou presa na cena arquivada"
 *     passaria sem que ela tivesse estado lá.
 *
 * `exigirRpc` não é rigor decorativo: é a diferença entre um check que
 * falha quando o mundo não colabora e um que mente.
 */

/** O formato mínimo que um builder do supabase-js devolve. */
interface RespostaRpc {
  data?: unknown;
  error?: { message: string } | null;
}

/**
 * Executa uma chamada de MONTAGEM e lança se ela for recusada.
 *
 * `PromiseLike` e não `Promise`: os builders do supabase-js são
 * thenables, não promises de verdade.
 */
export async function exigirRpc<T extends RespostaRpc>(
  rotulo: string,
  chamada: PromiseLike<T>,
): Promise<T> {
  const r = await chamada;
  if (r.error) {
    throw new Error(`montagem de cenário falhou — ${rotulo}: ${r.error.message}`);
  }
  return r;
}
