/**
 * Browser check da Fase 5 — migração de Administração e leitura
 * (Conteúdo da campanha, Livro, Jogadores e convites, Configurações)
 * para `rm-*`, mais os estados de rota (not-found / acesso negado).
 *
 * Precisa de um jogador fixture REAL: metade dos critérios é sobre o
 * que o JOGADOR vê (ou não vê) nessas rotas, e "o trilho não mostra o
 * link" não é a autorização — o aditivo §5.3 exige a recusa no
 * servidor, que só um segundo papel de verdade consegue exercitar.
 *
 * Cobre:
 *   1. NARRADOR — Conteúdo da campanha: tabela `rm-table`, filtro
 *      `rm-select`, botão `rm-btn`; e ZERO hex hardcoded no HTML
 *      renderizado (critério nomeado da Fase 5).
 *   2. NARRADOR — Livro: sumário com busca `rm-input` e lista plana
 *      (`rm-doclist`), filtro funcionando de verdade.
 *   3. NARRADOR — Jogadores e convites em `rm-*`.
 *   4. NARRADOR — Configurações em `rm-*`.
 *   5. JOGADOR — as três rotas administrativas recusam no SERVIDOR
 *      (`NarratorOnlyDenied`), não só escondem o link no trilho.
 *   6. JOGADOR — Livro CONTINUA acessível (leitura é dos dois papéis).
 *   7. Estado "não encontrado" da campanha usa a linguagem da casca
 *      (`rm-boundary`), não a genérica de /admin e /login.
 *   8. Remover participante atualiza o ROSTER DA CASCA na hora —
 *      regressão do bug corrigido nesta fase: a tela chamava só a sua
 *      lista local, e o painel de sessão seguia mostrando quem acabou
 *      de sair até a janela perder e recuperar o foco.
 *   9. Console limpo nas rotas visitadas (narrador + jogador).
 *  10. Falha de leitura no Livro vira erro+retry, nunca "nenhum
 *      capítulo publicado" — e 10b: nem um 404 falso no capítulo.
 *  11. Falha ao listar convites vira erro+retry POR RECURSO, com os
 *      participantes (que carregaram) preservados na tela.
 *
 * Os critérios 10/11 injetam a falha por HEADER de requisição, via a
 * seam dev-only `src/lib/dev/faultInjection.ts` — nada global, nada a
 * restaurar. Exige `DEV_FAULT_INJECTION_SECRET` no `.env.local` (mesmo
 * valor lido pelo servidor dev); sem ela o script para no `requireEnv`
 * em vez de passar por omissão.
 *
 * Uso: npx tsx scripts/dev/check-campanha-admin-fase5.ts
 * (precisa de `npm run dev` e de sessão salva —
 * npx tsx scripts/dev/refresh-admin-session.ts se necessário)
 */

import { randomUUID } from "node:crypto";
import { config as loadDotenv } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import type { ConsoleMessage, Route } from "playwright";
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
// Mesmo segredo que o servidor dev carrega em DEV_FAULT_INJECTION_SECRET;
// sem ele configurado dos dois lados a seam fica inerte e os critérios
// 10/11 reprovam em vez de passar por omissão.
const FALHA_SEGREDO = requireEnv("DEV_FAULT_INJECTION_SECRET");
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
let membroAdicionado = false;
/** Capítulo homebrew publicado só para este check — ver `criarCapituloFixture`. */
let capituloId: string | null = null;
const CAPITULO_NOME = "Capítulo Fixture Fase 5";
const CAPITULO_SLUG = "capitulo_fixture_fase5";

/**
 * A campanha de teste pode não ter NENHUM capítulo publicado, e nesse
 * caso o sumário do Livro renderiza só o estado vazio — a busca e a
 * lista plana (`rm-doclist`), que são o objeto do critério 2, nunca
 * chegam a existir. Em vez de afrouxar a asserção (que passaria sem
 * testar nada), o check publica um capítulo homebrew próprio e o
 * remove no fim.
 */
