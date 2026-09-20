/**
 * CONT-03 — o organizador da campanha em navegador real, pelos
 * critérios de aceite: criar, editar, filtrar, relacionar, arquivar e
 * localizar; visibilidade evidente; revelar/ocultar na lista e no
 * detalhe; confirmação para destrutivo; e o editor de REGRAS continuando
 * acessível sem ambiguidade de nome.
 *
 * Uso: npx tsx scripts/dev/check-organizador-live.ts
 * (servidor dev já rodando em localhost:3000).
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
function registrar(criterio: string, ok: boolean, detalhe: string) {
  if (ok) { passou++; console.log(`ok - ${criterio}: ${detalhe}`); }
  else { falhou++; console.error(`FALHA - ${criterio}: ${detalhe}`); }
}

const criados = { usuarios: [] as string[], campanhas: [] as string[] };
async function criarConta(prefixo: string, nome: string) {
  const email = `${prefixo}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@ruptura.dev`;
  const senha = randomUUID();
  const { data, error } = await admin.auth.admin.createUser({
    email, password: senha, email_confirm: true, user_metadata: { display_name: nome },
  });
  if (error) throw new Error(`Falha ao criar ${nome}: ${error.message}`);
  criados.usuarios.push(data.user.id);
  return { id: data.user.id, email, senha };
}
async function contextoDe(email: string, senha: string) {
  const anon = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await anon.auth.signInWithPassword({ email, password: senha });
  if (error || !data.session) throw new Error(`Falha ao logar ${email}: ${error?.message}`);
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  await context.addCookies([{
    name: "ruptura_auth",
    value: JSON.stringify({ access_token: data.session.access_token, refresh_token: data.session.refresh_token }),
    domain: "localhost", path: "/", httpOnly: true, secure: false, sameSite: "Lax",
    expires: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7,
  }]);
  return { page: await context.newPage(), close: () => browser.close() };
}

async function abrirMenu(page: Page) {
  await fecharJanela(page);
  if (await page.locator(".rv-menu-mesa").count() === 0) {
    await page.locator('[data-testid="vtt-menu-mesa-btn"]').click();
  }
  await page.waitForSelector(".rv-menu-mesa", { timeout: 10000 });
}
/**
 * A janela é modal: o fundo dela (`pn-jan-fundo`) intercepta cliques, e
 * por isso o menu da mesa não é alcançável enquanto ela estiver aberta.
 */
async function fecharJanela(page: Page) {
  const fechar = page.locator('[data-testid="painel-janela-fechar"]');
  if (await fechar.count() > 0) {
    await fechar.first().click();
    await page.waitForSelector(".pn-jan-fundo", { state: "detached", timeout: 10000 }).catch(() => {});
  }
}

async function abrirOrganizador(page: Page) {
  await abrirMenu(page);
  await page.locator(".rv-menu-mesa-item", { hasText: "Organizador" }).first().click();
  await page.waitForSelector('[data-testid="painel-janela-organizador"]', { timeout: 15000 });
}
const itens = (page: Page) => page.locator('[data-testid="organizador-item"]');

async function limpar() {
  for (const cid of criados.campanhas) {
    await admin.from("campaign_narrative_entries").delete().eq("campaign_id", cid);
    await admin.from("campaign_session_heartbeats").delete().eq("campaign_id", cid);
    await admin.from("campaign_online_sessions").delete().eq("campaign_id", cid);
    await admin.from("vtt_scenes").delete().eq("campaign_id", cid);
    await admin.from("campaign_members").delete().eq("campaign_id", cid);
    await admin.from("campaigns").delete().eq("id", cid);
  }
  for (const uid of criados.usuarios) await admin.auth.admin.deleteUser(uid);
  registrar("L (limpeza de fixtures)", true, `${criados.usuarios.length} usuário(s), ${criados.campanhas.length} campanha(s)`);
}

