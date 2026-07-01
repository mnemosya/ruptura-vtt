/**
 * Cliente Supabase "scoped" à sessão da request atual — checkpoint v0.16.
 *
 * Sempre usa SUPABASE_URL + SUPABASE_ANON_KEY (nunca a service role key).
 * A diferença para `createAnonAuthClient()` (anonClient.ts, usado só
 * para as próprias operações de login/signup) é que este client tenta
 * anexar o access token do narrador logado, quando existir:
 *
 *   - Sem sessão (cookie ausente/ inválido, ou fora de um contexto de
 *     request — ex.: scripts node): retorna um client anon puro, IDÊNTICO
 *     ao comportamento de sempre. O modo dev anon não muda em nada.
 *   - Com sessão: chama `client.auth.setSession(...)` com os tokens do
 *     cookie httpOnly, para que as requisições ao PostgREST carreguem
 *     `Authorization: Bearer <access_token>` — é isso que faz
 *     `auth.uid()` resolver nas policies RLS owner-scoped (migration
 *     0006). Se a sessão estiver expirada/inválida, cai no anon puro
 *     (nunca lança erro) — nunca quebra o fluxo por causa de auth.
 *
 * NUNCA cacheado como singleton: cada chamada lê o cookie da request
 * atual e monta um client novo (a criação em si não faz I/O; só as
 * chamadas .from()/.auth.setSession() batem rede). Cachear misturaria a
 * sessão de um narrador com a de outro entre requests diferentes.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readAuthTokens } from "./session";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `[auth/scopedClient] Variável de ambiente obrigatória ausente: ${name}. ` +
        "Mesmas variáveis server-side já usadas pelo resto do projeto — nunca a service role key.",
    );
  }
  return value;
}

/**
 * Cliente Supabase para as Server Actions de mesa/perfil/log
 * (src/lib/table/storage.ts). Autenticado com o narrador logado quando
 * há sessão válida; anon puro caso contrário. Best-effort: qualquer
 * falha ao anexar a sessão cai silenciosamente para anon, nunca lança.
 */
export async function getScopedTableClient(): Promise<SupabaseClient> {
  const url = requireEnv("SUPABASE_URL");
  const anonKey = requireEnv("SUPABASE_ANON_KEY");
  const client = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let tokens: Awaited<ReturnType<typeof readAuthTokens>> = null;
  try {
    tokens = await readAuthTokens();
  } catch {
    // Fora de um contexto de request (ex.: script node) — segue anon.
    tokens = null;
  }

  if (tokens) {
    try {
      await client.auth.setSession({
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
      });
    } catch {
      // Sessão expirada/inválida — segue com o client anon puro em vez
      // de derrubar a Server Action. O pior caso é a operação se
      // comportar como se ninguém estivesse logado (mesmo de sempre).
    }
  }

  return client;
}
