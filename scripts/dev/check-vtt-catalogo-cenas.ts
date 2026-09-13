/**
 * O ACEITE DA FASE 2, verificado na mesa real.
 *
 * "O narrador troca de cena sem mover os jogadores." Essa frase é uma
 * afirmação sobre DUAS coisas ao mesmo tempo — a tela dele e a linha
 * `vtt_campaign_stage.presented_scene_id` — e só vale se as duas forem
 * conferidas juntas. Um check que olhasse só a tela passaria mesmo se
 * o palco tivesse se movido junto; um que olhasse só o banco passaria
 * mesmo se o narrador não tivesse saído do lugar.
 *
 * Por isso cada critério de troca de cena confere o banco DEPOIS de
 * confirmar o que a tela mostra.
 *
 * Monta a própria campanha descartável com service role (mesmo padrão
 * de `check-vtt-janelas-ferramenta.ts`) e apaga tudo no fim, inclusive
 * quando falha.
 *
 * Uso: npx tsx scripts/dev/check-vtt-catalogo-cenas.ts
 *      (precisa do `npm run dev` rodando)
 */

import { randomUUID } from "node:crypto";
import { config as loadDotenv } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { chromium, type Page } from "playwright";
import { BASE_URL } from "./authSession";

loadDotenv({ path: ".env.local" });

function requireEnv(nome: string): string {
  const v = process.env[nome];
  if (!v) { console.error(`Variável de ambiente ausente: ${nome}`); process.exit(1); }
  return v;
}
const supabaseUrl = requireEnv("SUPABASE_URL");
const anonKey = requireEnv("SUPABASE_ANON_KEY");
const admin = createClient(supabaseUrl, requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false, autoRefreshToken: false },
});

let passou = 0;
let falhou = 0;
function criterio(nome: string, ok: boolean, detalhe = "") {
  if (ok) { passou++; console.log(`  ok   ${nome}`); }
  else { falhou++; console.log(`  FALHA ${nome}${detalhe ? ` — ${detalhe}` : ""}`); }
}

/**
 * Espera o BANCO chegar no estado esperado, com teto.
 *
 * Reordenar é otimista: a tela troca no mesmo frame do clique e a RPC
 * ainda está em voo. Ler o banco logo depois de ver a tela mudar não
 * mede a persistência, mede a corrida — e foi exatamente o que a
 * primeira versão deste check fez, acusando um bug que não existia.
 */
async function esperarBanco<T>(ler: () => Promise<T>, ok: (v: T) => boolean, ms = 8000): Promise<T> {
  const limite = Date.now() + ms;
  let ultimo = await ler();
  while (!ok(ultimo) && Date.now() < limite) {
    await new Promise((r) => setTimeout(r, 150));
    ultimo = await ler();
  }
  return ultimo;
}

/** A cena onde os JOGADORES estão, lida do banco e não da tela. */
async function palcoDoBanco(campaignId: string): Promise<string | null> {
  const { data } = await admin.from("vtt_campaign_stage")
    .select("presented_scene_id").eq("campaign_id", campaignId).maybeSingle();
  return (data?.presented_scene_id as string | undefined) ?? null;
}

function cartao(page: Page, nome: string) {
  return page.locator('[data-testid="cena-cartao"]').filter({ hasText: nome });
}

async function nomesNaOrdem(page: Page): Promise<string[]> {
  return page.locator('[data-testid="cena-cartao"] .rv-cena-nome, [data-testid="cena-cartao"] .rv-cena-campo')
    .allTextContents();
}

