"use client";

/**
 * Client Supabase de BROWSER (checkpoint v0.46) — único ponto que usa
 * `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY` (mesmos
 * valores de `SUPABASE_URL`/`SUPABASE_ANON_KEY`, só expostos ao bundle
 * do cliente porque a chave anon é protegida por RLS — nunca a service
 * role key, que nunca sai do servidor). Usado exclusivamente para
 * assinar canais de Realtime (`postgres_changes`); toda leitura/escrita
 * real continua passando pelas Server Actions existentes
 * (`lib/table/storage.ts`, `lib/character/storage.ts`) — este client
 * nunca faz `.from(...).select()`/`.insert()` diretamente.
 *
 * Singleton simples (um só WebSocket por aba). Se as env vars públicas
 * não estiverem configuradas, devolve `null` — quem chama trata isso
 * como "Realtime indisponível" e o app continua funcionando só com
 * reload manual (ver `lib/realtime/tableRealtime.ts`).
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cachedClient: SupabaseClient | null | undefined;

export function getBrowserSupabaseClient(): SupabaseClient | null {
  if (cachedClient !== undefined) return cachedClient;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    cachedClient = null;
    return null;
  }

  cachedClient = createClient(url, anonKey, {
    auth: { persistSession: false },
  });
  return cachedClient;
}
