"use client";

/**
 * APRESENTAÇÃO DE UM RESULTADO DE ROLAGEM — as peças visuais que a
 * ferramenta "Rolar Dados" usa pra mostrar o que saiu, extraídas daqui
 * pra que o Console do Personagem mostre EXATAMENTE a mesma coisa em
 * vez de uma segunda versão parecida.
 *
 * Só o que é PURO mora aqui: tokens do design, as seis faixas de
 * margem, a fileira de dados já parados e a faixa de resultado. Nada
 * de física, servidor ou contexto de mesa — é isso que deixa o Console
 * (que também roda fora do VTT, em `/ficha` e no harness da ficha)
 * importar este arquivo sem arrastar a mesa 3D junto.
 *
 * Quem ROLA continua sendo de quem chama: a ferramenta pede a física
 * pro palco e o Console resolve na própria ficha. As duas terminam com
 * um resultado, e um resultado se desenha de um jeito só.
 */

import { Fragment, useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { PolyDie } from "./PolyDie";
import { CARGA_MAX_MS } from "./lancamento";
import { Check, Chevron, Cross, Dice, DoubleCheck, Half, Warn } from "./icones";
import { X } from "lucide-react";
import type { TableLogVisibility } from "../../../../../lib/table";

/* ---- tokens do design ------------------------------------------- */

export const DISPLAY = "var(--font-chakra), 'Chakra Petch', sans-serif";
export const MONO = "var(--font-mono), 'JetBrains Mono', monospace";
export const BODY = "var(--font-rajdhani), Rajdhani, sans-serif";

export const INK = "#d6e4f5";
export const INK_DIM = "#7f95b3";
export const INK_FAINT = "#4f6285";

export type Accent = { key: string; hex: string; soft: string };

export const ACCENTS: Record<string, Accent> = {
  cyan: { key: "cyan", hex: "#45b8c9", soft: "rgba(69,184,201,0.09)" },
  amber: { key: "amber", hex: "#cf9a3e", soft: "rgba(207,154,62,0.09)" },
  danger: { key: "danger", hex: "#d15068", soft: "rgba(209,80,104,0.09)" },
  magenta: { key: "magenta", hex: "#c25a8c", soft: "rgba(194,90,140,0.09)" },
  arcane: { key: "arcane", hex: "#8878d6", soft: "rgba(136,120,214,0.09)" },
  good: { key: "good", hex: "#4fae82", soft: "rgba(79,174,130,0.09)" },
  slate: { key: "slate", hex: "#6f83a3", soft: "rgba(111,131,163,0.07)" },
};

/**
 * As SEIS faixas de margem do sistema (`lib/dice/types.ts`), não as
 * cinco que este arquivo inventava. A antiga faltava "falha crítica" e
 * tratava "maior dado = 8" como crítico automático — regra que não
 * existe em lugar nenhum do sistema.
 */
export type ResultKey =
  | "falha_critica"
  | "falha"
  | "falha_limitada"
  | "sucesso_limitado"
  | "sucesso_padrao"
  | "sucesso_critico";

/**
 * As seis faixas.
 *
 * VERDE é o topo, não o meio: `sucesso_critico` leva o acento `good` e
 * `sucesso_padrao` fica com o ciano estrutural. Antes era o contrário, e
 * o resultado era um feed em que a linha mais verde da tela não era a
 * melhor coisa que tinha acontecido — o crítico saía na mesma cor que o
 * chassi usa pra tudo, de borda de painel a rótulo de seção.
 */
export const RESULTS: Record<ResultKey, { label: string; accent: Accent; Icon: typeof Check }> = {
  sucesso_critico: { label: "Sucesso Crítico", accent: ACCENTS.good, Icon: DoubleCheck },
  sucesso_padrao: { label: "Sucesso Padrão", accent: ACCENTS.cyan, Icon: Check },
  sucesso_limitado: { label: "Sucesso Limitado", accent: ACCENTS.amber, Icon: Half },
  falha_limitada: { label: "Falha Limitada", accent: ACCENTS.magenta, Icon: Warn },
  falha: { label: "Falha", accent: ACCENTS.danger, Icon: Cross },
  falha_critica: { label: "Falha Crítica", accent: ACCENTS.danger, Icon: Cross },
};

/**
 * HOVER para quem é desenhado INLINE.
 *
 * A bandeja e seus controles não têm folha de estilo própria: são
 * estilos inline, porque os mesmos componentes rodam no VTT, no Console
 * da ficha e na página `/dev/dados`, e nenhuma folha cobre as três. Sem
 * um `:hover` possível, tudo ali era mudo ao mouse — só os dados
 * respondiam, e por um `onMouseEnter` escrito à mão (o mesmo truque,
 * repetido).
 *
 * Guarda o valor anterior NO ELEMENTO (via `WeakMap`) e o devolve na
 * saída — apagar a propriedade não serviria: ela veio do `style` do
 * React, que não a reescreve se as props não mudaram.
 */
const estiloAnterior = new WeakMap<HTMLElement, Record<string, string>>();
export function aoPassarMouse(estilos: Record<string, string>) {
  return {
    onMouseEnter: (e: { currentTarget: HTMLElement }) => {
      const el = e.currentTarget;
      const antes: Record<string, string> = {};
      for (const [prop, valor] of Object.entries(estilos)) {
        antes[prop] = el.style.getPropertyValue(prop);
        el.style.setProperty(prop, valor);
      }
      estiloAnterior.set(el, antes);
    },
    onMouseLeave: (e: { currentTarget: HTMLElement }) => {
      const el = e.currentTarget;
      const antes = estiloAnterior.get(el);
      for (const prop of Object.keys(estilos)) el.style.setProperty(prop, antes?.[prop] ?? "");
    },
  };
}

/** Pilha vertical (equivalente ao `space-y-*` do design). */
export function Stack({ gap, children, style }: { gap: number; children: ReactNode; style?: CSSProperties }) {
  return <div style={{ display: "flex", flexDirection: "column", gap, ...style }}>{children}</div>;
}

/** Etiqueta de grupo do design — título à esquerda, régua e um extra opcional à direita. */
export function GroupLabel({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div style={{ marginBottom: 8, display: "flex", alignItems: "center", gap: 8 }}>
      <span style={{ fontFamily: DISPLAY, fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.24em", color: "rgba(53,199,216,0.7)" }}>{children}</span>
      <span style={{ height: 1, flex: 1, background: "linear-gradient(90deg,#18263f,transparent)" }} />
      {right}
    </div>
  );
}

/**
 * Gêmeo SOMENTE-LEITURA do `Select` do rolador — mesma etiqueta, mesma
 * caixa, sem a seta e sem foco. É o que substitui os dois dropdowns
 * quando quem mostra o resultado não pode mudá-lo: no Console, atributo
 * e perícia já foram decididos pelo clique que disparou a rolagem, e a
 * rolagem já aconteceu (com talentos e condições aplicados). Um select
 * ali seria um controle que promete refazer a conta e não refaz.
 */
export function Leitura({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ display: "block", minWidth: 0 }}>
      <span style={{ fontFamily: DISPLAY, fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.16em", color: INK_FAINT }}>{label}</span>
      <div style={{
        marginTop: 4, borderRadius: 2, border: "1px solid #1c2b45", background: "transparent",
        padding: "9px 10px", fontFamily: BODY, fontSize: 12, color: INK,
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
      }}>
        {children}
      </div>
    </div>
  );
}

/**
 * Fileira de dados JÁ PARADOS, com o maior aceso.
 *
 * O maior é localizado por ÍNDICE (`indexOf`), não comparando valor a
 * valor: com dois oito na mesa os dois acenderiam, e o teste usa um
 * dado só. A ferramenta usa isto no estado "pousou" e o Console usa
 * sempre — quando o modal abre, a rolagem já aconteceu.
 */
/**
 * Ciano estrutural do dado — o estado de quem AINDA não tem resultado
 * classificado (pool montado, dados no ar, teste sem CD). Não é o ciano
 * de `ACCENTS.cyan`: aquele é a cor de uma FAIXA de margem, esta é a do
 * chassi.
 */
const DADO_SEM_RESULTADO: Accent = { key: "dado", hex: "#35c7d8", soft: "rgba(53,199,216,0.14)" };

export function DadosRolados({ dados, maiorDado, size = 46, landed = false, dim = false, acento }: {
  dados: number[];
  maiorDado: number;
  size?: number;
  /** Anima o pouso, escalonado por dado. */
  landed?: boolean;
  /** Apaga a fileira inteira (pool ainda não rolado). */
  dim?: boolean;
  /**
   * Acento do dado que VALEU. Quem tem classificação passa a da faixa,
   * pra que o dado aceso e o veredito não discordem — um "5" ciano de
   * sucesso em cima de uma faixa vermelha de FALHA é o olho lendo duas
   * respostas pra mesma pergunta. Sem classificação, fica o ciano do
   * chassi.
   */
  acento?: Accent;
}) {
  const cor = acento ?? DADO_SEM_RESULTADO;
  const maiorIdx = dados.indexOf(maiorDado);
  return (
    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
      {dados.map((valor, i) => (
        <PolyDie
          key={i}
          sides={8}
          value={dim ? undefined : valor}
          dim={dim}
          active={!dim && i === maiorIdx}
          landed={landed}
          rollIndex={i}
          accent={cor.hex}
          /* O preenchimento do dado é mais denso que o `soft` de uma
             faixa (0.14 contra 0.09): num ícone pequeno o 9% some. */
          soft={acento ? `${cor.hex}24` : cor.soft}
          size={size}
        />
      ))}
    </div>
  );
}

/**
 * Fileira de dados de uma rolagem LIVRE — faces mistas (`2d6 + 1d4`),
 * cada peça desenhada com o número de lados que ela realmente tem.
 *
 * Separada de `DadosRolados` porque aquela é a fileira do TESTE de
 * Ruptura, onde todo dado é d8 e UM deles (o maior) decide. Aqui os
 * dados são somados e nenhum vale mais que o outro — por isso nenhum
 * acende, a menos que a rolagem diga que o modo foi "maior".
 */
export function DadosLivres({ termos, maior, size = 40, landed = false, acento }: {
  termos: readonly { faces: number; valor: number }[];
  /** Valor que "venceu" no modo maior-dado; `null`/ausente na soma. */
  maior?: number | null;
  size?: number;
  landed?: boolean;
  /**
   * Acento dos dados que VALEM — a mesma regra de `DadosRolados`: quem
   * tem veredito passa o acento da faixa, pra que o dado aceso e o
   * veredito não discordem. Sem veredito (rolagem sem CD) fica o
   * arcano, que é a cor da rolagem livre em repouso.
   */
  acento?: Accent;
}) {
  const cor = acento ?? ACCENTS.arcane;
  const maiorIdx = maior == null ? -1 : termos.findIndex((t) => t.valor === maior);
  /* SOMA leva "+" entre os dados; MAIOR não. Na soma os dados formam
     uma conta, e o "+" é o que diz que o número grande à direita saiu
     dali — sem ele a fileira lia como uma coleção de resultados soltos.
     No modo maior não há conta nenhuma: um dado vence, e um "+" ali
     afirmaria uma soma que não vai acontecer.

     O vão encolhe de 8 pra 5 quando o sinal entra: com 8 de cada lado o
     "+" ficava boiando entre os dados em vez de ligar os dois. */
  const somando = maior == null;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: somando ? 5 : 8 }}>
      {termos.map((t, i) => (
        <Fragment key={i}>
          {somando && i > 0 && (
            /* O TAMANHO ACOMPANHA O DADO (60% dele), e não um px fixo:
               a mesma fileira é desenhada a 40px no feed e menor na
               bandeja, e um valor fixo sumia do lado do dado grande.

               A COR é `#43597c`, o contorno do dado PARADO em
               `PolyDie` — de propósito mais apagada que os dados, que
               na soma ficam todos acesos. O "+" é pontuação: liga os
               números sem competir com eles. Acompanhando o acento ele
               virava mais um elemento aceso na fileira. */
            <span aria-hidden="true" style={{ flex: "none", fontFamily: MONO, fontSize: Math.round(size * 0.6), fontWeight: 400, lineHeight: 1, color: "#43597c" }}>+</span>
          )}
          <PolyDie
            sides={t.faces}
            value={t.valor}
            /* NA SOMA TODOS CONTAM, então todos ficam acesos — o mesmo
               realce que o vencedor recebe no modo maior. Apagados, os
               dados diziam "nenhum destes importa" bem em cima da conta
               que o total à direita acabou de fazer com eles. No modo
               maior segue só o vencedor: ali um dado de fato vence. */
            active={somando || i === maiorIdx}
            landed={landed}
            rollIndex={i}
            accent={cor.hex}
            soft={cor.soft}
            size={size}
          />
        </Fragment>
      ))}
    </div>
  );
}

