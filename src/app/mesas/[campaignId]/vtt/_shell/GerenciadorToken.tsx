"use client";

/**
 * Formulário de configurar token — narrador-only, chamado pelo menu
 * contextual (`_shell/MenuContextual.tsx`). Um componente só pros dois
 * modos (`modo: "criar" | "editar"`) porque os campos são os mesmos; o
 * que muda é o que acontece ao confirmar.
 *
 * POSIÇÃO E ORIENTAÇÃO NÃO EXISTEM NESTE FORMULÁRIO — nem como campo,
 * nem como preview projetado no mapa, nem como ação de "escolher
 * posição". O fluxo de criação é em DUAS ETAPAS, e a divisão é
 * estrutural, não visual:
 *
 *   1. Este componente (fase "configurando"): só as PROPRIEDADES do
 *      token. O preview aqui é só a FORMA abstrata da pegada (offsets
 *      centralizados, âncora em destaque) — nunca projetado sobre o
 *      mapa real, nunca sabe de terreno/colisão/bordas. Confirmar
 *      ("Continuar para posicionar") NUNCA chama `create_vtt_token` —
 *      só valida os campos e devolve um rascunho pra quem chama
 *      (`VttClient.tsx`).
 *   2. `VttClient.tsx` (fases "posicionando"/"enviando"/"erro"): o
 *      narrador escolhe a âncora e a orientação DIRETO no mapa (um
 *      fantasma segue o cursor, `_mapa/MapaHex.tsx`); só então a RPC é
 *      chamada, com a âncora confirmada.
 *
 * Editar É DIFERENTE: nunca entra na fase de posicionamento. Alterar
 * nome/sigla/PV/imagem/condição salva na hora, como sempre; a única
 * pegada nova é ao MUDAR TAMANHO, que é revalidada contra a posição e
 * orientação ATUAIS (nunca mostradas, nunca alteradas por aqui) — se
 * não couber, a troca é recusada com uma mensagem, sem mover nem girar
 * o token sozinho. Reposicionar/rotacionar um token existente continua
 * fora deste componente: arrasto no mapa e menu contextual,
 * respectivamente — nenhum dos dois muda aqui.
 *
 * SEM editor de pegada personalizada — só os 5 presets de
 * `_dominio/pegada.ts`. Todo cálculo de forma/rotação/ocupação vem
 * DAQUELE módulo — nunca reimplementado aqui.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ImageUp, X } from "lucide-react";
import { type Hex, TAMANHOS, type TamanhoCriatura, hexParaPixel, hexPath } from "../_mapa/hex";
import { type CondicaoSlug, CONDICOES } from "../_dados/cenaDemo";
import { type MapaTerreno, dentroDoMapa, pegadaBloqueada } from "../_dominio/movimento";
import { pegadaEfetiva, projetarPegada, pegadasSobrepoem } from "../_dominio/pegada";
import { type LadoToken, type VertenteToken } from "../_dominio/tokenApresentacao";
import { GAP_LATERAL } from "../_ferramentas/janelasPreferencias";
import { prepararRecorteQuadrado, type ImagemPreparada } from "../../../../../lib/vtt/imagePreparation";
import { JanelaRecorte } from "../../../../ficha/_console/RecorteImagem";

export interface ValoresFormularioToken {
  nome: string;
  sigla: string;
  lado: LadoToken;
  vertente: VertenteToken;
  tamanho: TamanhoCriatura;
  /** Só tem sentido no modo EDITAR (orientação atual do token, preservada). No modo criar é sempre 0 aqui — a orientação real de criação vive no estado de posicionamento de `VttClient.tsx`, fora deste formulário. */
  orientacao: number;
  /** Idem: só o modo editar usa isto (posição atual, preservada, nunca editável). No modo criar, placeholder — a âncora real vem do posicionamento, não deste objeto. */
  q: number;
  r: number;
  characterId: string | null;
  visivel: boolean;
  bloqueado: boolean;
  retratoUrl: string | null;
  pvAtual: number | null;
  pvMax: number | null;
  /**
   * ARQUIVO DE RETRATO escolhido na CRIAÇÃO, ainda não enviado.
   *
   * O upload precisa de um `tokenId` — a RPC liga o arquivo a um token
   * que já existe —, e na criação ele ainda não foi criado. Então o
   * recorte fica aqui, em memória, e quem envia é o `VttClient` depois
   * que `create_vtt_token` devolve o id. Nunca chega ao servidor por
   * este objeto: ele morre com o formulário se a criação for cancelada,
   * sem cota reservada nem arquivo órfão.
   */
  retratoArquivo: ImagemPreparada | null;
  /** PE e Mana PRÓPRIOS do token (migration 0133) — só valem sem ficha vinculada. */
  peAtual: number | null;
  peMax: number | null;
  manaAtual: number | null;
  manaMax: number | null;
  condicoes: CondicaoSlug[];
}

const CATEGORIAS: TamanhoCriatura[] = ["pequeno", "medio", "grande", "enorme", "colossal"];
/**
 * Os três recursos que um token SEM ficha guarda por conta própria
 * (migration 0133). Com ficha vinculada, os números são os da ficha
 * canônica e estes campos ficam desabilitados: dois lugares guardando o
 * mesmo PV é a receita de eles discordarem.
 */
const RECURSOS_DO_TOKEN = [
  { chaveAtual: "pvAtual", chaveMax: "pvMax", rotulo: "PV", maxima: false },
  { chaveAtual: "peAtual", chaveMax: "peMax", rotulo: "PE", maxima: false },
  { chaveAtual: "manaAtual", chaveMax: "manaMax", rotulo: "Mana", maxima: true },
] as const;

/** As vertentes na ordem do sistema; a cor de cada uma vive na folha (`--rv-vertente-cor`). */
const VERTENTES: readonly (readonly [VertenteToken, string])[] = [
  ["nenhuma", "Nenhuma"],
  ["somatico", "Somática"],
  ["cognitivo", "Cognitiva"],
  ["material", "Material"],
  ["energetico", "Energética"],
  ["cinetica", "Cinética"],
  ["sinaptica", "Sináptica"],
];

/** Os três lados: valor, rótulo curto (o que aparece na ficha) e o longo (título e prévia). */
const LADOS: readonly (readonly [LadoToken, string, string])[] = [
  ["pj", "PJ", "Personagem jogador"],
  ["pn", "PN", "Personagem do narrador"],
  ["neutro", "Neutro", "Neutro"],
];
const CONDICOES_LISTA = Object.keys(CONDICOES) as CondicaoSlug[];
/**
 * Responde SÓ "a pegada muda de FORMA ao girar" (grande/colossal — as
 * outras três são simétricas: 1 célula ou anel completo, rotacionar não
 * muda nenhuma célula ocupada). NUNCA usar isto como "o token pode
 * girar" — TODO token tem orientação e PODE girar, no posicionamento e
 * já existente; uma pegada simétrica só muda pra qual direção o token
 * aponta, nunca as células. `VttClient.tsx`/`MapaHex.tsx` nunca gateiam
 * a capacidade de girar com esta função — só a usam onde a pergunta
 * real é "a forma muda" (ex.: se vale a pena reafirmar a orientação
 * escolhida como algo que muda ocupação).
 */
