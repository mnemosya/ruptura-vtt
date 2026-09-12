/**
 * INTEGRAÇÃO ficha ↔ mesa — o que precisa atravessar a fronteira.
 *
 * Cada critério aqui trava uma coisa que morria de um lado só: uma
 * rolagem feita no Console que a mesa nunca via, um PV que o mapa
 * mostrava diferente da ficha, uma janela de turno que a ficha nunca
 * recebia. São propriedades de PRODUTO, não de componente — por isso
 * a verificação olha o banco (o que a mesa toda vê), e não só a tela.
 *
 * Uso: npx tsx scripts/dev/check-ficha-mesa-integracao.ts
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

let passou = 0, falhou = 0;
function ok(criterio: string, cond: boolean, detalhe: string) {
  if (cond) { passou++; console.log(`ok - ${criterio}: ${detalhe}`); }
  else { falhou++; console.error(`FALHA - ${criterio}: ${detalhe}`); }
}

/** Espera o `table_logs` da campanha ter `quantas` rolagens publicadas. */
async function esperarRolagens(campaignId: string, quantas: number, timeoutMs = 15000) {
  const fim = Date.now() + timeoutMs;
  let linhas: { payload: unknown }[] = [];
  while (Date.now() < fim) {
    const { data } = await admin
      .from("table_logs").select("payload")
      .eq("campaign_id", campaignId).eq("type", "rolagem_pericia");
    linhas = data ?? [];
    if (linhas.length >= quantas) return linhas;
    await new Promise((r) => setTimeout(r, 200));
  }
  return linhas;
}

/**
 * Aperta "Rolar" na ferramenta e espera o resultado aparecer.
 *
 * Os d8 são corpos rígidos de verdade caindo na mesa: entre o clique e
 * o número existe a física, que não tem duração fixa. Esperar a faixa
 * de resultado é esperar a rolagem TERMINAR — nunca um relógio.
 */
async function rolarNoPainel(page: Page) {
  await page.locator('[data-testid="console-painel-rolagem"] button', { hasText: /Rolar/ }).first().click();
  await page.locator('[data-testid="console-roll-total"]').waitFor({ timeout: 30000 });
}

/**
 * Fecha a ferramenta pelo X — ela não tem backdrop pra clicar fora: é
 * janela flutuante, e o Console atrás segue clicável.
 */
async function fecharPainel(page: Page) {
  await page.locator('button[aria-label="Fechar rolagem"]').click();
  await page.waitForSelector('[data-testid="console-painel-rolagem"]', { state: "detached", timeout: 5000 });
}

/** Abre o Console do personagem pela página Personagens da campanha. */
async function abrirConsole(page: Page, campaignId: string, characterId: string) {
  await page.goto(`${BASE_URL}/mesas/${campaignId}/personagens`, { waitUntil: "networkidle" });
  await page.locator(`[data-testid="personagens-abrir-ficha-${characterId}"]`).click();
  await page.waitForSelector('[data-testid="console-window"]', { timeout: 60000 });
}

