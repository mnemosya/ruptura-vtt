"use client";

/**
 * Camadas de ÁREAS de efeito sobre o mapa.
 *
 * Duas camadas separadas de propósito, e a separação é a regra de
 * ponteiro que o pedido exige:
 *
 *  • `CamadaAreas` — o VISUAL: geometria contínua (preenchimento +
 *    contorno), hexes que cumprem a regra dos 50%, halo dos tokens
 *    afetados e rótulo. É desenhada ABAIXO de objetos, marcas e
 *    tokens (nada importante fica escondido) e tem
 *    `pointer-events: none` INTEIRA — nenhum pixel dela intercepta
 *    clique.
 *
 *  • `CapturaAreas` — a INTERAÇÃO: a superfície de captura do gesto de
 *    criar, os alvos de clique do contorno (selecionar) e as alças/
 *    vértices de edição. Fica no TOPO do SVG e só existe enquanto a
 *    ferramenta Áreas está ativa. Só ela recebe evento.
 *
 * A geometria desenhada aqui é a MESMA `RegiaoArea` que
 * `_dominio/areaEfeito.ts` usa pra calcular células e tokens afetados —
 * `caminhoDaRegiao` é derivada dela, não uma segunda construção. Círculo
 * e setor saem como ARCO SVG de verdade (`A`), nunca poligonizados;
 * parede sai como traçado com `stroke-width` igual à largura canônica e
 * junção em bisel, que é exatamente a união que o cálculo mede.
 */

import { type Hex, hexKey, hexParaPixel, hexPath } from "./hex";
import { type RegiaoArea, type TipoArea, caminhoDaRegiao } from "../_dominio/areaEfeito";
import { type PontoAxial, axialParaMundo, metrosParaMundo, mundoParaAxial } from "../_dominio/escalaMapa";

export type EstadoVisualArea = "persistida" | "previa" | "selecionada" | "editando" | "oculta" | "erro";

export interface AreaDesenhavel {
  /** `vtt_areas.id`, ou a chave sintética da prévia local. */
  id: string;
  tipo: TipoArea;
  regiao: RegiaoArea;
  /** Cor já resolvida em hexadecimal — a tradução do slug fica em quem chama. */
  cor: string;
  opacidade: number;
  rotulo: string | null;
  estado: EstadoVisualArea;
  celulasAfetadas: readonly Hex[];
  /** Pegada (células absolutas) de cada token que cumpre a regra dos 50% — nunca a lista de "tokens numa célula afetada". */
  pegadasAfetadas: readonly (readonly Hex[])[];
}

interface PropsCamadaAreas {
  areas: readonly AreaDesenhavel[];
  tamanhoCelula: number;
  /** Mostrar o realce dos hexes que cumprem a regra — desligável pra inspecionar só a forma. */
  mostrarCelulas: boolean;
  mostrarHalos: boolean;
  /** Guia do gesto em curso — `null` fora de um arraste. */
  guia?: GuiaGesto | null;
  /** Origem mecânica do token candidato ao snap, pra realçar ANTES do gesto começar. */
  candidatoSnap?: PontoAxial | null;
}

/** Traço de cada estado: nunca só cor — espessura e padrão de traço também distinguem. */
const TRACO: Record<EstadoVisualArea, { larguraTraco: number; tracejado?: string; fatorPreenchimento: number }> = {
  persistida: { larguraTraco: 2, fatorPreenchimento: 1 },
  previa: { larguraTraco: 2, tracejado: "7 5", fatorPreenchimento: 0.85 },
  selecionada: { larguraTraco: 3.2, fatorPreenchimento: 1 },
  editando: { larguraTraco: 3.2, tracejado: "5 4", fatorPreenchimento: 0.9 },
  oculta: { larguraTraco: 2, tracejado: "2 5", fatorPreenchimento: 0.5 },
  erro: { larguraTraco: 3, tracejado: "3 3", fatorPreenchimento: 0.6 },
};

/** Ponto de ancoragem do rótulo: topo da caixa da região, pra não cair em cima do miolo do desenho. */
function ancoraDoRotulo(regiao: RegiaoArea): { x: number; y: number } {
  switch (regiao.forma) {
    case "disco":
    case "setor":
      return { x: regiao.centro.x, y: regiao.centro.y - regiao.raio - 10 };
    case "poligono": {
      let minY = Infinity, somaX = 0;
      for (const p of regiao.contorno) { if (p.y < minY) minY = p.y; somaX += p.x; }
      return { x: somaX / regiao.contorno.length, y: minY - 10 };
    }
    case "corredor": {
      let minY = Infinity, somaX = 0;
      for (const p of regiao.pontos) { if (p.y < minY) minY = p.y; somaX += p.x; }
      return { x: somaX / regiao.pontos.length, y: minY - regiao.largura / 2 - 10 };
    }
    case "segmento":
      return { x: (regiao.a.x + regiao.b.x) / 2, y: Math.min(regiao.a.y, regiao.b.y) - 10 };
  }
}

