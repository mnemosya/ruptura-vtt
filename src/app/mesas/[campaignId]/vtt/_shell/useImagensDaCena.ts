"use client";

/**
 * Estado das IMAGENS de uma cena — lista, URLs assinadas e o fluxo de
 * upload inteiro.
 *
 * Existe como hook, e não como mais duzentas linhas dentro de
 * `VttClient.tsx`, porque tudo aqui é um assunto só e nenhum outro
 * pedaço do cliente precisa vê-lo: a lista, a assinatura, o preparo em
 * memória e as quatro escritas otimistas. O `VttClient` recebe de volta
 * uma superfície pequena e a liga na barra, no mapa e no painel.
 *
 * ── ASSINATURA, E POR QUE ELA É UM ESTADO SEPARADO ──────────────────
 * Uma colocação não basta para desenhar: cada arquivo precisa de uma
 * URL assinada, emitida pelo servidor depois de conferir se ESTA pessoa
 * pode vê-lo (`vtt_asset_assinavel_para`, 0100 — e a checagem inclui a
 * camada, não só a colocação). As URLs valem 5 minutos, então elas são
 * cache com renovação, não um campo da linha:
 *
 *   · pede-se assinatura para os ids que ainda não têm URL;
 *   · renova-se periodicamente antes do vencimento;
 *   · id que o servidor recusa assinar simplesmente não volta no mapa,
 *     e a camada desenha o contorno do lugar em vez de imagem quebrada.
 *
 * O silêncio na recusa é deliberado e vem do serviço: confirmar "este
 * id existe mas você não pode vê-lo" já é contar que ele existe.
 *
 * ── ESCRITAS ────────────────────────────────────────────────────────
 * Todas otimistas por `revision`, a convenção das RPCs de token: manda
 * a revisão que leu, e o servidor recusa se já não for a corrente. A
 * projeção que volta da RPC substitui a linha local — nunca se remenda
 * o estado com o que se ACHA que o servidor fez.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  type ImagemPreparada,
  ImagemRecusadaError,
  enviarParaUrlAssinada,
  prepararImagem,
} from "../../../../../lib/vtt/imagePreparation";
import {
  type AjusteImagemCena,
  assinarImagensAction,
  atualizarImagemCenaAction,
  cancelarUploadAction,
  criarImagemCenaAction,
  excluirImagemDaBibliotecaAction,
  finalizarUploadCenaAction,
  lerBibliotecaImagensAction,
  lerImagensCenaAction,
  moverImagemCenaAction,
  removerImagemCenaAction,
  reservarUploadAction,
} from "../_acoes/imageActions";
import {
  type ImagemBiblioteca,
  type ImagemCena,
  imagemBibliotecaDeJson,
  imagemCenaDeJson,
  imagensCenaDeJson,
  larguraInicialM,
} from "../_dominio/imagemCena";
import type { PontoAxial } from "../_dominio/escalaMapa";

/** As URLs valem 5 min no servidor; renovar aos 4 evita a borda. */
const INTERVALO_RENOVACAO_MS = 4 * 60 * 1000;

export interface ImagemPendente {
  preparada: ImagemPreparada;
  /** Onde ela vai cair — o ponto do drop, o do ponteiro, ou o centro da cena. */
  ancora: PontoAxial;
}

