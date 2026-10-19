"use client";

/**
 * Estado da janela do Console: geometria, modo (normal/maximizada/
 * minimizada), arraste e redimensionamento.
 *
 * A geometria vive só na sessão (spec §1: não criar persistência no
 * banco só para isso). Ao maximizar, a geometria anterior é guardada e
 * devolvida EXATAMENTE no restaurar.
 *
 * Arraste e resize usam Pointer Events com `setPointerCapture` — um só
 * caminho para mouse, caneta e toque, em vez de handlers separados que
 * divergem.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  geometriaInicial,
  geometriaMaximizada,
  limitarPosicao,
  redimensionar,
  redimensionarPelaEsquerda,
  CHROME_VERTICAL,
  CHROME_HORIZONTAL,
  MIN_H,
  MIN_W,
  TABLIST_W,
  type Geometry,
} from "./geometry";

export type WindowMode = "normal" | "maximized" | "minimized";

function viewport() {
  return { w: window.innerWidth, h: window.innerHeight };
}

/**
 * `larguraInicialMax`/`alturaInicialFallback` vêm do chamador: a
 * largura com que a janela nasce (teto só da ABERTURA, não do resize)
 * e a altura de partida até o conteúdo ser medido.
 */
export interface OpcoesConsoleWindow {
  larguraInicialMax?: number;
  alturaInicialFallback?: number;
}

