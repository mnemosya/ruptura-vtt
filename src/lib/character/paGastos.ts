/**
 * Teto do contador de PA gastos (`estado_jogo.pa_gastos`).
 *
 * Agir sem PA continua permitido em todo o Console — os fluxos avisam,
 * não travam. O que não pode é o contador passar do PA da rodada: com
 * 34 gastos e 3 de máximo, o "+" do PA precisava de 31 cliques antes de
 * mostrar qualquer mudança. Então o gasto além do máximo simplesmente
 * não acumula (o PA fica em 0).
 *
 * O piso negativo é o crédito do Caçador (Reserva Tática conservada da
 * rodada anterior), que entra como PA extra.
 */
export function limitarPaGastos(gastos: number, paMax: number, credito = 0): number {
  const teto = Math.max(0, Math.trunc(paMax));
  return Math.min(teto, Math.max(credito > 0 ? -credito : 0, Math.trunc(gastos)));
}

/** Soma um gasto (ou devolução, se negativo) partindo do valor visível — um contador acima do teto é tratado como no teto. */
export function somarPaGastos(gastosAtuais: number, delta: number, paMax: number, credito = 0): number {
  return limitarPaGastos(Math.min(gastosAtuais, Math.max(0, Math.trunc(paMax))) + delta, paMax, credito);
}
