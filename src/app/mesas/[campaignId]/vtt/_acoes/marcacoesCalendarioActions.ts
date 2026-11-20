"use server";

import "server-only";
import { resolveCampaignAccess } from "../../../../../lib/campaign/access";
import { getScopedTableClient } from "../../../../../lib/auth/scopedClient";
import { validarNovaMarcacao, type MarcacaoCalendario, type NovaMarcacao } from "../_dominio/marcacoesCalendario";

type Resultado<T> = { ok: true; dados: T } | { ok: false; erro: string };

export async function listarMarcacoesAction(campaignId: string, ano: number, mes: number): Promise<Resultado<MarcacaoCalendario[]>> {
  if (!Number.isInteger(ano) || !Number.isInteger(mes)) return { ok: false, erro: "Mês inválido." };
  return listar(campaignId, { ano, mes });
}

/** Todas as marcações visíveis da campanha — a agenda da janela de tempo. */
export async function listarTodasMarcacoesAction(campaignId: string): Promise<Resultado<MarcacaoCalendario[]>> {
  return listar(campaignId, null);
}

async function listar(campaignId: string, filtro: { ano: number; mes: number } | null): Promise<Resultado<MarcacaoCalendario[]>> {
  const acesso = await resolveCampaignAccess(campaignId);
  if (acesso.kind !== "ok") return { ok: false, erro: "Você não tem acesso a esta campanha." };
  const client = await getScopedTableClient();
  let consulta = client.from("vtt_calendar_marks").select("id, game_year, game_month, game_day, kind, title, visibility, official, author_id")
    .eq("campaign_id", campaignId);
  if (filtro) consulta = consulta.eq("game_year", filtro.ano).eq("game_month", filtro.mes);
  const [{ data, error }, { data: roster }] = await Promise.all([
    consulta.order("created_at"),
    client.rpc("list_campaign_roster", { p_campaign_id: campaignId }),
  ]);
  if (error) return { ok: false, erro: error.message };
  const nomes = new Map<string, string>(((roster ?? []) as { user_id: string; display_name: string | null }[])
    .map((r) => [r.user_id, r.display_name ?? "Jogador"]));
  return {
    ok: true,
    dados: (data ?? []).map((r) => ({
      id: r.id as string, ano: r.game_year as number, mes: r.game_month as number, dia: r.game_day as number,
      tipo: r.kind as MarcacaoCalendario["tipo"], titulo: r.title as string,
      visibilidade: r.visibility as MarcacaoCalendario["visibilidade"], oficial: r.official as boolean,
      autorId: r.author_id as string,
      autorNome: r.author_id === acesso.user.id ? "Você" : r.official ? "Narrador" : nomes.get(r.author_id as string) ?? "Jogador",
    })),
  };
}

export async function criarMarcacaoAction(campaignId: string, nova: NovaMarcacao): Promise<Resultado<null>> {
  const acesso = await resolveCampaignAccess(campaignId);
  if (acesso.kind !== "ok") return { ok: false, erro: "Você não tem acesso a esta campanha." };
  const erro = validarNovaMarcacao(nova);
  if (erro) return { ok: false, erro };
  const client = await getScopedTableClient();
  const { error } = await client.from("vtt_calendar_marks").insert({
    campaign_id: campaignId, game_year: nova.ano, game_month: nova.mes, game_day: nova.dia,
    kind: nova.tipo, title: nova.titulo.trim(), visibility: nova.visibilidade,
    // Marcação do narrador é a oficial da mesa (desenhada como losango).
    official: acesso.role === "narrator",
  });
  if (error) return { ok: false, erro: error.message };
  return { ok: true, dados: null };
}
