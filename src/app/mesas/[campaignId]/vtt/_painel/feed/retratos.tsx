"use client";

/**
 * Retratos dos personagens que aparecem no feed. O `ChatTab` pede em
 * lote os ids que ainda não conhece (`lerRetratosFeedAction`) e os
 * cards leem daqui — sem prop atravessando o dispatcher inteiro.
 */

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { lerRetratosFeedAction, type RetratoFeed } from "../acoes/retratosFeed";

const RetratosContext = createContext<ReadonlyMap<string, RetratoFeed>>(new Map());

export function useRetratoFeed(characterId: string | null): RetratoFeed | null {
  const mapa = useContext(RetratosContext);
  return characterId ? mapa.get(characterId) ?? null : null;
}

export function RetratosFeedProvider({
  campaignId,
  characterIds,
  children,
}: {
  campaignId: string;
  characterIds: readonly string[];
  children: ReactNode;
}) {
  const [mapa, setMapa] = useState<ReadonlyMap<string, RetratoFeed>>(() => new Map());
  /* Ids já pedidos (com ou sem resposta): uma rolagem nova do mesmo
     personagem não refaz a ida ao servidor. */
  const pedidos = useRef(new Set<string>());
  /* Montado, e não um `vivo` por efeito: a lista de ids muda a cada
     card novo, e cancelar a ida anterior perderia ids já marcados. */
  const montado = useRef(true);
  useEffect(() => {
    montado.current = true;
    return () => { montado.current = false; };
  }, []);

  useEffect(() => {
    const novos = characterIds.filter((id) => !pedidos.current.has(id));
    if (novos.length === 0) return;
    for (const id of novos) pedidos.current.add(id);
    lerRetratosFeedAction(campaignId, novos).then((r) => {
      if (!montado.current || !r.ok) return;
      setMapa((atual) => {
        const prox = new Map(atual);
        for (const [id, retrato] of Object.entries(r.dados ?? {})) prox.set(id, retrato);
        return prox;
      });
    }).catch(() => {});
  }, [campaignId, characterIds]);

  return <RetratosContext.Provider value={mapa}>{children}</RetratosContext.Provider>;
}
