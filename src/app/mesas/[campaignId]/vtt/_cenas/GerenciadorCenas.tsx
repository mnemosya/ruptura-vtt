"use client";

/**
 * O CATÁLOGO DE CENAS — a janela do narrador.
 *
 * A Fase 1 pôs no banco tudo que esta janela consome (`list_vtt_scenes`,
 * `create_vtt_scene`, `reorder_vtt_scenes`, `set_vtt_scene_config`) e
 * separou a cena apresentada da cena existente. Aqui essa separação
 * vira gesto: clicar num cartão ABRE a cena pra quem prepara, e a mesa
 * não se move.
 *
 * Listar, criar, renomear, abrir e reordenar (fase 2); apresentar
 * (fase 3). Duplicar, arquivar, excluir e miniatura são da 4.
 *
 * ABRIR e APRESENTAR são gestos separados e é essa separação que a
 * janela inteira existe pra oferecer: o primeiro move só quem prepara,
 * o segundo move a mesa. Por isso apresentar tem botão próprio em vez
 * de ser o que acontece ao clicar num cartão.
 *
 * Criar é um formulário DENTRO da janela, não um diálogo por cima.
 * A janela já é uma superfície flutuante; empilhar um modal sobre ela
 * obrigaria a resolver foco, empilhamento e fechamento em cascata pra
 * um formulário de um campo só. Quando criar ganhar tamanho de grade,
 * pasta e cena-modelo (Fase 5), aí o diálogo se paga.
 *
 * Esta janela é do NARRADOR. Não há verificação de papel aqui porque
 * ela não é a garantia: `list_vtt_scenes` não conta ao jogador que
 * existem outras cenas, e as RPCs de escrita recusam quem não é dono.
 * Quem decide montar é o `VttClient`, e o servidor não depende disso.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  AlertTriangle, Archive, ChevronDown, Clapperboard, FilePlus2, FolderPlus, ImagePlus, Loader2, Plus, Search, Undo2, X,
} from "lucide-react";
import { CartaoCena } from "./CartaoCena";
import { MiniCartaoCena } from "./MiniCartaoCena";
import { MIME_JOGADOR, TrilhoJogadores } from "./TrilhoJogadores";
import { ParametrosCena, type ValoresParametros } from "./ParametrosCena";
import {
  apresentarCenaAction, arquivarCenaAction, criarCenaAction, criarPastaAction,
  duplicarCenaAction, excluirCenaAction, excluirPastaAction, listarCenasAction,
  arquivarPastaAction, desarquivarPastaAction, listarPastasAction, listarPosicoesJogadoresAction, moverCenaParaPastaAction,
  moverJogadoresAction, reagruparJogadoresAction, renomearPastaAction,
  reordenarCenasAction, restaurarCenaAction, salvarConfigCenaAction,
} from "../_acoes/sceneActions";
import {
  assinarImagensAction, cancelarUploadAction, criarImagemCenaAction,
  finalizarUploadCenaAction, reservarUploadAction,
} from "../_acoes/imageActions";
import {
  type ImagemPreparada, ImagemRecusadaError,
  enviarParaUrlAssinada, prepararImagem,
} from "../../../../../lib/vtt/imagePreparation";
import { NovaCena, type ValoresNovaCena } from "./NovaCena";
import { caixaDaGrade } from "../_dominio/imagemCena";
import { GavetaCasca } from "./GavetaCasca";
import { LinhaPasta } from "./LinhaPasta";
import type {
  CartaoCena as DadosCartaoCena, CenaVtt, ModoDuplicacao, PastaCena, PosicaoJogador,
} from "../../../../../lib/vtt/sceneStorage";

export interface PropsGerenciadorCenas {
  campaignId: string;
  /** A cena que o narrador está olhando — dela sai o selo "Você está aqui". */
  cenaVistaId: string | null;
  /** Trocar de cena é do `VttClient`: é ele que carrega e reassina. */
  onAbrir: (sceneId: string) => void;
  onFechar: () => void;
  /**
   * A revisão do palco conhecida pelo cliente, mandada a
   * `present_vtt_scene` para que um clique decidido sobre um palco que
   * já andou seja recusado em vez de aplicado por cima.
   */
  palcoRevision?: number | null;
  /**
   * A cena ABERTA pelo narrador acabou de ser arquivada ou excluída.
   * Quem decide pra onde levá-lo é o `VttClient`: só ele sabe qual cena
   * carregar e como reassinar o Realtime.
   */
  onCenaSaiuDeUso?: (sceneId: string) => void;
  /** A cena onde a MESA está — destino de quem é devolvido ao grupo. */
  cenaApresentadaId?: string | null;
  /**
   * Quantas peças ficariam fora da grade com o tamanho em edição, e o
   * aviso do tamanho que alimenta essa conta. Só o `VttClient` sabe contar,
   * e só da cena ABERTA — por isso os dois passam adiante apenas quando
   * é ela que está sendo configurada (ver o uso de `ParametrosCena`).
   */
  foraDaGrade?: number;
  onMudarTamanho?: (largura: number, altura: number) => void;
  /**
   * Muda quando algo fora daqui alterou uma cena (renomear pela janela
   * de Configurações, por exemplo). Releitura em vez de espelhar o
   * estado do pai: o catálogo tem campos que o `VttClient` não carrega.
   */
  versaoExterna?: number;
  /** A revisão da cena aberta — o freio contra reler o próprio eco. */
  cenaVistaRevision?: number;
  /**
   * Muda quando o PALCO andou. Separado da revisão de propósito: o
   * palco andar não mexe na revisão de cena nenhuma, então o freio do
   * eco não pode valer aqui — foi assim que a primeira versão deste
   * freio fez o selo "Jogadores aqui" parar de aparecer.
   */
  versaoPalco?: number;
  /**
   * A configuração de uma cena foi gravada AQUI — o caminho de volta.
   *
   * Sem ele, mudar o tamanho ou a grade da cena aberta não aparecia no
   * mapa: quem desenha lê o `estadoCena` do `VttClient`, e ele não sabe
   * do que acontece na gaveta. A primeira tentativa foi mandar reabrir
   * a cena, e ela não funcionou nem devia — `trocarParaCena` sai na
   * hora quando o id já é o aberto (é o que impede clicar no cartão da
   * cena atual de recarregar o mapa inteiro).
   *
   * Então em vez de RELER, o gerenciador entrega o que a RPC já
   * devolveu. Custa zero ida ao servidor e aparece no mesmo quadro.
   */
  onCenaConfigurada?: (cena: CenaVtt) => void;
}