const CATEGORIAS_COM_FORMA_VARIAVEL: ReadonlySet<TamanhoCriatura> = new Set(["grande", "colossal"]);
export function tamanhoTemOrientacaoVariavel(tamanho: TamanhoCriatura): boolean {
  return CATEGORIAS_COM_FORMA_VARIAVEL.has(tamanho);
}

const PROTOCOLOS_IMAGEM_PERMITIDOS = ["http:", "https:"];
const TAMANHO_MAXIMO_URL_IMAGEM = 2048;

/** Só usado no modo EDITAR — ao trocar de tamanho, a pegada nova ainda cabe na posição/orientação ATUAIS do token (nunca mostradas/alteradas aqui)? Domínio puro, célula por célula, mesmas 3 regras de sempre — nunca reimplementa geometria. */
function cabeAoRedimensionar(params: {
  tamanho: TamanhoCriatura;
  orientacao: number;
  ancora: Hex;
  largura: number;
  altura: number;
  terreno: MapaTerreno;
  ocupadosPorOutros: ReadonlySet<string>;
}): boolean {
  const pegada = pegadaEfetiva({ categoria: params.tamanho, orientacao: params.orientacao, pegadaPersonalizada: null });
  const celulas = projetarPegada(params.ancora, pegada);
  if (!celulas.every((c) => dentroDoMapa(c, params.largura, params.altura))) return false;
  if (pegadaBloqueada(params.terreno, celulas)) return false;
  const celulasOutros = [...params.ocupadosPorOutros].map((k) => { const [q, r] = k.split(",").map(Number); return { q, r }; });
  if (pegadasSobrepoem(celulas, celulasOutros)) return false;
  return true;
}

/** Sigla sugerida a partir do nome — iniciais de até 3 palavras, ou as 3 primeiras letras de uma palavra só. Nunca "??": um nome vazio sugere vazio mesmo, o campo mostra seu próprio erro. Exportada pra `VttClient.tsx` computar o valor inicial do formulário sem depender do efeito rodar primeiro (evita qualquer piscar de valor). */
export function sugerirSigla(nome: string): string {
  const palavras = nome.trim().split(/\s+/).filter(Boolean);
  if (palavras.length === 0) return "";
  if (palavras.length === 1) return palavras[0].slice(0, 3).toUpperCase();
  return palavras.slice(0, 3).map((p) => p[0]).join("").toUpperCase();
}

/** Valida a URL de imagem — protocolo permitido, tamanho, formato. Nunca aceita `javascript:`/`data:` (execução/payload embutido, nunca uma "imagem já hospedada"). */
function validarUrlImagem(url: string): { ok: boolean; erro: string | null } {
  if (url.length === 0) return { ok: true, erro: null };
  if (url.length > TAMANHO_MAXIMO_URL_IMAGEM) return { ok: false, erro: "Endereço muito longo." };
  let parsed: URL;
  try { parsed = new URL(url); } catch { return { ok: false, erro: "Endereço inválido." }; }
  if (!PROTOCOLOS_IMAGEM_PERMITIDOS.includes(parsed.protocol)) {
    return { ok: false, erro: "Só endereços http:// ou https:// são aceitos." };
  }
  return { ok: true, erro: null };
}

/**
 * `true` se a sigla NÃO deve mais ser auto-sugerida a partir do nome —
 * modo editar sempre (o token já existe, tem sigla própria); modo
 * criar quando a sigla inicial já DIVERGE do que a sugestão geraria a
 * partir do nome inicial (sinal de edição manual preservada num
 * rascunho — "voltar para editar" reabre o formulário com um rascunho
 * que pode ter uma sigla escolhida à mão; sem esta checagem, o efeito
 * de auto-sugestão a sobrescreveria de volta assim que o formulário
 * remonta, porque `siglaEditadaManualmente` nasceria `false` de novo).
 */
function siglaJaEditada(modo: "criar" | "editar", valoresIniciais: ValoresFormularioToken): boolean {
  return modo === "editar" || valoresIniciais.sigla !== sugerirSigla(valoresIniciais.nome);
}

const LARGURA_JANELA_PADRAO = 560;
/**
 * Altura MÍNIMA do cabeçalho que precisa continuar visível quando a
 * janela inteira é mais alta que a viewport (`max-height: calc(100vh -
 * 40px)` do CSS já deveria evitar isso na prática, mas é uma segunda
 * garantia barata) — nunca menos que isto do topo fica alcançável.
 */
const ALTURA_CABECALHO_MINIMA = 52;

/**
 * Mantém a janela INTEIRA dentro da viewport nos dois eixos — não só o
 * cabeçalho. Achado real ao testar: limitar só o topo (deixando `y`
 * chegar perto do fundo da viewport) permitia o RODAPÉ — com os
 * botões Cancelar/Continuar — terminar ABAIXO da área visível numa
 * janela mais alta que a média, tornando os botões inalcançáveis sem a
 * página rolar (que não deveria acontecer, é `position: fixed`). Como
 * o CSS já garante `altura da janela <= viewport - 40px`, sempre existe
 * uma posição em Y que cabe a janela inteira — usa-se ela; só cai pro
 * mínimo do cabeçalho se a janela genuinamente não couber (viewport
 * extremamente baixa).
 */
function limitarPosicaoJanela(
  pos: { x: number; y: number },
  tamanho: { w: number; h: number },
  vp: { w: number; h: number },
): { x: number; y: number } {
  const maxX = Math.max(0, vp.w - tamanho.w);
  const maxY = Math.max(0, vp.h - Math.min(tamanho.h, vp.h - ALTURA_CABECALHO_MINIMA));
  return { x: Math.min(maxX, Math.max(0, pos.x)), y: Math.min(maxY, Math.max(0, pos.y)) };
}

/**
 * Posição + arrasto da janela flutuante — SEM persistência no servidor
 * (pedido explícito: "não precisa sincronizar posição da janela entre
 * usuários"). A posição vive só neste hook, que remonta junto com
 * `GerenciadorToken` a cada abertura (mesmo espírito de `enviando`/
 * `erro`/`siglaEditadaManualmente`, todos locais) — "pode preservar a
 * posição localmente durante a sessão" é permissivo ("pode"), não uma
 * exigência de sobreviver a fechar-e-reabrir; decisão de escopo
 * deliberada pra não precisar levantar este estado pra `VttClient.tsx`
 * só por isso.
 *
 * Mesmo padrão de arrasto de `ficha/_console/useConsoleWindow.ts`
 * (Pointer Events + `setPointerCapture`, listeners presos ao PRÓPRIO
 * alvo do arrasto, nunca em `window`) — não importado diretamente
 * (áreas de console/mesa não compartilham componente por causa do
 * acoplamento de CSS, convenção já estabelecida nesta base), só o
 * mesmo princípio replicado aqui, num hook bem menor (sem resize/
 * maximizar/minimizar — esta janela não precisa disso).
 */
