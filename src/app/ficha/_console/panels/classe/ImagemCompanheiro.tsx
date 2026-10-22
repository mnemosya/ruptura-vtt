"use client";

import { useCallback, useEffect, useState } from "react";
import { ImagemRecusadaError, enviarParaUrlAssinada, prepararRecorteQuadrado } from "../../../../../lib/vtt/imagePreparation";
import { cancelarUploadAction, definirImagemCompanheiroAction, finalizarUploadCompanheiroAction, lerImagemCompanheiroAction, reservarUploadAction } from "../../../../mesas/[campaignId]/vtt/_acoes/imageActions";

type Mesa = { campaignId: string; characterId: string } | null | undefined;
type Recorte = { x: number; y: number; tamanho: number };

/**
 * Imagem do companheiro: lê a URL assinada (renova antes de vencer), envia
 * o recorte e tira o vínculo. Mesmo fluxo do avatar da ficha — reserva,
 * PUT direto no Storage, validação no servidor. Fora de uma mesa não há
 * onde guardar: a prévia vale só nesta sessão.
 */
export function useImagemCompanheiro(mesa: Mesa, ativo: boolean) {
  const [url, setUrl] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const campaignId = mesa?.campaignId, characterId = mesa?.characterId;

  useEffect(() => {
    if (!ativo || !campaignId || !characterId) return;
    let vivo = true;
    const buscar = () => { void lerImagemCompanheiroAction(campaignId, characterId).then(r => { if (vivo && r.ok) setUrl(r.dados?.url ?? null); }); };
    buscar();
    const timer = setInterval(buscar, 4 * 60 * 1000);
    return () => { vivo = false; clearInterval(timer); };
  }, [ativo, campaignId, characterId]);

  const enviar = useCallback(async (arquivo: File, recorte: Recorte): Promise<boolean> => {
    setErro(null);
    if (!campaignId || !characterId) {
      const preparada = await prepararRecorteQuadrado(arquivo, recorte).catch(() => null);
      if (preparada) setUrl(preparada.previewUrl);
      return !!preparada;
    }
    setEnviando(true);
    let reservaId: string | null = null;
    try {
      const preparada = await prepararRecorteQuadrado(arquivo, recorte);
      const reserva = await reservarUploadAction(campaignId, preparada.sha256, "companheiro", null, characterId);
      if (!reserva.ok || !reserva.dados) throw new Error(reserva.erro ?? "Não foi possível preparar o envio.");
      reservaId = reserva.dados.reservaId;
      if (reserva.dados.reutilizado) {
        // A mesma imagem já está na campanha: liga direto, sem subir de novo.
        const r = await definirImagemCompanheiroAction(campaignId, characterId, reserva.dados.assetId);
        if (!r.ok) throw new Error(r.erro ?? "Não foi possível definir a imagem.");
      } else {
        await enviarParaUrlAssinada(reserva.dados.uploadUrl!, preparada.blob);
        const r = await finalizarUploadCompanheiroAction(campaignId, reserva.dados.reservaId!, preparada.sha256, characterId);
        if (!r.ok) throw new Error(r.erro ?? "Não foi possível concluir o envio.");
      }
      setUrl(preparada.previewUrl);
      return true;
    } catch (e) {
      if (reservaId) void cancelarUploadAction(campaignId, reservaId).catch(() => {});
      setErro(e instanceof ImagemRecusadaError || e instanceof Error ? e.message : "Não foi possível enviar a imagem.");
      return false;
    } finally {
      setEnviando(false);
    }
  }, [campaignId, characterId]);

  const remover = useCallback(async (): Promise<boolean> => {
    setErro(null);
    if (!campaignId || !characterId) { setUrl(null); return true; }
    setEnviando(true);
    try {
      const r = await definirImagemCompanheiroAction(campaignId, characterId, null);
      if (!r.ok) throw new Error(r.erro ?? "Não foi possível remover a imagem.");
      setUrl(null);
      return true;
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível remover a imagem.");
      return false;
    } finally {
      setEnviando(false);
    }
  }, [campaignId, characterId]);

  return { url, enviar, remover, enviando, erro, limparErro: () => setErro(null), naMesa: !!campaignId && !!characterId };
}
