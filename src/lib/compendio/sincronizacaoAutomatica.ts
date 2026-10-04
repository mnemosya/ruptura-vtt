import "server-only";

/**
 * Sincronização automática do Compêndio (Fase 3 do PLANO_COMPENDIO_NOTION).
 *
 * O VTT ainda não tem servidor público, e o Supabase não alcança o app
 * (`pg_net` ausente), então não há cron que o chame. A sincronização
 * acontece quando alguém usa o Compêndio: abrir a aba dispara, em
 * segundo plano (`after()`), uma checagem no Notion, no máximo uma vez a
 * cada 12 horas (duas vezes por dia, decisão de 03/10/2026). A rodada só relê os capítulos editados (§ Fase 1).
 *
 * O último horário de checagem mora no manifesto do pacote
 * (`content_packs.manifest.ultimaVerificacao`), então vale para todas as
 * instâncias do servidor; uma trava em memória evita duas rodadas
 * simultâneas no mesmo processo.
 */

import { getAdminSupabaseClient } from "../supabase/adminClient";
import { criarClienteNotion } from "./notion";
import { PACK_COMPENDIO, sincronizarCompendio, type RelatorioSincronizacao } from "./sincronizar";

export const INTERVALO_SINCRONIZACAO_MS = 12 * 60 * 60 * 1000;

let rodando: Promise<RelatorioSincronizacao | null> | null = null;

async function ultimaVerificacao(): Promise<number> {
  const admin = getAdminSupabaseClient();
  if (!admin) return Date.now();
  const { data } = await admin.from("content_packs").select("manifest").eq("id", PACK_COMPENDIO).maybeSingle();
  const iso = (data?.manifest as { ultimaVerificacao?: string } | null)?.ultimaVerificacao;
  return iso ? Date.parse(iso) : 0;
}

async function registrarVerificacao(rel: RelatorioSincronizacao | null, erro?: string): Promise<void> {
  const admin = getAdminSupabaseClient();
  if (!admin) return;
  const { data } = await admin.from("content_packs").select("manifest").eq("id", PACK_COMPENDIO).maybeSingle();
  const manifest = (data?.manifest ?? {}) as Record<string, unknown>;
  await admin
    .from("content_packs")
    .update({
      manifest: {
        ...manifest,
        ultimaVerificacao: new Date().toISOString(),
        ultimoResultado: rel
          ? { criados: rel.criados.length, atualizados: rel.atualizados.length, arquivados: rel.arquivados.length, falhas: rel.falhas }
          : { erro },
      },
    })
    .eq("id", PACK_COMPENDIO);
}

/** Roda uma sincronização agora (ou devolve a que já está rodando). */
export function sincronizarAgora(): Promise<RelatorioSincronizacao | null> {
  if (rodando) return rodando;
  rodando = (async () => {
    const supabase = getAdminSupabaseClient();
    if (!supabase || !process.env.NOTION_TOKEN) return null;
    try {
      const rel = await sincronizarCompendio({ notion: criarClienteNotion(), supabase });
      await registrarVerificacao(rel);
      return rel;
    } catch (e) {
      await registrarVerificacao(null, e instanceof Error ? e.message : String(e));
      throw e;
    }
  })().finally(() => {
    rodando = null;
  });
  return rodando;
}

/** Sincroniza só se a última checagem tem mais de 12 horas. Nunca lança. */
export async function talvezSincronizar(): Promise<void> {
  try {
    if (rodando) return;
    if (Date.now() - (await ultimaVerificacao()) < INTERVALO_SINCRONIZACAO_MS) return;
    await sincronizarAgora();
  } catch {
    // Falha registrada no manifesto; a próxima abertura tenta de novo.
  }
}
