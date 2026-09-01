/**
 * Browser check da Fase 4 — migração de Gameplay (Mesa, Personagens,
 * Bando, Mercado) pra `rm-*` + remoção do auto-redirect de servidor
 * (correção #13 do plano) quando há 1 personagem só.
 *
 * Precisa de um SEGUNDO participante de verdade (jogador fixture, com
 * EXATAMENTE 1 personagem controlado, não-arquivado) pra provar o caso
 * que mudou de comportamento nesta fase — sem isso não dá pra
 * distinguir "nunca redirecionou porque não tinha 1 personagem só" de
 * "não redireciona mais porque a correção funcionou". Personagem criado
 * com `createInitialCharacter(null, ...)` (função pura, mesma usada
 * pela UI) + insert direto via service role + RPC `grant_character_control`.
 *
 * Cobre:
 *   1. NARRADOR — Mesa: "Resolver Ataque" presente, com controles
 *      `rm-select`/`rm-input`/`rm-btn`.
 *   2. NARRADOR — Personagens: pills de filtro, botão "Criar personagem".
 *   3. NARRADOR — Bando: título, sem crash.
 *   4. NARRADOR — Mercado: carrega sem redirecionar (independente de
 *      quantos personagens o narrador tiver na campanha real).
 *   5. JOGADOR (fixture, 1 personagem) — Personagens NÃO redireciona:
 *      URL continua em `/personagens`, mostra o card com "Abrir ficha".
 *   6. JOGADOR — Mercado NÃO redireciona: mesma prova, outra rota.
 *   7. JOGADOR — Mesa mostra "Seus personagens" (não "Resolver Ataque").
 *   8. Abrir ficha a partir de Personagens é navegação client-side que
 *      abre como MODAL: URL vira `/ficha?...`, mas `.rm-navrail` (casca
 *      da campanha) continua no DOM — a campanha não descarregou.
 *   9. `/ficha` DIRETA (navegação fresca, não veio de dentro de
 *      /mesas) continua página cheia: SEM `.rm-navrail` no DOM.
 *   10. Console limpo nas rotas visitadas (narrador + jogador).
 *
 * Correção pós-auditoria (2026-08-14) — a Mesa do jogador nasceu na
 * Fase 4 só com o snapshot do SSR (`personagensControladosIniciais`),
 * sem NENHUM caminho de releitura: PV/PE/condições/colapso ficavam
 * congelados a sessão inteira, inclusive depois de editar a própria
 * ficha no modal, e uma falha de leitura virava silenciosamente "você
 * não controla personagem nenhum". `MesaClient.tsx` ganhou 3 gatilhos
 * de releitura (Realtime do canal `characters`, mudança de
 * `viewer.controlledCharacterIds`, fechamento do modal da ficha) e um
 * estado de erro PRÓPRIO que nunca apaga cards válidos. Critérios
 * novos, todos precisando de um SEGUNDO personagem fixture
 * (`characterIdB`, criado SEM controle concedido — concedido/revogado
 * ao vivo pelos critérios 12/13):
 *   11. Realtime entrega uma mudança de PV feita "por fora" (update
 *       direto, simulando o narrador aplicando dano) sem reload de
 *       página.
 *   12. Conceder controle de um segundo personagem (grant ao vivo +
 *       evento de foco, que dispara `reloadViewer`) faz o card
 *       aparecer sem reload.
 *   13. Revogar esse controle faz o card sumir, PRESERVANDO o card do
 *       personagem original — não é um "recarregar tudo do zero".
 *   14. Falha de releitura (interceptada por `next-action`, técnica já
 *       usada na Fase 3) mostra erro+retry SEM apagar os cards
 *       existentes nem alegar "vazio". Retry recupera.
 *   15. Fechar o modal da ficha aplica uma mudança feita enquanto o
 *       modal estava aberto — prova ESTRUTURAL: WebSocket de Realtime
 *       bloqueado de propósito (`routeWebSocket`, mesma técnica da
 *       Fase 3b) pra isolar o gatilho de fechamento de modal do
 *       gatilho de Realtime, que sozinho já cobriria o mesmo caso.
 *
 * Uso: npx tsx scripts/dev/check-campanha-fase4-gameplay.ts
 * (precisa de `npm run dev` e de sessão salva —
 * npx tsx scripts/dev/refresh-admin-session.ts se necessário)
 */

