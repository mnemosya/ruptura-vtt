/**
 * Browser check da Fase 3b — Presence (status online do roster).
 *
 * Diferente de todo check anterior desta reestrutura, este precisa de
 * participantes de verdade, com socket próprio — Presence é broadcast
 * entre conexões vivas, não dá pra simular com um INSERT via service
 * role (como `table_logs`). Cria contas fixture (jogador MEMBRO e, no
 * critério 6, um NÃO-membro), autentica por senha e grava um cookie
 * `ruptura_auth` válido direto no contexto do Playwright — mesmo
 * formato que `writeAuthTokens` grava (`{access_token, refresh_token}`,
 * JSON cru), sem nenhuma senha passando pelo agente.
 *
 * LIMPEZA: `limpar()` reprova a suíte se qualquer delete falhar, e
 * imprime os IDs que sobraram pra remoção manual — achado da própria
 * auditoria desta fase: engolir erro de cleanup foi exatamente o que
 * deixou usuários fixture órfãos como membros da campanha real numa
 * rodada de depuração anterior (roster acumulava entradas duplicadas
 * "Debug MultiTab (offline)", quebrando os locators dos testes por
 * ambiguidade — um bug de HIGIENE de teste que se disfarçou de bug de
 * produto até ser rastreado).
 *
 * Cobre:
 *   1. Narrador vê a própria presença: abre a campanha, aparece online
 *      no próprio roster.
 *   2. SEGUNDO participante de verdade (membro) abre a campanha numa
 *      aba própria → o narrador vê o dot acender pra esse participante,
 *      sem reload.
 *   3. MÚLTIPLAS ABAS DO MESMO USUÁRIO CONTAM COMO 1: o jogador abre uma
 *      SEGUNDA aba (mesmo cookie); fecha a PRIMEIRA — ainda online.
 *      Implementação final: cada CONEXÃO usa uma key de presença
 *      ALEATÓRIA própria (`crypto.randomUUID()`, gerada no cliente,
 *      nunca `userId`) — key compartilhada entre abas foi tentada e
 *      DESCARTADA (achado real: quebrava o `leave` de desconexão, ver
 *      histórico completo no plano). A dedupe "múltiplas abas = 1" é
 *      feita no CLIENTE, por `user_id` dentro do payload rastreado
 *      (`presenceRealtime.ts`), nunca pela key do Realtime.
 *   4. DESCONEXÃO REFLETE EM TEMPO RAZOÁVEL: fecha a aba restante, o
 *      narrador vê o dot apagar sozinho dentro de uma janela de espera
 *      generosa (o timeout é do próprio Supabase Realtime, não deste
 *      código — ver `presenceRealtime.ts`).
 *   5. SEM ESTADO ENGANOSO, prova ESTRUTURAL: bloqueia o WebSocket de
 *      Realtime por completo (`page.routeWebSocket`, handler vazio — a
 *      conexão nunca abre, `presenceSyncStatus` nunca sai de
 *      "connecting") e confirma que NENHUM participante ganha
 *      `data-online` no DOM, esperando bem além do tempo que uma
 *      sincronização normal levaria.
 *   6. AUTORIZAÇÃO NEGATIVA (migration 0062): uma conta autenticada mas
 *      NÃO-membro da campanha tenta entrar no canal privado
 *      `presence:campaign:{id}` diretamente (sem passar pela UI —
 *      client supabase-js cru, mesmo padrão de verificação usado pra
 *      confirmar os bugs desta fase). Prova três coisas: (a) o canal
 *      NUNCA chega a `SUBSCRIBED` pra essa conta; (b) ela nunca recebe
 *      NENHUM `sync` de presença; (c) o narrador (autorizado, real,
 *      via UI) nunca vê essa conta aparecer no roster, mesmo que ela
 *      tente publicar assim mesmo. Este critério é também a VERIFICAÇÃO
 *      de que "Allow public access" está desligado no dashboard do
 *      Supabase — se estivesse ligado, o Realtime ignoraria `private`/
 *      RLS e este critério reprovaria (ver nota completa no plano).
 *
 * Uso: npx tsx scripts/dev/check-campanha-presence-fase3b.ts
 * (precisa de `npm run dev` e de sessão salva —
 * npx tsx scripts/dev/refresh-admin-session.ts se necessário)
 */

import { randomUUID } from "node:crypto";
import { config as loadDotenv } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { chromium, type BrowserContext, type Page } from "playwright";
import { BASE_URL, withAuthenticatedPage } from "./authSession";

loadDotenv({ path: ".env.local" });

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`Variável de ambiente obrigatória ausente: ${name}`);
    process.exit(1);
  }
  return v;
}

