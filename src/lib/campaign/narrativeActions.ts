"use server";

import { getScopedTableClient } from "../auth/scopedClient";
import { resolveCampaignAccess } from "./access";

export type NarrativeTipo = "sessao" | "anotacao" | "handout" | "npc" | "lugar";
export type NarrativeEstado = "rascunho" | "publicado" | "arquivado";

export interface NarrativeEntry {
  id: string;
  campaign_id: string;
  tipo: NarrativeTipo;
  titulo: string | null;
  corpo: string | null;
  etiquetas: string[];
  estado: NarrativeEstado;
  acontecida_em: string | null;
  online_session_id: string | null;
  character_id: string | null;
  criado_em: string;
  atualizado_em: string;
  arquivado_em: string | null;
}

export interface NarrativeFiltro {
  tipo?: NarrativeTipo;
  etiqueta?: string;
  estado?: NarrativeEstado;
  busca?: string;
  ordem?: "recentes" | "titulo" | "sessao";
}

type Resultado<T> = { ok: true; data: T } | { ok: false; error: string };
const FALHA = "Não foi possível completar a operação. Atualize e tente de novo.";

/**
 * Conteúdo narrativo da campanha (CONT-02).
 *
 * Nada aqui decide quem vê o quê: a RLS de `campaign_narrative_entries`
 * e a função `narrativa_pode_ver` (0142) fazem isso, e este módulo só
 * conversa com elas. Filtrar no servidor de aplicação seria uma segunda
 * implementação da regra, divergindo no primeiro caso difícil.
 *
 * O `estado` também não se escreve direto por aqui — publicar, arquivar
 * e revelar têm função própria abaixo, para que "arquivado sem data" ou
 * "revelado sem limpar exceção" não sejam nem expressáveis.
 */
export async function listNarrativeEntries(
  campaignId: string, filtro: NarrativeFiltro = {},
): Promise<{ entries: NarrativeEntry[]; error?: string }> {
  try {
    const client = await getScopedTableClient();
    let q = client.from("campaign_narrative_entries").select("*").eq("campaign_id", campaignId);
    if (filtro.tipo) q = q.eq("tipo", filtro.tipo);
    if (filtro.estado) q = q.eq("estado", filtro.estado);
    if (filtro.etiqueta) q = q.contains("etiquetas", [filtro.etiqueta]);
    if (filtro.busca?.trim()) {
      const termo = `%${filtro.busca.trim()}%`;
      q = q.or(`titulo.ilike.${termo},corpo.ilike.${termo}`);
    }
    q = filtro.ordem === "titulo" ? q.order("titulo", { ascending: true, nullsFirst: false })
      : filtro.ordem === "sessao" ? q.order("acontecida_em", { ascending: false, nullsFirst: false })
      : q.order("atualizado_em", { ascending: false });
    const { data, error } = await q;
    if (error) throw error;
    return { entries: (data ?? []) as NarrativeEntry[] };
  } catch {
    return { entries: [], error: "Não foi possível carregar o conteúdo da campanha." };
  }
}

async function exigirNarrador(campaignId: string) {
  const access = await resolveCampaignAccess(campaignId);
  if (access.kind !== "ok" || access.role !== "narrator") {
    throw new Error("Só o narrador organiza o conteúdo da campanha.");
  }
}

export async function createNarrativeEntry(campaignId: string, entrada: {
  tipo: NarrativeTipo; titulo?: string | null; corpo?: string | null; etiquetas?: string[];
  acontecidaEm?: string | null; onlineSessionId?: string | null; characterId?: string | null;
}): Promise<Resultado<NarrativeEntry>> {
  try {
    await exigirNarrador(campaignId);
    const titulo = entrada.titulo?.trim() || null;
    if (!titulo && entrada.tipo !== "handout") {
      return { ok: false, error: "Dê um título a esta entrada." };
    }
    const client = await getScopedTableClient();
    const { data, error } = await client.from("campaign_narrative_entries").insert({
      campaign_id: campaignId, tipo: entrada.tipo, titulo, corpo: entrada.corpo?.trim() || null,
      etiquetas: normalizarEtiquetas(entrada.etiquetas),
      // Cada campo só viaja no seu tipo — o banco recusaria de todo
      // jeito, e mandar mesmo assim tornaria o erro mais confuso.
      acontecida_em: entrada.tipo === "sessao" ? entrada.acontecidaEm ?? null : null,
      online_session_id: entrada.tipo === "sessao" ? entrada.onlineSessionId ?? null : null,
      character_id: entrada.tipo === "npc" ? entrada.characterId ?? null : null,
    }).select().single();
    if (error) throw error;
    return { ok: true, data: data as NarrativeEntry };
  } catch (e) {
    return { ok: false, error: e instanceof Error && e.message.includes("narrador") ? e.message : FALHA };
  }
}

