"use client";

/**
 * A JANELA de ferramenta do VTT — uma só, para todas.
 *
 * Antes desta unificação havia três comportamentos diferentes para a
 * mesma ideia: Terreno/Objetos/Medir eram presas num `left`/`top` fixo
 * do CSS e não arrastavam; Áreas arrastava, com cabeçalho de marcação
 * própria (`.rv-area-cab`, `<strong>` no lugar de título+ícone) e uma
 * cópia inteira da lógica de arrasto; Rodadas arrastava com uma
 * SEGUNDA cópia da mesma lógica. Três lugares para consertar o mesmo
 * bug — foi exatamente o que aconteceu com o "encolhe ao arrastar",
 * que precisou ser corrigido duas vezes.
 *
 * O que esta janela padroniza:
 *
 *  · CASCA: `.rv-fp` + cabeçalho `.rv-fp-cab` (ícone, título, linha de
 *    modo) + corpo rolável `.rv-fp-corpo`. O cabeçalho fica fixo e só
 *    o corpo rola, então estado e ações nunca somem de vista.
 *  · POSIÇÃO INICIAL: encostada na barra de ferramentas, com folga
 *    lateral e superior iguais para todas (`GAP_LATERAL`,
 *    `MARGEM_TOPO`). Se a trilha de turnos estiver aberta, a âncora
 *    passa a ser a borda do trilho dos jogadores — a janela nunca
 *    abre por cima dele.
 *  · ARRASTO: pelo cabeçalho, `setPointerCapture`, sem biblioteca.
 *    Altura FIXA (nunca derivada de `y`: arrastar move, não
 *    redimensiona) e clamp que mantém a janela INTEIRA dentro do
 *    palco — fora dele `overflow: hidden` recortaria o rodapé e os
 *    controles do fim ficariam inalcançáveis.
 *  · MEMÓRIA: a posição de cada ferramenta é lembrada por usuário e
 *    campanha. Enquanto a pessoa nunca arrastou aquela janela, ela
 *    reancora sozinha a cada abertura; depois do primeiro arrasto a
 *    posição é dela e nada mais mexe.
 *
 * O CONTEÚDO continua sendo de cada painel. Esta janela não sabe nada
 * de terreno, área, objeto, régua ou rodada.
 */

import {
  createContext, useCallback, useContext, useEffect, useRef, useState,
  type ReactNode,
} from "react";
import { X } from "lucide-react";
import type { FerramentaId } from "../_ferramentas/controlador";
import {
  type PosicaoJanela,
  ancoraPadraoJanela, carregarPosicaoJanela, limitarPosicaoJanela, salvarPosicaoJanela,
} from "../_ferramentas/janelasPreferencias";

/**
 * Identidade de quem está vendo, para a chave da preferência.
 *
 * Vem por contexto e não por prop: são cinco painéis e a informação é
 * a mesma para todos, sempre. Enfiá-la na assinatura de cada um só
 * espalharia um detalhe de armazenamento por componentes que não têm
 * nada a ver com isso.
 */
interface ContextoJanelas {
  campaignId: string;
  usuarioId: string | null;
}
const JanelasContexto = createContext<ContextoJanelas | null>(null);

export function ProvedorJanelasFerramenta({ campaignId, usuarioId, children }: ContextoJanelas & { children: ReactNode }) {
  return <JanelasContexto.Provider value={{ campaignId, usuarioId }}>{children}</JanelasContexto.Provider>;
}

export interface JanelaFerramentaProps {
  /** Qual ferramenta — é a chave da posição lembrada. */
  id: FerramentaId;
  icone: ReactNode;
  titulo: string;
  /** Linha de estado sob o título ("o que estou fazendo agora"). */
  modo?: string;
  /** Atributos extras da linha de modo (ganchos de teste, `data-*`). */
  modoAtributos?: Record<string, string>;
  /** `aria-label` da janela inteira. */
  rotulo: string;
  rotuloFechar: string;
  aoFechar: () => void;
  /** Recolher ao cabeçalho — só quem oferece isso passa os dois. */
  recolhido?: boolean;
  aoAlternarRecolhido?: () => void;
  rotuloRecolher?: { recolher: string; expandir: string };
  /** Botões extras à direita do cabeçalho, antes do fechar. */
  acoesCabecalho?: ReactNode;
  /** Classes/atributos próprios do painel (largura, `data-fase`, …). */
  className?: string;
  testId?: string;
  testIdCabecalho?: string;
  /** Ganchos de teste dos botões do cabeçalho (cada painel mantém os seus). */
  testIdRecolher?: string;
  testIdFechar?: string;
  atributos?: Record<string, string>;
  children: ReactNode;
}