/**
 * FAIXA DA SOMA — o resultado de uma rolagem livre.
 *
 * MESMO desenho da faixa de teste (`FaixaChassi`): hachura, ícone,
 * título, linha de parcelas e total à direita. O que muda é só a
 * CONTA: soma (ou maior) dos dados, modificador e CD — nunca perícia,
 * que aqui não existe.
 *
 * Sem CD o título é "Sem CD definida", igualzinho ao teste sem CD:
 * uma rolagem livre também é um número sem veredito até alguém dizer
 * contra o que ele corre. Com CD, vira sucesso ou falha — e nada de
 * margem, que é regra do teste de d8, não de uma soma qualquer.
 */
export function FaixaSoma({ base, modificador, total, cd, modo = "sum", nota, testId }: {
  /** Soma (ou maior) dos dados, ANTES do modificador. */
  base: number;
  modificador: number;
  total: number;
  cd?: number | null;
  modo?: "sum" | "high";
  nota?: ReactNode;
  testId?: string;
}) {
  const temCd = cd != null;
  const passou = temCd && total >= cd;
  /* CIANO no sucesso, e não verde. É a mesma regra do teste de Ruptura
     logo acima (`RESULTS`): o VERDE é o TOPO — `sucesso_critico` —, e o
     sucesso comum fica com o ciano estrutural. Uma soma contra CD não
     tem crítico, então ela nunca chega no verde: passar da CD aqui é
     sucesso padrão, e pintá-lo de verde dizia "crítico" pra qualquer
     acerto raspado. A falha continua vermelha, como lá. */
  const acento = !temCd ? ACCENTS.slate : passou ? ACCENTS.cyan : ACCENTS.danger;
  /* O MESMO ÍCONE DE VEREDITO do teste (`RESULTS`): ✓ pra sucesso, ✗ pra
     falha. O dado fica só pro caso SEM CD, que é o único aqui que não
     tem veredito nenhum — e aí ele diz "isto é uma rolagem, não um
     resultado", que é exatamente o que a faixa neutra significa.

     Antes a soma trazia o dado sempre: ao lado de um teste no feed, o
     mesmo "passou da CD" aparecia com dois desenhos diferentes, como se
     fossem respostas de naturezas distintas. São a mesma resposta — o
     teste só tem mais degraus. */
  const Icone = !temCd ? Dice : passou ? Check : Cross;
  return (
    <FaixaChassi
      acento={acento}
      icone={<Icone width={17} height={17} style={{ color: acento.hex, flexShrink: 0 }} />}
      titulo={temCd ? (passou ? "Sucesso" : "Falha") : "Sem CD definida"}
      nota={nota}
      total={total}
      testIdTotal={testId}
      parcelas={<>
        <Parcela>{modo === "high" ? "maior" : "soma"} {seg(String(base), ACCENTS.cyan.hex)}</Parcela>
        <Parcela>+ mod {seg(modificador >= 0 ? `+${modificador}` : String(modificador))}</Parcela>
        {temCd && <Parcela>· cd {seg(String(cd), ACCENTS.amber.hex)}</Parcela>}
      </>}
    />
  );
}

