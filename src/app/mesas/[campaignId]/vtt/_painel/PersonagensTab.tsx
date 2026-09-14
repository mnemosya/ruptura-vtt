"use client";

/**
 * Personagens — DIRETÓRIO de documentos persistentes (estilo Actors
 * Directory do Foundry), nunca a lista de tokens da cena.
 *
 * O que entra na LINHA: `characters` da campanha que a conta pode ver
 * (narrador: os da campanha; jogador: os que controla — as MESMAS
 * consultas e permissões de sempre, ver `acoes/personagensPainel.ts`).
 * A linha continua deliberadamente pobre — nada de PV, condição, turno
 * ou "está na cena" nela. Um token criado a partir de um personagem é
 * uma INSTÂNCIA da cena; o documento continua aqui, intocado.
 *
 * Arrastar uma linha para o mapa inicia o fluxo CANÔNICO de criação de
 * token (`GerenciadorToken`/`criarTokenAction`, via
 * `onSoltarPersonagemNoMapa` em `VttClient.tsx`) — com fantasma,
 * validação de pegada/terreno/ocupação, giro por Q/E e mensagem de
 * erro. Não existe um segundo caminho de persistência de token.
 *
 * NENHUMA NAVEGAÇÃO. Clicar num personagem abre o Console DENTRO do
 * VTT (`janelas/ConsoleNoVtt.tsx`); "Configurar acesso" abre a janela
 * interna de acesso. O `useRouter` que existia aqui saiu: ele trocava
 * a URL, remontava a árvore e levava junto mapa, câmera e seleção.
 *
 * O hover/foco de uma linha AQUECE o Console (`precarregarConsole`) E
 * busca um RESUMO leve (`lerResumoPersonagemAction` — atributos,
 * PV/PE/Mana, condições ativas) pro dossiê da direita. O dossiê só
 * aparece na JANELA INTERNA larga (`@container pnaba`, ver
 * `painel.css`): na coluna estreita da mesa ele fica oculto de
 * propósito — hover não é gesto em touch, e a lista de pastas continua
 * sendo o conteúdo principal ali. O clique continua abrindo o Console
 * diretamente, em qualquer largura — o dossiê é pré-visualização, não
 * substitui a ficha completa.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Archive,
  ArchiveRestore,
  Copy,
  ExternalLink,
  FolderPlus,
  FolderOpen,
  Folder,
  KeyRound,
  MapPin,
  Pencil,
  Trash2,
  UserPlus,
  UserRound,
} from "lucide-react";
import { MenuContextual, type ItemMenuContextual } from "../_shell/MenuContextual";
import { BotaoAba, BuscaDiretorio, CabecalhoGrupo, LinhaDiretorio, RodapeAcoes } from "./Diretorio";
import { EstadoCarregando, EstadoErro, EstadoVazio } from "./Estados";
import { BotaoTecnico, SecaoDossie } from "./ui/primitivas";
import { COR_RECURSO, ROTULO_RECURSO } from "../../../../ficha/_console/coresRecurso";
import {
  MIME_PASTA_ARRASTADA,
  MIME_PERSONAGEM_ARRASTADO,
  contarEntradas,
  montarArvore,
  serializarPersonagemArrastado,
  siglaDoNome,
  type NoDiretorio,
  type Ordenacao,
  type PersonagemArrastado,
} from "./personagensModelo";
import {
  arquivarPersonagemPainelAction,
  criarPastaAction,
  criarPersonagemPainelAction,
  duplicarPersonagemPainelAction,
  lerDiretorioPersonagensAction,
  lerResumoPersonagemAction,
  moverPersonagemParaPastaAction,
  removerPastaAction,
  renomearPastaAction,
  reordenarPastasAction,
  reordenarPersonagensAction,
  renomearPersonagemPainelAction,
  restaurarPersonagemPainelAction,
  type DiretorioPersonagens,
  type EntradaDiretorio,
  type ResumoPersonagem,
} from "./acoes/personagensPainel";
import { useRolagemVelada } from "../_shell/useRolagemVelada";
import { comecarLeitura, dadosDoEstado, falharLeitura, type EstadoAba } from "./tipos";
import { DialogoConfirmar, DialogoTexto } from "./ui/Dialogo";
import { MIME_ITEM_BANDO, desserializarItemBando, type ItemTransferivel } from "./bandoModelo";

/**
 * Uma barra de recurso na linha do diretório — PV e PE, com o RÓTULO à
 * vista.
 *
 * A barra antiga era anônima e ciano: não dizia o que media, e um
 * personagem com PV cheio parecia ter uma barra de "alguma coisa". As
 * cores vêm de `coresRecurso.ts`, as mesmas do Console — o vermelho do
 * PV na mesa é o vermelho do PV na ficha, e não um vermelho parecido.
 *
 * PV BAIXO não muda a cor da BARRA: ela já é vermelha, e escurecer um
 * vermelho pra dizer "agora é grave" não se lê. Quem avisa é a fração,
 * que passa a âmbar — o mesmo tom que o resto da mesa usa pra alerta.
 */
function BarraRecurso({ id, atual, max }: { id: "pv" | "pe"; atual: number; max: number }) {
  const fracao = max > 0 ? Math.max(0, Math.min(1, atual / max)) : 0;
  const baixo = id === "pv" && max > 0 && fracao < 0.35;
  return (
    <span
      className="rv-pn-linha-rec"
      style={{ ["--rec-cor" as string]: COR_RECURSO[id] }}
      role="img"
      aria-label={`${ROTULO_RECURSO[id]} ${atual} de ${max}`}
    >
      <span className="rv-pn-linha-rec-tag" aria-hidden="true">{ROTULO_RECURSO[id]}</span>
      <span className="rv-pn-linha-rec-trilha" aria-hidden="true"><i style={{ width: `${fracao * 100}%` }} /></span>
      <span className="rv-pn-linha-rec-fracao" data-baixo={baixo ? "true" : undefined} aria-hidden="true">
        {atual}/{max}
      </span>
    </span>
  );
}


