"use client";

/**
 * Painel de camadas do mapa — só as que EXISTEM de verdade no SVG de
 * `_mapa/MapaHex.tsx` (nenhuma opção falsa).
 *
 * Visibilidade e bloqueio são DA CENA (migration 0093), não da tela de
 * quem clicou: o narrador esconde uma camada e ela some pra mesa;
 * trava e ninguém mexe. Já foi preferência local em `localStorage`, o
 * que invertia o sentido da ferramenta — esconder Objetos escondia só
 * de quem escondeu.
 *
 * O que continua verdade: nenhuma REGRA muda. Pathfinding, colisão,
 * custo de terreno e linha de visão seguem enxergando a camada
 * escondida exatamente como antes — esconder é sobre o que se DESENHA.
 * E o narrador continua vendo o que escondeu, marcado como oculto,
 * pelo mesmo princípio que `vtt_tokens.visivel` já usa: quem esconde
 * precisa enxergar o que escondeu pra poder trabalhar.
 *
 * Bloqueio de interação só existe pras camadas que TÊM ação própria:
 * Terreno funcional (pintar), Marcações (criar/apagar), Desenhos e textos e Tokens
 * (selecionar/arrastar). Grade/terreno decorativo/objetos/pings não
 * têm ação própria pra travar — só visibilidade.
 *
 * SÓ NARRADOR. Esconder e travar camada é decisão de quem conduz a
 * cena — o narrador dita o que está no mapa e o que dá pra mexer. Um
 * jogador que pudesse esconder Objetos ou destravar Tokens estaria
 * decidindo sobre o tabuleiro da mesa inteira pela porta dos fundos.
 * Quem faz o gate é `VttClient` (botão da barra e a janela), aqui não
 * há checagem própria: papel é do servidor, e este componente é
 * apresentação.
 *
 * A JANELA é a casca comum (`JanelaFerramenta`, linha F, largura de
 * gestão): vitrine com a pilha isométrica, duas listas (cena e
 * ferramentas) e o "Restaurar padrão" no rodapé. A descrição de cada
 * camada saiu da linha e virou a frase de ajuda do hover.
 *
 * REORDENAR: o "Conteúdo da cena" vai do topo pro fundo, como num app
 * de imagem — arrasta pela alça ou usa ▲▼. A ordem é preferência LOCAL
 * (`_ferramentas/camadasPreferencias.ts`) e o mapa a empilha de
 * verdade (`MapaHex` → `empilhar`).
 *
 * O que se perdeu de propósito: fechar ao clicar fora. Uma janela que
 * a pessoa arrastou pra um canto sumir ao primeiro clique no mapa seria
 * hostil — e nenhuma das outras faz isso. Esc e o botão da barra
 * continuam fechando.
 */

import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp, Eye, EyeOff, GripVertical, Layers, Lock, RotateCcw, Unlock } from "lucide-react";
import { ORDEM_CENA_PADRAO, type CamadaCenaId } from "../_ferramentas/camadasPreferencias";
import { JanelaFerramenta } from "./JanelaFerramenta";

export type CamadaId =
  | "imagemFundo" | "tiles" | "grade" | "terrenoFuncional" | "objetos" | "marcas" | "anotacoes" | "tokens" | "pings";

export interface EstadoUmaCamada {
  visivel: boolean;
  bloqueada: boolean;
}

export type EstadoCamadas = Record<CamadaId, EstadoUmaCamada>;

/**
 * Em que metade da pilha a camada mora.
 *
 *   · "cena"        — o que existe na ficção: terreno, objetos, quem
 *     está lá.
 *   · "ferramentas" — o que o VTT desenha por cima pra ajudar a operar
 *     o mapa. Grade, marcações e pings não existem no mundo do jogo.
 *
 * A separação não é enfeite, e decide COMO cada uma some. Conteúdo
 * escondido continua visível pro narrador, atenuado — ele escondeu da
 * mesa, mas precisa enxergar pra trabalhar, igual a um token com
 * `visivel: false`. Ferramenta escondida some pra todo mundo, narrador
 * incluído: esconder a grade e continuar vendo a grade não é esconder
 * nada.
 */
