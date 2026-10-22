"use server";

import { getScopedTableClient } from "../../../../../../lib/auth/scopedClient";
import { getCurrentUser } from "../../../../../../lib/auth/session";
import { assinarDownloadUrls } from "../../../../../../lib/vtt/imageService";
import { exigirAcessoPainel, type ResultadoPainel } from "./comum";

/** `avatarUrl` já assinado; `null` quando a ficha não tem avatar (a tela cai na sigla). */
export interface AliadoClasse { id: string; nome: string; avatarUrl?: string | null }

/** Projeção pública do grupo, sem payloads nem PN privados do narrador. */
export async function lerAliadosClasseAction(campaignId: string): Promise<ResultadoPainel<AliadoClasse[]>> {
  const acesso = await exigirAcessoPainel(campaignId);
  if (!acesso.ok) return { ok: false, erro: acesso.erro };
  try {
    const client = await getScopedTableClient();
    const { data, error } = await client.rpc("list_campaign_character_allies", { p_campaign_id: campaignId });
    if (error) return { ok: false, erro: "Não foi possível carregar os aliados da campanha." };
    const linhas = (data ?? []) as { id: string; name: string; avatar_image_id?: string | null }[];
    // Assina todos de uma vez, como o diretório de Personagens. Falhar não
    // derruba a lista: sem endereço, a tela desenha a sigla.
    let urls = new Map<string, string>();
    const ids = linhas.map(row => row.avatar_image_id).filter((id): id is string => !!id);
    if (ids.length) {
      try {
        const usuario = await getCurrentUser();
        if (usuario) urls = await assinarDownloadUrls(ids, usuario.id);
      } catch { /* sem avatar, segue com a sigla */ }
    }
    return { ok: true, dados: linhas.map(row => ({ id: row.id, nome: row.name, avatarUrl: row.avatar_image_id ? urls.get(row.avatar_image_id) ?? null : null })) };

  } catch {
    return { ok: false, erro: "Não foi possível carregar os aliados da campanha." };
  }
}
