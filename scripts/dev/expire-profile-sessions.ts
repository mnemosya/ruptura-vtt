/**
 * Expira sessões de perfil stale manualmente (checkpoint v0.26+).
 *
 * Marca sessões de perfil (`profile_sessions`) sem heartbeat há mais
 * de `staleAfterSeconds` como `expired` e libera o bloqueio do perfil
 * (`campaign_profiles.is_locked`) quando essa era a sessão que o
 * detinha. Nunca apaga linhas — só muda `status`.
 *
 * Uso (v0.31+):
 *   Via função direta:
 *     npx tsx scripts/dev/expire-profile-sessions.ts [campaignId] [staleAfterSeconds]
 *
 *   Via rota HTTP (requer INTERNAL_CRON_SECRET):
 *     npx tsx scripts/dev/expire-profile-sessions.ts --route [campaignId] [staleAfterSeconds]
 *
 * Sem argumentos: varre TODAS as mesas com a janela default (30s).
 *
 * Este é um script manual — expiração opportunistic continua ocorrendo
 * automaticamente em `/mesas/[campaignId]`, `/join/[token]`, `/ficha`
 * (pontos de carregamento seguros). A rota permite chamar expiração
 * fora desses pontos, útil para crons externos que chamem o endpoint.
 * Ver checkpoint v0.31 do relatório para detalhes de configuração.
 */

import "dotenv/config";
import { config as loadDotenv } from "dotenv";
loadDotenv({ path: ".env.local" });

import { expireStaleProfileSessions } from "../../src/lib/table/storage";

async function main() {
  const useRoute = process.argv[2] === "--route";
  const campaignId = (useRoute ? process.argv[3] : process.argv[2]) || undefined;
  const staleAfterSeconds = (useRoute ? process.argv[4] : process.argv[3]) ? Number.parseInt(useRoute ? process.argv[4]! : process.argv[3]!, 10) : undefined;

  if (useRoute) {
    // Via rota HTTP
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const secret = process.env.INTERNAL_CRON_SECRET;
    if (!secret) {
      console.error("Erro: INTERNAL_CRON_SECRET não configurada. Use a função direta ou configure a env.");
      process.exit(1);
    }

    const url = new URL("/api/internal/expire-profile-sessions", baseUrl);
    if (campaignId) url.searchParams.set("campaignId", campaignId);
    if (staleAfterSeconds) url.searchParams.set("staleAfterSeconds", staleAfterSeconds.toString());

    try {
      const res = await fetch(url.toString(), {
        method: "POST",
        headers: { Authorization: `Bearer ${secret}` },
      });
      if (!res.ok) {
        console.error(`Erro HTTP ${res.status}:`, await res.text());
        process.exit(1);
      }
      const result = await res.json();
      console.log(
        `Sessões expiradas: ${result.sessionsExpired}${campaignId ? ` (mesa ${campaignId})` : " (todas as mesas)"}${
          staleAfterSeconds ? `, janela: ${staleAfterSeconds}s` : ""
        }`,
      );
    } catch (err) {
      console.error("Erro ao chamar rota:", err);
      process.exit(1);
    }
  } else {
    // Via função direta (server-side, requer DB client)
    const count = await expireStaleProfileSessions(campaignId, staleAfterSeconds);
    console.log(
      `Sessões expiradas: ${count}${campaignId ? ` (mesa ${campaignId})` : " (todas as mesas)"}${
        staleAfterSeconds ? `, janela: ${staleAfterSeconds}s` : ""
      }`,
    );
  }
}

main().catch((err) => {
  console.error("Erro ao expirar sessões:", err);
  process.exit(1);
});