/** Uma rolagem já resolvida, no vocabulário que a faixa desenha. */
export interface RolagemExibida {
  maiorDado: number;
  /** Nome da perícia, ou `null` quando o teste é de atributo puro. */
  pericia: string | null;
  periciaValor: number;
  modificador: number;
  total: number;
  cd: number | null;
  classificacao: ResultKey | null;
}

/**
 * Faixa de resultado. Sem CD não existe sucesso nem margem
 * (`resolverPericia` devolve o total e para ali) — a faixa diz "sem CD
 * definida" e mostra só o total, em vez de fingir uma classificação que
 * a regra não produziu.
 *
 * Não confundir com o "TESTE ABERTO" do card do Chat
 * (`_painel/feed/contratos.ts`): lá a palavra rotula uma rolagem que não
 * é de perícia nem de atributo. Duas coisas diferentes — por isso esta
 * aqui deixou de usar aquele nome.
 */
/** Uma parcela da conta — rótulo e número nunca se separam. */
function Parcela({ children }: { children: ReactNode }) {
  return <span style={{ whiteSpace: "nowrap" }}>{children}</span>;
}

/**
 * CHASSI DA FAIXA DE RESULTADO — a moldura única: hachura diagonal na
 * canhoneira esquerda, ícone, título em display caixa alta, a linha de
 * PARCELAS em mono e o total grande à direita.
 *
 * Existe pra que teste e soma sejam literalmente o mesmo desenho: o
 * que muda entre eles é o título, o ícone e quais parcelas entram —
 * nunca a moldura. Enquanto a soma tinha faixa própria, as duas
 * divergiam a cada ajuste.
 */