async function criarCapituloFixture(): Promise<void> {
  const id = `campaign_capitulo_${randomUUID()}`;
  const payload = {
    nome: CAPITULO_NOME,
    slug: CAPITULO_SLUG,
    status: "published",
    descricao_curta: "Capítulo criado por check automatizado.",
    tags: ["fixture"],
    blocos: [{ id: "b1", tipo: "texto", texto: "Corpo do capítulo de teste." }],
  };
  const { error } = await admin.from("campaign_content_documents").insert({
    id,
    campaign_id: campaignId,
    content_type: "capitulo",
    slug: CAPITULO_SLUG,
    nome: CAPITULO_NOME,
    origin_type: "homebrew",
    payload,
    payload_hash: randomUUID().replace(/-/g, ""),
    status: "published",
    local_version: 1,
    published_at: new Date().toISOString(),
  });
  if (error) throw new Error(`Falha ao criar capítulo fixture: ${error.message}`);
  capituloId = id;
}

async function configurarFixture(): Promise<void> {
  const email = `check-fase5-${Date.now()}@ruptura.dev`;
  const password = randomUUID();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: "Fixture Fase 5" },
  });
  if (error) throw new Error(`Falha ao criar jogador fixture: ${error.message}`);
  jogadorId = data.user.id;
  jogadorEmail = email;
  jogadorSenha = password;

  const { error: erroMembro } = await admin
    .from("campaign_members")
    .insert({ campaign_id: campaignId, user_id: jogadorId, role: "player", status: "active", origem: "fixture_fase5" });
  if (erroMembro) throw new Error(`Falha ao adicionar fixture como membro: ${erroMembro.message}`);
  membroAdicionado = true;
}

/**
 * Injeção de falha de LEITURA no SSR, escopada ao REQUEST DE DOCUMENTO
 * específico — não à página inteira.
 *
 * Achado de auditoria sobre a primeira versão: `page.setExtraHTTPHeaders`
 * aplica os headers a TODA requisição que a página fizer enquanto
 * ativo — inclusive chamadas ao Supabase, WebSocket de Realtime,
 * assets externos, o que vazaria `DEV_FAULT_INJECTION_SECRET` pra fora
 * do host local. Corrigido com `page.route()`: intercepta toda
 * requisição, mas só ANEXA o header quando é exatamente a navegação de
 * DOCUMENTO (`resourceType === "document"`) para a URL alvo — qualquer
 * outra requisição (mesma origem ou não) passa por `route.continue()`
 * sem modificação nenhuma. O segredo nunca sai deste processo em
 * requisições que não sejam a própria navegação sob teste.
 *
 * `urlAlvo` é a URL EXATA de UM `goto()` — não um prefixo/glob — por
 * isso cada navegação sob teste usa sua própria chamada.
 *
 * Isto substitui duas versões anteriores: gate temporário na página
 * (Fase 4, deixava código de teste em produção até reverter à mão) e
 * revogar o GRANT da tabela no banco (DDL GLOBAL, derrubava a tabela
 * pra todo mundo, não sobrevivia a SIGKILL/queda de conexão/execução
 * concorrente).
 */
async function comFalhaInjetada<T>(page: Page, recurso: string, urlAlvo: string, corpo: () => Promise<T>): Promise<T> {
  const handler = async (route: Route) => {
    const req = route.request();
    if (req.resourceType() === "document" && req.url() === urlAlvo) {
      await route.continue({ headers: { ...req.headers(), "x-ruptura-falha-recurso": recurso, "x-ruptura-falha-segredo": FALHA_SEGREDO } });
    } else {
      await route.continue();
    }
  };
  await page.route("**/*", handler);
  try {
    return await corpo();
  } finally {
    await page.unroute("**/*", handler);
  }
}

/**
 * Monitor de vazamento — fica ligado do início ao fim das cenas de
 * injeção (10/10b/11/12) e grava toda requisição, de qualquer origem,
 * cujos headers efetivamente carregassem o segredo. Critério 13 lê
 * este array: deveria conter SÓ as URLs exatas que cada
 * `comFalhaInjetada` mirou, e NUNCA uma origem diferente de `BASE_URL`
 * — prova empírica, não só "o código não deveria vazar por
 * construção".
 */
