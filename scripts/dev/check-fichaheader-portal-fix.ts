/**
 * Browser check do fix de posicionamento/clicabilidade/histórico de
 * `FichaHeader` (auditoria pós-Fase-6 — bloqueador que impedia encerrar
 * a Fase 6 e a reestrutura inteira, em três rodadas).
 *
 * Três bugs reais confirmados antes deste fix, em ordem de descoberta
 * (ver docblock de `src/app/ficha/FichaHeader.tsx`):
 *   1. (relatado) Aberto via modal, o header caía no fluxo normal de
 *      documento (`src/app/mesas/layout.tsx` renderiza `{modal}` como
 *      irmão comum de `{children}`, sem overlay/portal) — ficava fora
 *      da área visível, empurrado pra baixo do conteúdo da página de
 *      origem.
 *   2. (achado ao investigar o 1º) MESMO na rota direta `/ficha`, o
 *      header nunca foi clicável de verdade — `.rc-backdrop` (z-index
 *      500, `position: fixed; inset: 0`) cobre a tela inteira por cima
 *      de um `<header>` sem z-index próprio.
 *   3. (achado ao testar o fix dos dois primeiros — o mais sutil) o
 *      seletor de personagem trocava de ficha com `router.push()`,
 *      empilhando uma entrada de histórico por troca. "Fechar console"
 *      usa só 1 `router.back()` — então abrir A, trocar pra B e fechar
 *      uma vez voltava pro MODAL DE A, não fechava. O primeiro teste
 *      escrito pra esta suíte reproduziu o sintoma (timeout esperando a
 *      URL voltar pra `/personagens`) mas foi reestruturado pra evitar
 *      a sequência em vez de expor o bug — mascarando um problema real
 *      de UX no próprio processo de verificação. Esta versão do script
 *      exercita a sequência de propósito.
 *
 * Fix 1+2: `FichaHeader.tsx` virou portal pro `document.body`
 * (`createPortal`, mesmo padrão de `ConsoleWindow.tsx`) + `.rc-fichaheader`
 * (`console.css`) ganhou `position: fixed; z-index: 510` — acima do
 * backdrop (500) e da janela (501), abaixo dos modais auxiliares do
 * Console (520).
 * Fix 3: `handleSwitch` trocou `router.push` por `router.replace` — o
 * seletor troca QUAL ficha ocupa a tela atual, não abre uma nova em
 * cima da anterior, então não deve crescer o histórico. Vale tanto pro
 * modal quanto pra rota direta (troca substitui a ficha atual; Voltar
 * do navegador leva pra onde o usuário estava ANTES de abrir a ficha,
 * não para uma versão anterior dela).
 *
 * Universal nos três fixes: resolvem os dois pontos de entrada (modal e
 * direto) com o MESMO código, sem tocar `src/app/mesas/layout.tsx`
 * (compartilhado) nem `src/app/ficha/page.tsx` (rota direta).
 *
 * Cobertura exigida pelo usuário (revisão final):
 *   1. Abrir a ficha sobre uma página Personagens LONGA (aqui: narrador
 *      com várias fixtures de "padding" + filtro de busca aplicado, pra
 *      também servir de prova de estado) e confirmar `.rc-fichaheader`
 *      visível no topo (y≈0), independente de scroll.
 *   2. Abrir A → trocar para B pelo seletor → fechar UMA VEZ → retornar
 *      IMEDIATAMENTE para Personagens (não pro modal de A) — a
 *      sequência que expôs o bug 3.
 *   3. Confirmar preservação do filtro de busca e do estado subjacente
 *      nessa sequência completa (abrir → trocar → fechar), e que a
 *      página de baixo não volta ao topo — com o item aberto ainda à
 *      vista. (Não "scrollTop idêntico": o Console devolve o foco ao
 *      gatilho ao fechar e o navegador rola o foco até a vista. Ver
 *      comentário no critério 3c — a versão anterior deste critério
 *      comparava 0 com 0 e passava sem testar nada.)
 *   4. `/ficha` direta continua correta — clicável de verdade (não só
 *      visível) — E o botão Voltar do navegador, depois de uma troca de
 *      personagem na rota direta, leva pra onde o usuário estava ANTES
 *      de abrir a ficha (Personagens), não pra uma ficha anterior.
 *
 * Extra, decorrente do bug 2: prova ESTRUTURAL via `elementFromPoint`
 * de que o elemento que recebe o clique nas coordenadas do link é de
 * fato dentro de `.rc-fichaheader`, não `.rc-backdrop`.
 *
 * Uso: npx tsx scripts/dev/check-fichaheader-portal-fix.ts
 * (precisa de `npm run dev` e de sessão salva — rode
 * `npx tsx scripts/dev/refresh-admin-session.ts` se a sessão expirou)
 */

