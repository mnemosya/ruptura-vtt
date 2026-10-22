"use server";

import { getScopedTableClient } from "../../../../../../lib/auth/scopedClient";
import { getCurrentUser } from "../../../../../../lib/auth/session";
import { assinarDownloadUrls } from "../../../../../../lib/vtt/imageService";
import { characterDerivedFormulas, computeDerivedStats, normalizeCharacter, type CharacterRulesPayload } from "../../../../../../lib/character";
import { getCharacterRules } from "../../../../../../lib/content";
import { exigirAcessoPainel, type ResultadoPainel } from "./comum";

/** `avatarUrl` já assinado; `null` quando a ficha não tem avatar (a tela cai na sigla). PV/PE com o teto calculado pelas regras. */
export interface AliadoClasse { id: string; nome: string; avatarUrl?: string | null; pv?: number; pvMax?: number; pe?: number; peMax?: number; condicoes?: string[] }

/** Projeção pública do grupo, sem payloads nem PN privados do narrador. */
export async function lerAliadosClasseAction(campaignId: string): Promise<ResultadoPainel<AliadoClasse[]>> {
  const acesso = await exigirAcessoPainel(campaignId);
  if (!acesso.ok) return { ok: false, erro: acesso.erro };
  try {
    const client = await getScopedTableClient();
    const { data, error } = await client.rpc("list_campaign_character_allies", { p_campaign_id: campaignId });
    if (error) return { ok: false, erro: "Não foi possível carregar os aliados da campanha." };
    const linhas = (data ?? []) as { id: string; name: string; avatar_image_id?: string | null; vitais?: Record<string, unknown> | null }[];
    const regras = ((await getCharacterRules().catch(() => null))?.payload as CharacterRulesPayload | undefined) ?? null;
    // Mesmo par normalizar → derivados → normalizar do diretório de Personagens,
    // sobre a projeção mínima que a função devolve (não a ficha inteira).
    const vitais = (row: (typeof linhas)[number]) => {
      if (!row.vitais) return {};
      try {
        const primeira = normalizeCharacter(row.vitais);
        const derived = computeDerivedStats(primeira.atributos, regras, primeira.mana_bonus_ruptura ?? 0, characterDerivedFormulas(primeira));
        const ficha = normalizeCharacter(primeira, derived);
        const condicoes = Array.isArray(row.vitais.condicoes) ? (row.vitais.condicoes as unknown[]).filter((c): c is string => typeof c === "string") : [];
        return { pv: ficha.recursos_atuais?.pv ?? derived.pv_max, pvMax: derived.pv_max, pe: ficha.recursos_atuais?.pe ?? derived.pe_max, peMax: derived.pe_max, condicoes };
      } catch { return {}; }
    };
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
    return { ok: true, dados: linhas.map(row => ({ id: row.id, nome: row.name, avatarUrl: row.avatar_image_id ? urls.get(row.avatar_image_id) ?? null : null, ...vitais(row) })) };

  } catch {
    return { ok: false, erro: "Não foi possível carregar os aliados da campanha." };
  }
}
