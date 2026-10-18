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
 *  · CASCA: a linha F do redesign das janelas — sem espinha
 *    lateral: título em display caixa alta com a TECLA de atalho
 *    ao lado (`ATALHO_FERRAMENTA`), e o estado ("o que estou
 *    fazendo agora") em mono com um losango no acento, na mesma
 *    linha. O cabeçalho fica fixo e só o corpo rola, então estado e
 *    ações nunca somem de vista.
 *  · LARGURA: duas, por papel. Ferramenta que se usa enquanto se
 *    age no mapa (rolar, medir, marcar, desenhar…) tem 420px; janela
 *    de GESTÃO, que lista coisas (combate, camadas, imagens, token,
 *    áreas), tem 500px — `largura="gestao"`.
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
  type CSSProperties, type ReactNode, type RefObject,
} from "react";
import { X } from "lucide-react";
import { ATALHO_FERRAMENTA, type FerramentaId } from "../_ferramentas/controlador";
import {
  type JanelaId, type PosicaoJanela,
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
  /** Qual janela — é a chave da posição lembrada. */
  id: JanelaId;
  /** @deprecated A espinha saiu na linha F; mantido só por compatibilidade. */
  indice?: string;
  /** Cor do acento (losango do estado, foco, escolhas acesas). */
  acento?: string;
  /** "ferramenta" (420px, padrão) ou "gestao" (500px — janelas que listam coisas). */
  largura?: "ferramenta" | "gestao";
  /** Tecla mostrada ao lado do título. Cai no atalho da ferramenta; `null` esconde. */
  tecla?: string | null;
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
  /** Abre e permanece imediatamente acima deste elemento, sem posição salva ou arrasto. */
  ancoraAcimaDe?: RefObject<HTMLElement | null>;
  testId?: string;
  testIdCabecalho?: string;
  /** Ganchos de teste dos botões do cabeçalho (cada painel mantém os seus). */
  testIdRecolher?: string;
  testIdFechar?: string;
  atributos?: Record<string, string>;
  /**
   * Posição DE FORA — para quem hospeda a janela longe do palco do VTT
   * (a rolagem do Console). Com ela, a janela não lê nem grava posição
   * lembrada nem fica invisível esperando medida: quem a montou já sabe
   * onde ela mora.
   */
  estiloExterno?: CSSProperties;
  /** Arrasto de fora (ex.: `useArrastoJanela`), somado ao do cabeçalho. */
  aoPressionarCabecalhoExterno?: (e: React.PointerEvent) => void;
  /** Ref do `<section>` para quem arrasta de fora. */
  refExterna?: (el: HTMLElement | null) => void;
  children: ReactNode;
}

/**
 * Identidade por ferramenta — índice (legado) e acento.
 *
 * Fica aqui, e não em cada painel, porque a numeração só faz sentido
 * como CONJUNTO: é ela que dá a leitura de "que peça do maquinário
 * é esta" quando duas janelas estão abertas lado a lado. Espalhada
 * pelos painéis, viraria seis números que ninguém garante distintos.
 *
 * O TEXTO da espinha não mora aqui: ele é o próprio título da janela.
 * Eram dois nomes para a mesma coisa ("Iniciativa" na lateral de uma
 * janela chamada "Rodadas") e nada obrigava os dois a concordarem — o
 * da espinha envelhecia sozinho a cada vez que o título mudava.
 */
const ESPINHA: Partial<Record<JanelaId, { indice: string; acento: string }>> = {
  interagir: { indice: "00", acento: "#00d4ff" },
  dados:     { indice: "01", acento: "#00d4ff" },
  medir:     { indice: "02", acento: "#00d4ff" },
  marcar:    { indice: "03", acento: "#c25a8c" },
  desenhar:  { indice: "11", acento: "#00d4ff" },
  texto:     { indice: "12", acento: "#7f9bd1" },
  areas:     { indice: "04", acento: "#8878d6" },
  rodadas:   { indice: "05", acento: "#ff8a1f" },
  terreno:   { indice: "06", acento: "#4fae82" },
  objetos:   { indice: "07", acento: "#ff8a1f" },
  // Azul de planta: imagem de cena é a PLANTA por baixo do tabuleiro, e
  // o acento próprio é o que separa, de relance, a janela que mexe no
  // desenho do mapa daquela que mexe em objeto tático (âmbar) — duas
  // coisas que se parecem na tela e não se parecem em nada na regra.
  imagens:   { indice: "10", acento: "#7f9bd1" },
  tempo:    { indice: "13", acento: "#5bbdcc" },
};

/** Tecla de atalho de uma janela, quando ela é uma ferramenta com atalho. */
function teclaDaJanela(id: JanelaId): string | null {
  return (ATALHO_FERRAMENTA as Partial<Record<string, string>>)[id as FerramentaId] ?? null;
}

