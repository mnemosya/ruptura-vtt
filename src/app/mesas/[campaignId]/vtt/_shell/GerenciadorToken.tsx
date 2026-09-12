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
import { X } from "lucide-react";
import { type Hex, TAMANHOS, type TamanhoCriatura, hexParaPixel, hexPath } from "../_mapa/hex";
import { type CondicaoSlug, CONDICOES } from "../_dados/cenaDemo";
import { type MapaTerreno, dentroDoMapa, pegadaBloqueada } from "../_dominio/movimento";
import { pegadaEfetiva, projetarPegada, pegadasSobrepoem } from "../_dominio/pegada";
import { type LadoToken, type VertenteToken } from "../_dominio/tokenApresentacao";
import { GAP_LATERAL } from "../_ferramentas/janelasPreferencias";

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
  condicoes: CondicaoSlug[];
}

const CATEGORIAS: TamanhoCriatura[] = ["pequeno", "medio", "grande", "enorme", "colossal"];
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
  const pvInvalido = valores.pvAtual !== null && valores.pvMax !== null && valores.pvAtual > valores.pvMax;

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

  async function confirmar() {
    if (!podeConfirmar || enviandoRef.current) return;
    if (!validacaoImagem.ok) { setErro(validacaoImagem.erro); return; }
    if (pvInvalido) { setErro("PV atual não pode ser maior que o PV máximo."); return; }
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
          {/* ── ESSENCIAL ─────────────────────────────────────────── */}
          <div className="rv-form-linha">
            <label className="rv-field rv-field--nome">
              <span>Nome do token</span>
              <input ref={primeiroCampoRef} type="text" value={valores.nome} placeholder="Ex.: Sentinela da Doca"
                onChange={(e) => setValores((v) => ({ ...v, nome: e.target.value }))} />
              <small className="rv-field-ajuda">Nome exibido no mapa, painel e informações do token. Se ficar vazio, será gerado um nome como #1.</small>
            </label>
            <label className="rv-field rv-field--estreito">
              <span>Sigla</span>
              <input
                type="text" maxLength={3} value={valores.sigla} placeholder="SEN"
                onChange={(e) => { setSiglaEditadaManualmente(true); setValores((v) => ({ ...v, sigla: e.target.value.toUpperCase().trimStart() })); }}
              />
              <small className="rv-field-ajuda">Até 3 caracteres exibidos quando o token não possui imagem.</small>
            </label>
          </div>

          {/* Seções NUMERADAS, como nas outras janelas: o contador do
              `.rv-fp-grupo` numera sozinho, na ordem em que aparecem. */}
          <fieldset className="rv-field rv-fp-grupo">
            <legend className="rv-fp-rotulo">Lado</legend>
            <div className="rv-segmentado" role="radiogroup" aria-label="Lado">
              {([["pj", "Personagem jogador (PJ)"], ["pn", "Personagem do narrador (PN)"], ["neutro", "Neutro"]] as const).map(([valor, rotulo]) => (
                <button key={valor} type="button" role="radio" aria-checked={valores.lado === valor}
                  className="rv-segmentado-item" onClick={() => setValores((v) => ({ ...v, lado: valor as LadoToken }))}>
                  {rotulo}
                </button>
              ))}
            </div>
            <small className="rv-field-ajuda">Define a identificação visual e o grupo do token no combate.</small>
          </fieldset>

          <div className="rv-fp-grupo">
          <span className="rv-fp-rotulo">Ficha &amp; escala</span>
          <div className="rv-form-linha rv-form-linha--tamanho">
            <div className="rv-field">
              <label htmlFor="rv-campo-tamanho">Tamanho e espaço ocupado</label>
              <select id="rv-campo-tamanho" value={valores.tamanho} onChange={(e) => setValores((v) => ({ ...v, tamanho: e.target.value as TamanhoCriatura }))}>
                {CATEGORIAS.map((c) => <option key={c} value={c}>{TAMANHOS[c].rotulo} — {TAMANHOS[c].metros}</option>)}
              </select>
              <small className="rv-field-ajuda">Ocupa {pegadaAbstrata.length} hex{pegadaAbstrata.length === 1 ? "" : "es"}.</small>
              {podeGirar && (
                <small className="rv-field-ajuda">A orientação da pegada poderá ser ajustada durante o posicionamento no mapa.</small>
              )}
              {!cabeAposRedimensionar && (
                <p className="rv-form-aviso" role="alert">O novo tamanho não cabe na posição atual. Mova ou rotacione o token no mapa antes de alterar o tamanho.</p>
              )}
            </div>

            <div className="rv-pegada-preview" aria-hidden="true">
              <svg viewBox={`${minX} ${minY} ${maxX - minX} ${maxY - minY}`} width={100} height={100}>
                {previewPontos.map((p, i) => {
                  const ehAncora = pegadaAbstrata[i].q === 0 && pegadaAbstrata[i].r === 0;
                  return (
                    <path key={i} d={hexPath(raioPreview - 1.5)} transform={`translate(${p.x} ${p.y})`}
                      fill="rgba(53,200,240,0.16)" stroke="#35c8f0" strokeWidth={ehAncora ? 3 : 1.3} />
                  );
                })}
              </svg>
            </div>
          </div>

          <label className="rv-field">
            <span>Vincular a uma ficha</span>
            <select value={valores.characterId ?? ""} onChange={(e) => setValores((v) => ({ ...v, characterId: e.target.value || null }))}>
              <option value="">Nenhuma ficha — somente narrador</option>
              {personagensRotulados.map((p) => <option key={p.id} value={p.id}>{p.rotulo}</option>)}
            </select>
            <small className="rv-field-ajuda">Controladores dessa ficha poderão controlar o token. Sem vínculo, somente o narrador controla.</small>
          </label>
          </div>

          <div className="rv-fp-grupo">
          <span className="rv-fp-rotulo">Comportamento</span>
          <div className="rv-cartoes-flag">
            <label className="rv-cartao-flag">
              <input type="checkbox" checked={valores.visivel} onChange={(e) => setValores((v) => ({ ...v, visivel: e.target.checked }))} />
              <div><strong>Visível para jogadores</strong><span>Quando desativado, somente o narrador pode ver este token.</span></div>
            </label>
            <label className="rv-cartao-flag">
              <input type="checkbox" checked={valores.bloqueado} onChange={(e) => setValores((v) => ({ ...v, bloqueado: e.target.checked }))} />
              <div><strong>Travar posição</strong><span>Impede que jogadores movimentem o token até ele ser destravado.</span></div>
            </label>
          </div>
          </div>

          {/* ── IDENTIDADE AMPLIADA (04) ──────────────────────────── */}
          <details className="rv-mais-opcoes rv-fp-grupo" open={maisOpcoesAberto} onToggle={(e) => setMaisOpcoesAberto((e.target as HTMLDetailsElement).open)}>
            <summary className="rv-fp-rotulo">Identidade ampliada</summary>

            <label className="rv-field">
              <span>Vertente</span>
              <select value={valores.vertente} onChange={(e) => setValores((v) => ({ ...v, vertente: e.target.value as VertenteToken }))}>
                <option value="nenhuma">Nenhuma</option>
                <option value="somatico">Somático</option>
                <option value="cognitivo">Cognitivo</option>
                <option value="material">Material</option>
                <option value="energetico">Energético</option>
              </select>
              <small className="rv-field-ajuda">Classificação do personagem e cor temática do token. Use &ldquo;Nenhuma&rdquo; quando não se aplicar.</small>
            </label>

            <label className="rv-field">
              <span>Imagem do token</span>
              <input
                type="text" value={valores.retratoUrl ?? ""} placeholder="https://…"
                onChange={(e) => { setImagemFalhou(false); setValores((v) => ({ ...v, retratoUrl: e.target.value || null })); }}
              />
              <small className="rv-field-ajuda">Cole o endereço de uma imagem já hospedada. Se ficar vazio, o token usará a sigla.</small>
              {!validacaoImagem.ok && <p className="rv-form-aviso" role="alert">{validacaoImagem.erro}</p>}
              {validacaoImagem.ok && valores.retratoUrl && (
                <div className="rv-imagem-preview">
                  {imagemCarregando && !imagemFalhou && <span className="rv-field-ajuda">Carregando prévia…</span>}
                  {imagemFalhou && <span className="rv-form-aviso" role="alert">Não foi possível carregar esta imagem.</span>}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={valores.retratoUrl} alt="" width={48} height={48}
                    onLoadStart={() => { setImagemCarregando(true); setImagemFalhou(false); }}
                    onLoad={() => setImagemCarregando(false)}
                    onError={() => { setImagemCarregando(false); setImagemFalhou(true); }}
                    style={{ display: imagemFalhou ? "none" : undefined }}
                  />
                </div>
              )}
            </label>

            <fieldset className="rv-field">
              <legend>Pontos de Vida</legend>
              <div className="rv-form-linha">
                <label className="rv-field rv-field--estreito">
                  <span>Atual</span>
                  <input type="number" min={0} value={valores.pvAtual ?? ""} onChange={(e) => setValores((v) => ({ ...v, pvAtual: e.target.value === "" ? null : Math.max(0, Number(e.target.value)) }))} />
                </label>
                <label className="rv-field rv-field--estreito">
                  <span>Máximo</span>
                  <input type="number" min={0} value={valores.pvMax ?? ""} onChange={(e) => setValores((v) => ({ ...v, pvMax: e.target.value === "" ? null : Math.max(0, Number(e.target.value)) }))} />
                </label>
              </div>
              {pvInvalido && (
                <p className="rv-form-aviso" role="alert">PV atual não pode ser maior que o PV máximo.</p>
              )}
              {valores.pvAtual !== null && valores.pvMax === null && (
                <p className="rv-field-ajuda">Sem um PV máximo, o token não mostrará barra de vida.</p>
              )}
            </fieldset>

            <fieldset className="rv-field">
              <legend>
                Condições {valores.condicoes.length > 0 && <span className="rv-camadas-tag">{valores.condicoes.length} selecionada{valores.condicoes.length === 1 ? "" : "s"}</span>}
              </legend>
              {valores.condicoes.length > 0 && (
                <button type="button" className="rv-btn rv-btn--ghost rv-limpar-condicoes" onClick={() => setValores((v) => ({ ...v, condicoes: [] }))}>Limpar condições</button>
              )}
              <div className="rv-condicoes-grade">
                {[...CONDICOES_LISTA].sort((a, b) => Number(valores.condicoes.includes(b)) - Number(valores.condicoes.includes(a))).map((c) => (
                  <label key={c} className="rv-condicao-item" title={CONDICOES[c].rotulo}>
                    <input
                      type="checkbox"
                      checked={valores.condicoes.includes(c)}
                      onChange={(e) => setValores((v) => ({
                        ...v,
                        condicoes: e.target.checked ? [...v.condicoes, c] : v.condicoes.filter((x) => x !== c),
                      }))}
                    />
                    <span>{CONDICOES[c].glifo} {CONDICOES[c].rotulo}</span>
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