function usePosicaoJanelaFlutuante(aberto: boolean) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const painelRef = useRef<HTMLDivElement>(null);

  // Posição inicial: colada na barra de ferramentas, MESMA folga
  // (`GAP_LATERAL`/`MARGEM_TOPO`) que as cinco janelas de ferramenta
  // usam (`_ferramentas/janelasPreferencias.ts`) — a régua é uma só
  // pra "onde uma janela nasce" neste app, mesmo esta não fazendo
  // parte daquele sistema (é `position: fixed` relativo ao VIEWPORT,
  // não ao palco: um modal de CRUD de token, aberto pelo menu
  // contextual, sem `FerramentaId`, e deliberadamente sem sincronizar
  // posição entre sessões — ver o comentário do hook, acima).
  //
  // Antes abria encostada na borda DIREITA da tela — do lado oposto
  // do menu, obrigando o olhar a atravessar o mapa inteiro toda vez
  // que se cria um token.
  //
  // Só calculada no CLIENTE (depende de `window`/`document`) e só na
  // abertura. O clamp final por `Math.min` é defensivo: em viewport
  // estreito, `barra.right + GAP_LATERAL + largura` poderia passar da
  // borda direita — aqui ela recua o suficiente pra caber, e
  // `limitarPosicaoJanela` (mais abaixo) continua vigiando depois de
  // montada (resize, ou o próprio conteúdo crescendo).
  useEffect(() => {
    if (!aberto || pos) return;
    // CENTRO DA TELA. Esta janela não é uma ferramenta de gesto (as
    // outras nascem coladas na barra porque a mão fica no mapa): é um
    // formulário longo que se preenche do começo ao fim, e o lugar
    // dele é o meio. Encostada na barra ela ficava alta demais, com o
    // rodapé (Continuar/Cancelar) caindo fora da vista.
    const largura = Math.min(LARGURA_JANELA_PADRAO, window.innerWidth - 32);
    const altura = Math.min(window.innerHeight - 32, 680);
    setPos({
      x: Math.max(GAP_LATERAL, Math.round((window.innerWidth - largura) / 2)),
      y: Math.max(GAP_LATERAL, Math.round((window.innerHeight - altura) / 2)),
    });
  }, [aberto, pos]);

  // Fechou — libera a posição, pra próxima abertura recalcular do zero.
  useEffect(() => {
    if (!aberto) setPos(null);
  }, [aberto]);

  // Viewport mudou de tamanho: reposiciona pra continuar alcançável.
  useEffect(() => {
    if (!aberto) return;
    function aoRedimensionar() {
      const el = painelRef.current;
      setPos((atual) => {
        if (!atual || !el) return atual;
        return limitarPosicaoJanela(atual, { w: el.offsetWidth, h: el.offsetHeight }, { w: window.innerWidth, h: window.innerHeight });
      });
    }
    window.addEventListener("resize", aoRedimensionar);
    return () => window.removeEventListener("resize", aoRedimensionar);
  }, [aberto]);

  // A JANELA muda de tamanho por causa do PRÓPRIO conteúdo — "Mais
  // opções" abrindo, um erro de validação aparecendo — sem qualquer
  // resize de viewport. Achado real ao testar: posicionar no topo e
  // depois expandir o formulário o bastante pra encostar no teto de
  // `max-height` empurrava o RODAPÉ (Cancelar/Continuar) pra fora da
  // viewport, sem nada reclampando — o listener de `resize` da janela
  // do NAVEGADOR nunca dispara só porque um `<details>` abriu.
  // `ResizeObserver` observa o próprio painel (não a viewport) e
  // reaplica o mesmo clamp sempre que a altura/largura RENDERIZADA
  // mudar por qualquer motivo.
  useEffect(() => {
    if (!aberto) return;
    const el = painelRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const obs = new ResizeObserver(() => {
      setPos((atual) => {
        if (!atual) return atual;
        return limitarPosicaoJanela(atual, { w: el.offsetWidth, h: el.offsetHeight }, { w: window.innerWidth, h: window.innerHeight });
      });
    });
    obs.observe(el);
    return () => obs.disconnect();
    // `pos === null` (não `pos`): o painel só existe no DOM (só existe
    // `painelRef.current` pra observar) depois que `pos` deixa de ser
    // `null` pela primeira vez — este efeito precisa rodar DE NOVO
    // nesse instante pra pegar o elemento que acabou de montar (na
    // primeira passagem, com `pos` ainda `null`, o componente inteiro
    // devolve `null` e `painelRef.current` é sempre `null`). Depender
    // de `pos` inteiro reconectaria o observer a cada pixel arrastado,
    // à toa — o booleano muda exatamente UMA vez por abertura.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto, pos === null]);

  const iniciarArrasto = useCallback((e: React.PointerEvent<HTMLElement>) => {
    // Nunca inicia arrasto a partir de um controle interativo do
    // cabeçalho (o botão de fechar) — só do próprio cabeçalho.
    if ((e.target as HTMLElement).closest("button, input, select, textarea, a")) return;
    if (e.button !== 0) return;
    const el = painelRef.current;
    if (!el || !pos) return;
    const alvo = e.currentTarget;
    try { alvo.setPointerCapture(e.pointerId); } catch { /* segue sem captura — o arraste ainda funciona via listeners */ }
    const offsetX = e.clientX - pos.x;
    const offsetY = e.clientY - pos.y;

    function mover(ev: PointerEvent) {
      const tamanho = { w: el!.offsetWidth, h: el!.offsetHeight };
      setPos(limitarPosicaoJanela({ x: ev.clientX - offsetX, y: ev.clientY - offsetY }, tamanho, { w: window.innerWidth, h: window.innerHeight }));
    }
    function soltar(ev: PointerEvent) {
      try { alvo.releasePointerCapture(ev.pointerId); } catch { /* já liberado */ }
      alvo.removeEventListener("pointermove", mover);
      alvo.removeEventListener("pointerup", soltar);
      alvo.removeEventListener("pointercancel", soltar);
    }
    // `pointercancel` E perda de captura (perder o dedo/caneta, outro
    // elemento assumir a captura) encerram o gesto com segurança — os
    // mesmos dois listeners cobrem ambos, `soltar` é idempotente.
    alvo.addEventListener("pointermove", mover);
    alvo.addEventListener("pointerup", soltar);
    alvo.addEventListener("pointercancel", soltar);
  }, [pos]);

  return { pos, painelRef, iniciarArrasto };
}

export function GerenciadorToken({
  aberto, modo, valoresIniciais, personagens, largura, altura, terrenoReal, ocupadosPorOutros,
  onConfirmarEdicao, onContinuarParaPosicionar, onFechar,
}: {
  aberto: boolean;
  modo: "criar" | "editar";
  valoresIniciais: ValoresFormularioToken;
  personagens: { id: string; nome: string }[];
  largura: number;
  altura: number;
  terrenoReal: MapaTerreno;
  /** Células (hexKey) ocupadas por OUTROS tokens — nunca inclui o próprio, no modo editar. Só usado pela revalidação de redimensionar (modo editar). */
  ocupadosPorOutros: ReadonlySet<string>;
  /** Só chamado no modo EDITAR — mesma RPC de sempre, sem posição/orientação envolvidas. */
  onConfirmarEdicao: (valores: ValoresFormularioToken) => Promise<{ ok: boolean; erro?: string }>;
  /** Só chamado no modo CRIAR — NUNCA toca a rede; só entrega o rascunho validado pra `VttClient.tsx` iniciar o posicionamento. */
  onContinuarParaPosicionar: (valores: ValoresFormularioToken) => void;
  onFechar: () => void;
}) {
  const [valores, setValores] = useState(valoresIniciais);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [siglaEditadaManualmente, setSiglaEditadaManualmente] = useState(siglaJaEditada(modo, valoresIniciais));
  const [maisOpcoesAberto, setMaisOpcoesAberto] = useState(false);
  const [erroImagem, setErroImagem] = useState<string | null>(null);
  const [imagemCarregando, setImagemCarregando] = useState(false);
  const [imagemFalhou, setImagemFalhou] = useState(false);
  /* O recorte é um PASSO, não uma janela paralela: enquanto ele está
     aberto, o formulário sai de cena — mesma regra do editor de
     retrato. */
  const [arquivoParaRecortar, setArquivoParaRecortar] = useState<File | null>(null);
  const [erroArquivo, setErroArquivo] = useState<string | null>(null);
  const [preparandoArquivo, setPreparandoArquivo] = useState(false);
  const campoArquivoRef = useRef<HTMLInputElement>(null);
  const enviandoRef = useRef(false);

  const primeiroCampoRef = useRef<HTMLInputElement>(null);
  const abridoPorRef = useRef<HTMLElement | null>(null);
  const { pos, painelRef, iniciarArrasto } = usePosicaoJanelaFlutuante(aberto);

  useEffect(() => {
    if (aberto) {
      setValores(valoresIniciais);
      setErro(null);
      setSiglaEditadaManualmente(siglaJaEditada(modo, valoresIniciais));
      // "Mais opções" começa aberta em edição só se algum campo dela já estiver preenchido — economiza um clique sem esconder dado existente.
      setMaisOpcoesAberto(
        modo === "editar" && (
          valoresIniciais.vertente !== "nenhuma" || !!valoresIniciais.retratoUrl
          || valoresIniciais.pvAtual !== null || valoresIniciais.pvMax !== null || valoresIniciais.condicoes.length > 0
        ),
      );
      abridoPorRef.current = document.activeElement as HTMLElement | null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto, valoresIniciais]);

  // Sigla sugerida a partir do nome — só enquanto o usuário não editou a sigla manualmente.
  useEffect(() => {
    if (siglaEditadaManualmente) return;
    setValores((v) => ({ ...v, sigla: sugerirSigla(valores.nome) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valores.nome, siglaEditadaManualmente]);

  // Foco inicial. Mesma armadilha do `ResizeObserver` logo acima: na
  // PRIMEIRA passagem `pos` ainda é `null`, o componente devolve `null`
  // e `primeiroCampoRef.current` nunca existiu — o rAF focava o vazio e
  // o foco ficava parado no botão que abriu a janela. Reagir a `pos`
  // deixar de ser nulo é o que garante que o campo já está no DOM. O
  // booleano (e não `pos` inteiro) muda uma vez só por abertura: usar
  // `pos` refocaria o nome a cada pixel de arrasto da janela.
  useEffect(() => {
    if (aberto && pos) {
      const id = requestAnimationFrame(() => primeiroCampoRef.current?.focus());
      return () => cancelAnimationFrame(id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto, pos === null]);
  // Restauração de foco ao FECHAR — `aberto` nunca vira `false` de
  // verdade (quem chama desmonta o componente inteiro em vez de passar
  // `aberto={false}`, ver `VttClient.tsx`), então a restauração precisa
  // morar no CLEANUP de um efeito de montagem, que roda garantidamente
  // na desmontagem — nunca observando uma transição de prop que não
  // acontece.
  useEffect(() => {
    return () => { abridoPorRef.current?.focus(); };
  }, []);

  const sujo = useMemo(() => JSON.stringify(valores) !== JSON.stringify(valoresIniciais), [valores, valoresIniciais]);

  function pedirFechar() {
    if (sujo && !window.confirm("Descartar as alterações não salvas deste token?")) return;
    onFechar();
  }

  // Esc — SÓ pede fechamento/descarte (via `pedirFechar`, mesma
  // função de X/Cancelar/clique-fora-mas-alcançável). NUNCA prende
  // foco: janela flutuante não-modal, Tab precisa poder sair dela
  // livremente pro trilho/mapa por trás (seção 7 — "remover foco
  // preso", "permitir navegar por Tab para fora da janela").
  useEffect(() => {
    if (!aberto) return;
    function aoTeclar(e: KeyboardEvent) {
      if (e.key === "Escape") { e.preventDefault(); pedirFechar(); }
    }
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto, sujo]);

  if (!aberto) return null;

  // Validação de imagem, reativa ao valor atual.
  const validacaoImagem = validarUrlImagem(valores.retratoUrl ?? "");
  /* A mesma regra vale pros três: atual não passa do máximo. Guardar
     só o PV deixava PE e Mana entrarem inconsistentes pela mesma porta
     que o PV tinha fechada. */
  const recursoInvalido = RECURSOS_DO_TOKEN.find(({ chaveAtual, chaveMax }) => {
    const atual = valores[chaveAtual];
    const max = valores[chaveMax];
    return atual !== null && max !== null && atual > max;
  });
  const pvInvalido = recursoInvalido !== undefined;

  const tamanhoMudou = modo === "editar" && valores.tamanho !== valoresIniciais.tamanho;
  const cabeAposRedimensionar = !tamanhoMudou || cabeAoRedimensionar({
    tamanho: valores.tamanho, orientacao: valoresIniciais.orientacao, ancora: { q: valoresIniciais.q, r: valoresIniciais.r },
    largura, altura, terreno: terrenoReal, ocupadosPorOutros,
  });

  // Nome e sigla são OPCIONAIS nos dois modos (criar e editar, mesma
  // regra — pedido explícito de consistência): um campo vazio (ou só
  // espaços) é um formulário VÁLIDO. O servidor gera "#1"/"#2"/...
  // atomicamente na hora de confirmar (`vtt_alocar_nome_automatico`,
  // migration 0078) — este componente NUNCA inventa esse número, só
  // manda vazio pra frente.
  const podeConfirmar = validacaoImagem.ok && !pvInvalido && cabeAposRedimensionar;

  /**
   * Recorta e guarda EM MEMÓRIA — não envia nada.
   *
   * O envio depende de um token que ainda não existe; até lá o blob
   * vive no rascunho. Cancelar o formulário não deixa resíduo: nenhuma
   * cota reservada, nenhum objeto no Storage, nada pra coleta recolher.
   */
  async function prepararArquivo(origem: { x: number; y: number; tamanho: number }) {
    const arquivo = arquivoParaRecortar;
    if (!arquivo) return;
    setPreparandoArquivo(true);
    setErroArquivo(null);
    try {
      const preparada = await prepararRecorteQuadrado(arquivo, origem);
      setValores((v) => {
        if (v.retratoArquivo) URL.revokeObjectURL(v.retratoArquivo.previewUrl);
        // Arquivo e endereço são exclusivos — escolher um limpa o outro.
        return { ...v, retratoArquivo: preparada, retratoUrl: null };
      });
      setArquivoParaRecortar(null);
    } catch (e) {
      setErroArquivo(e instanceof Error ? e.message : "Não foi possível ler esta imagem.");
    } finally {
      setPreparandoArquivo(false);
    }
  }

  async function confirmar() {
    if (!podeConfirmar || enviandoRef.current) return;
    if (!validacaoImagem.ok) { setErro(validacaoImagem.erro); return; }
    /* Recalculado aqui, e não lido de `recursoInvalido`: depois do
       `if (!podeConfirmar) return` o TypeScript já sabe que aquele é
       `undefined`, e o teste viraria código morto que nunca protege
       nada. Este relê os valores no instante do envio. */
    const invalidoAgora = RECURSOS_DO_TOKEN.find(({ chaveAtual, chaveMax }) => {
      const atual = valores[chaveAtual];
      const max = valores[chaveMax];
      return atual !== null && max !== null && atual > max;
    });
    if (invalidoAgora) { setErro(`${invalidoAgora.rotulo} atual não pode ser maior que o máximo.`); return; }
    if (!cabeAposRedimensionar) {
      setErro("O novo tamanho não cabe na posição atual. Mova ou rotacione o token no mapa antes de alterar o tamanho.");
      return;
    }

    // Nunca gera "#1" aqui — só normaliza espaços e deixa vazio
    // seguir vazio; o servidor decide o nome/sigla definitivos.
    const valoresFinais = { ...valores, nome: valores.nome.trim(), sigla: valores.sigla.trim() };

    if (modo === "criar") {
      // Nunca chama rede aqui — só entrega o rascunho validado.
      // `VttClient.tsx` assume a partir daqui (fase de posicionamento).
      onContinuarParaPosicionar(valoresFinais);
      return;
    }

    enviandoRef.current = true;
    setEnviando(true);
    setErro(null);
    // `onConfirmarEdicao` pode REJEITAR (queda de rede) em vez de
    // devolver `{ok:false}` — sem este `try/catch`, as duas linhas de
    // limpeza abaixo nunca rodariam, e `enviando`/`enviandoRef`
    // ficariam presos em `true` pra sempre (Cancelar/Salvar desabilitados
    // sem nenhuma saída — mesma classe de bug já encontrada e corrigida
    // em `VttClient.tsx::confirmarPosicionamento`).
    let r: { ok: boolean; erro?: string };
    try {
      r = await onConfirmarEdicao(valoresFinais);
    } catch (e) {
      r = { ok: false, erro: e instanceof Error ? `Falha de rede: ${e.message}` : "Falha de rede ao salvar. Tente novamente." };
    }
    enviandoRef.current = false;
    setEnviando(false);
    if (!r.ok) { setErro(r.erro ?? "Operação recusada pelo servidor."); return; } // preserva os dados preenchidos — não fecha, não limpa
    onFechar();
  }

  // Preview ABSTRATO — só a FORMA (offsets relativos, âncora sempre em
  // {0,0}), sempre orientação 0 (a orientação real de um token novo só
  // existe a partir do posicionamento no mapa; a de um token existente
  // nunca é editável por aqui). Nunca projeta sobre uma âncora real,
  // nunca sabe de terreno/colisão/bordas — é só "que forma é essa".
  /** Token com ficha não guarda recurso próprio — quem manda é a ficha. */
  const temFicha = valores.characterId !== null;

  const pegadaAbstrata = useMemo(() => pegadaEfetiva({ categoria: valores.tamanho, orientacao: 0, pegadaPersonalizada: null }), [valores.tamanho]);
  const raioPreview = 22;
  const previewPontos = pegadaAbstrata.map((c) => hexParaPixel(c, raioPreview));
  const minX = Math.min(...previewPontos.map((p) => p.x)) - raioPreview * 1.3;
  const maxX = Math.max(...previewPontos.map((p) => p.x)) + raioPreview * 1.3;
  const minY = Math.min(...previewPontos.map((p) => p.y)) - raioPreview * 1.3;
  const maxY = Math.max(...previewPontos.map((p) => p.y)) + raioPreview * 1.3;
  // Todo token pode ser orientado durante o posicionamento — mesmo
  // pegada simétrica, que só muda pra qual direção o token aponta,
  // nunca as células ocupadas (`tamanhoTemOrientacaoVariavel` responde
  // uma pergunta diferente: se a FORMA muda ao girar).
  const podeGirar = modo === "criar";

  // Personagens com nome repetido ganham um sufixo curto do id — só o suficiente pra diferenciar, calculado do lado do cliente a partir do que já veio (nenhum dado novo do servidor).
  const contagemNomes = new Map<string, number>();
  for (const p of personagens) contagemNomes.set(p.nome, (contagemNomes.get(p.nome) ?? 0) + 1);
  const personagensRotulados = personagens.map((p) => ({
    ...p,
    rotulo: (contagemNomes.get(p.nome) ?? 0) > 1 ? `${p.nome} (${p.id.slice(0, 4)})` : p.nome,
  }));

  const tituloId = "rv-gerenciador-titulo";
  const descricaoId = "rv-gerenciador-descricao";

  // Janela ainda não tem posição calculada (primeiro paint, client-only)
  // — não renderiza fora de lugar por um instante; um render depois já
  // vem com `pos` definido (efeito síncrono o bastante pra nunca piscar
  // visivelmente no canto errado).
  if (!pos) return null;

  /* O RECORTE toma a tela inteira do formulário: escolher o
     enquadramento é decidir o que a imagem É, e fazer isso numa caixinha
     ao lado dos campos seria pedir duas atenções ao mesmo tempo. */
  if (arquivoParaRecortar) {
    return (
      <JanelaRecorte
        erro={erroArquivo}
        arquivo={arquivoParaRecortar}
        ocupado={preparandoArquivo}
        onConfirmar={(r) => { void prepararArquivo(r); }}
        onCancelar={() => { setArquivoParaRecortar(null); setErroArquivo(null); }}
      />
    );
  }

  return (
    <div
      ref={painelRef}
      className="rv-janela-token rv-gerenciador-token rv-fp"
      style={{ left: pos.x, top: pos.y }}
      aria-labelledby={tituloId} aria-describedby={descricaoId}
    >
      {/* Mesma casca das janelas de ferramenta: brackets nos quatro
          cantos e espinha vertical com índice e código. Esta janela era
          a única que ainda usava a moldura de modal antiga. */}
      {(["tl", "tr", "bl", "br"] as const).map((c) => (
        <span key={c} className="rv-fp-canto" data-canto={c} aria-hidden="true" />
      ))}
      <span className="rv-fp-espinha" aria-hidden="true">
        <span className="rv-fp-espinha-indice">08</span>
        <span className="rv-fp-espinha-codigo">Token</span>
        <span className="rv-fp-espinha-ponto" />
      </span>

      <header className="rv-fp-cab rv-janela-token-cab" onPointerDown={iniciarArrasto}>
        <span className="rv-fp-cab-txt">
          <span className="rv-fp-titulo" id={tituloId}>
            {modo === "criar" ? "Adicionar token" : `Editar ${valoresIniciais.nome || "token"}`}
          </span>
          <span className="rv-fp-modo" id={descricaoId}>
            {modo === "criar" ? "Configuração · posição no próximo passo" : "Edição · altere e salve"}
          </span>
        </span>
        <button type="button" className="rv-fp-fechar" aria-label="Fechar" onClick={pedirFechar}>
          <X size={13} />
        </button>
      </header>

      <div className="rv-modal-corpo rv-janela-token-corpo" onKeyDown={(e) => { if (e.key === "Enter" && (e.target as HTMLElement).tagName !== "TEXTAREA" && (e.target as HTMLElement).tagName !== "BUTTON") { e.preventDefault(); confirmar(); } }}>

        {/* ══ O TOKEN, COMO ELE VAI FICAR ══════════════════════════════
            A peça que faltava. Criar token é criar uma COISA VISUAL —
            um disco no mapa com cor de lado, retrato ou sigla, barra de
            vida — e o formulário mostrava só a forma abstrata da pegada
            num quadrado de 100px. Quem estava preparando uma cena
            escolhia às cegas e só via o resultado depois de posicionar.

            A prévia fica GRUDADA no topo enquanto o resto rola: ela é o
            que muda a cada campo, e um preview que sai de vista é um
            preview que não serve. */}
        <div className="rv-token-previa" aria-hidden="true">
          <div className="rv-token-disco" data-lado={valores.lado}>
            {valores.retratoUrl && validacaoImagem.ok && !imagemFalhou
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={valores.retratoUrl} alt="" onError={() => setImagemFalhou(true)} />
              : <span className="rv-token-disco-sigla">{valores.sigla || sugerirSigla(valores.nome) || "?"}</span>}
          </div>
          <div className="rv-token-previa-txt">
            <strong className="rv-token-previa-nome">{valores.nome.trim() || "Sem nome"}</strong>
            <span className="rv-token-previa-meta">
              {LADOS.find(([v]) => v === valores.lado)?.[2]} · {TAMANHOS[valores.tamanho].rotulo} · {TAMANHOS[valores.tamanho].metros}
            </span>
            {valores.pvMax !== null && (
              <span className="rv-token-previa-pv">
                <span className="rv-token-previa-pv-trilha">
                  <span style={{ width: `${Math.min(100, Math.round(((valores.pvAtual ?? valores.pvMax) / Math.max(1, valores.pvMax)) * 100))}%` }} />
                </span>
                {valores.pvAtual ?? valores.pvMax}/{valores.pvMax}
              </span>
            )}
          </div>
          {/* A PEGADA vive aqui, ao lado do disco, e não perdida num
              campo: ela é parte do retrato da peça — quantos hexes ela
              come no mapa —, não uma ilustração do campo "tamanho". */}
          <div className="rv-token-pegada" data-vertente={valores.vertente}>
            {/* `currentColor`, e não um ciano cravado: a cor vem da
                VERTENTE, como no mapa — lá o anel do disco é
                `COR_VERTENTE`. Escolher "Somática" e ver a pegada azul
                era a prévia contradizendo o campo logo abaixo dela. */}
            <svg viewBox={`${minX} ${minY} ${maxX - minX} ${maxY - minY}`} width={58} height={58}>
              {previewPontos.map((p, i) => {
                const ehAncora = pegadaAbstrata[i].q === 0 && pegadaAbstrata[i].r === 0;
                return (
                  <path key={i} d={hexPath(raioPreview - 1.5)} transform={`translate(${p.x} ${p.y})`}
                    fill="currentColor" fillOpacity={0.16} stroke="currentColor" strokeWidth={ehAncora ? 3 : 1.3} />
                );
              })}
            </svg>
            <span>{pegadaAbstrata.length} hex{pegadaAbstrata.length === 1 ? "" : "es"}</span>
          </div>
        </div>

        {/* ══ IDENTIDADE ═══════════════════════════════════════════════
            Nome e sigla numa linha só. A sigla se escreve sozinha a
            partir do nome — é campo de EXCEÇÃO, e por isso estreito e
            sem instrução: o que ela faz aparece na prévia ao lado. */}
        <div className="rv-form-linha">
          <label className="rv-field rv-field--nome">
            <span>Nome</span>
            <input ref={primeiroCampoRef} type="text" value={valores.nome} placeholder="Ex.: Sentinela da Doca"
              onChange={(e) => setValores((v) => ({ ...v, nome: e.target.value }))} />
          </label>
          <label className="rv-field rv-field--estreito">
            <span>Sigla</span>
            <input
              type="text" maxLength={3} value={valores.sigla} placeholder={sugerirSigla(valores.nome) || "SEN"}
              onChange={(e) => { setSiglaEditadaManualmente(true); setValores((v) => ({ ...v, sigla: e.target.value.toUpperCase().trimStart() })); }}
            />
          </label>
        </div>

        {/* LADO em três fichas coloridas, uma linha. Era um segmentado
            de rótulos em duas linhas ("Personagem do narrador (PN)")
            que comia duas alturas de campo pra dizer três palavras — e
            a cor, que é o que de fato distingue os três no mapa, não
            aparecia em lugar nenhum. */}
        <fieldset className="rv-field rv-fp-grupo">
          <legend className="rv-fp-rotulo">Lado</legend>
          <div className="rv-segmentado rv-token-lados" role="radiogroup" aria-label="Lado">
            {LADOS.map(([valor, curto, longo]) => (
              <button key={valor} type="button" role="radio" aria-checked={valores.lado === valor}
                className="rv-segmentado-item rv-token-lado" data-lado={valor} title={longo}
                onClick={() => setValores((v) => ({ ...v, lado: valor }))}>
                <span className="rv-token-lado-marca" aria-hidden="true" />
                {curto}
              </button>
            ))}
          </div>
        </fieldset>

        {/* TAMANHO em fichas, não num `select`: são cinco opções fixas,
            é o campo que mais mexe na prévia, e escolher entre cinco
            coisas visíveis é um clique — dentro de um select são três
            (abrir, procurar, escolher). */}
        <fieldset className="rv-field rv-fp-grupo">
          <legend className="rv-fp-rotulo">Tamanho</legend>
          <div className="rv-segmentado" role="radiogroup" aria-label="Tamanho">
            {CATEGORIAS.map((c) => (
              <button key={c} type="button" role="radio" aria-checked={valores.tamanho === c}
                className="rv-segmentado-item rv-token-tamanho" title={`${TAMANHOS[c].rotulo} — ${TAMANHOS[c].metros}`}
                onClick={() => setValores((v) => ({ ...v, tamanho: c }))}>
                <strong>{TAMANHOS[c].rotulo}</strong>
                <span>{TAMANHOS[c].metros}</span>
              </button>
            ))}
          </div>
          {podeGirar && (
            <small className="rv-field-ajuda">A orientação da pegada é escolhida no mapa, no próximo passo.</small>
          )}
          {!cabeAposRedimensionar && (
            <p className="rv-form-aviso" role="alert">O novo tamanho não cabe na posição atual. Mova ou rotacione o token no mapa antes de alterar o tamanho.</p>
          )}
        </fieldset>

        {/* CONTROLE — quem manda no token. A ficha e as duas travas são
            a MESMA pergunta ("quem pode mexer nisto?"), e estavam em
            dois grupos distantes: a ficha dentro de "Ficha & escala",
            as travas em "Comportamento", com um bloco de tamanho no
            meio. */}
        <div className="rv-fp-grupo">
          <span className="rv-fp-rotulo">Controle</span>
          <label className="rv-field">
            <span>Ficha vinculada</span>
            <select value={valores.characterId ?? ""} onChange={(e) => setValores((v) => ({ ...v, characterId: e.target.value || null }))}>
              <option value="">Nenhuma — somente o narrador controla</option>
              {personagensRotulados.map((p) => <option key={p.id} value={p.id}>{p.rotulo}</option>)}
            </select>
          </label>
          {/* Os dois interruptores lado a lado, no lugar dos cartões de
              duas linhas: são duas chaves de liga/desliga, não duas
              decisões que precisem de parágrafo. O que cada uma faz
              cabe no rótulo. */}
          <div className="rv-token-chaves">
            <label className="rv-fp-switch rv-token-chave">
              <input type="checkbox" checked={valores.visivel} onChange={(e) => setValores((v) => ({ ...v, visivel: e.target.checked }))} />
              <span className="rv-fp-switch-tr" aria-hidden="true" />
              <span className="rv-fp-switch-txt">Visível para jogadores</span>
            </label>
            <label className="rv-fp-switch rv-token-chave">
              <input type="checkbox" checked={valores.bloqueado} onChange={(e) => setValores((v) => ({ ...v, bloqueado: e.target.checked }))} />
              <span className="rv-fp-switch-tr" aria-hidden="true" />
              <span className="rv-fp-switch-txt">Posição travada</span>
            </label>
          </div>
        </div>

        {/* ══ O RESTO ══════════════════════════════════════════════════
            Vertente, imagem, PV e condições: existem, mas não é por
            elas que se cria um token no meio de uma sessão. Ficam a um
            clique — e abertas de saída quando já têm conteúdo (modo
            editar). */}
        <details className="rv-mais-opcoes rv-fp-grupo" open={maisOpcoesAberto} onToggle={(e) => setMaisOpcoesAberto((e.target as HTMLDetailsElement).open)}>
          {/* O CHEVRON diz que o bloco abre e fecha. Sem ele, "Retrato,
              vida e estado" era só mais um título de seção como os três
              de cima — e os três de cima não abrem nada. */}
          <summary className="rv-fp-rotulo">
            Retrato, vida e estado
            <ChevronDown size={13} className="rv-mais-opcoes-chevron" aria-hidden="true" />
          </summary>

          {/* IMAGEM — arquivo OU endereço, nunca os dois. É a mesma
              regra do editor de retrato (`EditorRetratoToken`), e ela
              vem do banco: gravar um limpa o outro. Guardar os dois com
              precedência silenciosa faria ninguém saber qual está
              valendo. */}
          <fieldset className="rv-field">
            <legend>Imagem do token</legend>
            <div className="rv-token-imagem">
              <button
                type="button" className="rv-token-imagem__disco"
                onClick={() => campoArquivoRef.current?.click()}
                aria-label={valores.retratoArquivo ? "Trocar a imagem escolhida" : "Escolher uma imagem do computador"}
              >
                {valores.retratoArquivo
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={valores.retratoArquivo.previewUrl} alt="" />
                  : <ImageUp size={18} aria-hidden />}
              </button>
              <div className="rv-token-imagem__lado">
                <span className="rv-field-ajuda">
                  {valores.retratoArquivo
                    ? "Enviada quando o token for criado."
                    : "PNG, JPEG ou WebP · até 2 MB. Sem imagem, o token usa a sigla."}
                </span>
                {valores.retratoArquivo && (
                  <button
                    type="button" className="rv-btn rv-btn--ghost"
                    onClick={() => setValores((v) => {
                      if (v.retratoArquivo) URL.revokeObjectURL(v.retratoArquivo.previewUrl);
                      return { ...v, retratoArquivo: null };
                    })}
                  >Remover</button>
                )}
                <input
                  ref={campoArquivoRef} type="file" accept="image/png,image/jpeg,image/webp" hidden
                  onChange={(e) => {
                    const arquivo = e.target.files?.[0];
                    e.target.value = ""; // permite reescolher o MESMO arquivo
                    if (arquivo) { setErroArquivo(null); setArquivoParaRecortar(arquivo); }
                  }}
                />
              </div>
            </div>
            {erroArquivo && <p className="rv-form-aviso" role="alert">{erroArquivo}</p>}
            {/* O ENDEREÇO some quando há arquivo: um retrato tem uma
                origem só, e deixar o campo ali sugeriria que os dois
                convivem. */}
            {!valores.retratoArquivo && (
              <label className="rv-field">
                <span>Ou um endereço</span>
                <input
                  type="text" value={valores.retratoUrl ?? ""} placeholder="https://…"
                  onChange={(e) => { setImagemFalhou(false); setValores((v) => ({ ...v, retratoUrl: e.target.value || null })); }}
                />
                {!validacaoImagem.ok && <p className="rv-form-aviso" role="alert">{validacaoImagem.erro}</p>}
                {imagemFalhou && <p className="rv-form-aviso" role="alert">Não foi possível carregar esta imagem.</p>}
              </label>
            )}
          </fieldset>

          <fieldset className="rv-field">
            <legend>Recursos</legend>
            {/* PV, e não "Pontos de Vida": a ficha e o painel escrevem
                PV em toda parte, e o nome por extenso só aparecia aqui.
                Os campos são estreitos porque são números de até três
                dígitos — a largura de antes cabia um CEP. */}
            {/* OS TRÊS RECURSOS NUMA LINHA SÓ — cada um com o par
                atual/máximo lado a lado. Empilhados, os seis campos
                ocupavam a altura de um formulário inteiro pra guardar
                seis números de três dígitos.

                Só existem pra token SEM ficha: com ficha vinculada os
                números vêm da ficha canônica, e dois lugares guardando
                o mesmo PV é a receita de eles discordarem. */}
            <div className="rv-token-recursos-linha" data-desabilitada={temFicha || undefined}>
              {RECURSOS_DO_TOKEN.map(({ chaveAtual, chaveMax, rotulo }) => (
                <div className="rv-token-rec" key={rotulo}>
                  <span className="rv-token-rec__rot" data-recurso={chaveAtual.slice(0, -5)}>{rotulo}</span>
                  <span className="rv-token-rec__par">
                    <input
                      type="number" min={0} value={valores[chaveAtual] ?? ""}
                      aria-label={`${rotulo} atual`} title={`${rotulo} atual`} disabled={temFicha}
                      onChange={(e) => setValores((v) => ({ ...v, [chaveAtual]: e.target.value === "" ? null : Math.max(0, Number(e.target.value)) }))}
                    />
                    <span className="rv-token-rec__barra" aria-hidden="true">/</span>
                    <input
                      type="number" min={0} value={valores[chaveMax] ?? ""}
                      aria-label={`${rotulo} máximo`} title={`${rotulo} máximo`} disabled={temFicha}
                      onChange={(e) => setValores((v) => ({ ...v, [chaveMax]: e.target.value === "" ? null : Math.max(0, Number(e.target.value)) }))}
                    />
                  </span>
                </div>
              ))}
            </div>
            {temFicha && (
              <small className="rv-field-ajuda">
                Os recursos vêm da ficha vinculada — é lá que eles mudam.
              </small>
            )}
            {recursoInvalido && (
              <p className="rv-form-aviso" role="alert">
                {recursoInvalido.rotulo} atual não pode ser maior que o máximo.
              </p>
            )}
            {/* O MÁXIMO É QUE LIGA A BARRA — o servidor só projeta o
                recurso quando os dois números existem (0133). Sem ele,
                o atual fica guardado e invisível, e é melhor dizer isso
                do que deixar a barra simplesmente não aparecer. */}
            {RECURSOS_DO_TOKEN.some(({ chaveAtual, chaveMax }) => valores[chaveAtual] !== null && valores[chaveMax] === null) && (
              <p className="rv-field-ajuda">Sem o máximo, o recurso não vira barra no token.</p>
            )}
          </fieldset>

          {/* VERTENTE em fichas com a cor: é a cor que o token leva pro
              mapa, e num `select` ela não aparecia — escolhia-se um
              nome e descobria-se a cor depois. */}
          <fieldset className="rv-field">
            <legend>Vertente</legend>
            <div className="rv-segmentado rv-token-vertentes" role="radiogroup" aria-label="Vertente">
              {VERTENTES.map(([valor, rotulo]) => (
                <button key={valor} type="button" role="radio" aria-checked={valores.vertente === valor}
                  className="rv-segmentado-item rv-token-vertente" data-vertente={valor}
                  onClick={() => setValores((v) => ({ ...v, vertente: valor }))}>
                  <span className="rv-token-lado-marca" aria-hidden="true" />
                  {rotulo}
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset className="rv-field">
            <legend>
              Condições {valores.condicoes.length > 0 && <span className="rv-camadas-tag">{valores.condicoes.length}</span>}
            </legend>
            {valores.condicoes.length > 0 && (
              <button type="button" className="rv-btn rv-btn--ghost rv-limpar-condicoes" onClick={() => setValores((v) => ({ ...v, condicoes: [] }))}>Limpar</button>
            )}
            {/* O MESMO INTERRUPTOR das janelas de ferramenta
                (`.rv-fp-switch`): o checkbox era a única caixa de
                marcar que sobrava no VTT, e ela vinha do navegador. */}
            <div className="rv-condicoes-grade">
              {/* ORDEM FIXA. Antes as marcadas subiam pro topo, e cada
                  clique reembaralhava a grade debaixo do cursor — o
                  item que se acabou de ligar saía do lugar e o próximo
                  que se ia clicar mudava de posição. Uma lista de
                  marcar tem que ficar parada. */}
              {CONDICOES_LISTA.map((c) => (
                <label key={c} className="rv-fp-switch rv-condicao-item" title={CONDICOES[c].rotulo}>
                  <input
                    type="checkbox"
                    checked={valores.condicoes.includes(c)}
                    onChange={(e) => setValores((v) => ({
                      ...v,
                      condicoes: e.target.checked ? [...v.condicoes, c] : v.condicoes.filter((x) => x !== c),
                    }))}
                  />
                  <span className="rv-fp-switch-tr" aria-hidden="true" />
                  <span className="rv-fp-switch-txt">{CONDICOES[c].glifo} {CONDICOES[c].rotulo}</span>
                </label>
              ))}
            </div>
          </fieldset>
        </details>

        {erro && <p className="rv-form-aviso" role="alert">{erro}</p>}
      </div>

      <footer className="rv-modal-rodape">
        <button type="button" className="rv-btn rv-btn--ghost" onClick={pedirFechar} disabled={enviando}>Cancelar</button>
        <button type="button" className="rv-btn rv-btn--pri" onClick={confirmar} disabled={!podeConfirmar || enviando}>
          {enviando ? "Salvando…" : modo === "criar" ? "Continuar para posicionar" : "Salvar alterações"}
        </button>
      </footer>
    </div>
  );
}
