/** Marcações do Calendário Imperial: lembretes, prazos, eventos e memórias da mesa. */
export const TIPOS_MARCACAO = ["lembrete", "prazo", "evento", "memoria"] as const;
export const VISIBILIDADES_MARCACAO = ["mesa", "privada", "narrador"] as const;
export type TipoMarcacao = typeof TIPOS_MARCACAO[number];
export type VisibilidadeMarcacao = typeof VISIBILIDADES_MARCACAO[number];
export const NOMES_TIPO_MARCACAO: Record<TipoMarcacao, string> = { lembrete: "Lembrete", prazo: "Prazo", evento: "Evento", memoria: "Memória" };
export const NOMES_VISIBILIDADE: Record<VisibilidadeMarcacao, string> = { mesa: "Mesa", privada: "Só eu", narrador: "Eu + narrador" };
export const TITULO_MARCACAO_MAX = 120;

export interface MarcacaoCalendario {
  id: string; ano: number; mes: number; dia: number;
  tipo: TipoMarcacao; titulo: string; visibilidade: VisibilidadeMarcacao; oficial: boolean;
  autorId: string; autorNome: string;
}
export interface NovaMarcacao {
  ano: number; mes: number; dia: number; tipo: TipoMarcacao; titulo: string; visibilidade: VisibilidadeMarcacao;
}

export function validarNovaMarcacao(m: NovaMarcacao): string | null {
  if (!m || typeof m !== "object") return "Marcação inválida.";
  if (!Number.isInteger(m.ano) || m.ano < 0 || m.ano > 9999) return "Ano inválido.";
  if (!Number.isInteger(m.mes) || m.mes < 1 || m.mes > 12) return "Mês inválido.";
  if (!Number.isInteger(m.dia) || m.dia < 1 || m.dia > 30) return "Dia inválido.";
  if (!TIPOS_MARCACAO.includes(m.tipo)) return "Tipo inválido.";
  if (!VISIBILIDADES_MARCACAO.includes(m.visibilidade)) return "Visibilidade inválida.";
  if (typeof m.titulo !== "string" || !m.titulo.trim()) return "Escreva um título.";
  if (m.titulo.trim().length > TITULO_MARCACAO_MAX) return `Título com no máximo ${TITULO_MARCACAO_MAX} caracteres.`;
  return null;
}

/** Diferença em dias imperiais (meses de 30 dias) entre duas datas. */
export function diasEntre(a: { ano: number; mes: number; dia: number }, b: { ano: number; mes: number; dia: number }): number {
  return ((b.ano * 12 + b.mes - 1) * 30 + b.dia) - ((a.ano * 12 + a.mes - 1) * 30 + a.dia);
}
export function distanciaRelativa(dias: number): string {
  if (dias === 0) return "hoje";
  return dias > 0 ? `em ${dias} dia${dias > 1 ? "s" : ""}` : `há ${-dias} dia${dias < -1 ? "s" : ""}`;
}
