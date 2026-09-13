/**
 * Concorrência da invalidação sanitizada de tokens — prova que
 * `recarregarTokensAutorizados` (VttClient.tsx) NUNCA sobrescreve
 * terreno/marcações/metadados da cena, mesmo quando outra sessão
 * escreve terreno/marca ENQUANTO a releitura de tokens está em voo.
 * Também cobre: duas invalidações sobrepostas (só a resposta mais
 * recente é aplicada, sequenciamento por `tokensReadSeqRef`) e
 * desmontagem do componente com uma releitura pendente (sem erro).
 *
 * Método: as janelas de corrida são construídas com TIMING REAL (sem
 * interceptar/atrasar a rede) — o disparo do evento `tokens_changed` e
 * a escrita concorrente de terreno/marca acontecem em sequência sem
 * `await` entre eles, e a releitura de `lerCenaAtiva` (Server Action,
 * ida-e-volta de rede real) tipicamente leva 150-350ms neste ambiente,
 * folga suficiente pra escrita concorrente (INSERT direto via service
 * role, praticamente instantâneo) entrar nessa janela. Não é uma
 * garantia matemática de interleaving — é o mesmo tipo de prova por
 * timing real já usado no resto desta suíte (ver `check-vtt-
 * animacao-movimento.ts`); a correção em si é estruturalmente correta
 * independente de ordem (nunca lê/aplica `terreno`/`marcas` do
 * snapshot da releitura), o que este teste confirma na prática.
 *
 * Uso: npx tsx scripts/dev/check-vtt-invalidacao-concorrencia.ts
 * (servidor dev já rodando em localhost:3000).
 */

import { randomUUID } from "node:crypto";
import { config as loadDotenv } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import type { ConsoleMessage } from "playwright";
import { chromium, type BrowserContext, type Page } from "playwright";
import { BASE_URL } from "./authSession";
import { exigirRpc } from "./rpcObrigatoria";

loadDotenv({ path: ".env.local" });
function requireEnv(nome: string): string {
  const v = process.env[nome];
  if (!v) { console.error(`Variável de ambiente ausente: ${nome}`); process.exit(1); }
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
  if (ok) { passou++; console.log(`ok - ${criterio}: ${detalhe}`); }
  else { falhou++; console.error(`FALHA - ${criterio}: ${detalhe}`); }
}
function erroRelevante(msg: ConsoleMessage): boolean {
  if (msg.type() !== "error") return false;
  const t = msg.text();
  if (t.includes("favicon") || t.includes("Download the React DevTools")) return false;
  if (t.includes("Cannot update a component") && t.includes("while rendering a different component")) return false;
  return true;
}

let campaignId: string | null = null;
let sceneId: string | null = null;
let narradorEmail: string | null = null;
let narradorSenha: string | null = null;
const criados = { usuarios: [] as string[], campanhas: [] as string[] };

async function configurarFixture(): Promise<void> {
  campaignId = randomUUID();
  const email = `check-vtt-concorrencia-${Date.now()}@ruptura.dev`;
  const senha = randomUUID();
  const { data, error } = await admin.auth.admin.createUser({ email, password: senha, email_confirm: true, user_metadata: { display_name: "Narrador Concorrência" } });
  if (error) throw new Error(`Falha ao criar narrador fixture: ${error.message}`);
  narradorEmail = email; narradorSenha = senha;
  criados.usuarios.push(data.user.id);

  const { error: e1 } = await admin.from("campaigns").insert({ id: campaignId, name: "VTT Concorrência", owner_id: data.user.id });
  if (e1) throw new Error(`Falha ao criar campanha: ${e1.message}`);
  criados.campanhas.push(campaignId);
}

async function contextoDe(email: string, senha: string): Promise<{ context: BrowserContext; page: Page; close: () => Promise<void> }> {
  const anon = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await anon.auth.signInWithPassword({ email, password: senha });
  if (error || !data.session) throw new Error(`Falha ao logar ${email}: ${error?.message}`);
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 950 } });
  await context.addCookies([{
    name: "ruptura_auth",
    value: JSON.stringify({ access_token: data.session.access_token, refresh_token: data.session.refresh_token }),
    domain: "localhost", path: "/", httpOnly: true, secure: false, sameSite: "Lax",
    expires: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7,
  }]);
  const page = await context.newPage();
  return { context, page, close: () => browser.close() };
}

