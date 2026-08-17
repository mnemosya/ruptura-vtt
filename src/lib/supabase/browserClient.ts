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

/**
 * Autentica o WEBSOCKET de Realtime deste client com o access token da
 * conta logada — sem isto, toda assinatura `postgres_changes` conecta
 * como `anon`, e nenhuma policy de RLS restrita `to authenticated`
 * (`table_logs_member_select`, `campaigns_member_select`,
 * `characters_authenticated_select`) libera evento nenhum: o canal
 * mostra "subscribed" normalmente (isso não depende de autenticação),
 * mas o Postgres nunca entrega a mudança — bug real encontrado numa
 * auditoria da Fase 3 da reestrutura de campanha, confirmado com um
 * teste isolado (inserção via service role, um assinante anônimo nunca
 * recebe o evento, o mesmo assinante com `setAuth` recebe na hora).
 *
 * SÓ o access token (nunca o refresh token) sai do servidor para cá —
 * decisão deliberada: o cookie de sessão do app (`ruptura_auth`,
 * `src/lib/auth/session.ts`) é httpOnly de propósito, então expor
 * QUALQUER token ao JS do cliente já é uma mudança de superfície. Um
 * access token tem vida curta (~1h); o refresh token não expira sozinho
 * e permitiria obter tokens novos indefinidamente, então nunca é
 * passado para código de cliente — nem aqui, nem em lugar nenhum.
 * `null` reverte para a chave anon (logout, ou sessão sem token).
 *
 * O token de ~1h NÃO fica sem renovação: `CampaignRealtimeProvider`
 * (área de campanha) chama `refreshAccessToken` (Server Action,
 * `lib/auth/actions.ts`) pouco antes de vencer, aplica o token novo
 * aqui com `setAuth` e reagenda — sem reload, sem recriar assinatura
 * nenhuma (confirmado no realtime-js: `setAuth` empurra o token pros
 * canais já inscritos). Essa renovação é local à área de campanha, não
 * um comportamento deste módulo nem de `session.ts` — outra rota que
 * assine Realtime por conta própria precisaria do mesmo agendamento.
 *
 * PROPAGA a falha de propósito (não engole): quem chama precisa saber se
 * o WebSocket realmente aceitou o token antes de considerar a sessão
 * sincronizada. A versão anterior fazia `.catch(() => {})` e devolvia
 * `void` — o provider marcava a renovação como concluída assim que a
 * Server Action devolvia um token, sem nenhuma garantia de que o socket
 * tinha aplicado. Se `setAuth` falhasse, a interface diria
 * "Sincronizado" com o canal mudo: exatamente o tipo de mentira
 * silenciosa que as auditorias anteriores desta fase eliminaram nos
 * outros caminhos.
 */
export async function setBrowserSupabaseRealtimeAuth(accessToken: string | null): Promise<void> {
  const client = getBrowserSupabaseClient();
  if (!client) return;
  await client.realtime.setAuth(accessToken);
  registrarAuthAplicada(accessToken);
}

/**
 * Último token efetivamente APLICADO ao WebSocket (só os 12 caracteres
 * finais — o suficiente pra distinguir um token do outro, nunca material
 * utilizável). Existe pra verificação: sem isto, um teste não consegue
 * distinguir "o socket recebeu o token novo" de "o servidor Supabase
 * ainda aceitava o token velho", porque o relógio simulado do Playwright
 * só engana o BROWSER — pro Supabase o token antigo segue válido em
 * tempo real, e o evento chegaria de qualquer jeito.
 *
 * Publicado em `window.__rupturaRealtimeAuth` apenas em
 * desenvolvimento; em produção fica só na memória do módulo.
 */
export interface AuthRealtimeAplicada {
  /** Sufixo do token aplicado, ou `null` quando revertido pra anon. */
  sufixo: string | null;
  /** Quantas vezes `setAuth` foi aplicado com sucesso nesta aba. */
  aplicacoes: number;
}

let authAplicada: AuthRealtimeAplicada = { sufixo: null, aplicacoes: 0 };

function registrarAuthAplicada(accessToken: string | null): void {
  authAplicada = {
    sufixo: accessToken ? accessToken.slice(-12) : null,
    aplicacoes: authAplicada.aplicacoes + 1,
  };
  if (process.env.NODE_ENV !== "production" && typeof window !== "undefined") {
    (window as unknown as { __rupturaRealtimeAuth?: AuthRealtimeAplicada }).__rupturaRealtimeAuth = authAplicada;
  }
}