export async function updateNarrativeEntry(campaignId: string, entryId: string, campos: {
  titulo?: string | null; corpo?: string | null; etiquetas?: string[];
  acontecidaEm?: string | null; characterId?: string | null;
}): Promise<Resultado<NarrativeEntry>> {
  try {
    await exigirNarrador(campaignId);
    const patch: Record<string, unknown> = {};
    if (campos.titulo !== undefined) patch.titulo = campos.titulo?.trim() || null;
    if (campos.corpo !== undefined) patch.corpo = campos.corpo?.trim() || null;
    if (campos.etiquetas !== undefined) patch.etiquetas = normalizarEtiquetas(campos.etiquetas);
    if (campos.acontecidaEm !== undefined) patch.acontecida_em = campos.acontecidaEm;
    if (campos.characterId !== undefined) patch.character_id = campos.characterId;
    const client = await getScopedTableClient();
    const { data, error } = await client.from("campaign_narrative_entries")
      .update(patch).eq("id", entryId).eq("campaign_id", campaignId).select().single();
    if (error) throw error;
    return { ok: true, data: data as NarrativeEntry };
  } catch {
    return { ok: false, error: FALHA };
  }
}

/**
 * Publicar, arquivar e voltar a rascunho. `arquivado_em` acompanha o
 * estado aqui porque o banco exige os dois juntos — e exige de
 * propósito: arquivado sem data seria um registro sem quando.
 */
export async function setNarrativeEstado(
  campaignId: string, entryId: string, estado: NarrativeEstado,
): Promise<Resultado<NarrativeEntry>> {
  try {
    await exigirNarrador(campaignId);
    const client = await getScopedTableClient();
    const { data, error } = await client.from("campaign_narrative_entries")
      .update({ estado, arquivado_em: estado === "arquivado" ? new Date().toISOString() : null })
      .eq("id", entryId).eq("campaign_id", campaignId).select().single();
    if (error) throw error;
    return { ok: true, data: data as NarrativeEntry };
  } catch {
    return { ok: false, error: FALHA };
  }
}

/**
 * Exceção de visibilidade, numa transação só (RPC `set_narrative_visibility`,
 * 0143).
 *
 * Antes isto eram duas instruções, apagar e inserir. Falhar entre elas
 * deixava a lista vazia — que nesta modelagem significa "a mesa toda
 * vê". A falha revelava. Num recurso cujo propósito é o segredo, o erro
 * tem de cair para o lado de esconder.
 *
 * `null` ou lista vazia = revelar para a mesa toda. Não se insere uma
 * linha por jogador para dizer "todos": com linhas por jogador, quem
 * entrasse na campanha depois ficaria de fora sem ninguém perceber.
 */
export async function setNarrativeVisibility(
  campaignId: string, entryId: string, userIds: string[] | null,
): Promise<Resultado<null>> {
  try {
    await exigirNarrador(campaignId);
    const client = await getScopedTableClient();
    const { error } = await client.rpc("set_narrative_visibility", {
      p_entry_id: entryId,
      p_user_ids: userIds && userIds.length > 0 ? userIds : null,
    });
    if (error) throw error;
    return { ok: true, data: null };
  } catch {
    return { ok: false, error: FALHA };
  }
}

/**
 * Excluir de vez — diferente de arquivar, e por isso função própria. As
 * relações e os comentários vão junto por cascata do banco; o texto da
 * confirmação na interface é que precisa dizer isso a quem clica.
 */
export async function deleteNarrativeEntry(campaignId: string, entryId: string): Promise<Resultado<null>> {
  try {
    await exigirNarrador(campaignId);
    const client = await getScopedTableClient();
    const { error } = await client.from("campaign_narrative_entries")
      .delete().eq("id", entryId).eq("campaign_id", campaignId);
    if (error) throw error;
    return { ok: true, data: null };
  } catch {
    return { ok: false, error: FALHA };
  }
}

/** Relação simétrica: o par é ordenado aqui para bater com o check do banco. */
export async function linkNarrativeEntries(
  campaignId: string, a: string, b: string, ligar: boolean,
): Promise<Resultado<null>> {
  try {
    await exigirNarrador(campaignId);
    if (a === b) return { ok: false, error: "Um item não se relaciona consigo mesmo." };
    const [entry_a, entry_b] = a < b ? [a, b] : [b, a];
    const client = await getScopedTableClient();
    const { error } = ligar
      ? await client.from("campaign_narrative_links").upsert({ campaign_id: campaignId, entry_a, entry_b })
      : await client.from("campaign_narrative_links").delete().eq("entry_a", entry_a).eq("entry_b", entry_b);
    if (error) throw error;
    return { ok: true, data: null };
  } catch {
    return { ok: false, error: FALHA };
  }
}