function Forma({ area, contorno }: { area: AreaDesenhavel; contorno: boolean }) {
  const t = TRACO[area.estado];
  const d = caminhoDaRegiao(area.regiao);
  const corTraco = area.estado === "erro" ? "#ff5f74" : area.cor;

  if (area.regiao.forma === "corredor") {
    // Parede: a região É o traçado de largura fixa com junção em bisel.
    // Desenhar com `stroke-width` reproduz exatamente a mesma união que
    // `pecasDoTracado` mede — mesmos parâmetros, uma geometria só.
    return (
      <>
        {contorno && (
          <path d={d} fill="none" stroke={corTraco} strokeWidth={area.regiao.largura + t.larguraTraco * 2}
            strokeLinejoin="bevel" strokeLinecap="butt" opacity={0.9} strokeDasharray={t.tracejado} />
        )}
        {!contorno && (
          <path d={d} fill="none" stroke={area.cor} strokeWidth={area.regiao.largura}
            strokeLinejoin="bevel" strokeLinecap="butt" opacity={area.opacidade * t.fatorPreenchimento} />
        )}
      </>
    );
  }

  if (area.regiao.forma === "segmento") {
    // Linha em traço fino: sem área — só o traço, fino de verdade.
    return contorno ? (
      <path d={d} fill="none" stroke={corTraco} strokeWidth={t.larguraTraco} strokeDasharray={t.tracejado} opacity={0.95} />
    ) : null;
  }

  return contorno ? (
    <path d={d} fill="none" stroke={corTraco} strokeWidth={t.larguraTraco} strokeDasharray={t.tracejado} opacity={0.95} />
  ) : (
    <path d={d} fill={area.cor} fillOpacity={area.opacidade * t.fatorPreenchimento} stroke="none" />
  );
}

