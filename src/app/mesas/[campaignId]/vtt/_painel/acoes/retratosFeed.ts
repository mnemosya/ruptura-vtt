"use server";

/**
 * RETRATOS DO FEED — o rosto de quem rolou, para o cabeçalho dos cards
 * de rolagem do chat.
 *
 * Por que a leitura dos personagens passa pelo cliente ADMIN: o jogador
 * não lê (RLS) a ficha de um personagem que não controla, mas vê as
 * rolagens dele no chat. Daqui sai SÓ o id da imagem e o tipo (PJ/PN)
 * de personagens DESTA mesa — nada da ficha.
 *
 * Quem decide se o rosto aparece é a assinatura
 * (`vtt_asset_assinavel_para`, migration 0114): o jogador só recebe o
 * endereço se já pode ver aquela imagem (personagem que ele lê, ou
 * token visível na cena). Sem endereço, o card cai na sigla — o mesmo
 * fallback da aba Personagens.
 */

import { getAdminSupabaseClient } from "../../../../../../lib/supabase/adminClient";
import { assinarDownloadUrls } from "../../../../../../lib/vtt/imageService";
import { getCurrentUser } from "../../../../../../lib/auth/session";
import { exigirAcessoPainel, mensagemDeErro, type ResultadoPainel } from "./comum";

export interface RetratoFeed {
  avatarUrl: string | null;
  tipo: "jogador" | "pn";
}

/** Teto por chamada: o feed pede em lote só os ids que ainda não conhece. */
const MAX_IDS = 100;

export async function lerRetratosFeedAction(
  campaignId: string,
  characterIds: string[],
): Promise<ResultadoPainel<Record<string, RetratoFeed>>> {
  const v = await exigirAcessoPainel(campaignId);
  if (!v.ok) return { ok: false, erro: v.erro };

  const ids = Array.from(new Set(characterIds.filter((id) => typeof id === "string" && id.length > 0))).slice(0, MAX_IDS);
  if (ids.length === 0) return { ok: true, dados: {} };

  try {
    const client = getAdminSupabaseClient();
    const usuario = await getCurrentUser();
    if (!client || !usuario) return { ok: true, dados: {} };

    const { data, error } = await client
      .from("characters")
      .select("id, avatar_image_id, tipo:payload->metadados->>tipo_personagem")
      .eq("campaign_id", campaignId)
      .in("id", ids);
    if (error) throw new Error(error.message);

    const linhas = (data ?? []) as { id: string; avatar_image_id: string | null; tipo: string | null }[];
    const assinados = await assinarDownloadUrls(
      linhas.map((l) => l.avatar_image_id).filter((id): id is string => !!id),
      usuario.id,
    ).catch(() => new Map<string, string>());

    const dados: Record<string, RetratoFeed> = {};
    for (const l of linhas) {
      dados[l.id] = {
        avatarUrl: (l.avatar_image_id && assinados.get(l.avatar_image_id)) || null,
        tipo: l.tipo === "pn" ? "pn" : "jogador",
      };
    }
    return { ok: true, dados };
  } catch (e) {
    return { ok: false, erro: mensagemDeErro(e, "Falha ao ler os retratos do chat.") };
  }
}
