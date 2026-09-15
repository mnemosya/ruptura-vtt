"use client";

/**
 * Texto de regra com os TERMOS GRIFADOS.
 *
 * Quando a descrição de um item diz "fazem teste de Resistir CD 8; em
 * falha, ficam Atordoados", as duas palavras marcadas são entidades
 * reais do conteúdo — uma `combat_action` e uma `condition`
 * publicadas. Aqui elas viram texto grifado com tooltip da regra.
 *
 * A MARCA É DO PRÓPRIO TEXTO, nunca uma caixa por cima dele. No
 * desenho do Figma essas duas eram `position: absolute` em left/top
 * fixos: funcionavam só naquela quebra de linha exata e cobriam a
 * frase por baixo. Aqui são `<span>` na frase, então acompanham a
 * quebra, o tamanho da fonte, a seleção de texto e o zoom.
 *
 * O glossário vem de `api.glossario` — conteúdo real, montado no
 * cliente da ficha a partir de `combat_action` + `condition`. Este
 * componente não tem lista própria: termo que não está publicado não
 * fica grifado, e isso é o comportamento certo (grifar sem ter regra
 * pra mostrar seria pior que não grifar).
 */

import { useMemo, type ReactNode } from "react";
import { TermoComDica } from "./TermoComDica";
import { separarTermos } from "./termosDeRegra";
import type { TermoDeRegra } from "./types";

export function TextoComRegras({
  texto,
  glossario,
  className,
}: {
  texto: string;
  glossario: TermoDeRegra[];
  className?: string;
}) {
  const pedacos = useMemo<ReactNode[]>(
    () =>
      separarTermos(texto, glossario).map((p, i) =>
        p.termo ? (
          <TermoComDica key={`${i}-${p.termo.slug}`} termo={p.termo}>
            {p.texto}
          </TermoComDica>
        ) : (
          p.texto
        ),
      ),
    [texto, glossario],
  );

  return <p className={className}>{pedacos}</p>;
}