export interface NarrativeComment {
  id: string; entry_id: string; autor_id: string; corpo: string;
  criado_em: string; editado_em: string | null;
}

export async function listNarrativeComments(entryId: string): Promise<{ comments: NarrativeComment[]; error?: string }> {
  try {
    const client = await getScopedTableClient();
    const { data, error } = await client.from("campaign_narrative_comments")
      .select("id,entry_id,autor_id,corpo,criado_em,editado_em").eq("entry_id", entryId).order("criado_em");
    if (error) throw error;
    return { comments: (data ?? []) as NarrativeComment[] };
  } catch {
    return { comments: [], error: "Não foi possível carregar os comentários." };
  }
}

/**
 * Comentar, editar e remover. A autoria não vem do cliente: a RLS exige
 * `autor_id = auth.uid()` no insert, então assinar como outro não é
 * possível nem mandando o id de outra pessoa. Remover é do autor OU do
 * narrador; editar é só do autor — o narrador apaga, mas não reescreve
 * a fala de ninguém.
 */
export async function addNarrativeComment(entryId: string, campaignId: string, corpo: string): Promise<Resultado<null>> {
  try {
    const texto = corpo.trim();
    if (!texto) return { ok: false, error: "Escreva algo antes de enviar." };
    const access = await resolveCampaignAccess(campaignId);
    if (access.kind !== "ok") throw new Error("Sem acesso.");
    const client = await getScopedTableClient();
    const { error } = await client.from("campaign_narrative_comments")
      .insert({ entry_id: entryId, campaign_id: campaignId, autor_id: access.user.id, corpo: texto });
    if (error) throw error;
    return { ok: true, data: null };
  } catch {
    return { ok: false, error: FALHA };
  }
}

export async function editNarrativeComment(commentId: string, corpo: string): Promise<Resultado<null>> {
  try {
    const texto = corpo.trim();
    if (!texto) return { ok: false, error: "Escreva algo antes de salvar." };
    const client = await getScopedTableClient();
    const { error } = await client.from("campaign_narrative_comments")
      .update({ corpo: texto, editado_em: new Date().toISOString() }).eq("id", commentId);
    if (error) throw error;
    return { ok: true, data: null };
  } catch {
    return { ok: false, error: FALHA };
  }
}

export async function deleteNarrativeComment(commentId: string): Promise<Resultado<null>> {
  try {
    const client = await getScopedTableClient();
    const { error } = await client.from("campaign_narrative_comments").delete().eq("id", commentId);
    if (error) throw error;
    return { ok: true, data: null };
  } catch {
    return { ok: false, error: FALHA };
  }
}

/** Etiquetas são o que substitui o tipo "outros": minúsculas, sem repetição, sem vazias. */
function normalizarEtiquetas(etiquetas?: string[]): string[] {
  if (!etiquetas) return [];
  return Array.from(new Set(etiquetas.map((e) => e.trim().toLowerCase()).filter(Boolean)));
}

export interface SessionParticipant {
  user_id: string;
  primeiro_visto: string;
  ultimo_visto: string;
  origem: "automatico" | "manual";
  incluido: boolean;
}

/**
 * Participantes de uma sessão registrada (CONT-04).
 *
 * A lista é acumulada pelos batimentos durante a sessão — não é uma
 * foto do fim, que registraria só quem ficou até o fim. Quem estava com
 * "Aparecer offline" não está aqui, por PRES-01.
 *
 * A RLS segue a visibilidade da própria entrada: enquanto o registro é
 * rascunho, só o narrador lê.
 */
export async function listSessionParticipants(sessionId: string): Promise<{
  participants: SessionParticipant[]; error?: string;
}> {
  try {
    const client = await getScopedTableClient();
    const { data, error } = await client.from("campaign_session_participants")
      .select("user_id,primeiro_visto,ultimo_visto,origem,incluido")
      .eq("session_id", sessionId).order("primeiro_visto");
    if (error) throw error;
    return { participants: (data ?? []) as SessionParticipant[] };
  } catch {
    return { participants: [], error: "Não foi possível carregar os participantes." };
  }
}

/** Correção manual da lista — só do narrador, e auditada no banco. */
export async function setSessionParticipant(
  campaignId: string, sessionId: string, userId: string, incluir: boolean,
): Promise<Resultado<null>> {
  try {
    await exigirNarrador(campaignId);
    const client = await getScopedTableClient();
    const { error } = await client.rpc("set_session_participant", {
      p_session_id: sessionId, p_user_id: userId, p_incluir: incluir,
    });
    if (error) throw error;
    return { ok: true, data: null };
  } catch {
    return { ok: false, error: FALHA };
  }
}