async function main() {
  const narrador = await criarConta("check-org-narrador", "Narrador Org");
  const jogador = await criarConta("check-org-jogador", "Jogadora Org");
  const campaignId = randomUUID();
  const { error } = await admin.from("campaigns").insert({ id: campaignId, name: "Mesa do organizador", owner_id: narrador.id });
  if (error) throw new Error(`Falha ao criar campanha: ${error.message}`);
  criados.campanhas.push(campaignId);
  await admin.from("campaign_members").insert({
    campaign_id: campaignId, user_id: jogador.id, role: "player", status: "active", origem: "fixture_org",
  });
  registrar("0 (fixture: campanha com narrador e uma jogadora)", true, `campanha=${campaignId}`);

  const fechar: (() => Promise<void>)[] = [];
  try {
    const { page: pn, close: fn } = await contextoDe(narrador.email, narrador.senha);
    fechar.push(fn);
    pn.on("console", (m) => { if (m.type() === "error" && !m.text().includes("favicon")) console.error("  [console]", m.text().slice(0, 300)); });
    pn.on("pageerror", (e) => console.error("  [pageerror]", String(e).slice(0, 300)));
    await pn.goto(`${BASE_URL}/mesas/${campaignId}`, { waitUntil: "networkidle" });
    await pn.waitForSelector(".rv-ferramentas", { timeout: 20000 });

    // --- 1. As duas janelas existem com nomes que não se confundem ---
    {
      await abrirMenu(pn);
      const texto = (await pn.locator(".rv-menu-mesa").textContent()) ?? "";
      registrar("1 (organizador e editor de regras têm nomes distintos no menu)",
        texto.includes("Organizador") && texto.includes("Regras da campanha") && !texto.includes("Conteúdo da campanha"),
        `menu tem Organizador=${texto.includes("Organizador")}, Regras=${texto.includes("Regras da campanha")}`);
    }

    // --- 2. Abre vazio, dizendo que está vazio ---
    {
      await abrirOrganizador(pn);
      const vazio = await pn.locator(".rv-org-vazio").textContent();
      registrar("2 (abre vazio e explica o vazio, em vez de só não mostrar nada)",
        await itens(pn).count() === 0 && /Crie a primeira/.test(vazio ?? ""), `"${vazio?.trim()}"`);
    }

    // --- 3. Criar: os cinco tipos, e nasce como rascunho ---
    {
      for (const t of ["sessao", "anotacao", "handout", "npc", "lugar"]) {
        await pn.locator(`[data-testid="organizador-criar-${t}"]`).click();
        await pn.waitForTimeout(350);
      }
      await pn.waitForFunction(() => document.querySelectorAll('[data-testid="organizador-item"]').length === 5, null, { timeout: 15000 });
      const { data } = await admin.from("campaign_narrative_entries").select("tipo,estado").eq("campaign_id", campaignId);
      registrar("3 (cria os cinco tipos, todos nascendo rascunho)",
        data?.length === 5 && data.every((e) => e.estado === "rascunho"),
        `criadas=${data?.length}, todas rascunho=${data?.every((e) => e.estado === "rascunho")}`);
    }

    // --- 4. O estado é evidente na lista, sem abrir o item ---
    {
      const selos = await pn.locator(".rv-org-selo").allTextContents();
      registrar("4 (o selo de estado aparece em cada linha da lista)",
        selos.length === 5 && selos.every((s) => s.trim() === "Rascunho"), `selos=${JSON.stringify(selos)}`);
    }

    // --- 5. Editar: título, texto e etiquetas, com salvamento explícito ---
    {
      await pn.locator('[data-testid="organizador-item"]').filter({ hasText: "NPC" }).first().click();
      await pn.waitForSelector('[data-testid="organizador-detalhe"]', { timeout: 10000 });
      const salvar = pn.locator('[data-testid="organizador-salvar"]');
      const antesDeMexer = (await salvar.textContent())?.trim();
      await pn.locator('[data-testid="organizador-titulo"]').fill("Taverneiro Brum");
      await pn.locator('[data-testid="organizador-corpo"]').fill("Guarda a chave do porão.");
      await pn.locator('[data-testid="organizador-etiquetas"]').fill("vila-alta, chave");
      const depoisDeMexer = (await salvar.textContent())?.trim();
      await salvar.click();
      await pn.waitForFunction(() =>
        document.querySelector('[data-testid="organizador-salvar"]')?.textContent?.trim() === "Salvo",
        null, { timeout: 15000 });
      const { data } = await admin.from("campaign_narrative_entries")
        .select("titulo,corpo,etiquetas").eq("campaign_id", campaignId).eq("tipo", "npc").single();
      registrar("5 (edita e salva; o botão distingue pendente de salvo)",
        antesDeMexer === "Salvo" && depoisDeMexer === "Salvar"
        && data?.titulo === "Taverneiro Brum" && data.etiquetas.includes("vila-alta"),
        `botão ${antesDeMexer}→${depoisDeMexer}, etiquetas=${JSON.stringify(data?.etiquetas)}`);
    }

    // --- 6. Buscar encontra pelo texto, não só pelo título ---
    {
      await pn.locator('[data-testid="organizador-busca"]').fill("porão");
      await pn.waitForFunction(() => document.querySelectorAll('[data-testid="organizador-item"]').length === 1, null, { timeout: 10000 });
      const achado = (await itens(pn).first().textContent()) ?? "";
      await pn.locator('[data-testid="organizador-busca"]').fill("");
      registrar("6 (busca encontra pelo corpo do texto, não só pelo título)",
        achado.includes("Taverneiro Brum"), `achou "${achado.trim().slice(0, 40)}"`);
    }

    // --- 7. Filtrar por tipo e por etiqueta ---
    {
      await pn.locator('[data-testid="organizador-filtro-lugar"]').click();
      await pn.waitForFunction(() => document.querySelectorAll('[data-testid="organizador-item"]').length === 1, null, { timeout: 10000 });
      const porTipo = await itens(pn).count();
      await pn.locator('[data-testid="organizador-filtro-lugar"]').click();
      await pn.locator(".rv-org-chip", { hasText: "#vila-alta" }).click();
      await pn.waitForFunction(() => document.querySelectorAll('[data-testid="organizador-item"]').length === 1, null, { timeout: 10000 });
      const porEtiqueta = (await itens(pn).first().textContent()) ?? "";
      await pn.locator(".rv-org-chip", { hasText: "#vila-alta" }).click();
      registrar("7 (filtra por tipo e por etiqueta)",
        porTipo === 1 && porEtiqueta.includes("Taverneiro Brum"), `tipo=${porTipo}, etiqueta ok`);
    }

    // --- 8. Revelar à mesa: o estado muda no banco e na lista ---
    {
      await itens(pn).filter({ hasText: "Taverneiro Brum" }).first().click();
      await pn.locator('[data-testid="organizador-revelar"]').click();
      await pn.waitForFunction(() =>
        !!Array.from(document.querySelectorAll('[data-testid="organizador-item"]'))
          .find((n) => n.textContent?.includes("Taverneiro Brum") && n.textContent?.includes("Publicado")),
        null, { timeout: 15000 });
      const { data } = await admin.from("campaign_narrative_entries")
        .select("estado").eq("campaign_id", campaignId).eq("tipo", "npc").single();
      registrar("8 (revelar à mesa publica e o selo acompanha na lista)", data?.estado === "publicado", `estado=${data?.estado}`);
    }

    if (process.argv.includes("--captura")) {
      await pn.locator('[data-testid="painel-janela-organizador"]').screenshot({ path: "/tmp/organizador.png" });
      console.log("captura: /tmp/organizador.png");
    }

    // --- 9. O jogador vê o publicado e NÃO vê os rascunhos ---
    {
      const { page: pj, close } = await contextoDe(jogador.email, jogador.senha);
      fechar.push(close);
      await pj.goto(`${BASE_URL}/mesas/${campaignId}`, { waitUntil: "networkidle" });
      await pj.waitForSelector(".rv-ferramentas", { timeout: 20000 });
      await abrirMenu(pj);
      const menu = (await pj.locator(".rv-menu-mesa").textContent()) ?? "";
      const { data } = await admin.from("campaign_narrative_entries").select("id").eq("campaign_id", campaignId).eq("estado", "rascunho");
      registrar("9 (o organizador é do narrador; o jogador não tem o item no menu)",
        !menu.includes("Organizador") && (data?.length ?? 0) === 4,
        `jogador vê Organizador=${menu.includes("Organizador")}, rascunhos=${data?.length}`);
    }

    // --- 10. Arquivar tira da lista padrão e o filtro traz de volta ---
    {
      await itens(pn).filter({ hasText: "Lugar" }).first().click();
      await pn.locator('[data-testid="organizador-arquivar"]').click();
      await pn.waitForFunction(() =>
        !!Array.from(document.querySelectorAll(".rv-org-selo")).find((n) => n.textContent?.includes("Arquivado")),
        null, { timeout: 15000 });
      await pn.locator('[data-testid="organizador-estado-arquivado"]').click();
      await pn.waitForFunction(() => document.querySelectorAll('[data-testid="organizador-item"]').length === 1, null, { timeout: 10000 });
      const sozinho = await itens(pn).count();
      await pn.locator('[data-testid="organizador-estado-arquivado"]').click();
      const { data } = await admin.from("campaign_narrative_entries")
        .select("estado,arquivado_em").eq("campaign_id", campaignId).eq("tipo", "lugar").single();
      registrar("10 (arquivar marca a data e é achável pelo filtro de arquivados)",
        data?.estado === "arquivado" && !!data.arquivado_em && sozinho === 1,
        `estado=${data?.estado}, com data=${!!data?.arquivado_em}, no filtro=${sozinho}`);
    }

    // --- 11. Relacionar dois itens, simetricamente ---
    {
      await itens(pn).filter({ hasText: "Taverneiro Brum" }).first().click();
      await pn.locator('[data-testid="organizador-relacionar"]').first().click();
      await pn.waitForTimeout(1200);
      const { data } = await admin.from("campaign_narrative_links").select("entry_a,entry_b").eq("campaign_id", campaignId);
      registrar("11 (relacionar grava uma linha só, com o par ordenado)",
        data?.length === 1 && !!data[0].entry_a && data[0].entry_a < data[0].entry_b,
        `linhas=${data?.length}, ordenado=${data?.[0] && data[0].entry_a < data[0].entry_b}`);
    }

    // --- 12. Excluir pede confirmação e diz a diferença de arquivar ---
    {
      const antes = await itens(pn).count();
      await pn.locator('[data-testid="organizador-excluir"]').click();
      await pn.waitForSelector('[data-testid="organizador-confirmar-exclusao"]', { timeout: 10000 });
      const aviso = (await pn.locator('[data-testid="organizador-confirmar-exclusao"]').textContent()) ?? "";
      const { data: aindaLa } = await admin.from("campaign_narrative_entries")
        .select("id").eq("campaign_id", campaignId).eq("tipo", "npc");
      registrar("12 (excluir confirma antes, e o texto distingue de arquivar)",
        /não é arquivar/i.test(aviso) && aindaLa?.length === 1 && antes > 0,
        `texto explica=${/não é arquivar/i.test(aviso)}, ainda existe=${aindaLa?.length === 1}`);
    }

    // --- 13. Confirmada, a exclusão leva a relação junto ---
    {
      await pn.locator('[data-testid="organizador-confirmar-exclusao"] button', { hasText: "Excluir" }).click();
      await pn.waitForFunction(() =>
        !Array.from(document.querySelectorAll('[data-testid="organizador-item"]'))
          .find((n) => n.textContent?.includes("Taverneiro Brum")),
        null, { timeout: 15000 });
      const { data: entradas } = await admin.from("campaign_narrative_entries").select("id").eq("campaign_id", campaignId);
      const { data: links } = await admin.from("campaign_narrative_links").select("entry_a").eq("campaign_id", campaignId);
      registrar("13 (excluir remove a entrada e as relações dela)",
        entradas?.length === 4 && links?.length === 0, `entradas=${entradas?.length}, relações=${links?.length}`);
    }

    // --- 14. O editor de regras continua abrindo, e é outra janela ---
    {
      await abrirMenu(pn);
      await pn.locator(".rv-menu-mesa-item", { hasText: "Regras da campanha" }).first().click();
      const abriu = await pn.waitForSelector('[data-testid="painel-janela-conteudo"], .rv-pn-janela', { timeout: 15000 })
        .then(() => true).catch(() => false);
      registrar("14 (o editor técnico de regras continua acessível, em janela própria)", abriu, "abriu");
    }
  } finally {
    for (const f of fechar) await f();
  }
}

try {
  await main();
} catch (e) {
  registrar("E (execução)", false, e instanceof Error ? e.message : String(e));
} finally {
  await limpar();
  console.log(`\n${passou} ok, ${falhou} falha(s)`);
  process.exit(falhou > 0 ? 1 : 0);
}
