/**
 * Diagnóstico + regressão do modal "Adicionar token"/"Editar token"
 * que ocasionalmente não fechava.
 *
 * As 21 primeiras checagens (A–M) hostilizam TODAS as formas de abrir/
 * fechar listadas no pedido original — nenhuma delas reproduziu nada:
 * o CONTRATO de fechamento (X/Cancelar/backdrop/Esc → `fecharGerenciador`
 * → `setFluxoToken(null)`) sempre esteve correto. Depois de CADA
 * cenário confirma três coisas — nunca só "o modal sumiu":
 *
 *  1. `.rv-gerenciador-token` e `.rv-modal-fundo` estão AUSENTES do DOM;
 *  2. um elemento conhecido do mapa (botão "Interagir" da barra) é
 *     genuinamente CLICÁVEL — clica de verdade e confirma o efeito
 *     (`aria-pressed` mudou) — detecta uma camada invisível bloqueando
 *     cliques que `count()===0` sozinho não pegaria;
 *  3. nenhum erro/warning novo no console.
 *
 * A CAUSA REAL (seção "REDE") não estava no fechamento — estava em
 * `criarTokenAction(...).then(...)` (`VttClient.tsx::confirmarPosicionamento`)
 * e no `await onConfirmarEdicao(...)` de `GerenciadorToken.tsx::confirmar`
 * sem `.catch()`/`try`: uma Server Action que REJEITA (queda de rede,
 * reproduzida abortando de propósito a requisição via `page.route`)
 * nunca chegava ao código que desligava `enviando`/`fluxoToken` —
 * ficava travado em "enviando" pra sempre, sem Esc (o listener nem
 * está registrado nessa fase) nem botão (todos desabilitados por
 * `enviando`). Corrigido com `.catch()`/`try-catch` tratando a rejeição
 * exatamente como um `{ok:false}` normal.
 *
 * Rodada seguinte (janela flutuante não-modal, seção 7 do pedido):
 * `.rv-modal-fundo` deixou de existir pra este componente — cenário D
 * foi invertido (clicar no mapa NUNCA mais fecha automaticamente,
 * porque não há mais backdrop escutando esse clique). Cenário P prova
 * a PRECISÃO pedida na seção 2: a fase "configurando" (CRIAR, antes de
 * "Continuar para posicionar") é estruturalmente IMPOSSÍVEL de travar
 * por queda de rede — zero requisições saem dela, não é só resiliência
 * a falha. Cenários Q–U cobrem o novo comportamento de janela: sem
 * `aria-modal`/`role="dialog"`, arraste pelo cabeçalho (nunca por um
 * campo), foco livre pra sair via Tab, scroll interno + pan do mapa
 * simultâneos, e reposicionamento ao encolher a viewport.
 *
 * Uso: npx tsx scripts/dev/check-vtt-modal-diagnostico.ts (servidor
 * dev já rodando em localhost:3000).
 */

import { randomUUID } from "node:crypto";
import { config as loadDotenv } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import type { ConsoleMessage } from "playwright";
import { chromium, type Page } from "playwright";
import { BASE_URL } from "./authSession";

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
  return true;
}

let campaignId: string | null = null;
let narradorEmail: string | null = null;
let narradorSenha: string | null = null;
const criados = { usuarios: [] as string[], campanhas: [] as string[] };

