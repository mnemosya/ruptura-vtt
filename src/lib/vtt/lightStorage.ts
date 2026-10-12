import "server-only";
import { getScopedTableClient } from "../auth/scopedClient";

export type ModoLuz = "claro" | "penumbra" | "escuro";
export interface ParedeLuz {
  id: string; sceneId: string; a: { q: number; r: number }; b: { q: number; r: number };
  bloqueiaLuz: boolean; bloqueiaVisao: boolean; porta: boolean; aberta: boolean;
  visivel: boolean; revision: number;
}
export interface FonteLuz {
  id: string; sceneId: string; tokenId: string | null;
  origem: { q: number; r: number } | null; raioM: number;
  formato: "radial" | "cone"; aberturaGraus: number | null; direcaoGraus: number;
  intensidade: "fraca" | "forte"; cor: string; ativa: boolean; visivel: boolean; revision: number;
}
export interface IluminacaoCena {
  modo: ModoLuz; revision: number; paredes: ParedeLuz[]; fontes: FonteLuz[];
}

const COLUNAS_PAREDE = "id,scene_id,a_q,a_r,b_q,b_r,bloqueia_luz,bloqueia_visao,porta,aberta,visivel,revision";
const COLUNAS_FONTE = "id,scene_id,token_id,origem_q,origem_r,raio_m,formato,abertura_graus,direcao_graus,intensidade,cor,ativa,visivel,revision";
function num(v: unknown): number { return Number(v); }
function parede(row: Record<string, unknown>): ParedeLuz {
  return { id: String(row.id), sceneId: String(row.scene_id), a: { q: num(row.a_q), r: num(row.a_r) }, b: { q: num(row.b_q), r: num(row.b_r) },
    bloqueiaLuz: row.bloqueia_luz === true, bloqueiaVisao: row.bloqueia_visao === true,
    porta: row.porta === true, aberta: row.aberta === true, visivel: row.visivel === true, revision: num(row.revision) };
}
function fonte(row: Record<string, unknown>): FonteLuz {
  return { id: String(row.id), sceneId: String(row.scene_id), tokenId: row.token_id ? String(row.token_id) : null,
    origem: row.origem_q == null || row.origem_r == null ? null : { q: num(row.origem_q), r: num(row.origem_r) },
    raioM: num(row.raio_m), formato: row.formato === "cone" ? "cone" : "radial",
    aberturaGraus: row.abertura_graus == null ? null : num(row.abertura_graus), direcaoGraus: num(row.direcao_graus),
    intensidade: row.intensidade === "fraca" ? "fraca" : "forte", cor: String(row.cor),
    ativa: row.ativa === true, visivel: row.visivel === true, revision: num(row.revision) };
}

export async function lerIluminacaoCena(sceneId: string): Promise<IluminacaoCena> {
  const client = await getScopedTableClient();
  const [settings, walls, sources] = await Promise.all([
    client.from("vtt_light_settings").select("modo,revision").eq("scene_id", sceneId).maybeSingle(),
    client.from("vtt_light_walls").select(COLUNAS_PAREDE).eq("scene_id", sceneId).order("id"),
    client.from("vtt_light_sources").select(COLUNAS_FONTE).eq("scene_id", sceneId).order("id"),
  ]);
  for (const r of [settings, walls, sources]) if (r.error) throw new Error(`Falha ao ler iluminação: ${r.error.message}`);
  return { modo: settings.data?.modo === "escuro" ? "escuro" : settings.data?.modo === "penumbra" ? "penumbra" : "claro",
    revision: num(settings.data?.revision ?? 0),
    paredes: (walls.data ?? []).map((r) => parede(r as Record<string, unknown>)),
    fontes: (sources.data ?? []).map((r) => fonte(r as Record<string, unknown>)) };
}

export async function definirAmbienteLuz(sceneId: string, campaignId: string, modo: ModoLuz, revision: number): Promise<number> {
  const client = await getScopedTableClient();
  if (revision === 0) {
    const r = await client.from("vtt_light_settings").insert({ scene_id: sceneId, campaign_id: campaignId, modo }).select("revision").single();
    if (r.error) throw new Error(r.error.message);
    return num(r.data.revision);
  }
  const r = await client.from("vtt_light_settings").update({ modo, revision: revision + 1 })
    .eq("scene_id", sceneId).eq("campaign_id", campaignId).eq("revision", revision).select("revision").maybeSingle();
  if (r.error || !r.data) throw new Error(r.error?.message ?? "Iluminação mudou em outra sessão; recarregue.");
  return num(r.data.revision);
}

