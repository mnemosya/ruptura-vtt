"use client";

/**
 * Camada de IMAGENS sobre o mapa — a planta de fundo e os recortes
 * soltos ("tiles").
 *
 * ── POR QUE DUAS CAMADAS, E NÃO UMA ─────────────────────────────────
 * O mapa continua sendo SVG por decisão declarada (ver o cabeçalho de
 * `MapaHex.tsx`): a grade de Ruptura é geométrica, e regra precisa
 * pede vetor. O que entra aqui é raster DECORATIVO, e decoração tem
 * dois lugares possíveis na pilha:
 *
 *   • `abaixo_grade` — o caso normal. A planta é o chão; grade,
 *     terreno, objetos e tokens se apoiam em cima dela e continuam
 *     legíveis.
 *   • `acima_grade` — o recorte que precisa esconder a grade embaixo
 *     (um tapete, um telhado, uma mancha). Ainda assim fica ABAIXO de
 *     tokens e marcações: nenhuma decoração pode tapar quem está em
 *     cena nem um sinal deixado pela mesa.
 *
 * Nada aqui é tático. Imagem não entra em `vtt_celula_bloqueada` e não
 * muda pathfinding, custo nem linha de visão — parede é objeto
 * (`vtt_objects`, 0085), e continua sendo. Colar a foto de uma parede
 * NÃO cria uma parede, e essa separação é o que evita um mapa onde o
 * que se vê e o que vale discordam.
 *
 * ── PONTEIRO ────────────────────────────────────────────────────────
 * A camada inteira é `pointer-events: none` enquanto a ferramenta
 * Imagens não está ativa. Um fundo cobre o mapa inteiro por definição:
 * se ele capturasse clique, ninguém selecionaria um token nunca mais.
 * Com a ferramenta ativa (e a camada destravada), só então cada imagem
 * vira alvo.
 *
 * Componente de APRESENTAÇÃO: recebe retângulos já calculados por
 * `_dominio/imagemCena.ts` e devolve gestos em pixels de mundo. Não
 * sabe de RPC, de revisão nem de assinatura de URL.
 */

import { type ImagemCena, retanguloDaImagem } from "../_dominio/imagemCena";

/** Canto arrastável para escalar. A ordem importa: é a mesma do `CANTOS`. */
export type CantoImagem = "tl" | "tr" | "bl" | "br";

const CANTOS: { id: CantoImagem; fx: number; fy: number; cursor: string }[] = [
  { id: "tl", fx: 0, fy: 0, cursor: "nwse-resize" },
  { id: "tr", fx: 1, fy: 0, cursor: "nesw-resize" },
  { id: "bl", fx: 0, fy: 1, cursor: "nesw-resize" },
  { id: "br", fx: 1, fy: 1, cursor: "nwse-resize" },
];

export interface PropsCamadaImagens {
  imagens: readonly ImagemCena[];
  /** Só as desta camada são desenhadas — o resto é problema da outra passada. */
  camada: "abaixo_grade" | "acima_grade";
  tamanhoCelula: number;
  /** URL assinada por `image_id`. Sem URL, a imagem não desenha (ver abaixo). */
  urls: Record<string, string>;
  /**
   * Visibilidade e bloqueio das camadas (0093), POR PAPEL.
   *
   * ── DOIS EIXOS QUE NÃO SÃO O MESMO ──────────────────────────────
   * `camada` (`abaixo_grade`/`acima_grade`) é ONDE a imagem entra na
   * pilha de pintura. `papel` (`fundo`/`tile`) é O QUE ela é, e é o
   * papel que decide qual camada do painel a controla — porque é o
   * papel que o servidor consulta ao decidir se assina a URL
   * (`vtt_asset_assinavel_para`: `imagemFundo` para fundo, `tiles`
   * para o resto).
   *
   * Um tapete sobre a grade e uma planta sob a grade são os dois
   * "tile"; uma planta pode estar acima da grade. Tratar os dois eixos
   * como um só faria o painel esconder a coisa errada.
   */
  visivelFundo: boolean;
  visivelTiles: boolean;
  ehNarrador: boolean;
  /** A ferramenta Imagens está ativa. O bloqueio por camada entra por papel. */
  ferramentaAtiva: boolean;
  bloqueadaFundo: boolean;
  bloqueadaTiles: boolean;
  selecionadaId: string | null;
  onSelecionar?: (id: string) => void;
  /** Pressão sobre o corpo da imagem — início do gesto de mover. */
  onPressionarCorpo?: (id: string, e: React.PointerEvent) => void;
  /** Pressão sobre um canto — início do gesto de escalar. */
  onPressionarCanto?: (id: string, canto: CantoImagem, e: React.PointerEvent) => void;
}

