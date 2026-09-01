/**
 * Browser check da animação de movimento de token no VTT — mouse real
 * do Playwright, banco real, duas sessões reais (narrador + jogador).
 *
 * Cobre os itens da validação obrigatória que exigem browser (os itens
 * puramente matemáticos — duração ponderada por terreno, limites
 * mínimo/máximo, easing, interpolação, adjacência da rota expandida —
 * já têm prova unitária em `scripts/test-vtt-animacao.ts`; rodar os
 * dois é o par completo):
 *
 *  1/2. Movimento não salta — em progresso intermediário, o token não
 *       está nem na origem nem no destino.
 *  3.   Rota com curva (arrasto em L) segue os waypoints, não uma reta.
 *  4/5. Arrasto rápido (poucos `steps` de mouse) ainda produz um
 *       movimento ACEITO pelo servidor — prova indireta de que a rota
 *       enviada foi expandida e é adjacente (senão a migration 0069
 *       rejeitaria com "rota não é contínua").
 *  8.   Termina EXATAMENTE no centro do hex de destino.
 *  9.   O eco Realtime da própria ação não reinicia a animação —
 *       posição estável depois de assentar.
 *  10.  Outro cliente (que não iniciou o movimento) reproduz a MESMA
 *       animação via broadcast.
 *  11.  Sem broadcast (mudança direta no banco via service role,
 *       simulando um evento perdido), o eco do banco ainda reconcilia
 *       o destino.
 *  12.  Rejeição do servidor (permissão revogada em pleno arrasto)
 *       devolve o token suavemente à origem, sem persistir nada.
 *  13/14. Undo percorre a rota inversa, redo percorre a original.
 *  15.  Pan continua funcionando durante a animação.
 *  16.  O token animado não inicia outro arrasto.
 *  17.  Outro token continua interativo durante a animação do primeiro.
 *  18.  `prefers-reduced-motion` pula direto pro destino.
 *  19.  Uma única escrita no banco por movimento confirmado (revisão
 *       sobe exatamente 1, nunca uma sequência de intermediárias).
 *
 * Regressão geral (seleção, medição, hints, terrenos, undo/redo do
 * jeito de sempre) fica pro `check-vtt-integracao.ts` — não duplicado
 * aqui.
 *
 * Uso: npx tsx scripts/dev/check-vtt-animacao-movimento.ts (servidor
 * dev já rodando em localhost:3000).
 */

import { randomUUID } from "node:crypto";
import { config as loadDotenv } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import type { ConsoleMessage } from "playwright";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { BASE_URL } from "./authSession";
import { hexParaPixel } from "../../src/app/mesas/[campaignId]/vtt/_mapa/hex";
import { TAM } from "../../src/app/mesas/[campaignId]/vtt/_mapa/MapaHex";

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
  // Mesma exclusão documentada em `check-vtt-integracao.ts`: corrida
  // pré-existente entre a atualização otimista de apagar marcação e o
  // próprio eco Realtime — não relacionada a esta rodada.
  if (t.includes("Cannot update a component") && t.includes("while rendering a different component")) return false;
  return true;
}

let campaignId: string | null = null;
let sceneId: string | null = null;
let jogadorId: string | null = null;
let jogadorEmail: string | null = null;
let jogadorSenha: string | null = null;
let characterId: string | null = null;
let narradorEmail: string | null = null;
let narradorSenha: string | null = null;
const criados = { usuarios: [] as string[], campanhas: [] as string[] };

async function donoAtual(): Promise<string> {
  const email = `check-vtt-anim-narrador-${Date.now()}@ruptura.dev`;
  const senha = randomUUID();
  const { data, error } = await admin.auth.admin.createUser({ email, password: senha, email_confirm: true, user_metadata: { display_name: "Narrador Anim" } });
  if (error) throw new Error(`Falha ao criar narrador fixture: ${error.message}`);
  criados.usuarios.push(data.user.id);
  narradorEmail = email; narradorSenha = senha;
  return data.user.id;
}

async function configurarFixture(): Promise<void> {
  campaignId = randomUUID();
  const { error: e1 } = await admin.from("campaigns").insert({ id: campaignId, name: "VTT Animação", owner_id: await donoAtual() });
  if (e1) throw new Error(`Falha ao criar campanha: ${e1.message}`);
  criados.campanhas.push(campaignId);

  const email = `check-vtt-anim-jogador-${Date.now()}@ruptura.dev`;
  const senha = randomUUID();
  const { data, error } = await admin.auth.admin.createUser({ email, password: senha, email_confirm: true, user_metadata: { display_name: "Jogador Anim" } });
  if (error) throw new Error(`Falha ao criar jogador fixture: ${error.message}`);
  jogadorId = data.user.id; jogadorEmail = email; jogadorSenha = senha;
  criados.usuarios.push(jogadorId);

  const { error: e2 } = await admin.from("campaign_members").insert({ campaign_id: campaignId, user_id: jogadorId, role: "player", status: "active", origem: "fixture_vtt_anim" });
  if (e2) throw new Error(`Falha ao adicionar jogador: ${e2.message}`);

  const novoId = randomUUID();
  const { error: e3 } = await admin.from("characters").insert({
    id: novoId, name: "PJ do teste de animação", owner_label: null, status: "draft",
    payload: { nome: "PJ do teste de animação" }, campaign_id: campaignId, owner_id: jogadorId,
  });
  if (e3) throw new Error(`Falha ao criar personagem: ${e3.message}`);
  characterId = novoId;
  const { error: e4 } = await admin.from("character_controllers").insert({ character_id: characterId, campaign_id: campaignId, user_id: jogadorId });
  if (e4) throw new Error(`Falha ao conceder controle: ${e4.message}`);
}

async function contextoDe(email: string, senha: string): Promise<{ browser: Browser; context: BrowserContext; page: Page; close: () => Promise<void> }> {
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
  return { browser, context, page, close: () => browser.close() };
}

async function limpar() {
  if (characterId) await admin.from("character_controllers").delete().eq("character_id", characterId);
  if (characterId) await admin.from("characters").delete().eq("id", characterId);
  for (const cid of criados.campanhas) {
    await admin.from("vtt_marks").delete().eq("campaign_id", cid);
    await admin.from("vtt_terrain").delete().eq("campaign_id", cid);
    await admin.from("vtt_tokens").delete().eq("campaign_id", cid);
    await admin.from("vtt_scenes").delete().eq("campaign_id", cid);
    await admin.from("campaign_members").delete().eq("campaign_id", cid);
    await admin.from("campaigns").delete().eq("id", cid);
  }
  for (const uid of criados.usuarios) await admin.auth.admin.deleteUser(uid);
  registrar("L (limpeza de fixtures)", true, `${criados.usuarios.length} usuário(s), ${criados.campanhas.length} campanha(s)`);
}

