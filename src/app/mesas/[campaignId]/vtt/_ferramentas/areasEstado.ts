/**
 * Máquina de estados da ferramenta ÁREAS — PURA, sem React, DOM ou
 * banco. Um único valor descreve em que ponto do fluxo a ferramenta
 * está; nunca um punhado de booleans paralelos que possam se
 * contradizer (o mesmo desenho que `EstadoMedicao` já usa em
 * `_mapa/MapaHex.tsx`, levado a sério para um fluxo bem maior).
 *
 * As fases, e o que cada uma significa aqui:
 *
 *   ociosa                    — nada em curso; clicar no contorno de
 *                               uma área a seleciona.
 *   escolhendo_token_da_aura  — o tipo Aura está ativo e o gesto espera
 *                               um TOKEN (não um ponto solto). Só esta
 *                               fase captura clique de token, e nela o
 *                               clique nunca seleciona/move/gira o token.
 *   pressionada               — o ponteiro desceu, mas ainda não cruzou
 *                               o limiar de arraste: NADA é desenhado, e
 *                               soltar aqui não cria geometria degenerada
 *                               ("clique simples sem deslocamento não
 *                               cria nada").
 *   arrastando                — arraste em curso; os parâmetros
 *                               acompanham o ponteiro, e o gesto carrega
 *                               tudo que a interface precisa desenhar a
 *                               guia (ver `GestoArea`).
 *   pontos                    — percurso por cliques (Parede e
 *                               Personalizada), com o ponto sob o cursor
 *                               como prévia da próxima aresta.
 *   concluida_local           — geometria pronta LOCALMENTE: aparecem
 *                               "Manter na mesa" e "Descartar". Nada foi
 *                               ao banco ainda.
 *   editando                  — área persistida sendo alterada; guarda a
 *                               ÚLTIMA VERSÃO CONFIRMADA pra `Esc`
 *                               restaurar.
 *   persistindo               — RPC em voo.
 *   erro                      — a persistência falhou; os parâmetros são
 *                               preservados pra nova tentativa, nunca
 *                               descartados em silêncio.
 *
 * "escolhendo_tipo" e "persistida" NÃO são fases deste estado, de
 * propósito: escolher tipo é apenas `config.tipo` (nenhum gesto em
 * curso — a fase continua `ociosa`), e uma área persistida vive em
 * `estadoCena.areas`, não aqui — duplicar isso criaria duas verdades
 * sobre a mesma área.
 */

import {
  type CorArea, type ModoLinha, type ParametrosArea, type PontoAxial, type TipoArea, type Veredito,
  MINIMO_DIMENSAO_M, normalizarParametros, validarParametros, validarPercursoParede, validarPoligonoPersonalizado,
} from "../_dominio/areaEfeito";
import { axialParaMundo, metrosParaMundo, mundoParaAxial, mundoParaMetros } from "../_dominio/escalaMapa";
import {
  PASSO_SNAP_DIRECAO_GRAUS, arredondarDimensao, formatarMetros, normalizarGraus, snapAngular, tipoTemDirecao,
} from "./areasSnap";

/**
 * Deslocamento mínimo em pixels de TELA para um gesto virar arraste.
 * Mesmo valor que `LIMIAR_ARRASTO_PX` de `_mapa/MapaHex.tsx` usa pra
 * distinguir clique de arraste em token, medição, pan e alça de
 * rotação — a mesa inteira precisa concordar sobre o que é um clique.
 */
export const LIMIAR_ARRASTO_AREA_PX = 6;

/** Reexportado de `areasSnap.ts` — uma única definição do passo, consumida por painel, gesto e testes. */
export { PASSO_SNAP_DIRECAO_GRAUS };

/**
 * Campos do painel que participam da geometria ou da apresentação. O
 * gesto no mapa define origem, direção e a dimensão principal; tudo
 * que o gesto NÃO consegue expressar (largura da faixa, modo da linha,
 * altura, cor…) vem daqui.
 */