export async function criarParedeLuz(sceneId: string, campaignId: string, a: { q: number; r: number }, b: { q: number; r: number }): Promise<ParedeLuz> {
  const client = await getScopedTableClient();
  const r = await client.from("vtt_light_walls").insert({ scene_id: sceneId, campaign_id: campaignId,
    a_q: a.q, a_r: a.r, b_q: b.q, b_r: b.r }).select(COLUNAS_PAREDE).single();
  if (r.error) throw new Error(r.error.message);
  return parede(r.data as Record<string, unknown>);
}
export async function definirParedeLuz(p: ParedeLuz): Promise<ParedeLuz> {
  const client = await getScopedTableClient();
  const r = await client.from("vtt_light_walls").update({ bloqueia_luz: p.bloqueiaLuz, bloqueia_visao: p.bloqueiaVisao,
    porta: p.porta, aberta: p.aberta, visivel: p.visivel, revision: p.revision + 1 })
    .eq("id", p.id).eq("scene_id", p.sceneId).eq("revision", p.revision).select(COLUNAS_PAREDE).maybeSingle();
  if (r.error || !r.data) throw new Error(r.error?.message ?? "Parede mudou em outra sessão; recarregue.");
  return parede(r.data as Record<string, unknown>);
}
export async function removerParedeLuz(id: string, sceneId: string): Promise<void> {
  const client = await getScopedTableClient();
  const r = await client.from("vtt_light_walls").delete().eq("id", id).eq("scene_id", sceneId).select("id").maybeSingle();
  if (r.error || !r.data) throw new Error(r.error?.message ?? "Parede não encontrada ou sem permissão.");
}

export async function criarFonteLuz(sceneId: string, campaignId: string, origem: { q: number; r: number }, raioM: number): Promise<FonteLuz> {
  const client = await getScopedTableClient();
  const r = await client.from("vtt_light_sources").insert({ scene_id: sceneId, campaign_id: campaignId,
    origem_q: origem.q, origem_r: origem.r, raio_m: raioM }).select(COLUNAS_FONTE).single();
  if (r.error) throw new Error(r.error.message);
  return fonte(r.data as Record<string, unknown>);
}
export async function definirFonteLuz(f: FonteLuz): Promise<FonteLuz> {
  const client = await getScopedTableClient();
  const r = await client.from("vtt_light_sources").update({ raio_m: f.raioM, formato: f.formato,
    abertura_graus: f.formato === "cone" ? f.aberturaGraus : null, direcao_graus: f.direcaoGraus,
    intensidade: f.intensidade, cor: f.cor, ativa: f.ativa, visivel: f.visivel, revision: f.revision + 1 })
    .eq("id", f.id).eq("scene_id", f.sceneId).eq("revision", f.revision).select(COLUNAS_FONTE).maybeSingle();
  if (r.error || !r.data) throw new Error(r.error?.message ?? "Fonte mudou em outra sessão; recarregue.");
  return fonte(r.data as Record<string, unknown>);
}
export async function removerFonteLuz(id: string, sceneId: string): Promise<void> {
  const client = await getScopedTableClient();
  const r = await client.from("vtt_light_sources").delete().eq("id", id).eq("scene_id", sceneId).select("id").maybeSingle();
  if (r.error || !r.data) throw new Error(r.error?.message ?? "Fonte não encontrada ou sem permissão.");
}

export async function definirVisaoNoturna(tokenId: string, sceneId: string, revision: number, ativa: boolean): Promise<void> {
  const client = await getScopedTableClient();
  const r = await client.from("vtt_tokens").update({ visao_noturna: ativa, revision: revision + 1 })
    .eq("id", tokenId).eq("scene_id", sceneId).eq("revision", revision).select("id").maybeSingle();
  if (r.error || !r.data) throw new Error(r.error?.message ?? "Token mudou em outra sessão; recarregue.");
}
