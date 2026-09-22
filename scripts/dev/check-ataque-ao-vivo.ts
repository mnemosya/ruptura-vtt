/**
 * O ATAQUE AO VIVO — do golpe no chat ao PV que cai, visto dos dois
 * lados.
 *
 * Sexto da família iniciada por `check-mesa-ao-vivo.ts`, e o primeiro
 * que percorre um FLUXO inteiro em vez de uma entrega só.
 *
 * ── Por que este fluxo ──────────────────────────────────────────────
 * Um ataque atravessa quase tudo o que a mesa tem: nasce como evento no
 * log, vira cartão no painel dos dois lados, espera uma decisão que só
 * o narrador pode tomar, escreve no PERSONAGEM (que é canônico, não do
 * VTT), e o resultado precisa voltar para o cartão e para o mapa. Cada
 * um desses passos tem cobertura em algum lugar da suíte; a corrente
 * inteira, ligada, não tinha nenhuma.
 *
 * E é uma corrente onde cada elo falha calado. O cartão que não
 * atualiza deixa o narrador achando que não aplicou e clicar de novo. O
 * PV que não chega ao mapa deixa a mesa jogando com um número velho.
 * Nada disso dá erro na tela.
 *
 * ── O critério que eu mais queria escrever ──────────────────────────
 * O 7: aplicar duas vezes não tira o dano duas vezes. `combatePainel.ts`
 * trata isso com uma trava de unicidade e o comentário diz que a
 * segunda tentativa "não é erro para quem clicou — é a resposta certa".
 * É a proteção contra o gesto mais humano que existe num momento tenso:
 * clicar de novo porque a tela não pareceu responder. Sem ela, um
 * clique nervoso tira metade da vida de alguém.
 *
 * ── Regras do arquivo ───────────────────────────────────────────────
 *   · NENHUM reload depois que as duas sessões abrem;
 *   · toda espera é por CONDIÇÃO, com o relógio como teto;
 *   · o primeiro critério é "o canal assinou", porque sem isso todo o
 *     resto falha por consequência.
 *
 * Uso: npx tsx scripts/dev/check-ataque-ao-vivo.ts
 */

import { randomUUID } from "node:crypto";
import { config as loadDotenv } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { chromium, type Browser, type Page } from "playwright";
import { BASE_URL } from "./authSession";
import { recolherPainelDaSessao } from "./painelDaSessao";
import { createInitialCharacter } from "../../src/lib/character/createCharacter";

loadDotenv({ path: ".env.local" });

function exigirEnv(nome: string): string {
  const v = process.env[nome];
  if (!v) throw new Error(`${nome} ausente no .env.local`);
  return v;
}