async function main() {
  const email = `check-integra-${Date.now()}@ruptura.dev`;
  const senha = randomUUID();
  const { data, error } = await admin.auth.admin.createUser({
    email, password: senha, email_confirm: true, user_metadata: { display_name: "Narradora Teste" },
  });
  if (error || !data.user) throw new Error(`criar conta: ${error?.message}`);
  const narradorId = data.user.id;
  const campaignId = randomUUID();
  await admin.from("campaigns").insert({ id: campaignId, name: "Integração ficha-mesa", owner_id: narradorId });

  const p1 = randomUUID();
  await admin.from("characters").insert({
    id: p1, name: "Mara Venn", status: "draft", campaign_id: campaignId, owner_id: narradorId,
    payload: {
      nome: "Mara Venn",
      atributos: { corpo: 3, mente: 2, animo: 3 },
      pericias: { balistica: 2, reflexos: 1 },
      metadados: { schema_version: 1 },
    },
  });

  const anon = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: sess, error: eLogin } = await anon.auth.signInWithPassword({ email, password: senha });
  if (eLogin || !sess.session) throw new Error(`login: ${eLogin?.message}`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1600, height: 980 } });
  await context.addCookies([{
    name: "ruptura_auth",
    value: JSON.stringify({ access_token: sess.session.access_token, refresh_token: sess.session.refresh_token }),
    domain: "localhost", path: "/", httpOnly: true, secure: false, sameSite: "Lax",
    expires: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7,
  }]);
  const page = await context.newPage();

  try {
    // ─── A. Rolagem feita no Console chega ao log da MESA ───
    await abrirConsole(page, campaignId, p1);
    await page.waitForTimeout(500);

    const cardPericia = page.locator('[data-testid="console-pericia-balistica"]');
    await cardPericia.waitFor({ timeout: 15000 });
    await cardPericia.click();
    // Clicar numa perícia ABRE a ferramenta já preenchida; quem rola é
    // o botão. Antes o clique rolava sozinho — e não havia como ajustar
    // perícia, modificador, CD ou quem enxerga antes de valer.
    await rolarNoPainel(page);

    // A publicação na mesa é uma ida ao servidor DISPARADA junto da
    // rolagem, não parte dela: a faixa de resultado aparece antes de a
    // linha existir. Esperar o banco é o único jeito honesto de ler.
    const logsRolagem = await esperarRolagens(campaignId, 1);
    const rolagem = logsRolagem[0]?.payload as Record<string, unknown> | undefined;
    ok(
      "A1 (rolar uma perícia no Console grava rolagem_pericia no log da mesa)",
      logsRolagem.length === 1,
      `${logsRolagem.length} entrada(s)`,
    );
    ok(
      "A2 (a rolagem publicada tem o formato que o feed já sabe desenhar)",
      rolagem?.pericia === "Balística" &&
        rolagem?.atributoValor === 3 &&
        Array.isArray(rolagem?.dados) && (rolagem.dados as number[]).length === 3 &&
        typeof rolagem?.total === "number" &&
        rolagem?.source === "console_personagem",
      `pericia=${rolagem?.pericia}, atributoValor=${rolagem?.atributoValor}, dados=${JSON.stringify(rolagem?.dados)}, total=${rolagem?.total}, source=${rolagem?.source}`,
    );

    // ─── A2b. A ferramenta NÃO é modal ───
    // Sem backdrop, o Console segue clicável por baixo: clicar noutra
    // perícia com a rolagem aberta é gesto normal, e a ferramenta tem
    // que REABRIR preenchida com a nova. Um backdrop aqui engoliria o
    // clique, e um painel sem `key` continuaria mostrando a anterior.
    const semBackdrop = await page.evaluate(() => {
      const camada = document.querySelector<HTMLElement>('[data-testid="console-rolagem-camada"]');
      if (!camada) return { existe: false, passaClique: false };
      return { existe: true, passaClique: getComputedStyle(camada).pointerEvents === "none" };
    });
    // A perícia clicada tem que estar FORA do retângulo da janela: a
    // camada não intercepta, mas a própria janela sim — e deve mesmo.
    const alvoLivre = await page.evaluate(() => {
      const janela = document.querySelector('[data-testid="console-painel-rolagem"]')?.getBoundingClientRect();
      // Perícia OU atributo: numa janela estreita a lista de perícias
      // pode ficar inteira debaixo da ferramenta, e o que este critério
      // prova ("o Console recebe o clique e a ferramenta repreenche")
      // vale igual pros dois.
      const cartoes = Array.from(document.querySelectorAll<HTMLElement>(
        '[data-testid^="console-pericia-"], [data-testid^="console-attr-"]',
      ));
      for (const c of cartoes) {
        const r = c.getBoundingClientRect();
        if (r.width === 0 || !janela) continue;
        const cruza = r.left < janela.right && r.right > janela.left && r.top < janela.bottom && r.bottom > janela.top;
        if (!cruza) return c.getAttribute("data-testid");
      }
      return null;
    });
    if (alvoLivre) await page.locator(`[data-testid="${alvoLivre}"]`).click();
    await page.waitForTimeout(400);
    // Perícia clicada preenche o select de perícia; atributo clicado
    // abre "Sem perícia" (valor vazio) e troca o de atributo.
    const ehAtributo = (alvoLivre ?? "").startsWith("console-attr-");
    const esperada = ehAtributo ? "" : (alvoLivre ?? "").replace("console-pericia-", "");
    const selects = page.locator('[data-testid="console-painel-rolagem"] select');
    const periciaNoPainel = await selects.nth(1).inputValue().catch(() => "");
    const atributoNoPainel = await selects.nth(0).inputValue().catch(() => "");
    ok(
      "A2b (a ferramenta não é modal: o Console segue clicável e trocar de perícia repreenche)",
      semBackdrop.existe && semBackdrop.passaClique && !!alvoLivre
        && periciaNoPainel === esperada
        && (!ehAtributo || atributoNoPainel === (alvoLivre ?? "").replace("console-attr-", "")),
      `camada=${JSON.stringify(semBackdrop)}, clicou="${alvoLivre}", atributo="${atributoNoPainel}", perícia="${periciaNoPainel}"`,
    );

    // ─── A2c. A ferramenta ARRASTA — pelo cabeçalho e pela espinha ───
    const janela = page.locator('[data-testid="console-painel-rolagem"]');
    const arrastar = async (de: { x: number; y: number }, dx: number, dy: number) => {
      await page.mouse.move(de.x, de.y);
      await page.mouse.down();
      await page.mouse.move(de.x + dx, de.y + dy, { steps: 6 });
      await page.mouse.up();
      await page.waitForTimeout(150);
    };
    const antesCab = (await janela.boundingBox())!;
    // Cabeçalho: um ponto no título, longe do botão de fechar.
    await arrastar({ x: antesCab.x + 120, y: antesCab.y + 22 }, 60, 40);
    const depoisCab = (await janela.boundingBox())!;
    // Espinha: a barra vertical de 36px na borda esquerda.
    await arrastar({ x: depoisCab.x + 18, y: depoisCab.y + depoisCab.height / 2 }, -40, 30);
    const depoisEsp = (await janela.boundingBox())!;
    const moveu = (a: { x: number; y: number }, b: { x: number; y: number }, dx: number, dy: number) =>
      Math.abs(b.x - a.x - dx) <= 4 && Math.abs(b.y - a.y - dy) <= 4;
    ok(
      "A2c (a ferramenta arrasta pelo cabeçalho E pela espinha)",
      moveu(antesCab, depoisCab, 60, 40) && moveu(depoisCab, depoisEsp, -40, 30),
      `cabeçalho ${JSON.stringify([antesCab.x, antesCab.y])}→${JSON.stringify([depoisCab.x, depoisCab.y])}, espinha →${JSON.stringify([depoisEsp.x, depoisEsp.y])}`,
    );

    await fecharPainel(page);

    // Rolar um ATRIBUTO puro também publica (sem perícia).
    const attrCorpo = page.locator('[data-testid="console-attr-corpo"]').first();
    if (await attrCorpo.count()) {
      await attrCorpo.click();
      await rolarNoPainel(page);
    }
    const logs2 = await esperarRolagens(campaignId, 2);
    const semPericia = logs2.map((l) => (l.payload as Record<string, unknown>).pericia).filter((p) => p === null);
    ok(
      "A3 (rolar um atributo puro publica sem perícia, não inventa uma)",
      semPericia.length === 1,
      `${logs2.length} rolagem(ns) no total, ${semPericia.length} sem perícia`,
    );
    // ─── D. O PV que o mapa desenha é o do PERSONAGEM ───
    // `read_vtt_scene_tokens` (migration 0084) já deriva pv/pv_max e
    // condições do payload do personagem quando o token está vinculado
    // — a coluna `vtt_tokens.pv_atual` só vale pra token solto. Este
    // critério existe pra que isso não regrida em silêncio: bastaria
    // alguém "otimizar" a RPC lendo a coluna pra ficha e mapa
    // divergirem sem nenhum teste reclamar.
    // A cena é semeada na primeira visita ao VTT (`garantirCenaSemente`).
    await page.goto(`${BASE_URL}/mesas/${campaignId}/vtt`, { waitUntil: "networkidle" });
    await page.waitForSelector('[data-testid="painel-vtt"]', { timeout: 20000 });
    const cena = await admin.from("vtt_scenes").select("id").eq("campaign_id", campaignId).limit(1).maybeSingle();
    if (cena.data?.id) {
      const tokenId = randomUUID();
      await admin.from("vtt_tokens").insert({
        id: tokenId, campaign_id: campaignId, scene_id: cena.data.id, character_id: p1,
        nome: "Mara Venn", sigla: "MV", lado: "pj", vertente: "nenhuma",
        q: 0, r: 0, tamanho: "medio", orientacao: 0,
        // Valores DELIBERADAMENTE errados na coluna do token: se o mapa
        // mostrar 99, é porque voltou a ler a cópia em vez do personagem.
        // "sangrando" é uma condição VÁLIDA do enum — o ponto não é
        // enfiar lixo, é pôr na coluna algo que o personagem não tem.
        pv_atual: 99, pv_max: 99, condicoes: ["sangrando"], pv_publico: true,
      });
      // A RPC projeta a partir de `auth.uid()` — chamada com a
      // service_role não há usuário nenhum e ela recusa. Vai pelo
      // cliente autenticado, que é o caminho real do produto.
      const { data: projetado, error: erroProj } = await anon.rpc("read_vtt_scene_tokens", { p_scene_id: cena.data.id });
      const linha = (Array.isArray(projetado) ? projetado : []).find((t: Record<string, unknown>) => t.id === tokenId) as Record<string, unknown> | undefined;
      ok(
        "D1 (token vinculado projeta o PV do personagem, não a cópia da coluna)",
        !erroProj && linha != null && linha.pv_atual !== 99 && linha.pv_max !== 99,
        erroProj ? `RPC: ${erroProj.message}` : `pv_atual=${linha?.pv_atual}, pv_max=${linha?.pv_max} (a coluna tem 99/99)`,
      );
      ok(
        "D2 (condições do token vinculado também vêm do personagem)",
        !erroProj && Array.isArray(linha?.condicoes) && !(linha!.condicoes as string[]).includes("sangrando"),
        `condicoes=${JSON.stringify(linha?.condicoes)} (a coluna tem ["sangrando"])`,
      );
      await admin.from("vtt_tokens").delete().eq("id", tokenId);
    } else {
      ok("D1/D2 (projeção do token vinculado)", false, "nenhuma cena na campanha — fixture insuficiente");
    }
    // ─── B. A janela de turno da MESA chega à ficha ───
    // A ficha tem regras que dependem da janela — o teto de 2 PA em
    // Rápidos (`isActionAllowedInWindow`). O valor vinha de
    // `campaigns.turn_track`, o sistema ANTIGO de trilha, e em modo
    // product era SEMPRE `null`: com o combate rolando no VTT (que usa
    // `vtt_turn_tracks`, por cena), a ficha achava que estava fora de
    // combate e a regra nunca disparava.
    if (cena.data?.id) {
      await admin.from("vtt_turn_tracks").upsert({
        scene_id: cena.data.id,
        campaign_id: campaignId,
        // A trilha exige pelo menos 1 participante (constraint da 0088).
        estado: {
          modo: "iniciativa_por_lado", janela: "rapidos", rodada: 1, ultimoLado: null, agindoId: null,
          participantes: [{ id: p1, lado: "pj", paGastos: 0, agiuEm: [], encerrou: false, incapaz: false }],
        },
      }, { onConflict: "scene_id" });

      await abrirConsole(page, campaignId, p1);
      const emCombate = await page.locator('[data-testid="painel-console"]').getAttribute("data-janela-turno");
      ok(
        "B1 (com combate na mesa, a ficha abre sabendo a janela — traduzida de vtt_turn_tracks)",
        emCombate === "rapida",
        `data-janela-turno="${emCombate}" (esperado "rapida", vindo de janela="rapidos" na trilha da cena)`,
      );

      // E o contrário: sem combate, a ficha não pode inventar uma janela.
      await admin.from("vtt_turn_tracks").delete().eq("scene_id", cena.data.id);
      await abrirConsole(page, campaignId, p1);
      const foraDeCombate = await page.locator('[data-testid="painel-console"]').getAttribute("data-janela-turno");
      ok(
        "B2 (sem combate, a ficha abre fora de janela — não inventa uma)",
        foraDeCombate === "fora",
        `data-janela-turno="${foraDeCombate}" (esperado "fora")`,
      );
    }
    // ─── C. Da ficha pro tabuleiro ───
    // Consultar a ficha de alguém e não ter como achar essa pessoa no
    // mapa é a fronteira mais boba de todas. "Ver no mapa" só existe
    // onde faz sentido: dentro do VTT E com o personagem em cena.
    if (cena.data?.id) {
      // Sem token na cena, a ação não pode ser oferecida.
      await abrirConsole(page, campaignId, p1);
      const semToken = await page.locator('[data-testid="console-ver-no-mapa"]').count();
      ok(
        "C1 (fora do mapa, a ficha não oferece \"Ver no mapa\")",
        semToken === 0,
        `botões=${semToken}`,
      );

      // Com token na cena, mas abrindo por Personagens (sem mapa
      // montado), também não — não há câmera pra mover.
      const tokenId = randomUUID();
      await admin.from("vtt_tokens").insert({
        id: tokenId, campaign_id: campaignId, scene_id: cena.data.id, character_id: p1,
        nome: "Mara Venn", sigla: "MV", lado: "pj", vertente: "nenhuma",
        q: 2, r: 1, tamanho: "medio", orientacao: 0,
      });
      await abrirConsole(page, campaignId, p1);
      const semMapa = await page.locator('[data-testid="console-ver-no-mapa"]').count();
      ok(
        "C2 (em Personagens não há mapa, então a ação continua ausente)",
        semMapa === 0,
        `botões=${semMapa}`,
      );

      // No VTT, com o personagem em cena: a ação aparece e funciona.
      await page.goto(`${BASE_URL}/mesas/${campaignId}/vtt`, { waitUntil: "networkidle" });
      await page.waitForSelector('[data-testid="painel-vtt"]', { timeout: 20000 });
      await page.locator('[data-testid="painel-aba-personagens"]').click();
      await page.locator('[data-testid="painel-personagens-linha"]').first().click();
      await page.waitForSelector('[data-testid="console-window"]', { timeout: 60000 });
      const noVtt = page.locator('[data-testid="console-ver-no-mapa"]');
      const apareceu = await noVtt.count();
      ok(
        "C3 (no VTT, com o personagem em cena, a ficha oferece \"Ver no mapa\")",
        apareceu === 1,
        `botões=${apareceu}`,
      );
      if (apareceu === 1) {
        await page.screenshot({ path: "scripts/dev/.artefatos-visuais/ficha-na-mesa.png" });
        await noVtt.click();
        await page.waitForTimeout(700);
        const fechou = (await page.locator('[data-testid="console-window"]').count()) === 0;
        ok("C4 (usar a ação fecha a ficha e devolve a pessoa ao mapa)", fechou, `janela ainda aberta=${!fechou}`);
      }
      await admin.from("vtt_tokens").delete().eq("id", tokenId);
    }
  } finally {
    await browser.close();
    await admin.from("table_logs").delete().eq("campaign_id", campaignId);
    await admin.from("characters").delete().eq("campaign_id", campaignId);
    await admin.from("campaigns").delete().eq("id", campaignId);
    await admin.auth.admin.deleteUser(narradorId);
  }
  console.log(`\n${passou} ok, ${falhou} falha(s).`);
  if (falhou > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