export interface ConfigAreas {
  tipo: TipoArea;
  /** Faixa. */
  larguraFaixaM: number;
  /** Linha. */
  modoLinha: ModoLinha;
  /** Parede. */
  alturaParedeM: number;
  /** Esfera/Domo — opcional; `null` = não declarada. */
  alturaVolumeM: number | null;
  /** Esfera/Domo — superfície/nível de origem; `null` = não declarado. */
  nivelOrigemM: number | null;
  /** Aura — definida por campo, não por arraste. */
  raioAuraM: number;
  /** Aura — token de origem escolhido. */
  tokenAuraId: string | null;
  cor: CorArea;
  opacidade: number;
  rotulo: string;
  visivel: boolean;
  /**
   * Trava a direção em múltiplos de `PASSO_SNAP_DIRECAO_GRAUS`.
   * LIGADO por padrão: quase toda área de Ruptura é declarada numa
   * direção "redonda", e a direção livre continua a um clique de
   * distância.
   */
  snapDirecao: boolean;
  /**
   * Fixa a origem do gesto no token elegível mais próximo
   * (`_ferramentas/areasSnap.ts`). DESLIGADO por padrão: altera
   * diretamente o ponto escolhido pelo usuário, então precisa ser uma
   * decisão consciente. Não se aplica à Aura, que é sempre presa a um
   * token por definição.
   */
  snapOrigemToken: boolean;
  /**
   * Fixa a origem do gesto no CENTRO do hexágono clicado
   * (`resolverSnapCelula`). LIGADO por padrão — é o que faz um clique
   * "quase certo" produzir a mesma origem que um clique exato no
   * centro, sem exigir precisão de pixel. Opção INDEPENDENTE de
   * `snapOrigemToken` (chave distinta, padrão distinto): quando as
   * duas estão ligadas, token tem prioridade, célula é o
   * degrau seguinte (`resolverOrigemArea`). Não se aplica à Aura.
   */
  snapOrigemCelula: boolean;
}

export const CONFIG_AREAS_PADRAO: ConfigAreas = {
  tipo: "esfera",
  larguraFaixaM: 2,
  modoLinha: "uma_celula",
  alturaParedeM: 2,
  alturaVolumeM: null,
  nivelOrigemM: null,
  raioAuraM: 3,
  tokenAuraId: null,
  cor: "ciano",
  opacidade: 0.35,
  rotulo: "",
  visivel: true,
  snapDirecao: true,
  snapOrigemToken: false,
  snapOrigemCelula: true,
};

/**
 * Tudo que UM gesto de arraste carrega. Guardar o bruto E o efetivo
 * lado a lado é o que permite a guia visual desenhar de onde o dedo
 * DESCEU até onde ele ESTÁ, enquanto a geometria usa a origem já
 * capturada pelo snap e a dimensão já arredondada — sem que desenho e
 * cálculo precisem recalcular nada por conta própria (e sem risco de
 * divergirem).
 */
export interface GestoArea {
  /** Identifica o ponteiro deste gesto — captura, `pointercancel` e perda de captura precisam casar com ele. */
  pointerId: number;
  /** Onde o ponteiro DESCEU, sem snap nenhum. É a ponta fixa da guia visual. */
  origemBruta: PontoAxial;
  /** Origem que a GEOMETRIA usa — igual à bruta, ou a origem mecânica do token capturado. */
  origemEfetiva: PontoAxial;
  /** Token capturado pelo snap de origem, quando houve. */
  tokenCapturado: string | null;
  /** Onde o ponteiro ESTÁ, sem snap. É a ponta móvel da guia visual. */
  cursorBruto: PontoAxial;
  /** Ponto reprojetado depois do snap angular — é para cá que a geometria realmente aponta. */
  cursorEfetivo: PontoAxial;
  /** Dimensão principal em metros, sem arredondar. */
  dimensaoLivre: number;
  /** Dimensão principal em metros, já pela regra vigente (inteira, ou livre com modificador). */
  dimensaoArredondada: number;
  /** O modificador de precisão livre estava pressionado NO ÚLTIMO evento. */
  precisaoLivre: boolean;
  /** Posição de tela do `pointerdown` — só para o limiar de arraste. */
  inicioPx: { x: number; y: number };
}

export type EstadoAreas =
  | { fase: "ociosa" }
  /** Aura: esperando o usuário escolher o token de origem no mapa (ou pelo seletor). */
  | { fase: "escolhendo_token_da_aura" }
  /**
   * Aura: TOKEN JÁ ESCOLHIDO, raio ainda PENDENTE. Não é geometria
   * concluída — só o passo intermediário do fluxo "em duas etapas"
   * (clique solta o token; um gesto de arraste SEGUINTE, começando de
   * qualquer ponto do mapa, é que define o raio). Um clique simples
   * sobre o token nunca produz uma Aura pronta a partir daqui.
   */
  | { fase: "definindo_raio_da_aura"; tokenId: string; origem: PontoAxial }
  | { fase: "pressionada"; tipo: TipoArea; gesto: GestoArea }
  | { fase: "arrastando"; params: ParametrosArea; gesto: GestoArea }
  | { fase: "pontos"; tipo: Extract<TipoArea, "parede" | "personalizada">; pontos: PontoAxial[]; cursor: PontoAxial | null }
  | { fase: "concluida_local"; params: ParametrosArea }
  | { fase: "editando"; areaId: string; revision: number; params: ParametrosArea; confirmado: ParametrosArea }
  | { fase: "persistindo"; params: ParametrosArea; areaId: string | null }
  | { fase: "erro"; params: ParametrosArea; areaId: string | null; mensagem: string };

export const AREAS_OCIOSA: EstadoAreas = { fase: "ociosa" };

