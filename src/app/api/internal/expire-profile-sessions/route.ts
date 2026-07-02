/**
 * Rota server-only para expirar sessões de perfil stale.
 *
 * Checkpoint v0.31: mecanismo server-side para expirar sessões sem
 * depender de navegação do usuário. Protegida por INTERNAL_CRON_SECRET.
 *
 * POST /api/internal/expire-profile-sessions
 *
 * Headers:
 *   Authorization: Bearer <secret> (ou X-Internal-Cron-Secret)
 *
 * Query params (opcionais):
 *   ?campaignId=<uuid>
 *   ?staleAfterSeconds=<number>
 *
 * Response (200):
 *   { sessionsExpired, profilesReleased, logsCreated }
 *
 * Errors:
 *   401: sem segredo configurado ou inválido
 *   400: erro ao expirar sessões
 */

import { NextRequest, NextResponse } from "next/server";
import { validateCronSecret } from "../../../../lib/internal/cron-secret";
import { expireStaleProfileSessions } from "../../../../lib/table/storage";

export async function POST(request: NextRequest) {
  // Validar segredo
  const authHeader = request.headers.get("authorization");
  const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  const customHeader = request.headers.get("x-internal-cron-secret");
  const provided = bearerToken || customHeader;

  if (!validateCronSecret(provided)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const campaignId = searchParams.get("campaignId") ?? undefined;
    const staleAfterSeconds = searchParams.get("staleAfterSeconds")
      ? Number.parseInt(searchParams.get("staleAfterSeconds")!, 10)
      : undefined;

    const sessionsExpired = await expireStaleProfileSessions(campaignId, staleAfterSeconds);

    return NextResponse.json({
      sessionsExpired,
      profilesReleased: sessionsExpired, // simplificado: cada sessão expirada libera no máximo um perfil
      logsCreated: sessionsExpired, // cada expiração cria um log (melhor-esforço)
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
