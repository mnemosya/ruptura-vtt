"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getBrowserSupabaseClient } from "../../../../../lib/supabase/browserClient";
import type { FonteLuz, IluminacaoCena, ModoLuz, ParedeLuz } from "../../../../../lib/vtt/lightStorage";
import {
  lerIluminacaoAction, definirAmbienteLuzAction, criarParedeLuzAction, definirParedeLuzAction, removerParedeLuzAction,
  criarFonteLuzAction, definirFonteLuzAction, removerFonteLuzAction, definirVisaoNoturnaAction,
} from "../_acoes/lightActions";

type Resultado<T> = { ok: true; dados: T } | { ok: false; erro: string };

export function useIluminacao(campaignId: string, sceneId: string | null) {
  const [estado, setEstado] = useState<IluminacaoCena | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const sequencia = useRef(0);
  const recarregar = useCallback(async () => {
    if (!sceneId) { setEstado(null); setCarregando(false); return; }
    const atual = ++sequencia.current;
    const resultado = await lerIluminacaoAction(campaignId, sceneId).catch(() => ({ ok: false as const, erro: "Falha de rede ao ler iluminação." }));
    if (atual !== sequencia.current) return;
    if (!resultado.ok) { setErro(resultado.erro); setEstado(null); }
    else { setEstado(resultado.dados); setErro(null); }
    setCarregando(false);
  }, [campaignId, sceneId]);

  useEffect(() => {
    setCarregando(true);
    setEstado(null);
    void recarregar();
    return () => { sequencia.current++; };
  }, [recarregar]);

  useEffect(() => {
    if (!sceneId) return;
    const client = getBrowserSupabaseClient();
    if (!client) return;
    const channel = client.channel(`campaign:${campaignId}:scene:${sceneId}:vtt:light-changed`, { config: { private: true } })
      .on("broadcast", { event: "light_changed" }, (payload) => {
        const p = payload.payload as { v?: unknown; sceneId?: unknown } | null;
        if (p?.v === 1 && p.sceneId === sceneId) void recarregar();
      }).subscribe((status) => { if (status === "SUBSCRIBED") void recarregar(); });
    return () => { void client.removeChannel(channel); };
  }, [campaignId, sceneId, recarregar]);

  const executar = useCallback(async <T,>(acao: () => Promise<Resultado<T>>): Promise<T | null> => {
    try {
      const r = await acao();
      if (!r.ok) { setErro(r.erro); return null; }
      setErro(null);
      await recarregar();
      return r.dados;
    } catch { setErro("Falha de rede ao editar iluminação."); return null; }
  }, [recarregar]);

  return {
    estado, erro, carregando, recarregar,
    definirModo: (modo: ModoLuz) => sceneId && estado ? executar(() => definirAmbienteLuzAction({ campaignId, sceneId, modo, revision: estado.revision })) : Promise.resolve(null),
    criarParede: (a: { q: number; r: number }, b: { q: number; r: number }) => sceneId ? executar(() => criarParedeLuzAction({ campaignId, sceneId, a, b })) : Promise.resolve(null),
    editarParede: (parede: ParedeLuz) => executar(() => definirParedeLuzAction({ campaignId, parede })),
    apagarParede: (id: string) => sceneId ? executar(() => removerParedeLuzAction({ campaignId, sceneId, id })) : Promise.resolve(null),
    criarFonte: (origem: { q: number; r: number }, raioM = 10) => sceneId ? executar(() => criarFonteLuzAction({ campaignId, sceneId, origem, raioM })) : Promise.resolve(null),
    editarFonte: (fonte: FonteLuz) => executar(() => definirFonteLuzAction({ campaignId, fonte })),
    apagarFonte: (id: string) => sceneId ? executar(() => removerFonteLuzAction({ campaignId, sceneId, id })) : Promise.resolve(null),
    definirVisaoNoturna: (tokenId: string, revision: number, ativa: boolean) => sceneId
      ? executar(() => definirVisaoNoturnaAction({ campaignId, sceneId, tokenId, revision, ativa })) : Promise.resolve(null),
  };
}
