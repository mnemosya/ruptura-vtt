/** Lista e faixas do capítulo 19, Integridade, da v1.2. */
export const DISTORCOES_IDENTIDADE = [
  { id: "desconexao_emocional", nome: "Desconexão emocional" },
  { id: "ritualismo", nome: "Ritualismo" },
  { id: "euforia_estranha", nome: "Euforia estranha" },
  { id: "apegos_estranhos", nome: "Apegos estranhos" },
  { id: "vozes_da_memoria", nome: "Vozes da memória" },
  { id: "dissociacao", nome: "Dissociação" },
  { id: "desrealizacao", nome: "Desrealização" },
  { id: "raiva_sem_direcao", nome: "Raiva sem direção" },
  { id: "compulsao_de_poder", nome: "Compulsão de poder" },
  { id: "presenca_dupla", nome: "Presença dupla" },
] as const;

export function quantidadeDistorcoesIdentidade(integridade: number): number {
  if (integridade >= 7) return 0;
  if (integridade >= 5) return 1;
  if (integridade >= 3) return 2;
  return 3;
}

export function distorcaoConhecida(id: string): boolean {
  return DISTORCOES_IDENTIDADE.some((distorcao) => distorcao.id === id);
}