export function CamadaImagens({
  imagens, camada, tamanhoCelula, urls, visivelFundo, visivelTiles, ehNarrador,
  ferramentaAtiva, bloqueadaFundo, bloqueadaTiles,
  selecionadaId, onSelecionar, onPressionarCorpo, onPressionarCanto,
}: PropsCamadaImagens) {
  const desta = imagens.filter((i) => i.camada === camada);
  if (desta.length === 0) return null;

  const camadaVisivel = (papel: "fundo" | "tile") => (papel === "fundo" ? visivelFundo : visivelTiles);
  const camadaInterativa = (papel: "fundo" | "tile") =>
    ferramentaAtiva && !(papel === "fundo" ? bloqueadaFundo : bloqueadaTiles);

  return (
    <g
      className={`rv-camada-imagens rv-camada-imagens--${camada}`}
      pointerEvents={ferramentaAtiva ? undefined : "none"}
    >
      {desta.map((img) => {
        // Camada escondida some pra mesa e fica fantasma pro narrador —
        // o mesmo tratamento que conteúdo de cena já recebe em
        // `MapaHex` (token com `visivel: false`), e não o sumiço total
        // que camada de FERRAMENTA leva. Quem escondeu precisa
        // enxergar o que escondeu pra poder trabalhar.
        const daCamada = camadaVisivel(img.papel);
        // Colocação escondida individualmente: mesma regra, um nível
        // abaixo. As duas se somam — esconder a camada E a colocação
        // não fica mais escondido que esconder uma delas, mas também
        // não "desesconde".
        const oculta = !daCamada || !img.visivel;
        if (oculta && !ehNarrador) return null;

        const r = retanguloDaImagem(img, tamanhoCelula);
        const url = urls[img.imageId];
        const selecionada = img.id === selecionadaId;
        const interativa = camadaInterativa(img.papel);
        const opacidadeItem = img.opacidade * (oculta ? 0.3 : 1);
        const giro = img.rotacaoGraus
          ? `rotate(${img.rotacaoGraus} ${r.centroX} ${r.centroY})`
          : undefined;

        return (
          <g key={img.id} transform={giro} className="rv-imagem-cena" data-papel={img.papel}>
            {url ? (
              <image
                href={url}
                x={r.x} y={r.y} width={r.largura} height={r.altura}
                opacity={opacidadeItem}
                // A proporção só é forçada quando alguém DESTRAVOU a
                // distorção de propósito (`altura_m` explícita). No caso
                // normal a altura já vem da proporção do arquivo, então
                // `meet` e `none` desenham igual — e manter `meet` como
                // padrão garante que um bug de geometria apareça como
                // borda vazia, não como imagem esticada em silêncio.
                preserveAspectRatio={img.alturaM !== null ? "none" : "xMidYMid meet"}
                // A imagem é decoração: quem recebe o clique é o alvo
                // transparente abaixo, que existe mesmo sem URL.
                pointerEvents="none"
              />
            ) : (
              // Sem URL assinada (ainda carregando, ou expirada) fica o
              // contorno do lugar — não um ícone de imagem quebrada. A
              // assinatura é renovável; isto é um estado de espera.
              <rect
                x={r.x} y={r.y} width={r.largura} height={r.altura}
                className="rv-imagem-cena__ausente" pointerEvents="none"
              />
            )}

            {/* Contorno de "escondida dos jogadores" — tracejado, só o
                narrador chega a ver isto, e é o que diferencia "está
                oculta" de "está clara demais". */}
            {oculta && (
              <rect
                x={r.x} y={r.y} width={r.largura} height={r.altura}
                className="rv-imagem-cena__oculta" pointerEvents="none"
              />
            )}

            {interativa && (
              <rect
                x={r.x} y={r.y} width={r.largura} height={r.altura}
                className="rv-imagem-cena__alvo"
                data-travada={img.travado || undefined}
                onPointerDown={(e) => {
                  onSelecionar?.(img.id);
                  // Travada seleciona (pra poder destravar pelo painel)
                  // mas não move. Travar que ainda deixasse arrastar
                  // não seria travar.
                  if (!img.travado) onPressionarCorpo?.(img.id, e);
                }}
              />
            )}

            {selecionada && (
              <>
                <rect
                  x={r.x} y={r.y} width={r.largura} height={r.altura}
                  className="rv-imagem-cena__selecao" pointerEvents="none"
                />
                {/* Alças só na imagem DESTRAVADA: oferecer o que não
                    funciona é pior que não oferecer. */}
                {interativa && !img.travado && CANTOS.map((c) => (
                  <rect
                    key={c.id}
                    x={r.x + c.fx * r.largura - ALCA / 2}
                    y={r.y + c.fy * r.altura - ALCA / 2}
                    width={ALCA} height={ALCA}
                    className="rv-imagem-cena__alca"
                    style={{ cursor: c.cursor }}
                    onPointerDown={(e) => { e.stopPropagation(); onPressionarCanto?.(img.id, c.id, e); }}
                  />
                ))}
              </>
            )}
          </g>
        );
      })}
    </g>
  );
}

/** Lado da alça em pixels de MUNDO — o zoom a escala junto com o mapa. */
const ALCA = 9;
