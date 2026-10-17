/**
 * Leitura e escrita dos marcadores da campanha (`vtt_markers`).
 *
 * Mesmo contrato de `sceneStorage.ts`: roda no servidor com o client
 * do usuário logado, então toda consulta passa pela RLS. Só o narrador
 * escreve — um jogador que chame estas funções recebe 0 linhas, não um
 * marcador alterado.
 */

import "server-only";
import { getScopedTableClient } from "../auth/scopedClient";
import { getCurrentUser } from "../auth/session";

export type TipoMarcadorDb = "progresso" | "pressao";

export interface MarcadorDb {
  id: string;
  tipo: TipoMarcadorDb;
  nome: string | null;
  total: number;
  preenchidos: number;
  criadoEm: string;
}

type Resultado<T> = { ok: true; dados: T } | { ok: false; erro: string };

const COLUNAS = "id, tipo, nome, total, preenchidos, created_at";

function linhaParaMarcador(l: Record<string, unknown>): MarcadorDb {
  return {
    id: l.id as string,
    tipo: l.tipo as TipoMarcadorDb,
    nome: (l.nome as string | null) ?? null,
    total: l.total as number,
    preenchidos: l.preenchidos as number,
    criadoEm: l.created_at as string,
  };
}

export async function listarMarcadores(campaignId: string): Promise<Resultado<MarcadorDb[]>> {
  const client = await getScopedTableClient();
  const { data, error } = await client
    .from("vtt_markers")
    .select(COLUNAS)
    .eq("campaign_id", campaignId)
    .order("created_at", { ascending: true });
  if (error) return { ok: false, erro: "Não foi possível carregar os marcadores." };
  return { ok: true, dados: (data ?? []).map(linhaParaMarcador) };
}

export async function criarMarcador(params: {
  campaignId: string;
  tipo: TipoMarcadorDb;
  nome: string | null;
  total: number;
}): Promise<Resultado<MarcadorDb>> {
  const usuario = await getCurrentUser();
  if (!usuario) return { ok: false, erro: "Sessão expirada — faça login novamente." };

  const client = await getScopedTableClient();
  const { data, error } = await client
    .from("vtt_markers")
    .insert({ campaign_id: params.campaignId, tipo: params.tipo, nome: params.nome, total: params.total, created_by: usuario.id })
    .select(COLUNAS)
    .single();
  if (error || !data) return { ok: false, erro: "Só o narrador pode criar marcadores." };
  return { ok: true, dados: linhaParaMarcador(data) };
}

export async function definirPreenchidos(params: { campaignId: string; id: string; preenchidos: number }): Promise<Resultado<MarcadorDb>> {
  const client = await getScopedTableClient();
  const { data, error } = await client
    .from("vtt_markers")
    .update({ preenchidos: params.preenchidos })
    .eq("id", params.id)
    .eq("campaign_id", params.campaignId)
    .select(COLUNAS)
    .maybeSingle();
  if (error || !data) return { ok: false, erro: "Não foi possível alterar o marcador." };
  return { ok: true, dados: linhaParaMarcador(data) };
}

export async function removerMarcador(params: { campaignId: string; id: string }): Promise<Resultado<MarcadorDb>> {
  const client = await getScopedTableClient();
  const { data, error } = await client
    .from("vtt_markers")
    .delete()
    .eq("id", params.id)
    .eq("campaign_id", params.campaignId)
    .select(COLUNAS)
    .maybeSingle();
  if (error || !data) return { ok: false, erro: "Não foi possível remover o marcador." };
  return { ok: true, dados: linhaParaMarcador(data) };
}

/**
 * Desfazer da remoção: devolve a MESMA linha (mesmo id e `created_at`),
 * então o marcador volta para o lugar de onde saiu na faixa.
 */
export async function restaurarMarcador(params: { campaignId: string; marcador: MarcadorDb }): Promise<Resultado<MarcadorDb>> {
  const usuario = await getCurrentUser();
  if (!usuario) return { ok: false, erro: "Sessão expirada — faça login novamente." };

  const m = params.marcador;
  const client = await getScopedTableClient();
  const { data, error } = await client
    .from("vtt_markers")
    .insert({
      id: m.id, campaign_id: params.campaignId, tipo: m.tipo, nome: m.nome, total: m.total,
      preenchidos: m.preenchidos, created_at: m.criadoEm, created_by: usuario.id,
    })
    .select(COLUNAS)
    .single();
  if (error || !data) return { ok: false, erro: "Não foi possível desfazer a remoção." };
  return { ok: true, dados: linhaParaMarcador(data) };
}

export async function lerMarcador(params: { campaignId: string; id: string }): Promise<Resultado<MarcadorDb | null>> {
  const client = await getScopedTableClient();
  const { data, error } = await client
    .from("vtt_markers")
    .select(COLUNAS)
    .eq("id", params.id)
    .eq("campaign_id", params.campaignId)
    .maybeSingle();
  if (error) return { ok: false, erro: "Não foi possível ler o marcador." };
  return { ok: true, dados: data ? linhaParaMarcador(data) : null };
}
