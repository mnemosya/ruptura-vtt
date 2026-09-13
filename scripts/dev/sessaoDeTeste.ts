/**
 * Sessão autenticada REAL para scripts de teste que exercitam a camada
 * de storage do app.
 *
 * ── O problema que isto resolve ──────────────────────────────────────
 *
 * `getScopedTableClient()` descobre quem está logado lendo o cookie da
 * request via `next/headers`. Num script não há request: `cookies()`
 * lança, a leitura cai em `null`, e o client sai anônimo. Daí os
 * scripts de teste históricos terem adotado um contorno — apontar
 * `SUPABASE_ANON_KEY` para a service role key — que dá PRIVILÉGIO mas
 * não dá IDENTIDADE.
 *
 * A diferença importa: toda RPC que confere `auth.uid()` recusa uma
 * sessão dessas. `append_table_log` é uma delas ("É necessário estar
 * autenticado para registrar um evento"), e como `endCampaignRound`
 * grava log em modo best-effort, a recusa sumia dentro de um `catch` —
 * o teste passava por cima de meia dúzia de logs que nunca foram
 * escritos.
 *
 * ── O que isto faz ───────────────────────────────────────────────────
 *
 * Cria uma conta descartável com service role, faz login de verdade e
 * entrega os tokens. Quem recebe chama `usarSessao(tokens)`, que os põe
 * na variável que o stub de `next/headers` lê.
 *
 * O que se simula é só o TRANSPORTE do token — cookie de request →
 * variável de ambiente. A sessão, o JWT, o `auth.uid()` e a RLS são
 * reais. É o mesmo princípio de `authSession.ts`, que injeta o cookie
 * real num navegador do Playwright.
 *
 * Exige o stub registrado no comando:
 *   tsx --conditions=react-server \
 *       --import ./scripts/dev/stub-next-headers/register.mjs …
 */

import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const COOKIE_ENV = "RUPTURA_TEST_AUTH_COOKIE";

export interface TokensDeSessao {
  access_token: string;
  refresh_token: string;
}

export interface ContaDeTeste {
  userId: string;
  email: string;
  tokens: TokensDeSessao;
}

function exigirEnv(nome: string): string {
  const v = process.env[nome];
  if (!v) throw new Error(`Variável de ambiente ausente: ${nome}`);
  return v;
}

/** Client com service role — para montar e desmontar o cenário. */
export function clienteAdministrativo(): SupabaseClient {
  return createClient(exigirEnv("SUPABASE_URL"), exigirEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Põe (ou tira) a sessão que o stub devolve.
 *
 * Trocar de conta é só trocar o valor: o stub lê a variável no momento
 * da chamada e `getScopedTableClient` monta um client novo a cada
 * operação — nunca há sessão em cache vazando de um passo pro outro.
 */
export function usarSessao(tokens: TokensDeSessao | null): void {
  if (tokens) process.env[COOKIE_ENV] = JSON.stringify(tokens);
  else delete process.env[COOKIE_ENV];
}

/** Cria uma conta descartável e devolve a sessão dela, já logada. */
export async function criarContaDeTeste(
  admin: SupabaseClient,
  opcoes: { prefixo: string; nome?: string } ,
): Promise<ContaDeTeste> {
  const email = `${opcoes.prefixo}-${Date.now()}-${randomUUID().slice(0, 8)}@ruptura.dev`;
  const senha = randomUUID();
  const { data, error } = await admin.auth.admin.createUser({
    email, password: senha, email_confirm: true,
    user_metadata: { display_name: opcoes.nome ?? "Conta de teste" },
  });
  if (error || !data.user) throw new Error(`Falha ao criar conta de teste: ${error?.message}`);

  const anon = createClient(exigirEnv("SUPABASE_URL"), exigirEnv("SUPABASE_ANON_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: sessao, error: erroLogin } = await anon.auth.signInWithPassword({ email, password: senha });
  if (erroLogin || !sessao.session) throw new Error(`Falha ao logar conta de teste: ${erroLogin?.message}`);

  return {
    userId: data.user.id,
    email,
    tokens: {
      access_token: sessao.session.access_token,
      refresh_token: sessao.session.refresh_token,
    },
  };
}

/**
 * Confere que o stub de `next/headers` está registrado.
 *
 * Sem ele TODA operação cairia no caminho anônimo e o script falharia
 * lá adiante parecendo bug de policy. Conferir aqui troca esse enigma
 * por uma instrução.
 */
export async function exigirStubDeCookies(comandoNpm: string): Promise<void> {
  const ativo = await import("next/headers")
    .then(({ cookies }) => cookies())
    .then(() => true)
    .catch(() => false);
  if (!ativo) {
    throw new Error(
      `rode via \`npm run ${comandoNpm}\` — o stub de next/headers não está registrado ` +
        "(o script precisa de `--import ./scripts/dev/stub-next-headers/register.mjs`)",
    );
  }
}