/** Lê o `transform="translate(x y)"` do `<g>` do token pela SIGLA, via `page.evaluate` — sem depender de `data-testid` que não existe nesta camada. */
async function lerTransformToken(page: Page, sigla: string): Promise<{ x: number; y: number } | null> {
  const transform: string | null = await page.evaluate((sig) => {
    const els = Array.from(document.querySelectorAll(".rv-camada-tokens .rv-token text.rv-token-sigla"));
    const el = els.find((e) => e.textContent === sig);
    // `.closest(".rv-token")`, NÃO `.closest("g")` — desde a pegada
    // multicelular, o `<text>` da sigla mora DENTRO de um `<g>` interno
    // (`translate(origemLocal)`, a origem mecânica LOCAL relativa à
    // âncora — sempre `(0,0)` pra tokens de 1 célula, por isso todo
    // read caía em zero) que é FILHO do `<g class="rv-token">` raiz —
    // o `translate` animado por `useAnimacaoToken` fica no raiz, não
    // no interno.
    return el ? el.closest(".rv-token")?.getAttribute("transform") ?? null : null;
  }, sigla);
  if (!transform) return null;
  const m = transform.match(/translate\(([-\d.]+)\s+([-\d.]+)\)/);
  if (!m) return null;
  return { x: parseFloat(m[1]), y: parseFloat(m[2]) };
}