async function limpar() {
  for (const cid of criados.campanhas) {
    await admin.from("vtt_marks").delete().eq("campaign_id", cid);
    await admin.from("vtt_terrain").delete().eq("campaign_id", cid);
    await admin.from("vtt_tokens").delete().eq("campaign_id", cid);
    await admin.from("vtt_scenes").delete().eq("campaign_id", cid);
    await admin.from("campaigns").delete().eq("id", cid);
  }
  for (const uid of criados.usuarios) await admin.auth.admin.deleteUser(uid);
  registrar("L (limpeza de fixtures)", true, `${criados.usuarios.length} usuário(s), ${criados.campanhas.length} campanha(s)`);
}

async function main() {
  await configurarFixture();
  registrar("0 (fixture: campanha + narrador)", true, `campanha=${campaignId}`);

  const { page, close } = await contextoDe(narradorEmail!, narradorSenha!);
  const erros: string[] = [];
  page.on("console", (m) => { if (erroRelevante(m)) erros.push(m.text().slice(0, 600)); });
  page.on("pageerror", (e) => erros.push(`pageerror: ${e.message}`));

  await page.goto(`${BASE_URL}/mesas/${campaignId}/vtt`, { waitUntil: "networkidle" });
  await page.waitForSelector(".rv-ferramentas", { timeout: 15000 });
  {
    const { data } = await admin.from("vtt_scenes").select("id").eq("campaign_id", campaignId).maybeSingle();
    sceneId = data?.id ?? null;
  }
  registrar("0b (cena semeada)", !!sceneId, `sceneId=${sceneId}`);

  // ═══════════════════════════════════════════════════════════════
  // 1. Terreno pintado ENQUANTO uma releitura de tokens está em voo
  //    — precisa sobreviver à reconciliação de tokens.
  // ═══════════════════════════════════════════════════════════════
  {
    // Dispara a invalidação (cria um token via RPC — publica
    // `tokens_changed`, o cliente começa a reler) e, SEM esperar,
    // pinta terreno numa célula nova direto no banco (outra "sessão").
    const cliNarrador = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    await cliNarrador.auth.signInWithPassword({ email: narradorEmail!, password: narradorSenha! });

    const disparo = cliNarrador.rpc("create_vtt_token", {
      p_scene_id: sceneId, p_campaign_id: campaignId, p_nome: "Concorrência A", p_sigla: "CA",
      p_lado: "pn", p_vertente: "nenhuma", p_tamanho: "medio", p_orientacao: 0, p_pegada_personalizada: null,
      p_q: 0, p_r: 0, p_character_id: null, p_visivel: true, p_bloqueado: false,
      p_retrato_url: null, p_pv_atual: null, p_pv_max: null, p_condicoes: [],
    });
    const escritaTerreno = admin.from("vtt_terrain").upsert({ scene_id: sceneId, campaign_id: campaignId, q: 3, r: 3, tipo: "dificil" });
    await Promise.all([disparo, escritaTerreno]);

    await page.waitForTimeout(2500); // folga generosa pra reread + reconciliação assentarem
    const temTokenNovo = await page.evaluate(() => Array.from(document.querySelectorAll(".rv-token-sigla")).some((e) => e.textContent === "CA"));
    const { data: terrenoNoBanco } = await admin.from("vtt_terrain").select("tipo").eq("scene_id", sceneId).eq("q", 3).eq("r", 3).maybeSingle();
    // Confirma no CLIENTE: a célula (3,3) está renderizada com terreno funcional real (classe própria do MapaHex).
    const terrenoNoCliente = await page.evaluate(() => document.querySelectorAll(".rv-camada-terreno-real path").length > 0);
    registrar(
      "1 (terreno pintado durante releitura de tokens sobrevive — não é revertido pela reconciliação)",
      temTokenNovo && terrenoNoBanco?.tipo === "dificil" && terrenoNoCliente,
      `tokenNovo=${temTokenNovo}, terrenoBanco=${terrenoNoBanco?.tipo}, terrenoCliente=${terrenoNoCliente}`,
    );
  }

  // ═══════════════════════════════════════════════════════════════
  // 2. Marca criada ENQUANTO uma releitura de tokens está em voo —
  //    precisa sobreviver.
  // ═══════════════════════════════════════════════════════════════
  {
    const cliNarrador = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    await cliNarrador.auth.signInWithPassword({ email: narradorEmail!, password: narradorSenha! });
    const narradorId = (await admin.auth.admin.listUsers()).data.users.find((u) => u.email === narradorEmail)!.id;

    const disparo = cliNarrador.rpc("create_vtt_token", {
      p_scene_id: sceneId, p_campaign_id: campaignId, p_nome: "Concorrência B", p_sigla: "CB2",
      p_lado: "pn", p_vertente: "nenhuma", p_tamanho: "medio", p_orientacao: 0, p_pegada_personalizada: null,
      p_q: 1, p_r: 1, p_character_id: null, p_visivel: true, p_bloqueado: false,
      p_retrato_url: null, p_pv_atual: null, p_pv_max: null, p_condicoes: [],
    });
    const escritaMarca = admin.from("vtt_marks").insert({
      scene_id: sceneId, campaign_id: campaignId, autor_id: narradorId,
      tipo: "texto", pontos: [{ q: 5, r: 5 }], cor: "verde", espessura: 2, opacidade: 1, privada: false,
    });
    await Promise.all([disparo, escritaMarca]);

    await page.waitForTimeout(2500);
    const temTokenNovo = await page.evaluate(() => Array.from(document.querySelectorAll(".rv-token-sigla")).some((e) => e.textContent === "CB2"));
    const { count: marcasNoBanco } = await admin.from("vtt_marks").select("id", { count: "exact", head: true }).eq("scene_id", sceneId);
    const marcasNoCliente = await page.evaluate(() => document.querySelectorAll(".rv-camada-marcas .rv-marca-ping").length);
    registrar(
      "2 (marca criada durante releitura de tokens sobrevive — não é revertida pela reconciliação)",
      temTokenNovo && (marcasNoBanco ?? 0) >= 1 && marcasNoCliente >= 1,
      `tokenNovo=${temTokenNovo}, marcasBanco=${marcasNoBanco}, marcasCliente=${marcasNoCliente}`,
    );
  }

  // ═══════════════════════════════════════════════════════════════
  // 3. Ordem inversa — terreno/marca já existem ANTES da invalidação
  //    disparar; a releitura de tokens não pode fazê-los desaparecer.
  // ═══════════════════════════════════════════════════════════════
  {
    await admin.from("vtt_terrain").upsert({ scene_id: sceneId, campaign_id: campaignId, q: 7, r: 7, tipo: "bloqueado" });
    await page.waitForTimeout(1500); // assenta via canal de terreno normal, ANTES da invalidação de token
    const cliNarrador = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    await cliNarrador.auth.signInWithPassword({ email: narradorEmail!, password: narradorSenha! });
    // Criar o token é PRÉ-CONDIÇÃO da invalidação que se quer observar.
    // Se a criação falhasse, a UI não mostraria nada — e o caso acusaria
    // o Realtime por um evento que nunca teve o que anunciar.
    await exigirRpc("criar o token da concorrência", cliNarrador.rpc("create_vtt_token", {
      p_scene_id: sceneId, p_campaign_id: campaignId, p_nome: "Concorrência C", p_sigla: "CC",
      p_lado: "pn", p_vertente: "nenhuma", p_tamanho: "medio", p_orientacao: 0, p_pegada_personalizada: null,
      p_q: 2, p_r: 2, p_character_id: null, p_visivel: true, p_bloqueado: false,
      p_retrato_url: null, p_pv_atual: null, p_pv_max: null, p_condicoes: [],
    }));
    await page.waitForTimeout(2000);
    const { data: aindaLa } = await admin.from("vtt_terrain").select("tipo").eq("scene_id", sceneId).eq("q", 7).eq("r", 7).maybeSingle();
    registrar("3 (ordem inversa: terreno já existente antes da invalidação continua depois dela)", aindaLa?.tipo === "bloqueado", `tipo=${aindaLa?.tipo}`);
  }

  // ═══════════════════════════════════════════════════════════════
  // 4. Duas invalidações sobrepostas — a releitura mais RECENTE vence,
  //    nenhuma resposta atrasada reverte pro estado intermediário.
  // ═══════════════════════════════════════════════════════════════
  {
    const cliNarrador = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    await cliNarrador.auth.signInWithPassword({ email: narradorEmail!, password: narradorSenha! });
    const chamada1 = cliNarrador.rpc("create_vtt_token", {
      p_scene_id: sceneId, p_campaign_id: campaignId, p_nome: "Sobreposta D", p_sigla: "SD",
      p_lado: "pn", p_vertente: "nenhuma", p_tamanho: "medio", p_orientacao: 0, p_pegada_personalizada: null,
      p_q: 4, p_r: 0, p_character_id: null, p_visivel: true, p_bloqueado: false,
      p_retrato_url: null, p_pv_atual: null, p_pv_max: null, p_condicoes: [],
    });
    const chamada2 = cliNarrador.rpc("create_vtt_token", {
      p_scene_id: sceneId, p_campaign_id: campaignId, p_nome: "Sobreposta E", p_sigla: "SE",
      p_lado: "pn", p_vertente: "nenhuma", p_tamanho: "medio", p_orientacao: 0, p_pegada_personalizada: null,
      p_q: 5, p_r: 0, p_character_id: null, p_visivel: true, p_bloqueado: false,
      p_retrato_url: null, p_pv_atual: null, p_pv_max: null, p_condicoes: [],
    });
    await Promise.all([chamada1, chamada2]); // duas invalidações quase simultâneas, cada uma dispara sua própria releitura
    await page.waitForTimeout(2500);
    const siglas = await page.evaluate(() => Array.from(document.querySelectorAll(".rv-token-sigla")).map((e) => e.textContent));
    const temAsDuas = siglas.includes("SD") && siglas.includes("SE");
    registrar("4 (duas invalidações sobrepostas: estado final tem as DUAS mudanças, nenhuma reversão pro intermediário)", temAsDuas, `siglas=${JSON.stringify(siglas)}`);
  }

  // ═══════════════════════════════════════════════════════════════
  // 5. Desmonta o componente (navega pra outra rota) com uma
  //    releitura em voo — sem erro/warning de "setState on unmounted".
  // ═══════════════════════════════════════════════════════════════
  {
    const errosAntes = erros.length;
    const cliNarrador = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    await cliNarrador.auth.signInWithPassword({ email: narradorEmail!, password: narradorSenha! });
    const disparo = cliNarrador.rpc("create_vtt_token", {
      p_scene_id: sceneId, p_campaign_id: campaignId, p_nome: "Desmontagem", p_sigla: "DM",
      p_lado: "pn", p_vertente: "nenhuma", p_tamanho: "medio", p_orientacao: 0, p_pegada_personalizada: null,
      p_q: 6, p_r: 0, p_character_id: null, p_visivel: true, p_bloqueado: false,
      p_retrato_url: null, p_pv_atual: null, p_pv_max: null, p_condicoes: [],
    });
    // Navega ANTES da releitura provavelmente ter terminado — o
    // `montadoRef` precisa impedir a aplicação da resposta tardia.
    await page.goto(`${BASE_URL}/mesas/${campaignId}/personagens`, { waitUntil: "domcontentloaded" });
    await disparo;
    await page.waitForTimeout(2000);
    const novosErros = erros.slice(errosAntes);
    registrar(
      "5 (desmontar com releitura pendente: sem erro/warning — `montadoRef` descarta a resposta tardia)",
      novosErros.length === 0, novosErros.length === 0 ? "console limpo" : `erros: ${JSON.stringify(novosErros)}`,
    );
  }

  registrar("console (sem erros/warnings além dos já filtrados, na sessão inteira)", erros.length === 0, JSON.stringify(erros));

  await close();
  await limpar();

  console.log(`\n${passou} ok, ${falhou} falha(s).`);
  process.exit(falhou > 0 ? 1 : 0);
}

main().catch(async (e) => {
  console.error("Erro fatal:", e);
  await limpar().catch(() => {});
  process.exit(1);
});