const requisicoesComSegredo: string[] = [];
function monitorarVazamentoDeSegredo(page: Page): void {
  // `requestfinished`, não `request`: checado empiricamente (script
  // descartável, não sobrou no repositório) — o evento `request` expõe
  // SEMPRE os headers como o page pediu originalmente, nunca a
  // sobreposição de `route.continue({ headers })`, nem via `headers()`
  // síncrono nem via `allHeaders()` assíncrono. Só `requestfinished` +
  // `allHeaders()` reflete os headers de fato enviados.
  page.on("requestfinished", (req) => {
    void req.allHeaders().then((h) => {
      if (h["x-ruptura-falha-segredo"] === FALHA_SEGREDO) {
        requisicoesComSegredo.push(req.url());
      }
    });
  });
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
    campaignId = hrefs.map((h) => h.match(/^\/mesas\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i)?.[1]).find(Boolean) ?? null;
    if (!campaignId) {
      registrar("0 (campanha de teste)", false, "nenhuma campanha encontrada em /mesas para esta conta");
      return;
    }
    registrar("0 (campanha de teste)", true, `usando ${campaignId}`);

    await configurarFixture();
    registrar("0b (jogador fixture membro da campanha)", true, `jogador ${jogadorId}`);

    await criarCapituloFixture();
    registrar("0c (capítulo publicado para exercitar o Livro)", true, `capítulo ${capituloId}`);

    // Erros contados só a partir daqui — `/mesas` (o dashboard, visitado
    // acima só pra descobrir um id) tem um 404 pré-existente e alheio a
    // esta reestrutura (`_global/parts.tsx` pede `.png`, o arquivo é
    // `.jpg`). Mesmo padrão dos checks das fases anteriores.
    const errosNarrador: string[] = [];
    narradorPage.on("console", (m) => { if (erroRelevante(m)) errosNarrador.push(m.text().slice(0, 200)); });
    // Ligado do início ao fim — cobre também as rotas visitadas ANTES
    // das cenas de injeção (1-9), pra provar que o segredo não circula
    // em requisição nenhuma fora dos alvos exatos de 10/10b/11/12.
    monitorarVazamentoDeSegredo(narradorPage);

    // --- 1. Conteúdo da campanha: tabela densa rm-* e zero hex ---
    await narradorPage.goto(`${BASE_URL}/mesas/${campaignId}/biblioteca`, { waitUntil: "networkidle" });
    {
      const temTabela = (await narradorPage.locator('[data-testid="biblioteca-tabela"].rm-table').count()) > 0;
      const temFiltro = (await narradorPage.locator("select.rm-select").count()) > 0;
      const temBotaoNovo = (await narradorPage.locator('[data-testid="biblioteca-toggle-novo"].rm-btn').count()) > 0;
      // Hex hardcoded no HTML SERVIDO (atributos `style`), não no CSS —
      // é exatamente o que o critério da Fase 5 proíbe nesta tela.
      const hexInline = await narradorPage.evaluate(() => {
        const comStyle = [...document.querySelectorAll("[style]")];
        return comStyle.map((el) => el.getAttribute("style") ?? "").filter((s) => /#[0-9a-fA-F]{3,8}\b/.test(s)).slice(0, 5);
      });
      registrar(
        "1 (Conteúdo da campanha: tabela rm-* e sem hex inline)",
        temTabela && temFiltro && temBotaoNovo && hexInline.length === 0,
        `rm-table=${temTabela}, rm-select=${temFiltro}, rm-btn novo=${temBotaoNovo}, styles com hex=${JSON.stringify(hexInline)}`,
      );
    }

    // --- 2. Livro: busca rm-input, lista plana rm-doclist, filtro real ---
    // Com o capítulo fixture publicado, o caminho da LISTA é sempre
    // exercitado — nunca cai no estado vazio e passa por omissão.
    await narradorPage.goto(`${BASE_URL}/mesas/${campaignId}/livro`, { waitUntil: "networkidle" });
    {
      const temBusca = (await narradorPage.locator('[data-testid="livro-busca"].rm-input').count()) > 0;
      const temFixture = (await narradorPage.locator(`[data-testid="livro-capitulo-${CAPITULO_SLUG}"].rm-doclist-item`).count()) > 0;

      await narradorPage.locator('[data-testid="livro-busca"]').fill("zzz-nao-existe-zzz");
      await narradorPage.waitForTimeout(300);
      const semMatch = await narradorPage.locator(".rm-doclist-item").count();
      const mostrouVazio = (await narradorPage.locator('[data-testid="livro-busca-vazia"]').count()) > 0;

      await narradorPage.locator('[data-testid="livro-busca"]').fill("Fixture Fase 5");
      await narradorPage.waitForTimeout(300);
      const comMatch = await narradorPage.locator(".rm-doclist-item").count();

      registrar(
        "2 (Livro: busca rm-input, lista plana rm-doclist, filtro real nos dois sentidos)",
        temBusca && temFixture && semMatch === 0 && mostrouVazio && comMatch >= 1,
        `busca rm-input=${temBusca}, capítulo fixture como rm-doclist-item=${temFixture}, busca sem match→${semMatch} itens (estado vazio=${mostrouVazio}), busca com match→${comMatch} itens`,
      );
    }

    // --- 2b. Leitura do capítulo: prosa com medida de leitura ---
    await narradorPage.goto(`${BASE_URL}/mesas/${campaignId}/livro/${CAPITULO_SLUG}`, { waitUntil: "networkidle" });
    {
      const temProse = (await narradorPage.locator("main.rm-prose").count()) > 0;
      const temTitulo = (await narradorPage.locator(`h1.rm-page-title:has-text("${CAPITULO_NOME}")`).count()) > 0;
      const temCorpo = (await narradorPage.locator('[data-testid="livro-bloco-entidade-b1"], main.rm-prose p').count()) > 0;
      const cascaPresente = (await narradorPage.locator(".rm-navrail").count()) > 0;
      registrar(
        "2b (capítulo abre em prosa rm-prose, sob a casca)",
        temProse && temTitulo && temCorpo && cascaPresente,
        `main.rm-prose=${temProse}, título correto=${temTitulo}, corpo renderizado=${temCorpo}, trilho montado=${cascaPresente}`,
      );
    }

    // --- 3. Jogadores e convites em rm-* ---
    await narradorPage.goto(`${BASE_URL}/mesas/${campaignId}/jogadores-e-convites`, { waitUntil: "networkidle" });
    {
      const temTitulo = (await narradorPage.locator("h1.rm-page-title").count()) > 0;
      const temInputEmail = (await narradorPage.locator('[data-testid="det-convite-email"].rm-input').count()) > 0;
      const temBotao = (await narradorPage.locator('[data-testid="det-criar-convite-email"].rm-btn').count()) > 0;
      const membroFixture = (await narradorPage.locator('[data-testid="det-membro"].rm-card').count()) > 0;
      registrar(
        "3 (Jogadores e convites em rm-*)",
        temTitulo && temInputEmail && temBotao && membroFixture,
        `título rm-*=${temTitulo}, input rm-*=${temInputEmail}, botão rm-*=${temBotao}, card de membro rm-*=${membroFixture}`,
      );
    }

    // --- 4. Configurações em rm-* ---
    await narradorPage.goto(`${BASE_URL}/mesas/${campaignId}/configuracoes`, { waitUntil: "networkidle" });
    {
      const temTitulo = (await narradorPage.locator("h1.rm-page-title").count()) > 0;
      const temInput = (await narradorPage.locator('[data-testid="config-nome-campanha"].rm-input').count()) > 0;
      registrar("4 (Configurações em rm-*)", temTitulo && temInput, `título rm-*=${temTitulo}, input rm-*=${temInput}`);
    }

    // --- 7. Estado "não encontrado" com a linguagem da casca ---
    await narradorPage.goto(`${BASE_URL}/mesas/${campaignId}/livro/slug-que-nao-existe-zzz`, { waitUntil: "networkidle" });
    {
      const temBoundary = (await narradorPage.locator("main.rm-boundary").count()) > 0;
      const temTituloHud = (await narradorPage.locator("main.rm-boundary h1.rm-page-title").count()) > 0;
      const cascaPresente = (await narradorPage.locator(".rm-navrail").count()) > 0;
      registrar(
        "7 (not-found do Livro usa rm-boundary, sob a casca)",
        temBoundary && temTituloHud && cascaPresente,
        `main.rm-boundary=${temBoundary}, título HUD=${temTituloHud}, trilho ainda montado=${cascaPresente}`,
      );
    }

    registrar("9a (console limpo — narrador)", errosNarrador.length === 0, errosNarrador.length ? JSON.stringify(errosNarrador.slice(0, 3)) : "nenhum");

    // --- 10. Falha de leitura NO LIVRO não vira "nenhum capítulo" ---
    // Cada `comFalhaInjetada` mira a URL EXATA de UM `goto` — 10 e 10b
    // são chamadas SEPARADAS porque são navegações separadas.
    {
      const urlLivro = `${BASE_URL}/mesas/${campaignId}/livro`;
      await comFalhaInjetada(narradorPage, "livro", urlLivro, () => narradorPage.goto(urlLivro, { waitUntil: "networkidle" }));
      const vazioFalso = (await narradorPage.locator('[data-testid="livro-vazio"]').count()) > 0;
      const mostrouErro = (await narradorPage.locator('main.rm-boundary[role="alert"], main.rm-boundary').count()) > 0;
      const temRetry = (await narradorPage.locator('main.rm-boundary button:has-text("Tentar de novo")').count()) > 0;
      registrar(
        "10 (Livro: falha de leitura vira erro+retry, nunca \"nenhum capítulo publicado\")",
        !vazioFalso && mostrouErro && temRetry,
        `estado vazio falso=${vazioFalso} (esperado false), boundary de erro=${mostrouErro}, botão "Tentar de novo"=${temRetry}`,
      );
    }

    // --- 10b. E o capítulo direto não vira 404 falso ---
    {
      const urlCapitulo = `${BASE_URL}/mesas/${campaignId}/livro/${CAPITULO_SLUG}`;
      await comFalhaInjetada(narradorPage, "livro", urlCapitulo, () => narradorPage.goto(urlCapitulo, { waitUntil: "networkidle" }));
      const virou404 = (await narradorPage.locator('h1:has-text("Capítulo não encontrado")').count()) > 0;
      const mostrouErroCap = (await narradorPage.locator("main.rm-boundary").count()) > 0;
      registrar(
        "10b (capítulo: falha de leitura NÃO vira 404 falso)",
        !virou404 && mostrouErroCap,
        `"Capítulo não encontrado"=${virou404} (esperado false — o capítulo existe, quem falhou foi a leitura), boundary de erro=${mostrouErroCap}`,
      );
    }

    // --- 11. Falha ao listar CONVITES não vira "nenhum convite" ---
    // Aqui a degradação certa é por RECURSO: participantes carregaram e
    // devem continuar na tela; só a seção de convites vira erro+retry.
    {
      const urlConvites = `${BASE_URL}/mesas/${campaignId}/jogadores-e-convites`;
      await comFalhaInjetada(narradorPage, "convites", urlConvites, () => narradorPage.goto(urlConvites, { waitUntil: "networkidle" }));
      const erroConvites = (await narradorPage.locator('[data-testid="jogadores-erro-convites-email"]').count()) > 0;
      const temRetry = (await narradorPage.locator('[data-testid="jogadores-erro-convites-email"] button:has-text("Tentar de novo")').count()) > 0;
      // O recurso QUE CARREGOU continua na tela — prova de que o erro é
      // por recurso e não derrubou a página inteira.
      const membrosPreservados = (await narradorPage.locator('[data-testid="det-membro"]').count()) > 0;
      const erroMembrosIndevido = (await narradorPage.locator('[data-testid="jogadores-erro-membros"]').count()) > 0;
      registrar(
        "11 (Convites: falha vira erro+retry por recurso, participantes preservados)",
        erroConvites && temRetry && membrosPreservados && !erroMembrosIndevido,
        `banner de convites=${erroConvites}, retry=${temRetry}, participantes ainda na tela=${membrosPreservados} (esperado true), banner de membros indevido=${erroMembrosIndevido} (esperado false)`,
      );
    }

    // --- Jogador fixture ---
    const ctxJogador = await contextoJogador();
    const jogadorPage = await ctxJogador.newPage();
    const errosJogador: string[] = [];
    jogadorPage.on("console", (m) => { if (erroRelevante(m)) errosJogador.push(m.text().slice(0, 200)); });

    // --- 12. A seam NÃO dispara com segredo errado ---
    // Sem isto, "os critérios 10/11 passaram" provaria só que a falha
    // acontece — não que ela exige o segredo. Um header adivinhável
    // seria uma forma trivial de derrubar leituras. Mesmo mecanismo
    // escopado por URL de 10/11 (não `setExtraHTTPHeaders`), só com o
    // valor do segredo errado.
    {
      const urlLivro = `${BASE_URL}/mesas/${campaignId}/livro`;
      const handler = async (route: Route) => {
        const req = route.request();
        if (req.resourceType() === "document" && req.url() === urlLivro) {
          await route.continue({ headers: { ...req.headers(), "x-ruptura-falha-recurso": "livro", "x-ruptura-falha-segredo": "segredo-errado-de-proposito" } });
        } else {
          await route.continue();
        }
      };
      await narradorPage.route("**/*", handler);
      await narradorPage.goto(urlLivro, { waitUntil: "networkidle" });
      await narradorPage.unroute("**/*", handler);

      const caiuNoErro = (await narradorPage.locator("main.rm-boundary").count()) > 0;
      const carregouNormal = (await narradorPage.locator(`[data-testid="livro-capitulo-${CAPITULO_SLUG}"]`).count()) > 0;
      registrar(
        "12 (seam de injeção exige o segredo — header sozinho não derruba leitura)",
        !caiuNoErro && carregouNormal,
        `com segredo errado: boundary de erro=${caiuNoErro} (esperado false), Livro carregou normalmente=${carregouNormal} (esperado true)`,
      );
    }

    // --- 13. O segredo NUNCA saiu do host local nem de fora das 3 URLs alvo ---
    // Lê `requisicoesComSegredo`, alimentado por `monitorarVazamentoDeSegredo`
    // desde antes da rota 1 — cobre TODA a navegação do narrador, não só
    // a janela das cenas de injeção. Prova empírica de que o mecanismo
    // baseado em `page.route()` não vazou o header pra nenhum request
    // fora do documento exato que cada critério mirou — nem outra rota
    // local, nem (o que a auditoria pediu explicitamente) outra origem.
    {
      // `allHeaders()` é assíncrono (ver `monitorarVazamentoDeSegredo`) —
      // dá um instante pras resoluções pendentes assentarem antes de ler
      // o array. Todo tráfego relevante já terminou (as navegações
      // usaram `networkidle`), então isto é folga, não uma corrida real.
      await narradorPage.waitForTimeout(500);
      const urlsEsperadas = new Set([
        `${BASE_URL}/mesas/${campaignId}/livro`,
        `${BASE_URL}/mesas/${campaignId}/livro/${CAPITULO_SLUG}`,
        `${BASE_URL}/mesas/${campaignId}/jogadores-e-convites`,
      ]);
      const foraDoHostLocal = requisicoesComSegredo.filter((u) => !u.startsWith(BASE_URL));
      const foraDasUrlsAlvo = requisicoesComSegredo.filter((u) => u.startsWith(BASE_URL) && !urlsEsperadas.has(u));
      registrar(
        "13 (segredo nunca vazou pra fora do host local nem das URLs alvo)",
        foraDoHostLocal.length === 0 && foraDasUrlsAlvo.length === 0 && requisicoesComSegredo.length > 0,
        `total de requisições com o header=${requisicoesComSegredo.length} (esperado >0 — senão o monitor não capturou nada de útil), fora do host local=${JSON.stringify(foraDoHostLocal)} (esperado []), mesmo host mas fora das URLs alvo=${JSON.stringify(foraDasUrlsAlvo)} (esperado [])`,
      );
    }

    // --- 5. Rotas administrativas recusam no SERVIDOR pro jogador ---
    {
      const rotas = ["biblioteca", "jogadores-e-convites", "configuracoes"];
      const resultados: string[] = [];
      let todasRecusadas = true;
      for (const rota of rotas) {
        await jogadorPage.goto(`${BASE_URL}/mesas/${campaignId}/${rota}`, { waitUntil: "networkidle" });
        const recusou = (await jogadorPage.locator('[data-testid="narrator-only-denied"]').count()) > 0;
        // Não basta recusar: não pode ter vazado o conteúdo administrativo.
        const vazouTabela = (await jogadorPage.locator('[data-testid="biblioteca-tabela"]').count()) > 0;
        const vazouConvite = (await jogadorPage.locator('[data-testid="det-convite-email"]').count()) > 0;
        const vazouConfig = (await jogadorPage.locator('[data-testid="config-nome-campanha"]').count()) > 0;
        const ok = recusou && !vazouTabela && !vazouConvite && !vazouConfig;
        if (!ok) todasRecusadas = false;
        resultados.push(`${rota}: recusa=${recusou}, vazou conteúdo=${vazouTabela || vazouConvite || vazouConfig}`);
      }
      registrar("5 (jogador é recusado no servidor nas 3 rotas administrativas)", todasRecusadas, resultados.join(" | "));
    }

    // --- 6. Livro continua acessível ao jogador ---
    await jogadorPage.goto(`${BASE_URL}/mesas/${campaignId}/livro`, { waitUntil: "networkidle" });
    {
      const recusou = (await jogadorPage.locator('[data-testid="narrator-only-denied"]').count()) > 0;
      const temTitulo = (await jogadorPage.locator("h1.rm-page-title").count()) > 0;
      registrar(
        "6 (Livro é leitura dos DOIS papéis — jogador não é recusado)",
        !recusou && temTitulo,
        `recusado=${recusou} (esperado false), título presente=${temTitulo}`,
      );
    }

    registrar("9b (console limpo — jogador)", errosJogador.length === 0, errosJogador.length ? JSON.stringify(errosJogador.slice(0, 3)) : "nenhum");

    // --- 8. Remover participante atualiza o roster DA CASCA na hora ---
    // Regressão do bug corrigido nesta fase. Sem `reloadMembers()` do
    // provider, o painel de sessão seguia listando quem acabou de sair.
    // De propósito NÃO dispara `focus`/`visibilitychange`: esses já
    // recarregariam o roster por outro caminho e mascarariam a falha.
    {
      await narradorPage.goto(`${BASE_URL}/mesas/${campaignId}/jogadores-e-convites`, { waitUntil: "networkidle" });
      await narradorPage.locator('[data-testid="session-tab-participantes"]').click();
      await narradorPage.waitForTimeout(800);

      const nomeFixture = "Fixture Fase 5";
      const noRosterAntes = (await narradorPage.locator(`[data-testid="session-roster-item"]:has-text("${nomeFixture}")`).count()) > 0;

      narradorPage.once("dialog", (d) => d.accept());
      await narradorPage.locator(`[data-testid="det-remover-participante-${jogadorId}"]`).click();
      await narradorPage.waitForTimeout(2000);

      const noRosterDepois = (await narradorPage.locator(`[data-testid="session-roster-item"]:has-text("${nomeFixture}")`).count()) > 0;
      const sumiuDaTela = (await narradorPage.locator(`[data-testid="det-remover-participante-${jogadorId}"]`).count()) === 0;

      registrar(
        "8 (remover participante atualiza o roster da casca sem reload)",
        noRosterAntes && !noRosterDepois && sumiuDaTela,
        `no roster do painel ANTES=${noRosterAntes} (esperado true), DEPOIS=${noRosterDepois} (esperado false — sem focus/reload, só o reloadMembers() do provider), sumiu da lista da tela=${sumiuDaTela}`,
      );
      // A remoção acima já desativou o vínculo; a limpeza abaixo continua
      // apagando a linha e a conta.
    }

    await ctxJogador.browser()?.close();
  });
}

async function limpar(): Promise<void> {
  const falhas: string[] = [];
  if (capituloId) {
    const { error } = await admin.from("campaign_content_documents").delete().eq("id", capituloId);
    if (error) falhas.push(`campaign_content_documents ${capituloId}: ${error.message}`);
  }
  if (membroAdicionado && campaignId && jogadorId) {
    const { error } = await admin.from("campaign_members").delete().eq("campaign_id", campaignId).eq("user_id", jogadorId);
    if (error) falhas.push(`campaign_members de ${jogadorId}: ${error.message}`);
  }
  if (jogadorId) {
    const { error } = await admin.auth.admin.deleteUser(jogadorId);
    if (error) falhas.push(`auth.users ${jogadorId}: ${error.message}`);
  }
  if (jogadorId || capituloId) {
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