function FaixaChassi({ acento, icone, titulo, parcelas, nota, total, testIdTotal }: {
  acento: Accent;
  icone: ReactNode;
  titulo: string;
  parcelas: ReactNode;
  nota?: ReactNode;
  total: number;
  testIdTotal?: string;
}) {
  return (
    <div style={{ position: "relative", overflow: "hidden", borderRadius: 2, border: `1px solid ${acento.hex}55` }}>
      <span style={{ position: "absolute", top: 0, bottom: 0, left: 0, width: 28, background: `repeating-linear-gradient(-45deg, ${acento.hex}44 0 2px, transparent 2px 6px)` }} />
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px 10px 40px", background: acento.soft }}>
        {icone}
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontFamily: DISPLAY, fontSize: 13, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", lineHeight: 1, color: acento.hex }}>
            {titulo}
          </div>
          {/* A conta é uma linha de PARCELAS, e cada parcela é um item de
              flex só. Antes o rótulo e o número eram itens separados
              (texto solto + `<span>`), então a linha podia quebrar
              exatamente entre os dois e deixar "CD" no fim de uma linha e
              "7" órfão no começo da outra. Envelopar cada parcela num
              `nowrap` mantém a quebra ACONTECENDO — ela só passa a cair
              entre parcelas, que é onde ela faz sentido. */}
          <div style={{ marginTop: 6, display: "flex", flexWrap: "wrap", alignItems: "center", columnGap: 6, rowGap: 2, fontFamily: MONO, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.05em", color: INK_FAINT }}>
            {parcelas}
          </div>
          {nota}
        </div>
        <div style={{ textAlign: "right", lineHeight: 1 }}>
          <div className="rup-countpop" data-testid={testIdTotal} style={{ fontFamily: MONO, fontSize: 22, fontWeight: 700, color: acento.hex }}>{total}</div>
          <div style={{ fontFamily: MONO, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em", color: INK_FAINT }}>total</div>
        </div>
      </div>
    </div>
  );
}

/** Parcela em mono forte — o número dentro de uma parcela da conta. */
function seg(v: string, c = "#8ea0bd") {
  return <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: c }}>{v}</span>;
}

export function FaixaResultado({ r, nota, testIdTotal }: {
  r: RolagemExibida;
  /** Marca o NÚMERO do total, não a faixa inteira — quem lê espera só o número. */
  testIdTotal?: string;
  /**
   * Linha extra abaixo da conta — hoje só o talento que PROMOVEU a
   * margem. Sem ela, a faixa anunciaria "Sucesso Crítico" sem dizer que
   * quem produziu aquilo foi um talento, e não os dados.
   */
  nota?: ReactNode;
}) {
  const res = r.classificacao ? RESULTS[r.classificacao] : null;
  const acento = res?.accent ?? ACCENTS.slate;
  return (
    <FaixaChassi
      acento={acento}
      icone={res
        ? <res.Icon width={17} height={17} style={{ color: acento.hex, flexShrink: 0 }} />
        : <Dice width={17} height={17} style={{ color: acento.hex, flexShrink: 0 }} />}
      titulo={res ? res.label : "Sem CD definida"}
      nota={nota}
      total={r.total}
      testIdTotal={testIdTotal}
      parcelas={<>
        <Parcela>maior {seg(String(r.maiorDado), ACCENTS.cyan.hex)}</Parcela>
        {r.pericia
          ? <Parcela>+ {r.pericia.toLowerCase()} {seg(`+${r.periciaValor}`)}</Parcela>
          : <Parcela>· sem perícia</Parcela>}
        <Parcela>+ mod {seg(r.modificador >= 0 ? `+${r.modificador}` : String(r.modificador))}</Parcela>
        {r.cd != null && <Parcela>· cd {seg(String(r.cd), ACCENTS.amber.hex)}</Parcela>}
      </>}
    />
  );
}

/* ================================================================== */
/*  MOLDURA DA FERRAMENTA — a mesma casca da janela flutuante do VTT   */
/*  (`.rv-fp` em `vtt.css`), aqui em estilo inline.                     */
/*                                                                     */
/*  Por que inline e não a classe: `vtt.css` (e os tokens de           */
/*  `_design/vtt-chassi.css` que ela importa) só é carregada nas rotas */
/*  do VTT. O Console também roda em `/ficha` e no harness da ficha,   */
/*  onde aquelas variáveis não existem — usar a classe ali daria uma   */
/*  janela sem cor nenhuma. Os valores abaixo são os MESMOS da folha,  */
/*  já resolvidos.                                                     */
/* ================================================================== */

const CANTOS = ["tl", "tr", "bl", "br"] as const;

/** Quanto da janela precisa continuar dentro da tela depois de arrastada. */
const MARGEM_ALCANCAVEL = 48;

/**
 * Arrasto da janela, pelas duas alças: o cabeçalho e a espinha.
 *
 * Guarda um DESLOCAMENTO, não uma posição absoluta — quem posiciona a
 * janela continua sendo quem a montou (o Console a centraliza nele
 * mesmo), e isto só soma o quanto a pessoa a puxou. Assim a janela
 * segue o Console quando ele muda de tamanho, e mesmo assim fica onde
 * foi largada.
 *
 * `setPointerCapture` em vez de listeners no documento: o gesto não se
 * perde se o ponteiro sair da alça no meio do caminho, e acaba sozinho
 * em `pointercancel` (dedo levantado, gesto do sistema).
 */
function useArrasto() {
  const refJanela = useRef<HTMLElement | null>(null);
  const [desloc, setDesloc] = useState({ x: 0, y: 0 });
  const [arrastando, setArrastando] = useState(false);
  const gestoRef = useRef<{ px: number; py: number; ox: number; oy: number } | null>(null);

  const iniciarArrasto = useCallback((e: React.PointerEvent) => {
    // Botão do cabeçalho (fechar) clica, não arrasta.
    if (e.button !== 0 || (e.target as HTMLElement).closest("button, input, select, textarea, a")) return;
    const alvo = e.currentTarget as HTMLElement;
    gestoRef.current = { px: e.clientX, py: e.clientY, ox: desloc.x, oy: desloc.y };
    setArrastando(true);
    try { alvo.setPointerCapture(e.pointerId); } catch { /* segue sem captura */ }

    const mover = (ev: PointerEvent) => {
      const g = gestoRef.current;
      const el = refJanela.current;
      if (!g || !el) return;
      const bruto = { x: g.ox + (ev.clientX - g.px), y: g.oy + (ev.clientY - g.py) };
      // Clamp pela posição REAL na tela: a janela pode sair da borda,
      // mas nunca inteira — sem isto dá pra perdê-la fora do viewport.
      const r = el.getBoundingClientRect();
      const semDesloc = { left: r.left - desloc.x, top: r.top - desloc.y };
      const minX = -(semDesloc.left + r.width - MARGEM_ALCANCAVEL);
      const maxX = window.innerWidth - semDesloc.left - MARGEM_ALCANCAVEL;
      const minY = -semDesloc.top;
      const maxY = window.innerHeight - semDesloc.top - MARGEM_ALCANCAVEL;
      setDesloc({
        x: Math.min(Math.max(bruto.x, minX), maxX),
        y: Math.min(Math.max(bruto.y, minY), maxY),
      });
    };
    const soltar = (ev: PointerEvent) => {
      gestoRef.current = null;
      setArrastando(false);
      try { alvo.releasePointerCapture(ev.pointerId); } catch { /* já liberado */ }
      alvo.removeEventListener("pointermove", mover);
      alvo.removeEventListener("pointerup", soltar);
      alvo.removeEventListener("pointercancel", soltar);
    };
    alvo.addEventListener("pointermove", mover);
    alvo.addEventListener("pointerup", soltar);
    alvo.addEventListener("pointercancel", soltar);
  }, [desloc.x, desloc.y]);

  return { desloc, iniciarArrasto, arrastando, refJanela };
}

/** Casca de janela de ferramenta: brackets nos cantos, espinha vertical e cabeçalho. */
export function MolduraRolagem({ indice, codigo, titulo, modo, acento = ACCENTS.cyan.hex, largura = 470, aoFechar, rotuloFechar, children, testId }: {
  /** Número da espinha, no formato de dois dígitos das outras ferramentas. */
  indice: string;
  /** Palavra vertical da espinha. */
  codigo: string;
  titulo: string;
  /** Linha em mono sob o título, com o pip do acento. */
  modo?: string;
  acento?: string;
  largura?: number;
  aoFechar: () => void;
  rotuloFechar: string;
  children: ReactNode;
  testId?: string;
}) {
  const { desloc, iniciarArrasto, arrastando, refJanela } = useArrasto();
  const canto = (c: (typeof CANTOS)[number]): CSSProperties => ({
    position: "absolute", zIndex: 2, width: 11, height: 11, pointerEvents: "none", opacity: 0.55,
    borderColor: acento,
    ...(c === "tl" ? { left: 6, top: 6, borderLeft: "1px solid", borderTop: "1px solid" } : {}),
    ...(c === "tr" ? { right: 6, top: 6, borderRight: "1px solid", borderTop: "1px solid" } : {}),
    ...(c === "bl" ? { left: 6, bottom: 6, borderLeft: "1px solid", borderBottom: "1px solid" } : {}),
    ...(c === "br" ? { right: 6, bottom: 6, borderRight: "1px solid", borderBottom: "1px solid" } : {}),
  });
  return (
    <section
      ref={refJanela}
      role="group"
      aria-label={titulo}
      data-testid={testId}
      style={{
        transform: `translate(${desloc.x}px, ${desloc.y}px)`,
        position: "relative", width: `min(${largura}px, calc(100vw - 32px))`,
        maxHeight: "min(660px, calc(100dvh - 32px))",
        display: "flex", flexDirection: "column", overflow: "hidden",
        paddingLeft: 36, borderRadius: 2,
        background: "linear-gradient(160deg, #0b1424, #080e19)",
        border: "1px solid #182338",
        boxShadow: "0 30px 70px rgba(0, 0, 0, 0.55)",
        fontSize: 12, color: INK,
      }}
    >
      {CANTOS.map((c) => <span key={c} aria-hidden="true" style={canto(c)} />)}

      {/* A espinha também arrasta: é a segunda alça natural da janela
          (a barra vertical inteira, à esquerda), e quem pega a janela
          por ali espera que ela venha junto. */}
      <span aria-hidden="true" onPointerDown={iniciarArrasto} style={{
        position: "absolute", left: 0, top: 0, bottom: 0, width: 36,
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "space-between",
        padding: "14px 0", borderRight: "1px solid #16233a", background: "rgba(255, 255, 255, 0.015)",
        cursor: arrastando ? "grabbing" : "grab", touchAction: "none", userSelect: "none",
      }}>
        <span style={{ color: acento, font: `700 10px ${MONO}`, letterSpacing: "0.1em" }}>{indice}</span>
        <span style={{
          color: acento, opacity: 0.85, font: `700 10px ${DISPLAY}`, letterSpacing: "0.3em",
          textTransform: "uppercase", writingMode: "vertical-rl", transform: "rotate(180deg)",
          maxHeight: "100%", overflow: "hidden",
        }}>{codigo}</span>
        <span style={{ width: 6, height: 6, borderRadius: 999, background: acento, boxShadow: `0 0 6px ${acento}` }} />
      </span>

      <header onPointerDown={iniciarArrasto} style={{
        display: "flex", alignItems: "flex-start", gap: 12, padding: "14px 16px 12px",
        borderBottom: "1px solid #16233a",
        cursor: arrastando ? "grabbing" : "grab", touchAction: "none", userSelect: "none",
      }}>
        <span style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0, flex: "1 1 auto" }}>
          <span style={{ color: INK, font: `700 16px ${DISPLAY}`, letterSpacing: "0.12em", textTransform: "uppercase", lineHeight: 1 }}>
            {titulo}
          </span>
          {modo !== undefined && (
            <span style={{
              display: "flex", alignItems: "center", gap: 6, marginTop: 6,
              color: INK_FAINT, font: `10px ${MONO}`, letterSpacing: "0.14em", textTransform: "uppercase",
            }}>
              <span aria-hidden="true" style={{ flex: "none", width: 4, height: 4, borderRadius: 999, background: acento }} />
              {modo}
            </span>
          )}
        </span>
        <button
          type="button" aria-label={rotuloFechar} onClick={aoFechar}
          style={{
            flex: "0 0 auto", display: "flex", alignItems: "center", justifyContent: "center",
            width: 24, height: 24, border: "1px solid #1c2b45", borderRadius: 2,
            background: "transparent", color: INK_FAINT, cursor: "pointer",
          }}
        >
          <X width={13} height={13} />
        </button>
      </header>

      <div className="rup-scroll" style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: 16 }}>
        {children}
      </div>
    </section>
  );
}

