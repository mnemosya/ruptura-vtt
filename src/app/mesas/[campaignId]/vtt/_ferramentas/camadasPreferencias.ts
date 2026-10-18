"use client";

/**
 * ORDEM de empilhamento do "Conteúdo da cena" — preferência LOCAL,
 * por usuário e campanha.
 *
 * Visibilidade e bloqueio são da CENA (0093) e sincronizam pra mesa;
 * a ordem NÃO: foi pedida como ajuste de trabalho de quem monta o
 * mapa ("como em app de edição de imagem"), e gravá-la na cena
 * exigiria coluna e RPC novas. Por isso mora aqui, com as mesmas
 * garantias de `areasPreferencias.ts`: chave versionada, leitura
 * tolerante (qualquer coisa fora do formato cai no padrão) e escrita
 * que nunca quebra a mesa se o storage estiver cheio ou bloqueado.
 *
 * A lista vai do TOPO para o FUNDO — a mesma direção em que o painel
 * mostra. Quem desenha (`MapaHex`) inverte.
 */

import { useCallback, useEffect, useState } from "react";
import type { CamadaId } from "../_shell/PainelCamadas";

/** As camadas que podem trocar de lugar — só as de conteúdo da cena. */
export type CamadaCenaId = Extract<CamadaId, "imagemFundo" | "tiles" | "terrenoFuncional" | "objetos" | "tokens">;

/** Topo → fundo. É exatamente a pilha que o mapa desenhava antes de existir reordenação. */
export const ORDEM_CENA_PADRAO: readonly CamadaCenaId[] = ["tokens", "objetos", "terrenoFuncional", "tiles", "imagemFundo"];

const VERSAO = "v1";
export function chaveOrdemCamadas(usuarioId: string | null, campaignId: string): string {
  return `rv-camadas-ordem:${VERSAO}:${usuarioId ?? "anon"}:${campaignId}`;
}

/** Aceita só uma permutação exata das cinco; o resto vira padrão. */
export function ordemCenaValida(bruto: unknown): readonly CamadaCenaId[] {
  if (!Array.isArray(bruto) || bruto.length !== ORDEM_CENA_PADRAO.length) return ORDEM_CENA_PADRAO;
  const vistos = new Set<string>();
  for (const v of bruto) {
    if (typeof v !== "string" || !(ORDEM_CENA_PADRAO as readonly string[]).includes(v) || vistos.has(v)) return ORDEM_CENA_PADRAO;
    vistos.add(v);
  }
  return bruto as CamadaCenaId[];
}

export function carregarOrdemCamadas(chave: string): readonly CamadaCenaId[] {
  if (typeof window === "undefined") return ORDEM_CENA_PADRAO;
  try {
    const bruto = window.localStorage.getItem(chave);
    return bruto ? ordemCenaValida(JSON.parse(bruto)) : ORDEM_CENA_PADRAO;
  } catch {
    return ORDEM_CENA_PADRAO;
  }
}

export function salvarOrdemCamadas(chave: string, ordem: readonly CamadaCenaId[]): void {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(chave, JSON.stringify(ordem)); } catch { /* storage cheio/bloqueado: só não lembra */ }
}

/**
 * Estado + persistência num gancho só, pra quem integra (`VttClient`)
 * precisar de uma linha. Começa no padrão e lê depois de montar — ler
 * no primeiro render divergiria do HTML do servidor.
 */
export function useOrdemCamadas(usuarioId: string | null, campaignId: string) {
  const chave = chaveOrdemCamadas(usuarioId, campaignId);
  const [ordem, setOrdem] = useState<readonly CamadaCenaId[]>(ORDEM_CENA_PADRAO);
  useEffect(() => { setOrdem(carregarOrdemCamadas(chave)); }, [chave]);
  const definir = useCallback((nova: readonly CamadaCenaId[]) => {
    const valida = ordemCenaValida(nova);
    setOrdem(valida);
    salvarOrdemCamadas(chave, valida);
  }, [chave]);
  return [ordem, definir] as const;
}
