"use server";

import { getScopedTableClient } from "../../../../../../lib/auth/scopedClient";
import { exigirAcessoPainel, type ResultadoPainel } from "./comum";

export interface AliadoClasse { id: string; nome: string }

/** Projeção pública do grupo, sem payloads nem PN privados do narrador. */
export async function lerAliadosClasseAction(campaignId: string): Promise<ResultadoPainel<AliadoClasse[]>> {
  const acesso = await exigirAcessoPainel(campaignId);
  if (!acesso.ok) return { ok: false, erro: acesso.erro };
  try {
    const client = await getScopedTableClient();
    const { data, error } = await client.rpc("list_campaign_character_allies", { p_campaign_id: campaignId });
    if (error) return { ok: false, erro: "Não foi possível carregar os aliados da campanha." };
    return { ok: true, dados: ((data ?? []) as { id: string; name: string }[]).map(row => ({ id: row.id, nome: row.name })) };

  } catch {
    return { ok: false, erro: "Não foi possível carregar os aliados da campanha." };
  }
}
