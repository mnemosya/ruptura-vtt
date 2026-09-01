"use client";

/**
 * Anima o `transform` de UM `<g>` de token, imperativamente, sem
 * re-render de React por frame.
 *
 * Por que imperativo: `MapaHex` re-renderiza a 60fps se a posição do
 * token virar `useState`/prop reconciliada normalmente — exatamente o
 * que o pedido pede pra evitar. A alternativa aqui é a sugerida por
 * ele: um hook isolado por token que escreve `setAttribute('transform',
 * ...)` direto no nó, via `requestAnimationFrame`. `MovimentoVisualToken`
 * muda de referência só em eventos raros e discretos (início, fim,
 * substituição por um movimento mais novo) — nunca por frame — então
 * o `useEffect` abaixo só REINICIA nesses momentos, não a cada tick.
 *
 * Handoff pra renderização declarativa: enquanto `movimento` existe, o
 * chamador (`Token`, em `MapaHex.tsx`) deve renderizar
 * `transform={undefined}` no `<g>` — React então nunca escreve nesse
 * atributo, deixando as mutações diretas daqui em paz mesmo que o
 * componente re-renderize por outro motivo (hover, seleção). No
 * instante em que a animação acaba, este hook chama `onConcluido`, que
 * o chamador usa pra limpar `movimento` — na renderização seguinte,
 * `transform` volta a ser a expressão declarativa normal
 * (`translate(hexParaPixel(token.pos))`), e como a última escrita
 * imperativa já deixou o `<g>` EXATAMENTE nessa posição (ver
 * `interpolarMovimento`, que força `progresso=1` na última escrita), a
 * troca é invisível.
 */

import { useEffect, useRef } from "react";
import { hexParaPixel } from "./hex";
import { interpolarMovimento, type MovimentoVisualToken } from "../_dominio/animacaoToken";

function reduzirMovimentoAtivo(): boolean {
  return typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
}

export function useAnimacaoToken(params: {
  /** Ref do `<g>` do token — a MESMA que a Token já usa pra outros fins, se houver. */
  gRef: React.RefObject<SVGGElement | null>;
  movimento: MovimentoVisualToken | undefined | null;
  tamanhoCelula: number;
  /** Chamado quando a animação termina — inclusive no atalho de `prefers-reduced-motion`, pra quem chama sempre poder limpar o estado da mesma forma. */
  onConcluido?: (movementId: string) => void;
}) {
  const { gRef, movimento, tamanhoCelula, onConcluido } = params;
  // Persistem ENTRE re-execuções do efeito (não são resetados quando
  // `movimento` muda) — é o que permite uma troca em pleno voo
  // (concorrência: um movimento mais novo chega antes do anterior
  // terminar) continuar a partir de onde o token visualmente estava,
  // em vez de saltar pro início da rota nova.
  const posicaoAtualRef = useRef<{ x: number; y: number } | null>(null);
  const movimentoAnteriorIdRef = useRef<string | null>(null);

  useEffect(() => {
    const el = gRef.current;
    if (!el || !movimento) {
      if (!movimento) movimentoAnteriorIdRef.current = null;
      return;
    }
    // Const separada, não-anulável: dentro de `frame` (função declarada
    // mais abaixo, só chamada depois via `requestAnimationFrame`) o TS
    // não propaga o estreitamento do `if` acima através desse limite de
    // closure — `movimento` continuaria typado como possivelmente
    // `null|undefined` ali dentro.
    const mov = movimento;
    const el2 = el;

    const posFinal = hexParaPixel(mov.destino, tamanhoCelula);

    if (reduzirMovimentoAtivo()) {
      el2.setAttribute("transform", `translate(${posFinal.x} ${posFinal.y})`);
      posicaoAtualRef.current = posFinal;
      movimentoAnteriorIdRef.current = mov.movementId;
      onConcluido?.(mov.movementId);
      return;
    }

    const substituindoEmVoo =
      movimentoAnteriorIdRef.current !== null &&
      movimentoAnteriorIdRef.current !== mov.movementId &&
      posicaoAtualRef.current !== null;
    movimentoAnteriorIdRef.current = mov.movementId;

    // Reconciliação: nunca duas animações controlando o mesmo
    // `transform` ao mesmo tempo — o `useEffect` de baixo, ao trocar
    // `movimento`, já cancelou o `requestAnimationFrame` anterior antes
    // de chegar aqui (cleanup roda antes do próximo efeito).
    const origemPx = substituindoEmVoo ? posicaoAtualRef.current! : hexParaPixel(mov.rota[0], tamanhoCelula);
    const inicioEfetivo = substituindoEmVoo ? performance.now() : mov.inicio;
    // Reta curta e pixel-a-pixel a partir de onde o token JÁ ESTAVA —
    // não a rota completa do novo movimento — porque não sabemos, sem
    // custo real de recomputar toda a rota, em que célula exata o
    // token estava visualmente parado; uma transição curta reta é a
    // simplificação documentada no relatório final desta rodada.
    const duracaoEfetiva = substituindoEmVoo ? Math.min(220, mov.duracao) : mov.duracao;

    let rafId: number | null = null;
    function frame(agora: number) {
      if (substituindoEmVoo) {
        const elapsed = agora - inicioEfetivo;
        const rawT = duracaoEfetiva <= 0 ? 1 : Math.min(1, Math.max(0, elapsed / duracaoEfetiva));
        // Mesmo formato de easing da interpolação normal — só a
        // trajetória (reta, não pela rota) muda neste caso.
        const frac = rawT >= 1 ? 1 : rawT;
        const pos = { x: origemPx.x + (posFinal.x - origemPx.x) * frac, y: origemPx.y + (posFinal.y - origemPx.y) * frac };
        el2.setAttribute("transform", `translate(${pos.x} ${pos.y})`);
        posicaoAtualRef.current = pos;
        if (rawT >= 1) {
          el2.setAttribute("transform", `translate(${posFinal.x} ${posFinal.y})`);
          posicaoAtualRef.current = posFinal;
          onConcluido?.(mov.movementId);
          return;
        }
      } else {
        const r = interpolarMovimento({ ...mov, inicio: inicioEfetivo }, agora, tamanhoCelula);
        el2.setAttribute("transform", `translate(${r.x} ${r.y})`);
        posicaoAtualRef.current = { x: r.x, y: r.y };
        if (r.concluido) {
          el2.setAttribute("transform", `translate(${posFinal.x} ${posFinal.y})`);
          posicaoAtualRef.current = posFinal;
          onConcluido?.(mov.movementId);
          return;
        }
      }
      rafId = requestAnimationFrame(frame);
    }
    rafId = requestAnimationFrame(frame);

    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [movimento, tamanhoCelula]);
}
