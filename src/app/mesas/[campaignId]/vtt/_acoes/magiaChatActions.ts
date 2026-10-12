"use server";

/**
 * "Enviar ao chat" de uma magia (menu de clique direito do grimório).
 *
 * O cartão é o mesmo do Compêndio compartilhado (`compendio_compartilhado`,
 * `ContentReferenceCard`) e sai de um SNAPSHOT montado aqui, a partir da
 * magia publicada — o cliente só diz QUAL magia; nome, custo e texto nunca
 * vêm dele. Personagem citado é relido pela RLS antes de assinar o cartão.
 */

import { getContentClient } from "../../../../../lib/content/client";
import { normalizeSpellContent } from "../../../../../lib/character/spells";
import { getCharacterForCampaign } from "../../../../../lib/character/storage";
import { addLog } from "../../../../../lib/table/storage";
import { exigirAcessoPainel, mensagemDeErro, type ResultadoPainel } from "../_painel/acoes/comum";

const VERTENTE_ROTULO: Record<string, string> = {
  cinetica: "Cinética", energetica: "Energética", material: "Material",
  biotica: "Biótica", sinaptica: "Sináptica", cognitiva: "Cognitiva",
};

export async function enviarMagiaAoChatAction(campaignId: string, slug: string, characterId: string | null): Promise<ResultadoPainel> {
  const v = await exigirAcessoPainel(campaignId);
  if (!v.ok) return { ok: false, erro: v.erro };
  try {
    const { data, error } = await getContentClient()
      .from("content_documents").select("payload")
      .eq("content_type", "spell").eq("slug", slug).eq("status", "published").maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return { ok: false, erro: "Magia não encontrada." };
    const s = normalizeSpellContent(data.payload as Record<string, unknown>);

    let autor: string | null = null;
    if (characterId) {
      const personagem = await getCharacterForCampaign(campaignId, characterId);
      if (!personagem || personagem.archived_at) return { ok: false, erro: "Você não pode enviar como este personagem." };
      autor = personagem.id;
    }

    const e = s.estatisticas;
    const vertente = VERTENTE_ROTULO[s.vertente] ?? s.vertente;
    const acao = e.custo_pa === 0 && e.conjuracaoTexto ? e.conjuracaoTexto.toLowerCase() : `${e.custo_pa} PA`;
    const estatisticas = [
      { rotulo: "Custo", valor: `${e.custo_mana ?? e.custoManaTexto ?? "—"} mana · ${acao}` },
      ...(e.alcanceTexto ? [{ rotulo: "Alcance", valor: e.alcanceTexto }] : []),
      ...(e.duracaoTexto ? [{ rotulo: "Duração", valor: e.duracaoTexto }] : []),
    ];
    await addLog({
      campaignId,
      characterId: autor ?? undefined,
      type: "compendio_compartilhado",
      visibility: "public",
      payload: {
        categoria: "magias",
        categoriaRotulo: "Magia",
        slug: s.slug,
        nome: s.nome,
        origem: "oficial",
        origemRotulo: "Livro RUPTURA v1.2",
        tags: [vertente, `Nível ${e.nivel}`, ...(e.tipo_magia ? [e.tipo_magia] : [])],
        estatisticas,
        descricao: s.descricao_curta ?? null,
        source: "console_magias",
      },
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, erro: mensagemDeErro(err, "Falha ao enviar ao chat.") };
  }
}