export function CamadaAreas({ areas, tamanhoCelula, mostrarCelulas, mostrarHalos, guia, candidatoSnap }: PropsCamadaAreas) {
  if (areas.length === 0 && !guia && !candidatoSnap) return null;
  const dCelula = hexPath(tamanhoCelula - 1.5);
  const dHalo = hexPath(tamanhoCelula - 3);

  return (
    // `pointerEvents="none"` na camada inteira: isto é desenho, não
    // superfície de interação. Quem intercepta clique é `CapturaAreas`.
    <g className="rv-camada-areas" pointerEvents="none">
      {areas.map((area) => (
        <g key={area.id} className={`rv-area rv-area--${area.estado}`} data-area-id={area.id} data-area-tipo={area.tipo}
          data-celulas-afetadas={area.celulasAfetadas.length} data-tokens-afetados={area.pegadasAfetadas.length}>
          <Forma area={area} contorno={false} />

          {/* Hexes que cumprem a regra dos 50% — destaque SECUNDÁRIO:
              deixa explícito como a regra foi resolvida, sem substituir
              a forma geométrica, que continua sendo a leitura principal. */}
          {mostrarCelulas && area.celulasAfetadas.map((c) => {
            const p = hexParaPixel(c, tamanhoCelula);
            return (
              <path key={`${area.id}-c-${hexKey(c)}`} className="rv-area-celula" d={dCelula}
                transform={`translate(${p.x} ${p.y})`} fill={area.cor} fillOpacity={0.1}
                stroke={area.cor} strokeOpacity={0.55} strokeWidth={1.2} strokeDasharray="3 2" />
            );
          })}

          <Forma area={area} contorno />

          {/* Halo dos TOKENS afetados — a pegada completa de quem
              cumpre a regra dos 50% do próprio corpo. Desenhado ABAIXO
              da camada de tokens (esta camada inteira está abaixo dela),
              então nunca cobre retrato, sigla, PV, condições, orientação
              nem alça de rotação. */}
          {mostrarHalos && area.pegadasAfetadas.map((pegada, i) => (
            <g key={`${area.id}-h-${i}`} className="rv-area-halo-token">
              {pegada.map((c) => {
                const p = hexParaPixel(c, tamanhoCelula);
                return (
                  <path key={hexKey(c)} d={dHalo} transform={`translate(${p.x} ${p.y})`}
                    fill={area.cor} fillOpacity={0.14} stroke={area.cor} strokeWidth={2.2} strokeOpacity={0.9} />
                );
              })}
            </g>
          ))}

          {(area.rotulo || area.estado === "oculta" || area.estado === "erro") && (() => {
            const ancora = ancoraDoRotulo(area.regiao);
            const texto = area.estado === "erro"
              ? `${area.rotulo ?? "Área"} — não salva`
              : area.estado === "oculta"
                ? `${area.rotulo ?? "Área"} · oculta`
                : area.rotulo!;
            const largura = Math.max(46, texto.length * 6.2 + 16);
            return (
              <g className="rv-area-rotulo" transform={`translate(${ancora.x} ${ancora.y})`}>
                <rect x={-largura / 2} y={-11} width={largura} height={19} rx={4} fill="#0b141c" opacity={0.92} />
                <text textAnchor="middle" y={2.5} fontSize="10" fontFamily="monospace"
                  fill={area.estado === "erro" ? "#ff96a8" : "#eafcff"}>{texto}</text>
              </g>
            );
          })()}
        </g>
      ))}

      {/* Realce do token CANDIDATO ao snap de origem — some assim que o
          gesto começa (aí quem marca a origem é a própria guia). */}
      {candidatoSnap && !guia && (() => {
        const p = axialParaMundo(candidatoSnap, tamanhoCelula);
        return (
          <g className="rv-area-snap-candidato" data-testid="area-snap-candidato" transform={`translate(${p.x} ${p.y})`}>
            <circle r={tamanhoCelula * 0.5} fill="none" stroke="#35c8f0" strokeWidth={2} strokeDasharray="4 3" opacity={0.85} />
            <circle r={3} fill="#35c8f0" />
          </g>
        );
      })()}

      {/* GUIA do gesto — linha fina origem→posição efetiva, com
          marcadores nas duas pontas e a medida ao lado. Contorno
          escuro por baixo em cada elemento: é o que a mantém legível
          tanto sobre terreno claro quanto escuro. */}
      {guia && (() => {
        const a = axialParaMundo(guia.origem, tamanhoCelula);
        const b = axialParaMundo(guia.destino, tamanhoCelula);
        const meio = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        let angulo = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
        if (angulo > 90 || angulo < -90) angulo += 180; // nunca de cabeça pra baixo
        const largura = Math.max(48, guia.texto.length * 6.4 + 16);
        return (
          <g className="rv-area-guia" data-testid="area-guia" data-texto={guia.texto}>
            <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#0b141c" strokeWidth={4.5} opacity={0.75} />
            <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#eafcff" strokeWidth={1.6} strokeDasharray="6 4" />
            {/* Origem: disco cheio. Se veio de um token capturado, ganha um anel extra. */}
            <circle cx={a.x} cy={a.y} r={4.5} fill="#eafcff" stroke="#0b141c" strokeWidth={1.5} data-testid="area-guia-origem" />
            {guia.tokenCapturado && (
              <circle cx={a.x} cy={a.y} r={tamanhoCelula * 0.45} fill="none" stroke="#35c8f0" strokeWidth={2} strokeDasharray="3 3" opacity={0.9} data-testid="area-guia-token" />
            )}
            {/* Posição atual: anel — distinto por FORMA, não só por cor. */}
            <circle cx={b.x} cy={b.y} r={6} fill="none" stroke="#eafcff" strokeWidth={2.2} data-testid="area-guia-destino" />
            <circle cx={b.x} cy={b.y} r={6} fill="none" stroke="#0b141c" strokeWidth={1} opacity={0.6} />
            <g transform={`translate(${meio.x} ${meio.y}) rotate(${angulo})`}>
              <g transform="translate(0 -16)">
                <rect x={-largura / 2} y={-10} width={largura} height={19} rx={4} fill="#0b141c" opacity={0.94} />
                <text textAnchor="middle" y={3.5} fontSize="10.5" fontFamily="monospace" fill="#eafcff" style={{ userSelect: "none" }}>
                  {guia.texto}
                </text>
              </g>
            </g>
          </g>
        );
      })()}
    </g>
  );
}

// ─────────────────────────────────────────────────────────────────
// Camada de interação
// ─────────────────────────────────────────────────────────────────

/**
 * GUIA VISUAL do gesto de criação — a linha fina que liga o ponto onde
 * o gesto COMEÇOU à posição atual usada pra calcular a área.
 *
 * É só uma guia: não altera a geometria, não entra na regra dos 50% e
 * não conta como parte da área. Some ao concluir ou cancelar.
 */