import { randomUUID } from "node:crypto";
import { config as loadDotenv } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { createInitialCharacter } from "../../src/lib/character/createCharacter";
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

let campaignId: string | null = null;
let paddingOwnerId: string | null = null;
const paddingCharacterIds: string[] = [];
/** Único caractere-alvo garantido a sobreviver ao filtro de busca aplicado no critério de estado. */
const MARCADOR_BUSCA = "ZZFichaHeaderPortalFix";

async function configurarFixtures(): Promise<void> {
  const email = `check-fichaheader-padding-${Date.now()}@ruptura.dev`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: randomUUID(),
    email_confirm: true,
    user_metadata: { display_name: "Fixture Padding FichaHeader" },
  });
  if (error) throw new Error(`Falha ao criar dono fixture pros personagens de padding: ${error.message}`);
  paddingOwnerId = data.user.id;

  // Página "longa" de Personagens: 14 personagens de padding + os 2
  // reais que já existem na campanha — dá scroll de verdade, sem
  // depender de nenhum jogador controlar nada (o narrador vê todos).
  for (let i = 0; i < 14; i++) {
    const nome = i === 7 ? `${MARCADOR_BUSCA} Alvo` : `Padding ${i} personagem`;
    const personagem = createInitialCharacter(null, nome);
    const id = randomUUID();
    const { error: erroChar } = await admin.from("characters").insert({
      id,
      name: personagem.nome,
      owner_label: null,
      status: "draft",
      payload: personagem,
      campaign_id: campaignId,
      owner_id: paddingOwnerId,
    });
    if (erroChar) throw new Error(`Falha ao criar personagem de padding ${i}: ${erroChar.message}`);
    paddingCharacterIds.push(id);
  }
}

async function limpar(): Promise<void> {
  for (const id of paddingCharacterIds) {
    await admin.from("characters").delete().eq("id", id);
  }
  if (paddingOwnerId) {
    await admin.auth.admin.deleteUser(paddingOwnerId).catch(() => {});
  }
}

