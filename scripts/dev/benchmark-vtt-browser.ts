/**
 * Mede a mesa REAL no Chromium, usando uma conta/campanhas temporárias.
 * Não depende da sessão pessoal em .auth e remove todas as fixtures ao sair.
 *
 * Uso: com `npm run dev` ou `npm run start` em localhost:3000,
 *   npm run bench:vtt-browser
 * Cenários extras: VTT_CHAT_COUNT=800, VTT_BACKGROUND_PX=4096,
 * VTT_DICE_CYCLES=10, VTT_SHEET_CYCLES=5 ou VTT_COMBINED=1.
 * VTT_SKIP_SWITCH=1 omite as cinco alternâncias de cena.
 * Os valores são deste computador/browser/servidor; compare execuções no
 * mesmo ambiente e na mesma modalidade (dev ou produção).
 */
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { config as loadDotenv } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { chromium, type CDPSession, type Page } from "playwright";
import sharp from "sharp";
import { personagemV12 } from "./fixtures/personagemV12";

loadDotenv({ path: ".env.local" });

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} ausente em .env.local`);
  return value;
}

const admin = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false },
});
const anon = createClient(env("SUPABASE_URL"), env("SUPABASE_ANON_KEY"), {
  auth: { persistSession: false, autoRefreshToken: false },
});
const prefix = "zz_e2e_perf_vtt";
const baseUrl = process.env.VTT_BENCH_URL ?? "http://localhost:3000";
const browserHost = new URL(baseUrl).hostname;
const fixtures = { userId: "", campaigns: [] as string[], storagePaths: [] as string[] };
type Scenario = { name: string; width: number; height: number; tokens: number; chatMessages: number; backgroundPx: number; character: boolean };
const scenarios: Scenario[] = [
  { name: "26×18, 20 tokens", width: 26, height: 18, tokens: 20, chatMessages: 0, backgroundPx: 0, character: false },
  { name: "60×40, 20 tokens", width: 60, height: 40, tokens: 20, chatMessages: 0, backgroundPx: 0, character: false },
];
const chatCount = Number(process.env.VTT_CHAT_COUNT ?? 0);
if (!Number.isSafeInteger(chatCount) || chatCount < 0 || chatCount > 1000) {
  throw new Error("VTT_CHAT_COUNT deve ser um inteiro entre 0 e 1000");
}
if (chatCount) scenarios.push({
  name: `60×40, 20 tokens, ${chatCount} mensagens`,
  width: 60, height: 40, tokens: 20, chatMessages: chatCount, backgroundPx: 0, character: false,
});
const backgroundPx = Number(process.env.VTT_BACKGROUND_PX ?? 0);
if (!Number.isSafeInteger(backgroundPx) || (backgroundPx !== 0 && (backgroundPx < 512 || backgroundPx > 4096))) {
  throw new Error("VTT_BACKGROUND_PX deve ser 0 ou um inteiro entre 512 e 4096");
}
if (backgroundPx) scenarios.push({
  name: `60×40, 20 tokens, fundo ${backgroundPx}² px`,
  width: 60, height: 40, tokens: 20, chatMessages: 0, backgroundPx, character: false,
});
const diceCycles = Number(process.env.VTT_DICE_CYCLES ?? 0);
if (!Number.isSafeInteger(diceCycles) || diceCycles < 0 || diceCycles > 20) {
  throw new Error("VTT_DICE_CYCLES deve ser um inteiro entre 0 e 20");
}
const sheetCycles = Number(process.env.VTT_SHEET_CYCLES ?? 0);
if (!Number.isSafeInteger(sheetCycles) || sheetCycles < 0 || sheetCycles > 20) {
  throw new Error("VTT_SHEET_CYCLES deve ser um inteiro entre 0 e 20");
}
if (sheetCycles && process.env.VTT_COMBINED !== "1") scenarios.push({
  name: "60×40, 20 tokens, ficha real", width: 60, height: 40, tokens: 20,
  chatMessages: 0, backgroundPx: 0, character: true,
});
if (process.env.VTT_COMBINED === "1") scenarios.push({
  name: "60×40, 20 tokens, 800 mensagens, fundo 4096², ficha",
  width: 60, height: 40, tokens: 20, chatMessages: 800,
  backgroundPx: 4096, character: true,
});

type Metrics = Record<string, number>;
type Sample = {
  elapsedMs: number;
  frames: number[];
  longTasks: number[];
  browser: Metrics;
};

function percentile(values: number[], p: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1)];
}

function metricDelta(before: Metrics, after: Metrics, key: string): number {
  return Math.max(0, ((after[key] ?? 0) - (before[key] ?? 0)) * 1000);
}

async function browserMetrics(session: CDPSession): Promise<Metrics> {
  const result = await session.send("Performance.getMetrics");
  return Object.fromEntries(result.metrics.map((m) => [m.name, m.value]));
}

async function printMemory(session: CDPSession, browserSession: CDPSession, label: string) {
  const heap = await session.send("Runtime.getHeapUsage");
  const dom = await session.send("Memory.getDOMCounters");
  const { processInfo } = await browserSession.send("SystemInfo.getProcessInfo");
  const renderers = processInfo.filter((proc) => proc.type === "renderer");
  const gpuProcesses = processInfo.filter((proc) => proc.type === "GPU");
  // ps informa RSS em KiB no macOS/Linux. Agrega os renderers do Chromium dedicado.
  const rss = renderers.reduce((total, proc) => {
    return total + Number(execFileSync("ps", ["-o", "rss=", "-p", String(proc.id)], { encoding: "utf8" }).trim());
  }, 0);
  const gpuRss = gpuProcesses.reduce((total, proc) => {
    return total + Number(execFileSync("ps", ["-o", "rss=", "-p", String(proc.id)], { encoding: "utf8" }).trim());
  }, 0);
  console.log(label, { rendererRSSMiB: Math.round(rss / 1024), renderers: renderers.length,
    gpuRSSMiB: Math.round(gpuRss / 1024), jsHeapMiB: Math.round(heap.usedSize / 1048576),
    nodes: dom.nodes, listeners: dom.jsEventListeners });
}

async function sample(page: Page, session: CDPSession, action: () => Promise<void>): Promise<Sample> {
  // String literal: `tsx` injeta um helper __name em callbacks serializados
  // por Playwright, mas esse helper não existe dentro da página.
  await page.evaluate(`(() => {
    const bench = { frames: [], longTasks: [], active: true, observer: null };
    window.__vttBench = bench;
    let previous = 0;
    function frame(now) {
      if (!bench.active) return;
      if (previous) bench.frames.push(now - previous);
      previous = now;
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
    if (PerformanceObserver.supportedEntryTypes.includes("longtask")) {
      bench.observer = new PerformanceObserver((list) => {
        if (bench.active) bench.longTasks.push(...list.getEntries().map((e) => e.duration));
      });
      bench.observer.observe({ type: "longtask" });
    }
  })()`);
  const before = await browserMetrics(session);
  const started = performance.now();
  try {
    await action();
    await page.waitForTimeout(250); // deixa o último gesto pintar
  } finally {
    await page.evaluate(`(() => {
      const bench = window.__vttBench;
      if (bench) { bench.active = false; bench.observer?.disconnect(); }
    })()`).catch(() => {});
  }
  const elapsedMs = performance.now() - started;
  const after = await browserMetrics(session);
  const observed = await page.evaluate(`(() => ({
    frames: window.__vttBench?.frames ?? [],
    longTasks: window.__vttBench?.longTasks ?? []
  }))()`) as { frames: number[]; longTasks: number[] };
  return { elapsedMs, ...observed, browser: {
    taskMs: metricDelta(before, after, "TaskDuration"),
    scriptMs: metricDelta(before, after, "ScriptDuration"),
    layoutMs: metricDelta(before, after, "LayoutDuration"),
    styleMs: metricDelta(before, after, "RecalcStyleDuration"),
  } };
}

function printSample(name: string, value: Sample): void {
  const slowFrames = value.frames.filter((ms) => ms > 33.4).length;
  console.log(`${name}: ${value.elapsedMs.toFixed(0)}ms; frames p50=${percentile(value.frames, .5).toFixed(1)}ms p95=${percentile(value.frames, .95).toFixed(1)}ms >33ms=${slowFrames}/${value.frames.length}; long tasks=${value.longTasks.length} (pior ${Math.max(0, ...value.longTasks).toFixed(0)}ms); CPU tarefas=${value.browser.taskMs.toFixed(0)}ms script=${value.browser.scriptMs.toFixed(0)}ms layout=${value.browser.layoutMs.toFixed(0)}ms style=${value.browser.styleMs.toFixed(0)}ms`);
}

async function profilePan(session: CDPSession, action: () => Promise<void>): Promise<void> {
  await session.send("Profiler.enable");
  await session.send("Profiler.start");
  let profile;
  try {
    await action();
  } finally {
    ({ profile } = await session.send("Profiler.stop"));
    await session.send("Profiler.disable");
  }
  const nodes = new Map(profile.nodes.map((node) => [node.id, node.callFrame]));
  const totals = new Map<string, number>();
  const samples = profile.samples ?? [];
  const timeDeltas = profile.timeDeltas ?? [];
  for (let i = 0; i < samples.length; i++) {
    const frame = nodes.get(samples[i]);
    if (!frame) continue;
    const key = `${frame.functionName || "(anônimo)"} ${frame.url.split("/").pop()}:${frame.lineNumber + 1}`;
    totals.set(key, (totals.get(key) ?? 0) + (timeDeltas[i] ?? 0));
  }
  console.log("CPU no pan, tempo exclusivo (top 12):");
  for (const [name, microseconds] of [...totals].sort((a, b) => b[1] - a[1]).slice(0, 12)) {
    console.log(`  ${(microseconds / 1000).toFixed(0)}ms ${name}`);
  }
}

async function createFixture(userId: string, scenario: Scenario): Promise<string> {
  const campaignId = randomUUID();
  const campaign = await admin.from("campaigns").insert({
    id: campaignId, name: `${prefix}_${scenario.width}x${scenario.height}`, owner_id: userId,
  });
  if (campaign.error) throw campaign.error;
  fixtures.campaigns.push(campaignId);

  const scene = await admin.from("vtt_scenes").insert({
    campaign_id: campaignId, nome: `Benchmark ${scenario.width}×${scenario.height}`,
    largura: scenario.width, altura: scenario.height,
  }).select("id").single();
  if (scene.error || !scene.data) throw scene.error ?? new Error("Cena não criada");

  const presentation = await admin.from("vtt_campaign_stage").insert({
    campaign_id: campaignId, presented_scene_id: scene.data.id, updated_by: userId,
  });
  if (presentation.error) throw presentation.error;

  const characterId = scenario.character ? randomUUID() : null;
  if (characterId) {
    const character = await admin.from("characters").insert({
      id: characterId, name: "Personagem Benchmark", status: "draft",
      campaign_id: campaignId, owner_id: userId,
      payload: personagemV12("Personagem Benchmark", {
        atributos: { corpo: 3, mente: 2, animo: 3 }, pericias: { balistica: 2 },
      }),
    });
    if (character.error) throw character.error;
  }

  const tokens = Array.from({ length: scenario.tokens }, (_, i) => ({
    scene_id: scene.data.id, campaign_id: campaignId,
    nome: `Token ${i + 1}`, sigla: `T${i + 1}`, lado: characterId && i === 0 ? "pj" : "pn", vertente: "nenhuma",
    q: 2 + (i % 10) * 2, r: 2 + Math.floor(i / 10) * 2,
    tamanho: "medio", orientacao: 0, visivel: true,
    ...(characterId && i === 0 ? { character_id: characterId } : {}),
  }));
  const inserted = await admin.from("vtt_tokens").insert(tokens);
  if (inserted.error) throw inserted.error;
  if (scenario.backgroundPx) await createBackground(campaignId, scene.data.id, scenario.backgroundPx);
  const logStart = Date.now() - scenario.chatMessages * 1000;
  for (let start = 0; start < scenario.chatMessages; start += 200) {
    const logs = Array.from({ length: Math.min(200, scenario.chatMessages - start) }, (_, i) => ({
      campaign_id: campaignId, type: "chat", visibility: "public",
      created_at: new Date(logStart + (start + i) * 1000).toISOString(),
      payload: { text: `Mensagem de benchmark ${start + i + 1}: diálogo de uma sessão longa.` },
    }));
    const result = await admin.from("table_logs").insert(logs);
    if (result.error) throw result.error;
  }
  return campaignId;
}

async function createBackground(campaignId: string, sceneId: string, size: number): Promise<void> {
  // Padrão com textura leve: arquivo pequeno, mas raster decodificado de tamanho real.
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
    <defs><linearGradient id="g" x2="1" y2="1"><stop stop-color="#152b4b"/>
      <stop offset="1" stop-color="#4b735e"/></linearGradient>
      <pattern id="p" width="48" height="48" patternUnits="userSpaceOnUse">
        <path d="M0 0H48V48H0Z" fill="none" stroke="#d9cda0" stroke-opacity=".2"/>
        <circle cx="24" cy="24" r="8" fill="#c2a786" fill-opacity=".16"/>
      </pattern></defs><path fill="url(#g)" d="M0 0h${size}v${size}H0z"/>
      <path fill="url(#p)" d="M0 0h${size}v${size}H0z"/></svg>`;
  const bytes = await sharp(Buffer.from(svg)).webp({ quality: 82 }).toBuffer();
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const reserve = await anon.rpc("reservar_upload_vtt_imagem", {
    p_campaign_id: campaignId, p_sha256: sha256, p_intencao: "fundo", p_token_id: null,
  });
  if (reserve.error || !reserve.data) throw reserve.error ?? new Error("Reserva da imagem vazia");
  const data = reserve.data as { storage_path: string; reserva_id: string };
  if (!data.storage_path || !data.reserva_id) throw new Error("Reserva incompleta");
  fixtures.storagePaths.push(data.storage_path);
  const uploaded = await admin.storage.from("vtt-imagens").upload(data.storage_path, bytes, {
    contentType: "image/webp", upsert: false,
  });
  if (uploaded.error) throw uploaded.error;
  const finalized = await anon.rpc("finalizar_upload_e_criar_imagem_cena", {
    p_reserva_id: data.reserva_id, p_bytes_reais: bytes.byteLength,
    p_width_px: size, p_height_px: size, p_scene_id: sceneId,
    p_papel: "fundo", p_centro_q: 29.5, p_centro_r: 19.5,
    p_largura_m: 60, p_altura_m: null, p_rotacao_graus: 0,
    p_opacidade: 1, p_camada: "abaixo_grade",
  });
  if (finalized.error) throw finalized.error;
  console.log(`Fundo WebP: ${size}×${size} px, ${Math.round(bytes.byteLength / 1024)} KiB no Storage`);
}

