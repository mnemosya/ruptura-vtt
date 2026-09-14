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
  renomearPersonagemPainelAction,
  restaurarPersonagemPainelAction,
  type DiretorioPersonagens,
  type EntradaDiretorio,
  type ResumoPersonagem,
} from "./acoes/personagensPainel";
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
  onContador,
  onAdicionarACena,
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
  onContador: (n: number | null) => void;
  /** Abre o Console do Personagem numa janela interna — nunca navega. */
  onAbrirConsole: (characterId: string) => void;
  /** Abre a janela interna de acesso (conceder/remover controle). */
  onConfigurarAcesso: (characterId: string) => void;
  /** Aquecimento no hover/foco. */
  onPrecarregarConsole: () => void;
  /** Cria um token vinculado a este personagem pelo fluxo canônico (posicionamento no mapa). */
  onAdicionarACena: (p: PersonagemArrastado) => void;
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
  const [recolhidas, setRecolhidas] = useState<Set<string>>(new Set());
  const [menu, setMenu] = useState<{ x: number; y: number; itens: ItemMenuContextual[] } | null>(null);
  const [pastaAlvo, setPastaAlvo] = useState<string | null | undefined>(undefined);
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

  useEffect(() => {
    onContador(arvore ? contarEntradas(arvore) : null);
  }, [arvore, onContador]);

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

  function renderizarNo(no: NoDiretorio, nivel: number): React.ReactNode {
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
          />
        )}
        {!recolhida && (
          <>
            {podeAdministrar && idPasta !== null && (
              <div
                className="rv-pn-solta-pasta"
                data-ativo={pastaAlvo === idPasta ? "true" : undefined}
                onDragOver={(e) => {
                  if (!e.dataTransfer.types.includes(MIME_PERSONAGEM_ARRASTADO)) return;
                  e.preventDefault();
                  setPastaAlvo(idPasta);
                }}
                onDragLeave={() => setPastaAlvo(undefined)}
                onDrop={(e) => {
                  const bruto = e.dataTransfer.getData(MIME_PERSONAGEM_ARRASTADO);
                  if (!bruto) return;
                  e.preventDefault();
                  setPastaAlvo(undefined);
                  try {
                    const p = JSON.parse(bruto) as { characterId?: string };
                    if (p.characterId) executar(() => moverPersonagemParaPastaAction(campaignId, p.characterId!, idPasta));
                  } catch {
                    /* arrasto de outro tipo — ignorado */
                  }
                }}
              >
                Soltar aqui para mover
              </div>
            )}
            {no.entradas.length > 0 && (
              <ul className="rv-pn-lista">
                {no.entradas.map((entrada) => {
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
                    subtitulo={entrada.tipo === "pn" ? "PN" : undefined}
                    rodape={
                      pv ? (
                        <>
                          <BarraRecurso id="pv" atual={pv.atual} max={pv.max} />
                          {entrada.pe && <BarraRecurso id="pe" atual={entrada.pe.atual} max={entrada.pe.max} />}
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
                      e.dataTransfer.effectAllowed = "copy";
                    }}
                    onArrastarSobre={(e) => {
                      if (!e.dataTransfer.types.includes(MIME_ITEM_BANDO)) return;
                      e.preventDefault();
                      e.dataTransfer.dropEffect = "move";
                    }}
                    onSoltar={(e) => {
                      const bruto = e.dataTransfer.getData(MIME_ITEM_BANDO);
                      const item = bruto ? desserializarItemBando(bruto) : null;
                      if (!item) return;
                      e.preventDefault();
                      onReceberItemDoBando(item, { id: entrada.characterId, nome: entrada.nome });
                    }}
                    testId="painel-personagens-linha"
                    atributos={{ "data-character-id": entrada.characterId, "data-tipo": entrada.tipo }}
                  />
                  );
                })}
              </ul>
            )}
            {no.subpastas.map((sub) => renderizarNo(sub, nivel + 1))}
          </>
        )}
      </div>
    );
  }

  return (
    <div className="rv-pn-aba">
      <div className="rv-pn-dossie">
        <div className="rv-pn-dossie-lista">
          <BuscaDiretorio
            valor={consulta}
            onMudar={setConsulta}
            rotulo="Buscar personagem por nome"
            placeholder="Buscar personagem…"
            testId="painel-personagens-busca"
          />

          {/* CRIAR MORA EM CIMA, junto da busca e da ordenação: é o que
              se faz COM a lista, e estava no rodapé, longe de onde o
              olho já estava. "Arquivados" fez o caminho inverso — é
              filtro de exceção, consultado uma vez a cada muitas, e
              ocupava o lugar nobre ao lado da ordenação. */}
          <div className="rv-pn-filtros">
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
          </div>

          <div className="rv-pn-scroll" data-testid="painel-personagens-scroll">
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
