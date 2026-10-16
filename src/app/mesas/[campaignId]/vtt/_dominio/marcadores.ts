/**
 * Marcadores — modelo PURO, sem DOM nem rede.
 *
 * Fonte: RUPTURA 1.2, cap. 27 "MARCADORES". Um marcador torna visível o
 * avanço de um objetivo, ameaça ou prazo, em segmentos (`2/6`). Dois
 * tipos: PROGRESSO (um trabalho a concluir) e PRESSÃO (uma ameaça ou
 * prazo). O capítulo pede quatro elementos — nome, segmentos, gatilho e
 * conclusão —, mas gatilho e conclusão vivem na narração: obrigar o
 * narrador a digitá-los no meio da cena seria travar a mesa. A
 * ferramenta só guarda o que precisa ficar VISÍVEL.
 *
 * Não confundir com "Marcar" (`vtt_marks`, sinais no mapa): marcador
 * pertence à CAMPANHA, não à cena, porque o capítulo diz que encerrar
 * uma sessão não reinicia uma investigação ou ameaça em andamento.
 */

export type TipoMarcador = "progresso" | "pressao";

export interface MarcadorVtt {
  id: string;
  tipo: TipoMarcador;
  /** `null` = sem nome: o narrador criou sem digitar, e assim fica. */
  nome: string | null;
  total: number;
  preenchidos: number;
  criadoEm: string;
}

/** Limites do total. Abaixo de 2 não há avanço pra mostrar; acima de 12 o anel fica ilegível. */
export const SEGMENTOS_MIN = 2;
export const SEGMENTOS_MAX = 12;
/** Referência do capítulo: 4 breve, 6 prolongado, 8 extenso. */
export const SEGMENTOS_REFERENCIA = [4, 6, 8] as const;
export const NOME_MAX = 60;

export const ROTULO_TIPO: Record<TipoMarcador, string> = { progresso: "Progresso", pressao: "Pressão" };
/** O que aparece quando o último segmento é preenchido. */
export const SELO_CONCLUSAO: Record<TipoMarcador, string> = { progresso: "Concluído", pressao: "Disparado" };

export function limitarTotal(total: number): number {
  return Math.max(SEGMENTOS_MIN, Math.min(SEGMENTOS_MAX, Math.round(total)));
}

/** Avança ou recua `delta` segmentos, preso a `[0, total]`. */
export function ajustarPreenchidos(m: Pick<MarcadorVtt, "total" | "preenchidos">, delta: number): number {
  return Math.max(0, Math.min(m.total, m.preenchidos + delta));
}

export function estaCompleto(m: Pick<MarcadorVtt, "total" | "preenchidos">): boolean {
  return m.preenchidos >= m.total;
}

/** Nome digitado → o que se grava. Vazio vira `null`, nunca um nome inventado. */
export function normalizarNome(nome: string): string | null {
  const limpo = nome.trim().slice(0, NOME_MAX);
  return limpo.length > 0 ? limpo : null;
}

/**
 * Fundo do anel: um `conic-gradient` com uma fatia por segmento e um
 * vão entre elas. As cores entram como `var(...)` para o tema decidir —
 * nenhum hex sai daqui. O furo do meio é uma máscara no CSS.
 *
 * `vazio` é a cor dos segmentos não preenchidos; a prévia da criação
 * passa a própria cor do tipo, esmaecida.
 */
export function gradienteAnel(total: number, preenchidos: number, cheio = "var(--mk-cor)", vazio = "var(--mk-vazio)"): string {
  const passo = 360 / total;
  const vao = total > 8 ? 3 : 5;
  const fatias: string[] = [];
  for (let i = 0; i < total; i++) {
    const cor = i < preenchidos ? cheio : vazio;
    const a = i * passo;
    const b = (i + 1) * passo;
    fatias.push(
      `transparent ${a}deg ${a + vao / 2}deg`,
      `${cor} ${a + vao / 2}deg ${b - vao / 2}deg`,
      `transparent ${b - vao / 2}deg ${b}deg`,
    );
  }
  return `conic-gradient(${fatias.join(", ")})`;
}

export function rotuloAcessivel(m: Pick<MarcadorVtt, "tipo" | "nome" | "total" | "preenchidos">): string {
  return `${m.nome ?? ROTULO_TIPO[m.tipo]}, ${m.preenchidos} de ${m.total}`;
}