const admin = createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false, autoRefreshToken: false },
});
const anonKey = requireEnv("SUPABASE_ANON_KEY");
const supabaseUrl = requireEnv("SUPABASE_URL");

let passou = 0;
let falhou = 0;
function registrar(criterio: string, ok: boolean, detalhe: string) {
  if (ok) {
    passou++;
    console.log(`ok - ${criterio}: ${detalhe}`);
  } else {
    falhou++;
    console.error(`FALHA - ${criterio}: ${detalhe}`);
  }
}

const RUN_TAG = `presence-${Date.now()}`;
let campaignId: string | null = null;

/**
 * Todo fixture criado nesta execução — rastreado num array (não
 * variáveis soltas) pra `limpar()` conseguir remover TODOS, reportar
 * QUAIS falharam, e reprovar a suíte se sobrar algo. `membro: true`
 * indica que também precisa de `delete` em `campaign_members` antes do
 * `deleteUser` (a FK exige essa ordem).
 */
interface FixtureCriado {
  id: string;
  email: string;
  membro: boolean;
}
const fixturesCriados: FixtureCriado[] = [];

async function criarFixture(displayName: string, membro: boolean): Promise<{ id: string; email: string; password: string }> {
  const email = `check-presence-${RUN_TAG}-${fixturesCriados.length}@ruptura.dev`;
  const password = randomUUID();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: displayName },
  });
  if (error) throw new Error(`Falha ao criar fixture "${displayName}": ${error.message}`);
  fixturesCriados.push({ id: data.user.id, email, membro });
  return { id: data.user.id, email, password };
}

async function adicionarComoMembro(userId: string): Promise<void> {
  if (!campaignId) throw new Error("campaignId ausente ao adicionar membro");
  const { error } = await admin
    .from("campaign_members")
    .insert({ campaign_id: campaignId, user_id: userId, role: "player", status: "active", origem: "fixture_presence" });
  if (error) throw new Error(`Falha ao adicionar fixture como membro: ${error.message}`);
}

