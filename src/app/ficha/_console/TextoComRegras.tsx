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

import { useMemo, useRef, useState, type ReactNode } from "react";
import { separarTermos } from "./termosDeRegra";
import type { TermoDeRegra } from "./types";

interface Posicao {
  x: number;
  y: number;
}

export function TextoComRegras({
  texto,
  glossario,
  className,
}: {
  texto: string;
  glossario: TermoDeRegra[];
  className?: string;
}) {
  const [ativo, setAtivo] = useState<{ termo: TermoDeRegra; em: Posicao } | null>(null);
  const timerRef = useRef<number | null>(null);

  const pedacos = useMemo<ReactNode[]>(() => {
    return separarTermos(texto, glossario).map((p, i) => {
      if (!p.termo) return p.texto;
      const termo = p.termo;
      return (
        <span
          key={`${i}-${termo.slug}`}
          className="rc-termo"
          data-tipo={termo.tipo}
          tabIndex={0}
          role="button"
          onMouseEnter={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            if (timerRef.current) window.clearTimeout(timerRef.current);
            setAtivo({ termo, em: { x: r.left + r.width / 2, y: r.top } });
          }}
          onMouseLeave={() => {
            /* Um respiro antes de sumir: sem isso, atravessar o termo
               com o mouse pisca o tooltip a cada passagem. */
            timerRef.current = window.setTimeout(() => setAtivo(null), 80);
          }}
          onFocus={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            setAtivo({ termo, em: { x: r.left + r.width / 2, y: r.top } });
          }}
          onBlur={() => setAtivo(null)}
        >
          {p.texto}
        </span>
      );
    });
  }, [texto, glossario]);

  return (
    <>
      <p className={className}>{pedacos}</p>
      {ativo && (
        <span
          id="rc-termo-dica"
          role="tooltip"
          className="rc-termo-dica"
          data-tipo={ativo.termo.tipo}
          /* `fixed` + coordenadas de viewport: o tabpanel rola por
             dentro (`overflow: auto`), então um tooltip absoluto dentro
             dele seria recortado na primeira linha. */
          style={{ left: `${ativo.em.x}px`, top: `${ativo.em.y}px` }}
        >
          <span className="rc-termo-dica-cab">
            {ativo.termo.nome}
            <em>{ativo.termo.tipo === "acao" ? "ação" : "condição"}</em>
          </span>
          {ativo.termo.descricao ? (
            <span className="rc-termo-dica-txt">{ativo.termo.descricao}</span>
          ) : (
            /* O termo existe publicado mas sem descrição curta. Dizer
               isso é melhor que um tooltip vazio ou que inventar texto. */
            <span className="rc-termo-dica-txt rc-termo-dica-txt--vazio">
              Sem descrição publicada para este termo.
            </span>
          )}
        </span>
      )}
    </>
  );
}
