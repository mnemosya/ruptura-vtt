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
  type Geometry,
} from "./geometry";

export type WindowMode = "normal" | "maximized" | "minimized";

function viewport() {
  return { w: window.innerWidth, h: window.innerHeight };
}

/**
 * `larguraMaximaFixa`/`alturaFallbackInicial` existem pro modo Foco do
 * Console (spec "modos Painel e Foco"): Foco tem uma largura MÁXIMA
 * fixa (818px, não medida) e uma altura de PARTIDA fixa (726px, até a
 * altura natural do conteúdo da aba ativa ser medida). Quem decide
 * QUANDO passar esses valores é o chamador (`ConsoleWindow`, que só
 * repassa o que recebe de `CharacterConsole` — o hook aqui não sabe o
 * que é "Foco", só sabe aplicar os overrides quando informados).
 */
export interface OpcoesConsoleWindow {
  larguraMaximaFixa?: number;
  alturaFallbackInicial?: number;
}

export function useConsoleWindow(aberto: boolean, opts?: OpcoesConsoleWindow) {
  const [mode, setMode] = useState<WindowMode>("normal");
  const [geo, setGeo] = useState<Geometry | null>(null);
  /** Geometria de antes de maximizar — devolvida intacta no restaurar. */
  const geoAntesDeMaximizar = useRef<Geometry | null>(null);

  /**
   * Altura/largura de janela equivalentes ao tamanho NATURAL do
   * conteúdo atualmente visível — altura da coluna 1 (`.rc-aside`) e
   * largura do `.rc-grid` no modo Painel, ou altura/largura da aba
   * ativa no modo Foco (spec: janela não estica além do conteúdo
   * quando a viewport sobra). `null` até `ConsoleWindow` medir pela
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

  // `opts?.larguraMaximaFixa` (818 no Foco, `undefined` no Painel) SEMPRE
  // vence sobre a largura medida — no Foco a largura nunca é medida, é
  // fixa. A altura medida, quando existir, sempre vence sobre o
  // fallback inicial (726 é só ponto de PARTIDA, não teto — spec
  // explícita: "não é uma altura fixa").
  const alturaMaximaEfetiva = alturaMaximaConteudo ?? opts?.alturaFallbackInicial ?? undefined;
  const larguraMaximaEfetiva = opts?.larguraMaximaFixa ?? larguraMaximaConteudo ?? undefined;

  /**
   * Uma vez que o usuário redimensiona a janela na mão, o acompanhamento
   * automático do teto vira só um TETO (clampa se ultrapassar), não mais
   * um tamanho que a gente empurra pra cima e pra baixo sozinho — senão
   * a preferência do usuário seria sobrescrita a cada mudança de
   * conteúdo (ex.: PA ganhou mais um ponto).
   */
  const redimensionadaManualmente = useRef(false);

  // Troca de modo (Painel↔Foco, sinalizada por `larguraMaximaFixa`
  // aparecer/sumir): o conteúdo medido é de OUTRO layout agora, então
  // força remedição do zero — e devolve a sincronização automática (o
  // usuário pode ter travado o tamanho no modo anterior, mas isso não
  // deveria valer pro novo modo).
  useEffect(() => {
    setAlturaMaximaConteudo(null);
    setLarguraMaximaConteudo(null);
    redimensionadaManualmente.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts?.larguraMaximaFixa]);

  // Geometria inicial só no cliente (depende da viewport real).
  useEffect(() => {
    if (!aberto || geo) return;
    setGeo(geometriaInicial(viewport(), alturaMaximaEfetiva, larguraMaximaEfetiva));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto, geo, alturaMaximaEfetiva, larguraMaximaEfetiva]);

  // Conteúdo acabou de ser medido (ou mudou de tamanho, ex.: atributo
  // ganhou mais um ponto na trilha de PA): sincroniza a janela com o
  // novo teto. NORMAL reusa a MESMA fórmula de `geometriaInicial`
  // (fração de viewport + teto de conteúdo) — ESSENCIAL manter o teto
  // de viewport aqui também: uma versão anterior deste efeito só
  // olhava pro teto de conteúdo, e numa tela pequena com a coluna 1
  // naturalmente alta isso empurrava a janela pra mais alta que a
  // própria tela. ANTES do primeiro resize manual, sincroniza nos dois
  // sentidos (cresce E encolhe) — cobre tanto o "flash" do primeiro
  // paint quanto uma 1ª medição incompleta (dados do personagem
  // carregando async). DEPOIS do primeiro resize manual, só clampa pra
  // baixo se ultrapassar — não briga com o tamanho que o usuário
  // escolheu.
  //
  // MAXIMIZADA também precisa desse resync, não só normal: se o
  // usuário clica em maximizar ANTES da 1ª medição terminar (bem
  // possível — a medição só chega depois de pelo menos um paint),
  // `geometriaMaximizada` roda sem teto nenhum e a janela maximizada
  // fica presa no tamanho de tela cheia pra sempre, mesmo depois da
  // medição chegar — sobrando espaço vazio nas colunas que não
  // esticam pra preencher (é exatamente o "espaço vazio" relatado).
  useEffect(() => {
    if (alturaMaximaEfetiva == null && larguraMaximaEfetiva == null) return;
    if (mode !== "normal" && mode !== "maximized") return;
    setGeo((atual) => {
      if (!atual) return atual;
      if (mode === "maximized") {
        const alvo = geometriaMaximizada(viewport(), alturaMaximaEfetiva, larguraMaximaEfetiva);
        return atual.w === alvo.w && atual.h === alvo.h && atual.x === alvo.x && atual.y === alvo.y ? atual : alvo;
      }
      const alvo = geometriaInicial(viewport(), alturaMaximaEfetiva, larguraMaximaEfetiva);
      if (redimensionadaManualmente.current) {
        const w = Math.min(atual.w, alvo.w);
        const h = Math.min(atual.h, alvo.h);
        return w === atual.w && h === atual.h ? atual : { ...atual, w, h };
      }
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
        return mode === "maximized"
          ? geometriaMaximizada(vp, alturaMaximaEfetiva, larguraMaximaEfetiva)
          : limitarPosicao(atual, vp);
      });
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [aberto, mode, alturaMaximaEfetiva, larguraMaximaEfetiva]);

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
                alturaMaximaEfetiva,
                larguraMaximaEfetiva,
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
    [geo, podeManipular, alturaMaximaEfetiva, larguraMaximaEfetiva],
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
                alturaMaximaEfetiva,
                larguraMaximaEfetiva,
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
    [geo, podeManipular, alturaMaximaEfetiva, larguraMaximaEfetiva],
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
    setGeo(geometriaMaximizada(viewport(), alturaMaximaEfetiva, larguraMaximaEfetiva));
    setMode("maximized");
  }, [geo, mode, alturaMaximaEfetiva, larguraMaximaEfetiva]);

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