/** Cookie `ruptura_auth` válido direto no contexto — mesmo formato de `writeAuthTokens`, sem UI de login. */
async function contextoAutenticadoComo(email: string, password: string): Promise<BrowserContext> {
  const anon = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await anon.auth.signInWithPassword({ email, password });
  if (error || !data.session) throw new Error(`Falha ao logar jogador fixture: ${error?.message}`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  await context.addCookies([
    {
      name: "ruptura_auth",
      value: JSON.stringify({ access_token: data.session.access_token, refresh_token: data.session.refresh_token }),
      domain: "localhost",
      path: "/",
      httpOnly: true,
      secure: false,
      sameSite: "Lax",
      expires: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7,
    },
  ]);
  return context;
}

/**
 * A PRESENÇA DEIXOU DE SER BOOLEANA, e isso é o assunto inteiro desta
 * parte do produto.
 *
 * O check lia `data-online="true"|"false"` num item
 * `session-roster-item`. Nenhum dos dois existe: a linha é
 * `painel-participantes-linha` e o que ela carrega é
 * `data-presenca`, com QUATRO estados — online, offline, conectando,
 * indisponivel.
 *
 * A troca não foi cosmética. `participantesModelo.ts` explica por quê:
 * um `onlineUserIds` vazio é AMBÍGUO — pode ser "ninguém online" ou "o
 * canal ainda não sincronizou". Tratar o segundo como o primeiro é
 * exatamente o estado enganoso que o provider foi escrito pra não
 * produzir, e um booleano não tem como não produzi-lo.
 *
 * Então este helper devolve o estado de verdade, e os critérios abaixo
 * passam a falar nele.
 */
type EstadoPresenca = "online" | "offline" | "conectando" | "indisponivel" | "ausente";

async function presencaNoRoster(page: Page, nomeParcial: string): Promise<EstadoPresenca> {
  await page.locator('[data-testid="painel-aba-participantes"]').click();
  await page.waitForTimeout(200);
  const item = page.locator(`[data-testid="painel-participantes-linha"]:has-text("${nomeParcial}")`);
  if ((await item.count()) === 0) return "ausente";
  const attr = await item.first().getAttribute("data-presenca");
  return attr === "online" || attr === "offline" || attr === "conectando" || attr === "indisponivel"
    ? attr
    : "ausente";
}

async function main() {
  await withAuthenticatedPage(async (narradorPage) => {
    narradorPage.on("console", () => {}); // silencioso — critério de console já coberto em check-campanha-painel-turndock-fase3.ts

    // --- 0. Descobrir campanha de teste + adicionar o jogador fixture como membro ATIVO ---
    await narradorPage.goto(`${BASE_URL}/mesas`, { waitUntil: "networkidle" });
    const hrefs = await narradorPage.locator("a").evaluateAll((as) => as.map((a) => a.getAttribute("href") ?? ""));
    campaignId =
      hrefs.map((h) => h.match(/^\/mesas\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:\/|$)/i)?.[1]).find(Boolean) ?? null;
    if (!campaignId) {
      registrar("0 (campanha de teste)", false, "nenhuma campanha encontrada em /mesas para esta conta");
      return;
    }
    registrar("0 (campanha de teste)", true, `usando ${campaignId}`);

    const jogador = await criarFixture("Jogador Presence Fixture", true);
    await adicionarComoMembro(jogador.id);
    registrar("0b (jogador fixture adicionado à campanha)", true, `membro ${jogador.id} ativo em ${campaignId}`);

    // --- 1. Narrador vê a própria presença ---
    await narradorPage.goto(`${BASE_URL}/mesas/${campaignId}`, { waitUntil: "networkidle" });
    await narradorPage.waitForTimeout(1500);
    const statusNarrador = await presencaNoRoster(narradorPage, "Narrador");
    registrar("1 (narrador vê a própria presença online)", statusNarrador === "online", `status do narrador no próprio roster="${statusNarrador}"`);

    // --- 5. Sem estado enganoso — prova ESTRUTURAL, canal bloqueado de propósito ---
    {
      // Página IRMÃ (mesmo cookie de sessão, `narradorPage.context()`),
      // pra não mexer na conexão real que os outros critérios usam.
      // `routeWebSocket` PRECISA ser registrado antes do `goto` — só
      // rotas WebSockets criados DEPOIS da chamada.
      const pageBloqueada = await narradorPage.context().newPage();
      await pageBloqueada.routeWebSocket(/realtime/, () => {
        // Handler vazio: por padrão o WebSocket roteado NÃO conecta ao
        // servidor real — fica pendurado, nunca dispara `onopen`. Todo
        // canal Realtime desta página (sessão, personagens, presença)
        // fica preso em "connecting" para sempre, de propósito.
      });
      await pageBloqueada.goto(`${BASE_URL}/mesas/${campaignId}`, { waitUntil: "networkidle" });
      await pageBloqueada.locator('[data-testid="painel-aba-participantes"]').click();
      // Bem além do que uma sincronização normal levaria (~1-2s medido
      // à mão) — se o bloqueio estiver funcionando, nada muda depois
      // deste tempo; se a garantia estiver quebrada, isto dá tempo de
      // sobra pra `data-online` aparecer errado.
      await pageBloqueada.waitForTimeout(5000);
      // A GARANTIA FICOU MAIS FORTE com o modelo de quatro estados, e
      // é ela que se afirma aqui: com o canal preso, ninguém pode
      // aparecer como "offline". Offline é uma AFIRMAÇÃO sobre a
      // pessoa, e o cliente não tem como fazê-la sem um canal que
      // sincronizou — `estadoPresenca` só devolve online/offline
      // quando o status é `subscribed`, e devolve "conectando" ou
      // "indisponivel" em todo o resto.
      //
      // O critério antigo pedia AUSÊNCIA de atributo, que era como o
      // booleano evitava mentir. Pedir ausência agora seria pedir menos:
      // o atributo existe sempre, e o que importa é o que ele diz.
      const estados = await pageBloqueada.evaluate(() =>
        [...document.querySelectorAll('[data-testid="painel-participantes-linha"]')]
          .map((el) => el.getAttribute("data-presenca") ?? "(sem atributo)"));
      const nenhumOffline = estados.length > 0 && estados.every((e) => e === "conectando" || e === "indisponivel");
      registrar(
        "5 (com o canal bloqueado, ninguém é declarado offline — o cliente não afirma o que não sabe)",
        nenhumOffline,
        `WebSocket de Realtime bloqueado por completo, esperado 5s: estados=${JSON.stringify(estados)}`,
      );
      await pageBloqueada.close();
    }

    // --- 2. Segundo participante de verdade fica online, narrador vê sem reload ---
    const contextoJogador = await contextoAutenticadoComo(jogador.email, jogador.password);
    const abaJogador1 = await contextoJogador.newPage();
    await abaJogador1.goto(`${BASE_URL}/mesas/${campaignId}`, { waitUntil: "networkidle" });

    // Polling em vez de um único wait fixo — a sincronização real medida
    // (script `_debug-presence-timing.ts`) leva ~1.4s, mas duas conexões
    // concorrentes num ambiente headless podem variar; poll é mais
    // robusto que apostar num número fixo.
    let statusJogadorOnline: EstadoPresenca = "ausente";
    for (let i = 0; i < 10; i++) {
      await narradorPage.waitForTimeout(1000);
      statusJogadorOnline = await presencaNoRoster(narradorPage, "Jogador Presence Fixture");
      if (statusJogadorOnline === "online") break;
    }
    registrar("2 (segundo participante real aparece online pro narrador, sem reload)", statusJogadorOnline === "online", `status do jogador fixture no roster do narrador="${statusJogadorOnline}"`);

    // --- 3. Múltiplas abas do mesmo usuário contam como 1 ---
    const abaJogador2 = await contextoJogador.newPage();
    await abaJogador2.goto(`${BASE_URL}/mesas/${campaignId}`, { waitUntil: "networkidle" });
    await narradorPage.waitForTimeout(2000);

    await abaJogador1.close();
    await narradorPage.waitForTimeout(2000);
    const statusComUmaAbaFechada = await presencaNoRoster(narradorPage, "Jogador Presence Fixture");
    registrar(
      "3 (múltiplas abas contam como 1 — fechar uma, outra ainda rastreando, continua online)",
      statusComUmaAbaFechada === "online",
      `fechou a 1ª aba do jogador (2ª ainda aberta): status no roster do narrador="${statusComUmaAbaFechada}" (esperado "online")`,
    );

    // --- 4. Desconexão reflete em tempo razoável (fecha a última aba) ---
    await abaJogador2.close();
    await contextoJogador.browser()?.close();

    // Medido em isolamento (`_debug-presence-multitab.ts`): ~3-4s pra
    // uma conexão única. Janela de 40s dá margem generosa pro pior caso
    // (múltiplas conexões, ambiente headless) sem esconder uma
    // regressão real — se o Realtime nunca soltar a presença, isto
    // reprova, não passa silenciosamente esperando pouco.
    let statusFinal: EstadoPresenca = "online";
    const inicioEspera = Date.now();
    const LIMITE_MS = 40_000;
    while (Date.now() - inicioEspera < LIMITE_MS) {
      await narradorPage.waitForTimeout(2000);
      statusFinal = await presencaNoRoster(narradorPage, "Jogador Presence Fixture");
      if (statusFinal === "offline") break;
    }
    registrar(
      "4 (desconexão reflete em tempo razoável, sem ação do narrador)",
      statusFinal === "offline",
      `status final após fechar as duas abas do jogador (esperando até ${LIMITE_MS / 1000}s)="${statusFinal}"`,
    );

    // --- 6. Autorização negativa — não-membro não entra no canal privado ---
    {
      const impostor = await criarFixture("Impostor Nao Membro", false);
      // NUNCA adicionado a campaign_members — a autorização testada é
      // exatamente is_campaign_member retornando false pra esta conta.

      const anonImpostor = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
      const { data: sessaoImpostor, error: erroLoginImpostor } = await anonImpostor.auth.signInWithPassword({
        email: impostor.email,
        password: impostor.password,
      });
      if (erroLoginImpostor || !sessaoImpostor.session) {
        registrar("6 (autorização negativa — não-membro não entra no canal)", false, `falha ao logar impostor: ${erroLoginImpostor?.message}`);
      } else {
        // Observador AUTORIZADO independente (sessão real do jogador
        // fixture, já membro) — testemunha se o impostor CONSEGUE
        // publicar algo que se propague, sem depender da UI do
        // narrador (que nem mostraria o impostor, já que ele não é
        // membro — roster vem de campaign_members, não de presença).
        const anonObservador = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
        const { data: sessaoObservador, error: erroObservador } = await anonObservador.auth.signInWithPassword({
          email: jogador.email,
          password: jogador.password,
        });
        if (erroObservador || !sessaoObservador.session) {
          registrar("6 (autorização negativa — não-membro não entra no canal)", false, `falha ao logar observador (jogador): ${erroObservador?.message}`);
          return;
        }
        const clienteJogador = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
        await clienteJogador.realtime.setAuth(sessaoObservador.session.access_token);
        let observadorViuImpostor = false;
        const canalObservador = clienteJogador.channel(`presence:campaign:${campaignId}`, { config: { private: true, presence: {} } });
        canalObservador.on("presence", { event: "sync" }, () => {
          const estado = canalObservador.presenceState<{ user_id?: string }>();
          for (const entradas of Object.values(estado)) {
            for (const entrada of entradas) {
              if (entrada.user_id === impostor.id) observadorViuImpostor = true;
            }
          }
        });
        await new Promise<void>((resolve) => {
          canalObservador.subscribe((status) => {
            if (status === "SUBSCRIBED" || status === "CHANNEL_ERROR" || status === "TIMED_OUT") resolve();
          });
        });

        // O IMPOSTOR tenta entrar no MESMO canal privado.
        const clienteImpostor = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
        await clienteImpostor.realtime.setAuth(sessaoImpostor.session.access_token);
        let impostorRecebeuSync = false;
        const canalImpostor = clienteImpostor.channel(`presence:campaign:${campaignId}`, { config: { private: true, presence: {} } });
        canalImpostor.on("presence", { event: "sync" }, () => {
          impostorRecebeuSync = true;
        });
        const statusFinalImpostor = await new Promise<string>((resolve) => {
          let resolvido = false;
          canalImpostor.subscribe((status) => {
            if (resolvido) return;
            if (status === "SUBSCRIBED" || status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
              resolvido = true;
              resolve(status);
            }
          });
          setTimeout(() => {
            if (!resolvido) {
              resolvido = true;
              resolve("TIMEOUT_DO_TESTE_SEM_STATUS_TERMINAL");
            }
          }, 8000);
        });

        // Tenta publicar mesmo sem confirmação de SUBSCRIBED — se o
        // canal nunca uniu de verdade, isto deve ser um no-op silencioso
        // (não uma exceção que derrubaria o script).
        await canalImpostor.track({ user_id: impostor.id, online_at: new Date().toISOString() }).catch(() => {});
        await new Promise((r) => setTimeout(r, 3000));

        const estadoFinalObservador = canalObservador.presenceState<{ user_id?: string }>();
        for (const entradas of Object.values(estadoFinalObservador)) {
          for (const entrada of entradas) {
            if (entrada.user_id === impostor.id) observadorViuImpostor = true;
          }
        }

        clienteImpostor.removeChannel(canalImpostor);
        clienteJogador.removeChannel(canalObservador);

        const nuncaSubscribeu = statusFinalImpostor !== "SUBSCRIBED";
        registrar(
          "6 (autorização negativa — não-membro não entra no canal, não recebe, não publica)",
          nuncaSubscribeu && !impostorRecebeuSync && !observadorViuImpostor,
          `status final do canal do impostor="${statusFinalImpostor}" (NUNCA pode ser SUBSCRIBED), impostor recebeu algum sync=${impostorRecebeuSync}, ` +
            `observador autorizado viu o impostor aparecer=${observadorViuImpostor} (esperado false nos dois — se "Allow public access" estiver ligado no dashboard do Supabase, este critério reprova)`,
        );
      }
    }
  });
}