async function main() {
  const email = `check-catalogo-${Date.now()}@ruptura.dev`;
  const senha = randomUUID();
  const { data: userData, error: userErr } = await admin.auth.admin.createUser({
    email, password: senha, email_confirm: true, user_metadata: { display_name: "Narradora do Catálogo" },
  });
  if (userErr || !userData.user) throw new Error(`criar conta: ${userErr?.message}`);
  const narradorId = userData.user.id;

  const campaignId = randomUUID();
  const { error: eCamp } = await admin.from("campaigns")
    .insert({ id: campaignId, name: "Catálogo de cenas", owner_id: narradorId });
  if (eCamp) throw new Error(`criar campanha: ${eCamp.message}`);

  // Três cenas em ordem conhecida — duas bastariam para a troca, mas
  // reordenar precisa de um meio para provar que a lista inteira foi
  // renumerada, e não só as duas pontas trocadas.
  const { data: cenas, error: eCenas } = await admin.from("vtt_scenes").insert([
    { campaign_id: campaignId, nome: "Doca Norte", largura: 20, altura: 16, ordem: 0, ativa: true },
    // `ativa` é o espelho LEGADO do palco (0111) e continua not-null:
    // só a cena apresentada é `true`.
    { campaign_id: campaignId, nome: "Casa de Máquinas", largura: 20, altura: 16, ordem: 1, ativa: false },
    { campaign_id: campaignId, nome: "Ponte Quebrada", largura: 20, altura: 16, ordem: 2, ativa: false },
  ]).select("id, nome, ordem");
  if (eCenas || !cenas) throw new Error(`criar cenas: ${eCenas?.message}`);
  const porNome = new Map(cenas.map((c) => [c.nome as string, c.id as string]));
  const doca = porNome.get("Doca Norte")!;
  const maquinas = porNome.get("Casa de Máquinas")!;

  // O palco começa na Doca — é onde os jogadores estão, e é a linha que
  // NÃO pode se mexer quando o narrador abre outra cena.
  const { error: ePalco } = await admin.from("vtt_campaign_stage")
    .insert({ campaign_id: campaignId, presented_scene_id: doca, updated_by: narradorId });
  if (ePalco) throw new Error(`criar palco: ${ePalco.message}`);

  const anon = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: sessao, error: eLogin } = await anon.auth.signInWithPassword({ email, password: senha });
  if (eLogin || !sessao.session) throw new Error(`login: ${eLogin?.message}`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 950 } });
  await context.addCookies([{
    name: "ruptura_auth",
    value: JSON.stringify({ access_token: sessao.session.access_token, refresh_token: sessao.session.refresh_token }),
    domain: "localhost", path: "/", httpOnly: true, secure: false, sameSite: "Lax",
    expires: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7,
  }]);
  const page = await context.newPage();

  try {
    await page.goto(`${BASE_URL}/mesas/${campaignId}/vtt`, { waitUntil: "networkidle" });
    await page.waitForSelector('[data-testid="painel-vtt"]', { timeout: 20000 });

    console.log("\n— A janela —");
    const botao = page.locator('[data-testid="barra-cenas"]');
    criterio("o narrador tem o botão do catálogo", await botao.count() === 1);
    await botao.click();
    await page.waitForSelector('[data-testid="janela-cenas"]', { timeout: 5000 });
    criterio("a janela abre", await page.locator('[data-testid="janela-cenas"]').isVisible());

    await page.waitForSelector('[data-testid="cenas-lista"]', { timeout: 5000 });
    criterio("lista as três cenas", (await nomesNaOrdem(page)).length === 3);
    criterio("na ordem do catálogo",
      JSON.stringify(await nomesNaOrdem(page)) === JSON.stringify(["Doca Norte", "Casa de Máquinas", "Ponte Quebrada"]),
      await nomesNaOrdem(page).then((n) => n.join(" | ")));

    console.log("\n— Os dois selos, que é o ponto da fase —");
    criterio('a Doca mostra "Jogadores aqui"',
      await cartao(page, "Doca Norte").locator('.rv-cena-selo[data-tipo="mesa"]').count() === 1);
    criterio('a Doca mostra "Você está aqui" (entrou pelo palco)',
      await cartao(page, "Doca Norte").locator('.rv-cena-selo[data-tipo="vista"]').count() === 1);

    console.log("\n— Trocar de cena SEM mover a mesa —");
    await cartao(page, "Casa de Máquinas").locator('[data-testid="cena-abrir"]').click();
    await page.waitForFunction(
      () => document.querySelectorAll('[data-testid="cena-cartao"][data-vista]').length === 1
        && (document.querySelector('[data-testid="cena-cartao"][data-vista]') as HTMLElement)
            ?.textContent?.includes("Casa de Máquinas"),
      undefined, { timeout: 10000 },
    );
    criterio('"Você está aqui" foi para a Casa de Máquinas',
      await cartao(page, "Casa de Máquinas").locator('.rv-cena-selo[data-tipo="vista"]').count() === 1);
    criterio('"Jogadores aqui" FICOU na Doca',
      await cartao(page, "Doca Norte").locator('.rv-cena-selo[data-tipo="mesa"]').count() === 1);
    criterio("o título da mesa mostra a cena aberta",
      (await page.textContent("body"))?.includes("Casa de Máquinas") === true);

    // O retrato da fase: os dois selos em cartões DIFERENTES. Fica em
    // `.artefatos-visuais/` como os demais checks visuais do VTT.
    await page.locator('[data-testid="janela-cenas"]')
      .screenshot({ path: "scripts/dev/.artefatos-visuais/catalogo-cenas.png" });

    const palcoDepois = await palcoDoBanco(campaignId);
    criterio("o PALCO no banco não se moveu", palcoDepois === doca,
      `esperado ${doca}, veio ${palcoDepois}`);

    console.log("\n— A memória da cena aberta —");
    const lembrada = await page.evaluate((id) => window.localStorage.getItem(`ruptura:vtt:last-scene:${id}`), campaignId);
    criterio("localStorage guardou a cena aberta", lembrada === maquinas, `veio ${lembrada}`);

    await page.reload({ waitUntil: "networkidle" });
    await page.waitForSelector('[data-testid="painel-vtt"]', { timeout: 20000 });
    criterio("recarregar volta na cena que ele preparava",
      (await page.textContent("body"))?.includes("Casa de Máquinas") === true);
    criterio("e o palco continua onde estava", await palcoDoBanco(campaignId) === doca);

    console.log("\n— Criar —");
    await page.locator('[data-testid="barra-cenas"]').click();
    await page.waitForSelector('[data-testid="cenas-lista"]', { timeout: 5000 });
    await page.locator('[data-testid="cena-nova"]').click();
    await page.locator('[data-testid="cena-nova-nome"]').fill("Porão Alagado");
    await page.locator('[data-testid="cena-nova-confirmar"]').click();
    await page.waitForFunction(
      () => document.body.textContent?.includes("Porão Alagado") === true,
      undefined, { timeout: 10000 },
    );
    criterio("a cena nova entra no fim da lista",
      (await nomesNaOrdem(page))[3] === "Porão Alagado", (await nomesNaOrdem(page)).join(" | "));
    criterio("criar não mexeu no palco", await palcoDoBanco(campaignId) === doca);
    criterio("criar não abriu a cena nova (ainda na Casa de Máquinas)",
      await cartao(page, "Casa de Máquinas").locator('.rv-cena-selo[data-tipo="vista"]').count() === 1);

    console.log("\n— Renomear —");
    const pontoId = porNome.get("Ponte Quebrada")!;
    // Pelo ID, e não pelo texto: clicar no lápis troca o nome por um
    // `<input>`, e um filtro por texto deixaria de casar exatamente no
    // passo seguinte.
    const cartaoPonte = page.locator(`[data-cena-id="${pontoId}"]`);
    await cartaoPonte.locator('[data-testid="cena-renomear"]').click();
    const campo = cartaoPonte.locator('[data-testid="cena-campo-nome"]');
    await campo.fill("Ponte Partida");
    await campo.press("Enter");
    await page.waitForFunction(
      () => document.body.textContent?.includes("Ponte Partida") === true,
      undefined, { timeout: 10000 },
    );
    const { data: renomeada } = await admin.from("vtt_scenes")
      .select("nome").eq("id", pontoId).single();
    criterio("o nome novo chegou ao banco", renomeada?.nome === "Ponte Partida", `veio ${renomeada?.nome}`);

    console.log("\n— Reordenar —");
    const antes = await nomesNaOrdem(page);
    await cartao(page, "Doca Norte").locator('button[aria-label^="Mover"][aria-label*="baixo"]').click();
    await page.waitForFunction(
      (primeiro) => document.querySelector('[data-testid="cena-cartao"] .rv-cena-nome')?.textContent !== primeiro,
      antes[0], { timeout: 10000 },
    );
    const depois = await nomesNaOrdem(page);
    criterio("a Doca desceu uma posição na tela", depois[1] === "Doca Norte", depois.join(" | "));
    const ordens = await esperarBanco(
      async () => (await admin.from("vtt_scenes")
        .select("nome, ordem").eq("campaign_id", campaignId).order("ordem")).data ?? [],
      (o) => o[1]?.nome === "Doca Norte",
    );
    criterio("a ordem nova chegou ao banco",
      ordens[1]?.nome === "Doca Norte",
      ordens.map((o) => `${o.ordem}:${o.nome}`).join(" | "));
    criterio("reordenar não mexeu no palco", await palcoDoBanco(campaignId) === doca);

    console.log("\n— Duas reordenações atropeladas —");
    // Dois cliques sem esperar resposta, e no fim banco e tela têm que
    // contar a mesma história.
    //
    // O que este critério PROVA: que a sequência converge. O que ele
    // NÃO prova: que a fila do `GerenciadorCenas` é o que faz isso —
    // desligando a fila, três rodadas passaram igual, porque o Next
    // aparentemente já serializa Server Actions do mesmo cliente. Fica
    // como guarda de convergência, não como teste da fila.
    const setaDescer = 'button[aria-label^="Mover"][aria-label*="baixo"]';
    // A primeira da lista: é a única com DUAS posições pra descer, e o
    // teste precisa de dois cliques válidos em sequência.
    const alvoRapido = cartao(page, "Casa de Máquinas");
    await alvoRapido.locator(setaDescer).click();
    await alvoRapido.locator(setaDescer).click();
    const naTela = await nomesNaOrdem(page);
    const noBanco = await esperarBanco(
      async () => ((await admin.from("vtt_scenes")
        .select("nome, ordem").eq("campaign_id", campaignId).order("ordem")).data ?? [])
        .map((o) => o.nome as string),
      (b) => JSON.stringify(b) === JSON.stringify(naTela),
    );
    criterio("banco e tela terminam na MESMA ordem",
      JSON.stringify(noBanco) === JSON.stringify(naTela),
      `tela [${naTela.join(" | ")}] banco [${noBanco.join(" | ")}]`);

    console.log("\n— Quando a Server Action REJEITA —");
    // Uma ação que rejeita (em vez de devolver `{ok:false}`) não passa
    // pelo caminho de erro normal. Sem `catch`, o botão voltaria do
    // "salvando" e nada explicaria por que a cena não apareceu. Aqui a
    // rede é cortada de propósito pra forçar exatamente esse caso.
    await page.route("**/mesas/**", (rota) => {
      if (rota.request().method() === "POST") return rota.abort("failed");
      return rota.continue();
    });
    await page.locator('[data-testid="cena-nova"]').click();
    await page.locator('[data-testid="cena-nova-nome"]').fill("Cena Que Não Nasce");
    await page.locator('[data-testid="cena-nova-confirmar"]').click();
    let erroVisivel = false;
    try {
      await page.waitForSelector('[data-testid="cenas-erro"]', { timeout: 10000 });
      erroVisivel = true;
    } catch { /* segue como falha */ }
    criterio("a rejeição vira mensagem na janela", erroVisivel);
    criterio("e o botão de criar volta a responder",
      await page.locator('[data-testid="cena-nova-confirmar"]').isEnabled());
    await page.unroute("**/mesas/**");

    console.log("\n— O jogador —");
    // O catálogo é do narrador. Não é a UI que garante (é
    // `list_vtt_scenes` que não conta), mas a UI tem que concordar.
    const emailJogador = `check-catalogo-jogador-${Date.now()}@ruptura.dev`;
    const senhaJogador = randomUUID();
    const { data: jog } = await admin.auth.admin.createUser({
      email: emailJogador, password: senhaJogador, email_confirm: true,
      user_metadata: { display_name: "Jogador" },
    });
    await admin.from("campaign_members").insert({ campaign_id: campaignId, user_id: jog!.user!.id, role: "player" });
    const { data: sJog } = await anon.auth.signInWithPassword({ email: emailJogador, password: senhaJogador });
    const ctxJog = await browser.newContext({ viewport: { width: 1440, height: 950 } });
    await ctxJog.addCookies([{
      name: "ruptura_auth",
      value: JSON.stringify({ access_token: sJog!.session!.access_token, refresh_token: sJog!.session!.refresh_token }),
      domain: "localhost", path: "/", httpOnly: true, secure: false, sameSite: "Lax",
      expires: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7,
    }]);
    const pageJog = await ctxJog.newPage();
    await pageJog.goto(`${BASE_URL}/mesas/${campaignId}/vtt`, { waitUntil: "networkidle" });
    await pageJog.waitForSelector('[data-testid="painel-vtt"]', { timeout: 20000 });
    criterio("o jogador não tem o botão do catálogo",
      await pageJog.locator('[data-testid="barra-cenas"]').count() === 0);
    criterio("e continua na cena apresentada, não na do narrador",
      (await pageJog.textContent("body"))?.includes("Doca Norte") === true);
    await ctxJog.close();

    console.log(`\n${passou} critérios ok, ${falhou} falhas`);
  } finally {
    await browser.close();
    await admin.from("table_logs").delete().eq("campaign_id", campaignId);
    await admin.from("vtt_campaign_stage").delete().eq("campaign_id", campaignId);
    await admin.from("vtt_tokens").delete().eq("campaign_id", campaignId);
    await admin.from("campaign_members").delete().eq("campaign_id", campaignId);
    await admin.from("vtt_scenes").delete().eq("campaign_id", campaignId);
    await admin.from("campaigns").delete().eq("id", campaignId);
    await admin.auth.admin.deleteUser(narradorId);
    const { data: sobras } = await admin.auth.admin.listUsers();
    for (const u of sobras?.users ?? []) {
      if (u.email?.startsWith("check-catalogo-")) await admin.auth.admin.deleteUser(u.id);
    }
    console.log("limpeza ok");
  }
  if (falhou > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