import { randomUUID } from "node:crypto";
import { config as loadDotenv } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import type { ConsoleMessage } from "playwright";
import { chromium, type BrowserContext } from "playwright";
import { createInitialCharacter } from "../../src/lib/character/createCharacter";
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

function erroRelevante(msg: ConsoleMessage): boolean {
  if (msg.type() !== "error") return false;
  const t = msg.text();
  return !t.includes("favicon") && !t.includes("Download the React DevTools");
}

let campaignId: string | null = null;
let jogadorId: string | null = null;
let jogadorEmail: string | null = null;
let jogadorSenha: string | null = null;
let characterId: string | null = null;
/** Segundo personagem fixture — criado SEM controle concedido; os critérios 12/13 concedem/revogam ao vivo. */
let characterIdB: string | null = null;
let membroAdicionado = false;

/** Simula "o narrador aplicou dano" ou "o jogador editou a ficha" — update direto no `payload`, fora da UI. */
async function atualizarPvDeTeste(charId: string, novoPv: number): Promise<void> {
  const { data, error } = await admin.from("characters").select("payload").eq("id", charId).single();
  if (error || !data) throw new Error(`Falha ao ler personagem pra atualizar PV de teste: ${error?.message ?? "sem dado"}`);
  const payload = data.payload as Record<string, unknown>;
  const recursos = (payload.recursos_atuais as Record<string, unknown> | undefined) ?? {};
  const { error: erroUpdate } = await admin
    .from("characters")
    .update({ payload: { ...payload, recursos_atuais: { ...recursos, pv: novoPv } } })
    .eq("id", charId);
  if (erroUpdate) throw new Error(`Falha ao atualizar PV de teste: ${erroUpdate.message}`);
}

async function configurarFixture(): Promise<void> {
  const email = `check-fase4-${Date.now()}@ruptura.dev`;
  const password = randomUUID();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: "Fixture Fase 4" },
  });
  if (error) throw new Error(`Falha ao criar jogador fixture: ${error.message}`);
  jogadorId = data.user.id;
  jogadorEmail = email;
  jogadorSenha = password;

  const { error: erroMembro } = await admin
    .from("campaign_members")
    .insert({ campaign_id: campaignId, user_id: jogadorId, role: "player", status: "active", origem: "fixture_fase4" });
  if (erroMembro) throw new Error(`Falha ao adicionar fixture como membro: ${erroMembro.message}`);
  membroAdicionado = true;

  // Mesmo helper puro que a UI usa pra criar um personagem novo —
  // `regras=null` cai no fallback fixo do PRD, suficiente pra um
  // personagem de teste que só precisa existir e ter nome.
  const personagem = createInitialCharacter(null, "Fixture Único");
  const novoId = randomUUID();
  const { error: erroChar } = await admin.from("characters").insert({
    id: novoId,
    name: personagem.nome,
    owner_label: null,
    status: "draft",
    payload: personagem,
    campaign_id: campaignId,
    owner_id: jogadorId,
  });
  if (erroChar) throw new Error(`Falha ao criar personagem fixture: ${erroChar.message}`);
  characterId = novoId;

  // Insert direto em vez da RPC `grant_character_control`: a RPC checa
  // "só o narrador dono da campanha pode conceder controle" internamente
  // (não é só RLS, é uma checagem explícita no corpo da função), então
  // falha mesmo sob service role. Fixture de teste — mesmo padrão já
  // usado nos outros scripts desta suíte (inserir direto pra montar o
  // estado, nunca pra testar autorização em si).
  const { error: erroGrant } = await admin
    .from("character_controllers")
    .insert({ character_id: characterId, campaign_id: campaignId, user_id: jogadorId });
  if (erroGrant) throw new Error(`Falha ao conceder controle do personagem fixture: ${erroGrant.message}`);

  // Segundo personagem, SEM controle concedido — os critérios 12/13
  // concedem/revogam isso ao vivo, é o objeto do teste, não do setup.
  const personagemB = createInitialCharacter(null, "Fixture Segundo");
  const novoIdB = randomUUID();
  const { error: erroCharB } = await admin.from("characters").insert({
    id: novoIdB,
    name: personagemB.nome,
    owner_label: null,
    status: "draft",
    payload: personagemB,
    campaign_id: campaignId,
    owner_id: jogadorId,
  });
  if (erroCharB) throw new Error(`Falha ao criar segundo personagem fixture: ${erroCharB.message}`);
  characterIdB = novoIdB;
}