/** Os parâmetros que a fase atual está manipulando, se houver algum. */
export function paramsDaFase(estado: EstadoAreas): ParametrosArea | null {
  switch (estado.fase) {
    case "arrastando":
    case "concluida_local":
    case "editando":
    case "persistindo":
    case "erro":
      return estado.params;
    default:
      return null;
  }
}

/**
 * O token que deve receber o DESTAQUE de "origem da Aura" agora, ou
 * `null` quando nenhum merece. Derivada inteiramente do estado — nunca
 * um `ref`/estado paralelo que possa ficar desatualizado: trocar de
 * token, cancelar, confirmar, trocar de ferramenta ou trocar de cena já
 * mudam `EstadoAreas` (ou o resetam pra `AREAS_OCIOSA`) por outros
 * caminhos já existentes, então o destaque simplesmente segue.
 *
 * Cobre: escolhendo/confirmando a origem (`pressionada`/`arrastando`
 * com token capturado), `definindo_raio_da_aura`, prévia local,
 * persistindo, erro de persistência e edição de uma Aura já salva.
 * Fora daqui (`escolhendo_token_da_aura`, sem token ainda; qualquer
 * outra fase; qualquer OUTRO tipo de área) não há token a destacar —
 * uma Aura persistida que não está selecionada/em edição nunca deixa o
 * token permanentemente marcado.
 */
export function tokenOrigemDaAura(estado: EstadoAreas): string | null {
  if ((estado.fase === "pressionada" || estado.fase === "arrastando") && estado.gesto.tokenCapturado) {
    return estado.gesto.tokenCapturado;
  }
  if (estado.fase === "definindo_raio_da_aura") return estado.tokenId;
  if (
    (estado.fase === "concluida_local" || estado.fase === "editando"
      || estado.fase === "persistindo" || estado.fase === "erro")
    && estado.params.tipo === "aura"
  ) {
    return estado.params.tokenId || null;
  }
  return null;
}

/** A ferramenta está no meio de uma criação/edição que `Esc` ou uma troca de ferramenta precisa cancelar? */
export function emAndamento(estado: EstadoAreas): boolean {
  return estado.fase !== "ociosa";
}

/** O gesto de arraste em curso, se houver — a fonte única da guia visual. */
export function gestoDaFase(estado: EstadoAreas): GestoArea | null {
  if (estado.fase === "pressionada" || estado.fase === "arrastando") return estado.gesto;
  return null;
}

/** A guia visual só aparece quando o arraste já cruzou o limiar (em `pressionada` nada é desenhado). */
export function gestoVisivel(estado: EstadoAreas): GestoArea | null {
  return estado.fase === "arrastando" ? estado.gesto : null;
}

/** Uma RPC está em voo? Enquanto estiver, nenhuma troca de ferramenta ou novo gesto pode passar por baixo dela. */
export function ocupada(estado: EstadoAreas): boolean {
  return estado.fase === "persistindo";
}