async function main() {
  try {
    await withAuthenticatedPage(async (page) => {
      // Nunca `networkidle` nesta suíte: a campanha mantém WebSocket de
      // Realtime aberto, então "rede quieta" pode não acontecer nunca —
      // reprovou com timeout de verdade na varredura da F1. Espera-se
      // por SELETOR, que é o estado que de fato importa.
      await page.goto(`${BASE_URL}/mesas`, { waitUntil: "domcontentloaded" });
      await page.locator('a[href^="/mesas/"]').first().waitFor({ state: "attached", timeout: 20000 });
      const hrefs = await page.locator("a").evaluateAll((as) => as.map((a) => a.getAttribute("href") ?? ""));
      campaignId =
        hrefs
          .map((h) => h.match(/^\/mesas\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i)?.[1])
          .find(Boolean) ?? null;
      if (!campaignId) {
        registrar("0 (campanha de teste)", false, "nenhuma campanha encontrada em /mesas para esta conta");
        return;
      }
      registrar("0 (campanha de teste)", true, `usando ${campaignId}`);

      await configurarFixtures();
      registrar("0b (14 personagens de padding criados)", paddingCharacterIds.length === 14, `${paddingCharacterIds.length}/14`);

      const erros: string[] = [];
      page.on("console", (m) => {
        if (m.type() === "error" && !m.text().includes("favicon") && !m.text().includes("Download the React DevTools")) {
          erros.push(m.text().slice(0, 200));
        }
      });

      // --- Setup: página Personagens longa + filtro de busca aplicado (estado a preservar) ---
      await page.goto(`${BASE_URL}/mesas/${campaignId}/personagens`, { waitUntil: "networkidle" });
      // Mede `.rm-shell-main`, não o documento (F1 do redesign): o shell
      // passou a ser travado na viewport (`height: 100dvh; overflow:
      // hidden`) e a região rolável virou o `main`. Medir
      // `document.documentElement.scrollHeight` aqui passou a devolver
      // sempre a altura da viewport — o critério reprovou de verdade na
      // varredura, apontando não um bug de produto, mas que ESTE teste
      // tinha virado uma medida do elemento errado.
      const alturas = await page.evaluate(() => {
        const main = document.querySelector(".rm-shell-main") as HTMLElement | null;
        return { scroll: main?.scrollHeight ?? 0, visivel: main?.clientHeight ?? 0 };
      });
      registrar(
        "1a (página Personagens é genuinamente longa, rolável dentro do main)",
        alturas.scroll > alturas.visivel + 200,
        `main.scrollHeight=${alturas.scroll}, main.clientHeight=${alturas.visivel}`,
      );

      // Primeiro o filtro ÚNICO, só pra provar que filtrar funciona.
      await page.locator('[data-testid="personagens-busca"]').fill(MARCADOR_BUSCA);
      await page.waitForTimeout(150); // filtro é síncrono (useState local), só dando tempo do React re-renderizar
      const contagemFiltrada = await page.locator('[data-testid="personagens-item-narrador"]').count();
      registrar(
        "1b (filtro de busca reduz a lista ao personagem-alvo)",
        contagemFiltrada === 1,
        `${contagemFiltrada} item(ns) visível(is) com o filtro "${MARCADOR_BUSCA}" (esperado 1)`,
      );

      /*
       * Agora um filtro LARGO ("Padding", 13 itens) pro cenário de
       * preservação. Isto conserta um defeito real deste próprio script,
       * exposto pela guarda `antes > 0` adicionada na F1: a versão
       * anterior filtrava pelo marcador ÚNICO e só depois tentava rolar
       * — com 1 item na tela não havia o que rolar, então `scrollTop`
       * (antes `window.scrollY`) era 0 antes E depois, e o critério 3c
       * "passava" comparando 0 com 0. Passava sem testar nada, desde que
       * foi escrito. Com a lista longa E filtrada ao mesmo tempo, 3b
       * (estado preservado) e 3c (scroll preservado) passam a significar
       * o que prometem.
       */
      const FILTRO_LARGO = "Padding";
      await page.locator('[data-testid="personagens-busca"]').fill(FILTRO_LARGO);
      await page.waitForTimeout(150);
      const alvoTestId = paddingCharacterIds[0]; // "Padding 0 personagem" — visível sob o filtro largo
      const outroId = paddingCharacterIds[1];

      // Rola o MAIN, não a janela: com o shell travado na viewport (F1)
      // quem rola é `.rm-shell-main`, e `window.scrollY` seria sempre 0.
      await page.evaluate(() => {
        const main = document.querySelector(".rm-shell-main") as HTMLElement;
        main.scrollTop = 300;
      });
      const scrollYAntes = await page.evaluate(
        () => (document.querySelector(".rm-shell-main") as HTMLElement).scrollTop,
      );

      // --- 1. Abrir A via modal sobre a página longa: header visível no topo ---
      await page.locator(`[data-testid="personagens-abrir-ficha-${alvoTestId}"]`).click();
      await page.waitForURL(/\/ficha\?/, { timeout: 20000 });
      await page.waitForSelector(".rc-fichaheader", { state: "visible", timeout: 20000 });
      {
        const box = await page.locator(".rc-fichaheader").boundingBox();
        const top = box?.y ?? -1;
        registrar(
          "1 (.rc-fichaheader visível no topo ao abrir via modal sobre página longa)",
          top >= -1 && top <= 2,
          `boundingBox.y=${top} (esperado ≈0, não empurrado pra baixo pelo conteúdo da página de origem)`,
        );
      }

      // Prova estrutural extra: o elemento nas coordenadas do link
      // "← Personagens" é de fato descendente de .rc-fichaheader, não
      // .rc-backdrop (a causa raiz do bug 2).
      {
        const dentroDoHeader = await page.evaluate(() => {
          const link = document.querySelector('[data-testid="ficha-voltar-personagens"]') as HTMLElement | null;
          if (!link) return { ok: false, motivo: "link não encontrado no DOM" };
          const rect = link.getBoundingClientRect();
          const el = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
          const header = document.querySelector(".rc-fichaheader");
          return { ok: !!el && !!header && header.contains(el), motivo: el?.className ?? String(el) };
        });
        registrar(
          "1c (elementFromPoint no link de voltar resolve dentro de .rc-fichaheader, não .rc-backdrop)",
          dentroDoHeader.ok,
          `elemento recebendo o clique: ${dentroDoHeader.motivo}`,
        );
      }

      // --- 2+3. A sequência que expôs o bug 3: trocar pra B pelo
      // seletor, DEPOIS fechar com 1 único clique — precisa voltar
      // direto pra Personagens, não pro modal de A. Preservação de
      // filtro/scroll/estado verificada na MESMA sequência, não numa
      // cena separada e mais fácil. ---
      await page.locator('[data-testid="ficha-seletor-personagem"]').selectOption(outroId);
      await page.waitForURL(new RegExp(`characterId=${outroId}`), { timeout: 20000 });
      {
        const aindaModal = (await page.locator(".rm-navrail").count()) > 0;
        registrar(
          "2a (seletor de personagem no modal navega pro personagem escolhido)",
          aindaModal,
          `URL="${page.url()}", .rm-navrail (casca por baixo) ainda presente=${aindaModal}`,
        );
      }

      await page.locator('[aria-label="Fechar console"]').first().click();
      // Timeout curto e específico: a versão com `router.push` na troca
      // não teria erro nenhum aqui — só ficaria presa em
      // `/ficha?...characterId=alvo` (voltando pra A), nunca em
      // `/personagens`. `waitForURL` reprovaria por timeout exatamente
      // como reprovou na primeira versão desta suíte.
      await page.waitForURL(/\/personagens$/, { timeout: 20000 });
      {
        const url = page.url();
        const voltouDiretoParaPersonagens = url.endsWith("/personagens");
        registrar(
          "2b (fechar 1 vez após trocar de personagem volta DIRETO pra Personagens, não pro modal de A)",
          voltouDiretoParaPersonagens,
          `url final="${url}" (esperado terminar em /personagens — a versão com router.push voltaria pro modal do personagem A)`,
        );
      }
      {
        const semHeaderPortal = (await page.locator(".rc-fichaheader").count()) === 0;
        const buscaAindaPreenchida = await page.locator('[data-testid="personagens-busca"]').inputValue();
        const contagemAindaFiltrada = await page.locator('[data-testid="personagens-item-narrador"]').count();
        const totalSemFiltro = paddingCharacterIds.length + 2; // fixtures + os 2 personagens reais da campanha
        const scrollYDepois = await page.evaluate(
          () => (document.querySelector(".rm-shell-main") as HTMLElement).scrollTop,
        );
        /*
         * `scrollTop` idêntico NÃO é a propriedade certa aqui, e afirmar
         * que era estava errado: ao fechar, o Console devolve o foco ao
         * elemento que abriu a ficha (medido — `document.activeElement`
         * é o link `personagens-abrir-ficha-*`), e o navegador rola um
         * elemento focado até a vista por padrão. Isso é anterior à F1;
         * o que a F1 mudou foi QUEM rola (antes o documento, agora o
         * `main`), e o critério só não acusava porque comparava 0 com 0.
         *
         * A garantia que interessa ao usuário é outra, e é mais forte
         * que "scrollTop igual": a página de baixo não foi recriada nem
         * voltou ao topo, e o item que você abriu continua à vista —
         * ou seja, você volta a trabalhar de onde parou.
         */
        const gatilhoVisivel = await page.evaluate((tid) => {
          const el = document.querySelector(`[data-testid="${tid}"]`);
          if (!el) return false;
          const r = el.getBoundingClientRect();
          return r.top >= 0 && r.bottom <= window.innerHeight;
        }, `personagens-abrir-ficha-${alvoTestId}`);
        registrar(
          "3a (portal do header desmonta ao fechar)",
          semHeaderPortal,
          `.rc-fichaheader no DOM=${!semHeaderPortal} (esperado ausente)`,
        );
        registrar(
          "3b (estado do filtro de busca preservado — página não remontou)",
          buscaAindaPreenchida === FILTRO_LARGO && contagemAindaFiltrada > 0 && contagemAindaFiltrada < totalSemFiltro,
          `busca="${buscaAindaPreenchida}" (esperado "${FILTRO_LARGO}"), itens filtrados=${contagemAindaFiltrada} (esperado entre 1 e ${totalSemFiltro - 1} — filtro ainda aplicado)`,
        );
        registrar(
          "3c (página subjacente não volta ao topo, e o item aberto continua à vista)",
          scrollYAntes > 0 && scrollYDepois > 0 && gatilhoVisivel,
          `main.scrollTop antes=${scrollYAntes}, depois=${scrollYDepois}, gatilho visível na viewport=${gatilhoVisivel}` +
            (scrollYAntes === 0 ? " — ATENÇÃO: antes=0 tornaria este critério vazio" : ""),
        );
      }

      // --- 4. /ficha direta: página cheia + header genuinamente clicável ---
      await page.goto(`${BASE_URL}/ficha?campaignId=${campaignId}&characterId=${alvoTestId}`, { waitUntil: "domcontentloaded" });
      await page.locator(".rc-fichaheader").waitFor({ state: "visible", timeout: 20000 });
      {
        const semCasca = (await page.locator(".rm-navrail").count()) === 0;
        const box = await page.locator(".rc-fichaheader").boundingBox();
        const top = box?.y ?? -1;
        registrar(
          "4a (/ficha direta é página cheia, .rc-fichaheader no topo)",
          semCasca && top >= -1 && top <= 2,
          `.rm-navrail ausente=${semCasca}, boundingBox.y=${top}`,
        );
      }
      {
        // Clique de verdade, timeout curto — a versão quebrada travava
        // aqui com "waiting for element to be visible, enabled and
        // stable" porque .rc-backdrop capturava o clique.
        let clicouComSucesso = false;
        try {
          await page.locator('[data-testid="ficha-voltar-personagens"]').click({ timeout: 5000 });
          await page.waitForURL(/\/personagens$/, { timeout: 20000 });
          clicouComSucesso = true;
        } catch {
          clicouComSucesso = false;
        }
        registrar(
          "4b (link '← Personagens' na rota direta é genuinamente clicável, não só visível)",
          clicouComSucesso,
          `clique real completou e navegou=${clicouComSucesso}`,
        );
      }

      // --- 4c. Voltar do navegador na rota direta, depois de uma troca
      // — precisa levar pra onde o usuário estava ANTES de abrir a
      // ficha (Personagens, entrada de navegação real), não pra uma
      // versão anterior da própria ficha. ---
      await page.goto(`${BASE_URL}/mesas/${campaignId}/personagens`, { waitUntil: "domcontentloaded" });
      await page.locator('[data-testid="personagens-busca"]').waitFor({ state: "visible", timeout: 20000 });
      await page.goto(`${BASE_URL}/ficha?campaignId=${campaignId}&characterId=${alvoTestId}`, { waitUntil: "domcontentloaded" });
      await page.locator(".rc-fichaheader").waitFor({ state: "visible", timeout: 20000 });
      await page.locator('[data-testid="ficha-seletor-personagem"]').selectOption(outroId);
      await page.waitForURL(new RegExp(`characterId=${outroId}`), { timeout: 20000 });
      await page.goBack({ waitUntil: "domcontentloaded", timeout: 10000 });
      await page.waitForURL(/\/personagens$/, { timeout: 10000 }).catch(() => undefined);
      {
        const url = page.url();
        const voltouParaPersonagens = url.endsWith("/personagens");
        registrar(
          "4c (Voltar do navegador, após trocar de personagem na rota direta, leva pra Personagens — não pra uma ficha anterior)",
          voltouParaPersonagens,
          `url final="${url}" (esperado terminar em /personagens — router.push na troca levaria de volta ao personagem-alvo)`,
        );
      }

      registrar("5 (console limpo durante toda a verificação)", erros.length === 0, erros.length ? JSON.stringify(erros.slice(0, 3)) : "nenhum");
    });
  } finally {
    await limpar();
  }

  console.log(`\n${passou} ok, ${falhou} falha(s).`);
  if (falhou > 0) process.exit(1);
}

main().catch((e) => {
  console.error("Erro fatal:", e);
  process.exit(1);
});