export type GrupoCamada = "cena" | "ferramentas";

interface DefinicaoCamada {
  id: CamadaId;
  rotulo: string;
  temBloqueio: boolean;
  grupo: GrupoCamada;
  /** O que a camada É — não o estado dela, que os ícones já dizem. */
  descricao: string;
}

/** Definição das camadas. A ordem do "Conteúdo da cena" na tela vem de `ordem` (preferência local, `camadasPreferencias.ts`) e é ela que o mapa empilha; a das ferramentas é fixa. */
export const CAMADAS_DEFINICAO: DefinicaoCamada[] = [
  // Imagem entra como DUAS camadas, não uma, porque os ids são
  // contrato do servidor: `vtt_asset_assinavel_para` (0100) decide se
  // assina a URL consultando `imagemFundo` ou `tiles` conforme o papel
  // da colocação. Esconder aqui não é só parar de desenhar — é parar de
  // emitir URL nova pro jogador.
  //
  // E separar as duas é o que torna a camada útil: um mapa de fundo e
  // os móveis por cima quase nunca se escondem juntos. Revelar a planta
  // sem revelar onde estão as coisas é um gesto de narração comum.
  { id: "imagemFundo", rotulo: "Mapa", temBloqueio: true, grupo: "cena", descricao: "a planta por baixo de tudo" },
  { id: "tiles", rotulo: "Imagens soltas", temBloqueio: true, grupo: "cena", descricao: "móveis, manchas, recortes" },
  { id: "terrenoFuncional", rotulo: "Terreno", temBloqueio: true, grupo: "cena", descricao: "difícil e bloqueado" },
  { id: "objetos", rotulo: "Objetos / coberturas", temBloqueio: false, grupo: "cena", descricao: "cobertura e colisão" },
  { id: "tokens", rotulo: "Tokens", temBloqueio: true, grupo: "cena", descricao: "quem está em cena" },
  { id: "grade", rotulo: "Grade", temBloqueio: false, grupo: "ferramentas", descricao: "referência de distância" },
  { id: "marcas", rotulo: "Marcações", temBloqueio: true, grupo: "ferramentas", descricao: "sinais deixados na mesa" },
  { id: "anotacoes", rotulo: "Desenhos e textos", temBloqueio: true, grupo: "ferramentas", descricao: "anotações livres da cena" },
  { id: "pings", rotulo: "Pings", temBloqueio: false, grupo: "ferramentas", descricao: "sinal momentâneo" },
];

/**
 * Sigla de cada camada — o quadradinho à esquerda da linha, do estudo
 * (`LayersContent`, "T"/"O"/"A"/"TF"/"M"). Distingue as duas de terreno
 * sem depender de ler o rótulo inteiro.
 */

const SIGLA_CAMADA: Record<CamadaId, string> = {
  imagemFundo: "IF",
  tiles: "IM",
  grade: "G",
  terrenoFuncional: "T",
  objetos: "O",
  marcas: "M",
  anotacoes: "DT",
  tokens: "TK",
  pings: "P",
};

/**
 * Camada de FERRAMENTA some pra todo mundo quando escondida — não
 * ganha o tratamento de "o narrador continua vendo, atenuado" que vale
 * pro conteúdo da cena. Vive aqui, ao lado da definição, pra que o
 * mapa não precise reimplementar a regra.
 */
export function ehCamadaDeFerramenta(id: CamadaId): boolean {
  return CAMADAS_DEFINICAO.find((d) => d.id === id)?.grupo === "ferramentas";
}

export const CAMADAS_PADRAO: EstadoCamadas = {
  imagemFundo: { visivel: true, bloqueada: false },
  tiles: { visivel: true, bloqueada: false },
  grade: { visivel: true, bloqueada: false },
  terrenoFuncional: { visivel: true, bloqueada: false },
  objetos: { visivel: true, bloqueada: false },
  marcas: { visivel: true, bloqueada: false },
  anotacoes: { visivel: true, bloqueada: false },
  tokens: { visivel: true, bloqueada: false },
  pings: { visivel: true, bloqueada: false },
};

