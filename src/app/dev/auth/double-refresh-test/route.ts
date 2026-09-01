/**
 * Rota de teste DEV-ONLY: chama `refreshAccessToken()` duas vezes em
 * sequência, na MESMA requisição, e devolve os dois resultados como
 * JSON.
 *
 * Existe só pra provar a correção da corrida com `src/middleware.ts`
 * (ver o comentário de `refreshAccessToken` em `lib/auth/actions.ts`):
 * quando o access token do cookie já tem validade de sobra (o caso
 * comum — o middleware já rodou ANTES desta rota, na mesma requisição,
 * como roda em qualquer outra), a segunda chamada precisa devolver
 * EXATAMENTE o mesmo par de tokens da primeira, sem girar o refresh
 * token de novo. Testar isso via browser E2E não dá: a chamada
 * duplicada que o bug descreve é servidor↔servidor (esta função↔
 * Supabase), invisível pra qualquer inspeção de rede feita do lado do
 * navegador — só uma chamada direta, no mesmo processo Next, prova o
 * comportamento de verdade.
 *
 * `assertDevRouteAllowed()`: mesmo guard das outras 5 rotas `/dev` —
 * fora de desenvolvimento, só acessível com `DEV_ROUTES_ENABLED=true`.
 */

import { NextResponse } from "next/server";
import { assertDevRouteAllowed } from "../../../../lib/dev/guard";
import { refreshAccessToken } from "../../../../lib/auth/actions";

export const dynamic = "force-dynamic";

export async function GET() {
  assertDevRouteAllowed();
  const primeira = await refreshAccessToken();
  const segunda = await refreshAccessToken();
  return NextResponse.json({ primeira, segunda });
}