export function useConsoleWindow(aberto: boolean, opts?: OpcoesConsoleWindow) {
  const [mode, setMode] = useState<WindowMode>("normal");
  const [geo, setGeo] = useState<Geometry | null>(null);
  /** Geometria de antes de maximizar — devolvida intacta no restaurar. */
  const geoAntesDeMaximizar = useRef<Geometry | null>(null);

  /**
   * Altura/largura de janela equivalentes ao tamanho NATURAL do
   * conteúdo atualmente visível (coluna 1 `.rc-aside`/`.rc-grid`, ou a
   * aba Personagem) — teto só do tamanho AUTOMÁTICO (abrir e
   * sincronizar antes do primeiro resize manual). `null` até `ConsoleWindow` medir pela
   * primeira vez (só é possível depois que a janela já montou com
   * algum tamanho provisório, daí o ajuste-depois-do-primeiro-paint em
   * vez de abrir já no tamanho certo).
   */
  const [alturaMaximaConteudo, setAlturaMaximaConteudo] = useState<number | null>(null);
  const [larguraMaximaConteudo, setLarguraMaximaConteudo] = useState<number | null>(null);
  const registrarAlturaColuna1 = useCallback((alturaConteudo: number) => {
    setAlturaMaximaConteudo(Math.round(alturaConteudo) + CHROME_VERTICAL);
  }, []);
  const registrarLarguraGrid = useCallback((larguraConteudo: number) => {
    setLarguraMaximaConteudo(Math.round(larguraConteudo) + CHROME_HORIZONTAL);
  }, []);

  // A largura de abertura (`larguraInicialMax`) vence sobre a medida;
  // a altura medida, quando existir, vence sobre o fallback inicial.
  const alturaMaximaEfetiva = alturaMaximaConteudo ?? opts?.alturaInicialFallback ?? undefined;
  const larguraMaximaEfetiva = opts?.larguraInicialMax ?? larguraMaximaConteudo ?? undefined;

  /**
   * Uma vez que o usuário redimensiona a janela na mão, o tamanho é
   * dele: a sincronização automática com o conteúdo para de mexer —
   * senão a preferência seria sobrescrita a cada mudança de conteúdo
   * (ex.: PA ganhou mais um ponto). Só a viewport continua limitando.
   */
  const redimensionadaManualmente = useRef(false);

  // Geometria inicial só no cliente (depende da viewport real).
  useEffect(() => {
    if (!aberto || geo) return;
    setGeo(geometriaInicial(viewport(), alturaMaximaEfetiva, larguraMaximaEfetiva));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto, geo, alturaMaximaEfetiva, larguraMaximaEfetiva]);

  // Conteúdo acabou de ser medido (ou mudou de tamanho, ex.: atributo
  // ganhou mais um ponto na trilha de PA): enquanto o usuário não
  // redimensionou na mão, sincroniza a janela com a MESMA fórmula de
  // `geometriaInicial` (fração de viewport + teto de conteúdo) nos dois
  // sentidos — cobre o "flash" do primeiro paint e uma 1ª medição
  // incompleta (dados carregando async). ESSENCIAL manter o teto de
  // viewport aqui: só o de conteúdo deixava a janela mais alta que a
  // tela em telas pequenas. Maximizada ou redimensionada na mão: não
  // mexe.
  useEffect(() => {
    if (alturaMaximaEfetiva == null && larguraMaximaEfetiva == null) return;
    if (mode !== "normal" || redimensionadaManualmente.current) return;
    setGeo((atual) => {
      if (!atual) return atual;
      const alvo = geometriaInicial(viewport(), alturaMaximaEfetiva, larguraMaximaEfetiva);
      return atual.w === alvo.w && atual.h === alvo.h ? atual : { ...atual, w: alvo.w, h: alvo.h };
    });
  }, [alturaMaximaEfetiva, larguraMaximaEfetiva, mode]);

  // Viewport mudou de tamanho: reposiciona para a janela continuar
  // alcançável, e reajusta a maximizada para a nova área útil.
  useEffect(() => {
    if (!aberto) return;
    function onResize() {
      const vp = viewport();
      setGeo((atual) => {
        if (!atual) return atual;
        if (mode === "maximized") return geometriaMaximizada(vp);
        // Uma viewport menor também precisa reduzir a janela: só ajustar x/y
        // deixava o trilho e os controles do lado direito fora da tela.
        const w = Math.min(atual.w, Math.max(MIN_W, vp.w - 32 - TABLIST_W));
        const h = Math.min(atual.h, Math.max(MIN_H, vp.h - 32));
        return limitarPosicao({ ...atual, w, h }, vp);
      });
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [aberto, mode]);

  const podeManipular = mode === "normal";

  /** Arraste pela topbar. O chamador decide se o alvo permite arrastar. */
  const iniciarArraste = useCallback(
    (e: React.PointerEvent) => {
      if (!podeManipular || !geo) return;
      const alvo = e.currentTarget as HTMLElement;
      // `setPointerCapture` lança se o ponteiro não estiver ativo; sem o
      // try/catch uma falha aqui abortaria o arraste inteiro.
      try {
        alvo.setPointerCapture(e.pointerId);
      } catch {
        /* segue sem captura — o arraste ainda funciona via listeners. */
      }
      const offsetX = e.clientX - geo.x;
      const offsetY = e.clientY - geo.y;

      function mover(ev: PointerEvent) {
        setGeo((atual) =>
          atual ? limitarPosicao({ ...atual, x: ev.clientX - offsetX, y: ev.clientY - offsetY }, viewport()) : atual,
        );
      }
      function soltar(ev: PointerEvent) {
        try { alvo.releasePointerCapture(ev.pointerId); } catch { /* já liberado */ }
        alvo.removeEventListener("pointermove", mover);
        alvo.removeEventListener("pointerup", soltar);
        alvo.removeEventListener("pointercancel", soltar);
      }
      alvo.addEventListener("pointermove", mover);
      alvo.addEventListener("pointerup", soltar);
      alvo.addEventListener("pointercancel", soltar);
    },
    [geo, podeManipular],
  );

  /** Resize pelo canto inferior direito. */
  const iniciarResize = useCallback(
    (e: React.PointerEvent) => {
      if (!podeManipular || !geo) return;
      e.stopPropagation();
      redimensionadaManualmente.current = true;
      const alvo = e.currentTarget as HTMLElement;
      try {
        alvo.setPointerCapture(e.pointerId);
      } catch {
        /* idem ao arraste. */
      }
      const inicioX = e.clientX;
      const inicioY = e.clientY;
      const larguraInicial = geo.w;
      const alturaInicial = geo.h;

      function mover(ev: PointerEvent) {
        setGeo((atual) =>
          atual
            ? redimensionar(
                atual,
                larguraInicial + (ev.clientX - inicioX),
                alturaInicial + (ev.clientY - inicioY),
                viewport(),
              )
            : atual,
        );
      }
      function soltar(ev: PointerEvent) {
        try { alvo.releasePointerCapture(ev.pointerId); } catch { /* já liberado */ }
        alvo.removeEventListener("pointermove", mover);
        alvo.removeEventListener("pointerup", soltar);
        alvo.removeEventListener("pointercancel", soltar);
      }
      alvo.addEventListener("pointermove", mover);
      alvo.addEventListener("pointerup", soltar);
      alvo.addEventListener("pointercancel", soltar);
    },
    [geo, podeManipular],
  );

  /** Resize pelo canto inferior ESQUERDO — espelhado, ancorado na borda direita. */
  const iniciarResizeEsquerda = useCallback(
    (e: React.PointerEvent) => {
      if (!podeManipular || !geo) return;
      e.stopPropagation();
      redimensionadaManualmente.current = true;
      const alvo = e.currentTarget as HTMLElement;
      try {
        alvo.setPointerCapture(e.pointerId);
      } catch {
        /* idem ao arraste. */
      }
      const inicioX = e.clientX;
      const inicioY = e.clientY;
      const larguraInicial = geo.w;
      const alturaInicial = geo.h;

      function mover(ev: PointerEvent) {
        setGeo((atual) =>
          atual
            ? redimensionarPelaEsquerda(
                atual,
                larguraInicial - (ev.clientX - inicioX),
                alturaInicial + (ev.clientY - inicioY),
                viewport(),
              )
            : atual,
        );
      }
      function soltar(ev: PointerEvent) {
        try { alvo.releasePointerCapture(ev.pointerId); } catch { /* já liberado */ }
        alvo.removeEventListener("pointermove", mover);
        alvo.removeEventListener("pointerup", soltar);
        alvo.removeEventListener("pointercancel", soltar);
      }
      alvo.addEventListener("pointermove", mover);
      alvo.addEventListener("pointerup", soltar);
      alvo.addEventListener("pointercancel", soltar);
    },
    [geo, podeManipular],
  );

  /**
   * Alterna maximizado/normal.
   *
   * O cálculo acontece FORA dos updaters de estado: aninhar `setGeo`
   * dentro do updater de `setMode` fazia o efeito rodar duas vezes em
   * StrictMode e a segunda passada guardava a geometria já maximizada,
   * quebrando o restaurar.
   */
  const alternarMaximizar = useCallback(() => {
    if (mode === "maximized") {
      const anterior = geoAntesDeMaximizar.current;
      geoAntesDeMaximizar.current = null;
      if (anterior) setGeo(anterior);
      setMode("normal");
      return;
    }
    if (geo) geoAntesDeMaximizar.current = geo;
    setGeo(geometriaMaximizada(viewport()));
    setMode("maximized");
  }, [geo, mode]);

  /** Modo de antes de minimizar — para o dock devolver ao estado certo. */
  const modoAntesDeMinimizar = useRef<Exclude<WindowMode, "minimized">>("normal");

  const minimizar = useCallback(() => {
    if (mode !== "minimized") modoAntesDeMinimizar.current = mode;
    setMode("minimized");
  }, [mode]);

  /**
   * Restaurar do dock devolve ao modo exato de antes da minimização
   * (inclusive maximizado). Minimizar não altera a geometria, então
   * nada precisa ser recalculado aqui.
   */
  const restaurar = useCallback(() => {
    setMode(modoAntesDeMinimizar.current);
  }, []);

  return {
    mode,
    geo,
    minWidth: MIN_W,
    minHeight: MIN_H,
    podeManipular,
    iniciarArraste,
    iniciarResize,
    iniciarResizeEsquerda,
    alternarMaximizar,
    minimizar,
    restaurar,
    registrarAlturaColuna1,
    registrarLarguraGrid,
  };
}