export function GerenciadorCenas(p: PropsGerenciadorCenas) {
  const [cenas, setCenas] = useState<DadosCartaoCena[] | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  /**
   * Recado que não é erro — hoje, só um: a cena que a cascata POUPOU
   * por estar apresentada. Separado de `erro` porque nada falhou; o que
   * houve foi uma exceção deliberada que precisa ser dita.
   */
  const [aviso, setAviso] = useState<string | null>(null);
  /** Escritas em voo, por cena — trava só o cartão afetado. */
  const [ocupadas, setOcupadas] = useState<Record<string, true>>({});
  const [errosPorCena, setErrosPorCena] = useState<Record<string, string>>({});
  /** A folha "Nova cena" está aberta — com mapa anexado ou sem. */
  const [criando, setCriando] = useState(false);
  const [salvandoNova, setSalvandoNova] = useState(false);
  /** O erro da CRIAÇÃO mora na folha, não na lista atrás dela. */
  const [erroNova, setErroNova] = useState<string | null>(null);

  /**
   * As miniaturas, por id de asset.
   *
   * `list_vtt_scenes` devolve o ID da imagem (a escolhida a dedo ou,
   * na falta, o fundo da cena — 0111), nunca uma URL: quem emite URL
   * assinada é o servidor, depois de conferir se ESTA pessoa pode ver
   * AQUELE arquivo. Um mapa separado do catálogo porque as duas coisas
   * vencem em ritmos diferentes — a listagem é estável, a assinatura
   * expira em 5 minutos.
   */
  const [miniaturas, setMiniaturas] = useState<Record<string, string>>({});

  /** Onde cada jogador está (0118). Vazio para quem não é narrador. */
  const [jogadores, setJogadores] = useState<PosicaoJogador[]>([]);
  /**
   * Quais pastas estão com a lista aberta no trilho. `"__todas__"` é a
   * linha do topo, que não é pasta nenhuma mas se comporta como uma.
   *
   * Estado LOCAL e efêmero de propósito: é um gesto de olhar, não uma
   * preferência — reabrir a gaveta começa com tudo recolhido, que é o
   * estado em que ela cabe inteira na tela.
   */
  const [expandidas, setExpandidas] = useState<ReadonlySet<string>>(new Set());
  const alternarExpansao = useCallback((chave: string) => {
    setExpandidas((atual) => {
      const novo = new Set(atual);
      if (novo.has(chave)) novo.delete(chave); else novo.add(chave);
      return novo;
    });
  }, []);

  /** As pastas da campanha, com caminho e nível montados pelo banco (0117). */
  const [pastas, setPastas] = useState<PastaCena[]>([]);
  /** Onde o narrador está navegando. `null` = raiz. */
  const [pastaAtual, setPastaAtual] = useState<string | null>(null);
  const [criandoPasta, setCriandoPasta] = useState(false);
  const [nomePastaNova, setNomePastaNova] = useState("");
  const campoPastaRef = useRef<HTMLInputElement | null>(null);
  /** A pasta sob o arrasto agora — o realce que evita soltar no escuro. */
  const [pastaAlvo, setPastaAlvo] = useState<string | null>(null);
  /**
   * A busca ACHATA a hierarquia de propósito: procurar é justamente o
   * gesto de quem não sabe em que pasta a cena está, e responder
   * "nenhum resultado nesta pasta" seria responder a pergunta errada.
   */
  const [busca, setBusca] = useState("");

  /** A aba de arquivo. Filtro de apresentação, não outra consulta. */
  const [verArquivo, setVerArquivo] = useState(false);
  const [arrastandoId, setArrastandoId] = useState<string | null>(null);
  /** O jogador em arrasto, e o ladrilho sob ele. Gesto DIFERENTE do de cena. */
  const [arrastandoJogador, setArrastandoJogador] = useState<string | null>(null);
  const [alvoJogadorId, setAlvoJogadorId] = useState<string | null>(null);
  /** A cena cujos parâmetros estão abertos na folha da gaveta. */
  const [configurandoId, setConfigurandoId] = useState<string | null>(null);
  /** O mapa escolhido, decodificado em memória e ainda não enviado. */
  const [mapaPendente, setMapaPendente] = useState<{ preparada: ImagemPreparada; nome: string } | null>(null);
  const campoMapaRef = useRef<HTMLInputElement | null>(null);
  /**
   * O menu do "Nova cena". As duas origens de uma cena — do zero e a
   * partir de um mapa — eram dois botões de peso desigual: um rotulado
   * e primário, outro um ícone sem nome ao lado. Quem nunca tinha
   * clicado no ícone não sabia que a segunda opção existia. Uma escolha
   * só, com as duas saídas nomeadas, é o que o gesto sempre foi.
   */
  const [menuNovaAberto, setMenuNovaAberto] = useState(false);
  const menuNovaRef = useRef<HTMLSpanElement | null>(null);
  const [alvoId, setAlvoId] = useState<string | null>(null);

  /**
   * A lista corrente, sempre fresca.
   *
   * Dois cliques rápidos na seta acontecem no MESMO render: o segundo
   * leria `cenas` do fechamento do primeiro — a lista de antes — e
   * mandaria ao servidor uma ordem que desfaz a anterior. O ref é lido
   * no instante do gesto.
   */
  const cenasRef = useRef<DadosCartaoCena[] | null>(null);
  useEffect(() => { cenasRef.current = cenas; }, [cenas]);

  /**
   * Reordenar é SERIALIZADO, não concorrente.
   *
   * `reorder_vtt_scenes` reescreve o bloco inteiro. Duas chamadas em
   * voo ao mesmo tempo chegam em ordem que ninguém controla, e a que
   * chegar por último vence no banco — podendo ser a mais VELHA. A tela
   * mostraria uma ordem e o catálogo teria outra, sem erro nenhum pra
   * denunciar.
   *
   * A fila resolve sem bloquear o gesto: cada reordenação entra atrás
   * da anterior e o otimismo continua respondendo no frame do clique.
   *
   * NOTA HONESTA: não foi possível reproduzir o atropelamento com a
   * fila desligada — o Next aparentemente já serializa Server Actions
   * do mesmo cliente, e três rodadas do check convergiram mesmo sem
   * ela. A fila fica porque essa serialização é detalhe de
   * implementação do framework, não contrato: o dia em que duas
   * chamadas saírem juntas, a mais VELHA pode vencer no banco e nada
   * denunciaria. Aqui a garantia é nossa e está escrita.
   */
  const filaOrdemRef = useRef<Promise<void>>(Promise.resolve());
  const pendentesOrdemRef = useRef(0);
  /**
   * Uma reordenação que FALHA invalida as que foram enfileiradas em
   * cima dela: elas descrevem posições de uma lista que o servidor
   * recusou. Quem tem época velha desiste, e a releitura do catálogo
   * passa a ser a única verdade.
   */
  const epocaOrdemRef = useRef(0);
  const [reordenando, setReordenando] = useState(false);

  /**
   * Toda releitura carrega o número da sua geração. Uma resposta que
   * chega depois de outra releitura ter começado é DESCARTADA — sem
   * isso, uma listagem lenta sobrescreveria o resultado de uma recente
   * e o catálogo voltaria no tempo. É o mesmo cuidado que o `VttClient`
   * toma com a carga de cena.
   */
  const geracaoRef = useRef(0);

  const recarregar = useCallback(async () => {
    const geracao = ++geracaoRef.current;
    setCarregando(true);
    try {
      // SEMPRE com as arquivadas: a aba de arquivo é um filtro de
      // apresentação, não outra consulta. Buscar de novo a cada troca
      // de aba faria o número do botão ("Arquivo (3)") depender de uma
      // carga que só acontece depois de clicar nele.
      // Cenas e pastas na MESMA leva: são as duas metades de uma lista
      // só, e carregá-las em momentos diferentes deixaria um frame com
      // cenas órfãs de pastas que ainda não chegaram.
      const [r, rp, rj] = await Promise.all([
        listarCenasAction(p.campaignId, true),
        listarPastasAction(p.campaignId),
        listarPosicoesJogadoresAction(p.campaignId),
      ]);
      if (geracao !== geracaoRef.current) return;
      if (!r.ok || !r.dados) {
        setErro(r.erro ?? "Falha ao listar as cenas.");
      } else {
        setCenas([...r.dados.cenas].sort((a, b) => a.ordem - b.ordem));
        setPastas(rp.ok && rp.dados ? rp.dados.pastas : []);
        setJogadores(rj.ok && rj.dados ? rj.dados.jogadores : []);
        setErro(null);
      }
    } catch (e) {
      if (geracao !== geracaoRef.current) return;
      setErro(e instanceof Error ? e.message : "Falha inesperada ao listar as cenas.");
    } finally {
      if (geracao === geracaoRef.current) setCarregando(false);
    }
  }, [p.campaignId]);

  /**
   * O eco da própria escrita NÃO relê o catálogo.
   *
   * `versaoExterna` sobe quando a cena aberta muda de revisão — e ela
   * muda quando ESTA janela grava, porque o `VttClient` adota a linha
   * que a gaveta devolveu. Sem este freio, salvar o tamanho disparava
   * uma releitura completa (cenas + pastas + jogadores + assinaturas):
   * sete idas ao servidor e dois segundos e meio para uma escrita que
   * custa quatrocentos milissegundos.
   *
   * O freio é preciso, não um sinalizador: se a lista que já está na
   * tela contém a revisão que chegou, não há o que reler. Qualquer
   * mudança vinda de FORA traz uma revisão que a lista não tem, e a
   * releitura acontece como antes.
   */
  const palcoVistoRef = useRef<number | undefined>(undefined);
  useEffect(() => {
    const primeira = palcoVistoRef.current === undefined;
    const palcoAndou = !primeira && palcoVistoRef.current !== p.versaoPalco;
    palcoVistoRef.current = p.versaoPalco;
    if (!primeira && !palcoAndou && p.cenaVistaId) {
      const nossa = (cenasRef.current ?? []).find((c) => c.id === p.cenaVistaId);
      if (nossa && nossa.revision === p.cenaVistaRevision) return;
    }
    void recarregar();
  }, [recarregar, p.versaoExterna, p.versaoPalco, p.cenaVistaId, p.cenaVistaRevision]);

  useEffect(() => { if (criandoPasta) campoPastaRef.current?.focus(); }, [criandoPasta]);

  /**
   * A pasta aberta sumiu (excluída aqui ou noutra aba) — volta pra
   * raiz. Ficar apontando pra ela mostraria uma lista vazia sem que
   * nada explicasse que o lugar deixou de existir.
   */
  useEffect(() => {
    if (pastaAtual && !pastas.some((f) => f.id === pastaAtual)) setPastaAtual(null);
  }, [pastas, pastaAtual]);

  /**
   * Assina as miniaturas que ainda não têm URL.
   *
   * Só as que faltam: a assinatura é uma ida ao servidor por leva, e
   * repedir as que já estão na mão a cada releitura do catálogo faria
   * renomear uma cena recarregar todas as imagens.
   *
   * Um id que volta de fora da resposta some em silêncio (a ação
   * devolve só os autorizados, de propósito) — e aí o cartão mostra a
   * inicial, que é o que ele já fazia antes de existir miniatura.
   */
  const idsMiniatura = (cenas ?? [])
    .map((c) => c.miniaturaImageId)
    .filter((id): id is string => id !== null)
    .join(",");
  useEffect(() => {
    const ids = idsMiniatura.length > 0 ? idsMiniatura.split(",") : [];
    const faltando = ids.filter((id) => !(id in miniaturas));
    if (faltando.length === 0) return;
    let cancelado = false;
    void assinarImagensAction(p.campaignId, faltando)
      .then((r) => {
        if (cancelado || !r.ok || !r.dados) return;
        setMiniaturas((m) => ({ ...m, ...r.dados }));
      })
      .catch(() => { /* sem miniatura o cartão cai na inicial */ });
    return () => { cancelado = true; };
    // `miniaturas` de propósito FORA das dependências: ele é escrito
    // por este mesmo efeito, e incluí-lo faria o efeito se disparar em
    // resposta à própria escrita.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsMiniatura, p.campaignId]);

  function marcarOcupada(id: string, ligado: boolean) {
    setOcupadas((o) => {
      if (ligado) return { ...o, [id]: true };
      const { [id]: _fora, ...resto } = o;
      return resto;
    });
  }

  function anotarErro(id: string, mensagem: string | null) {
    setErrosPorCena((e) => {
      if (mensagem === null) {
        const { [id]: _fora, ...resto } = e;
        return resto;
      }
      return { ...e, [id]: mensagem };
    });
  }

  /**
   * CRIA A CENA — com mapa ou sem, pelo mesmo caminho.
   *
   * A ordem importa quando há mapa: a cena primeiro, porque é o
   * `sceneId` dela que a colocação da imagem precisa. Se a segunda
   * metade falhar, o que sobra é uma cena vazia do tamanho certo —
   * recuperável, e melhor do que uma imagem órfã consumindo quota sem
   * cena nenhuma.
   *
   * A imagem entra como FUNDO com `larguraM` igual à largura da cena em
   * células: 1 célula = 1 metro, então cobrir a cena inteira é
   * literalmente esse número.
   */
  async function criar(v: ValoresNovaCena) {
    if (salvandoNova) return;
    const mapa = mapaPendente;
    setSalvandoNova(true);
    setErroNova(null);
    let reservaId: string | null = null;
    try {
      const nova = await criarCenaAction({
        campaignId: p.campaignId,
        nome: v.nome,
        local: v.local,
        resumo: v.resumo,
        largura: v.largura,
        altura: v.altura,
        celulaPx: v.celulaPx,
        gradeCor: v.gradeCor,
        gradeOpacidade: v.gradeOpacidade,
      });
      if (!nova.ok || !nova.dados) throw new Error(nova.erro ?? "Não foi possível criar a cena.");
      const cena = nova.dados.cena;

      if (mapa) {
        /* A CAIXA DA GRADE, não `largura × altura`.
           A conta antiga tratava a grade como um retângulo de tantos
           metros por tantos: punha o centro em ((largura−1)/2,
           (altura−1)/2) e a largura em `largura` metros. Nenhum dos
           três está certo num mapa de hexágonos — as fileiras ímpares
           deslocam meio hexágono, uma fileira avança 87% de um metro, e
           `x = √3·tam·(q + r/2)` faz o `r` do centro empurrar o `q`. O
           fundo nascia deslocado pra direita (o erro crescia com a
           altura da cena) e 15% mais alto que a grade.

           `alturaM` vai EXPLÍCITA: derivada da proporção do arquivo ela
           ignoraria a geometria de novo. O esticão que sobra é o
           arredondamento pra células inteiras — o mesmo que a folha
           anuncia no "sobram N px". */
        const caixa = caixaDaGrade(v.largura, v.altura);
        const colocacao = {
          sceneId: cena.id,
          papel: "fundo" as const,
          centroQ: caixa.centroQ,
          centroR: caixa.centroR,
          larguraM: caixa.larguraM,
          alturaM: caixa.alturaM,
        };

        const reserva = await reservarUploadAction(p.campaignId, mapa.preparada.sha256, "fundo");
        if (!reserva.ok || !reserva.dados) throw new Error(reserva.erro ?? "Não foi possível preparar o envio.");
        reservaId = reserva.dados.reservaId;

        if (reserva.dados.reutilizado) {
          // Mapa que já está na campanha: só um uso novo do mesmo asset.
          const r = await criarImagemCenaAction(p.campaignId, reserva.dados.assetId, colocacao);
          if (!r.ok) throw new Error(r.erro ?? "Não foi possível colocar o mapa.");
        } else {
          if (!reserva.dados.uploadUrl || !reserva.dados.reservaId) {
            throw new Error("O servidor não devolveu um destino de envio.");
          }
          await enviarParaUrlAssinada(reserva.dados.uploadUrl, mapa.preparada.blob);
          const r = await finalizarUploadCenaAction(
            p.campaignId, reserva.dados.reservaId, mapa.preparada.sha256, colocacao,
          );
          if (!r.ok) throw new Error(r.erro ?? "Não foi possível concluir o envio.");
        }
      }

      fecharNova();
      if (mapa) {
        // Com mapa há estado NOVO no servidor que o catálogo não viu (a
        // imagem colocada, a miniatura): a releitura é o que traz.
        await recarregar();
      } else {
        // A cena nasce no FIM do catálogo e NÃO é aberta: criar e abrir
        // são gestos separados, como criar e apresentar. O narrador que
        // quiser entrar clica no cartão.
        setCenas((c) => [...(c ?? []), cena]);
      }
      setErro(null);
    } catch (e) {
      // Reserva viva sem uso é quota presa até vencer. Devolvê-la é
      // cortesia, não correção: a coleta recolhe de qualquer jeito.
      if (reservaId) void cancelarUploadAction(p.campaignId, reservaId).catch(() => {});
      // Uma Server Action que REJEITA (em vez de devolver `{ok:false}`)
      // deixaria a folha muda: o botão volta do "criando" e nada
      // explica por que a cena não apareceu. Coberto por critério.
      setErroNova(e instanceof Error ? e.message : "Falha inesperada ao criar a cena.");
    } finally {
      setSalvandoNova(false);
    }
  }
  async function renomear(cena: DadosCartaoCena, nome: string) {
    marcarOcupada(cena.id, true);
    anotarErro(cena.id, null);
    try {
      const r = await salvarConfigCenaAction({
        campaignId: p.campaignId,
        sceneId: cena.id,
        nome,
        // Renomear mexe SÓ no nome: os outros campos vão como estão
        // porque `set_vtt_scene_config` grava a configuração inteira.
        // Mandar vazio apagaria local e resumo sem ninguém ter pedido.
        local: cena.local,
        resumo: cena.resumo,
        largura: cena.largura,
        altura: cena.altura,
        revisionEsperada: cena.revision,
      });
      if (!r.ok || !r.dados) {
        // Revisão velha é o caso comum aqui (a cena mudou noutra aba, ou
        // pela janela de Configurações). Reler devolve a revisão nova e
        // o nome atual, e a pessoa tenta de novo sabendo o que havia.
        anotarErro(cena.id, r.erro ?? "Não foi possível renomear a cena.");
        void recarregar();
        return;
      }
      const gravada = r.dados.cena;
      p.onCenaConfigurada?.(gravada);
      setCenas((c) => (c ?? []).map((x) => (
        x.id === cena.id
          ? { ...x, nome: gravada.nome, local: gravada.local, resumo: gravada.resumo, revision: gravada.revision }
          : x
      )));
    } catch (e) {
      anotarErro(cena.id, e instanceof Error ? e.message : "Falha inesperada ao renomear.");
    } finally {
      marcarOcupada(cena.id, false);
    }
  }

  /**
   * Mandar UM jogador para uma cena, pelo arrasto.
   *
   * Soltar na cena da MESA é o gesto de devolvê-lo ao grupo: a RPC
   * (0118) apaga a atribuição em vez de gravá-la, e é ela quem decide
   * isso — a diferença entre "está aqui porque mandei" e "está aqui
   * porque a mesa está" não pode ser inventada no cliente.
   */
  async function mandarJogador(userId: string, cena: DadosCartaoCena) {
    setArrastandoJogador(null);
    marcarOcupada(cena.id, true);
    anotarErro(cena.id, null);
    try {
      const r = await moverJogadoresAction({ campaignId: p.campaignId, userIds: [userId], sceneId: cena.id });
      if (!r.ok) { anotarErro(cena.id, r.erro ?? "Não foi possível mover o jogador."); return; }
      await recarregar();
    } catch (e) {
      anotarErro(cena.id, e instanceof Error ? e.message : "Falha ao mover o jogador.");
    } finally {
      marcarOcupada(cena.id, false);
    }
  }

  /**
  /**
   * Escolher o arquivo: decodifica e reduz SEM enviar nada. É isto que
   * faz "Cancelar" não deixar resíduo — nenhuma cena criada, nenhuma
   * reserva de quota, nada no Storage para a coleta recolher.
   *
   * Anexar um mapa também ABRE a folha: é por aqui que se entra pelo
   * menu "A partir de um mapa", onde o seletor de arquivo vem primeiro
   * e a folha nasce já com a imagem dentro.
   */
  async function escolherMapa(arquivo: File) {
    setErroNova(null);
    try {
      const preparada = await prepararImagem(arquivo);
      setMapaPendente((anterior) => {
        if (anterior) URL.revokeObjectURL(anterior.preparada.previewUrl);
        return { preparada, nome: arquivo.name.replace(/\.[^.]+$/, "") };
      });
      setCriando(true);
    } catch (e) {
      // A folha NÃO fecha nem abre por um arquivo recusado: trocar o
      // mapa por um arquivo ruim não pode descartar o que já foi
      // digitado, e recusar antes de abrir não deve abrir nada.
      setErroNova(e instanceof ImagemRecusadaError ? e.message : "Não foi possível ler esta imagem.");
    }
  }

  /** Tira o mapa e deixa a folha aberta — a cena volta a ser do zero. */
  function removerMapa() {
    setMapaPendente((m) => {
      if (m) URL.revokeObjectURL(m.preparada.previewUrl);
      return null;
    });
    setErroNova(null);
  }

  /** Fecha a folha inteira, devolvendo o `object URL` do preview. */
  function fecharNova() {
    removerMapa();
    setCriando(false);
    setErroNova(null);
  }

  /** Os parâmetros da cena, gravados pela folha — a mesma RPC do renomear. */
  async function salvarParametros(cena: DadosCartaoCena, v: ValoresParametros) {
    marcarOcupada(cena.id, true);
    anotarErro(cena.id, null);
    try {
      const r = await salvarConfigCenaAction({
        campaignId: p.campaignId,
        sceneId: cena.id,
        nome: v.nome,
        local: v.local,
        resumo: v.resumo,
        largura: v.largura,
        altura: v.altura,
        gradeCor: v.gradeCor,
        gradeOpacidade: v.gradeOpacidade,
        celulaPx: v.celulaPx,
        revisionEsperada: cena.revision,
      });
      if (!r.ok || !r.dados) {
        anotarErro(cena.id, r.erro ?? "Não foi possível salvar os parâmetros.");
        void recarregar();
        return;
      }
      const g = r.dados.cena;
      setCenas((c) => (c ?? []).map((x) => (
        x.id === cena.id
          ? {
              ...x, nome: g.nome, local: g.local, resumo: g.resumo,
              largura: g.largura, altura: g.altura,
              gradeCor: g.gradeCor, gradeOpacidade: g.gradeOpacidade, celulaPx: g.celulaPx,
              revision: g.revision,
            }
          : x
      )));
      setConfigurandoId(null);
      // O mapa desenha a partir do `estadoCena` do `VttClient`: entregar
      // a linha que a RPC devolveu é o que faz a grade nova aparecer
      // sem uma segunda leitura.
      p.onCenaConfigurada?.(g);
    } catch (e) {
      anotarErro(cena.id, e instanceof Error ? e.message : "Falha ao salvar os parâmetros.");
    } finally {
      marcarOcupada(cena.id, false);
    }
  }

  /**
   * Leva a MESA para uma cena — o único gesto daqui que muda o que os
   * jogadores veem.
   *
   * Manda a revisão que este cliente conhece. Se o palco andou desde
   * então (a outra aba do mesmo narrador, um co-narrador),
   * `present_vtt_scene` recusa em vez de aplicar por cima de uma
   * decisão tomada sobre estado velho — e aí a releitura mostra onde a
   * mesa realmente está.
   *
   * Não relê o catálogo no sucesso: o evento de palco chega pelo
   * Realtime e move o selo sozinho. Reler aqui seria uma segunda fonte
   * para o mesmo fato, e a corrida entre as duas é justamente o tipo de
   * divergência que essa fase existe pra não ter.
   */
  async function apresentar(cena: DadosCartaoCena) {
    marcarOcupada(cena.id, true);
    anotarErro(cena.id, null);
    try {
      const r = await apresentarCenaAction({
        campaignId: p.campaignId,
        sceneId: cena.id,
        revisionEsperada: p.palcoRevision ?? null,
      });
      if (!r.ok) {
        anotarErro(cena.id, r.erro ?? "Não foi possível apresentar a cena.");
        void recarregar();
      }
    } catch (e) {
      anotarErro(cena.id, e instanceof Error ? e.message : "Falha inesperada ao apresentar.");
    } finally {
      marcarOcupada(cena.id, false);
    }
  }

  /**
   * As três escritas de ciclo de vida (0116).
   *
   * Todas relêem o catálogo no fim, e nenhuma é otimista: duplicar cria
   * uma cena cujo conteúdo só o servidor conhece, arquivar muda em qual
   * aba a cena aparece, e excluir some com ela. Adivinhar qualquer um
   * desses no cliente seria desenhar um catálogo que talvez não exista.
   */
  async function comCena(cena: DadosCartaoCena, escrita: () => Promise<{ ok: boolean; erro?: string }>, falha: string) {
    marcarOcupada(cena.id, true);
    anotarErro(cena.id, null);
    try {
      const r = await escrita();
      if (!r.ok) { anotarErro(cena.id, r.erro ?? falha); return false; }
      await recarregar();
      return true;
    } catch (e) {
      anotarErro(cena.id, e instanceof Error ? e.message : falha);
      return false;
    } finally {
      marcarOcupada(cena.id, false);
    }
  }

  async function duplicar(cena: DadosCartaoCena, modo: ModoDuplicacao) {
    await comCena(cena,
      () => duplicarCenaAction({ campaignId: p.campaignId, sceneId: cena.id, modo }),
      "Falha ao duplicar a cena.");
  }

  async function arquivar(cena: DadosCartaoCena) {
    const ok = await comCena(cena,
      () => arquivarCenaAction({ campaignId: p.campaignId, sceneId: cena.id }),
      "Falha ao arquivar a cena.");
    // Arquivar a cena ABERTA deixaria o narrador numa cena congelada,
    // com as ferramentas todas respondendo "restaure antes de editar"
    // sem que nada na tela dissesse o porquê. Quem sabe pra onde levá-lo
    // é o `VttClient` — daqui só sai o aviso de que a cena saiu de uso.
    if (ok && cena.id === p.cenaVistaId) p.onCenaSaiuDeUso?.(cena.id);
  }

  async function restaurar(cena: DadosCartaoCena) {
    await comCena(cena,
      () => restaurarCenaAction({ campaignId: p.campaignId, sceneId: cena.id }),
      "Falha ao restaurar a cena.");
  }

  async function excluir(cena: DadosCartaoCena) {
    const ok = await comCena(cena,
      () => excluirCenaAction({ campaignId: p.campaignId, sceneId: cena.id }),
      "Falha ao excluir a cena.");
    if (ok && cena.id === p.cenaVistaId) p.onCenaSaiuDeUso?.(cena.id);
  }

  // ── Pastas ─────────────────────────────────────────────────────────
  async function criarPastaNova() {
    const nome = nomePastaNova.trim();
    if (nome.length === 0) return;
    try {
      // Nasce DENTRO da pasta aberta: "nova pasta" enquanto se navega
      // em `Ato I / Porto` significa uma pasta ali, não na raiz.
      const r = await criarPastaAction({ campaignId: p.campaignId, nome, parentId: pastaAtual });
      if (!r.ok) { setErro(r.erro ?? "Falha ao criar a pasta."); return; }
      setNomePastaNova("");
      setCriandoPasta(false);
      setErro(null);
      await recarregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha inesperada ao criar a pasta.");
    }
  }

  async function renomearPastaPor(pasta: PastaCena, nome: string) {
    marcarOcupada(pasta.id, true);
    anotarErro(pasta.id, null);
    try {
      const r = await renomearPastaAction({ campaignId: p.campaignId, folderId: pasta.id, nome });
      if (!r.ok) { anotarErro(pasta.id, r.erro ?? "Não foi possível renomear a pasta."); return; }
      await recarregar();
    } finally {
      marcarOcupada(pasta.id, false);
    }
  }

  async function moverJogadoresPara(cena: DadosCartaoCena, userIds: string[]) {
    // Desmarcar todo mundo significa "ninguém aqui" — e a forma de
    // dizer isso ao servidor é mandar os removidos de volta ao palco,
    // não mandar uma lista vazia (que a RPC recusa, e com razão: lista
    // vazia é quase sempre engano).
    const aqui = new Set(jogadores.filter((j) => j.sceneId === cena.id).map((j) => j.userId));
    const paraCa = userIds.filter((id) => !aqui.has(id));
    const paraFora = [...aqui].filter((id) => !userIds.includes(id));
    const palco = p.cenaApresentadaId ?? null;

    marcarOcupada(cena.id, true);
    anotarErro(cena.id, null);
    try {
      if (paraCa.length > 0) {
        const r = await moverJogadoresAction({ campaignId: p.campaignId, userIds: paraCa, sceneId: cena.id });
        if (!r.ok) { anotarErro(cena.id, r.erro ?? "Não foi possível mover os jogadores."); return; }
      }
      if (paraFora.length > 0 && palco) {
        const r = await moverJogadoresAction({ campaignId: p.campaignId, userIds: paraFora, sceneId: palco });
        if (!r.ok) { anotarErro(cena.id, r.erro ?? "Não foi possível devolver os jogadores."); return; }
      }
      await recarregar();
    } catch (e) {
      anotarErro(cena.id, e instanceof Error ? e.message : "Falha inesperada ao mover jogadores.");
    } finally {
      marcarOcupada(cena.id, false);
    }
  }

  async function reagrupar() {
    try {
      const r = await reagruparJogadoresAction({ campaignId: p.campaignId });
      if (!r.ok) { setErro(r.erro ?? "Falha ao reagrupar a mesa."); return; }
      setErro(null);
      await recarregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha inesperada ao reagrupar.");
    }
  }

  async function excluirPastaPor(pasta: PastaCena, nomeConfirmacao: string) {
    marcarOcupada(pasta.id, true);
    anotarErro(pasta.id, null);
    try {
      const r = await excluirPastaAction({ campaignId: p.campaignId, folderId: pasta.id, nomeConfirmacao });
      if (!r.ok) { anotarErro(pasta.id, r.erro ?? "Não foi possível excluir a pasta."); return; }
      // A cena APRESENTADA sobrevive à cascata e sobe um nível (0129).
      // Isso precisa ser DITO: quem apagou "Ato I" e vê uma cena dele
      // reaparecer na raiz merece saber que não foi engano.
      if (r.dados?.preservada) {
        setAviso(`"${r.dados.preservada}" não foi apagada: a mesa está nela. Ela subiu um nível.`);
      }
      await recarregar();
    } finally {
      marcarOcupada(pasta.id, false);
    }
  }

  async function arquivarPastaPor(pasta: PastaCena) {
    marcarOcupada(pasta.id, true);
    anotarErro(pasta.id, null);
    try {
      const r = await arquivarPastaAction({ campaignId: p.campaignId, folderId: pasta.id });
      if (!r.ok) { anotarErro(pasta.id, r.erro ?? "Não foi possível arquivar a pasta."); return; }
      // Mesma regra da exclusão (0129/0130): a cena APRESENTADA não vai
      // junto, porque arquivar a cena em uso deixaria a mesa numa cena
      // congelada. Se ficou pra trás, isso tem que ser dito.
      if (r.dados?.preservada) {
        setAviso(`"${r.dados.preservada}" continua no catálogo: a mesa está nela.`);
      }
      // Estar DENTRO da pasta que acabou de sair do catálogo deixaria a
      // grade apontando pra um lugar que já não é navegável.
      if (pastaAtual === pasta.id) setPastaAtual(pasta.parentId);
      await recarregar();
    } finally {
      marcarOcupada(pasta.id, false);
    }
  }

  async function desarquivarPastaPor(pasta: PastaCena) {
    marcarOcupada(pasta.id, true);
    anotarErro(pasta.id, null);
    try {
      const r = await desarquivarPastaAction({ campaignId: p.campaignId, folderId: pasta.id });
      if (!r.ok) { anotarErro(pasta.id, r.erro ?? "Não foi possível devolver a pasta."); return; }
      await recarregar();
    } finally {
      marcarOcupada(pasta.id, false);
    }
  }

  /**
   * Quantas cenas e subpastas vão junto com esta pasta — o número que a
   * confirmação mostra. Calculado aqui, com os dados que a gaveta já
   * tem, e não pedido ao servidor: é informação pra DECIDIR, e ela
   * precisa aparecer antes de qualquer chamada.
   */
  function pesoDaPasta(pastaId: string): { cenas: number; subpastas: number } {
    const dentro = new Set<string>([pastaId]);
    let mudou = true;
    while (mudou) {
      mudou = false;
      for (const f of pastas) {
        if (f.parentId && dentro.has(f.parentId) && !dentro.has(f.id)) { dentro.add(f.id); mudou = true; }
      }
    }
    return {
      cenas: todas.filter((c) => c.pastaId && dentro.has(c.pastaId)).length,
      subpastas: dentro.size - 1,
    };
  }

  /**
   * Arrastar uma cena para uma pasta (ou para o breadcrumb, que é a
   * forma de tirá-la de onde está).
   */
  async function moverCena(sceneId: string, destino: string | null) {
    setPastaAlvo(null);
    setArrastandoId(null);
    const cena = (cenasRef.current ?? []).find((c) => c.id === sceneId);
    if (!cena || cena.pastaId === destino) return;
    marcarOcupada(sceneId, true);
    anotarErro(sceneId, null);
    try {
      const r = await moverCenaParaPastaAction({ campaignId: p.campaignId, sceneId, folderId: destino });
      if (!r.ok) { anotarErro(sceneId, r.erro ?? "Não foi possível mover a cena."); return; }
      await recarregar();
    } finally {
      marcarOcupada(sceneId, false);
    }
  }

  /**
   * Reordena otimista e confirma no servidor, uma de cada vez.
   *
   * Otimista porque arrastar precisa responder no frame do gesto.
   * Enfileirada porque `reorder_vtt_scenes` reescreve o bloco inteiro e
   * duas em voo se atropelariam no banco.
   *
   * Quando o servidor recusa, a reconciliação é uma RELEITURA, não a
   * lista de antes: com fila, "antes" é ambíguo (qual das enfileiradas?)
   * e restaurar um instantâneo qualquer deixaria uma ordem que nunca
   * existiu nem no cliente nem no banco. O catálogo do servidor é a
   * única resposta que não inventa nada.
   */
  function aplicarOrdem(nova: DadosCartaoCena[]) {
    const epoca = epocaOrdemRef.current;
    const ids = nova.map((c) => c.id);
    setCenas(nova.map((c, i) => ({ ...c, ordem: i })));
    setErro(null);

    pendentesOrdemRef.current++;
    setReordenando(true);
    filaOrdemRef.current = filaOrdemRef.current
      .then(async () => {
        if (epoca !== epocaOrdemRef.current) return; // a fila foi invalidada por uma falha anterior
        const r = await reordenarCenasAction({ campaignId: p.campaignId, sceneIds: ids })
          .catch((e) => ({ ok: false as const, erro: e instanceof Error ? e.message : "Falha ao reordenar." }));
        if (!r.ok) {
          epocaOrdemRef.current++;
          setErro(r.erro ?? "Falha ao reordenar as cenas.");
          await recarregar();
        }
      })
      .finally(() => {
        pendentesOrdemRef.current--;
        if (pendentesOrdemRef.current === 0) setReordenando(false);
      });
  }

  function mover(id: string, direcao: -1 | 1) {
    const lista = cenasRef.current ?? [];
    const de = lista.findIndex((c) => c.id === id);
    const para = de + direcao;
    if (de < 0 || para < 0 || para >= lista.length) return;
    const nova = [...lista];
    [nova[de], nova[para]] = [nova[para], nova[de]];
    aplicarOrdem(nova);
  }

  function soltarSobre(alvo: string) {
    const lista = cenasRef.current ?? [];
    const origem = arrastandoId;
    setArrastandoId(null);
    setAlvoId(null);
    if (!origem || origem === alvo) return;
    const de = lista.findIndex((c) => c.id === origem);
    const para = lista.findIndex((c) => c.id === alvo);
    if (de < 0 || para < 0) return;
    const nova = [...lista];
    const [movida] = nova.splice(de, 1);
    nova.splice(para, 0, movida);
    aplicarOrdem(nova);
  }

  const todas = cenas ?? [];
  const arquivadas = todas.filter((c) => c.arquivadaEm !== null);
  /**
   * Pastas ARQUIVADAS (0130). Elas saem do trilho do catálogo e vão
   * pra aba Arquivo com as cenas dentro — a lista de lá deixou de ser
   * plana justamente pra não desmanchar o conjunto que foi arquivado
   * junto.
   */
  const pastasArquivadas = (pastas ?? []).filter((f) => f.arquivadaEm !== null);
  const pastasAtivas = (pastas ?? []).filter((f) => f.arquivadaEm === null);
  const idsPastasArquivadas = new Set(pastasArquivadas.map((f) => f.id));
  const termo = busca.trim().toLocaleLowerCase("pt-BR");
  const buscando = termo.length > 0;

  /**
   * A lista, em três recortes que NÃO se combinam:
   *
   *   · busca — achata tudo, ignora pasta E arquivo. Quem procura quer
   *     encontrar, e lembrar de conferir duas abas é trabalho do
   *     programa, não de quem usa;
   *   · arquivo — as arquivadas, em qualquer pasta. Arquivar é sobre
   *     estar em uso, não sobre onde está guardado;
   *   · catálogo — as em uso da pasta ABERTA.
   */
  const lista = buscando
    ? todas.filter((c) =>
        c.nome.toLocaleLowerCase("pt-BR").includes(termo)
        || (c.local ?? "").toLocaleLowerCase("pt-BR").includes(termo))
    : verArquivo
      // Sob uma pasta arquivada, a cena aparece DENTRO dela (logo
      // abaixo) — não também solta na grade. Repetir a mesma cena nos
      // dois lugares faria a aba Arquivo mentir na contagem.
      ? arquivadas.filter((c) => !(c.pastaId && idsPastasArquivadas.has(c.pastaId)))
      // `null` deixou de significar "as da raiz" e passou a significar
      // TODAS: a pergunta que se faz ao abrir o catálogo é "que cenas
      // eu tenho?", e responder com um subconjunto que depende de onde
      // a pessoa estava obrigava a entrar em cada pasta pra ter
      // certeza. Pasta é filtro, não esconderijo.
      : pastaAtual === null
        ? todas.filter((c) => c.arquivadaEm === null)
        : todas.filter((c) => c.arquivadaEm === null && c.pastaId === pastaAtual);

  /** As subpastas da pasta aberta. Somem na busca e no arquivo. */
  const subpastas = (buscando || verArquivo)
    ? []
    : pastas.filter((f) => f.parentId === pastaAtual).sort((a, b) => a.ordem - b.ordem);

  const pastaPorId = new Map(pastas.map((f) => [f.id, f]));
  const cenasPorPasta = new Map<string, number>();
  for (const c of todas) {
    if (c.arquivadaEm !== null || !c.pastaId) continue;
    cenasPorPasta.set(c.pastaId, (cenasPorPasta.get(c.pastaId) ?? 0) + 1);
  }

  /**
   * Os mini-cartões de uma pasta (ou de "Todas", com `pastaId`
   * indefinido = sem filtro). Uma função só pros dois casos: a linha do
   * topo e as pastas mostram a MESMA lista, com a mesma aparência e o
   * mesmo clique — o que muda é o filtro.
   */
  function listaDeCenas(pastaId: string | null | undefined) {
    return miniCartoes(todas.filter((c) => c.arquivadaEm === null && (pastaId === undefined || c.pastaId === pastaId)));
  }

  /**
   * O mesmo, para a aba Arquivo: as cenas ARQUIVADAS de uma pasta
   * arquivada. Mesma aparência de propósito — quem devolve a pasta
   * precisa reconhecer, aqui, o conjunto que arquivou lá.
   */
  function listaDeCenasArquivadas(pastaId: string) {
    return miniCartoes(arquivadas.filter((c) => c.pastaId === pastaId));
  }

  function miniCartoes(cenas: DadosCartaoCena[]) {
    if (cenas.length === 0) return null;
    return (
      <ul className="rv-pasta-cenas" data-testid="pasta-cenas">
        {cenas.map((c) => (
          <MiniCartaoCena
            key={c.id}
            nome={c.nome}
            miniaturaUrl={c.miniaturaImageId ? miniaturas[c.miniaturaImageId] ?? null : null}
            vista={c.id === p.cenaVistaId}
            apresentada={c.apresentada}
            jogadoresAqui={jogadores.filter((j) => j.sceneId === c.id)}
            totalJogadores={jogadores.length}
            ocupada={ocupadas[c.id] === true}
            onAbrir={() => p.onAbrir(c.id)}
          />
        ))}
      </ul>
    );
  }

  /** As duas saídas que quem abre um menu espera: clicar fora e Escape. */
  useEffect(() => {
    if (!menuNovaAberto) return;
    const foraDaqui = (e: MouseEvent) => {
      if (!menuNovaRef.current?.contains(e.target as Node)) setMenuNovaAberto(false);
    };
    const escape = (e: KeyboardEvent) => { if (e.key === "Escape") setMenuNovaAberto(false); };
    document.addEventListener("mousedown", foraDaqui);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", foraDaqui);
      document.removeEventListener("keydown", escape);
    };
  }, [menuNovaAberto]);

  /** A corrente do breadcrumb, da raiz até a pasta aberta. */
  const trilha: PastaCena[] = [];
  for (let id = pastaAtual; id !== null; ) {
    const f = pastaPorId.get(id);
    if (!f) break;
    trilha.unshift(f);
    id = f.parentId;
  }

  /** Quem foi MANDADO para algum lugar — só esses precisam de reagrupar. */
  const separados = jogadores.filter((j) => j.atribuido);

  const vazio = !carregando && !erro && lista.length === 0 && subpastas.length === 0
    && !(verArquivo && pastasArquivadas.length > 0);

  /** O nome da cena de um jogador, para o trilho da direita. */
  const nomeDaCena = (sceneId: string | null) =>
    sceneId ? todas.find((c) => c.id === sceneId)?.nome ?? null : null;

  const emEdicao = todas.find((c) => c.id === configurandoId) ?? null;

  /* PORTAL para o `body`: a gaveta é do TOPO DA TELA, e montada onde
     estava (dentro do palco) ela herdava a largura do palco — parava
     antes do painel lateral, exatamente onde uma gaveta não pode
     parar. Um ancestral com `filter`/`transform` também vira bloco
     recipiente de `position: fixed`, e o palco tem os dois. */
  return createPortal(
    <GavetaCasca
      modo={
        carregando && cenas === null ? "Carregando o catálogo"
          // A fila não trava o gesto, mas também não é invisível: a
          // ordem na tela ainda não é a ordem confirmada.
          : reordenando ? "Salvando a ordem…"
          : verArquivo ? `Arquivo — ${arquivadas.length === 1 ? "1 cena" : `${arquivadas.length} cenas`}`
          : lista.length === 1 ? "1 cena"
          : `${lista.length} cenas`
      }
      busca={busca}
      onBusca={setBusca}
      onFechar={p.onFechar}
      acoes={<>
        {/* Fora do fluxo visual: o botão do mapa é quem o aciona. */}
        <input
          ref={campoMapaRef} type="file" accept="image/*" hidden
          data-testid="cena-de-mapa-arquivo"
          onChange={(e) => {
            const arquivo = e.target.files?.[0];
            // Zerar o valor deixa escolher O MESMO arquivo de novo: sem
            // isto, um segundo clique no mesmo mapa não dispara `change`.
            e.target.value = "";
            if (arquivo) void escolherMapa(arquivo);
          }}
        />
        {/* Criar some na aba de arquivo: uma cena nova nasce em uso, e
            oferecer "Nova cena" ali prometeria criar algo arquivado,
            que não existe. */}
        {!verArquivo && (
          <>
            <span className="rv-gav-menu-casca" ref={menuNovaRef}>
              <button
                type="button" className="rv-btn rv-btn--pri" data-testid="cena-nova"
                aria-haspopup="menu" aria-expanded={menuNovaAberto}
                disabled={criando}
                onClick={() => setMenuNovaAberto((a) => !a)}
              >
                <Plus size={15} aria-hidden="true" /> Nova cena
                <ChevronDown size={13} aria-hidden="true" className="rv-btn-chevron" />
              </button>
              {menuNovaAberto && (
                <span className="rv-cena-menu rv-gav-menu" role="menu" data-testid="cena-nova-menu">
                  <button
                    type="button" role="menuitem" className="rv-cena-menu-item"
                    data-testid="cena-nova-do-zero"
                    onClick={() => { setMenuNovaAberto(false); setCriando(true); }}
                  >
                    <FilePlus2 size={14} aria-hidden="true" /> Do zero
                  </button>
                  <button
                    type="button" role="menuitem" className="rv-cena-menu-item"
                    data-testid="cena-de-mapa-abrir"
                    onClick={() => { setMenuNovaAberto(false); campoMapaRef.current?.click(); }}
                  >
                    <ImagePlus size={14} aria-hidden="true" /> A partir de um mapa
                  </button>
                </span>
              )}
            </span>
            <button
              type="button" className="rv-btn rv-cena-btn-icone" data-testid="pasta-nova"
              aria-label="Nova pasta"
              // O quarto nível é o último (0117). Oferecer o botão ali
              // só pra receber a recusa do servidor seria fazer o banco
              // ensinar o que a tela já sabe.
              disabled={trilha.length >= 4 || criandoPasta}
              onClick={() => setCriandoPasta(true)}
            >
              <FolderPlus size={15} aria-hidden="true" />
              {/* A dica diz ONDE a pasta vai nascer: com o trilho à
                  esquerda, a pasta selecionada é o destino, e sem isso
                  "Nova pasta" não conta a metade que importa. */}
              <span className="rv-dica rv-dica--abaixo">
                {trilha.length >= 4
                  ? "As pastas vão até quatro níveis"
                  : pastaAtual === null
                    ? "Nova pasta"
                    : `Nova pasta dentro de ${trilha[trilha.length - 1]?.nome}`}
              </span>
            </button>
          </>
        )}
        {/* SEMPRE VISÍVEL, mesmo com o arquivo vazio. Ele só aparecia
            depois que algo já tinha sido arquivado — o que funcionava
            enquanto arquivar era ação do CARTÃO (descobre-se lá, o
            botão aparece depois). Com pasta também arquivando, isso
            escondia a saída justamente de quem está decidindo entre
            arquivar e apagar. Desabilitado quando não há nada: a
            função fica visível sem prometer uma lista vazia. */}
        {(
          <button
            type="button" className="rv-btn" data-tipo="arquivo"
            aria-pressed={verArquivo}
            data-testid="cenas-ver-arquivo"
            disabled={arquivadas.length === 0 && pastasArquivadas.length === 0 && !verArquivo}
            title={arquivadas.length === 0 && pastasArquivadas.length === 0 ? "Nada arquivado ainda" : undefined}
            onClick={() => setVerArquivo((v) => !v)}
          >
            {verArquivo
              ? <><Undo2 size={14} aria-hidden="true" /> Voltar</>
              : <><Archive size={14} aria-hidden="true" /> Arquivo ({arquivadas.length + pastasArquivadas.length})</>}
          </button>
        )}
      </>}
      linhaNova={criandoPasta ? <>
          {criandoPasta && (
            <div className="rv-cena-nova">
              <input
                ref={campoPastaRef}
                className="rv-cena-campo"
                value={nomePastaNova}
                maxLength={80}
                placeholder="Nome da pasta"
                aria-label="Nome da nova pasta"
                data-testid="pasta-nova-nome"
                onChange={(e) => setNomePastaNova(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); void criarPastaNova(); }
                  if (e.key === "Escape") { e.preventDefault(); setCriandoPasta(false); setNomePastaNova(""); }
                }}
              />
              <button
                type="button" className="rv-btn rv-btn--pri" data-testid="pasta-nova-confirmar"
                disabled={nomePastaNova.trim().length === 0} onClick={() => void criarPastaNova()}
              >Criar pasta</button>
              <button type="button" className="rv-btn rv-btn--ghost" onClick={() => { setCriandoPasta(false); setNomePastaNova(""); }}>
                Cancelar
              </button>
            </div>
          )}
        </> : undefined}
      trilho={/* TRILHO DE PASTAS — a árvore inteira, sempre visível. Antes as
            pastas moravam MISTURADAS às cenas na mesma lista, e a única
            forma de saber que existia uma "Ato II" era entrar na "Ato
            I" e voltar. Pasta é caminho, cena é destino: são duas
            colunas, não uma lista de coisas equivalentes. */
        !buscando ? (
          <nav className="rv-gav-trilho" aria-label="Pastas do catálogo" data-testid="cenas-trilho">
            {/* "TODAS" não é uma pasta, mas é a mesma COISA pra quem
                olha: um caminho com uma contagem e uma lista dentro.
                Por isso usa a casca da linha de pasta (`rv-pasta-linha`)
                em vez de um botão de estilo próprio — o que muda é não
                ter renomear/excluir, porque não há o que renomear nem
                excluir. */}
            <ul className="rv-gav-pastas">
              <li
                className="rv-pasta-linha" data-raiz=""
                data-aberta={pastaAtual === null && !verArquivo ? "" : undefined}
                data-alvo={pastaAlvo === "__raiz__" || undefined}
                onDragOver={(e) => { if (arrastandoId) { e.preventDefault(); setPastaAlvo("__raiz__"); } }}
                onDragLeave={() => setPastaAlvo(null)}
                onDrop={(e) => { e.preventDefault(); if (arrastandoId) void moverCena(arrastandoId, null); }}
              >
                <span className="rv-pasta-cabeca">
                  <span className="rv-pasta-icone" aria-hidden="true"><Clapperboard size={15} /></span>
                  <button
                    type="button" className="rv-pasta-nome"
                    aria-current={pastaAtual === null && !verArquivo ? "page" : undefined}
                    data-testid="trilho-raiz"
                    onClick={() => { setVerArquivo(false); setPastaAtual(null); }}
                  >
                    <span className="rv-pasta-nome-txt">Todas</span>
                  </button>
                  <button
                    type="button" className="rv-pasta-expandir"
                    data-testid="trilho-raiz-expandir"
                    aria-expanded={expandidas.has("__todas__")}
                    aria-label={expandidas.has("__todas__") ? "Recolher todas as cenas" : "Ver todas as cenas"}
                    disabled={todas.filter((c) => c.arquivadaEm === null).length === 0}
                    onClick={() => alternarExpansao("__todas__")}
                  >
                    <span className="rv-pasta-contagem">
                      {todas.filter((c) => c.arquivadaEm === null).length}
                    </span>
                    <ChevronDown size={13} aria-hidden="true" />
                  </button>
                </span>
                {expandidas.has("__todas__") && listaDeCenas(undefined)}
              </li>
            </ul>

            {pastasAtivas.length > 0 && (
              <ul className="rv-gav-pastas">
                {pastasAtivas.map((f) => (
                  <LinhaPasta
                    key={f.id}
                    pasta={f}
                    aberta={pastaAtual === f.id && !verArquivo}
                    quantidade={cenasPorPasta.get(f.id) ?? 0}
                    expandida={expandidas.has(f.id)}
                    onAlternarExpansao={() => alternarExpansao(f.id)}
                    cenas={listaDeCenas(f.id)}
                    ocupada={ocupadas[f.id] === true}
                    erro={errosPorCena[f.id] ?? null}
                    onAbrir={() => { setVerArquivo(false); setPastaAtual(f.id); }}
                    onRenomear={(nome) => void renomearPastaPor(f, nome)}
                    onExcluir={(nomeConfirmacao) => void excluirPastaPor(f, nomeConfirmacao)}
                    onArquivar={() => void arquivarPastaPor(f)}
                    peso={pesoDaPasta(f.id)}
                    alvoDeArrasto={pastaAlvo === f.id && arrastandoId !== null}
                    onDragOver={(e) => { if (arrastandoId) { e.preventDefault(); setPastaAlvo(f.id); } }}
                    onDragLeave={() => setPastaAlvo(null)}
                    onDrop={(e) => { e.preventDefault(); if (arrastandoId) void moverCena(arrastandoId, f.id); }}
                  />
                ))}
              </ul>
            )}
          </nav>
        ) : undefined}
      conteudo={<>
          {/* A trilha do caminho continua existindo mesmo com o trilho
              ao lado, e não por redundância: ela é o ALVO DE SOLTURA
              que tira uma cena da pasta. Sem ela, "mover pra fora"
              precisaria de um menu com a árvore inteira dentro. */}
          {!buscando && (
            <nav className="rv-pasta-caminho" aria-label="Caminho da pasta aberta" data-testid="cenas-trilha">
              <button type="button" className="rv-pasta-degrau"
                aria-current={pastaAtual === null ? "page" : undefined}
                data-testid="trilha-raiz"
                onClick={() => setPastaAtual(null)}
                onDragOver={(e) => { if (arrastandoId) { e.preventDefault(); setPastaAlvo("__raiz__"); } }}
                onDragLeave={() => setPastaAlvo(null)}
                onDrop={(e) => { e.preventDefault(); if (arrastandoId) void moverCena(arrastandoId, null); }}
                data-alvo={pastaAlvo === "__raiz__" || undefined}
              >Todas</button>
              {trilha.map((f, i) => (
                <span key={f.id} className="rv-pasta-degrau-casca">
                  <span className="rv-pasta-sep" aria-hidden="true">/</span>
                  <button
                    type="button" className="rv-pasta-degrau"
                    aria-current={i === trilha.length - 1 ? "page" : undefined}
                    data-alvo={pastaAlvo === f.id || undefined}
                    onClick={() => setPastaAtual(f.id)}
                    onDragOver={(e) => { if (arrastandoId) { e.preventDefault(); setPastaAlvo(f.id); } }}
                    onDragLeave={() => setPastaAlvo(null)}
                    onDrop={(e) => { e.preventDefault(); if (arrastandoId) void moverCena(arrastandoId, f.id); }}
                  >{f.nome}</button>
                </span>
              ))}
            </nav>
          )}

          {buscando && (
            <p className="rv-cena-estado" data-testid="cenas-busca-modo">
              {lista.length === 0
                ? `Nada encontrado para “${busca.trim()}”.`
                : `${lista.length === 1 ? "1 cena" : `${lista.length} cenas`} em todas as pastas.`}
            </p>
          )}

          {/* CARREGANDO — só na PRIMEIRA carga. Uma releitura (depois de
              renomear, por exemplo) não pode apagar a lista da tela: o
              catálogo piscaria a cada escrita. */}
          {carregando && cenas === null && (
            <p className="rv-cena-estado" data-testid="cenas-carregando">
              <Loader2 size={14} className="rv-girando" aria-hidden="true" /> Carregando as cenas…
            </p>
          )}

          {aviso && (
            <p className="rv-cena-estado" data-tipo="aviso" role="status" data-testid="cenas-aviso">
              <AlertTriangle size={14} aria-hidden="true" /> {aviso}
              <button type="button" className="rv-btn rv-btn--ghost" onClick={() => setAviso(null)}>Entendi</button>
            </p>
          )}

          {erro && (
            <p className="rv-cena-estado" data-tipo="erro" role="alert" data-testid="cenas-erro">
              <AlertTriangle size={14} aria-hidden="true" /> {erro}
              <button type="button" className="rv-btn rv-btn--ghost" onClick={() => void recarregar()}>Tentar de novo</button>
            </p>
          )}

          {vazio && (
            <p className="rv-cena-estado" data-testid="cenas-vazio">
              {verArquivo
                ? "Nada arquivado. Arquivar tira a cena do catálogo sem apagá-la."
                : pastaAtual !== null
                  ? "Pasta vazia. Arraste uma cena para cá, ou crie uma."
                  : "Nenhuma cena ainda. Crie a primeira para começar a preparar."}
            </p>
          )}

          {/* As pastas arquivadas, com as cenas DELAS dentro. A aba
              Arquivo deixou de ser uma lista plana porque arquivar uma
              pasta arquiva um CONJUNTO: desmanchá-lo aqui obrigaria a
              remontar à mão o que se quisesse devolver. */}
          {verArquivo && pastasArquivadas.length > 0 && (
            <ul className="rv-gav-pastas" data-testid="cenas-pastas-arquivadas">
              {pastasArquivadas.map((f) => (
                <LinhaPasta
                  key={f.id}
                  pasta={f}
                  aberta={false}
                  arquivada
                  quantidade={arquivadas.filter((c) => c.pastaId === f.id).length}
                  expandida={expandidas.has(f.id)}
                  onAlternarExpansao={() => alternarExpansao(f.id)}
                  cenas={listaDeCenasArquivadas(f.id)}
                  ocupada={ocupadas[f.id] === true}
                  erro={errosPorCena[f.id] ?? null}
                  // Arquivada, a pasta não é caminho: não há pra onde
                  // navegar enquanto ela estiver fora do catálogo.
                  onAbrir={() => alternarExpansao(f.id)}
                  onRenomear={(nome) => void renomearPastaPor(f, nome)}
                  onDesarquivar={() => void desarquivarPastaPor(f)}
                  onExcluir={(nomeConfirmacao) => void excluirPastaPor(f, nomeConfirmacao)}
                  peso={pesoDaPasta(f.id)}
                  alvoDeArrasto={false}
                  onDragOver={() => {}}
                  onDragLeave={() => {}}
                  onDrop={() => {}}
                />
              ))}
            </ul>
          )}

          {lista.length > 0 && (
            <ul className="rv-cena-grade" data-testid="cenas-lista">
              {lista.map((c, i) => (
                <CartaoCena
                  key={c.id}
                  cena={c}
                  vista={c.id === p.cenaVistaId}
                  ocupada={ocupadas[c.id] === true}
                  erro={errosPorCena[c.id] ?? null}
                  onAbrir={() => p.onAbrir(c.id)}
                  onRenomear={(nome) => void renomear(c, nome)}
                  onConfigurar={() => setConfigurandoId(c.id)}
                  miniaturaUrl={c.miniaturaImageId ? miniaturas[c.miniaturaImageId] ?? null : null}
                  jogadoresAqui={jogadores.filter((j) => j.sceneId === c.id)}
                  todosJogadores={jogadores}
                  onMoverJogadores={(ids) => void moverJogadoresPara(c, ids)}
                  onApresentar={() => void apresentar(c)}
                  onDuplicar={(modo) => void duplicar(c, modo)}
                  onArquivar={() => void arquivar(c)}
                  onRestaurar={() => void restaurar(c)}
                  onExcluir={() => void excluir(c)}
                  onMover={(d) => mover(c.id, d)}
                  // Reordenar só faz sentido numa lista que TEM ordem. Na
                  // busca a lista é achatada entre pastas: "subir" ali
                  // significaria trocar a posição de duas cenas que nem
                  // moram no mesmo lugar.
                  podeSubir={!buscando && i > 0}
                  podeDescer={!buscando && i < lista.length - 1}
                  // Na busca o ladrilho diz ONDE a cena mora — sem isso, o
                  // resultado é um nome solto e a pessoa continua sem
                  // saber onde procurar da próxima vez.
                  caminhoPasta={(buscando || pastaAtual === null) && c.pastaId
                    ? pastaPorId.get(c.pastaId)?.caminho ?? null
                    : null}
                  alvoDeJogador={alvoJogadorId === c.id}
                  arrasto={{
                    arrastando: arrastandoId === c.id,
                    alvo: alvoId === c.id && arrastandoId !== c.id,
                    onDragStart: (e) => {
                      setArrastandoId(c.id);
                      e.dataTransfer.effectAllowed = "move";
                      // Firefox não inicia arrasto sem payload.
                      e.dataTransfer.setData("text/plain", c.id);
                    },
                    onDragOver: (e) => {
                      e.preventDefault();
                      /* Um JOGADOR pairando não é o mesmo gesto que uma
                         cena pairando: um manda gente pra cá, o outro
                         reordena. O alvo desenhado tem que dizer qual.

                         `types` e não `getData`: durante o `dragover` o
                         navegador esconde o CONTEÚDO do arrasto (é o que
                         impede uma página de ler o que você arrasta só
                         por você passar por cima dela) e expõe só a
                         lista de tipos. O estado local é a rede de
                         segurança para navegadores que normalizam o
                         tipo. */
                      const ehJogador =
                        e.dataTransfer.types.includes(MIME_JOGADOR) || arrastandoJogador !== null;
                      if (ehJogador) setAlvoJogadorId(c.id);
                      else setAlvoId(c.id);
                    },
                    onDragLeave: () => {
                      setAlvoJogadorId((a) => (a === c.id ? null : a));
                    },
                    onDrop: (e) => {
                      e.preventDefault();
                      const jogador = e.dataTransfer.getData(MIME_JOGADOR) || arrastandoJogador;
                      setAlvoJogadorId(null);
                      if (jogador) { void mandarJogador(jogador, c); return; }
                      soltarSobre(c.id);
                    },
                    onDragEnd: () => { setArrastandoId(null); setAlvoId(null); setAlvoJogadorId(null); },
                  }}
                />
              ))}
            </ul>
          )}
        </>}
      jogadores={<TrilhoJogadores
          jogadores={jogadores}
          nomeDaCena={nomeDaCena}
          separados={separados.length}
          onReagrupar={() => void reagrupar()}
          arrastandoId={arrastandoJogador}
          onArrastarInicio={setArrastandoJogador}
          onArrastarFim={() => { setArrastandoJogador(null); setAlvoJogadorId(null); }}
        />}
      folha={<>
        {criando && (
          <NovaCena
            mapa={mapaPendente}
            ocupado={salvandoNova}
            erro={erroNova}
            onEscolherMapa={() => campoMapaRef.current?.click()}
            onRemoverMapa={removerMapa}
            onCriar={(v) => void criar(v)}
            onCancelar={fecharNova}
          />
        )}

        {/* Um arquivo recusado ANTES de a folha abrir — o caminho "A
            partir de um mapa", onde o seletor vem primeiro — não teria
            onde aparecer: a folha não chegou a existir. */}
        {erroNova && !criando && (
          <p className="rv-gav-erro-flutuante" role="alert">{erroNova}</p>
        )}

        {emEdicao && !criando && (
          <ParametrosCena
            cena={emEdicao}
            ocupada={ocupadas[emEdicao.id] === true}
            erro={errosPorCena[emEdicao.id] ?? null}
            foraDaGrade={emEdicao.id === p.cenaVistaId ? p.foraDaGrade : undefined}
            onMudarTamanho={emEdicao.id === p.cenaVistaId ? p.onMudarTamanho : undefined}
            onSalvar={(v) => void salvarParametros(emEdicao, v)}
            onFechar={() => setConfigurandoId(null)}
          />
        )}
      </>}
    />,
    document.body,
  );
}