function distancia(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
function perto(a: { x: number; y: number }, b: { x: number; y: number }, eps = 0.5): boolean {
  return distancia(a, b) < eps;
}

/** Mesma dimensão de `CENA_DEMO` (`_dados/cenaDemo.ts`) — largura da grade em células. */
const LARGURA_CENA = 26;

/**
 * Centro de tela (CSS px) de UMA célula (q,r) — via `boundingBox()` do
 * `<path>` real da grade, nunca calculando a conversão mundo→tela na
 * mão. A geometria da SVG (`viewBox` vs. tamanho renderido) tem um
 * fator de escala que NÃO é necessariamente 1:1 mesmo com zoom=1 —
 * medir a caixa de verdade no DOM evita ter que reproduzir essa
 * conta (achado real: um mouse.move com delta em unidades de MUNDO
 * aplicado direto em pixels de TELA supera ou fica aquém do alvo).
 */
async function boxDaCelula(page: Page, hex: { q: number; r: number }): Promise<{ x: number; y: number } | null> {
  const qRaw = hex.q + Math.floor(hex.r / 2);
  const indice = hex.r * LARGURA_CENA + qRaw;
  const box = await page.locator(".rv-camada-grade path").nth(indice).boundingBox();
  return box ? { x: box.x + box.width / 2, y: box.y + box.height / 2 } : null;
}

/** Centro de tela (CSS px) do `<g>` de UM token, pela sigla — mesma técnica: `getBoundingClientRect()` real, nunca calculado. */
async function boxDoToken(page: Page, sigla: string): Promise<{ x: number; y: number } | null> {
  return page.evaluate((sig) => {
    const els = Array.from(document.querySelectorAll(".rv-camada-tokens .rv-token text.rv-token-sigla"));
    const el = els.find((e) => e.textContent === sig)?.closest("g");
    const r = el?.getBoundingClientRect();
    return r ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null;
  }, sigla);
}

async function main() {
  await configurarFixture();
  registrar("0 (fixture: campanha + narrador + jogador com 1 personagem controlado)", true, `campanha=${campaignId}`);

  const { page: narradorPage, close: closeNarrador } = await contextoDe(narradorEmail!, narradorSenha!);
  const errosNarrador: string[] = [];
  narradorPage.on("console", (m) => { if (erroRelevante(m)) errosNarrador.push(m.text().slice(0, 400)); });

  await narradorPage.goto(`${BASE_URL}/mesas/${campaignId}/vtt`, { waitUntil: "networkidle" });
  await narradorPage.waitForSelector(".rv-ferramentas", { timeout: 15000 });
  {
    const { data } = await admin.from("vtt_scenes").select("id").eq("campaign_id", campaignId).maybeSingle();
    sceneId = data?.id ?? null;
  }
  registrar("0b (cena semeada)", !!sceneId, `sceneId=${sceneId}`);

  const { page: jogadorPage, close: closeJogador } = await contextoDe(jogadorEmail!, jogadorSenha!);
  const errosJogador: string[] = [];
  jogadorPage.on("console", (m) => { if (erroRelevante(m)) errosJogador.push(m.text().slice(0, 400)); });

  // Concede controle do PRIMEIRO token pj ao personagem fixture (mesmo
  // padrão de `check-vtt-integracao.ts`, critério 9) — precisamos de UM
  // token que o JOGADOR possa arrastar de verdade pela UI, pros
  // critérios de rejeição/undo/redo que rodam na sessão dele.
  const { data: tokenJogador } = await admin.from("vtt_tokens").select("id,sigla,q,r,revision").eq("campaign_id", campaignId).eq("lado", "pj").limit(1).maybeSingle();
  if (!tokenJogador) { registrar("0c (token pj disponível pra vincular)", false, "nenhum token pj na cena semeada"); await closeNarrador(); await closeJogador(); await limpar(); process.exit(1); }
  await admin.from("vtt_tokens").update({ character_id: characterId }).eq("id", tokenJogador.id);
  await jogadorPage.goto(`${BASE_URL}/mesas/${campaignId}/vtt`, { waitUntil: "networkidle" });
  await jogadorPage.waitForSelector(".rv-ferramentas", { timeout: 15000 });
  registrar("0c (token pj disponível pra vincular)", true, `sigla=${tokenJogador.sigla}, pos=(${tokenJogador.q},${tokenJogador.r})`);

  const siglaJogador = tokenJogador.sigla;

  // Um token DISTINTO por critério — busca todos os narrador-only UMA
  // vez, ordenados de forma estável, e cada bloco abaixo consome um
  // índice fixo. Evita qualquer chance de dois critérios pegarem sem
  // querer o MESMO token (a cena semeada tem 6 narrador-only depois
  // que 1 vira do jogador — exatamente o que os critérios abaixo
  // precisam).
  const { data: todosNarrador } = await admin.from("vtt_tokens").select("id,sigla,q,r,revision").eq("campaign_id", campaignId).is("character_id", null).order("sigla", { ascending: true });
  if (!todosNarrador || todosNarrador.length < 6) {
    registrar("0d (tokens narrador-only suficientes pros critérios)", false, `esperado >= 6, achou ${todosNarrador?.length ?? 0}`);
    await closeNarrador(); await closeJogador(); await limpar(); process.exit(1);
  }
  registrar("0d (tokens narrador-only suficientes pros critérios)", true, `${todosNarrador.length} disponíveis: ${todosNarrador.map((t) => t.sigla).join(" ")}`);
  const [tokA, tokB, tokC, tokD, tokE, tokF] = todosNarrador;

  // --- 1/2/8. Movimento reto de vários hexes: não salta, passa por posição intermediária, termina exato no destino ---
  {
    await narradorPage.locator('.rv-ferramentas .rv-ferr-btn[aria-label^="Interagir"]').click();
    const tokenNarrador = tokA;
    {
      const box = await boxDoToken(narradorPage, tokenNarrador.sigla);
      // Destino 4 células a leste, em linha reta — NÃO 5: a cena demo
      // tem "Carregador blindado" (CB, pegada "grande" multicelular)
      // ancorado em (20,8), cuja pegada projetada inclui (20,9). B1
      // (tokA) começa em (15,9); 5 células a leste caía EXATAMENTE
      // nessa célula ocupada, e o pathfinding recusa corretamente
      // (regra de destino ocupado) — o passo confirmado nunca passava
      // de 2 células, sobrando como um "congelamento" que na verdade
      // era o produto se comportando certo com um alvo de teste ruim.
      // Achado com instrumentação direta em `moverDestino`/`mover()`
      // (ver `__DIAG_MOVER_PONTEIRO__`, já removida) — confirmado que
      // em cada pointermove sucessivo `caudaValida` virava `false`
      // assim que o hex-alvo alcançava a célula ocupada, mesmo com a
      // camada 2 do pathfinding (ignora bloqueio de TERRENO — nunca
      // ocupação) ativa. 4 células a leste fica em (19,9), livre.
      const destinoHex = { q: tokenNarrador.q + 4 * direcaoQSegura(tokenNarrador, 4), r: tokenNarrador.r };
      const pDestinoMundo = hexParaPixel(destinoHex, TAM);
      const pOrigemMundo = hexParaPixel({ q: tokenNarrador.q, r: tokenNarrador.r }, TAM);
      const boxDestino = await boxDaCelula(narradorPage, destinoHex);
      if (box && boxDestino) {
        await narradorPage.mouse.move(box.x, box.y);
        await narradorPage.mouse.down();
        await narradorPage.mouse.move(boxDestino.x, boxDestino.y, { steps: 10 });
        await narradorPage.mouse.up();

        // Duração esperada: 4 hexes × MS_POR_HEX(110) = 440ms. Amostra a
        // ~34% — margem generosa dos dois lados (não tão cedo que ainda
        // esteja perto da origem, não tão tarde que risque já ter
        // concluído sob uma máquina/CI mais lenta).
        await narradorPage.waitForTimeout(150);
        const meio = await lerTransformToken(narradorPage, tokenNarrador.sigla);
        await narradorPage.waitForTimeout(600); // além da duração + folga de assentamento
        const fim = await lerTransformToken(narradorPage, tokenNarrador.sigla);

        const naoEstaNaOrigem = meio && !perto(meio, pOrigemMundo, 3);
        const naoEstaNoDestino = meio && !perto(meio, pDestinoMundo, 3);
        const terminouExato = fim && perto(fim, pDestinoMundo, 0.5);
        registrar(
          "1/2 (movimento reto: posição intermediária não é nem origem nem destino)",
          !!naoEstaNaOrigem && !!naoEstaNoDestino,
          `meio=${JSON.stringify(meio)}, origem=${JSON.stringify(pOrigemMundo)}, destino=${JSON.stringify(pDestinoMundo)}`,
        );
        registrar("8 (movimento termina EXATAMENTE no centro do hex de destino)", !!terminouExato, `fim=${JSON.stringify(fim)}, destinoEsperado=${JSON.stringify(pDestinoMundo)}`);

        const { data: linhaFinal } = await admin.from("vtt_tokens").select("q,r,revision").eq("id", tokenNarrador.id).maybeSingle();
        registrar("19 (uma única escrita no banco por movimento — revisão sobe exatamente 1)", linhaFinal?.revision === tokenNarrador.revision + 1, `revisão antes=${tokenNarrador.revision}, depois=${linhaFinal?.revision}`);

        // --- 9. Eco Realtime da própria ação não reinicia a animação ---
        await narradorPage.waitForTimeout(400);
        const estavel1 = await lerTransformToken(narradorPage, tokenNarrador.sigla);
        await narradorPage.waitForTimeout(400);
        const estavel2 = await lerTransformToken(narradorPage, tokenNarrador.sigla);
        registrar("9 (eco Realtime da própria ação não reinicia/faz piscar a animação)", !!estavel1 && !!estavel2 && perto(estavel1, estavel2, 0.5) && perto(estavel1, pDestinoMundo, 0.5), `${JSON.stringify(estavel1)} → ${JSON.stringify(estavel2)}`);
      } else {
        registrar("1/2/8 (movimento reto não salta e termina no destino)", false, "token narrador sem bounding box");
      }
    }
  }

  // --- 3. Rota com WAYPOINT EXPLÍCITO (tecla Q no cotovelo) segue o ponto confirmado, não a reta direta ---
  // Atualizado na rodada de correção do zigue-zague: um arrasto em L
  // SEM pressionar Q agora vai direto (rota canônica mínima,
  // recalculada a cada movimento do cursor) — dobrar o mouse sem Q
  // não é mais o jeito de criar uma curva. Fixar o cotovelo com Q é.
  {
    const tokenNarrador2 = tokB;
    {
      const box = await boxDoToken(narradorPage, tokenNarrador2.sigla);
      const origem = { q: tokenNarrador2.q, r: tokenNarrador2.r };
      const cotovelo = { q: origem.q + 4 * direcaoQSegura(origem, 4), r: origem.r };
      const destino = { q: cotovelo.q, r: cotovelo.r + 4 * direcaoRSegura(cotovelo, 4) };
      const pOrigemMundo = hexParaPixel(origem, TAM);
      const pCotoveloMundo = hexParaPixel(cotovelo, TAM);
      const pDestinoMundo = hexParaPixel(destino, TAM);
      const boxCotovelo = await boxDaCelula(narradorPage, cotovelo);
      const boxDestino3 = await boxDaCelula(narradorPage, destino);
      if (box && boxCotovelo && boxDestino3) {
        await narradorPage.mouse.move(box.x, box.y);
        await narradorPage.mouse.down();
        // Perna 1: reto até o cotovelo — e FIXA esse hex como waypoint com Q.
        await narradorPage.mouse.move(boxCotovelo.x, boxCotovelo.y, { steps: 8 });
        await narradorPage.keyboard.press("q");
        // Perna 2: dobra e desce até o destino — agora um waypoint de verdade, não um acidente do rastro do cursor.
        await narradorPage.mouse.move(boxDestino3.x, boxDestino3.y, { steps: 8 });
        await narradorPage.mouse.up();

        // Duração esperada: 8 hexes × 110ms = 880ms. Amostra por volta
        // da metade do percurso (perto do cotovelo).
        await narradorPage.waitForTimeout(420);
        const meio = await lerTransformToken(narradorPage, tokenNarrador2.sigla);
        await narradorPage.waitForTimeout(700);

        const distDoCotovelo = meio ? distancia(meio, pCotoveloMundo) : Infinity;
        // Reta direta origem→destino passaria bem mais longe do cotovelo real.
        const distRetaDiretaDoCotovelo = distanciaPontoReta(pCotoveloMundo, pOrigemMundo, pDestinoMundo);
        registrar(
          "3 (rota com waypoint explícito: posição intermediária segue o cotovelo confirmado, não a reta direta)",
          !!meio && distDoCotovelo < TAM * 2,
          `meio=${JSON.stringify(meio)}, dist do cotovelo=${distDoCotovelo.toFixed(1)}px (esperado < ${(TAM * 2).toFixed(0)}px), a reta direta passaria a ${distRetaDiretaDoCotovelo.toFixed(1)}px do cotovelo`,
        );

        const { data: linhaFinal } = await admin.from("vtt_tokens").select("q,r").eq("id", tokenNarrador2.id).maybeSingle();
        registrar("3b (rota com waypoint chega no destino certo, não no atalho reto)", linhaFinal?.q === destino.q && linhaFinal?.r === destino.r, `chegou em (${linhaFinal?.q},${linhaFinal?.r}), esperado (${destino.q},${destino.r})`);
      } else {
        registrar("3 (rota com curva)", false, "token sem bounding box");
      }
    }
  }

  // --- 4/5. Arrasto com poucos `steps` (evento de ponteiro "rápido") ainda é aceito pelo servidor ---
  {
    const tokenNarrador3 = tokC;
    {
      const box = await boxDoToken(narradorPage, tokenNarrador3.sigla);
      const destino = { q: tokenNarrador3.q + 6 * direcaoQSegura(tokenNarrador3, 6), r: tokenNarrador3.r };
      const boxDestino4 = await boxDaCelula(narradorPage, destino);
      if (box && boxDestino4) {
        await narradorPage.mouse.move(box.x, box.y);
        await narradorPage.mouse.down();
        // `steps: 1` = um ÚNICO evento de pointermove pulando direto pro
        // destino — o rastro bruto NUNCA passa pelas células
        // intermediárias. Se `expandirRota` não existisse (ou não
        // fosse usada pro envio ao servidor), a migration 0069
        // rejeitaria por falta de adjacência.
        await narradorPage.mouse.move(boxDestino4.x, boxDestino4.y, { steps: 1 });
        await narradorPage.mouse.up();
        await narradorPage.waitForTimeout(1200);
        const { data: linhaFinal } = await admin.from("vtt_tokens").select("q,r").eq("id", tokenNarrador3.id).maybeSingle();
        const erroVisivel = await narradorPage.locator(".rv-erro-acao").textContent().catch(() => null);
        registrar(
          "4/5 (ponteiro rápido/poucos steps: rota expandida ainda é aceita pelo servidor)",
          linhaFinal?.q === destino.q && linhaFinal?.r === destino.r,
          `chegou em (${linhaFinal?.q},${linhaFinal?.r}), esperado (${destino.q},${destino.r}), erro="${erroVisivel}"`,
        );
      } else {
        registrar("4/5 (ponteiro rápido ainda é aceito)", false, "token sem bounding box");
      }
    }
  }

  // --- 10. Outro cliente (jogador, que não iniciou o movimento) reproduz a MESMA animação via broadcast ---
  {
    await jogadorPage.locator('.rv-ferramentas .rv-ferr-btn[aria-label^="Interagir"]').click();
    const box = await boxDoToken(narradorPage, tokD.sigla);
    const destino = { q: tokD.q + 5 * direcaoQSegura(tokD, 5), r: tokD.r };
    const pOrigemMundo = hexParaPixel({ q: tokD.q, r: tokD.r }, TAM);
    const pDestinoMundo = hexParaPixel(destino, TAM);
    const boxDestino = await boxDaCelula(narradorPage, destino);
    if (box && boxDestino) {
      await narradorPage.mouse.move(box.x, box.y);
      await narradorPage.mouse.down();
      await narradorPage.mouse.move(boxDestino.x, boxDestino.y, { steps: 10 });
      await narradorPage.mouse.up();

      // Duração esperada 550ms — amostra o cliente que NÃO iniciou o
      // movimento no meio do percurso.
      await narradorPage.waitForTimeout(280);
      const meioJogador = await lerTransformToken(jogadorPage, tokD.sigla);
      await narradorPage.waitForTimeout(600);
      const fimJogador = await lerTransformToken(jogadorPage, tokD.sigla);

      registrar(
        "10 (outro cliente vê a animação em andamento via broadcast, não só o resultado final)",
        !!meioJogador && !perto(meioJogador, pOrigemMundo, 3) && !perto(meioJogador, pDestinoMundo, 3),
        `meio (jogador)=${JSON.stringify(meioJogador)}, origem=${JSON.stringify(pOrigemMundo)}, destino=${JSON.stringify(pDestinoMundo)}`,
      );
      registrar("10b (outro cliente termina no destino certo)", !!fimJogador && perto(fimJogador, pDestinoMundo, 0.5), `fim (jogador)=${JSON.stringify(fimJogador)}, destinoEsperado=${JSON.stringify(pDestinoMundo)}, origem=${JSON.stringify(pOrigemMundo)}, tokD=${JSON.stringify({ q: tokD.q, r: tokD.r })}, destinoHex=${JSON.stringify(destino)}`);
    } else {
      registrar("10 (broadcast pra outro cliente)", false, "token/célula sem bounding box");
    }
  }

  // --- 11. Sem broadcast (mudança direta no banco via service role), o eco do banco ainda reconcilia o destino ---
  {
    const destino = { q: tokE.q + 3 * direcaoQSegura(tokE, 3), r: tokE.r + 1 * direcaoRSegura(tokE, 1) };
    await admin.from("vtt_tokens").update({ q: destino.q, r: destino.r, revision: tokE.revision + 1 }).eq("id", tokE.id);

    // Ninguém animou isto localmente (foi uma escrita direta) — nenhum
    // dos dois clientes tem `movimentosConhecidosRef` pra esta
    // mudança. Espera o eco do `postgres_changes` chegar e reconciliar
    // (via fallback reto curto, já que o deslocamento é pequeno).
    let reconciliado = false;
    let ultimaLeitura: { x: number; y: number } | null = null;
    const pDestinoMundo = hexParaPixel(destino, TAM);
    for (let i = 0; i < 20; i++) {
      await narradorPage.waitForTimeout(150);
      ultimaLeitura = await lerTransformToken(narradorPage, tokE.sigla);
      if (ultimaLeitura && perto(ultimaLeitura, pDestinoMundo, 0.5)) { reconciliado = true; break; }
    }
    registrar("11 (sem broadcast conhecido, o eco do banco ainda reconcilia o destino)", reconciliado, `posição final=${JSON.stringify(ultimaLeitura)}, destinoEsperado=${JSON.stringify(pDestinoMundo)}`);
  }

  // --- 13/14. Undo percorre a rota inversa, redo percorre a rota original (token do JOGADOR, com controle) ---
  {
    await jogadorPage.locator('.rv-ferramentas .rv-ferr-btn[aria-label^="Interagir"]').click();
    const { data: antes } = await admin.from("vtt_tokens").select("q,r,revision").eq("id", tokenJogador.id).maybeSingle();
    const origem = { q: antes!.q, r: antes!.r };
    const destino = { q: origem.q + 4 * direcaoQSegura(origem, 4), r: origem.r };
    const pOrigemMundo = hexParaPixel(origem, TAM);
    const pDestinoMundo = hexParaPixel(destino, TAM);
    const box = await boxDoToken(jogadorPage, siglaJogador);
    const boxDestino = await boxDaCelula(jogadorPage, destino);
    if (box && boxDestino) {
      await jogadorPage.mouse.move(box.x, box.y);
      await jogadorPage.mouse.down();
      await jogadorPage.mouse.move(boxDestino.x, boxDestino.y, { steps: 8 });
      await jogadorPage.mouse.up();
      await jogadorPage.waitForTimeout(700);
      const { data: apMove } = await admin.from("vtt_tokens").select("q,r").eq("id", tokenJogador.id).maybeSingle();
      registrar("13a (jogador move o próprio token normalmente, antes do undo)", apMove?.q === destino.q && apMove?.r === destino.r, `pos=(${apMove?.q},${apMove?.r})`);

      // Undo — precisa focar fora de qualquer campo editável antes do Ctrl+Z (mesmo padrão de `check-vtt-integracao.ts`).
      await jogadorPage.locator(".rv-mesa").click({ position: { x: 5, y: 5 } });
      await jogadorPage.keyboard.press("Control+z");
      await jogadorPage.waitForTimeout(150); // duração esperada do undo: 4 hexes × 110ms = 440ms — margem generosa dos dois lados
      const meioUndo = await lerTransformToken(jogadorPage, siglaJogador);
      await jogadorPage.waitForTimeout(500);
      const { data: apUndo } = await admin.from("vtt_tokens").select("q,r").eq("id", tokenJogador.id).maybeSingle();
      const fimUndo = await lerTransformToken(jogadorPage, siglaJogador);
      registrar(
        "13 (undo: passa por posição intermediária — percorre a rota inversa, não salta)",
        !!meioUndo && !perto(meioUndo, pDestinoMundo, 3) && !perto(meioUndo, pOrigemMundo, 3),
        `meio=${JSON.stringify(meioUndo)}`,
      );
      registrar("13b (undo: banco e visual voltam pra origem exata)", apUndo?.q === origem.q && apUndo?.r === origem.r && !!fimUndo && perto(fimUndo, pOrigemMundo, 0.5), `banco=(${apUndo?.q},${apUndo?.r}), visual=${JSON.stringify(fimUndo)}`);

      // Redo
      await jogadorPage.locator('.rv-ferramentas .rv-ferr-btn[aria-label^="Refazer"]').click();
      await jogadorPage.waitForTimeout(150); // duração esperada do redo: 4 hexes × 110ms = 440ms — margem generosa dos dois lados
      const meioRedo = await lerTransformToken(jogadorPage, siglaJogador);
      await jogadorPage.waitForTimeout(500);
      const { data: apRedo } = await admin.from("vtt_tokens").select("q,r").eq("id", tokenJogador.id).maybeSingle();
      const fimRedo = await lerTransformToken(jogadorPage, siglaJogador);
      registrar(
        "14 (redo: passa por posição intermediária — percorre a rota original, não salta)",
        !!meioRedo && !perto(meioRedo, pOrigemMundo, 3) && !perto(meioRedo, pDestinoMundo, 3),
        `meio=${JSON.stringify(meioRedo)}`,
      );
      registrar("14b (redo: banco e visual voltam pro destino exato)", apRedo?.q === destino.q && apRedo?.r === destino.r && !!fimRedo && perto(fimRedo, pDestinoMundo, 0.5), `banco=(${apRedo?.q},${apRedo?.r}), visual=${JSON.stringify(fimRedo)}`);
    } else {
      registrar("13/14 (undo/redo)", false, "token/célula sem bounding box");
    }
  }

  // --- 15/16. Pan continua funcionando durante a animação; o token animado não inicia outro arrasto ---
  {
    await narradorPage.locator('.rv-ferramentas .rv-ferr-btn[aria-label^="Interagir"]').click();
    const box = await boxDoToken(narradorPage, tokF.sigla);
    const destino = { q: tokF.q + 6 * direcaoQSegura(tokF, 6), r: tokF.r };
    const pDestinoMundo = hexParaPixel(destino, TAM);
    const boxDestino = await boxDaCelula(narradorPage, destino);
    if (box && boxDestino) {
      await narradorPage.mouse.move(box.x, box.y);
      await narradorPage.mouse.down();
      await narradorPage.mouse.move(boxDestino.x, boxDestino.y, { steps: 10 });
      await narradorPage.mouse.up();

      // Mid-animação (duração esperada 660ms): pan por botão direito.
      const gAntes = await narradorPage.locator("svg.rv-mapa > g").getAttribute("transform");
      const centro = { x: 640, y: 475 };
      await narradorPage.mouse.move(centro.x, centro.y);
      await narradorPage.mouse.down({ button: "right" });
      await narradorPage.mouse.move(centro.x + 40, centro.y + 25, { steps: 5 });
      await narradorPage.mouse.up({ button: "right" });
      await narradorPage.waitForTimeout(50);
      const gDepois = await narradorPage.locator("svg.rv-mapa > g").getAttribute("transform");
      registrar("15 (pan continua funcionando com uma animação de token em andamento)", gAntes !== gDepois, `antes="${gAntes}" depois="${gDepois}"`);

      // Ainda em animação: tenta iniciar um NOVO arrasto no MESMO token — não deve criar preview de rota nenhum.
      const boxAgora = await boxDoToken(narradorPage, tokF.sigla);
      if (boxAgora) {
        await narradorPage.mouse.move(boxAgora.x, boxAgora.y);
        await narradorPage.mouse.down();
        await narradorPage.mouse.move(boxAgora.x + 60, boxAgora.y + 30, { steps: 4 });
        const temPreviewIndevido = (await narradorPage.locator(".rv-camada-rota-preview").count()) > 0;
        await narradorPage.mouse.up();
        registrar("16 (token animado não inicia outro arrasto — sem preview de rota novo)", !temPreviewIndevido, `preview presente=${temPreviewIndevido}`);
      } else {
        registrar("16 (token animado não inicia outro arrasto)", false, "token sem bounding box em voo");
      }

      await narradorPage.waitForTimeout(900);
      const { data: linhaFinal } = await admin.from("vtt_tokens").select("q,r").eq("id", tokF.id).maybeSingle();
      const fimVisual = await lerTransformToken(narradorPage, tokF.sigla);
      registrar(
        "16b (apesar da tentativa de novo arrasto, o token chega no destino original certo)",
        linhaFinal?.q === destino.q && linhaFinal?.r === destino.r && !!fimVisual && perto(fimVisual, pDestinoMundo, 0.5),
        `banco=(${linhaFinal?.q},${linhaFinal?.r}), visual=${JSON.stringify(fimVisual)}`,
      );
    } else {
      registrar("15/16 (pan + arrasto bloqueado durante animação)", false, "token/célula sem bounding box");
    }
  }

  // --- 17. Outro token continua interativo enquanto o primeiro anima ---
  {
    const { data: tokAAtual } = await admin.from("vtt_tokens").select("id,sigla,q,r,revision").eq("id", tokA.id).maybeSingle();
    const box = await boxDoToken(narradorPage, tokAAtual!.sigla);
    // 1 célula a OESTE, não a leste: a essa altura (após 1/2/8/9), tokA
    // está em (19,9) — a leste fica (20,9), ocupada pela pegada
    // triangular do "Carregador blindado" ((20,8) ancorado, mais
    // (21,8) e (20,9) — ver `PEGADA_GRANDE`). A oeste é sempre livre:
    // é literalmente a célula de onde tokA acabou de vir.
    const destino = { q: tokAAtual!.q - 1, r: tokAAtual!.r };
    const boxDestino = await boxDaCelula(narradorPage, destino);
    if (box && boxDestino) {
      await narradorPage.mouse.move(box.x, box.y);
      await narradorPage.mouse.down();
      await narradorPage.mouse.move(boxDestino.x, boxDestino.y, { steps: 6 });
      await narradorPage.mouse.up();
      await narradorPage.waitForTimeout(500);
      const { data: apos } = await admin.from("vtt_tokens").select("q,r,revision").eq("id", tokAAtual!.id).maybeSingle();
      registrar("17 (outro token continua interativo)", apos?.q === destino.q && apos?.r === destino.r && apos?.revision === tokAAtual!.revision + 1, `pos=(${apos?.q},${apos?.r}), revisão ${tokAAtual!.revision}→${apos?.revision}`);
    } else {
      registrar("17 (outro token continua interativo)", false, "token/célula sem bounding box");
    }
  }

  // --- 12. Rejeição do servidor (permissão revogada em pleno arrasto) devolve o token suavemente à origem ---
  {
    await jogadorPage.locator('.rv-ferramentas .rv-ferr-btn[aria-label^="Interagir"]').click();
    const { data: antes } = await admin.from("vtt_tokens").select("q,r,revision").eq("id", tokenJogador.id).maybeSingle();
    const origem = { q: antes!.q, r: antes!.r };
    const destino = { q: origem.q + 4 * direcaoQSegura(origem, 4), r: origem.r };
    const pOrigemMundo = hexParaPixel(origem, TAM);
    const box = await boxDoToken(jogadorPage, siglaJogador);
    const boxDestino = await boxDaCelula(jogadorPage, destino);
    if (box && boxDestino) {
      await jogadorPage.mouse.move(box.x, box.y);
      await jogadorPage.mouse.down();
      await jogadorPage.mouse.move(boxDestino.x, boxDestino.y, { steps: 8 });
      // Revoga o controle do personagem ANTES de soltar — a rota já foi
      // validada no cliente (permissão otimista), mas o servidor vai
      // recusar de verdade quando `moverTokenAction` rodar.
      await admin.from("character_controllers").delete().eq("character_id", characterId!);
      await jogadorPage.mouse.up();

      await jogadorPage.waitForTimeout(150);
      const erroVisivel = await jogadorPage.locator(".rv-erro-acao").textContent().catch(() => null);
      // Duração de retração é curta (DURACAO_RECONCILIACAO=200ms) — espera passar dela.
      await jogadorPage.waitForTimeout(500);
      const { data: apos } = await admin.from("vtt_tokens").select("q,r,revision").eq("id", tokenJogador.id).maybeSingle();
      const fimVisual = await lerTransformToken(jogadorPage, siglaJogador);
      registrar("12 (servidor recusa: nada persiste no banco)", apos?.q === origem.q && apos?.r === origem.r && apos?.revision === antes!.revision, `banco=(${apos?.q},${apos?.r}), revisão ${antes!.revision}→${apos?.revision}`);
      registrar("12b (servidor recusa: erro visível)", !!erroVisivel, `erro="${erroVisivel}"`);
      registrar("12c (servidor recusa: token volta suavemente pra origem visual)", !!fimVisual && perto(fimVisual, pOrigemMundo, 0.5), `visual final=${JSON.stringify(fimVisual)}`);

      // Restaura o controle — necessário pro teste 20 (dois tokens
      // simultâneos) logo abaixo, que volta a arrastar o token do
      // jogador. Espera o cliente do jogador de fato PROCESSAR essa
      // restauração via Realtime (`character_controllers`) antes de
      // prosseguir — sem isso, o próximo arrasto corre risco real de
      // rodar contra `controlledCharacterIds` ainda desatualizado
      // (revogado), sendo recusado pelo servidor por um motivo que não
      // tem nada a ver com o que o teste seguinte investiga.
      await admin.from("character_controllers").insert({ character_id: characterId!, campaign_id: campaignId!, user_id: jogadorId! });
      // Nudge explícito (mesmo padrão de "focus dispara `carregarControle`"
      // já usado pelo próprio app) — não troca o tempo fixo abaixo por
      // uma condição 100% observável (não há seletor de DOM pra "controle
      // já sincronizado"), mas reduz a dependência de só esperar o
      // Realtime se resolver sozinho dentro da janela de espera.
      await jogadorPage.evaluate(() => { window.dispatchEvent(new Event("focus")); document.dispatchEvent(new Event("visibilitychange")); });
      await jogadorPage.waitForTimeout(1500);
    } else {
      registrar("12 (rejeição do servidor)", false, "token/célula sem bounding box");
    }
  }

  // --- 20. Dois tokens diferentes animando ao mesmo tempo — concluir
  // um não remove nem altera o outro. Arrasto de mouse é inerentemente
  // serial NUMA página (um único `arrasto` de estado, um único
  // ponteiro do SO) — a única forma real de duas animações
  // concorrentes de tokens DIFERENTES é DUAS SESSÕES movendo cada uma
  // o seu, o que também é o cenário real de mesa (narrador e jogador
  // mexendo em tokens diferentes ao mesmo tempo). As duas gestos
  // disparam em paralelo (`Promise.all`, sem aguardar um terminar
  // antes do outro começar) — cada `onAnimacaoConcluida` só apaga sua
  // PRÓPRIA entrada do `Map` (chaveado por tokenId), então este teste
  // prova essa isolação com concorrência real, não só por leitura de
  // código. ---
  {
    const { data: tokAAtual } = await admin.from("vtt_tokens").select("id,sigla,q,r,revision").eq("id", tokA.id).maybeSingle();
    const { data: tokJogAtual } = await admin.from("vtt_tokens").select("id,q,r,revision").eq("id", tokenJogador.id).maybeSingle();
    await narradorPage.locator('.rv-ferramentas .rv-ferr-btn[aria-label^="Interagir"]').click();
    await jogadorPage.locator('.rv-ferramentas .rv-ferr-btn[aria-label^="Interagir"]').click();

    // tokA a essa altura (após 1/2/8/9 e 17) está bem a oeste da pegada
    // ocupada do "Carregador blindado" ((20,8)/(21,8)/(20,9)) — 2
    // células a OESTE (de volta pro caminho já percorrido) evita
    // repetir a mesma colisão de fixture, sem depender de
    // `direcaoQSegura`, que prefere leste e voltaria a mirar nela.
    const destinoA = { q: tokAAtual!.q - 2, r: tokAAtual!.r };
    const destinoJog = { q: tokJogAtual!.q + 2 * direcaoQSegura(tokJogAtual!, 2), r: tokJogAtual!.r };
    const pDestinoA = hexParaPixel(destinoA, TAM);
    const pDestinoJog = hexParaPixel(destinoJog, TAM);

    const boxA = await boxDoToken(narradorPage, tokAAtual!.sigla);
    const boxDestinoA = await boxDaCelula(narradorPage, destinoA);
    const boxJog = await boxDoToken(jogadorPage, siglaJogador);
    const boxDestinoJog = await boxDaCelula(jogadorPage, destinoJog);

    if (boxA && boxDestinoA && boxJog && boxDestinoJog) {
      async function arrastar(page: Page, de: { x: number; y: number }, para: { x: number; y: number }) {
        await page.mouse.move(de.x, de.y);
        await page.mouse.down();
        await page.mouse.move(para.x, para.y, { steps: 8 });
        await page.mouse.up();
      }
      // Ambos disparados SEM esperar um terminar — sobreposição real.
      await Promise.all([
        arrastar(narradorPage, boxA, boxDestinoA),
        arrastar(jogadorPage, boxJog, boxDestinoJog),
      ]);

      await narradorPage.waitForTimeout(700);
      let { data: bancoJog } = await admin.from("vtt_tokens").select("q,r,revision").eq("id", tokJogAtual!.id).maybeSingle();
      // Defesa contra a MESMA corrida documentada acima (sincronização
      // de `controlledCharacterIds` via Realtime, não instantânea): se
      // ainda não moveu, não é o que este teste investiga — tenta o
      // arrasto do jogador MAIS UMA VEZ antes de reprovar por um motivo
      // alheio à isolação entre tokens que é o objeto real do teste.
      if (bancoJog?.q !== destinoJog.q || bancoJog?.r !== destinoJog.r) {
        await arrastar(jogadorPage, boxJog, boxDestinoJog);
        await jogadorPage.waitForTimeout(700);
        ({ data: bancoJog } = await admin.from("vtt_tokens").select("q,r,revision").eq("id", tokJogAtual!.id).maybeSingle());
      }
      const { data: bancoA } = await admin.from("vtt_tokens").select("q,r,revision").eq("id", tokAAtual!.id).maybeSingle();
      // Visual lido NA PÁGINA DO NARRADOR pros dois — o seu próprio
      // token (A, otimista) E o do jogador, que ele só vê via
      // broadcast (`receberMovimentoRemoto`/`onAnimacaoConcluida`) —
      // exatamente o caminho que o bug de "salto pra origem" afetava.
      const visualA = await lerTransformToken(narradorPage, tokAAtual!.sigla);
      const visualJog = await lerTransformToken(narradorPage, siglaJogador);

      registrar(
        "20a (token A termina no próprio destino — banco e visual)",
        bancoA?.q === destinoA.q && bancoA?.r === destinoA.r && !!visualA && perto(visualA, pDestinoA, 0.5),
        `banco=(${bancoA?.q},${bancoA?.r}), destinoEsperado=(${destinoA.q},${destinoA.r}), visual=${JSON.stringify(visualA)}, destinoVisual=${JSON.stringify(pDestinoA)}`,
      );
      registrar(
        "20b (token do jogador termina no próprio destino — banco e visual, visto via broadcast pelo narrador)",
        bancoJog?.q === destinoJog.q && bancoJog?.r === destinoJog.r && !!visualJog && perto(visualJog, pDestinoJog, 0.5),
        `banco=(${bancoJog?.q},${bancoJog?.r}), destinoEsperado=(${destinoJog.q},${destinoJog.r}), visual=${JSON.stringify(visualJog)}, destinoVisual=${JSON.stringify(pDestinoJog)}`,
      );
    } else {
      registrar("20 (dois tokens simultâneos)", false, "token/célula sem bounding box");
    }
  }

  // --- 18. `prefers-reduced-motion`: pula direto pro destino, sem percorrer a rota ---
  {
    const anon = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: sessao } = await anon.auth.signInWithPassword({ email: narradorEmail!, password: narradorSenha! });
    const browserReduzido = await chromium.launch({ headless: true });
    const contextoReduzido = await browserReduzido.newContext({ viewport: { width: 1280, height: 950 }, reducedMotion: "reduce" });
    await contextoReduzido.addCookies([{
      name: "ruptura_auth",
      value: JSON.stringify({ access_token: sessao!.session!.access_token, refresh_token: sessao!.session!.refresh_token }),
      domain: "localhost", path: "/", httpOnly: true, secure: false, sameSite: "Lax",
      expires: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7,
    }]);
    const pageReduzido = await contextoReduzido.newPage();
    await pageReduzido.goto(`${BASE_URL}/mesas/${campaignId}/vtt`, { waitUntil: "networkidle" });
    await pageReduzido.waitForSelector(".rv-ferramentas", { timeout: 15000 });
    await pageReduzido.locator('.rv-ferramentas .rv-ferr-btn[aria-label^="Interagir"]').click();

    const { data: tokAAtual } = await admin.from("vtt_tokens").select("id,sigla,q,r").eq("id", tokA.id).maybeSingle();
    const destino = { q: tokAAtual!.q + 5 * direcaoQSegura(tokAAtual!, 5), r: tokAAtual!.r };
    const pDestinoMundo = hexParaPixel(destino, TAM);
    const box = await boxDoToken(pageReduzido, tokAAtual!.sigla);
    const boxDestino = await boxDaCelula(pageReduzido, destino);
    if (box && boxDestino) {
      await pageReduzido.mouse.move(box.x, box.y);
      await pageReduzido.mouse.down();
      await pageReduzido.mouse.move(boxDestino.x, boxDestino.y, { steps: 10 });
      await pageReduzido.mouse.up();
      // Sem movimento reduzido, esta rota levaria ~550ms. Com
      // `prefers-reduced-motion`, o destino deve aparecer quase
      // instantaneamente — checa bem antes disso.
      await pageReduzido.waitForTimeout(80);
      const posicao = await lerTransformToken(pageReduzido, tokAAtual!.sigla);
      registrar("18 (prefers-reduced-motion: pula direto pro destino, sem percorrer a rota)", !!posicao && perto(posicao, pDestinoMundo, 0.5), `posição a 80ms=${JSON.stringify(posicao)}, destino=${JSON.stringify(pDestinoMundo)}`);
    } else {
      registrar("18 (prefers-reduced-motion)", false, "token/célula sem bounding box");
    }
    await browserReduzido.close();
  }

  registrar("21 (console limpo — narrador)", errosNarrador.length === 0, JSON.stringify(errosNarrador));
  registrar("21b (console limpo — jogador)", errosJogador.length === 0, JSON.stringify(errosJogador));

  await closeNarrador();
  await closeJogador();
  await limpar();

  console.log(`\n${passou} ok, ${falhou} falha(s).`);
  if (falhou > 0) process.exit(1);
}