async function createAlternateScene(campaignId: string, userId: string): Promise<void> {
  const created = await admin.from("vtt_scenes").insert({
    campaign_id: campaignId, nome: "Alternativa do benchmark",
    largura: 26, altura: 18, created_by: userId, updated_by: userId,
  });
  if (created.error) throw created.error;
}

async function cleanup(): Promise<void> {
  const failures: string[] = [];
  for (const path of fixtures.storagePaths) {
    const result = await admin.storage.from("vtt-imagens").remove([path]);
    if (result.error) failures.push(`imagem ${path}: ${result.error.message}`);
  }
  for (const id of fixtures.campaigns) {
    const result = await admin.from("campaigns").delete().eq("id", id);
    if (result.error) failures.push(`campanha ${id}: ${result.error.message}`);
  }
  if (fixtures.userId) {
    const result = await admin.auth.admin.deleteUser(fixtures.userId);
    if (result.error) failures.push(`conta: ${result.error.message}`);
  }
  if (failures.length) throw new Error(`Limpeza incompleta: ${failures.join("; ")}`);
  console.log("Fixtures removidas.");
}

async function main(): Promise<void> {
  const email = `${prefix}-${Date.now()}@ruptura.dev`;
  const password = `${randomUUID()}Aa1!`;
  const created = await admin.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { display_name: "Benchmark VTT" },
  });
  if (created.error || !created.data.user) throw created.error ?? new Error("Conta não criada");
  fixtures.userId = created.data.user.id;
  try {
    const signed = await anon.auth.signInWithPassword({ email, password });
    if (signed.error || !signed.data.session) throw signed.error ?? new Error("Login falhou");
    const campaignIds = [];
    for (const scenario of scenarios) campaignIds.push(await createFixture(fixtures.userId, scenario));
    await createAlternateScene(campaignIds[campaignIds.length - 1], fixtures.userId);

    const browser = await chromium.launch({ headless: true });
    try {
      const context = await browser.newContext({ viewport: { width: 1600, height: 950 } });
      await context.addCookies([{
        name: "ruptura_auth",
        value: JSON.stringify({ access_token: signed.data.session.access_token, refresh_token: signed.data.session.refresh_token }),
        domain: browserHost, path: "/", httpOnly: true, secure: false, sameSite: "Lax",
        expires: Math.floor(Date.now() / 1000) + 3600,
      }]);
      const page = await context.newPage();
      const cdp = await context.newCDPSession(page);
      await cdp.send("Performance.enable");
      const browserSession = await browser.newBrowserCDPSession();
      await printMemory(cdp, browserSession, "Aba vazia");
      async function pan(page: Page, x: number, y: number): Promise<void> {
        await page.mouse.move(x, y);
        await page.mouse.down({ button: "right" });
        for (let step = 1; step <= 30; step++) {
          await page.mouse.move(x + step * 5, y + step * 2);
          await page.waitForTimeout(16);
        }
        await page.mouse.up({ button: "right" });
      }
      for (let i = 0; i < scenarios.length; i++) {
        const scenario = scenarios[i];
        console.log(`\n${scenario.name}`);
        const started = performance.now();
        const imageResponse = scenario.backgroundPx
          ? page.waitForResponse((response) => response.url().includes("/storage/v1/object/sign/vtt-imagens/")
            && response.ok(), { timeout: 60000 })
          : null;
        await page.goto(`${baseUrl}/mesas/${campaignIds[i]}`, { waitUntil: "domcontentloaded", timeout: 60000 });
        await page.locator(".rv-camada-grade path").first().waitFor({ timeout: 60000 });
        console.log(`Mapa pronto: ${(performance.now() - started).toFixed(0)}ms; células=${await page.locator(".rv-camada-grade path").count()}`);
        await page.waitForFunction((n) => document.querySelectorAll(".rv-token[data-token-id]").length === n, scenario.tokens);
        if (scenario.backgroundPx) {
          await imageResponse;
          await page.locator(".rv-imagem-cena image").first().waitFor({ timeout: 60000 });
          await page.locator("svg.rv-mapa").screenshot({ timeout: 60000 });
          console.log("Fundo transferido e pintado no Chromium");
        }
        if (scenario.chatMessages) {
          await page.getByTestId("painel-chat-scroll").getByText(`Mensagem de benchmark ${scenario.chatMessages}:`, { exact: false }).waitFor();
          console.log(`Cartões montados: ${await page.getByTestId("painel-chat-scroll").locator('[id^="feed-card-"]').count()}`);
        }
        await cdp.send("HeapProfiler.collectGarbage");
        await printMemory(cdp, browserSession, "Cena carregada");
        const map = page.locator("svg.rv-mapa");
        const box = await map.boundingBox();
        if (!box) throw new Error("Mapa sem dimensão visível");
        const x = box.x + box.width * .5;
        const y = box.y + box.height * .5;

        printSample("Repouso (2s)", await sample(page, cdp, () => page.waitForTimeout(2000)));
        printSample("Pan (30 passos)", await sample(page, cdp, () => pan(page, x, y)));
        if (process.env.VTT_PROFILE === "1" && i === scenarios.length - 1) {
          await profilePan(cdp, () => pan(page, x, y));
        }
        printSample("Zoom (12 passos)", await sample(page, cdp, async () => {
          await page.mouse.move(x, y);
          for (let step = 0; step < 12; step++) {
            await page.mouse.wheel(0, step % 2 ? 80 : -80);
            await page.waitForTimeout(50);
          }
        }));
        if (scenario.chatMessages > 100) {
          await page.getByTestId("painel-chat-carregar-anteriores").click();
          await page.getByTestId("painel-chat-scroll")
            .getByText(`Mensagem de benchmark ${Math.max(1, scenario.chatMessages - 199)}:`, { exact: false }).waitFor();
          console.log(`Após carregar anteriores: ${await page.getByTestId("painel-chat-scroll").locator('[id^="feed-card-"]').count()} cartões montados`);
        }
        if (i === 0) {
          await page.locator('.rv-ferramentas .rv-ferr-btn[aria-label^="Terreno"]').click();
          await page.locator('.rv-fp-opcao[data-tipo="dificil"]').click();
          await page.locator(".rv-camada-grade path").nth(230).dispatchEvent("pointerdown", { button: 0 });
          await page.locator(".rv-camada-grade path").nth(231).dispatchEvent("pointerover", { button: 0 });
          await page.locator("body").dispatchEvent("pointerup", { button: 0 });
          await page.waitForFunction(() =>
            document.querySelectorAll(".rv-camada-terreno-real .rv-terreno-real--dificil").length >= 2);
          await page.locator('.rv-ferramentas .rv-ferr-btn[aria-label^="Medir"]').click();
          const from = await page.locator(".rv-camada-grade path").nth(230).boundingBox();
          const to = await page.locator(".rv-camada-grade path").nth(231).boundingBox();
          if (!from || !to) throw new Error("Células de medição sem posição");
          await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
          await page.mouse.down();
          await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 4 });
          await page.locator(".rv-camada-medicao").waitFor();
          await page.mouse.up();
          console.log("Gestos de terreno e medição: OK");
          if (process.env.VTT_GRID_CHECK_ONLY === "1") break;
        }
      }
      if (diceCycles && process.env.VTT_GRID_CHECK_ONLY !== "1") {
        console.log(`\nRolagens 3D repetidas (${diceCycles}):`);
        await page.locator('.rv-ferr-btn[data-janela-id="dados"]').click();
        const dicePanel = page.getByTestId("painel-dados");
        await dicePanel.waitFor();
        await dicePanel.getByRole("tab", { name: /Livre/i }).click();
        await dicePanel.getByRole("button", { name: "Adicionar d8" }).click();
        for (let cycle = 1; cycle <= diceCycles; cycle++) {
          await dicePanel.getByRole("button", { name: /^Rolar (1d8|de novo)/i }).click();
          await page.getByTestId("physics-dice-arena").waitFor({ timeout: 15000 });
          await page.getByTestId("physics-dice-arena").waitFor({ state: "detached", timeout: 20000 });
          await cdp.send("HeapProfiler.collectGarbage");
          await printMemory(cdp, browserSession, `Após rolagem ${cycle}/${diceCycles}`);
        }
        await page.locator('.rv-ferr-btn[data-janela-id="dados"]').click();
        await dicePanel.waitFor({ state: "detached" });
        await cdp.send("HeapProfiler.collectGarbage");
        await printMemory(cdp, browserSession, "Após fechar painel de dados");
      }
      if (sheetCycles && process.env.VTT_GRID_CHECK_ONLY !== "1") {
        console.log(`\nAbertura e fechamento de ficha (${sheetCycles}):`);
        await page.getByTestId("painel-aba-personagens").click();
        const characterRow = page.getByTestId("painel-personagens-linha").first();
        await characterRow.waitFor({ timeout: 30000 });
        for (let cycle = 1; cycle <= sheetCycles; cycle++) {
          await characterRow.click();
          const sheet = page.getByTestId("console-window");
          await sheet.waitFor({ timeout: 60000 });
          await page.getByTestId("console-pericia-balistica").waitFor({ timeout: 60000 });
          await cdp.send("HeapProfiler.collectGarbage");
          await printMemory(cdp, browserSession, `Ficha aberta ${cycle}/${sheetCycles}`);
          await sheet.getByRole("button", { name: "Fechar console" }).click();
          await sheet.waitFor({ state: "detached" });
          await page.waitForTimeout(300);
          await cdp.send("HeapProfiler.collectGarbage");
          await printMemory(cdp, browserSession, `Ficha fechada ${cycle}/${sheetCycles}`);
        }
      }
      if (process.env.VTT_GRID_CHECK_ONLY !== "1" && process.env.VTT_SKIP_SWITCH !== "1") {
        console.log("\nTroca de cenas na mesma mesa (após coleta de lixo de diagnóstico):");
        for (let cycle = 1; cycle <= 5; cycle++) {
          for (const [name, cells] of [["Alternativa do benchmark", 468], ["Benchmark 60×40", 2400]] as const) {
            if (!(await page.locator('[data-testid="janela-cenas"]').isVisible().catch(() => false))) {
              await page.locator('[data-testid="cena-chip"]').click();
            }
            await page.locator('[data-testid="cena-cartao"]').filter({ hasText: name })
              .locator('[data-testid="cena-abrir"]').click();
            await page.waitForFunction((expected) =>
              document.querySelectorAll(".rv-camada-grade path").length === expected, cells);
            await page.waitForTimeout(300);
            if (name === "Alternativa do benchmark" && (cycle === 1 || cycle === 5)) {
              await cdp.send("HeapProfiler.collectGarbage");
              await printMemory(cdp, browserSession, `Cena sem fundo ${cycle}/5`);
            }
          }
          await cdp.send("HeapProfiler.collectGarbage");
          await printMemory(cdp, browserSession, `Retorno à cena grande ${cycle}/5`);
        }
      }
      await cdp.detach();
      await context.close();
    } finally {
      await browser.close();
    }
  } finally {
    await cleanup();
  }
}

main().catch((error) => {
  console.error("Benchmark falhou:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