export interface GuiaGesto {
  /** Ponta fixa — onde o ponteiro desceu (já com o snap de origem aplicado, quando houve). */
  origem: PontoAxial;
  /** Ponta móvel — a posição EFETIVA (pós snap angular e arredondamento), que é o que a geometria usa. */
  destino: PontoAxial;
  /** Medida legível ao lado da linha ("6 m", "6 × 2 m", "alcance 6 m · 45°"). */
  texto: string;
  /** Token capturado pelo snap de origem — desenha um realce na origem mecânica dele. */
  tokenCapturado: boolean;
}

export interface AlcaArea {
  id: string;
  /** Posição em axial fracionário — convertida aqui, uma vez, pra unidades do mundo. */
  pos: PontoAxial;
  papel: "origem" | "raio" | "destino" | "largura" | "vertice";
  rotulo: string;
}

interface PropsCapturaAreas {
  ativa: boolean;
  limites: { minX: number; minY: number; largura: number; altura: number };
  tamanhoCelula: number;
  /** Contornos clicáveis pra SELECIONAR uma área já persistida — só quando a ferramenta está ociosa. */
  contornosSelecionaveis: readonly { id: string; regiao: RegiaoArea; larguraTraco: number }[];
  alcas: readonly AlcaArea[];
  onPointerDownMapa: (e: React.PointerEvent) => void;
  onPointerMoveMapa: (e: React.PointerEvent) => void;
  onPointerUpMapa: (e: React.PointerEvent) => void;
  onPointerCancelMapa: (e: React.PointerEvent) => void;
  onSelecionarArea: (id: string) => void;
  /** Registra que o gesto começou sobre o contorno desta área — quem decide entre selecionar e criar é o fim do gesto. */
  onCandidatoSelecao: (id: string) => void;
  onAlcaPointerDown: (id: string, e: React.PointerEvent) => void;
  onAlcaPointerMove: (e: React.PointerEvent) => void;
  onAlcaPointerUp: (e: React.PointerEvent) => void;
  onAlcaPointerCancel: (e: React.PointerEvent) => void;
  /**
   * ALTERNATIVA MÍNIMA DE TECLADO — as alças eram, até esta rodada de
   * auditoria, o ÚNICO meio de mover origem/raio/destino/largura/
   * vértice de uma área em edição; ponteiro era obrigatório. Setas
   * mudam o ponto por um passo fixo em metros (Shift = passo maior);
   * chama o MESMO caminho de atualização que o arraste de ponteiro
   * usa (`onAlcaMover` do dono do estado, em `VttClient.tsx`) — nunca
   * uma segunda lógica de edição em paralelo. Opcional: sem esta prop,
   * a alça continua funcionando por ponteiro, só sem o atalho de
   * teclado (retrocompatível com quem monta `CapturaAreas` sem ela).
   */
  onAlcaMoverPara?: (id: string, ponto: PontoAxial) => void;
}

const PASSO_ALCA_TECLADO_M = 0.5;
const PASSO_ALCA_TECLADO_GRANDE_M = 2;

