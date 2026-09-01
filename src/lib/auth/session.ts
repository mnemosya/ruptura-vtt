/**
 * Sessão de Auth dev do narrador, guardada num cookie httpOnly.
 *
 * Server-only (usa next/headers). NÃO é "use server" — `getCurrentUser`
 * é um util de leitura chamado por Server Components (RSC) para mostrar
 * quem está logado; as MUTAÇÕES (login/logout, que escrevem/limpam o
 * cookie) ficam em actions.ts ("use server").
 *
 * Esta função em si NÃO renova nada: `getUser(access_token)` só valida
 * o JWT contra o Supabase, sem tocar o refresh token — um access token
 * vencido (~1h por padrão) faria `getCurrentUser` tratar a sessão como
 * encerrada.
 *
 * Isso não é um problema na prática porque a renovação acontece ANTES
 * de qualquer leitura chegar aqui: `src/middleware.ts` roda no
 * SERVIDOR, em toda requisição (inclusive a primeira depois de reabrir
 * o navegador, e inclusive o fetch por trás de uma navegação
 * client-side), renova o cookie se o access token estiver vencido ou
 * perto disso, e só então deixa a requisição continuar. Uma tentativa
 * anterior de resolver isto com um timer client-side (rodando só
 * depois da página já carregada) não fechava dois casos reais: token
 * já vencido na PRIMEIRA leitura server-side (o JS do timer ainda nem
 * rodou), e o layout raiz não remontando entre navegações client-side
 * (o valor lido no primeiro mount nunca era atualizado de novo). O
 * middleware não sofre de nenhum dos dois — não depende de o cliente
 * já ter executado nada.
 *
 * A área de campanha tem um agendamento client-side PRÓPRIO
 * (`CampaignRealtimeProvider`), mas é sobre outra coisa: manter o
 * WebSocket de Realtime autenticado (`setBrowserSupabaseRealtimeAuth`)
 * enquanto a aba fica aberta por horas SEM gerar requisição nova — o
 * middleware só roda quando existe uma requisição pra interceptar.
 */

import { cache } from "react";
import { cookies } from "next/headers";
import { createAnonAuthClient } from "./anonClient";

const AUTH_COOKIE = "ruptura_auth";

export interface AuthTokens {
  access_token: string;
  refresh_token: string;
}

export interface AuthUser {
  id: string;
  email: string | null;
  /**
   * Nome de exibição (aditivo §3.1/§4.3 "Conta e preferências") — vive
   * em `user_metadata` do próprio Supabase Auth (`display_name`), sem
   * tabela nova nem migration: é a conta autenticando a si mesma via
   * `auth.updateUser`, nunca uma escrita administrativa. Null quando a
   * conta ainda não definiu um.
   */
  displayName: string | null;
}

export async function readAuthTokens(): Promise<AuthTokens | null> {
  const store = await cookies();
  const raw = store.get(AUTH_COOKIE)?.value;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as AuthTokens;
    if (typeof parsed.access_token === "string" && typeof parsed.refresh_token === "string") return parsed;
    return null;
  } catch {
    return null;
  }
}

/**
 * 30 dias, e DESLIZA a cada renovação — `writeAuthTokens` é chamado de
 * novo a cada refresh (`middleware.ts` regrava o cookie sempre que o
 * access token está vencido/perto disso, em QUALQUER requisição), e
 * cada chamada reseta o `maxAge` a partir de AGORA. Na prática, uma
 * conta que gera pelo menos uma requisição a cada 30 dias nunca vê o
 * cookie expirar sozinho — só um logout explícito ou o refresh token
 * sendo revogado/expirado do lado do Supabase encerra a sessão.
 */
const MAX_AGE_COOKIE_SEGUNDOS = 60 * 60 * 24 * 30;

export async function writeAuthTokens(tokens: AuthTokens): Promise<void> {
  const store = await cookies();
  store.set(AUTH_COOKIE, JSON.stringify(tokens), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_COOKIE_SEGUNDOS,
  });
}

export async function clearAuthTokens(): Promise<void> {
  const store = await cookies();
  store.delete(AUTH_COOKIE);
}

/**
 * Usuário logado atual (ou null). Valida o access token no Supabase.
 *
 * MEMOIZADA POR REQUEST (`cache` do React): desde que o layout do grupo
 * `(global)` passou a ser o dono da exigência de sessão, layout e
 * página chamam esta função no MESMO request. Sem memoização seriam
 * duas validações de token na rede por navegação, e a segunda não
 * acrescenta nada. `cache()` vale por request — nunca entre usuários,
 * nunca entre requests: não introduz cache de sessão em lugar nenhum.
 */
export const getCurrentUser = cache(async function getCurrentUser(): Promise<AuthUser | null> {
  const tokens = await readAuthTokens();
  if (!tokens?.access_token) return null;
  try {
    const supabase = createAnonAuthClient();
    const { data, error } = await supabase.auth.getUser(tokens.access_token);
    if (error || !data.user) return null;
    const displayName = data.user.user_metadata?.display_name;
    return {
      id: data.user.id,
      email: data.user.email ?? null,
      displayName: typeof displayName === "string" && displayName.trim() ? displayName.trim() : null,
    };
  } catch {
    return null;
  }
});
