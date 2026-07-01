/**
 * Roda `expireStaleProfileSessions()` manualmente (checkpoint v0.26).
 *
 * Marca sessões de perfil (`profile_sessions`) sem heartbeat há mais
 * de `staleAfterSeconds` como `expired` e libera o bloqueio do perfil
 * (`campaign_profiles.is_locked`) quando essa era a sessão que o
 * detinha. Nunca apaga linhas — só muda `status`.
 *
 * Uso:
 *   npx tsx scripts/dev/expire-profile-sessions.ts [campaignId] [staleAfterSeconds]
 *
 * Sem argumentos: varre TODAS as mesas com a janela default (30s).
 *
 * Isto NÃO é um cron — é só um jeito de rodar a expiração manualmente
 * fora dos pontos de carregamento seguros já cobertos pelo app
 * (`/mesas/[campaignId]`, `/join/[token]`, `/ficha`, `enterCampaignProfile`).
 * Um cron/job periódico de verdade fica documentado como trabalho
 * futuro (ver checkpoint v0.26 do relatório) — não implementado aqui.
 */

import "dotenv/config";
import { config as loadDotenv } from "dotenv";
loadDotenv({ path: ".env.local" });

import { expireStaleProfileSessions } from "../../src/lib/table/storage";

async function main() {
  const campaignId = process.argv[2] || undefined;
  const staleAfterSeconds = process.argv[3] ? Number.parseInt(process.argv[3], 10) : undefined;

  const count = await expireStaleProfileSessions(campaignId, staleAfterSeconds);
  console.log(
    `Sessões expiradas: ${count}${campaignId ? ` (mesa ${campaignId})` : " (todas as mesas)"}${
      staleAfterSeconds ? `, janela: ${staleAfterSeconds}s` : ""
    }`,
  );
}

main().catch((err) => {
  console.error("Erro ao expirar sessões:", err);
  process.exit(1);
});
