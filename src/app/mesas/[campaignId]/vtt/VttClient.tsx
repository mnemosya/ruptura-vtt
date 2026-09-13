"use client";

/**
 * Mesa de Ruptura.
 *
 * Composição (corrigida contra a referência visual): o MAPA ocupa a
 * tela inteira e todo o resto FLUTUA por cima dele — cabeçalho de cena
 * sobreposto no canto, ferramentas numa coluna estreita à esquerda,
 * painel do Foundry à direita, e no rodapé apenas DOIS componentes,
 * separados por respiro: a trilha de turnos e o HUD do personagem.
 *
 * A versão anterior empilhava faixas de largura total (cabeçalho +
 * submenu + trilha em tabela + ficha), o que espremia o mapa e fazia o
 * rodapé parecer uma pilha de tabelas. Aqui o mapa é o fundo, não uma
 * linha de grid.
 *
 * A trilha tem DOIS GRUPOS PERMANENTES lado a lado — Rápidos (ciano) e
 * Lentos (âmbar), mesmo peso visual, nenhum desabilitado. Não são abas:
 * o jogador declara em qualquer um dos dois a qualquer momento, mesmo
 * enquanto o outro é resolvido. O card do personagem vive DENTRO do
 * grupo declarado e se MOVE (arrastando ou pelo menu) quando a
 * declaração muda — nunca é duplicado.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  MousePointer2, Ruler, PaintBucket, MapPin, Images,
  Settings, Layers, Menu, Hexagon, Swords,
  Plus, Minus, Undo2, Redo2, Loader2,
  UserPlus, Box,
  Radio, Focus, ClipboardPaste, Pencil, Copy, RotateCcw, RotateCw, Eye, EyeOff, Lock, Unlock, Trash2,
  Dices, Clapperboard,
} from "lucide-react";
import { MapaHex, TAM, type EstadoVisualToken, type CenaMapa } from "./_mapa/MapaHex";
import { type AlcaArea, type AreaDesenhavel, type EstadoVisualArea, type GuiaGesto } from "./_mapa/CamadaAreas";
import { type Hex, type TamanhoCriatura, hexDistancia, hexKey, hexNoRaio, hexIguais, hexParaPixel } from "./_mapa/hex";
import { type ObjetoCena } from "./_dados/cenaDemo";
import {
  type EstadoTrilha, type Janela, type Lado, type ModoCena,
  assumirTurno, avancarParaLentos, concluirTurno, declarar, elegibilidade,
  encerrarParticipacao, proximaRodada,
} from "./_turnos/modelo";
import {
  adicionarParticipantes, definirIncapaz, estadoInicialTrilha, removerParticipante,
  trilhaDeJson, trilhaParaJson,
} from "./_turnos/serializacao";
import { TrilhaFaccoes } from "./_turnos/TrilhaFaccoes";
import { PainelRodadas } from "./_turnos/PainelRodadas";
import {
  type PreferenciasRodadas, PREFERENCIAS_RODADAS_PADRAO,
  carregarPreferenciasRodadas, chavePreferenciasRodadas, salvarPreferenciasRodadas,
} from "./_turnos/rodadasPreferencias";
import {
  type Comando, type EstadoHistorico, type FerramentaId,
  ATALHO_FERRAMENTA, HISTORICO_VAZIO, ROTULO_FERRAMENTA,
  decidirTrocaFerramenta, elementoEhEditavel, ferramentasParaPapel, interpretarAtalho, prepararRedo, prepararUndo, registrarComando,
} from "./_ferramentas/controlador";
import { type MapaTerreno, type TipoTerreno, dentroDoMapa, pegadaBloqueada, expandirRota, montarRota, regiaoContiguaDeTerreno } from "./_dominio/movimento";
import { type ObjetoTatico, montarMapaTatico } from "./_dominio/mapaTatico";
import { PRESETS_OBJETO, valoresIniciaisDoPreset } from "./_dominio/presetsObjeto";
import { type PresetObjeto, type GrauCoberturaObjeto, type CategoriaObjeto, type ObjetoVtt } from "../../../../lib/vtt/sceneStorage";
import {
  type MovimentoVisualToken,
  DURACAO_FALLBACK_SEM_BROADCAST, DURACAO_RECONCILIACAO, DISTANCIA_MAXIMA_FALLBACK_RETO,
  calcularDuracao, pesosDaRota,
} from "./_dominio/animacaoToken";
import {
  type ProtecaoMovimentoVisual,
  criarProtecaoMovimento, reconciliarPosicaoOnToken, limparProtecaoToken, limparTodasAsProtecoes,
  decidirNovoMovimento, proximaExpiracao, removerProtecoesExpiradas,
} from "./_dominio/reconciliacaoPosicao";
import {
  garantirCenaSemente, lerCenaAtiva, lerCenaAction, lerCenaApresentadaAction, lerPalcoAction,
  lerMinhaCenaAction,
  moverTokenAction, obterUsuarioAtualAction,
  pintarTerrenoAction, criarMarcaAction, apagarMarcaAction, rotacionarTokenAction,
  criarMedicaoAction, apagarMedicaoAction, limparMedicoesAction,
  obterControleAction, criarTokenAction, editarTokenAction,
  duplicarTokenAction, removerTokenAction, definirFlagsTokenAction, enviarPingAction, listarPersonagensAction,
  criarAreaAction, atualizarAreaAction, duplicarAreaAction, removerAreaAction, lerObjetosCenaAction,
  iniciarTrilhaAction, atualizarTrilhaAction, encerrarTrilhaAction, lerTrilhaAction,
  criarObjetoAction, removerObjetoAction, atualizarObjetoAction, moverObjetoAction, danificarObjetoAction,
  type AtualizarObjetoParams, definirCamadasCenaAction, salvarConfigCenaAction } from "./_acoes/sceneActions";
import { refreshAccessToken } from "../../../../lib/auth/actions";
import { pegadaEfetiva, projetarPegada, pegadasSobrepoem, origemMecanica } from "./_dominio/pegada";
import {
  type ParametrosArea, type RegiaoArea, type TipoArea,
  HEX_COR_AREA, ancoraDaRegiao, caixaDaRegiao, origemDeAura, regiaoDaArea, resolverArea, validarParametros,
} from "./_dominio/areaEfeito";
import { type PontoAxial, axialParaMundo } from "./_dominio/escalaMapa";
import type { ImagemCena } from "./_dominio/imagemCena";
import { camposDeParametros, corValida, parametrosDaAreaPersistida } from "./_dominio/areaPersistida";
import {
  type ConfigAreas, type EstadoAreas,
  AREAS_OCIOSA, CONFIG_AREAS_PADRAO, adicionarPonto, alterarParametros, cancelar as cancelarAreas, emAndamento,
  comecarEdicao, comecarPersistencia, concluirPersistencia, concluirPontos, emAndamento as areaEmAndamento,
  falharPersistencia, gestoDoTipo, mover as moverAreas, ocupada as areaOcupada, paramsDaFase,
  podeConcluirPontos, pressionar as pressionarAreas, removerUltimoPonto, reguaDosParametros, soltar as soltarAreas,
  alcasDeParametros, aplicarAlca, comecarEscolhaDeTokenDaAura, escolherTokenDaAura, escapeNaAura, gestoVisivel,
  tokenOrigemDaAura,
} from "./_ferramentas/areasEstado";
import { PainelAreas, type ItemListaArea } from "./_shell/PainelAreas";
import { PainelTerreno } from "./_shell/PainelTerreno";
import { PainelObjetos } from "./_shell/PainelObjetos";
import { PainelImagens } from "./_shell/PainelImagens";
import { BibliotecaImagens } from "./_shell/BibliotecaImagens";
import { ColocarImagem } from "./_shell/ColocarImagem";
import { useImagensDaCena } from "./_shell/useImagensDaCena";
import { PainelMedir, type ModoMedicao } from "./_shell/PainelMedir";
import { PainelDados } from "./_shell/PainelDados";
import { MesaDadosOverlay } from "./_dados3d/MesaDadosOverlay";
import { AcoesAreaFlutuantes, BotaoEdicaoRapidaArea, usePosicoesEdicaoRapida } from "./_shell/AcoesAreaFlutuantes";
import {
  type PreferenciasAreas, PREFERENCIAS_AREAS_PADRAO,
  carregarPreferenciasAreas, chavePreferenciasAreas, salvarPreferenciasAreas,
} from "./_ferramentas/areasPreferencias";
import {
  type TokenParaSnap,
  candidatoAoSnap, formatarMetros, precisaoLivreDoEvento, resolverOrigemArea, resolverSnapToken, tipoTemDirecao,
} from "./_ferramentas/areasSnap";
import { type TokenApresentacao, tokenApresentacaoDe } from "./_dominio/tokenApresentacao";
import {
  type EventoMovimentoToken, type EventoPing,
  subscribeToVttScene, subscribeToVttTokenMovement, subscribeToVttPing, subscribeToVttTokensChanged,
  subscribeToVttAreasChanged, subscribeToCamadasDaCena, subscribeToVttPalco,
  subscribeToVttAtribuicoes } from "./_realtime/vttRealtime";
import { useCampaignCharacterControllersRealtime } from "../../../../lib/realtime/useCampaignRealtime";
import { GerenciadorToken, type ValoresFormularioToken, sugerirSigla } from "./_shell/GerenciadorToken";
import { MenuContextual, type ItemMenuContextual } from "./_shell/MenuContextual";
import { ProvedorJanelasFerramenta } from "./_shell/JanelaFerramenta";
import { PainelCamadas, type EstadoCamadas, CAMADAS_PADRAO, camadasDeJson } from "./_shell/PainelCamadas";
import { PainelMarcar, type CorMarcaUi, type SinalMarcaUi, type DuracaoMarcaUi } from "./_shell/PainelMarcar";
import { PainelCena, type ValoresCena } from "./_shell/PainelCena";
import { GerenciadorCenas } from "./_cenas/GerenciadorCenas";
import { esquecerCenaVista, gravarCenaVista, lerCenaVista } from "./_cenas/modelo";
import { SelectedTokenHud, type HudConditionOption } from "./_shell/SelectedTokenHud";
import { PainelVtt } from "./_painel/PainelVtt";
import {
  MIME_PERSONAGEM_ARRASTADO,
  desserializarPersonagemArrastado,
  type PersonagemArrastado,
} from "./_painel/personagensModelo";
import type { CharacterRulesPayload, ReactionRules, TalentContent } from "../../../../lib/character";
import "../../../_design/console.css";
import "./vtt.css";

type EstadoCenaVtt = Awaited<ReturnType<typeof lerCenaAtiva>>["dados"];

const COR_MARCA_HEX: Record<string, string> = {
  ciano: "#00d4ff", ambar: "#f5a200", verde: "#22d3aa", vermelho: "#ff5f74", roxo: "#8b5cf6", branco: "#eafcff",
};

const ICONE_FERRAMENTA: Record<FerramentaId, typeof MousePointer2> = {
  interagir: MousePointer2, dados: Dices, medir: Ruler, marcar: MapPin, terreno: PaintBucket, objetos: Box,
  imagens: Images, areas: Hexagon, rodadas: Swords,
};



/** Limites de zoom — mantidos idênticos aos que já existiam antes. */
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 2.4;
/**
 * Fator da escala exponencial do zoom pela roda. Multiplicativo (`z *
 * exp(-delta*k)`), não aditivo (`z + delta*k`) — um zoom multiplicativo
 * sente-se com o mesmo "peso" por notch em qualquer nível de zoom
 * atual; um aditivo faria cada notch parecer enorme perto do limite
 * mínimo e minúsculo perto do máximo. Calibrado por teste manual: um
 * notch típico de mouse (~100-120 de `deltaY` normalizado) muda o zoom
 * em ~15-18%, perceptível mas nunca um salto.
 */
const SENSIBILIDADE_ZOOM = 0.0016;
/**
 * Clampa cada delta de wheel individual ANTES de aplicar a escala —
 * mesmo já normalizado (`normalizarDeltaWheel`, em MapaHex.tsx), um
 * evento isolado enorme (ex.: Ctrl+scroll no Windows, que multiplica
 * `deltaY`, ou um `deltaMode` de página) não deve produzir um salto de
 * zoom maior que um notch comum.
 */
const MAX_DELTA_WHEEL_NORMALIZADO = 140;

// A lista de formatos de área que existia aqui como constante MORTA
// (declarada, nunca lida) virou o catálogo real do domínio —
// `META_AREA` em `_dominio/areaEfeito.ts`, com rótulo, glifo, instrução,
// descrição e marca de tridimensionalidade, consumido pelo painel.

/**
 * Estado do fluxo de gerenciamento de token — união discriminada, sem
 * combinação de booleans que permita estado contraditório. "Fechado" é
 * a AUSÊNCIA de valor (`null`, no `useState` que usa este tipo) —
 * mesma convenção já usada por `menuContextual`/`confirmandoRemocao`
 * neste arquivo, não um quinto tag redundante.
 *
 *  - "configurando": o formulário (`GerenciadorToken.tsx`) está aberto
 *    — modo "criar" (rascunho ainda sem RPC nenhuma) ou "editar" (RPC
 *    de update/resize disparada de dentro do próprio formulário, sem
 *    passar pelas fases abaixo).
 *  - "posicionando"/"enviando"/"erro": SÓ existem no modo criar — o
 *    formulário já fechou, um fantasma segue o cursor no mapa
 *    (`_mapa/MapaHex.tsx`), e a RPC só é chamada ao confirmar uma
 *    posição válida. "Erro" preserva rascunho/âncora/orientação
 *    (nunca reseta o que já foi escolhido) e aceita nova tentativa.
 */
type FluxoToken =
  | { fase: "configurando"; modo: "criar"; valoresIniciais: ValoresFormularioToken; ancoraPreservada: Hex | null; orientacaoPreservada: number }
  | { fase: "configurando"; modo: "editar"; tokenId: string; valoresIniciais: ValoresFormularioToken }
  | { fase: "posicionando"; rascunho: ValoresFormularioToken; ancora: Hex | null; orientacao: number }
  | { fase: "enviando"; rascunho: ValoresFormularioToken; ancora: Hex; orientacao: number }
  | { fase: "erro"; rascunho: ValoresFormularioToken; ancora: Hex; orientacao: number; mensagem: string };

/**
 * Valida a âncora candidata de um token NOVO contra o domínio
 * (bordas/bloqueio/colisão) — mesmas 3 regras de sempre, só que em
 * tempo FUTURO ("ficaria", nunca "fica"/"sobrepõe"): durante o
 * posicionamento o token ainda não existe, então a mensagem nunca pode
 * soar como se ele já estivesse ali.
 */
function validarPosicaoToken(params: {
  tamanho: TamanhoCriatura; orientacao: number; ancora: Hex; largura: number; altura: number;
  terreno: MapaTerreno; ocupadosPorOutros: ReadonlySet<string>;
}): { valida: boolean; motivo: string | null; celulas: Hex[] } {
  const pegada = pegadaEfetiva({ categoria: params.tamanho, orientacao: params.orientacao, pegadaPersonalizada: null });
  const celulas = projetarPegada(params.ancora, pegada);
  if (!celulas.every((c) => dentroDoMapa(c, params.largura, params.altura))) {
    return { valida: false, motivo: "Parte da pegada ficaria fora do mapa.", celulas };
  }
  if (pegadaBloqueada(params.terreno, celulas)) {
    return { valida: false, motivo: "Parte da pegada ocuparia terreno bloqueado.", celulas };
  }
  const celulasOutros = [...params.ocupadosPorOutros].map((k) => { const [q, r] = k.split(",").map(Number); return { q, r }; });
  if (pegadasSobrepoem(celulas, celulasOutros)) {
    return { valida: false, motivo: "Parte da pegada ficaria sobre outro token.", celulas };
  }
  return { valida: true, motivo: null, celulas };
}