function grausEntre(origem: PontoAxial, destino: PontoAxial, tamanhoCelula: number): number {
  const a = axialParaMundo(origem, tamanhoCelula);
  const b = axialParaMundo(destino, tamanhoCelula);
  return normalizarGraus((Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI);
}

function metrosEntre(origem: PontoAxial, destino: PontoAxial, tamanhoCelula: number): number {
  const a = axialParaMundo(origem, tamanhoCelula);
  const b = axialParaMundo(destino, tamanhoCelula);
  return mundoParaMetros(Math.hypot(b.x - a.x, b.y - a.y), tamanhoCelula);
}

/**
 * Só aplica o snap angular a tipos que TÊM direção — Esfera, Domo e
 * Aura são radialmente simétricos e a opção nem aparece pra eles.
 */
function talvezSnap(graus: number, config: ConfigAreas): number {
  return snapAngular(graus, config.snapDirecao && tipoTemDirecao(config.tipo));
}

/**
 * Reprojeta o cursor para a direção e a dimensão EFETIVAS (depois do
 * snap angular e do arredondamento). É este ponto — não o cursor bruto
 * — que a geometria usa, e é ele que a ponta da guia visual marca como
 * "o que vai ser criado".
 */
function pontoEfetivo(origem: PontoAxial, grausEfetivos: number, metrosEfetivos: number, tamanhoCelula: number): PontoAxial {
  const o = axialParaMundo(origem, tamanhoCelula);
  const rad = (grausEfetivos * Math.PI) / 180;
  const dist = metrosParaMundo(metrosEfetivos, tamanhoCelula);
  return mundoParaAxial(o.x + Math.cos(rad) * dist, o.y + Math.sin(rad) * dist, tamanhoCelula);
}

/**
 * Mede um gesto: origem efetiva + cursor bruto → direção e dimensão,
 * brutas e efetivas. Função única — o painel, a guia, a geometria e a
 * persistência leem todos daqui, então não existe caminho em que a
 * prévia mostre um número e o banco receba outro.
 */
export function medirGesto(params: {
  config: ConfigAreas;
  origemEfetiva: PontoAxial;
  cursorBruto: PontoAxial;
  precisaoLivre: boolean;
  tamanhoCelula: number;
}): { grausEfetivos: number; dimensaoLivre: number; dimensaoArredondada: number; cursorEfetivo: PontoAxial } {
  const { config, origemEfetiva, cursorBruto, precisaoLivre, tamanhoCelula } = params;
  const dimensaoLivre = metrosEntre(origemEfetiva, cursorBruto, tamanhoCelula);
  const dimensaoArredondada = arredondarDimensao(dimensaoLivre, precisaoLivre);
  const grausEfetivos = talvezSnap(grausEntre(origemEfetiva, cursorBruto, tamanhoCelula), config);
  return {
    grausEfetivos,
    dimensaoLivre,
    dimensaoArredondada,
    cursorEfetivo: pontoEfetivo(origemEfetiva, grausEfetivos, dimensaoArredondada, tamanhoCelula),
  };
}

/**
 * Constrói os parâmetros canônicos a partir do gesto de arraste. A
 * dimensão principal (raio/comprimento/lado/alcance) é a DISTÂNCIA em
 * metros entre origem e ponteiro; a direção é o ângulo entre os dois,
 * no plano do mapa. Nada aqui olha pra zoom, pan ou pixel de tela: a
 * origem e o cursor já chegam em axial fracionário.
 */
export function paramsDoArraste(
  config: ConfigAreas,
  origem: PontoAxial,
  cursor: PontoAxial,
  tamanhoCelula: number,
  precisaoLivre = false,
): ParametrosArea {
  const medida = medirGesto({ config, origemEfetiva: origem, cursorBruto: cursor, precisaoLivre, tamanhoCelula });
  const distancia = medida.dimensaoArredondada;
  const direcao = medida.grausEfetivos;
  switch (config.tipo) {
    case "esfera":
      return normalizarParametros({ tipo: "esfera", origem, raioM: distancia, alturaM: config.alturaVolumeM, nivelOrigemM: config.nivelOrigemM });
    case "domo":
      return normalizarParametros({ tipo: "domo", origem, raioM: distancia, alturaM: config.alturaVolumeM, nivelOrigemM: config.nivelOrigemM });
    case "linha":
      return normalizarParametros({ tipo: "linha", origem, direcaoGraus: direcao, comprimentoM: distancia, modo: config.modoLinha });
    case "faixa":
      return normalizarParametros({ tipo: "faixa", origem, direcaoGraus: direcao, comprimentoM: distancia, larguraM: config.larguraFaixaM });
    case "cubo":
      return normalizarParametros({ tipo: "cubo", origem, direcaoGraus: direcao, ladoM: distancia });
    case "cone":
      return normalizarParametros({ tipo: "cone", origem, direcaoGraus: direcao, alcanceM: distancia });
    // Aura não nasce de arraste (parte de um token) e Parede/
    // Personalizada nascem de PONTOS — chegar aqui com um destes seria
    // um erro de quem chama; devolver a esfera equivalente seria
    // mentir, então o estado nem entra em "arrastando" pra eles.
    case "aura":
      // A dimensão principal É o arrasto medido — nunca o valor de
      // configuração. `config.raioAuraM` só entra quando NÃO existe
      // gesto nenhum (ex.: sincronização direta pelo seletor), e quem
      // constrói esses parâmetros ali não passa por `paramsDoArraste`.
      return normalizarParametros({ tipo: "aura", origem, raioM: distancia, tokenId: config.tokenAuraId ?? "" });
    case "parede":
      return normalizarParametros({ tipo: "parede", pontos: [origem, cursor], alturaM: config.alturaParedeM });
    case "personalizada":
      return normalizarParametros({ tipo: "personalizada", pontos: [origem, cursor] });
  }
}

/** Parâmetros de um percurso/polígono já montado por cliques. */
export function paramsDosPontos(config: ConfigAreas, pontos: readonly PontoAxial[]): ParametrosArea {
  if (config.tipo === "parede") {
    return normalizarParametros({ tipo: "parede", pontos: [...pontos], alturaM: config.alturaParedeM });
  }
  return normalizarParametros({ tipo: "personalizada", pontos: [...pontos] });
}

/** O tipo se desenha arrastando, clicando pontos, ou a partir de um token? */
export function gestoDoTipo(tipo: TipoArea): "arraste" | "pontos" | "token" {
  if (tipo === "parede" || tipo === "personalizada") return "pontos";
  if (tipo === "aura") return "token";
  return "arraste";
}

// ─────────────────────────────────────────────────────────────────
// Transições
// ─────────────────────────────────────────────────────────────────

/**
 * Ponteiro desceu no mapa com a ferramenta ativa e nenhuma edição em
 * curso. `origemEfetiva`/`tokenCapturado` já vêm resolvidos pelo snap
 * de origem (`resolverSnapToken`, em `areasSnap.ts`) — este módulo
 * nunca decide sozinho em qual token encostar.
 */
export function pressionar(params: {
  config: ConfigAreas;
  origemBruta: PontoAxial;
  origemEfetiva: PontoAxial;
  tokenCapturado: string | null;
  pointerId: number;
  px: { x: number; y: number };
  precisaoLivre: boolean;
}): EstadoAreas {
  return {
    fase: "pressionada",
    tipo: params.config.tipo,
    gesto: {
      pointerId: params.pointerId,
      origemBruta: params.origemBruta,
      origemEfetiva: params.origemEfetiva,
      tokenCapturado: params.tokenCapturado,
      cursorBruto: params.origemBruta,
      cursorEfetivo: params.origemEfetiva,
      dimensaoLivre: 0,
      dimensaoArredondada: 0,
      precisaoLivre: params.precisaoLivre,
      inicioPx: params.px,
    },
  };
}

/**
 * Ponteiro moveu. Só passa de `iniciando` pra `desenhando` DEPOIS de
 * cruzar o limiar — antes disso nada é desenhado, o que é o que impede
 * um clique trêmulo de virar uma área de 2 cm.
 */
export function mover(
  estado: EstadoAreas,
  config: ConfigAreas,
  cursor: PontoAxial,
  px: { x: number; y: number },
  tamanhoCelula: number,
  precisaoLivre = false,
): EstadoAreas {
  if (estado.fase === "pressionada" || estado.fase === "arrastando") {
    if (estado.fase === "pressionada") {
      const dist = Math.hypot(px.x - estado.gesto.inicioPx.x, px.y - estado.gesto.inicioPx.y);
      if (dist < LIMIAR_ARRASTO_AREA_PX) {
        // Ainda é clique: nada é desenhado, mas o modificador atual já
        // é registrado (o usuário pode ter apertado Alt antes de mexer).
        return { ...estado, gesto: { ...estado.gesto, precisaoLivre, cursorBruto: cursor } };
      }
    }
    const medida = medirGesto({ config, origemEfetiva: estado.gesto.origemEfetiva, cursorBruto: cursor, precisaoLivre, tamanhoCelula });
    const gesto: GestoArea = {
      ...estado.gesto,
      cursorBruto: cursor,
      cursorEfetivo: medida.cursorEfetivo,
      dimensaoLivre: medida.dimensaoLivre,
      dimensaoArredondada: medida.dimensaoArredondada,
      precisaoLivre,
    };
    return {
      fase: "arrastando",
      gesto,
      params: paramsDoArraste(config, estado.gesto.origemEfetiva, cursor, tamanhoCelula, precisaoLivre),
    };
  }
  if (estado.fase === "pontos") {
    return { ...estado, cursor };
  }
  return estado;
}

/**
 * Ponteiro subiu. Um arraste válido vira PRÉVIA (ainda local — nada foi
 * ao banco). Um gesto que nunca virou arraste, ou cuja geometria é
 * degenerada, volta pra ociosa sem criar nada.
 */
export function soltar(estado: EstadoAreas): EstadoAreas {
  if (estado.fase === "pressionada") {
    // Aura: clique-e-solta SEM arrastar só ESCOLHE o token — o raio
    // vem de um gesto seguinte (nunca de um valor predefinido). Isto
    // NÃO é geometria concluída: é o fluxo "em duas etapas" pedido.
    if (estado.tipo === "aura" && estado.gesto.tokenCapturado) {
      return { fase: "definindo_raio_da_aura", tokenId: estado.gesto.tokenCapturado, origem: estado.gesto.origemEfetiva };
    }
    // Demais formas: clique sem arraste não cria geometria nenhuma.
    return AREAS_OCIOSA;
  }
  if (estado.fase !== "arrastando") return estado;
  return validarParametros(estado.params).ok ? { fase: "concluida_local", params: estado.params } : AREAS_OCIOSA;
}

/** Clique adicionando um vértice de Parede/Área personalizada. */
export function adicionarPonto(estado: EstadoAreas, config: ConfigAreas, ponto: PontoAxial): EstadoAreas {
  const tipo = config.tipo === "parede" ? "parede" : "personalizada";
  if (estado.fase !== "pontos") {
    if (config.tipo !== "parede" && config.tipo !== "personalizada") return estado;
    return { fase: "pontos", tipo, pontos: [ponto], cursor: ponto };
  }
  const ultimo = estado.pontos[estado.pontos.length - 1];
  // Clique repetido exatamente no mesmo lugar não vira vértice
  // duplicado — a regra proíbe pontos duplicados consecutivos, e é
  // melhor impedir do que aceitar e recusar depois.
  if (ultimo && Math.hypot(ultimo.q - ponto.q, ultimo.r - ponto.r) < 1e-6) return estado;
  return { ...estado, pontos: [...estado.pontos, ponto] };
}

export function removerUltimoPonto(estado: EstadoAreas): EstadoAreas {
  if (estado.fase !== "pontos") return estado;
  const pontos = estado.pontos.slice(0, -1);
  return pontos.length === 0 ? AREAS_OCIOSA : { ...estado, pontos };
}

/** Pode concluir o percurso/polígono agora? A mensagem é a que a interface mostra enquanto não pode. */
export function podeConcluirPontos(estado: EstadoAreas): Veredito {
  if (estado.fase !== "pontos") return { ok: false, motivo: "Nenhum percurso em andamento." };
  return estado.tipo === "parede" ? validarPercursoParede(estado.pontos) : validarPoligonoPersonalizado(estado.pontos);
}

export function concluirPontos(estado: EstadoAreas, config: ConfigAreas): EstadoAreas {
  if (estado.fase !== "pontos") return estado;
  if (!podeConcluirPontos(estado).ok) return estado;
  return { fase: "concluida_local", params: paramsDosPontos(config, estado.pontos) };
}

/** `Esc`, troca de ferramenta ou "Descartar": some com a prévia sem tocar o banco. Durante EDIÇÃO, restaura a última versão confirmada. */
export function cancelar(estado: EstadoAreas): EstadoAreas {
  if (estado.fase === "editando") return { ...estado, params: estado.confirmado };
  return AREAS_OCIOSA;
}

/**
 * Entra no modo de escolher o token de origem da Aura. É esta fase —
 * e só ela — que autoriza o clique num token a virar escolha de Aura
 * em vez de seleção/movimento/rotação normal.
 */
export function comecarEscolhaDeTokenDaAura(): EstadoAreas {
  return { fase: "escolhendo_token_da_aura" };
}

/**
 * Um token foi escolhido como origem da Aura. `origem` é a ORIGEM
 * MECÂNICA atual dele (calculada por quem chama com `origemDeAura`),
 * e o gesto já nasce pronto pra virar arraste de raio no mesmo
 * movimento — o clique-e-arrasta contínuo do fluxo rápido.
 */
export function escolherTokenDaAura(params: {
  config: ConfigAreas;
  tokenId: string;
  origem: PontoAxial;
  pointerId: number;
  px: { x: number; y: number };
  precisaoLivre: boolean;
}): EstadoAreas {
  return {
    fase: "pressionada",
    tipo: "aura",
    gesto: {
      pointerId: params.pointerId,
      origemBruta: params.origem,
      origemEfetiva: params.origem,
      tokenCapturado: params.tokenId,
      cursorBruto: params.origem,
      cursorEfetivo: params.origem,
      dimensaoLivre: 0,
      dimensaoArredondada: 0,
      precisaoLivre: params.precisaoLivre,
      inicioPx: params.px,
    },
  };
}

/**
 * `Esc` no fluxo da Aura — cada fase volta um passo, nunca cancela
 * tudo de uma vez (pedido explícito: nenhum passo já dado se perde
 * sem necessidade):
 *
 *   - `escolhendo_token_da_aura`: cancela a criação inteira.
 *   - `definindo_raio_da_aura`: descarta o token escolhido, volta a
 *     escolher token.
 *   - arrastando o raio (`pressionada`/`arrastando` com token
 *     capturado): cancela SÓ o gesto de raio em curso, volta a
 *     `definindo_raio_da_aura` com o MESMO token — não perde a
 *     escolha de origem por causa de um arrasto cancelado.
 *   - `concluida_local` de uma Aura: descarta a prévia, volta a
 *     `definindo_raio_da_aura` com o mesmo token, pronto pra um novo
 *     gesto de raio.
 */
export function escapeNaAura(estado: EstadoAreas): EstadoAreas {
  if (estado.fase === "escolhendo_token_da_aura") return AREAS_OCIOSA;
  if (estado.fase === "definindo_raio_da_aura") return { fase: "escolhendo_token_da_aura" };
  if ((estado.fase === "pressionada" || estado.fase === "arrastando") && estado.gesto.tokenCapturado) {
    return { fase: "definindo_raio_da_aura", tokenId: estado.gesto.tokenCapturado, origem: estado.gesto.origemEfetiva };
  }
  if (estado.fase === "concluida_local" && estado.params.tipo === "aura") {
    return { fase: "definindo_raio_da_aura", tokenId: estado.params.tokenId, origem: estado.params.origem };
  }
  return { fase: "escolhendo_token_da_aura" };
}

export function comecarEdicao(areaId: string, revision: number, params: ParametrosArea): EstadoAreas {
  return { fase: "editando", areaId, revision, params, confirmado: params };
}

export function alterarParametros(estado: EstadoAreas, params: ParametrosArea): EstadoAreas {
  if (estado.fase === "editando") return { ...estado, params: normalizarParametros(params) };
  if (estado.fase === "concluida_local") return { fase: "concluida_local", params: normalizarParametros(params) };
  return estado;
}

export function comecarPersistencia(estado: EstadoAreas): EstadoAreas {
  const params = paramsDaFase(estado);
  if (!params) return estado;
  const areaId = estado.fase === "editando" ? estado.areaId : estado.fase === "erro" ? estado.areaId : null;
  return { fase: "persistindo", params, areaId };
}

export function falharPersistencia(estado: EstadoAreas, mensagem: string): EstadoAreas {
  const params = paramsDaFase(estado);
  if (!params) return estado;
  return { fase: "erro", params, areaId: estado.fase === "persistindo" ? estado.areaId : null, mensagem };
}

export function concluirPersistencia(): EstadoAreas {
  return AREAS_OCIOSA;
}

/**
 * Uma frase curta com a dimensão corrente, em metros — a régua que o
 * painel mostra enquanto o gesto acontece. Sempre derivada dos MESMOS
 * parâmetros que o desenho e o cálculo usam.
 */
export function reguaDosParametros(params: ParametrosArea, tamanhoCelula: number): string {
  const m = formatarMetros;
  switch (params.tipo) {
    case "esfera":
    case "domo":
    case "aura":
      return `raio ${m(params.raioM)}`;
    case "linha":
      return `${m(params.comprimentoM)} · ${params.modo === "traco_fino" ? "traço fino" : "1 célula de largura"}`;
    case "faixa":
      return `${m(params.comprimentoM)} × ${m(params.larguraM)}`;
    case "cubo":
      return `lado ${m(params.ladoM)} · altura ${m(params.ladoM)}`;
    case "cone":
      return `alcance ${m(params.alcanceM)} · abertura 45°`;
    case "parede": {
      let total = 0;
      for (let i = 0; i < params.pontos.length - 1; i++) {
        total += Math.hypot(
          axialParaMundo(params.pontos[i + 1], tamanhoCelula).x - axialParaMundo(params.pontos[i], tamanhoCelula).x,
          axialParaMundo(params.pontos[i + 1], tamanhoCelula).y - axialParaMundo(params.pontos[i], tamanhoCelula).y,
        );
      }
      return `${m(mundoParaMetros(total, tamanhoCelula))} × 1 m · altura ${m(params.alturaM)}`;
    }
    case "personalizada":
      return `${params.pontos.length} vértice${params.pontos.length === 1 ? "" : "s"}`;
  }
}

/** Mínimo exigido de uma dimensão principal — reexportado pra a interface poder explicar o motivo de um gesto ter sido descartado. */
export { MINIMO_DIMENSAO_M };

// ─────────────────────────────────────────────────────────────────
// Alças de edição
//
// Uma alça por grau de liberdade que o formato realmente tem — e
// NENHUMA para o que é regra fixa: o Cone não ganha alça de abertura
// (45° é regra), a Parede não ganha alça de largura (1 m é regra), o
// Cubo não ganha alça de altura (é igual ao lado por definição).
// ─────────────────────────────────────────────────────────────────

export interface AlcaDescricao {
  id: string;
  pos: PontoAxial;
  papel: "origem" | "raio" | "destino" | "largura" | "vertice";
  rotulo: string;
}

/** Ponto a `metros` da origem, na direção `graus` — em axial fracionário. */
function deslocar(origem: PontoAxial, graus: number, metros: number, tamanhoCelula: number): PontoAxial {
  const o = axialParaMundo(origem, tamanhoCelula);
  const rad = (graus * Math.PI) / 180;
  const dist = metros * tamanhoCelula * Math.sqrt(3);
  const x = o.x + Math.cos(rad) * dist;
  const y = o.y + Math.sin(rad) * dist;
  // Inverso de `axialParaMundo` — a mesma conta de `mundoParaAxial`,
  // reusada por import pra não existir uma segunda fórmula de escala.
  return mundoParaAxialLocal(x, y, tamanhoCelula);
}

function mundoParaAxialLocal(x: number, y: number, tamanhoCelula: number): PontoAxial {
  return {
    q: ((Math.sqrt(3) / 3) * x - (1 / 3) * y) / tamanhoCelula,
    r: ((2 / 3) * y) / tamanhoCelula,
  };
}

export function alcasDeParametros(p: ParametrosArea, tamanhoCelula: number): AlcaDescricao[] {
  switch (p.tipo) {
    case "esfera":
    case "domo":
      return [
        { id: "origem", pos: p.origem, papel: "origem", rotulo: "Mover o centro" },
        { id: "raio", pos: deslocar(p.origem, 0, p.raioM, tamanhoCelula), papel: "raio", rotulo: "Alterar o raio" },
      ];
    case "aura":
      // A origem NÃO tem alça: uma aura é presa ao token, e arrastá-la
      // pra longe dele quebraria a única regra que a define.
      return [{ id: "raio", pos: deslocar(p.origem, 0, p.raioM, tamanhoCelula), papel: "raio", rotulo: "Alterar o raio" }];
    case "linha":
      return [
        { id: "origem", pos: p.origem, papel: "origem", rotulo: "Mover a origem" },
        { id: "destino", pos: deslocar(p.origem, p.direcaoGraus, p.comprimentoM, tamanhoCelula), papel: "destino", rotulo: "Mover o destino" },
      ];
    case "faixa":
      return [
        { id: "origem", pos: p.origem, papel: "origem", rotulo: "Mover a origem" },
        { id: "destino", pos: deslocar(p.origem, p.direcaoGraus, p.comprimentoM, tamanhoCelula), papel: "destino", rotulo: "Alterar direção e comprimento" },
        { id: "largura", pos: deslocar(p.origem, p.direcaoGraus + 90, p.larguraM / 2, tamanhoCelula), papel: "largura", rotulo: "Alterar a largura" },
      ];
    case "cubo":
      return [
        { id: "origem", pos: p.origem, papel: "origem", rotulo: "Mover o canto de origem" },
        { id: "destino", pos: deslocar(p.origem, p.direcaoGraus, p.ladoM, tamanhoCelula), papel: "destino", rotulo: "Alterar lado e orientação" },
      ];
    case "cone":
      return [
        { id: "origem", pos: p.origem, papel: "origem", rotulo: "Mover a origem" },
        { id: "destino", pos: deslocar(p.origem, p.direcaoGraus, p.alcanceM, tamanhoCelula), papel: "destino", rotulo: "Alterar direção e alcance" },
      ];
    case "parede":
    case "personalizada":
      return p.pontos.map((v, i) => ({ id: `v${i}`, pos: v, papel: "vertice" as const, rotulo: `Vértice ${i + 1}` }));
  }
}

/**
 * Aplica o arraste de uma alça aos parâmetros. Nunca inventa
 * comportamento novo: mover a origem de uma linha/faixa/cubo/cone
 * TRANSLADA a forma inteira (direção e tamanho preservados), mover o
 * destino muda direção e tamanho, e mover um vértice mexe só nele.
 */
/**
 * Move uma alça de edição. `precisaoLivre` é a MESMA regra do arrasto
 * de criação (`arredondarDimensao`, `areasSnap.ts`): metro inteiro por
 * padrão, fração de até 2 casas só com Alt/Command seguro NO MOMENTO
 * do movimento — nunca um valor cru tipo "1,22 m" sem o modificador.
 * Editar não é um caminho separado com regra própria: é o MESMO gesto,
 * só que sobre uma área já persistida.
 */
export function aplicarAlca(
  p: ParametrosArea, alcaId: string, ponto: PontoAxial, tamanhoCelula: number, config: ConfigAreas, precisaoLivre = false,
): ParametrosArea {
  const dist = (de: PontoAxial) => arredondarDimensao(metrosEntre(de, ponto, tamanhoCelula), precisaoLivre);
  const ang = (de: PontoAxial) => talvezSnap(grausEntre(de, ponto, tamanhoCelula), config);

  switch (p.tipo) {
    case "esfera":
    case "domo":
      if (alcaId === "origem") return normalizarParametros({ ...p, origem: ponto });
      return normalizarParametros({ ...p, raioM: dist(p.origem) });
    case "aura":
      return normalizarParametros({ ...p, raioM: dist(p.origem) });
    case "linha":
      if (alcaId === "origem") return normalizarParametros({ ...p, origem: ponto });
      return normalizarParametros({ ...p, direcaoGraus: ang(p.origem), comprimentoM: dist(p.origem) });
    case "faixa":
      if (alcaId === "origem") return normalizarParametros({ ...p, origem: ponto });
      if (alcaId === "largura") return normalizarParametros({ ...p, larguraM: dist(p.origem) * 2 });
      return normalizarParametros({ ...p, direcaoGraus: ang(p.origem), comprimentoM: dist(p.origem) });
    case "cubo":
      if (alcaId === "origem") return normalizarParametros({ ...p, origem: ponto });
      return normalizarParametros({ ...p, direcaoGraus: ang(p.origem), ladoM: dist(p.origem) });
    case "cone":
      if (alcaId === "origem") return normalizarParametros({ ...p, origem: ponto });
      return normalizarParametros({ ...p, direcaoGraus: ang(p.origem), alcanceM: dist(p.origem) });
    case "parede":
    case "personalizada": {
      const i = Number(alcaId.replace("v", ""));
      if (!Number.isInteger(i) || i < 0 || i >= p.pontos.length) return p;
      const pontos = p.pontos.map((v, idx) => (idx === i ? ponto : v));
      return normalizarParametros({ ...p, pontos });
    }
  }
}