export function JanelaFerramenta({
  id, acento, largura = "ferramenta", tecla, icone, titulo, modo, modoAtributos, rotulo, rotuloFechar, aoFechar,
  recolhido, aoAlternarRecolhido, rotuloRecolher, acoesCabecalho,
  className, ancoraAcimaDe, testId, testIdCabecalho, testIdRecolher, testIdFechar, atributos,
  estiloExterno, aoPressionarCabecalhoExterno, refExterna, children,
}: JanelaFerramentaProps) {
  const ctx = useContext(JanelasContexto);
  const espinha = ESPINHA[id];
  const cor = acento ?? espinha?.acento ?? "#00d4ff";
  const teclaVisivel = tecla === undefined ? teclaDaJanela(id) : tecla;
  const asideRef = useRef<HTMLElement | null>(null);
  const arrastoRef = useRef<{ dx: number; dy: number } | null>(null);
  const [posicao, setPosicao] = useState<PosicaoJanela | null>(null);
  const posicaoRef = useRef<PosicaoJanela | null>(null);
  useEffect(() => { posicaoRef.current = posicao; }, [posicao]);

  const limitar = useCallback((p: PosicaoJanela) => limitarPosicaoJanela(p, asideRef.current), []);

  const posicaoAcimaDaAncora = useCallback((): PosicaoJanela | null => {
    const ancora = ancoraAcimaDe?.current;
    const janela = asideRef.current;
    const pai = janela?.offsetParent;
    if (!ancora || !janela || !pai) return null;
    const caixaAncora = ancora.getBoundingClientRect();
    const caixaPai = pai.getBoundingClientRect();
    return limitar({
      x: caixaAncora.left - caixaPai.left,
      y: caixaAncora.top - caixaPai.top - janela.offsetHeight - 8,
      manual: false,
    });
  }, [ancoraAcimaDe, limitar]);

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
  const externo = !!estiloExterno;
  useEffect(() => {
    // Posicionada de fora: nada de posição lembrada (ela é da ferramenta do VTT).
    if (externo) return;
    if (ancoraAcimaDe) {
      setPosicao(posicaoAcimaDaAncora());
      return;
    }
    if (!ctx) return;
    const lembrada = carregarPosicaoJanela(ctx.usuarioId, ctx.campaignId, id);
    const alvo = lembrada.manual ? lembrada : { ...ancoraPadraoJanela(), manual: false };
    // Duplo `requestAnimationFrame` não é necessário: o clamp usa
    // `asideRef`, que já existe neste ponto do efeito (o DOM foi
    // commitado antes dos efeitos rodarem).
    setPosicao(limitar(alvo));
  }, [ancoraAcimaDe, ctx, externo, id, limitar, posicaoAcimaDaAncora]);

  const aoPressionarCabecalho = (e: React.PointerEvent) => {
    if (ancoraAcimaDe || e.button !== 0 || !posicao) return;
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
      if (ancoraAcimaDe) {
        const ancorada = posicaoAcimaDaAncora();
        const atual = posicaoRef.current;
        if (ancorada && (!atual || ancorada.x !== atual.x || ancorada.y !== atual.y)) setPosicao(ancorada);
        return;
      }
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
    if (observer && ancoraAcimaDe?.current) observer.observe(ancoraAcimaDe.current);
    return () => {
      window.removeEventListener("resize", ajustar);
      observer?.disconnect();
    };
  }, [ancoraAcimaDe, ctx, id, limitar, posicaoAcimaDaAncora]);

  return (
    <section
      ref={(el) => { asideRef.current = el; refExterna?.(el); }}
      className={`rv-flutuante rv-fp rv-fp--f${largura === "gestao" ? " rv-fp--gestao" : ""}${recolhido ? " rv-fp--recolhida" : ""}${ancoraAcimaDe ? " rv-fp--ancorada" : ""}${className ? ` ${className}` : ""}`}
      role="group"
      aria-label={rotulo}
      data-testid={testId}
      {...atributos}
      // Enquanto a posição não foi medida, a janela fica invisível em
      // vez de piscar no canto: um frame no lugar errado é pior que um
      // frame ausente.
      style={{
        ...(posicao ? { left: posicao.x, top: posicao.y } : estiloExterno ? null : { visibility: "hidden" }),
        ...estiloExterno,
        ["--jf-acento" as string]: cor,
      }}
    >
      <header
        className="rv-fp-cab"
        data-testid={testIdCabecalho}
        onPointerDown={(e) => { aoPressionarCabecalhoExterno?.(e); aoPressionarCabecalho(e); }}
        onPointerMove={aoMoverCabecalho}
        onPointerUp={aoSoltarCabecalho}
        onPointerCancel={aoSoltarCabecalho}
        onLostPointerCapture={aoSoltarCabecalho}
      >
        <span className="rv-fp-cab-icone" aria-hidden="true">{icone}</span>
        <span className="rv-fp-cab-txt">
          <span className="rv-fp-titulo">{titulo}</span>
          {teclaVisivel && <kbd className="rv-fp-tecla" aria-label={`Atalho: ${teclaVisivel}`}>{teclaVisivel}</kbd>}
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