async function contextoJogador(): Promise<BrowserContext> {
  const anon = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await anon.auth.signInWithPassword({ email: jogadorEmail as string, password: jogadorSenha as string });
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

async function main() {
  await withAuthenticatedPage(async (narradorPage) => {
    await narradorPage.goto(`${BASE_URL}/mesas`, { waitUntil: "networkidle" });
    const hrefs = await narradorPage.locator("a").evaluateAll((as) => as.map((a) => a.getAttribute("href") ?? ""));
    campaignId = hrefs.map((h) => h.match(/^\/mesas\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:\/|$)/i)?.[1]).find(Boolean) ?? null;
    if (!campaignId) {
      registrar("0 (campanha de teste)", false, "nenhuma campanha encontrada em /mesas para esta conta");
      return;
    }
    registrar("0 (campanha de teste)", true, `usando ${campaignId}`);

    await configurarFixture();
    registrar("0b (jogador fixture com 1 personagem controlado)", true, `jogador ${jogadorId}, personagem ${characterId}`);

    // Erros contados só a partir daqui — a navegação pra dentro da campanha,
    // depois do `/mesas` acima (o dashboard, visitado só pra descobrir um
    // id de campanha). `/mesas` tem um 404 pré-existente e alheio a esta
    // reestrutura (`mesas/_global/parts.tsx:63` pede `/brand/app-hud.png`,
    // o arquivo real é `.jpg`) — contar a partir daqui evita que esse ruído
    // conhecido derrube o critério de console limpo.
    const errosNarrador: string[] = [];
    narradorPage.on("console", (m) => { if (erroRelevante(m)) errosNarrador.push(m.text().slice(0, 200)); });

    // --- 1. Narrador — Mesa: Resolver Ataque com controles rm-* ---
    await narradorPage.goto(`${BASE_URL}/mesas/${campaignId}`, { waitUntil: "networkidle" });
    {
      const temHeading = (await narradorPage.locator('h2:has-text("Resolver Ataque")').count()) > 0;
      const temSelect = (await narradorPage.locator('[data-testid="det-ataque-atacante-select"].rm-select').count()) > 0;
      const temBotao = (await narradorPage.locator('[data-testid="det-calcular-margem"].rm-btn').count()) > 0;
      registrar("1 (narrador vê Resolver Ataque com controles rm-*)", temHeading && temSelect && temBotao, `heading=${temHeading}, select rm-*=${temSelect}, botão rm-*=${temBotao}`);
    }

    // --- 2. Narrador — Personagens ---
    await narradorPage.goto(`${BASE_URL}/mesas/${campaignId}/personagens`, { waitUntil: "networkidle" });
    {
      const temPills = (await narradorPage.locator(".rm-pill").count()) >= 5;
      const temCriar = (await narradorPage.locator('[data-testid="personagens-toggle-criar"]').count()) > 0;
      registrar("2 (narrador vê Personagens com pills rm-* e criar)", temPills && temCriar, `pills=${temPills}, botão criar=${temCriar}`);
    }

    // --- 3. Narrador — Bando ---
    await narradorPage.goto(`${BASE_URL}/mesas/${campaignId}/bando`, { waitUntil: "networkidle" });
    {
      const temTitulo = (await narradorPage.locator('h1:has-text("Bando")').count()) > 0;
      registrar("3 (narrador vê Bando)", temTitulo, `título presente=${temTitulo}`);
    }

    // --- 4. Narrador — Mercado carrega sem redirecionar ---
    await narradorPage.goto(`${BASE_URL}/mesas/${campaignId}/mercado`, { waitUntil: "networkidle" });
    {
      const url = narradorPage.url();
      const naoRedirecionou = url.includes("/mercado") && !url.includes("/ficha");
      registrar("4 (narrador — Mercado não redireciona)", naoRedirecionou, `url final="${url}"`);
    }

    registrar("10a (console limpo — narrador)", errosNarrador.length === 0, errosNarrador.length ? JSON.stringify(errosNarrador.slice(0, 3)) : "nenhum");

    // --- Jogador fixture ---
    const ctxJogador = await contextoJogador();
    const jogadorPage = await ctxJogador.newPage();
    const errosJogador: string[] = [];
    jogadorPage.on("console", (m) => { if (erroRelevante(m)) errosJogador.push(m.text().slice(0, 200)); });

    // --- 5. Jogador — Personagens NÃO redireciona (1 personagem só) ---
    await jogadorPage.goto(`${BASE_URL}/mesas/${campaignId}/personagens`, { waitUntil: "networkidle" });
    {
      const url = jogadorPage.url();
      const ficouEmPersonagens = url.endsWith("/personagens");
      const temCard = (await jogadorPage.locator(`[data-testid="personagens-abrir-ficha-${characterId}"]`).count()) > 0;
      registrar(
        "5 (jogador com 1 personagem — Personagens NÃO redireciona)",
        ficouEmPersonagens && temCard,
        `url final="${url}" (esperado terminar em /personagens), card "Abrir ficha" presente=${temCard}`,
      );
    }

    // --- 6. Jogador — Mercado NÃO redireciona ---
    await jogadorPage.goto(`${BASE_URL}/mesas/${campaignId}/mercado`, { waitUntil: "networkidle" });
    {
      const url = jogadorPage.url();
      const ficouEmMercado = url.endsWith("/mercado");
      registrar("6 (jogador com 1 personagem — Mercado NÃO redireciona)", ficouEmMercado, `url final="${url}" (esperado terminar em /mercado)`);
    }

    // --- 7. Jogador — Mesa mostra "Seus personagens" ---
    await jogadorPage.goto(`${BASE_URL}/mesas/${campaignId}`, { waitUntil: "networkidle" });
    {
      const temSecaoJogador = (await jogadorPage.locator('h2:has-text("Seus personagens")').count()) > 0;
      const semResolverAtaque = (await jogadorPage.locator('h2:has-text("Resolver Ataque")').count()) === 0;
      const temCardPersonagem = (await jogadorPage.locator('[data-testid="mesa-jogador-personagem-card"]').count()) > 0;
      registrar(
        "7 (jogador vê Seus personagens na Mesa, não Resolver Ataque)",
        temSecaoJogador && semResolverAtaque && temCardPersonagem,
        `seção "Seus personagens"=${temSecaoJogador}, sem "Resolver Ataque"=${semResolverAtaque}, card do personagem=${temCardPersonagem}`,
      );
    }

    // --- 11. Realtime entrega mudança de PV sem reload de página ---
    {
      const pvAntes = await jogadorPage.locator('[data-testid="mesa-jogador-vital-pv"] strong').textContent();
      const pvNovo = 777;
      await atualizarPvDeTeste(characterId as string, pvNovo);
      await jogadorPage.waitForTimeout(1500);
      const pvDepois = await jogadorPage.locator('[data-testid="mesa-jogador-vital-pv"] strong').textContent();
      registrar(
        "11 (Realtime entrega mudança de PV sem reload)",
        pvDepois?.trim() === String(pvNovo) && pvAntes?.trim() !== String(pvNovo),
        `PV antes="${pvAntes?.trim()}", PV depois da mudança externa (sem reload)="${pvDepois?.trim()}" (esperado "${pvNovo}")`,
      );
    }

    // --- 12. Conceder controle de um 2º personagem atualiza os cards — SEM focus/visibilitychange, SEM reload ---
    // Auditoria pós-Fase-4: `character_controllers` não toca a linha de
    // `characters`, então o canal de personagens sozinho nunca veria
    // isto — só o canal IRMÃO (`useCampaignCharacterControllersRealtime`,
    // migration 0063) pode entregar essa mudança com a página parada,
    // em foco, sem nenhuma interação. Nenhum `dispatchEvent("focus")`
    // aqui de propósito — isso provaria só o gatilho de FALLBACK
    // (mudança de `viewer.controlledCharacterIds`), não o Realtime
    // direto que é o objeto real deste critério.
    {
      const { error } = await admin
        .from("character_controllers")
        .insert({ character_id: characterIdB, campaign_id: campaignId, user_id: jogadorId });
      if (error) throw new Error(`Falha ao conceder controle do 2º personagem: ${error.message}`);
      await jogadorPage.waitForTimeout(2000);
      const cardB = (await jogadorPage.locator(`[data-testid="mesa-jogador-personagem-card"][data-character-id="${characterIdB}"]`).count()) > 0;
      const totalCards = await jogadorPage.locator('[data-testid="mesa-jogador-personagem-card"]').count();
      registrar(
        "12 (Realtime de character_controllers entrega concessão de controle, sem focus/reload)",
        cardB && totalCards === 2,
        `card do personagem B presente=${cardB}, total de cards=${totalCards} (esperado 2) — sem dispatchEvent("focus"), só o canal de character_controllers poderia ter trazido isso`,
      );
    }

    // --- 13. Revogar controle atualiza os cards — mesma prova, sem focus/reload, PRESERVANDO o personagem original ---
    {
      const { error } = await admin
        .from("character_controllers")
        .delete()
        .eq("character_id", characterIdB)
        .eq("user_id", jogadorId);
      if (error) throw new Error(`Falha ao revogar controle do 2º personagem: ${error.message}`);
      await jogadorPage.waitForTimeout(2000);
      const cardB = (await jogadorPage.locator(`[data-testid="mesa-jogador-personagem-card"][data-character-id="${characterIdB}"]`).count()) > 0;
      const cardA = (await jogadorPage.locator(`[data-testid="mesa-jogador-personagem-card"][data-character-id="${characterId}"]`).count()) > 0;
      const totalCards = await jogadorPage.locator('[data-testid="mesa-jogador-personagem-card"]').count();
      registrar(
        "13 (Realtime de character_controllers entrega revogação de controle, sem focus/reload, preserva o personagem original)",
        !cardB && cardA && totalCards === 1,
        `card B ainda presente=${cardB} (esperado false), card A preservado=${cardA} (esperado true), total de cards=${totalCards} (esperado 1) — sem dispatchEvent("focus")`,
      );
    }

    // Registrado AQUI, antes de 14/15: os dois critérios seguintes
    // interceptam e ABORTAM requisições de propósito (o próprio objeto
    // do teste — provar que uma falha real não apaga cards nem vira
    // "vazio"), o que gera "Failed to load resource: net::ERR_FAILED"
    // no console da MESMA `jogadorPage` — ruído esperado do teste, não
    // uma regressão. Mesmo raciocínio já aplicado na Fase 3 (console
    // limpo registrado antes das injeções de falha daquele script).
    registrar("10b (console limpo — jogador)", errosJogador.length === 0, errosJogador.length ? JSON.stringify(errosJogador.slice(0, 3)) : "nenhum");

    // --- 14. Falha de releitura mostra erro+retry, NUNCA apaga cards válidos ---
    {
      const mesaUrl = `${BASE_URL}/mesas/${campaignId}`;

      // Identifica o next-action de `reloadMembers` em isolamento
      // (SessionPanel chama isso no mount também — mesma ambiguidade e
      // mesma técnica "por eliminação" já usada na Fase 3).
      let idReloadMembers: string | null = null;
      const capturaReloadMembers = (req: import("playwright").Request) => {
        if (req.method() === "POST" && req.url() === mesaUrl && !idReloadMembers) {
          idReloadMembers = req.headers()["next-action"] ?? null;
        }
      };
      jogadorPage.on("request", capturaReloadMembers);
      await jogadorPage.locator('[data-testid="session-tab-participantes"]').click();
      await jogadorPage.waitForTimeout(700);
      jogadorPage.off("request", capturaReloadMembers);
      await jogadorPage.locator('[data-testid="session-tab-log"]').click();
      await jogadorPage.waitForTimeout(300);

      // Um reload cheio da Mesa dispara `reloadMembers` (mount do
      // SessionPanel) E `listControlledCharacters` (mount do gatilho 2
      // do MesaClient) quase juntos — captura os dois ids distintos e
      // descarta o já conhecido.
      const idsNoMount = new Set<string>();
      const capturaMount = (req: import("playwright").Request) => {
        if (req.method() === "POST" && req.url() === mesaUrl) {
          const id = req.headers()["next-action"];
          if (id) idsNoMount.add(id);
        }
      };
      jogadorPage.on("request", capturaMount);
      await jogadorPage.reload({ waitUntil: "networkidle" });
      await jogadorPage.waitForTimeout(1500);
      jogadorPage.off("request", capturaMount);
      const idPersonagensControlados = [...idsNoMount].find((id) => id !== idReloadMembers) ?? null;

      if (!idPersonagensControlados) {
        registrar(
          "14 (falha de releitura mostra erro+retry sem apagar cards)",
          false,
          `não foi possível identificar o next-action de listControlledCharacters (reloadMembers="${idReloadMembers}", ids vistos no mount=${JSON.stringify([...idsNoMount])}) — script desatualizado?`,
        );
      } else {
        const idCapturado = idPersonagensControlados;
        await jogadorPage.route(mesaUrl, (route) => {
          const header = route.request().headers()["next-action"];
          if (header === idCapturado) route.abort("failed");
          else route.continue();
        });

        const cardsAntes = await jogadorPage.locator('[data-testid="mesa-jogador-personagem-card"]').count();
        await jogadorPage.locator('[data-testid="mesa-recarregar"]').click();
        await jogadorPage.waitForTimeout(1000);

        const erroVisivel = await jogadorPage.locator('[data-testid="mesa-jogador-erro"]').isVisible().catch(() => false);
        const cardsDurante = await jogadorPage.locator('[data-testid="mesa-jogador-personagem-card"]').count();
        const semVazioIndevido = (await jogadorPage.locator('[data-testid="mesa-jogador-vazio"]').count()) === 0;

        await jogadorPage.unroute(mesaUrl);
        await jogadorPage.locator('[data-testid="mesa-jogador-tentar-de-novo"]').click();
        await jogadorPage.waitForTimeout(1000);
        const erroDepoisDoRetry = (await jogadorPage.locator('[data-testid="mesa-jogador-erro"]').count()) === 0;

        registrar(
          "14 (falha de releitura mostra erro+retry sem apagar cards)",
          erroVisivel && cardsDurante === cardsAntes && semVazioIndevido && erroDepoisDoRetry,
          `erro visível durante a falha=${erroVisivel}, cards antes=${cardsAntes}/durante=${cardsDurante} (devem ser iguais — nada apagado), "vazio" indevido presente=${!semVazioIndevido}, erro sumiu após retry=${erroDepoisDoRetry}`,
        );
      }
    }

    // --- 15. Fechar o modal da ficha aplica mudança feita com o modal aberto — prova ESTRUTURAL (Realtime bloqueado) ---
    {
      const mesaUrl = `${BASE_URL}/mesas/${campaignId}`;
      // Página IRMÃ (mesmo contexto/cookie) com o WebSocket de Realtime
      // bloqueado por completo ANTES do primeiro `goto` — mesma técnica
      // da Fase 3b (critério 5). Isola o gatilho 3 (fechamento do modal)
      // do gatilho 1 (Realtime), que sozinho já entregaria a mesma
      // mudança e mascararia uma regressão no gatilho 3 específico.
      const pageBloqueada = await ctxJogador.newPage();
      await pageBloqueada.routeWebSocket(/realtime/, () => {});
      await pageBloqueada.goto(mesaUrl, { waitUntil: "networkidle" });

      await pageBloqueada.locator(`[data-testid="mesa-jogador-personagem-card"][data-character-id="${characterId}"] [data-testid="mesa-jogador-abrir-ficha"]`).click();
      await pageBloqueada.waitForTimeout(1500);

      const personagemNome = "Fixture Único";
      const urlVirouFicha = pageBloqueada.url().includes("/ficha?");
      const nomeCorreto = (await pageBloqueada.getByText(personagemNome).count()) > 0;

      const pvComModalAberto = 555;
      await atualizarPvDeTeste(characterId as string, pvComModalAberto);
      await pageBloqueada.waitForTimeout(500);

      await pageBloqueada.locator('[aria-label="Fechar console"]').click();
      await pageBloqueada.waitForTimeout(1500);

      const voltouParaMesa = pageBloqueada.url().startsWith(mesaUrl);
      const cascaPreservada = (await pageBloqueada.locator(".rm-navrail").count()) > 0;
      const pvAtualizado = await pageBloqueada.locator('[data-testid="mesa-jogador-vital-pv"] strong').textContent();

      registrar(
        "15 (fechar modal da ficha atualiza a Mesa mesmo com Realtime bloqueado)",
        urlVirouFicha && nomeCorreto && voltouParaMesa && cascaPreservada && pvAtualizado?.trim() === String(pvComModalAberto),
        `abriu ficha correta (url=/ficha?=${urlVirouFicha}, nome "${personagemNome}" presente=${nomeCorreto}); ao fechar: voltou pra Mesa=${voltouParaMesa}, casca preservada=${cascaPreservada}, PV mostrado="${pvAtualizado?.trim()}" (esperado "${pvComModalAberto}" — só o fechamento do modal poderia ter trazido isso, Realtime estava bloqueado)`,
      );

      await pageBloqueada.close();
    }

    // --- 8. Abrir ficha a partir de Personagens abre como MODAL (campanha continua montada) ---
    await jogadorPage.goto(`${BASE_URL}/mesas/${campaignId}/personagens`, { waitUntil: "networkidle" });
    await jogadorPage.locator(`[data-testid="personagens-abrir-ficha-${characterId}"]`).click();
    // Espera a URL virar, não um tempo fixo. O `waitForTimeout(600)`
    // anterior era uma aposta na velocidade do commit da rota
    // interceptada — reprovou quando o carregamento da ficha passou de
    // 600ms, sem que a interceptação em si tivesse qualquer problema
    // (o modal abria, só um pouco depois da leitura). Esperar o
    // destino é mais forte: falha de verdade se o modal NÃO abrir.
    await jogadorPage.waitForURL(/\/ficha\?/, { timeout: 15000 }).catch(() => {});
    await jogadorPage.waitForTimeout(300);
    {
      const url = jogadorPage.url();
      const viradouFicha = url.includes("/ficha?") && url.includes(`characterId=${characterId}`);
      const casacaAindaMontada = (await jogadorPage.locator(".rm-navrail").count()) > 0;
      registrar(
        "8 (Abrir ficha via Personagens é modal — campanha continua montada por baixo)",
        viradouFicha && casacaAindaMontada,
        `url="${url}" (esperado /ficha?...), .rm-navrail ainda no DOM=${casacaAindaMontada} (esperado true — senão foi navegação cheia, não modal)`,
      );
    }

    // --- 9. /ficha DIRETA continua página cheia (sem casca da campanha) ---
    await jogadorPage.goto(`${BASE_URL}/ficha?campaignId=${campaignId}&characterId=${characterId}`, { waitUntil: "networkidle" });
    {
      const semCasca = (await jogadorPage.locator(".rm-navrail").count()) === 0;
      registrar("9 (/ficha direta é página cheia, sem casca da campanha)", semCasca, `.rm-navrail ausente=${semCasca} (esperado true)`);
    }

    await ctxJogador.browser()?.close();
  });
}

async function limpar(): Promise<void> {
  const falhas: string[] = [];
  if (characterId) {
    const { error } = await admin.from("characters").delete().eq("id", characterId);
    if (error) falhas.push(`characters ${characterId}: ${error.message}`);
  }
  if (characterIdB) {
    const { error } = await admin.from("characters").delete().eq("id", characterIdB);
    if (error) falhas.push(`characters ${characterIdB}: ${error.message}`);
  }
  if (membroAdicionado && campaignId && jogadorId) {
    const { error } = await admin.from("campaign_members").delete().eq("campaign_id", campaignId).eq("user_id", jogadorId);
    if (error) falhas.push(`campaign_members de ${jogadorId}: ${error.message}`);
  }
  if (jogadorId) {
    const { error } = await admin.auth.admin.deleteUser(jogadorId);
    if (error) falhas.push(`auth.users ${jogadorId}: ${error.message}`);
  }
  if (jogadorId || characterId) {
    registrar(
      "L (limpeza de fixtures)",
      falhas.length === 0,
      falhas.length === 0 ? "removido com sucesso" : `FALHA — remoção manual necessária:\n${falhas.map((f) => `    - ${f}`).join("\n")}`,
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