/* ================================================================== */
/*  PRIMITIVAS DA FERRAMENTA — moradas aqui porque o Console do        */
/*  Personagem rola pela MESMA ferramenta, e um segundo `Select`/      */
/*  `Stepper`/botão de carga seria a mesma peça em duas versões.       */
/* ================================================================== */

/* ---- efeitos visuais de carga — porte literal de
   `charge dice/src/components/dice.tsx` (o `ChargeRollButton`
   integrado, não as variantes soltas do laboratório em `chargeLab.tsx`).
   Valores e curvas exatamente como no estudo; só os nomes viraram
   português, pra combinar com o resto deste arquivo. ---- */
export function lerpHex(a: string, b: string, t: number): string {
  const p = (h: string) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const [ar, ag, ab] = p(a);
  const [br, bg, bb] = p(b);
  // O estudo devolvia `rgb(r,g,b)` aqui — mas todo o resto do arquivo
  // (e o PRÓPRIO `ChargeRollButton` do estudo) compõe transparência
  // anexando sufixo hex (`${cor}55`), padrão já usado em toda parte
  // neste arquivo (`ACCENTS.cyan.hex + "88"` etc.). `rgb(...)55` é CSS
  // inválido — o navegador ignora a declaração inteira em silêncio, o
  // que apagava o brilho/fundo tingido sem erro nenhum no console.
  // Mesma matemática de interpolação, só o formato de saída vira hex.
  const canal = (n: number) => Math.round(n).toString(16).padStart(2, "0");
  return `#${canal(ar + (br - ar) * t)}${canal(ag + (bg - ag) * t)}${canal(ab + (bb - ab) * t)}`;
}
export function corDaCarga(c: number): string {
  if (c < 0.5) return lerpHex(ACCENTS.cyan.hex, ACCENTS.amber.hex, c * 2);
  return lerpHex(ACCENTS.amber.hex, ACCENTS.danger.hex, (c - 0.5) * 2);
}
export function reduzirMovimentoAtivo(): boolean {
  return typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
}

