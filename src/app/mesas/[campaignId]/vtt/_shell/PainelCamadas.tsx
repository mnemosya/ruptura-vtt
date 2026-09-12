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
 * Terreno funcional (pintar), Marcações (criar/apagar) e Tokens
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
 * A JANELA passou a ser a casca comum (`JanelaFerramenta`), como no
 * estudo — lá Camadas é o painel `index: "09"`, com a mesma moldura das
 * outras nove. Com isso ela ganha espinha, cantos, arrasto e memória de
 * posição, e o "Restaurar padrão" vai pro rodapé, que é onde o estudo
 * põe a ação secundária.
 *
 * O que se perdeu de propósito: fechar ao clicar fora. Uma janela que
 * a pessoa arrastou pra um canto sumir ao primeiro clique no mapa seria
 * hostil — e nenhuma das outras faz isso. Esc e o botão da barra
 * continuam fechando.
 */

import { useEffect } from "react";
import { Eye, EyeOff, Layers, Lock, RotateCcw, Unlock } from "lucide-react";
import { JanelaFerramenta } from "./JanelaFerramenta";

export type CamadaId =
  | "imagemFundo" | "tiles" | "grade" | "terrenoFuncional" | "objetos" | "marcas" | "tokens" | "pings";

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

/** Ordem de exibição no painel — não é `z-index` (isso continua fixo no SVG, ver `MapaHex.tsx`), só a ordem da lista de controles. */
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
  { id: "imagemFundo", rotulo: "Fundo do mapa", temBloqueio: true, grupo: "cena", descricao: "a planta por baixo de tudo" },
  { id: "tiles", rotulo: "Imagens soltas", temBloqueio: true, grupo: "cena", descricao: "móveis, manchas, recortes" },
  { id: "terrenoFuncional", rotulo: "Terreno", temBloqueio: true, grupo: "cena", descricao: "difícil e bloqueado" },
  { id: "objetos", rotulo: "Objetos / coberturas", temBloqueio: false, grupo: "cena", descricao: "cobertura e colisão" },
  { id: "tokens", rotulo: "Tokens", temBloqueio: true, grupo: "cena", descricao: "quem está em cena" },
  { id: "grade", rotulo: "Grade", temBloqueio: false, grupo: "ferramentas", descricao: "referência de distância" },
  { id: "marcas", rotulo: "Marcações", temBloqueio: true, grupo: "ferramentas", descricao: "sinais deixados na mesa" },
  { id: "pings", rotulo: "Pings", temBloqueio: false, grupo: "ferramentas", descricao: "sinal momentâneo" },
];

/**
 * Sigla de cada camada — o quadradinho à esquerda da linha, do estudo
 * (`LayersContent`, "T"/"O"/"A"/"TF"/"M"). Distingue as duas de terreno
 * sem depender de ler o rótulo inteiro.
 */
/** As duas metades da pilha, na ordem em que aparecem. */
const GRUPOS: { id: GrupoCamada; titulo: string }[] = [
  { id: "cena", titulo: "Conteúdo da cena" },
  { id: "ferramentas", titulo: "Ferramentas" },
];

const SIGLA_CAMADA: Record<CamadaId, string> = {
  imagemFundo: "IF",
  tiles: "IM",
  grade: "G",
  terrenoFuncional: "T",
  objetos: "O",
  marcas: "M",
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

export function PainelCamadas({
  aberto, camadas, erro, onAlternarVisivel, onAlternarBloqueio, onRestaurarPadrao, onFechar, botaoRef,
}: {
  aberto: boolean;
  camadas: EstadoCamadas;
  /** Recusa do servidor no último ajuste. A tela já voltou pro estado válido; isto é o que explica por quê. */
  erro?: string | null;
  onAlternarVisivel: (id: CamadaId) => void;
  onAlternarBloqueio: (id: CamadaId) => void;
  onRestaurarPadrao: () => void;
  onFechar: () => void;
  /** Botão "Camadas do mapa" da barra de ferramentas — recebe o foco de volta ao fechar por Esc/clique externo. */
  botaoRef: React.RefObject<HTMLButtonElement | null>;
}) {
  useEffect(() => {
    if (!aberto) return;
    function aoTeclar(e: KeyboardEvent) {
      if (e.key === "Escape") { onFechar(); botaoRef.current?.focus(); }
    }
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [aberto, onFechar, botaoRef]);

  if (!aberto) return null;

  return (
    <JanelaFerramenta
      id="camadas"
      indice="09"
      codigo="Camadas"
      icone={<Layers size={16} />}
      titulo="Camadas"
      modo="Visibilidade e interação"
      rotulo="Camadas do mapa"
      rotuloFechar="Fechar painel de camadas"
      aoFechar={() => { onFechar(); botaoRef.current?.focus(); }}
    >
      <div className="rv-fp-corpo">
        {GRUPOS.map((g) => (
          <div className="rv-fp-grupo" key={g.id}>
            <span className="rv-fp-rotulo" id={`rv-fp-rot-camadas-${g.id}`}>{g.titulo}</span>
            <ul className="rv-camadas-lista" aria-labelledby={`rv-fp-rot-camadas-${g.id}`}>
              {CAMADAS_DEFINICAO.filter((d) => d.grupo === g.id).map((def) => {
                const st = camadas[def.id];
                return (
                  <li key={def.id} className="rv-camadas-item" data-oculta={!st.visivel || undefined}>
                    <span className="rv-camadas-sigla" aria-hidden="true">{SIGLA_CAMADA[def.id]}</span>
                    <span className="rv-camadas-txt">
                      <span className="rv-camadas-nome">{def.rotulo}</span>
                      <span className="rv-camadas-sub">{def.descricao}</span>
                    </span>
                    {def.temBloqueio ? (
                      <button
                        type="button"
                        className="rv-camadas-btn"
                        aria-pressed={st.bloqueada}
                        aria-label={`${st.bloqueada ? "Desbloquear" : "Bloquear"} interação com ${def.rotulo}`}
                        title={st.bloqueada ? "Desbloquear interação" : "Bloquear interação"}
                        onClick={() => onAlternarBloqueio(def.id)}
                      >
                        {st.bloqueada ? <Lock size={15} /> : <Unlock size={15} />}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="rv-camadas-btn"
                      aria-pressed={st.visivel}
                      aria-label={`${st.visivel ? "Ocultar" : "Mostrar"} camada ${def.rotulo}`}
                      title={st.visivel ? "Ocultar" : "Mostrar"}
                      onClick={() => onAlternarVisivel(def.id)}
                    >
                      {st.visivel ? <Eye size={15} /> : <EyeOff size={15} />}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>

      {erro && <p className="rv-fp-erro" role="alert">{erro}</p>}

      <div className="rv-fp-rodape">
        <button type="button" className="rv-fp-secundaria" onClick={onRestaurarPadrao}>
          <RotateCcw size={13} /> Restaurar padrão
        </button>
      </div>
    </JanelaFerramenta>
  );
}