export function JanelaFerramenta({
  id, icone, titulo, modo, modoAtributos, rotulo, rotuloFechar, aoFechar,
  recolhido, aoAlternarRecolhido, rotuloRecolher, acoesCabecalho,
  className, testId, testIdCabecalho, testIdRecolher, testIdFechar, atributos, children,
}: JanelaFerramentaProps) {
  const ctx = useContext(JanelasContexto);
  const asideRef = useRef<HTMLElement | null>(null);
  const arrastoRef = useRef<{ dx: number; dy: number } | null>(null);
  const [posicao, setPosicao] = useState<PosicaoJanela | null>(null);
  const posicaoRef = useRef<PosicaoJanela | null>(null);
  useEffect(() => { posicaoRef.current = posicao; }, [posicao]);

  const limitar = useCallback((p: PosicaoJanela) => limitarPosicaoJanela(p, asideRef.current), []);

  const gravar = useCallback((p: PosicaoJanela) => {
    setPosicao(p);
    if (ctx) salvarPosicaoJanela(ctx.usuarioId, ctx.campaignId, id, p);
  }, [ctx, id]);

  /**
   * Posição de abertura. Lê a lembrada; se ela nunca foi arrastada
   * (`manual: false`), reancora na barra AGORA — a barra e o trilho
   * podem ter mudado de tamanho desde a última vez, e uma âncora velha
   * abriria a janela no lugar errado.
   *
   * Roda uma vez por montagem, que é exatamente "toda vez que a
   * ferramenta abre" (o painel só existe enquanto a ferramenta está
   * ativa).
   */
  useEffect(() => {
    if (!ctx) return;
    const lembrada = carregarPosicaoJanela(ctx.usuarioId, ctx.campaignId, id);
    const alvo = lembrada.manual ? lembrada : { ...ancoraPadraoJanela(), manual: false };
    // Duplo `requestAnimationFrame` não é necessário: o clamp usa
    // `asideRef`, que já existe neste ponto do efeito (o DOM foi
    // commitado antes dos efeitos rodarem).
    setPosicao(limitar(alvo));
  }, [ctx, id, limitar]);

  const aoPressionarCabecalho = (e: React.PointerEvent) => {
    if (e.button !== 0 || !posicao) return;
    // Botões do cabeçalho (recolher/fechar) clicam, não arrastam.
    if ((e.target as HTMLElement).closest("button")) return;
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    arrastoRef.current = { dx: e.clientX - posicao.x, dy: e.clientY - posicao.y };
  };
  const aoMoverCabecalho = (e: React.PointerEvent) => {
    if (!arrastoRef.current) return;
    // Arrastar de verdade marca `manual`: daqui pra frente a posição é
    // da pessoa e nunca mais é reancorada sozinha.
    gravar(limitar({ x: e.clientX - arrastoRef.current.dx, y: e.clientY - arrastoRef.current.dy, manual: true }));
  };
  const aoSoltarCabecalho = (e: React.PointerEvent) => {
    if ((e.currentTarget as Element).hasPointerCapture?.(e.pointerId)) (e.currentTarget as Element).releasePointerCapture(e.pointerId);
    arrastoRef.current = null;
  };

  /**
   * Reclampa quando o navegador OU a própria janela mudam de tamanho.
   *
   * O `ResizeObserver` não é luxo: o corpo muda de altura a cada fase
   * da ferramenta (uma lista que cresce, uma seção que abre, o combate
   * que começa). Sem ele, uma janela colada no rodapé passaria a vazar
   * pra fora do palco assim que o conteúdo crescesse.
   *
   * Reclampar NÃO marca `manual`: o navegador mudando de tamanho não é
   * a pessoa escolhendo um lugar.
   */
  useEffect(() => {
    const ajustar = () => {
      const atual = posicaoRef.current;
      if (!atual || arrastoRef.current) return; // no meio de um arrasto, quem manda é o ponteiro
      const limitada = limitar(atual);
      // Só escreve se MUDOU — escrever sempre realimentaria o observer.
      if (limitada.x !== atual.x || limitada.y !== atual.y) {
        setPosicao(limitada);
        if (ctx && atual.manual) salvarPosicaoJanela(ctx.usuarioId, ctx.campaignId, id, limitada);
      }
    };
    window.addEventListener("resize", ajustar);
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(ajustar);
    if (observer && asideRef.current) observer.observe(asideRef.current);
    return () => {
      window.removeEventListener("resize", ajustar);
      observer?.disconnect();
    };
  }, [ctx, id, limitar]);

  return (
    <section
      ref={asideRef}
      className={`rv-flutuante rv-fp${recolhido ? " rv-fp--recolhida" : ""}${className ? ` ${className}` : ""}`}
      role="group"
      aria-label={rotulo}
      data-testid={testId}
      {...atributos}
      // Enquanto a posição não foi medida, a janela fica invisível em
      // vez de piscar no canto: um frame no lugar errado é pior que um
      // frame ausente.
      style={posicao ? { left: posicao.x, top: posicao.y } : { visibility: "hidden" }}
    >
      <header
        className="rv-fp-cab"
        data-testid={testIdCabecalho}
        onPointerDown={aoPressionarCabecalho}
        onPointerMove={aoMoverCabecalho}
        onPointerUp={aoSoltarCabecalho}
        onPointerCancel={aoSoltarCabecalho}
        onLostPointerCapture={aoSoltarCabecalho}
      >
        <span className="rv-fp-cab-icone" aria-hidden="true">{icone}</span>
        <span className="rv-fp-cab-txt">
          <span className="rv-fp-titulo">{titulo}</span>
          {modo !== undefined && <span className="rv-fp-modo" {...modoAtributos}>{modo}</span>}
        </span>
        {acoesCabecalho}
        {aoAlternarRecolhido && (
          <button
            type="button"
            className="rv-fp-fechar"
            data-testid={testIdRecolher ?? "janela-recolher"}
            aria-expanded={!recolhido}
            aria-label={recolhido ? rotuloRecolher?.expandir ?? "Expandir" : rotuloRecolher?.recolher ?? "Recolher"}
            onClick={aoAlternarRecolhido}
          >
            <span className="rv-fp-chevron" data-recolhido={!!recolhido} aria-hidden="true" />
          </button>
        )}
        <button type="button" className="rv-fp-fechar" data-testid={testIdFechar ?? "janela-fechar"} aria-label={rotuloFechar} onClick={aoFechar}>
          <X size={15} />
        </button>
      </header>

      {/* O CORPO (`.rv-fp-corpo`) é montado por cada painel: a classe é
          compartilhada, mas o conteúdo — e quando ele some ao recolher
          — é decisão de quem sabe o que está dentro. */}
      {children}
    </section>
  );
}