/**
 * Direção segura pra deslocar `magnitude` células no eixo Q sem sair
 * do mapa (`LARGURA_CENA` colunas — `dentroDoMapa`, `_dominio/
 * movimento.ts`) — achado real: um token já perto da borda direita
 * (inclusive um REUSADO por um critério anterior, que já o moveu pra
 * lá) mais um offset positivo fixo saía dos limites; a célula-alvo
 * calculada caía numa linha/coluna ERRADA (o índice da grade "vazava"
 * pra outra fileira), e o arrasto acabava clicando em outro lugar,
 * não o pretendido.
 */
function direcaoQSegura(hex: { q: number; r: number }, magnitude: number): 1 | -1 {
  const qMin = -Math.floor(hex.r / 2);
  const qMax = qMin + LARGURA_CENA - 1;
  if (hex.q + magnitude <= qMax) return 1;
  if (hex.q - magnitude >= qMin) return -1;
  return 1; // mapa menor que 2×magnitude nesta fileira — não deveria acontecer nesta cena, mas nunca lança.
}
/** Mesma ideia, pro eixo R (`ALTURA_CENA` linhas — 0..altura-1, sem depender de Q). */
const ALTURA_CENA = 18;
function direcaoRSegura(hex: { q: number; r: number }, magnitude: number): 1 | -1 {
  if (hex.r + magnitude <= ALTURA_CENA - 1) return 1;
  if (hex.r - magnitude >= 0) return -1;
  return 1;
}

function distanciaPontoReta(p: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }): number {
  const dx = b.x - a.x, dy = b.y - a.y;
  const comprimento2 = dx * dx + dy * dy;
  if (comprimento2 === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / comprimento2));
  const proj = { x: a.x + t * dx, y: a.y + t * dy };
  return Math.hypot(p.x - proj.x, p.y - proj.y);
}

main().catch(async (e) => {
  console.error("Erro fatal:", e);
  await limpar().catch(() => {});
  process.exit(1);
});
