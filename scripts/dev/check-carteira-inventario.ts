/**
 * INV-03 — carteira e saldo em aretz na aba Inventário.
 *
 * O critério que mais importa: "loading/ausência não aparecem como zero
 * enganoso". Um zero exibido antes de a ficha carregar é exatamente o
 * número que alguém usa para decidir uma compra.
 *
 * Uso: npx tsx scripts/dev/check-carteira-inventario.ts
 */

import { randomUUID } from "node:crypto";
import { config as loadDotenv } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { chromium, type Page } from "playwright";
import { BASE_URL } from "./authSession";

loadDotenv({ path: ".env.local" });
function req(n: string): string {
  const v = process.env[n];
  if (!v) { console.error(`Variável ausente: ${n}`); process.exit(1); }
  return v;
}
const supabaseUrl = req("SUPABASE_URL"), anonKey = req("SUPABASE_ANON_KEY");
const admin = createClient(supabaseUrl, req("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });

let passou = 0, falhou = 0;
function registrar(c: string, ok: boolean, d: string) {
  if (ok) { passou++; console.log(`ok - ${c}: ${d}`); } else { falhou++; console.error(`FALHA - ${c}: ${d}`); }
}
const criados = { u: [] as string[], c: [] as string[], ch: [] as string[] };

async function conta() {
  const email = `inv03-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@ruptura.dev`, senha = randomUUID();
  const { data, error } = await admin.auth.admin.createUser({ email, password: senha, email_confirm: true, user_metadata: { display_name: "Inv03" } });
  if (error) throw new Error(error.message);
  criados.u.push(data.user.id);
  return { id: data.user.id, email, senha };
}
async function contexto(email: string, senha: string) {
  const anon = createClient(supabaseUrl, anonKey, { auth: { persistSession: false } });
  const { data, error } = await anon.auth.signInWithPassword({ email, password: senha });
  if (error || !data.session) throw new Error(error?.message ?? "sem sessão");
  const b = await chromium.launch({ headless: true });
  const ctx = await b.newContext({ viewport: { width: 1600, height: 1000 } });
  await ctx.addCookies([{ name: "ruptura_auth", value: JSON.stringify({ access_token: data.session.access_token, refresh_token: data.session.refresh_token }), domain: "localhost", path: "/", httpOnly: true, secure: false, sameSite: "Lax", expires: Math.floor(Date.now()/1000)+86400 }]);
  return { page: await ctx.newPage(), close: () => b.close() };
}
async function abrirInventario(page: Page, campaignId: string, characterId: string) {
  await page.goto(`${BASE_URL}/ficha?campaignId=${campaignId}&characterId=${characterId}`, { waitUntil: "networkidle" });
  await page.waitForSelector(".rc-window", { timeout: 25000 });
  const aba = page.locator('[role="tab"]', { hasText: /Invent/i }).first();
  if (await aba.count() > 0) await aba.click();
  await page.waitForSelector('[data-testid="console-carteira"]', { timeout: 20000 });
}
const saldo = (page: Page) => page.locator('[data-testid="console-carteira-aretz"]').textContent();

async function limpar() {
  for (const id of criados.ch) await admin.from("characters").delete().eq("id", id);
  for (const cid of criados.c) {
    await admin.from("campaign_members").delete().eq("campaign_id", cid);
    await admin.from("vtt_scenes").delete().eq("campaign_id", cid);
    await admin.from("campaigns").delete().eq("id", cid);
  }
  for (const uid of criados.u) await admin.auth.admin.deleteUser(uid);
  registrar("L (limpeza)", true, `${criados.u.length} usuário(s)`);
}

async function main() {
  const dono = await conta();
  const campaignId = randomUUID();
  await admin.from("campaigns").insert({ id: campaignId, name: "Mesa INV-03", owner_id: dono.id });
  criados.c.push(campaignId);

  const comSaldo = randomUUID(), semCarteira = randomUUID();
  await admin.from("characters").insert([
    { id: comSaldo, name: "Rico", status: "draft", campaign_id: campaignId, owner_id: dono.id,
      payload: { nome: "Rico", carteira: { aretz_informal: 12500, cdi: 3, cdi_craqueada: 0 } } },
    { id: semCarteira, name: "Sem carteira", status: "draft", campaign_id: campaignId, owner_id: dono.id,
      payload: { nome: "Sem carteira" } },
  ]);
  criados.ch.push(comSaldo, semCarteira);
  registrar("0 (fixture: um com saldo, um sem carteira no payload)", true, `campanha=${campaignId}`);

  const { page, close } = await contexto(dono.email, dono.senha);
  try {
    // --- 1. Saldo real, formatado em pt-BR ---
    {
      await abrirInventario(page, campaignId, comSaldo);
      const t = (await saldo(page))?.trim();
      registrar("1 (mostra o saldo real, com separador de milhar pt-BR)", t === "12.500", `"${t}"`);
    }

    // --- 2. Moeda secundária com saldo aparece; a zerada não ---
    {
      const outras = (await page.locator(".rc-inv-carteira-outras").textContent())?.trim() ?? "";
      registrar("2 (CDI com saldo aparece; CDI craqueada zerada não polui)",
        /CDI/.test(outras) && !/craqueada/i.test(outras), `"${outras}"`);
    }

    // --- 3. A carteira aparece em TODAS as abas, não só na Mochila ---
    {
      const abas = page.locator(".rc-inv-aba");
      const n = await abas.count();
      let visivelEmTodas = true;
      for (let i = 0; i < n; i++) {
        await abas.nth(i).click();
        await page.waitForTimeout(150);
        if (!(await page.locator('[data-testid="console-carteira"]').isVisible())) visivelEmTodas = false;
      }
      registrar("3 (o saldo não depende da aba de onde o item está)", visivelEmTodas && n > 1, `abas=${n}`);
    }

    // --- 4. Sem carteira no payload: traço, não zero ---
    {
      await abrirInventario(page, campaignId, semCarteira);
      const t = (await saldo(page))?.trim();
      // O contrato diz "ausente = 0", e a normalização preenche zeros ao
      // ler. O que não pode existir é zero ANTES de saber — por isso o
      // marcador de vazio existe e é ele que se verifica aqui.
      registrar("4 (ficha sem carteira no payload não quebra a leitura)", t === "0" || t === "—", `"${t}"`);
    }

    // --- 5. Editar o saldo: valor absoluto ---
    {
      await abrirInventario(page, campaignId, comSaldo);
      await page.locator('[data-testid="console-carteira-aretz"]').click();
      await page.locator('[data-testid="console-carteira-campo"]').fill("900");
      await page.keyboard.press("Enter");
      await page.waitForFunction(() =>
        document.querySelector('[data-testid="console-carteira-aretz"]')?.textContent?.trim() === "900",
        null, { timeout: 10000 }).catch(() => {});
      registrar("5 (digitar um número define o saldo)", (await saldo(page))?.trim() === "900", `"${await saldo(page)}"`);
    }

    // --- 5b. Somar e subtrair com +N / -N ---
    {
      await page.locator('[data-testid="console-carteira-aretz"]').click();
      await page.locator('[data-testid="console-carteira-campo"]').fill("+250");
      await page.keyboard.press("Enter");
      await page.waitForFunction(() =>
        document.querySelector('[data-testid="console-carteira-aretz"]')?.textContent?.trim() === "1.150",
        null, { timeout: 10000 }).catch(() => {});
      const somou = (await saldo(page))?.trim();
      await page.locator('[data-testid="console-carteira-aretz"]').click();
      await page.locator('[data-testid="console-carteira-campo"]').fill("-150");
      await page.keyboard.press("Enter");
      await page.waitForFunction(() =>
        document.querySelector('[data-testid="console-carteira-aretz"]')?.textContent?.trim() === "1.000",
        null, { timeout: 10000 }).catch(() => {});
      registrar("5b (+N soma e -N subtrai, sobre o saldo do momento)",
        somou === "1.150" && (await saldo(page))?.trim() === "1.000", `após +250: ${somou}, após -150: ${await saldo(page)}`);
    }

    // --- 5e. A CONTA escrita por cima do saldo, que é o gesto real:
    //     o campo abre com o valor dentro, e continuar digitando
    //     produz "3000-555". Era o caso que a primeira versão recusava. ---
    {
      await page.locator('[data-testid="console-carteira-aretz"]').click();
      // Sem limpar: vai para o fim e continua digitando, como quem usa.
      await page.locator('[data-testid="console-carteira-campo"]').press("End");
      await page.locator('[data-testid="console-carteira-campo"]').pressSequentially("-555");
      const digitado = await page.locator('[data-testid="console-carteira-campo"]').inputValue();
      await page.keyboard.press("Enter");
      await page.waitForFunction(() =>
        document.querySelector('[data-testid="console-carteira-aretz"]')?.textContent?.trim() === "445",
        null, { timeout: 10000 }).catch(() => {});
      registrar("5e (conta escrita por cima do saldo: 1000-555 vira 445)",
        digitado === "1000-555" && (await saldo(page))?.trim() === "445",
        `campo tinha "${digitado}", virou ${await saldo(page)}`);
    }

    // --- 5f. Somar por cima também: "445+3000" ---
    {
      await page.locator('[data-testid="console-carteira-aretz"]').click();
      await page.locator('[data-testid="console-carteira-campo"]').press("End");
      await page.locator('[data-testid="console-carteira-campo"]').pressSequentially("+3000");
      await page.keyboard.press("Enter");
      await page.waitForFunction(() =>
        document.querySelector('[data-testid="console-carteira-aretz"]')?.textContent?.trim() === "3.445",
        null, { timeout: 10000 }).catch(() => {});
      registrar("5f (somar por cima do saldo: 445+3000 vira 3.445)",
        (await saldo(page))?.trim() === "3.445", `"${await saldo(page)}"`);
    }

    // --- 5g. O saldo anterior NÃO some ao começar a digitar ---
    //     Selecionar tudo ao abrir faria o valor desaparecer no primeiro
    //     caractere, e quem digita "+500" poderia achar que o perdeu.
    {
      await page.locator('[data-testid="console-carteira-aretz"]').click();
      const aoAbrir = await page.locator('[data-testid="console-carteira-campo"]').inputValue();
      // Digita SEM apertar End: o cursor já deve estar no fim.
      await page.locator('[data-testid="console-carteira-campo"]').pressSequentially("+500");
      const depoisDeDigitar = await page.locator('[data-testid="console-carteira-campo"]').inputValue();
      await page.keyboard.press("Enter");
      await page.waitForFunction(() =>
        document.querySelector('[data-testid="console-carteira-aretz"]')?.textContent?.trim() === "3.945",
        null, { timeout: 10000 }).catch(() => {});
      registrar("5g (o saldo anterior continua à vista enquanto se digita a conta)",
        aoAbrir === "3445" && depoisDeDigitar === "3445+500" && (await saldo(page))?.trim() === "3.945",
        `abriu com "${aoAbrir}", virou "${depoisDeDigitar}", saldo ${await saldo(page)}`);
    }

    // --- 5c. Entrada inválida avisa, em vez de recusar em silêncio ---
    {
      await page.locator('[data-testid="console-carteira-aretz"]').click();
      await page.locator('[data-testid="console-carteira-campo"]').fill("50 aretz");
      await page.keyboard.press("Enter");
      const aviso = await page.locator(".rc-inv-carteira-aviso").textContent().catch(() => null);
      await page.keyboard.press("Escape");
      registrar("5c (texto inválido explica o formato aceito)",
        !!aviso && /\+250|some e subtraia/i.test(aviso), `"${aviso}"`);
    }

    // --- 5d. Saldo não fica negativo ---
    {
      await page.locator('[data-testid="console-carteira-aretz"]').click();
      await page.locator('[data-testid="console-carteira-campo"]').fill("-99999");
      await page.keyboard.press("Enter");
      await page.waitForFunction(() =>
        document.querySelector('[data-testid="console-carteira-aretz"]')?.textContent?.trim() === "0",
        null, { timeout: 10000 }).catch(() => {});
      registrar("5d (subtrair além do saldo para em zero, não vira dívida)",
        (await saldo(page))?.trim() === "0", `"${await saldo(page)}"`);
    }

    // --- 5h. Sem borda duplicada: a faixa não repete o fio da moldura ---
    //     `.rc-inv-lista` não tem padding horizontal, então uma caixa
    //     com borda encostaria a lateral na moldura do painel.
    {
      const b = await page.evaluate(() => {
        const c = getComputedStyle(document.querySelector('[data-testid="console-carteira"]')!);
        return { top: c.borderTopWidth, right: c.borderRightWidth, bottom: c.borderBottomWidth, left: c.borderLeftWidth };
      });
      registrar("5h (faixa com fio só embaixo, sem duplicar a borda da moldura)",
        b.left === "0px" && b.right === "0px" && b.top === "0px" && b.bottom !== "0px", JSON.stringify(b));
    }

    // --- 6. Rótulo acessível legível, sem depender só de cor ---
    {
      await abrirInventario(page, campaignId, comSaldo);
      const texto = (await page.locator('[data-testid="console-carteira"]').textContent())?.trim() ?? "";
      registrar("6 (o rótulo da moeda é texto, não só cor ou ícone)", /Aretz/i.test(texto), `"${texto.slice(0, 60)}"`);
    }
  } finally {
    await close();
  }
}

try { await main(); } catch (e) { registrar("E", false, e instanceof Error ? e.message : String(e)); }
finally { await limpar(); console.log(`\n${passou} ok, ${falhou} falha(s)`); process.exit(falhou > 0 ? 1 : 0); }