async function configurarFixture(): Promise<void> {
  campaignId = randomUUID();
  const email = `check-vtt-modal-${Date.now()}@ruptura.dev`;
  const senha = randomUUID();
  const { data, error } = await admin.auth.admin.createUser({ email, password: senha, email_confirm: true, user_metadata: { display_name: "Narrador Modal" } });
  if (error) throw new Error(`Falha ao criar narrador fixture: ${error.message}`);
  narradorEmail = email; narradorSenha = senha;
  criados.usuarios.push(data.user.id);
  const { error: e1 } = await admin.from("campaigns").insert({ id: campaignId, name: "VTT Modal", owner_id: data.user.id });
  if (e1) throw new Error(`Falha ao criar campanha: ${e1.message}`);
  criados.campanhas.push(campaignId);
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

/** Confirma que o mapa/barra por baixo continua genuinamente funcional — não só "o modal sumiu do DOM". */
async function confirmarMapaFuncional(page: Page, rotulo: string) {
  const modalPresente = (await page.locator(".rv-gerenciador-token").count()) > 0;
  const backdropPresente = (await page.locator(".rv-modal-fundo").count()) > 0;
  const botao = page.locator('.rv-ferramentas .rv-ferr-btn[aria-label^="Interagir"]');
  const antes = await botao.getAttribute("aria-pressed");
  let clicavel = false;
  try {
    await botao.click({ timeout: 2000 });
    await page.waitForTimeout(80);
    clicavel = true;
  } catch { clicavel = false; }
  registrar(
    rotulo,
    !modalPresente && !backdropPresente && clicavel,
    `modalPresente=${modalPresente}, backdropPresente=${backdropPresente}, botãoClicável=${clicavel} (aria-pressed antes="${antes}")`,
  );
}

async function main() {
  await configurarFixture();
  registrar("0 (fixture)", true, `campanha=${campaignId}`);

  const anon = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: sess } = await anon.auth.signInWithPassword({ email: narradorEmail!, password: narradorSenha! });
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 950 } });
  await context.addCookies([{
    name: "ruptura_auth",
    value: JSON.stringify({ access_token: sess!.session!.access_token, refresh_token: sess!.session!.refresh_token }),
    domain: "localhost", path: "/", httpOnly: true, secure: false, sameSite: "Lax",
    expires: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7,
  }]);
  const page = await context.newPage();
  const erros: string[] = [];
  // `net::ERR_FAILED` é o efeito colateral ESPERADO de `route.abort()`
  // nos cenários N/O (fault injection de propósito) — só ignorado
  // enquanto essa flag está ligada, nunca de forma incondicional (um
  // ERR_FAILED de verdade, fora dessas janelas, ainda reprova a suíte).
  let abortandoDeProposito = false;
  page.on("console", (m) => {
    if (abortandoDeProposito && m.text().includes("net::ERR_FAILED")) return;
    if (erroRelevante(m)) erros.push(m.text().slice(0, 500));
  });
  // Com a mensagem sozinha ("Failed to fetch" ×4) não dá pra saber QUAL
  // chamada ficou sem tratamento — o primeiro quadro do stack é o que
  // transforma a falha num endereço.
  //
  // Mesma exceção do `net::ERR_FAILED` acima, e pelo mesmo motivo: ao
  // abortar um Server Action, o PRÓPRIO Next rejeita internamente em
  // `fetchServerAction` (dentro de `node_modules_next_dist_client`), e
  // essa rejeição chega em `pageerror` mesmo quando o app trata a falha
  // — é o que N1/O1 provam ao ver a tela de erro aparecer. A isenção é
  // dupla de propósito: só enquanto a injeção de falha está ligada E só
  // se o stack for do próprio framework. Uma rejeição solta do código
  // do app (stack em `/mesas/…`) continua reprovando a suíte.
  page.on("pageerror", (e) => {
    const stack = e.stack ?? "";
    const doFramework = stack.includes("fetchServerAction") || stack.includes("node_modules_next_dist");
    if (abortandoDeProposito && doFramework) return;
    const quadro = stack.split("\n").slice(1, 3).map((l) => l.trim()).join(" ← ");
    erros.push(`pageerror: ${e.message}${quadro ? ` @ ${quadro}` : ""}`);
  });
  const url = `${BASE_URL}/mesas/${campaignId}/vtt`;
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForSelector(".rv-ferramentas", { timeout: 15000 });

  async function abrirPorBotaoBarra() {
    await page.locator('.rv-ferr-btn[aria-label="Adicionar token"]').click();
    await page.waitForSelector(".rv-gerenciador-token", { timeout: 5000 });
  }
  // O painel lateral NUNCA teve um "Adicionar token" — a aba
  // Personagens é onde se arrasta ficha pro mapa, não onde se cria
  // token avulso. As duas portas reais são a barra de ferramentas e o
  // menu contextual do hex vazio; este helper existia mirando uma
  // terceira que não chegou a ser construída.
  async function abrirComOPainelAberto() {
    await page.locator('.rv-aba[aria-label="Personagens"]').click();
    await page.waitForTimeout(150);
    await abrirPorBotaoBarra();
  }
  async function abrirPorMenuContextual() {
    await page.locator('.rv-ferramentas .rv-ferr-btn[aria-label^="Interagir"]').click();
    const box = await page.locator(".rv-camada-grade path").nth(60).boundingBox();
    await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2, { button: "right" });
    await page.locator(".rv-menu-item", { hasText: "Adicionar token" }).click();
    await page.waitForSelector(".rv-gerenciador-token", { timeout: 5000 });
  }

  // --- A: abrir/fechar 20× em sequência via botão + X, sem sujar o formulário ---
  {
    let todasOk = true;
    for (let i = 0; i < 20; i++) {
      await abrirPorBotaoBarra();
      await page.locator('.rv-gerenciador-token .rv-fp-fechar[aria-label="Fechar"]').click();
      const sumiu = await page.waitForSelector(".rv-gerenciador-token", { state: "detached", timeout: 3000 }).then(() => true).catch(() => false);
      if (!sumiu) { todasOk = false; console.error(`  iteração ${i + 1}: modal não fechou`); break; }
    }
    registrar("A (abrir/fechar 20× via botão+X, sem sujar)", todasOk, `todasOk=${todasOk}`);
    await confirmarMapaFuncional(page, "A-mapa (mapa funcional depois das 20 iterações)");
  }

  // --- B: sujar o formulário, Cancelar, CANCELAR o confirm (permanece aberto), Cancelar de novo, ACEITAR (fecha) ---
  {
    await abrirPorBotaoBarra();
    await page.locator(".rv-gerenciador-token input[type=text]").first().fill("Rascunho Sujo");
    page.once("dialog", (d) => d.dismiss());
    await page.locator(".rv-gerenciador-token .rv-btn--ghost", { hasText: "Cancelar" }).click();
    await page.waitForTimeout(200);
    const permaneceuAberto = (await page.locator(".rv-gerenciador-token").count()) === 1;
    const nomeIntacto = await page.locator(".rv-gerenciador-token input[type=text]").first().inputValue();
    registrar("B1 (cancelar o confirm de descarte mantém o modal aberto, com os dados intactos)", permaneceuAberto && nomeIntacto === "Rascunho Sujo", `aberto=${permaneceuAberto}, nome="${nomeIntacto}"`);

    page.once("dialog", (d) => d.accept());
    await page.locator(".rv-gerenciador-token .rv-btn--ghost", { hasText: "Cancelar" }).click();
    await page.waitForSelector(".rv-gerenciador-token", { state: "detached", timeout: 3000 }).catch(() => {});
    await confirmarMapaFuncional(page, "B2 (aceitar o descarte fecha de verdade, mapa funcional)");
  }

  // --- C: Esc com formulário limpo (fecha direto) e Esc com formulário sujo (confirm) ---
  {
    await abrirPorBotaoBarra();
    await page.keyboard.press("Escape");
    await confirmarMapaFuncional(page, "C1 (Esc sem alterações fecha direto)");

    await abrirPorBotaoBarra();
    await page.locator(".rv-gerenciador-token input[type=text]").first().fill("Esc Sujo");
    page.once("dialog", (d) => d.accept());
    await page.keyboard.press("Escape");
    await page.waitForSelector(".rv-gerenciador-token", { state: "detached", timeout: 3000 }).catch(() => {});
    await confirmarMapaFuncional(page, "C2 (Esc com alterações + aceitar descarte fecha, mapa funcional)");
  }

  // --- D: janela NÃO é mais modal — clicar fora dela (no mapa) NUNCA
  // fecha automaticamente (mudança de comportamento desta rodada,
  // seção 7: "selecionar ou interagir com o mapa não deve fechar a
  // janela automaticamente"). Também confirma que o clique de verdade
  // CHEGA ao mapa (nada invisível intercepta) e que fechar por X
  // continua funcionando depois. ---
  {
    await abrirPorBotaoBarra();
    const semBackdrop = (await page.locator(".rv-modal-fundo").count()) === 0;
    // Clica numa célula do mapa que esteja REALMENTE descoberta — o
    // ponto do clique tem que resolver na própria célula, não em
    // nenhuma camada por cima. O índice fixo que estava aqui assumia
    // que a janela nascia encostada na borda DIREITA; ela passou a
    // nascer colada na barra de ferramentas, à ESQUERDA, e o "canto
    // oposto garantido" virou o canto DEBAixo dela. Procurar o ponto em
    // vez de presumi-lo é o que impede o critério de voltar a quebrar
    // quando a janela mudar de tamanho ou de âncora outra vez.
    const alvoLivre = await page.evaluate(() => {
      const celulas = Array.from(document.querySelectorAll(".rv-camada-grade path"));
      for (const c of celulas) {
        const r = c.getBoundingClientRect();
        const x = r.x + r.width / 2, y = r.y + r.height / 2;
        if (document.elementFromPoint(x, y) === c) return { x, y };
      }
      return null;
    });
    const elementoNoClique = alvoLivre && await page.evaluate(({ x, y }) => {
      const el = document.elementFromPoint(x, y);
      return el ? { tag: el.tagName, cls: el.getAttribute("class") } : null;
    }, alvoLivre);
    if (alvoLivre) await page.mouse.click(alvoLivre.x, alvoLivre.y);
    await page.waitForTimeout(150);
    const continuaAberta = (await page.locator(".rv-gerenciador-token").count()) === 1;
    registrar(
      "D1 (sem backdrop; clique no mapa chega de verdade nele — nenhuma camada invisível — e NÃO fecha a janela)",
      semBackdrop && continuaAberta && elementoNoClique?.cls === "rv-celula",
      `semBackdrop=${semBackdrop}, aberta=${continuaAberta}, elementoNoClique=${JSON.stringify(elementoNoClique)}`,
    );
    await page.locator('.rv-gerenciador-token .rv-fp-fechar[aria-label="Fechar"]').click();
    await page.waitForSelector(".rv-gerenciador-token", { state: "detached", timeout: 3000 }).catch(() => {});
    await confirmarMapaFuncional(page, "D2 (fechar por X depois de interagir com o mapa continua funcionando)");
  }

  // --- E: abrir pelo menu contextual, fechar por X ---
  {
    await abrirPorMenuContextual();
    await page.locator('.rv-gerenciador-token .rv-fp-fechar[aria-label="Fechar"]').click();
    await page.waitForSelector(".rv-gerenciador-token", { state: "detached", timeout: 3000 }).catch(() => {});
    await confirmarMapaFuncional(page, "E (abrir por menu contextual, fechar por X, mapa funcional)");
  }

  // --- F: abrir COM o painel lateral aberto, fechar por Cancelar
  // (sem sujar) — o painel ocupa a direita da tela e é o vizinho mais
  // provável de brigar por espaço/foco com a janela. ---
  {
    await abrirComOPainelAberto();
    await page.locator(".rv-gerenciador-token .rv-btn--ghost", { hasText: "Cancelar" }).click();
    await page.waitForSelector(".rv-gerenciador-token", { state: "detached", timeout: 3000 }).catch(() => {});
    await confirmarMapaFuncional(page, "F (com o painel lateral aberto, fechar por Cancelar, mapa funcional)");
    // fecha o painel de novo, deixa a UI limpa pros próximos cenários
    await page.locator('.rv-aba[aria-label="Personagens"]').click();
  }

  // --- G: "Continuar para posicionar" → "Voltar para editar" → fechar por X ---
  {
    await abrirPorBotaoBarra();
    await page.locator(".rv-gerenciador-token input[type=text]").first().fill("Volta Editar Fecha");
    await page.locator(".rv-gerenciador-token .rv-btn--pri", { hasText: "Continuar para posicionar" }).click();
    await page.waitForSelector(".rv-escolha-posicao", { timeout: 5000 });
    await page.waitForSelector(".rv-gerenciador-token", { state: "detached", timeout: 3000 });
    await page.locator(".rv-btn", { hasText: "Voltar para editar" }).click();
    await page.waitForSelector(".rv-gerenciador-token", { timeout: 5000 });
    await page.locator('.rv-gerenciador-token .rv-fp-fechar[aria-label="Fechar"]').click();
    // "Voltar para editar" preencheu de novo com "Volta Editar Fecha" — sujo=true de novo? Não: valoresIniciais AGORA é o próprio rascunho, então valores===valoresIniciais, sujo=false, fecha direto sem confirm.
    await page.waitForSelector(".rv-gerenciador-token", { state: "detached", timeout: 3000 }).catch(async () => {
      // se por acaso pedir confirmação (não deveria), aceita pra não travar o restante da suíte.
      await page.keyboard.press("Escape");
    });
    await confirmarMapaFuncional(page, "G (voltar-para-editar depois fechar, mapa funcional)");
  }

  // --- H: erro de validação (PV inválido) e depois fechar ---
  {
    await abrirPorBotaoBarra();
    await page.locator("summary", { hasText: "Identidade ampliada" }).click();
    const pvAtual = page.locator('.rv-gerenciador-token fieldset:has-text("Pontos de Vida") input').first();
    const pvMax = page.locator('.rv-gerenciador-token fieldset:has-text("Pontos de Vida") input').nth(1);
    await pvAtual.fill("50");
    await pvMax.fill("10");
    await page.waitForTimeout(150);
    page.once("dialog", (d) => d.accept());
    await page.locator(".rv-gerenciador-token .rv-btn--ghost", { hasText: "Cancelar" }).click();
    await page.waitForSelector(".rv-gerenciador-token", { state: "detached", timeout: 3000 }).catch(() => {});
    await confirmarMapaFuncional(page, "H (erro de validação, depois fechar, mapa funcional)");
  }

  // --- I: duplo clique no botão da barra ---
  {
    const botaoAbrir = page.locator('.rv-ferr-btn[aria-label="Adicionar token"]');
    await botaoAbrir.evaluate((el) => { (el as HTMLButtonElement).click(); (el as HTMLButtonElement).click(); });
    await page.waitForSelector(".rv-gerenciador-token", { timeout: 5000 });
    const quantos = await page.locator(".rv-gerenciador-token").count();
    await page.locator('.rv-gerenciador-token .rv-fp-fechar[aria-label="Fechar"]').click();
    await page.waitForSelector(".rv-gerenciador-token", { state: "detached", timeout: 3000 }).catch(() => {});
    await confirmarMapaFuncional(page, "I (duplo clique no botão abre só uma instância, fecha normalmente)");
    registrar("I-instancia (duplo clique nunca abre duas instâncias simultâneas)", quantos === 1, `instâncias=${quantos}`);
  }

  // --- J: duplo clique no X ---
  {
    await abrirPorBotaoBarra();
    const botaoX = page.locator('.rv-gerenciador-token .rv-fp-fechar[aria-label="Fechar"]');
    await botaoX.evaluate((el) => { (el as HTMLButtonElement).click(); (el as HTMLButtonElement).click(); });
    await page.waitForSelector(".rv-gerenciador-token", { state: "detached", timeout: 3000 }).catch(() => {});
    await confirmarMapaFuncional(page, "J (duplo clique no X fecha normalmente, sem reabrir)");
  }

  // --- K: trocar de ferramenta (teclado) enquanto o modal de configurar está aberto ---
  {
    await abrirPorBotaoBarra();
    await page.keyboard.press("m"); // atalho de Medir — não deveria fazer nada estranho: backdrop bloqueia o mapa
    await page.waitForTimeout(200);
    const aindaAberto = (await page.locator(".rv-gerenciador-token").count()) === 1;
    page.once("dialog", (d) => d.accept());
    await page.keyboard.press("Escape");
    await page.waitForSelector(".rv-gerenciador-token", { state: "detached", timeout: 3000 }).catch(() => {});
    await confirmarMapaFuncional(page, "K (atalho de ferramenta com modal aberto não quebra nada, fecha normalmente depois)");
    registrar("K-aberto (modal continua aberto durante a tentativa de troca de ferramenta)", aindaAberto, `aindaAberto=${aindaAberto}`);
  }

  // --- L: abrir, fechar, IMEDIATAMENTE abrir de novo por outro gatilho, fechar ---
  {
    await abrirPorBotaoBarra();
    await page.locator('.rv-gerenciador-token .rv-fp-fechar[aria-label="Fechar"]').click();
    // sem esperar o detached — abre de novo imediatamente por outro gatilho.
    await abrirPorMenuContextual();
    await page.locator(".rv-gerenciador-token .rv-btn--ghost", { hasText: "Cancelar" }).click();
    await page.waitForSelector(".rv-gerenciador-token", { state: "detached", timeout: 3000 }).catch(() => {});
    await confirmarMapaFuncional(page, "L (fechar e reabrir por outro gatilho sem esperar, sem estado preso)");
  }

  // --- M: abrir e navegar pra outra ferramenta ANTES de fechar, sem confirmar nada, várias vezes ---
  {
    for (let i = 0; i < 5; i++) {
      await abrirPorBotaoBarra();
      await page.locator('.rv-gerenciador-token .rv-fp-fechar[aria-label="Fechar"]').click();
      await page.waitForSelector(".rv-gerenciador-token", { state: "detached", timeout: 3000 }).catch(() => {});
    }
    await confirmarMapaFuncional(page, "M (5× abrir/fechar via X em sequência rápida, mapa funcional)");
  }

  // ═══════════════════════ REDE (a causa real) ═══════════════════════
  // Aborta de propósito a requisição da Server Action (mesma técnica
  // que reproduziu o bug antes da correção: `criarTokenAction`/
  // `editarTokenAction` REJEITANDO em vez de devolver `{ok:false}`) e
  // confirma que a fase "erro"/o formulário voltam a responder — nunca
  // mais um "enviando"/"Salvando…" travado sem Esc nem botão.
  async function abortarProximaServerAction(): Promise<() => Promise<boolean>> {
    let abortou = false;
    abortandoDeProposito = true;
    const handler = async (route: import("playwright").Route) => {
      const req = route.request();
      if (req.method() === "POST" && req.headers()["next-action"]) {
        abortou = true;
        await route.abort("failed");
        return;
      }
      await route.continue();
    };
    await page.route(url, handler);
    return async () => { await page.unroute(url, handler); abortandoDeProposito = false; return abortou; };
  }

  // --- N: falha de rede ao CRIAR (posicionamento → enviando) ---
  {
    await abrirPorBotaoBarra();
    await page.locator(".rv-gerenciador-token input[type=text]").first().fill("Rede Falha Criar");
    await page.locator(".rv-gerenciador-token .rv-btn--pri", { hasText: "Continuar para posicionar" }).click();
    await page.waitForSelector(".rv-escolha-posicao", { timeout: 5000 });
    const pararDeAbortar = await abortarProximaServerAction();

    const idx = 90;
    const box = await page.locator(".rv-camada-grade path").nth(idx).boundingBox();
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2, { steps: 3 });
    await page.waitForTimeout(150);
    await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);

    const virouErro = await page.waitForSelector('.rv-escolha-posicao[data-fase="erro"]', { timeout: 5000 }).then(() => true).catch(() => false);
    const abortou = await pararDeAbortar();
    registrar("N1 (falha de rede ao criar: fase vira 'erro', nunca fica presa em 'enviando')", abortou && virouErro, `abortou=${abortou}, virouErro=${virouErro}`);

    const cancelarHabilitado = !(await page.locator(".rv-btn", { hasText: "Cancelar (Esc)" }).isDisabled());
    registrar("N2 (depois da falha de rede, 'Cancelar' volta a ficar habilitado)", cancelarHabilitado, `habilitado=${cancelarHabilitado}`);

    await page.keyboard.press("Escape");
    const fechouComEsc = await page.waitForSelector(".rv-escolha-posicao", { state: "detached", timeout: 3000 }).then(() => true).catch(() => false);
    registrar("N3 (Esc volta a funcionar depois da falha de rede — antes da correção não fazia NADA nessa fase)", fechouComEsc, `fechou=${fechouComEsc}`);

    const { data: naoCriado } = await admin.from("vtt_tokens").select("id").eq("campaign_id", campaignId).eq("nome", "Rede Falha Criar");
    registrar("N4 (nada foi criado no banco pela tentativa que falhou)", (naoCriado ?? []).length === 0, `linhas=${(naoCriado ?? []).length}`);
    await confirmarMapaFuncional(page, "N5 (mapa funcional depois de toda a sequência de falha de rede)");
  }

  // --- O: falha de rede ao EDITAR (modo editar → enviando local) ---
  {
    // Cria um token de verdade pra editar.
    await abrirPorBotaoBarra();
    await page.locator(".rv-gerenciador-token input[type=text]").first().fill("Editável Rede");
    await page.locator(".rv-gerenciador-token .rv-btn--pri", { hasText: "Continuar para posicionar" }).click();
    await page.waitForSelector(".rv-escolha-posicao", { timeout: 5000 });
    const box = await page.locator(".rv-camada-grade path").nth(105).boundingBox();
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2, { steps: 3 });
    await page.waitForTimeout(150);
    await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await page.waitForSelector(".rv-escolha-posicao", { state: "detached", timeout: 5000 });
    const { data: tok } = await admin.from("vtt_tokens").select("id").eq("campaign_id", campaignId).eq("nome", "Editável Rede").single();

    await page.locator(`.rv-token[data-token-id="${tok!.id}"]`).click({ button: "right" });
    await page.locator(".rv-menu-item", { hasText: "Editar" }).click();
    await page.waitForSelector(".rv-gerenciador-token", { timeout: 5000 });
    await page.locator(".rv-gerenciador-token input[type=text]").first().fill("Editável Rede Alterado");

    const pararDeAbortar = await abortarProximaServerAction();
    await page.locator(".rv-gerenciador-token .rv-btn--pri", { hasText: "Salvar alterações" }).click();
    await page.waitForTimeout(800);
    const abortou = await pararDeAbortar();

    const erroVisivel = await page.locator(".rv-gerenciador-token .rv-form-aviso", { hasText: "Falha de rede" }).count();
    const modalAindaAberto = (await page.locator(".rv-gerenciador-token").count()) === 1;
    registrar("O1 (falha de rede ao editar: mostra erro, formulário continua aberto e usável)", abortou && erroVisivel > 0 && modalAindaAberto, `abortou=${abortou}, erroVisivel=${erroVisivel > 0}, aberto=${modalAindaAberto}`);

    const cancelarHabilitado = !(await page.locator(".rv-gerenciador-token .rv-btn--ghost", { hasText: "Cancelar" }).isDisabled());
    const salvarHabilitado = !(await page.locator(".rv-gerenciador-token .rv-btn--pri", { hasText: "Salvar alterações" }).isDisabled());
    registrar("O2 (depois da falha de rede, Cancelar e Salvar voltam a ficar habilitados — nunca presos em 'Salvando…')", cancelarHabilitado && salvarHabilitado, `cancelar=${cancelarHabilitado}, salvar=${salvarHabilitado}`);

    const aceitarDialogo = (d: import("playwright").Dialog) => { d.accept().catch(() => {}); };
    page.on("dialog", aceitarDialogo);
    await page.locator(".rv-gerenciador-token .rv-btn--ghost", { hasText: "Cancelar" }).click();
    await page.waitForSelector(".rv-gerenciador-token", { state: "detached", timeout: 3000 }).catch(() => {});
    page.off("dialog", aceitarDialogo);
    await confirmarMapaFuncional(page, "O3 (mapa funcional depois de toda a sequência de falha de rede na edição)");

    const { data: naoAlterado } = await admin.from("vtt_tokens").select("nome").eq("id", tok!.id).single();
    registrar("O4 (nome NÃO foi alterado no banco pela tentativa que falhou)", naoAlterado?.nome === "Editável Rede", `nome="${naoAlterado?.nome}"`);
  }

  // ═══════════ SEÇÃO 2 — precisão: a fase "configurando" (CRIAR,
  // antes de "Continuar para posicionar") NUNCA chama rede — não é só
  // "recupera de uma falha", é estruturalmente IMPOSSÍVEL travar por
  // queda de rede aqui, porque nenhum `await`/fetch acontece nesse
  // caminho. Prova isto abortando TODA Server Action da página inteira
  // enquanto mexe no formulário e clica "Continuar" — se alguma
  // requisição realmente saísse, o abort a pegaria; zero requisições
  // capturadas confirma a ausência estrutural, não só resiliência. ═══
  {
    let requisicoesVistas = 0;
    const handler = async (route: import("playwright").Route) => {
      const req = route.request();
      if (req.method() === "POST" && req.headers()["next-action"]) { requisicoesVistas++; await route.abort("failed"); return; }
      await route.continue();
    };
    await page.route(url, handler);

    await abrirPorBotaoBarra();
    await page.locator(".rv-gerenciador-token input[type=text]").first().fill("Config Sem Rede");
    await page.locator("summary", { hasText: "Identidade ampliada" }).click();
    await page.locator('.rv-gerenciador-token select[value], .rv-gerenciador-token select').first().selectOption({ index: 1 }).catch(() => {});
    await page.locator('.rv-gerenciador-token input[type=checkbox]').first().click().catch(() => {});
    await page.waitForTimeout(150);
    await page.locator(".rv-gerenciador-token .rv-btn--pri", { hasText: "Continuar para posicionar" }).click();
    const chegouAPosicionar = await page.waitForSelector(".rv-escolha-posicao", { timeout: 5000 }).then(() => true).catch(() => false);
    registrar(
      "P (fase 'configurando' nunca chama rede — zero requisições capturadas mesmo com TUDO abortado, 'Continuar' funciona igual)",
      requisicoesVistas === 0 && chegouAPosicionar,
      `requisiçõesVistas=${requisicoesVistas}, chegouAPosicionar=${chegouAPosicionar}`,
    );
    await page.unroute(url, handler);
    await page.keyboard.press("Escape");
    await page.waitForSelector(".rv-escolha-posicao", { state: "detached", timeout: 3000 }).catch(() => {});
  }

  // ═══════════ SEÇÃO 7 — janela flutuante (não-modal) ═══════════
  // --- Q: sem `aria-modal`, sem `role="dialog"` — título/descrição continuam associados ---
  {
    await abrirPorBotaoBarra();
    const janela = page.locator(".rv-gerenciador-token");
    const ariaModal = await janela.getAttribute("aria-modal");
    const role = await janela.getAttribute("role");
    const labelledby = await janela.getAttribute("aria-labelledby");
    const describedby = await janela.getAttribute("aria-describedby");
    const tituloExiste = labelledby ? (await page.locator(`#${labelledby}`).count()) > 0 : false;
    const descricaoExiste = describedby ? (await page.locator(`#${describedby}`).count()) > 0 : false;
    registrar(
      "Q (não-modal: sem aria-modal, sem role dialog, título/descrição ainda associados via aria-labelledby/describedby)",
      ariaModal === null && role === null && tituloExiste && descricaoExiste,
      `aria-modal=${ariaModal}, role=${role}, título associado=${tituloExiste}, descrição associada=${descricaoExiste}`,
    );
    await page.locator('.rv-gerenciador-token .rv-fp-fechar[aria-label="Fechar"]').click();
    await page.waitForSelector(".rv-gerenciador-token", { state: "detached", timeout: 3000 }).catch(() => {});
  }

  // --- R: arrastar pelo cabeçalho move a janela; campo de texto NÃO arrasta ---
  {
    await abrirPorBotaoBarra();
    const cab = page.locator(".rv-janela-token-cab");
    const antes = await page.locator(".rv-gerenciador-token").boundingBox();
    await page.mouse.move(antes!.x + 100, antes!.y + 15);
    await page.mouse.down();
    await page.mouse.move(antes!.x + 40, antes!.y + 120, { steps: 8 });
    await page.mouse.up();
    const depois = await page.locator(".rv-gerenciador-token").boundingBox();
    const moveu = Math.abs(depois!.x - antes!.x) > 30 || Math.abs(depois!.y - antes!.y) > 30;
    registrar("R1 (arrastar pelo cabeçalho move a janela de verdade)", moveu, `antes=(${antes!.x.toFixed(0)},${antes!.y.toFixed(0)}) depois=(${depois!.x.toFixed(0)},${depois!.y.toFixed(0)})`);

    // Arrastar a partir do campo Nome (dentro do corpo) não deveria mover a janela.
    const campo = await page.locator(".rv-gerenciador-token input[type=text]").first().boundingBox();
    const antesCampo = await page.locator(".rv-gerenciador-token").boundingBox();
    await page.mouse.move(campo!.x + 20, campo!.y + 8);
    await page.mouse.down();
    await page.mouse.move(campo!.x + 20, campo!.y + 100, { steps: 6 });
    await page.mouse.up();
    const depoisCampo = await page.locator(".rv-gerenciador-token").boundingBox();
    const naoMoveu = Math.abs(depoisCampo!.x - antesCampo!.x) < 2 && Math.abs(depoisCampo!.y - antesCampo!.y) < 2;
    registrar("R2 (arrastar a partir de um campo de formulário NÃO move a janela)", naoMoveu, `antes=(${antesCampo!.x.toFixed(0)},${antesCampo!.y.toFixed(0)}) depois=(${depoisCampo!.x.toFixed(0)},${depoisCampo!.y.toFixed(0)})`);

    await page.locator('.rv-gerenciador-token .rv-fp-fechar[aria-label="Fechar"]').click();
    await page.waitForSelector(".rv-gerenciador-token", { state: "detached", timeout: 3000 }).catch(() => {});
  }

  // --- S: Tab consegue SAIR da janela (sem foco preso) ---
  {
    await abrirPorBotaoBarra();
    // Alcança o ÚLTIMO controle focável da janela (o botão primário do rodapé) e dá mais um Tab.
    await page.locator(".rv-gerenciador-token .rv-btn--pri").focus();
    await page.keyboard.press("Tab");
    const focoSaiu = await page.evaluate(() => {
      const ativo = document.activeElement;
      const janela = document.querySelector(".rv-gerenciador-token");
      return !!ativo && !!janela && !janela.contains(ativo);
    });
    registrar("S (Tab a partir do último controle da janela sai dela — sem foco preso)", focoSaiu, `focoSaiu=${focoSaiu}`);
    await page.locator('.rv-gerenciador-token .rv-fp-fechar[aria-label="Fechar"]').click().catch(async () => {
      // se o foco saiu de fato, o botão de fechar ainda existe no DOM — clique direto por seletor, sem depender de foco.
      await page.locator(".rv-gerenciador-token .rv-fp-fechar").click();
    });
    await page.waitForSelector(".rv-gerenciador-token", { state: "detached", timeout: 3000 }).catch(() => {});
  }

  // --- T: scroll dentro do corpo funciona; pan do mapa (botão direito) continua fora da janela ---
  {
    await abrirPorBotaoBarra();
    await page.locator("summary", { hasText: "Identidade ampliada" }).click();
    const corpo = page.locator(".rv-janela-token-corpo");
    const scrollAntes = await corpo.evaluate((el) => el.scrollTop);
    const box = (await corpo.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.wheel(0, 400);
    await page.waitForTimeout(150);
    const scrollDepois = await corpo.evaluate((el) => el.scrollTop);
    registrar("T1 (scroll dentro do corpo da janela rola o formulário)", scrollDepois > scrollAntes, `scrollTop ${scrollAntes} → ${scrollDepois}`);

    const transformAntes = await page.locator(".rv-camada-grade").evaluate((el) => (el.closest("g[transform]") as SVGGElement | null)?.getAttribute("transform") ?? el.parentElement?.getAttribute("transform") ?? null).catch(() => null);
    // Ponto DESCOBERTO, não um par de números fixo: a janela nasce
    // colada na barra de ferramentas, à esquerda, e (120,500) caiu
    // dentro dela quando o formulário cresceu. Procura-se uma célula
    // que responda ao `elementFromPoint` — é o mesmo teste que o
    // usuário faz com o olho antes de arrastar o mapa.
    const pontoMapa = (await page.evaluate(() => {
      for (const c of Array.from(document.querySelectorAll(".rv-camada-grade path"))) {
        const r = c.getBoundingClientRect();
        const x = r.x + r.width / 2, y = r.y + r.height / 2;
        if (document.elementFromPoint(x, y) === c) return { x, y };
      }
      return null;
    }))!;
    await page.mouse.move(pontoMapa.x, pontoMapa.y);
    await page.mouse.down({ button: "right" });
    await page.mouse.move(pontoMapa.x + 60, pontoMapa.y + 40, { steps: 6 });
    await page.mouse.up({ button: "right" });
    await page.waitForTimeout(150);
    const transformDepois = await page.locator(".rv-camada-grade").evaluate((el) => (el.closest("g[transform]") as SVGGElement | null)?.getAttribute("transform") ?? el.parentElement?.getAttribute("transform") ?? null).catch(() => null);
    registrar("T2 (pan do mapa por botão direito continua funcionando com a janela aberta)", transformAntes !== transformDepois, `transform ${transformAntes} → ${transformDepois}`);

    await page.locator('.rv-gerenciador-token .rv-fp-fechar[aria-label="Fechar"]').click();
    await page.waitForSelector(".rv-gerenciador-token", { state: "detached", timeout: 3000 }).catch(() => {});
  }

  // --- U: redimensionar a viewport reposiciona a janela pra continuar alcançável (cabeçalho E rodapé) ---
  {
    await abrirPorBotaoBarra();
    await page.mouse.move(700, 100);
    await page.mouse.down();
    await page.mouse.move(650, 80, { steps: 4 });
    await page.mouse.up();
    await page.setViewportSize({ width: 480, height: 420 });
    await page.waitForTimeout(250);
    const rect = await page.locator(".rv-gerenciador-token").evaluate((el) => el.getBoundingClientRect());
    const cabecalhoAlcancavel = rect.top >= 0 && rect.top < 420;
    const rodapeAlcancavel = rect.bottom <= 420 + 60; // pequena folga: a viewport ficou menor que o conteúdo natural, então a PRÓPRIA janela encolhe via `max-height`, mas topo/fundo continuam dentro (ou bem perto) da área visível
    registrar(
      "U (viewport encolhida: a janela se reposiciona/redimensiona pra continuar alcançável — cabeçalho sempre visível)",
      cabecalhoAlcancavel,
      `rect=${JSON.stringify(rect)}, viewport=480x420, cabeçalhoAlcançável=${cabecalhoAlcancavel}, rodapéAlcançável=${rodapeAlcancavel}`,
    );
    await page.setViewportSize({ width: 1280, height: 950 });
    await page.waitForTimeout(200);
    await page.locator('.rv-gerenciador-token .rv-fp-fechar[aria-label="Fechar"]').click();
    await page.waitForSelector(".rv-gerenciador-token", { state: "detached", timeout: 3000 }).catch(() => {});
    await confirmarMapaFuncional(page, "U-mapa (mapa funcional depois do ciclo de resize)");
  }

  registrar("console (nenhum erro/warning novo durante todo o diagnóstico, incluindo as falhas de rede intencionais)", erros.length === 0, JSON.stringify(erros).slice(0, 2000));

  await browser.close();
  await limpar();

  console.log(`\n${passou} ok, ${falhou} falha(s).`);
  process.exit(falhou > 0 ? 1 : 0);
}

main().catch(async (e) => {
  console.error("Erro fatal:", e);
  await limpar().catch(() => {});
  process.exit(1);
});
