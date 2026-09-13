"use client";

/**
 * Superfície do mapa — grade hexagonal, terreno, coberturas e tokens.
 *
 * Tudo é SVG, não canvas nem imagem raster. Três razões concretas:
 * (1) o pedido pede que ícones e elementos que precisam permanecer
 * precisos sejam SVG; (2) a grade de Ruptura é geométrica por
 * definição (1 hex = 1 m) e precisa continuar exata em qualquer zoom;
 * (3) não há gerador de imagem disponível nesta sessão, então textura e
 * profundidade são construídas com gradiente, ruído e padrão SVG —
 * declarado aqui em vez de disfarçado como arte gerada.
 *
 * O zoom/pan vive num `<g transform>` só, e a grade é desenhada por
 * célula (não por padrão repetido) porque cada célula precisa ser
 * alvo de hover/clique e portadora de estado (terreno, área, alcance).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Crosshair, FileText, Navigation, TriangleAlert } from "lucide-react";
import {
  type Hex,
  TAMANHOS,
  ancoraFrontalDaPegada,
  contornoDaPegada,
  hexIguais,
  hexKey,
  hexLinha,
  hexNoRaio,
  hexParaPixel,
  hexPath,
  hexRotacionar,
  hexVertices,
  pixelParaHex, pixelParaHexExato } from "./hex";
import {
  type ObjetoCena,
  CATEGORIA_COBERTURA,
  CONDICOES,
  GRAU_COBERTURA,
} from "../_dados/cenaDemo";
import { type TokenApresentacao } from "../_dominio/tokenApresentacao";
import { ehCamadaDeFerramenta } from "../_shell/PainelCamadas";

/**
 * Cena pronta pra este componente desenhar — `tokens`, `nome`,
 * `largura` e `altura` vêm SEMPRE do banco (`estadoCena.cena`,
 * `VttClient.tsx`; `tokens` derivado via `tokenApresentacaoDe`;
 * `objetos` vem de `estadoCena.objetos` persistido).
 *
 * NÃO existe mais terreno "decorativo" aqui. Ele nunca chegou a ser
 * persistido (`vtt_scenes` não modelava) e os dois casos que ele cobria
 * já são Objetos: "destroços que encarecem o passo" é um objeto com
 * `terreno_projetado: 'dificil'` e `bloqueia_movimento: false` (o
 * preset `entulho`), e "zona morta" é um objeto sem cobertura, só com
 * nome e efeito no hover. Elevação, o terceiro caso, não é tipo de
 * terreno: mexe em alcance e linha de visão, e merece desenho próprio.
 *
 * O que restou é o terreno FUNCIONAL (`vtt_terrain`, ferramenta
 * Terreno) — difícil e bloqueado, real e persistido.
 */
export interface CenaMapa {
  nome: string;
  largura: number;
  altura: number;
  tokens: TokenApresentacao[];
  objetos: ObjetoCena[];
}
import { type MapaTerreno, type Rota, medir, pegadaBloqueada } from "../_dominio/movimento";
import { type MovimentoVisualToken } from "../_dominio/animacaoToken";
import {
  type EstadoArrasto,
  adicionarWaypoint, arrastoDoAcompanhante, iniciarArrastoToken, moverDestino, posicaoVisual, removerUltimoWaypoint, rotaDoEstadoArrasto, rotaExibida, semMovimento,
} from "../_dominio/arrastoToken";
import {
  type Pegada,
  origemMecanica, pegadaEfetiva, pegadasSobrepoem, projetarPegada,
} from "../_dominio/pegada";
import { elementoEhEditavel } from "../_ferramentas/controlador";

/** Glifo de cada tipo de sinal — a MESMA tabela de ícones que
    `PainelMarcar` usa nos botões, para que mapa e janela nunca mostrem
    desenhos diferentes pro mesmo sinal. */
const GLIFO_DO_SINAL: Record<string, typeof Crosshair> = {
  alvo: Crosshair,
  perigo: TriangleAlert,
  rota: Navigation,
  nota: FileText,
};
/** Lado do glifo em unidades do mapa (o hex tem raio `TAM`). */
const TAM_GLIFO_SINAL = 19;
import {
  type EstadoMedicao,
  type ModoMedicao,
  comecarAMedir,
  concluir as concluirMedicao,
  cruzouLimiar,
  fixarDobra,
  moverPonta,
  pontosDaMedicao,
  removerUltimaDobra,
  soltarBotao,
  totalDobras,
} from "../_dominio/medicaoRegua";
import { type AlcaArea, type AreaDesenhavel, type GuiaGesto, CamadaAreas, CapturaAreas } from "./CamadaAreas";
import { type RegiaoArea, pontoDentroDaRegiao } from "../_dominio/areaEfeito";
import { type PontoAxial, mundoParaAxial } from "../_dominio/escalaMapa";
import { type CantoImagem, CamadaImagens } from "./CamadaImagens";
import { type ImagemCena, alturaEfetivaM, pxPorMetro, retanguloDaImagem } from "../_dominio/imagemCena";
import { useAnimacaoToken } from "./useAnimacaoToken";

export const TAM = 26; // raio do hexágono em px do mundo

/**
 * `deltaY` bruto de um `WheelEvent` pra uma escala aproximada de
 * pixels, resolvendo `deltaMode` (que muda a UNIDADE do valor, não só
 * a magnitude): a maioria dos navegadores/mouses manda `deltaMode = 0`
 * (pixels) com valores grandes por notch (~100-120); alguns
 * navegadores em alguns SOs mandam `deltaMode = 1` (linhas) com
 * valores pequenos (~3) que, sem essa conversão, pareceriam quase
 * imóveis comparados a um trackpad — ou o oposto, dependendo de qual
 * lado fica sem normalização.
 */
function normalizarDeltaWheel(e: WheelEvent): number {
  const PX_POR_LINHA = 16;
  const PX_POR_PAGINA = 800;
  if (e.deltaMode === 1) return e.deltaY * PX_POR_LINHA;
  if (e.deltaMode === 2) return e.deltaY * PX_POR_PAGINA;
  return e.deltaY;
}

export interface EstadoVisualToken {
  selecionado: boolean;
  sobCursor: boolean;
  turnoAtual: boolean;
  podeAgir: boolean;
  jaAgiu: boolean;
  fragmentado: boolean;
  alvo: boolean;
  /**
   * Este token é a ORIGEM escolhida de uma Aura em criação/edição
   * agora (ferramenta Áreas) — nunca confundir com seleção normal
   * (`selecionado`, que é sobre MOVER/editar o próprio token) nem com
   * o halo frontal (que indica orientação). Ver `.rv-token-origem-aura`.
   */
  origemDeAura: boolean;
}

const COR_VERTENTE: Record<TokenApresentacao["vertente"], string> = {
  somatico: "#2f9e56",
  cognitivo: "#8b5cf6",
  energetico: "#00d4ff",
  material: "#f5a200",
  nenhuma: "#6b7f8c",
};

/** Aparência de cada tipo de objeto — cor de topo e de lateral (dá volume). */
const APARENCIA_OBJETO: Record<string, { topo: string; lado: string; traco: string }> = {
  conteiner: { topo: "#1d3a4a", lado: "#122530", traco: "#2f6b84" },
  veiculo: { topo: "#31252e", lado: "#1d151c", traco: "#6b4a5c" },
  entulho: { topo: "#2a2721", lado: "#1a1815", traco: "#5a5142" },
  muro: { topo: "#24262b", lado: "#161719", traco: "#4a4d55" },
  barril: { topo: "#2b3320", lado: "#1a2014", traco: "#5d6f42" },
  grade: { topo: "#22303a", lado: "#151f26", traco: "#4d7a8c" },
  banca: { topo: "#332a1f", lado: "#201a13", traco: "#6b573c" },
};

/** Ordem de força de grau de cobertura — usada pela sugestão da régua de medir. */
const ORDEM_GRAU: Record<string, number> = { parcial: 1, maior: 2, total: 3 };

/**
 * Hint unificada de mapa — um único formato para qualquer elemento
 * (terreno funcional, terreno decorativo, objeto/cobertura) em vez de
 * um estado e um bloco de JSX por tipo. `x`/`y` são coordenadas de
 * TELA (`clientX/clientY`), consumidas pelo tooltip HTML fixo fora do
 * `<svg>` — ver o retorno do componente.
 */
export interface HintMapa {
  titulo: string;
  classificacao?: string;
  detalhes?: string[];
  efeito?: string;
  x: number;
  y: number;
}

/** Distância mínima em pixels de tela pra distinguir "clique" de "arraste começando". */
const LIMIAR_ARRASTO_PX = 6;
/**
 * Quanto tempo segurando parado até o ping acender — mesma janela que
 * Foundry/Roll20 usam (nem tão curto que dispara num clique comum, nem
 * tão longo que pareça travado).
 */
const DURACAO_SEGURAR_PING_MS = 400;

/** Faixa extra (unidades do mundo) pro hover do botão de edição rápida em formas sem preenchimento (Linha em traço fino). */
const TOLERANCIA_HOVER_MUNDO = 8;

// Máquina de estados da ferramenta Medir: um único valor (não vários
// `useState` paralelos), o que elimina a chance de divergirem e
// permite um só listener de teclado pra qualquer fase não-ociosa. Ela
// mora em `_dominio/medicaoRegua.ts` (lógica pura, testada em
// `scripts/test-vtt-medicao-regua.ts`) — aqui só se conectam os
// eventos de ponteiro/teclado às transições de lá.

function hintParaObjeto(o: ObjetoCena): Omit<HintMapa, "x" | "y"> {
  const grau = GRAU_COBERTURA[o.grau];
  const categoria = CATEGORIA_COBERTURA[o.categoria];
  // Sem PD atribuído não se inventa "0/0": a linha simplesmente não
  // aparece — o narrador pode não ter definido durabilidade pra este.
  const temPd = o.pd !== null && o.pdMax !== null;
  const danificado = temPd && o.pd! < o.pdMax!;
  return {
    titulo: o.nome,
    classificacao: `${grau.rotulo} · Categoria ${categoria.rotulo}`,
    detalhes: temPd ? [`PD ${o.pd}/${o.pdMax}${danificado ? " · Danificado" : ""}`] : [],
    efeito: grau.efeito,
  };
}

/** Posição do tooltip evitando corte nas bordas direita/inferior — inverte pro outro lado do cursor em vez de só grudar na borda. */
function posicaoTooltip(clientX: number, clientY: number): { left: number; top: number } {
  const LARGURA = 230, ALTURA = 100, DESLOC = 14, MARGEM = 8;
  let left = clientX + DESLOC;
  let top = clientY + DESLOC;
  if (left + LARGURA > window.innerWidth - MARGEM) left = clientX - LARGURA - DESLOC;
  if (top + ALTURA > window.innerHeight - MARGEM) top = clientY - ALTURA - DESLOC;
  return { left: Math.max(MARGEM, left), top: Math.max(MARGEM, top) };
}

export interface PropsMapaHex {
  cena: CenaMapa;
  zoom: number;
  pan: { x: number; y: number };
  selecionadoId: string | null;
  hoverId: string | null;
  alvoIds: string[];
  estadoPorToken: (t: TokenApresentacao) => EstadoVisualToken;
  celulasRealce: Hex[];
  tipoRealce: "alcance" | "area" | "movimento" | "objeto" | null;
  onSelecionarToken: (id: string, aditivo: boolean) => void;
  /**
   * Hover de token. A ÂNCORA (retângulo do token na tela, do
   * `getBoundingClientRect` do próprio `<g>`) vem junto porque quem
   * desenha o cartão de hover (`VttClient`) precisa ancorá-lo no token
   * — e medir o elemento é exato, enquanto refazer a conta de
   * mundo→tela aqui fora seria uma segunda implementação do zoom/pan.
   */
  onHoverToken: (id: string | null, ancora?: { x: number; y: number; width: number; height: number }) => void;
  onClicarCelula?: (h: Hex) => void;

  /**
   * Quem está selecionado AGORA (`selecionadosIds`, `VttClient.tsx`).
   * Duas coisas dependem disto e nada mais: a alça de rotação (só
   * aparece com seleção ÚNICA) e o ARRASTO EM GRUPO — arrastar um
   * token selecionado leva junto todos os outros selecionados.
   * `estadoPorToken(t).selecionado` já diz SE um token específico está
   * selecionado; só a lista (plural) sabe quem são os outros, e só
   * quem chama tem isso pronto — nunca recalculado aqui varrendo
   * `cena.tokens`.
   */
  idsSelecionados?: readonly string[];
  /**
   * Alça de rotação (arrastar no mapa) solta numa orientação
   * ABSOLUTA já validada localmente (borda/bloqueio/colisão, próprio
   * token excluído) — quem chama só precisa disparar a MESMA RPC
   * canônica que o clique de 60° já usa, nunca revalidar de novo.
   */
  onRotacaoAlcaSolta?: (tokenId: string, novaOrientacao: number) => void;
  /**
   * Rotação por PASSO (±60°). Existe separada da absoluta porque o
   * teclado não pode calcular o destino: `t.orientacao` é a orientação
   * já RENDERIZADA, e duas teclas seguidas chegam antes do servidor
   * confirmar a primeira — as duas calculariam o mesmo destino a partir
   * da mesma base velha, e o token giraria um passo pra dois pedidos.
   * Quem sabe qual é a orientação pendente é o `VttClient`; aqui só se
   * declara a direção.
   */
  onRotacaoAlcaPasso?: (tokenId: string, direcao: 1 | -1) => void;

  /**
   * Terreno REAL (persistido) — dificil/bloqueado por célula. Distinto
   * de `cena.terrenos` (decorativo, tipo dificil/elevado/zona_morta —
   * hoje sempre vazio): esta camada é a que as ferramentas de
   * movimento/medição de fato respeitam, então é ela que precisa ser
   * visível e clicável, nunca só decorativa.
   */
  terrenoReal?: MapaTerreno;
  /** Ferramenta ativa — controla se o mapa aceita arrastar token / pintar célula. */
  // Espelha `FerramentaId` (`_ferramentas/controlador.ts`) — repetido
  // como literal para o mapa não depender do módulo de ferramentas.
  ferramenta?: "interagir" | "dados" | "medir" | "marcar" | "terreno" | "objetos" | "imagens" | "areas" | "rodadas";

  /**
   * ÁREAS DE EFEITO — desenho (camada visual, `pointer-events: none`) e
   * interação (camada de captura no topo). Este componente não sabe
   * NADA de regra de área: recebe regiões já resolvidas pelo domínio
   * (`_dominio/areaEfeito.ts`) e devolve coordenadas AXIAIS
   * FRACIONÁRIAS — a conversão tela→mundo→axial acontece aqui, uma vez,
   * com a mesma `pontoMundo` que todo o resto do mapa usa, pra ninguém
   * mais precisar saber de zoom/pan/CTM.
   */
  areas?: readonly AreaDesenhavel[];
  areasMostrarCelulas?: boolean;
  areasMostrarHalos?: boolean;
  /** Guia do gesto de criação em curso — desenhada na camada visual, `pointer-events: none`. */
  areasGuia?: GuiaGesto | null;
  /** Origem mecânica do token candidato ao snap — realce antes do gesto começar. */
  areasCandidatoSnap?: PontoAxial | null;
  /**
   * A ferramenta está esperando o usuário ESCOLHER UM TOKEN (origem da
   * Aura). Só liga um realce discreto na camada de tokens — o clique
   * em si já é interceptado pela camada de captura, que fica por cima
   * de tudo, então nenhum token chega a receber o evento.
   */
  areasEscolhendoToken?: boolean;
  /**
   * Âncora (em coordenadas do MUNDO) dos botões contextuais de
   * confirmar/descartar. Este componente converte pra coordenadas de
   * TELA e devolve por `onAncoraAcoes` — é o único lugar que conhece o
   * CTM/zoom/pan, então a conversão mora aqui, uma vez.
   */
  areasAncoraAcoes?: { x: number; y: number } | null;
  onAncoraAcoesTela?: (p: { x: number; y: number } | null) => void;
  /**
   * Conversor MUNDO → TELA para os botões de edição rápida — exposto
   * como FUNÇÃO (não uma âncora única) porque agora pode existir mais
   * de um botão simultâneo (área selecionada + área em hover, cada uma
   * com o seu). Quem chama decide QUANTAS âncoras converter; este
   * componente só sabe reconstruir a função sempre que zoom/pan/CTM
   * mudam — é o único lugar que conhece esse estado.
   */
  onConversorEdicaoRapidaTela?: (conversor: ((mundo: { x: number; y: number }) => { x: number; y: number }) | null) => void;
  /**
   * Conversor TELA → HEX exposto pra quem precisa reagir a um evento
   * cujo alvo NÃO é este SVG — hoje só o arrasto HTML5 vindo do painel
   * lateral (`dragover`/`drop` acontecem no contêiner do mapa, não
   * dentro do `<svg>`). Mesma ideia (e mesma regra de recálculo) do
   * conversor de edição rápida acima; a diferença é a direção.
   *
   * Existe justamente pra NÃO duplicar a matemática de câmera:
   * `pontoMundo` + `pixelParaHex` continuam sendo o único caminho de
   * tela pra hex em toda a Mesa.
   */
  onConversorHexDaTela?: (conversor: ((clientX: number, clientY: number) => Hex | null) | null) => void;
  /**
   * Áreas candidatas ao HOVER do botão de edição rápida — geometria
   * (`regiao`) de cada uma, independente da ferramenta ativa. Ativo
   * (o pointermove abaixo só reage) com "areas" ou "interagir"; outras
   * ferramentas nunca calculam nem reportam hover nenhum.
   */
  areasParaHover?: readonly { id: string; regiao: RegiaoArea }[];
  onHoverAreaEditavel?: (id: string | null) => void;
  /**
   * Alças de EDIÇÃO de uma área persistida — independentes da
   * ferramenta ativa e de `areasInteracao`, de propósito: editar pelo
   * atalho rápido do mapa precisa funcionar a partir de QUALQUER
   * ferramenta (ex.: Interagir), sem exigir trocar pra "Áreas" — e
   * trocar de ferramenta é o que abre a janela lateral, exatamente o
   * que o atalho promete não fazer. Vazio/`undefined` fora de
   * `estadoAreas.fase === "editando"`, então nunca aparece nada à toa.
   */
  areasAlcas?: readonly AlcaArea[];
  onAreaAlcaMover?: (id: string, ponto: PontoAxial, precisaoLivre?: boolean) => void;
  onAreaAlcaSoltar?: () => void;
  onAreaAlcaCancelar?: () => void;
  areasInteracao?: {
    ativa: boolean;
    contornosSelecionaveis: readonly { id: string; regiao: RegiaoArea; larguraTraco: number }[];
    onPressionar: (ponto: PontoAxial, px: { x: number; y: number }, ev: { altKey: boolean; metaKey: boolean; pointerId: number }) => void;
    onMover: (ponto: PontoAxial, px: { x: number; y: number }, ev: { altKey: boolean; metaKey: boolean }) => void;
    onSoltar: (ponto: PontoAxial) => void;
    onCancelarGesto: () => void;
    onSelecionar: (id: string) => void;
    onCandidatoSelecao: (id: string) => void;
  } | null;
  /** Quem pode mover CADA token — decide se o arraste começa (a autorização de servidor é quem decide de verdade). */
  podeMoverToken?: (tokenId: string) => boolean;
  /** Arraste concluído: rota inteira (origem incluída), pra revalidação e persistência por quem chama. */
  /**
   * `offset` (opcional) é o deslocamento SUB-CÉLULA de onde o token
   * pousou dentro da célula final — só vem com a grade escondida, e é
   * só desenho. Ausente = encaixa no centro do hex, como sempre foi.
   */
  onSoltarToken?: (tokenId: string, rota: Rota, offset?: { q: number; r: number }) => void;
  /**
   * Arraste concluído com MAIS DE UM token selecionado — uma rota por
   * token, todas com a mesma forma (ver `arrastoDoAcompanhante`), pra
   * quem chama persistir o conjunto como UMA operação (um só item de
   * desfazer). Sem esta prop o arrasto em grupo não acontece: o gesto
   * continua movendo só o token sob o cursor.
   */
  onSoltarTokens?: (movimentos: { tokenId: string; rota: Rota }[]) => void;
  /** Pintura de terreno: pressão inicial numa célula. */
  onPressCelula?: (h: Hex) => void;
  /** Pintura de terreno: entrada numa célula com o botão ainda pressionado (arrastar pintando). */
  onEntrarCelulaPintando?: (h: Hex) => void;
  /** Seleção por caixa (arrastar sobre o piso, fora de qualquer token) — ids dos tokens cujo centro cai dentro do retângulo. */
  onSelecionarCaixa?: (ids: string[], aditivo: boolean) => void;
  /**
   * Raio do pincel de Terreno (0/1/2/… = 1/7/19/… células) pra PRÉ-
   * VISUALIZAR no hover exatamente quais células o próximo clique
   * pinta. `null` = sem prévia (balde, ou ferramenta que não pinta).
   * Sem isto o narrador só descobria a área do pincel DEPOIS de
   * pintar — e desfazer pra corrigir era o único jeito de olhar.
   */
  previaPincelRaio?: number | null;
  /**
   * Espelha a régua corrente pro painel de Medir (total acumulado,
   * distância de cada trecho, dobras fixadas). `null` quando não há
   * régua na tela. O painel é só leitura — a máquina de estados
   * continua morando aqui, nunca duplicada lá.
   */
  onMedicaoMudou?: (r: { trechos: number[]; metros: number; custo: number; atravessaBloqueio: boolean; dobras: number; pontos: Hex[] } | null) => void;
  /**
   * Modo corrente da ferramenta Medir. Em "instantanea", ao CONCLUIR
   * (soltar sem dobra, ou `Enter` com dobra) a régua some da tela na
   * hora — nunca persiste, então não há nada mais a mostrar. Em
   * "permanente" ela continua visível até `onMedicaoConcluida`
   * confirmar a gravação (a troca pela camada de réguas persistidas é
   * responsabilidade de quem chama): sumir na mesma hora deixaria um
   * intervalo sem nada na tela até o servidor responder.
   */
  modoMedicao?: ModoMedicao;
  /**
   * Chamado quando uma medição é CONCLUÍDA (Enter, ou soltar sem
   * dobras) — é o gancho que o modo "Permanente" usa pra persistir.
   * Recebe os pontos em axial; distância nunca é enviada (o servidor
   * guarda só a geometria, ver migration 0087).
   */
  onMedicaoConcluida?: (pontos: Hex[]) => void;
  /**
   * Réguas PERSISTIDAS da cena — visíveis pra todos os participantes.
   * `podeApagar` reflete a policy `vtt_measurements_delete` (autor ou
   * narrador): quem não pode não recebe alvo de clique nenhum, em vez
   * de receber uma ação que sempre falharia no servidor.
   */
  medicoesPermanentes?: { id: string; pontos: Hex[]; autorId: string; podeApagar: boolean; privada?: boolean }[];
  /**
   * Réguas AO VIVO de outros participantes (migration 0128) — puro
   * desenho: não são clicáveis, não persistem, e somem quando quem as
   * publicou termina o gesto. Quem assina o canal e decide o que ainda
   * está vivo é `VttClient`; aqui só se desenha o que chegar.
   */
  reguasAoVivo?: { autorId: string; autorNome: string; pontos: Hex[] }[];
  /** Clique numa régua permanente que o usuário pode apagar. */
  onApagarMedicao?: (id: string) => void;
  /** Ferramenta "Objetos" ativa + clique num objeto já persistido — seleciona pra excluir (não pra criar). */
  onSelecionarObjeto?: (id: string) => void;
  /**
   * Objeto sendo REPOSICIONADO agora (rascunho local, ainda não confirmado)
   * — fica "fantasma" (sem captura de ponteiro, opacidade reduzida) pra o
   * clique no mesmo lugar acertar a CÉLULA embaixo (alternar do rascunho),
   * não reabrir a seleção do próprio objeto por cima dele.
   */
  objetoEmMovimentoId?: string | null;

  /**
   * Marcações PERSISTIDAS (ferramenta "Marcar") — camada mínima desta
   * fase: um ponto colorido por marcação, sem linha/seta/desenho/texto
   * (o schema já suporta os outros tipos pra um projeto futuro). Não
   * confundir com "Ping" (`pingsExibidos`, abaixo) — marcação fica no
   * mapa até alguém apagar; ping desaparece sozinho em ~2s e nunca vai
   * pro banco. `podeApagar` decide se o clique nesta marcação
   * específica dispara `onClicarMarca` (autor ou narrador).
   */
  marcas?: { id: string; q: number; r: number; cor: string; podeApagar: boolean; sinal: string; texto: string | null }[];
  onClicarMarca?: (id: string) => void;

  /**
   * Ping efêmero ATIVO no momento — no máximo um por autor (um ping
   * novo do mesmo autor substitui o anterior, decisão de quem chama).
   * `proprio` diferencia visualmente o próprio ping do de outro
   * participante, sem precisar mostrar nome (`_realtime/vttRealtime.ts`
   * documenta por que `autorId` aqui é confiável — vem do servidor).
   */
  pingsExibidos?: { id: string; q: number; r: number; cor: string; proprio: boolean }[];
  /** Ferramenta "Ping" ativa + clique numa célula (ou em cima de token/objeto/marca, que usam o hex correspondente) — dispara o envio. */
  onPingCelula?: (h: Hex) => void;

  /** Deslocamento do mapa por arrasto do botão direito — recebe o delta já convertido pra unidades do mundo. */
  onPan?: (dx: number, dy: number) => void;

  /**
   * Botão direito CLICADO (sem arrastar) — abre menu contextual.
   * `tokenId` vem de `data-token-id` do elemento sob o cursor (`null`
   * = célula vazia). Nunca compete com pan: só dispara quando o
   * movimento total do gesto ficou abaixo do limiar de arrasto.
   */
  onMenuContextual?: (info: { clientX: number; clientY: number; tokenId: string | null; hex: Hex }) => void;