export function useImagensDaCena(params: {
  campaignId: string;
  sceneId: string | null;
  ehNarrador: boolean;
  larguraCena: number;
  alturaCena: number;
  /**
   * Outros arquivos que precisam de URL assinada nesta cena — hoje, os
   * retratos de token vindos de arquivo (0101/0102). Ficam na MESMA
   * leva de assinatura: mesmo bucket, mesma autorização, mesmo ciclo de
   * renovação. Duas levas seriam duas chances de discordarem sobre o
   * que ainda está válido.
   */
  idsExtras?: readonly string[];
}) {
  const { campaignId, sceneId, ehNarrador, larguraCena, alturaCena, idsExtras } = params;

  const [imagens, setImagens] = useState<ImagemCena[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [selecionadaId, setSelecionadaId] = useState<string | null>(null);
  const [pendente, setPendente] = useState<ImagemPendente | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // Espelho para os callbacks lerem a lista corrente sem virar
  // dependência de cada `useCallback` (e sem recriar handlers a cada
  // imagem que chega pelo Realtime).
  const imagensRef = useRef<ImagemCena[]>([]);
  imagensRef.current = imagens;

  // ── Leitura ────────────────────────────────────────────────────────
  /** Devolve a lista lida — quem chama às vezes precisa achar nela a
      imagem que acabou de criar (ver `colocarDaBiblioteca`). */
  const recarregar = useCallback(async (): Promise<ImagemCena[] | null> => {
    if (!sceneId) { setImagens([]); return null; }
    const r = await lerImagensCenaAction(campaignId, sceneId);
    if (!r.ok || r.dados === undefined) return null;
    const lista = imagensCenaDeJson(r.dados);
    // Uma releitura tardia de OUTRA cena nunca pode sobrescrever a
    // atual — mesma proteção que a releitura de objetos já faz.
    setImagens((anterior) => (sceneIdRef.current === sceneId ? lista : anterior));
    return lista;
  }, [campaignId, sceneId]);

  const sceneIdRef = useRef<string | null>(sceneId);
  sceneIdRef.current = sceneId;

  useEffect(() => {
    setSelecionadaId(null);
    void recarregar();
  }, [recarregar]);

  // ── Assinatura das URLs ────────────────────────────────────────────
  const idsNecessarios = useMemo(
    () => Array.from(new Set([...imagens.map((i) => i.imageId), ...(idsExtras ?? [])])),
    [imagens, idsExtras],
  );
  // Chave estável: o efeito precisa disparar quando o CONJUNTO muda, não
  // quando o array ganha identidade nova por uma releitura idêntica.
  const chaveIds = idsNecessarios.join(",");

  useEffect(() => {
    if (idsNecessarios.length === 0) { setUrls({}); return; }
    let vivo = true;

    async function assinar() {
      const r = await assinarImagensAction(campaignId, idsNecessarios);
      if (!vivo || !r.ok || !r.dados) return;
      // Substitui, não mescla: um id que deixou de ser assinável
      // (camada escondida, colocação removida) precisa SUMIR do cache,
      // senão a imagem continuaria desenhada com a URL antiga até ela
      // vencer.
      setUrls(r.dados);
    }

    void assinar();
    const timer = setInterval(() => { void assinar(); }, INTERVALO_RENOVACAO_MS);
    return () => { vivo = false; clearInterval(timer); };
    // `chaveIds` é a dependência real; `idsNecessarios` acompanha.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignId, chaveIds]);

  // ── Preparo em memória (colar, soltar, escolher) ───────────────────
  const cancelarPendente = useCallback(() => {
    setPendente((p) => {
      if (p) URL.revokeObjectURL(p.preparada.previewUrl);
      return null;
    });
    setErro(null);
  }, []);

  // Desmontar com um preview aberto vazaria o blob pelo tempo de vida
  // da aba — o mesmo cuidado que `EditorRetratoToken` já toma.
  useEffect(() => () => {
    if (pendenteRef.current) URL.revokeObjectURL(pendenteRef.current.preparada.previewUrl);
  }, []);
  const pendenteRef = useRef<ImagemPendente | null>(null);
  pendenteRef.current = pendente;

  const prepararArquivo = useCallback(async (arquivo: File, ancora: PontoAxial) => {
    if (!ehNarrador) return;
    setErro(null);
    try {
      // Decodifica, reduz e gera o preview SEM enviar nada. É isto que
      // faz "Cancelar" não deixar resíduo: nenhuma reserva de quota,
      // nenhum objeto no Storage, nada para a coleta recolher.
      const preparada = await prepararImagem(arquivo);
      setPendente((anterior) => {
        if (anterior) URL.revokeObjectURL(anterior.preparada.previewUrl);
        return { preparada, ancora };
      });
    } catch (e) {
      setErro(e instanceof ImagemRecusadaError ? e.message : "Não foi possível ler esta imagem.");
    }
  }, [ehNarrador]);

  // ── Confirmação: reserva → envia → finaliza ────────────────────────
  const confirmarColocacao = useCallback(async (papel: "fundo" | "tile") => {
    const atual = pendenteRef.current;
    if (!atual || !sceneId) return;
    setOcupado(true);
    setErro(null);
    let reservaId: string | null = null;
    try {
      const { preparada, ancora } = atual;
      const larguraM = larguraInicialM(papel, preparada.widthPx, larguraCena);
      const colocacao = {
        sceneId,
        papel,
        // Fundo ignora a âncora do gesto e nasce CENTRADO na cena: um
        // mapa colado no canto onde o ponteiro estava seria sempre a
        // primeira coisa a corrigir. Tile respeita o ponto, que é
        // justamente o que soltar num lugar quer dizer.
        centroQ: papel === "fundo" ? (larguraCena - 1) / 2 : ancora.q,
        centroR: papel === "fundo" ? (alturaCena - 1) / 2 : ancora.r,
        larguraM,
      };

      const reserva = await reservarUploadAction(campaignId, preparada.sha256, papel);
      if (!reserva.ok || !reserva.dados) throw new Error(reserva.erro ?? "Não foi possível preparar o envio.");
      reservaId = reserva.dados.reservaId;

      if (reserva.dados.reutilizado) {
        // Este conteúdo já está na campanha: colocar é só criar o uso.
        // Subir de novo gastaria quota por um arquivo idêntico.
        const r = await criarImagemCenaAction(campaignId, reserva.dados.assetId, colocacao);
        if (!r.ok) throw new Error(r.erro ?? "Não foi possível colocar a imagem.");
      } else {
        if (!reserva.dados.uploadUrl || !reserva.dados.reservaId) {
          throw new Error("O servidor não devolveu um destino de envio.");
        }
        await enviarParaUrlAssinada(reserva.dados.uploadUrl, preparada.blob);
        // O finalize mede o arquivo de VERDADE no servidor (decodifica e
        // reencoda) — o que este cliente declarou não chega ao banco.
        const r = await finalizarUploadCenaAction(
          campaignId, reserva.dados.reservaId, preparada.sha256, colocacao,
        );
        if (!r.ok) throw new Error(r.erro ?? "Não foi possível concluir o envio.");
      }

      cancelarPendente();
      await recarregar();
    } catch (e) {
      // Reserva viva sem uso é quota presa até vencer. Devolvê-la aqui
      // é cortesia, não correção: a coleta recolhe de qualquer jeito, e
      // por isso a falha do cancelamento é engolida.
      if (reservaId) void cancelarUploadAction(campaignId, reservaId).catch(() => {});
      setErro(e instanceof Error ? e.message : "Não foi possível colocar a imagem.");
    } finally {
      setOcupado(false);
    }
  }, [campaignId, sceneId, larguraCena, alturaCena, cancelarPendente, recarregar]);

  // ── Escritas otimistas ─────────────────────────────────────────────
  /** Aplica a projeção que a RPC devolveu; em caso de recusa, relê. */
  const aplicar = useCallback(async (r: { ok: boolean; erro?: string; dados?: unknown }) => {
    if (!r.ok) {
      setErro(r.erro ?? "O servidor recusou a alteração.");
      // A tela precisa voltar pro estado válido — a mensagem explica
      // por quê, mas quem conserta o que se vê é a releitura.
      await recarregar();
      return;
    }
    setErro(null);
    const atualizada = imagemCenaDeJson(r.dados);
    if (atualizada) {
      setImagens((lista) => lista.map((i) => (i.id === atualizada.id ? atualizada : i)));
    } else {
      await recarregar();
    }
  }, [recarregar]);

  const mover = useCallback(async (id: string, centroQ: number, centroR: number) => {
    const img = imagensRef.current.find((i) => i.id === id);
    if (!img) return;
    await aplicar(await moverImagemCenaAction(campaignId, id, centroQ, centroR, img.revision));
  }, [campaignId, aplicar]);

  const escalar = useCallback(async (
    id: string,
    larguraM: number,
    /** Centro novo — o gesto de canto mantém o canto oposto parado. */
    centro?: { q: number; r: number },
  ) => {
    const img = imagensRef.current.find((i) => i.id === id);
    if (!img) return;
    // Escalar preserva a distorção deliberada: se `alturaM` estava
    // explícita, ela escala junto, senão continua derivada.
    const alturaM = img.alturaM === null ? null : (img.alturaM * larguraM) / img.larguraM;
    await aplicar(await atualizarImagemCenaAction(campaignId, id, img.revision, {
      larguraM,
      alturaM,
      // Uma escrita só para tamanho + posição (0110).
      centroQ: centro?.q ?? null,
      centroR: centro?.r ?? null,
    }));
  }, [campaignId, aplicar]);

  const ajustar = useCallback(async (img: ImagemCena, ajuste: AjusteImagemCena) => {
    await aplicar(await atualizarImagemCenaAction(campaignId, img.id, img.revision, ajuste));
  }, [campaignId, aplicar]);

  const mudarOrdem = useCallback(async (img: ImagemCena, delta: number) => {
    await aplicar(await atualizarImagemCenaAction(campaignId, img.id, img.revision, { z: img.z + delta }));
  }, [campaignId, aplicar]);

  const remover = useCallback(async (img: ImagemCena) => {
    const r = await removerImagemCenaAction(campaignId, img.id, img.revision);
    if (!r.ok) { setErro(r.erro ?? "Não foi possível remover."); await recarregar(); return; }
    setErro(null);
    setSelecionadaId((s) => (s === img.id ? null : s));
    setImagens((lista) => lista.filter((i) => i.id !== img.id));
  }, [campaignId, recarregar]);

  const jaTemFundo = useMemo(() => imagens.some((i) => i.papel === "fundo"), [imagens]);

  /* ── BIBLIOTECA DA CAMPANHA ────────────────────────────────────────
     Recolocar um arquivo que JÁ está na campanha: sem reserva, sem
     upload, sem gastar quota — só um uso novo do mesmo asset
     (`criar_vtt_scene_image`). É o mesmo atalho que o envio já toma
     sozinho quando reconhece o `sha256`; aqui ele vira escolha
     explícita, em vez de depender de a pessoa achar o arquivo
     original no computador. */
  const [biblioteca, setBiblioteca] = useState<ImagemBiblioteca[] | null>(null);
  const [carregandoBiblioteca, setCarregandoBiblioteca] = useState(false);

  const carregarBiblioteca = useCallback(async () => {
    if (!ehNarrador) return;
    setCarregandoBiblioteca(true);
    setErro(null);
    try {
      const r = await lerBibliotecaImagensAction(campaignId);
      if (!r.ok) throw new Error(r.erro ?? "Não foi possível ler a biblioteca.");
      const lista = Array.isArray(r.dados)
        ? (r.dados as unknown[]).map(imagemBibliotecaDeJson).filter((i): i is ImagemBiblioteca => i !== null)
        : [];
      setBiblioteca(lista);
      // As miniaturas usam o MESMO mapa de URLs assinadas das imagens
      // da cena: uma imagem colocada e a mesma imagem na biblioteca
      // são o mesmo asset, e assinar duas vezes seria desperdício.
      if (lista.length > 0) {
        const assinadas = await assinarImagensAction(campaignId, lista.map((i) => i.id));
        if (assinadas.ok && assinadas.dados) setUrls((atual) => ({ ...atual, ...assinadas.dados }));
      }
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível ler a biblioteca.");
    } finally {
      setCarregandoBiblioteca(false);
    }
  }, [campaignId, ehNarrador]);

  /**
   * Tira um arquivo da biblioteca da campanha. A RPC recusa quando há
   * uso — e a mensagem dela diz quantos e onde, que é o que a pessoa
   * precisa para resolver.
   */
  const excluirDaBiblioteca = useCallback(async (imagem: ImagemBiblioteca) => {
    setOcupado(true);
    setErro(null);
    try {
      const r = await excluirImagemDaBibliotecaAction(campaignId, imagem.id);
      if (!r.ok) throw new Error(r.erro ?? "Não foi possível excluir a imagem.");
      setBiblioteca((atual) => (atual ?? []).filter((i) => i.id !== imagem.id));
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível excluir a imagem.");
    } finally {
      setOcupado(false);
    }
  }, [campaignId]);

  /** Coloca na cena um asset da biblioteca, no mesmo enquadramento do envio. */
  const colocarDaBiblioteca = useCallback(async (
    imagem: ImagemBiblioteca,
    papel: "fundo" | "tile",
    ancora: PontoAxial,
  ) => {
    if (!sceneId) return;
    setOcupado(true);
    setErro(null);
    try {
      const r = await criarImagemCenaAction(campaignId, imagem.id, {
        sceneId,
        papel,
        // Mesma regra do envio: fundo nasce centrado na cena, tile
        // respeita o ponto pedido.
        centroQ: papel === "fundo" ? (larguraCena - 1) / 2 : ancora.q,
        centroR: papel === "fundo" ? (alturaCena - 1) / 2 : ancora.r,
        larguraM: larguraInicialM(papel, imagem.widthPx, larguraCena),
      });
      if (!r.ok) throw new Error(r.erro ?? "Não foi possível colocar a imagem.");
      const lista = await recarregar();
      /* JÁ SELECIONADA: quem acabou de pôr uma imagem quer ajustá-la
         agora — e as alças de redimensionar só existem na selecionada.
         Sem isto era preciso caçar a imagem na lista ou no mapa para
         começar a mexer. */
      const nova = (lista ?? []).find((i) => i.imageId === imagem.id);
      if (nova) setSelecionadaId(nova.id);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível colocar a imagem.");
    } finally {
      setOcupado(false);
    }
  }, [campaignId, sceneId, larguraCena, alturaCena, recarregar]);

  return {
    imagens, urls, selecionadaId, setSelecionadaId,
    pendente, ocupado, erro, limparErro: () => setErro(null),
    jaTemFundo,
    biblioteca, carregandoBiblioteca, carregarBiblioteca, colocarDaBiblioteca, excluirDaBiblioteca,
    recarregar, prepararArquivo, confirmarColocacao, cancelarPendente,
    mover, escalar, ajustar, mudarOrdem, remover,
  };
}
