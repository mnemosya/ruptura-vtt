/**
 * Cliente Supabase da camada de leitura pública da Biblioteca do Sistema.
 *
 * IMPORTANTE: este módulo usa exclusivamente a anon key
 * (SUPABASE_ANON_KEY). Nunca importe ou use SUPABASE_SERVICE_ROLE_KEY
 * aqui — a leitura pública depende inteiramente da RLS policy
 * `content_documents_public_read` (status = 'published') definida na
 * migration 0001_content_library.sql. Este módulo não carrega .env —
 * quem o consome (script, app) é responsável por garantir que
 * SUPABASE_URL/SUPABASE_ANON_KEY estejam definidos no processo.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cachedClient: SupabaseClient | null = null;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `[content/client] Variável de ambiente obrigatória ausente: ${name}. ` +
        "A camada de leitura da Biblioteca do Sistema usa SUPABASE_URL + SUPABASE_ANON_KEY " +
        "(somente leitura pública) — nunca a service role key.",
    );
  }
  return value;
}

/** Retorna um cliente Supabase singleton autenticado com a anon key. */
export function getContentClient(): SupabaseClient {
  if (cachedClient) return cachedClient;

  const url = requireEnv("SUPABASE_URL");
  const anonKey = requireEnv("SUPABASE_ANON_KEY");

  cachedClient = createClient(url, anonKey, {
    auth: { persistSession: false },
  });
  return cachedClient;
}