  /**
   * Fantasma ao vivo do POSICIONAMENTO de um token novo (fluxo de
   * criação em duas etapas — `VttClient.tsx` possui o estado, este
   * componente só desenha e reporta hover/clique). `celulas`/`valida`
   * já vêm projetadas e validadas pelo domínio (`_dominio/pegada.ts`/
   * `movimento.ts`) — nunca calculado aqui. `ativo=false` ou objeto
   * ausente: nada é desenhado, nenhuma captura de clique acontece.
   */
  posicionamentoToken?: {
    ativo: boolean;
    ancora: Hex | null;
    celulas: Hex[];
    valida: boolean;
    orientacao: number;
    podeGirar: boolean;
    sigla: string;
    imagemUrl: string | null;
  } | null;
  /** Cursor moveu sobre um hex NOVO enquanto `posicionamentoToken.ativo` — reporta a âncora candidata, nunca decide validade. */
  onMoverPosicionamento?: (h: Hex) => void;
  /** Clique esquerdo num hex enquanto `posicionamentoToken.ativo` — quem chama decide se confirma (célula válida) ou ignora (inválida); nunca uma decisão deste componente. */
  onConfirmarPosicionamento?: (h: Hex) => void;

  /**
   * Visibilidade/bloqueio de interação LOCAL por camada
   * (`_shell/PainelCamadas.tsx`) — nunca muda regra de jogo, só o que
   * este componente desenha/aceita clique. `undefined` = todas
   * visíveis e destravadas (comportamento de sempre).
   */
  camadas?: import("../_shell/PainelCamadas").EstadoCamadas;
  /**
   * Quem esconde continua enxergando.
   *
   * As camadas são da CENA (0093): o narrador esconde e some pra mesa.
   * Mas ele precisa ver o que escondeu pra poder trabalhar — mesmo
   * princípio de `vtt_tokens.visivel`, que já mostra ao narrador, com
   * marca de oculto, o token que os jogadores não veem. Aqui a camada
   * escondida aparece atenuada em vez de sumir.
   */
  verCamadasOcultas?: boolean;

  /**
   * IMAGENS da cena — fundo e tiles (migration 0100). Decoração pura:
   * este componente as desenha e deixa arrastar, e nada mais. Elas não
   * entram em pathfinding, colisão nem custo de terreno, pelo mesmo
   * princípio que separa objeto tático de enfeite.
   *
   * `urlsImagens` chega ASSINADA de fora. Este componente nunca assina
   * nada: quem decide se uma pessoa pode ver um arquivo é o servidor
   * (`vtt_asset_assinavel_para`), e um mapa que pudesse pedir a própria
   * URL seria uma segunda porta para a mesma decisão.
   */
  /**
   * Onde o ponteiro está sobre o mapa, em axial CONTÍNUO — escrito por
   * este componente, lido por quem cola ou solta um arquivo.
   *
   * É REF, não callback com estado: um `setState` por `pointermove`
   * redesenharia o mapa inteiro dezenas de vezes por segundo para
   * alimentar um valor que só é lido no instante de um `paste`. Fica
   * `null` enquanto o ponteiro não entrou no mapa — e esse `null` é
   * informação, não ausência: é ele que manda a colagem cair no centro
   * da viewport em vez de num ponto que a pessoa nunca apontou.
   */
  ancoraPonteiroRef?: React.MutableRefObject<PontoAxial | null>;
  /**
   * Conversor tela→axial, publicado por este componente para quem
   * precisa dele fora do mapa — hoje, o `drop` de arquivo.
   *
   * Um arraste de arquivo NÃO emite `pointermove`, então a âncora
   * guardada está parada onde o mouse esteve antes do arraste começar:
   * o ponto do drop só existe nas coordenadas do próprio evento, e
   * convertê-las exige o CTM do SVG, que só este componente tem.
   */
  conversorPontoRef?: React.MutableRefObject<((x: number, y: number) => PontoAxial | null) | null>;
  imagensCena?: readonly ImagemCena[];
  urlsImagens?: Record<string, string>;
  imagemSelecionadaId?: string | null;
  onSelecionarImagem?: (id: string | null) => void;
  /** Fim do gesto de mover — âncora axial CONTÍNUA (nada encaixa em célula). */
  onMoverImagem?: (id: string, centroQ: number, centroR: number) => void;
  /** Fim do gesto de giro — o ângulo já normalizado em [0, 360). */
  onRotacionarImagem?: (id: string, graus: number) => void;
  /** Fim do gesto de escalar — largura em metros; a altura segue a proporção. */
  /** Escalar pelo canto muda largura E centro na mesma escrita (0110). */
  onEscalarImagem?: (id: string, larguraM: number, centro: { q: number; r: number }) => void;

  /**
   * Zoom pela roda do mouse/trackpad — recebe o delta já normalizado
   * (`deltaMode` resolvido pra uma escala aproximada de pixels, ver
   * `normalizarDeltaWheel`) e o ponto do MUNDO que estava sob o cursor
   * no instante do evento, pra quem chama poder ancorar o zoom nesse
   * ponto (mantê-lo visualmente parado na tela). O clamp de limites e a
   * escala exponencial ficam em quem chama (`VttClient`, dono de
   * `zoom`/`pan`) — este componente só reporta o evento cru convertido.
   */
  onWheelZoom?: (deltaNormalizado: number, pontoMundo: { x: number; y: number }) => void;

  /**
   * Animações de movimento ATIVAS, uma por token, chaveadas pelo id
   * DEMO (`cena.tokens[].id`) — a mesma chave que já indexa seleção e
   * hover em todo o resto deste arquivo. Muda de referência só em
   * eventos discretos (início/fim/substituição de UM movimento), nunca
   * por frame — a interpolação de 60fps acontece inteira dentro de
   * `useAnimacaoToken`, sem reconciliar este componente a cada tick.
   */
  movimentosVisuais?: ReadonlyMap<string, MovimentoVisualToken>;
  /** Uma animação terminou — quem chama decide o que fazer da entrada em `movimentosVisuais` (normalmente: apagá-la). */
  onAnimacaoConcluida?: (tokenId: string, movementId: string, destino?: Hex) => void;
}

