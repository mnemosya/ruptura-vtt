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
import { ChevronDown, Eye, ImageUp, Lock, X } from "lucide-react";
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
  ["biotica", "Biótica"],
  ["cognitiva", "Cognitiva"],
  ["material", "Material"],
  ["energetica", "Energética"],
  ["cinetica", "Cinética"],
  ["sinaptica", "Sináptica"],
];

/** Os três lados: valor, rótulo curto (o que aparece na ficha) e o longo (título e prévia). */
const LADOS: readonly (readonly [LadoToken, string, string])[] = [
  ["pj", "PJ", "Personagem jogador"],
  ["pn", "PN", "Personagem do narrador"],
  ["neutro", "Neutro", "Neutro"],
];
/** Cor de cada lado — a mesma do disco no mapa (`--rv-lado-cor` em `vtt.css`). */
const COR_LADO: Record<LadoToken, string> = { pj: "#45b8c9", pn: "#e0455f", neutro: "#8ea0bd" };

/** Quantos hexes a pegada come — sempre do domínio (`pegadaEfetiva`). */
function nHexes(tamanho: TamanhoCriatura): number {
  return pegadaEfetiva({ categoria: tamanho, orientacao: 0, pegadaPersonalizada: null }).length;
}

/**
 * A PEGADA REAL em miniatura, pra cada parada do trilho de tamanho:
 * offsets de `pegadaEfetiva` (orientação 0 — a real é escolhida no
 * mapa), centralizados. O raio encolhe só no Pequeno, pra ler "menor".
 */
function PegadaMini({ tamanho }: { tamanho: TamanhoCriatura }) {
  const pegada = pegadaEfetiva({ categoria: tamanho, orientacao: 0, pegadaPersonalizada: null });
  const raio = tamanho === "pequeno" ? 3.6 : pegada.length > 7 ? 4.2 : 5;
  const pts = pegada.map((c) => hexParaPixel(c, raio));
  const cx = (Math.min(...pts.map((p) => p.x)) + Math.max(...pts.map((p) => p.x))) / 2;
  const cy = (Math.min(...pts.map((p) => p.y)) + Math.max(...pts.map((p) => p.y))) / 2;
  return (
    <svg width={52} height={46} viewBox="0 0 52 46" aria-hidden="true">
      {pts.map((p, i) => (
        <path key={i} className="jf-hx" d={hexPath(raio - 0.6)} transform={`translate(${26 + p.x - cx} ${23 + p.y - cy})`} />
      ))}
    </svg>
  );
}

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
/* SÓ O GRANDE sobrou. O colossal virou a estrela de 13 (0135), que é
   simétrica como o enorme — girar só permuta as direções e o conjunto
   ocupado é o mesmo. O triângulo do Grande é a única forma do produto
   que muda de células ao rodar. */
