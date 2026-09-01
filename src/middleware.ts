/**
 * Renova a sessão (`ruptura_auth`) no SERVIDOR, antes de qualquer
 * Server Component/Action rodar — corrige dois furos reais que a
 * renovação client-side (que ainda existia numa versão anterior desta
 * correção) não conseguia fechar por construção:
 *
 *   1. TOKEN JÁ VENCIDO ANTES DO JS RODAR. Fechar o navegador e voltar
 *      depois de ~1h chega com o access token do cookie já expirado —
 *      a PRIMEIRA requisição já lê esse cookie em `getCurrentUser`
 *      (Server Component, roda no servidor) antes de qualquer
 *      `useEffect` do cliente ter chance de agir. Um timer client-side
 *      só ajuda depois que a página já carregou — tarde demais pra
 *      essa primeira leitura.
 *   2. LAYOUT RAIZ NÃO REMONTA ENTRE ROTAS. O App Router mantém layouts
 *      compartilhados montados através de navegação client-side
 *      (`router.push`); um valor lido no primeiro render do layout
 *      raiz (ex.: o token no momento do login) pode nunca ser
 *      atualizado de novo, mesmo depois do cookie mudar de verdade.
 *
 * A correção certa pros dois é a MESMA: nunca depender de o cliente
 * já ter rodado. Middleware roda no servidor, em TODA requisição —
 * inclusive a primeiríssima depois de reabrir o navegador, e inclusive
 * o fetch RSC por trás de uma navegação client-side — e roda ANTES do
 * layout/página. Renovando aqui, quem lê a sessão depois (Server
 * Components, Server Actions) nunca vê um token vencido que já não
 * precisava estar vencido.
 *
 * Não é o fluxo `@supabase/ssr` (que gerencia os próprios cookies
 * `sb-*`) porque este projeto guarda a sessão num único cookie JSON
 * próprio (`ruptura_auth`, ver `lib/auth/session.ts`) — mesma IDEIA do
 * padrão oficial (renovar no servidor, a cada requisição, antes da
 * página), adaptada ao formato de cookie já existente, sem migrar toda
 * a camada de auth pra outro mecanismo de armazenamento.
 *
 * O que isto NÃO faz: não autentica o WebSocket de Realtime — aquele
 * continua sendo responsabilidade do cliente
 * (`CampaignRealtimeProvider`/`setBrowserSupabaseRealtimeAuth`), porque
 * um socket já aberto fica em memória por HORAS sem gerar nenhuma
 * requisição nova — não existe uma passagem pelo middleware pra
 * renovar aquele token especificamente. As duas renovações cobrem
 * necessidades diferentes (cookie de sessão vs. socket já aberto), não
 * é duplicação.
 */

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

const AUTH_COOKIE = "ruptura_auth";
/** Renova com folga — nunca em cima da hora, cobre o tempo do próprio request. */
const MARGEM_MS = 60_000;
/** Mesmo valor de `session.ts` — cookie desliza 30 dias a cada renovação. */
const MAX_AGE_COOKIE_SEGUNDOS = 60 * 60 * 24 * 30;

interface AuthTokens {
  access_token: string;
  refresh_token: string;
}

/** `exp` (ms desde epoch) de um JWT, ou `null` se ilegível — nunca lança. */
function decodificarExpiracaoJwt(token: string): number | null {
  try {
    const payloadBase64Url = token.split(".")[1];
    if (!payloadBase64Url) return null;
    const payloadBase64 = payloadBase64Url.replace(/-/g, "+").replace(/_/g, "/");
    const payload = JSON.parse(atob(payloadBase64)) as { exp?: number };
    return typeof payload.exp === "number" ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

export async function middleware(request: NextRequest) {
  const bruto = request.cookies.get(AUTH_COOKIE)?.value;
  if (!bruto) return NextResponse.next();

  let tokens: AuthTokens | null = null;
  try {
    const parsed = JSON.parse(bruto);
    if (typeof parsed.access_token === "string" && typeof parsed.refresh_token === "string") tokens = parsed;
  } catch {
    return NextResponse.next();
  }
  if (!tokens) return NextResponse.next();

  const exp = decodificarExpiracaoJwt(tokens.access_token);
  const precisaRenovar = exp === null || exp - Date.now() < MARGEM_MS;
  if (!precisaRenovar) return NextResponse.next();

  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!url || !anonKey) return NextResponse.next(); // env ausente não deve derrubar a requisição

  let novoPar: AuthTokens | null = null;
  try {
    const supabase = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await supabase.auth.refreshSession({ refresh_token: tokens.refresh_token });
    if (!error && data.session) {
      novoPar = { access_token: data.session.access_token, refresh_token: data.session.refresh_token };
    }
  } catch {
    novoPar = null;
  }
  // Refresh token morto/inválido, ou falha de rede: deixa passar sem
  // tocar o cookie — a leitura de sessão adiante trata como deslogado
  // do jeito que já tratava (redirect pro login), o mesmo resultado de
  // antes desta correção existir. Middleware nunca é o lugar de
  // DECIDIR "precisa logar" — só de evitar que um token que AINDA
  // podia ser renovado chegue vencido na leitura.
  if (!novoPar) return NextResponse.next();

  const valorCookie = JSON.stringify(novoPar);
  // Regrava no REQUEST (pra este MESMO request — os Server
  // Components/Actions que rodam a seguir leem via `next/headers`
  // `cookies()`, que reflete o request, não a response) E na RESPONSE
  // (`Set-Cookie` pro navegador guardar pra próxima requisição). Só
  // mudar a response resolveria a PRÓXIMA navegação, mas não a leitura
  // que este mesmo request ainda vai fazer.
  request.cookies.set(AUTH_COOKIE, valorCookie);
  const response = NextResponse.next({ request });
  response.cookies.set(AUTH_COOKIE, valorCookie, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_COOKIE_SEGUNDOS,
  });
  return response;
}

export const config = {
  matcher: [
    // Toda rota, exceto assets estáticos do Next e arquivos com
    // extensão (imagens, fontes, manifesto, etc. — `public/*`, como
    // `/brand/app-hud.jpg`) — não há sessão pra renovar ali, e rodar o
    // middleware neles só custaria latência à toa (achado de
    // auditoria: a regex anterior só excluía `_next/static`,
    // `_next/image` e `favicon.ico` — qualquer outro arquivo estático
    // servido de `public/` ainda passava por aqui).
    "/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpe?g|gif|webp|ico|css|js|woff2?|ttf|json|txt|xml|webmanifest|map)$).*)",
  ],
};