export function MapaHex({
  cena,
  zoom,
  pan,
  selecionadoId,
  hoverId,
  alvoIds,
  estadoPorToken,
  celulasRealce,
  tipoRealce,
  onSelecionarToken,
  onHoverToken,
  onClicarCelula,
  terrenoReal,
  ferramenta = "interagir",
  podeMoverToken,
  onSoltarToken,
  onSoltarTokens,
  onPressCelula,
  onEntrarCelulaPintando,
  onSelecionarCaixa,
  previaPincelRaio,
  onMedicaoMudou,
  modoMedicao,
  onMedicaoConcluida,
  medicoesPermanentes,
  reguasAoVivo,
  onApagarMedicao,
  onSelecionarObjeto,
  objetoEmMovimentoId,
  marcas,
  onClicarMarca,
  pingsExibidos,
  onPingCelula,
  onPan,
  onMenuContextual,
  onWheelZoom,
  movimentosVisuais,
  onAnimacaoConcluida,
  posicionamentoToken,
  onMoverPosicionamento,
  onConfirmarPosicionamento,
  camadas,
  idsSelecionados,
  onRotacaoAlcaSolta,
  onRotacaoAlcaPasso,
  areas,
  areasMostrarCelulas = true,
  areasMostrarHalos = true,
  areasGuia,
  areasCandidatoSnap,
  areasEscolhendoToken = false,
  areasAncoraAcoes,
  onAncoraAcoesTela,
  onConversorEdicaoRapidaTela,
  onConversorHexDaTela,
  areasParaHover,
  onHoverAreaEditavel,
  areasAlcas,
  onAreaAlcaMover,
  onAreaAlcaSoltar,
  onAreaAlcaCancelar,
  areasInteracao,
  verCamadasOcultas,
  ancoraPonteiroRef,
  conversorPontoRef,
  imagensCena,
  urlsImagens,
  imagemSelecionadaId,
  onSelecionarImagem,
  onMoverImagem,
  onRotacionarImagem,
  onEscalarImagem,
}: PropsMapaHex) {
  /** Última posição axial EXATA do ponteiro num arrasto — ver `soltar()`. */
  const pontoExatoRef = useRef<{ q: number; r: number } | null>(null);
  const cOculta = (id: keyof NonNullable<PropsMapaHex["camadas"]>) => (camadas?.[id]?.visivel ?? true) === false;
  /**
   * Camada de FERRAMENTA (grade, marcações, pings) escondida some pra
   * todo mundo — esconder a grade e continuar vendo a grade não é
   * esconder nada. Só CONTEÚDO da cena fica visível pro narrador que o
   * escondeu, e atenuado, igual a um token com `visivel: false`.
   */
  const cVisivel = (id: keyof NonNullable<PropsMapaHex["camadas"]>) =>
    (camadas?.[id]?.visivel ?? true) || (verCamadasOcultas === true && !ehCamadaDeFerramenta(id));
  /** Opacidade de "escondi isto da mesa, mas continuo vendo". */
  const cAtenuacao = (id: keyof NonNullable<PropsMapaHex["camadas"]>) =>
    cOculta(id) && !ehCamadaDeFerramenta(id) ? 0.35 : undefined;
  const cBloqueada = (id: keyof NonNullable<PropsMapaHex["camadas"]>) => camadas?.[id]?.bloqueada ?? false;
  // Grade inteira, memoizada — só muda se a cena mudar de tamanho.
  const celulas = useMemo(() => {
    const out: Hex[] = [];
    for (let r = 0; r < cena.altura; r++) {
      for (let q = 0; q < cena.largura; q++) {
        out.push({ q: q - Math.floor(r / 2), r });
      }
    }
    return out;
  }, [cena.largura, cena.altura]);


  const realceSet = useMemo(() => new Set(celulasRealce.map(hexKey)), [celulasRealce]);

  const dHex = hexPath(TAM);
  const dHexInner = hexPath(TAM - 1.5);

  // Limites do mundo, pra centralizar o viewBox.
  const cantos = celulas.map((c) => hexParaPixel(c, TAM));
  const minX = Math.min(...cantos.map((p) => p.x)) - TAM * 2;
  const minY = Math.min(...cantos.map((p) => p.y)) - TAM * 2;
  const maxX = Math.max(...cantos.map((p) => p.x)) + TAM * 2;
  const maxY = Math.max(...cantos.map((p) => p.y)) + TAM * 2;
  // Folga ALÉM do mundo — o quanto de vazio em volta da grade ainda
  // conta como "mapa" pra quem arrasta uma seleção por caixa lá fora
  // (ver o retângulo `rv-fora-da-grade`). Uma vez o tamanho do próprio
  // mundo pra cada lado cobre com sobra qualquer token que uma grade
  // encolhida tenha deixado de fora, em qualquer zoom.
  const folgaFora = Math.max(maxX - minX, maxY - minY);

  // ── Arraste de token — CONFIRMAÇÃO INCREMENTAL ──────────────────
  // Estado LOCAL ao mapa de propósito: geometria/snap não precisa
  // subir pro componente pai a cada pixel de movimento do mouse — só o
  // resultado final (rota completa) sai via `onSoltarToken`. Cancelar
  // (Esc) só precisa zerar este estado, sem round-trip nenhum.
  //
  // A rota é o RASTRO do cursor (`_dominio/arrastoToken.ts`): cada
  // movimento estende a trilha pelas células realmente atravessadas
  // (interpoladas quando o mouse anda rápido), e voltar por cima dela
  // corta o excedente. Não há pathfinding nenhum aqui — nada pra
  // "mudar de ideia" e redesenhar a linha por conta própria.
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [arrasto, setArrasto] = useState<EstadoArrasto | null>(null);
  const [pintando, setPintando] = useState(false);
  /* `useMemo` e não `terrenoReal ?? new Map()` solto: sem cena de
     terreno, cada render criava um Map NOVO, e ele é dependência de um
     `useCallback` e de um `useMemo` que alimentam efeitos com
     `setState`. Uma identidade nova por render é a receita do
     "Maximum update depth exceeded". */
  const terrenoParaRota: MapaTerreno = useMemo(() => terrenoReal ?? new Map(), [terrenoReal]);

  /* Espelho de zoom/pan lido DENTRO de `pontoMundo`. Antes a função
     tinha zoom/pan nas dependências, ou seja: identidade nova a cada
     passo de zoom, e todo efeito que a usa (roda, arrasto de pan,
     hover de área, medição) desinscrevia e reinscrevia seus listeners
     a cada tique da roda — o "travado" do gesto. Escrever o espelho no
     render mantém a leitura sempre atual sem custar identidade nova. */
  const zoomPanAtualRef = useRef({ zoom, pan });
  zoomPanAtualRef.current = { zoom, pan };
  const pontoMundo = useCallback((clientX: number, clientY: number): { x: number; y: number } | null => {
    const svg = svgRef.current;
    if (!svg) return null;
    const pt = svg.createSVGPoint();
    pt.x = clientX; pt.y = clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return null;
    const p = pt.matrixTransform(ctm.inverse());
    // O `<g>` de conteúdo aplica translate(pan) scale(zoom) — desfaz
    // isso pra chegar nas coordenadas do MUNDO, onde `pixelParaHex` opera.
    const { zoom: z, pan: pa } = zoomPanAtualRef.current;
    return { x: (p.x - pa.x) / z, y: (p.y - pa.y) / z };
  }, []);

  // Espelho síncrono do `arrasto` mais recente — `soltar()` precisa
  // dele pra chamar `onSoltarToken` (um efeito colateral real: dispara
  // a animação, chama o servidor) FORA do updater de `setArrasto`.
  // Chamar um efeito colateral DE DENTRO de um updater de `setState` é
  // o mesmo anti-padrão já corrigido antes nesta base de código — React
  // pode invocar o updater mais de uma vez (achado real aqui: em
  // desenvolvimento, isso disparava `onSoltarToken` duas vezes pro
  // MESMO gesto de soltar, a segunda com uma revisão já desatualizada
  // pela primeira, que o servidor recusava — antes disto isso passava
  // despercebido porque uma recusa só mostrava uma mensagem de erro;
  // com a animação de retração da rejeição, a segunda chamada passou a
  // puxar o token visivelmente de volta pra origem logo depois dele
  // chegar no destino certo).
  const arrastoRef = useRef<typeof arrasto>(null);

  /**
   * ACOMPANHANTES do arrasto em grupo — congelados no INÍCIO do gesto,
   * nunca relidos de `idsSelecionados` durante ele: a formação que
   * começou a se mover é a que termina de se mover, mesmo que a
   * seleção mude no meio (e ela muda, por exemplo, se o gesto for
   * cancelado e recomeçado). Cada um guarda o vetor FIXO que o separa
   * do líder e a pegada na orientação atual — as duas coisas que a
   * translação precisa e que não mudam durante o deslocamento.
   */
  const [acompanhantes, setAcompanhantes] = useState<{ tokenId: string; deslocamento: Hex; pegada: Pegada }[]>([]);
  const acompanhantesRef = useRef(acompanhantes);
  useEffect(() => { acompanhantesRef.current = acompanhantes; }, [acompanhantes]);
  const encerrarArrasto = useCallback(() => {
    arrastoRef.current = null;
    acompanhantesRef.current = [];
    setArrasto(null);
    setAcompanhantes([]);
  }, []);

  // Todos os OUTROS tokens são obstáculo pro pathfinding — o projeto
  // não distingue token "atravessável" de "bloqueante" hoje, então
  // trata todos uniformemente (decisão explícita, não uma lacuna). É a
  // UNIÃO de TODAS as células da PEGADA de cada token alheio — nunca só
  // a âncora — senão um token multicelular "vazaria" colisão pelas
  // bordas. O próprio token em arrasto nunca entra aqui: ele pode sair
  // da própria pegada sem ela continuar "ocupada por ele mesmo".
  const ocupados = useMemo(() => {
    const s = new Set<string>();
    // Nem o líder nem os acompanhantes entram: TODOS saem das próprias
    // células no mesmo instante, e contá-los como obstáculo faria o
    // grupo colidir consigo mesmo no primeiro passo.
    const doGrupo = new Set(acompanhantes.map((a) => a.tokenId));
    for (const t of cena.tokens) {
      if (t.id === arrasto?.tokenId || doGrupo.has(t.id)) continue;
      const pegada = pegadaEfetiva({ categoria: t.tamanho, orientacao: t.orientacao, pegadaPersonalizada: t.pegadaPersonalizada });
      for (const c of projetarPegada(t.pos, pegada)) s.add(hexKey(c));
    }
    return s;
  }, [cena.tokens, arrasto?.tokenId, acompanhantes]);

  // Pegada do token EM ARRASTO, na orientação atual — constante durante
  // todo o deslocamento (a orientação não muda arrastando, ver
  // `_dominio/pegada.ts`). `undefined` quando não há arrasto — o
  // pathfinding cai no padrão de 1 célula.
  const pegadaEmArrasto: Pegada | undefined = useMemo(() => {
    if (!arrasto) return undefined;
    const tok = cena.tokens.find((t) => t.id === arrasto.tokenId);
    if (!tok) return undefined;
    return pegadaEfetiva({ categoria: tok.tamanho, orientacao: tok.orientacao, pegadaPersonalizada: tok.pegadaPersonalizada });
  }, [arrasto, cena.tokens]);

  /** O que o domínio precisa saber sobre os acompanhantes — só vetor e pegada, nunca o token inteiro. */
  const grupoParaRota = useMemo(
    () => acompanhantes.map(({ deslocamento, pegada }) => ({ deslocamento, pegada })),
    [acompanhantes],
  );

  /**
   * Começa o arrasto e devolve SE ele começou — quem chama (o
   * `pointerdown` do token) usa a resposta pra decidir se pode
   * preservar uma seleção múltipla ou se deve colapsá-la na hora.
   *
   * Os acompanhantes são os OUTROS tokens selecionados que esta pessoa
   * também pode mover. Quem ela não pode mover fica pra trás em vez de
   * abortar o gesto inteiro: selecionar por caixa costuma pegar token
   * alheio junto, e perder o gesto por causa disso seria pior que mover
   * só o que é seu.
   */
  const iniciarArrasto = useCallback((tokenId: string, origem: Hex): boolean => {
    if (ferramenta !== "interagir") return false;
    if (podeMoverToken && !podeMoverToken(tokenId)) return false;
    const emGrupo = onSoltarTokens && (idsSelecionados?.includes(tokenId) ?? false)
      ? cena.tokens.filter((t) => t.id !== tokenId
          && (idsSelecionados?.includes(t.id) ?? false)
          && (podeMoverToken?.(t.id) ?? true))
      : [];
    const inicial = iniciarArrastoToken(tokenId, origem);
    arrastoRef.current = inicial;
    const seguidores = emGrupo.map((t) => ({
      tokenId: t.id,
      deslocamento: { q: t.pos.q - origem.q, r: t.pos.r - origem.r },
      pegada: pegadaEfetiva({ categoria: t.tamanho, orientacao: t.orientacao, pegadaPersonalizada: t.pegadaPersonalizada }),
    }));
    acompanhantesRef.current = seguidores;
    setAcompanhantes(seguidores);
    setArrasto(inicial);
    return true;
  }, [ferramenta, podeMoverToken, onSoltarTokens, idsSelecionados, cena.tokens]);

  // ── Alça de rotação (arrastar no mapa) ────────────────────────────
  // Estado LOCAL a este componente, mesmo espírito de `arrasto`: a
  // prévia (ângulo → uma das 6 orientações, validade célula a célula)
  // não precisa subir pro pai a cada pixel — só o COMMIT final
  // (`onRotacaoAlcaSolta`) sai daqui. Diferente do arrasto de token
  // (que usa listeners GLOBAIS de `window`), este gesto usa
  // `setPointerCapture` de verdade — pedido explícito — então os
  // handlers ficam DIRETO no elemento da alça (todo evento pro mesmo
  // `pointerId` é roteado pra ele, não importa onde o cursor esteja).
  type EstadoRotacaoAlca = {
    tokenId: string;
    orientacaoInicial: number;
    orientacaoAtual: number;
    valida: boolean;
    inicioClientXY: { x: number; y: number };
    moveuSignificativamente: boolean;
  };
  const [rotacaoAlca, setRotacaoAlca] = useState<EstadoRotacaoAlca | null>(null);
  const rotacaoAlcaRef = useRef<EstadoRotacaoAlca | null>(null);

  /**
   * Vetor cursor→âncora convertido pra uma das 6 orientações canônicas
   * — reusa `hexRotacionar`+`hexParaPixel` (a MESMA rotação de
   * `_dominio/pegada.ts`) pra gerar os 6 candidatos, nunca uma
   * trigonometria/convenção de ângulo própria: a orientação vencedora
   * é sempre uma das 6 que o domínio já sabe produzir.
   */
  const anguloParaOrientacao = useCallback((dx: number, dy: number): number => {
    const anguloCursor = Math.atan2(dy, dx);
    let melhor = 0, menorDist = Infinity;
    for (let o = 0; o < 6; o++) {
      const dir = hexParaPixel(hexRotacionar({ q: 1, r: 0 }, o), 1);
      const ang = Math.atan2(dir.y, dir.x);
      let dist = Math.abs(anguloCursor - ang);
      if (dist > Math.PI) dist = 2 * Math.PI - dist;
      if (dist < menorDist) { menorDist = dist; melhor = o; }
    }
    return melhor;
  }, []);

  /**
   * Bloqueio/colisão pra uma orientação CANDIDATA do token em rotação —
   * próprio token excluído da colisão. Nunca reimplementa geometria: só
   * combina `pegadaEfetiva`/`projetarPegada`/`pegadaBloqueada`/
   * `pegadasSobrepoem`, todas do domínio.
   *
   * A BORDA da cena não entra: um token pode estar fora da grade (é
   * área de trabalho legítima — ver `posicaoDoGrupoValida` em
   * `_dominio/arrastoToken.ts`), e girar quem está lá tem que
   * funcionar. Exigir a pegada dentro do mapa deixaria esses tokens
   * girando só por sorte de posição.
   */
  const validarOrientacaoAlca = useCallback((t: TokenApresentacao, novaOrientacao: number): boolean => {
    const pegadaCandidata = pegadaEfetiva({ categoria: t.tamanho, orientacao: novaOrientacao, pegadaPersonalizada: t.pegadaPersonalizada });
    const celulas = projetarPegada(t.pos, pegadaCandidata);
    if (terrenoReal && pegadaBloqueada(terrenoReal, celulas)) return false;
    const celulasOutros: Hex[] = [];
    for (const outro of cena.tokens) {
      if (outro.id === t.id) continue;
      const pegadaOutro = pegadaEfetiva({ categoria: outro.tamanho, orientacao: outro.orientacao, pegadaPersonalizada: outro.pegadaPersonalizada });
      celulasOutros.push(...projetarPegada(outro.pos, pegadaOutro));
    }
    return !pegadasSobrepoem(celulas, celulasOutros);
  }, [cena.tokens, terrenoReal]);

  const iniciarRotacaoAlca = useCallback((t: TokenApresentacao, e: React.PointerEvent) => {
    if (ferramenta !== "interagir") return;
    // Nunca deixa o MESMO gesto começar seleção/arrasto/pan por baixo
    // da alça — a captura de ponteiro sozinha não impede isso, porque
    // o `pointerdown` ainda passaria pela árvore normal de eventos
    // antes da captura entrar em vigor.
    e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    const inicial: EstadoRotacaoAlca = {
      tokenId: t.id, orientacaoInicial: t.orientacao, orientacaoAtual: t.orientacao, valida: true,
      inicioClientXY: { x: e.clientX, y: e.clientY }, moveuSignificativamente: false,
    };
    rotacaoAlcaRef.current = inicial;
    setRotacaoAlca(inicial);
  }, [ferramenta]);

  const moverRotacaoAlca = useCallback((e: React.PointerEvent) => {
    const atual = rotacaoAlcaRef.current;
    if (!atual) return;
    const t = cena.tokens.find((x) => x.id === atual.tokenId);
    if (!t) return;
    const distTotal = Math.hypot(e.clientX - atual.inicioClientXY.x, e.clientY - atual.inicioClientXY.y);
    const moveuSignificativamente = atual.moveuSignificativamente || distTotal >= LIMIAR_ARRASTO_PX;
    const pMundo = pontoMundo(e.clientX, e.clientY);
    if (!pMundo) return;
    const pAncora = hexParaPixel(t.pos, TAM);
    const pegadaAtual = pegadaEfetiva({ categoria: t.tamanho, orientacao: t.orientacao, pegadaPersonalizada: t.pegadaPersonalizada });
    const origLocal = hexParaPixel(origemMecanica(pegadaAtual), TAM);
    const dx = pMundo.x - (pAncora.x + origLocal.x);
    const dy = pMundo.y - (pAncora.y + origLocal.y);
    // Só reavalia a orientação depois de cruzar o limiar de arrasto —
    // um tremor de poucos pixels não deve "escolher" uma direção
    // ainda; é exatamente o que permite distinguir clique de arrasto
    // no soltar (ver `soltarRotacaoAlca`).
    const novaOrientacao = moveuSignificativamente ? anguloParaOrientacao(dx, dy) : atual.orientacaoAtual;
    const valida = validarOrientacaoAlca(t, novaOrientacao);
    const novo: EstadoRotacaoAlca = { ...atual, orientacaoAtual: novaOrientacao, valida, moveuSignificativamente };
    rotacaoAlcaRef.current = novo;
    setRotacaoAlca(novo);
  }, [cena.tokens, pontoMundo, anguloParaOrientacao, validarOrientacaoAlca]);

  const finalizarRotacaoAlca = useCallback((confirmar: boolean) => {
    const atual = rotacaoAlcaRef.current;
    rotacaoAlcaRef.current = null;
    setRotacaoAlca(null);
    if (!confirmar || !atual) return;
    // Clique simples (sem arrasto significativo): passo de 60° no
    // sentido horário — alternativa acessível, melhor em touch. Um
    // arrasto de verdade já escolheu `orientacaoAtual` célula a
    // célula; um clique nunca cruzou o limiar, então `orientacaoAtual`
    // ainda é igual à inicial — o passo de 60° é aplicado por cima
    // dela aqui, não durante o movimento.
    const t = cena.tokens.find((x) => x.id === atual.tokenId);
    if (!atual.moveuSignificativamente) {
      const passoClique = ((atual.orientacaoInicial + 1) % 6 + 6) % 6;
      if (t && validarOrientacaoAlca(t, passoClique)) onRotacaoAlcaSolta?.(atual.tokenId, passoClique);
      return;
    }
    if (!atual.valida) return; // prévia inválida — nunca persiste
    if (atual.orientacaoAtual === atual.orientacaoInicial) return; // sem mudança real — nunca chama RPC
    onRotacaoAlcaSolta?.(atual.tokenId, atual.orientacaoAtual);
  }, [cena.tokens, validarOrientacaoAlca, onRotacaoAlcaSolta]);

  const soltarRotacaoAlca = useCallback((e: React.PointerEvent) => {
    (e.currentTarget as Element).releasePointerCapture(e.pointerId);
    finalizarRotacaoAlca(true);
  }, [finalizarRotacaoAlca]);
  // `pointercancel`/perda de captura — encerra com segurança, SEM
  // persistir nada (gesto interrompido pelo sistema/navegador, nunca
  // uma confirmação do usuário).
  const cancelarRotacaoAlca = useCallback(() => { finalizarRotacaoAlca(false); }, [finalizarRotacaoAlca]);

  // Teclado — INSTANTÂNEO, nunca um gesto de arrasto por teclas: cada
  // tecla já é a decisão final (mesmo espírito do clique simples), não
  // uma prévia que precisa de confirmação separada. Passa direto pela
  // MESMA `onRotacaoAlcaSolta` (⇒ `aplicarRotacaoAbsoluta` em
  // VttClient.tsx) que o clique/arrasto já usam — mesma RPC canônica,
  // mesma guarda de revisão/RPC-em-voo, mesmo registro de undo/redo
  // como UMA operação. Nunca decide autorização aqui: só chega neste
  // handler quem já passou por `mostrarAlca` (autorização/seleção
  // única/ferramenta já resolvidos por quem chama).
  const tecladoRotacaoAlca = useCallback((t: TokenApresentacao, e: React.KeyboardEvent) => {
    switch (e.key) {
      case "ArrowRight": case "e": case "E":
        e.preventDefault();
        onRotacaoAlcaPasso?.(t.id, 1);
        return;
      case "ArrowLeft": case "q": case "Q":
        e.preventDefault();
        onRotacaoAlcaPasso?.(t.id, -1);
        return;
      case "Home":
        e.preventDefault();
        onRotacaoAlcaSolta?.(t.id, 0);
        return;
      case "Escape":
        // Defensivo: se por algum motivo um gesto de ponteiro estiver
        // ativo enquanto o foco de teclado também está na alça, Esc
        // cancela a prévia sem persistir — mesmo caminho do gesto de
        // arrasto. Fora de gesto (o caso comum de uso por teclado) é
        // um no-op seguro, já que não há prévia nenhuma pra desfazer.
        if (rotacaoAlcaRef.current) { e.preventDefault(); cancelarRotacaoAlca(); }
        return;
      default:
        return;
    }
  }, [onRotacaoAlcaSolta, onRotacaoAlcaPasso, cancelarRotacaoAlca]);

  // Esc durante o gesto: cancela a prévia, restaura a orientação
  // inicial (nunca escreve nada — a orientação exibida já É a
  // persistida, já que este estado é só uma prévia local), sem RPC.
  useEffect(() => {
    if (!rotacaoAlca) return;
    function aoTeclar(e: KeyboardEvent) {
      if (e.key === "Escape") { e.preventDefault(); cancelarRotacaoAlca(); }
    }
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [rotacaoAlca, cancelarRotacaoAlca]);

  useEffect(() => {
    if (!conversorPontoRef) return;
    const ref = conversorPontoRef;
    ref.current = (x, y) => {
      const p = pontoMundo(x, y);
      return p ? mundoParaAxial(p.x, p.y, TAM) : null;
    };
    return () => { ref.current = null; };
  }, [conversorPontoRef, pontoMundo]);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg || !ancoraPonteiroRef) return;
    const ref = ancoraPonteiroRef;
    function aoMover(e: PointerEvent) {
      const p = pontoMundo(e.clientX, e.clientY);
      ref.current = p ? mundoParaAxial(p.x, p.y, TAM) : null;
    }
    function aoSair() { ref.current = null; }
    svg.addEventListener("pointermove", aoMover);
    svg.addEventListener("pointerleave", aoSair);
    return () => {
      svg.removeEventListener("pointermove", aoMover);
      svg.removeEventListener("pointerleave", aoSair);
      ref.current = null;
    };
  }, [ancoraPonteiroRef, pontoMundo]);

  // ── Gesto de IMAGEM: mover e escalar ───────────────────────────────
  //
  // Deliberadamente SEPARADO de `arrasto` (o de token), e não uma
  // variante dele. O arrasto de token carrega rota, pathfinding,
  // pegada, waypoints e colisão; imagem não tem nada disso — ela flutua
  // livre em coordenada contínua, sem encaixar em célula e sem
  // consultar terreno. Enfiar os dois no mesmo estado significaria um
  // punhado de campos sempre nulos num deles e uma condição de "qual
  // modo é este" em cada leitura.
  //
  // O gesto vive num ref e só produz UMA escrita, no `pointerup` —
  // mesma disciplina do token: nada é persistido durante o arraste. O
  // que muda durante o gesto é só o `transform` de prévia, aplicado no
  // SVG sem passar pelo servidor.
  const gestoImagemRef = useRef<{
    id: string;
    canto: CantoImagem | "girar" | null;
    /** Ponto de mundo onde a pressão começou. */
    origem: { x: number; y: number };
    /** Estado da imagem no início — a prévia é sempre relativa a ele. */
    inicial: ImagemCena;
  } | null>(null);
  const [previaImagem, setPreviaImagem] = useState<
    { id: string; dx: number; dy: number; escala: number; giro: number } | null
  >(null);
  /* Mesmo motivo do `arrastoRef`: `soltar()` é efeito colateral real
     (chama o servidor) e precisa do valor do gesto que acabou de
     acontecer, não do que o último commit refletiu. */
  const previaImagemRef = useRef<typeof previaImagem>(null);
  previaImagemRef.current = previaImagem;

  /**
   * A lista que o SVG desenha — igual à recebida, exceto pela imagem
   * em gesto, que ganha a prévia aplicada. A prévia vive só aqui: o
   * servidor não sabe dela até o `pointerup`, e é isso que faz um
   * arraste custar uma escrita e não trinta.
   */
  const imagensDesenhaveis = useMemo<readonly ImagemCena[]>(() => {
    const lista = imagensCena ?? [];
    if (!previaImagem) return lista;
    return lista.map((img) => {
      if (img.id !== previaImagem.id) return img;
      /* Escala e deslocamento CONVIVEM: arrastar um canto mantém o
         canto oposto parado, e isso muda tamanho e centro ao mesmo
         tempo. Antes eram exclusivos (ou escalava, ou movia), e por
         isso a escala só podia ser a partir do centro. */
      const escalada = previaImagem.escala !== 1
        ? {
            ...img,
            larguraM: img.larguraM * previaImagem.escala,
            // A altura explícita escala JUNTO — senão a imagem que
            // alguém distorceu de propósito voltaria à proporção do
            // arquivo no meio de um gesto de tamanho.
            alturaM: img.alturaM === null ? null : img.alturaM * previaImagem.escala,
          }
        : img;
      const girada = previaImagem.giro === 0
        ? escalada
        : { ...escalada, rotacaoGraus: img.rotacaoGraus + previaImagem.giro };
      if (previaImagem.dx === 0 && previaImagem.dy === 0) return girada;
      const r = retanguloDaImagem(img, TAM);
      const destino = mundoParaAxial(r.centroX + previaImagem.dx, r.centroY + previaImagem.dy, TAM);
      return { ...girada, centroQ: destino.q, centroR: destino.r };
    });
  }, [imagensCena, previaImagem]);

  const pressionarImagem = useCallback((id: string, canto: CantoImagem | "girar" | null, e: React.PointerEvent) => {
    const img = imagensCena?.find((i) => i.id === id);
    if (!img || img.travado) return;
    const p = pontoMundo(e.clientX, e.clientY);
    if (!p) return;
    e.stopPropagation();
    gestoImagemRef.current = { id, canto, origem: p, inicial: img };
    setPreviaImagem({ id, dx: 0, dy: 0, escala: 1, giro: 0 });
  }, [imagensCena, pontoMundo]);

  useEffect(() => {
    if (!previaImagem) return;

    function mover(e: PointerEvent) {
      const g = gestoImagemRef.current;
      const p = g ? pontoMundo(e.clientX, e.clientY) : null;
      if (!g || !p) return;
      const dx = p.x - g.origem.x;
      const dy = p.y - g.origem.y;

      if (g.canto === null) {
        setPreviaImagem({ id: g.id, dx, dy, escala: 1, giro: 0 });
        return;
      }

      if (g.canto === "girar") {
        /* GIRO em torno do CENTRO — o único centro de rotação que não
           faz a imagem fugir da mão. O ângulo é a diferença entre onde
           o ponteiro está e onde ele estava, não a direção absoluta:
           assim a haste não "salta" pro cursor no primeiro pixel.

           Livre por padrão, com Shift travando em passos de 15° —
           encostar um mapa na ortogonal é o caso comum, e é ele que
           merece o atalho, não o contrário. */
        const r = retanguloDaImagem(g.inicial, TAM);
        const anguloDe = (x: number, y: number) =>
          (Math.atan2(y - r.centroY, x - r.centroX) * 180) / Math.PI;
        let giro = anguloDe(p.x, p.y) - anguloDe(g.origem.x, g.origem.y);
        if (e.shiftKey) {
          const alvo = Math.round((g.inicial.rotacaoGraus + giro) / 15) * 15;
          giro = alvo - g.inicial.rotacaoGraus;
        }
        setPreviaImagem({ id: g.id, dx: 0, dy: 0, escala: 1, giro });
        return;
      }

      /* ESCALA PELO CANTO, com o canto OPOSTO ancorado — o gesto que
         todo VTT tem. A escala sai da distância ao ponto âncora (não ao
         centro), e o centro anda metade do que a imagem cresceu, que é
         o que mantém a âncora parada.

         Uniforme de propósito: arrastar um canto nunca DISTORCE. A
         distorção é deliberada e mora no ajuste fino, com um botão pra
         desfazer — esticar sem querer um mapa inteiro é o tipo de
         estrago que se descobre tarde. */
      const r = retanguloDaImagem(g.inicial, TAM);
      const ancoraX = g.canto === "tl" || g.canto === "bl" ? r.x + r.largura : r.x;
      const ancoraY = g.canto === "tl" || g.canto === "tr" ? r.y + r.altura : r.y;
      const antesX = Math.abs(g.origem.x - ancoraX);
      const antesY = Math.abs(g.origem.y - ancoraY);
      const agoraX = Math.abs(p.x - ancoraX);
      const agoraY = Math.abs(p.y - ancoraY);
      // Perto da âncora a razão explode (divisão por ~0): abaixo de um
      // limiar o gesto simplesmente não escala, em vez de saltar. O
      // eixo que domina é o que mais andou, para o gesto seguir a mão.
      const base = Math.max(antesX, antesY);
      const escala = base < 4
        ? 1
        : Math.max(0.05, (antesX >= antesY ? agoraX / antesX : agoraY / antesY));
      // Centro novo = âncora + metade do retângulo já escalado, no
      // sentido em que a imagem se estende a partir dela.
      const sinalX = r.centroX >= ancoraX ? 1 : -1;
      const sinalY = r.centroY >= ancoraY ? 1 : -1;
      const novoCentroX = ancoraX + sinalX * (r.largura * escala) / 2;
      const novoCentroY = ancoraY + sinalY * (r.altura * escala) / 2;
      setPreviaImagem({
        id: g.id,
        dx: novoCentroX - r.centroX,
        dy: novoCentroY - r.centroY,
        escala,
        giro: 0,
      });
    }

    function soltar() {
      const g = gestoImagemRef.current;
      gestoImagemRef.current = null;
      const previa = previaImagemRef.current;
      setPreviaImagem(null);
      if (!g || !previa) return;

      if (g.canto === null) {
        // Nada de `pixelParaHex`: a âncora é contínua de propósito. Um
        // fundo quase nunca cai sobre o centro de um hexágono, e
        // encaixar aqui desalinharia o mapa da grade por até meia
        // célula — o erro nº 1 de mapa em VTT.
        if (Math.abs(previa.dx) < 0.5 && Math.abs(previa.dy) < 0.5) return;
        const r = retanguloDaImagem(g.inicial, TAM);
        const destino = mundoParaAxial(r.centroX + previa.dx, r.centroY + previa.dy, TAM);
        onMoverImagem?.(g.id, destino.q, destino.r);
        return;
      }

      if (g.canto === "girar") {
        if (Math.abs(previa.giro) < 0.5) return;
        // Normalizado em [0, 360): o servidor guarda o ângulo, e um
        // "-730°" acumulado por gestos sucessivos desenharia igual mas
        // leria péssimo no painel.
        const graus = ((g.inicial.rotacaoGraus + previa.giro) % 360 + 360) % 360;
        onRotacionarImagem?.(g.id, graus);
        return;
      }

      if (Math.abs(previa.escala - 1) < 0.01) return;
      /* UMA escrita com tamanho e centro: duas (escalar, depois mover)
         fariam a segunda chegar com a revisão que a primeira
         invalidou, e quem assiste veria a imagem crescer e só depois
         pular de lugar. */
      const r = retanguloDaImagem(g.inicial, TAM);
      const centro = mundoParaAxial(r.centroX + previa.dx, r.centroY + previa.dy, TAM);
      onEscalarImagem?.(g.id, g.inicial.larguraM * previa.escala, centro);
    }

    // `pointercancel`/`blur` cancelam sem gravar, como no arrasto de
    // token: um gesto roubado pelo sistema não é um gesto concluído.
    function cancelar() {
      gestoImagemRef.current = null;
      setPreviaImagem(null);
    }
    function tecla(e: KeyboardEvent) {
      if (e.key === "Escape") cancelar();
    }

    window.addEventListener("pointermove", mover);
    window.addEventListener("pointerup", soltar);
    window.addEventListener("pointercancel", cancelar);
    window.addEventListener("blur", cancelar);
    window.addEventListener("keydown", tecla);
    return () => {
      window.removeEventListener("pointermove", mover);
      window.removeEventListener("pointerup", soltar);
      window.removeEventListener("pointercancel", cancelar);
      window.removeEventListener("blur", cancelar);
      window.removeEventListener("keydown", tecla);
    };
  }, [previaImagem !== null, pontoMundo, onMoverImagem, onEscalarImagem, onRotacionarImagem]);

  useEffect(() => {
    if (!arrasto) return;

    function mover(e: PointerEvent) {
      const p = pontoMundo(e.clientX, e.clientY);
      if (!p) return;
      const hex = pixelParaHex(p.x, p.y, TAM);
      // Onde o ponteiro está DE VERDADE, sem arredondar. Com a grade
      // escondida é isso que decide onde o token para; com a grade à
      // vista é ignorado. Fica num ref, não no estado: nada aqui muda
      // o que se desenha durante o gesto (a animação é que manda), e
      // um setState por pointermove seria só custo.
      pontoExatoRef.current = pixelParaHexExato(p.x, p.y, TAM);
      setArrasto((a) => {
        if (!a) return a;
        // Pathfinding só entre a ponta de `rotaConfirmada` e este hex
        // — nunca da origem (ver doc de `moverDestino`). `pegada`
        // garante que CADA posição candidata valida a pegada inteira,
        // não só a âncora.
        const novo = moverDestino(a, hex, { terreno: terrenoParaRota, ocupados, largura: cena.largura, altura: cena.altura, pegada: pegadaEmArrasto, grupo: grupoParaRota });
        // Síncrono, dentro do próprio handler — não esperar o efeito
        // de espelho (que só reflete depois do commit) garante que
        // `soltar()` sempre leia o valor mais recente, mesmo numa
        // rajada de pointermove no mesmo laço de eventos.
        if (novo !== a) arrastoRef.current = novo;
        return novo;
      });
    }
    function soltar() {
      const a = arrastoRef.current;
      // Gesto que não andou = CLIQUE. É aqui que o clique num token já
      // selecionado dentro de uma seleção múltipla finalmente colapsa
      // a seleção nele — o `pointerdown` adiou essa decisão de
      // propósito, pra não desfazer o grupo antes de saber se era
      // clique ou arrasto.
      if (a && semMovimento(a) && acompanhantesRef.current.length > 0) onSelecionarToken(a.tokenId, false);
      if (a && !semMovimento(a)) {
        // `rotaDoEstadoArrasto` só lê `a.rota` — dado puro do ESTADO,
        // sem recalcular nada e sem depender de nenhum valor derivado
        // de render — então não há a classe de bug de "ref
        // desatualizado" que existia quando o envio dependia de um
        // `useMemo` só atualizado no próximo commit. UMA persistência
        // por gesto: nada é gravado durante o arraste.
        const rota = rotaDoEstadoArrasto(a, terrenoParaRota, pegadaEmArrasto);
        // Deslocamento sub-célula: a diferença entre onde o ponteiro
        // largou e o centro da célula onde o token efetivamente parou.
        // Só quando a GRADE está escondida — com ela à vista, encaixar
        // no hex é o comportamento certo, e é o que a mesa espera.
        const destino = rota.pontos[rota.pontos.length - 1];
        const exato = pontoExatoRef.current;
        const semGrade = (camadas?.grade?.visivel ?? true) === false;
        const offset = semGrade && exato && destino
          ? { q: exato.q - destino.q, r: exato.r - destino.r }
          : undefined;
        const seguidores = acompanhantesRef.current;
        if (seguidores.length > 0 && onSoltarTokens) {
          // Grupo: UMA chamada com todas as rotas, pra quem chama
          // persistir tudo como uma operação só (um item de desfazer,
          // não N). O deslocamento sub-célula fica de fora de
          // propósito — ele nasce de "onde ESTE ponteiro largou", e não
          // existe resposta pra isso pros outros tokens do grupo; o
          // bloco inteiro encaixa na célula.
          onSoltarTokens([
            { tokenId: a.tokenId, rota },
            ...seguidores.map((seg) => ({
              tokenId: seg.tokenId,
              rota: rotaDoEstadoArrasto(arrastoDoAcompanhante(a, seg.tokenId, seg.deslocamento), terrenoParaRota, seg.pegada),
            })),
          ]);
        } else {
          onSoltarToken?.(a.tokenId, rota, offset);
        }
      }
      encerrarArrasto();
    }
    // `pointercancel` (gesto roubado pelo sistema/toque) e `blur` da
    // janela (alt-tab no meio do arraste) CANCELAM — nunca confirmam
    // um movimento que o usuário não terminou. Sem isto, o estado
    // ficaria preso: o `pointerup` correspondente nunca chega, e o
    // token seguiria "em arraste" depois do gesto ter morrido.
    function cancelar() {
      encerrarArrasto();
    }
    function tecla(e: KeyboardEvent) {
      if (elementoEhEditavel(document.activeElement as HTMLElement | null)) return;
      if (e.key === "Escape") { encerrarArrasto(); return; }
      if (e.key.toLowerCase() === "q") {
        setArrasto((a) => {
          if (!a) return a;
          const novo = adicionarWaypoint(a);
          if (novo !== a) arrastoRef.current = novo;
          return novo;
        });
        return;
      }
      if (e.key === "Backspace") {
        setArrasto((a) => {
          if (!a) return a;
          const novo = removerUltimoWaypoint(a);
          if (novo !== a) arrastoRef.current = novo;
          return novo;
        });
      }
    }

    window.addEventListener("pointermove", mover);
    window.addEventListener("pointerup", soltar);
    window.addEventListener("pointercancel", cancelar);
    window.addEventListener("blur", cancelar);
    window.addEventListener("keydown", tecla);
    return () => {
      window.removeEventListener("pointermove", mover);
      window.removeEventListener("pointerup", soltar);
      window.removeEventListener("pointercancel", cancelar);
      window.removeEventListener("blur", cancelar);
      window.removeEventListener("keydown", tecla);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!arrasto]);

  // A rota exibida vem DIRETO do estado (`rotaConfirmada +
  // caudaProvisoria`, já construída incrementalmente em `moverDestino`)
  // — nada é recalculado aqui. Preview e envio (`soltar()`, acima) leem
  // exatamente os mesmos campos do MESMO `arrasto`, garantindo que
  // nunca divergem sem precisar cachear nada entre os dois.
  const hexesPreview = arrasto ? rotaExibida(arrasto) : null;
  const rotaPreview = arrasto ? rotaDoEstadoArrasto(arrasto, terrenoParaRota) : null;
  // Realce por célula: a pegada INTEIRA (não só a âncora) projetada em
  // CADA passo da rota — o "varrido" de área que o token multicelular
  // realmente ocupa ao longo do caminho, não uma linha fina de 1 célula.
  const celulasPreview = useMemo(() => {
    if (!hexesPreview) return null;
    const pegada = pegadaEmArrasto ?? [{ q: 0, r: 0 }];
    const s = new Set<string>();
    for (const ancora of hexesPreview) for (const c of projetarPegada(ancora, pegada)) s.add(hexKey(c));
    return s;
  }, [hexesPreview, pegadaEmArrasto]);

  // Pintura de terreno: pressão + entrada com botão preso.
  useEffect(() => {
    if (!pintando) return;
    function soltar() { setPintando(false); }
    window.addEventListener("pointerup", soltar);
    return () => window.removeEventListener("pointerup", soltar);
  }, [pintando]);

  // ── Apontar (ping) — SEGURAR o botão esquerdo, igual Foundry/Roll20 ──
  //
  // Deixou de ser uma FERRAMENTA (`ferramenta === "ping"`, um item na
  // barra que precisava ser selecionado antes de usar). Agora é um
  // GESTO global do mapa: segurar o botão esquerdo parado por
  // `DURACAO_SEGURAR_PING_MS` acende um ping ali — em QUALQUER
  // ferramenta, sem trocar de nada.
  //
  // Por que fase de CAPTURA no `<svg>` inteiro, e não mais um
  // `onPointerDown` condicional espalhado pelas células/marcas/objetos/
  // tokens (que era como a ferramenta antiga funcionava): a captura
  // ENXERGA o pointerdown antes de qualquer handler de bolha da
  // ferramenta ativa decidir o que fazer com ele — então este gesto
  // nunca precisa saber (nem competir) sobre o que está por baixo do
  // dedo. Ele só OBSERVA; nunca chama `preventDefault`/
  // `stopPropagation`, então arrastar um token, desenhar uma área ou
  // selecionar por caixa continuam acontecendo exatamente como sempre
  // — segurar parado tempo demais SÓ ACRESCENTA o ping por cima.
  //
  // Cancela se: soltar antes da duração, mover além do MESMO limiar
  // que distingue clique de arrasto em todo o resto deste arquivo
  // (`LIMIAR_ARRASTO_PX` — sem isto, arrastar um token ou desenhar uma
  // área lentamente disparia um ping no meio do gesto), ou o botão não
  // ser o esquerdo.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg || !onPingCelula) return;

    let timer: ReturnType<typeof setTimeout> | null = null;
    let origem: { x: number; y: number } | null = null;

    function limpar() {
      if (timer !== null) clearTimeout(timer);
      timer = null;
      origem = null;
      window.removeEventListener("pointermove", mover);
      window.removeEventListener("pointerup", limpar);
      window.removeEventListener("pointercancel", limpar);
    }
    function mover(e: PointerEvent) {
      if (!origem) return;
      if (Math.hypot(e.clientX - origem.x, e.clientY - origem.y) >= LIMIAR_ARRASTO_PX) limpar();
    }
    function aoPressionar(e: PointerEvent) {
      if (e.button !== 0) return;
      // Só um gesto de cada vez — um segundo dedo/botão durante a
      // espera não reinicia nem soma outro timer.
      if (timer !== null) return;
      origem = { x: e.clientX, y: e.clientY };
      const pt = pontoMundo(e.clientX, e.clientY);
      if (!pt) return;
      const hex = pixelParaHex(pt.x, pt.y, TAM);
      window.addEventListener("pointermove", mover);
      window.addEventListener("pointerup", limpar);
      window.addEventListener("pointercancel", limpar);
      timer = setTimeout(() => {
        onPingCelula!(hex);
        limpar();
      }, DURACAO_SEGURAR_PING_MS);
    }

    svg.addEventListener("pointerdown", aoPressionar, { capture: true });
    return () => {
      svg.removeEventListener("pointerdown", aoPressionar, { capture: true });
      limpar();
    };
  }, [onPingCelula, pontoMundo]);

  // ── Clique no vazio DESSELECIONA — em QUALQUER ferramenta ────────
  //
  // Selecionar um token sempre funcionou em qualquer ferramenta (o
  // `pointerdown` do token chama `onSelecionar` sem olhar qual está
  // ativa). DESselecionar, não: isso morava só na seleção por caixa,
  // que sai cedo fora da Interagir. O resultado era uma assimetria que
  // na mesa lê como bug — dá pra selecionar pintando terreno ou
  // marcando, mas o clique no vazio não solta, e a seleção fica presa
  // até trocar de ferramenta ou apertar Esc.
  //
  // Mesmo desenho do gesto de ping, e pelo mesmo motivo: captura no
  // `<svg>` inteiro, sem `preventDefault`/`stopPropagation`, então ele
  // só OBSERVA — pintar terreno, medir, desenhar área e a própria
  // caixa continuam acontecendo exatamente como antes. Na Interagir
  // isto e a caixa 0×0 chegam à mesma conclusão; chamar duas vezes com
  // a mesma lista vazia é idempotente.
  //
  // Não desseleciona quando: o gesto começou sobre um token ou sobre
  // uma alça (o elemento tem dono), com Shift (alternância), com botão
  // que não seja o esquerdo, ou quando a mão andou além do limiar de
  // arrasto — aí foi arrasto, não clique.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg || !onSelecionarCaixa) return;

    let origem: { x: number; y: number } | null = null;

    function aoPressionar(e: PointerEvent) {
      origem = null;
      if (e.button !== 0 || e.shiftKey) return;
      const alvo = e.target as Element | null;
      // `closest` sobe a árvore SVG normalmente — é o mesmo mecanismo
      // que o menu contextual já usa pra descobrir o token sob o
      // cursor. Alças de área/rotação e imagens têm gesto próprio: um
      // clique nelas não é "clique no vazio".
      if (alvo?.closest?.(".rv-token, .rv-area-alca, .rv-token-alca-rotacao, .rv-imagem-cena")) return;
      origem = { x: e.clientX, y: e.clientY };
    }
    function aoSoltar(e: PointerEvent) {
      const o = origem;
      origem = null;
      if (!o) return;
      if (Math.hypot(e.clientX - o.x, e.clientY - o.y) >= LIMIAR_ARRASTO_PX) return;
      onSelecionarCaixa!([], false);
    }

    // Nomeado, não anônimo: um `pointercancel` registrado com função
    // anônima não tem como ser removido depois — vira listener órfão a
    // cada reinscrição do efeito.
    function cancelar() { origem = null; }

    svg.addEventListener("pointerdown", aoPressionar, { capture: true });
    window.addEventListener("pointerup", aoSoltar);
    window.addEventListener("pointercancel", cancelar);
    window.addEventListener("blur", cancelar);
    return () => {
      svg.removeEventListener("pointerdown", aoPressionar, { capture: true });
      window.removeEventListener("pointerup", aoSoltar);
      window.removeEventListener("pointercancel", cancelar);
      window.removeEventListener("blur", cancelar);
    };
  }, [onSelecionarCaixa]);

  // ── Seleção por caixa ────────────────────────────────────────────
  // Só nasce a partir de um pointerdown no PISO (nunca num token — o
  // token já trata o próprio pointerdown como início de seleção/
  // arrasto). Um clique simples no piso sem arrastar vira "caixa"
  // 0×0 — tratado como deselecionar tudo (nenhum token dentro).
  const [caixa, setCaixa] = useState<{ inicio: { x: number; y: number }; atual: { x: number; y: number }; aditivo: boolean } | null>(null);
  // Espelho síncrono de `caixa` — o motivo é o mesmo de `estadoCenaRef`/
  // `historicoRef` em `VttClient.tsx`: `soltar()`, abaixo, precisa do
  // valor mais RECENTE (com `atual` já atualizado pelo arrasto) num
  // handler nativo de `pointerup`, sem reler `caixa` fechado no closure
  // do efeito (que ficaria preso ao valor de quando o efeito assinou).
  const caixaRef = useRef(caixa);
  useEffect(() => { caixaRef.current = caixa; }, [caixa]);

  const iniciarCaixa = useCallback((e: React.PointerEvent) => {
    // Só botão esquerdo — mesma guarda que toda outra ferramenta já
    // aplica no próprio handler (terreno, ping). Passou despercebido
    // enquanto isto só vivia no piso (`<rect>`, praticamente
    // inalcançável por baixo da grade): agora que a célula da grade
    // também inicia a caixa, um CLIQUE DIREITO (que abre o menu
    // contextual) sem esta guarda também nascia uma seleção-por-caixa
    // por baixo — as duas coisas competindo pelo mesmo gesto.
    if (e.button !== 0) return;
    if (ferramenta !== "interagir" || !onSelecionarCaixa) return;
    const p = pontoMundo(e.clientX, e.clientY);
    if (!p) return;
    setCaixa({ inicio: p, atual: p, aditivo: e.shiftKey });
  }, [ferramenta, onSelecionarCaixa, pontoMundo]);

  useEffect(() => {
    if (!caixa) return;
    function mover(e: PointerEvent) {
      const p = pontoMundo(e.clientX, e.clientY);
      if (!p) return;
      setCaixa((c) => (c ? { ...c, atual: p } : c));
    }
    function soltar() {
      // Lê a caixa MAIS RECENTE via ref e decide FORA do updater — nunca
      // chamar `onSelecionarCaixa` (setState de um componente ALHEIO, o
      // `VttClient`) de dentro do updater funcional de `setCaixa`. Um
      // updater pode ser invocado mais de uma vez pelo React (Strict
      // Mode, renders concorrentes descartados) e inclusive durante a
      // fase de render de outro componente — foi exatamente isso que
      // produziu "Cannot update a component while rendering a different
      // component" assim que clicar no mapa passou a alcançar este
      // caminho de verdade. Mesma disciplina do undo/redo, mais acima
      // neste arquivo: ler o estado atual, decidir, só ENTÃO efeito.
      const c = caixaRef.current;
      setCaixa(null);
      if (!c || !onSelecionarCaixa) return;

      const minCx = Math.min(c.inicio.x, c.atual.x);
      const maxCx = Math.max(c.inicio.x, c.atual.x);
      const minCy = Math.min(c.inicio.y, c.atual.y);
      const maxCy = Math.max(c.inicio.y, c.atual.y);
      // Inclui o token quando a caixa ENCOSTA em qualquer célula da
      // pegada — a célula inteira conta, não só o ponto do centro.
      //
      // Com o teste antigo (centro do hex dentro do retângulo) uma
      // caixa que passava visivelmente por cima de um token não o
      // pegava sempre que o centro dele caía alguns pixels fora: pra
      // quem arrasta, o resultado é "selecionei em volta dele e ele
      // ficou de fora". A regra que a pessoa enxerga é a área coberta,
      // então o teste é área-contra-área: caixa × caixa envolvente da
      // célula (hexágono de ponta pra cima com `TAM` de raio — largura
      // `√3·TAM`, altura `2·TAM`). Aproximar o hexágono pela caixa
      // envolvente inclui de raspão quem só encosta nos cantos
      // vazios, e isso é de propósito: errar PRA MAIS num gesto de
      // laço é o que a mão espera; errar pra menos é o bug.
      const meiaLargura = (Math.sqrt(3) / 2) * TAM;
      // CLIQUE (caixa degenerada, abaixo do limiar de arrasto em
      // unidades do mundo) nunca seleciona por área: um clique no piso
      // é "desselecionar", e um clique num token nem chega aqui (o
      // token trata o próprio pointerdown). Sem esta guarda, a caixa
      // envolvente — generosa de propósito no ARRASTO — faria um
      // clique no vazio a poucos pixels de um token selecioná-lo.
      const arrastou = maxCx - minCx > 0.5 || maxCy - minCy > 0.5;
      const ids = !arrastou ? [] : cena.tokens
        .filter((t) => {
          const pegada = pegadaEfetiva({ categoria: t.tamanho, orientacao: t.orientacao, pegadaPersonalizada: t.pegadaPersonalizada });
          return projetarPegada(t.pos, pegada).some((celula) => {
            const p = hexParaPixel(celula, TAM);
            return p.x + meiaLargura >= minCx && p.x - meiaLargura <= maxCx
              && p.y + TAM >= minCy && p.y - TAM <= maxCy;
          });
        })
        .map((t) => t.id);
      // Clique simples no piso (caixa 0×0, sem token dentro) TEM que
      // desselecionar — é o próprio comentário desta seção, que a
      // guarda antiga (`ids.length > 0`) contradizia na prática: sem
      // token nenhum sob a caixa, a chamada nunca acontecia e a seleção
      // ficava presa até Esc. Só o caso ADITIVO (Shift) continua
      // preservando a seleção atual quando a caixa não pega ninguém —
      // arrastar uma caixa vazia com Shift não deve apagar o que já
      // estava selecionado.
      if (ids.length > 0 || !c.aditivo) onSelecionarCaixa(ids, c.aditivo);
    }
    window.addEventListener("pointermove", mover);
    window.addEventListener("pointerup", soltar);
    return () => {
      window.removeEventListener("pointermove", mover);
      window.removeEventListener("pointerup", soltar);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!caixa]);

  // ── Pan (arrasto do botão direito) ──────────────────────────────
  // Delta em pixels de tela precisa virar delta em unidades do MUNDO —
  // mesma conversão de `pontoMundo`, só que como diferença entre dois
  // pontos convertidos (não dá pra usar `movementX/Y` cru: a escala do
  // CTM muda com zoom e com o quanto o SVG está reduzido pra caber no
  // contêiner).
  const panRef = useRef<{ x: number; y: number } | null>(null);
  // Distingue "botão direito CLICADO" (abre menu contextual) de "botão
  // direito ARRASTADO" (pan) pela distância total percorrida — o
  // mesmo limiar de `LIMIAR_ARRASTO_PX` usado pra distinguir clique de
  // arrasto em qualquer outro gesto deste arquivo.
  const panOrigemRef = useRef<{ x: number; y: number } | null>(null);
  const panDistanciaRef = useRef(0);
  const onPointerDownSvg = useCallback((e: React.PointerEvent) => {
    if (e.button !== 2) return;
    e.preventDefault();
    panOrigemRef.current = { x: e.clientX, y: e.clientY };
    panDistanciaRef.current = 0;
    if (onPan) panRef.current = { x: e.clientX, y: e.clientY };
  }, [onPan]);

  // Espelho síncrono de `pontoMundo` — ele muda de referência a cada
  // tick de pan (depende de `pan.x/y`), e é EXATAMENTE esse tick que
  // este efeito reage. Sem o ref, o efeito reinscreveria os listeners
  // de `window` a cada pixel arrastado: mais que reinscrição
  // desperdiçada, é a receita de um `pointermove` real acionando
  // `mover` de uma instância ANTIGA do listener ainda não limpa (visto
  // em produção: "Maximum update depth exceeded" saindo justamente
  // deste `onPan`). O efeito abaixo agora só depende do que de fato
  // muda por GESTO (`onPan`, `onMenuContextual`) — nunca por PIXEL.
  const pontoMundoRef = useRef(pontoMundo);
  useEffect(() => { pontoMundoRef.current = pontoMundo; }, [pontoMundo]);

  useEffect(() => {
    if (!onPan && !onMenuContextual) return;
    function mover(e: PointerEvent) {
      if (panOrigemRef.current) {
        panDistanciaRef.current = Math.hypot(e.clientX - panOrigemRef.current.x, e.clientY - panOrigemRef.current.y);
      }
      if (!panRef.current || !onPan) return;
      const antes = pontoMundoRef.current(panRef.current.x, panRef.current.y);
      const agora = pontoMundoRef.current(e.clientX, e.clientY);
      panRef.current = { x: e.clientX, y: e.clientY };
      if (antes && agora) onPan!((agora.x - antes.x) * zoom, (agora.y - antes.y) * zoom);
    }
    function soltar(e: PointerEvent) {
      // Botão direito solto sem ter arrastado (praticamente) nada —
      // era um CLIQUE, não um pan: abre o menu contextual no que
      // estiver sob o cursor (token ou célula vazia).
      if (onMenuContextual && panOrigemRef.current && panDistanciaRef.current < LIMIAR_ARRASTO_PX) {
        const alvo = document.elementFromPoint(e.clientX, e.clientY);
        const tokenId = alvo?.closest(".rv-token")?.getAttribute("data-token-id") ?? null;
        const p = pontoMundoRef.current(e.clientX, e.clientY);
        const hex = p ? pixelParaHex(p.x, p.y, TAM) : { q: 0, r: 0 };
        onMenuContextual({ clientX: e.clientX, clientY: e.clientY, tokenId, hex });
      }
      panRef.current = null;
      panOrigemRef.current = null;
    }
    window.addEventListener("pointermove", mover);
    window.addEventListener("pointerup", soltar);
    return () => {
      window.removeEventListener("pointermove", mover);
      window.removeEventListener("pointerup", soltar);
    };
    // `pontoMundo` de propósito FORA desta lista — ver o comentário do
    // `pontoMundoRef` acima. `zoom` fica: não muda por pixel de pan
    // (só pela roda), então não gera a mesma reinscrição por tick.
  }, [onPan, onMenuContextual, zoom]);

  // ── Zoom pela roda do mouse/trackpad ─────────────────────────────
  // Listener NATIVO (não `onWheel` do React) — o listener sintético do
  // React pro evento wheel é registrado como passivo por padrão desde o
  // React 17 (evita o aviso do Chrome sobre listeners de scroll lentos),
  // e `preventDefault()` dentro de um listener passivo é ignorado
  // silenciosamente. Sem isso, a página por trás do mapa poderia rolar
  // junto com o zoom em navegadores/layouts onde `.rv-palco` não
  // bloqueia o scroll sozinho.
  //
  // `deltaY` bruto do navegador varia MUITO por dispositivo: um mouse
  // manda poucos eventos com `deltaY` grande (~100-120 por "clique" da
  // roda); um trackpad manda DEZENAS de eventos pequenos e contínuos
  // por gesto. `deltaMode` também muda a UNIDADE (pixels/linhas/
  // páginas) dependendo do navegador e sistema operacional. Aplicar
  // `deltaY` cru — como a versão anterior fazia, ignorando tudo isso e
  // só olhando o SINAL — é o que deixava o zoom "nervoso": mesma
  // sensibilidade nominal, mas um gesto de trackpad disparava dezenas
  // de incrementos onde um clique de mouse disparava um só.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg || !onWheelZoom) return;
    function aoRolar(e: WheelEvent) {
      e.preventDefault();
      const p = pontoMundo(e.clientX, e.clientY);
      if (!p) return;
      onWheelZoom!(normalizarDeltaWheel(e), p);
    }
    svg.addEventListener("wheel", aoRolar, { passive: false });
    return () => svg.removeEventListener("wheel", aoRolar);
  }, [onWheelZoom, pontoMundo]);

  /**
   * Hover do botão de edição rápida — geometria REAL de cada área
   * (`pontoDentroDaRegiao`), nunca a caixa envolvente nem só o
   * contorno. Ouvido em FASE DE BOLHA no `<svg>` inteiro: nunca
   * intercepta nada por baixo (token, pan, seleção por caixa,
   * criação de área) — só OBSERVA a posição depois que o alvo real do
   * evento já foi processado normalmente. Ativo com "areas" ou
   * "interagir"; qualquer outra ferramenta não calcula hover nenhum
   * (e o botão nunca aparece, por construção).
   *
   * Sobreposição: itera na ORDEM recebida e fica com o ÚLTIMO match —
   * mesma ordem de pintura de `CamadaAreas` (quem é desenhado por
   * cima, "ganha"), resultado sempre determinístico pro mesmo estado.
   */
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg || !onHoverAreaEditavel) return;
    // Fora de Áreas/Interagir: nunca calcula hover — e LIMPA o que
    // sobrou de antes, senão trocar de ferramenta e voltar sem mover o
    // mouse reexibiria um hover que já não é mais real.
    if (ferramenta !== "areas" && ferramenta !== "interagir") { onHoverAreaEditavel(null); return; }
    const areas = areasParaHover ?? [];
    if (areas.length === 0) { onHoverAreaEditavel(null); return; }

    function aoMover(e: PointerEvent) {
      const p = pontoMundo(e.clientX, e.clientY);
      if (!p) { onHoverAreaEditavel!(null); return; }
      let achado: string | null = null;
      for (const a of areas) {
        if (pontoDentroDaRegiao(p, a.regiao, TOLERANCIA_HOVER_MUNDO)) achado = a.id;
      }
      onHoverAreaEditavel!(achado);
    }
    // O ponteiro pode sair do `<svg>` de vez (pra cima da barra de
    // ferramentas, do painel de Áreas, da trilha…) sem NUNCA gerar
    // outro `pointermove` sobre uma célula vazia — sem isto o hover
    // ficaria PRESO na última área sob o cursor pra sempre.
    function aoSair() { onHoverAreaEditavel!(null); }
    svg.addEventListener("pointermove", aoMover);
    svg.addEventListener("pointerleave", aoSair);
    return () => {
      svg.removeEventListener("pointermove", aoMover);
      svg.removeEventListener("pointerleave", aoSair);
    };
  }, [ferramenta, areasParaHover, onHoverAreaEditavel, pontoMundo]);

  // ── Medir (pressionar, arrastar, soltar) ─────────────────────────
  // Máquina de estados explícita (ver `EstadoMedicao`): ociosa →
  // pressionada → medindo → concluída. `pressionada` nunca renderiza
  // nada — só vira visível (`medindo`) depois de cruzar o limiar de
  // arraste (`LIMIAR_ARRASTO_PX` em tela OU mudança de hexágono). Isso
  // sozinho resolve dois pedidos ao mesmo tempo: um clique simples
  // nunca desenha marcador (nunca sai de `pressionada`), e um clique
  // simples sobre uma régua CONCLUÍDA a apaga sem criar outra — todo
  // pointerdown novo entra em `pressionada`, o que já limpa a régua
  // antiga da tela (`medicaoAtiva` abaixo só considera `medindo`/
  // `concluida`), e como o clique não cruza o limiar, o gesto termina
  // em `ociosa` sem nunca ter mostrado nada novo.
  const [estadoMedicao, setEstadoMedicao] = useState<EstadoMedicao>({ fase: "ociosa" });
  // Espelha `estadoMedicao` pra ser lido de dentro de callbacks/efeitos
  // com deps enxutas (`iniciarMedicao`, a troca de ferramenta) sem
  // precisar reinscrevê-los a cada tick da régua.
  const estadoMedicaoRef = useRef(estadoMedicao);
  useEffect(() => { estadoMedicaoRef.current = estadoMedicao; }, [estadoMedicao]);

  // Dedupe de persistência: a MESMA régua (mesma sequência de pontos)
  // nunca é gravada duas vezes, seja ela concluída por `Enter` (efeito
  // abaixo) seja INTERROMPIDA por um gesto novo ou troca de ferramenta
  // (chamadas diretas logo abaixo) — os dois caminhos compartilham
  // este ref e esta função.
  const medicaoConcluidaRef = useRef<string | null>(null);
  const tentarPersistirPontos = useCallback((pontos: Hex[]) => {
    if (pontos.length < 2) return;
    const calc = medir(pontos, terrenoParaRota);
    if (calc.metros === 0) return;
    const chave = pontos.map((p) => `${p.q},${p.r}`).join("|");
    if (medicaoConcluidaRef.current === chave) return;
    medicaoConcluidaRef.current = chave;
    onMedicaoConcluida?.(pontos);
  }, [terrenoParaRota, onMedicaoConcluida]);

  const iniciarMedicao = useCallback((h: Hex, clientX: number, clientY: number, botao: number) => {
    if (ferramenta !== "medir" || botao !== 0) return;
    // Uma medição com dobra que ficou "livre" (botão solto, esperando
    // Enter) e nunca foi concluída seria descartada em silêncio ao
    // começar o gesto seguinte — persiste ela primeiro, exatamente
    // como se o usuário tivesse apertado Enter antes de clicar de novo.
    const anterior = estadoMedicaoRef.current;
    if (anterior.fase === "medindo") tentarPersistirPontos(pontosDaMedicao(anterior));
    setEstadoMedicao({ fase: "pressionada", origem: h, inicioPx: { x: clientX, y: clientY } });
  }, [ferramenta, tentarPersistirPontos]);

  useEffect(() => {
    if (estadoMedicao.fase !== "pressionada" && estadoMedicao.fase !== "medindo") return;
    function mover(e: PointerEvent) {
      const p = pontoMundo(e.clientX, e.clientY);
      if (!p) return;
      const hexAtual = pixelParaHex(p.x, p.y, TAM);
      setEstadoMedicao((s) => {
        if (s.fase === "pressionada") {
          return cruzouLimiar(s, hexAtual, { x: e.clientX, y: e.clientY }, LIMIAR_ARRASTO_PX)
            ? comecarAMedir(s, hexAtual)
            : s;
        }
        return moverPonta(s, hexAtual);
      });
    }
    // Soltar com dobras fixadas NÃO encerra: `soltarBotao` mantém a
    // medição viva em modo livre, pra atravessar o mapa (com zoom/pan)
    // sem manter o botão pressionado. Sem dobra nenhuma conclui, que é
    // o gesto de clicar-arrastar-soltar de sempre, intacto.
    function soltar() { setEstadoMedicao(soltarBotao); }
    window.addEventListener("pointermove", mover);
    window.addEventListener("pointerup", soltar);
    return () => {
      window.removeEventListener("pointermove", mover);
      window.removeEventListener("pointerup", soltar);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estadoMedicao.fase, pontoMundo]);

  // UM listener de teclado para qualquer estado não-ocioso — nunca
  // vários divergentes competindo pelo mesmo evento. Todos respeitam
  // foco editável pelo mesmo motivo que o controlador global da barra
  // já respeita (`VttClient`): tecla digitada num campo de texto não
  // pode mexer numa régua no mapa por baixo.
  //
  // `Q`/`Backspace` são o MESMO par do arrasto de token (fixar marco /
  // desfazer o último) — de propósito: quem aprendeu um já sabe o
  // outro. `Enter` conclui, `Esc` descarta.
  useEffect(() => {
    if (estadoMedicao.fase === "ociosa") return;
    function tecla(e: KeyboardEvent) {
      if (elementoEhEditavel(document.activeElement as HTMLElement | null)) return;
      if (e.key === "Escape") { setEstadoMedicao({ fase: "ociosa" }); return; }
      if (e.key === "Enter") {
        // `preventDefault` porque Enter, com foco em algum botão da
        // barra, dispararia aquele botão junto com concluir a régua.
        e.preventDefault();
        setEstadoMedicao(concluirMedicao);
        return;
      }
      if (e.key.toLowerCase() === "q") { setEstadoMedicao(fixarDobra); return; }
      if (e.key === "Backspace") {
        // Sem `preventDefault` o Backspace pode navegar pra trás em
        // alguns navegadores — e perder a cena inteira no meio de uma
        // medição seria um estrago bem maior que o atalho.
        e.preventDefault();
        setEstadoMedicao(removerUltimaDobra);
      }
    }
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [estadoMedicao.fase]);

  // Trocar de ferramenta sempre limpa — inclusive voltando pra "medir"
  // numa sessão nova, nunca deixando régua fantasma de antes. Mesma
  // regra de `iniciarMedicao`: uma régua com dobra "livre" (esperando
  // Enter) é persistida antes de limpar, nunca descartada em silêncio.
  useEffect(() => {
    if (ferramenta === "medir") return;
    const atual = estadoMedicaoRef.current;
    if (atual.fase === "medindo") tentarPersistirPontos(pontosDaMedicao(atual));
    setEstadoMedicao({ fase: "ociosa" });
  }, [ferramenta, tentarPersistirPontos]);

  // ── Prévia do pincel de terreno ──────────────────────────────────
  // Só a CÉLULA sob o cursor entra em estado (atualizada no
  // `onMouseEnter` de cada célula, nunca no `onMouseMove`): o disco
  // inteiro é derivado dela por `useMemo`, então mexer o mouse dentro
  // da mesma célula não recalcula nem re-renderiza nada.
  const [celulaSobCursor, setCelulaSobCursor] = useState<Hex | null>(null);
  const previaPincel = useMemo(() => {
    if (previaPincelRaio == null || !celulaSobCursor) return null;
    const dentro = (h: Hex) => {
      if (h.r < 0 || h.r >= cena.altura) return false;
      const qMin = -Math.floor(h.r / 2);
      return h.q >= qMin && h.q < qMin + cena.largura;
    };
    return new Set(hexNoRaio(celulaSobCursor, previaPincelRaio).filter(dentro).map(hexKey));
  }, [previaPincelRaio, celulaSobCursor, cena.largura, cena.altura]);

  // Trocar de ferramenta (ou desligar a prévia) limpa o cursor — sem
  // isto a última célula apontada ficaria "presa" ao voltar pro modo.
  useEffect(() => {
    if (previaPincelRaio == null) setCelulaSobCursor(null);
  }, [previaPincelRaio]);

  const medicaoAtiva = estadoMedicao.fase === "medindo" || estadoMedicao.fase === "concluida" ? estadoMedicao : null;
  // `medir()` já monta rota multi-ponto (segmento a segmento, com
  // totais) — a régua só decide QUAIS pontos entram; o cálculo de
  // distância/custo/bloqueio continua sendo o mesmo do movimento.
  //
  // Memoizados de propósito: os dois ALOCAM, e o resultado alimenta um
  // efeito que avisa o painel. Sem memo, cada render produziria uma
  // referência nova, o efeito dispararia sempre e o `setState` do pai
  // realimentaria o render — laço infinito, não só desperdício.
  const pontosMedicao = useMemo(
    () => (medicaoAtiva ? pontosDaMedicao(medicaoAtiva) : null),
    [medicaoAtiva],
  );
  const medicaoCalc = useMemo(
    () => (pontosMedicao ? medir(pontosMedicao, terrenoParaRota) : null),
    [pontosMedicao, terrenoParaRota],
  );
  // Sugestão de cobertura: qual objeto cruzado pela régua dá o MAIOR
  // grau de cobertura — só sugestão, o narrador confirma ou substitui
  // (nunca aplicado sozinho). Ignora as duas pontas da linha
  // (atacante/alvo não são cobertura de si mesmos), olha só o MEIO.
  // `useMemo`'d: sem isto, recalculava a cada render (não só a cada
  // tick do arrasto — também em re-renders de qualquer outra coisa,
  // ex. outro jogador movendo token, comuns numa mesa ativa).
  const coberturaSugerida = useMemo<ObjetoCena | null>(() => {
    if (!pontosMedicao || pontosMedicao.length < 2) return null;
    // Com dobras, a "linha de tiro" é a reta entre as PONTAS da régua
    // (primeiro e último ponto) — não o caminho dobrado. Cobertura é
    // sobre o que está entre atirador e alvo; as dobras são o trajeto
    // percorrido, e um obstáculo contornado por elas não cobre nada.
    const de = pontosMedicao[0];
    const para = pontosMedicao[pontosMedicao.length - 1];
    const celulasMeio = hexLinha(de, para).slice(1, -1);
    if (celulasMeio.length === 0) return null;
    const chavesMeio = new Set(celulasMeio.map(hexKey));
    let melhor: ObjetoCena | null = null;
    for (const o of cena.objetos) {
      if (!o.celulas.some((c) => chavesMeio.has(hexKey(c)))) continue;
      if (!melhor || ORDEM_GRAU[o.grau] > ORDEM_GRAU[melhor.grau]) melhor = o;
    }
    return melhor;
  }, [pontosMedicao, cena.objetos]);

  // ── Ponte régua → painel ─────────────────────────────────────────
  // O painel (`PainelMedir`, em `VttClient`) mostra total e trechos,
  // mas NÃO tem uma cópia da máquina de estados: recebe o resumo já
  // calculado. Duplicar o estado lá é exatamente o tipo de "segunda
  // implementação da mesma coisa" que divergiria na primeira mudança.
  //
  // Só avisa quando o CONTEÚDO muda, não quando a referência muda —
  // cinto e suspensório sobre os `useMemo` acima: o painel nunca
  // recebe um update redundante, aconteça o que acontecer no render.
  const ultimoResumoRef = useRef<string | null>(null);
  useEffect(() => {
    if (!onMedicaoMudou) return;
    const resumo = medicaoCalc && medicaoAtiva
      ? {
          trechos: medicaoCalc.rota.segmentos.map((s) => s.distancia),
          metros: medicaoCalc.metros,
          custo: medicaoCalc.custo,
          atravessaBloqueio: medicaoCalc.atravessaBloqueio,
          dobras: totalDobras(medicaoAtiva),
          // Os PONTOS vêm junto pra quem chama poder transmitir a régua
          // ao vivo ("instantânea + pra mesa", migration 0128) sem
          // precisar de um segundo canal de aviso a cada movimento —
          // este resumo já muda exatamente quando a régua muda, e o
          // dedupe abaixo já evita repetir o que não mudou.
          pontos: pontosDaMedicao(medicaoAtiva),
        }
      : null;
    const chave = resumo ? JSON.stringify(resumo) : null;
    if (chave === ultimoResumoRef.current) return;
    ultimoResumoRef.current = chave;
    onMedicaoMudou(resumo);
  }, [medicaoCalc, medicaoAtiva, onMedicaoMudou]);

  // Persistência do modo "Permanente" — via `Enter` (fase vira
  // `concluida` de propósito). O reset do dedupe pra `null` sempre que
  // a fase SAI de `concluida` é o que permite medir de novo o mesmo
  // trajeto exato mais tarde sem ser tratado como duplicata: tanto
  // `iniciarMedicao` quanto a troca de ferramenta levam a fase pra
  // longe de `concluida`/`medindo` (`pressionada`/`ociosa`), o que já
  // dispara este reset ANTES do próximo gesto poder colidir.
  useEffect(() => {
    if (!medicaoAtiva || medicaoAtiva.fase !== "concluida") { medicaoConcluidaRef.current = null; return; }
    tentarPersistirPontos(pontosDaMedicao(medicaoAtiva));
    // "Instantânea" não persiste — a régua concluída não tem mais
    // função nenhuma na tela, então some IMEDIATAMENTE, em vez de
    // esperar o próximo gesto/troca de ferramenta pra ser limpa.
    // "Permanente" fica como estava: some só quando `onMedicaoConcluida`
    // confirmar a gravação e a camada de réguas persistidas assumir —
    // sumir daqui na mesma hora abriria um intervalo sem nada visível
    // até o servidor responder.
    if (modoMedicao?.duracao !== "permanente") setEstadoMedicao({ fase: "ociosa" });
  }, [medicaoAtiva, tentarPersistirPontos, modoMedicao]);

  // ── Hint unificada de mapa (hover) ────────────────────────────────
  // Coordenadas de TELA — a hint é renderizada como HTML
  // `position: fixed` FORA do `<svg>` (ver o retorno do componente),
  // de propósito: dentro do `<g>` com `scale(zoom)` o texto encolheria/
  // cresceria junto com o mapa; como elemento HTML irmão do svg, o
  // tamanho da fonte é sempre o mesmo, em qualquer nível de zoom. Um
  // único estado compartilhado por token/objeto/terreno garante nunca
  // mostrar duas hints ao mesmo tempo — a prioridade (token > objeto >
  // terreno funcional > terreno decorativo > nada) nasce da própria
  // ordem de pintura no DOM: cada camada só recebe o ponteiro quando
  // nada acima dela o está bloqueando, sem lógica de prioridade
  // explícita nem `pointer-events: none` em token/objeto.
  const [hint, setHint] = useState<HintMapa | null>(null);

  // Pan/zoom deslocam o MUNDO sob um cursor parado — nenhum dos dois
  // dispara mouseenter/mousemove nos elementos do SVG (só o conteúdo
  // visual se move, não o ponteiro), então uma hint mostrada antes do
  // gesto ficaria presa numa posição/célula que não é mais a de baixo
  // do cursor. Mais simples e robusto que recalcular "o que há agora
  // sob o cursor": só limpar.
  useEffect(() => { setHint(null); }, [pan.x, pan.y, zoom]);

  const hintParaCelula = useCallback((c: Hex): Omit<HintMapa, "x" | "y"> | null => {
    const real = terrenoReal?.get(hexKey(c));
    if (real === "dificil") return { titulo: "Terreno difícil", efeito: "Custa o dobro do deslocamento." };
    if (real === "bloqueado") return { titulo: "Área bloqueada", efeito: "Não permite movimento." };
    return null;
  }, [terrenoReal]);

  // ── Ferramenta Áreas — conversão de coordenada e captura de ponteiro
  // Estado LOCAL mínimo: só QUAL alça está sendo arrastada. A geometria
  // em si vive no dono do estado da ferramenta (`VttClient`), que é
  // quem sabe validar e persistir — este componente nunca decide nada
  // sobre a área, só traduz posição de ponteiro.
  const alcaAtivaRef = useRef<string | null>(null);
  const gestoAreaRef = useRef(false);

  const axialDoEvento = useCallback((clientX: number, clientY: number): PontoAxial | null => {
    const p = pontoMundo(clientX, clientY);
    if (!p) return null;
    return mundoParaAxial(p.x, p.y, TAM);
  }, [pontoMundo]);

  const areaPointerDown = useCallback((e: React.PointerEvent) => {
    // Só botão esquerdo cria. O direito continua inteiro com o pan e o
    // menu contextual (ouvidos no `<svg>`/`window`), sem competição.
    if (!areasInteracao || e.button !== 0) return;
    const axial = axialDoEvento(e.clientX, e.clientY);
    if (!axial) return;
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    gestoAreaRef.current = true;
    areasInteracao.onPressionar(axial, { x: e.clientX, y: e.clientY }, { altKey: e.altKey, metaKey: e.metaKey, pointerId: e.pointerId });
  }, [areasInteracao, axialDoEvento]);

  const areaPointerMove = useCallback((e: React.PointerEvent) => {
    if (!areasInteracao) return;
    const axial = axialDoEvento(e.clientX, e.clientY);
    if (!axial) return;
    areasInteracao.onMover(axial, { x: e.clientX, y: e.clientY }, { altKey: e.altKey, metaKey: e.metaKey });
  }, [areasInteracao, axialDoEvento]);

  const areaPointerUp = useCallback((e: React.PointerEvent) => {
    if (!areasInteracao) return;
    if ((e.currentTarget as Element).hasPointerCapture?.(e.pointerId)) {
      (e.currentTarget as Element).releasePointerCapture(e.pointerId);
    }
    if (!gestoAreaRef.current) return;
    gestoAreaRef.current = false;
    const axial = axialDoEvento(e.clientX, e.clientY);
    if (axial) areasInteracao.onSoltar(axial);
  }, [areasInteracao, axialDoEvento]);

  // `pointercancel` / perda de captura: gesto interrompido pelo
  // sistema, nunca uma confirmação — encerra sem criar nada.
  const areaPointerCancel = useCallback(() => {
    if (!areasInteracao) return;
    gestoAreaRef.current = false;
    areasInteracao.onCancelarGesto();
  }, [areasInteracao]);

  const alcaPointerDown = useCallback((id: string, e: React.PointerEvent) => {
    if (!onAreaAlcaMover) return;
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    alcaAtivaRef.current = id;
  }, [onAreaAlcaMover]);

  const alcaPointerMove = useCallback((e: React.PointerEvent) => {
    const id = alcaAtivaRef.current;
    if (!id || !onAreaAlcaMover) return;
    const axial = axialDoEvento(e.clientX, e.clientY);
    // Lido do EVENTO atual — mesma regra do arrasto de criação, nunca
    // um listener de teclado global que possa ficar preso.
    if (axial) onAreaAlcaMover(id, axial, e.altKey || e.metaKey);
  }, [onAreaAlcaMover, axialDoEvento]);

  const alcaPointerUp = useCallback((e: React.PointerEvent) => {
    if ((e.currentTarget as Element).hasPointerCapture?.(e.pointerId)) {
      (e.currentTarget as Element).releasePointerCapture(e.pointerId);
    }
    if (!alcaAtivaRef.current) return;
    alcaAtivaRef.current = null;
    onAreaAlcaSoltar?.();
  }, [onAreaAlcaSoltar]);

  const alcaPointerCancel = useCallback(() => {
    if (!alcaAtivaRef.current) return;
    alcaAtivaRef.current = null;
    onAreaAlcaCancelar?.();
  }, [onAreaAlcaCancelar]);

  /**
   * Âncora dos botões contextuais: MUNDO → TELA. Recalculada quando a
   * âncora, o zoom ou o pan mudam — é o que faz o grupo de botões
   * acompanhar o mapa em vez de ficar preso numa coordenada morta.
   */
  useEffect(() => {
    if (!onAncoraAcoesTela) return;
    if (!areasAncoraAcoes) { onAncoraAcoesTela(null); return; }
    const svg = svgRef.current;
    const ctm = svg?.getScreenCTM();
    if (!svg || !ctm) { onAncoraAcoesTela(null); return; }
    const pt = svg.createSVGPoint();
    pt.x = areasAncoraAcoes.x * zoom + pan.x;
    pt.y = areasAncoraAcoes.y * zoom + pan.y;
    const tela = pt.matrixTransform(ctm);
    onAncoraAcoesTela({ x: tela.x, y: tela.y });
  }, [areasAncoraAcoes?.x, areasAncoraAcoes?.y, zoom, pan.x, pan.y, onAncoraAcoesTela, areasAncoraAcoes]);

  /**
   * Conversor MUNDO → TELA reutilizável pros botões de edição rápida —
   * pode haver mais de um simultâneo (seleção + hover), então em vez de
   * converter UMA âncora este efeito expõe a FUNÇÃO de conversão em si;
   * quem chama converte quantas âncoras precisar, cada botão com a sua
   * posição independente. Reconstruída sempre que zoom/pan/CTM mudam —
   * mesma regra de recálculo de `onAncoraAcoesTela` acima.
   */
  useEffect(() => {
    if (!onConversorEdicaoRapidaTela) return;
    const svg = svgRef.current;
    const ctm = svg?.getScreenCTM();
    if (!svg || !ctm) { onConversorEdicaoRapidaTela(null); return; }
    onConversorEdicaoRapidaTela((mundo: { x: number; y: number }) => {
      const pt = svg.createSVGPoint();
      pt.x = mundo.x * zoom + pan.x;
      pt.y = mundo.y * zoom + pan.y;
      const tela = pt.matrixTransform(ctm);
      return { x: tela.x, y: tela.y };
    });
  }, [zoom, pan.x, pan.y, onConversorEdicaoRapidaTela]);

  /**
   * Conversor TELA → HEX (ver a prop). Reconstruído junto com o de
   * cima, pelas mesmas dependências — `pontoMundo` já embute zoom/pan,
   * e o CTM muda com o layout.
   */
  useEffect(() => {
    if (!onConversorHexDaTela) return;
    onConversorHexDaTela((clientX: number, clientY: number) => {
      const p = pontoMundo(clientX, clientY);
      return p ? pixelParaHex(p.x, p.y, TAM) : null;
    });
    return () => onConversorHexDaTela(null);
  }, [pontoMundo, onConversorHexDaTela]);

  // Desmontar (ou trocar de ferramenta) com um gesto em curso não pode
  // deixar estado pendurado no dono da ferramenta.
  useEffect(() => {
    if (areasInteracao?.ativa) return;
    gestoAreaRef.current = false;
    alcaAtivaRef.current = null;
  }, [areasInteracao?.ativa]);

  return (
    <>
    <svg
      ref={svgRef}
      className="rv-mapa"
      viewBox={`${minX} ${minY} ${maxX - minX} ${maxY - minY}`}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label={`Mapa da cena ${cena.nome}, grade hexagonal de ${cena.largura} por ${cena.altura} metros`}
      onPointerDown={onPointerDownSvg}
      onContextMenu={(e) => { if (onPan || onMenuContextual) e.preventDefault(); }}
    >
      <defs>
        {/* Piso: gradiente + ruído. É o que evita o "cinza vazio". */}
        {/* Piso da cena — NAVY bem escuro, não preto neutro. O cinza
            anterior (#1a222c→#0a0e14) lia como "sem cor" ao lado do
            chrome da mesa, que é navy inteiro (`--rv-line`,
            `--rv-panel`): a mesa parecia dois materiais diferentes.
            Mesma escada de luminosidade de antes (claro no foco,
            escuro na borda) — só o matiz mudou. */}
        <radialGradient id="rv-piso" cx="42%" cy="34%" r="78%">
          <stop offset="0%" stopColor="#17243a" />
          <stop offset="55%" stopColor="#101a2c" />
          <stop offset="100%" stopColor="#080f1e" />
        </radialGradient>
        <filter id="rv-ruido" x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="3" seed="7" result="n" />
          <feColorMatrix type="saturate" values="0" in="n" result="ng" />
          <feComponentTransfer in="ng" result="na">
            <feFuncA type="linear" slope="0.055" intercept="0" />
          </feComponentTransfer>
          <feComposite operator="over" in="na" in2="SourceGraphic" />
        </filter>
        <pattern id="rv-hachura" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(35)">
          <line x1="0" y1="0" x2="0" y2="6" stroke="#f5a200" strokeWidth="1.4" opacity="0.5" />
        </pattern>
        <pattern id="rv-jammer" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(-20)">
          <line x1="0" y1="0" x2="0" y2="8" stroke="#ff5f74" strokeWidth="1.2" opacity="0.42" />
        </pattern>
        <filter id="rv-brilho" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="3.2" result="b" />
          <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <linearGradient id="rv-elevado" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#2b3a46" />
          <stop offset="100%" stopColor="#1a242c" />
        </linearGradient>
        {/* Terreno REAL (persistido) — hachura mais grossa e cor mais
            saturada que a decorativa, pra ler como "isto é funcional". */}
        <pattern id="rv-dificil-real" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="7" height="7" fill="rgba(245,162,0,0.1)" />
          <line x1="0" y1="0" x2="0" y2="7" stroke="#f5a200" strokeWidth="2" opacity="0.7" />
        </pattern>
        <pattern id="rv-bloqueado-real" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="8" height="8" fill="rgba(255,95,116,0.14)" />
          <line x1="0" y1="0" x2="0" y2="8" stroke="#ff5f74" strokeWidth="2" opacity="0.75" />
        </pattern>
      </defs>

      <g transform={`translate(${pan.x} ${pan.y}) scale(${zoom})`}>
        {/* ── FORA DA GRADE ────────────────────────────────────────
            Superfície transparente muito maior que o piso, PRIMEIRA
            de todas (nada fica escondido atrás dela — tudo é desenhado
            por cima). Existe por um motivo só: a seleção por caixa
            nascia apenas no piso e nas células da grade, então o vazio
            em volta não iniciava gesto nenhum — e é exatamente ali que
            ficam os tokens que a grade deixou pra trás ao encolher.
            Sem isto, laçar quem está fora da grade só funcionava
            começando o arrasto DE DENTRO dela.

            A folga acompanha o tamanho do mundo em vez de um número
            fixo: o que precisa ser alcançável é "o entorno do mapa",
            e num mapa grande isso é proporcionalmente maior. Nunca
            atrapalha pan (botão direito — `iniciarCaixa` só reage ao
            esquerdo) nem as ferramentas que têm superfície própria
            mais acima (Áreas), e em qualquer ferramenta que não seja
            Interagir ela nem recebe handler. */}
        <rect
          className="rv-fora-da-grade"
          x={minX - folgaFora} y={minY - folgaFora}
          width={maxX - minX + folgaFora * 2} height={maxY - minY + folgaFora * 2}
          fill="transparent"
          onPointerDown={ferramenta === "interagir" && onSelecionarCaixa ? iniciarCaixa : undefined}
        />

        {/* ── Piso ─────────────────────────────────────────────── */}
        <rect x={minX} y={minY} width={maxX - minX} height={maxY - minY} fill="url(#rv-piso)"
          onPointerDown={onSelecionarCaixa ? iniciarCaixa : undefined} />
        <rect x={minX} y={minY} width={maxX - minX} height={maxY - minY} filter="url(#rv-ruido)" fill="none" />
        {/* Aqui viviam duas elipses de "mancha de umidade/óleo do
            pátio". Removidas: os raios eram FIXOS em unidades de mundo
            (280×190 e 200×140), então a mesma decoração era um borrão
            discreto numa cena grande e cobria quase o mapa inteiro numa
            pequena — e o efeito colateral era pior que o enfeite, porque
            sombra sem significado num mapa tático compete com as sombras
            que SIGNIFICAM (terreno difícil, área de efeito, atenuação de
            camada). O piso continua tendo variação de luz pela vinheta
            do próprio gradiente `rv-piso`, que é regular e centrada. */}

        {/* ── IMAGENS (abaixo da grade) ── o caso normal: a planta é o
            chão, e grade/terreno/tokens se apoiam nela. Fica DEPOIS do
            piso porque o piso é o "cinza vazio" que ela substitui, e
            ANTES da grade porque a grade precisa continuar legível por
            cima de qualquer mapa. ─────────────────────────────────── */}
        <CamadaImagens
          imagens={imagensDesenhaveis} camada="abaixo_grade" tamanhoCelula={TAM}
          urls={urlsImagens ?? {}}
          // `cOculta`, não `cVisivel`: para o narrador `cVisivel` já
          // devolve `true` de propósito (o mapa separa "desenhar" de
          // "atenuar", e quem atenua é `cAtenuacao`). A camada de
          // imagens faz as duas coisas junto — precisa do estado CRU
          // pra decidir entre sumir (jogador) e virar fantasma
          // (narrador).
          visivelFundo={!cOculta("imagemFundo")}
          visivelTiles={!cOculta("tiles")}
          ehNarrador={verCamadasOcultas === true}
          ferramentaAtiva={ferramenta === "imagens"}
          bloqueadaFundo={cBloqueada("imagemFundo")}
          bloqueadaTiles={cBloqueada("tiles")}
          selecionadaId={imagemSelecionadaId ?? null}
          onSelecionar={onSelecionarImagem}
          onPressionarCorpo={(id, e) => pressionarImagem(id, null, e)}
          onPressionarCanto={(id, canto, e) => pressionarImagem(id, canto, e)}
          onPressionarGiro={(id, e) => pressionarImagem(id, "girar", e)}
        />

        {/* ── Grade ── visibilidade é só opacidade (nunca `display:none`
            nem tira o `<path>` da árvore): Medir/pintura de terreno
            continuam funcionando através da grade mesmo "oculta" — a
            camada existe pra decluttering visual, não pra desligar
            interação (isso é o que o bloqueio de camada faz, campo
            separado). ─────────────────────────────────────────── */}
        <g
          className={`rv-camada-grade${cVisivel("grade") ? "" : " rv-camada-grade--oculta"}`}
          /* A grade cobre o mapa INTEIRO e é irmã (posterior) da camada
             de imagens de fundo: com a ferramenta Imagens ativa era ela
             quem recebia o pointerdown, e a imagem embaixo nunca via o
             gesto — dava pra selecionar pela alça, mas não pra arrastar
             o corpo. Sob Imagens a grade não tem nenhum gesto próprio,
             então deixá-la transparente ao ponteiro não custa nada. */
          pointerEvents={ferramenta === "imagens" ? "none" : undefined}
          // Sair da grade inteira apaga a prévia — sem isto o disco
          // ficava desenhado na última célula depois do cursor já ter
          // ido pro painel ou pra fora do mapa.
          onMouseLeave={previaPincelRaio != null ? () => setCelulaSobCursor(null) : undefined}
        >
          {celulas.map((c) => {
            const p = hexParaPixel(c, TAM);
            const realce = realceSet.has(hexKey(c));
            const noPreview = celulasPreview?.has(hexKey(c)) ?? false;
            const noPincel = previaPincel?.has(hexKey(c)) ?? false;
            return (
              <path
                key={hexKey(c)}
                d={dHex}
                transform={`translate(${p.x} ${p.y})`}
                className={`rv-celula${realce ? ` rv-celula--realce rv-celula--${tipoRealce ?? "alcance"}` : ""}${noPreview ? " rv-celula--rota" : ""}${noPincel ? " rv-celula--pincel" : ""}`}
                onClick={onClicarCelula ? () => onClicarCelula(c) : undefined}
                onPointerDown={
                  (ferramenta === "terreno" || ferramenta === "objetos") && onPressCelula && !cBloqueada("terrenoFuncional")
                    ? (e) => { if (e.button !== 0) return; setPintando(true); onPressCelula(c); }
                    : ferramenta === "medir"
                      ? (e) => iniciarMedicao(c, e.clientX, e.clientY, e.button)
                      // Interagir: a célula precisa do MESMO início de
                      // seleção-por-caixa que o piso já tem
                      // (`iniciarCaixa`). Sem isto, clicar/arrastar
                      // sobre uma célula da grade — que é quase todo o
                      // mapa — nunca chegava no piso por baixo (são
                      // elementos IRMÃOS, o pointerdown não sobe de um
                      // pro outro), e não havia como desselecionar sem
                      // Esc.
                      : ferramenta === "interagir" && onSelecionarCaixa
                        ? iniciarCaixa
                        : undefined
                }
                onPointerEnter={
                  (ferramenta === "terreno" || ferramenta === "objetos") && pintando && onEntrarCelulaPintando && !cBloqueada("terrenoFuncional")
                    ? () => onEntrarCelulaPintando(c)
                    : undefined
                }
                onMouseEnter={(e) => {
                  const hh = hintParaCelula(c);
                  if (hh) setHint({ ...hh, x: e.clientX, y: e.clientY });
                  if (previaPincelRaio != null) setCelulaSobCursor((a) => (a && hexIguais(a, c) ? a : c));
                }}
                // Mover DENTRO da célula também abre a hint, não só
                // reposiciona uma já aberta. `onMouseEnter` sozinho
                // deixava um buraco real: se o conteúdo da célula
                // aparece com o cursor JÁ parado em cima dela — o
                // narrador pinta terreno debaixo do ponteiro, ou outra
                // pessoa pinta e o eco chega — não há transição de
                // entrada pra disparar, e a hint só apareceria depois de
                // sair e voltar.
                onMouseMove={(e) => {
                  const hh = hintParaCelula(c);
                  if (hh) setHint((h) => (h ? { ...h, x: e.clientX, y: e.clientY } : { ...hh, x: e.clientX, y: e.clientY }));
                }}
                onMouseLeave={() => setHint((h) => (h ? null : h))}
              />
            );
          })}
        </g>

        {/* ── Moldura do mapa ──────────────────────────────────────
            Onde a cena ACABA. Sem nada aqui, o piso simplesmente
            desbotava no fundo do palco — e agora que token pode ficar
            fora da grade (0127), essa emenda virou informação de
            verdade: é ela que diz "daqui pra fora é área de espera,
            não é a cena".

            Discreta por regra: navy do próprio chrome, opacidade
            baixa, traço que NÃO engorda com o zoom
            (`vectorEffect="non-scaling-stroke"` — sem isso a moldura
            vira uma tarja preta em zoom alto). Duas linhas em vez de
            uma mais grossa: a de fora fecha o contorno, a de dentro é
            só um eco, e o par lê como chanfro em vez de borda de
            caixa. As cantoneiras em ciano são o único acento, curtas
            (1,6 célula) e a 40% — marcam o canto sem virar enfeite.

            `pointerEvents="none"` em tudo: ela cruza justamente a
            faixa onde a seleção por caixa começa (o retângulo
            `rv-fora-da-grade`), e uma decoração que engolisse gesto
            seria o pior tipo de bug — invisível na revisão, óbvio na
            mesa. */}
        {(() => {
          const m = 5;                       // respiro entre o piso e a moldura
          const x0 = minX + m, y0 = minY + m;
          const x1 = maxX - m, y1 = maxY - m;
          const eco = 4;                     // distância da segunda linha
          const braco = TAM * 0.7;           // comprimento de cada perna da cantoneira
          const cantos = [
            { x: x0, y: y0, dx: 1, dy: 1 },
            { x: x1, y: y0, dx: -1, dy: 1 },
            { x: x1, y: y1, dx: -1, dy: -1 },
            { x: x0, y: y1, dx: 1, dy: -1 },
          ];
          return (
            <g className="rv-moldura-mapa" pointerEvents="none">
              <rect x={x0} y={y0} width={x1 - x0} height={y1 - y0}
                fill="none" stroke="#1c2b45" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
              <rect x={x0 + eco} y={y0 + eco} width={x1 - x0 - eco * 2} height={y1 - y0 - eco * 2}
                fill="none" stroke="#16233a" strokeWidth={1} opacity={0.75} vectorEffect="non-scaling-stroke" />
              {cantos.map((c, i) => (
                <path key={i}
                  d={`M ${c.x + c.dx * braco} ${c.y} L ${c.x} ${c.y} L ${c.x} ${c.y + c.dy * braco}`}
                  fill="none" stroke="#45b8c9" strokeWidth={1.5} strokeLinecap="square"
                  opacity={0.2} vectorEffect="non-scaling-stroke" />
              ))}
            </g>
          );
        })()}

        {/* ── Terreno REAL (persistido) — o que as ferramentas de
            movimento/medição de fato respeitam. Camada própria, visual
            distinto do terreno decorativo de `cena.terrenos` (acima,
            hoje sempre vazio), pra nunca prometer efeito que não
            existe. ── */}
        {terrenoReal && terrenoReal.size > 0 && cVisivel("terrenoFuncional") && (
          <g className="rv-camada-terreno-real" pointerEvents="none">
            {/* `pointerEvents="none"` — camada puramente decorativa
                (hachura + rótulo ×2/X), desenhada POR CIMA da grade no
                DOM. Sem isto, ela intercepta o hover antes de chegar na
                célula por baixo, que é quem tem os handlers do tooltip
                de terreno — achado real ao testar: passar o mouse
                numa célula com terreno nunca disparava a hint. */}
            {[...terrenoReal.entries()].map(([key, tipo]) => {
              const [q, r] = key.split(",").map(Number);
              const p = hexParaPixel({ q, r }, TAM);
              return (
                <g key={key} transform={`translate(${p.x} ${p.y})`} className={`rv-terreno-real rv-terreno-real--${tipo}`}>
                  <path d={dHex} fill={tipo === "bloqueado" ? "url(#rv-bloqueado-real)" : "url(#rv-dificil-real)"} />
                  {/* Sem `opacity` inline: quem controla a intensidade
                      da hachura e do marcador é `vtt.css`
                      (`.rv-terreno-real > path` / `> g` / `> text`),
                      num lugar só — dois números pro mesmo pixel é
                      exatamente como um "escurece um pouco" vira
                      caçada por qual dos dois está vencendo. */}
                  {tipo === "bloqueado" ? (
                    <g stroke="#ff5f74" strokeWidth="2">
                      <line x1={-9} y1={-9} x2={9} y2={9} /><line x1={9} y1={-9} x2={-9} y2={9} />
                    </g>
                  ) : (
                    <text textAnchor="middle" y={4} fontSize="11" fill="#f5a200"
                      paintOrder="stroke fill" stroke="#0b141c" strokeWidth="3" strokeLinejoin="round">×2</text>
                  )}
                </g>
              );
            })}
          </g>
        )}

        {/* ── IMAGENS (acima da grade) ── o recorte que precisa tapar a
            grade: tapete, telhado, mancha. Continua ABAIXO de áreas,
            marcações, objetos e tokens — decoração nunca esconde quem
            está em cena nem um sinal deixado pela mesa. ───────────── */}
        <CamadaImagens
          imagens={imagensDesenhaveis} camada="acima_grade" tamanhoCelula={TAM}
          urls={urlsImagens ?? {}}
          // `cOculta`, não `cVisivel`: para o narrador `cVisivel` já
          // devolve `true` de propósito (o mapa separa "desenhar" de
          // "atenuar", e quem atenua é `cAtenuacao`). A camada de
          // imagens faz as duas coisas junto — precisa do estado CRU
          // pra decidir entre sumir (jogador) e virar fantasma
          // (narrador).
          visivelFundo={!cOculta("imagemFundo")}
          visivelTiles={!cOculta("tiles")}
          ehNarrador={verCamadasOcultas === true}
          ferramentaAtiva={ferramenta === "imagens"}
          bloqueadaFundo={cBloqueada("imagemFundo")}
          bloqueadaTiles={cBloqueada("tiles")}
          selecionadaId={imagemSelecionadaId ?? null}
          onSelecionar={onSelecionarImagem}
          onPressionarCorpo={(id, e) => pressionarImagem(id, null, e)}
          onPressionarCanto={(id, canto, e) => pressionarImagem(id, canto, e)}
          onPressionarGiro={(id, e) => pressionarImagem(id, "girar", e)}
        />

        {/* ── ÁREAS DE EFEITO (visual) ─────────────────────────────
            Abaixo de marcas, objetos e tokens de propósito: a área é
            informação de fundo, e nada dela pode cobrir retrato,
            sigla, PV, condição, orientação, alça de rotação, terreno,
            objeto ou marca. A camada inteira é `pointer-events: none`;
            quem intercepta clique é `CapturaAreas`, lá no topo. */}
        {((areas && areas.length > 0) || areasGuia || areasCandidatoSnap) && (
          <CamadaAreas areas={areas ?? []} tamanhoCelula={TAM} mostrarCelulas={areasMostrarCelulas} mostrarHalos={areasMostrarHalos}
            guia={areasGuia ?? null} candidatoSnap={areasCandidatoSnap ?? null} />
        )}

        {/* ── Marcações PERSISTIDAS (ferramenta "Marcar") ─────────
            Não confundir com o ping efêmero (camada própria, mais
            abaixo) — esta é a marcação que fica até alguém apagar. */}
        {/* Mesma regra de token/objeto: uma marcação é anotação sobre o
            chão, nunca uma tampa que impeça pintar a célula. */}
        {marcas && marcas.length > 0 && cVisivel("marcas") && (
          <g
            className="rv-camada-marcas"
            style={{ pointerEvents: ferramenta === "terreno" || ferramenta === "objetos" ? "none" : undefined }}
            /* Interagir: a marca não é uma tampa que impeça laçar o que
               está por baixo dela. O `pointerdown` de uma marca só é
               consumido quando ela de fato faz algo (apagar, medir);
               em Interagir ele borbulha até aqui e vira o MESMO início
               de seleção-por-caixa do piso e da grade. Sem isto,
               começar o laço em cima de uma marca simplesmente não
               fazia nada. */
            onPointerDown={ferramenta === "interagir" && onSelecionarCaixa ? iniciarCaixa : undefined}
          >
            {marcas.map((m) => {
              const p = hexParaPixel({ q: m.q, r: m.r }, TAM);
              const bloqueada = cBloqueada("marcas");
              return (
                <g
                  key={m.id}
                  transform={`translate(${p.x} ${p.y})`}
                  className="rv-marca-ping"
                  style={{ cursor: m.podeApagar && !bloqueada ? "pointer" : "default" }}
                  onPointerDown={(e) => {
                    if (e.button !== 0) return;
                    if (ferramenta === "medir") { iniciarMedicao({ q: m.q, r: m.r }, e.clientX, e.clientY, 0); return; }
                    if (bloqueada) return;
                    if (m.podeApagar && onClicarMarca) { e.stopPropagation(); onClicarMarca(m.id); }
                  }}
                >
                  {/* Área de clique. Os glifos abaixo são de CONTORNO:
                      sem esta base preenchida, o pixel do meio não é
                      hit-testável e o clique atravessa pro hex — em
                      Marcar isso criaria uma segunda marcação em cima
                      da primeira em vez de apagá-la. Só existe quando o
                      gesto tem pra onde ir; caso contrário a marcação
                      não rouba o clique de quem não pode apagá-la. */}
                  <circle
                    r={12}
                    fill={ferramenta === "medir" || (m.podeApagar && !bloqueada) ? "transparent" : "none"}
                  />
                  {/* Um glifo por SINAL — alvo, perigo, rota, nota. SÃO
                      os mesmos componentes `lucide-react` que a janela
                      Marcar mostra nos botões de tipo de sinal, e não
                      desenhos à mão que os imitavam: um `<svg>`
                      aninhado é SVG válido e escala com o zoom do mapa
                      igual ao resto. Redesenhar aqui era garantir que
                      as duas versões divergissem — e divergiram. O
                      `color` alimenta o `stroke="currentColor"` do
                      lucide. Não há anel em volta: na janela também não
                      há, e o círculo só competia com o glifo. */}
                  <g transform={`translate(${-TAM_GLIFO_SINAL / 2} ${-TAM_GLIFO_SINAL / 2})`} style={{ color: m.cor }}>
                    {(() => {
                      const Glifo = GLIFO_DO_SINAL[m.sinal] ?? FileText;
                      return <Glifo width={TAM_GLIFO_SINAL} height={TAM_GLIFO_SINAL} strokeWidth={1.7} />;
                    })()}
                  </g>
                  {m.texto && (
                    <text
                      className="rv-marca-rotulo" textAnchor="middle" y={22} fontSize="9" fill={m.cor}
                      paintOrder="stroke fill" stroke="#0b141c" strokeWidth="3" strokeLinejoin="round"
                    >{m.texto}</text>
                  )}
                </g>
              );
            })}
          </g>
        )}

        {/* ── Ping efêmero — pulso curto, some sozinho (nunca persiste,
            nunca entra em undo/redo). `pointerEvents="none"`: um ping
            nunca deveria capturar clique, é só um sinal visual passando
            por cima de qualquer coisa. */}
        {pingsExibidos && pingsExibidos.length > 0 && cVisivel("pings") && (
          <g className="rv-camada-pings" pointerEvents="none">
            {pingsExibidos.map((pg) => {
              const p = hexParaPixel({ q: pg.q, r: pg.r }, TAM);
              return (
                <g key={pg.id} transform={`translate(${p.x} ${p.y})`} className={`rv-ping${pg.proprio ? " rv-ping--proprio" : ""}`}>
                  <circle r={8} fill="none" stroke={pg.cor} strokeWidth="4" className="rv-ping-anel rv-ping-anel--1" />
                  <circle r={8} fill="none" stroke={pg.cor} strokeWidth="4" className="rv-ping-anel rv-ping-anel--2" />
                  <circle r={6} fill={pg.cor} className="rv-ping-nucleo" />
                </g>
              );
            })}
          </g>
        )}

        {/* ── Caixa de seleção (arrastar sobre o piso) ──────────── */}
        {caixa && (
          <rect
            x={Math.min(caixa.inicio.x, caixa.atual.x)}
            y={Math.min(caixa.inicio.y, caixa.atual.y)}
            width={Math.abs(caixa.atual.x - caixa.inicio.x)}
            height={Math.abs(caixa.atual.y - caixa.inicio.y)}
            fill="rgba(0,212,255,0.08)" stroke="#00d4ff" strokeWidth="1.2" strokeDasharray="4 3"
            pointerEvents="none"
          />
        )}

        {/* ── Preview de rota (arraste em andamento) ─────────────
            Uma linha por célula, direto da trilha do cursor
            (`hexesPreview`) — nunca recalculado aqui, só desenhado.
            Toda a trilha tem o MESMO peso visual: não existe mais
            "trecho provisório" porque nada nela é provisório — é o que
            a mão fez, e só um gesto de voltar por cima muda.
            Quando o cursor entra numa posição ILEGAL (fora do mapa ou
            sobre outro token — `destinoAlcancavel === false`), a
            trilha continua desenhada normalmente até onde deu, e uma
            linha pontilhada vermelha liga a ponta ao cursor: nunca
            inventa um desvio pelo obstáculo, nunca move o token pra
            dentro dele.
            Regra CONSULTIVA: um segmento cuja PEGADA INTEIRA projetada
            naquele passo toca alguma célula bloqueada — `arrasto.
            passosBloqueados[i]`, já calculado no domínio
            (`_dominio/pathfindingHex.ts:bloqueiosNaRota`), NUNCA
            recomputado aqui via `estaBloqueada` direto — fica
            âmbar/tracejado grosso em vez do verde normal, mesmo quando
            só uma célula SECUNDÁRIA do footprint (não a âncora) cruza o
            bloqueio. Nunca impede montar/confirmar a rota, só avisa. */}
        {arrasto && hexesPreview && rotaPreview && (
          <g className="rv-camada-rota-preview" pointerEvents="none">
            {hexesPreview.map((h, i) => {
              if (i === 0) return null;
              const a = hexParaPixel(hexesPreview[i - 1], TAM);
              const b = hexParaPixel(h, TAM);
              const atravessaBloqueio = arrasto.passosBloqueados[i] ?? false;
              return (
                <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                  stroke={atravessaBloqueio ? "#ff9d4d" : "#22d3aa"} strokeWidth={atravessaBloqueio ? 3.5 : 2.5}
                  strokeDasharray={atravessaBloqueio ? "3 3" : "6 4"} opacity={0.85} />
              );
            })}
            {/* Destaque opcional: as células ESPECÍFICAS da pegada que
                cruzam bloqueio, já calculadas no domínio
                (`arrasto.celulasBloqueadas`) — nunca uma nova varredura
                aqui, só desenho de dado pronto. */}
            {arrasto.celulasBloqueadas.map((c, i) => {
              const p = hexParaPixel(c, TAM);
              return (
                <path key={`bloq-${i}`} d={hexPath(TAM - 3)} transform={`translate(${p.x} ${p.y})`}
                  fill="#ff9d4d26" stroke="#ff9d4d" strokeWidth="1.5" strokeDasharray="2 2" opacity="0.9" />
              );
            })}
            {!arrasto.destinoAlcancavel && (() => {
              const ponta = arrasto.rota[arrasto.rota.length - 1];
              const a = hexParaPixel(ponta, TAM);
              const b = hexParaPixel(arrasto.destinoAtual, TAM);
              return <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#ff5f74" strokeWidth="2.5" strokeDasharray="3 3" opacity="0.85" />;
            })()}
            {/* Marcador de waypoint — losango, distinto por FORMA dos
                marcadores redondos de origem/destino de Medir e do
                próprio token, nunca só cor. */}
            {arrasto.waypoints.map((wp, i) => {
              const p = hexParaPixel(wp, TAM);
              return (
                <path key={`wp-${i}`} d="M0,-9 L9,0 L0,9 L-9,0 Z" transform={`translate(${p.x} ${p.y})`}
                  fill="#22d3aa" stroke="#0b141c" strokeWidth="1.5" opacity="0.95" />
              );
            })}
            {/* Rótulo de distância/custo ancorado na PONTA DA TRILHA,
                não no cursor: quando o cursor entra num obstáculo os
                dois divergem, e o número tem que ficar junto de onde o
                token de fato está — senão o valor parece se referir à
                célula proibida sob o ponteiro. */}
            {(() => {
              const ponta = arrasto.rota[arrasto.rota.length - 1];
              const pPonta = hexParaPixel(ponta, TAM);
              const avisoBloqueio = arrasto.celulasBloqueadas.length > 0;
              const texto = !arrasto.destinoAlcancavel
                ? "sem passagem — o token para aqui"
                : avisoBloqueio
                  ? "atravessa área normalmente bloqueada"
                  : `${rotaPreview.distanciaTotal}m · ${rotaPreview.custoTotal} custo`;
              const largura = Math.max(68, texto.length * 6.4 + 16);
              return (
                <g transform={`translate(${pPonta.x} ${pPonta.y - 34})`}>
                  <rect x={-largura / 2} y={-11} width={largura} height={20} rx={4} fill="#0b141c" opacity="0.92" />
                  <text textAnchor="middle" y={3} fontSize="10" fontFamily="monospace"
                    fill={!arrasto.destinoAlcancavel ? "#ff96a8" : avisoBloqueio ? "#ffc98a" : "#eafcff"}>
                    {avisoBloqueio ? "⚠ " : ""}{texto}
                  </text>
                </g>
              );
            })()}
          </g>
        )}

        {/* ── Coberturas / objetos ─────────────────────────────── */}
        {/* Terreno pinta o CHÃO, que existe por baixo do objeto — um
            muro em cima da célula não pode impedir de marcá-la como
            difícil/bloqueada. Só em Terreno: na ferramenta Objetos o
            clique no objeto é justamente o que o SELECIONA. */}
        <g
          className="rv-camada-objetos"
          style={{
            display: cVisivel("objetos") ? undefined : "none",
            opacity: cAtenuacao("objetos"),
            pointerEvents: ferramenta === "terreno" ? "none" : undefined,
          }}
          /* Mesma razão da camada de marcas: em Interagir um objeto
             não tem gesto próprio, então o pointerdown que borbulha
             dele começa a seleção-por-caixa em vez de morrer no
             caminho. Nas ferramentas Objetos/Medir o objeto continua
             consumindo o gesto (selecionar/medir), e este handler
             nunca é montado. */
          onPointerDown={ferramenta === "interagir" && onSelecionarCaixa ? iniciarCaixa : undefined}
        >
          {cena.objetos.map((o) => {
            const ap = APARENCIA_OBJETO[o.tipo] ?? APARENCIA_OBJETO.entulho;
            const danificado = o.pd !== null && o.pdMax !== null && o.pd < o.pdMax;
            const movendoEste = o.id === objetoEmMovimentoId;
            return (
              <g
                key={o.id}
                className="rv-objeto"
                aria-label={o.nome}
                // Nunca `pointer-events: none` por camada/ferramenta — o
                // objeto continua um alvo de ponteiro de verdade; o
                // comportamento muda conforme a ferramenta ativa, não por
                // bloqueio de camada. Pra Medir, a origem/destino usa a
                // posição do ponteiro convertida em hex (não uma célula
                // fixa do objeto) porque a cobertura pode ocupar várias
                // células com forma irregular. A ÚNICA exceção é ESTE
                // objeto específico enquanto reposicionado (rascunho local
                // ainda não confirmado): vira fantasma pra o clique no
                // mesmo lugar acertar a célula embaixo, não reabrir a
                // seleção dele mesmo por cima do próprio rascunho.
                style={movendoEste ? { pointerEvents: "none", opacity: 0.35 } : undefined}
                onPointerDown={
                  ferramenta === "medir"
                    ? (e) => {
                        if (e.button !== 0) return;
                        const pt = pontoMundo(e.clientX, e.clientY);
                        if (!pt) return;
                        iniciarMedicao(pixelParaHex(pt.x, pt.y, TAM), e.clientX, e.clientY, 0);
                      }
                    : ferramenta === "objetos" && onSelecionarObjeto
                      ? (e) => { if (e.button === 0) onSelecionarObjeto(o.id); }
                      : undefined
                }
                onMouseEnter={(e) => setHint({ ...hintParaObjeto(o), x: e.clientX, y: e.clientY })}
                onMouseMove={(e) => setHint((h) => (h ? { ...h, x: e.clientX, y: e.clientY } : h))}
                onMouseLeave={() => setHint((h) => (h ? null : h))}
              >
                {/* Sombra projetada — dá profundidade sem imagem. */}
                {o.celulas.map((c) => {
                  const p = hexParaPixel(c, TAM);
                  return <path key={`s-${hexKey(c)}`} d={dHexInner} transform={`translate(${p.x + 3} ${p.y + 5})`} fill="#05080c" opacity="0.55" />;
                })}
                {o.celulas.map((c) => {
                  const p = hexParaPixel(c, TAM);
                  return (
                    <g key={hexKey(c)} transform={`translate(${p.x} ${p.y})`}>
                      <path d={dHexInner} fill={ap.lado} />
                      <path d={hexPath(TAM - 4)} fill={ap.topo} stroke={ap.traco} strokeWidth="1" />
                      {o.tipo === "grade" && (
                        <g stroke={ap.traco} strokeWidth="1.1" opacity="0.75">
                          <line x1={-10} y1={-10} x2={10} y2={10} /><line x1={10} y1={-10} x2={-10} y2={10} />
                        </g>
                      )}
                      {o.tipo === "barril" && <circle r={8} fill="none" stroke={ap.traco} strokeWidth="1.4" opacity="0.8" />}
                      {/* Rachadura só na PRIMEIRA célula do objeto: uma
                          marca por cobertura danificada comunica o
                          estado; repetir em cada célula virava ruído
                          que competia com os tokens. */}
                      {danificado && hexKey(c) === hexKey(o.celulas[0]) && (
                        <path d="M-6,-8 L1,-1 L-3,2 L5,9" fill="none" stroke="#ff5f74" strokeWidth="1.6" opacity="0.9" />
                      )}
                    </g>
                  );
                })}
              </g>
            );
          })}
        </g>

        {/* ── Tokens ───────────────────────────────────────────── */}
        {/* Terreno e Objetos trabalham no CHÃO: um token em pé numa
            célula não pode impedir de pintar aquela célula nem de
            incluí-la na pegada de um objeto (decisão D7 — o narrador
            pode montar cenário sobre token de propósito). Com estas
            ferramentas ativas a camada inteira fica transparente ao
            ponteiro e o clique chega na célula embaixo. */}
        <g className={`rv-camada-tokens${areasEscolhendoToken ? " rv-camada-tokens--escolhendo-aura" : ""}`}
          style={{
            display: cVisivel("tokens") ? undefined : "none",
            opacity: cAtenuacao("tokens"),
            pointerEvents: ferramenta === "terreno" || ferramenta === "objetos" ? "none" : undefined,
          }}>
          {cena.tokens.map((t) => {
            const est = estadoVisual(t, estadoPorToken, selecionadoId, hoverId, alvoIds);
            // Token sendo arrastado fica visualmente na origem, opaco
            // reduzido — o fantasma na posição atual é desenhado à
            // parte, e é ele que se move de verdade com o cursor.
            // O grupo inteiro em arrasto fica apagado na origem: quem
            // se move de verdade é o fantasma de cada um.
            const emArrasto = arrasto?.tokenId === t.id || acompanhantes.some((seg) => seg.tokenId === t.id);
            const tokensBloqueados = cBloqueada("tokens");
            const movimentoDesteToken = movimentosVisuais?.get(t.id);
            // Elegibilidade da ALÇA DE ROTAÇÃO — todas as condições do
            // pedido, numa expressão só: ferramenta certa, sem
            // posicionamento de token novo em andamento, sem animação
            // de movimento NESTE token, seleção ÚNICA (nunca com
            // seleção múltipla), este token de fato selecionado, e
            // autorizado a mexer nele (mesma checagem do arrasto — quem
            // pode mover pode girar). Pegada simétrica também gira —
            // girar só muda a direção "pra frente", nunca esconde a alça.
            const elegívelParaAlca = ferramenta === "interagir" && !posicionamentoToken?.ativo && !movimentoDesteToken
              && (idsSelecionados?.length ?? 0) <= 1 && est.selecionado && (podeMoverToken?.(t.id) ?? false);
            const estadoAlcaDesteToken = rotacaoAlca?.tokenId === t.id
              ? { emGesto: true, orientacaoAtual: rotacaoAlca.orientacaoAtual, valida: rotacaoAlca.valida }
              : null;
            return (
              <Token
                key={t.id}
                token={t}
                estado={est}
                opacoReduzido={emArrasto}
                ferramenta={ferramenta}
                onSelecionar={tokensBloqueados ? () => {} : onSelecionarToken}
                onHover={onHoverToken}
                onIniciarArrasto={tokensBloqueados ? undefined : () => iniciarArrasto(t.id, t.pos)}
                onIniciarMedicao={(clientX, clientY) => iniciarMedicao(t.pos, clientX, clientY, 0)}
                movimentoVisual={movimentoDesteToken}
                onAnimacaoConcluida={onAnimacaoConcluida}
                elegívelParaAlcaRotacao={onRotacaoAlcaSolta ? elegívelParaAlca : false}
                estadoAlcaRotacao={estadoAlcaDesteToken}
                onIniciarAlcaRotacao={onRotacaoAlcaSolta ? (e) => iniciarRotacaoAlca(t, e) : undefined}
                onMoverAlcaRotacao={onRotacaoAlcaSolta ? moverRotacaoAlca : undefined}
                onSoltarAlcaRotacao={onRotacaoAlcaSolta ? soltarRotacaoAlca : undefined}
                onCancelarAlcaRotacao={onRotacaoAlcaSolta ? cancelarRotacaoAlca : undefined}
                onTeclaAlcaRotacao={onRotacaoAlcaSolta ? (e) => tecladoRotacaoAlca(t, e) : undefined}
              />
            );
          })}
          {/* Fantasma do token em arrasto — fica na PONTA DA TRILHA
              (última célula legal), não no hex cru sob o cursor: é
              onde o token de fato vai parar se soltar agora, então ele
              nunca aparece dentro de um obstáculo nem fora do mapa.
              A pegada inteira (não só um círculo na âncora) projetada
              ali — mesma forma que o token real vai ocupar.
              `transition` no transform: o encaixe de uma célula pra
              outra vira um deslize curto em vez de um salto seco. 90ms
              é curto o bastante pra não atrasar a leitura da posição
              (o rótulo e a linha já mudaram) e longo o bastante pra
              tirar o serrilhado de célula a célula num arrasto rápido. */}
          {/* Um fantasma por acompanhante, na MESMA ponta da trilha
              transladada pelo vetor dele — o grupo inteiro aparece na
              posição em que vai pousar, não só o token sob o cursor.
              Mesma cor do líder (verde/vermelho): a validade é do
              GRUPO, então mostrar um membro "ok" ao lado de um membro
              "barrado" seria mentira — quando um não cabe, nenhum anda. */}
          {arrasto && acompanhantes.map((seg) => {
            const tok = cena.tokens.find((t) => t.id === seg.tokenId);
            if (!tok) return null;
            const ponta = posicaoVisual(arrasto);
            const p = hexParaPixel({ q: ponta.q + seg.deslocamento.q, r: ponta.r + seg.deslocamento.r }, TAM);
            const raio = TAM * 0.82 * TAMANHOS[tok.tamanho].escala;
            const cor = arrasto.destinoAlcancavel ? "#22d3aa" : "#ff5f74";
            const origemLocal = hexParaPixel(origemMecanica(seg.pegada), TAM);
            return (
              <g key={seg.tokenId} transform={`translate(${p.x} ${p.y})`} pointerEvents="none" opacity={0.72}
                style={{ transition: "transform 90ms linear" }}>
                {seg.pegada.length > 1 && seg.pegada.map((offset, i) => {
                  const lp = hexParaPixel(offset, TAM);
                  return <path key={i} d={hexPath(TAM - 1.5)} transform={`translate(${lp.x} ${lp.y})`} fill={`${cor}1f`} stroke={cor} strokeWidth="1.2" strokeDasharray="4 3" />;
                })}
                <g transform={`translate(${origemLocal.x} ${origemLocal.y})`}>
                  <circle r={raio} fill="#0d141b" stroke={cor} strokeWidth="2.5" strokeDasharray="4 3" />
                  <text textAnchor="middle" y={raio * 0.16} style={{ fontSize: raio * 0.62, fontFamily: "monospace", fontWeight: 700, fill: "#eafcff" }}>
                    {tok.sigla}
                  </text>
                </g>
              </g>
            );
          })}
          {arrasto && (() => {
            const tok = cena.tokens.find((t) => t.id === arrasto.tokenId);
            if (!tok) return null;
            const pegada = pegadaEmArrasto ?? [{ q: 0, r: 0 }];
            const p = hexParaPixel(posicaoVisual(arrasto), TAM);
            const raio = TAM * 0.82 * TAMANHOS[tok.tamanho].escala;
            const cor = arrasto.destinoAlcancavel ? "#22d3aa" : "#ff5f74";
            const origemLocal = hexParaPixel(origemMecanica(pegada), TAM);
            return (
              <g transform={`translate(${p.x} ${p.y})`} pointerEvents="none" opacity={0.72}
                style={{ transition: "transform 90ms linear" }}>
                {pegada.length > 1 && pegada.map((offset, i) => {
                  const lp = hexParaPixel(offset, TAM);
                  return <path key={i} d={hexPath(TAM - 1.5)} transform={`translate(${lp.x} ${lp.y})`} fill={`${cor}1f`} stroke={cor} strokeWidth="1.2" strokeDasharray="4 3" />;
                })}
                <g transform={`translate(${origemLocal.x} ${origemLocal.y})`}>
                  <circle r={raio} fill="#0d141b" stroke={cor} strokeWidth="2.5" strokeDasharray="4 3" />
                  <text textAnchor="middle" y={raio * 0.16} style={{ fontSize: raio * 0.62, fontFamily: "monospace", fontWeight: 700, fill: "#eafcff" }}>
                    {tok.sigla}
                  </text>
                </g>
              </g>
            );
          })()}
        </g>

        {/* ── Posicionamento de token novo (fluxo de criação em duas
            etapas, `VttClient.tsx`) ───────────────────────────────
            Uma camada CAPTURADORA transparente, do tamanho do mundo,
            por CIMA da grade/tokens (ordem de pintura = ordem de
            hit-test do SVG) — é isto, sozinho, que impede clicar num
            token existente de selecioná-lo/arrastá-lo, e impede Medir/
            Marcar/pintar terreno de iniciar por baixo: nenhum desses
            elementos recebe o evento enquanto esta camada está no
            topo. Pan (botão direito, ouvido no `<svg>`/`window`) e
            zoom (`wheel`, nativo no próprio `<svg>`) continuam
            funcionando — nenhum dos dois depende de QUAL elemento
            estava sob o cursor. */}
        {posicionamentoToken?.ativo && (
          <rect
            className="rv-captura-posicionamento"
            x={minX} y={minY} width={maxX - minX} height={maxY - minY}
            fill="transparent" style={{ cursor: "crosshair" }}
            onPointerMove={onMoverPosicionamento ? (e) => {
              const p = pontoMundo(e.clientX, e.clientY);
              if (p) onMoverPosicionamento(pixelParaHex(p.x, p.y, TAM));
            } : undefined}
            onClick={onConfirmarPosicionamento ? (e) => {
              const p = pontoMundo(e.clientX, e.clientY);
              if (p) onConfirmarPosicionamento(pixelParaHex(p.x, p.y, TAM));
            } : undefined}
          />
        )}
        {posicionamentoToken?.ativo && posicionamentoToken.ancora && (() => {
          const cor = posicionamentoToken.valida ? "#22d3aa" : "#ff5f74";
          const pAncora = hexParaPixel(posicionamentoToken.ancora, TAM);
          return (
            <g
              className="rv-camada-posicionamento-token" pointerEvents="none"
              data-valida={posicionamentoToken.valida} data-orientacao={posicionamentoToken.orientacao}
              data-ancora={`${posicionamentoToken.ancora.q},${posicionamentoToken.ancora.r}`}
            >
              {posicionamentoToken.celulas.map((c, i) => {
                const p = hexParaPixel(c, TAM);
                return (
                  <path key={i} d={hexPath(TAM - 1.5)} transform={`translate(${p.x} ${p.y})`}
                    fill={`${cor}33`} stroke={cor} strokeWidth="2" strokeDasharray={i === 0 ? undefined : "5 3"} />
                );
              })}
              {/* Orientação atual — mesma rotação canônica de `_dominio/pegada.ts` via `hexRotacionar`, nunca uma trigonometria própria. TODO fantasma mostra a seta, qualquer tamanho — pegada simétrica só muda pra qual direção ele aponta, nunca as células. */}
              {posicionamentoToken.podeGirar && (() => {
                const offsetDirecao = hexRotacionar({ q: 1, r: 0 }, posicionamentoToken.orientacao);
                const pd = hexParaPixel(offsetDirecao, 1);
                const norma = Math.hypot(pd.x, pd.y) || 1;
                const dx = (pd.x / norma) * TAM * 1.7, dy = (pd.y / norma) * TAM * 1.7;
                return (
                  <g transform={`translate(${pAncora.x} ${pAncora.y})`}>
                    <line x1={0} y1={0} x2={dx} y2={dy} stroke="#35c8f0" strokeWidth={3} markerEnd="url(#rv-seta-posicionamento)" />
                    <defs>
                      <marker id="rv-seta-posicionamento" markerWidth={8} markerHeight={8} refX={4} refY={4} orient="auto">
                        <path d="M0,0 L8,4 L0,8 Z" fill="#35c8f0" />
                      </marker>
                    </defs>
                  </g>
                );
              })()}
              {/* Nome/sigla/imagem do token — mesmo círculo de âncora que o fantasma de arrasto já usa, pra consistência visual entre "movendo" e "posicionando". */}
              <g transform={`translate(${pAncora.x} ${pAncora.y})`}>
                <circle r={TAM * 0.72} fill="#0d141b" stroke={cor} strokeWidth="2.5" strokeDasharray="4 3" />
                {posicionamentoToken.imagemUrl ? (
                  <>
                    <clipPath id="rv-clip-posicionamento"><circle r={TAM * 0.68} /></clipPath>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <image href={posicionamentoToken.imagemUrl} x={-TAM * 0.68} y={-TAM * 0.68} width={TAM * 1.36} height={TAM * 1.36}
                      clipPath="url(#rv-clip-posicionamento)" preserveAspectRatio="xMidYMid slice" />
                  </>
                ) : posicionamentoToken.sigla ? (
                  <text textAnchor="middle" y={TAM * 0.16} style={{ fontSize: TAM * 0.56, fontFamily: "monospace", fontWeight: 700, fill: "#eafcff" }}>
                    {posicionamentoToken.sigla}
                  </text>
                ) : (
                  // Sem sigla nem imagem (nome vazio → nome/sigla
                  // automáticos só existem depois de confirmar, no
                  // servidor) — glifo NEUTRO, nunca "??": um ponto
                  // simples não afirma nada sobre o token, só marca a
                  // âncora.
                  <circle className="rv-token-sigla-placeholder" r={TAM * 0.14} fill="#eafcff" opacity={0.55} />
                )}
              </g>
            </g>
          );
        })()}

        {/* ── Medição (pressionar/arrastar/soltar) ────────────────
            Depois de objetos e tokens de propósito: a régua e o
            rótulo de distância precisam continuar legíveis por CIMA
            de qualquer token/objeto que a linha atravesse, nunca
            escondidos atrás deles — achado real ao medir cruzando um
            token ou uma cobertura, onde a camada antiga (antes da
            camada de objetos/tokens) deixava o texto ilegível. */}
        {/* ── Medições PERMANENTES (persistidas, de todos) ─────────
            Desenhadas ANTES da régua ativa: a que você está fazendo
            agora tem que ficar por cima das que já estavam lá. Traço
            contínuo (a ativa é tracejada) — a diferença entre "salva"
            e "em andamento" não pode depender só de cor. */}
        {/* RÉGUAS AO VIVO de outros participantes — "instantânea +
            pra mesa". Tracejadas e com o nome de quem mede, porque a
            pergunta que elas respondem na tela é "quem está medindo
            isso, e por que apareceu sozinho?". Nunca clicáveis: não
            são objeto da cena, são o gesto de outra pessoa acontecendo
            agora. Desenhadas ANTES das permanentes pra uma régua salva
            nunca ficar escondida por uma que vai sumir em segundos. */}
        {reguasAoVivo && reguasAoVivo.length > 0 && (
          <g className="rv-camada-reguas-ao-vivo" pointerEvents="none">
            {reguasAoVivo.map((r) => {
              if (r.pontos.length < 2) return null;
              const pts = r.pontos.map((h) => hexParaPixel(h, TAM));
              const calc = medir(r.pontos, terrenoParaRota);
              const pFim = pts[pts.length - 1];
              const texto = `${r.autorNome ? `${r.autorNome} · ` : ""}${calc.metros} m`;
              const larg = Math.max(52, texto.length * 6.4 + 16);
              return (
                <g key={r.autorId} className="rv-regua-ao-vivo">
                  <polyline points={pts.map((p) => `${p.x},${p.y}`).join(" ")}
                    fill="none" stroke="#0b141c" strokeWidth="5" strokeLinejoin="round" opacity="0.5" />
                  <polyline points={pts.map((p) => `${p.x},${p.y}`).join(" ")}
                    fill="none" stroke="#c9a6ff" strokeWidth="2" strokeLinejoin="round" strokeDasharray="6 4" opacity="0.9" />
                  {pts.map((p, i) => (
                    <circle key={i} cx={p.x} cy={p.y} r={i === 0 || i === pts.length - 1 ? 3.5 : 2.5}
                      fill="#c9a6ff" stroke="#0b141c" strokeWidth="1.2" />
                  ))}
                  <g transform={`translate(${pFim.x} ${pFim.y - 16})`}>
                    <rect x={-larg / 2} y={-9} width={larg} height={18} rx={2}
                      fill="#0b141c" stroke="#c9a6ff" strokeWidth="1" opacity="0.92" />
                    <text textAnchor="middle" y={4}
                      style={{ fontSize: 11, fontFamily: "monospace", fontWeight: 700, fill: "#eadcff" }}>
                      {texto}
                    </text>
                  </g>
                </g>
              );
            })}
          </g>
        )}

        {medicoesPermanentes && medicoesPermanentes.length > 0 && (
          <g className="rv-camada-medicoes-fixas">
            {medicoesPermanentes.map((m) => {
              if (m.pontos.length < 2) return null;
              const pts = m.pontos.map((h) => hexParaPixel(h, TAM));
              const calc = medir(m.pontos, terrenoParaRota);
              const pFim = pts[pts.length - 1];
              const texto = calc.metros === calc.custo ? `${calc.metros} m` : `${calc.metros} m · custo ${calc.custo}`;
              // Régua PRIVADA (0128) desenha com o mesmo traço, em
              // tracejado curto e com um prefixo no rótulo. Não é
              // decoração: se nada distingue, o autor não tem como
              // saber quais das próprias réguas a mesa está vendo — e
              // ele vê as duas coisas na mesma tela. Quem não é o autor
              // nunca recebe esta linha (a RLS filtra na leitura), então
              // este estilo só existe pros olhos de quem criou.
              const rotuloTexto = m.privada ? `◆ ${texto}` : texto;
              const larg = Math.max(46, rotuloTexto.length * 6.4 + 16);
              const clicavel = m.podeApagar && !!onApagarMedicao;
              return (
                <g key={m.id} className="rv-medicao-fixa" data-privada={m.privada || undefined}>
                  {/* Faixa larga e invisível por baixo: alvo de clique
                      generoso pra apagar. Sem ela, acertar uma linha de
                      2px é um teste de pontaria. Só existe pra quem
                      pode apagar aquela régua. */}
                  {clicavel && (
                    <polyline
                      points={pts.map((p) => `${p.x},${p.y}`).join(" ")}
                      fill="none" stroke="transparent" strokeWidth="16" strokeLinejoin="round"
                      style={{ pointerEvents: "stroke", cursor: "pointer" }}
                      onPointerDown={(e) => {
                        if (e.button !== 0) return;
                        // Impede que o mesmo gesto comece uma régua
                        // nova por baixo — clicar numa medição salva é
                        // uma ação sobre ELA, não sobre o mapa.
                        e.stopPropagation();
                        onApagarMedicao(m.id);
                      }}
                    >
                      <title>Clique pra apagar esta medição ({texto}{m.privada ? " · só você vê" : ""})</title>
                    </polyline>
                  )}
                  <polyline points={pts.map((p) => `${p.x},${p.y}`).join(" ")}
                    fill="none" stroke="#7fb2ff" strokeWidth="2" strokeLinejoin="round" opacity="0.75"
                    strokeDasharray={m.privada ? "3 3" : undefined} pointerEvents="none" />
                  <circle cx={pts[0].x} cy={pts[0].y} r={3.5} fill="#7fb2ff" stroke="#0b141c" strokeWidth="1.2" pointerEvents="none" />
                  {pts.slice(1, -1).map((p, i) => (
                    <rect key={i} x={p.x - 3.2} y={p.y - 3.2} width={6.4} height={6.4}
                      transform={`rotate(45 ${p.x} ${p.y})`}
                      fill="#0b141c" stroke="#7fb2ff" strokeWidth="1.6" pointerEvents="none" />
                  ))}
                  <circle cx={pFim.x} cy={pFim.y} r={5} fill="none" stroke="#7fb2ff" strokeWidth="2" pointerEvents="none" />
                  <g transform={`translate(${pFim.x} ${pFim.y - 15})`} pointerEvents="none">
                    <rect x={-larg / 2} y={-9} width={larg} height={17} rx={4} fill="#0b141c" opacity="0.9" />
                    <text textAnchor="middle" y={3} fontSize="9.5" fontFamily="monospace" fill="#bcd8ff" style={{ userSelect: "none" }}>
                      {rotuloTexto}
                    </text>
                  </g>
                </g>
              );
            })}
          </g>
        )}

        {medicaoAtiva && medicaoCalc && pontosMedicao && (() => {
          const pts = pontosMedicao.map((h) => hexParaPixel(h, TAM));
          const pOrigem = pts[0];
          const pAtual = pts[pts.length - 1];
          // "Mesma célula" agora é sobre a régua INTEIRA: com dobras,
          // mesmo voltando ao ponto de partida há trajeto a mostrar.
          const mesmaCelula = medicaoCalc.metros === 0;
          const valida = !medicaoCalc.atravessaBloqueio;
          const cor = valida ? "#22d3aa" : "#ff5f74";
          const meio = { x: (pOrigem.x + pAtual.x) / 2, y: (pOrigem.y + pAtual.y) / 2 };
          const texto = medicaoCalc.metros === medicaoCalc.custo
            ? `${medicaoCalc.metros} m`
            : `${medicaoCalc.metros} m · custo ${medicaoCalc.custo}`;
          const larguraTexto = Math.max(60, texto.length * 6.6 + 18);
          const segmentos = medicaoCalc.rota.segmentos;
          // O total fica na PONTA (junto do cursor), não no meio: com
          // vários trechos o "meio" geométrico da régua pode cair longe
          // de tudo, ou em cima de uma dobra. Na ponta ele acompanha o
          // olhar de quem está medindo.
          const alturaTotal = segmentos.length > 1 ? -34 : -15;
          return (
            <g className="rv-camada-medicao" pointerEvents="none">
              {/* Uma linha POR TRECHO — com a distância do trecho ao
                  lado, girada junto com ele. É o que permite ler "8 +
                  5 + 3" no mapa em vez de só o total no fim. */}
              {segmentos.map((s, i) => {
                const a = pts[i];
                const b = pts[i + 1];
                if (s.distancia === 0) return null;
                const corTrecho = s.invalido ? "#ff5f74" : cor;
                const mTrecho = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
                // Nunca de cabeça pra baixo: acima de ±90° o texto
                // ficaria invertido — gira mais 180° pra manter sempre
                // legível da esquerda pra direita, ainda seguindo a
                // orientação da linha.
                let ang = Math.atan2(b.y - a.y, b.x - a.x) * (180 / Math.PI);
                if (ang > 90 || ang < -90) ang += 180;
                const rotulo = `${s.distancia} m`;
                const larg = Math.max(34, rotulo.length * 6.6 + 14);
                return (
                  <g key={i}>
                    <line x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                      stroke={corTrecho} strokeWidth="2.5" strokeDasharray="7 5" opacity="0.9" />
                    {/* Com um trecho só, o rótulo por trecho seria a
                        repetição exata do total — mostra só o total. */}
                    {segmentos.length > 1 && (
                      <g transform={`translate(${mTrecho.x} ${mTrecho.y}) rotate(${ang})`}>
                        <g transform="translate(0 -13)">
                          <rect x={-larg / 2} y={-9} width={larg} height={17} rx={4} fill="#0b141c" opacity="0.92" />
                          <text textAnchor="middle" y={3} fontSize="9.5" fontFamily="monospace"
                            fill={s.invalido ? "#ff96a8" : "#bfe9f5"} style={{ userSelect: "none" }}>
                            {rotulo}
                          </text>
                        </g>
                      </g>
                    )}
                  </g>
                );
              })}
              {/* marcador de origem — preenchido */}
              <circle cx={pOrigem.x} cy={pOrigem.y} r={5} fill={cor} stroke="#0b141c" strokeWidth="1.5" />
              {/* Dobras fixadas com Q — losango, distinto por FORMA das
                  duas pontas (círculo cheio / anel), não só por cor. */}
              {pts.slice(1, -1).map((p, i) => (
                <rect key={`dobra-${i}`} x={p.x - 4.5} y={p.y - 4.5} width={9} height={9}
                  transform={`rotate(45 ${p.x} ${p.y})`}
                  fill="#0b141c" stroke={cor} strokeWidth="2.2" />
              ))}
              {/* marcador do cursor atual — anel, distinto por FORMA (não só cor) */}
              <circle cx={pAtual.x} cy={pAtual.y} r={7.5} fill="none" stroke={cor} strokeWidth="2.5" />
              {!mesmaCelula && (
                <g transform={`translate(${pAtual.x} ${pAtual.y + alturaTotal})`}>
                  <rect x={-larguraTexto / 2} y={-11} width={larguraTexto} height={20} rx={4} fill="#0b141c" opacity="0.94" />
                  <text textAnchor="middle" y={3} fontSize="10.5" fontFamily="monospace" fill={valida ? "#eafcff" : "#ff96a8"} style={{ userSelect: "none" }}>
                    {texto}
                  </text>
                </g>
              )}
              {/* Rota inválida: além da cor, um "×" no meio — não depender só de cor. */}
              {!valida && !mesmaCelula && (
                <g transform={`translate(${meio.x} ${meio.y})`} stroke="#ff5f74" strokeWidth="2.4" opacity="0.95">
                  <line x1={-6} y1={-6} x2={6} y2={6} /><line x1={6} y1={-6} x2={-6} y2={6} />
                </g>
              )}
              {/* Sugestão de cobertura — nunca rotada com a linha (mesmo
                  padrão do aviso de bloqueio no arrasto de token): fica
                  sempre legível da esquerda pra direita, acima do
                  marcador de destino. */}
              {coberturaSugerida && !mesmaCelula && (() => {
                const rotuloGrau = GRAU_COBERTURA[coberturaSugerida.grau].rotulo.toLowerCase();
                const pdTexto = coberturaSugerida.pd !== null && coberturaSugerida.pdMax !== null
                  ? `, ${coberturaSugerida.pd}/${coberturaSugerida.pdMax} PD` : "";
                const textoSugestao = `Possível ${rotuloGrau}: ${coberturaSugerida.nome}${pdTexto}`;
                const larguraSugestao = Math.max(90, textoSugestao.length * 6.2 + 18);
                return (
                  <g transform={`translate(${pAtual.x} ${pAtual.y - 34})`}>
                    <rect x={-larguraSugestao / 2} y={-11} width={larguraSugestao} height={20} rx={4} fill="#0b141c" opacity="0.94" />
                    <text textAnchor="middle" y={3} fontSize="10" fontFamily="monospace" fill="#ffc98a" style={{ userSelect: "none" }}>
                      {textoSugestao}
                    </text>
                  </g>
                );
              })()}
            </g>
          );
        })()}

        {/* ── ÁREAS DE EFEITO (interação) ──────────────────────────
            Último elemento do `<g>` = topo da ordem de hit-test do
            SVG. A captura de CRIAÇÃO (retângulo/contornos) só existe
            com a ferramenta Áreas ativa, mas as ALÇAS de edição
            (`areasAlcas`) são independentes disso — ver comentário
            na declaração de `alcaPointerDown` acima. */}
        {(areasInteracao || (areasAlcas && areasAlcas.length > 0)) && (
          <CapturaAreas
            ativa={areasInteracao?.ativa ?? false}
            limites={{ minX, minY, largura: maxX - minX, altura: maxY - minY }}
            tamanhoCelula={TAM}
            contornosSelecionaveis={areasInteracao?.contornosSelecionaveis ?? []}
            alcas={areasAlcas ?? []}
            onPointerDownMapa={areaPointerDown}
            onPointerMoveMapa={areaPointerMove}
            onPointerUpMapa={areaPointerUp}
            onPointerCancelMapa={areaPointerCancel}
            onSelecionarArea={areasInteracao?.onSelecionar ?? (() => {})}
            onCandidatoSelecao={areasInteracao?.onCandidatoSelecao ?? (() => {})}
            onAlcaPointerDown={alcaPointerDown}
            onAlcaPointerMove={alcaPointerMove}
            onAlcaPointerUp={alcaPointerUp}
            onAlcaPointerCancel={alcaPointerCancel}
            onAlcaMoverPara={onAreaAlcaMover ?? (() => {})}
          />
        )}
      </g>
    </svg>

    {/* Dica de waypoint durante o arraste de token — mesmas classes
        visuais do balão de instrução de Medir (`.rv-flutuante
        .rv-submenu .rv-sub-info`, em `VttClient.tsx`), pra manter a
        mesma linguagem visual sem precisar subir o estado `arrasto`
        (local a este componente) pro pai. Nunca aparece ao mesmo
        tempo que a de Medir — só existe enquanto um token está sendo
        arrastado, e isso só acontece com "interagir" ativa. */}
    {arrasto && (
      <div className="rv-flutuante rv-submenu" role="status">
        <span className="rv-sub-info">Q: adicionar ponto · Backspace: remover ponto · Esc: cancelar</span>
      </div>
    )}

    {/* Hint de mapa — HTML, fora do SVG, de propósito (ver comentário
        acima de `hint`): tamanho de fonte fixo, nunca afetado por
        `zoom`. `position: fixed` com coordenadas de tela calculadas
        por `posicaoTooltip` (que já soma o deslocamento do cursor e
        inverte de lado perto da borda direita/inferior), por isso
        `transform: none` sobrepõe o `translate(14px,14px)` fixo que a
        folha de estilo aplica por padrão. */}
    {hint && (() => {
      const pos = posicaoTooltip(hint.x, hint.y);
      return (
        <div
          className="rv-tooltip-terreno"
          role="status"
          style={{ left: pos.left, top: pos.top, transform: "none" }}
        >
          <strong>{hint.titulo}</strong>
          {hint.classificacao && <span>{hint.classificacao}</span>}
          {hint.detalhes?.map((d, i) => <span key={i}>{d}</span>)}
          {hint.efeito && <span>{hint.efeito}</span>}
        </div>
      );
    })()}
    </>
  );
}

function estadoVisual(
  t: TokenApresentacao,
  fn: (t: TokenApresentacao) => EstadoVisualToken,
  selecionadoId: string | null,
  hoverId: string | null,
  alvoIds: string[],
): EstadoVisualToken {
  const base = fn(t);
  return {
    ...base,
    // `base.selecionado` vem de `estadoPorToken` (VttClient), que lê o
    // CONJUNTO inteiro (`selecionadosIds`) — é ele quem sabe de seleção
    // múltipla. `selecionadoId` é só o token em FOCO (o do HUD, o da
    // alça de rotação), sempre um só.
    //
    // Sobrescrever por `selecionadoId === t.id` — que era o que estava
    // aqui — jogava o conjunto fora a cada render: shift-clique e
    // seleção por caixa marcavam N tokens no estado e o mapa desenhava
    // contorno em UM. Na tela, seleção múltipla simplesmente não
    // existia. A união é o certo: quem está no conjunto está
    // selecionado, e o token em foco também (garante o contorno mesmo
    // para quem chama com um `estadoPorToken` que não conhece o
    // conjunto — o harness visual, por exemplo).
    selecionado: base.selecionado || selecionadoId === t.id,
    sobCursor: hoverId === t.id,
    alvo: alvoIds.includes(t.id),
  };
}

/**
 * Um token.
 *
 * Acessibilidade: nenhum estado depende SÓ de cor. Lado vem da FORMA do
 * anel (PJ = anel contínuo, PN = anel serrilhado, neutro = tracejado),
 * "já agiu" vem de dessaturação + barra diagonal, "turno atual" vem de
 * anel duplo animado + cunha, alvo vem de retículo. Cor reforça, nunca
 * carrega sozinha.
 */
function Token({
  token,
  estado,
  opacoReduzido,
  ferramenta,
  onSelecionar,
  onHover,
  onIniciarArrasto,
  onIniciarMedicao,
  movimentoVisual,
  onAnimacaoConcluida,
  elegívelParaAlcaRotacao,
  estadoAlcaRotacao,
  onIniciarAlcaRotacao,
  onMoverAlcaRotacao,
  onSoltarAlcaRotacao,
  onCancelarAlcaRotacao,
  onTeclaAlcaRotacao,
}: {
  token: TokenApresentacao;
  estado: EstadoVisualToken;
  opacoReduzido?: boolean;
  ferramenta?: PropsMapaHex["ferramenta"];
  onSelecionar: (id: string, aditivo: boolean) => void;
  onHover: (id: string | null, ancora?: { x: number; y: number; width: number; height: number }) => void;
  /** Devolve SE o arrasto começou — o `pointerdown` precisa disso pra saber se pode adiar a decisão sobre a seleção (ver o handler). */
  onIniciarArrasto?: () => boolean;
  onIniciarMedicao?: (clientX: number, clientY: number) => void;
  movimentoVisual?: MovimentoVisualToken;
  onAnimacaoConcluida?: (tokenId: string, movementId: string, destino?: Hex) => void;
  /** Já considera ferramenta/posicionamento/animação/seleção-única/autorização — só falta a checagem de SIMETRIA, que este componente já sabe fazer da própria pegada. */
  elegívelParaAlcaRotacao?: boolean;
  /** Não-nulo só enquanto ESTE token específico está sendo arrastado pela alça. */
  estadoAlcaRotacao?: { emGesto: boolean; orientacaoAtual: number; valida: boolean } | null;
  onIniciarAlcaRotacao?: (e: React.PointerEvent) => void;
  onMoverAlcaRotacao?: (e: React.PointerEvent) => void;
  onSoltarAlcaRotacao?: (e: React.PointerEvent) => void;
  onCancelarAlcaRotacao?: (e: React.PointerEvent) => void;
  /** ArrowRight/E, ArrowLeft/Q, Home, Escape — teclado real, não um segundo caminho paralelo: chama a MESMA `onRotacaoAlcaSolta` que o gesto de ponteiro usa. */
  onTeclaAlcaRotacao?: (e: React.KeyboardEvent) => void;
}) {
  const gRef = useRef<SVGGElement>(null);
  useAnimacaoToken({
    gRef,
    movimento: movimentoVisual,
    tamanhoCelula: TAM,
    onConcluido: (movementId) => onAnimacaoConcluida?.(token.id, movementId, movimentoVisual?.destino),
  });

  // A ÂNCORA (`token.pos`) continua sendo o que `useAnimacaoToken`
  // anima via `translate` no `<g>` raiz — zero mudança nesse mecanismo.
  // A pegada e a origem mecânica são desenhadas em coordenadas LOCAIS
  // (relativas à âncora), então a animação move a entidade inteira
  // como um corpo rígido de graça, sem saber que existe uma pegada.
  // Âncora + deslocamento sub-célula: com a grade escondida o token
  // para ONDE foi solto, em vez de saltar pro centro do hex.
  // `hexParaPixel` já aceita coordenada fracionária (é o que
  // `origemMecanica` usa), então isto não é um caminho novo de desenho.
  const p = hexParaPixel({ q: token.pos.q + (token.offset?.q ?? 0), r: token.pos.r + (token.offset?.r ?? 0) }, TAM);
  const pegada = useMemo(
    () => pegadaEfetiva({ categoria: token.tamanho, orientacao: token.orientacao, pegadaPersonalizada: token.pegadaPersonalizada }),
    [token.tamanho, token.orientacao, token.pegadaPersonalizada],
  );
  const origemLocal = hexParaPixel(origemMecanica(pegada), TAM);
  const multicelular = pegada.length > 1;
  // Alça de rotação: qualquer token que já passou por TODAS as outras
  // condições (ferramenta/posicionamento/animação/seleção-única/
  // autorização, decididas por quem chama) mostra a alça — pegada
  // simétrica não é mais motivo pra escondê-la.
  const mostrarAlca = !!elegívelParaAlcaRotacao;
  const emGestoDeRotacao = !!estadoAlcaRotacao?.emGesto;
  // Enquanto a alça está sendo arrastada, TUDO que depende de
  // orientação (pegada desenhada, indicador de direção, a própria
  // alça) usa a CANDIDATA local — nunca a persistida — sem tocar
  // `token.orientacao` de verdade até o servidor confirmar.
  const orientacaoExibida = emGestoDeRotacao ? estadoAlcaRotacao!.orientacaoAtual : token.orientacao;
  const pegadaExibida = emGestoDeRotacao
    ? pegadaEfetiva({ categoria: token.tamanho, orientacao: orientacaoExibida, pegadaPersonalizada: token.pegadaPersonalizada })
    : pegada;
  const corGestoRotacao = emGestoDeRotacao ? (estadoAlcaRotacao!.valida ? "#22d3aa" : "#ff5f74") : null;
  // Âncora frontal: ANCORADA numa aresta real da pegada exibida (nunca
  // um ângulo solto ao redor do corpo) — indicador, halo e alça de
  // rotação todos derivam daqui, então giram e trocam de aresta juntos
  // conforme a pegada muda (tamanho, orientação, prévia de rotação).
  const origemMecanicaExibida = useMemo(() => origemMecanica(pegadaExibida), [pegadaExibida]);
  const ancoraFrontal = useMemo(
    () => ancoraFrontalDaPegada(pegadaExibida, origemMecanicaExibida, orientacaoExibida, TAM),
    [pegadaExibida, origemMecanicaExibida, orientacaoExibida],
  );
  const escala = TAMANHOS[token.tamanho].escala;
  const raio = TAM * 0.82 * escala;
  const cor = COR_VERTENTE[token.vertente];
  const incapaz = token.condicoes.includes("inconsciente");
  // PV é opcional (`null` = narrador nunca definiu pra este token) —
  // a barra some por completo em vez de fingir 0/0.
  const temPv = token.pv !== null && token.pvMax !== null && token.pvMax > 0;
  const pctPv = temPv ? Math.max(0, Math.min(1, token.pv! / token.pvMax!)) : 0;

  const classes = [
    "rv-token",
    `rv-token--${token.lado}`,
    estado.selecionado ? "is-sel" : "",
    estado.sobCursor ? "is-hover" : "",
    estado.turnoAtual ? "is-turno" : "",
    estado.jaAgiu ? "is-agiu" : "",
    estado.podeAgir ? "is-apto" : "",
    estado.alvo ? "is-alvo" : "",
    incapaz ? "is-incapaz" : "",
    // Só chega aqui pro NARRADOR — a linha nem existe no payload de um
    // jogador quando oculta (RLS de `vtt_tokens_select`, migration
    // 0065), então `token.visivel === false` só é alcançável em
    // sessão de narrador. Nunca por cor sozinha: tracejado + rótulo.
    !token.visivel ? "is-oculto" : "",
  ].filter(Boolean).join(" ");

  return (
    <g
      ref={gRef}
      className={classes}
      data-token-id={token.id}
      // Enquanto uma animação está ativa pra este token, o `transform`
      // fica FORA do controle declarativo do React — `useAnimacaoToken`
      // escreve nele diretamente a cada frame. Passar `undefined` aqui
      // (em vez de recalcular `translate(p.x,p.y)`) é o que impede a
      // reconciliação de re-render (por hover, seleção, etc.) brigar
      // com essas escritas imperativas: o valor do prop não muda entre
      // esses renders, então o React nunca toca o atributo real. No
      // frame em que a animação termina, o hook já deixou o `<g>`
      // EXATAMENTE no destino antes de avisar quem chama — a troca de
      // volta pro modo declarativo (quando `movimentoVisual` some) cai
      // na mesma posição, sem salto.
      transform={movimentoVisual ? undefined : `translate(${p.x} ${p.y})`}
      opacity={opacoReduzido ? 0.35 : undefined}
      tabIndex={0}
      role="button"
      aria-label={`${token.nome}, ${token.lado === "pj" ? "aliado" : token.lado === "pn" ? "hostil" : "neutro"}${temPv ? `, PV ${token.pv} de ${token.pvMax}` : ""}${token.condicoes.length ? `, condições: ${token.condicoes.map((c) => CONDICOES[c].rotulo).join(", ")}` : ""}${token.visivel ? "" : ", oculto"}`}
      // Seleção + início de arraste no MESMO evento (pointerdown), não
      // em onClick — onClick dispararia DE NOVO no soltar do mesmo
      // gesto (mousedown+mouseup no mesmo alvo geram click), chamando
      // onSelecionar duas vezes por interação.
      //
      // Com Medir ativa, o pointerdown sobre um token NUNCA seleciona
      // nem inicia arraste — vira origem de medição (centro do hex do
      // token), como qualquer outra célula. Em qualquer outra
      // ferramenta o comportamento de sempre continua intocado.
      //
      // Com uma animação de movimento ativa, o token AINDA pode ser
      // selecionado (mantém o HUD/ficha associados a ele) mas nunca
      // inicia um NOVO arraste — evita duas rotas/animações
      // competindo pelo mesmo token ao mesmo tempo.
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        if (ferramenta === "medir") { onIniciarMedicao?.(e.clientX, e.clientY); return; }
        // Pressionar um token QUE JÁ ESTÁ SELECIONADO, dentro de uma
        // seleção múltipla, NÃO colapsa a seleção aqui: colapsar seria
        // desfazer o grupo exatamente no gesto que existe pra movê-lo
        // (o `pointerdown` acontece antes de qualquer arrasto, então
        // não dá pra "ver depois" que era um arrasto). A decisão fica
        // pro fim do gesto: soltar SEM ter andado colapsa a seleção
        // neste token (ver `soltar()`), soltar depois de andar move o
        // grupo. Shift continua sendo alternância, sempre.
        const comecouArrasto = !movimentoVisual && (onIniciarArrasto?.() ?? false);
        if (estado.selecionado && !e.shiftKey && comecouArrasto) return;
        onSelecionar(token.id, e.shiftKey);
      }}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelecionar(token.id, e.shiftKey); } }}
      onMouseEnter={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        onHover(token.id, { x: r.x, y: r.y, width: r.width, height: r.height });
      }}
      onMouseLeave={() => onHover(null)}
    >
      {/* Pegada: realce discreto de TODA célula ocupada, em coordenadas
          LOCAIS (relativas à âncora — nunca `pointerEvents="none"`:
          clicar em qualquer célula da pegada precisa selecionar o
          MESMO token, não vazar pro terreno por baixo). Só desenhada
          pra pegadas multicelulares — pequeno/médio continuam só o
          marcador central, sem mudança visual nenhuma. */}
      {multicelular && (
        // Em gesto de rotação: mostra a pegada CANDIDATA (não a
        // persistida) em verde/vermelho — "a prévia deve atualizar a
        // pegada inteira do token", nunca só um indicador de direção
        // isolado. Fora de gesto, exatamente o visual de sempre. A
        // espessura NÃO reage mais à seleção — isso agora é o
        // contorno de perímetro logo abaixo, sem arestas internas.
        <g className="rv-token-pegada" data-em-gesto-rotacao={emGestoDeRotacao || undefined}>
          {pegadaExibida.map((offset, i) => {
            const lp = hexParaPixel(offset, TAM);
            const corCelula = corGestoRotacao ?? cor;
            return (
              <g key={i} transform={`translate(${lp.x} ${lp.y})`}>
                <path d={hexPath(TAM - 1.5)} fill={`${corCelula}${emGestoDeRotacao ? "33" : "1f"}`} stroke={corCelula}
                  strokeWidth={emGestoDeRotacao ? 2 : 1.2} strokeOpacity={emGestoDeRotacao ? 0.9 : 0.6}
                  strokeDasharray={emGestoDeRotacao ? "5 3" : undefined} />
              </g>
            );
          })}
        </g>
      )}

      {/* Contorno de SELEÇÃO — perímetro externo da pegada realmente
          ocupada (`contornoDaPegada`, união por cancelamento de arestas
          compartilhadas), nunca a bounding box. Cobre pequeno/médio (o
          próprio hex) e multicelulares (só o perímetro, sem grade
          interna) com o MESMO mecanismo — nenhum caso especial por
          tamanho. Usa `pegadaExibida`: acompanha a prévia de rotação
          em tempo real, sem esperar a RPC. Puramente visual — nunca
          intercepta clique/arrasto/rotação (a própria pegada, alguns
          pixels abaixo na árvore, é quem continua respondendo a isso). */}
      {estado.selecionado && (
        <g className="rv-token-contorno-selecao" pointerEvents="none">
          {contornoDaPegada(pegadaExibida, TAM).map((d, i) => (
            <g key={i}>
              <path d={d} fill="none" stroke="#0b141c" strokeWidth={4.5} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
              <path d={d} fill="none" stroke="#7fe3ff" strokeOpacity={0.65} strokeWidth={2} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
            </g>
          ))}
        </g>
      )}

      {/* Marcador central — na ORIGEM MECÂNICA (pode cair entre
          células, ex.: Grande), nunca arbitrariamente numa das células
          da pegada. Todo o conteúdo que já existia (sombra, aura,
          retrato, PV, condições…) continua aqui dentro, intocado. */}
      <g transform={`translate(${origemLocal.x} ${origemLocal.y})`}>
      {/* sombra de contato */}
      <ellipse cx={0} cy={raio * 0.72} rx={raio * 0.78} ry={raio * 0.26} fill="#04070b" opacity="0.6" />

      {/* aura de turno — anel duplo, só quem está agindo */}
      {estado.turnoAtual && (
        <>
          <circle r={raio + 7} className="rv-token-aura" fill="none" stroke={cor} strokeWidth="1.6" filter="url(#rv-brilho)" />
          <path d={`M0,${-raio - 12} l6,-9 l-12,0 Z`} fill={cor} className="rv-token-cunha" />
        </>
      )}

      {/* base */}
      <circle r={raio} fill="#0d141b" stroke={cor} strokeWidth={estado.selecionado ? 3 : 2}
        strokeDasharray={token.lado === "neutro" ? "5 4" : undefined} />
      {/* PN: anel serrilhado por FORMA (não só cor) */}
      {token.lado === "pn" && (
        <circle r={raio - 3.5} fill="none" stroke={cor} strokeWidth="1.4" strokeDasharray="2 3" opacity="0.9" />
      )}

      {/* ── Retrato ───────────────────────────────────────────────────
          A imagem REAL quando existe; a silhueta procedural quando não.
          Até aqui o mapa desenhava só a silhueta — o retrato do token
          aparecia no HUD e em lugar nenhum no tabuleiro, que é onde ele
          serve para alguma coisa: distinguir cinco tokens de relance é
          o trabalho da cara, não da sigla.

          `token.retrato` já chega resolvido por `tokenApresentacaoDe`:
          arquivo próprio, endereço externo, ou o avatar HERDADO da
          ficha (0105). O mapa não conhece essa precedência e não
          deveria — para ele é uma URL ou nada. */}
      {/* O recorte encosta na borda: `raio - LARGURA_ANEL / 2` é a margem
          INTERNA do anel, não uma folga arbitrária. Com retrato, cada
          pixel que sobra de fundo é rosto que não coube — e o disco é
          pequeno na tela, então não há de onde tirar. A silhueta
          procedural usa o mesmo recorte e não perde nada com isso. */}
      <clipPath id={`clip-${token.id}`}><circle r={raio - (estado.selecionado ? 1.5 : 1)} /></clipPath>
      <g clipPath={`url(#clip-${token.id})`}>
        {token.retrato ? (
          <image
            href={token.retrato}
            x={-raio} y={-raio} width={raio * 2} height={raio * 2}
            // `slice`: o recorte é quadrado e o destino é círculo, então
            // preencher e cortar é o certo — `meet` deixaria faixa de
            // fundo aparecendo dentro do disco.
            preserveAspectRatio="xMidYMid slice"
            pointerEvents="none"
          />
        ) : (
          <>
            <rect x={-raio} y={-raio} width={raio * 2} height={raio * 2} fill={`${cor}1f`} />
            <circle cx={0} cy={-raio * 0.18} r={raio * 0.34} fill={cor} opacity="0.55" />
            <ellipse cx={0} cy={raio * 0.62} rx={raio * 0.58} ry={raio * 0.46} fill={cor} opacity="0.42" />
          </>
        )}
      </g>
      {/* A sigla é o retrato de quem não tem retrato. Com imagem ela sai
          de cena inteira — nem carimbo no meio da cara, nem faixa no
          rodapé comendo um terço do disco. Quem precisa do nome tem o
          rótulo do token, o HUD ao selecionar e o hover; o disco é
          pequeno demais para carregar as duas coisas. */}
      {!token.retrato && (
        <text className="rv-token-sigla" y={raio * 0.16} textAnchor="middle" style={{ fontSize: raio * 0.62 }}>
          {token.sigla}
        </text>
      )}

      {/* ── Orientação, setor traseiro e alça de rotação — DELIBERADAMENTE
          antes dos rótulos/indicadores abaixo (PV, condições, cadeado,
          OCULTO): rótulo sempre acima do que descreve (seção 6) — um
          token virado pro sul não pode ter a cunha ou a alça cobrindo
          a fileira de condições. */}
      {(() => {
        // Fallback defensivo — só acionado se `ancoraFrontalDaPegada`
        // devolver `null` (pegada vazia, o que nunca deveria acontecer
        // na prática: todo token tem ao menos a própria célula). Mesma
        // conta antiga, só pra nunca deixar de renderizar nada.
        const direcaoBruta = hexParaPixel(hexRotacionar({ q: 1, r: 0 }, orientacaoExibida), TAM);
        const normaBruta = Math.hypot(direcaoBruta.x, direcaoBruta.y) || 1;
        const angBruto = Math.atan2(direcaoBruta.y / normaBruta, direcaoBruta.x / normaBruta);

        // Ângulo visual: da ARESTA real escolhida (indicador/halo/alça
        // giram e trocam de aresta juntos), nunca de um ângulo solto
        // ao redor do corpo — ver `ancoraFrontalDaPegada` em `hex.ts`.
        const ang = ancoraFrontal?.anguloVisual ?? angBruto;
        const ux = Math.cos(ang), uy = Math.sin(ang);
        const perpX = Math.cos(ang + Math.PI / 2) * 3.5, perpY = Math.sin(ang + Math.PI / 2) * 3.5;
        // Ponto médio da aresta frontal, convertido pro referencial
        // LOCAL deste `<g>` (que já está transladado pra `origemLocal`
        // — ver o `<g transform=...>` logo acima na árvore).
        const meioLocal = ancoraFrontal
          ? { x: ancoraFrontal.pontoMedio.x - origemLocal.x, y: ancoraFrontal.pontoMedio.y - origemLocal.y }
          : { x: ux * (raio + 5), y: uy * (raio + 5) };
        const alcaLocal = ancoraFrontal
          ? { x: ancoraFrontal.posicaoAlca.x - origemLocal.x, y: ancoraFrontal.posicaoAlca.y - origemLocal.y }
          : { x: ux * (raio + 22), y: uy * (raio + 22) };
        // Indicador: pequena farpa saindo da própria aresta, apontando
        // pela normal — nunca mais o "raio do corpo + 5px" solto.
        const pontaX = meioLocal.x + ux * 5, pontaY = meioLocal.y + uy * 5;

        // Halo frontal — faixa curva translúcida ao redor da borda do
        // token, centralizada na MESMA direção da aresta frontal
        // (~120° de abertura). Puramente VISUAL — a forma circular não
        // representa uma área mecânica precisa; a região oposta ao
        // halo é implicitamente "as costas", sem marca nenhuma
        // desenhada ali. Visível só em hover/seleção de QUALQUER
        // usuário (ajuda a interpretar a orientação, não é uma trava)
        // — nunca aplica vantagem sozinho, nunca dispara requisição.
        const mostrarHalo = estado.selecionado || estado.sobCursor;
        const raioHalo = raio + 5;
        const circunferenciaHalo = 2 * Math.PI * raioHalo;
        const arcoHalo = circunferenciaHalo / 3; // 120°
        const dashHalo = `${arcoHalo} ${circunferenciaHalo - arcoHalo}`;
        // `stroke-dasharray` num círculo começa no ângulo 0 (leste) e
        // segue no sentido horário — pra centralizar os 120° em `ang`,
        // o giro precisa começar 60° antes dele.
        const anguloHaloGraus = (ang * 180) / Math.PI - 60;

        const corAlca = corGestoRotacao ?? "#35c8f0";

        return (
          <>
            {mostrarHalo && (
              <g className="rv-token-halo-frontal" pointerEvents="none">
                {/* Contorno escuro por trás — garante contraste em terreno claro, escuro, colorido ou hachurado por baixo. */}
                <circle
                  r={raioHalo} fill="none" stroke="#0b141c" strokeWidth={7}
                  strokeDasharray={dashHalo} strokeLinecap="round"
                  transform={`rotate(${anguloHaloGraus})`}
                />
                <circle
                  r={raioHalo} fill="none" stroke={corGestoRotacao ?? cor} strokeWidth={4} opacity={0.55}
                  strokeDasharray={dashHalo} strokeLinecap="round"
                  transform={`rotate(${anguloHaloGraus})`}
                />
              </g>
            )}

            {/* orientação — farpa curta na aresta frontal da pegada
                (orientação 0 = leste, rotacionada como a própria
                pegada). TODO token tem — mesmo pegada simétrica
                (Pequeno/Médio/Enorme) só muda pra qual direção está
                "olhando", nunca a forma ocupada. */}
            <path
              className="rv-token-orientacao"
              pointerEvents="none"
              d={`M${pontaX} ${pontaY} L${meioLocal.x + perpX} ${meioLocal.y + perpY} L${meioLocal.x - perpX} ${meioLocal.y - perpY} Z`}
              fill={corGestoRotacao ?? cor} stroke="#0b141c" strokeWidth="1"
            />

            {/* ── Alça de rotação — todo token ÚNICO selecionado,
                autorizado, ferramenta "Interagir", sem posicionamento de
                token novo nem animação em andamento (tudo decidido por
                quem chama) — pegada simétrica também gira. Um pequeno
                círculo um pouco ALÉM da mesma aresta frontal, ligado
                por um conector curto que começa NA aresta (nunca no
                centro do token — em multicelulares grandes isso
                cruzaria a própria pegada) — mesma direção canônica do
                indicador acima, só mais afastado, pra nunca competir
                visualmente com ele nem com o clique de seleção/arrasto
                do próprio token. Alvo de toque maior que o círculo
                visível (`rv-token-alca-rotacao-toque`, raio maior,
                transparente) — mouse, caneta, touch E teclado (foco +
                setas/E/Q/Home) usam o MESMO elemento. */}
            {mostrarAlca && onIniciarAlcaRotacao && (
              <g className="rv-token-alca-rotacao" data-valida={emGestoDeRotacao ? estadoAlcaRotacao!.valida : undefined}>
                <line x1={meioLocal.x} y1={meioLocal.y} x2={alcaLocal.x} y2={alcaLocal.y}
                  stroke={corAlca} strokeWidth="1.5" strokeDasharray="2 2" opacity="0.85" pointerEvents="none" />
                <circle cx={alcaLocal.x} cy={alcaLocal.y} r={4.5} fill={corAlca} stroke="#0b141c" strokeWidth="1.2" pointerEvents="none" />
                {/* Alvo de toque — bem maior que o círculo visível, cobre o próprio círculo. */}
                <circle
                  className="rv-token-alca-rotacao-toque"
                  cx={alcaLocal.x} cy={alcaLocal.y} r={13}
                  fill="transparent"
                  role="slider"
                  tabIndex={0}
                  aria-label={`Rotacionar ${token.nome}`}
                  aria-valuemin={0} aria-valuemax={5} aria-valuenow={orientacaoExibida}
                  aria-valuetext={`Orientação ${orientacaoExibida + 1} de 6`}
                  style={{ cursor: emGestoDeRotacao ? "grabbing" : "grab" }}
                  onPointerDown={(e) => { if (e.button === 0) onIniciarAlcaRotacao(e); }}
                  onPointerMove={onMoverAlcaRotacao}
                  onPointerUp={onSoltarAlcaRotacao}
                  onPointerCancel={onCancelarAlcaRotacao}
                  onLostPointerCapture={onCancelarAlcaRotacao}
                  onKeyDown={onTeclaAlcaRotacao}
                />
              </g>
            )}
          </>
        );
      })()}

      {/* barra de PV — só quando o narrador definiu um valor pra este token */}
      {temPv && (
        <g className="rv-token-pv" transform={`translate(${-raio * 0.8} ${-raio - 8})`}>
          <rect width={raio * 1.6} height={4} rx={0.5} fill="#0a0f14" stroke="#000" strokeWidth="0.4" />
          <rect width={raio * 1.6 * pctPv} height={4} rx={0.5}
            fill={pctPv > 0.6 ? "#22d3aa" : pctPv > 0.3 ? "#f5a200" : "#ff5f74"} />
        </g>
      )}

      {/* já agiu: dessaturação + barra diagonal */}
      {estado.jaAgiu && !estado.turnoAtual && (
        <>
          <circle r={raio} fill="#070b10" opacity="0.5" />
          <line x1={-raio * 0.75} y1={raio * 0.75} x2={raio * 0.75} y2={-raio * 0.75} stroke="#8fa3b0" strokeWidth="2" opacity="0.85" />
        </>
      )}

      {/* fragmentado: meia-lua âmbar (PA guardado) */}
      {estado.fragmentado && (
        <path d={`M${raio * 0.55},${-raio * 0.55} a${raio * 0.4},${raio * 0.4} 0 1,1 -0.1,0`} fill="none" stroke="#f5a200" strokeWidth="2.4" strokeDasharray="3 2" />
      )}

      {/* oculto: SÓ o narrador chega aqui (ver `classes` acima) — anel
          tracejado próprio + rótulo textual, nunca só opacidade/cor
          (que já é usada por "já agiu"). */}
      {!token.visivel && (
        <g className="rv-token-oculto">
          <circle r={raio + 2} fill="none" stroke="#8fa3b0" strokeWidth="1.4" strokeDasharray="1 4" opacity="0.85" />
          <g transform={`translate(0 ${-raio - 20})`}>
            <rect x={-22} y={-8} width={44} height={14} rx={3} fill="#0b141c" opacity="0.9" />
            <text textAnchor="middle" y={2.5} fontSize="8.5" fontFamily="monospace" letterSpacing="0.08em" fill="#8fa3b0">OCULTO</text>
          </g>
        </g>
      )}

      {/* travado: glifo de cadeado — nunca só uma borda diferente */}
      {token.bloqueado && (
        <g className="rv-token-travado" transform={`translate(${raio * 0.66} ${raio * 0.66})`}>
          <circle r={7} fill="#0d141b" stroke="#f5a200" strokeWidth="1" />
          <text textAnchor="middle" y={2.6} fontSize="8" fill="#f5a200">🔒</text>
        </g>
      )}

      {/* apto a agir: pontilhado externo pulsante */}
      {estado.podeAgir && !estado.turnoAtual && (
        <circle r={raio + 4} fill="none" stroke={cor} strokeWidth="1.2" strokeDasharray="2 5" opacity="0.75" className="rv-token-apto" />
      )}

      {/* alvo: retículo */}
      {estado.alvo && (
        <g className="rv-token-alvo" stroke="#ff5f74" strokeWidth="1.8" fill="none">
          <circle r={raio + 10} strokeDasharray="10 8" />
          <line x1={-raio - 15} y1={0} x2={-raio - 5} y2={0} /><line x1={raio + 5} y1={0} x2={raio + 15} y2={0} />
          <line x1={0} y1={-raio - 15} x2={0} y2={-raio - 5} /><line x1={0} y1={raio + 5} x2={0} y2={raio + 15} />
        </g>
      )}

      {/* Origem de Aura escolhida — anel próprio, DELIBERADAMENTE fora
          do raio do halo frontal (r+5), do apto (r+4) e do alvo
          (r+10): nunca compete visualmente com nenhum deles. Cor ciano
          (`--cy`) reaproveitada da própria ferramenta Áreas — mesma
          identidade do realce de candidato ao snap e do marcador de
          token capturado na guia de arrasto — nunca vermelho (que já
          significa "alvo") nem a cor própria do token (que já
          significa "orientação"/"seleção"). Contorno escuro por baixo
          garante contraste em terreno claro OU escuro. `pointerEvents:
          none` inteiro — nunca intercepta o clique que a camada de
          captura de Áreas já trata. */}
      {estado.origemDeAura && (
        <g className="rv-token-origem-aura" pointerEvents="none">
          <circle r={raio + 13} fill="none" stroke="#0b141c" strokeWidth={4.5} strokeDasharray="6 5" opacity={0.85} />
          <circle r={raio + 13} fill="none" stroke="#35c8f0" strokeWidth={2.2} strokeDasharray="6 5" />
        </g>
      )}

      {/* incapaz */}
      {incapaz && (
        <g stroke="#ff5f74" strokeWidth="2.6" opacity="0.95">
          <line x1={-raio * 0.6} y1={-raio * 0.6} x2={raio * 0.6} y2={raio * 0.6} />
          <line x1={raio * 0.6} y1={-raio * 0.6} x2={-raio * 0.6} y2={raio * 0.6} />
        </g>
      )}

      {/* condições: glifos em arco embaixo */}
      {token.condicoes.length > 0 && (
        <g className="rv-token-condicoes" transform={`translate(0 ${raio + 11})`}>
          {token.condicoes.slice(0, 4).map((c, i, arr) => {
            const larg = 13;
            const x = (i - (arr.length - 1) / 2) * larg;
            return (
              <g key={c} transform={`translate(${x} 0)`}>
                <circle r={5.6} fill="#0d141b" stroke="#f5a200" strokeWidth="1" />
                <text className="rv-token-cond" textAnchor="middle" y={2.4}>{CONDICOES[c].glifo}</text>
              </g>
            );
          })}
        </g>
      )}

      </g>
    </g>
  );
}