const CATEGORIAS_COM_FORMA_VARIAVEL: ReadonlySet<TamanhoCriatura> = new Set(["grande"]);
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
  onConfirmarEdicao, onContinuarParaPosicionar, onFechar, onCriarFicha,
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
  /**
   * TOK-01 — só no modo EDITAR, só para o narrador. Cria a ficha (PN) e
   * vincula NO SERVIDOR na hora, numa transação; devolve o id da ficha ou
   * a mensagem de erro. O mesmo fluxo do item "Criar ficha" do menu.
   */
  onCriarFicha?: () => Promise<{ ok: true; characterId: string } | { ok: false; erro: string }>;
}) {
  const [valores, setValores] = useState(valoresIniciais);
  const [criandoFicha, setCriandoFicha] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [siglaEditadaManualmente, setSiglaEditadaManualmente] = useState(siglaJaEditada(modo, valoresIniciais));
  const [maisOpcoesAberto, setMaisOpcoesAberto] = useState(false);
  const [ctlAberto, setCtlAberto] = useState(false);
  const [foco, setFoco] = useState<string | null>(null);
  const [espiaTam, setEspiaTam] = useState<TamanhoCriatura | null>(null);
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
    /* O AVISO É SÓ DA EDIÇÃO. Ali existe um token salvo, e fechar sem
       querer perde o que já estava no mundo — o preço da pergunta se
       paga.
       Na CRIAÇÃO não há nada a perder: o token não existe, e quem
       clica em Cancelar ou no X está dizendo justamente "não quero
       criar". Perguntar "descartar as alterações?" ali é pedir
       confirmação de uma desistência explícita — e bastava escolher um
       avatar pra janela passar a insistir, porque qualquer campo
       preenchido deixa o formulário "sujo". */
    if (modo === "editar" && sujo && !window.confirm("Descartar as alterações não salvas deste token?")) return;
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

  const corLado = COR_LADO[valores.lado];
  const tamMostrado = espiaTam ?? valores.tamanho;
  /** Liga a frase de ajuda (`jf-desc`) ao que está sob o mouse/foco. */
  const focar = (txt: string) => ({
    onMouseEnter: () => setFoco(txt), onMouseLeave: () => setFoco(null),
    onFocus: () => setFoco(txt), onBlur: () => setFoco(null),
  });

  const tituloId = "rv-gerenciador-titulo";
  const descricaoId = "rv-gerenciador-descricao";

  // Janela ainda não tem posição calculada (primeiro paint, client-only)
  // — não renderiza fora de lugar por um instante; um render depois já
  // vem com `pos` definido (efeito síncrono o bastante pra nunca piscar
  // visivelmente no canto errado).
  if (!pos) return null;

  return (
    <>
    {/* O RECORTE VEM POR CIMA, não no lugar. Trocar o formulário pela
        janela de enquadramento fazia a janela de token sumir da tela —
        e com ela a posição arrastada, o rascunho à vista e o próprio
        contexto do que se estava criando. Ela é `position: fixed` com
        z-index bem acima (521, em `console.css`), então basta existir
        ao lado. */}
    {arquivoParaRecortar && (
      <JanelaRecorte
        erro={erroArquivo}
        arquivo={arquivoParaRecortar}
        ocupado={preparandoArquivo}
        onConfirmar={(r) => { void prepararArquivo(r); }}
        onCancelar={() => { setArquivoParaRecortar(null); setErroArquivo(null); }}
      />
    )}
    <div
      ref={painelRef}
      // Linha F (`rv-fp--f rv-fp--gestao`, 500px) aplicada à MESMA casca
      // fixa de sempre: esta janela vive fora do palco e nasce no centro
      // da tela, de propósito (ver `usePosicaoJanelaFlutuante`), então
      // não usa `JanelaFerramenta` — só a aparência dela.
      className="rv-janela-token rv-gerenciador-token rv-fp rv-fp--f rv-fp--gestao rv-tok-janela"
      style={{ left: pos.x, top: pos.y, ["--jf-acento" as string]: "#00d4ff", ["--jf-l" as string]: corLado, ["--jf-hero" as string]: corLado }}
      aria-labelledby={tituloId} aria-describedby={descricaoId}
    >
      <header className="rv-fp-cab rv-janela-token-cab" onPointerDown={iniciarArrasto}>
        <span className="rv-fp-cab-txt">
          <span className="rv-fp-titulo" id={tituloId}>
            {modo === "criar" ? "Novo token" : `Editar ${valoresIniciais.nome || "token"}`}
          </span>
          <span className="rv-fp-modo" id={descricaoId}>
            {modo === "criar" ? "Passo 1 de 2 · posição no próximo" : "Edição · altere e salve"}
          </span>
        </span>
        <button type="button" className="rv-fp-fechar" aria-label="Fechar" onClick={pedirFechar}>
          <X size={13} />
        </button>
      </header>

      <div className="rv-modal-corpo rv-janela-token-corpo jf-corpo" onKeyDown={(e) => { if (e.key === "Enter" && (e.target as HTMLElement).tagName !== "TEXTAREA" && (e.target as HTMLElement).tagName !== "BUTTON") { e.preventDefault(); confirmar(); } }}>

        {/* ══ VITRINE: A PEÇA É O FORMULÁRIO ═════════════════════════
            O próprio token, grande: digita-se a sigla DENTRO do disco e o
            nome logo abaixo. O nome vem primeiro no DOM (e no Tab, como
            sempre foi: nome → sigla); `order` só sobe o disco na tela. */}
        <div className="jf-hero rv-tok-vitrine">
          <input
            ref={primeiroCampoRef} type="text" className="rv-tok-nome" value={valores.nome} placeholder="Sem nome"
            maxLength={60} aria-label="Nome do token"
            onChange={(e) => setValores((v) => ({ ...v, nome: e.target.value }))}
          />
          <label className="rv-tok-disco" data-lado={valores.lado} data-vertente={valores.vertente} title="Sigla">
            {valores.retratoArquivo
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={valores.retratoArquivo.previewUrl} alt="" />
              : valores.retratoUrl && validacaoImagem.ok && !imagemFalhou
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={valores.retratoUrl} alt="" onError={() => setImagemFalhou(true)} />
                : null}
            <input
              type="text" maxLength={3} value={valores.sigla} placeholder={sugerirSigla(valores.nome) || "?"}
              aria-label="Sigla"
              onFocus={() => setFoco("A sigla aparece no disco quando não há retrato")} onBlur={() => setFoco(null)}
              onChange={(e) => { setSiglaEditadaManualmente(true); setValores((v) => ({ ...v, sigla: e.target.value.toUpperCase().trimStart() })); }}
            />
          </label>
          <span className="jf-leg">
            {LADOS.find(([v]) => v === valores.lado)?.[2]} · {TAMANHOS[valores.tamanho].rotulo} · {TAMANHOS[valores.tamanho].metros}
          </span>
          {valores.pvMax !== null && valores.pvMax > 0 && (
            <span className="rv-tok-pv">
              <span><i style={{ width: `${Math.min(100, Math.round(((valores.pvAtual ?? valores.pvMax) / Math.max(1, valores.pvMax)) * 100))}%` }} /></span>
              {valores.pvAtual ?? valores.pvMax}/{valores.pvMax}
            </span>
          )}
        </div>

        <div className="jf-grupo">
          <span className="jf-rot">Lado</span>
          <div className="jf-tiles" style={{ ["--jf-n" as string]: 3 }} role="radiogroup" aria-label="Lado">
            {LADOS.map(([valor, curto, longo]) => (
              <button key={valor} type="button" role="radio" aria-checked={valores.lado === valor}
                className="jf-tile rv-token-lado" data-lado={valor} title={longo}
                style={{ ["--jf-l" as string]: COR_LADO[valor], ["--jf-t" as string]: COR_LADO[valor] }}
                {...focar(longo)}
                onClick={() => setValores((v) => ({ ...v, lado: valor }))}>
                <span className="jf-ponto" aria-hidden="true" />
                {curto}
              </button>
            ))}
          </div>
        </div>

        <div className="jf-grupo">
          <span className="jf-rot">Tamanho</span>
          <div className="jf-trilho" style={{ ["--jf-n" as string]: 5 }} role="radiogroup" aria-label="Tamanho" onMouseLeave={() => setEspiaTam(null)}>
            {CATEGORIAS.map((c) => (
              <button key={c} type="button" role="radio" aria-checked={valores.tamanho === c}
                className="jf-parada" title={`${TAMANHOS[c].rotulo} — ${TAMANHOS[c].metros}`}
                onMouseEnter={() => setEspiaTam(c)} onFocus={() => setEspiaTam(c)} onBlur={() => setEspiaTam(null)}
                onClick={() => setValores((v) => ({ ...v, tamanho: c }))}>
                <PegadaMini tamanho={c} />
                <span className="rv-tok-sr">{TAMANHOS[c].rotulo}</span>
              </button>
            ))}
          </div>
          <div className="jf-trilho-leg">
            <b>{TAMANHOS[tamMostrado].rotulo}</b>
            <span>{TAMANHOS[tamMostrado].metros} · {nHexes(tamMostrado)} hex{nHexes(tamMostrado) === 1 ? "" : "es"}</span>
          </div>
          {!cabeAposRedimensionar && (
            <p className="rv-form-aviso" role="alert">O novo tamanho não cabe na posição atual. Mova ou rotacione o token no mapa antes de alterar o tamanho.</p>
          )}
        </div>

        <p className="jf-desc">{foco ?? "Clique no disco pra mudar a sigla"}</p>

        <div className="rv-tok-secs">
          {/* CONTROLE — quem manda no token: ficha e as duas travas são a
              mesma pergunta ("quem pode mexer nisto?"). */}
          <div>
            <button type="button" className="jf-sec-cab" aria-expanded={ctlAberto} onClick={() => setCtlAberto((v) => !v)}>
              <span className="jf-l">Controle</span>
              <span className="jf-sec-res">
                {(valores.characterId ? personagensRotulados.find((x) => x.id === valores.characterId)?.rotulo ?? "Ficha" : "Narrador")}
                {" · "}{valores.visivel ? "visível" : "oculto"}{valores.bloqueado ? " · travado" : ""}
              </span>
              <ChevronDown size={14} aria-hidden="true" />
            </button>
            {ctlAberto && (
              <div className="jf-sec-corpo">
                <label className="jf-linha" {...focar("Vincule uma ficha pra um jogador controlar o token")}>
                  <span className="jf-l">Ficha</span>
                  <select className="jf-v rv-tok-select" value={valores.characterId ?? ""} aria-label="Ficha vinculada"
                    onChange={(e) => setValores((v) => ({ ...v, characterId: e.target.value || null }))}>
                    <option value="">Nenhuma — somente o narrador controla</option>
                    {personagensRotulados.map((x) => <option key={x.id} value={x.id}>{x.rotulo}</option>)}
                  </select>
                  <ChevronDown size={14} aria-hidden="true" />
                </label>
                {modo === "editar" && onCriarFicha && !valoresIniciais.characterId && !valores.characterId && (
                  <button type="button" className="jf-quieto rv-tok-criar-ficha" data-testid="token-criar-ficha" disabled={criandoFicha}
                    onClick={async () => {
                      setCriandoFicha(true);
                      setErro(null);
                      try {
                        const r = await onCriarFicha();
                        if (r.ok) setValores((v) => ({ ...v, characterId: r.characterId }));
                        else setErro(r.erro);
                      } finally {
                        setCriandoFicha(false);
                      }
                    }}>
                    {criandoFicha ? "Criando ficha…" : "Criar ficha (PN) com o nome e o retrato deste token"}
                  </button>
                )}
                <div className="jf-tiles">
                  <button type="button" className="jf-tile jf-tile--chave" aria-pressed={valores.visivel}
                    {...focar("Os jogadores veem o token no mapa")}
                    onClick={() => setValores((v) => ({ ...v, visivel: !v.visivel }))}>
                    <Eye size={16} aria-hidden="true" /> Visível para jogadores
                  </button>
                  <button type="button" className="jf-tile jf-tile--chave" aria-pressed={valores.bloqueado}
                    {...focar("Ninguém arrasta o token sem destravar")}
                    onClick={() => setValores((v) => ({ ...v, bloqueado: !v.bloqueado }))}>
                    <Lock size={16} aria-hidden="true" /> Posição travada
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* RETRATO E VIDA — imagem, recursos, vertente e condições:
              existem, mas não é por eles que se cria um token no meio da
              sessão. Abertos de saída na edição quando já têm conteúdo. */}
          <div>
            <button type="button" className="jf-sec-cab" aria-expanded={maisOpcoesAberto} onClick={() => setMaisOpcoesAberto((v) => !v)}>
              <span className="jf-l">Retrato e vida</span>
              <span className="jf-sec-res">
                {valores.retratoArquivo || valores.retratoUrl ? "Com retrato" : "Sem retrato"}
                {" · "}{temFicha ? "vida da ficha" : valores.pvMax !== null ? `PV ${valores.pvMax}` : "sem PV"}
                {valores.condicoes.length > 0 ? ` · ${valores.condicoes.length} cond.` : ""}
              </span>
              <ChevronDown size={14} aria-hidden="true" />
            </button>
            {maisOpcoesAberto && (
              <div className="jf-sec-corpo">
                {/* IMAGEM — arquivo OU endereço, nunca os dois (regra do
                    banco: gravar um limpa o outro). */}
                <div className="rv-tok-img">
                  <button
                    type="button" className="rv-tok-img-btn"
                    onClick={() => campoArquivoRef.current?.click()}
                    aria-label={valores.retratoArquivo ? "Trocar a imagem escolhida" : "Escolher uma imagem do computador"}
                  >
                    {valores.retratoArquivo
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={valores.retratoArquivo.previewUrl} alt="" />
                      : <ImageUp size={18} aria-hidden />}
                    <span>{valores.retratoArquivo ? "Trocar retrato" : "Escolher retrato"}</span>
                    <small>
                      {valores.retratoArquivo ? "Enviada quando o token for criado" : "PNG, JPEG ou WebP · até 2 MB"}
                    </small>
                  </button>
                  {valores.retratoArquivo && (
                    <button
                      type="button" className="jf-mini is-perigo" aria-label="Remover imagem" title="Remover"
                      onClick={() => setValores((v) => {
                        if (v.retratoArquivo) URL.revokeObjectURL(v.retratoArquivo.previewUrl);
                        return { ...v, retratoArquivo: null };
                      })}
                    ><X size={14} /></button>
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
                {erroArquivo && <p className="rv-form-aviso" role="alert">{erroArquivo}</p>}
                {!valores.retratoArquivo && (
                  <>
                    <input
                      type="text" className="jf-campo" value={valores.retratoUrl ?? ""} placeholder="Ou cole um endereço https://…"
                      aria-label="Endereço da imagem"
                      onChange={(e) => { setImagemFalhou(false); setValores((v) => ({ ...v, retratoUrl: e.target.value || null })); }}
                    />
                    {!validacaoImagem.ok && <p className="rv-form-aviso" role="alert">{validacaoImagem.erro}</p>}
                    {imagemFalhou && <p className="rv-form-aviso" role="alert">Não foi possível carregar esta imagem.</p>}
                  </>
                )}

                {/* Recursos próprios só pra token SEM ficha: com ficha, os
                    números vêm da ficha canônica. */}
                <div className="jf-dims" style={{ ["--jf-n" as string]: 3 }} data-desabilitada={temFicha || undefined}>
                  {RECURSOS_DO_TOKEN.map(({ chaveAtual, chaveMax, rotulo }) => (
                    <label className="jf-dim" key={rotulo}>
                      <span className="jf-l">{rotulo}</span>
                      <span className="jf-dim-v">
                        <input
                          type="number" min={0} inputMode="numeric" placeholder="—" value={valores[chaveAtual] ?? ""}
                          aria-label={`${rotulo} atual`} title={`${rotulo} atual`} disabled={temFicha}
                          onChange={(e) => setValores((v) => ({ ...v, [chaveAtual]: e.target.value === "" ? null : Math.max(0, Number(e.target.value)) }))}
                        />
                        /
                        <input
                          type="number" min={0} inputMode="numeric" placeholder="máx" value={valores[chaveMax] ?? ""}
                          aria-label={`${rotulo} máximo`} title={`${rotulo} máximo`} disabled={temFicha}
                          onChange={(e) => setValores((v) => ({ ...v, [chaveMax]: e.target.value === "" ? null : Math.max(0, Number(e.target.value)) }))}
                        />
                      </span>
                    </label>
                  ))}
                </div>
                {temFicha && <p className="jf-nota rv-tok-ajuda">Os recursos vêm da ficha vinculada — é lá que eles mudam.</p>}
                {recursoInvalido && (
                  <p className="rv-form-aviso" role="alert">{recursoInvalido.rotulo} atual não pode ser maior que o máximo.</p>
                )}
                {RECURSOS_DO_TOKEN.some(({ chaveAtual, chaveMax }) => valores[chaveAtual] !== null && valores[chaveMax] === null) && (
                  <p className="jf-nota rv-tok-ajuda">Sem o máximo, o recurso não vira barra no token.</p>
                )}

                {/* VERTENTE em losangos com a cor que o token leva pro mapa. */}
                <div className="jf-linha" {...focar("A vertente pinta o anel do token no mapa")}>
                  <span className="jf-l">Vertente</span>
                  <span className="jf-v">{VERTENTES.find(([v]) => v === valores.vertente)?.[1]}</span>
                  <span className="jf-cores" role="radiogroup" aria-label="Vertente">
                    {VERTENTES.map(([valor, rotulo]) => (
                      <button key={valor} type="button" role="radio" aria-checked={valores.vertente === valor}
                        className="jf-cor rv-token-vertente" data-vertente={valor} aria-label={rotulo} title={rotulo}
                        style={{ ["--jf-k" as string]: "var(--rv-vertente-cor)" }}
                        onClick={() => setValores((v) => ({ ...v, vertente: valor }))}>
                        <span aria-hidden="true" />
                      </button>
                    ))}
                  </span>
                </div>

                <div className="jf-grupo rv-tok-condicoes">
                  <span className="jf-rot">
                    Condições{valores.condicoes.length > 0 ? ` · ${valores.condicoes.length}` : ""}
                    {valores.condicoes.length > 0 && (
                      <button type="button" className="jf-quieto rv-limpar-condicoes" onClick={() => setValores((v) => ({ ...v, condicoes: [] }))}>Limpar</button>
                    )}
                  </span>
                  {/* ORDEM FIXA: uma lista de marcar tem que ficar parada. */}
                  <div className="jf-tiles" style={{ ["--jf-n" as string]: 3 }}>
                    {CONDICOES_LISTA.map((c) => (
                      <button key={c} type="button" className="jf-tile jf-tile--chave rv-condicao-item" title={CONDICOES[c].rotulo}
                        aria-pressed={valores.condicoes.includes(c)}
                        onClick={() => setValores((v) => ({
                          ...v,
                          condicoes: v.condicoes.includes(c) ? v.condicoes.filter((x) => x !== c) : [...v.condicoes, c],
                        }))}>
                        <span aria-hidden="true">{CONDICOES[c].glifo}</span> {CONDICOES[c].rotulo}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {erro && <p className="rv-form-aviso" role="alert">{erro}</p>}

        <div className="jf-acao rv-tok-acao">
          <button type="button" className="jf-cancelar" data-testid="token-cancelar" onClick={pedirFechar} disabled={enviando}>Cancelar</button>
          <button type="button" className="jf-prim" data-testid="token-confirmar" onClick={confirmar} disabled={!podeConfirmar || enviando}>
            <span>{enviando ? "Salvando…" : modo === "criar" ? "Posicionar no mapa" : "Salvar alterações"}</span>
            {modo === "criar" && !enviando && <kbd className="jf-kbd">↵</kbd>}
          </button>
        </div>
        {podeGirar && <p className="jf-nota">A orientação da pegada é escolhida no mapa</p>}
      </div>
    </div>
    </>
  );
}