/**
 * Limpa TODOS os fixtures desta execução. Achado de auditoria: a versão
 * anterior engolia erro de `deleteUser` (`.catch(() => {})`) — foi
 * exatamente isso que deixou usuários órfãos como membros da campanha
 * real numa rodada de depuração, corrompendo o roster silenciosamente
 * até alguém notar por acaso. Agora: qualquer falha REPROVA a suíte
 * (`registrar`, não só `console.error`) e imprime os IDs que precisam
 * de remoção manual — nunca falha em silêncio.
 */
async function limpar(): Promise<void> {
  const falhas: string[] = [];
  for (const fixture of fixturesCriados) {
    if (fixture.membro && campaignId) {
      const { error } = await admin.from("campaign_members").delete().eq("campaign_id", campaignId).eq("user_id", fixture.id);
      if (error) falhas.push(`campaign_members de ${fixture.id} (${fixture.email}): ${error.message}`);
    }
    const { error: erroUser } = await admin.auth.admin.deleteUser(fixture.id);
    if (erroUser) falhas.push(`auth.users ${fixture.id} (${fixture.email}): ${erroUser.message}`);
  }

  if (fixturesCriados.length > 0) {
    registrar(
      "L (limpeza de fixtures — nenhum órfão deixado pra trás)",
      falhas.length === 0,
      falhas.length === 0
        ? `${fixturesCriados.length} fixture(s) removido(s) com sucesso`
        : `FALHA AO LIMPAR — remoção manual necessária:\n${falhas.map((f) => `    - ${f}`).join("\n")}`,
    );
  }
}

main()
  .catch((err) => {
    console.error("Erro fatal no check:", err instanceof Error ? err.message : err);
    falhou++;
  })
  .finally(async () => {
    await limpar();
    console.log(`\n${passou} critérios aprovados, ${falhou} reprovados.`);
    if (falhou > 0) process.exitCode = 1;
  });
