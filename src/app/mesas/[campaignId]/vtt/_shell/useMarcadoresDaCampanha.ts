"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getBrowserSupabaseClient } from "../../../../../lib/supabase/browserClient";
import { ajustarPreenchidos, type MarcadorVtt, type TipoMarcador } from "../_dominio/marcadores";
import { criarMarcadorAction, definirPreenchidosAction, lerMarcadoresAction } from "../_acoes/marcadoresActions";

/**
 * Marcadores da campanha: leitura, aviso por broadcast (migration
 * `20261016120000_vtt_marcadores`) e escrita do narrador.
 *
 * Avançar/recuar é OTIMISTA: o anel muda no clique e o servidor
 * confirma depois. Cliques seguidos no mesmo marcador mandam sempre o
 * valor ABSOLUTO mais novo; uma resposta que chega depois de um clique
 * mais recente é descartada (`versaoRef`), senão o anel "voltaria" no
 * meio de uma sequência rápida.
 */
export function useMarcadoresDaCampanha(campaignId: string) {
  const [marcadores, setMarcadores] = useState<MarcadorVtt[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const marcadoresRef = useRef(marcadores);
  marcadoresRef.current = marcadores;
  const leituraRef = useRef(0);
  const versaoRef = useRef(new Map<string, number>());

  const reler = useCallback(async () => {
    const sequencia = ++leituraRef.current;
    try {
      const r = await lerMarcadoresAction(campaignId);
      if (sequencia !== leituraRef.current) return;
      if (r.ok) { setMarcadores(r.dados); setErro(null); }
      else setErro(r.erro);
    } catch { if (sequencia === leituraRef.current) setErro("Falha ao carregar os marcadores."); }
  }, [campaignId]);

  useEffect(() => {
    setMarcadores([]);
    setErro(null);
    const client = getBrowserSupabaseClient();
    let primeiraAssinatura = true;
    const canal = client?.channel(`campaign:${campaignId}:vtt:markers-changed`, { config: { private: true } })
      .on("broadcast", { event: "markers_changed" }, () => { void reler(); })
      .subscribe((status) => {
        if (status !== "SUBSCRIBED") return;
        if (primeiraAssinatura) primeiraAssinatura = false;
        else void reler(); // reconexão: recupera eventos perdidos
      });
    void reler();
    return () => { ++leituraRef.current; if (canal && client) void client.removeChannel(canal); };
  }, [campaignId, reler]);

  const criar = useCallback(async (dados: { tipo: TipoMarcador; nome: string; total: number }) => {
    try {
      const r = await criarMarcadorAction({ campaignId, ...dados });
      if (r.ok) {
        ++leituraRef.current;
        setMarcadores((ms) => [...ms.filter((m) => m.id !== r.dados.id), r.dados]);
        setErro(null);
      } else setErro(r.erro);
      return r;
    } catch {
      setErro("Falha de rede ao criar marcador.");
      return { ok: false as const, erro: "Falha de rede." };
    }
  }, [campaignId]);

  const ajustar = useCallback((id: string, delta: number) => {
    const atual = marcadoresRef.current.find((m) => m.id === id);
    if (!atual) return;
    const alvo = ajustarPreenchidos(atual, delta);
    if (alvo === atual.preenchidos) return;
    const versao = (versaoRef.current.get(id) ?? 0) + 1;
    versaoRef.current.set(id, versao);
    ++leituraRef.current;
    setMarcadores((ms) => ms.map((m) => (m.id === id ? { ...m, preenchidos: alvo } : m)));
    void definirPreenchidosAction({ campaignId, id, preenchidos: alvo })
      .then((r) => {
        if (versaoRef.current.get(id) !== versao) return;
        if (r.ok) { setMarcadores((ms) => ms.map((m) => (m.id === id ? r.dados : m))); setErro(null); }
        else { setErro(r.erro); void reler(); }
      })
      .catch(() => {
        if (versaoRef.current.get(id) !== versao) return;
        setErro("Falha de rede ao alterar marcador.");
        void reler();
      });
  }, [campaignId, reler]);

  return { marcadores, erro, criar, ajustar };
}
