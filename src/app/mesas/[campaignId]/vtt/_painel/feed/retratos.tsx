"use client";

/**
 * Retratos dos personagens que aparecem no feed. O `ChatTab` pede em
 * lote os ids que ainda não conhece (`lerRetratosFeedAction`) e os
 * cards leem daqui — sem prop atravessando o dispatcher inteiro.
 *
 * O mesmo lote serve as IMAGENS anexadas às mensagens (migration
 * 0153): o id do arquivo vira URL assinada pela regra de sempre — quem
 * não pode ver a mensagem não recebe o endereço.
 */

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { lerRetratosFeedAction, type RetratoFeed } from "../acoes/retratosFeed";
import { assinarImagensAction } from "../../_acoes/imageActions";

const RetratosContext = createContext<ReadonlyMap<string, RetratoFeed>>(new Map());
const ImagensContext = createContext<ReadonlyMap<string, string>>(new Map());

/** URL assinada de uma imagem do chat; `null` enquanto carrega ou sem permissão. */
export function useImagemFeed(assetId: string | null): string | null {
  const mapa = useContext(ImagensContext);
  return assetId ? mapa.get(assetId) ?? null : null;
}

export function useRetratoFeed(characterId: string | null): RetratoFeed | null {
  const mapa = useContext(RetratosContext);
  return characterId ? mapa.get(characterId) ?? null : null;
}

export function RetratosFeedProvider({
  campaignId,
  characterIds,
  imagemIds = [],
  children,
}: {
  campaignId: string;
  characterIds: readonly string[];
  imagemIds?: readonly string[];
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

  const [imagens, setImagens] = useState<ReadonlyMap<string, string>>(() => new Map());
  const imagensPedidas = useRef(new Set<string>());
  useEffect(() => {
    const novos = imagemIds.filter((id) => !imagensPedidas.current.has(id));
    if (novos.length === 0) return;
    for (const id of novos) imagensPedidas.current.add(id);
    assinarImagensAction(campaignId, novos).then((r) => {
      if (!montado.current || !r.ok) return;
      setImagens((atual) => {
        const prox = new Map(atual);
        for (const [id, url] of Object.entries(r.dados ?? {})) prox.set(id, url);
        return prox;
      });
    }).catch(() => {});
  }, [campaignId, imagemIds]);

  return (
    <RetratosContext.Provider value={mapa}>
      <ImagensContext.Provider value={imagens}>{children}</ImagensContext.Provider>
    </RetratosContext.Provider>
  );
}