function estadoUmaCamadaValido(v: unknown): v is EstadoUmaCamada {
  return !!v && typeof v === "object" && typeof (v as EstadoUmaCamada).visivel === "boolean" && typeof (v as EstadoUmaCamada).bloqueada === "boolean";
}

/**
 * Lê as camadas vindas da CENA — tolerante a qualquer coisa que não
 * bata o formato: cena antiga sem a coluna, jsonb de um schema velho,
 * camada removida do código, camada nova sem entrada gravada. Nunca
 * lança; o que não valida cai no padrão.
 *
 * É a mesma porta pra leitura persistida e pro payload de Realtime —
 * um evento ao vivo não é mais confiável que uma linha lida, e duas
 * validações diferentes é como estados impossíveis nascem.
 */
export function camadasDeJson(bruto: unknown): EstadoCamadas {
  const resultado = { ...CAMADAS_PADRAO };
  if (!bruto || typeof bruto !== "object") return resultado;
  const json = bruto as Record<string, unknown>;
  for (const def of CAMADAS_DEFINICAO) {
    const entrada = json[def.id];
    if (estadoUmaCamadaValido(entrada)) resultado[def.id] = entrada;
  }
  return resultado;
}

/** Placa da pilha isométrica — `i` = altura (0 = fundo). */
function placaD(i: number): string {
  const y = 100 - i * 10.5;
  return `M14 ${y}L70 ${y - 15}L126 ${y}L70 ${y + 15}Z`;
}