/* ================================================================== */
/*  Rolagem de Ruptura (teste): pool = Atributo (nº d8), pega o MAIOR,  */
/*  soma bônus da Perícia + modificadores, compara com a CD.            */
/*  Bandeja livre: monta um conjunto qualquer de dados (d4…d20, vários  */
/*  do mesmo tipo) e rola somando (ou pegando o maior).                 */
/*                                                                     */
/*  Não existe tabela canônica de dificuldade no sistema — o Console    */
/*  pede a CD como número livre, e aqui é igual. Os quatro degraus      */
/*  "Fácil 8 / Padrão 10 / Difícil 13 / Extrema 16" que moravam aqui    */
/*  eram invenção da maquete e saíram junto com os atributos falsos.    */
/* ================================================================== */

export const VISIBILIDADES: { v: TableLogVisibility; label: string; dica: string }[] = [
  { v: "public", label: "Mesa", dica: "todo mundo vê" },
  { v: "private", label: "Privada", dica: "só você e o narrador" },
  { v: "gm", label: "Narrador", dica: "só o narrador" },
];

/* ---- primitivas --------------------------------------------------- */

/** Select por ID (as opções vêm da ficha real, não de um array fixo). */
export function Select({ label, value, onChange, options, disabled = false }: {
  label: string; value: string; onChange: (id: string) => void;
  options: { id: string; rotulo: string }[]; disabled?: boolean;
}) {
  return (
    <label style={{ display: "block", minWidth: 0 }}>
      <span style={{ fontFamily: DISPLAY, fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.16em", color: INK_FAINT }}>{label}</span>
      <div style={{ position: "relative", marginTop: 4 }}>
        <select
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          style={{
            width: "100%", appearance: "none", borderRadius: 2, border: "1px solid #1c2b45", background: "transparent",
            padding: "9px 30px 9px 10px", fontFamily: BODY, fontSize: 12, color: disabled ? INK_FAINT : INK,
            outline: "none", cursor: disabled ? "not-allowed" : "pointer",
          }}
          onFocus={(e) => { e.currentTarget.style.borderColor = ACCENTS.cyan.hex + "88"; }}
          onBlur={(e) => { e.currentTarget.style.borderColor = "#1c2b45"; }}
        >
          {options.map((o) => <option key={o.id} value={o.id} style={{ background: "#0b1322" }}>{o.rotulo}</option>)}
        </select>
        <Chevron width={13} height={13} style={{ pointerEvents: "none", position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", color: INK_FAINT }} />
      </div>
    </label>
  );
}

export function Stepper({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const fmt = value > 0 ? `+${value}` : `${value}`;
  return (
    <div style={{ display: "inline-flex", alignItems: "center", borderRadius: 2, border: "1px solid #1c2b45" }}>
      <button type="button" onClick={() => onChange(value - 1)} {...aoPassarMouse({ background: "rgba(255,255,255,.05)", color: INK })}
        style={{ padding: "6px 12px", border: 0, background: "transparent", cursor: "pointer", fontFamily: MONO, fontSize: 14, color: INK_DIM, transition: "background .14s, color .14s" }}>−</button>
      <span style={{ minWidth: 40, textAlign: "center", fontFamily: MONO, fontSize: 13, fontWeight: 700, color: value === 0 ? "#8ea0bd" : value > 0 ? ACCENTS.good.hex : ACCENTS.danger.hex }}>{fmt}</span>
      <button type="button" onClick={() => onChange(value + 1)} {...aoPassarMouse({ background: "rgba(255,255,255,.05)", color: INK })}
        style={{ padding: "6px 12px", border: 0, background: "transparent", cursor: "pointer", fontFamily: MONO, fontSize: 14, color: INK_DIM, transition: "background .14s, color .14s" }}>+</button>
    </div>
  );
}

/**
 * CD do teste — número livre, vazio = rolagem aberta (sem sucesso/
 * falha). Mesma semântica da aba Rolagens do Console; os degraus
 * nomeados que existiam aqui não vinham de regra nenhuma.
 */
export function CampoCD({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
      <span style={{ fontFamily: DISPLAY, fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.16em", color: INK_FAINT }}>
        CD <span style={{ textTransform: "none", letterSpacing: 0 }}>(vazio = sem CD)</span>
      </span>
      <input type="number" inputMode="numeric" min={1} max={99} value={value} placeholder="—"
        onChange={(e) => onChange(e.target.value)}
        {...aoPassarMouse({ "border-color": "#2a3b58" })}
        style={{ width: 80, borderRadius: 2, background: "transparent", padding: "6px 8px", textAlign: "right", fontFamily: MONO, fontSize: 13, fontWeight: 700, border: "1px solid #1c2b45", color: ACCENTS.amber.hex, outline: "none", transition: "border-color .14s" }} />
    </label>
  );
}

/**
 * Botão de rolar — CARREGAR FORÇA: pressiona e segura (mouse, toque,
 * caneta — tudo via Pointer Events — ou `Space`/`Enter` no teclado) e
 * a carga sobe de 0% a 100% em `CARGA_MAX_MS`; soltar lança com a
 * força acumulada até ali. Um toque rápido solta perto de 0%, o que
 * ainda é uma rolagem válida — `parametrosDeLancamento` (em
 * `lancamento.ts`) garante um piso (`FORCA_MINIMA`) por baixo do valor
 * bruto, então "clique rápido" e "sem força nenhuma" nunca são a
 * mesma coisa pra física.
 *
 * A carga é INTERAÇÃO: `carregandoRef`/`disparadoRef` (refs, não
 * estado) são quem decide se um pointerup/keyup conta — evita disparo
 * duplo e mantém o disparo de fato síncrono com o gesto que soltou.
 *
 * O RESTO — anéis de batimento, o botão pulsando mais rápido conforme
 * carrega, o brilho crescendo, o tremor e o "CARGA MÁXIMA" no topo, o
 * flash ao soltar — é o conjunto vencedor do estudo `charge dice`
 * (`ChargeRollButton`, em `dice.tsx`), portado sem reinterpretar
 * curva, cor ou tempo nenhum. `onChargeChange` (mesmo nome/forma do
 * estudo) é o que deixa quem chama fazer o POOL de dados tremer junto
 * — ver `TestPool`/`FreePool`.
 */
export function RollButton({ label, solid = false, disabled = false, onRoll, onChargeChange }: {
  label: string; solid?: boolean; disabled?: boolean; onRoll: (forca: number) => void; onChargeChange?: (c: number) => void;
}) {
  const [carga, setCarga] = useState(0);
  const [carregando, setCarregando] = useState(false);
  const [batendo, setBatendo] = useState(false);
  const [aneis, setAneis] = useState<{ id: number }[]>([]);
  const [estourando, setEstourando] = useState(false);
  const carregandoRef = useRef(false);
  const disparadoRef = useRef(true); // começa "já disparado": nada solto sem antes ter pressionado
  const inicioRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const cargaRef = useRef(0);
  cargaRef.current = carga;
  const idAnelRef = useRef(0);
  const timerBatidaRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const pararRaf = useCallback(() => {
    if (rafRef.current != null) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
  }, []);

  const passo = useCallback(() => {
    if (!carregandoRef.current) return;
    const c = Math.min(1, (performance.now() - inicioRef.current) / CARGA_MAX_MS);
    setCarga(c);
    onChargeChange?.(c);
    if (c < 1) rafRef.current = requestAnimationFrame(passo);
  }, [onChargeChange]);

  /**
   * Anéis emanando + leve pulso de escala — o intervalo entre batidas
   * encolhe de 700ms a 140ms conforme a carga sobe (mesma rampa do
   * "charge lab v1+3", como o próprio estudo documenta). Desligado
   * inteiro sob `prefers-reduced-motion`: é reforço, não informação —
   * a barra de progresso já expõe o valor.
   */
  const agendarBatidas = useCallback(() => {
    if (reduzirMovimentoAtivo()) return;
    const bater = () => {
      const c = cargaRef.current;
      const intervalo = Math.max(140, 700 - c * 560);
      setBatendo(true);
      setTimeout(() => setBatendo(false), 80);
      const id = idAnelRef.current++;
      setAneis((r) => [...r, { id }]);
      setTimeout(() => setAneis((r) => r.filter((x) => x.id !== id)), 900);
      timerBatidaRef.current = setTimeout(bater, intervalo);
    };
    timerBatidaRef.current = setTimeout(bater, 650);
  }, []);

  const iniciarCarga = useCallback(() => {
    if (disabled || carregandoRef.current) return;
    carregandoRef.current = true;
    disparadoRef.current = false;
    inicioRef.current = performance.now();
    setCarregando(true);
    setCarga(0);
    onChargeChange?.(0);
    pararRaf();
    rafRef.current = requestAnimationFrame(passo);
    agendarBatidas();
  }, [disabled, pararRaf, passo, agendarBatidas, onChargeChange]);

  const soltarCarga = useCallback(() => {
    if (!carregandoRef.current || disparadoRef.current) return;
    disparadoRef.current = true;
    carregandoRef.current = false;
    pararRaf();
    clearTimeout(timerBatidaRef.current);
    const forca = Math.min(1, (performance.now() - inicioRef.current) / CARGA_MAX_MS);
    setCarregando(false);
    setCarga(0);
    onChargeChange?.(0);
    setAneis([]);
    if (!reduzirMovimentoAtivo()) { setEstourando(true); setTimeout(() => setEstourando(false), 400); }
    onRoll(forca);
  }, [onRoll, onChargeChange, pararRaf]);

  /** `pointercancel`/desmontar: encerra sem disparar rolagem nenhuma. */
  const cancelarCarga = useCallback(() => {
    disparadoRef.current = true;
    carregandoRef.current = false;
    pararRaf();
    clearTimeout(timerBatidaRef.current);
    setCarregando(false);
    setCarga(0);
    onChargeChange?.(0);
    setAneis([]);
  }, [pararRaf, onChargeChange]);

  useEffect(() => () => { pararRaf(); clearTimeout(timerBatidaRef.current); }, [pararRaf]);

  const aoPressionar = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (disabled) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    iniciarCarga();
  };
  // Com o ponteiro capturado, `pointerup` chega aqui mesmo se soltar
  // fora do botão — é o pedido explícito de "soltar fora funciona".
  const aoSoltarPonteiro = () => soltarCarga();
  const aoCancelarPonteiro = () => cancelarCarga();

  const teclaDeCarga = (k: string) => k === " " || k === "Spacebar" || k === "Enter";
  const aoTeclarBaixo = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (!teclaDeCarga(e.key)) return;
    // Suprime o `click` nativo de Enter/Espaço no <button> — quem
    // dispara a rolagem é `soltarCarga`, não o DOM — e impede que a
    // tecla suba até os atalhos globais da mesa (V/L/M/D/A/R/T/O).
    e.preventDefault();
    e.stopPropagation();
    if (e.repeat) return; // key-repeat do SO não reinicia a carga
    iniciarCarga();
  };
  const aoTeclarCima = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (!teclaDeCarga(e.key)) return;
    e.preventDefault();
    e.stopPropagation();
    soltarCarga();
  };

  const corCarga = corDaCarga(carga);
  const noMaximo = carga >= 0.995;
  const brilho = carga * 22;
  // Fundo NÃO reage à carga — só cor de texto/borda, brilho, anéis,
  // tremor e o rótulo. O tingimento do fundo era do estudo original;
  // pedido explícito: tirar.
  const fundoOcioso = solid ? ACCENTS.cyan.hex : ACCENTS.cyan.soft;
  const skin: CSSProperties = disabled
    ? { color: "#4a5a78", background: "transparent", border: "1px solid #1c2b45" }
    : carregando
      ? { color: corCarga, background: fundoOcioso, border: `1px solid ${corCarga}` }
      : solid
        ? { color: "#08111c", background: fundoOcioso, border: `1px solid ${ACCENTS.cyan.hex}` }
        : { color: ACCENTS.cyan.hex, background: fundoOcioso, border: `1px solid ${ACCENTS.cyan.hex}88` };
  const rotulo = carregando ? "Solte para lançar!" : label;
  return (
    <div style={{ position: "relative" }}>
      {/* flash ao soltar */}
      {estourando && (
        <div className="rup-burst-flash" aria-hidden="true" style={{ position: "absolute", inset: 0, borderRadius: 2, background: corDaCarga(cargaRef.current), zIndex: 20, pointerEvents: "none" }} />
      )}
      {/* anéis de batimento emanando do botão */}
      {aneis.map((anel) => (
        <div key={anel.id} aria-hidden="true"
          style={{
            position: "absolute", inset: -2, borderRadius: 2, pointerEvents: "none",
            border: `1px solid ${corCarga}`,
            animation: `rup-charge-ring ${Math.max(0.38, 0.75 - carga * 0.37)}s ease-out forwards`,
          }}
        />
      ))}
      <button type="button" disabled={disabled}
        data-carregando-forca={carregando ? "true" : undefined}
        onPointerDown={aoPressionar} onPointerUp={aoSoltarPonteiro}
        onPointerCancel={aoCancelarPonteiro} onLostPointerCapture={aoCancelarPonteiro}
        onKeyDown={aoTeclarBaixo} onKeyUp={aoTeclarCima}
        className={noMaximo ? "rup-charge-shake" : undefined}
        style={{
          position: "relative", overflow: "hidden",
          display: "flex", width: "100%", alignItems: "center", justifyContent: "center", gap: 8,
          borderRadius: 2, padding: "10px 0", cursor: disabled ? "not-allowed" : "pointer",
          fontFamily: DISPLAY, fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.22em",
          transform: batendo && !noMaximo ? "scale(1.032)" : "scale(1)",
          transition: batendo ? "none" : "transform .09s ease-out, color .12s, background .15s, border-color .12s",
          boxShadow: brilho > 0 ? `0 0 ${brilho}px ${corCarga}55, 0 0 ${brilho * 2}px ${corCarga}18` : undefined,
          touchAction: "none", userSelect: "none", ...skin,
        }}
        onMouseEnter={(e) => { if (!solid && !disabled && !carregando) e.currentTarget.style.borderColor = ACCENTS.cyan.hex; }}
        onMouseLeave={(e) => { if (!solid && !disabled && !carregando) e.currentTarget.style.borderColor = ACCENTS.cyan.hex + "88"; }}>
        {carregando && (
          // Só acessível — o valor sai por `aria-valuenow`, não por um
          // preenchimento visível. Cor/borda/brilho/anéis/tremor já
          // carregam a leitura visual da força; um retângulo crescendo
          // por cima é o que pediram pra tirar.
          <span
            role="progressbar" aria-label="Força do lançamento" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(carga * 100)}
            style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0,0,0,0)", whiteSpace: "nowrap" }}
          />
        )}
        <span className={noMaximo ? "rup-max-pulse" : undefined} style={{ position: "relative", display: "flex", alignItems: "center", gap: 8 }}>
          <Dice width={16} height={16} />
          {rotulo}
        </span>
      </button>
    </div>
  );
}

/* ================================================================== */
/*  Conjunto livre — escolha dados, vários iguais, role e some         */
/* ================================================================== */


/** Seletor de quem enxerga a rolagem. `gm` só aparece pro narrador. */
export function SeletorVisibilidade({ valor, onChange, ehNarrador }: {
  valor: TableLogVisibility; onChange: (v: TableLogVisibility) => void; ehNarrador: boolean;
}) {
  const opcoes = VISIBILIDADES.filter((o) => o.v !== "gm" || ehNarrador);
  return (
    <div role="group" aria-label="Quem vê esta rolagem" style={{ display: "flex", gap: 4 }}>
      {opcoes.map((o) => {
        const on = o.v === valor;
        return (
          <button key={o.v} type="button" onClick={() => onChange(o.v)} aria-pressed={on} title={o.dica}
            /* O LIGADO não reage: ele já está aceso no ciano, e mexer
               nele no hover só embaralharia "selecionado" com "sob o
               cursor". */
            {...(on ? {} : aoPassarMouse({ "border-color": "#2a3b58", color: "#9fb3d1", background: "rgba(255,255,255,.04)" }))}
            style={{
              transition: "border-color .14s, color .14s, background .14s",
              flex: 1, borderRadius: 2, padding: "5px 6px", cursor: "pointer",
              fontFamily: DISPLAY, fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.14em",
              color: on ? ACCENTS.cyan.hex : "#6f83a3", background: on ? ACCENTS.cyan.soft : "transparent",
              border: `1px solid ${on ? ACCENTS.cyan.hex + "88" : "#1c2b45"}`,
            }}>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

