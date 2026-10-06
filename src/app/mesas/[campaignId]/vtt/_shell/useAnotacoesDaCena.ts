"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getBrowserSupabaseClient } from "../../../../../lib/supabase/browserClient";
import { type AnotacaoCena, type CorAnotacao, type TipoAnotacao } from "../_dominio/anotacoes";
import type { PontoAxial } from "../_dominio/escalaMapa";
import { atualizarAnotacaoAction, criarAnotacaoAction, lerAnotacoesAction, removerAnotacaoAction } from "../_acoes/annotationActions";

export function useAnotacoesDaCena(campaignId: string, sceneId: string | null) {
  const [anotacoes, setAnotacoes] = useState<AnotacaoCena[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const sceneIdRef = useRef(sceneId);
  sceneIdRef.current = sceneId;
  const anotacoesRef = useRef(anotacoes);
  anotacoesRef.current = anotacoes;
  const leituraRef = useRef(0);
  const carregadaRef = useRef(false);

  const reler = useCallback(async () => {
    if (!sceneId) return;
    const sequencia = ++leituraRef.current;
    try {
      const r = await lerAnotacoesAction({ campaignId, sceneId });
      if (sequencia !== leituraRef.current || sceneIdRef.current !== sceneId) return;
      if (r.ok) { carregadaRef.current = true; setAnotacoes(r.dados); setErro(null); }
      else setErro(r.erro);
    } catch { if (sequencia === leituraRef.current && sceneIdRef.current === sceneId) setErro("Falha ao carregar desenhos e textos."); }
  }, [campaignId, sceneId]);

  useEffect(() => {
    ++leituraRef.current;
    carregadaRef.current = false;
    setAnotacoes([]);
    setErro(null);
    if (!sceneId) return;
    const client = getBrowserSupabaseClient();
    let primeiraAssinatura = true;
    const canal = client?.channel(`campaign:${campaignId}:scene:${sceneId}:vtt:annotations-changed`, { config: { private: true } })
      .on("broadcast", { event: "annotations_changed" }, () => { void reler(); })
      .subscribe((status) => {
        if (status !== "SUBSCRIBED") return;
        if (primeiraAssinatura) primeiraAssinatura = false;
        else void reler(); // reconexão: recupera eventos perdidos
      });
    void reler();
    return () => { ++leituraRef.current; if (canal && client) void client.removeChannel(canal); };
  }, [campaignId, sceneId, reler]);

  const criar = useCallback(async (dados: { tipo: TipoAnotacao; pontos: PontoAxial[]; texto: string | null; cor: CorAnotacao; espessura: number; tamanho: number; privada: boolean }) => {
    if (!sceneId) return { ok: false as const, erro: "Cena indisponível." };
    try {
      const r = await criarAnotacaoAction({ campaignId, sceneId, ...dados });
      if (sceneIdRef.current === sceneId) {
        if (r.ok) {
          ++leituraRef.current;
          setAnotacoes((a) => [...a.filter((x) => x.id !== r.dados.id), r.dados]); setErro(null);
          if (!carregadaRef.current) void reler();
        }
        else setErro(r.erro);
      }
      return r;
    } catch { if (sceneIdRef.current === sceneId) setErro("Falha de rede ao criar anotação."); return { ok: false as const, erro: "Falha de rede." }; }
  }, [campaignId, sceneId, reler]);

  const atualizar = useCallback(async (id: string, revision: number, patch: { pontos?: PontoAxial[]; texto?: string; cor?: CorAnotacao; espessura?: number; tamanho?: number; privada?: boolean }) => {
    if (!sceneId) return { ok: false as const, erro: "Cena indisponível." };
    try {
      const r = await atualizarAnotacaoAction({ campaignId, sceneId, id, revision, ...patch });
      if (sceneIdRef.current === sceneId) {
        if (r.ok) { ++leituraRef.current; setAnotacoes((a) => a.map((x) => x.id === id ? r.dados : x)); setErro(null); }
        else { setErro(r.erro); void reler(); }
      }
      return r;
    } catch { if (sceneIdRef.current === sceneId) setErro("Falha de rede ao editar anotação."); return { ok: false as const, erro: "Falha de rede." }; }
  }, [campaignId, sceneId, reler]);

  const remover = useCallback(async (id: string, revision: number) => {
    if (!sceneId) return { ok: false as const, erro: "Cena indisponível." };
    try {
      const r = await removerAnotacaoAction({ campaignId, sceneId, id, revision });
      if (sceneIdRef.current === sceneId) {
        if (r.ok) { ++leituraRef.current; setAnotacoes((a) => a.filter((x) => x.id !== id)); setErro(null); }
        else { setErro(r.erro); void reler(); }
      }
      return r;
    } catch { if (sceneIdRef.current === sceneId) setErro("Falha de rede ao remover anotação."); return { ok: false as const, erro: "Falha de rede." }; }
  }, [campaignId, sceneId, reler]);

  return { anotacoes, anotacoesRef, erro, criar, atualizar, remover, reler };
}
