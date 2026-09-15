/**
 * Onde, num texto, estão os TERMOS DE REGRA.
 *
 * Função pura, separada do componente por dois motivos: é a parte com
 * regra de verdade (ordem de casamento, bordas com acento, o filtro de
 * maiúscula), e é a parte que dá pra testar sem DOM — ver
 * `scripts/test-inventario-console.ts`.
 */

import type { TermoDeRegra } from "./types";

export interface PedacoDeTexto {
  texto: string;
  /** Presente só quando o pedaço É um termo de regra. */
  termo?: TermoDeRegra;
}

function escaparRegex(texto: string): string {
  return texto.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Termos ordenados do mais longo para o mais curto — senão
 * "Atordoado" casaria antes de "Atordoado em massa" e engoliria o
 * termo maior.
 *
 * As bordas são lookaround de `\p{L}` em vez de `\b`: `\b` trabalha
 * com [A-Za-z0-9_], então em português ele encontra "borda de palavra"
 * no meio de "Atordoados" logo antes de um acento, e o casamento sai
 * cortado.
 */
export function montarRegexDeTermos(termos: TermoDeRegra[]): RegExp | null {
  const uteis = termos.filter((t) => t.nome.trim().length > 1);
  if (uteis.length === 0) return null;
  const alternativas = [...uteis]
    .sort((a, b) => b.nome.length - a.nome.length)
    .map((t) => escaparRegex(t.nome))
    .join("|");
  /* `(?:es|s)?` — o texto de regra flexiona o termo ("ficam
     Atordoados"), o glossário guarda o singular ("Atordoado"). Sem
     isto o plural não casa, que era exatamente o caso da frase do
     desenho. Só plural simples: tolerar flexão de verdade pediria um
     lematizador, e o ganho não paga a imprecisão que ele traz. */
  return new RegExp(`(?<![\\p{L}])(${alternativas})(?:es|s)?(?![\\p{L}])`, "giu");
}

/**
 * Quebra o texto em pedaços, marcando os que são termo de regra.
 *
 * SÓ CASA COM INICIAL MAIÚSCULA. Vários termos são verbos comuns —
 * "Resistir", "Recarregar" —, e casar qualquer ocorrência grifaria a
 * palavra no sentido comum: o Colete balístico diz "para resistir a
 * lâminas", que não é a ação Resistir. Em texto de regra a entidade
 * vem capitalizada, e é esse o sinal que separa as duas. A
 * consequência aceita é o inverso: um termo abrindo a frase pode ser
 * grifado sem ser a entidade. Errar grifando de menos é melhor que
 * prometer regra onde não há.
 */
export function separarTermos(texto: string, glossario: TermoDeRegra[]): PedacoDeTexto[] {
  const regex = montarRegexDeTermos(glossario);
  if (!regex) return [{ texto }];

  const porNome = new Map(
    glossario.filter((t) => t.nome.trim().length > 1).map((t) => [t.nome.toLocaleLowerCase("pt-BR"), t]),
  );

  const saida: PedacoDeTexto[] = [];
  let ultimo = 0;
  for (const m of texto.matchAll(regex)) {
    const inicio = m.index ?? 0;
    const achado = m[0];
    /* `m[1]` é o termo sem o sufixo de plural que a regex tolerou; é
       por ele que se procura no glossário, enquanto `m[0]` (com o
       sufixo) é o que fica na tela — grifar "Atordoado" e sumir com o
       "s" mudaria o texto do conteúdo. */
    const termo = porNome.get((m[1] ?? achado).toLocaleLowerCase("pt-BR"));
    if (!termo) continue;
    if (achado[0] !== achado[0].toLocaleUpperCase("pt-BR")) continue;
    if (inicio > ultimo) saida.push({ texto: texto.slice(ultimo, inicio) });
    saida.push({ texto: achado, termo });
    ultimo = inicio + achado.length;
  }
  if (ultimo < texto.length) saida.push({ texto: texto.slice(ultimo) });
  return saida;
}