const admin = createClient(exigirEnv("SUPABASE_URL"), exigirEnv("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
const anon = createClient(exigirEnv("SUPABASE_URL"), exigirEnv("SUPABASE_ANON_KEY"), { auth: { persistSession: false, autoRefreshToken: false } });
const SENHA = "Fixture#12345";
const PREFIXO = "zz_e2e_ao_vivo";
const DANO = 3;

let passou = 0;
let falhou = 0;
function registrar(criterio: string, ok: boolean, detalhe: string) {
  if (ok) { passou++; console.log(`ok - ${criterio}: ${detalhe}`); }
  else { falhou++; console.error(`FALHA - ${criterio}: ${detalhe}`); }
}

const criados = { usuarios: [] as string[], campanhas: [] as string[] };

async function criarConta(papel: string): Promise<{ id: string; email: string }> {
  const email = `${PREFIXO}-${papel}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@ruptura.dev`;
  const { data, error } = await admin.auth.admin.createUser({
    email, password: SENHA, email_confirm: true, user_metadata: { display_name: papel },
  });
  if (error || !data.user) throw new Error(`Falha ao criar ${papel}: ${error?.message}`);
  criados.usuarios.push(data.user.id);
  return { id: data.user.id, email };
}

async function esperarAte(cond: () => Promise<boolean>, tetoMs = 10000): Promise<number | null> {
  const t0 = Date.now();
  while (Date.now() - t0 < tetoMs) {
    if (await cond()) return Date.now() - t0;
    await new Promise((r) => setTimeout(r, 150));
  }
  return null;
}

interface Sessao { page: Page; errosDeCanal: string[]; fechar: () => Promise<void> }

async function abrirSessao(browser: Browser, email: string, campaignId: string): Promise<Sessao> {
  const { data, error } = await anon.auth.signInWithPassword({ email, password: SENHA });
  if (error || !data.session) throw new Error(`Falha ao logar ${email}: ${error?.message}`);
  const contexto = await browser.newContext({ viewport: { width: 1600, height: 950 } });
  await contexto.addCookies([{
    name: "ruptura_auth",
    value: JSON.stringify({ access_token: data.session.access_token, refresh_token: data.session.refresh_token }),
    domain: "localhost", path: "/", httpOnly: true, secure: false, sameSite: "Lax",
    expires: Math.floor(Date.now() / 1000) + 604800,
  }]);
  const page = await contexto.newPage();

  const errosDeCanal: string[] = [];
  const texto = (p: string | Buffer) => (typeof p === "string" ? p : Buffer.from(p).toString("utf8"));
  page.on("websocket", (ws) => {
    if (!ws.url().includes("supabase")) return;
    ws.on("framereceived", (f) => {
      const t = texto(f.payload);
      if (t.includes("Unable to subscribe") || t.includes('"status":"error"')) errosDeCanal.push(t.slice(0, 300));
    });
  });

  await page.goto(`${BASE_URL}/mesas/${campaignId}`, { waitUntil: "networkidle" });
  await page.waitForSelector(".rv-ferramentas", { timeout: 30000 });
  return { page, errosDeCanal, fechar: () => contexto.close() };
}

/** O PV canônico do personagem, lido do banco — a verdade contra a qual as telas são medidas. */
async function pvNoBanco(personagemId: string): Promise<number | null> {
  const { data } = await admin.from("characters").select("payload").eq("id", personagemId).single();
  const p = (data?.payload ?? {}) as { recursos_atuais?: { pv?: number } };
  return p.recursos_atuais?.pv ?? null;
}

async function limpar(): Promise<void> {
  for (const id of criados.campanhas) await admin.from("campaigns").delete().eq("id", id);
  for (const id of criados.usuarios) await admin.auth.admin.deleteUser(id).catch(() => {});
}

async function main(): Promise<void> {
  const narrador = await criarConta("narrador");
  const jogador = await criarConta("jogador");
  const campaignId = randomUUID();
  await admin.from("campaigns").insert({ id: campaignId, name: `${PREFIXO}_ataque`, owner_id: narrador.id });
  criados.campanhas.push(campaignId);
  await admin.from("campaign_members").insert({
    campaign_id: campaignId, user_id: jogador.id, role: "player", status: "active",
  });
  const { data: cena } = await admin.from("vtt_scenes")
    .insert({ campaign_id: campaignId, nome: "Luta ao vivo", largura: 14, altura: 14 })
    .select("id").single();
  await admin.from("vtt_scene_presentation")
    .insert({ campaign_id: campaignId, presented_scene_id: cena!.id, updated_by: narrador.id });

  // O alvo é um personagem CANÔNICO com dono, não um token avulso: o
  // dano é aplicado na ficha, e é lá que a regra de dano mora.
  const personagemId = randomUUID();
  const { error: erroPersonagem } = await admin.from("characters").insert({
    id: personagemId, campaign_id: campaignId, owner_id: jogador.id,
    name: "Corvo", payload: createInitialCharacter(null, "Corvo"),
  });
  if (erroPersonagem) throw new Error(`Falha ao criar personagem: ${erroPersonagem.message}`);
  const { error: erroControle } = await admin.from("character_controllers")
    .insert({ character_id: personagemId, campaign_id: campaignId, user_id: jogador.id });
  if (erroControle) throw new Error(`Falha ao vincular controlador: ${erroControle.message}`);

  // `pv_publico`: o critério 6 é sobre o PV chegar ao MAPA, não sobre
  // autorização — sem isto ele viraria outro teste.
  await admin.from("vtt_tokens").insert({
    scene_id: cena!.id, campaign_id: campaignId, character_id: personagemId,
    nome: "Corvo", sigla: "CO", lado: "pj", vertente: "nenhuma",
    q: 5, r: 5, tamanho: "medio", orientacao: 0, visivel: true, pv_publico: true,
  });

  const pvInicial = await pvNoBanco(personagemId);
  if (pvInicial == null) throw new Error("personagem sem PV inicial — fixture inválida");

  const browser = await chromium.launch({ headless: true });
  let sessaoN: Sessao | null = null;
  let sessaoJ: Sessao | null = null;
  try {
    sessaoN = await abrirSessao(browser, narrador.email, campaignId);
    sessaoJ = await abrirSessao(browser, jogador.email, campaignId);
    registrar("0 (as duas sessões abrem na mesma mesa)", true, `campanha=${campaignId}, PV inicial=${pvInicial}`);

    await new Promise((r) => setTimeout(r, 4000)); // janela para o servidor responder às assinaturas
    registrar("1a (o narrador assina os canais sem recusa do servidor)",
      sessaoN.errosDeCanal.length === 0, sessaoN.errosDeCanal[0] ?? "nenhuma recusa");
    registrar("1b (o jogador assina os canais sem recusa do servidor)",
      sessaoJ.errosDeCanal.length === 0, sessaoJ.errosDeCanal[0] ?? "nenhuma recusa");

    // O painel da sessão fica ABERTO aqui, ao contrário dos outros
    // checks da família: é nele que o cartão de ataque vive, e é dele
    // que sai o botão de aplicar dano. Ele só é recolhido no critério
    // 6, que precisa do mapa.

    // ── 2. O ataque aparece no painel dos DOIS ───────────────────
    // O evento entra como `attack_resolved`, que é o tipo que o painel
    // projeta no cartão de ataque. O jogador precisa ver: é o
    // personagem DELE que está prestes a levar dano.
    const { data: log } = await admin.from("table_logs").insert({
      campaign_id: campaignId, type: "attack_resolved", visibility: "public",
      payload: {
        workflowId: randomUUID(),
        armaNome: "Lâmina curta",
        atacanteNome: "Sentinela",
        alvoNome: "Corvo",
        alvoCharacterId: personagemId,
        acertou: true,
        totalAtaque: 14, totalDefesa: 9,
        dano: DANO,
      },
    }).select("id").single();

    const cartao = (p: Page) => p.locator('[data-testid="painel-feed-ataque"]');
    const msN = await esperarAte(async () => (await cartao(sessaoN!.page).count()) > 0);
    const msJ = await esperarAte(async () => (await cartao(sessaoJ!.page).count()) > 0);
    registrar(
      "2 (o ataque aparece no painel dos dois, sem reload)",
      msN !== null && msJ !== null,
      `narrador=${msN ?? "não chegou"}ms, jogador=${msJ ?? "não chegou"}ms`,
    );

    // ── 3. Só o narrador decide ──────────────────────────────────
    // O botão de aplicar dano é do narrador (`podeAplicarDano: role ===
    // "narrator"`). Vale como critério porque é autorização VISÍVEL: o
    // jogador não pode nem ser tentado a resolver o próprio dano.
    const botao = (p: Page) => p.locator('[data-testid="painel-feed-aplicar-dano"]');
    const temNoNarrador = await esperarAte(async () => (await botao(sessaoN!.page).count()) > 0);
    const temNoJogador = (await botao(sessaoJ.page).count()) > 0;
    registrar(
      "3 (\"Aplicar dano\" existe para o narrador e não para o jogador)",
      temNoNarrador !== null && !temNoJogador,
      `narrador=${temNoNarrador !== null}, jogador=${temNoJogador}`,
    );

    // ── 4. Aplicar escreve no PERSONAGEM, que é canônico ─────────
    await botao(sessaoN.page).click();
    const msPv = await esperarAte(async () => (await pvNoBanco(personagemId)) === pvInicial - DANO);
    const pvDepois = await pvNoBanco(personagemId);
    registrar(
      "4 (aplicar dano escreve o PV canônico do personagem)",
      msPv !== null,
      `PV ${pvInicial} → ${pvDepois} (esperado ${pvInicial - DANO})`,
    );

    // ── 5. O cartão do JOGADOR vira "resolvido" ──────────────────
    // O elo que fecha a corrente na direção de volta. Sem ele o
    // jogador continua vendo um ataque pendurado, sem saber que já
    // levou o dano.
    {
      const resolvido = sessaoJ.page.locator('[data-testid="painel-feed-ataque-resolvido"]');
      const ms = await esperarAte(async () => (await resolvido.count()) > 0);
      const texto = ((await resolvido.first().textContent().catch(() => "")) ?? "").replace(/\s+/g, " ").trim();
      registrar(
        "5 (o cartão do jogador vira \"resolvido\" com o PV antes e depois, sem reload)",
        ms !== null && texto.includes(String(pvInicial)) && texto.includes(String(pvInicial - DANO)),
        ms !== null ? `${ms}ms — "${texto}"` : "o cartão do jogador não resolveu em 10s",
      );
    }

    // ── 6. E o PV chega ao MAPA ──────────────────────────────────
    // A corrente inteira: chat → ficha canônica → token. É o número
    // que a mesa olha durante a luta.
    {
      // Agora sim: o painel sai da frente, porque o que interessa
      // daqui pra baixo é o mapa.
      await recolherPainelDaSessao(sessaoN.page);
      const caixa = await sessaoN.page.locator('.rv-token[data-token-id]').first().boundingBox();
      if (caixa) await sessaoN.page.mouse.move(caixa.x + caixa.width / 2, caixa.y + caixa.height / 2);
      const linhaPv = sessaoN.page.locator('.rv-cartao-token__linha[data-recurso="pv"]');
      const ms = await esperarAte(async () => {
        const t = ((await linhaPv.textContent().catch(() => "")) ?? "");
        return t.includes(String(pvInicial - DANO));
      });
      const t = ((await linhaPv.textContent().catch(() => "")) ?? "").replace(/\s+/g, " ").trim();
      registrar(
        "6 (o PV novo chega ao cartão do token no mapa, sem reload)",
        ms !== null,
        ms !== null ? `${ms}ms — cartão mostra "${t}"` : `não chegou em 10s — cartão mostra "${t}"`,
      );
    }

    // ── 7. Aplicar DUAS vezes não tira o dano duas vezes ─────────
    //
    // O gesto mais humano num momento tenso: clicar de novo porque a
    // tela não pareceu responder. `combatePainel.ts` trata isso com uma
    // trava de unicidade em `campaign_workflow_steps`, e o comentário
    // de lá diz o essencial — a segunda tentativa "não é erro para quem
    // clicou, é a resposta certa".
    //
    // COMO FORÇAR A SEGUNDA TENTATIVA, e por que não é trapaça. Depois
    // de aplicar, o cartão vira "resolvido" e o botão some — essa é a
    // primeira proteção, e ela funciona. Mas ela é de INTERFACE: o
    // estado do cartão é derivado do log `attack_damage_applied`. A
    // trava de verdade é a do banco, e é ela que este critério existe
    // pra provar.
    //
    // Então o log de aplicação é apagado, o que devolve o cartão ao
    // estado "aguardando_aplicacao" e o botão à tela. É exatamente a
    // situação contra a qual a trava foi escrita: a interface acha que
    // não aplicou, e clica. Se a trava não segurar, o PV cai de novo.
    //
    // A primeira versão deste critério confiava no botão reaparecer
    // sozinho depois de um reload. Ele não reaparece — e o critério
    // passou VERDE sem ter clicado nada, provando apenas que o PV não
    // muda quando ninguém mexe. Um falso verde, do mesmo feitio dos que
    // esta família já encontrou em outros arquivos.
    {
      const pvAntesDaSegunda = await pvNoBanco(personagemId);
      const { error: erroApagar } = await admin.from("table_logs")
        .delete().eq("campaign_id", campaignId).eq("type", "attack_damage_applied");
      if (erroApagar) throw new Error(`não foi possível devolver o cartão ao estado pendente: ${erroApagar.message}`);

      // O feed não reconstrói o cartão sozinho quando um log é
      // APAGADO — ele é alimentado por chegada, não por remoção. Um
      // reload aqui é SETUP do critério, não medição: a regra de "sem
      // reload" desta família protege as medidas de entrega ao vivo, e
      // elas já foram todas feitas acima (critérios 2 a 6).
      await sessaoN.page.reload({ waitUntil: "networkidle" });
      await sessaoN.page.waitForSelector(".rv-ferramentas", { timeout: 30000 });
      // O painel foi recolhido no critério 6 e o estado sobrevive ao
      // reload — sem reabrir, o botão EXISTE no DOM e não é clicável, e
      // o Playwright fica trinta segundos tentando clicar em algo
      // invisível.
      await sessaoN.page.locator('[data-testid="painel-expandir"]').click().catch(() => {});
      await sessaoN.page.waitForTimeout(500);
      const voltouOBotao = await esperarAte(async () => (await botao(sessaoN!.page).count()) > 0, 20000);
      if (voltouOBotao !== null) {
        await botao(sessaoN.page).click();
        // Espera a ação responder: a trava devolve sucesso com
        // `aplicadoAgora: false`, então a tela reage do mesmo jeito.
        await esperarAte(async () =>
          (await sessaoN!.page.locator('[data-testid="painel-feed-ataque-resolvido"]').count()) > 0, 10000);
      }
      const pvFinal = await pvNoBanco(personagemId);

      registrar(
        "7 (a segunda aplicação é recusada pela trava — o dano não sai duas vezes)",
        voltouOBotao !== null && pvFinal === pvAntesDaSegunda,
        voltouOBotao !== null
          ? `clicou de novo; PV ${pvAntesDaSegunda} → ${pvFinal} (se a trava falhasse, seria ${(pvAntesDaSegunda ?? 0) - DANO})`
          : "o botão não voltou em 15s — a segunda tentativa não chegou a ser feita, então este critério não provou nada",
      );
    }

    // ── 8. Nenhuma recusa durante a sessão inteira ───────────────
    const todasRecusas = [...sessaoN.errosDeCanal, ...sessaoJ.errosDeCanal];
    registrar("8 (nenhuma recusa de assinatura durante a sessão inteira)",
      todasRecusas.length === 0, todasRecusas[0] ?? "nenhuma");
    void log;
  } finally {
    await sessaoN?.fechar();
    await sessaoJ?.fechar();
    await browser.close();
    await limpar();
  }

  console.log(`\n${passou} ok, ${falhou} falha(s).`);
  process.exit(falhou > 0 ? 1 : 0);
}

main().catch(async (e) => {
  console.error("\ncheck-ataque-ao-vivo FALHOU:\n", e instanceof Error ? e.message : e);
  await limpar().catch(() => {});
  process.exit(1);
});
