/**
 * Datas e horas mostradas na tela, sempre no mesmo fuso.
 *
 * `toLocaleString` sem `timeZone` usa o fuso de quem executa. No
 * servidor (UTC em produção) isso põe "criada em 17:03" para algo
 * criado às 14:03, e num componente que renderiza no servidor e
 * hidrata no navegador o texto sai diferente nos dois lados — o React
 * descarta o HTML do servidor e refaz a árvore no cliente.
 *
 * Fixar o fuso IANA da mesa resolve os dois: o mesmo instante vira o
 * mesmo texto em qualquer lugar. É o fuso que `lib/compendio/revisao`
 * já usava.
 */

export const FUSO_DA_MESA = "America/Sao_Paulo";

type Instante = string | number | Date;

function valido(instante: Instante): Date | null {
  const d = instante instanceof Date ? instante : new Date(instante);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Equivale a `toLocaleString("pt-BR", opcoes)`, no fuso da mesa. */
export function dataHoraDaMesa(instante: Instante, opcoes: Intl.DateTimeFormatOptions = {}): string {
  return valido(instante)?.toLocaleString("pt-BR", { ...opcoes, timeZone: FUSO_DA_MESA }) ?? "";
}

/** Equivale a `toLocaleDateString("pt-BR", opcoes)`, no fuso da mesa. */
export function dataDaMesa(instante: Instante, opcoes: Intl.DateTimeFormatOptions = {}): string {
  return valido(instante)?.toLocaleDateString("pt-BR", { ...opcoes, timeZone: FUSO_DA_MESA }) ?? "";
}

/** Equivale a `toLocaleTimeString("pt-BR", opcoes)`, no fuso da mesa. */
export function horaDaMesa(instante: Instante, opcoes: Intl.DateTimeFormatOptions = {}): string {
  return valido(instante)?.toLocaleTimeString("pt-BR", { ...opcoes, timeZone: FUSO_DA_MESA }) ?? "";
}
