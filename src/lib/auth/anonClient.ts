/**
 * Cliente Supabase para operações de Auth do narrador (dev).
 *
 * IMPORTANTE: usa exclusivamente SUPABASE_URL + SUPABASE_ANON_KEY — as
 * MESMAS variáveis server-side já usadas pela Biblioteca do Sistema e
 * pela camada de Mesa/Log. NUNCA a service role key. Como tudo aqui roda
 * em Server Actions/Server Components (nunca no bundle do navegador), a
 * anon key não é exposta ao cliente — mantendo o mesmo modelo de
 * segurança do resto do projeto (sem NEXT_PUBLIC_*).
 *
 * `persistSession: false` / `autoRefreshToken: false`: não deixamos o
 * SDK gerenciar sessão em memória/localStorage — a sessão é guardada
 * manualmente num cookie httpOnly (ver session.ts), porque o SDK
 * client-side não tem onde persistir no contexto server-only.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export function createAnonAuthClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error(
      "[auth] SUPABASE_URL/SUPABASE_ANON_KEY ausentes — Auth dev depende das mesmas variáveis " +
        "server-side já usadas pelo resto do projeto (nunca a service role key).",
    );
  }
  return createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
