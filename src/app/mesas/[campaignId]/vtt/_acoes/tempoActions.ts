"use server";

import "server-only";
import { resolveCampaignAccess } from "../../../../../lib/campaign/access";
import { getScopedTableClient } from "../../../../../lib/auth/scopedClient";
import { REGIOES, TEMPO_VAZIO, validarTempo, type TempoCampanha } from "../_dominio/tempoCampanha";

type Resultado = { ok: true; dados: TempoCampanha | null } | { ok: false; erro: string };

function mapear(row: Record<string, unknown>): TempoCampanha {
  return {
    ano: row.game_year as number | null,
    mes: row.game_month as number | null,
    dia: row.game_day as number | null,
    hora: row.game_time === null ? null : String(row.game_time).slice(0, 5),
    regiao: row.region as TempoCampanha["regiao"],
    condicao: row.condition as TempoCampanha["condicao"],
    temperaturaC: row.temperature_c as number | null,
    temperaturaAlvoC: row.target_temperature_c as number | null,
    climaDesdeMinuto: row.weather_since_minute as number | null,
    climaAteMinuto: row.weather_until_minute as number | null,
    weatherSeed: row.weather_seed as number,
    aurora: row.aurora as boolean,
    vento: row.wind as TempoCampanha["vento"],
    descricao: row.description as string,
    revision: row.revision as number,
  };
}

export async function lerTempoCampanhaAction(campaignId: string): Promise<Resultado> {
  const acesso = await resolveCampaignAccess(campaignId);
  if (acesso.kind !== "ok") return { ok: false, erro: "Você não tem acesso a esta campanha." };
  const client = await getScopedTableClient();
  const { data, error } = await client.from("vtt_campaign_time").select("*").eq("campaign_id", campaignId).maybeSingle();
  if (error) return { ok: false, erro: error.message };
  if (data) return { ok: true, dados: mapear(data) };
  // A região inicial acompanha a campanha; depois o clima mantém sua própria região
  // para permitir viagens sem reescrever os dados de criação da campanha.
  const { data: campanha } = await client.from("campaigns").select("regiao").eq("id", campaignId).maybeSingle();
  const nome = typeof campanha?.regiao === "string" ? campanha.regiao.charAt(0).toUpperCase() + campanha.regiao.slice(1) : "Vastra";
  return { ok: true, dados: { ...TEMPO_VAZIO, regiao: REGIOES.includes(nome as TempoCampanha["regiao"]) ? nome as TempoCampanha["regiao"] : "Vastra" } };
}

export async function salvarTempoCampanhaAction(campaignId: string, tempo: TempoCampanha): Promise<Resultado> {
  const acesso = await resolveCampaignAccess(campaignId);
  if (acesso.kind !== "ok" || acesso.role !== "narrator") return { ok: false, erro: "Só o narrador pode alterar o tempo." };
  const erroValidacao = validarTempo(tempo);
  if (erroValidacao) return { ok: false, erro: erroValidacao };
  if (!Number.isInteger(tempo.revision) || tempo.revision < 0) return { ok: false, erro: "Revisão inválida." };
  const client = await getScopedTableClient();
  const campos = {
    game_year: tempo.ano, game_month: tempo.mes, game_day: tempo.dia, game_time: tempo.hora,
    region: tempo.regiao, condition: tempo.condicao, temperature_c: tempo.temperaturaC,
    target_temperature_c: tempo.temperaturaAlvoC, weather_since_minute: tempo.climaDesdeMinuto,
    weather_until_minute: tempo.climaAteMinuto, weather_seed: tempo.weatherSeed,
    wind: tempo.vento, aurora: tempo.aurora, description: tempo.descricao,
  };
  if (tempo.revision === 0) {
    const { data, error } = await client.from("vtt_campaign_time").insert({ campaign_id: campaignId, ...campos }).select().single();
    if (error || !data) return { ok: false, erro: error?.code === "23505" ? "O tempo foi alterado em outra janela. Recarregue." : error?.message ?? "Falha ao salvar." };
    return { ok: true, dados: mapear(data) };
  }
  const { data, error } = await client.from("vtt_campaign_time").update(campos).eq("campaign_id", campaignId)
    .eq("revision", tempo.revision).select().maybeSingle();
  if (error) return { ok: false, erro: error.message };
  if (!data) return { ok: false, erro: "O tempo foi alterado em outra janela. Recarregue." };
  return { ok: true, dados: mapear(data) };
}
