/** Diagnóstico local: imprime apenas claims e status dos joins privados. */
import { readFileSync } from "node:fs";
import { chromium } from "playwright";
import { config as loadDotenv } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { BASE_URL, SESSION_FILE } from "./authSession";

loadDotenv({ path: ".env.local" });

const state = JSON.parse(readFileSync(SESSION_FILE, "utf8"));
for (const cookie of state.cookies) {
  if (cookie.name === "ruptura_auth") cookie.expires = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60;
}

function claims(token: unknown) {
  if (typeof token !== "string") return { token: "ausente" };
  if (token.startsWith("sb_publishable_")) return { token: "chave pública sb_publishable" };
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8"));
    return { role: payload.role, iss: payload.iss, exp: payload.exp, sub: payload.sub ? "presente" : "ausente" };
  } catch {
    return { token: "ilegível", tamanho: token.length };
  }
}

const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ storageState: state });
  const page = await context.newPage();
  let privateJoins = 0;
  let sockets = 0;
  let joinsSemAuth = 0;
  let respostasErro = 0;
  const topicos = new Set<string>();
  const topicosInscritos = new Set<string>();
  page.on("websocket", (ws) => {
    sockets++;
    ws.on("framesent", (frame) => {
      try {
        const raw = JSON.parse(frame.payload.toString());
        const msg = Array.isArray(raw) ? { topic: raw[2], event: raw[3], payload: raw[4] } : raw;
        if (msg.event !== "phx_join" || !msg.payload?.config?.private) return;
        privateJoins++;
        topicos.add(msg.topic);
        if (claims(msg.payload.access_token).role !== "authenticated") joinsSemAuth++;
        console.log("join", msg.topic, claims(msg.payload.access_token));
      } catch { /* frame binário ou não JSON */ }
    });
    ws.on("framereceived", (frame) => {
      try {
        const raw = JSON.parse(frame.payload.toString());
        const msg = Array.isArray(raw) ? { topic: raw[2], event: raw[3], payload: raw[4] } : raw;
        if (msg.event !== "phx_reply" || !msg.payload?.status || !topicos.has(msg.topic)) return;
        if (msg.payload.status === "ok") topicosInscritos.add(msg.topic);
        if (msg.payload.status === "error") {
          respostasErro++;
          console.log("reply erro", msg.topic, msg.payload.response);
        }
      } catch { /* frame binário ou não JSON */ }
    });
  });

  await page.goto(`${BASE_URL}/mesas`, { waitUntil: "domcontentloaded" });
  const hrefs = await page.locator("a[href]").evaluateAll((links) => links.map((a) => a.getAttribute("href") ?? ""));
  const campaignId = hrefs.map((href) => href.match(/^\/mesas\/([0-9a-f-]{36})(?:\/|$)/i)?.[1]).find(Boolean);
  if (!campaignId) throw new Error(`Campanha não encontrada em /mesas (URL atual: ${page.url()})`);
  await page.goto(`${BASE_URL}/mesas/${campaignId}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(10_000);
  console.log("pagina", page.url());
  console.log("texto", (await page.locator("body").innerText()).slice(0, 200));
  console.log("joins privados", privateJoins);
  console.log("tópicos inscritos", topicosInscritos.size, "de", topicos.size);
  console.log("sockets", sockets);
  console.log("auth aplicada", await page.evaluate(() => (window as unknown as { __rupturaRealtimeAuth?: unknown }).__rupturaRealtimeAuth));
  if (privateJoins === 0 || joinsSemAuth > 0 || respostasErro > 0 || topicosInscritos.size !== topicos.size) {
    throw new Error(`Realtime privado falhou: joins=${privateJoins}, sem auth=${joinsSemAuth}, erros=${respostasErro}, inscritos=${topicosInscritos.size}/${topicos.size}`);
  }

  // A correção do client não pode abrir o mesmo canal para visitantes.
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL/SUPABASE_ANON_KEY ausentes");
  const anon = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const canalAnon = anon.channel(`presence:campaign:${campaignId}`, { config: { private: true } });
  try {
    const statusAnon = await new Promise<string>((resolve) => {
      const timeout = setTimeout(() => resolve("TIMED_OUT"), 8000);
      canalAnon.subscribe((status) => {
        if (status === "CHANNEL_ERROR" || status === "SUBSCRIBED") {
          clearTimeout(timeout);
          resolve(status);
        }
      });
    });
    console.log("join anônimo", statusAnon);
    if (statusAnon !== "CHANNEL_ERROR") throw new Error(`Canal privado aceitou ou não avaliou visitante: ${statusAnon}`);
  } finally {
    await Promise.race([
      anon.removeChannel(canalAnon),
      new Promise((resolve) => setTimeout(resolve, 2000)),
    ]);
    await anon.realtime.disconnect();
  }
} finally {
  await browser.close();
}
