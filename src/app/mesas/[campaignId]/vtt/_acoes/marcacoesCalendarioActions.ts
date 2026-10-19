"use server";

import "server-only";
import { resolveCampaignAccess } from "../../../../../lib/campaign/access";
import { getScopedTableClient } from "../../../../../lib/auth/scopedClient";
import { validarNovaMarcacao, type MarcacaoCalendario, type NovaMarcacao } from "../_dominio/marcacoesCalendario";

type Resultado<T> = { ok: true; dados: T } | { ok: false; erro: string };

export async function listarMarcacoesAction(campaignId: string, ano: number, mes: number): Promise<Resultado<MarcacaoCalendario[]>> {
  const acesso = await resolveCampaignAccess(campaignId);
  if (acesso.kind !== "ok") return { ok: false, erro: "Você não tem acesso a esta campanha." };
  if (!Number.isInteger(ano) || !Number.isInteger(mes)) return { ok: false, erro: "Mês inválido." };
  const client = await getScopedTableClient();
  const [{ data, error }, { data: roster }] = await Promise.all([
    client.from("vtt_calendar_marks").select("id, game_year, game_month, game_day, kind, title, visibility, official, author_id")
      .eq("campaign_id", campaignId).eq("game_year", ano).eq("game_month", mes).order("created_at"),
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
