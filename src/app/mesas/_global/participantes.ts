/**
 * Texto gramatical de quem está na mesa agora. Cobre as seis
 * combinações que o aceite pede — narrador presente ou ausente, e zero,
 * um ou vários jogadores — porque "1 jogadores" e um plural mudo são
 * exatamente o tipo de detalhe que denuncia contagem improvisada.
 *
 * `undefined` não é zero: sem leitura, o hero admite que não sabe.
 */
export function textoDeParticipantes(narratorOnline?: boolean, playerCount?: number): string {
  if (narratorOnline === undefined || playerCount === undefined) {
    return "Não foi possível consultar quem está na mesa agora.";
  }
  const jogadores = playerCount === 0 ? "nenhum jogador"
    : playerCount === 1 ? "1 jogador" : `${playerCount} jogadores`;
  if (narratorOnline) {
    return playerCount === 0
      ? "Narrador na mesa; nenhum jogador conectado."
      : `Narrador na mesa e ${jogadores} ${playerCount === 1 ? "conectado" : "conectados"}.`;
  }
  return playerCount === 0
    ? "Ninguém conectado no momento; a sessão segue aberta."
    : `${jogadores} ${playerCount === 1 ? "conectado" : "conectados"}; narrador ausente.`;
}

