/**
 * Renova a sessão salva em `.auth/admin-session.json` SEM pedir senha.
 *
 * Por que é necessário: o cookie `ruptura_auth` vale 7 dias, mas o
 * access token JWT que ele carrega expira em ~1h. E o app,
 * deliberadamente, não rotaciona refresh token no servidor — está
 * documentado como limitação dev conhecida em `src/lib/auth/session.ts`
 * ("não há refresh automático server-side nesta etapa; isso é o que o
 * @supabase/ssr automatiza"). Consequência prática: uma sessão salva
 * pelo `save-admin-session.ts` só serve para browser checks durante a
 * primeira hora, e depois o check falha caindo na tela de login — o que
 * é fácil de confundir com uma regressão do que se está verificando.
 *
 * O que faz: troca o `refresh_token` que JÁ está no arquivo por um par
 * novo, pelo mesmo endpoint de Auth que o app usaria, e regrava o
 * arquivo. Nenhuma senha é lida, pedida ou digitada — o consentimento é
 * o login manual que a pessoa já fez uma vez em `save-admin-session.ts`.
 * Se o refresh token também tiver expirado (ou a sessão foi revogada),
 * falha explicitamente mandando repetir o login manual, nunca finge
 * sucesso.
 *
 * Uso: npx tsx scripts/dev/refresh-admin-session.ts
 */

import { readFileSync, writeFileSync } from "node:fs";
import { config as loadDotenv } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { SESSION_FILE, requireSessaoSalva } from "./authSession";

loadDotenv({ path: ".env.local" });

const AUTH_COOKIE = "ruptura_auth";

interface CookieLike {
  name: string;
  value: string;
  [k: string]: unknown;
}
interface StorageState {
  cookies: CookieLike[];
  origins: unknown[];
}

function decodeCookieValue(raw: string): { access_token: string; refresh_token: string } | null {
  // `writeAuthTokens` grava JSON puro; o Playwright pode devolver o
  // valor percent-encoded dependendo de como foi capturado.
  for (const candidato of [raw, decodeURIComponent(raw)]) {
    try {
      const parsed = JSON.parse(candidato) as { access_token?: string; refresh_token?: string };
      if (typeof parsed.access_token === "string" && typeof parsed.refresh_token === "string") {
        return { access_token: parsed.access_token, refresh_token: parsed.refresh_token };
      }
    } catch {
      // tenta o próximo formato
    }
  }
  return null;
}

function expiraEm(accessToken: string): Date | null {
  try {
    const payload = JSON.parse(Buffer.from(accessToken.split(".")[1], "base64").toString("utf8")) as { exp?: number };
    return typeof payload.exp === "number" ? new Date(payload.exp * 1000) : null;
  } catch {
    return null;
  }
}

async function main(): Promise<void> {
  requireSessaoSalva();

  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error("SUPABASE_URL/SUPABASE_ANON_KEY ausentes em .env.local.");
  }

  const state = JSON.parse(readFileSync(SESSION_FILE, "utf8")) as StorageState;
  const cookie = state.cookies.find((c) => c.name === AUTH_COOKIE);
  if (!cookie) {
    throw new Error(`Cookie "${AUTH_COOKIE}" não encontrado na sessão salva — repita: npx tsx scripts/dev/save-admin-session.ts`);
  }

  const tokens = decodeCookieValue(cookie.value);
  if (!tokens) {
    throw new Error("Não foi possível ler os tokens do cookie salvo — repita: npx tsx scripts/dev/save-admin-session.ts");
  }

  const antes = expiraEm(tokens.access_token);
  console.log(`Access token atual expira(va) em: ${antes?.toISOString() ?? "(ilegível)"}`);

  const supabase = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await supabase.auth.refreshSession({ refresh_token: tokens.refresh_token });

  if (error || !data.session) {
    throw new Error(
      `Não foi possível renovar a sessão: ${error?.message ?? "sem sessão na resposta"}.\n` +
        "O refresh token provavelmente expirou ou foi revogado. Repita o login manual:\n" +
        "  npx tsx scripts/dev/save-admin-session.ts",
    );
  }

  const novo = { access_token: data.session.access_token, refresh_token: data.session.refresh_token };
  cookie.value = JSON.stringify(novo);
  writeFileSync(SESSION_FILE, JSON.stringify(state, null, 2));

  const depois = expiraEm(novo.access_token);
  console.log(`Sessão renovada. Novo access token expira em: ${depois?.toISOString() ?? "(ilegível)"}`);
  console.log("Nenhuma senha foi lida ou solicitada — só o refresh token que já estava no arquivo.");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