export function PainelCamadas({
  aberto, camadas, erro, ordem = ORDEM_CENA_PADRAO, onReordenar,
  onAlternarVisivel, onAlternarBloqueio, onRestaurarPadrao, onFechar, botaoRef,
}: {
  aberto: boolean;
  camadas: EstadoCamadas;
  /** Recusa do servidor no último ajuste. A tela já voltou pro estado válido; isto é o que explica por quê. */
  erro?: string | null;
  /** Ordem do conteúdo da cena, TOPO → FUNDO. É a mesma que `MapaHex` recebe em `ordemCamadas`. */
  ordem?: readonly CamadaCenaId[];
  /** Sem esta prop o painel não oferece reordenação (nada muda no mapa sem ela). */
  onReordenar?: (ordem: readonly CamadaCenaId[]) => void;
  onAlternarVisivel: (id: CamadaId) => void;
  onAlternarBloqueio: (id: CamadaId) => void;
  onRestaurarPadrao: () => void;
  onFechar: () => void;
  /** Botão "Camadas do mapa" da barra de ferramentas — recebe o foco de volta ao fechar por Esc/clique externo. */
  botaoRef: React.RefObject<HTMLButtonElement | null>;
}) {
  const [foco, setFoco] = useState<CamadaId | null>(null);
  const [arrastando, setArrastando] = useState<CamadaCenaId | null>(null);
  const [alvo, setAlvo] = useState<{ id: CamadaCenaId; acima: boolean } | null>(null);

  useEffect(() => {
    if (!aberto) return;
    function aoTeclar(e: KeyboardEvent) {
      if (e.key === "Escape") { onFechar(); botaoRef.current?.focus(); }
    }
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [aberto, onFechar, botaoRef]);

  if (!aberto) return null;

  const def = (id: CamadaId) => CAMADAS_DEFINICAO.find((d) => d.id === id)!;
  const ferramentas = CAMADAS_DEFINICAO.filter((d) => d.grupo === "ferramentas");
  const ocultas = CAMADAS_DEFINICAO.filter((d) => !camadas[d.id].visivel);
  const nTravadas = CAMADAS_DEFINICAO.filter((d) => camadas[d.id].bloqueada).length;
  const podeReordenar = !!onReordenar;
  // Pilha da vitrine, de baixo pra cima: a cena na ordem escolhida e as
  // ferramentas por cima — o mesmo sentido em que o mapa desenha.
  const placas = [...[...ordem].reverse().map(def), ...ferramentas];
  const focoDef = foco ? def(foco) : null;
  const posFoco = foco ? (ordem as readonly string[]).indexOf(foco) : -1;

  const mover = (id: CamadaCenaId, para: number) => {
    if (!onReordenar) return;
    const nova = ordem.filter((x) => x !== id);
    nova.splice(Math.max(0, Math.min(nova.length, para)), 0, id);
    onReordenar(nova);
  };
  const fimArrasto = () => { setArrastando(null); setAlvo(null); };

  const desc = arrastando
    ? "Solte onde a camada deve ficar · em cima cobre o que está embaixo"
    : focoDef
      ? `${focoDef.descricao.charAt(0).toUpperCase()}${focoDef.descricao.slice(1)}${camadas[focoDef.id].bloqueada ? " · travada, não recebe clique" : ""}`
      : ocultas.length
        ? `Oculta: ${ocultas.map((d) => d.rotulo).join(", ")}`
        : "Todas as camadas visíveis";

  const linha = (d: DefinicaoCamada, extra?: { k: number }) => {
    const st = camadas[d.id];
    const ehCena = extra !== undefined;
    const id = d.id as CamadaCenaId;
    const k = extra?.k ?? 0;
    const classe = [
      "rv-camadas-item jf-cam",
      arrastando === d.id ? "is-arrastando" : "",
      ehCena && alvo?.id === d.id && arrastando !== d.id ? (alvo.acima ? "is-alvo-acima" : "is-alvo-abaixo") : "",
    ].filter(Boolean).join(" ");
    return (
      <li
        key={d.id}
        className={classe}
        data-oculta={!st.visivel || undefined}
        draggable={ehCena && podeReordenar ? true : undefined}
        onDragStart={ehCena && podeReordenar ? (e) => {
          try { e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", d.id); } catch { /* alguns navegadores recusam */ }
          setArrastando(id);
        } : undefined}
        onDragOver={ehCena && arrastando ? (e) => {
          e.preventDefault();
          const r = e.currentTarget.getBoundingClientRect();
          const acima = e.clientY < r.top + r.height / 2;
          if (!alvo || alvo.id !== id || alvo.acima !== acima) setAlvo({ id, acima });
        } : undefined}
        onDrop={ehCena && arrastando ? (e) => {
          e.preventDefault();
          const de = arrastando;
          if (de && de !== id) {
            const sem = ordem.filter((x) => x !== de);
            mover(de, sem.indexOf(id) + (alvo && !alvo.acima ? 1 : 0));
            setFoco(de);
          }
          fimArrasto();
        } : undefined}
        onDragEnd={ehCena ? fimArrasto : undefined}
        onMouseEnter={() => setFoco(d.id)}
        onMouseLeave={() => setFoco(null)}
        onFocus={() => setFoco(d.id)}
        onBlur={() => setFoco(null)}
      >
        {ehCena && podeReordenar && <span className="jf-cam-alca" aria-hidden="true"><GripVertical size={13} /></span>}
        <span className="rv-camadas-sigla jf-cam-sigla" aria-hidden="true">{SIGLA_CAMADA[d.id]}</span>
        <span className="rv-camadas-nome jf-cam-nome">{d.rotulo}</span>
        {ehCena && podeReordenar && (
          <span className="jf-cam-ordem">
            <button type="button" className="jf-mini" disabled={k === 0} aria-label={`Subir ${d.rotulo}`} onClick={() => { mover(id, k - 1); setFoco(id); }}>
              <ChevronUp size={13} />
            </button>
            <button type="button" className="jf-mini" disabled={k === ordem.length - 1} aria-label={`Descer ${d.rotulo}`} onClick={() => { mover(id, k + 1); setFoco(id); }}>
              <ChevronDown size={13} />
            </button>
          </span>
        )}
        {d.temBloqueio ? (
          <button
            type="button"
            className={`rv-camadas-btn jf-mini jf-cam-btn${st.bloqueada ? " is-on" : ""}`}
            aria-pressed={st.bloqueada}
            aria-label={`${st.bloqueada ? "Desbloquear" : "Bloquear"} interação com ${d.rotulo}`}
            onClick={() => onAlternarBloqueio(d.id)}
          >
            {st.bloqueada ? <Lock size={14} /> : <Unlock size={14} />}
          </button>
        ) : <span className="jf-cam-vago" aria-hidden="true" />}
        <button
          type="button"
          className={`rv-camadas-btn jf-mini jf-cam-btn${st.visivel ? "" : " is-on"}`}
          aria-pressed={st.visivel}
          aria-label={`${st.visivel ? "Ocultar" : "Mostrar"} camada ${d.rotulo}`}
          onClick={() => onAlternarVisivel(d.id)}
        >
          {st.visivel ? <Eye size={15} /> : <EyeOff size={15} />}
        </button>
      </li>
    );
  };

  return (
    <JanelaFerramenta
      id="camadas"
      largura="gestao"
      icone={<Layers size={16} />}
      titulo="Camadas"
      modo={ocultas.length ? `${ocultas.length} ${ocultas.length === 1 ? "oculta" : "ocultas"}` : "Tudo visível"}
      rotulo="Camadas do mapa"
      rotuloFechar="Fechar painel de camadas"
      aoFechar={() => { onFechar(); botaoRef.current?.focus(); }}
    >
      <div className="jf-corpo jf-camadas">
        <div className="jf-hero jf-cam-hero">
          <svg width="150" height="124" viewBox="0 0 140 116" aria-hidden="true">
            {placas.map((d, i) => (
              <path
                key={d.id}
                d={placaD(i)}
                className={`jf-placa${camadas[d.id].visivel ? " is-vis" : " is-oculta"}${foco === d.id ? " is-foco" : ""}`}
              />
            ))}
          </svg>
          <div className="jf-cam-stats">
            <span className="jf-cam-stat"><span className="jf-l">Visíveis</span><b>{CAMADAS_DEFINICAO.length - ocultas.length}<small>/{CAMADAS_DEFINICAO.length}</small></b></span>
            <span className="jf-cam-stat"><span className="jf-l">Travadas</span><b>{nTravadas}</b></span>
            <span className="jf-leg">
              {focoDef
                ? `${focoDef.rotulo}${posFoco >= 0 ? ` · ${posFoco + 1}ª de cima` : ""}`
                : podeReordenar ? "Arraste pra mudar a ordem" : "Passe o mouse numa camada"}
            </span>
          </div>
        </div>

        <div className="jf-grupo">
          <span className="jf-rot" id="rv-fp-rot-camadas-cena"><span>Conteúdo da cena</span>{podeReordenar && <span className="jf-cam-pontas">topo ↑</span>}</span>
          <ul className="jf-cam-lista" aria-labelledby="rv-fp-rot-camadas-cena">
            {ordem.map((id, k) => linha(def(id), { k }))}
          </ul>
          {podeReordenar && <span className="jf-cam-pontas jf-cam-pontas--fim">fundo ↓</span>}
        </div>

        <div className="jf-grupo">
          <span className="jf-rot" id="rv-fp-rot-camadas-ferramentas">Ferramentas</span>
          <ul className="jf-cam-lista" aria-labelledby="rv-fp-rot-camadas-ferramentas">
            {ferramentas.map((d) => linha(d))}
          </ul>
        </div>

        <p className="jf-desc" aria-live="polite">{desc}</p>
        {erro && <p className="rv-fp-erro" role="alert">{erro}</p>}

        <div className="jf-atalhos">
          <button
            type="button"
            className="jf-quieto rv-camadas-restaurar"
            onClick={() => { onRestaurarPadrao(); onReordenar?.(ORDEM_CENA_PADRAO); }}
          >
            <RotateCcw size={13} /> Restaurar padrão
          </button>
          <span><kbd className="jf-kbd">Esc</kbd>fecha</span>
        </div>
      </div>
    </JanelaFerramenta>
  );
}