export function VttClient({
  campaignId,
  papel,
  hudRules,
  hudReactionRules,
  hudTalents,
  hudConditions,
}: {
  campaignId: string;
  papel: "narrator" | "player";
  hudRules: CharacterRulesPayload | null;
  hudReactionRules: ReactionRules;
  hudTalents: TalentContent[];
  hudConditions: HudConditionOption[];
}) {
  const ehNarrador = papel === "narrator";

  const [ferramenta, setFerramenta] = useState<FerramentaId>("interagir");

  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  // Espelho síncrono de `zoom`+`pan` pro zoom da roda. Eventos `wheel`
  // de trackpad chegam em RAJADA — várias dezenas de eventos síncronos
  // no MESMO laço de eventos nativo, todos antes de React sequer
  // começar a processar o primeiro `setState` (efeitos só rodam depois
  // do commit). Um `useRef` sincronizado só por `useEffect` ainda
  // ficaria "velho" durante a rajada inteira — cada evento leria o
  // mesmo valor inicial, e 20 eventos pequenos não se acumulariam como
  // 1 grande (bug real, pego testando: uma rajada de 20 deltas pequenos
  // não mudava o zoom NADA, porque cada um recomeçava do mesmo zoom
  // "antigo"). A correção é gravar o ref DIRETO dentro do handler,
  // antes de qualquer `setState` — leitura e escrita 100% síncronas,
  // sem esperar o React confirmar nada. Também fecha o outro problema
  // (chamar `setPan` de DENTRO do updater funcional de `setZoom` — o
  // mesmo anti-padrão já corrigido nesta sessão pro undo/redo): os
  // dois setters agora são chamados como IRMÃOS, nunca um aninhado no
  // outro.
  const zoomPanRef = useRef({ zoom, pan });
  /**
   * Último valor que um GESTO escreveu no ref de forma síncrona, ainda
   * esperando o React confirmar. Sem isto o espelho abaixo desfazia o
   * próprio gesto: numa rajada de roda os eventos 2..N já gravaram
   * zooms novos no ref enquanto o commit do evento 1 ainda não rodou —
   * e quando o efeito daquele commit rodava, ele escrevia o zoom VELHO
   * por cima do novo. O evento seguinte da rajada lia esse valor
   * atrasado e o zoom voltava: é o "tremendo, indo e voltando".
   */
  const zoomPanPendenteRef = useRef<{ zoom: number; pan: { x: number; y: number } } | null>(null);
  /** Grava zoom/pan no ref JÁ, síncrono, e marca o valor como pendente de confirmação. */
  const marcarZoomPan = useCallback((zoom: number, pan: { x: number; y: number }) => {
    zoomPanRef.current = { zoom, pan };
    zoomPanPendenteRef.current = { zoom, pan };
  }, []);
  useEffect(() => {
    const pendente = zoomPanPendenteRef.current;
    if (pendente) {
      // Chegou o eco do próprio gesto: nada a escrever. Se for um eco
      // ATRASADO (state ainda atrás do que o gesto já gravou), também
      // não escreve — o ref é que está certo, não este render.
      if (pendente.zoom === zoom && pendente.pan.x === pan.x && pendente.pan.y === pan.y) {
        zoomPanPendenteRef.current = null;
      }
      return;
    }
    // Mudança vinda de fora de um gesto (botões +/-, centralizar): o
    // estado é a fonte da verdade e o ref acompanha.
    zoomPanRef.current = { zoom, pan };
  }, [zoom, pan]);
  // Sem valor demo pra começar selecionado — tokens ainda não
  // carregaram no primeiro render (`estadoCena` começa `null`); a
  // seleção nasce vazia e o usuário escolhe.
  const [selecionadoId, setSelecionadoId] = useState<string | null>(null);
  const [selecionadosIds, setSelecionadosIds] = useState<Set<string>>(new Set());
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [hudInvalidationKey, setHudInvalidationKey] = useState(0);
  const [modoTerreno, setModoTerreno] = useState<TipoTerreno | null>("dificil");
  const [raioPincelTerreno, setRaioPincelTerreno] = useState(0); // 0/1/2 → 1/7/19 células (hexNoRaio)
  const [modoPincelTerreno, setModoPincelTerreno] = useState<"pincel" | "balde">("pincel");
  const [contagemGestoTerreno, setContagemGestoTerreno] = useState<number | null>(null);
  const [ultimoGestoTerrenoCelulas, setUltimoGestoTerrenoCelulas] = useState<Hex[] | null>(null);
  const gestoTerrenoRef = useRef<Map<string, { hex: Hex; tipoAntes: TipoTerreno | null }> | null>(null);
  const [presetObjeto, setPresetObjeto] = useState<PresetObjeto>("caixa");
  const [celulasObjetoPendente, setCelulasObjetoPendente] = useState<Hex[]>([]);
  const [criandoObjeto, setCriandoObjeto] = useState(false);
  const [objetoSelecionadoId, setObjetoSelecionadoId] = useState<string | null>(null);
  const [excluindoObjeto, setExcluindoObjeto] = useState(false);
  const [objetoMovendoId, setObjetoMovendoId] = useState<string | null>(null);
  const [movendoObjeto, setMovendoObjeto] = useState(false);
  const [rascunhoEdicaoObjeto, setRascunhoEdicaoObjeto] = useState<{
    nome: string;
    bloqueiaMovimento: boolean;
    terrenoProjetado: "dificil" | null;
    grauCobertura: GrauCoberturaObjeto | null;
    categoria: CategoriaObjeto | null;
    pd: number | null;
    pdMax: number | null;
    visivel: boolean;
    travado: boolean;
  } | null>(null);
  const [salvandoEdicaoObjeto, setSalvandoEdicaoObjeto] = useState(false);
  const [deltaPdObjeto, setDeltaPdObjeto] = useState("");
  const [aplicandoDanoObjeto, setAplicandoDanoObjeto] = useState(false);

  // ── Estado persistido (banco) ────────────────────────────────────
  const [estadoCena, setEstadoCena] = useState<EstadoCenaVtt>(null);

  /**
   * IMAGENS da cena. Todo o assunto — lista, URLs assinadas, preparo em
   * memória e as escritas — vive no hook; aqui só se liga o resultado
   * na barra, no mapa e no painel.
   */
  /**
   * Retratos de ARQUIVO em cena. Entram na mesma leva de assinatura das
   * imagens de cena — são o mesmo bucket, a mesma autorização e o mesmo
   * ciclo de renovação, e uma segunda leva seria uma segunda chance de
   * as duas discordarem sobre o que está válido.
   */
  const idsRetratoEmCena = useMemo(
    () => (estadoCena?.tokens ?? [])
      // O EFETIVO, não o próprio: é ele que vai ser desenhado, e um
      // retrato herdado da ficha tem `retratoImageId` nulo. Assinar o
      // campo cru deixava justamente a herança sem URL — token de volta
      // à sigla, com a cara existindo no banco.
      .map((t) => t.retratoEfetivoId)
      .filter((id): id is string => id !== null),
    [estadoCena?.tokens],
  );
  const imgs = useImagensDaCena({
    campaignId,
    sceneId: estadoCena?.cena.id ?? null,
    ehNarrador,
    larguraCena: estadoCena?.cena.largura ?? 0,
    alturaCena: estadoCena?.cena.altura ?? 0,
    idsExtras: idsRetratoEmCena,
  });
  /** Último ponto do ponteiro sobre o mapa — escrito pelo `MapaHex`. */
  const ancoraPonteiroRef = useRef<PontoAxial | null>(null);
  /* A assinatura do canal de Realtime não pode depender da identidade
     de `recarregar`: ela muda a cada troca de cena, e re-inscrever o
     canal inteiro por causa disso derrubaria e refaria a conexão da
     mesa. O ref mantém o handler estável e sempre apontando pra função
     corrente — o mesmo padrão que o resto deste arquivo já usa. */
  const palcoRef = useRef<HTMLElement | null>(null);
  /** Realce do palco enquanto um arquivo paira sobre ele. */
  const [arrastandoArquivo, setArrastandoArquivo] = useState(false);
  const conversorPontoRef = useRef<((x: number, y: number) => PontoAxial | null) | null>(null);
  const pontoAxialDoEvento = useCallback(
    (x: number, y: number): PontoAxial | null => conversorPontoRef.current?.(x, y) ?? null,
    [],
  );
  const imagensRecarregarRef = useRef(imgs.recarregar);
  imagensRecarregarRef.current = imgs.recarregar;
  const [carregandoCena, setCarregandoCena] = useState(true);
  const [erroCena, setErroCena] = useState<string | null>(null);
  const [usuarioId, setUsuarioId] = useState<string | null>(null);
  const [historico, setHistorico] = useState<EstadoHistorico>(HISTORICO_VAZIO);
  const historicoRef = useRef(historico);
  useEffect(() => { historicoRef.current = historico; }, [historico]);
  const [erroAcao, setErroAcao] = useState<string | null>(null);

  // Áreas (migration 0083): qualquer participante válido da campanha
  // pode criar — sem autorização explícita por jogador. Editar/
  // excluir/duplicar continua exigindo narrador OU autoria, decidido
  // sempre no servidor (`pode_editar_vtt_area`).
  const ferramentasDisponiveis = useMemo(() => ferramentasParaPapel(ehNarrador), [ehNarrador]);

  // A cena inteira, sempre fresca — lida por comandos de undo/redo/
  // movimento NO MOMENTO em que rodam, nunca capturada no fechamento
  // (a revisão muda a cada escrita, e um comando pode ser desfeito
  // muito depois de criado). Fonte ÚNICA de verdade: uma versão
  // anterior mantinha um `Map<tokenId,revision>` PARALELO, resincronizado
  // por um efeito disparado em QUALQUER mudança de `estadoCena` — dois
  // efeitos escrevendo revisão por caminhos diferentes (o próprio
  // `aplicar()` e esse efeito) é exatamente a receita de uma leitura
  // stale vencer a mais recente por ordem de execução; ler direto do
  // único estado (via ref) elimina a corrida por construção.
  const estadoCenaRef = useRef<EstadoCenaVtt>(null);
  useEffect(() => { estadoCenaRef.current = estadoCena; }, [estadoCena]);

  // ── RODADAS (trilha de turnos persistida, migration 0088) ────────
  //
  // A trilha deixou de ser estado local: `null` significa "não há
  // combate nesta cena", e o elenco é uma ESCOLHA do narrador na
  // ferramenta Rodadas, não mais "todo token que existe no mapa". A
  // versão anterior sincronizava participantes com a lista de tokens
  // automaticamente — o que era a única opção enquanto não havia onde
  // guardar um elenco, e que agora seria o contrário do pedido: um
  // token novo entraria no combate sozinho, sem ninguém decidir.
  const [trilha, setTrilha] = useState<EstadoTrilha | null>(null);
  const [revisaoTrilha, setRevisaoTrilha] = useState<number>(0);
  const [trilhaOcupada, setTrilhaOcupada] = useState(false);
  const [erroTrilha, setErroTrilha] = useState<string | null>(null);
  // Preferências LOCAIS da ferramenta (posição da janela + trilha
  // oculta pra mim). Nunca estado de combate — ver
  // `_turnos/rodadasPreferencias.ts`.
  const [prefsRodadas, setPrefsRodadas] = useState<PreferenciasRodadas>(PREFERENCIAS_RODADAS_PADRAO);
  const trilhaOculta = prefsRodadas.trilhaOculta;
  const trilhaRef = useRef<{ estado: EstadoTrilha | null; revisao: number }>({ estado: null, revisao: 0 });
  useEffect(() => { trilhaRef.current = { estado: trilha, revisao: revisaoTrilha }; }, [trilha, revisaoTrilha]);

  // Lida UMA vez, quando o usuário já é conhecido — a chave é por
  // usuário e campanha, então ler antes disso pegaria a preferência do
  // "anon" e depois trocaria debaixo da pessoa.
  const prefsRodadasCarregadasRef = useRef(false);
  useEffect(() => {
    if (prefsRodadasCarregadasRef.current || !usuarioId) return;
    prefsRodadasCarregadasRef.current = true;
    setPrefsRodadas(carregarPreferenciasRodadas(chavePreferenciasRodadas(usuarioId, campaignId)));
  }, [usuarioId, campaignId]);

  const usuarioIdRodadasRef = useRef<string | null>(null);
  useEffect(() => { usuarioIdRodadasRef.current = usuarioId; }, [usuarioId]);

  const atualizarPrefsRodadas = useCallback((patch: Partial<PreferenciasRodadas>) => {
    setPrefsRodadas((atual) => {
      const novo = { ...atual, ...patch };
      salvarPreferenciasRodadas(chavePreferenciasRodadas(usuarioIdRodadasRef.current, campaignId), novo);
      return novo;
    });
  }, [campaignId]);

  const alternarTrilhaOculta = useCallback(() => {
    setPrefsRodadas((atual) => {
      const novo = { ...atual, trilhaOculta: !atual.trilhaOculta };
      salvarPreferenciasRodadas(chavePreferenciasRodadas(usuarioIdRodadasRef.current, campaignId), novo);
      return novo;
    });
  }, [campaignId]);

  /**
   * Adota o que o servidor devolveu/transmitiu. `null` = encerrada.
   * Passa SEMPRE pelo validador — um payload de realtime não é mais
   * confiável que uma linha lida, e um estado ilegível nunca vira
   * trilha meio montada na tela.
   */
  const adotarTrilha = useCallback((persistida: { estado: unknown; revision: number } | null) => {
    if (!persistida) { setTrilha(null); setRevisaoTrilha(0); return; }
    const lido = trilhaDeJson(persistida.estado);
    setTrilha(lido);
    setRevisaoTrilha(lido ? persistida.revision : 0);
  }, []);


  // Ids de token com uma rotação em voo — guarda contra clique
  // duplo/rotações concorrentes no mesmo token (ver `onRotacionarToken`).
  const rotacoesPendentesRef = useRef<Set<string>>(new Set());
  /**
   * Última orientação PEDIDA enquanto uma rotação do mesmo token ainda
   * estava em voo. Segurar Q/E (ou clicar duas vezes rápido no giro de
   * 60°) chega mais rápido que a ida e volta ao servidor, e antes disso
   * a segunda tecla era simplesmente DESCARTADA — no teclado o token
   * girava um passo quando quem jogou pediu dois. Guardar a intenção e
   * aplicá-la quando a chamada em voo termina é o que faz o teclado
   * responder como qualquer VTT: uma tecla, um passo.
   */
  const rotacaoEnfileiradaRef = useRef<Map<string, number>>(new Map());
  /**
   * Orientação já PEDIDA (em voo ou na fila) por token — a base contra
   * a qual um passo de ±60° deve ser calculado. `token.orientacao` é a
   * RENDERIZADA: durante a ida e volta ao servidor ela ainda é a
   * antiga, e dois passos seguidos calculados a partir dela dariam o
   * mesmo destino (o token girava um passo pra dois pedidos).
   *
   * Guardar `de` (de onde o pedido partiu) além de `para` é o que dá
   * VALIDADE — e fim — a essa base. A entrada só vale enquanto o
   * desenho ainda mostra `de`; assim que mostra `para`, chegou. E se
   * mostrar QUALQUER OUTRA coisa (um undo, outra sessão girando o mesmo
   * token, uma recusa), o mundo andou por fora e o desenho volta a ser
   * a autoridade. Sem esse terceiro caso a entrada ficava presa num
   * valor que o desenho nunca mais alcançava, e passava a recusar
   * rotações legítimas por "já é essa orientação".
   */
  const orientacaoPedidaRef = useRef<Map<string, { de: number; para: number }>>(new Map());
  const usuarioIdRef = useRef(usuarioId);
  useEffect(() => { usuarioIdRef.current = usuarioId; }, [usuarioId]);
  // Ler dentro de `finalizarPincelTerreno` (efeito com listener GLOBAL
  // de pointerup) — evita esse efeito precisar de `modoTerreno` no
  // array de dependências, que reinscreveria o listener a cada troca
  // de tipo de pincel no meio de nada.
  const modoTerrenoRef = useRef<TipoTerreno | null>(modoTerreno);
  useEffect(() => { modoTerrenoRef.current = modoTerreno; }, [modoTerreno]);

  // ── Animação de movimento de token ────────────────────────────────
  // Uma entrada por token ATUALMENTE animando, chaveada pelo id DEMO
  // (mesma chave de seleção/hover em todo o resto do arquivo) — só
  // muda em eventos discretos (início/fim/substituição de UM
  // movimento), nunca por frame: a interpolação de 60fps mora inteira
  // dentro de `useAnimacaoToken`, sem tocar este estado.
  const [movimentosVisuais, setMovimentosVisuais] = useState<Map<string, MovimentoVisualToken>>(new Map());
  // Espelho SÍNCRONO de `movimentosVisuais` — necessário porque
  // `onAnimacaoConcluida` (abaixo) precisa LER o valor mais recente e
  // DECIDIR com base nele (destino a aplicar em `estadoCena`, se algum)
  // antes de disparar qualquer `setState`. Um updater funcional
  // (`setMovimentosVisuais((m) => ...)`) não serve pra isso: React não
  // garante que ele rode antes da próxima instrução (pode ser adiado,
  // rodar mais de uma vez em Strict Mode, ou nem rodar se a atualização
  // for descartada) — usar sua execução como sinal pra alimentar uma
  // variável local lida logo em seguida é uma corrida real, não só
  // teórica. Toda escrita em `movimentosVisuais` PRECISA passar por
  // `aplicarMovimentosVisuais` abaixo, nunca por `setMovimentosVisuais`
  // direto, pra manter os dois coerentes.
  const movimentosVisuaisRef = useRef<Map<string, MovimentoVisualToken>>(new Map());
  const aplicarMovimentosVisuais = useCallback((proximo: Map<string, MovimentoVisualToken>) => {
    movimentosVisuaisRef.current = proximo;
    setMovimentosVisuais(proximo);
  }, []);
  // Movimentos "conhecidos" (autor local OU já animados via broadcast
  // recebido), por id PERSISTIDO — é como o eco de `postgres_changes`
  // (`onToken`, abaixo) decide "isto eu já sei animar, não reanima"
  // sem precisar que a linha do banco carregue `movementId` nenhum: a
  // correlação é por token + destino + uma janela curta de tempo.
  const movimentosConhecidosRef = useRef<Map<string, { destino: Hex; ateQuando: number }>>(new Map());
  const publicarMovimentoRef = useRef<(e: EventoMovimentoToken) => void>(() => {});
  // Proteção da posição DECLARATIVA contra eventos `onToken`
  // (postgres_changes) intermediários/atrasados de um movimento SUPERADO
  // — sobrevive à conclusão da animação (ao contrário de
  // `movimentosVisuais`, apagada assim que ela termina). Ver
  // `_dominio/reconciliacaoPosicao.ts` pra a política pura completa e o
  // cenário exato que motiva isto (movimento A→B, onToken atrasado de A
  // não pode fazer o token "voltar" antes do onToken de B confirmar).
  const protecoesPosicaoRef = useRef<Map<string, ProtecaoMovimentoVisual>>(new Map());
  // Identidade do movimento mais NOVO conhecido por token — separada de
  // `protecoesPosicaoRef` de propósito. `protecoesPosicaoRef` só existe
  // pra impedir `q/r` intermediário de aparecer visualmente, e por isso
  // é encerrada assim que o destino é CONFIRMADO (não precisa mais
  // proteger nada — a linha já está certa). Se `decidirNovoMovimento`
  // comparasse contra ELA, a confirmação apagaria a única memória de
  // "qual foi o último movimento" — e um broadcast ATRASADO e mais
  // ANTIGO, chegando DEPOIS da confirmação, encontraria `atual = null`
  // e seria aceito por engano (reabrindo exatamente o bug que a ordem
  // de origem devia impedir). `ultimosMovimentosRef` sobrevive à
  // confirmação, por uma janela limitada própria — é contra ELA que
  // `decidirNovoMovimento` sempre compara.
  const ultimosMovimentosRef = useRef<Map<string, ProtecaoMovimentoVisual>>(new Map());
  // Mesma janela de folga de `movimentosConhecidosRef` (duração do
  // movimento + folga de rede) — nunca protege/lembra indefinidamente.
  const JANELA_PROTECAO_POSICAO_MS = 1500;
  // UM ÚNICO timer pra expiração — nunca um por token, nunca um por
  // frame — cobrindo OS DOIS mapas (a próxima expiração é o mínimo
  // entre os dois). Reagendado toda vez que qualquer um dos dois muda;
  // ao disparar, varre e remove de AMBOS o que já expirou (sempre a
  // partir do mapa ATUAL, nunca uma referência capturada — ver
  // `removerProtecoesExpiradas`), então um timer "velho" nunca apaga
  // uma entrada mais nova do mesmo token que a substituiu nesse
  // meio-tempo.
  const timerExpiracaoProtecaoRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reagendarExpiracaoProtecao = useCallback(() => {
    if (timerExpiracaoProtecaoRef.current !== null) {
      clearTimeout(timerExpiracaoProtecaoRef.current);
      timerExpiracaoProtecaoRef.current = null;
    }
    const candidatos = [proximaExpiracao(protecoesPosicaoRef.current), proximaExpiracao(ultimosMovimentosRef.current)]
      .filter((v): v is number => v !== null);
    const proxima = candidatos.length > 0 ? Math.min(...candidatos) : null;
    if (proxima === null) return;
    const atraso = Math.max(0, proxima - Date.now());
    timerExpiracaoProtecaoRef.current = setTimeout(() => {
      timerExpiracaoProtecaoRef.current = null;
      const agora = Date.now();
      protecoesPosicaoRef.current = removerProtecoesExpiradas(protecoesPosicaoRef.current, agora);
      ultimosMovimentosRef.current = removerProtecoesExpiradas(ultimosMovimentosRef.current, agora);
      // Pode haver outra entrada com expiração diferente ainda em
      // algum dos dois mapas (ou nenhuma) — reagenda a partir do que
      // sobrou.
      reagendarExpiracaoProtecao();
    }, atraso);
  }, []);

  // ── "O que eu controlo" — mesma infraestrutura de `character_controllers`
  // que o resto do app já usa (`lib/campaign/session.ts`), nunca
  // `characterId !== null` sozinho: um token TER personagem vinculado
  // não dá controle a QUALQUER jogador, só a quem está em
  // `character_controllers` pra aquele personagem. Recarrega ao
  // ganhar foco da janela — mesmo padrão já estabelecido alhures nesta
  // base de código pra "controle mudou enquanto eu estava noutra aba"
  // sem exigir reload de página inteira.
  const [controlledCharacterIds, setControlledCharacterIds] = useState<string[]>([]);
  const carregarControle = useCallback(() => {
    // `.catch` obrigatório: sem ele, uma rede caída vira rejeição não
    // tratada (nada na tela, erro solto no console). Aqui a falha é
    // mesmo silenciosa — a lista fica vazia, que é o padrão seguro
    // (nenhum controle presumido) e o próximo reload tenta de novo.
    obterControleAction(campaignId)
      .then((r) => { if (r.ok && r.dados) setControlledCharacterIds(r.dados.controlledCharacterIds); })
      .catch(() => { /* sem controle conhecido — padrão seguro */ });
  }, [campaignId]);
  useEffect(() => {
    carregarControle();
    function aoFocar() { carregarControle(); }
    window.addEventListener("focus", aoFocar);
    document.addEventListener("visibilitychange", aoFocar);
    return () => {
      window.removeEventListener("focus", aoFocar);
      document.removeEventListener("visibilitychange", aoFocar);
    };
  }, [carregarControle]);
  // Recarrega ao vivo quando `character_controllers` muda pra esta
  // campanha — sem esperar foco/visibilitychange (que continuam acima
  // como rede de segurança, ex.: timer perdido em aba em segundo
  // plano). Hook já existente e comprovado (`MesaClient.tsx`, "Seus
  // personagens"), reaproveitado aqui, não reimplementado. Só o
  // JOGADOR precisa — o narrador já move qualquer token independente
  // de quem controla o quê.
  useCampaignCharacterControllersRealtime(!ehNarrador ? campaignId : null, carregarControle);

  useEffect(() => {
    let cancelado = false;
    obterUsuarioAtualAction()
      .then((r) => { if (!cancelado && r.ok && r.dados) setUsuarioId(r.dados.id); })
      .catch(() => { /* id fica nulo; o servidor continua sendo a autoridade */ });
    return () => { cancelado = true; };
  }, []);

  /**
   * A geração da carga de cena CORRENTE.
   *
   * Trocar de cena é assíncrono, e as respostas não voltam na ordem em
   * que foram pedidas: A → B → C com a resposta de B chegando por
   * último deixaria o narrador na cena B com o catálogo marcando C.
   * Todo caminho que substitui `estadoCena` — a carga de entrada e cada
   * clique de cartão — leva um número, e só escreve se ele ainda for o
   * corrente. Um `cancelado` por efeito não bastaria: os cliques não
   * são efeitos, e nada os cancelaria entre si.
   */
  const geracaoCenaRef = useRef(0);

  /**
   * Por onde a mesa ABRE.
   *
   * JOGADOR: a cena apresentada, sempre — `presented_scene_id` é a
   * única resposta, e é do servidor. Nenhuma memória local participa;
   * se participasse, uma aba velha manteria o jogador numa cena da
   * qual o narrador já o tirou.
   *
   * NARRADOR: a última cena que ELE abriu, quando ainda existe e ainda
   * é dele. É o que permite fechar o navegador no meio da preparação e
   * voltar onde parou, em vez de ser jogado de volta pra cena da mesa
   * a cada recarga.
   *
   * O id lembrado não é autoridade: `lerCenaAction` responde `null`
   * quando a cena sumiu, foi arquivada ou nunca foi dele — e aí a
   * memória é descartada e a mesa abre como sempre abriu.
   */
  const carregarCenaDeEntrada = useCallback(async () => {
    if (!ehNarrador) return lerCenaAtiva(campaignId);

    const lembrada = lerCenaVista(campaignId);
    if (lembrada) {
      const r = await lerCenaAction({ campaignId, sceneId: lembrada });
      if (r.ok && r.dados) return r;
      esquecerCenaVista(campaignId);
    }
    return garantirCenaSemente(campaignId);
  }, [campaignId, ehNarrador]);

  useEffect(() => {
    const geracao = ++geracaoCenaRef.current;
    const cancelou = () => geracao !== geracaoCenaRef.current;
    setCarregandoCena(true);
    carregarCenaDeEntrada().then((r) => {
      if (cancelou()) return;
      if (!r.ok) { setErroCena(r.erro ?? "Falha ao carregar a cena."); setCarregandoCena(false); return; }
      setEstadoCena(r.dados ?? null);
      // A trilha vem na MESMA carga (`carregarCenaAtiva`): recarregar a
      // página no meio do combate volta na rodada e janela certas, sem
      // um piscar de "sem combate" antes.
      adotarTrilha(r.dados?.trilha ?? null);
      setErroCena(null);
      setCarregandoCena(false);
    }).catch((e) => {
      // Uma Server Action que REJEITA (em vez de devolver `{ok:false}`)
      // nunca deveria travar a tela em "carregando" pra sempre — mesmo
      // sendo um caso inesperado, precisa virar mensagem visível.
      if (cancelou()) return;
      setErroCena(e instanceof Error ? e.message : "Falha inesperada ao carregar a cena.");
      setCarregandoCena(false);
    });
    // Desmontar invalida a geração: uma resposta que chegue depois não
    // escreve num componente que já saiu.
    return () => { geracaoCenaRef.current++; };
  }, [carregarCenaDeEntrada, adotarTrilha]);

  /**
   * ABRIR outra cena — o gesto do catálogo.
   *
   * Não toca no palco: `vtt_campaign_stage` continua onde estava e os
   * jogadores não se movem. Essa é a Fase 2 inteira em uma função, e é
   * a razão de a Fase 1 ter separado as duas colunas.
   *
   * Substituir `estadoCena` basta pra religar a mesa: o efeito do
   * Realtime depende de `estadoCena?.cena.id` e já derruba o canal
   * anterior antes de assinar o novo, e as imagens seguem o mesmo id
   * pelo `useImagensDaCena`.
   */
  const trocarParaCena = useCallback((sceneId: string, opcoes: { lembrar: boolean }) => {
    if (estadoCenaRef.current?.cena.id === sceneId) return;
    const geracao = ++geracaoCenaRef.current;
    setCarregandoCena(true);
    setErroCena(null);
    lerCenaAction({ campaignId, sceneId }).then((r) => {
      if (geracao !== geracaoCenaRef.current) return;
      if (!r.ok) { setErroCena(r.erro ?? "Falha ao abrir a cena."); setCarregandoCena(false); return; }
      if (!r.dados) {
        // Sumiu, foi arquivada, ou nunca foi dele — a distinção fica no
        // banco de propósito (ver `carregarCena`). A memória local vai
        // junto: insistir nela na próxima recarga repetiria o erro.
        if (opcoes.lembrar) esquecerCenaVista(campaignId);
        setErroCena("Esta cena não está mais disponível.");
        setCarregandoCena(false);
        return;
      }
      setEstadoCena(r.dados);
      adotarTrilha(r.dados.trilha ?? null);
      if (opcoes.lembrar) gravarCenaVista(campaignId, sceneId);
      setCarregandoCena(false);
    }).catch((e) => {
      if (geracao !== geracaoCenaRef.current) return;
      setErroCena(e instanceof Error ? e.message : "Falha inesperada ao abrir a cena.");
      setCarregandoCena(false);
    });
  }, [campaignId, adotarTrilha]);

  /** O gesto do catálogo: abre pro narrador e LEMBRA onde ele estava. */
  const abrirCena = useCallback(
    (sceneId: string) => trocarParaCena(sceneId, { lembrar: true }),
    [trocarParaCena],
  );

  // ── PALCO (fase 3) ───────────────────────────────────────────────
  /**
   * O palco conhecido por este cliente — a cena onde a MESA está.
   *
   * `cenaApresentadaRef` e não `palcoRef` porque `palcoRef` já é outra
   * coisa neste arquivo: o elemento DOM `.rv-palco`. Dois "palcos" a
   * dez linhas um do outro seriam duas coisas sem relação nenhuma
   * dividindo um nome.
   *
   * Ref e não estado: quem apresenta precisa da revisão no INSTANTE do
   * clique, e um estado leria a do render anterior — exatamente o valor
   * velho que `present_vtt_scene` existe pra recusar.
   */
  const cenaApresentadaRef = useRef<{ sceneId: string; revision: number } | null>(null);
  /** Bump = "o catálogo tem um selo velho". Só o narrador se importa. */
  const [versaoPalco, setVersaoPalco] = useState(0);
  /** "O narrador mudou a cena" — some sozinho. */
  const [avisoPalco, setAvisoPalco] = useState<string | null>(null);

  /**
   * O que este cliente FAZ quando a mesa muda de cena.
   *
   * Jogador: vai junto. É a fase inteira — chegar na cena nova sem
   * recarregar a página.
   *
   * Narrador: NÃO vai junto. Ele pode estar montando a cena seguinte
   * enquanto apresenta outra, e ser arrastado pelo próprio gesto
   * desfaria a separação que a 0111 construiu. Só o selo do catálogo
   * se atualiza.
   */
  /**
   * Onde EU deveria estar — perguntado ao servidor, nunca calculado
   * aqui.
   *
   * Desde a 0118 a resposta é `atribuição ?? palco`, e essa regra mora
   * no banco. Recalculá-la no navegador seria uma segunda
   * implementação, divergindo no primeiro caso difícil — "fui
   * atribuído e o palco mudou no mesmo segundo". Perguntar custa um
   * round-trip por evento, e esses eventos são raros.
   *
   * O NARRADOR nunca é arrastado: ele pode estar montando a cena
   * seguinte, e ser movido pelo próprio gesto desfaria a separação que
   * a 0111 construiu.
   */
  const reavaliarMinhaCena = useCallback((motivo: string) => {
    if (ehNarrador) return;
    void lerMinhaCenaAction(campaignId).then((r) => {
      if (!r.ok || !r.dados?.sceneId) return;
      const destino = r.dados.sceneId;
      if (estadoCenaRef.current?.cena.id === destino) return;
      // O aviso vem ANTES da carga: a cena nova pode demorar, e trocar
      // o mapa sob os pés de alguém sem dizer por quê é o pior dos dois.
      setAvisoPalco(motivo);
      trocarParaCena(destino, { lembrar: false });
    }).catch(() => { /* a próxima reconexão reconcilia */ });
  }, [campaignId, ehNarrador, trocarParaCena]);

  const aplicarPalco = useCallback((palco: { sceneId: string; revision: number }) => {
    const anterior = cenaApresentadaRef.current;
    // Evento repetido (eco da própria escrita, reconciliação logo após
    // o evento) não é motivo pra reprocessar nada.
    if (anterior && anterior.revision === palco.revision && anterior.sceneId === palco.sceneId) return;
    cenaApresentadaRef.current = palco;
    setVersaoPalco((v) => v + 1);
    // O palco ter mudado NÃO significa que este jogador se move: ele
    // pode estar atribuído a outra cena. Quem decide é o servidor.
    reavaliarMinhaCena("O narrador mudou a cena.");
  }, [reavaliarMinhaCena]);

  /**
   * A cena que o narrador estava olhando foi arquivada ou excluída.
   *
   * Ficar nela seria pior que sair: excluída, ela não existe mais;
   * arquivada, o gatilho da 0115 recusa toda escrita, e as ferramentas
   * responderiam "restaure antes de editar" a cada gesto sem que nada
   * na tela explicasse o motivo.
   *
   * O destino é o PALCO — a cena que a mesa está usando é o lugar
   * seguro por definição, e é onde ele estaria se nunca tivesse aberto
   * o catálogo. A memória local vai junto: insistir na cena que acabou
   * de sair de uso repetiria o problema na próxima recarga.
   */
  const aoCenaSairDeUso = useCallback((sceneId: string) => {
    if (estadoCenaRef.current?.cena.id !== sceneId) return;
    esquecerCenaVista(campaignId);
    const destino = cenaApresentadaRef.current?.sceneId;
    if (destino && destino !== sceneId) {
      trocarParaCena(destino, { lembrar: false });
      return;
    }
    // Sem palco conhecido (campanha que nunca apresentou): relê o
    // caminho de entrada, que sabe escolher sozinho.
    void lerCenaApresentadaAction(campaignId).then((r) => {
      if (r.ok && r.dados) {
        setEstadoCena(r.dados);
        adotarTrilha(r.dados.trilha ?? null);
      }
    }).catch(() => { /* a mensagem de erro da própria escrita já está na janela */ });
  }, [campaignId, trocarParaCena, adotarTrilha]);

  useEffect(() => {
    if (!avisoPalco) return;
    const t = setTimeout(() => setAvisoPalco(null), 5000);
    return () => clearTimeout(t);
  }, [avisoPalco]);

  useEffect(() => {
    return subscribeToVttPalco({
      campaignId,
      onPalco: aplicarPalco,
      /**
       * Toda vez que a inscrição (re)estabelece — inclusive a primeira.
       *
       * O canal não guarda histórico: quem ficou offline não recebe o
       * que perdeu, e voltaria a jogar numa cena que a mesa abandonou
       * há dez minutos, sem nada na tela denunciando isso. Reler o
       * palco é a única reconciliação possível.
       */
      onReconectado: () => {
        void lerPalcoAction(campaignId)
          .then((r) => { if (r.ok && r.dados) aplicarPalco(r.dados); })
          .catch(() => { /* a próxima reconexão tenta de novo */ });
      },
    });
  }, [campaignId, aplicarPalco]);

  /**
   * As ATRIBUIÇÕES individuais (0118).
   *
   * Canal separado do palco porque são fatos diferentes: o palco move a
   * mesa, a atribuição move UMA pessoa. Para o jogador, a RLS garante
   * que só a própria linha chega — então qualquer evento aqui é sobre
   * ele. Para o narrador, chegam todas, e servem aos indicadores.
   */
  useEffect(() => {
    return subscribeToVttAtribuicoes({
      campaignId,
      onAtribuicoesMudaram: () => {
        setVersaoPalco((v) => v + 1); // o catálogo mostra quem está onde
        reavaliarMinhaCena("O narrador levou você para outra cena.");
      },
      onReconectado: () => {
        // Reconciliação: quem ficou offline pode ter sido movido sem
        // receber o evento, e continuaria numa cena que já não é a dele.
        setVersaoPalco((v) => v + 1);
        reavaliarMinhaCena("O narrador levou você para outra cena.");
      },
    });
  }, [campaignId, reavaliarMinhaCena]);

  // ── Fonte canônica ────────────────────────────────────────────────
  // `estadoCena.tokens` (persistido) é a ÚNICA fonte da lista de
  // tokens depois do carregamento. Identidade é sempre `vtt_tokens.id`
  // — não existe mais "id demo" pra rotear/casar nada.
  //
  // Visibilidade pro jogador já é filtrada no SERVIDOR (RLS
  // `vtt_tokens_select`, migration 0065: `visivel or is_campaign_owner`)
  // — uma linha oculta nem chega em `estadoCena.tokens` pra um jogador,
  // então não há filtro de visibilidade a refazer aqui.
  const tokensApresentacao = useMemo(
    // `(t) => …` e não `map(tokenApresentacaoDe)`: passar a função nua
    // entregaria o ÍNDICE do `map` no segundo parâmetro, que agora é o
    // mapa de URLs assinadas.
    () => (estadoCena?.tokens ?? []).map((t) => tokenApresentacaoDe(t, imgs.urls)),
    [estadoCena, imgs.urls],
  );
  const tokenPorId = useMemo(() => new Map(tokensApresentacao.map((t) => [t.id, t])), [tokensApresentacao]);
  /**
   * Objetos PERSISTIDOS no formato que a camada de mapa já desenha
   * (sombra, faces, rachadura de dano, hint) — reaproveitar aquele
   * renderizador evita um segundo desenho paralelo que divergiria.
   * Uma cena sem objeto nenhum simplesmente não desenha objeto nenhum
   * — nada de conteúdo decorativo pra preencher o vazio.
   */
  const objetosDesenhaveis = useMemo<ObjetoCena[]>(() => {
    const persistidos = estadoCena?.objetos ?? [];
    return persistidos.map((o) => {
      const preset = PRESETS_OBJETO[o.preset] ?? PRESETS_OBJETO.personalizado;
      return {
        id: o.id,
        nome: o.nome,
        celulas: o.celulas,
        // Cobertura/categoria são informativas; sem valor definido, cai
        // no padrão do preset só pra ter o que desenhar e rotular.
        grau: (o.grauCobertura ?? preset.grauCobertura ?? "parcial") as ObjetoCena["grau"],
        categoria: (o.categoria ?? preset.categoria ?? "media") as ObjetoCena["categoria"],
        pd: o.pd,
        pdMax: o.pdMax,
        tipo: preset.aparencia,
      };
    });
  }, [estadoCena?.objetos]);

  // `carregandoCena`/`erroCena`, quando `estadoCena` já é garantido
  // não-nulo — mas o hook roda incondicionalmente a cada render, então
  // precisa de ALGUM valor tipável enquanto ainda carrega.
  const cenaExibida: CenaMapa = useMemo(() => ({
    nome: estadoCena?.cena.nome ?? "",
    largura: estadoCena?.cena.largura ?? 0,
    altura: estadoCena?.cena.altura ?? 0,
    objetos: objetosDesenhaveis,
    tokens: tokensApresentacao,
  }), [tokensApresentacao, estadoCena?.cena.nome, estadoCena?.cena.largura, estadoCena?.cena.altura]);

  /** Terreno PINTADO pelo narrador, cru — uma das fontes do mapa tático. */
  const terrenoPintado: MapaTerreno = useMemo(
    () => new Map((estadoCena?.terreno ?? []).map((c) => [hexKey({ q: c.q, r: c.r }), c.tipo])),
    [estadoCena],
  );
  /**
   * Recorte MECÂNICO dos objetos da cena — só o que decide passagem.
   * Nome, PD, cobertura e aparência não entram: quem desenha o painel lê
   * `estadoCena.objetos` direto.
   */
  const objetosTaticos = useMemo<ObjetoTatico[]>(
    () => (estadoCena?.objetos ?? []).map((o) => ({
      id: o.id,
      celulas: o.celulas,
      bloqueiaMovimento: o.bloqueiaMovimento,
      terrenoProjetado: o.terrenoProjetado,
    })),
    [estadoCena?.objetos],
  );

  /**
   * Terreno EFETIVO — o que movimento, pathfinding, posicionamento e
   * rotação consomem. Passa por `montarMapaTatico` de propósito: é o
   * único lugar onde a precedência entre fontes mora (terreno pintado ×
   * objetos), então nenhuma função de movimento precisa saber se o
   * bloqueio veio de um muro, de um veículo ou de pintura manual.
   * O servidor revalida por conta própria (`vtt_celula_bloqueada`,
   * migration 0085) — isto aqui é a prévia, nunca a verdade.
   */
  const terrenoReal: MapaTerreno = useMemo(
    () => montarMapaTatico({ terrenoPintado, objetos: objetosTaticos }).terrenoEfetivo,
    [terrenoPintado, objetosTaticos],
  );
  const terrenoRealRef = useRef(terrenoReal);
  useEffect(() => { terrenoRealRef.current = terrenoReal; }, [terrenoReal]);

  const marcasExibidas = useMemo(() => (estadoCena?.marcas ?? []).map((m) => ({
    id: m.id, q: m.pontos[0]?.q ?? 0, r: m.pontos[0]?.r ?? 0,
    cor: COR_MARCA_HEX[m.cor] ?? "#00d4ff",
    sinal: m.sinal,
    texto: m.texto,
    podeApagar: ehNarrador || m.autorId === usuarioId,
  })).filter((m) => {
    const original = estadoCena?.marcas.find((o) => o.id === m.id);
    return !original?.privada || ehNarrador || original.autorId === usuarioId;
  }), [estadoCena, ehNarrador, usuarioId]);

  const tokenSelecionado = selecionadoId ? tokenPorId.get(selecionadoId) ?? null : null;
  // O HUD representa exclusivamente a seleção explícita. Sem seleção,
  // não há personagem principal, último token ou espaço reservado.
  const tokenDoHud = tokenSelecionado;

  /**
   * Personagem por trás do token selecionado — a DICA que o Chat do
   * painel usa pra "falar como esse personagem".
   *
   * Só é oferecida quando o token de fato tem `characterId` E a conta
   * pode controlá-lo (`podeControlar` vem do servidor, junto do
   * token). Ainda assim não autoriza nada sozinha: o painel só aceita
   * a identidade se ela constar na lista de personagens autorizados
   * (resolvida no servidor), e a Server Action de envio revalida o
   * personagem antes de gravar. O `nome` daqui é o do TOKEN, e serve
   * só como rótulo provisório — a autoria gravada usa o nome do
   * personagem lido do banco.
   */
  const personagemDoTokenSelecionado = useMemo(
    () =>
      tokenSelecionado?.characterId && tokenSelecionado.podeControlar
        ? { id: tokenSelecionado.characterId, nome: tokenSelecionado.nome }
        : null,
    [tokenSelecionado],
  );

  /**
   * Aplica uma transição na trilha: otimista na tela, autoritativa no
   * servidor.
   *
   * O otimismo é o que faz clicar "Agir" responder na hora, mas ele
   * NUNCA é a verdade — se a revisão não bater (outra sessão avançou
   * primeiro), a resposta do servidor é reaplicada por cima e o
   * usuário vê a mensagem. Mesmo padrão de concorrência de token e
   * área: revisão esperada na escrita, releitura no conflito, nunca
   * `force`.
   */
  const mutarTrilha = useCallback((transicao: (t: EstadoTrilha) => EstadoTrilha) => {
    const sceneId = estadoCenaRef.current?.cena.id;
    const atual = trilhaRef.current;
    if (!sceneId || !atual.estado) return;

    const proximo = transicao(atual.estado);
    if (proximo === atual.estado) return; // transição recusada pelo modelo: nada a gravar
    setTrilha(proximo);
    setErroTrilha(null);
    setTrilhaOcupada(true);

    void atualizarTrilhaAction({
      campaignId, sceneId, estado: trilhaParaJson(proximo), revisionEsperada: atual.revisao,
    }).then(async (r) => {
      if (r.ok) { adotarTrilha(r.dados ?? null); return; }
      setErroTrilha(r.erro ?? "Falha ao atualizar as rodadas.");
      // Conflito ou recusa: a tela volta pro que o servidor tem, nunca
      // fica com a jogada otimista que não foi aceita.
      const releitura = await lerTrilhaAction(campaignId, sceneId).catch(() => null);
      if (releitura?.ok) adotarTrilha(releitura.dados ?? null);
    }).finally(() => setTrilhaOcupada(false));
  }, [campaignId, adotarTrilha]);

  /**
   * Reconciliação de FANTASMA: participante cujo token sumiu do mapa.
   *
   * Só o NARRADOR escreve. Se todo cliente reconciliasse, cada token
   * removido viraria uma corrida de escritas concorrentes com o mesmo
   * resultado — todas menos a primeira falhando por revisão. Um
   * escritor só, e os outros recebem pelo realtime.
   */
  useEffect(() => {
    if (!ehNarrador || !trilha || trilhaOcupada) return;
    const idsAtuais = new Set(tokensApresentacao.map((t) => t.id));
    if (trilha.participantes.every((p) => idsAtuais.has(p.id))) return;
    // Elenco vazio depois da poda não pode virar trilha vazia (o banco
    // recusa, e com razão): o narrador encerra explicitamente.
    if (!trilha.participantes.some((p) => idsAtuais.has(p.id))) return;
    mutarTrilha((t) => ({
      ...t,
      agindoId: t.agindoId && idsAtuais.has(t.agindoId) ? t.agindoId : null,
      participantes: t.participantes.filter((p) => idsAtuais.has(p.id)),
    }));
  }, [ehNarrador, trilha, trilhaOcupada, tokensApresentacao, mutarTrilha]);

  const iniciarRodadas = useCallback((params: { tokenIds: string[]; modo: ModoCena; ladoSurpresa: Lado | null }) => {
    const sceneId = estadoCenaRef.current?.cena.id;
    if (!sceneId) return;
    const escolhidos = tokensApresentacao.filter((t) => params.tokenIds.includes(t.id));
    if (escolhidos.length === 0) return;
    setErroTrilha(null);
    setTrilhaOcupada(true);
    const estado = estadoInicialTrilha({ tokens: escolhidos, modo: params.modo, ladoSurpresa: params.ladoSurpresa });
    void iniciarTrilhaAction({ campaignId, sceneId, estado: trilhaParaJson(estado) })
      .then((r) => {
        if (r.ok) { adotarTrilha(r.dados ?? null); return; }
        setErroTrilha(r.erro ?? "Falha ao iniciar as rodadas.");
      })
      .finally(() => setTrilhaOcupada(false));
  }, [campaignId, adotarTrilha, tokensApresentacao]);

  const encerrarRodadas = useCallback(() => {
    const sceneId = estadoCenaRef.current?.cena.id;
    if (!sceneId) return;
    setErroTrilha(null);
    setTrilhaOcupada(true);
    void encerrarTrilhaAction({ campaignId, sceneId })
      .then((r) => {
        // Encerrar limpa o estado transitório da rodada junto: sem
        // trilha não há revisão, e a próxima começa da estaca zero.
        if (r.ok) { adotarTrilha(null); return; }
        setErroTrilha(r.erro ?? "Falha ao encerrar as rodadas.");
      })
      .finally(() => setTrilhaOcupada(false));
  }, [campaignId, adotarTrilha]);

  // `estadoPorToken` propriamente dito é declarado mais abaixo (perto
  // dos outros derivados de `estadoAreas`) — precisa de
  // `tokenOrigemAuraId`, que só existe depois de `estadoAreas`.

  // ── Seleção (único + shift-click múltiplo + caixa) ────────────────
  const onSelecionarToken = useCallback((id: string, aditivo: boolean) => {
    if (!aditivo) {
      setSelecionadosIds(new Set([id]));
      setSelecionadoId(id);
      return;
    }
    const next = new Set(selecionadosIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelecionadosIds(next);
    setSelecionadoId(next.has(id) ? id : ([...next].at(-1) ?? null));
  }, [selecionadosIds]);
  const onSelecionarCaixa = useCallback((ids: string[], aditivo: boolean) => {
    setSelecionadoId(ids[ids.length - 1] ?? null);
    setSelecionadosIds((s) => (aditivo ? new Set([...s, ...ids]) : new Set(ids)));
  }, []);

  // ── Movimento ──────────────────────────────────────────────────
  const executarComando = useCallback((cmd: Comando) => {
    setHistorico((h) => registrarComando(h, cmd));
  }, []);

  // Constrói e registra UMA animação — usado tanto pro movimento
  // "de verdade" (rota completa, duração calculada pelo peso do
  // terreno) quanto pra retrações/reconciliações curtas (duração
  // explícita via `duracaoOverride`). Devolve o objeto construído pra
  // quem chama poder reusar a MESMA duração no evento de broadcast,
  // nunca recalculada duas vezes (risco de divergir).
  const iniciarMovimentoVisual = useCallback((params: {
    tokenId: string;
    rotaExpandida: Hex[];
    movementId: string;
    duracaoOverride?: number;
    // epoch ms de quando este movimento REALMENTE começou (do ponto de
    // vista do autor) — quem chama e TAMBÉM publica um broadcast pro
    // mesmo movimento (`onSoltarToken`) precisa passar o MESMO valor
    // usado nesse broadcast; nunca duas chamadas de `Date.now()`
    // separadas pro que devia ser um único instante (ver
    // `ProtecaoMovimentoVisual.iniciadoEm`). Omitido = `Date.now()`
    // (retrações/fallbacks locais, sem broadcast correspondente).
    iniciadoEmOrigem?: number;
  }): MovimentoVisualToken => {
    const pesos = pesosDaRota(params.rotaExpandida, terrenoRealRef.current);
    const duracao = params.duracaoOverride ?? calcularDuracao(pesos);
    const iniciadoEmOrigem = params.iniciadoEmOrigem ?? Date.now();
    const mov: MovimentoVisualToken = {
      movementId: params.movementId,
      tokenId: params.tokenId,
      rota: params.rotaExpandida,
      pesos,
      inicio: performance.now(),
      duracao,
      origem: params.rotaExpandida[0],
      destino: params.rotaExpandida[params.rotaExpandida.length - 1],
    };
    // MESMA decisão usada pra broadcasts remotos (`receberMovimentoRemoto`)
    // — nunca ordem de chegada, sempre origem real do movimento
    // (`iniciadoEm`), e sempre contra `ultimosMovimentosRef` (nunca
    // `protecoesPosicaoRef`, que pode já ter sido encerrada por uma
    // confirmação — ver o comentário junto de `ultimosMovimentosRef`
    // acima). Pra um gesto local genuíno isto sempre resolve em
    // "aplicar" (o relógio local é monotônico) — mas passa pela MESMA
    // arbitragem em vez de uma substituição incondicional separada,
    // pra `movimentosVisuais`/proteção/identidade nunca poderem
    // divergir sobre qual é o movimento vigente.
    const ultimoConhecido = ultimosMovimentosRef.current.get(params.tokenId) ?? null;
    const decisao = decidirNovoMovimento(
      ultimoConhecido ? { movementId: ultimoConhecido.movementId, iniciadoEm: ultimoConhecido.iniciadoEm } : null,
      { movementId: params.movementId, iniciadoEm: iniciadoEmOrigem },
    );

    // Janela de "já sei animar isto" pro dedupe do eco do banco — ver
    // o `onToken` de `subscribeToVttScene` mais abaixo. Só atualizado
    // quando o movimento é de fato aceito (ou é uma redelivery do
    // MESMO movimento já conhecido) — um candidato REJEITADO por ser
    // mais antigo (`"ignorar"`) nunca pode sobrescrever isto com o
    // destino ERRADO: se sobrescrevesse, a confirmação LEGÍTIMA do
    // movimento vigente (que chegaria depois, com o destino certo)
    // deixaria de bater com o que este dedupe "acha" que já sabe,
    // disparando uma animação de fallback espúria e redundante.
    if (decisao !== "ignorar") {
      movimentosConhecidosRef.current.set(params.tokenId, { destino: mov.destino, ateQuando: Date.now() + duracao + 1500 });
    }

    if (decisao === "aplicar") {
      const novo = new Map(movimentosVisuaisRef.current);
      novo.set(params.tokenId, mov);
      aplicarMovimentosVisuais(novo);
      const entrada = criarProtecaoMovimento({
        tokenId: params.tokenId, movementId: params.movementId, destino: mov.destino,
        iniciadoEm: iniciadoEmOrigem, agora: Date.now(), janelaMs: duracao + JANELA_PROTECAO_POSICAO_MS,
      });
      // Proteção de `q/r`: sobrevive à conclusão da ANIMAÇÃO, mas é
      // encerrada assim que o destino é CONFIRMADO pelo banco. Última
      // identidade conhecida: sobrevive à própria CONFIRMAÇÃO, só
      // expira pela janela — é contra ela que a arbitragem acima
      // sempre compara.
      protecoesPosicaoRef.current.set(params.tokenId, entrada);
      ultimosMovimentosRef.current.set(params.tokenId, entrada);
      reagendarExpiracaoProtecao();
    }
    // "duplicata": o MESMO movimento já é o vigente — nunca reinicia o
    // relógio local da animação em voo. "ignorar": um candidato mais
    // ANTIGO que o vigente — não deveria acontecer pra um gesto local
    // de verdade (relógio monotônico), mas se acontecer, não regride
    // visualmente o token. Nos dois casos, `mov` ainda é devolvido —
    // quem chama (`onSoltarToken`) usa `mov.duracao` pra publicar o
    // broadcast independente do resultado da arbitragem local.
    return mov;
  }, [aplicarMovimentosVisuais, reagendarExpiracaoProtecao]);

  const onAnimacaoConcluida = useCallback((tokenId: string, movementId: string, destino?: Hex) => {
    // Decisão tomada AQUI, lendo o espelho SÍNCRONO — nunca dentro do
    // updater de `setMovimentosVisuais` (ver comentário junto de
    // `movimentosVisuaisRef` acima: um updater funcional não tem
    // garantia de rodar antes da próxima instrução, e usar sua
    // execução pra alimentar uma variável local lida em seguida é uma
    // corrida real). Se já foi SUBSTITUÍDA por um movimento mais novo
    // (concorrência: chegou outro antes deste terminar) ou já removida
    // por outro motivo, o `movementId` não bate mais — ignora esta
    // conclusão por completo: nunca apaga a animação nova, nunca
    // patcheia a posição com um destino obsoleto.
    const atual = movimentosVisuaisRef.current.get(tokenId);
    if (!atual || atual.movementId !== movementId) return;

    // A posição DECLARATIVA (`token.q/r`, usada assim que
    // `movimentoVisual` some — ver `Token` em `MapaHex.tsx`) precisa já
    // refletir o destino desta animação ANTES dela sumir do mapa —
    // nunca esperar a confirmação separada do Realtime
    // (`onToken`/postgres_changes ou `recarregarTokensAutorizados`),
    // que corre num canal INDEPENDENTE do relógio local da animação e
    // pode legitimamente chegar DEPOIS dela terminar. Sem isto, quem
    // só OBSERVA o movimento de outra sessão (nunca aplica a posição
    // otimisticamente, ao contrário de quem inicia o gesto) via
    // `receberMovimentoRemoto` sofre um salto visível de volta pra
    // origem exatamente no instante em que a animação some — o token
    // fica "preso" ali até a confirmação atrasada finalmente chegar.
    // Patchear a posição ANTES de remover a animação (mesmo as duas
    // sendo batidas no mesmo commit React, já que não há `await` entre
    // elas) garante que nunca existe um frame em que `movimentoVisual`
    // já sumiu e `token.pos` ainda não reflete o destino.
    if (destino) {
      setEstadoCena((c) => (c ? { ...c, tokens: c.tokens.map((t) => (t.id === tokenId ? { ...t, q: destino.q, r: destino.r } : t)) } : c));
    }
    const novo = new Map(movimentosVisuaisRef.current);
    novo.delete(tokenId);
    aplicarMovimentosVisuais(novo);
  }, [aplicarMovimentosVisuais]);

  // Recebido de OUTRO cliente via broadcast — nunca do próprio autor
  // (o canal não usa `self: true`); a checagem de `autorId` abaixo é
  // só defesa extra, documentada como tal.
  const receberMovimentoRemoto = useCallback((e: EventoMovimentoToken) => {
    if (e.autorId && e.autorId === usuarioIdRef.current) return;
    const rota = e.rota.map((p) => ({ q: p.q, r: p.r }));
    if (rota.length < 2) return;
    const destino = rota[rota.length - 1];

    // A ordem que decide se este broadcast SUBSTITUI o que já é
    // conhecido pra este token é a ORIGEM real do movimento
    // (`e.iniciadoEm`, quando o AUTOR o começou), NUNCA a ordem em que
    // os broadcasts chegam neste cliente — a rede pode entregar fora de
    // ordem tanto quanto o Postgres. Comparado sempre contra
    // `ultimosMovimentosRef`, nunca `protecoesPosicaoRef` — essa pode
    // já ter sido encerrada por uma CONFIRMAÇÃO de destino (`onToken`),
    // e se a arbitragem comparasse contra ela, um broadcast atrasado e
    // mais antigo chegando DEPOIS da confirmação encontraria "nada
    // vigente" e seria aceito por engano. Um candidato mais ANTIGO que
    // o vigente (`"ignorar"`) é descartado por completo: nunca reinicia
    // a animação, nunca toca a proteção de posição.
    const ultimoConhecido = ultimosMovimentosRef.current.get(e.tokenId) ?? null;
    const decisao = decidirNovoMovimento(
      ultimoConhecido ? { movementId: ultimoConhecido.movementId, iniciadoEm: ultimoConhecido.iniciadoEm } : null,
      { movementId: e.movementId, iniciadoEm: e.iniciadoEm },
    );

    // Dedupe de fallback (`onToken`, "já sei animar isto") — só
    // atualizado quando este broadcast é de fato aceito (ou é a MESMA
    // redelivery já conhecida). Um broadcast REJEITADO por ser mais
    // antigo nunca pode sobrescrever isto com o destino ERRADO: faria
    // a confirmação LEGÍTIMA do movimento vigente (que chega depois,
    // com o destino certo) deixar de bater com o que este dedupe "acha"
    // que já sabe, disparando um fallback espúrio e redundante.
    if (decisao !== "ignorar") {
      movimentosConhecidosRef.current.set(e.tokenId, { destino, ateQuando: e.iniciadoEm + e.duracao + 1500 });
    }
    if (decisao !== "aplicar") return;

    // Compensa o atraso de rede entre o autor iniciar e este cliente
    // receber: começa a própria animação "adiantada" no relógio local,
    // pra terminar no MESMO instante real que o autor — nunca perfeito
    // quadro a quadro, mas dentro da folga normal de latência.
    const atrasoRede = Math.max(0, Date.now() - e.iniciadoEm);
    const novo = new Map(movimentosVisuaisRef.current);
    novo.set(e.tokenId, {
      movementId: e.movementId,
      tokenId: e.tokenId,
      rota,
      pesos: pesosDaRota(rota, terrenoRealRef.current),
      inicio: performance.now() - atrasoRede,
      duracao: e.duracao,
      origem: rota[0],
      destino,
    });
    aplicarMovimentosVisuais(novo);
    const entrada = criarProtecaoMovimento({
      tokenId: e.tokenId, movementId: e.movementId, destino,
      iniciadoEm: e.iniciadoEm, agora: Date.now(), janelaMs: e.duracao + JANELA_PROTECAO_POSICAO_MS,
    });
    protecoesPosicaoRef.current.set(e.tokenId, entrada);
    ultimosMovimentosRef.current.set(e.tokenId, entrada);
    reagendarExpiracaoProtecao();
  }, [aplicarMovimentosVisuais, reagendarExpiracaoProtecao]);

  useEffect(() => {
    const { publicar, unsubscribe } = subscribeToVttTokenMovement({ campaignId, onMovimento: receberMovimentoRemoto });
    publicarMovimentoRef.current = publicar;
    return () => { unsubscribe(); publicarMovimentoRef.current = () => {}; };
  }, [campaignId, receberMovimentoRemoto]);

  /**
   * Aplica uma linha de ÁREA no estado local. Idempotente por REVISÃO:
   * uma revisão IGUAL OU MENOR que a já conhecida é descartada — é o
   * que impede (a) o eco Realtime da própria escrita duplicar a área e
   * (b) um evento antigo, atrasado na rede, reverter uma edição mais
   * nova. Só o array `areas` é tocado: tokens, terreno e marcas da
   * cena ficam exatamente como estavam.
   */
  const mesclarAreaNoEstado = useCallback((area: NonNullable<EstadoCenaVtt>["areas"][number]) => {
    setEstadoCena((c) => {
      if (!c || area.sceneId !== c.cena.id) return c;
      const atual = c.areas.find((a) => a.id === area.id);
      if (atual && atual.revision >= area.revision) return c;
      return { ...c, areas: atual ? c.areas.map((a) => (a.id === area.id ? area : a)) : [...c.areas, area] };
    });
  }, []);

  const removerAreaDoEstado = useCallback((id: string) => {
    setEstadoCena((c) => {
      if (!c || !c.areas.some((a) => a.id === id)) return c;
      return { ...c, areas: c.areas.filter((a) => a.id !== id) };
    });
    // Exclusão (local ou remota) precisa encerrar seleção e edição
    // relacionadas — nunca deixar o painel editando algo que não existe.
    setAreaSelecionadaId((sel) => (sel === id ? null : sel));
    setEstadoAreas((e) => (e.fase === "editando" && e.areaId === id ? AREAS_OCIOSA : e));
  }, []);

  // ── Realtime — aplica a linha patchada direto no estado local ────
  // Precisa vir DEPOIS de `iniciarMovimentoVisual` (usa a função no
  // corpo do `onToken` abaixo, e por isso também na dependência do
  // efeito) — diferente de uma referência só dentro do CORPO de um
  // callback (que ficaria em paz mesmo declarada antes, já que efeitos
  // só rodam depois que a função do componente inteira já executou), a
  // ARRAY DE DEPENDÊNCIAS do `useEffect` é avaliada NA HORA, então
  // colocar `iniciarMovimentoVisual` nela antes da própria declaração
  // seria "usar antes de inicializar" de verdade, em tempo de
  // execução — não só um lint.
  useEffect(() => {
    if (!estadoCena) return;
    const sceneId = estadoCena.cena.id;
    const unsubscribe = subscribeToVttScene({
      campaignId, sceneId,
      // Devolve a MESMA referência (`c`) quando o evento não muda nada
      // de verdade — não só estilo, uma garantia real: um delete/update
      // que ecoa uma escrita que o próprio cliente já aplicou de forma
      // otimista (ver `onSoltarToken`/`apagarMarca`) vira um no-op de
      // verdade, e o React pula o re-render em vez de processar duas
      // atualizações quase simultâneas (otimista local + eco do
      // Realtime) — foi exatamente essa sobreposição, pega num browser
      // check real, que produzia o aviso "setState de um componente
      // enquanto outro renderiza" ao apagar uma marcação.
      // Medições permanentes: insert/delete só (régua é imutável).
      // Mesmo cuidado de idempotência das marcações — o eco da própria
      // escrita não pode duplicar a linha que já foi aplicada de forma
      // otimista, e um delete de algo que já saiu devolve a MESMA
      // referência pra o React pular o re-render.
      onMedicao: (e) => {
        setEstadoCena((c) => {
          if (!c) return c;
          if (e.tipo === "delete") {
            if (!c.medicoes.some((m) => m.id === e.id)) return c;
            return { ...c, medicoes: c.medicoes.filter((m) => m.id !== e.id) };
          }
          if (c.medicoes.some((m) => m.id === e.medicao.id)) return c;
          return { ...c, medicoes: [...c.medicoes, e.medicao] };
        });
      },
      onToken: (e) => {
        if (e.tipo === "delete") {
          protecoesPosicaoRef.current = limparProtecaoToken(protecoesPosicaoRef.current, e.id);
          ultimosMovimentosRef.current = limparProtecaoToken(ultimosMovimentosRef.current, e.id);
          reagendarExpiracaoProtecao();
          setEstadoCena((c) => {
            if (!c) return c;
            if (!c.tokens.some((t) => t.id === e.id)) return c;
            return { ...c, tokens: c.tokens.filter((t) => t.id !== e.id) };
          });
          return;
        }

        // Calculado ANTES do updater de `setEstadoCena` — nunca chamar
        // `setMovimentosVisuais` (via `iniciarMovimentoVisual`) de
        // DENTRO de outro updater: mesmo anti-padrão de "setState
        // aninhado" já evitado no resto deste arquivo, e a causa
        // original do aviso "setState de um componente enquanto outro
        // renderiza" que o comentário acima já documenta.
        const anterior = estadoCenaRef.current?.tokens.find((t) => t.id === e.token.id);
        const jaAplicado = !!anterior && anterior.revision >= e.token.revision;

        // Reconciliação de POSIÇÃO — separada da reconciliação de
        // REVISÃO (que segue monotônica, abaixo, intocada): protege
        // `q/r` contra um evento intermediário/atrasado de um
        // movimento já SUPERADO por outro mais novo (ver
        // `_dominio/reconciliacaoPosicao.ts`). Igual à decisão de
        // `onAnimacaoConcluida`: calculada ANTES de qualquer `setState`,
        // nunca dentro de um updater.
        //
        // Roda SEMPRE que existe uma proteção — inclusive quando
        // `jaAplicado` (o eco da própria escrita, revisão já refletida
        // localmente). Um eco que confirma exatamente o destino
        // protegido precisa limpar a proteção MESMO sem reescrever a
        // linha (que já está correta); sem isto, a proteção ficaria
        // presa no mapa esperando um evento que já chegou, só que na
        // forma de eco. O que `jaAplicado` continua controlando é só a
        // ESCRITA da linha em si (nunca reescreve com uma revisão
        // atrasada) — housekeeping da proteção é uma decisão
        // independente disso.
        let tokenParaAplicar = e.token;
        const protecao = protecoesPosicaoRef.current.get(e.token.id) ?? null;
        if (protecao) {
          const decisao = reconciliarPosicaoOnToken({
            protecao, eventoTokenId: e.token.id,
            eventoPosicao: { q: e.token.q, r: e.token.r }, agora: Date.now(),
          });
          if (decisao.limparProtecao) {
            // Só `protecoesPosicaoRef` — NUNCA `ultimosMovimentosRef`
            // aqui. O destino foi CONFIRMADO (ou a proteção expirou),
            // então não há mais `q/r` intermediário a proteger — mas a
            // IDENTIDADE deste movimento continua sendo a mais nova
            // conhecida até sua própria janela expirar, exatamente pra
            // que um broadcast atrasado e mais antigo, chegando DEPOIS
            // desta confirmação, ainda seja rejeitado por
            // `decidirNovoMovimento` (ver comentário junto de
            // `ultimosMovimentosRef` acima).
            protecoesPosicaoRef.current = limparProtecaoToken(protecoesPosicaoRef.current, e.token.id);
            reagendarExpiracaoProtecao();
          }
          if (!jaAplicado && (decisao.posicao.q !== e.token.q || decisao.posicao.r !== e.token.r)) {
            tokenParaAplicar = { ...e.token, q: decisao.posicao.q, r: decisao.posicao.r };
          }
        }
        // Só relevante pra decidir se o fallback abaixo dispara — nunca
        // quando `jaAplicado` (a linha nem é reescrita nesse caso, ver
        // guard dentro do updater abaixo).
        const posicaoPreservada = !jaAplicado && tokenParaAplicar !== e.token;

        setEstadoCena((c) => {
          if (!c) return c;
          const atual = c.tokens.find((t) => t.id === e.token.id);
          if (atual && atual.revision >= e.token.revision) return c;
          const existe = !!atual;
          return { ...c, tokens: existe ? c.tokens.map((t) => (t.id === e.token.id ? tokenParaAplicar : t)) : [...c.tokens, tokenParaAplicar] };
        });

        // Eco de uma escrita que ESTE cliente já processou (autor da
        // ação, revisão já aplicada otimisticamente) — nunca reanima.
        if (jaAplicado) return;

        // Posição preservada pela proteção: este evento NUNCA representa
        // um movimento de verdade pra animar — a posição que ele trouxe
        // é exatamente a que acabamos de descartar. Nem o dedupe de eco
        // nem o fallback abaixo fazem sentido pra ele.
        if (posicaoPreservada) return;

        // "Já sabemos animar isto" — fomos o autor local OU recebemos
        // o broadcast pra este exato destino, dentro da janela. Sem
        // isso, o eco do banco reiniciaria/duplicaria a animação que
        // já está rolando (item 9 da validação: "o eco Realtime da
        // própria ação não reinicia a animação" — e o mesmo vale pro
        // eco de um broadcast já recebido).
        const destino = { q: e.token.q, r: e.token.r };
        const conhecido = movimentosConhecidosRef.current.get(e.token.id);
        const dentroDaJanela = !!conhecido && Date.now() < conhecido.ateQuando && conhecido.destino.q === destino.q && conhecido.destino.r === destino.r;
        if (dentroDaJanela) return;

        // Sem broadcast recebido pra este movimento — fallback: reta
        // curta se o deslocamento for pequeno, snap discreto (sem
        // animação nenhuma, a posição nova simplesmente aparece) se
        // for grande demais pra uma reta "de até 180ms" fazer sentido
        // como leitura de movimento, ou se não há posição ANTERIOR
        // conhecida (token novo pra este cliente).
        if (!anterior) return;
        const origem = { q: anterior.q, r: anterior.r };
        const distancia = hexDistancia(origem, destino);
        if (distancia === 0 || distancia > DISTANCIA_MAXIMA_FALLBACK_RETO) return;

        iniciarMovimentoVisual({
          tokenId: e.token.id,
          rotaExpandida: [origem, destino],
          movementId: `fallback:${e.token.id}:${e.token.revision}`,
          duracaoOverride: DURACAO_FALLBACK_SEM_BROADCAST,
        });
      },
      onTerreno: (e) => setEstadoCena((c) => {
        if (!c) return c;
        if (e.tipo === "delete") {
          if (!c.terreno.some((t) => t.q === e.q && t.r === e.r)) return c;
          return { ...c, terreno: c.terreno.filter((t) => !(t.q === e.q && t.r === e.r)) };
        }
        const atual = c.terreno.find((t) => t.q === e.celula.q && t.r === e.celula.r);
        if (atual && atual.tipo === e.celula.tipo) return c;
        return { ...c, terreno: atual ? c.terreno.map((t) => (t.q === e.celula.q && t.r === e.celula.r ? e.celula : t)) : [...c.terreno, e.celula] };
      }),
      onMarca: (e) => setEstadoCena((c) => {
        if (!c) return c;
        if (e.tipo === "delete") {
          if (!c.marcas.some((m) => m.id === e.id)) return c;
          return { ...c, marcas: c.marcas.filter((m) => m.id !== e.id) };
        }
        if (c.marcas.some((m) => m.id === e.marca.id)) return c;
        return { ...c, marcas: [...c.marcas, e.marca] };
      }),
      // ÁREAS: `mesclarAreaNoEstado` já é idempotente por revisão (eco
      // do próprio autor não duplica, evento atrasado não reverte), e
      // `removerAreaDoEstado` também encerra seleção/edição da área
      // apagada remotamente. Nenhum dos dois toca tokens, terreno ou
      // marcas — atualizar áreas nunca sobrescreve o resto da cena.
      onArea: (e) => {
        if (e.tipo === "delete") { removerAreaDoEstado(e.id); return; }
        mesclarAreaNoEstado(e.area);
      },
      // Objeto vive em duas tabelas, então o Realtime só avisa "mudou" e
      // a lista consistente vem de uma releitura. Uma releitura tardia de
      // OUTRA cena nunca pode sobrescrever a atual — daí a checagem de
      // `sceneId` ao aplicar.
      // RODADAS: iniciar/avançar/encerrar chegam pra mesa inteira.
      // `adotarTrilha` valida o payload com o MESMO validador da
      // leitura persistida — nunca confia na forma só porque veio do
      // canal. O eco da própria escrita é inofensivo: o estado é
      // completo (não incremental), então reaplicar é idempotente.
      onTrilha: (e) => {
        if (e.tipo === "encerrada") { adotarTrilha(null); return; }
        adotarTrilha({ estado: e.estado, revision: e.revision });
      },
      // A releitura das imagens é a mesma tanto pra colocação que mudou
      // quanto pra camada que foi escondida: nos dois casos o que este
      // cliente pode VER mudou, e só o servidor sabe o novo recorte.
      onImagensInvalidadas: () => { void imagensRecarregarRef.current(); },
      onObjetosInvalidados: () => {
        void lerObjetosCenaAction({ campaignId, sceneId })
          .then((r) => {
            if (!r.ok || !r.dados) return;
            setEstadoCena((c) => (c && c.cena.id === sceneId ? { ...c, objetos: r.dados!.objetos } : c));
          })
          .catch(() => { /* releitura best-effort: a próxima invalidação tenta de novo */ });
      },
    });
    return () => {
      unsubscribe();
      // Nenhuma proteção de posição NEM identidade de movimento de UMA
      // cena faz sentido depois que este efeito troca de cena (`sceneId`
      // mudou) ou desmonta — sem isto, uma entrada órfã ficaria presa
      // num tokenId que talvez nem exista mais na cena nova. Cancela o
      // timer de expiração junto — nada a expirar em mapas que acabaram
      // de ser esvaziados.
      protecoesPosicaoRef.current = limparTodasAsProtecoes();
      ultimosMovimentosRef.current = limparTodasAsProtecoes();
      if (timerExpiracaoProtecaoRef.current !== null) {
        clearTimeout(timerExpiracaoProtecaoRef.current);
        timerExpiracaoProtecaoRef.current = null;
      }
    };
  }, [campaignId, estadoCena?.cena.id, iniciarMovimentoVisual, reagendarExpiracaoProtecao, mesclarAreaNoEstado, removerAreaDoEstado, adotarTrilha]);

  const onSoltarToken = useCallback((tokenId: string, rota: ReturnType<typeof montarRota>, offset?: { q: number; r: number }) => {
    const token = tokenPorId.get(tokenId);
    if (!token) { setErroAcao("Este token ainda não terminou de carregar — tente de novo em um instante."); return; }
    // Regra consultiva: `!rota.valida` significa "atravessa terreno
    // bloqueado" (destaque visual já mostrado durante o arrasto, ver
    // `MapaHex.tsx`), nunca mais um motivo pra recusar a confirmação —
    // habilidades/voo/teleporte/decisão do narrador podem ignorar uma
    // restrição normal. Destino ocupado por OUTRO token continua sendo
    // uma regra separada, aplicada no PATHFINDING (nunca chega a
    // existir uma rota exibida terminando lá) e revalidada no servidor.

    // Soltar exatamente onde pegou não é movimento nenhum: mesma
    // célula E mesmo deslocamento sub-célula. Sem esta guarda um
    // arrasto que ia e voltava — ou um clique que passou de raspão do
    // limiar — gravava no servidor, queimava uma revisão (fazendo a
    // PRÓXIMA escrita concorrente ser recusada) e ainda entrava no
    // histórico como um "movimento" que não moveu nada. Mesma regra que
    // a rotação já aplicava ao soltar na orientação em que já estava.
    const destino = rota.pontos[rota.pontos.length - 1];
    const offsetIgual = (offset?.q ?? 0) === token.offset.q && (offset?.r ?? 0) === token.offset.r;
    if (destino && destino.q === token.pos.q && destino.r === token.pos.r && offsetIgual) return;

    // Rota EXPANDIDA célula-a-célula, adjacente — a MESMA lista, sem
    // recálculo nenhum, tanto pra animar quanto pro `p_rota` de
    // `move_vtt_token` dentro de `moverEAnimar`. `rota.pontos` (o
    // rastro bruto do arrasto) não tem garantia de continuidade: um
    // evento de ponteiro rápido pode saltar células, e a migration
    // 0069 exige adjacência hexagonal exata entre células consecutivas
    // no servidor.
    const rotaExpandida = expandirRota(rota.pontos);
    // Cópia da rota INTEIRA, revertida — nunca um salto direto
    // origem↔destino. Precisa percorrer as MESMAS células, na ordem
    // inversa, pelo mesmo motivo.
    const rotaExpandidaInvertida = [...rotaExpandida].reverse();

    // `offsetDoGesto` só acompanha o movimento que a pessoa fez agora.
    // Desfazer e refazer recentralizam de propósito: eles restauram a
    // CÉLULA, e um deslocamento sub-célula ressuscitado de um gesto
    // anterior seria posição que ninguém pediu.
    async function moverEAnimar(pontos: Hex[], offsetDoGesto?: { q: number; r: number }): Promise<boolean> {
      const movementId = crypto.randomUUID();
      const revision = estadoCenaRef.current?.tokens.find((t) => t.id === tokenId)?.revision ?? token!.revision;
      const sceneId = estadoCenaRef.current?.cena.id;
      const origemGesto = pontos[0];
      const destinoGesto = pontos[pontos.length - 1];

      // UM `Date.now()` só, pro mesmo movimento — a proteção de posição
      // local e o broadcast publicado pra outros clientes precisam
      // representar EXATAMENTE o mesmo `iniciadoEm`; duas chamadas
      // separadas podem divergir por alguns ms, o suficiente pra quebrar
      // o desempate de `decidirNovoMovimento` entre o eco deste
      // broadcast (recebido por OUTRO cliente) e qualquer coisa que
      // aconteça com este token nesse ínterim.
      const iniciadoEmOrigem = Date.now();
      const mov = iniciarMovimentoVisual({ tokenId, rotaExpandida: pontos, movementId, iniciadoEmOrigem });
      if (sceneId) {
        publicarMovimentoRef.current({
          movementId, campaignId, sceneId, tokenId,
          rota: pontos.map((h) => ({ q: h.q, r: h.r })),
          revisionEsperada: revision, autorId: usuarioId ?? "",
          iniciadoEm: iniciadoEmOrigem, duracao: mov.duracao,
        });
      }

      // Otimista: aplica local antes da resposta do servidor — mas a
      // posição VISUAL continua sob controle da animação (ver
      // `Token`/`useAnimacaoToken`: o `transform` declarativo fica em
      // paz enquanto `movimentoVisual` existir), então isto nunca faz
      // o token saltar pro destino antes da animação terminar.
      setEstadoCena((c) => c ? { ...c, tokens: c.tokens.map((t) => t.id === tokenId
        ? { ...t, q: destinoGesto.q, r: destinoGesto.r, offsetQ: offsetDoGesto?.q ?? 0, offsetR: offsetDoGesto?.r ?? 0 }
        : t) } : c);

      const r = await moverTokenAction({ campaignId, tokenId, rota: pontos, revisionEsperada: revision, offset: offsetDoGesto });
      if (r.ok && r.dados) {
        setEstadoCena((c) => c ? { ...c, tokens: c.tokens.map((t) => t.id === tokenId ? { ...t, revision: r.dados!.revision } : t) } : c);
        setErroAcao(null);
      } else {
        // Recusado: reverte a posição LÓGICA pra origem deste gesto, e
        // troca a animação em andamento por uma retração curta até lá
        // — `useAnimacaoToken` detecta a troca de `movementId` em
        // pleno voo e desliza a partir de onde o token visualmente
        // estava, não de onde a rota nova "deveria" começar.
        setEstadoCena((c) => c ? { ...c, tokens: c.tokens.map((t) => t.id === tokenId ? { ...t, q: origemGesto.q, r: origemGesto.r } : t) } : c);
        iniciarMovimentoVisual({
          tokenId,
          rotaExpandida: [destinoGesto, origemGesto],
          movementId: `${movementId}:retreat`,
          duracaoOverride: DURACAO_RECONCILIACAO,
        });
        setErroAcao(r.erro ?? "Movimento recusado.");
      }
      return r.ok;
    }

    // Dispara na hora — otimista, sem esperar o servidor.
    moverEAnimar(rotaExpandida, offset);

    executarComando({
      rotulo: `mover ${token.nome}`,
      autorId: usuarioId ?? "",
      executar: () => moverEAnimar(rotaExpandida, offset).then(() => {}),
      desfazer: () => moverEAnimar(rotaExpandidaInvertida).then(() => {}),
    });
  }, [campaignId, executarComando, iniciarMovimentoVisual, tokenPorId, usuarioId]);

  // ── Rotação ────────────────────────────────────────────────────
  // A orientação NUNCA muda durante um deslocamento (preserva o
  // pathfinding/animação já aprovados) — é uma ação própria, curta,
  // sem custo de movimento nesta fase (o capítulo atual não define
  // isso). O SERVIDOR (`rotacionar_vtt_token`, migration 0071)
  // recalcula a pegada na orientação nova e revalida limites/
  // bloqueio/colisão — o otimista aqui é só UX, nunca a decisão final.
  // Rotação pra uma orientação ABSOLUTA — ponto único que de fato fala
  // com o servidor, reaproveitado pelo clique de 60° (`onRotacionarToken`,
  // abaixo) E pela alça de arrastar no mapa (`onRotacaoAlcaSolta`, mais
  // abaixo): mesma RPC canônica, mesma proteção por revisão, mesmo
  // guard contra um segundo gesto no mesmo token enquanto o primeiro
  // ainda está em voo, mesmo registro de undo/redo como UMA operação.
  // Nunca decide sozinho se DEVE girar (simetria, autorização) — quem
  // chama já filtrou isso antes.
  /**
   * Orientação contra a qual comparar e a partir da qual dar um passo:
   * a última PEDIDA enquanto o desenho ainda não a alcançou, senão a
   * desenhada. A entrada é descartada assim que o desenho a alcança —
   * é o que impede a base de ficar presa num valor antigo se outra
   * sessão girar o mesmo token.
   */
  const orientacaoBase = useCallback((tokenId: string, orientacaoDesenhada: number) => {
    const pedida = orientacaoPedidaRef.current.get(tokenId);
    if (!pedida) return orientacaoDesenhada;
    // Ainda mostrando o ponto de partida: o pedido continua sendo a
    // base. Qualquer outra coisa (chegou, ou mudou por fora) encerra.
    if (pedida.de === orientacaoDesenhada) return pedida.para;
    orientacaoPedidaRef.current.delete(tokenId);
    return orientacaoDesenhada;
  }, []);

  const aplicarRotacaoAbsoluta = useCallback((tokenId: string, novaOrientacao: number) => {
    const token = tokenPorId.get(tokenId);
    if (!token) { setErroAcao("Este token ainda não terminou de carregar — tente de novo em um instante."); return; }

    // Uma rotação deste MESMO token ainda em voo: nunca duas chamadas
    // concorrentes disputando qual revisão "esperada" é a certa. Mas
    // "não concorrer" não é "perder o pedido": guarda a orientação
    // desejada e ela é aplicada assim que a chamada atual devolver
    // (bloco `.finally` de `aplicar`). O ARRASTO da alça continua sendo
    // um gesto só — ele chama isto uma vez, ao soltar.
    if (rotacoesPendentesRef.current.has(tokenId)) {
      rotacaoEnfileiradaRef.current.set(tokenId, novaOrientacao);
      const anterior = orientacaoPedidaRef.current.get(tokenId);
      orientacaoPedidaRef.current.set(tokenId, { de: anterior?.de ?? token.orientacao, para: novaOrientacao });
      return;
    }

    // UMA base pra tudo: a comparação, o `desde` que a RPC envia e o
    // par executar/desfazer do histórico. Usar a orientação DESENHADA
    // em qualquer um deles enquanto o eco do banco não chegou faz a
    // chamada partir de um ponto que já não é o atual — a RPC é
    // recusada por concorrência, e o undo volta pro lugar errado.
    const orientacaoAtual = orientacaoBase(tokenId, token.orientacao);
    // Orientação igual à que já foi pedida: nunca chama RPC à toa (vale
    // tanto pro clique de 60° quanto pra alça, soltar onde já estava).
    if (novaOrientacao === orientacaoAtual) return;
    orientacaoPedidaRef.current.set(tokenId, { de: orientacaoAtual, para: novaOrientacao });

    async function aplicar(desde: number, para: number): Promise<boolean> {
      if (rotacoesPendentesRef.current.has(tokenId)) return false;
      rotacoesPendentesRef.current.add(tokenId);
      try {
        const revision = estadoCenaRef.current?.tokens.find((t) => t.id === tokenId)?.revision ?? token!.revision;
        setEstadoCena((c) => c ? { ...c, tokens: c.tokens.map((t) => t.id === tokenId ? { ...t, orientacao: para } : t) } : c);
        const r = await rotacionarTokenAction({ campaignId, tokenId, orientacao: para, revisionEsperada: revision });
        if (r.ok && r.dados) {
          setEstadoCena((c) => c ? { ...c, tokens: c.tokens.map((t) => t.id === tokenId ? { ...t, revision: r.dados!.revision } : t) } : c);
          setErroAcao(null);
          return true;
        }
        // Recusado: reverte a orientação otimista pra onde ESTA chamada
        // específica começou — nunca um valor fixo, senão desfazer/
        // refazer reverteria pro lugar errado quando a chamada falha.
        setEstadoCena((c) => c ? { ...c, tokens: c.tokens.map((t) => t.id === tokenId ? { ...t, orientacao: desde } : t) } : c);
        // Recusa: o desenho já voltou pra `desde`, que é a verdade —
        // manter uma base "pedida" aqui só faria o próximo passo sair
        // de um lugar que o servidor negou.
        orientacaoPedidaRef.current.delete(tokenId);
        setErroAcao(r.erro ?? "Rotação recusada.");
        return false;
      } finally {
        rotacoesPendentesRef.current.delete(tokenId);
      }
    }

    /** Aplica o que chegou durante a chamada — nunca mais de um passo por vez. */
    function escoarFila() {
      const proxima = rotacaoEnfileiradaRef.current.get(tokenId);
      // A entrada de `orientacaoPedidaRef` NÃO é apagada aqui de
      // propósito: a RPC ter voltado não quer dizer que o desenho já
      // mostra a orientação nova (o eco do banco ainda leva um tempo).
      // Quem apaga é `orientacaoBase`, quando os dois coincidem.
      if (proxima === undefined) return;
      rotacaoEnfileiradaRef.current.delete(tokenId);
      aplicarRotacaoAbsolutaRef.current?.(tokenId, proxima);
    }

    // Só entra no histórico de undo/redo se o servidor CONFIRMAR a
    // rotação — uma tentativa recusada (célula bloqueada, fora do
    // mapa, revisão desatualizada) não pode virar um passo de undo que
    // "desfaria" uma mudança que nunca aconteceu.
    aplicar(orientacaoAtual, novaOrientacao).then((sucesso) => {
      if (sucesso) {
        executarComando({
          rotulo: `rotacionar ${token.nome}`,
          autorId: usuarioId ?? "",
          executar: () => aplicar(orientacaoAtual, novaOrientacao).then(() => {}),
          desfazer: () => aplicar(novaOrientacao, orientacaoAtual).then(() => {}),
        });
      } else {
        // Recusado: o que estava na fila foi pedido a partir de um
        // estado que não existe mais — descarta em vez de girar pra um
        // lugar que ninguém pediu de fato.
        rotacaoEnfileiradaRef.current.delete(tokenId);
      }
      escoarFila();
    }).catch(() => {
      // Exceção (rede caída, por exemplo): sem isto a fila ficaria
      // presa e o token pararia de aceitar rotação até o reload —
      // `escoarFila` só roda no caminho de sucesso do `.then`.
      rotacaoEnfileiradaRef.current.delete(tokenId);
      orientacaoPedidaRef.current.delete(tokenId);
      setErroAcao("Falha de rede: a rotação não foi salva.");
    });
  }, [campaignId, executarComando, orientacaoBase, tokenPorId, usuarioId]);

  // `aplicarRotacaoAbsoluta` precisa se rechamar (pra escoar a fila) sem
  // se listar como dependência de si mesma — a ref é o jeito de fechar
  // esse ciclo sem recriar o callback a cada render.
  const aplicarRotacaoAbsolutaRef = useRef<typeof aplicarRotacaoAbsoluta | null>(null);
  aplicarRotacaoAbsolutaRef.current = aplicarRotacaoAbsoluta;

  // Clique de 60° (menu contextual/HUD) — calcula a orientação alvo a
  // partir da direção relativa e delega inteiramente pra cima. Todo
  // token gira, mesmo com pegada simétrica — só muda pra qual direção
  // ele está "olhando", nunca as células ocupadas.
  const onRotacionarToken = useCallback((tokenId: string, direcao: 1 | -1) => {
    const token = tokenPorId.get(tokenId);
    if (!token) { setErroAcao("Este token ainda não terminou de carregar — tente de novo em um instante."); return; }
    // Base = a última orientação PEDIDA, se houver uma em voo/na fila.
    // Segurar E gira seis vezes e volta ao início, em vez de girar uma
    // vez só porque as outras cinco partiram todas da mesma base velha.
    const novaOrientacao = ((orientacaoBase(tokenId, token.orientacao) + direcao) % 6 + 6) % 6;
    aplicarRotacaoAbsoluta(tokenId, novaOrientacao);
  }, [tokenPorId, orientacaoBase, aplicarRotacaoAbsoluta]);

  // Alça de rotação arrastada no mapa (`MapaHex`, gesto local com
  // `setPointerCapture`) — solta numa orientação ABSOLUTA já validada
  // localmente (borda/bloqueio/colisão); aqui só resta chamar a MESMA
  // função que o clique de 60° usa. Nunca decide validade de novo —
  // `MapaHex` só chama isto quando a prévia já estava verde.
  const onRotacaoAlcaSolta = useCallback((tokenId: string, novaOrientacao: number) => {
    aplicarRotacaoAbsoluta(tokenId, novaOrientacao);
  }, [aplicarRotacaoAbsoluta]);

  // ── Gerenciamento de tokens (criar/editar/redimensionar/duplicar/
  // remover/ocultar/travar) — narrador-only, RPCs próprias (migration
  // 0073). Aplica localmente o token que a RPC devolve (nunca espera
  // o eco do Realtime pra sentir "aconteceu"), com a MESMA proteção de
  // revisão que o resto do arquivo já usa contra escrita fora de
  // ordem/duplicada.
  const mesclarTokenNoEstado = useCallback((token: NonNullable<EstadoCenaVtt>["tokens"][number]) => {
    setEstadoCena((c) => {
      if (!c) return c;
      const atual = c.tokens.find((t) => t.id === token.id);
      if (atual) {
        if (atual.revision >= token.revision) return c;
        return { ...c, tokens: c.tokens.map((t) => (t.id === token.id ? token : t)) };
      }
      return { ...c, tokens: [...c.tokens, token] };
    });
  }, []);

  const [menuContextual, setMenuContextual] = useState<{ clientX: number; clientY: number; tokenId: string | null; hex: Hex } | null>(null);
  const [fluxoToken, setFluxoToken] = useState<FluxoToken | null>(null);
  const fluxoTokenRef = useRef(fluxoToken);
  useEffect(() => { fluxoTokenRef.current = fluxoToken; }, [fluxoToken]);
  const [personagensNarrador, setPersonagensNarrador] = useState<{ id: string; nome: string }[]>([]);
  const [confirmandoRemocao, setConfirmandoRemocao] = useState<TokenApresentacao | null>(null);

  useEffect(() => {
    if (!ehNarrador) return;
    listarPersonagensAction(campaignId)
      .then((r) => { if (r.ok && r.dados) setPersonagensNarrador(r.dados); })
      .catch(() => { /* lista vazia: o formulário segue utilizável sem vínculo de ficha */ });
  }, [ehNarrador, campaignId]);

  function valoresPadraoNovoToken(): ValoresFormularioToken {
    // Nome nasce VAZIO — placeholder no campo, nunca "Novo token"
    // preenchido (sigla acompanha: `sugerirSigla("")` também é vazia).
    // `q`/`r`/`orientacao` são placeholders inertes aqui: a âncora e a
    // orientação REAIS de um token novo só nascem na fase de
    // posicionamento (`fluxoToken.fase === "posicionando"`), nunca
    // deste objeto — ver `_shell/GerenciadorToken.tsx`.
    return {
      nome: "", sigla: "", lado: "pn", vertente: "nenhuma",
      tamanho: "medio", orientacao: 0, q: 0, r: 0,
      characterId: null, visivel: true, bloqueado: false, retratoUrl: null,
      pvAtual: null, pvMax: null, condicoes: [],
    };
  }
  function valoresDeToken(t: TokenApresentacao): ValoresFormularioToken {
    return {
      nome: t.nome, sigla: t.sigla, lado: t.lado, vertente: t.vertente,
      tamanho: t.tamanho, orientacao: t.orientacao, q: t.pos.q, r: t.pos.r,
      characterId: t.characterId, visivel: t.visivel, bloqueado: t.bloqueado, retratoUrl: t.retrato,
      pvAtual: t.pv, pvMax: t.pvMax, condicoes: [...t.condicoes],
    };
  }

  /** Fecha as janelas de botão — parte da regra de UMA JANELA POR VEZ. */
  const fecharJanelasDeBotao = useCallback(() => {
    setPainelCamadasAberto(false);
    setPainelCenaAberto(false);
    setPainelCenasAberto(false);
  }, []);

  const abrirCriarToken = useCallback(() => {
    fecharJanelasDeBotao();
    setFluxoToken({ fase: "configurando", modo: "criar", valoresIniciais: valoresPadraoNovoToken(), ancoraPreservada: null, orientacaoPreservada: 0 });
  }, [fecharJanelasDeBotao]);
  const abrirEditarToken = useCallback((tokenId: string) => {
    const t = tokenPorId.get(tokenId);
    if (!t) return;
    fecharJanelasDeBotao();
    setFluxoToken({ fase: "configurando", modo: "editar", tokenId, valoresIniciais: valoresDeToken(t) });
  }, [tokenPorId, fecharJanelasDeBotao]);

  /**
   * "Adicionar à cena" / soltar um personagem do diretório no mapa —
   * entra no fluxo CANÔNICO de criação de token já na fase de
   * POSICIONAMENTO, com o rascunho preenchido a partir do documento
   * (nome, sigla, `characterId`, lado derivado do tipo) e a âncora do
   * ponto onde foi solto (quando houver).
   *
   * Nada aqui persiste nada: quem chama a RPC continua sendo
   * `confirmarPosicionamento`, com a MESMA validação de
   * pegada/terreno/ocupação, o mesmo fantasma, o mesmo Q/E pra girar e
   * a mesma mensagem de erro. Não existe um segundo caminho de
   * persistência de token — e o documento do diretório não é movido
   * nem substituído: o token é uma instância da cena vinculada a ele.
   */
  const iniciarTokenDePersonagem = useCallback((p: PersonagemArrastado, ancora: Hex | null = null) => {
    if (!estadoCena || !ehNarrador) return;
    const rascunho: ValoresFormularioToken = {
      nome: p.nome,
      sigla: p.sigla || sugerirSigla(p.nome),
      lado: p.tipo === "pn" ? "pn" : "pj",
      vertente: "nenhuma",
      tamanho: "medio",
      orientacao: 0,
      q: 0,
      r: 0,
      characterId: p.characterId,
      visivel: true,
      bloqueado: false,
      retratoUrl: null,
      pvAtual: null,
      pvMax: null,
      condicoes: [],
    };
    setFerramenta("interagir");
    setFluxoToken({ fase: "posicionando", rascunho, ancora, orientacao: 0 });
  }, [estadoCena, ehNarrador]);


  // Células ocupadas por OUTROS tokens (nunca o que está sendo editado
  // ou posicionado) — usado pelo fantasma de posicionamento, pela
  // revalidação de redimensionar (modo editar) e pela busca de posição
  // livre da duplicação.
  const ocupadosExcluindo = useCallback((idExcluir: string | null): Set<string> => {
    const s = new Set<string>();
    for (const t of tokensApresentacao) {
      if (t.id === idExcluir) continue;
      const pegada = pegadaEfetiva({ categoria: t.tamanho, orientacao: t.orientacao, pegadaPersonalizada: t.pegadaPersonalizada });
      for (const c of projetarPegada(t.pos, pegada)) s.add(hexKey(c));
    }
    return s;
  }, [tokensApresentacao]);

  // Referência ESTÁVEL entre renders (nunca um `Set` novo por chamada
  // inline em JSX/useMemo — loop de update infinito já visto nesta
  // base de código antes). Editar exclui o próprio token; criar/
  // posicionar não exclui ninguém (`null` — o token ainda não existe).
  const idTokenEmEdicao = fluxoToken?.fase === "configurando" && fluxoToken.modo === "editar" ? fluxoToken.tokenId : null;
  const ocupadosPorOutros = useMemo(
    () => ocupadosExcluindo(idTokenEmEdicao),
    [ocupadosExcluindo, idTokenEmEdicao],
  );

  // ── Editar (modo "editar" — nunca reposiciona/rotaciona; ver
  // cabeçalho de `_shell/GerenciadorToken.tsx`) ─────────────────────
  const confirmarEdicaoToken = useCallback(async (valores: ValoresFormularioToken): Promise<{ ok: boolean; erro?: string }> => {
    if (!estadoCena) return { ok: false, erro: "Cena ainda não carregou." };
    if (!fluxoToken || fluxoToken.fase !== "configurando" || fluxoToken.modo !== "editar") return { ok: false, erro: "Nada pra confirmar." };

    // UMA chamada — `edit_vtt_token` (migration 0076) aplica campos de
    // identidade/estado E tamanho (quando mudou) na MESMA transação no
    // servidor: nunca deixa metade da edição salva se o tamanho novo
    // não couber (colisão/borda/bloqueio). Orientação nunca muda por
    // aqui — sem UI pra isso — o servidor revalida a pegada nova
    // contra a orientação/âncora JÁ PERSISTIDAS, não recebe nenhuma
    // das duas como parâmetro.
    const tokenId = fluxoToken.tokenId;
    const original = fluxoToken.valoresIniciais;
    const tokenAtual = tokenPorId.get(tokenId);
    if (!tokenAtual) return { ok: false, erro: "Token não encontrado." };

    async function aplicarEdicao(v: ValoresFormularioToken): Promise<{ ok: boolean; erro?: string; token?: NonNullable<EstadoCenaVtt>["tokens"][number] }> {
      const revisaoAtual = estadoCenaRef.current?.tokens.find((t) => t.id === tokenId)?.revision ?? tokenAtual!.revision;
      const r = await editarTokenAction({
        campaignId, tokenId, nome: v.nome, sigla: v.sigla, lado: v.lado, vertente: v.vertente,
        characterId: v.characterId, retratoUrl: v.retratoUrl, pvAtual: v.pvAtual, pvMax: v.pvMax,
        condicoes: v.condicoes, tamanho: v.tamanho, revisionEsperada: revisaoAtual,
      });
      if (!r.ok || !r.dados) return { ok: false, erro: r.erro };
      mesclarTokenNoEstado(r.dados.token);
      return { ok: true, token: r.dados.token };
    }

    const resultado = await aplicarEdicao(valores);
    if (!resultado.ok) return { ok: false, erro: resultado.erro };

    // `.catch()` aqui — não porque undo/redo precise de retry (a UI
    // não oferece isso pra esta ação), mas porque sem ele uma rejeição
    // de rede durante um `Ctrl+Z`/`Ctrl+Shift+Z` vira uma promise
    // rejeitada sem ninguém escutando: nenhum erro aparece, e o
    // usuário nunca sabe que o desfazer/refazer não teve efeito real
    // no servidor. Mesmo aviso que qualquer outra ação recusada já usa.
    executarComando({
      rotulo: `editar ${valores.nome}`,
      autorId: usuarioId ?? "",
      executar: () => aplicarEdicao(valores).then(() => {}).catch((e: unknown) => setErroAcao(e instanceof Error ? `Falha de rede ao refazer: ${e.message}` : "Falha de rede ao refazer a edição.")),
      desfazer: () => aplicarEdicao(original).then(() => {}).catch((e: unknown) => setErroAcao(e instanceof Error ? `Falha de rede ao desfazer: ${e.message}` : "Falha de rede ao desfazer a edição.")),
    });
    return { ok: true };
  }, [campaignId, estadoCena, fluxoToken, tokenPorId, mesclarTokenNoEstado, executarComando, usuarioId]);

  // ── Fechamento do formulário de configurar (`GerenciadorToken`,
  // fase "configurando") — PONTO ÚNICO, chamado por X/Cancelar/
  // backdrop/Esc, sempre através do mesmo `onFechar` passado pro
  // componente (nunca um `setFluxoToken(null)` duplicado inline em
  // outro lugar). Propriedades exigidas, todas já verdadeiras por
  // CONSTRUÇÃO, não por acaso:
  //  - idempotente: `setFluxoToken(null)` chamado duas vezes (ex.:
  //    duplo clique no X) não tem efeito extra na segunda vez;
  //  - nunca depende de rede: a fase "configurando" nunca chama RPC
  //    nenhuma pra fechar (só "Continuar para posicionar", que é uma
  //    transição DIFERENTE, tratada por `iniciarPosicionamento`);
  //  - limpa todo estado transitório do formulário: `valores`/`erro`/
  //    `enviando`/`enviandoRef`/`siglaEditadaManualmente` vivem
  //    inteiramente DENTRO de `GerenciadorToken`, que DESMONTA por
  //    completo assim que `fluxoToken.fase` deixa de ser
  //    "configurando" (render condicional, sem key preservada) — o
  //    React descarta esse estado sozinho, não há nada pra "limpar"
  //    manualmente aqui;
  //  - devolve foco com segurança: o próprio `GerenciadorToken` já
  //    restaura foco no cleanup do seu efeito de montagem, que roda
  //    garantidamente ao desmontar (`.focus()` num nó desconectado é
  //    no-op inofensivo, nunca lança);
  //  - nunca reabre por conta própria: nenhum efeito em lugar nenhum
  //    deste arquivo escreve `fluxoToken` de volta pra "configurando"
  //    sozinho — as duas ÚNICAS transições PARA "configurando" são
  //    `abrirCriarToken`/`abrirEditarToken` (ação explícita do
  //    usuário) e `voltarParaEditarToken` (idem, botão "Voltar para
  //    editar"), nunca um efeito reativo a outra coisa.
  const fecharGerenciador = useCallback(() => { setFluxoToken(null); }, []);

  // ── Posicionamento de token novo (fluxo de criação em duas etapas)
  // ──────────────────────────────────────────────────────────────
  // A fase "configurando" só entrega um RASCUNHO validado (nunca uma
  // RPC) — a âncora/orientação reais nascem aqui, a partir do primeiro
  // hover sobre o mapa: o narrador pode abrir "Adicionar token" e só
  // decidir onde depois, sem nenhuma posição herdada do clique que
  // abriu o menu contextual.
  const iniciarPosicionamento = useCallback((rascunho: ValoresFormularioToken) => {
    setFluxoToken((f) => {
      const ancoraPreservada = f?.fase === "configurando" && f.modo === "criar" ? f.ancoraPreservada : null;
      const orientacaoPreservada = f?.fase === "configurando" && f.modo === "criar" ? f.orientacaoPreservada : 0;
      return { fase: "posicionando", rascunho, ancora: ancoraPreservada, orientacao: orientacaoPreservada };
    });
  }, []);

  // "Voltar para editar" — reabre o formulário com os dados do
  // rascunho preservados, e lembra a âncora/orientação já escolhidas
  // (se houver) pra devolver ao continuar de novo. "Continuar retorna
  // ao posicionamento" (pedido explícito) — nunca reseta o progresso.
  const voltarParaEditarToken = useCallback(() => {
    setFluxoToken((f) => {
      if (!f || (f.fase !== "posicionando" && f.fase !== "erro")) return f;
      return { fase: "configurando", modo: "criar", valoresIniciais: f.rascunho, ancoraPreservada: f.ancora, orientacaoPreservada: f.orientacao };
    });
  }, []);

  // Esc durante o posicionamento: cancela por completo — descarta o
  // rascunho, nunca chama RPC, nunca cria/remove linha nenhuma.
  const cancelarPosicionamento = useCallback(() => setFluxoToken(null), []);

  // ── Troca de ferramenta — ÚNICO ponto que escreve `ferramenta`
  // (exceto o retorno pra "interagir" no sucesso de `confirmarPosicionamento`,
  // que já está desligando `fluxoToken` no mesmo instante). Lê o
  // fluxo via REF (nunca o `fluxoToken` capturado no closure) porque
  // os atalhos de teclado/clique podem disparar entre um render e o
  // próximo:
  //  - "enviando": bloqueada — uma RPC de criação já está em voo, não
  //    dá pra trocar de ferramenta silenciosamente por baixo dela.
  //  - "posicionando"/"erro": cancela primeiro (descarta o rascunho,
  //    nunca chama RPC) e SÓ ENTÃO troca — exceto se a ferramenta
  //    pedida já é a ativa (nada a cancelar).
  //  - "configurando" (ou fluxo fechado): troca direta — o modal tem
  //    seu próprio backdrop bloqueando o mapa, trocar de ferramenta
  //    por baixo dele não tem efeito colateral nenhum.
  const trocarFerramenta = useCallback((nova: FerramentaId) => {
    const f = fluxoTokenRef.current;
    const fase = f && (f.fase === "posicionando" || f.fase === "enviando" || f.fase === "erro") ? f.fase : null;
    const decisao = decidirTrocaFerramenta(fase, nova, ferramenta);
    if (decisao === "bloqueada") return;
    if (decisao === "cancelar-e-trocar") cancelarPosicionamento();
    // Seleção pendente de objeto é rascunho puramente local (nunca foi
    // pra RPC) — trocar de ferramenta descarta, igual ao cancelamento
    // de posicionamento de token acima. Seleção, "movendo" e rascunho de
    // edição também são só ponteiros/estado local, somem junto.
    if (nova !== "objetos") {
      setCelulasObjetoPendente([]);
      setObjetoSelecionadoId(null);
      setObjetoMovendoId(null);
      setRascunhoEdicaoObjeto(null);
      setDeltaPdObjeto("");
    }
    // Atalho "Converter em objeto" só faz sentido logo após o gesto de
    // terreno que o gerou — sair da ferramenta Terreno (por qualquer
    // caminho que não seja o próprio atalho, que já leu o valor antes
    // de chamar `trocarFerramenta`) descarta a oferta.
    // Seleção de imagem é ponteiro local, como a de objeto: sair da
    // ferramenta desmarca, senão as alças de escala continuariam
    // desenhadas sob uma ferramenta que não as opera.
    if (nova !== "imagens") imgs.setSelecionadaId(null);
    if (nova !== "terreno") setUltimoGestoTerrenoCelulas(null);
    // UMA JANELA POR VEZ: entre ferramentas isso já era automático (a
    // janela é a ferramenta ativa), mas Camadas, Configurações da cena
    // e o Catálogo são janelas de BOTÃO e ficavam abertas por cima.
    // Abrir uma ferramenta fecha as três.
    setPainelCamadasAberto(false);
    setPainelCenaAberto(false);
    setPainelCenasAberto(false);
    setFerramenta(nova);
  }, [ferramenta, cancelarPosicionamento]);

  const moverPosicionamento = useCallback((hex: Hex) => {
    setFluxoToken((f) => (f && (f.fase === "posicionando" || f.fase === "erro") ? { ...f, ancora: hex } : f));
  }, []);

  /**
   * Conversor TELA → HEX exposto por `MapaHex` (ver a prop
   * `onConversorHexDaTela`). O arrasto HTML5 do painel dispara
   * `dragover`/`drop` no CONTÊINER do mapa, fora do `<svg>`, então não
   * dá pra ler o hex pelos handlers de ponteiro de lá — e refazer a
   * conta de câmera aqui duplicaria a matemática que já existe.
   */
  const conversorHexRef = useRef<((clientX: number, clientY: number) => Hex | null) | null>(null);
  const guardarConversorHex = useCallback((fn: ((clientX: number, clientY: number) => Hex | null) | null) => {
    conversorHexRef.current = fn;
  }, []);
  const [arrastandoPersonagem, setArrastandoPersonagem] = useState(false);

  const aoArrastarSobreMapa = useCallback((e: React.DragEvent) => {
    if (!ehNarrador || !e.dataTransfer.types.includes(MIME_PERSONAGEM_ARRASTADO)) return;
    // `preventDefault` é o que faz o navegador aceitar o drop; sem ele
    // o `onDrop` nunca dispara.
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    setArrastandoPersonagem(true);
    // Feedback ao vivo: o fantasma de posicionamento (se já estiver
    // ativo) segue o cursor pelo mesmo caminho de sempre.
    const hex = conversorHexRef.current?.(e.clientX, e.clientY) ?? null;
    if (hex) moverPosicionamento(hex);
  }, [ehNarrador, moverPosicionamento]);

  const aoSoltarNoMapa = useCallback((e: React.DragEvent) => {
    setArrastandoPersonagem(false);
    if (!ehNarrador) return;
    const bruto = e.dataTransfer.getData(MIME_PERSONAGEM_ARRASTADO);
    const personagem = bruto ? desserializarPersonagemArrastado(bruto) : null;
    if (!personagem) return;
    e.preventDefault();
    const hex = conversorHexRef.current?.(e.clientX, e.clientY) ?? null;
    iniciarTokenDePersonagem(personagem, hex);
  }, [ehNarrador, iniciarTokenDePersonagem]);

  const girarPosicionamento = useCallback((direcao: 1 | -1) => {
    setFluxoToken((f) => {
      if (!f || (f.fase !== "posicionando" && f.fase !== "erro")) return f;
      // Todo token tem orientação — mesmo pegada simétrica só muda pra
      // qual direção o token olha, nunca as células ocupadas. Nunca
      // gatear isto por "a forma muda ao girar" (`tamanhoTemOrientacaoVariavel`
      // responde uma pergunta diferente: se a pegada é simétrica, não
      // se o token PODE girar).
      return { ...f, orientacao: ((f.orientacao + direcao) % 6 + 6) % 6 };
    });
  }, []);

  // Guarda contra duplo clique — a SEGUNDA chamada, disparada antes do
  // primeiro `setFluxoToken({fase:"enviando",...})` sequer commitar,
  // precisa ser descartada; a checagem de fase sozinha não bastaria
  // porque as duas chamadas podem rodar no MESMO evento de clique
  // duplo, antes de qualquer re-render.
  const confirmandoPosicaoRef = useRef(false);

  const confirmarPosicionamento = useCallback((hex: Hex) => {
    const f = fluxoTokenRef.current;
    if (!f || (f.fase !== "posicionando" && f.fase !== "erro")) return;
    if (!estadoCena) return;
    if (confirmandoPosicaoRef.current) return;

    const v = validarPosicaoToken({
      tamanho: f.rascunho.tamanho, orientacao: f.orientacao, ancora: hex,
      largura: estadoCena.cena.largura, altura: estadoCena.cena.altura,
      terreno: terrenoReal, ocupadosPorOutros: ocupadosExcluindo(null),
    });
    if (!v.valida) return; // posição inválida — nunca chama a RPC

    confirmandoPosicaoRef.current = true;
    setFluxoToken({ fase: "enviando", rascunho: f.rascunho, ancora: hex, orientacao: f.orientacao });

    criarTokenAction({
      campaignId, sceneId: estadoCena.cena.id,
      nome: f.rascunho.nome, sigla: f.rascunho.sigla, lado: f.rascunho.lado, vertente: f.rascunho.vertente,
      tamanho: f.rascunho.tamanho, orientacao: f.orientacao, pegadaPersonalizada: null,
      q: hex.q, r: hex.r, characterId: f.rascunho.characterId,
      visivel: f.rascunho.visivel, bloqueado: f.rascunho.bloqueado, retratoUrl: f.rascunho.retratoUrl,
      pvAtual: f.rascunho.pvAtual, pvMax: f.rascunho.pvMax, condicoes: f.rascunho.condicoes,
    }).then((r) => {
      confirmandoPosicaoRef.current = false;
      if (!r.ok || !r.dados) {
        // Falha: preserva rascunho/posição/orientação, mantém o modo
        // ativo, mostra o erro, permite tentar de novo — nunca volta
        // ao formulário nem descarta nada sozinho.
        setFluxoToken({ fase: "erro", rascunho: f.rascunho, ancora: hex, orientacao: f.orientacao, mensagem: r.erro ?? "Criação recusada pelo servidor." });
        return;
      }
      mesclarTokenNoEstado(r.dados.token);
      // Criação NÃO entra em undo/redo: `create_vtt_token` sempre gera
      // um id NOVO — um "redo" depois de desfazer via remoção criaria
      // outro token com OUTRO id, quebrando qualquer coisa que tenha
      // se referido ao original nesse meio-tempo (seleção, trilha).
      // Reversão "segura" no sentido que o pedido exige não existe
      // aqui — documentado, não fingido.
      setSelecionadoId(r.dados.token.id);
      setFerramenta("interagir");
      setFluxoToken(null);
    }).catch((e: unknown) => {
      // CAUSA RAIZ do "modal às vezes não fecha": uma Server Action que
      // REJEITA (queda de rede, servidor fora do ar no instante exato
      // do clique — reproduzido de verdade abortando a requisição via
      // Playwright) nunca chegava aqui antes, porque só havia `.then()`
      // sem `.catch()`. `fluxoToken` ficava travado em "enviando" pra
      // sempre: os botões da barra flutuante desabilitam nessa fase, e
      // o listener de Esc nem chega a ser registrado pra "enviando"
      // (só existe pra "posicionando"/"erro") — nenhuma tecla, nenhum
      // clique, nada tirava o usuário dali sem recarregar a página.
      // Tratar a rejeição exatamente como um `{ok:false}` normal —
      // mesma fase "erro", mesmo rascunho preservado, mesmos botões
      // voltam a funcionar — fecha esse buraco.
      confirmandoPosicaoRef.current = false;
      setFluxoToken({ fase: "erro", rascunho: f.rascunho, ancora: hex, orientacao: f.orientacao, mensagem: e instanceof Error ? `Falha de rede: ${e.message}` : "Falha de rede ao criar o token. Tente novamente." });
    });
  }, [campaignId, estadoCena, terrenoReal, ocupadosExcluindo, mesclarTokenNoEstado]);

  // Esc cancela; Q/E gira (só quando a pegada é assimétrica) — ativo
  // só durante "posicionando"/"erro" (nunca durante "enviando": uma
  // requisição já em voo não é cancelada por Esc, e não há orientação
  // pra girar antes dela responder). Dependência em `fluxoToken?.fase`
  // (primitivo), não no objeto inteiro — a âncora muda a cada hover, e
  // reassinar o listener a cada movimento do mouse seria desperdício.
  useEffect(() => {
    if (fluxoToken?.fase !== "posicionando" && fluxoToken?.fase !== "erro") return;
    function aoTeclar(e: KeyboardEvent) {
      if (elementoEhEditavel(document.activeElement as HTMLElement | null)) return;
      if (e.key === "Escape") { e.preventDefault(); cancelarPosicionamento(); return; }
      const tecla = e.key.toLowerCase();
      if (tecla === "q") { girarPosicionamento(-1); return; }
      if (tecla === "e") { girarPosicionamento(1); return; }
    }
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [fluxoToken?.fase, cancelarPosicionamento, girarPosicionamento]);

  // Fantasma pro mapa (`MapaHex.posicionamentoToken`) — recomputado a
  // cada mudança de âncora/orientação/terreno, nunca calculado dentro
  // de `MapaHex` (que só desenha o que o domínio já decidiu).
  const posicionamentoTokenProp = useMemo(() => {
    if (!fluxoToken || (fluxoToken.fase !== "posicionando" && fluxoToken.fase !== "enviando" && fluxoToken.fase !== "erro") || !estadoCena) return null;
    // Todo token tem orientação e pode girar durante o posicionamento —
    // mesmo pegada simétrica, que só muda pra qual direção o fantasma
    // aponta, nunca as células ocupadas.
    const podeGirar = true;
    if (!fluxoToken.ancora) {
      return { ativo: true, ancora: null, celulas: [], valida: false, orientacao: fluxoToken.orientacao, podeGirar, sigla: fluxoToken.rascunho.sigla, imagemUrl: fluxoToken.rascunho.retratoUrl };
    }
    const v = validarPosicaoToken({
      tamanho: fluxoToken.rascunho.tamanho, orientacao: fluxoToken.orientacao, ancora: fluxoToken.ancora,
      largura: estadoCena.cena.largura, altura: estadoCena.cena.altura, terreno: terrenoReal, ocupadosPorOutros,
    });
    return {
      ativo: true, ancora: fluxoToken.ancora, celulas: v.celulas, valida: v.valida, orientacao: fluxoToken.orientacao, podeGirar,
      sigla: fluxoToken.rascunho.sigla, imagemUrl: fluxoToken.rascunho.retratoUrl,
    };
  }, [fluxoToken, estadoCena, terrenoReal, ocupadosPorOutros]);

  // ── Duplicar — busca DETERMINÍSTICA de posição livre por anéis
  // hexagonais crescentes a partir da âncora original (`hexNoRaio`), a
  // MESMA função de `_mapa/hex.ts` que já serve áreas circulares —
  // nunca reimplementa geometria. Testa cada candidato com o MESMO
  // domínio que valida qualquer pegada (bounds/bloqueio/colisão),
  // excluindo só o próprio token de origem da checagem de colisão (a
  // cópia obviamente vai ocupar espaço NOVO, não o do original).
  const duplicarTokenHandler = useCallback(async (tokenId: string) => {
    const t = tokenPorId.get(tokenId);
    if (!t || !estadoCena) return;
    const pegada = pegadaEfetiva({ categoria: t.tamanho, orientacao: t.orientacao, pegadaPersonalizada: t.pegadaPersonalizada });
    const ocupados = ocupadosExcluindo(tokenId);
    const RAIO_MAXIMO = 6;
    let alvo: Hex | null = null;
    for (let raio = 1; raio <= RAIO_MAXIMO && !alvo; raio++) {
      for (const candidato of hexNoRaio(t.pos, raio)) {
        if (hexIguais(candidato, t.pos)) continue;
        const celulas = projetarPegada(candidato, pegada);
        if (!celulas.every((c) => dentroDoMapa(c, estadoCena.cena.largura, estadoCena.cena.altura))) continue;
        if (pegadaBloqueada(terrenoReal, celulas)) continue;
        if (pegadasSobrepoem(celulas, [...ocupados].map((k) => { const [q, r] = k.split(",").map(Number); return { q, r }; }))) continue;
        alvo = candidato;
        break;
      }
    }
    if (!alvo) { setErroAcao(`Sem espaço livre perto de ${t.nome} pra duplicar (raio de ${RAIO_MAXIMO} células).`); return; }

    const r = await duplicarTokenAction({ campaignId, tokenId, q: alvo.q, r: alvo.r });
    if (!r.ok || !r.dados) { setErroAcao(r.erro ?? "Duplicação recusada pelo servidor."); return; }
    mesclarTokenNoEstado(r.dados.token);
    setErroAcao(null);
    // Duplicação NÃO entra em undo/redo — mesmo motivo de criação: id
    // novo a cada chamada, redo não restauraria a MESMA cópia.
  }, [campaignId, tokenPorId, estadoCena, terrenoReal, ocupadosExcluindo, mesclarTokenNoEstado]);

  // ── Ocultar/revelar e travar/destravar — `set_vtt_token_flags`
  // (narrador-only). Entram em undo/redo (reversão exata: flag volta
  // ao valor de antes, sempre revalidado pelo servidor).
  const definirFlagsHandler = useCallback((tokenId: string, campo: "visivel" | "bloqueado") => {
    const t = tokenPorId.get(tokenId);
    if (!t) return;
    async function aplicar(visivel: boolean, bloqueado: boolean): Promise<boolean> {
      const r = await definirFlagsTokenAction({ campaignId, tokenId, visivel, bloqueado });
      if (!r.ok) { setErroAcao(r.erro ?? "Alteração recusada."); return false; }
      setEstadoCena((c) => c ? { ...c, tokens: c.tokens.map((x) => x.id === tokenId ? { ...x, visivel, bloqueado, revision: r.dados!.revision } : x) } : c);
      setErroAcao(null);
      return true;
    }
    const antes = { visivel: t.visivel, bloqueado: t.bloqueado };
    const depois = { ...antes, [campo]: !antes[campo] };
    aplicar(depois.visivel, depois.bloqueado).then((sucesso) => {
      if (!sucesso) return;
      executarComando({
        rotulo: `${campo === "visivel" ? (depois.visivel ? "revelar" : "ocultar") : (depois.bloqueado ? "travar" : "destravar")} ${t.nome}`,
        autorId: usuarioId ?? "",
        executar: () => aplicar(depois.visivel, depois.bloqueado).then(() => {}),
        desfazer: () => aplicar(antes.visivel, antes.bloqueado).then(() => {}),
      });
    });
  }, [campaignId, tokenPorId, executarComando, usuarioId]);

  // Limpa TODA referência solta a um token que deixou de existir pra
  // este cliente (removido de verdade, OU ocultado — pro jogador as
  // duas situações são indistinguíveis: o token simplesmente não está
  // mais na lista autorizada). Usado tanto pela remoção direta quanto
  // pela reconciliação de `recarregarTokensAutorizados` abaixo. Cada
  // `setX` aqui é uma chamada de updater PURA e INDEPENDENTE — nenhuma
  // delas roda de dentro do updater de outra (em particular, nunca de
  // dentro do updater de `setEstadoCena`).
  const limparReferenciasToken = useCallback((tokenId: string) => {
    setSelecionadoId((id) => (id === tokenId ? null : id));
    setSelecionadosIds((s) => { if (!s.has(tokenId)) return s; const novo = new Set(s); novo.delete(tokenId); return novo; });
    setHoverId((id) => (id === tokenId ? null : id));
    if (movimentosVisuaisRef.current.has(tokenId)) {
      const novo = new Map(movimentosVisuaisRef.current);
      novo.delete(tokenId);
      aplicarMovimentosVisuais(novo);
    }
    // Token removido ou que perdeu autorização (RLS) pra este cliente —
    // nenhuma proteção de posição NEM identidade de movimento faz
    // sentido apontando pra um token que não existe mais aqui.
    protecoesPosicaoRef.current = limparProtecaoToken(protecoesPosicaoRef.current, tokenId);
    ultimosMovimentosRef.current = limparProtecaoToken(ultimosMovimentosRef.current, tokenId);
    reagendarExpiracaoProtecao();
    // Menu contextual/edição/confirmação de remoção abertos PARA este
    // token específico — um token que deixou de ser autorizado não
    // pode deixar nenhum desses flutuando apontando pra ele.
    setMenuContextual((mc) => (mc && mc.tokenId === tokenId ? null : mc));
    // Fechamento FORÇADO por evento externo (o token deixou de existir
    // pra este cliente) — deliberadamente NÃO passa por
    // `fecharGerenciador`, que é o contrato do usuário fechando por
    // conta própria (X/Cancelar/backdrop/Esc). Aqui o próprio dado que
    // o formulário editava sumiu; `setFluxoToken(null)` direto é
    // correto e suficiente (o componente desmonta e limpa seu próprio
    // estado do mesmo jeito).
    setFluxoToken((f) => (f && f.fase === "configurando" && f.modo === "editar" && f.tokenId === tokenId ? null : f));
    setConfirmandoRemocao((cr) => (cr && cr.id === tokenId ? null : cr));
  }, [aplicarMovimentosVisuais, reagendarExpiracaoProtecao]);

  // ── Remover — DURA, sem undo (não finge reversão que não existe).
  // Limpa seleção/HUD/hover/animação pendente do token removido —
  // nunca deixa referência solta apontando pra um id que não existe
  // mais.
  const removerTokenHandler = useCallback(async (tokenId: string) => {
    const r = await removerTokenAction({ campaignId, tokenId });
    if (!r.ok) { setErroAcao(r.erro ?? "Remoção recusada pelo servidor."); return; }
    setEstadoCena((c) => c ? { ...c, tokens: c.tokens.filter((t) => t.id !== tokenId) } : c);
    limparReferenciasToken(tokenId);
    setErroAcao(null);
  }, [campaignId, limparReferenciasToken]);

  // ── Invalidação sanitizada (migration 0075) — sincroniza CRUD e
  // ocultar/revelar entre sessões sem depender de `postgres_changes`
  // sobre uma linha que a RLS ocultou do destinatário (ver comentário
  // em `vttRealtime.ts::subscribeToVttTokensChanged`). O evento em si
  // não carrega NENHUM dado de token — só dispara esta releitura, que
  // passa pela MESMA RLS que qualquer outra leitura de cena.
  //
  // Esta releitura diz respeito SÓ a tokens — `lerCenaAtiva` devolve a
  // cena inteira (cena/terreno/marcas/tokens) porque é a única leitura
  // que existe, mas SÓ `dados.tokens` é aplicado. Cena/terreno/marcas
  // do estado atual são preservados sempre — uma invalidação de token
  // NUNCA sobrescreve o que outra sessão pintou/marcou nesse meio-
  // tempo (achado de auditoria: a versão anterior fazia
  // `setEstadoCena(r.dados)` por inteiro, um "last write wins" que
  // apagava terreno/marcas mais recentes que a própria snapshot desta
  // releitura).
  const montadoRef = useRef(true);
  useEffect(() => { montadoRef.current = true; return () => { montadoRef.current = false; }; }, []);

  // Sequenciado (`tokensReadSeqRef`) contra respostas fora de ordem: se
  // duas invalidações chegam próximas, só o resultado da releitura MAIS
  // RECENTE é aplicado — uma resposta antiga que volta depois de uma
  // mais nova (rede lenta, retry) é descartada, nunca sobrescreve o
  // estado com um snapshot velho.
  const tokensReadSeqRef = useRef(0);
  const recarregarTokensAutorizados = useCallback(() => {
    const campaignIdNaHora = campaignId;
    const sceneIdAssinado = estadoCenaRef.current?.cena.id;
    if (!sceneIdAssinado) return;
    const meuSeq = ++tokensReadSeqRef.current;
    lerCenaAtiva(campaignId).then((r) => {
      // Cinco guardas, todas obrigatórias, nesta ordem — qualquer uma
      // falhando descarta a resposta inteira sem tocar em nada:
      if (!montadoRef.current) return; // componente desmontado no meio da requisição
      if (meuSeq !== tokensReadSeqRef.current) return; // superada por uma releitura mais nova
      if (campaignId !== campaignIdNaHora) return; // campanha mudou (defesa; normalmente implica remount)
      if (!r.ok || !r.dados) return; // falha de rede: mantém o último estado conhecido, nunca apaga por causa de um erro
      if (r.dados.cena.id !== sceneIdAssinado) return; // a RPC devolveu uma cena diferente da que foi assinada
      if (estadoCenaRef.current?.cena.id !== sceneIdAssinado) return; // a cena ativa TROCOU enquanto a releitura estava em voo

      const tokensNovos = r.dados.tokens;

      // IDs removidos calculados contra o estado MAIS RECENTE (via
      // ref), agora, no instante do commit — nunca contra um snapshot
      // capturado antes do `await`, que já estaria velho se qualquer
      // outra coisa tiver mudado `estadoCena` nesse meio-tempo (ex.:
      // um movimento otimista, outro `onToken` de `postgres_changes`).
      const idsAntes = new Set(estadoCenaRef.current?.tokens.map((t) => t.id) ?? []);
      const idsDepois = new Set(tokensNovos.map((t) => t.id));
      const removidos = [...idsAntes].filter((id) => !idsDepois.has(id));

      // Só `tokens` é substituído — cena/terreno/marcas do estado ATUAL
      // (não do snapshot da releitura) são preservados. Nenhum outro
      // `setState` roda de dentro deste updater — a limpeza de
      // referências acontece DEPOIS, como passo explicitamente
      // separado.
      //
      // E nunca RETROCEDE: as cinco guardas acima ordenam RESPOSTAS
      // entre si, mas não impedem que uma leitura DISPARADA antes da
      // nossa escrita chegue depois dela. Quando isso acontece, o
      // snapshot traz a linha antiga daquele token e apaga o que o
      // servidor já confirmou — a orientação volta visualmente, e,
      // pior, a `revision` volta junto, fazendo a PRÓXIMA escrita ser
      // recusada por concorrência. `revision` é monotônica por token no
      // servidor, então compará-la resolve o caso inteiro (orientação,
      // flags, nome, tamanho), não só a rotação.
      setEstadoCena((c) => {
        if (!c || c.cena.id !== sceneIdAssinado) return c;
        const conhecidos = new Map(c.tokens.map((t) => [t.id, t]));
        const mesclados = tokensNovos.map((novo) => {
          const atual = conhecidos.get(novo.id);
          return atual && atual.revision > novo.revision ? atual : novo;
        });
        return { ...c, tokens: mesclados };
      });

      for (const id of removidos) limparReferenciasToken(id);
    });
  }, [campaignId, limparReferenciasToken]);

  useEffect(() => {
    const sceneId = estadoCena?.cena.id;
    if (!sceneId) return;
    return subscribeToVttTokensChanged({
      campaignId,
      sceneId,
      onChanged: () => {
        setHudInvalidationKey((key) => key + 1);
        recarregarTokensAutorizados();
      },
    });
  }, [campaignId, estadoCena?.cena.id, recarregarTokensAutorizados]);

  /**
   * Releitura sanitizada de ÁREAS — mesmo mecanismo (e mesmo motivo)
   * da releitura de tokens: quando o narrador OCULTA uma área que um
   * jogador via, a linha nova deixa de satisfazer a RLS daquele
   * assinante e o `postgres_changes` nunca entrega o UPDATE. O canal de
   * invalidação (migration 0081) avisa "a lista autorizada de áreas
   * mudou" e a releitura reconcilia — inclusive o caso de a área ter
   * SUMIDO da lista, que nenhum evento de tabela cobriria.
   *
   * Substitui SÓ `areas` (e a autorização explícita, que vem na mesma
   * leitura): tokens, terreno e marcas do estado atual ficam intocados.
   */
  const areasReadSeqRef = useRef(0);
  const recarregarAreasAutorizadas = useCallback(() => {
    const sceneIdAssinado = estadoCenaRef.current?.cena.id;
    if (!sceneIdAssinado) return;
    const campaignIdNaHora = campaignId;
    const meuSeq = ++areasReadSeqRef.current;
    void lerCenaAtiva(campaignId).then((r) => {
      if (!montadoRef.current) return;
      if (meuSeq !== areasReadSeqRef.current) return;
      if (campaignId !== campaignIdNaHora) return;
      if (!r.ok || !r.dados) return;
      if (r.dados.cena.id !== sceneIdAssinado) return;
      if (estadoCenaRef.current?.cena.id !== sceneIdAssinado) return;

      const areasNovas = r.dados.areas;
      const idsDepois = new Set(areasNovas.map((a) => a.id));
      const sumiram = (estadoCenaRef.current?.areas ?? []).filter((a) => !idsDepois.has(a.id)).map((a) => a.id);

      setEstadoCena((c) => (c && c.cena.id === sceneIdAssinado ? { ...c, areas: areasNovas } : c));

      // Uma área que saiu da lista autorizada não pode continuar
      // selecionada nem em edição — passo separado, nunca de dentro do
      // updater de `setEstadoCena`.
      for (const id of sumiram) {
        setAreaSelecionadaId((sel) => (sel === id ? null : sel));
        setEstadoAreas((e) => (e.fase === "editando" && e.areaId === id ? AREAS_OCIOSA : e));
      }
    });
  }, [campaignId]);

  useEffect(() => {
    const sceneId = estadoCena?.cena.id;
    if (!sceneId) return;
    return subscribeToVttAreasChanged({ campaignId, sceneId, onChanged: () => recarregarAreasAutorizadas() });
  }, [campaignId, estadoCena?.cena.id, recarregarAreasAutorizadas]);

  // ══════════════════════════════════════════════════════════════
  // ÁREAS DE EFEITO
  //
  // O que vive aqui: o ESTADO da ferramenta (uma máquina de estados
  // explícita, `_ferramentas/areasEstado.ts`), a resolução das áreas
  // persistidas em geometria + células + tokens afetados (`_dominio/
  // areaEfeito.ts`) e as chamadas de persistência. Nenhuma regra de
  // geometria é calculada neste arquivo — ele só combina domínio,
  // estado e servidor.
  //
  // Nada aqui aplica dano, cura, condição, vantagem, teste,
  // salvamento, bloqueio de movimento ou bloqueio de ataque. Nem a
  // Parede: ela é registrada e desenhada, e só.
  // ══════════════════════════════════════════════════════════════
  // ── Preferências LOCAIS da ferramenta (nunca dado de cena) ───────
  // Snap angular ligado, snap em token desligado, posição/recolhimento
  // da janela e seção Aparência. Mesmo mecanismo de `PainelCamadas`:
  // `localStorage` por usuário e campanha, leitura tolerante.
  const [prefsAreas, setPrefsAreas] = useState<PreferenciasAreas>(PREFERENCIAS_AREAS_PADRAO);
  const prefsAreasCarregadasRef = useRef(false);

  const [configAreas, setConfigAreas] = useState<ConfigAreas>(CONFIG_AREAS_PADRAO);

  const atualizarPrefsAreas = useCallback((patch: Partial<PreferenciasAreas>) => {
    setPrefsAreas((atual) => {
      const novo = { ...atual, ...patch };
      salvarPreferenciasAreas(chavePreferenciasAreas(usuarioIdRef.current, campaignId), novo);
      return novo;
    });
  }, [campaignId]);

  /**
   * Referência da barra de ferramentas real — a posição inicial de
   * QUALQUER janela de ferramenta é medida a partir dela
   * (`ancoraPadraoJanela`, em `_ferramentas/janelasPreferencias.ts`).
   * O ref existe pra que a barra seja um elemento identificável no
   * DOM; a medição em si é feita lá, por seletor, pra que a janela não
   * precise receber ref nenhum por prop.
   */
  const ferramentasRef = useRef<HTMLElement | null>(null);

  const prefsAreasRef = useRef(prefsAreas);
  useEffect(() => { prefsAreasRef.current = prefsAreas; }, [prefsAreas]);

  // Carrega a preferência UMA vez, quando o usuário já é conhecido, e
  // semeia `configAreas` com o que ela diz sobre snap.
  useEffect(() => {
    if (prefsAreasCarregadasRef.current || !usuarioId) return;
    prefsAreasCarregadasRef.current = true;
    const carregada = carregarPreferenciasAreas(chavePreferenciasAreas(usuarioId, campaignId));
    setPrefsAreas(carregada);
    setConfigAreas((c) => ({
      ...c, snapDirecao: carregada.snapDirecao, snapOrigemToken: carregada.snapOrigemToken, snapOrigemCelula: carregada.snapOrigemCelula,
    }));
  }, [usuarioId, campaignId]);
  const [estadoAreas, setEstadoAreas] = useState<EstadoAreas>(AREAS_OCIOSA);
  const [areaSelecionadaId, setAreaSelecionadaId] = useState<string | null>(null);
  const [erroAreas, setErroAreas] = useState<string | null>(null);
  const estadoAreasRef = useRef(estadoAreas);
  useEffect(() => { estadoAreasRef.current = estadoAreas; }, [estadoAreas]);

  const ajustarConfigAreas = useCallback((patch: Partial<ConfigAreas>) => {
    setConfigAreas((c) => ({ ...c, ...patch }));
    // As duas opções de snap são PREFERÊNCIA — persistem entre sessões.
    // O resto de `ConfigAreas` (cor, opacidade, rótulo…) vira dado
    // canônico da área ao persistir, então não entra aqui.
    const prefsTocadas: Partial<PreferenciasAreas> = {};
    if (patch.snapDirecao !== undefined) prefsTocadas.snapDirecao = patch.snapDirecao;
    if (patch.snapOrigemToken !== undefined) prefsTocadas.snapOrigemToken = patch.snapOrigemToken;
    if (patch.snapOrigemCelula !== undefined) prefsTocadas.snapOrigemCelula = patch.snapOrigemCelula;
    if (Object.keys(prefsTocadas).length > 0) atualizarPrefsAreas(prefsTocadas);
    // Escolher token pelo SELETOR sincroniza com o mapa (o mesmo
    // estado que o clique no token produz) — nunca dois caminhos.
    if (patch.tokenAuraId !== undefined) sincronizarAuraDoSeletorRef.current(patch.tokenAuraId);
  }, [atualizarPrefsAreas]);

  /** Ref pra evitar dependência circular entre `ajustarConfigAreas` e o handler da Aura, declarado mais abaixo. */
  const sincronizarAuraDoSeletorRef = useRef<(id: string | null) => void>(() => {});

  /**
   * A ORIGEM LÓGICA atual de um token — a mesma que alcance e efeitos
   * já usam no resto do VTT (âncora + `origemMecanica` da pegada
   * efetiva). É o centro da AURA, recalculado a cada render a partir
   * do token: por isso a aura acompanha movimento, rotação, mudança de
   * tamanho e troca de pegada sem nunca ser regravada nem duplicada.
   */
  const origemLogicaDoToken = useCallback((tokenId: string): PontoAxial | null => {
    const t = tokenPorId.get(tokenId);
    if (!t) return null;
    const pegada = pegadaEfetiva({ categoria: t.tamanho, orientacao: t.orientacao, pegadaPersonalizada: t.pegadaPersonalizada });
    return origemDeAura(t.pos, origemMecanica(pegada));
  }, [tokenPorId]);

  /** Pegada ABSOLUTA de cada token — entrada da regra dos 50% da pegada; reaproveitada, nunca recalculada por área. */
  const tokensParaArea = useMemo(
    () => tokensApresentacao.map((t) => ({
      id: t.id,
      celulas: projetarPegada(t.pos, pegadaEfetiva({ categoria: t.tamanho, orientacao: t.orientacao, pegadaPersonalizada: t.pegadaPersonalizada })),
    })),
    [tokensApresentacao],
  );
  const pegadaPorToken = useMemo(() => new Map(tokensParaArea.map((t) => [t.id, t.celulas])), [tokensParaArea]);

  const ctxArea = useMemo(
    () => ({ tamanhoCelula: TAM, largura: estadoCena?.cena.largura ?? 20, altura: estadoCena?.cena.altura ?? 20 }),
    [estadoCena?.cena.largura, estadoCena?.cena.altura],
  );

  interface AreaResolvida {
    id: string;
    tipo: TipoArea;
    params: ParametrosArea;
    regiao: RegiaoArea;
    corSlug: ReturnType<typeof corValida>;
    opacidade: number;
    rotulo: string | null;
    visivel: boolean;
    criadorId: string;
    revision: number;
    celulas: Hex[];
    pegadasAfetadas: Hex[][];
  }

  /**
   * Áreas PERSISTIDAS resolvidas. Memoizada por (áreas, tokens,
   * dimensões da cena): mover/girar/redimensionar um token muda
   * `tokensParaArea` e força a reavaliação — que é exatamente a regra
   * "os tokens afetados devem ser recalculados quando o token se move".
   * Nenhuma lista de atingidos é persistida em lugar nenhum.
   */
  const areasResolvidas = useMemo<AreaResolvida[]>(() => {
    const brutas = estadoCena?.areas ?? [];
    const out: AreaResolvida[] = [];
    for (const a of brutas) {
      const origemAura = a.tipo === "aura" && a.tokenId ? origemLogicaDoToken(a.tokenId) : null;
      const params = parametrosDaAreaPersistida({ ...a, modoLinha: a.modoLinha }, origemAura);
      if (!params) continue; // estado inválido CONTROLADO (aura sem token visível, linha incompleta)
      const regiao = regiaoDaArea(params, TAM);
      if (!regiao) continue;
      const r = resolverArea({ regiao, ctx: ctxArea, tokens: tokensParaArea });
      out.push({
        id: a.id, tipo: a.tipo, params, regiao,
        corSlug: corValida(a.cor), opacidade: a.opacidade, rotulo: a.rotulo, visivel: a.visivel,
        criadorId: a.criadorId, revision: a.revision,
        celulas: r.celulas,
        pegadasAfetadas: r.tokens.filter((t) => t.afetado).map((t) => [...(pegadaPorToken.get(t.id) ?? [])]),
      });
    }
    return out;
  }, [estadoCena?.areas, origemLogicaDoToken, ctxArea, tokensParaArea, pegadaPorToken]);

  const areaPorId = useMemo(() => new Map(areasResolvidas.map((a) => [a.id, a])), [areasResolvidas]);

  /**
   * Parâmetros da área que está sendo construída/editada AGORA. Em
   * "pontos", o vértice sob o cursor entra como prévia da próxima
   * aresta — sem nunca virar um ponto de verdade.
   */
  const paramsAreaCorrente = useMemo<ParametrosArea | null>(() => {
    if (estadoAreas.fase === "pontos") {
      const pontos = estadoAreas.cursor ? [...estadoAreas.pontos, estadoAreas.cursor] : estadoAreas.pontos;
      if (pontos.length < 2) return null;
      return estadoAreas.tipo === "parede"
        ? { tipo: "parede", pontos, alturaM: configAreas.alturaParedeM }
        : { tipo: "personalizada", pontos };
    }
    return paramsDaFase(estadoAreas);
  }, [estadoAreas, configAreas.alturaParedeM]);

  const previaResolvida = useMemo(() => {
    if (!paramsAreaCorrente) return null;
    const regiao = regiaoDaArea(paramsAreaCorrente, TAM);
    if (!regiao) return null;
    const r = resolverArea({ regiao, ctx: ctxArea, tokens: tokensParaArea });
    return {
      regiao,
      celulas: r.celulas,
      pegadasAfetadas: r.tokens.filter((t) => t.afetado).map((t) => [...(pegadaPorToken.get(t.id) ?? [])]),
    };
  }, [paramsAreaCorrente, ctxArea, tokensParaArea, pegadaPorToken]);

  const idAreaEmEdicao = estadoAreas.fase === "editando" ? estadoAreas.areaId : null;

  /** O que o mapa desenha: persistidas (menos a que está em edição, substituída pela versão ao vivo) + a prévia local. */
  const areasDesenhaveis = useMemo<AreaDesenhavel[]>(() => {
    const out: AreaDesenhavel[] = [];
    for (const a of areasResolvidas) {
      if (a.id === idAreaEmEdicao) continue;
      const estado: EstadoVisualArea = !a.visivel ? "oculta" : areaSelecionadaId === a.id ? "selecionada" : "persistida";
      out.push({
        id: a.id, tipo: a.tipo, regiao: a.regiao, cor: HEX_COR_AREA[a.corSlug], opacidade: a.opacidade,
        rotulo: a.rotulo, estado, celulasAfetadas: a.celulas, pegadasAfetadas: a.pegadasAfetadas,
      });
    }
    if (previaResolvida && paramsAreaCorrente) {
      const estado: EstadoVisualArea =
        estadoAreas.fase === "editando" ? "editando" : estadoAreas.fase === "erro" ? "erro" : "previa";
      out.push({
        id: idAreaEmEdicao ?? "rv-area-previa",
        tipo: paramsAreaCorrente.tipo,
        regiao: previaResolvida.regiao,
        cor: HEX_COR_AREA[configAreas.cor],
        opacidade: configAreas.opacidade,
        rotulo: configAreas.rotulo.trim() || null,
        estado,
        celulasAfetadas: previaResolvida.celulas,
        pegadasAfetadas: previaResolvida.pegadasAfetadas,
      });
    }
    return out;
  }, [areasResolvidas, areaSelecionadaId, idAreaEmEdicao, previaResolvida, paramsAreaCorrente, estadoAreas.fase, configAreas.cor, configAreas.opacidade, configAreas.rotulo]);

  const alcasAreas = useMemo<AlcaArea[]>(() => {
    if (estadoAreas.fase !== "editando") return [];
    return alcasDeParametros(estadoAreas.params, TAM);
  }, [estadoAreas]);

  const contornosSelecionaveis = useMemo(
    () => (estadoAreas.fase === "ociosa"
      ? areasResolvidas.map((a) => ({
          id: a.id, regiao: a.regiao,
          // Alvo de clique generoso (nunca o miolo, só a borda): 14px
          // do mundo cobre mouse e toque sem transformar a área inteira
          // num botão que impediria criar outra por cima.
          larguraTraco: a.regiao.forma === "corredor" ? a.regiao.largura + 14 : 14,
        }))
      : []),
    [estadoAreas.fase, areasResolvidas],
  );

  // ── Snap da origem em token ─────────────────────────────────────
  /**
   * Tokens elegíveis pro snap de origem, já com a ORIGEM MECÂNICA
   * calculada (nunca a âncora sozinha, nunca o centro da sprite).
   *
   * `elegivel` exclui token OCULTO: a lista que chega aqui já passou
   * pela RLS (então "token de outra cena" ou "não autorizado" nem
   * existe), mas o narrador VÊ os ocultos — e ancorar uma área num
   * token que os jogadores não enxergam é exatamente o tipo de
   * surpresa silenciosa que a ferramenta não deve produzir.
   */
  const tokensParaSnap = useMemo<TokenParaSnap[]>(
    () => tokensApresentacao.map((t) => ({
      id: t.id,
      origem: origemDeAura(t.pos, origemMecanica(pegadaEfetiva({ categoria: t.tamanho, orientacao: t.orientacao, pegadaPersonalizada: t.pegadaPersonalizada }))),
      elegivel: t.visivel,
    })),
    [tokensApresentacao],
  );

  /** Token que o snap capturaria se o gesto começasse agora — só pra realçar. */
  const [candidatoSnapId, setCandidatoSnapId] = useState<string | null>(null);

  /**
   * Área cujo CONTORNO recebeu o `pointerdown` deste gesto. Se o gesto
   * terminar sem virar arraste, é uma SELEÇÃO; se virar arraste, é uma
   * área NOVA por cima da antiga (regra "outras áreas não impedem a
   * criação"). Ref, não estado: muda no meio do gesto e não deve
   * provocar render.
   */
  const candidatoSelecaoRef = useRef<string | null>(null);

  // ── Gestos ──────────────────────────────────────────────────────
  const areaPressionar = useCallback((ponto: PontoAxial, px: { x: number; y: number }, ev: { altKey: boolean; metaKey: boolean; pointerId: number }) => {
    if (areaOcupada(estadoAreasRef.current)) return;
    setErroAreas(null);
    const precisaoLivre = precisaoLivreDoEvento(ev);
    const gesto = gestoDoTipo(configAreas.tipo);

    // AURA: o gesto começa num TOKEN, nunca num ponto solto. Se o
    // clique não pegou token, o estado continua esperando um.
    if (gesto === "token") {
      // Token JÁ escolhido, raio pendente (fluxo "em duas etapas"): um
      // novo `pointerdown` — em QUALQUER ponto do mapa, não só sobre o
      // token — começa o gesto que define o raio, usando a origem já
      // fixada. Nunca reprocura token nenhum aqui.
      const atual = estadoAreasRef.current;
      if (atual.fase === "definindo_raio_da_aura") {
        setEstadoAreas(escolherTokenDaAura({
          config: configAreas, tokenId: atual.tokenId, origem: atual.origem,
          pointerId: ev.pointerId, px, precisaoLivre,
        }));
        return;
      }
      const capturado = resolverSnapToken({ ponto, tokens: tokensParaSnap, ligado: true, tamanhoCelula: TAM });
      if (!capturado.tokenId) { setEstadoAreas(comecarEscolhaDeTokenDaAura()); return; }
      setConfigAreas((c) => ({ ...c, tokenAuraId: capturado.tokenId }));
      setEstadoAreas(escolherTokenDaAura({
        config: configAreas, tokenId: capturado.tokenId, origem: capturado.origem,
        pointerId: ev.pointerId, px, precisaoLivre,
      }));
      return;
    }

    if (gesto === "pontos") { setEstadoAreas((e) => adicionarPonto(e, configAreas, ponto)); return; }

    // Demais formas: as duas opções de snap de origem são OPCIONAIS e
    // INDEPENDENTES — token perto tem prioridade; sem token, cai pro
    // centro da célula quando ligado; sem nenhum dos dois, o ponto
    // livre exatamente como clicado (nunca falha a criação).
    const capturado = resolverOrigemArea({
      ponto, tokens: tokensParaSnap, snapToken: configAreas.snapOrigemToken, snapCelula: configAreas.snapOrigemCelula, tamanhoCelula: TAM,
    });
    setEstadoAreas(pressionarAreas({
      config: configAreas,
      origemBruta: ponto,
      origemEfetiva: capturado.origem,
      tokenCapturado: capturado.tokenId,
      pointerId: ev.pointerId,
      px,
      precisaoLivre,
    }));
  }, [configAreas, tokensParaSnap]);

  const areaMover = useCallback((ponto: PontoAxial, px: { x: number; y: number }, ev: { altKey: boolean; metaKey: boolean }) => {
    // O modificador é lido do EVENTO ATUAL — nunca de um listener
    // global que possa ficar preso depois de um `blur`/`Alt+Tab`.
    const precisaoLivre = precisaoLivreDoEvento(ev);
    setEstadoAreas((e) => moverAreas(e, configAreas, ponto, px, TAM, precisaoLivre));
    // Realce do candidato só faz sentido FORA de um gesto em curso.
    if (!emAndamento(estadoAreasRef.current) && configAreas.snapOrigemToken && gestoDoTipo(configAreas.tipo) !== "token") {
      setCandidatoSnapId(candidatoAoSnap({ ponto, tokens: tokensParaSnap, ligado: true, tamanhoCelula: TAM }));
    } else if (estadoAreasRef.current.fase === "escolhendo_token_da_aura") {
      setCandidatoSnapId(candidatoAoSnap({ ponto, tokens: tokensParaSnap, ligado: true, tamanhoCelula: TAM }));
    } else if (candidatoSnapId !== null) {
      setCandidatoSnapId(null);
    }
  }, [configAreas, tokensParaSnap, candidatoSnapId]);

  const areaSoltar = useCallback(() => {
    // Gesto que começou sobre o contorno de uma área e NAO virou
    // arraste = selecao daquela area. Virou arraste = area nova.
    const candidato = candidatoSelecaoRef.current;
    candidatoSelecaoRef.current = null;
    if (candidato && estadoAreasRef.current.fase === "pressionada") {
      setAreaSelecionadaId(candidato);
      setEstadoAreas(AREAS_OCIOSA);
      return;
    }
    // Clique-e-solta sem arrastar (Aura) já vira `definindo_raio_da_aura`
    // dentro da própria `soltarAreas` — nunca um raio predefinido.
    setEstadoAreas((e) => soltarAreas(e));
  }, []);

  const areaCancelarGesto = useCallback(() => {
    setEstadoAreas((e) => (e.fase === "pressionada" || e.fase === "arrastando" ? AREAS_OCIOSA : e));
  }, []);

  const areaAlcaMover = useCallback((id: string, ponto: PontoAxial, precisaoLivre = false) => {
    setEstadoAreas((e) => (e.fase === "editando" ? { ...e, params: aplicarAlca(e.params, id, ponto, TAM, configAreas, precisaoLivre) } : e));
  }, [configAreas]);

  // ── Persistência ────────────────────────────────────────────────
  /**
   * Trava de reentrância do "Manter na mesa" — ref, não estado: os
   * botões flutuante e do painel chamam o MESMO `manterAreaNaMesa`, e
   * `persistindo` só desabilita os dois depois de um re-render, que não
   * é síncrono com o clique. Um duplo-clique real (ou os dois botões
   * quase juntos) cai AQUI antes de qualquer `await`, então nunca chega
   * a disparar duas `criarAreaAction`/`atualizarAreaAction` em voo.
   */
  const manterEmVooRef = useRef(false);

  /**
   * "Sessão expirada" nem sempre é uma sessão morta de verdade: o
   * cookie pode ter sido rotacionado por OUTRA requisição concorrente
   * (o próprio `src/middleware.ts`, ou o agendamento do
   * `CampaignRealtimeProvider`) bem no instante em que esta ação leu o
   * cookie antigo — a mesma corrida que `refreshAccessToken()` já sabe
   * desambiguar (ver `scripts/dev/check-refresh-token-dedup.ts`). Por
   * isso, ANTES de aceitar "sessão expirada" como definitivo, tenta
   * renovar pela rotina CANÔNICA do projeto — nunca uma segunda lógica
   * de refresh paralela — e só desiste se ela mesma confirmar que
   * precisa de login.
   */
  async function tentarComRenovacaoDeSessao<T extends { ok: boolean; erro?: string; dados?: unknown }>(
    chamar: () => Promise<T>,
  ): Promise<T> {
    const primeira = await chamar();
    if (primeira.ok || primeira.erro !== "Sessão expirada.") return primeira;
    const renovacao = await refreshAccessToken();
    if (!renovacao.ok) return primeira;
    // Renovação confirmada: repete a MESMA operação, no máximo uma vez.
    return chamar();
  }

  const manterAreaNaMesa = useCallback(async () => {
    if (manterEmVooRef.current) return;
    const cena = estadoCenaRef.current;
    const atual = estadoAreasRef.current;
    const params = paramsDaFase(atual);
    if (!cena || !params) return;
    const veredito = validarParametros(params);
    if (!veredito.ok) { setErroAreas(veredito.motivo ?? "Geometria inválida."); return; }

    manterEmVooRef.current = true;
    setEstadoAreas((e) => comecarPersistencia(e));
    setErroAreas(null);
    const campos = camposDeParametros(params);
    const comum = {
      ...campos,
      cor: configAreas.cor,
      opacidade: configAreas.opacidade,
      rotulo: configAreas.rotulo.trim() || null,
      visivel: configAreas.visivel,
    };

    const editando = atual.fase === "editando" || (atual.fase === "erro" && atual.areaId);
    const areaId = atual.fase === "editando" ? atual.areaId : atual.fase === "erro" ? atual.areaId : null;
    const revisionEsperada = atual.fase === "editando" ? atual.revision : areaId ? (areaPorId.get(areaId)?.revision ?? 1) : 1;

    let r;
    try {
      r = await tentarComRenovacaoDeSessao(() => (
        editando && areaId
          ? atualizarAreaAction({ campaignId, areaId, revisionEsperada, ...comum })
          : criarAreaAction({ campaignId, sceneId: cena.cena.id, tipo: params.tipo, ...comum })
      ));
    } finally {
      manterEmVooRef.current = false;
    }

    if (!r.ok || !r.dados) {
      // A sessão foi tentada renovar e mesmo assim não passou: a
      // prévia local NÃO é perdida — o usuário pode logar de novo e
      // tentar "Manter" outra vez sem redesenhar nada.
      const mensagem = r.erro === "Sessão expirada."
        ? "Sua sessão não pôde ser renovada. Faça login novamente e tente salvar de novo."
        : (r.erro ?? "Falha ao salvar a área.");
      setEstadoAreas((e) => falharPersistencia(e, mensagem));
      setErroAreas(mensagem);
      return;
    }
    // O eco do Realtime também chega — `mesclarAreaNoEstado` é
    // idempotente por REVISÃO, então aplicar aqui e receber o eco
    // depois não duplica nem reverte nada.
    mesclarAreaNoEstado(r.dados.area);
    setEstadoAreas(concluirPersistencia());
    setAreaSelecionadaId(r.dados.area.id);
  }, [campaignId, configAreas, areaPorId]);

  const descartarArea = useCallback(() => {
    setErroAreas(null);
    setEstadoAreas((e) => cancelarAreas(e));
  }, []);

  const concluirPontosArea = useCallback(() => {
    setEstadoAreas((e) => concluirPontos(e, configAreas));
  }, [configAreas]);

  const desfazerPontoArea = useCallback(() => {
    setEstadoAreas((e) => removerUltimoPonto(e));
  }, []);

  /**
   * Botão "Escolher no mapa": entra na fase que faz o clique num token
   * virar escolha de origem da Aura (e só nessa fase o clique num
   * token deixa de selecionar/mover/girar).
   */
  const escolherTokenAuraNoMapa = useCallback(() => {
    setErroAreas(null);
    setEstadoAreas((e) => (e.fase === "escolhendo_token_da_aura" ? AREAS_OCIOSA : comecarEscolhaDeTokenDaAura()));
  }, []);

  /**
   * Escolher pelo `<select>` sincroniza com o mapa: entra no MESMO
   * `definindo_raio_da_aura` que o clique-e-solta no token produz —
   * nunca conclui a Aura sozinho, nem atribui um raio final em
   * silêncio. O mapa realça o token e o usuário arrasta em seguida,
   * exatamente como no fluxo iniciado pelo mapa.
   */
  const sincronizarAuraDoSeletor = useCallback((tokenId: string | null) => {
    if (!tokenId) {
      setEstadoAreas((e) => (e.fase === "concluida_local" || e.fase === "definindo_raio_da_aura" ? AREAS_OCIOSA : e));
      return;
    }
    const origem = origemLogicaDoToken(tokenId);
    if (!origem) { setErroAreas("Escolha um token válido para a aura."); return; }
    setErroAreas(null);
    setEstadoAreas({ fase: "definindo_raio_da_aura", tokenId, origem });
  }, [origemLogicaDoToken]);

  const editarArea = useCallback((id: string) => {
    const a = areaPorId.get(id);
    if (!a) return;
    setAreaSelecionadaId(id);
    setErroAreas(null);
    // O painel passa a refletir a área escolhida — cor, opacidade,
    // rótulo e visibilidade dela, não os últimos valores digitados.
    setConfigAreas((c) => ({
      ...c, tipo: a.tipo, cor: a.corSlug, opacidade: a.opacidade,
      rotulo: a.rotulo ?? "", visivel: a.visivel,
      ...(a.params.tipo === "faixa" ? { larguraFaixaM: a.params.larguraM } : {}),
      ...(a.params.tipo === "linha" ? { modoLinha: a.params.modo } : {}),
      ...(a.params.tipo === "parede" ? { alturaParedeM: a.params.alturaM } : {}),
      ...(a.params.tipo === "aura" ? { raioAuraM: a.params.raioM, tokenAuraId: a.params.tokenId } : {}),
    }));
    setEstadoAreas(comecarEdicao(id, a.revision, a.params));
  }, [areaPorId]);

  /**
   * Atalho de edição rápida — o botão que aparece direto no mapa,
   * junto da geometria. Faz o mesmo que o ícone da lista
   * (`editarArea`), mas SEM trocar de ferramenta nem tocar no painel:
   * as alças, a régua e os botões Salvar/Cancelar já são independentes
   * de `ferramenta === "areas"` (ver `areasAlcas`/`onAreaAlcaMover` em
   * `MapaHex`), então editar pelo atalho do mapa funciona de qualquer
   * ferramenta — inclusive Interagir — sem abrir/mudar a janela lateral.
   */
  const editarAreaRapido = useCallback((id: string) => {
    editarArea(id);
  }, [editarArea]);

  const cancelarEdicaoArea = useCallback(() => {
    // `Esc` durante edição restaura a ÚLTIMA VERSÃO CONFIRMADA e sai —
    // nunca deixa o mapa mostrando uma edição abandonada.
    setEstadoAreas((e) => (e.fase === "editando" ? AREAS_OCIOSA : cancelarAreas(e)));
    setErroAreas(null);
  }, []);

  const duplicarAreaHandler = useCallback(async (id: string) => {
    const r = await duplicarAreaAction({ campaignId, areaId: id });
    if (!r.ok || !r.dados) { setErroAreas(r.erro ?? "Falha ao duplicar."); return; }
    mesclarAreaNoEstado(r.dados.area);
    setAreaSelecionadaId(r.dados.area.id);
  }, [campaignId]);

  const excluirAreaHandler = useCallback(async (id: string) => {
    const r = await removerAreaAction({ campaignId, areaId: id });
    if (!r.ok) { setErroAreas(r.erro ?? "Falha ao remover."); return; }
    removerAreaDoEstado(id);
  }, [campaignId]);

  const alternarVisibilidadeArea = useCallback(async (id: string) => {
    const a = areaPorId.get(id);
    if (!a) return;
    const campos = camposDeParametros(a.params);
    const r = await atualizarAreaAction({
      campaignId, areaId: id, revisionEsperada: a.revision, ...campos,
      cor: a.corSlug, opacidade: a.opacidade, rotulo: a.rotulo, visivel: !a.visivel,
    });
    if (!r.ok || !r.dados) { setErroAreas(r.erro ?? "Falha ao alterar visibilidade."); return; }
    mesclarAreaNoEstado(r.dados.area);
  }, [campaignId, areaPorId]);

  /**
   * Escolher o tipo AURA já coloca a ferramenta esperando um token —
   * o fluxo principal é pelo mapa, não pelo seletor. Sair da Aura
   * limpa esse estado.
   */
  useEffect(() => {
    if (ferramenta !== "areas") return;
    setEstadoAreas((e) => {
      if (configAreas.tipo === "aura") return e.fase === "ociosa" ? comecarEscolhaDeTokenDaAura() : e;
      return e.fase === "escolhendo_token_da_aura" || e.fase === "definindo_raio_da_aura" ? AREAS_OCIOSA : e;
    });
  }, [configAreas.tipo, ferramenta]);

  // Trocar de ferramenta cancela criação incompleta e limpa a prévia —
  // nunca deixa uma geometria órfã desenhada por baixo de outra
  // ferramenta. Uma RPC em voo não é interrompida (o resultado dela
  // ainda vai chegar e mesclar), só a prévia local some.
  useEffect(() => {
    if (ferramenta === "areas") return;
    setEstadoAreas((e) => (e.fase === "ociosa" ? e : AREAS_OCIOSA));
    setAreaSelecionadaId(null);
    setCandidatoSnapId(null);
    setAncoraAcoesTela(null);
    setHoverAreaId(null);
  }, [ferramenta]);

  // Troca de cena limpa prévia, seleção e referências — o mesmo
  // princípio das proteções de posição de token.
  useEffect(() => {
    setEstadoAreas(AREAS_OCIOSA);
    setAreaSelecionadaId(null);
    setErroAreas(null);
    setHoverAreaId(null);
    setSelecionadoId(null);
    setSelecionadosIds(new Set());
  }, [estadoCena?.cena.id]);

  // `Esc` com a ferramenta ativa: cancela criação incompleta OU
  // restaura a última versão confirmada de uma edição. Respeita campo
  // editável (Esc digitado num input do painel não pode apagar a
  // geometria por baixo).
  //
  // Também ativo EDITANDO com qualquer outra ferramenta: o atalho do
  // lápis no mapa entra em edição sem trocar pra "Áreas" (de
  // propósito — é o que evita abrir a janela lateral), e sem esta
  // segunda condição uma edição começada pelo Interagir ficaria sem
  // Esc e sem Delete, já que o efeito nem chegava a ser registrado.
  useEffect(() => {
    if (ferramenta !== "areas" && estadoAreas.fase !== "editando") return;
    function aoTeclar(e: KeyboardEvent) {
      if (elementoEhEditavel(document.activeElement as HTMLElement | null)) return;
      if (e.key === "Escape") {
        const atualAgora = estadoAreasRef.current;
        if (!areaEmAndamento(atualAgora) && areaSelecionadaId === null) return;
        e.preventDefault();
        // AURA tem regra própria: depois de escolher o token (mas
        // antes de concluir), Esc volta pra ESCOLHA DE TOKEN em vez de
        // cancelar tudo — o passo já dado não se perde.
        const ehFluxoAura = configAreas.tipo === "aura"
          && (atualAgora.fase === "escolhendo_token_da_aura"
            || atualAgora.fase === "definindo_raio_da_aura"
            || ((atualAgora.fase === "pressionada" || atualAgora.fase === "arrastando") && atualAgora.gesto.tokenCapturado !== null)
            || (atualAgora.fase === "concluida_local" && atualAgora.params.tipo === "aura"));
        if (ehFluxoAura) {
          setEstadoAreas((atual) => escapeNaAura(atual));
          setErroAreas(null);
          return;
        }
        setEstadoAreas((atual) => (atual.fase === "editando" ? AREAS_OCIOSA : cancelarAreas(atual)));
        setAreaSelecionadaId(null);
        setErroAreas(null);
        return;
      }
      if (e.key === "Backspace" && estadoAreasRef.current.fase === "pontos") {
        e.preventDefault();
        setEstadoAreas((atual) => removerUltimoPonto(atual));
        return;
      }
      // Área SELECIONADA + Delete/Backspace exclui. Vale parada
      // (`ociosa`) E editando por alças (`editando`): editar uma área
      // e decidir apagá-la é um caminho normal, e ali a tecla não tem
      // outro significado — só as fases de CRIAÇÃO ficam de fora
      // (`pontos` já usa Backspace pra desfazer ponto, tratado acima;
      // as demais são gesto em andamento, onde Esc é quem cancela).
      // `removerAreaDoEstado` encerra a edição junto, então não sobra
      // painel editando algo que não existe mais. Só quem tem
      // autorização de verdade; o servidor (`pode_editar_vtt_area`)
      // continua sendo quem decide.
      const faseAgora = estadoAreasRef.current;
      const idParaExcluir = faseAgora.fase === "editando" ? faseAgora.areaId
        : faseAgora.fase === "ociosa" ? areaSelecionadaId
        : null;
      if ((e.key === "Delete" || e.key === "Backspace") && !e.ctrlKey && !e.metaKey && idParaExcluir) {
        const area = areaPorId.get(idParaExcluir);
        if (area && (ehNarrador || area.criadorId === usuarioId)) {
          e.preventDefault();
          void excluirAreaHandler(idParaExcluir);
        }
      }
    }
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [ferramenta, estadoAreas.fase, areaSelecionadaId, configAreas.tipo, areaPorId, ehNarrador, usuarioId, excluirAreaHandler]);

  /**
   * Remover imagem PELO HISTÓRICO — os dois caminhos (lixeira do painel
   * e Delete no mapa) passam por aqui, porque os dois têm o mesmo
   * arrependimento.
   *
   * O desfazer RECRIA a colocação (ver `restaurar`): a linha some do
   * banco de verdade, e o que volta é uma linha nova com a mesma
   * geometria e um id NOVO. Por isso o comando guarda o id numa caixa
   * mutável em vez de fechar sobre ele — senão o refazer tentaria
   * remover uma linha que não existe mais e falharia calado.
   */
  const removerImagem = useCallback((img: ImagemCena) => {
    if (!usuarioId) return;
    const alvo = { id: img.id };
    const instantaneo = img;
    const cmd: Comando = {
      rotulo: "Remover imagem da cena",
      autorId: usuarioId,
      executar: async () => { await imgs.removerPorId(alvo.id); },
      desfazer: async () => {
        const novoId = await imgs.restaurar(instantaneo);
        if (novoId) alvo.id = novoId;
      },
    };
    void cmd.executar();
    executarComando(cmd);
  }, [imgs, usuarioId, executarComando]);

  /**
   * Imagem SELECIONADA + Delete/Backspace tira ela da cena.
   *
   * Sem confirmar, de propósito: é a mesma escrita do botão de lixeira
   * do painel (`onRemover`), e tirar da CENA não apaga o arquivo — ele
   * continua na biblioteca da campanha e volta em dois cliques. Quem
   * confirma é a exclusão da BIBLIOTECA, que essa sim é definitiva.
   *
   * Travada não sai: travar que ainda deixasse apagar não seria travar
   * — é a mesma regra que o botão do painel já aplica (`disabled`).
   */
  useEffect(() => {
    if (ferramenta !== "imagens" || !imgs.selecionadaId) return;
    function aoTeclar(e: KeyboardEvent) {
      if (e.key !== "Delete" && e.key !== "Backspace") return;
      if (e.ctrlKey || e.metaKey) return;
      // Backspace num campo do painel é "apagar caractere", nunca
      // "apagar imagem".
      if (elementoEhEditavel(document.activeElement as HTMLElement | null)) return;
      const img = imgs.imagens.find((i) => i.id === imgs.selecionadaId);
      if (!img || img.travado) return;
      e.preventDefault();
      removerImagem(img);
    }
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [ferramenta, imgs, removerImagem]);

  // Liga o ref usado por `ajustarConfigAreas` (declarado antes) ao
  // handler real — sem isto o seletor de Aura não sincronizaria.
  useEffect(() => { sincronizarAuraDoSeletorRef.current = sincronizarAuraDoSeletor; }, [sincronizarAuraDoSeletor]);

  /**
   * "Localizar no mapa": seleciona a área e centraliza o pan nela, sem
   * mexer no zoom. A âncora vem da MESMA geometria que o mapa desenha.
   */
  const localizarArea = useCallback((id: string) => {
    const a = areaPorId.get(id);
    if (!a) return;
    setAreaSelecionadaId(id);
    const caixa = caixaDaRegiao(a.regiao);
    const centro = { x: (caixa.minX + caixa.maxX) / 2, y: (caixa.minY + caixa.maxY) / 2 };
    const palco = document.querySelector(".rv-palco");
    if (!palco) return;
    const r = palco.getBoundingClientRect();
    const { zoom: z } = zoomPanRef.current;
    setPan({ x: r.width / 2 - centro.x * z, y: r.height / 2 - centro.y * z });
  }, [areaPorId]);

  /**
   * Token que deve receber o destaque de "origem da Aura" agora —
   * `null` na esmagadora maioria do tempo. Pura função de
   * `estadoAreas` (`tokenOrigemDaAura`, `areasEstado.ts`): nunca um
   * estado paralelo que possa dessincronizar de cancelar/confirmar/
   * trocar de token/trocar de ferramenta/trocar de cena — todos esses
   * já mudam `estadoAreas` (ou o resetam) por caminhos que já existem.
   */
  const tokenOrigemAuraId = useMemo(() => tokenOrigemDaAura(estadoAreas), [estadoAreas]);

  /**
   * Clique no RETRATO da trilha de turnos: seleciona o personagem e
   * centraliza o mapa nele. NUNCA inicia ativação — isso é exclusivo
   * do botão "Agir" do slot, e separar as duas coisas é o que permite
   * consultar um personagem sem gastar a vez dele.
   *
   * Mesma centralização de `localizarArea` (pan, zoom intacto), com a
   * origem lógica do token — a mesma que alcance/áreas já usam, então
   * o alvo é o centro real da pegada, não a âncora de um token grande.
   */
  const focarToken = useCallback((id: string) => {
    onSelecionarToken(id, false);
    const origem = origemLogicaDoToken(id);
    if (!origem) return;
    const centro = axialParaMundo(origem, TAM);
    const palco = document.querySelector(".rv-palco");
    if (!palco) return;
    const r = palco.getBoundingClientRect();
    const { zoom: z } = zoomPanRef.current;
    setPan({ x: r.width / 2 - centro.x * z, y: r.height / 2 - centro.y * z });
  }, [onSelecionarToken, origemLogicaDoToken]);

  const estadoPorToken = useCallback((t: TokenApresentacao): EstadoVisualToken => {
    // Sem combate aberto, nenhum token carrega marca de turno: os anéis
    // de "pode agir"/"já agiu" no mapa são leitura da trilha, e sem
    // trilha eles seriam uma afirmação sobre uma rodada que não existe.
    const p = trilha?.participantes.find((x) => x.id === t.id);
    return {
      selecionado: selecionadosIds.has(t.id), sobCursor: false, alvo: false,
      turnoAtual: !!trilha && trilha.agindoId === t.id,
      podeAgir: !!p && !!trilha && elegibilidade(p, trilha).apto,
      jaAgiu: !!p && !!trilha && p.agiuEm.includes(trilha.janela) && p.fragmentouEm !== trilha.janela,
      fragmentado: !!p && p.fragmentouEm !== null,
      origemDeAura: t.id === tokenOrigemAuraId,
    };
  }, [trilha, selecionadosIds, tokenOrigemAuraId]);

  /**
   * GUIA VISUAL do gesto — derivada do MESMO `GestoArea` que a
   * geometria usa, então a linha nunca aponta pra um lugar diferente
   * do que vai ser criado. Só existe durante `arrastando`.
   */
  const guiaAreaAtual = useMemo<GuiaGesto | null>(() => {
    const g = gestoVisivel(estadoAreas);
    if (!g) return null;
    const params = paramsDaFase(estadoAreas);
    const m = formatarMetros;
    let texto = m(g.dimensaoArredondada);
    if (params) {
      switch (params.tipo) {
        case "faixa": texto = `${m(params.comprimentoM)} × ${m(params.larguraM)}`; break;
        case "cone": texto = `${m(params.alcanceM)} · ${Math.round(params.direcaoGraus)}°`; break;
        case "cubo": texto = `lado ${m(params.ladoM)}`; break;
        case "linha": texto = `${m(params.comprimentoM)}`; break;
        default: break;
      }
    }
    return { origem: g.origemEfetiva, destino: g.cursorEfetivo, texto, tokenCapturado: g.tokenCapturado !== null };
  }, [estadoAreas]);

  /** Origem mecânica do token candidato ao snap — só o realce, antes do gesto. */
  const candidatoSnapPonto = useMemo<PontoAxial | null>(() => {
    if (!candidatoSnapId) return null;
    return tokensParaSnap.find((t) => t.id === candidatoSnapId)?.origem ?? null;
  }, [candidatoSnapId, tokensParaSnap]);

  /**
   * Âncora (mundo) dos botões contextuais — um ponto LÓGICO da forma,
   * fora do preenchimento quando há espaço: borda do disco, destino da
   * linha/faixa/cone, último ponto da parede, canto final do cubo,
   * último vértice da personalizada.
   */
  const ancoraAcoesArea = useMemo<{ x: number; y: number } | null>(() => {
    // MESMO comportamento de criar: os botões contextuais e a régua de
    // medida também aparecem editando uma área já persistida — nunca
    // um caminho à parte com regra própria.
    if (
      estadoAreas.fase !== "concluida_local" && estadoAreas.fase !== "persistindo"
      && estadoAreas.fase !== "erro" && estadoAreas.fase !== "editando"
    ) return null;
    const params = paramsDaFase(estadoAreas);
    if (!params) return null;
    const regiao = regiaoDaArea(params, TAM);
    if (!regiao) return null;
    return ancoraDaRegiao(regiao);
  }, [estadoAreas]);

  const [ancoraAcoesTela, setAncoraAcoesTelaRaw] = useState<{ x: number; y: number } | null>(null);
  /**
   * O mapa reconstrói a âncora de TELA a cada mudança de zoom/pan e
   * entrega um objeto NOVO mesmo quando as coordenadas são as mesmas.
   * Guardar isso direto marcava o estado como mudado a cada roda do
   * mouse e fazia a cascata (card → obstáculos → posição dos lápis)
   * rodar de novo sem nada ter mudado de fato — exatamente o tipo de
   * update em cadeia que estoura o limite de profundidade do React.
   * Comparar por VALOR corta a cadeia na origem.
   */
  const setAncoraAcoesTela = useCallback((nova: { x: number; y: number } | null) => {
    setAncoraAcoesTelaRaw((atual) => {
      if (atual === nova) return atual;
      if (!atual || !nova) return nova;
      return atual.x === nova.x && atual.y === nova.y ? atual : nova;
    });
  }, []);

  // ── Edição rápida de área persistida, direto no mapa ─────────────
  // Geometria real (hover), independente da ferramenta ativa — o
  // efeito em `MapaHex.tsx` só reage com "areas"/"interagir" e limpa
  // sozinho fora delas.
  const [hoverAreaId, setHoverAreaId] = useState<string | null>(null);
  // Conversor MUNDO→TELA (pan/zoom/CTM), exposto pelo mapa — usado pra
  // converter a âncora de QUALQUER área candidata, não só uma.
  const [conversorEdicaoRapidaTela, setConversorEdicaoRapidaTelaRaw] = useState<((mundo: { x: number; y: number }) => { x: number; y: number }) | null>(null);
  // `useState` trata um valor QUE É função como updater funcional — pra
  // guardar a função em si (não o resultado de chamá-la) é preciso
  // envolvê-la, senão o React chama o conversor com o estado anterior
  // (`null` na primeira vez) em vez de guardá-lo.
  const setConversorEdicaoRapidaTela = useCallback((c: ((mundo: { x: number; y: number }) => { x: number; y: number }) | null) => {
    setConversorEdicaoRapidaTelaRaw(() => c);
  }, []);

  const areasParaHover = useMemo(
    () => areasResolvidas.filter((a) => a.visivel).map((a) => ({ id: a.id, regiao: a.regiao })),
    [areasResolvidas],
  );

  // Editando (alças ativas) esconde TODOS os lápis, sem exceção — a
  // oferta de "editar" não faz sentido enquanto já está editando, e é
  // o próprio Salvar/Cancelar que ocupa aquele papel de decisão.
  const estaEditando = estadoAreas.fase === "editando";
  const ferramentaCompativelComEdicaoRapida = ferramenta === "areas" || ferramenta === "interagir";
  const podeEditarArea = useCallback(
    (a: { criadorId: string | null }) => ehNarrador || a.criadorId === usuarioId,
    [ehNarrador, usuarioId],
  );

  /**
   * Conjunto de áreas que precisam de um lápis AGORA, sem depender de
   * "qual delas venceu" — seleção e hover são candidatas INDEPENDENTES;
   * se apontarem pra mesma área, o Set já deduplica pelo id sozinho.
   */
  const idsDesejadosAgora = useMemo(() => {
    const s = new Set<string>();
    if (!ferramentaCompativelComEdicaoRapida || estaEditando) return s;
    if (areaSelecionadaId) {
      const a = areaPorId.get(areaSelecionadaId);
      if (a && podeEditarArea(a)) s.add(areaSelecionadaId);
    }
    if (estadoAreas.fase === "ociosa" && hoverAreaId) {
      const a = areaPorId.get(hoverAreaId);
      if (a && podeEditarArea(a)) s.add(hoverAreaId);
    }
    return s;
  }, [ferramentaCompativelComEdicaoRapida, estaEditando, areaSelecionadaId, hoverAreaId, estadoAreas.fase, areaPorId, podeEditarArea]);

  /**
   * Ids REALMENTE exibidos — superconjunto de `idsDesejadosAgora` que
   * também mantém vivo, por um atraso curto, qualquer id que acabou de
   * deixar de ser desejado (dá tempo do ponteiro atravessar da área até
   * o próprio botão dela). O atraso e o timer são POR ID: um timer
   * criado pra A nunca esconde B, e cada um cancela sozinho quando a
   * área volta a ser candidata, quando o próprio botão ganha hover/foco,
   * quando a ferramenta muda ou quando o componente desmonta.
   */
  const [idsExibidosEdicaoRapida, setIdsExibidosEdicaoRapida] = useState<ReadonlySet<string>>(new Set());
  const [idBotaoComHover, setIdBotaoComHover] = useState<string | null>(null);
  const [idBotaoComFoco, setIdBotaoComFoco] = useState<string | null>(null);
  const timersOcultarPorIdRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    if (!ferramentaCompativelComEdicaoRapida || estaEditando) {
      // Troca de ferramenta ou início de edição: nada sobrevive nem por
      // um instante — todo timer pendente é descartado imediatamente.
      for (const t of timersOcultarPorIdRef.current.values()) clearTimeout(t);
      timersOcultarPorIdRef.current.clear();
      setIdsExibidosEdicaoRapida((atual) => (atual.size === 0 ? atual : new Set()));
      return;
    }
    setIdsExibidosEdicaoRapida((atual) => {
      let mudou = false;
      const novo = new Set(atual);
      // VIVOS = quem não pode sumir agora, por qualquer fonte. O
      // ponteiro/foco sobre o PRÓPRIO botão conta: é o que permite
      // atravessar da área até ele. Antes, o timer agendado na saída da
      // área só era cancelado para `idsDesejadosAgora` — chegar no botão
      // não cancelava nada, e ele sumia com o cursor em cima. Hover e
      // foco só MANTÊM vivo o que já está na tela (nunca ressuscitam um
      // id cuja área saiu), por isso o filtro por `atual`.
      const vivos = new Set(idsDesejadosAgora);
      if (idBotaoComHover && atual.has(idBotaoComHover)) vivos.add(idBotaoComHover);
      if (idBotaoComFoco && atual.has(idBotaoComFoco)) vivos.add(idBotaoComFoco);

      for (const id of vivos) {
        const t = timersOcultarPorIdRef.current.get(id);
        if (t) { clearTimeout(t); timersOcultarPorIdRef.current.delete(id); }
      }
      for (const id of idsDesejadosAgora) {
        if (!novo.has(id)) { novo.add(id); mudou = true; }
      }
      for (const id of atual) {
        if (vivos.has(id) || timersOcultarPorIdRef.current.has(id)) continue;
        const t = setTimeout(() => {
          timersOcultarPorIdRef.current.delete(id);
          setIdsExibidosEdicaoRapida((s) => {
            if (!s.has(id)) return s;
            const n = new Set(s); n.delete(id); return n;
          });
        }, 180);
        timersOcultarPorIdRef.current.set(id, t);
      }
      return mudou ? novo : atual;
    });
  }, [idsDesejadosAgora, ferramentaCompativelComEdicaoRapida, estaEditando, idBotaoComHover, idBotaoComFoco]);

  // Limpa todo timer pendente se o componente desmontar no meio da espera.
  useEffect(() => () => {
    for (const t of timersOcultarPorIdRef.current.values()) clearTimeout(t);
    timersOcultarPorIdRef.current.clear();
  }, []);

  /** Âncoras MUNDO de cada botão realmente exibido — convertidas pra TELA logo abaixo, uma por área, cada uma com a sua posição. */
  const ancorasEdicaoRapidaMundo = useMemo(() => {
    const lista: { id: string; ponto: { x: number; y: number } }[] = [];
    for (const id of idsExibidosEdicaoRapida) {
      const a = areaPorId.get(id);
      if (!a) continue;
      lista.push({ id, ponto: ancoraDaRegiao(a.regiao) });
    }
    return lista;
  }, [idsExibidosEdicaoRapida, areaPorId]);

  const ancorasEdicaoRapidaTela = useMemo(() => {
    if (!conversorEdicaoRapidaTela) return [];
    return ancorasEdicaoRapidaMundo.map((a) => ({ id: a.id, ponto: conversorEdicaoRapidaTela(a.ponto) }));
  }, [ancorasEdicaoRapidaMundo, conversorEdicaoRapidaTela]);

  // Ordem de prioridade fixa pro desempate de posição — a selecionada
  // primeiro, resto por id (determinístico, nunca depende do ponteiro).
  const ordemPrioridadeEdicaoRapida = useMemo(
    () => (areaSelecionadaId ? [areaSelecionadaId] : []),
    [areaSelecionadaId],
  );
  const posicoesEdicaoRapida = usePosicoesEdicaoRapida(ancorasEdicaoRapidaTela, ordemPrioridadeEdicaoRapida);

  const itensListaAreas = useMemo<ItemListaArea[]>(
    () => areasResolvidas.map((a) => ({
      id: a.id, tipo: a.tipo, rotulo: a.rotulo, visivel: a.visivel, cor: a.corSlug,
      podeEditar: ehNarrador || a.criadorId === usuarioId,
      criadaPorVoce: a.criadorId === usuarioId,
      celulas: a.celulas.length, tokens: a.pegadasAfetadas.length,
    })),
    [areasResolvidas, ehNarrador, usuarioId],
  );

  const resumoAreaCorrente = useMemo(() => {
    if (previaResolvida) return { celulas: previaResolvida.celulas.length, tokens: previaResolvida.pegadasAfetadas.length };
    if (areaSelecionadaId) {
      const a = areaPorId.get(areaSelecionadaId);
      if (a) return { celulas: a.celulas.length, tokens: a.pegadasAfetadas.length };
    }
    return null;
  }, [previaResolvida, areaSelecionadaId, areaPorId]);

  // ── Camadas do mapa — estado DA CENA (migration 0093).
  //
  // Já foi preferência local por usuário+cena, o que invertia o sentido
  // da ferramenta: o narrador escondia Objetos e escondia só da própria
  // tela. Agora ele ajusta e vale pra mesa — a escrita é narrador-only
  // no servidor e chega aos outros por Realtime.
  //
  // O que continua igual: nenhuma REGRA muda. Pathfinding, colisão e
  // custo de terreno seguem enxergando a camada escondida; esconder é
  // sobre o que se desenha.
  const botaoCamadasRef = useRef<HTMLButtonElement>(null);
  const [painelCamadasAberto, setPainelCamadasAberto] = useState(false);
  const [camadas, setCamadas] = useState<EstadoCamadas>(CAMADAS_PADRAO);
  const [erroCamadas, setErroCamadas] = useState<string | null>(null);
  // Fonte de verdade SÍNCRONA pro valor "atual" — nunca o `camadas`
  // capturado no CLOSURE de um `useCallback`. Duas alternâncias na
  // mesma rajada (clique programático rápido, StrictMode, duplo-clique
  // humano) leriam o MESMO valor velho pelo closure e a segunda
  // sobrescreveria a primeira.
  const camadasRef = useRef(camadas);
  // A revisão da cena que a última escrita conhece. A RPC recusa quem
  // manda revisão velha, e cada ajuste incrementa: sem guardar a que
  // voltou, o SEGUNDO clique seguido seria sempre recusado.
  const revisaoCenaRef = useRef(0);
  /**
   * Escrita de camadas SERIALIZADA. Cada ajuste incrementa a revisão da
   * cena, e a RPC recusa quem manda uma revisão velha — então disparar
   * uma chamada por clique numa rajada faz TODAS menos a primeira serem
   * recusadas, e a cena guarda um estado que não é o que está na tela.
   * `emVoo` deixa passar uma de cada vez; `desejado` é sempre o estado
   * FINAL que a pessoa pediu, e é ele que a próxima escrita leva — não
   * a fila inteira de passos intermediários, que ninguém quer ver.
   */
  const escritaCamadasEmVooRef = useRef(false);
  const camadasDesejadasRef = useRef<EstadoCamadas | null>(null);
  /** Último estado que o SERVIDOR confirmou — o único destino honesto de um rollback. */
  const camadasConfirmadasRef = useRef<EstadoCamadas>(CAMADAS_PADRAO);

  useEffect(() => {
    if (!estadoCena) return;
    const lido = camadasDeJson(estadoCena.cena.camadas);
    camadasRef.current = lido;
    camadasConfirmadasRef.current = lido;
    revisaoCenaRef.current = estadoCena.cena.revision;
    setCamadas(lido);
  }, [estadoCena?.cena.id, estadoCena?.cena.camadas, estadoCena?.cena.revision]);

  // Chegou de outro participante (ou de outra aba minha).
  useEffect(() => {
    if (!estadoCena) return;
    return subscribeToCamadasDaCena({
      campaignId,
      sceneId: estadoCena.cena.id,
      onCamadas: ({ camadas: bruto, revision }) => {
        const lido = camadasDeJson(bruto);
        camadasConfirmadasRef.current = lido;
        revisaoCenaRef.current = revision;
        // Um ajuste MEU ainda em voo é mais novo que este eco — adotar
        // o eco aqui faria o botão que a pessoa acabou de clicar voltar
        // sozinho por um instante.
        if (escritaCamadasEmVooRef.current || camadasDesejadasRef.current) return;
        camadasRef.current = lido;
        setCamadas(lido);
      },
    });
  }, [campaignId, estadoCena?.cena.id]);

  /**
   * A ÚNICA função que escreve camadas.
   *
   * Aplica na hora (a mesa responde ao clique) e grava; se o servidor
   * recusar, volta ao que ele diz que vale — nunca deixa a tela
   * mostrando um ajuste que não aconteceu.
   */
  const aplicarCamadas = useCallback(async (novo: EstadoCamadas) => {
    if (!estadoCena) return;
    const sceneId = estadoCena.cena.id;
    camadasRef.current = novo;
    setCamadas(novo);
    setErroCamadas(null);
    // Sempre registra o desejo. Se já existe uma escrita em voo, é ela
    // que vai levar este valor — nunca duas concorrentes com a mesma
    // revisão, que é o que fazia a segunda em diante ser recusada.
    camadasDesejadasRef.current = novo;
    if (escritaCamadasEmVooRef.current) return;

    escritaCamadasEmVooRef.current = true;
    try {
      while (camadasDesejadasRef.current) {
        const alvo = camadasDesejadasRef.current;
        camadasDesejadasRef.current = null;
        let r;
        try {
          r = await definirCamadasCenaAction({
            campaignId, sceneId,
            camadas: alvo as unknown as Record<string, unknown>,
            revisionEsperada: revisaoCenaRef.current,
          });
        } catch {
          r = { ok: false as const, erro: "Falha de rede ao ajustar as camadas." };
        }
        if (r.ok && r.dados) {
          revisaoCenaRef.current = r.dados.revision;
          const confirmado = camadasDeJson(r.dados.camadas);
          camadasConfirmadasRef.current = confirmado;
          // Só adota o confirmado se ninguém pediu outra coisa enquanto
          // esta chamada estava em voo — senão o clique mais novo
          // piscaria de volta pro estado anterior.
          if (!camadasDesejadasRef.current) { camadasRef.current = confirmado; setCamadas(confirmado); }
          continue;
        }
        // Recusado: a tela volta pro último estado que o SERVIDOR
        // confirmou, e a rajada inteira é descartada — insistir com os
        // passos seguintes só empilharia recusas.
        camadasDesejadasRef.current = null;
        camadasRef.current = camadasConfirmadasRef.current;
        setCamadas(camadasConfirmadasRef.current);
        setErroCamadas(r.erro ?? "Não foi possível ajustar as camadas.");
      }
    } finally {
      escritaCamadasEmVooRef.current = false;
    }
  }, [campaignId, estadoCena?.cena.id]);

  const alternarVisivelCamada = useCallback((id: keyof EstadoCamadas) => {
    const atual = camadasRef.current;
    void aplicarCamadas({ ...atual, [id]: { ...atual[id], visivel: !atual[id].visivel } });
  }, [aplicarCamadas]);
  const alternarBloqueioCamada = useCallback((id: keyof EstadoCamadas) => {
    const atual = camadasRef.current;
    void aplicarCamadas({ ...atual, [id]: { ...atual[id], bloqueada: !atual[id].bloqueada } });
  }, [aplicarCamadas]);
  const restaurarCamadasPadrao = useCallback(() => { void aplicarCamadas(CAMADAS_PADRAO); }, [aplicarCamadas]);

  // ── CONFIGURAÇÕES DA CENA ────────────────────────────────────────
  // O botão da barra existia sem `onClick` desde sempre. Agora abre a
  // janela, e a escrita passa por `set_vtt_scene_config` (migration
  // 0097): narrador-only e revisão conferida no servidor.
  const [painelCenaAberto, setPainelCenaAberto] = useState(false);
  const [painelCenasAberto, setPainelCenasAberto] = useState(false);
  const [salvandoCena, setSalvandoCena] = useState(false);
  const [erroConfigCena, setErroConfigCena] = useState<string | null>(null);
  /** Tamanho em EDIÇÃO — só pra contar o que ficaria fora da grade. */
  const [tamanhoEmEdicao, setTamanhoEmEdicao] = useState<{ largura: number; altura: number } | null>(null);

  const valoresCena: ValoresCena = useMemo(() => ({
    nome: estadoCena?.cena.nome ?? "",
    local: estadoCena?.cena.local ?? "",
    resumo: estadoCena?.cena.resumo ?? "",
    largura: estadoCena?.cena.largura ?? 0,
    altura: estadoCena?.cena.altura ?? 0,
  }), [estadoCena?.cena.nome, estadoCena?.cena.local, estadoCena?.cena.resumo, estadoCena?.cena.largura, estadoCena?.cena.altura]);

  /**
   * Quantas peças ficariam fora da grade com o tamanho em edição.
   *
   * Encolher NÃO apaga nada — o aviso existe pra pessoa saber o que vai
   * sumir de vista antes de salvar, não pra impedir. Conta tokens e
   * células de objeto, que são o que ocupa posição no mapa.
   */
  const pecasForaDaGrade = useMemo(() => {
    if (!estadoCena || !tamanhoEmEdicao) return 0;
    const { largura, altura } = tamanhoEmEdicao;
    const dentro = (q: number, r: number) => {
      if (r < 0 || r >= altura) return false;
      const qMin = -Math.floor(r / 2);
      return q >= qMin && q < qMin + largura;
    };
    const tokensFora = estadoCena.tokens.filter((t) => !dentro(t.q, t.r)).length;
    const objetosFora = estadoCena.objetos.filter((o) => o.celulas.some((cel) => !dentro(cel.q, cel.r))).length;
    return tokensFora + objetosFora;
  }, [estadoCena, tamanhoEmEdicao]);

  const salvarCena = useCallback(async (v: ValoresCena) => {
    if (!estadoCena) return;
    setSalvandoCena(true);
    setErroConfigCena(null);
    try {
      const r = await salvarConfigCenaAction({
        campaignId, sceneId: estadoCena.cena.id,
        nome: v.nome, local: v.local.trim() || null, resumo: v.resumo.trim() || null,
        largura: v.largura, altura: v.altura,
        revisionEsperada: estadoCena.cena.revision,
      });
      if (r.ok && r.dados) {
        setEstadoCena((atual) => (atual ? { ...atual, cena: r.dados!.cena } : atual));
        setTamanhoEmEdicao(null);
      } else {
        setErroConfigCena(r.erro ?? "Não foi possível salvar a cena.");
      }
    } finally {
      setSalvandoCena(false);
    }
  }, [campaignId, estadoCena]);

  // ── Ping — efêmero: nunca persistido, nunca entra em undo/redo, nunca
  // cria marca. `autorId` de cada evento vem do SERVIDOR (`vtt_ping` RPC
  // → `realtime.send`, nunca do payload que um client poderia forjar).
  // Uma entrada por autor (um novo ping substitui o anterior do mesmo
  // usuário); some sozinho depois de ~2s via `setTimeout` local — nunca
  // fica esperando outro evento pra desaparecer.
  const PING_EXIBICAO_MS = 2000;
  const [pingsAtivos, setPingsAtivos] = useState<Map<string, { id: string; q: number; r: number; autorId: string }>>(new Map());
  const pingsTimeoutRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  /**
   * Recentraliza o PAN local no hex dado, zoom intacto — mesma fórmula
   * de `focarToken`/`localizarArea`. Usada por "Ping de foco" nos DOIS
   * lados do gesto: quem RECEBE (eco do Realtime, `onPing` abaixo) e
   * quem ENVIA — este último de forma OTIMISTA, direto no clique,
   * porque esperar o ping voltar pelo servidor pra mover a PRÓPRIA
   * câmera de quem acabou de pedir isso tornava o gesto perceptível
   * como "não fez nada" (o round-trip do Realtime é da ordem de
   * segundo(s), e a pessoa que clicou já está olhando pro lugar certo
   * — não faz sentido ela esperar).
   */
  const centralizarCameraEmHex = useCallback((h: Hex) => {
    const centro = hexParaPixel(h, TAM);
    const palco = document.querySelector(".rv-palco");
    if (!palco) return;
    const r = palco.getBoundingClientRect();
    const { zoom: z } = zoomPanRef.current;
    setPan({ x: r.width / 2 - centro.x * z, y: r.height / 2 - centro.y * z });
  }, []);

  /**
   * Trocar de cena recentra a câmera no meio da grade nova.
   *
   * Sem isto, o pan da cena anterior é herdado: uma cena 60×40 seguida
   * de uma 20×16 abre com a câmera apontada para fora do mapa, e a
   * pessoa chega num vazio preto sem entender que a cena carregou. Vale
   * para o narrador trocando pelo catálogo (fase 2) e para o jogador
   * sendo levado pelo palco (fase 3) — o mesmo problema nos dois.
   *
   * A grade é hexagonal com deslocamento por linha: em `r`, o `q`
   * começa em `-floor(r/2)` (ver `dentroDoMapa`). O centro tem que
   * respeitar esse deslocamento, senão "meio da largura" cai cada vez
   * mais à esquerda conforme a cena é alta.
   */
  const cenaIdCamera = estadoCena?.cena.id;
  const larguraCamera = estadoCena?.cena.largura;
  const alturaCamera = estadoCena?.cena.altura;
  useEffect(() => {
    if (!cenaIdCamera || !larguraCamera || !alturaCamera) return;
    const r = Math.floor(alturaCamera / 2);
    centralizarCameraEmHex({ q: -Math.floor(r / 2) + Math.floor(larguraCamera / 2), r });
    // Só quando a CENA muda — não a cada ajuste de tamanho pela janela
    // de Configurações, que puxaria a câmera no meio da digitação.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cenaIdCamera]);

  /**
   * Centraliza a câmera num token, a pedido do painel.
   *
   * É a ÚNICA coisa que o painel pode fazer com a cena, e só a partir
   * de um controle explicitamente rotulado ("Centralizar a câmera no
   * alvo", no card do ataque). Não seleciona, não move, não abre nada:
   * só o pan, pela MESMA fórmula de `centralizarCameraEmHex` que o
   * "Ping de foco" já usa — nenhuma segunda conta de câmera.
   */
  const focarTokenPeloPainel = useCallback((tokenId: string) => {
    const token = tokenPorId.get(tokenId);
    if (!token) return;
    centralizarCameraEmHex(token.pos);
  }, [tokenPorId, centralizarCameraEmHex]);


  useEffect(() => {
    const sceneId = estadoCena?.cena.id;
    if (!sceneId) return;
    const unsubscribe = subscribeToVttPing({
      campaignId, sceneId,
      onPing: (e) => {
        setPingsAtivos((m) => { const novo = new Map(m); novo.set(e.autorId, { id: e.id, q: e.q, r: e.r, autorId: e.autorId }); return novo; });
        const timers = pingsTimeoutRef.current;
        const anterior = timers.get(e.autorId);
        if (anterior) clearTimeout(anterior);
        timers.set(e.autorId, setTimeout(() => {
          setPingsAtivos((m) => { if (!m.has(e.autorId)) return m; const novo = new Map(m); novo.delete(e.autorId); return novo; });
          timers.delete(e.autorId);
        }, PING_EXIBICAO_MS));

        // "Ping de foco" — recentraliza a câmera de QUEM RECEBE. Pro
        // AUTOR isto é redundante (ele já recentralizou de forma
        // otimista em `onPingCelula`, abaixo) mas inofensivo — o eco
        // chega com o MESMO hex, então reaplicar é um no-op visual.
        if (e.foco) centralizarCameraEmHex({ q: e.q, r: e.r });
      },
    });
    return () => {
      unsubscribe();
      for (const t of pingsTimeoutRef.current.values()) clearTimeout(t);
      pingsTimeoutRef.current.clear();
    };
  }, [campaignId, estadoCena?.cena.id, centralizarCameraEmHex]);

  const pingsExibidos = useMemo(() => [...pingsAtivos.values()].map((p) => ({
    id: p.id, q: p.q, r: p.r, cor: p.autorId === usuarioId ? "#00d4ff" : "#f5a200", proprio: p.autorId === usuarioId,
  })), [pingsAtivos, usuarioId]);

  const onPingCelula = useCallback((h: Hex, foco = false) => {
    if (!estadoCena) return;
    // Otimista: quem PEDIU o foco não espera o servidor pra ver a
    // própria câmera se mover — só as OUTRAS sessões dependem do
    // Realtime (`onPing`, acima).
    if (foco) centralizarCameraEmHex(h);
    enviarPingAction({ campaignId, sceneId: estadoCena.cena.id, q: h.q, r: h.r, foco }).then((r) => {
      if (!r.ok) setErroAcao(r.erro ?? "Ping recusado pelo servidor.");
    }).catch(() => setErroAcao("Falha de rede: o ping não chegou à mesa."));
  }, [campaignId, estadoCena, centralizarCameraEmHex]);

  // ── Menu contextual — abre no clique direito (`MapaHex` já decide
  // pan-vs-menu pelo limiar de arrasto e devolve o hex + id do token,
  // se houver, sob o cursor). Monta os itens conforme quem clicou:
  // narrador vê tudo; jogador com controle vê só o que pode fazer;
  // ninguém vê opção que não pode executar (a autorização de verdade é
  // sempre do servidor — isto é só não OFERECER o que vai ser recusado).
  const fecharMenuContextual = useCallback(() => setMenuContextual(null), []);
  const onAbrirMenuContextual = useCallback((info: { clientX: number; clientY: number; tokenId: string | null; hex: Hex }) => {
    // Nunca durante o posicionamento de um token novo — evita abrir
    // "Adicionar token" recursivamente ou editar outro token no meio
    // da escolha de posição (fora do escopo de "não deve iniciar
    // acidentalmente" da seção 17, mesmo espírito).
    if (fluxoToken && fluxoToken.fase !== "configurando") return;
    setMenuContextual(info);
  }, [fluxoToken]);

  function itensMenuContextual(): ItemMenuContextual[] {
    if (!menuContextual) return [];
    const { tokenId, hex } = menuContextual;
    if (!tokenId) {
      // Menu do MAPA VAZIO — estilo Roll20: pings, atalho pra Marcar,
      // Colar (placeholder pra uma ferramenta futura de recortar/
      // colar — ainda não existe nada pra colar, por isso nasce
      // desabilitado) e undo/redo, que já existiam na barra mas
      // ganham o mesmo atalho aqui por serem o par mais comum de ação
      // "acabei de errar" bem onde o clique aconteceu. "Adicionar
      // token" (narrador) continua no topo — é o item mais antigo
      // deste menu, mantido na mesma posição.
      const itens: ItemMenuContextual[] = [];
      if (ehNarrador) {
        itens.push({ id: "adicionar", rotulo: "Adicionar token", icone: <UserPlus size={14} />, onSelecionar: () => abrirCriarToken() });
      }
      itens.push(
        { id: "ping", rotulo: "Ping", icone: <Radio size={14} />, separadorAntes: ehNarrador, onSelecionar: () => onPingCelula(hex) },
        {
          id: "ping-foco", rotulo: "Ping de foco", icone: <Focus size={14} />,
          onSelecionar: () => onPingCelula(hex, true),
        },
        { id: "marcar", rotulo: "Marcar", icone: <MapPin size={14} />, separadorAntes: true, onSelecionar: () => marcarCelula(hex) },
        {
          id: "colar", rotulo: "Colar", icone: <ClipboardPaste size={14} />, desabilitado: true,
          dica: "Ainda não há nada pra colar — ferramenta futura de copiar/recortar.",
          onSelecionar: () => {},
        },
        { id: "desfazer", rotulo: "Desfazer", icone: <Undo2 size={14} />, separadorAntes: true, desabilitado: historico.desfazer.length === 0, onSelecionar: () => desfazer() },
        { id: "refazer", rotulo: "Refazer", icone: <Redo2 size={14} />, desabilitado: historico.refazer.length === 0, onSelecionar: () => refazer() },
      );
      return itens;
    }
    const t = tokenPorId.get(tokenId);
    if (!t) return [];
    // Rotacionar aparece pra TODO token — mesmo pegada simétrica
    // (Pequeno/Médio/Enorme) tem orientação, só que girar muda pra
    // qual direção ele está "olhando" em vez de mudar células ocupadas.
    const itensGiro: ItemMenuContextual[] = [
      { id: "girar-esq", rotulo: "Rotacionar à esquerda", icone: <RotateCcw size={14} />, onSelecionar: () => onRotacionarToken(tokenId, -1) },
      { id: "girar-dir", rotulo: "Rotacionar à direita", icone: <RotateCw size={14} />, onSelecionar: () => onRotacionarToken(tokenId, 1) },
    ];
    if (ehNarrador) {
      return [
        { id: "editar", rotulo: "Editar", icone: <Pencil size={14} />, onSelecionar: () => abrirEditarToken(tokenId) },
        { id: "duplicar", rotulo: "Duplicar", icone: <Copy size={14} />, onSelecionar: () => duplicarTokenHandler(tokenId) },
        ...itensGiro.map((item, i) => (i === 0 ? { ...item, separadorAntes: true } : item)),
        { id: "ocultar", rotulo: t.visivel ? "Ocultar" : "Revelar", icone: t.visivel ? <EyeOff size={14} /> : <Eye size={14} />, onSelecionar: () => definirFlagsHandler(tokenId, "visivel"), separadorAntes: true },
        { id: "bloquear", rotulo: t.bloqueado ? "Desbloquear" : "Bloquear", icone: t.bloqueado ? <Unlock size={14} /> : <Lock size={14} />, onSelecionar: () => definirFlagsHandler(tokenId, "bloqueado") },
        { id: "remover", rotulo: "Remover", icone: <Trash2 size={14} />, perigoso: true, onSelecionar: () => setConfirmandoRemocao(t), separadorAntes: true },
      ];
    }
    if (!podeMoverToken(tokenId)) return [];
    return itensGiro;
  }

  // ── Terreno (narrador): pincel com raio (1/7/19 células via
  // `hexNoRaio`) OU balde (região contígua via `regiaoContiguaDeTerreno`)
  // — cada TICK de pressão/arrasto escreve na hora (arrasto contínuo,
  // sem esperar soltar), mas o GESTO INTEIRO (da pressão até soltar o
  // botão) vira UM comando de desfazer só, nunca um por célula — senão
  // desfazer um pincel de 19 células (ou um balde de uma sala inteira)
  // levaria N Ctrl+Z. `gestoTerrenoRef` acumula, por célula TOCADA
  // nesta pincelada, o valor de ANTES (só na primeira vez que ela é
  // tocada, pra não perder o "antes" de verdade se o pincel passar duas
  // vezes pela mesma célula). `finalizarPincelTerreno` (efeito abaixo,
  // no `pointerup` global) fecha o gesto e registra o comando combinado.
  const pintarConjunto = useCallback((celulas: Hex[], tipo: TipoTerreno | null) => {
    if (!estadoCena || celulas.length === 0) return;
    const sceneId = estadoCena.cena.id;
    const mudam = celulas.filter((h) => (terrenoReal.get(hexKey(h)) ?? null) !== tipo);
    if (mudam.length === 0) return;

    if (!gestoTerrenoRef.current) gestoTerrenoRef.current = new Map();
    const gesto = gestoTerrenoRef.current;
    for (const h of mudam) {
      const k = hexKey(h);
      if (!gesto.has(k)) gesto.set(k, { hex: h, tipoAntes: terrenoReal.get(k) ?? null });
    }
    setContagemGestoTerreno(gesto.size);

    pintarTerrenoAction({ campaignId, sceneId, celulas: mudam.map((h) => ({ q: h.q, r: h.r })), tipo }).then((r) => {
      if (!r.ok) { setErroAcao(r.erro ?? "Terreno recusado."); return; }
      setErroAcao(null);
      setEstadoCena((c) => {
        if (!c) return c;
        const chaves = new Set(mudam.map((h) => hexKey(h)));
        const semCelulas = c.terreno.filter((x) => !chaves.has(hexKey({ q: x.q, r: x.r })));
        return { ...c, terreno: tipo === null ? semCelulas : [...semCelulas, ...mudam.map((h) => ({ q: h.q, r: h.r, tipo }))] };
      });
    }).catch(() => setErroAcao("Falha de rede: o terreno não foi salvo."));
  }, [campaignId, estadoCena, terrenoReal]);

  const pintarComPincel = useCallback((centro: Hex, tipo: TipoTerreno | null) => {
    if (!estadoCena) return;
    const celulasPincel = hexNoRaio(centro, raioPincelTerreno)
      .filter((h) => dentroDoMapa(h, estadoCena.cena.largura, estadoCena.cena.altura));
    pintarConjunto(celulasPincel, tipo);
  }, [estadoCena, raioPincelTerreno, pintarConjunto]);

  // Balde: só reage à PRESSÃO inicial (nunca a arrastar) — um clique só
  // preenche a região contígua inteira; permitir que o arrasto dispare
  // um balde por célula tocada faria uma pincelada virar dezenas de
  // preenchimentos empilhados sem controle.
  const pintarComBalde = useCallback((origem: Hex, tipo: TipoTerreno | null) => {
    if (!estadoCena) return;
    const regiao = regiaoContiguaDeTerreno(origem, terrenoPintado, estadoCena.cena.largura, estadoCena.cena.altura);
    pintarConjunto(regiao, tipo);
  }, [estadoCena, terrenoPintado, pintarConjunto]);

  // Fecha o gesto de pincel no `pointerup` GLOBAL (não só na célula —
  // soltar fora da grade também encerra) e registra UM comando de
  // desfazer pro gesto inteiro. `desfazer` restaura CADA célula ao seu
  // próprio valor de antes (podem ser vários tipos diferentes
  // misturados numa pincelada só sobre terreno variado), agrupando por
  // valor pra minimizar chamadas; `executar` (redo) reaplica o mesmo
  // tipo final a todas de uma vez, igual ao gesto original.
  useEffect(() => {
    // Lê tudo via REF (nunca `estadoCena`/`usuarioId`/`modoTerreno`
    // direto): o array de dependências deste efeito fica só
    // `[campaignId, executarComando]`, então o listener global de
    // `pointerup` praticamente nunca precisa ser reinscrito (só ao
    // trocar de campanha) — antes disparava a quase toda atualização
    // de cena (qualquer evento realtime de OUTRO jogador).
    function finalizarPincelTerreno() {
      const gesto = gestoTerrenoRef.current;
      gestoTerrenoRef.current = null;
      setContagemGestoTerreno(null);
      const cena = estadoCenaRef.current;
      if (!gesto || gesto.size === 0 || !cena) return;
      const entradas = Array.from(gesto.values());
      const tipoFinal = modoTerrenoRef.current;
      const sceneId = cena.cena.id;
      // "Apagar" não vira objeto — não há o que promover. Qualquer
      // pintura de verdade fica disponível pro atalho "Converter em
      // objeto" (troca o gesto anterior, nunca acumula com um velho).
      setUltimoGestoTerrenoCelulas(tipoFinal === null ? null : entradas.map((e) => e.hex));

      async function aplicarUniforme(t: TipoTerreno | null) {
        const celulas = entradas.map((e) => ({ q: e.hex.q, r: e.hex.r }));
        const r = await pintarTerrenoAction({ campaignId, sceneId, celulas, tipo: t });
        if (!r.ok) { setErroAcao(r.erro ?? "Terreno recusado."); return; }
        setErroAcao(null);
        setEstadoCena((c) => {
          if (!c) return c;
          const chaves = new Set(celulas.map((p) => hexKey(p)));
          const sem = c.terreno.filter((x) => !chaves.has(hexKey({ q: x.q, r: x.r })));
          return { ...c, terreno: t === null ? sem : [...sem, ...celulas.map((p) => ({ ...p, tipo: t }))] };
        });
      }

      async function restaurarMisto() {
        const porTipo = new Map<string, Hex[]>();
        for (const e of entradas) {
          const chave = e.tipoAntes ?? "null";
          if (!porTipo.has(chave)) porTipo.set(chave, []);
          porTipo.get(chave)!.push(e.hex);
        }
        // Grupos operam em células DISJUNTAS (cada célula pertence a um
        // só grupo) — sem dependência de ordem entre eles, então rodam
        // em paralelo. Se um grupo falhar, os OUTROS ainda restauram
        // (mais correto pro undo do que parar tudo no primeiro erro).
        const resultados = await Promise.all(
          Array.from(porTipo, ([chave, hexes]) => {
            const t = chave === "null" ? null : (chave as TipoTerreno);
            return pintarTerrenoAction({ campaignId, sceneId, celulas: hexes.map((h) => ({ q: h.q, r: h.r })), tipo: t });
          }),
        );
        const falha = resultados.find((r) => !r.ok);
        if (falha) { setErroAcao(falha.erro ?? "Terreno recusado."); return; }
        setErroAcao(null);
        setEstadoCena((c) => {
          if (!c) return c;
          const chaves = new Set(entradas.map((e) => hexKey(e.hex)));
          const sem = c.terreno.filter((x) => !chaves.has(hexKey({ q: x.q, r: x.r })));
          const restauradas = entradas
            .filter((e) => e.tipoAntes !== null)
            .map((e) => ({ q: e.hex.q, r: e.hex.r, tipo: e.tipoAntes as TipoTerreno }));
          return { ...c, terreno: [...sem, ...restauradas] };
        });
      }

      executarComando({
        rotulo: `pincel de terreno (${entradas.length} célula${entradas.length > 1 ? "s" : ""})`,
        autorId: usuarioIdRef.current ?? "",
        executar: () => aplicarUniforme(tipoFinal),
        desfazer: () => restaurarMisto(),
      });
    }
    // Só o botão principal solto encerra o gesto — sem isso, largar um
    // botão secundário (ou um pointerup de um pointer não-relacionado)
    // no meio do arrasto fechava o gesto na hora errada, cortando uma
    // pincelada contínua em dois comandos de desfazer.
    function aoSoltarOuCancelar(e: PointerEvent) {
      if (e.type === "pointerup" && e.button !== 0) return;
      finalizarPincelTerreno();
    }
    window.addEventListener("pointerup", aoSoltarOuCancelar);
    window.addEventListener("pointercancel", aoSoltarOuCancelar);
    return () => {
      window.removeEventListener("pointerup", aoSoltarOuCancelar);
      window.removeEventListener("pointercancel", aoSoltarOuCancelar);
      // Descarrega qualquer gesto ainda pendente (componente desmontou
      // ou o efeito reinscreveu no meio de um arrasto) — sem isto, a
      // pintura já persistida no servidor ficava fora do undo pra
      // sempre, e a PRÓXIMA pincelada herdava o ref órfão por engano.
      finalizarPincelTerreno();
    };
  }, [campaignId, executarComando]);

  // ── Medir ──────────────────────────────────────────────────────
  // O GESTO inteiro (pressionar/arrastar/soltar, Q/Backspace/Enter/Esc,
  // linha, marcadores, rótulos, validação de bloqueio) vive dentro de
  // `MapaHex` — mesmo padrão da prévia de rota do movimento de token.
  // Aqui fica só o que é de fora do gesto: o MODO (efêmero ou
  // persistido) e a persistência em si. O resumo que o painel mostra
  // chega pronto por `onMedicaoMudou`; nunca há uma segunda máquina de
  // estados de régua deste lado.
  const [modoMedicao, setModoMedicao] = useState<ModoMedicao>("instantanea");
  const [resumoMedicao, setResumoMedicao] = useState<
    { trechos: number[]; metros: number; custo: number; atravessaBloqueio: boolean; dobras: number } | null
  >(null);
  const [limpandoMedicoes, setLimpandoMedicoes] = useState(false);

  // `modoMedicaoRef` pelo mesmo motivo de `modoTerrenoRef`: o callback
  // de conclusão é passado a `MapaHex` e não pode se reinscrever a
  // cada troca de modo — lê o valor corrente na hora de gravar.
  const modoMedicaoRef = useRef<ModoMedicao>("instantanea");
  useEffect(() => { modoMedicaoRef.current = modoMedicao; }, [modoMedicao]);

  const medicoes = useMemo(() => estadoCena?.medicoes ?? [], [estadoCena?.medicoes]);
  // `podeApagar` espelha a policy `vtt_measurements_delete` (0087) —
  // é o que decide se a régua vira alvo de clique. Autorização de
  // verdade continua na RLS; isto só evita oferecer uma ação que o
  // servidor recusaria.
  const medicoesParaMapa = useMemo(
    () => medicoes.map((m) => ({
      id: m.id, pontos: m.pontos, autorId: m.autorId,
      podeApagar: ehNarrador || m.autorId === usuarioId,
    })),
    [medicoes, ehNarrador, usuarioId],
  );
  // Quantas o usuário PODE apagar — o narrador limpa tudo, o jogador
  // só as suas. Espelha a policy `vtt_measurements_delete` (0087) pra
  // dizer no botão o que de fato vai acontecer; a autorização de
  // verdade continua sendo a RLS, nunca esta conta.
  const medicoesQuePodeLimpar = useMemo(
    () => (ehNarrador ? medicoes.length : medicoes.filter((m) => m.autorId === usuarioId).length),
    [medicoes, ehNarrador, usuarioId],
  );

  const persistirMedicao = useCallback((pontos: Hex[]) => {
    if (modoMedicaoRef.current !== "permanente") return;
    const sceneId = estadoCenaRef.current?.cena.id;
    if (!sceneId) return;
    const pontosNormalizados = pontos.map((p) => ({ q: p.q, r: p.r }));

    // Otimista de VERDADE: aparece ANTES do round-trip, não dentro do
    // `.then()`. A régua conclui e começa a salvar no instante em que
    // o botão solta (ou o Enter confirma a dobra) — sem isto, o único
    // feedback era o servidor responder, e num round-trip lento (~1s
    // é comum em dev) a régua ficava sumida da tela por um segundo
    // inteiro depois de "pronta", parecendo que nada tinha acontecido
    // até aparecer de repente — inclusive depois de um Esc que o
    // usuário apertou nesse intervalo, dando a impressão de que foi o
    // Esc que "aplicou" a medição (não foi: o Esc não fez nada, só
    // coincidiu de cair na janela de espera do servidor).
    const idTemporario = `local-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setEstadoCena((c) => (c && c.cena.id === sceneId ? {
      ...c,
      medicoes: [...c.medicoes, {
        id: idTemporario, autorId: usuarioIdRef.current ?? "",
        pontos: pontosNormalizados, cor: "ciano" as const, rotulo: null,
        criadaEm: new Date().toISOString(),
      }],
    } : c));

    criarMedicaoAction({ campaignId, sceneId, pontos: pontosNormalizados }).then((r) => {
      if (!r.ok) {
        setErroAcao(r.erro ?? "Não foi possível salvar a medição.");
        // Rollback: tira só o placeholder, nunca uma linha real que
        // por acaso tenha chegado nesse meio-tempo (nunca deveria, mas
        // filtrar por id é mais seguro que assumir).
        setEstadoCena((c) => (c && c.cena.id === sceneId ? { ...c, medicoes: c.medicoes.filter((m) => m.id !== idTemporario) } : c));
        return;
      }
      // Troca o placeholder pelo registro real (id de verdade). Se o
      // eco do Realtime já tiver chegado primeiro (corrida rara), o
      // `id` real já está na lista — só remove o placeholder duplicado.
      setEstadoCena((c) => {
        if (!c || c.cena.id !== sceneId) return c;
        const semPlaceholder = c.medicoes.filter((m) => m.id !== idTemporario);
        if (semPlaceholder.some((m) => m.id === r.dados!.id)) return { ...c, medicoes: semPlaceholder };
        return {
          ...c,
          medicoes: [...semPlaceholder, {
            id: r.dados!.id, autorId: usuarioIdRef.current ?? "",
            pontos: pontosNormalizados, cor: "ciano" as const, rotulo: null, criadaEm: new Date().toISOString(),
          }],
        };
      });
    }).catch(() => {
      // Queda de rede: a régua otimista TEM que sair da tela, senão
      // fica uma medição fantasma que ninguém mais na mesa enxerga.
      // Mesmo rollback do caminho de recusa.
      setErroAcao("Falha de rede: a medição não foi salva.");
      setEstadoCena((c) => (c && c.cena.id === sceneId ? { ...c, medicoes: c.medicoes.filter((m) => m.id !== idTemporario) } : c));
    });
  }, [campaignId]);

  const apagarMedicao = useCallback((id: string) => {
    apagarMedicaoAction({ campaignId, medicaoId: id }).then((r) => {
      if (!r.ok) { setErroAcao(r.erro ?? "Não foi possível apagar a medição."); return; }
      setEstadoCena((c) => (c ? { ...c, medicoes: c.medicoes.filter((m) => m.id !== id) } : c));
    }).catch(() => setErroAcao("Falha de rede: a medição continua no mapa."));
  }, [campaignId]);

  const limparMedicoes = useCallback(() => {
    const sceneId = estadoCenaRef.current?.cena.id;
    if (!sceneId) return;
    setLimpandoMedicoes(true);
    limparMedicoesAction({ campaignId, sceneId }).then((r) => {
      setLimpandoMedicoes(false);
      if (!r.ok) { setErroAcao(r.erro ?? "Não foi possível limpar as medições."); return; }
      // Remove só o que a RLS de fato apagou: as do próprio usuário
      // (ou todas, se narrador). Limpar a lista inteira no cliente
      // faria as réguas alheias sumirem da tela de um jogador sem
      // terem sumido do banco — voltariam no próximo reload.
      setEstadoCena((c) => {
        if (!c || c.cena.id !== sceneId) return c;
        const meuId = usuarioIdRef.current;
        return { ...c, medicoes: ehNarrador ? [] : c.medicoes.filter((m) => m.autorId !== meuId) };
      });
    }).catch(() => {
      // Sem isto o botão ficava preso em "Limpando…" pra sempre numa
      // queda de rede — o mesmo desligar que o caminho de recusa faz.
      setLimpandoMedicoes(false);
      setErroAcao("Falha de rede: as medições não foram limpas.");
    });
  }, [campaignId, ehNarrador]);

  // ── Marcar (ping persistido, apagar por autor/narrador) ──────────
  const apagarMarca = useCallback((id: string) => {
    apagarMarcaAction({ campaignId, marcaId: id }).then((r) => {
      if (r.ok) setEstadoCena((c) => c ? { ...c, marcas: c.marcas.filter((m) => m.id !== id) } : c);
      else setErroAcao(r.erro ?? "Falha ao apagar marcação.");
    }).catch(() => setErroAcao("Falha de rede: a marcação continua no mapa."));
  }, [campaignId]);

  /**
   * Cria (ou apaga, se já houver uma marca sua/do narrador ali) uma
   * marcação NA CÉLULA — a ação de verdade por trás da ferramenta
   * Marcar. Extraída de `onClicarCelula` pra ser chamável DIRETO,
   * sem exigir que a ferramenta esteja ativa: o item "Marcar" do menu
   * contextual do mapa precisa MARCAR ao ser clicado, não só trocar a
   * ferramenta ativa e esperar um segundo clique.
   */
  // ── MARCAR: escolhas da ferramenta ───────────────────────────────
  // `vtt_marks` já guardava cor, texto e privacidade; o produto gravava
  // tudo fixo porque não havia onde escolher. A janela (`PainelMarcar`)
  // é esse lugar. Estado LOCAL: é preferência de quem está marcando
  // agora, não estado da mesa.
  const [sinalMarca, setSinalMarca] = useState<SinalMarcaUi>("alvo");
  const [duracaoMarca, setDuracaoMarca] = useState<DuracaoMarcaUi>("persistente");
  const [corMarca, setCorMarca] = useState<CorMarcaUi>("ciano");
  const [textoMarca, setTextoMarca] = useState("");
  const [marcaPrivada, setMarcaPrivada] = useState(false);
  const [limpandoMarcas, setLimpandoMarcas] = useState(false);
  const escolhasMarcaRef = useRef({ cor: corMarca, texto: textoMarca, privada: marcaPrivada, sinal: sinalMarca, duracao: duracaoMarca });
  useEffect(() => {
    escolhasMarcaRef.current = { cor: corMarca, texto: textoMarca, privada: marcaPrivada, sinal: sinalMarca, duracao: duracaoMarca };
  }, [corMarca, textoMarca, marcaPrivada, sinalMarca, duracaoMarca]);

  /** Minhas marcações (ou todas, se narrador) — o que "Limpar" alcança. */
  const marcasQuePossoApagar = useMemo(
    () => (estadoCena?.marcas ?? []).filter((m) => ehNarrador || m.autorId === usuarioId),
    [estadoCena, ehNarrador, usuarioId],
  );

  const limparMinhasMarcas = useCallback(async () => {
    const alvos = marcasQuePossoApagar.map((m) => m.id);
    if (alvos.length === 0) return;
    setLimpandoMarcas(true);
    try {
      // Uma a uma, e não uma RPC de lote: a ação de apagar já existe,
      // já é autorizada por marca, e um lote novo só pra isto seria
      // uma segunda porta de escrita pra mesma regra.
      for (const id of alvos) await apagarMarca(id);
    } finally {
      setLimpandoMarcas(false);
    }
  }, [marcasQuePossoApagar, apagarMarca]);

  const marcarCelula = useCallback((h: Hex) => {
    if (!estadoCena) return;
    // Clicar numa célula que já tem uma marca SUA (ou do narrador, se
    // for narrador) apaga em vez de empilhar outra por cima — o alvo
    // de clique da célula inteira é maior e mais confiável do que o
    // ping de 10px sozinho (ver `onClicarMarca`, que continua
    // existindo como atalho direto no próprio marcador).
    const existente = estadoCena.marcas.find((m) => m.pontos[0]?.q === h.q && m.pontos[0]?.r === h.r);
    if (existente && (ehNarrador || existente.autorId === usuarioId)) { apagarMarca(existente.id); return; }
    if (existente) return; // marca de outra pessoa: nem cria em cima, nem apaga
    // Lê do ref, não do closure: a cor/rótulo podem ter mudado no
    // painel entre um render e o clique.
    const escolhas = escolhasMarcaRef.current;
    criarMarcaAction({
      campaignId, sceneId: estadoCena.cena.id, tipo: "texto", pontos: [{ q: h.q, r: h.r }],
      cor: escolhas.cor, texto: escolhas.texto.trim() || undefined,
      espessura: 2, opacidade: 1, privada: escolhas.privada,
      sinal: escolhas.sinal, duracao: escolhas.duracao,
      // A rodada de NASCIMENTO é o que faz "esta rodada" vencer. Fora
      // de combate vai `null`, e aí só "persistente" faz sentido.
      rodadaCriada: trilhaRef.current.estado?.rodada ?? null,
    }).then((r) => { if (!r.ok) setErroAcao(r.erro ?? "Marcação recusada."); });
  }, [campaignId, estadoCena, ehNarrador, usuarioId, apagarMarca]);

  const onClicarCelula = useCallback((h: Hex) => {
    if (ferramenta === "marcar") marcarCelula(h);
  }, [ferramenta, marcarCelula]);

  const onClicarMarca = useCallback((id: string) => { apagarMarca(id); }, [apagarMarca]);


  // ── IMAGENS: os três gestos de entrada ─────────────────────────────
  //
  // Colar, arrastar do sistema e escolher pelo painel. Os três param no
  // MESMO lugar — `prepararArquivo`, que decodifica em memória e abre a
  // confirmação — porque um segundo caminho de upload seria um segundo
  // conjunto de regras para manter de acordo com o primeiro.
  //
  // Só narrador: fundo e tile são montagem de mesa. O retrato de token,
  // que o jogador troca, entra por outra porta (o HUD do token), com
  // outra intenção e outra autorização no servidor.

  /**
   * Onde a imagem cai. O ponteiro manda quando esteve sobre o mapa; se
   * não esteve, o centro da cena.
   *
   * A regra é FIXA e documentada de propósito: colar "onde o mouse
   * estava" é o que a mesa espera, mas um ponteiro que nunca entrou no
   * mapa (a pessoa colou logo depois de alternar de aba) não tem
   * posição nenhuma — e cair em (0,0), o canto, seria pior que cair no
   * meio.
   */
  const ancoraParaImagem = useCallback((): PontoAxial => {
    const p = ancoraPonteiroRef.current;
    if (p) return p;
    return {
      q: ((estadoCena?.cena.largura ?? 1) - 1) / 2,
      r: ((estadoCena?.cena.altura ?? 1) - 1) / 2,
    };
  }, [estadoCena?.cena.largura, estadoCena?.cena.altura]);

  const inputImagemRef = useRef<HTMLInputElement | null>(null);
  const [bibliotecaAberta, setBibliotecaAberta] = useState(false);
  const escolherArquivoDeImagem = useCallback(() => {
    inputImagemRef.current?.click();
  }, []);

  // Colar. O guarda de foco é o ponto crítico: sem ele, colar um texto
  // no chat ou um nome no campo de token seria interceptado pelo mapa —
  // o tipo de captura global que faz uma interface parecer enfeitiçada.
  useEffect(() => {
    if (!ehNarrador) return;
    function aoColar(e: ClipboardEvent) {
      if (elementoEhEditavel(document.activeElement as HTMLElement | null)) return;
      const arquivo = Array.from(e.clipboardData?.items ?? [])
        .find((i) => i.kind === "file" && i.type.startsWith("image/"))
        ?.getAsFile();
      if (!arquivo) return;
      e.preventDefault();
      void imgs.prepararArquivo(arquivo, ancoraParaImagem());
    }
    window.addEventListener("paste", aoColar);
    return () => window.removeEventListener("paste", aoColar);
  }, [ehNarrador, imgs, ancoraParaImagem]);

  // Soltar um arquivo do sistema. `dragover` precisa do `preventDefault`
  // para o `drop` chegar — sem ele o navegador abre a imagem numa aba e
  // o VTT some da tela.
  useEffect(() => {
    if (!ehNarrador) return;
    const alvo = palcoRef.current;
    if (!alvo) return;

    function temArquivo(e: DragEvent): boolean {
      return Array.from(e.dataTransfer?.types ?? []).includes("Files");
    }
    function aoArrastar(e: DragEvent) {
      if (!temArquivo(e)) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
      setArrastandoArquivo(true);
    }
    function aoSair(e: DragEvent) {
      // `dragleave` dispara ao cruzar qualquer borda interna; só o que
      // sai do palco de verdade apaga o realce.
      if (e.relatedTarget && alvo!.contains(e.relatedTarget as Node)) return;
      setArrastandoArquivo(false);
    }
    function aoSoltar(e: DragEvent) {
      if (!temArquivo(e)) return;
      e.preventDefault();
      setArrastandoArquivo(false);
      const arquivo = Array.from(e.dataTransfer?.files ?? [])
        .find((f) => f.type.startsWith("image/"));
      if (!arquivo) return;
      // A âncora vem do ponto do DROP, não do ponteiro guardado: o
      // navegador não emite `pointermove` durante um arraste de
      // arquivo, então `ancoraPonteiroRef` estaria parado onde o mouse
      // esteve pela última vez antes do arraste começar.
      const p = pontoAxialDoEvento(e.clientX, e.clientY);
      void imgs.prepararArquivo(arquivo, p ?? ancoraParaImagem());
    }

    alvo.addEventListener("dragover", aoArrastar);
    alvo.addEventListener("dragleave", aoSair);
    alvo.addEventListener("drop", aoSoltar);
    return () => {
      alvo.removeEventListener("dragover", aoArrastar);
      alvo.removeEventListener("dragleave", aoSair);
      alvo.removeEventListener("drop", aoSoltar);
    };
  }, [ehNarrador, imgs, ancoraParaImagem, pontoAxialDoEvento]);

  // ── Objetos: seleção de células PENDENTE, local — só vira objeto de
  // verdade quando o narrador confirma (`criarObjetoPendente`). Clique
  // (pressão sem arrastar) ALTERNA a célula — é como se tira uma
  // célula errada da seleção; arrastar por cima só ADICIONA (nunca
  // remove no meio do arrasto, mesma assimetria de terreno x pincel).
  const alternarCelulaObjeto = useCallback((h: Hex) => {
    // Começar/continuar um rascunho de posição (criação OU reposicionar
    // um existente, `objetoMovendoId`) supera qualquer seleção-pra-excluir
    // ou formulário de edição aberto — só um "modo" ativo por vez.
    setObjetoSelecionadoId(null);
    setRascunhoEdicaoObjeto(null);
    setCelulasObjetoPendente((atual) => {
      const k = hexKey(h);
      if (atual.some((c) => hexKey(c) === k)) return atual.filter((c) => hexKey(c) !== k);
      if (atual.length >= 64) return atual; // mesmo teto de `vtt_definir_celulas_objeto` — só bloqueia ADICIONAR, nunca remover
      return [...atual, h];
    });
  }, []);
  const adicionarCelulaObjeto = useCallback((h: Hex) => {
    setObjetoSelecionadoId(null);
    setRascunhoEdicaoObjeto(null);
    setCelulasObjetoPendente((atual) => {
      const k = hexKey(h);
      if (atual.some((c) => hexKey(c) === k)) return atual;
      if (atual.length >= 64) return atual; // mesmo teto de `vtt_definir_celulas_objeto`
      return [...atual, h];
    });
  }, []);
  const cancelarObjetoPendente = useCallback(() => {
    setCelulasObjetoPendente([]);
    setObjetoMovendoId(null);
  }, []);

  // Se o objeto sendo movido sumir de `estadoCena.objetos` (outra
  // sessão excluiu enquanto o rascunho de posição estava aberto),
  // `objetoMovendoId` sozinho NUNCA seria limpo — o painel voltaria
  // silenciosamente pra cópia de "criar" e confirmar criaria um objeto
  // NOVO (fantasma) com as células que sobraram do rascunho. Cancela
  // e avisa em vez de deixar isso acontecer calado.
  useEffect(() => {
    if (!objetoMovendoId) return;
    if (estadoCena?.objetos.some((o) => o.id === objetoMovendoId)) return;
    cancelarObjetoPendente();
    setErroAcao("Objeto sendo movido foi removido — mova cancelada.");
  }, [objetoMovendoId, estadoCena, cancelarObjetoPendente]);

  // ── Objetos: selecionar um já persistido (clique nele, não na
  // célula) pra excluir/mover/editar. Ponteiro puramente local — vira
  // RPC só nos botões de ação abaixo.
  const selecionarObjetoNoMapa = useCallback((id: string) => {
    setCelulasObjetoPendente([]); // selecionar um existente supera qualquer rascunho de posição
    setObjetoMovendoId(null);
    setRascunhoEdicaoObjeto(null);
    setDeltaPdObjeto("");
    setObjetoSelecionadoId(id);
  }, []);

  const excluirObjetoSelecionado = useCallback(() => {
    if (!objetoSelecionadoId || excluindoObjeto) return;
    const id = objetoSelecionadoId;
    setExcluindoObjeto(true);
    removerObjetoAction({ campaignId, objectId: id }).then((r) => {
      setExcluindoObjeto(false);
      if (!r.ok) { setErroAcao(r.erro ?? "Falha ao remover objeto."); return; }
      setErroAcao(null);
      setEstadoCena((c) => (c ? { ...c, objetos: c.objetos.filter((o) => o.id !== id) } : c));
      setObjetoSelecionadoId(null);
    }).catch(() => {
      setExcluindoObjeto(false);
      setErroAcao("Falha de rede: o objeto não foi removido.");
    });
  }, [campaignId, objetoSelecionadoId, excluindoObjeto]);

  // ── Mover: reaproveita o MESMO rascunho de células da criação — só
  // muda o destino da confirmação (`move_vtt_object` em vez de
  // `create_vtt_object`). Semeia o rascunho com as células ATUAIS do
  // objeto, pra editar a partir delas (não do zero).
  const iniciarMoverObjetoSelecionado = useCallback(() => {
    if (!objetoSelecionadoId || !estadoCena) return;
    const obj = estadoCena.objetos.find((o) => o.id === objetoSelecionadoId);
    if (!obj) return; // objeto sumiu (outra sessão excluiu, ou id inválido)
    setCelulasObjetoPendente(obj.celulas.map((c) => ({ q: c.q, r: c.r })));
    setObjetoMovendoId(obj.id);
    setObjetoSelecionadoId(null);
    setRascunhoEdicaoObjeto(null);
  }, [objetoSelecionadoId, estadoCena]);

  // Payload completo de `atualizarObjetoAction` a partir do objeto
  // ATUAL, só trocando o(s) campo(s) que a ação realmente quer mudar —
  // `update_vtt_object` substitui TODOS os campos de uma vez (não é um
  // PATCH parcial no servidor), então nunca dá pra mandar só o campo
  // que mudou; isto evita reescrever os outros 8 campos à mão em cada
  // chamador (um 10º campo editável no futuro só precisa entrar aqui).
  function payloadDeObjeto(
    obj: ObjetoVtt,
    overrides: Partial<Omit<AtualizarObjetoParams, "campaignId" | "objectId" | "revisionEsperada">>,
  ) {
    return {
      nome: obj.nome, bloqueiaMovimento: obj.bloqueiaMovimento, terrenoProjetado: obj.terrenoProjetado,
      grauCobertura: obj.grauCobertura, categoria: obj.categoria, pd: obj.pd, pdMax: obj.pdMax,
      visivel: obj.visivel, travado: obj.travado, ...overrides,
    };
  }

  // Objetos entram no MESMO histórico de undo/redo que token/terreno
  // (`executarComando`) — aplica na hora, só registra o `Comando` se o
  // servidor confirmou, e lê a revisão SEMPRE fresca via
  // `estadoCenaRef.current` a cada tentativa (inclusive dentro de
  // `executar`/`desfazer`), nunca uma revisão fixa capturada uma vez —
  // mesmo padrão de `onRotacionarToken`/`confirmarEdicaoToken`.
  const confirmarMoverObjeto = useCallback(() => {
    if (!objetoMovendoId || !estadoCena || celulasObjetoPendente.length === 0 || movendoObjeto) return;
    const obj = estadoCena.objetos.find((o) => o.id === objetoMovendoId);
    if (!obj) return;
    const objectId = obj.id;
    const nome = obj.nome;
    const celulasAntes = obj.celulas.map((c) => ({ q: c.q, r: c.r }));
    const celulasDepois = celulasObjetoPendente.map((c) => ({ q: c.q, r: c.r }));

    async function aplicar(celulas: { q: number; r: number }[]): Promise<boolean> {
      const atual = estadoCenaRef.current?.objetos.find((o) => o.id === objectId);
      if (!atual) return false;
      const r = await moverObjetoAction({ campaignId, objectId, revisionEsperada: atual.revision, celulas });
      if (!r.ok || !r.dados) { setErroAcao(r.erro ?? "Movimento de objeto recusado."); return false; }
      setErroAcao(null);
      setEstadoCena((c) => (c ? { ...c, objetos: c.objetos.map((o) => (o.id === objectId ? r.dados!.objeto : o)) } : c));
      return true;
    }

    setMovendoObjeto(true);
    aplicar(celulasDepois).then((sucesso) => {
      setMovendoObjeto(false);
      if (!sucesso) return;
      setCelulasObjetoPendente([]);
      setObjetoMovendoId(null);
      executarComando({
        rotulo: `mover ${nome}`,
        autorId: usuarioIdRef.current ?? "",
        executar: () => aplicar(celulasDepois).then(() => {}),
        desfazer: () => aplicar(celulasAntes).then(() => {}),
      });
    });
  }, [campaignId, estadoCena, objetoMovendoId, celulasObjetoPendente, movendoObjeto, executarComando]);

  // ── Editar: formulário inline no submenu — campos NÃO-geométricos
  // (nome, bloqueio, terreno projetado, cobertura, PD, visibilidade,
  // travado). `update_vtt_object` substitui TUDO de uma vez, então o
  // rascunho nasce com os valores ATUAIS (nunca em branco).
  const iniciarEdicaoObjetoSelecionado = useCallback(() => {
    if (!objetoSelecionadoId || !estadoCena) return;
    const obj = estadoCena.objetos.find((o) => o.id === objetoSelecionadoId);
    if (!obj) return;
    setRascunhoEdicaoObjeto({
      nome: obj.nome, bloqueiaMovimento: obj.bloqueiaMovimento, terrenoProjetado: obj.terrenoProjetado,
      grauCobertura: obj.grauCobertura, categoria: obj.categoria, pd: obj.pd, pdMax: obj.pdMax,
      visivel: obj.visivel, travado: obj.travado,
    });
  }, [objetoSelecionadoId, estadoCena]);

  const cancelarEdicaoObjeto = useCallback(() => setRascunhoEdicaoObjeto(null), []);

  const salvarEdicaoObjeto = useCallback(() => {
    if (!objetoSelecionadoId || !rascunhoEdicaoObjeto || !estadoCena || salvandoEdicaoObjeto) return;
    const obj = estadoCena.objetos.find((o) => o.id === objetoSelecionadoId);
    if (!obj) return;
    const objectId = obj.id;
    const nome = obj.nome;
    const original = payloadDeObjeto(obj, {});
    const novo = { ...rascunhoEdicaoObjeto };

    async function aplicar(campos: typeof original): Promise<boolean> {
      const atual = estadoCenaRef.current?.objetos.find((o) => o.id === objectId);
      if (!atual) return false;
      const r = await atualizarObjetoAction({ campaignId, objectId, revisionEsperada: atual.revision, ...campos });
      if (!r.ok || !r.dados) { setErroAcao(r.erro ?? "Edição de objeto recusada."); return false; }
      setErroAcao(null);
      setEstadoCena((c) => (c ? { ...c, objetos: c.objetos.map((o) => (o.id === objectId ? r.dados!.objeto : o)) } : c));
      return true;
    }

    setSalvandoEdicaoObjeto(true);
    aplicar(novo).then((sucesso) => {
      setSalvandoEdicaoObjeto(false);
      if (!sucesso) return;
      setRascunhoEdicaoObjeto(null);
      executarComando({
        rotulo: `editar ${nome}`,
        autorId: usuarioIdRef.current ?? "",
        executar: () => aplicar(novo).then(() => {}),
        desfazer: () => aplicar(original).then(() => {}),
      });
    });
  }, [campaignId, estadoCena, objetoSelecionadoId, rascunhoEdicaoObjeto, salvandoEdicaoObjeto, executarComando]);

  // Alterna só `travado` (cinto de segurança) sem abrir o formulário
  // inteiro — mesmos valores atuais do objeto, um campo só muda.
  const alternarTravamentoObjetoSelecionado = useCallback(() => {
    if (!objetoSelecionadoId || !estadoCena || salvandoEdicaoObjeto) return;
    const obj = estadoCena.objetos.find((o) => o.id === objetoSelecionadoId);
    if (!obj) return;
    const objectId = obj.id;
    const nome = obj.nome;
    const travadoAntes = obj.travado;

    async function aplicar(travado: boolean): Promise<boolean> {
      const atual = estadoCenaRef.current?.objetos.find((o) => o.id === objectId);
      if (!atual) return false;
      const r = await atualizarObjetoAction({ campaignId, objectId, revisionEsperada: atual.revision, ...payloadDeObjeto(atual, { travado }) });
      if (!r.ok || !r.dados) { setErroAcao(r.erro ?? "Falha ao travar/destravar objeto."); return false; }
      setErroAcao(null);
      setEstadoCena((c) => (c ? { ...c, objetos: c.objetos.map((o) => (o.id === objectId ? r.dados!.objeto : o)) } : c));
      return true;
    }

    setSalvandoEdicaoObjeto(true);
    aplicar(!travadoAntes).then((sucesso) => {
      setSalvandoEdicaoObjeto(false);
      if (!sucesso) return;
      executarComando({
        rotulo: travadoAntes ? `destravar ${nome}` : `travar ${nome}`,
        autorId: usuarioIdRef.current ?? "",
        executar: () => aplicar(!travadoAntes).then(() => {}),
        desfazer: () => aplicar(travadoAntes).then(() => {}),
      });
    });
  }, [campaignId, estadoCena, objetoSelecionadoId, salvandoEdicaoObjeto, executarComando]);

  // ── PD: dano (`sinal: -1`) ou reparo (`sinal: 1`) sobre o objeto
  // selecionado — `damage_vtt_object` clampa entre 0 e PD máximo
  // sozinho no servidor; aqui só manda a MAGNITUDE com o sinal certo.
  // Chegar a 0 PD não remove nem transforma nada (D8) — vira só um
  // indicador "Destruído" no painel, ver `virarEntulhoObjetoSelecionado`.
  const aplicarDanoObjetoSelecionado = useCallback((sinal: 1 | -1) => {
    if (!objetoSelecionadoId || !estadoCena || aplicandoDanoObjeto) return;
    const obj = estadoCena.objetos.find((o) => o.id === objetoSelecionadoId);
    if (!obj) return;
    const objectId = obj.id;
    const nome = obj.nome;
    const magnitude = Math.abs(Math.trunc(Number(deltaPdObjeto)));
    if (!magnitude) return;

    // O servidor clampa entre 0 e o PD máximo — se o dano/reparo bater
    // no teto, o delta NOMINAL não é o que de fato aconteceu. Desfazer/
    // refazer usam o delta EFETIVO (pdDepois − pdAntes), não o digitado,
    // senão um dano de 10 num objeto com só 3 PD (clampado em −3) viraria
    // um "desfazer" de +10 — reparando 7 PD que nunca existiram.
    async function aplicar(delta: number): Promise<number | null> {
      const atual = estadoCenaRef.current?.objetos.find((o) => o.id === objectId);
      if (!atual || atual.pd === null) return null;
      const pdAntes = atual.pd;
      const r = await danificarObjetoAction({ campaignId, objectId, revisionEsperada: atual.revision, delta });
      if (!r.ok || !r.dados) { setErroAcao(r.erro ?? "Dano/reparo recusado."); return null; }
      setErroAcao(null);
      setEstadoCena((c) => (c ? { ...c, objetos: c.objetos.map((o) => (o.id === objectId ? r.dados!.objeto : o)) } : c));
      return r.dados.objeto.pd !== null ? r.dados.objeto.pd - pdAntes : delta;
    }

    setAplicandoDanoObjeto(true);
    const deltaNominal = sinal * magnitude;
    aplicar(deltaNominal).then((deltaEfetivo) => {
      setAplicandoDanoObjeto(false);
      if (deltaEfetivo === null) return;
      setDeltaPdObjeto("");
      executarComando({
        rotulo: `${sinal === -1 ? "dano em" : "reparo em"} ${nome} (${magnitude})`,
        autorId: usuarioIdRef.current ?? "",
        executar: () => aplicar(deltaEfetivo).then(() => {}),
        desfazer: () => aplicar(-deltaEfetivo).then(() => {}),
      });
    });
  }, [campaignId, estadoCena, objetoSelecionadoId, deltaPdObjeto, aplicandoDanoObjeto, executarComando]);

  // "Virar entulho" (0 PD) é só um ATALHO pro que "Editar" já permite
  // campo a campo: desliga bloqueio de movimento e projeta terreno
  // difícil, igual ao preset `entulho` — o narrador quem decide se usa
  // (D8, nunca automático). Não muda a aparência (preset é imutável
  // depois de criado); é o comportamento mecânico que vira entulho.
  const virarEntulhoObjetoSelecionado = useCallback(() => {
    if (!objetoSelecionadoId || !estadoCena || salvandoEdicaoObjeto) return;
    const obj = estadoCena.objetos.find((o) => o.id === objetoSelecionadoId);
    if (!obj) return;
    const objectId = obj.id;
    const nome = obj.nome;
    const antes = { bloqueiaMovimento: obj.bloqueiaMovimento, terrenoProjetado: obj.terrenoProjetado };
    const depois = { bloqueiaMovimento: false, terrenoProjetado: "dificil" as const };

    async function aplicar(campos: typeof antes): Promise<boolean> {
      const atual = estadoCenaRef.current?.objetos.find((o) => o.id === objectId);
      if (!atual) return false;
      const r = await atualizarObjetoAction({ campaignId, objectId, revisionEsperada: atual.revision, ...payloadDeObjeto(atual, campos) });
      if (!r.ok || !r.dados) { setErroAcao(r.erro ?? "Falha ao virar entulho."); return false; }
      setErroAcao(null);
      setEstadoCena((c) => (c ? { ...c, objetos: c.objetos.map((o) => (o.id === objectId ? r.dados!.objeto : o)) } : c));
      return true;
    }

    setSalvandoEdicaoObjeto(true);
    aplicar(depois).then((sucesso) => {
      setSalvandoEdicaoObjeto(false);
      if (!sucesso) return;
      executarComando({
        rotulo: `virar entulho ${nome}`,
        autorId: usuarioIdRef.current ?? "",
        executar: () => aplicar(depois).then(() => {}),
        desfazer: () => aplicar(antes).then(() => {}),
      });
    });
  }, [campaignId, estadoCena, objetoSelecionadoId, salvandoEdicaoObjeto, executarComando]);

  const criarObjetoPendente = useCallback(() => {
    if (!estadoCena || celulasObjetoPendente.length === 0 || criandoObjeto) return;
    const sceneId = estadoCena.cena.id;
    const v = valoresIniciaisDoPreset(presetObjeto);
    setCriandoObjeto(true);
    criarObjetoAction({
      campaignId, sceneId, nome: v.nome, preset: presetObjeto,
      celulas: celulasObjetoPendente.map((c) => ({ q: c.q, r: c.r })),
      bloqueiaMovimento: v.bloqueiaMovimento, terrenoProjetado: v.terrenoProjetado,
      grauCobertura: v.grauCobertura, categoria: v.categoria, pd: v.pd, pdMax: v.pdMax,
      visivel: true,
    }).then((r) => {
      setCriandoObjeto(false);
      if (!r.ok || !r.dados) { setErroAcao(r.erro ?? "Criação de objeto recusada."); return; }
      setErroAcao(null);
      setEstadoCena((c) => (c ? { ...c, objetos: [...c.objetos, r.dados!.objeto] } : c));
      setCelulasObjetoPendente([]);
    });
  }, [campaignId, estadoCena, celulasObjetoPendente, presetObjeto, criandoObjeto]);

  // Atalho "Converter em objeto": pega as células do ÚLTIMO gesto de
  // pincel/balde de Terreno e semeia o rascunho de criação de objeto
  // com elas — poupa redesenhar a mesma forma na ferramenta Objetos.
  // Só troca de ferramenta e preenche o rascunho; a criação em si
  // continua exigindo escolher um preset e clicar "Criar objeto" (o
  // narrador decide o preset, nunca é adivinhado a partir do tipo de
  // terreno pintado).
  const converterGestoEmObjeto = useCallback(() => {
    if (!ultimoGestoTerrenoCelulas || ultimoGestoTerrenoCelulas.length === 0) return;
    setCelulasObjetoPendente(ultimoGestoTerrenoCelulas);
    trocarFerramenta("objetos");
  }, [ultimoGestoTerrenoCelulas, trocarFerramenta]);

  // ── Terreno/Objetos: pressão inicial + arrastar pintando ──────────
  const onPressCelula = useCallback((h: Hex) => {
    if (!ehNarrador) return;
    if (ferramenta === "terreno") {
      if (modoPincelTerreno === "balde") pintarComBalde(h, modoTerreno);
      else pintarComPincel(h, modoTerreno);
    } else if (ferramenta === "objetos") alternarCelulaObjeto(h);
  }, [ferramenta, ehNarrador, modoPincelTerreno, pintarComPincel, pintarComBalde, modoTerreno, alternarCelulaObjeto]);
  const onEntrarCelulaPintando = useCallback((h: Hex) => {
    if (!ehNarrador) return;
    // Balde nunca reage a arrastar — só ao clique inicial (ver `pintarComBalde`).
    if (ferramenta === "terreno" && modoPincelTerreno === "pincel") pintarComPincel(h, modoTerreno);
    else if (ferramenta === "objetos") adicionarCelulaObjeto(h);
  }, [ferramenta, ehNarrador, modoPincelTerreno, pintarComPincel, modoTerreno, adicionarCelulaObjeto]);

  const podeMoverToken = useCallback((tokenId: string) => {
    if (ehNarrador) return true;
    const token = tokenPorId.get(tokenId);
    // Controle de verdade é `character_controllers` — nunca só "tem
    // characterId" (um token vinculado não dá controle a QUALQUER
    // jogador). Isto é só um palpite otimista pra decidir se o arrasto
    // INICIA — a autorização real é `can_move_vtt_token` (migration
    // 0065), que recusa no banco mesmo que esta função deixe passar.
    return token?.podeControlar === true
      || (!!token?.characterId && controlledCharacterIds.includes(token.characterId));
  }, [ehNarrador, tokenPorId, controlledCharacterIds]);

  // ── Undo/redo ──────────────────────────────────────────────────
  // `comando.desfazer()`/`executar()` são efeitos colaterais reais
  // (chamam Server Actions, que chamam `setEstadoCena`/`setErroAcao`) —
  // NUNCA dentro do updater funcional de `setHistorico`. Um updater
  // pode ser invocado mais de uma vez pelo React (StrictMode, renders
  // concorrentes descartados), então rodar o efeito lá dentro arrisca
  // disparar o movimento/pintura duas vezes E gera exatamente o aviso
  // "setState de um componente enquanto outro está renderizando". Lê o
  // histórico atual via ref (sempre sincronizado, ver acima), decide
  // fora do updater, e só ENTÃO chama o efeito — já fora de qualquer
  // fase de render.
  const desfazer = useCallback(() => {
    if (!usuarioId) return;
    const r = prepararUndo(historicoRef.current, usuarioId, ehNarrador);
    setHistorico(r.historico);
    if (r.comando) r.comando.desfazer();
  }, [usuarioId, ehNarrador]);
  const refazer = useCallback(() => {
    if (!usuarioId) return;
    const r = prepararRedo(historicoRef.current, usuarioId, ehNarrador);
    setHistorico(r.historico);
    if (r.comando) r.comando.executar();
  }, [usuarioId, ehNarrador]);

  // ── Atalhos globais ────────────────────────────────────────────
  useEffect(() => {
    function ouvir(e: KeyboardEvent) {
      const acao = interpretarAtalho(
        { key: e.key, ctrlKey: e.ctrlKey, metaKey: e.metaKey, shiftKey: e.shiftKey, alvoEhEditavel: elementoEhEditavel(document.activeElement as HTMLElement | null) },
        ferramentasDisponiveis,
      );
      if (!acao) return;
      if (acao.tipo === "ferramenta") trocarFerramenta(acao.id);
      // Cancelar uma medição em andamento é responsabilidade do
      // listener de Escape DENTRO de `MapaHex` (o estado da medição
      // vive lá) — aqui só limpa a seleção de tokens.
      else if (acao.tipo === "cancelar") {
        setSelecionadosIds(new Set());
        setSelecionadoId(null);
      }
      else if (acao.tipo === "undo") desfazer();
      else if (acao.tipo === "redo") refazer();
    }
    window.addEventListener("keydown", ouvir);
    return () => window.removeEventListener("keydown", ouvir);
  }, [ferramentasDisponiveis, desfazer, refazer, trocarFerramenta]);

  // Ferramenta ativa some da barra (ex.: papel mudou) — nunca fica presa numa ferramenta invisível. Passa por `trocarFerramenta` como qualquer outra troca — nunca um `setFerramenta` divergente.
  useEffect(() => { if (!ferramentasDisponiveis.includes(ferramenta)) trocarFerramenta("interagir"); }, [ferramentasDisponiveis, ferramenta, trocarFerramenta]);

  // Esc fecha a confirmação de remoção — mesma convenção de todo outro flutuante desta tela.
  useEffect(() => {
    if (!confirmandoRemocao) return;
    function ouvir(e: KeyboardEvent) { if (e.key === "Escape") setConfirmandoRemocao(null); }
    window.addEventListener("keydown", ouvir);
    return () => window.removeEventListener("keydown", ouvir);
  }, [confirmandoRemocao]);

  const clampZoom = useCallback((z: number) => Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z)), []);

  // Zoom pela roda — ancorado no cursor: o ponto do MUNDO que estava
  // sob o cursor continua projetando no mesmo pixel de tela depois da
  // mudança de escala (resolve `pan` junto com `zoom`, não só um dos
  // dois). `deltaNormalizado` já chega resolvido por `MapaHex`
  // (deltaMode + a diferença mouse/trackpad); aqui só o clamp de
  // segurança contra um evento isolado enorme, a escala exponencial e
  // os limites de zoom.
  const onWheelZoom = useCallback((deltaNormalizado: number, pontoMundo: { x: number; y: number }) => {
    const deltaLimitado = Math.max(-MAX_DELTA_WHEEL_NORMALIZADO, Math.min(MAX_DELTA_WHEEL_NORMALIZADO, deltaNormalizado));
    const { zoom: zAtual, pan: panAtual } = zoomPanRef.current;
    const novoZoom = clampZoom(zAtual * Math.exp(-deltaLimitado * SENSIBILIDADE_ZOOM));
    if (novoZoom === zAtual) return;
    const svgX = pontoMundo.x * zAtual + panAtual.x;
    const svgY = pontoMundo.y * zAtual + panAtual.y;
    const novoPan = { x: svgX - pontoMundo.x * novoZoom, y: svgY - pontoMundo.y * novoZoom };
    // Grava no ref JÁ, síncrono — antes de qualquer `setState`. É o que
    // faz a PRÓXIMA chamada desta mesma rajada (que pode acontecer
    // antes de React sequer processar esta) enxergar o zoom/pan
    // atualizados, em vez do valor com que o componente renderizou por
    // último.
    marcarZoomPan(novoZoom, novoPan);
    setZoom(novoZoom);
    setPan(novoPan);
  }, [clampZoom, marcarZoomPan]);

  /**
   * Pan por arrasto (botão direito). Precisa ser ESTÁVEL: era criada
   * inline na prop (`onPan={(dx, dy) => ...}`), uma função NOVA a cada
   * render de `VttClient` — e é dependência do efeito de arrasto em
   * `MapaHex` (junto com `pontoMundo`, que já muda a cada tick de pan).
   * Duas dependências instáveis na mesma listener de `window` durante
   * um arrasto contínuo é o que deixa esse efeito re-inscrevendo a
   * cada frame; estabilizar esta reduz a reinscrição pela metade.
   */
  const onPanMapa = useCallback((dx: number, dy: number) => {
    // Mesma razão do zoom da roda: o arrasto também chega em rajada, e
    // partir do ref (e não do updater funcional) mantém ref e estado
    // contando a MESMA história durante o gesto inteiro.
    const { zoom: z, pan: p } = zoomPanRef.current;
    const novo = { x: p.x + dx, y: p.y + dy };
    marcarZoomPan(z, novo);
    setPan(novo);
  }, [marcarZoomPan]);

  if (carregandoCena) {
    return <div className="rv-mesa rv-mesa--carregando"><Loader2 className="rv-spin" size={28} /><span>Carregando cena…</span></div>;
  }
  if (erroCena) {
    return <div className="rv-mesa rv-mesa--carregando"><span>{erroCena}</span></div>;
  }

  return (
    // `ProvedorMesaDados` subiu pra `CampaignShell`: o Console também
    // rola na mesa, e ele é janela da casca, não do VTT. Aqui fica só
    // o PALCO (`MesaDadosOverlay`, mais abaixo), que é o que desenha.
    <ProvedorJanelasFerramenta campaignId={campaignId} usuarioId={usuarioId}>
    <div className="rv-mesa">
      {/* ═══ ESQUERDA — 4 ferramentas por papel ═══ */}
      <aside ref={ferramentasRef} className="rv-ferramentas" aria-label="Ferramentas do mapa">
        <button type="button" className="rv-ferr-btn rv-ferr-menu" aria-label="Menu da mesa"><Menu size={17} /></button>
        <span className="rv-ferr-sep" />
        {ferramentasDisponiveis.map((id) => {
          const Icone = ICONE_FERRAMENTA[id];
          return (
            <button key={id} type="button" className="rv-ferr-btn" aria-pressed={ferramenta === id}
              // Rodadas em andamento deixam o ícone ACESO mesmo com
              // outra ferramenta ativa: é estado da mesa, não da
              // ferramenta — e é o que responde "tem combate rolando?"
              // sem abrir nada.
              data-ativo={id === "rodadas" && trilha !== null}
              aria-label={id === "rodadas" && trilha
                ? `${ROTULO_FERRAMENTA[id]} (${ATALHO_FERRAMENTA[id]}) — rodada ${trilha.rodada} em andamento`
                : `${ROTULO_FERRAMENTA[id]} (${ATALHO_FERRAMENTA[id]})`}
              onClick={() => trocarFerramenta(id)}>
              <Icone size={17} strokeWidth={1.6} />
              {id === "rodadas" && trilha && <span className="rv-ferr-badge" aria-hidden="true">{trilha.rodada}</span>}
              <span className="rv-dica">
                {ROTULO_FERRAMENTA[id]}
                {id === "rodadas" && trilha ? ` · rodada ${trilha.rodada}` : ""}
                <kbd>{ATALHO_FERRAMENTA[id]}</kbd>
              </span>
            </button>
          );
        })}
        <span className="rv-ferr-sep" />
        <button type="button" className="rv-ferr-btn" aria-label="Desfazer (Ctrl+Z)" disabled={historico.desfazer.length === 0} onClick={desfazer}><Undo2 size={17} /></button>
        <button type="button" className="rv-ferr-btn" aria-label="Refazer (Ctrl+Shift+Z)" disabled={historico.refazer.length === 0} onClick={refazer}><Redo2 size={17} /></button>
        <span className="rv-ferr-sep" />
        {ehNarrador && (
          <button type="button" className="rv-ferr-btn" aria-label="Adicionar token" onClick={() => estadoCena && abrirCriarToken()}>
            <UserPlus size={17} />
          </button>
        )}
        {/* Camadas é decisão de quem conduz a cena: o narrador dita o
            que está no mapa e o que dá pra mexer. Não aparece pro
            jogador — nem o botão, nem a janela.

            `data-tipo="janela"`: os dois botões abaixo ABREM UMA JANELA,
            não trocam a ferramenta do ponteiro. Compartilham `aria-pressed`
            com as ferramentas (os dois são alternáveis), então sem esta
            marca a única forma de distinguir seria pelo rótulo. */}
        {ehNarrador && (
          <button
            ref={botaoCamadasRef} type="button" className="rv-ferr-btn" data-tipo="janela"
            aria-pressed={painelCamadasAberto} aria-label="Camadas do mapa"
            // Ordem importa: `trocarFerramenta` também fecha as janelas
            // de botão, então ele vem ANTES — senão o `false` dele
            // chegaria depois e a janela nunca abriria.
            onClick={() => {
              const abrir = !painelCamadasAberto;
              if (abrir) trocarFerramenta("interagir");
              setPainelCenaAberto(false);
              setPainelCenasAberto(false);
              setPainelCamadasAberto(abrir);
            }}
          ><Layers size={17} /></button>
        )}
        {/* CATÁLOGO DE CENAS — só o narrador. O jogador não tem o botão
            porque não tem o catálogo: `list_vtt_scenes` não conta a ele
            que existem outras cenas, e esconder o botão é só a UI
            concordando com o que o servidor já decidiu. */}
        {ehNarrador && (
          <button
            type="button" className="rv-ferr-btn" data-tipo="janela"
            aria-pressed={painelCenasAberto} aria-label="Catálogo de cenas"
            data-testid="barra-cenas"
            onClick={() => {
              const abrir = !painelCenasAberto;
              if (abrir) trocarFerramenta("interagir");
              setPainelCamadasAberto(false);
              setPainelCenaAberto(false);
              setPainelCenasAberto(abrir);
            }}
          ><Clapperboard size={17} /></button>
        )}
        {/* Configurar a cena é do narrador — nome, local e tamanho da
            grade valem pra mesa inteira. O botão ficou sem `onClick`
            desde que existe; agora abre a janela. */}
        {ehNarrador && (
          <button
            type="button" className="rv-ferr-btn" data-tipo="janela"
            aria-pressed={painelCenaAberto} aria-label="Configurações da cena"
            onClick={() => {
              const abrir = !painelCenaAberto;
              if (abrir) trocarFerramenta("interagir");
              setPainelCamadasAberto(false);
              setPainelCenasAberto(false);
              setPainelCenaAberto(abrir);
            }}
          >
            <Settings size={17} />
          </button>
        )}
      </aside>

      {/* ═══ PALCO — mapa em tela cheia, tudo flutua por cima ═══ */}
      <main className="rv-palco" ref={palcoRef} data-arrastando-arquivo={arrastandoArquivo || undefined}>
        {/* O contêiner do mapa é quem recebe o arrasto vindo do painel
            (`dragover`/`drop` não chegam dentro do `<svg>`). Só reage
            ao MIME do diretório de personagens — arrastar qualquer
            outra coisa por cima do mapa continua inerte, e o gesto
            nunca vira pan nem seleção (o HTML5 drag não emite
            `pointerdown`). */}
        <div
          className="rv-mapa-camada"
          data-arrastando-personagem={arrastandoPersonagem ? "true" : undefined}
          onDragOver={aoArrastarSobreMapa}
          onDragLeave={() => setArrastandoPersonagem(false)}
          onDrop={aoSoltarNoMapa}
        >
          <MapaHex
            cena={cenaExibida} zoom={zoom} pan={pan}
            selecionadoId={selecionadoId} hoverId={hoverId} alvoIds={[]}
            estadoPorToken={estadoPorToken}
            ancoraPonteiroRef={ancoraPonteiroRef}
            conversorPontoRef={conversorPontoRef}
            imagensCena={imgs.imagens}
            urlsImagens={imgs.urls}
            imagemSelecionadaId={imgs.selecionadaId}
            onSelecionarImagem={imgs.setSelecionadaId}
            onMoverImagem={(id, q, r) => { void imgs.mover(id, q, r); }}
            onEscalarImagem={(id, larguraM, centro) => { void imgs.escalar(id, larguraM, centro); }}
            onRotacionarImagem={(id, graus) => { void imgs.rotacionar(id, graus); }}
            celulasRealce={ferramenta === "objetos" ? celulasObjetoPendente : []}
            tipoRealce={ferramenta === "objetos" ? "objeto" : null}
            onSelecionarToken={onSelecionarToken} onHoverToken={setHoverId}
            terrenoReal={terrenoReal}
            ferramenta={ferramenta}
            podeMoverToken={podeMoverToken}
            onSoltarToken={onSoltarToken}
            onPressCelula={onPressCelula}
            onEntrarCelulaPintando={onEntrarCelulaPintando}
            onClicarCelula={onClicarCelula}
            onSelecionarCaixa={onSelecionarCaixa}
            onSelecionarObjeto={selecionarObjetoNoMapa}
            objetoEmMovimentoId={objetoMovendoId}
            onMedicaoMudou={setResumoMedicao}
            modoMedicao={modoMedicao}
            onMedicaoConcluida={persistirMedicao}
            medicoesPermanentes={medicoesParaMapa}
            onApagarMedicao={apagarMedicao}
            // Prévia só no PINCEL: o balde depende de flood-fill da
            // região contígua, que muda conforme o terreno já pintado —
            // pré-calcular isso a cada célula sob o cursor seria caro e,
            // num mapa aberto, acenderia o mapa inteiro.
            previaPincelRaio={
              ferramenta === "terreno" && ehNarrador && modoPincelTerreno === "pincel"
                ? raioPincelTerreno
                : null
            }
            marcas={marcasExibidas}
            onClicarMarca={onClicarMarca}
            onPan={onPanMapa}
            onWheelZoom={onWheelZoom}
            movimentosVisuais={movimentosVisuais}
            onAnimacaoConcluida={onAnimacaoConcluida}
            pingsExibidos={pingsExibidos}
            onPingCelula={onPingCelula}
            onMenuContextual={onAbrirMenuContextual}
            posicionamentoToken={posicionamentoTokenProp}
            onMoverPosicionamento={moverPosicionamento}
            onConfirmarPosicionamento={confirmarPosicionamento}
            camadas={camadas}
          verCamadasOcultas={ehNarrador}
            contagemSelecionada={selecionadosIds.size}
            onRotacaoAlcaSolta={onRotacaoAlcaSolta}
            onRotacaoAlcaPasso={onRotacionarToken}
            areas={areasDesenhaveis}
            areasGuia={guiaAreaAtual}
            areasCandidatoSnap={candidatoSnapPonto}
            areasEscolhendoToken={estadoAreas.fase === "escolhendo_token_da_aura"}
            areasAncoraAcoes={ancoraAcoesArea}
            onAncoraAcoesTela={setAncoraAcoesTela}
            onConversorEdicaoRapidaTela={setConversorEdicaoRapidaTela}
            onConversorHexDaTela={guardarConversorHex}
            areasParaHover={areasParaHover}
            onHoverAreaEditavel={setHoverAreaId}
            areasInteracao={ferramenta === "areas" ? {
              ativa: true,
              contornosSelecionaveis,
              onPressionar: areaPressionar,
              onMover: areaMover,
              onSoltar: areaSoltar,
              onCancelarGesto: areaCancelarGesto,
              onSelecionar: setAreaSelecionadaId,
              onCandidatoSelecao: (id: string) => { candidatoSelecaoRef.current = id; },
            } : null}
            areasAlcas={alcasAreas}
            onAreaAlcaMover={areaAlcaMover}
            onAreaAlcaSoltar={() => {}}
            onAreaAlcaCancelar={() => {}}
          />
        </div>

        {/* cabeçalho sobreposto, pequeno — nome/local SEMPRE da cena persistida. */}
        <header className="rv-cena">
          <span className="rv-eyebrow">Cena ativa</span>
          <h1 className="rv-hud-cena-nome">{estadoCena?.cena.nome}</h1>
          {estadoCena?.cena.local && <p className="rv-hud-cena-local">{estadoCena.cena.local}</p>}
        </header>

        {ferramenta === "terreno" && ehNarrador && (
          <PainelTerreno
            modoTerreno={modoTerreno}
            onModoTerreno={setModoTerreno}
            modoPincel={modoPincelTerreno}
            onModoPincel={setModoPincelTerreno}
            raioPincel={raioPincelTerreno}
            onRaioPincel={setRaioPincelTerreno}
            contagemGesto={contagemGestoTerreno}
            celulasUltimoGesto={ultimoGestoTerrenoCelulas?.length ?? 0}
            onConverterEmObjeto={converterGestoEmObjeto}
            onFechar={() => trocarFerramenta("interagir")}
          />
        )}
        {ferramenta === "objetos" && ehNarrador && (
          <PainelObjetos
            presetObjeto={presetObjeto}
            onPresetObjeto={setPresetObjeto}
            celulasPendentes={celulasObjetoPendente.length}
            criando={criandoObjeto}
            onCriar={criarObjetoPendente}
            onCancelarSelecao={cancelarObjetoPendente}
            objetoSelecionado={estadoCena?.objetos.find((o) => o.id === objetoSelecionadoId) ?? null}
            objetoMovendo={estadoCena?.objetos.find((o) => o.id === objetoMovendoId) ?? null}
            movendo={movendoObjeto}
            onConfirmarMover={confirmarMoverObjeto}
            onIniciarMover={iniciarMoverObjetoSelecionado}
            onDesmarcar={() => setObjetoSelecionadoId(null)}
            rascunho={rascunhoEdicaoObjeto}
            onRascunho={(patch) => setRascunhoEdicaoObjeto((r) => (r ? patch(r) : r))}
            salvandoEdicao={salvandoEdicaoObjeto}
            onIniciarEdicao={iniciarEdicaoObjetoSelecionado}
            onSalvarEdicao={salvarEdicaoObjeto}
            onCancelarEdicao={cancelarEdicaoObjeto}
            onAlternarTravamento={alternarTravamentoObjetoSelecionado}
            deltaPd={deltaPdObjeto}
            onDeltaPd={setDeltaPdObjeto}
            aplicandoDano={aplicandoDanoObjeto}
            onAplicarDano={aplicarDanoObjetoSelecionado}
            onVirarEntulho={virarEntulhoObjetoSelecionado}
            excluindo={excluindoObjeto}
            onExcluir={excluirObjetoSelecionado}
            onFechar={() => trocarFerramenta("interagir")}
          />
        )}
        {ferramenta === "imagens" && ehNarrador && (
          <PainelImagens
            imagens={imgs.imagens}
            urlsAssinadas={imgs.urls}
            selecionadaId={imgs.selecionadaId}
            onSelecionar={imgs.setSelecionadaId}
            onAlternarVisivel={(img) => { void imgs.ajustar(img, { visivel: !img.visivel }); }}
            onAlternarTravado={(img) => { void imgs.ajustar(img, { travado: !img.travado }); }}
            onMudarOrdem={(img, delta) => { void imgs.mudarOrdem(img, delta); }}
            onRemover={removerImagem}
            onAjustar={(img, ajuste) => { void imgs.ajustar(img, ajuste); }}
            onEnviarArquivo={escolherArquivoDeImagem}
            onAbrirBiblioteca={() => { setBibliotecaAberta(true); void imgs.carregarBiblioteca(); }}
            onFechar={() => trocarFerramenta("interagir")}
          />
        )}
        {/* BIBLIOTECA — recolocar um arquivo que a campanha já tem, sem
            upload nenhum. Fica fora do painel (e não dentro dele)
            porque é uma grade de miniaturas: na coluna de 400px ela
            caberia com duas por linha e viraria uma lista. */}
        {ferramenta === "imagens" && ehNarrador && bibliotecaAberta && (
          <BibliotecaImagens
            imagens={imgs.biblioteca}
            carregando={imgs.carregandoBiblioteca}
            urls={imgs.urls}
            jaTemFundo={imgs.jaTemFundo}
            ocupado={imgs.ocupado}
            onColocar={(img, papel) => {
              // Sem gesto no mapa, o tile nasce no CENTRO da cena — o
              // mesmo lugar onde o fundo nasceria. Arrastar depois é um
              // gesto; adivinhar um canto não é.
              const centro = {
                q: Math.round((estadoCena?.cena.largura ?? 1) / 2) - 1,
                r: Math.round((estadoCena?.cena.altura ?? 1) / 2) - 1,
              };
              void imgs.colocarDaBiblioteca(img, papel, centro);
              setBibliotecaAberta(false);
            }}
            onExcluir={(img) => { void imgs.excluirDaBiblioteca(img); }}
            erro={imgs.erro}
            onFechar={() => setBibliotecaAberta(false)}
          />
        )}
        {/* Input fora da tela, dono do gesto "Enviar arquivo…". Fica
            aqui e não dentro do painel porque o painel é apresentação
            pura, e porque colar/soltar/escolher precisam terminar no
            mesmo lugar. `value = ""` a cada escolha: sem isso, escolher
            o MESMO arquivo duas vezes seguidas não dispara `change`. */}
        <input
          ref={inputImagemRef} type="file" accept="image/png,image/jpeg,image/webp"
          hidden aria-hidden="true" tabIndex={-1}
          onChange={(e) => {
            const arquivo = e.target.files?.[0];
            e.target.value = "";
            if (arquivo) void imgs.prepararArquivo(arquivo, ancoraParaImagem());
          }}
        />
        {/* Realce de "pode soltar aqui". Um alvo de drop invisível é um
            alvo que ninguém encontra. */}
        {arrastandoArquivo && (
          <div className="rv-arrastando-imagem" aria-hidden>
            <span>Solte para colocar na cena</span>
          </div>
        )}
        {imgs.pendente && (
          <ColocarImagem
            preparada={imgs.pendente.preparada}
            larguraCena={estadoCena?.cena.largura ?? 0}
            jaTemFundo={imgs.jaTemFundo}
            ocupado={imgs.ocupado}
            erro={imgs.erro}
            onConfirmar={(papel) => { void imgs.confirmarColocacao(papel); }}
            onCancelar={imgs.cancelarPendente}
          />
        )}
        {ferramenta === "medir" && (
          <PainelMedir
            modo={modoMedicao}
            onModo={setModoMedicao}
            resumo={resumoMedicao}
            dobras={resumoMedicao?.dobras ?? 0}
            permanentesNaCena={medicoes.length}
            permanentesQuePodeLimpar={medicoesQuePodeLimpar}
            limpando={limpandoMedicoes}
            onLimpar={limparMedicoes}
            onFechar={() => trocarFerramenta("interagir")}
          />
        )}
        {ferramenta === "dados" && (
          <PainelDados onFechar={() => trocarFerramenta("interagir")} campaignId={campaignId} personagemSugerido={personagemDoTokenSelecionado} />
        )}
        {ferramenta === "marcar" && (
          <PainelMarcar
            sinal={sinalMarca} onSinal={setSinalMarca}
            duracao={duracaoMarca} onDuracao={setDuracaoMarca}
            emCombate={trilha !== null}
            cor={corMarca} onCor={setCorMarca}
            texto={textoMarca} onTexto={setTextoMarca}
            privada={marcaPrivada} onPrivada={setMarcaPrivada}
            naCena={estadoCena?.marcas.length ?? 0}
            quePodeLimpar={marcasQuePossoApagar.length}
            limpando={limpandoMarcas}
            onLimpar={() => void limparMinhasMarcas()}
            ehNarrador={ehNarrador}
            onFechar={() => trocarFerramenta("interagir")}
          />
        )}
        {ferramenta === "areas" && (
          <PainelAreas
            config={configAreas}
            onConfig={ajustarConfigAreas}
            estado={estadoAreas}
            paramsAtuais={paramsAreaCorrente}
            onAlterarParams={(novo) => setEstadoAreas((e) => alterarParametros(e, novo))}
            resumo={resumoAreaCorrente}
            tokens={tokensApresentacao.filter((t) => t.visivel).map((t) => ({ id: t.id, nome: t.nome, sigla: t.sigla }))}
            areas={itensListaAreas}
            selecionadaId={areaSelecionadaId}
            onSelecionar={setAreaSelecionadaId}
            onLocalizar={localizarArea}
            onDescartar={descartarArea}
            onManter={() => { void manterAreaNaMesa(); }}
            onConcluirPontos={concluirPontosArea}
            onDesfazerPonto={desfazerPontoArea}
            onEscolherTokenAura={escolherTokenAuraNoMapa}
            onFecharFerramenta={() => trocarFerramenta("interagir")}
            recolhido={prefsAreas.painelRecolhido}
            onAlternarRecolhido={() => atualizarPrefsAreas({ painelRecolhido: !prefsAreas.painelRecolhido })}
            aparenciaAberta={prefsAreas.aparenciaAberta}
            onAlternarAparencia={() => atualizarPrefsAreas({ aparenciaAberta: !prefsAreas.aparenciaAberta })}
            motivoNaoConclui={estadoAreas.fase === "pontos" ? (podeConcluirPontos(estadoAreas).motivo ?? null) : null}
            onEditar={editarArea}
            onSalvarEdicao={() => { void manterAreaNaMesa(); }}
            onCancelarEdicao={cancelarEdicaoArea}
            onDuplicar={(id) => { void duplicarAreaHandler(id); }}
            onExcluir={(id) => { void excluirAreaHandler(id); }}
            onAlternarVisibilidade={(id) => { void alternarVisibilidadeArea(id); }}
            erro={erroAreas}
          />
        )}

        {/* Botões CONTEXTUAIS ao lado da própria geometria — o caminho
            principal de confirmar/descartar. MESMO comportamento
            editando uma área persistida: rótulos viram Salvar/
            Cancelar, e `onDescartar` usa `cancelarEdicaoArea` (sai da
            edição de vez), nunca `descartarArea` (que, em "editando",
            só restaura os últimos valores confirmados e continua
            editando — certo pro Esc no meio de um arrasto, errado pro
            botão "Cancelar"). O rodapé do painel continua existindo
            como alternativa de teclado. */}
        {(ferramenta === "areas" || estadoAreas.fase === "editando") && (
          <AcoesAreaFlutuantes
            ancoraTela={ancoraAcoesTela}
            onManter={() => { void manterAreaNaMesa(); }}
            onDescartar={estadoAreas.fase === "editando" ? cancelarEdicaoArea : descartarArea}
            persistindo={estadoAreas.fase === "persistindo"}
            erro={estadoAreas.fase === "erro" ? estadoAreas.mensagem : null}
            editando={estadoAreas.fase === "editando"}
            medida={paramsAreaCorrente ? reguaDosParametros(paramsAreaCorrente, TAM) : null}
          />
        )}

        {/* Atalho de edição rápida — direto no mapa, junto de CADA área
            candidata (seleção e hover são independentes: uma área
            selecionada e outra em hover mostram DOIS lápis, cada um na
            própria âncora). Só renderiza pra quem PODE editar — a
            ausência do botão É a própria política de visibilidade. */}
        {[...idsExibidosEdicaoRapida].map((id) => (
          <BotaoEdicaoRapidaArea
            key={id}
            posTela={posicoesEdicaoRapida.get(id) ?? null}
            areaId={id}
            onEditar={() => editarAreaRapido(id)}
            onInteragir={(ativo) => setIdBotaoComHover((cur) => (ativo ? id : (cur === id ? null : cur)))}
            onFoco={(ativo) => setIdBotaoComFoco((cur) => (ativo ? id : (cur === id ? null : cur)))}
          />
        ))}

        {erroAcao && (
          <div className="rv-flutuante rv-erro-acao" role="alert" onClick={() => setErroAcao(null)}>
            {erroAcao}
          </div>
        )}

        {/* A mesa mudou de cena sob os pés de quem está jogando. Não é
            erro — é a narração acontecendo —, então tem a forma do
            aviso e não a do alerta, e `role="status"` pra ser anunciado
            sem interromper o que o leitor de tela estava dizendo. */}
        {avisoPalco && (
          <div
            className="rv-flutuante rv-aviso-palco" role="status" aria-live="polite"
            data-testid="aviso-palco" onClick={() => setAvisoPalco(null)}
          >
            {avisoPalco}
          </div>
        )}

        <div className="rv-zoom" role="group" aria-label="Zoom">
          <button type="button" onClick={() => setZoom((z) => clampZoom(+(z + 0.15).toFixed(2)))} aria-label="Aproximar"><Plus size={14} /></button>
          <span>{Math.round(zoom * 100)}%</span>
          <button type="button" onClick={() => setZoom((z) => clampZoom(+(z - 0.15).toFixed(2)))} aria-label="Afastar"><Minus size={14} /></button>
        </div>

        {/* ── TRILHA — núcleo no topo + trilhos das duas facções nas
            laterais (ver `_turnos/TrilhaFaccoes.tsx`). Só existe com
            combate aberto; `trilhaOculta` é escolha LOCAL de quem está
            vendo e não encerra nada. ── */}
        {trilha && !trilhaOculta && (
          <TrilhaFaccoes
            trilha={trilha} ehNarrador={ehNarrador} tokenPorId={tokenPorId} selecionadoId={selecionadoId}
            onDeclarar={(id, janela) => mutarTrilha((t) => declarar(t, id, janela))}
            onAssumir={(id) => mutarTrilha((t) => assumirTurno(t, id))}
            onConcluir={(pa) => mutarTrilha((t) => concluirTurno(t, pa))}
            onEncerrar={(id) => mutarTrilha((t) => encerrarParticipacao(t, id))}
            onAvancarJanela={() => mutarTrilha((t) => avancarParaLentos(t))}
            onProximaRodada={() => mutarTrilha((t) => proximaRodada(t))}
            onFocar={focarToken}
          />
        )}

        {ferramenta === "rodadas" && (
          <PainelRodadas
            ehNarrador={ehNarrador}
            tokens={tokensApresentacao}
            trilha={trilha}
            oculta={trilhaOculta}
            ocupado={trilhaOcupada}
            erro={erroTrilha}
            onIniciar={iniciarRodadas}
            onEncerrar={encerrarRodadas}
            onAdicionar={(ids) => mutarTrilha((t) => adicionarParticipantes(t, tokensApresentacao.filter((tok) => ids.includes(tok.id))))}
            onRemover={(id) => mutarTrilha((t) => removerParticipante(t, id))}
            onAlternarIncapaz={(id, incapaz) => mutarTrilha((t) => definirIncapaz(t, id, incapaz ? "Marcado como incapaz pelo narrador" : null))}
            onEncerrarParticipacao={(id) => mutarTrilha((t) => encerrarParticipacao(t, id))}
            onAlternarOculta={alternarTrilhaOculta}
            onFechar={() => trocarFerramenta("interagir")}
          />
        )}

        {/* ── HUD persistente da seleção, separado da trilha ── */}
        {tokenDoHud && (
          <SelectedTokenHud
            key={tokenDoHud.id}
            campaignId={campaignId}
            token={tokenDoHud}
            invalidationKey={hudInvalidationKey}
            rules={hudRules}
            reactionRules={hudReactionRules}
            talents={hudTalents}
            conditions={hudConditions}
            canUndo={historico.desfazer.length > 0}
            canRedo={historico.refazer.length > 0}
            onUndo={desfazer}
            onRedo={refazer}
            onRotate={(direction) => onRotacionarToken(tokenDoHud.id, direction)}
          />
        )}

        {painelCenaAberto && ehNarrador && estadoCena && (
          <PainelCena
            valoresIniciais={valoresCena}
            foraDaGrade={pecasForaDaGrade}
            salvando={salvandoCena}
            erro={erroConfigCena}
            onSalvar={(v) => void salvarCena(v)}
            onMudarTamanho={(largura, altura) => setTamanhoEmEdicao({ largura, altura })}
            onFechar={() => { setPainelCenaAberto(false); setTamanhoEmEdicao(null); setErroConfigCena(null); }}
          />
        )}

        {/* CATÁLOGO. `versaoExterna` é a revisão da cena ABERTA: quando
            ela muda, foi `set_vtt_scene_config` (renomear pela janela de
            Configurações, ou camadas) — e o cartão dela no catálogo
            acabou de ficar velho. Os movimentos de token não passam por
            ali, então isto não relê a cada gesto do mapa. */}
        {painelCenasAberto && ehNarrador && (
          <GerenciadorCenas
            campaignId={campaignId}
            cenaVistaId={estadoCena?.cena.id ?? null}
            palcoRevision={cenaApresentadaRef.current?.revision ?? null}
            cenaApresentadaId={cenaApresentadaRef.current?.sceneId ?? null}
            onCenaSaiuDeUso={aoCenaSairDeUso}
            // Duas origens de "o catálogo envelheceu": a config da cena
            // aberta (renomear/camadas) e o palco tendo andado. Somadas
            // num número só porque a reação é a mesma — reler.
            versaoExterna={(estadoCena?.cena.revision ?? 0) + versaoPalco}
            onAbrir={abrirCena}
            onFechar={() => setPainelCenasAberto(false)}
          />
        )}

        {/* Camadas é uma JANELA do palco, como as ferramentas — e
            precisa estar dentro dele: `ancoraPadraoJanela` devolve
            coordenadas RELATIVAS a `.rv-palco` (é onde `.rv-flutuante`
            se posiciona). Renderizada fora, a mesma conta punha a
            janela por cima da barra de ferramentas. */}
        <PainelCamadas
          aberto={painelCamadasAberto && ehNarrador} camadas={camadas}
          onAlternarVisivel={alternarVisivelCamada} onAlternarBloqueio={alternarBloqueioCamada}
          erro={erroCamadas}
          onRestaurarPadrao={restaurarCamadasPadrao} onFechar={() => setPainelCamadasAberto(false)}
          botaoRef={botaoCamadasRef}
        />

        {/* Os dados caem AQUI — sobre o palco inteiro, não numa janela.
            `.rv-palco` já é `position: relative; overflow: hidden`, o
            recorte natural pro overlay: nunca vaza por cima da barra de
            ferramentas nem do painel lateral. */}
        <MesaDadosOverlay zoomMapa={zoom} />
      </main>

      {/* ═══ DIREITA — painel da sessão (Chat/Personagens/Participantes/
           Bando/Compêndio). A moldura e as cinco abas vivem em
           `_painel/`; aqui só entra o que é do MAPA: a identidade do
           token selecionado (autoria do Chat) e o início do fluxo
           canônico de criação de token a partir de um personagem. ═══ */}
      <PainelVtt
        campaignId={campaignId}
        usuarioId={usuarioId}
        ehNarrador={ehNarrador}
        personagemDoTokenSelecionado={personagemDoTokenSelecionado}
        onAdicionarPersonagemACena={iniciarTokenDePersonagem}
        onFocarToken={focarTokenPeloPainel}
      />

      <MenuContextual
        posicao={menuContextual ? { x: menuContextual.clientX, y: menuContextual.clientY } : null}
        itens={itensMenuContextual()}
        onFechar={fecharMenuContextual}
        /* A espinha diz sobre O QUE é o menu (mapa ou token) e o
           cabeçalho diz QUAL — o nome do token ou a coordenada do hex. */
        codigo={menuContextual?.tokenId ? "Token" : "Célula"}
        alvo={menuContextual
          ? (menuContextual.tokenId ? tokenPorId.get(menuContextual.tokenId)?.nome : undefined)
            ?? `${menuContextual.hex.q}, ${menuContextual.hex.r}`
          : undefined}
      />

      {estadoCena && fluxoToken?.fase === "configurando" && (
        <GerenciadorToken
          aberto modo={fluxoToken.modo} valoresIniciais={fluxoToken.valoresIniciais}
          personagens={personagensNarrador}
          largura={estadoCena.cena.largura} altura={estadoCena.cena.altura} terrenoReal={terrenoReal}
          ocupadosPorOutros={ocupadosPorOutros}
          onConfirmarEdicao={confirmarEdicaoToken}
          onContinuarParaPosicionar={iniciarPosicionamento}
          onFechar={fecharGerenciador}
        />
      )}

      {/* ── Posicionamento de token novo — aviso pequeno, não-bloqueante
          (nunca `.rv-modal-fundo`: cliques no mapa/trilho continuam
          passando, só a célula clicada é interceptada por
          `MapaHex.posicionamentoToken`). ── */}
      {fluxoToken && (fluxoToken.fase === "posicionando" || fluxoToken.fase === "enviando" || fluxoToken.fase === "erro") && (
        <div className="rv-escolha-posicao" role="status" aria-live="polite" data-fase={fluxoToken.fase}>
          {fluxoToken.fase === "erro" ? (
            <span role="alert">{fluxoToken.mensagem} Escolha outra posição ou tente de novo.</span>
          ) : (
            <span>
              {fluxoToken.rascunho.nome.trim()
                ? <>Escolha uma posição para <strong>{fluxoToken.rascunho.nome}</strong>.</>
                : "Escolha uma posição para o novo token."}
              {" "}Clique para confirmar. Esc para cancelar. Q/E para girar.
            </span>
          )}
          <div className="rv-escolha-posicao-acoes">
            <button type="button" className="rv-btn rv-btn--ghost" onClick={voltarParaEditarToken} disabled={fluxoToken.fase === "enviando"}>Voltar para editar</button>
            <button type="button" className="rv-btn rv-btn--ghost" onClick={cancelarPosicionamento} disabled={fluxoToken.fase === "enviando"}>Cancelar (Esc)</button>
          </div>
        </div>
      )}

      {confirmandoRemocao && (
        <div className="rv-modal-fundo" role="presentation" onClick={(e) => { if (e.target === e.currentTarget) setConfirmandoRemocao(null); }}>
          <div className="rv-modal rv-modal--confirmar" role="alertdialog" aria-modal="true" aria-label={`Remover ${confirmandoRemocao.nome}`}>
            <header className="rv-modal-cab">
              <h2>Remover token</h2>
              <button type="button" className="rv-modal-fechar" aria-label="Fechar" onClick={() => setConfirmandoRemocao(null)}>×</button>
            </header>
            <div className="rv-modal-corpo">
              <p>Remover <strong>{confirmandoRemocao.nome}</strong> da cena? Esta ação não pode ser desfeita.</p>
            </div>
            <footer className="rv-modal-rodape">
              <button type="button" className="rv-btn rv-btn--ghost" onClick={() => setConfirmandoRemocao(null)}>Cancelar</button>
              <button type="button" className="rv-btn rv-btn--perigo" onClick={() => { const t = confirmandoRemocao; setConfirmandoRemocao(null); removerTokenHandler(t.id); }}>
                Remover
              </button>
            </footer>
          </div>
        </div>
      )}
    </div>
    </ProvedorJanelasFerramenta>
  );
}