export function CapturaAreas({
  ativa, limites, tamanhoCelula, contornosSelecionaveis, alcas,
  onPointerDownMapa, onPointerMoveMapa, onPointerUpMapa, onPointerCancelMapa,
  onSelecionarArea, onCandidatoSelecao, onAlcaPointerDown, onAlcaPointerMove, onAlcaPointerUp, onAlcaPointerCancel,
  onAlcaMoverPara,
}: PropsCapturaAreas) {
  /** Seta → nudge em metros na direção de TELA correspondente, aplicado à posição ATUAL da própria alça (nunca recalculado do zero — cada tecla parte de onde a última deixou). */
  const alcaTeclado = (a: AlcaArea, e: React.KeyboardEvent) => {
    if (!onAlcaMoverPara) return;
    let dx = 0, dy = 0;
    switch (e.key) {
      case "ArrowRight": dx = 1; break;
      case "ArrowLeft": dx = -1; break;
      case "ArrowDown": dy = 1; break;
      case "ArrowUp": dy = -1; break;
      default: return;
    }
    e.preventDefault();
    const passoM = e.shiftKey ? PASSO_ALCA_TECLADO_GRANDE_M : PASSO_ALCA_TECLADO_M;
    const passoMundo = metrosParaMundo(passoM, tamanhoCelula);
    const atual = axialParaMundo(a.pos, tamanhoCelula);
    const novo = mundoParaAxial(atual.x + dx * passoMundo, atual.y + dy * passoMundo, tamanhoCelula);
    onAlcaMoverPara(a.id, novo);
  };
  // As ALÇAS são independentes de `ativa`: editar uma área persistida
  // (atalho rápido no mapa) precisa funcionar mesmo com a ferramenta
  // Áreas NÃO ativa (ex.: chamado a partir de Interagir) — só a
  // superfície de CRIAR (o retângulo do mundo inteiro + os contornos
  // clicáveis pra selecionar) exige `ativa`. Sem isto, editar por fora
  // da ferramenta Áreas forçaria trocar de ferramenta só pra desenhar
  // as alças, e trocar de ferramenta é o que abre a janela lateral —
  // exatamente o que o atalho rápido promete NÃO fazer.
  if (!ativa && alcas.length === 0) return null;

  return (
    <g className="rv-camada-areas-captura">
      {ativa && (
        <>
          {/* Superfície de captura do gesto de CRIAR. Cobre o mundo
              inteiro e fica acima de token/objeto/marca — é isto que
              garante "a ferramenta pode começar sobre token, objeto,
              terreno ou marca" sem que nenhum deles reaja ao gesto.
              Pan (botão direito, ouvido no `<svg>`/`window`) e zoom
              (`wheel`, nativo) continuam funcionando: nenhum dos dois
              depende de qual elemento estava sob o cursor. */}
          <rect
            className="rv-area-captura"
            x={limites.minX} y={limites.minY} width={limites.largura} height={limites.altura}
            fill="transparent" style={{ cursor: "crosshair" }}
            onPointerDown={onPointerDownMapa}
            onPointerMove={onPointerMoveMapa}
            onPointerUp={onPointerUpMapa}
            onPointerCancel={onPointerCancelMapa}
          />

          {/* Selecionar: só o CONTORNO é alvo (`pointer-events: stroke`),
              nunca o miolo — assim uma área já existente não impede
              começar outra por cima dela.

              E o contorno NÃO rouba um arraste: o `pointerdown` aqui
              inicia o MESMO gesto de criação da superfície de captura e
              apenas REGISTRA que este gesto começou sobre a área
              `c.id`. Quem decide é o fim do gesto — clique sem
              deslocamento seleciona a área, arraste de verdade cria uma
              nova. Sem isto, com várias áreas na cena os contornos
              invisíveis viravam uma teia que engolia qualquer tentativa
              de desenhar por cima delas (achado real, pego pela
              suíte). */}
          {contornosSelecionaveis.map((c) => (
            <path
              key={c.id}
              className="rv-area-contorno-alvo"
              data-area-alvo={c.id}
              d={caminhoDaRegiao(c.regiao)}
              fill="none"
              stroke="transparent"
              strokeWidth={c.larguraTraco}
              strokeLinejoin="bevel"
              style={{ pointerEvents: "stroke", cursor: "pointer" }}
              onPointerDown={(e) => { if (e.button === 0) { onCandidatoSelecao(c.id); onPointerDownMapa(e); } }}
              onPointerMove={onPointerMoveMapa}
              onPointerUp={onPointerUpMapa}
              onPointerCancel={onPointerCancelMapa}
            />
          ))}
        </>
      )}

      {/* Alças e vértices — as ÚNICAS superfícies realmente editáveis. */}
      {alcas.map((a) => {
        const p = axialParaMundo(a.pos, tamanhoCelula);
        return (
          <g key={a.id} className={`rv-area-alca rv-area-alca--${a.papel}`} data-alca={a.id} transform={`translate(${p.x} ${p.y})`}>
            {a.papel === "vertice"
              ? <rect x={-4.5} y={-4.5} width={9} height={9} fill="#35c8f0" stroke="#0b141c" strokeWidth={1.2} pointerEvents="none" />
              : <circle r={5} fill={a.papel === "origem" ? "#eafcff" : "#35c8f0"} stroke="#0b141c" strokeWidth={1.2} pointerEvents="none" />}
            {/* Alvo de toque maior que o marcador visível — mouse, caneta e touch usam o MESMO elemento. */}
            <circle
              r={13} fill="transparent" role="slider" tabIndex={0}
              aria-label={a.rotulo} aria-valuetext={a.rotulo}
              style={{ cursor: "grab" }}
              onPointerDown={(e) => { if (e.button === 0) { e.stopPropagation(); onAlcaPointerDown(a.id, e); } }}
              onPointerMove={onAlcaPointerMove}
              onPointerUp={onAlcaPointerUp}
              onPointerCancel={onAlcaPointerCancel}
              onLostPointerCapture={onAlcaPointerCancel}
              onKeyDown={(e) => alcaTeclado(a, e)}
            />
          </g>
        );
      })}
    </g>
  );
}
