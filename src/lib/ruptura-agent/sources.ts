import type { SupabaseClient } from "@supabase/supabase-js";
import type { AgentSource } from "./types";
import { notionId } from "./config";

export async function lerSources(client: SupabaseClient): Promise<Map<string, AgentSource>> {
  const all = new Map<string, AgentSource>();
  for (let inicio = 0; ; inicio += 1000) {
    const { data, error } = await client.from("ruptura_agent_sources").select("*").order("notion_id").range(inicio, inicio + 999);
    if (error) throw new Error(`Falha ao ler corpus do agente: ${error.message}`);
    for (const source of data ?? []) all.set(notionId(String(source.notion_id)), source as AgentSource);
    if (!data || data.length < 1000) break;
  }
  return all;
}