export function PersonagensTab({
  campaignId,
  visivel,
  ehNarrador,
  onAdicionarACena,
  onArrastarPersonagem,
  onReceberItemDoBando,
  onAbrirConsole,
  onConfigurarAcesso,
  onPrecarregarConsole,
  onAbrirJanela,
  fixtureVisual,
}: {
  campaignId: string;
  visivel: boolean;
  ehNarrador: boolean;
  /** Abre o Console do Personagem numa janela interna — nunca navega. */
  onAbrirConsole: (characterId: string) => void;
  /** Abre a janela interna de acesso (conceder/remover controle). */
  onConfigurarAcesso: (characterId: string) => void;
  /** Aquecimento no hover/foco. */
  onPrecarregarConsole: () => void;
  /** Cria um token vinculado a este personagem pelo fluxo canônico (posicionamento no mapa). */
  onAdicionarACena: (p: PersonagemArrastado) => void;
  /**
   * Avisa o MAPA de quem está sendo arrastado (e `null` ao terminar).
   * Durante o `dragover` o navegador não deixa ler o `dataTransfer` —
   * só os tipos —, então a prévia do token no mapa depende de a carga
   * chegar por este caminho.
   */
  onArrastarPersonagem?: (p: PersonagemArrastado | null) => void;
  /** Um item do Bando foi solto sobre este personagem — abre a confirmação de transferência. */
  onReceberItemDoBando: (item: ItemTransferivel, personagem: { id: string; nome: string }) => void;
  /** Abre Personagens completo em JANELA INTERNA. `undefined` quando ESTA instância já é a janela. */
  onAbrirJanela?: () => void;
  /**
   * Dados prontos, só para a galeria visual em `/dev/estilos` — nunca
   * usado pela mesa real. Mesmo padrão do `dadosFixos` do
   * `CartaoTokenHover`: sem ele, a única forma de ver esta aba fora de
   * uma campanha seria o estado de erro.
   */
  fixtureVisual?: DiretorioPersonagens;
}) {
  const [estado, setEstado] = useState<EstadoAba<DiretorioPersonagens>>({ fase: "ocioso" });
  const [consulta, setConsulta] = useState("");
  const [ordenacao, setOrdenacao] = useState<Ordenacao>("alfabetica");
  const [incluirArquivados, setIncluirArquivados] = useState(false);
  /**
   * PV e PE ficam ESCONDIDOS por padrão.
   *
   * A lista responde "quem existe nesta campanha"; os números são a
   * pergunta seguinte, e só durante o combate. Ligados sempre, eles
   * dobravam a altura de cada linha e enchiam a coluna de barras
   * coloridas que ninguém estava lendo — e ainda mostravam o PV de
   * todo mundo pra quem só queria achar um nome.
   */
  const [mostrarRecursos, setMostrarRecursos] = useState(false);
  /* O degradê nas pontas da lista — a coluna é alta e a rolagem passa
     despercebida sem ele. Ver `useRolagemVelada`. */
  const veuDaLista = useRolagemVelada<HTMLDivElement>();
  /** Pasta sendo arrastada, e a irmã sob o cursor. */
  const [pastaArrastada, setPastaArrastada] = useState<string | null>(null);
  const [pastaSobre, setPastaSobre] = useState<string | null>(null);
  /**
   * O CONTAINER sob o cursor durante um arrasto — `"__raiz__"` ou o id
   * da pasta.
   *
   * O realce é do container, e não do cartão sob o cursor, porque é ele
   * que responde a pergunta do gesto: "onde isto vai parar?". Acender
   * um personagem específico dizia outra coisa, e uma coisa que não
   * existe — que o arrastado entraria DENTRO daquele personagem.
   */
  const [containerSobre, setContainerSobre] = useState<string | null>(null);
  /**
   * O cartão ANTES do qual o arrastado vai entrar.
   *
   * O container responde "onde vai parar"; isto responde "em que
   * lugar da fila". Sem os dois, soltar no meio de uma lista de quinze
   * era uma aposta — dava pra saber que ia pra raiz, não em que linha.
   * Vale igual dentro da pasta e fora dela, porque a fila é a mesma
   * ideia nos dois lugares.
   */
  const [linhaAlvo, setLinhaAlvo] = useState<string | null>(null);
  const [recolhidas, setRecolhidas] = useState<Set<string>>(new Set());
  const [menu, setMenu] = useState<{ x: number; y: number; itens: ItemMenuContextual[] } | null>(null);
  const [ocupado, setOcupado] = useState(false);
  /**
   * Pedidos de texto e confirmações vivem em ESTADO, não em
   * `window.prompt`/`window.confirm`: os nativos são popup do sistema
   * operacional e bloqueiam a thread (congelando mapa e Realtime).
   */
  const [pedido, setPedido] = useState<{
    titulo: string;
    rotulo: string;
    valorInicial?: string;
    marcacao?: { rotulo: string };
    onConfirmar: (valor: string, marcado: boolean) => void;
  } | null>(null);
  const [confirmacao, setConfirmacao] = useState<{ titulo: string; mensagem: string; rotulo: string; onConfirmar: () => void } | null>(null);
  const jaCarregouRef = useRef(false);

  // ── Prévia do dossiê (só aparece na janela larga; ver `painel.css`) ──
  // Cache DA SESSÃO por personagem: o mesmo hover/foco que já aquece o
  // Console não precisa buscar o resumo de novo se ele já veio.
  const [previaId, setPreviaId] = useState<string | null>(null);
  const [previaEstado, setPreviaEstado] = useState<EstadoAba<ResumoPersonagem>>({ fase: "ocioso" });
  const previaCacheRef = useRef(new Map<string, ResumoPersonagem>());
  const previaSeqRef = useRef(0);

  const previsualizar = useCallback((characterId: string) => {
    setPreviaId(characterId);
    const emCache = previaCacheRef.current.get(characterId);
    if (emCache) {
      previaSeqRef.current += 1;
      setPreviaEstado({ fase: "pronto", dados: emCache });
      return;
    }
    const seq = ++previaSeqRef.current;
    setPreviaEstado((e) => comecarLeitura(e));
    lerResumoPersonagemAction(campaignId, characterId)
      .then((r) => {
        // Hover andou pra outro personagem antes desta resposta chegar —
        // uma prévia mais lenta nunca pode sobrescrever a mais recente.
        if (seq !== previaSeqRef.current) return;
        if (r.ok && r.dados) {
          previaCacheRef.current.set(characterId, r.dados);
          setPreviaEstado({ fase: "pronto", dados: r.dados });
        } else {
          setPreviaEstado((e) => falharLeitura(e, r.erro ?? "Falha ao carregar o resumo."));
        }
      })
      .catch(() => {
        if (seq !== previaSeqRef.current) return;
        setPreviaEstado((e) => falharLeitura(e, "Falha ao carregar o resumo."));
      });
  }, [campaignId]);

  const previaAtual = dadosDoEstado(previaEstado);

  const carregar = useCallback(
    async (comArquivados: boolean) => {
      if (fixtureVisual) { setEstado({ fase: "pronto", dados: fixtureVisual }); return; }
      setEstado((e) => comecarLeitura(e));
      const r = await lerDiretorioPersonagensAction(campaignId, { incluirArquivados: comArquivados });
      setEstado((e) => (r.ok && r.dados ? { fase: "pronto", dados: r.dados } : falharLeitura(e, r.erro ?? "Falha ao carregar o diretório.")));
    },
    [campaignId, fixtureVisual],
  );

  // Carrega SOB DEMANDA: só quando a aba fica visível pela primeira
  // vez. O primeiro render do VTT não paga por este diretório.
  useEffect(() => {
    if (!visivel || jaCarregouRef.current) return;
    jaCarregouRef.current = true;
    carregar(incluirArquivados);
  }, [visivel, carregar, incluirArquivados]);

  useEffect(() => {
    if (!visivel || !jaCarregouRef.current) return;
    function aoFocar() {
      carregar(incluirArquivados);
    }
    window.addEventListener("focus", aoFocar);
    return () => window.removeEventListener("focus", aoFocar);
  }, [visivel, carregar, incluirArquivados]);

  const dados = dadosDoEstado(estado);
  const arvore = useMemo<NoDiretorio | null>(
    () =>
      dados
        ? montarArvore({ pastas: dados.pastas, entradas: dados.entradas, consulta, ordenacao, incluirArquivados })
        : null,
    [dados, consulta, ordenacao, incluirArquivados],
  );


  const podeAdministrar = !!dados?.podeAdministrar && ehNarrador;



  async function executar(acao: () => Promise<{ ok: boolean; erro?: string }>) {
    setOcupado(true);
    try {
      const r = await acao();
      if (!r.ok) {
        setEstado((e) => falharLeitura(e, r.erro ?? "A operação foi recusada."));
        return;
      }
      await carregar(incluirArquivados);
    } finally {
      setOcupado(false);
    }
  }

  function menuDaEntrada(e: React.MouseEvent, entrada: EntradaDiretorio) {
    e.preventDefault();
    e.stopPropagation();
    const itens: ItemMenuContextual[] = [
      { id: "abrir", rotulo: "Abrir ficha", icone: <UserRound size={14} />, onSelecionar: () => onAbrirConsole(entrada.characterId) },
    ];
    if (podeAdministrar && !entrada.arquivado) {
      itens.push(
        {
          id: "cena",
          rotulo: "Adicionar à cena",
          icone: <MapPin size={14} />,
          separadorAntes: true,
          onSelecionar: () =>
            onAdicionarACena({
              characterId: entrada.characterId,
              nome: entrada.nome,
              sigla: siglaDoNome(entrada.nome),
              tipo: entrada.tipo,
            }),
        },
        {
          id: "renomear",
          rotulo: "Renomear",
          icone: <Pencil size={14} />,
          separadorAntes: true,
          onSelecionar: () =>
            setPedido({
              titulo: "Renomear personagem",
              rotulo: "Novo nome",
              valorInicial: entrada.nome,
              onConfirmar: (novo) => {
                if (novo === entrada.nome) return;
                executar(() => renomearPersonagemPainelAction(campaignId, entrada.characterId, novo));
              },
            }),
        },
        {
          id: "duplicar",
          rotulo: "Duplicar",
          icone: <Copy size={14} />,
          onSelecionar: () => executar(() => duplicarPersonagemPainelAction(campaignId, entrada.characterId)),
        },
        {
          id: "raiz",
          rotulo: "Mover para a raiz",
          icone: <FolderOpen size={14} />,
          desabilitado: entrada.pastaId === null,
          dica: entrada.pastaId === null ? "Já está na raiz do diretório." : undefined,
          onSelecionar: () => executar(() => moverPersonagemParaPastaAction(campaignId, entrada.characterId, null)),
        },
        {
          id: "acesso",
          rotulo: "Configurar acesso…",
          icone: <KeyRound size={14} />,
          separadorAntes: true,
          dica: "Abre a janela de acesso — conceder ou remover controle, sem sair da Mesa.",
          onSelecionar: () => onConfigurarAcesso(entrada.characterId),
        },
        {
          id: "arquivar",
          rotulo: "Arquivar",
          icone: <Archive size={14} />,
          perigoso: true,
          separadorAntes: true,
          onSelecionar: () =>
            setConfirmacao({
              titulo: "Arquivar personagem",
              mensagem: `Arquivar "${entrada.nome}"? Ele sai do diretório normal, mas nada é apagado — dá para restaurar pelo filtro de arquivados.`,
              rotulo: "Arquivar",
              onConfirmar: () => executar(() => arquivarPersonagemPainelAction(campaignId, entrada.characterId)),
            }),
        },
      );
    }
    if (podeAdministrar && entrada.arquivado) {
      itens.push({
        id: "restaurar",
        rotulo: "Restaurar",
        icone: <ArchiveRestore size={14} />,
        separadorAntes: true,
        onSelecionar: () => executar(() => restaurarPersonagemPainelAction(campaignId, entrada.characterId)),
      });
    }
    setMenu({ x: e.clientX, y: e.clientY, itens });
  }

  function menuDaPasta(e: React.MouseEvent, pastaId: string, nome: string) {
    if (!podeAdministrar) return;
    e.preventDefault();
    e.stopPropagation();
    setMenu({
      x: e.clientX,
      y: e.clientY,
      itens: [
        {
          id: "renomear",
          rotulo: "Renomear pasta",
          icone: <Pencil size={14} />,
          onSelecionar: () =>
            setPedido({
              titulo: "Renomear pasta",
              rotulo: "Novo nome",
              valorInicial: nome,
              onConfirmar: (novo) => {
                if (novo === nome) return;
                executar(() => renomearPastaAction(campaignId, pastaId, novo));
              },
            }),
        },
        {
          id: "subpasta",
          rotulo: "Nova subpasta",
          icone: <FolderPlus size={14} />,
          onSelecionar: () =>
            setPedido({
              titulo: "Nova subpasta",
              rotulo: "Nome da subpasta",
              onConfirmar: (nomeNovo) => executar(() => criarPastaAction(campaignId, nomeNovo, pastaId)),
            }),
        },
        {
          id: "remover",
          rotulo: "Remover pasta",
          icone: <Trash2 size={14} />,
          perigoso: true,
          separadorAntes: true,
          dica: "Os personagens voltam para a raiz — nenhum é apagado.",
          onSelecionar: () =>
            setConfirmacao({
              titulo: "Remover pasta",
              mensagem: `Remover a pasta "${nome}"? Os personagens dela voltam para a raiz — nenhum é apagado.`,
              rotulo: "Remover pasta",
              onConfirmar: () => executar(() => removerPastaAction(campaignId, pastaId)),
            }),
        },
      ],
    });
  }

  function alternarPasta(id: string) {
    setRecolhidas((s) => {
      const proximo = new Set(s);
      if (proximo.has(id)) proximo.delete(id);
      else proximo.add(id);
      return proximo;
    });
  }

  /**
   * A SEQUÊNCIA COMBINADA de um nó: pastas e personagens numa fila só,
   * ordenados pela `posicao` que cada um guarda.
   *
   * Antes as pastas eram desenhadas DEPOIS de todas as entradas, como
   * dois blocos. Isso não é uma escolha de layout, é uma limitação que
   * vazava pro gesto: a pasta ficava presa no fim da lista e arrastá-la
   * pra cima era impossível — não havia posição acima dos cartões pra
   * ela ocupar.
   *
   * Os dois `posicao` vivem em tabelas diferentes
   * (`campaign_character_folders` e `campaign_character_placements`) e
   * não conhecem um ao outro. O que os junta é serem escritos SEMPRE
   * com o índice da fila combinada — quem reordena grava os dois lados,
   * então a fila que a tela mostra é a fila que o banco guarda. Empate
   * resolve com a pasta antes, por ser container.
   *
   * Só vale na ordem MANUAL: em A–Z o alfabeto manda e pastas voltam a
   * vir primeiro, que é o agrupamento que se espera de uma lista
   * alfabética.
   */
  type ItemDoNo =
    | { tipo: "pasta"; posicao: number; pasta: NoDiretorio }
    | { tipo: "entrada"; posicao: number; entrada: EntradaDiretorio };

  function filhosDoNo(no: NoDiretorio): ItemDoNo[] {
    const pastas: ItemDoNo[] = no.subpastas.map((sub) => ({
      tipo: "pasta" as const, posicao: sub.pasta?.posicao ?? 0, pasta: sub,
    }));
    const entradas: ItemDoNo[] = no.entradas.map((e) => ({
      tipo: "entrada" as const, posicao: e.posicao ?? 0, entrada: e,
    }));
    if (ordenacao !== "manual") return [...pastas, ...entradas];
    return [...pastas, ...entradas].sort((a, b) =>
      a.posicao !== b.posicao ? a.posicao - b.posicao : (a.tipo === "pasta" ? -1 : 1),
    );
  }

  /**
   * Grava a fila combinada: cada item recebe o índice dela, pastas por
   * uma ação e personagens por outra. Duas escritas, uma ordem só.
   */
  async function gravarFila(no: NoDiretorio, fila: ItemDoNo[]) {
    const pastaDoNo = no.pasta?.id ?? null;
    const pastas: { pastaId: string; posicao: number }[] = [];
    const entradas: { characterId: string; pastaId: string | null; posicao: number }[] = [];
    fila.forEach((item, i) => {
      if (item.tipo === "pasta") {
        if (item.pasta.pasta) pastas.push({ pastaId: item.pasta.pasta.id, posicao: i });
      } else {
        entradas.push({ characterId: item.entrada.characterId, pastaId: pastaDoNo, posicao: i });
      }
    });
    // Arrastar É a declaração de que a ordem passa a ser sua. Sem isto o
    // gesto era mudo: a ordem ia pro banco e a lista continuava em A–Z.
    setOrdenacao("manual");
    await executar(async () => {
      const r = await reordenarPastasAction(campaignId, pastas);
      if (!r.ok) return r;
      return reordenarPersonagensAction(campaignId, entradas);
    });
  }

  /** O id de um item da fila, seja pasta ou personagem. */
  function idDoItem(i: ItemDoNo): string {
    return i.tipo === "pasta" ? i.pasta.pasta!.id : i.entrada.characterId;
  }

  /**
   * Move um item da fila pra posição de outro — o gesto único desta
   * lista, valendo igual pra pasta e pra personagem.
   *
   * Quando o arrastado NÃO está nesta fila, ele vem de outra pasta: aí
   * o movimento é de entrada, e ele entra na posição do alvo. Isso só
   * vale pra personagem; pasta muda de pai por outro caminho, e
   * reaninhar num arrasto que também reordena faria o mesmo gesto
   * significar duas coisas.
   */
  function moverNaFila(no: NoDiretorio, idArrastado: string, idAlvo: string) {
    if (idArrastado === idAlvo) return;
    const fila = filhosDoNo(no);
    const destino = fila.findIndex((i) => idDoItem(i) === idAlvo);
    if (destino < 0) return;

    const origem = fila.find((i) => idDoItem(i) === idArrastado);
    if (origem) {
      const sem = fila.filter((i) => idDoItem(i) !== idArrastado);
      sem.splice(sem.findIndex((i) => idDoItem(i) === idAlvo), 0, origem);
      void gravarFila(no, sem);
      return;
    }

    const deFora = dados?.entradas.find((e) => e.characterId === idArrastado);
    if (!deFora) return;
    const comEle = [...fila];
    comEle.splice(destino, 0, { tipo: "entrada", posicao: destino, entrada: deFora });
    void gravarFila(no, comEle);
  }

  /**
   * Uma linha de personagem. Extraída do `map` porque a lista deixou
   * de ser um bloco só: pastas e personagens se intercalam, e cada
   * corrida de personagens vira uma `<ul>` própria.
   */
  function renderizarEntrada(entrada: EntradaDiretorio, no: NoDiretorio, nivel: number): React.ReactNode {
                const acento = entrada.tipo === "pn" ? "var(--rv-dg)" : "var(--rv-cy)";
                const pv = entrada.pv;
                return (
                <LinhaDiretorio
                  key={entrada.characterId}
                  /* O ROSTO quando existe, a sigla quando não. A ficha
                     já tem avatar e a mesa já o mostra no token;
                     reconhecer o personagem por três letras era o
                     painel sendo o único lugar que não o usava. */
                  face={entrada.avatarUrl
                    ? <img className="rv-pn-face-img" src={entrada.avatarUrl} alt="" />
                    : (siglaDoNome(entrada.nome) || "?")}
                  nome={entrada.nome}
                  nivel={nivel}
                  acento={acento}
                  /* PJ e PN, sempre — os dois. Só o PN era marcado, e
                     isso fazia a ausência de etiqueta significar "é do
                     jogador": informação por omissão, que quem chega
                     depois não tem como ler. Com as duas à vista, a
                     coluna responde de quem é cada personagem. */
                  subtitulo={entrada.tipo === "pn" ? "PN" : "PJ"}
                  rodape={
                    (mostrarRecursos && pv) || entrada.condicoes ? (
                      <>
                        {mostrarRecursos && pv && <BarraRecurso id="pv" atual={pv.atual} max={pv.max} />}
                        {mostrarRecursos && entrada.pe && (
                          <BarraRecurso id="pe" atual={entrada.pe.atual} max={entrada.pe.max} />
                        )}
                        {/* As CONDIÇÕES não são recurso: são estado que
                            muda a decisão de quem olha a lista, e
                            continuam visíveis com o switch desligado. */}
                        {!!entrada.condicoes && (
                          <span className="rv-pn-linha-cond">{entrada.condicoes} cond.</span>
                        )}
                      </>
                    ) : undefined
                  }
                  marca={
                    entrada.arquivado ? (
                      <span className="rv-pn-tag">arquivado</span>
                    ) : entrada.controladores != null && entrada.controladores > 0 ? (
                      <span className="rv-pn-tag" title="Controlado por um jogador">controlado</span>
                    ) : undefined
                  }
                  selecionado={previaId === entrada.characterId}
                  onAbrir={() => onAbrirConsole(entrada.characterId)}
                  onAquecer={() => {
                    onPrecarregarConsole();
                    previsualizar(entrada.characterId);
                  }}
                  onMenuContextual={(e) => menuDaEntrada(e, entrada)}
                  arrastavel={podeAdministrar && !entrada.arquivado}
                  onArrastarInicio={(e) => {
                    const carga: PersonagemArrastado = {
                      characterId: entrada.characterId,
                      nome: entrada.nome,
                      sigla: siglaDoNome(entrada.nome),
                      tipo: entrada.tipo,
                    };
                    e.dataTransfer.setData(MIME_PERSONAGEM_ARRASTADO, serializarPersonagemArrastado(carga));
                    /* `copyMove`, e isto NÃO é detalhe: o mesmo arrasto
                       termina de duas formas — soltar no MAPA cria um
                       token (cópia, o personagem continua na lista) e
                       soltar numa PASTA ou noutro cartão move.

                       Com `effectAllowed = "copy"`, como estava, o
                       destino que pedia `dropEffect = "move"` formava um
                       par inválido e o navegador RECUSAVA o drop antes
                       de ele existir: o `onDrop` da pasta nunca
                       disparava, e arrastar pra dentro dela não fazia
                       nada. Quem escolhe o efeito é cada destino; a
                       origem só declara o que é permitido. */
                    e.dataTransfer.effectAllowed = "copyMove";
                    /* QUEM está sendo arrastado, pra fora do painel. O
                       mapa precisa disso pra desenhar a prévia do token
                       enquanto o arrasto passa por cima dele: durante o
                       `dragover` o navegador não deixa LER o
                       `dataTransfer` (só os tipos), então a carga tem
                       que chegar por outro caminho. */
                    onArrastarPersonagem?.(carga);
                  }}
                  onArrastarFim={() => { setContainerSobre(null); setPastaSobre(null); setLinhaAlvo(null); onArrastarPersonagem?.(null); }}
                  onArrastarSaiu={() => { setContainerSobre(null); setLinhaAlvo(null); }}
                  onArrastarSobre={(e) => {
                    // DOIS arrastos chegam nesta linha: um item do
                    // Bando (vira posse do personagem) e outro
                    // personagem (reordena). O tipo do dado decide —
                    // e é ele que é lido, não a aparência do cursor.
                    // A PASTA TAMBÉM ATRAVESSA. Sem isto ela ficava
                    // presa no fim da lista: os cartões recusavam o
                    // arrasto, e não havia posição acima deles pra ela
                    // ocupar.
                    if (podeAdministrar
                      && (e.dataTransfer.types.includes(MIME_PERSONAGEM_ARRASTADO)
                        || e.dataTransfer.types.includes(MIME_PASTA_ARRASTADA))) {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = "move";
                      setContainerSobre(no.pasta?.id ?? "__raiz__");
                      setLinhaAlvo(entrada.characterId);
                      return;
                    }
                    if (!e.dataTransfer.types.includes(MIME_ITEM_BANDO)) return;
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                  }}
                  onSoltar={(e) => {
                    setContainerSobre(null);
                    setLinhaAlvo(null);
                    const pastaVindo = e.dataTransfer.getData(MIME_PASTA_ARRASTADA);
                    if (pastaVindo && podeAdministrar) {
                      e.preventDefault();
                      setPastaArrastada(null);
                      moverNaFila(no, pastaVindo, entrada.characterId);
                      return;
                    }
                    const arrastado = e.dataTransfer.getData(MIME_PERSONAGEM_ARRASTADO);
                    if (arrastado && podeAdministrar) {
                      e.preventDefault();
                      try {
                        const carga = JSON.parse(arrastado) as { characterId?: string };
                        if (carga.characterId) moverNaFila(no, carga.characterId, entrada.characterId);
                      } catch { /* arrasto de outro tipo — ignorado */ }
                      return;
                    }
                    const bruto = e.dataTransfer.getData(MIME_ITEM_BANDO);
                    const item = bruto ? desserializarItemBando(bruto) : null;
                    if (!item) return;
                    e.preventDefault();
                    onReceberItemDoBando(item, { id: entrada.characterId, nome: entrada.nome });
                  }}
                  testId="painel-personagens-linha"
                  atributos={{
                    "data-character-id": entrada.characterId,
                    "data-tipo": entrada.tipo,
                    // A marca da linha vai por `atributos` em vez de
                    // virar prop nova: é decoração desta aba, e
                    // `LinhaDiretorio` serve outras três.
                    "data-insercao": linhaAlvo === entrada.characterId ? "true" : undefined,
                  }}
                />
    );
  }
  /**
   * `pai` é quem tem a FILA onde o cabeçalho deste nó vive: uma pasta
   * se ordena entre as irmãs, e as irmãs são filhas do pai. A raiz não
   * desenha cabeçalho, então lá ele nunca é usado.
   */
  function renderizarNo(no: NoDiretorio, nivel: number, pai?: NoDiretorio): React.ReactNode {
    const idPasta = no.pasta?.id ?? null;
    const recolhida = idPasta !== null && recolhidas.has(idPasta);
    return (
      <div key={idPasta ?? "__raiz__"} className="rv-pn-no">
        {no.pasta && (
          <CabecalhoGrupo
            rotulo={no.pasta.nome}
            contagem={contarEntradas(no)}
            aberto={!recolhida}
            nivel={nivel}
            glifo={recolhida ? <Folder size={13} /> : <FolderOpen size={13} />}
            onAlternar={() => alternarPasta(no.pasta!.id)}
            onMenuContextual={(e) => menuDaPasta(e, no.pasta!.id, no.pasta!.nome)}
            testId="painel-personagens-pasta"
            arrastavel={podeAdministrar}
            arrastando={pastaArrastada === no.pasta.id}
            alvoDeSolta={pastaSobre === no.pasta.id || containerSobre === no.pasta.id}
            onArrastarInicio={(e) => {
              setPastaArrastada(no.pasta!.id);
              e.dataTransfer.setData(MIME_PASTA_ARRASTADA, no.pasta!.id);
              e.dataTransfer.effectAllowed = "move";
            }}
            onArrastarFim={() => { setPastaArrastada(null); setPastaSobre(null); setContainerSobre(null); setLinhaAlvo(null); }}
            onArrastarSobre={(e) => {
              if (!podeAdministrar) return;
              if (!e.dataTransfer.types.includes(MIME_PASTA_ARRASTADA)
                && !e.dataTransfer.types.includes(MIME_PERSONAGEM_ARRASTADO)) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              setPastaSobre(no.pasta!.id);
            }}
            onSoltar={(e) => {
              if (!podeAdministrar) return;
              setPastaArrastada(null);
              setPastaSobre(null);
              const idPastaArrastada = e.dataTransfer.getData(MIME_PASTA_ARRASTADA);
              if (idPastaArrastada) {
                e.preventDefault();
                if (pai) moverNaFila(pai, idPastaArrastada, no.pasta!.id);
                return;
              }
              // Personagem solto NA PASTA continua significando "entra
              // nela" — é o gesto que já existia, e o cabeçalho é a
              // porta dela.
              const bruto = e.dataTransfer.getData(MIME_PERSONAGEM_ARRASTADO);
              if (!bruto) return;
              e.preventDefault();
              try {
                const c = JSON.parse(bruto) as { characterId?: string };
                if (c.characterId) executar(() => moverPersonagemParaPastaAction(campaignId, c.characterId!, no.pasta!.id));
              } catch { /* arrasto de outro tipo — ignorado */ }
            }}
          />
        )}
        {!recolhida && (
          <>
            {/* A FILA COMBINADA na tela. Corridas de personagens viram
                uma `<ul>` cada; a pasta que aparece no meio corta a
                lista e recomeça a próxima. É isto que dá à pasta uma
                posição ACIMA dos cartões pra ocupar. */}
            {(() => {
              const blocos: React.ReactNode[] = [];
              let corrida: EntradaDiretorio[] = [];
              const fecharCorrida = () => {
                if (corrida.length === 0) return;
                const desta = corrida;
                blocos.push(
                  <ul className="rv-pn-lista" key={`lista-${desta[0].characterId}`}>
                    {desta.map((e) => renderizarEntrada(e, no, nivel))}
                  </ul>,
                );
                corrida = [];
              };
              for (const item of filhosDoNo(no)) {
                if (item.tipo === "entrada") { corrida.push(item.entrada); continue; }
                fecharCorrida();
                blocos.push(renderizarNo(item.pasta, nivel + 1, no));
              }
              fecharCorrida();
              return blocos;
            })()}
          </>
        )}
      </div>
    );
  }

  return (
    <div className="rv-pn-aba">
      <div className="rv-pn-dossie">
        <div className="rv-pn-dossie-lista">
          {/* LINHA 1 — achar. A busca cresce, a ordenação fica no canto:
              as duas respondem "como eu chego no personagem certo", e
              separá-las em duas faixas gastava uma linha inteira num
              seletor de dois valores. */}
          <div className="rv-pn-linha-busca">
            <BuscaDiretorio
              valor={consulta}
              onMudar={setConsulta}
              rotulo="Buscar personagem por nome"
              placeholder="Buscar personagem…"
              testId="painel-personagens-busca"
            />
            <label className="rv-sr-only" htmlFor="rv-pers-ordem">Ordenação</label>
            <select
              id="rv-pers-ordem"
              className="rv-pn-select"
              value={ordenacao}
              onChange={(e) => setOrdenacao(e.target.value as Ordenacao)}
              data-testid="painel-personagens-ordem"
            >
              <option value="alfabetica">A–Z</option>
              <option value="manual">Manual</option>
            </select>
          </div>

          {/* LINHA 2 — o que se FAZ com a lista: criar à esquerda, o
              switch de recursos no canto oposto. Criar estava no
              rodapé, longe de onde o olho já está; "Arquivados" fez o
              caminho inverso, porque é filtro de exceção. */}
          <div className="rv-pn-filtros">
            {podeAdministrar && (
              <span className="rv-pn-filtros-acoes">
                <BotaoAba
                  desabilitado={ocupado}
                  testId="painel-personagens-criar"
                  onClick={() =>
                    setPedido({
                      titulo: "Novo personagem",
                      rotulo: "Nome",
                      marcacao: { rotulo: "É um PN (personagem do narrador)" },
                      onConfirmar: (nome, ehPn) => executar(() => criarPersonagemPainelAction(campaignId, nome, ehPn ? "pn" : "jogador")),
                    })
                  }
                >
                  <UserPlus size={13} /> Personagem
                </BotaoAba>
                <BotaoAba
                  desabilitado={ocupado}
                  testId="painel-personagens-nova-pasta"
                  onClick={() =>
                    setPedido({
                      titulo: "Nova pasta",
                      rotulo: "Nome da pasta",
                      onConfirmar: (nome) => executar(() => criarPastaAction(campaignId, nome, null)),
                    })
                  }
                >
                  <FolderPlus size={13} /> Pasta
                </BotaoAba>
              </span>
            )}
            <label className="rv-fp-switch rv-pn-switch">
            <input
              type="checkbox"
              checked={mostrarRecursos}
              onChange={(e) => setMostrarRecursos(e.target.checked)}
              data-testid="painel-personagens-recursos"
            />
            <span className="rv-fp-switch-tr" aria-hidden="true" />
              <span className="rv-fp-switch-txt">Recursos</span>
            </label>
          </div>

          <div
            {...veuDaLista.atributos}
            className="rv-pn-scroll rv-pn-scroll--pers"
            /* A RAIZ também é um container, e precisa acender como as
               pastas — é pra ela que o personagem volta quando sai de
               uma. Não tendo caixa própria, quem acende é a área. */
            data-alvo-raiz={containerSobre === "__raiz__" ? "true" : undefined}
            /* A largura do avatar acompanha o modo — ver `.rv-pn-face`
               em `painel.css`, que explica por que não é `aspect-ratio`. */
            data-recursos={mostrarRecursos ? "true" : undefined}
            data-testid="painel-personagens-scroll"
          >
            {estado.fase === "carregando" && <EstadoCarregando testId="painel-personagens-carregando" />}
            {estado.fase === "erro" && (
              <EstadoErro
                mensagem={estado.mensagem}
                onTentarDeNovo={() => carregar(incluirArquivados)}
                testId="painel-personagens-erro"
              />
            )}
            {arvore && contarEntradas(arvore) === 0 && estado.fase !== "carregando" && (
              <EstadoVazio testId="painel-personagens-vazio">
                {consulta.trim()
                  ? "Nenhum personagem com esse nome."
                  : ehNarrador
                    ? "Nenhum personagem nesta campanha ainda."
                    : "Você ainda não controla um personagem nesta campanha."}
              </EstadoVazio>
            )}
            {arvore && renderizarNo(arvore, 0)}
          </div>

          {/* O RODAPÉ é do narrador. Pro jogador sobrava uma faixa com
              um botão só ("Atualizar"), que agora não existe: a lista
              recarrega sozinha a cada ação e a cada abertura, então o
              botão só dava a entender que ela poderia estar velha.
              "Abrir Personagens" continua, porque leva pra outra tela. */}
          {podeAdministrar && (
            <RodapeAcoes>
              {onAbrirJanela && (
                <BotaoAba onClick={onAbrirJanela} testId="painel-personagens-abrir">
                  <ExternalLink size={13} /> Abrir Personagens
                </BotaoAba>
              )}
              <label className="rv-pn-check">
                <input
                  type="checkbox"
                  checked={incluirArquivados}
                  onChange={(e) => {
                    setIncluirArquivados(e.target.checked);
                    carregar(e.target.checked);
                  }}
                  data-testid="painel-personagens-arquivados"
                />
                Arquivados
              </label>
            </RodapeAcoes>
          )}
        </div>

        {/* Só aparece na janela larga (ver `painel.css`) — na coluna
            estreita da mesa fica sempre oculto de propósito. */}
        <div className="rv-pn-dossie-detalhe">
          {!previaId && (
            <div className="rv-pn-dossie-vazio">
              <UserRound size={22} aria-hidden="true" style={{ opacity: 0.4 }} />
              <strong>Passe o mouse num personagem</strong>
              <span>O resumo aparece aqui — o clique abre a ficha completa.</span>
            </div>
          )}
          {previaId && (
            <>
              {previaEstado.fase === "carregando" && !previaAtual && (
                <div className="rv-pn-scroll" data-testid="painel-personagens-previa"><EstadoCarregando /></div>
              )}
              {previaEstado.fase === "erro" && !previaAtual && (
                <div className="rv-pn-scroll" data-testid="painel-personagens-previa">
                  <EstadoErro mensagem={previaEstado.mensagem} testId="painel-personagens-previa-erro" />
                </div>
              )}
              {previaAtual && (
                <div
                  className="rv-fg-card"
                  data-testid="painel-personagens-previa"
                  style={{ "--fg-a": previaAtual.tipo === "pn" ? "var(--rv-dg)" : "var(--rv-cy)" } as React.CSSProperties}
                >
                  <div className="rv-fg-brackets" aria-hidden="true">
                    <span className="rv-fg-bk-tl" /><span className="rv-fg-bk-tr" /><span className="rv-fg-bk-bl" /><span className="rv-fg-bk-br" />
                  </div>
                  <div className="rv-fg-espinha">
                    <span className="rv-fg-espinha-topo">{siglaDoNome(previaAtual.nome) || "?"}</span>
                    <span className="rv-fg-espinha-rotulo">Ficha</span>
                    <span className="rv-fg-espinha-ponto" />
                  </div>
                  <div className="rv-fg-corpo">
                    <div className="rv-fg-cab">
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <h3 className="rv-pn-detalhe-titulo">{previaAtual.nome}</h3>
                        <div className="rv-pn-detalhe-sub"><i />{previaAtual.tipo === "pn" ? "PN" : "Jogador"}</div>
                      </div>
                      <span className="rv-fg-cab-selo">{previaAtual.tipo === "pn" ? "PN" : "PJ"}</span>
                    </div>

                    <div className="rv-fg-scroll">
                      <SecaoDossie n="01" titulo="Recursos">
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
                          {(
                            [
                              ["PV", previaAtual.recursos.pv, "var(--rv-cy)"],
                              ["PE", previaAtual.recursos.pe, "var(--rv-am)"],
                              ["Mana", previaAtual.recursos.mana, "var(--rv-ar)"],
                            ] as const
                          ).map(([rotulo, r, cor]) => (
                            <div key={rotulo} className="rv-fg-stattile" style={{ "--fg-a": cor } as React.CSSProperties}>
                              <div className="rv-fg-stattile-inner">
                                <div className="rv-fg-stattile-rotulo">{rotulo}</div>
                                <div className="rv-fg-stattile-valor">{r.atual}<span className="rv-fg-stattile-sub"> / {r.max}</span></div>
                                <div style={{ marginTop: 6 }}>
                                  <div className="rv-fg-barra" style={{ "--fg-a": cor } as React.CSSProperties}>
                                    <i style={{ width: `${r.max > 0 ? Math.max(0, Math.min(1, r.atual / r.max)) * 100 : 0}%` }} />
                                  </div>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </SecaoDossie>

                      <SecaoDossie n="02" titulo="Atributos">
                        <div className="rv-fg-statgrid" style={{ "--rv-fg-cols": 3 } as React.CSSProperties}>
                          <div className="rv-fg-statcell"><b>{previaAtual.atributos.corpo}</b><span>Corpo</span></div>
                          <div className="rv-fg-statcell"><b>{previaAtual.atributos.mente}</b><span>Mente</span></div>
                          <div className="rv-fg-statcell"><b>{previaAtual.atributos.animo}</b><span>Ânimo</span></div>
                        </div>
                      </SecaoDossie>

                      <SecaoDossie n="03" titulo="Condições">
                        {previaAtual.condicoesAtivas.length === 0 ? (
                          <EstadoVazio>Sem condições ativas.</EstadoVazio>
                        ) : (
                          <div className="rv-fg-chips">
                            {previaAtual.condicoesAtivas.map((c, i) => (
                              <span key={i} className="rv-fg-chip" style={{ "--fg-a": "var(--rv-am)" } as React.CSSProperties}>{c}</span>
                            ))}
                          </div>
                        )}
                      </SecaoDossie>

                      <SecaoDossie n="04" titulo="Ficha">
                        <div className="rv-fg-statgrid" style={{ "--rv-fg-cols": 3 } as React.CSSProperties}>
                          <div className="rv-fg-statcell"><b>{previaAtual.contadores.talentos}</b><span>Talentos</span></div>
                          <div className="rv-fg-statcell"><b>{previaAtual.contadores.magias}</b><span>Magias</span></div>
                          <div className="rv-fg-statcell"><b>{previaAtual.contadores.itens}</b><span>Itens</span></div>
                        </div>
                      </SecaoDossie>

                      <BotaoTecnico primario onClick={() => onAbrirConsole(previaAtual.characterId)} testId="painel-personagens-previa-abrir-ficha">
                        Abrir ficha completa
                      </BotaoTecnico>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <MenuContextual
        posicao={menu ? { x: menu.x, y: menu.y } : null}
        itens={menu?.itens ?? []}
        onFechar={() => setMenu(null)}
      />

      <DialogoTexto
        aberto={pedido !== null}
        titulo={pedido?.titulo ?? ""}
        rotulo={pedido?.rotulo ?? ""}
        valorInicial={pedido?.valorInicial ?? ""}
        marcacao={pedido?.marcacao}
        onConfirmar={(valor, marcado) => {
          pedido?.onConfirmar(valor, marcado);
          setPedido(null);
        }}
        onCancelar={() => setPedido(null)}
        testId="painel-personagens-dialogo"
      />
      <DialogoConfirmar
        aberto={confirmacao !== null}
        titulo={confirmacao?.titulo ?? ""}
        mensagem={confirmacao?.mensagem ?? ""}
        rotuloConfirmar={confirmacao?.rotulo ?? "Confirmar"}
        onConfirmar={() => confirmacao?.onConfirmar()}
        onCancelar={() => setConfirmacao(null)}
        testId="painel-personagens-confirmar"
      />
    </div>
  );
}
