/**
 * Browser check do PAINEL LATERAL da Mesa (`vtt/_painel/`) — moldura,
 * Chat, Personagens, Participantes, Bando e Compêndio contra a rota
 * real `/mesas/[campaignId]/vtt`, com duas sessões autenticadas
 * (narrador e jogador) e dados reais no banco.
 *
 * É o par do teste determinístico `scripts/test-vtt-painel.ts` (lógica
 * pura, sem servidor). Aqui se prova o que só a rota prova: que o
 * painel está de fato ligado ao `CampaignRealtimeProvider`, às Server
 * Actions e à RLS — e que o jogador NÃO recebe o que não pode ver.
 *
 * Cobre:
 *
 *  Moldura
 *   1a  cinco abas com semântica de tablist (role/aria-selected/aria-controls)
 *   1b  trocar de aba por clique
 *   1c  navegação por SETA move aba e foco
 *   1d  recolher e reabrir; corpo some de verdade quando recolhido
 *   1e  última aba e largura persistem entre recargas
 *   1f  painel recolhido não cobre o mapa
 *   1g  drawer em viewport estreita (sem bloquear o mapa), com Esc fechando
 *
 *  Chat
 *   2a  carrega o log REAL da campanha (nada de mensagem de exemplo)
 *   2b  envio grava em `table_logs` com autoria resolvida no SERVIDOR
 *   2c  a mensagem aparece na segunda sessão (realtime), SEM duplicar
 *   2d  autoria por personagem do token selecionado
 *   2e  fallback de autoria (narrador sem token → "Narrador")
 *   2f  visibilidade `gm` do narrador nunca chega ao jogador
 *   2g  falha de envio preserva o texto e mostra erro com retry
 *   2h  contador real de não lidos
 *
 *  Personagens
 *   3a  lista DOCUMENTOS persistentes, não tokens da cena
 *   3b  token avulso (sem personagem) não aparece no diretório
 *   3c  jogador não vê personagem que não controla
 *   3d  busca por nome
 *   3e  criar pasta e mover para ela
 *   3f  criar / duplicar / arquivar
 *   3g  arrastar para o mapa cria token VINCULADO pelo fluxo canônico
 *   3h  RLS da migration 0090 fecha pastas/colocações ao jogador
 *
 *  Participantes
 *   4a  roster real (narrador + jogador), narrador primeiro
 *   4b  estados de presença distintos, nunca "todos offline" por falha
 *   4c  personagens controlados sob o participante
 *
 *  Bando
 *   5a  itens e quantidades reais
 *   5b  estado vazio real
 *   5c  detalhe preserva o payload técnico da instância
 *   5d  jogador não recebe as ações destrutivas
 *
 *  Compêndio
 *   6a  carregamento SOB DEMANDA (nada antes de abrir a aba)
 *   6b  contagens reais e busca
 *   6c  detalhe abre o documento completo
 *   6d  "Enviar ao Chat" grava evento estruturado
 *   6e  visualizar não cria instância de item nenhuma
 *
 *  8   INVARIANTES DE UX: composer visível, sem overflow, aba ativa
 *      inerte, estado preservado, Console interno sem navegar
 *  9   feed é PROJEÇÃO: evento técnico não aparece; cada evento usa o
 *      card certo; divisor é compacto
 * 10   ataque percorre estados e aplica dano UMA vez (idempotência)
 * 11   magia não rola ataque/dano ao conjurar
 * 12   teclado e foco sem scroll externo
 * 13   drawer preserva o composer
 *
 *  7   console limpo nas duas sessões
 *
 * Uso: npx tsx scripts/dev/check-vtt-painel.ts
 *      (servidor dev já rodando em localhost:3000)
 */

import { randomUUID } from "node:crypto";
import { config as loadDotenv } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { chromium, type BrowserContext, type ConsoleMessage, type Locator, type Page } from "playwright";
import { BASE_URL } from "./authSession";

loadDotenv({ path: ".env.local" });

function requireEnv(nome: string): string {
  const v = process.env[nome];
  if (!v) {
    console.error(`Variável de ambiente ausente: ${nome}`);
    process.exit(1);
  }
  return v;
}
const supabaseUrl = requireEnv("SUPABASE_URL");
const anonKey = requireEnv("SUPABASE_ANON_KEY");
const admin = createClient(supabaseUrl, requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
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

function erroRelevante(msg: ConsoleMessage): boolean {
  if (msg.type() !== "error") return false;
  const t = msg.text();
  if (t.includes("favicon") || t.includes("Download the React DevTools")) return false;
  // Corrida de Realtime PRÉ-EXISTENTE, já documentada em
  // `check-vtt-integracao.ts` e no próprio `VttClient.tsx` — não é
  // regressão deste painel.
  if (t.includes("Cannot update a component") && t.includes("while rendering a different component")) return false;
  return true;
}

async function esperarAte(cond: () => Promise<boolean>, ms = 8000): Promise<boolean> {
  const fim = Date.now() + ms;
  while (Date.now() < fim) {
    if (await cond()) return true;
    await new Promise((r) => setTimeout(r, 180));
  }
  return false;
}

// ── Fixture ──────────────────────────────────────────────────────
const criados = { usuarios: [] as string[], campanhas: [] as string[] };
let campaignId = "";
let campanhaVaziaId = "";
let narradorEmail = "";
let narradorSenha = "";
let narradorId = "";
let jogadorEmail = "";
let jogadorSenha = "";
let jogadorId = "";
let personagemDoJogador = "";
let personagemPn = "";
let tokenAvulsoNome = "";

async function criarConta(prefixo: string, nome: string): Promise<{ id: string; email: string; senha: string }> {
  const email = `check-vtt-painel-${prefixo}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@ruptura.dev`;
  const senha = randomUUID();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: senha,
    email_confirm: true,
    user_metadata: { display_name: nome },
  });
  if (error || !data.user) throw new Error(`Falha ao criar conta ${prefixo}: ${error?.message}`);
  criados.usuarios.push(data.user.id);
  return { id: data.user.id, email, senha };
}

async function configurarFixture(): Promise<void> {
  const narrador = await criarConta("narrador", "Narradora Gabs");
  narradorId = narrador.id;
  narradorEmail = narrador.email;
  narradorSenha = narrador.senha;

  const jogador = await criarConta("jogador", "Jogador Rafa");
  jogadorId = jogador.id;
  jogadorEmail = jogador.email;
  jogadorSenha = jogador.senha;

  campaignId = randomUUID();
  campanhaVaziaId = randomUUID();
  const { error: e1 } = await admin.from("campaigns").insert([
    { id: campaignId, name: "Painel — mesa cheia", owner_id: narradorId },
    { id: campanhaVaziaId, name: "Painel — mesa vazia", owner_id: narradorId },
  ]);
  if (e1) throw new Error(`Falha ao criar campanhas: ${e1.message}`);
  criados.campanhas.push(campaignId, campanhaVaziaId);

  const { error: e2 } = await admin
    .from("campaign_members")
    .insert({ campaign_id: campaignId, user_id: jogadorId, role: "player", status: "active", origem: "fixture_painel" });
  if (e2) throw new Error(`Falha ao adicionar jogador: ${e2.message}`);

  personagemDoJogador = randomUUID();
  personagemPn = randomUUID();
  const { error: e3 } = await admin.from("characters").insert([
    {
      id: personagemDoJogador,
      name: "Mara Venn",
      status: "draft",
      payload: { nome: "Mara Venn", metadados: { schema_version: 1 } },
      campaign_id: campaignId,
      owner_id: jogadorId,
    },
    {
      id: personagemPn,
      name: "Corvo do Jammer",
      status: "draft",
      payload: { nome: "Corvo do Jammer", metadados: { schema_version: 1, tipo_personagem: "pn" } },
      campaign_id: campaignId,
      owner_id: narradorId,
    },
  ]);
  if (e3) throw new Error(`Falha ao criar personagens: ${e3.message}`);

  const { error: e4 } = await admin
    .from("character_controllers")
    .insert({ character_id: personagemDoJogador, campaign_id: campaignId, user_id: jogadorId });
  if (e4) throw new Error(`Falha ao conceder controle: ${e4.message}`);

  // Inventário do bando com estado técnico de verdade — o detalhe tem
  // que mostrar cargas/munição, não um resumo achatado.
  const instanciaId = randomUUID();
  const { error: e5 } = await admin.from("campaign_inventory_items").insert({
    campaign_id: campaignId,
    item_instance_id: instanciaId,
    item_name: "Fuzil Runado",
    item_slug: "fuzil-runado",
    quantity: 1,
    payload: {
      id: instanciaId,
      itemSlug: "fuzil-runado",
      itemNome: "Fuzil Runado",
      categoria: "arma",
      subtipo: "longa",
      quantidade: 1,
      estado: "mochila",
      cargasAtual: 2,
      municaoCarregada: { itemNome: "Balas 9mm", quantidade: 12 },
      runasInstaladas: [{ runaNome: "Sobregravação" }],
      adquiridoEm: new Date().toISOString(),
    },
  });
  if (e5) throw new Error(`Falha ao semear o bando: ${e5.message}`);

  // Uma entrada de log ANTERIOR à sessão — o Chat tem que carregar o
  // log real, não começar vazio nem com mensagens de exemplo.
  const { error: e6 } = await admin.from("table_logs").insert({
    campaign_id: campaignId,
    type: "chat",
    visibility: "public",
    payload: { text: "O jammer ainda zumbe no canto do pátio.", autorNome: "Narrador", autorTipo: "narrador" },
    created_by_user_id: narradorId,
  });
  if (e6) throw new Error(`Falha ao semear o log: ${e6.message}`);
}

async function contextoDe(email: string, senha: string, viewport = { width: 1440, height: 950 }) {
  const anon = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await anon.auth.signInWithPassword({ email, password: senha });
  if (error || !data.session) throw new Error(`Falha ao logar ${email}: ${error?.message}`);
  const browser = await chromium.launch({ headless: true });
  const context: BrowserContext = await browser.newContext({ viewport });
  await context.addCookies([
    {
      name: "ruptura_auth",
      value: JSON.stringify({ access_token: data.session.access_token, refresh_token: data.session.refresh_token }),
      domain: "localhost",
      path: "/",
      httpOnly: true,
      secure: false,
      sameSite: "Lax",
      expires: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7,
    },
  ]);
  const page = await context.newPage();
  return { context, page, close: () => browser.close() };
}

async function limpar() {
  for (const cid of criados.campanhas) {
    await admin.from("table_logs").delete().eq("campaign_id", cid);
    await admin.from("campaign_inventory_items").delete().eq("campaign_id", cid);
    await admin.from("campaign_character_placements").delete().eq("campaign_id", cid);
    await admin.from("campaign_character_folders").delete().eq("campaign_id", cid);
    await admin.from("vtt_marks").delete().eq("campaign_id", cid);
    await admin.from("vtt_terrain").delete().eq("campaign_id", cid);
    await admin.from("vtt_tokens").delete().eq("campaign_id", cid);
    await admin.from("vtt_scenes").delete().eq("campaign_id", cid);
    await admin.from("character_controllers").delete().eq("campaign_id", cid);
    await admin.from("characters").delete().eq("campaign_id", cid);
    await admin.from("campaign_members").delete().eq("campaign_id", cid);
    await admin.from("campaigns").delete().eq("id", cid);
  }
  for (const uid of criados.usuarios) await admin.auth.admin.deleteUser(uid);
  registrar("L (limpeza de fixtures)", true, `${criados.usuarios.length} conta(s), ${criados.campanhas.length} campanha(s)`);
}

/** Abre a Mesa e espera o painel existir. */
async function abrirMesa(page: Page, id = campaignId) {
  await page.goto(`${BASE_URL}/mesas/${id}/vtt`, { waitUntil: "networkidle" });
  await page.waitForSelector('[data-testid="painel-vtt"]', { timeout: 20000 });
}

/**
 * Garante a aba visível. Clicar na aba JÁ ativa RECOLHE o painel (o
 * atalho do Foundry que o painel implementa), então só clica quando ela
 * ainda não está selecionada — `aria-selected` já é `aberto && ativa`,
 * o que cobre também o caso do painel recolhido na aba certa.
 */
/**
 * Envia uma mensagem pelo composer do Chat.
 *
 * Espera o botão de enviar sair de DESABILITADO antes de apertar
 * Enter. Isso não é conveniência: o painel bloqueia um segundo envio
 * enquanto o primeiro está em voo (requisito "desabilitar envio
 * enquanto o mesmo envio estiver em voo"), e a linha no banco aparece
 * ANTES de a Server Action retornar — então um teste que só esperasse
 * a linha dispararia o Enter seguinte dentro da janela de bloqueio e o
 * segundo envio seria descartado em silêncio, como de fato acontecia.
 */
async function enviarNoChat(page: Page, texto: string) {
  const botao = page.locator('[data-testid="painel-chat-enviar"]');
  await esperarAte(async () => !(await botao.isDisabled()) || (await page.locator('[data-testid="painel-chat-input"]').inputValue()) === "", 30000);
  await page.locator('[data-testid="painel-chat-input"]').fill(texto);
  await esperarAte(async () => !(await botao.isDisabled()), 30000);
  await page.locator('[data-testid="painel-chat-input"]').press("Enter");
}

/**
 * Escolhe uma opção num chip-menu do composer (autoria/visibilidade).
 * O `<select>` nativo saiu: a spec pede menu compacto na linguagem do
 * Console, e um popup do sistema operacional não é isso.
 */
async function escolherNoChip(page: Page, chipTestId: string, menuTestId: string, rotulo: string | RegExp) {
  await page.locator(`[data-testid="${chipTestId}"]`).click();
  await page.waitForSelector(`[data-testid="${menuTestId}"]`, { timeout: 8000 });
  await page.locator(`[data-testid="${menuTestId}"] .pn-menu-item`).filter({ hasText: rotulo }).first().click();
  await page.waitForTimeout(180);
}

async function irParaAba(page: Page, aba: string) {
  const jaAtiva = (await page.locator(`[data-testid="painel-aba-${aba}"]`).getAttribute("aria-selected")) === "true";
  if (!jaAtiva) await page.locator(`[data-testid="painel-aba-${aba}"]`).click();
  await page.waitForSelector(`[data-testid="painel-tabpanel-${aba}"]:not([hidden])`, { timeout: 10000 });
}

/**
 * Arrasto HTML5 sintético — o Playwright não simula `dragstart`/`drop`
 * nativos, então o gesto é montado no próprio documento com um
 * `DataTransfer` de verdade. É o mesmo caminho que o navegador
 * percorreria: `dragstart` na linha, `dragover` e `drop` no contêiner
 * do mapa, com as coordenadas reais do alvo.
 */
async function arrastarPara(page: Page, origem: Locator, destino: Locator) {
  const hOrigem = await origem.elementHandle();
  const hDestino = await destino.elementHandle();
  if (!hOrigem || !hDestino) throw new Error("origem/destino do arrasto não encontrados");
  await page.evaluate(
    ([o, d]) => {
      const dt = new DataTransfer();
      o.dispatchEvent(new DragEvent("dragstart", { bubbles: true, cancelable: true, dataTransfer: dt }));
      const r = d.getBoundingClientRect();
      const x = r.left + r.width / 2;
      const y = r.top + r.height / 2;
      d.dispatchEvent(new DragEvent("dragover", { bubbles: true, cancelable: true, dataTransfer: dt, clientX: x, clientY: y }));
      d.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: dt, clientX: x, clientY: y }));
      o.dispatchEvent(new DragEvent("dragend", { bubbles: true, cancelable: true, dataTransfer: dt }));
    },
    [hOrigem, hDestino] as const,
  );
}

async function main() {
  await configurarFixture();
  registrar("0 (fixture: campanha + narrador + jogador + 2 personagens + bando + log)", true, `campanha=${campaignId}`);

  const { page: narrador, close: fecharNarrador } = await contextoDe(narradorEmail, narradorSenha);
  const errosNarrador: string[] = [];
  narrador.on("console", (m) => {
    if (erroRelevante(m)) errosNarrador.push(m.text().slice(0, 500));
  });

  await abrirMesa(narrador);

  // ═══════════════ 1. MOLDURA ═══════════════
  {
    const tablist = await narrador.locator('[data-testid="painel-vtt"] [role="tablist"]').count();
    const abas = await narrador.locator('[data-testid="painel-vtt"] [role="tab"]').count();
    const controla = await narrador.locator('[data-testid="painel-aba-chat"]').getAttribute("aria-controls");
    // `CSS.escape` só existe no browser — a checagem roda no Node, então
    // o casamento do `aria-controls` é feito por atributo.
    const painelExiste = controla ? await narrador.locator(`[id="${controla}"]`).count() : 0;
    registrar(
      "1a (tablist com as cinco abas e aria-controls apontando pro tabpanel)",
      tablist === 1 && abas === 5 && painelExiste === 1,
      `tablist=${tablist}, abas=${abas}, aria-controls=${controla}`,
    );
  }
  {
    const badgeEstatico = await narrador.locator('[data-testid="painel-aba-badge-chat"]').textContent().catch(() => null);
    registrar(
      "1a2 (o badge estático '3' do Chat sumiu — contador é real ou ausente)",
      badgeEstatico === null || badgeEstatico !== "3",
      `badge=${badgeEstatico ?? "(nenhum)"}`,
    );
  }
  {
    await irParaAba(narrador, "personagens");
    const selecionada = await narrador.locator('[data-testid="painel-aba-personagens"]').getAttribute("aria-selected");
    const chatEscondido = await narrador.locator('[data-testid="painel-tabpanel-chat"]').getAttribute("hidden");
    registrar("1b (clique troca de aba; a anterior fica hidden, sem desmontar)", selecionada === "true" && chatEscondido !== null, `sel=${selecionada}, chatHidden=${chatEscondido !== null}`);
  }
  {
    await narrador.locator('[data-testid="painel-aba-personagens"]').focus();
    await narrador.keyboard.press("ArrowRight");
    const ativa = await narrador.locator('[data-testid="painel-aba-participantes"]').getAttribute("aria-selected");
    const focoNoDestino = await narrador.evaluate(() => document.activeElement?.getAttribute("data-testid") ?? "");
    registrar(
      "1c (seta troca a aba E move o foco junto)",
      ativa === "true" && focoNoDestino === "painel-aba-participantes",
      `sel=${ativa}, foco=${focoNoDestino}`,
    );
  }
  {
    await narrador.locator('[data-testid="painel-recolher"]').click();
    // A largura tem transição de 160ms — medir no instante do clique
    // pegaria um valor intermediário, não o estado final.
    await esperarAte(async () => (await narrador.locator('[data-testid="painel-vtt"]').evaluate((el) => el.getBoundingClientRect().width)) < 80, 3000);
    const corpoEscondido = await narrador.locator('[data-testid="painel-vtt"] .rv-painel-corpo').isHidden();
    const larguraRecolhida = await narrador.locator('[data-testid="painel-vtt"]').evaluate((el) => el.getBoundingClientRect().width);
    const foco = await narrador.evaluate(() => document.activeElement?.getAttribute("data-testid") ?? "");
    registrar(
      "1d (recolher esconde o corpo de verdade, encolhe a faixa e devolve o foco à aba ativa)",
      corpoEscondido && larguraRecolhida < 80 && foco.startsWith("painel-aba-"),
      `corpoOculto=${corpoEscondido}, largura=${Math.round(larguraRecolhida)}, foco=${foco}`,
    );
  }
  {
    // Painel recolhido não pode cobrir o mapa: o SVG tem que continuar
    // recebendo o clique na sua área.
    const svgBox = await narrador.locator(".rv-mapa").boundingBox();
    const painelBox = await narrador.locator('[data-testid="painel-vtt"]').boundingBox();
    const naoSobrepoe = !!svgBox && !!painelBox && svgBox.x + svgBox.width <= painelBox.x + 2;
    registrar("1f (painel recolhido não fica por cima do mapa)", naoSobrepoe, `mapaFim=${Math.round((svgBox?.x ?? 0) + (svgBox?.width ?? 0))}, painelIni=${Math.round(painelBox?.x ?? 0)}`);
  }
  {
    // Reabre pela própria aba (a faixa recolhida é o que reabre) e
    // redimensiona pelo teclado, que é determinístico.
    await narrador.locator('[data-testid="painel-aba-bando"]').click();
    await narrador.waitForSelector('[data-testid="painel-tabpanel-bando"]:not([hidden])');
    const alca = narrador.locator('[data-testid="painel-alca"]');
    await alca.focus();
    for (let i = 0; i < 5; i++) await narrador.keyboard.press("ArrowLeft");
    await narrador.waitForTimeout(400); // fim da transição de largura
    const larguraAntes = await narrador.locator('[data-testid="painel-vtt"]').evaluate((el) => Math.round(el.getBoundingClientRect().width));

    await abrirMesa(narrador);
    await narrador.waitForTimeout(400);
    const abaDepois = await narrador.locator('[data-testid="painel-aba-bando"]').getAttribute("aria-selected");
    const larguraDepois = await narrador.locator('[data-testid="painel-vtt"]').evaluate((el) => Math.round(el.getBoundingClientRect().width));
    registrar(
      "1e (última aba e largura escolhida sobrevivem à recarga)",
      abaDepois === "true" && Math.abs(larguraDepois - larguraAntes) <= 1 && larguraAntes >= 300 && larguraAntes <= 420,
      `aba=${abaDepois}, antes=${larguraAntes}, depois=${larguraDepois}`,
    );
  }

  // ═══════════════ 2. CHAT ═══════════════
  await irParaAba(narrador, "chat");
  {
    const entradas = await narrador.locator('[data-testid="painel-feed-mensagem"]').count();
    const texto = (await narrador.locator('[data-testid="painel-chat-scroll"]').textContent()) ?? "";
    registrar(
      "2a (Chat carrega o log REAL — a entrada semeada aparece, e nada dos exemplos antigos)",
      entradas >= 1 && texto.includes("O jammer ainda zumbe") && !texto.includes("Se ele conjurar Compressão"),
      `entradas=${entradas}`,
    );
  }
  {
    const mensagem = `Narração de teste ${Date.now()}`;
    await enviarNoChat(narrador, mensagem);
    const gravou = await esperarAte(async () => {
      const { data } = await admin
        .from("table_logs")
        .select("payload")
        .eq("campaign_id", campaignId)
        .eq("type", "chat")
        .order("created_at", { ascending: false })
        .limit(3);
      return (data ?? []).some((l) => (l.payload as Record<string, unknown>).text === mensagem);
    }, 45000);
    const apareceu = await esperarAte(async () =>
      ((await narrador.locator('[data-testid="painel-chat-scroll"]').textContent()) ?? "").includes(mensagem),
    );
    const { data: linhas } = await admin
      .from("table_logs")
      .select("payload, visibility, character_id, created_by_user_id")
      .eq("campaign_id", campaignId)
      .eq("type", "chat")
      .order("created_at", { ascending: false })
      .limit(1);
    const p = (linhas?.[0]?.payload ?? {}) as Record<string, unknown>;
    registrar(
      "2b (envio grava em table_logs com autoria resolvida no SERVIDOR)",
      gravou &&
        apareceu &&
        p.text === mensagem &&
        p.autorNome === "Narrador" &&
        p.autorTipo === "narrador" &&
        p.source === "vtt_painel_chat" &&
        linhas?.[0]?.created_by_user_id === narradorId,
      `apareceu=${apareceu}, autor=${String(p.autorNome)}, tipo=${String(p.autorTipo)}`,
    );

    await esperarAte(async () => (await narrador.locator('[data-testid="painel-feed-mensagem"][data-pendente]').count()) === 0, 20000);
    const ocorrencias = await narrador.locator('[data-testid="painel-feed-mensagem"]').filter({ hasText: mensagem }).count();
    const pendentes = await narrador.locator('[data-testid="painel-feed-mensagem"][data-pendente]').count();
    registrar("2c1 (nenhuma duplicação depois do eco: uma entrada só, sem bolha pendente presa)", ocorrencias === 1 && pendentes === 0, `ocorrencias=${ocorrencias}, pendentes=${pendentes}`);

    await esperarAte(async () => (await narrador.locator('[data-testid="painel-chat-input"]').inputValue()) === "", 10000);
    const campoLimpo = await narrador.locator('[data-testid="painel-chat-input"]').inputValue();
    registrar("2b2 (sucesso limpa o campo)", campoLimpo === "", `campo="${campoLimpo}"`);
  }
  {
    // Falha de envio: mensagem acima do teto — a ação recusa, o texto
    // FICA no campo e o erro traz retry.
    const gigante = "x".repeat(2100);
    await narrador.locator('[data-testid="painel-chat-input"]').fill(gigante);
    await narrador.locator('[data-testid="painel-chat-enviar"]').click();
    const temErro = await esperarAte(async () => (await narrador.locator('[data-testid="painel-composer-erro"]').count()) > 0, 30000);
    const preservado = (await narrador.locator('[data-testid="painel-chat-input"]').inputValue()).length === gigante.length;
    const temRetry = (await narrador.locator('[data-testid="painel-composer-erro"] .rv-pn-retry').count()) === 1;
    registrar("2g (falha de envio: erro visível, retry local e o texto preservado no campo)", temErro && preservado && temRetry, `erro=${temErro}, preservado=${preservado}, retry=${temRetry}`);
    await narrador.locator('[data-testid="painel-chat-input"]').fill("");
  }
  {
    // Visibilidade "Narrador" (gm) — o jogador nunca pode receber.
    await escolherNoChip(narrador, "painel-composer-visibilidade", "painel-composer-menu-visibilidade", "Narrador");
    const segredo = `Segredo do narrador ${Date.now()}`;
    await enviarNoChat(narrador, segredo);
    await esperarAte(async () => ((await narrador.locator('[data-testid="painel-chat-scroll"]').textContent()) ?? "").includes(segredo));
    await escolherNoChip(narrador, "painel-composer-visibilidade", "painel-composer-menu-visibilidade", "Todos");

    const { page: jogador, close: fecharJogador } = await contextoDe(jogadorEmail, jogadorSenha);
    const errosJogador: string[] = [];
    jogador.on("console", (m) => {
      if (erroRelevante(m)) errosJogador.push(m.text().slice(0, 500));
    });
    await abrirMesa(jogador);
    await irParaAba(jogador, "chat");
    const textoJogador = (await jogador.locator('[data-testid="painel-chat-scroll"]').textContent()) ?? "";
    registrar(
      "2f (mensagem `gm` do narrador NUNCA chega ao jogador; a pública chega)",
      !textoJogador.includes(segredo) && textoJogador.includes("O jammer ainda zumbe"),
      `viuSegredo=${textoJogador.includes(segredo)}`,
    );

    // Opções de visibilidade do jogador: sem "Narrador".
    await jogador.locator('[data-testid="painel-composer-visibilidade"]').click();
    await jogador.waitForSelector('[data-testid="painel-composer-menu-visibilidade"]', { timeout: 8000 });
    const opcoes = await jogador.locator('[data-testid="painel-composer-menu-visibilidade"] .pn-menu-item').allTextContents();
    // `MenuAncorado` move o foco pro primeiro item num `requestAnimationFrame`
    // — sem esperar isso, o Esc pode chegar com o foco AINDA no botão que
    // abriu o menu (dentro do painel), e aí é o painel inteiro que recolhe
    // em vez de só o menu fechar.
    await jogador.waitForFunction(
      () => document.activeElement?.closest('[data-testid="painel-composer-menu-visibilidade"]') != null,
      { timeout: 2000 },
    ).catch(() => {});
    await jogador.keyboard.press("Escape");
    registrar(
      "2f2 (jogador não recebe 'Narrador' e vê 'Somente Narrador' — nunca o rótulo errado 'Só eu')",
      !opcoes.some((o) => o.trim() === "Narrador") && opcoes.some((o) => o.includes("Somente Narrador")) && !opcoes.some((o) => o.includes("Só eu")),
      opcoes.map((o) => o.trim()).join(" / "),
    );

    // Autoria por personagem: o jogador só tem "Mara Venn" disponível.
    const identidadePadrao = (await jogador.locator('[data-testid="painel-composer-autoria"]').textContent()) ?? "";
    registrar("2e (fallback de autoria do jogador é uma identidade EXPLÍCITA)", identidadePadrao.includes("Mara Venn") || identidadePadrao.includes("Jogador Rafa"), identidadePadrao.trim());

    const doJogador = `Fala da Mara ${Date.now()}`;
    await escolherNoChip(jogador, "painel-composer-autoria", "painel-composer-menu-autoria", "Mara Venn");
    await enviarNoChat(jogador, doJogador);
    const gravou = await esperarAte(async () => {
      const { data } = await admin
        .from("table_logs")
        .select("payload, character_id")
        .eq("campaign_id", campaignId)
        .eq("character_id", personagemDoJogador)
        .limit(1);
      return (data?.length ?? 0) > 0;
    });
    const { data: doPersonagem } = await admin
      .from("table_logs")
      .select("payload, character_id, created_by_user_id")
      .eq("campaign_id", campaignId)
      .eq("character_id", personagemDoJogador)
      .limit(1);
    const pp = (doPersonagem?.[0]?.payload ?? {}) as Record<string, unknown>;
    registrar(
      "2d (autoria por personagem: character_id e nome vêm do servidor, não do browser)",
      gravou && pp.characterNome === "Mara Venn" && pp.autorTipo === "personagem" && doPersonagem?.[0]?.created_by_user_id === jogadorId,
      `nome=${String(pp.characterNome)}, tipo=${String(pp.autorTipo)}`,
    );

    // Realtime + não lidos: o narrador está com a aba Bando aberta; a
    // mensagem do jogador tem que virar badge no Chat.
    await irParaAba(narrador, "bando");
    const novaDoJogador = `Ping de nao lidos ${Date.now()}`;
    await enviarNoChat(jogador, novaDoJogador);
    const gravouDoJogador = await esperarAte(async () => {
      const { data } = await admin
        .from("table_logs")
        .select("payload")
        .eq("campaign_id", campaignId)
        .eq("type", "chat")
        .order("created_at", { ascending: false })
        .limit(5);
      return (data ?? []).some((l) => (l.payload as Record<string, unknown>).text === novaDoJogador);
    }, 45000);
    // A janela é generosa de propósito: o que se prova aqui é a
    // ENTREGA por Realtime numa segunda sessão, e um servidor de
    // desenvolvimento carregado pode levar vários segundos pra
    // reassinar o canal depois de tudo que esta suíte já fez. O
    // diagnóstico inclui o estado de sincronização mostrado pela
    // própria aba, pra distinguir "lento" de "canal caído".
    const badgeApareceu =
      gravouDoJogador &&
      (await esperarAte(async () => (await narrador.locator('[data-testid="painel-aba-badge-chat"]').count()) > 0, 40000));
    const badge = badgeApareceu ? await narrador.locator('[data-testid="painel-aba-badge-chat"]').textContent() : null;
    const sincDegradada = (await narrador.locator(".rv-pn-estado--indisponivel").count()) > 0;
    registrar(
      "2h (contador REAL de não lidos aparece na aba Chat quando outra aba está à frente)",
      badgeApareceu,
      `badge=${badge ?? "(nenhum)"}, gravou=${gravouDoJogador}, sincDegradada=${sincDegradada}`,
    );

    await irParaAba(narrador, "chat");
    const chegou = await esperarAte(
      async () => ((await narrador.locator('[data-testid="painel-chat-scroll"]').textContent()) ?? "").includes(novaDoJogador),
      40000,
    );
    const badgeZerou = await esperarAte(async () => (await narrador.locator('[data-testid="painel-aba-badge-chat"]').count()) === 0, 15000);
    const dupes = await narrador.locator('[data-testid="painel-feed-mensagem"]').filter({ hasText: novaDoJogador }).count();
    registrar(
      "2c2 (realtime entre duas sessões: chega uma vez só, e ler zera o contador)",
      chegou && badgeZerou && dupes === 1,
      `chegou=${chegou}, zerou=${badgeZerou}, ocorrencias=${dupes}`,
    );

    // ═══════════════ 3c/5d — visão do JOGADOR ═══════════════
    await irParaAba(jogador, "personagens");
    await jogador.waitForSelector('[data-testid="painel-personagens-linha"], [data-testid="painel-personagens-vazio"]', { timeout: 10000 });
    const nomesJogador = await jogador.locator('[data-testid="painel-personagens-linha"] .rv-pn-linha-nome').allTextContents();
    registrar(
      "3c (jogador vê só o personagem que controla — nunca o PN do narrador)",
      nomesJogador.includes("Mara Venn") && !nomesJogador.includes("Corvo do Jammer"),
      nomesJogador.join(" | "),
    );
    const podeCriar = await jogador.locator('[data-testid="painel-personagens-criar"]').count();
    registrar("3c2 (jogador não recebe as ações administrativas do diretório)", podeCriar === 0, `botõesCriar=${podeCriar}`);

    await irParaAba(jogador, "bando");
    await jogador.waitForSelector('[data-testid="painel-bando-linha"], [data-testid="painel-bando-vazio"]', { timeout: 10000 });
    await jogador.locator('[data-testid="painel-bando-linha"]').first().click();
    const removerVisivel = await jogador.locator('[data-testid="painel-bando-remover"]').count();
    registrar("5d (jogador lê o bando mas não recebe a retirada — permissão da RLS refletida na interface)", removerVisivel === 0, `remover=${removerVisivel}`);

    // Drawer: viewport estreita.
    await jogador.setViewportSize({ width: 900, height: 800 });
    await jogador.waitForTimeout(400);
    const ehDrawer = await jogador.locator('[data-testid="painel-vtt"]').getAttribute("data-drawer");
    const mapaBox = await jogador.locator(".rv-mapa").boundingBox();
    // O mapa continua CLICÁVEL com o drawer aberto: nenhum véu cobre a
    // área livre à esquerda do painel.
    const painelBox = await jogador.locator('[data-testid="painel-vtt"]').boundingBox();
    const noMapa =
      mapaBox && painelBox
        ? await jogador.evaluate(
            ([x, y]) => {
              const el = document.elementFromPoint(x as number, y as number);
              return !!el?.closest(".rv-palco") && !el?.closest(".rv-painel");
            },
            [Math.max(painelBox.x - 60, mapaBox.x + 20), mapaBox.y + mapaBox.height / 2],
          )
        : false;
    registrar(
      "1g (viewport estreita: painel vira drawer SOBRE o mapa, sem espremer nem bloquear o canvas)",
      ehDrawer === "true" && (mapaBox?.width ?? 0) > 500 && noMapa,
      `drawer=${ehDrawer}, larguraMapa=${Math.round(mapaBox?.width ?? 0)}, mapaClicavel=${noMapa}`,
    );
    await jogador.locator('[data-testid="painel-vtt"] [role="tab"][aria-selected="true"]').focus();
    await jogador.keyboard.press("Escape");
    const fechou = await esperarAte(async () => (await jogador.locator('[data-testid="painel-vtt"]').getAttribute("data-aberto")) === "false");
    registrar("1g2 (Esc fecha o drawer)", fechou, `aberto=${await jogador.locator('[data-testid="painel-vtt"]').getAttribute("data-aberto")}`);

    registrar("7b (console do jogador limpo)", errosJogador.length === 0, errosJogador.slice(0, 2).join(" || ") || "sem erros");
    await fecharJogador();
  }

  // ═══════════════ 3. PERSONAGENS ═══════════════
  {
    // Token AVULSO (sem personagem) direto no banco — o diretório não
    // pode mostrá-lo: token de cena e documento são coisas diferentes.
    const { data: cena } = await admin.from("vtt_scenes").select("id").eq("campaign_id", campaignId).limit(1);
    tokenAvulsoNome = `Capanga avulso ${Date.now()}`;
    if (cena?.[0]?.id) {
      await admin.from("vtt_tokens").insert({
        campaign_id: campaignId,
        scene_id: cena[0].id,
        nome: tokenAvulsoNome,
        sigla: "CA",
        lado: "pn",
        vertente: "nenhuma",
        tamanho: "medio",
        q: 3,
        r: 3,
        orientacao: 0,
        visivel: true,
        bloqueado: false,
        character_id: null,
      });
    }

    await irParaAba(narrador, "personagens");
    await narrador.locator('[data-testid="painel-personagens-atualizar"]').click();
    await narrador.waitForTimeout(600);
    const nomes = await narrador.locator('[data-testid="painel-personagens-linha"] .rv-pn-linha-nome').allTextContents();
    registrar(
      "3a (diretório lista DOCUMENTOS persistentes — os dois personagens da campanha)",
      nomes.includes("Mara Venn") && nomes.includes("Corvo do Jammer"),
      nomes.join(" | "),
    );
    registrar("3b (token avulso da cena NÃO aparece no diretório)", !nomes.some((n) => n.includes("Capanga avulso")), `tokenAvulso="${tokenAvulsoNome}"`);
  }
  {
    await narrador.locator('[data-testid="painel-personagens-busca"]').fill("corvo");
    await narrador.waitForTimeout(250);
    const nomes = await narrador.locator('[data-testid="painel-personagens-linha"] .rv-pn-linha-nome').allTextContents();
    registrar("3d (busca por nome filtra o diretório, sem acento nem caixa)", nomes.length === 1 && nomes[0].includes("Corvo"), nomes.join(" | "));
    await narrador.locator('[data-testid="painel-personagens-busca"]').fill("");
    await narrador.waitForTimeout(250);
  }
  {
    // Pasta: cria e move um personagem pra dentro, por arrasto.
    const nomePasta = `Inimigos ${Date.now()}`;
    // Diálogo INTERNO (`ui/Dialogo.tsx`) — não há mais `window.prompt`
    // para o Playwright interceptar, e é justamente esse o ponto.
    await narrador.locator('[data-testid="painel-personagens-nova-pasta"]').click();
    await narrador.waitForSelector('[data-testid="painel-personagens-dialogo"]', { timeout: 8000 });
    await narrador.locator('[data-testid="painel-dialogo-campo"]').fill(nomePasta);
    await narrador.locator('[data-testid="painel-personagens-dialogo"] [data-testid="painel-dialogo-confirmar"]').click();
    const pastaApareceu = await esperarAte(async () => (await narrador.locator('[data-testid="painel-personagens-pasta"]').count()) > 0);
    registrar("3e1 (criar pasta persiste e aparece no diretório)", pastaApareceu, `pasta="${nomePasta}"`);

    await arrastarPara(
      narrador,
      narrador.locator('[data-testid="painel-personagens-linha"][data-tipo="pn"]').first(),
      narrador.locator('[data-testid="painel-tabpanel-personagens"] .rv-pn-solta-pasta').first(),
    );
    const moveu = await esperarAte(async () => {
      const { data } = await admin
        .from("campaign_character_placements")
        .select("folder_id")
        .eq("campaign_id", campaignId)
        .eq("character_id", personagemPn);
      return !!data?.[0]?.folder_id;
    });
    registrar("3e2 (arrastar para a pasta persiste a colocação — tabela relacional, não payload da ficha)", moveu, `movido=${moveu}`);
  }
  {
    const nomeNovo = `Sentinela ${Date.now()}`;
    await narrador.locator('[data-testid="painel-personagens-criar"]').click();
    await narrador.waitForSelector('[data-testid="painel-personagens-dialogo"]', { timeout: 8000 });
    // Nome e "é PN?" no MESMO diálogo — antes eram dois popups nativos
    // encadeados, um `prompt` seguido de um `confirm`.
    const temMarcacao = (await narrador.locator('[data-testid="painel-dialogo-marcacao"]').count()) === 1;
    await narrador.locator('[data-testid="painel-dialogo-campo"]').fill(nomeNovo);
    await narrador.locator('[data-testid="painel-personagens-dialogo"] [data-testid="painel-dialogo-confirmar"]').click();
    const criou = await esperarAte(async () => {
      const { data } = await admin.from("characters").select("id").eq("campaign_id", campaignId).eq("name", nomeNovo);
      return (data?.length ?? 0) === 1;
    }, 20000);
    registrar("3f0 (criação pede nome e tipo num diálogo INTERNO, não em dois popups nativos)", temMarcacao, `marcação=${temMarcacao}`);
    registrar("3f1 (criar personagem pelo painel usa o caminho canônico de `lib/character/storage`)", criou, `nome="${nomeNovo}"`);

    // Duplicar e arquivar pelo menu contextual.
    const linha = narrador
      .locator('[data-testid="painel-personagens-linha"]')
      .filter({ has: narrador.locator(`.rv-pn-linha-nome:text-is("${nomeNovo}")`) })
      .first();
    await linha.click({ button: "right" });
    await narrador.locator('.rv-menu-item:has-text("Duplicar")').click();
    const duplicou = await esperarAte(async () => {
      const { data } = await admin.from("characters").select("id").eq("campaign_id", campaignId).like("name", `${nomeNovo}%`);
      return (data?.length ?? 0) === 2;
    });
    registrar("3f2 (duplicar cria a cópia de verdade)", duplicou, `duplicou=${duplicou}`);

    await linha.click({ button: "right" });
    await narrador.locator('.rv-menu-item:has-text("Arquivar")').click();
    await narrador.waitForSelector('[data-testid="painel-personagens-confirmar"]', { timeout: 8000 });
    await narrador.locator('[data-testid="painel-personagens-confirmar"] [data-testid="painel-dialogo-confirmar"]').click();
    const arquivou = await esperarAte(async () => {
      const { data } = await admin.from("characters").select("archived_at").eq("campaign_id", campaignId).eq("name", nomeNovo);
      return !!data?.[0]?.archived_at;
    });
    const sumiuDaLista = await esperarAte(
      async () =>
        (await narrador
          .locator('[data-testid="painel-personagens-linha"] .rv-pn-linha-nome')
          .filter({ hasText: new RegExp(`^${nomeNovo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`) })
          .count()) === 0,
    );
    registrar("3f3 (arquivar tira do diretório normal, sem apagar nada)", arquivou && sumiuDaLista, `arquivado=${arquivou}, sumiu=${sumiuDaLista}`);
  }
  {
    // Arrasto para o MAPA → fluxo canônico de posicionamento → token
    // vinculado ao personagem.
    const antes = await admin.from("vtt_tokens").select("id").eq("campaign_id", campaignId).eq("character_id", personagemDoJogador);
    await arrastarPara(
      narrador,
      narrador.locator('[data-testid="painel-personagens-linha"]').filter({ hasText: "Mara Venn" }).first(),
      narrador.locator(".rv-mapa-camada").first(),
    );
    const entrouNoFluxo = await esperarAte(async () => (await narrador.locator(".rv-escolha-posicao").count()) === 1);
    registrar("3g1 (soltar no mapa entra no fluxo CANÔNICO de posicionamento, não cria token direto)", entrouNoFluxo, `fluxo=${entrouNoFluxo}`);

    if (entrouNoFluxo) {
      // Confirma numa célula livre — o mesmo clique de sempre.
      const celulas = narrador.locator(".rv-celula");
      const total = await celulas.count();
      let confirmou = false;
      for (let i = 0; i < Math.min(total, 40) && !confirmou; i++) {
        const box = await celulas.nth(i).boundingBox();
        if (!box) continue;
        await narrador.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        const valida = await narrador.locator(".rv-camada-posicionamento-token").getAttribute("data-valida");
        if (valida !== "true") continue;
        await narrador.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
        confirmou = await esperarAte(async () => (await narrador.locator(".rv-escolha-posicao").count()) === 0, 6000);
      }
      const { data: depois } = await admin
        .from("vtt_tokens")
        .select("id, character_id, nome")
        .eq("campaign_id", campaignId)
        .eq("character_id", personagemDoJogador);
      registrar(
        "3g2 (o token criado é uma INSTÂNCIA da cena vinculada ao personagem)",
        (depois?.length ?? 0) === (antes.data?.length ?? 0) + 1 && depois?.[0]?.character_id === personagemDoJogador,
        `tokens=${depois?.length ?? 0}, confirmou=${confirmou}`,
      );
      const { data: documento } = await admin.from("characters").select("id, campaign_id, archived_at").eq("id", personagemDoJogador).single();
      registrar(
        "3g3 (o DOCUMENTO do diretório não é movido nem substituído pela criação do token)",
        documento?.campaign_id === campaignId && !documento?.archived_at,
        `campanha=${documento?.campaign_id === campaignId}, arquivado=${!!documento?.archived_at}`,
      );
    }
  }

  {
    // RLS da migration 0090, direto no banco (a interface esconder o
    // botão nunca é a autorização): as tabelas de pasta/colocação são
    // do NARRADOR DONO. Um jogador participante ativo não lê nem
    // escreve nelas.
    const clienteJogador = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: sessao } = await clienteJogador.auth.signInWithPassword({ email: jogadorEmail, password: jogadorSenha });
    const comoJogador = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${sessao!.session!.access_token}` } },
    });
    const leituraPastas = await comoJogador.from("campaign_character_folders").select("id").eq("campaign_id", campaignId);
    const leituraColocacoes = await comoJogador.from("campaign_character_placements").select("character_id").eq("campaign_id", campaignId);
    const escrita = await comoJogador
      .from("campaign_character_folders")
      .insert({ campaign_id: campaignId, nome: "Pasta do impostor", parent_id: null, posicao: 0 })
      .select("id");
    const { data: naoCriou } = await admin.from("campaign_character_folders").select("id").eq("campaign_id", campaignId).eq("nome", "Pasta do impostor");
    registrar(
      "3h (RLS da 0090: jogador não lê nem escreve pastas/colocações do diretório)",
      (leituraPastas.data?.length ?? 0) === 0 &&
        (leituraColocacoes.data?.length ?? 0) === 0 &&
        (escrita.error !== null || (escrita.data?.length ?? 0) === 0) &&
        (naoCriou?.length ?? 0) === 0,
      `pastas=${leituraPastas.data?.length ?? 0}, colocacoes=${leituraColocacoes.data?.length ?? 0}, insertRecusado=${escrita.error !== null}`,
    );
  }

  // ═══════════════ 4. PARTICIPANTES ═══════════════
  {
    await irParaAba(narrador, "participantes");
    await narrador.waitForSelector('[data-testid="painel-participantes-linha"]', { timeout: 10000 });
    const papeis = await narrador.locator('[data-testid="painel-participantes-linha"]').evaluateAll((els) => els.map((e) => e.getAttribute("data-papel")));
    const nomes = await narrador.locator('[data-testid="painel-participantes-linha"] .rv-pn-linha-nome').allTextContents();
    registrar(
      "4a (roster REAL, narrador primeiro, sem UUID nem e-mail na tela)",
      papeis[0] === "narrator" && nomes.length === 2 && nomes.some((n) => n.includes("Narradora Gabs")) && nomes.some((n) => n.includes("Jogador Rafa")) &&
        !nomes.some((n) => n.includes("@")),
      `${papeis.join(",")} | ${nomes.join(" / ")}`,
    );

    const estados = await narrador.locator('[data-testid="painel-participantes-linha"]').evaluateAll((els) => els.map((e) => e.getAttribute("data-presenca")));
    const nenhumOfflineFalso = estados.every((e) => e === "online" || e === "offline" || e === "conectando" || e === "indisponivel");
    registrar(
      "4b (presença tem estado explícito por linha — nunca 'offline' inventado)",
      nenhumOfflineFalso && estados.length === 2,
      estados.join(","),
    );

    await esperarAte(async () => (await narrador.locator('[data-testid="painel-participantes-personagens"]').count()) > 0, 45000);
    const controlados = (await narrador.locator('[data-testid="painel-participantes-personagens"]').allTextContents()).join(" ");
    registrar("4c (personagens controlados aparecem sob o participante, de fonte segura)", controlados.includes("Mara Venn"), controlados || "(nenhum)");
  }

  // ═══════════════ 5. BANDO ═══════════════
  {
    await irParaAba(narrador, "bando");
    await narrador.waitForSelector('[data-testid="painel-bando-linha"]', { timeout: 10000 });
    const texto = (await narrador.locator('[data-testid="painel-bando-scroll"]').textContent()) ?? "";
    registrar(
      "5a (itens REAIS do inventário da campanha — e nenhum dos mocks antigos)",
      texto.includes("Fuzil Runado") && !texto.includes("Aretz do bando") && !texto.includes("Créditos de favor") && !texto.includes("Van de transporte"),
      texto.slice(0, 90).replace(/\s+/g, " "),
    );

    await narrador.locator('[data-testid="painel-bando-linha"]').first().click();
    const detalhe = (await narrador.locator('[data-testid="painel-bando-detalhe"]').textContent()) ?? "";
    registrar(
      "5c (o detalhe preserva o payload técnico da instância: cargas, munição carregada, runas)",
      detalhe.includes("Cargas") && detalhe.includes("Balas 9mm") && detalhe.includes("Sobregravação"),
      detalhe.replace(/\s+/g, " ").slice(0, 140),
    );
    await narrador.locator('[data-testid="painel-bando-voltar"]').click();

    const urlAntes = narrador.url();
    await narrador.locator('[data-testid="painel-bando-abrir"]').click();
    const abriuJanela = await narrador.waitForSelector('[data-testid="painel-janela-bando"]', { timeout: 10000 }).then(() => true).catch(() => false);
    registrar(
      "5a2 ('Abrir Bando' abre JANELA INTERNA e não navega)",
      abriuJanela && narrador.url() === urlAntes,
      `janela=${abriuJanela}, urlIgual=${narrador.url() === urlAntes}`,
    );
    if (abriuJanela) await narrador.locator('[data-testid="painel-janela-bando"] [data-testid="painel-janela-fechar"]').click();
  }
  {
    // Estado VAZIO real (campanha sem inventário) — e não um erro
    // disfarçado de lista vazia.
    const { page: outra, close: fecharOutra } = await contextoDe(narradorEmail, narradorSenha);
    await abrirMesa(outra, campanhaVaziaId);
    await irParaAba(outra, "bando");
    const vazio = await outra.waitForSelector('[data-testid="painel-bando-vazio"]', { timeout: 10000 }).then(() => true).catch(() => false);
    const semErro = (await outra.locator('[data-testid="painel-bando-erro"]').count()) === 0;
    registrar("5b (estado vazio REAL, distinto de erro de leitura)", vazio && semErro, `vazio=${vazio}, semErro=${semErro}`);
    await fecharOutra();
  }

  // ═══════════════ 6. COMPÊNDIO ═══════════════
  {
    // Carregamento sob demanda: nada do Compêndio é pedido antes de a
    // aba ser aberta. Uma página recém-carregada com a aba Bando ativa
    // não pode ter contagem nenhuma renderizada.
    await abrirMesa(narrador);
    const antesDeAbrir = await narrador.locator('[data-testid="painel-compendio-resumo-linha"]').count();
    registrar("6a (nada do Compêndio é carregado antes de a aba ser aberta)", antesDeAbrir === 0, `linhas=${antesDeAbrir}`);

    await irParaAba(narrador, "compendio");
    const carregou = await esperarAte(async () => (await narrador.locator('[data-testid="painel-compendio-resumo-linha"]').count()) === 6, 20000);
    const totais = await narrador
      .locator('[data-testid="painel-compendio-resumo-linha"]')
      .evaluateAll((els) => els.map((e) => Number(e.getAttribute("data-total") ?? "0")));
    registrar(
      "6b1 (as seis categorias com CONTAGENS reais do conteúdo efetivo)",
      carregou && totais.length === 6 && totais.some((n) => n > 0),
      `totais=${totais.join(",")}`,
    );
  }
  let slugAberto = "";
  {
    await narrador.locator('[data-testid="painel-compendio-categoria-condicoes"]').click();
    const listou = await esperarAte(async () => (await narrador.locator('[data-testid="painel-compendio-linha"]').count()) > 0, 20000);
    const primeiroNome = (await narrador.locator('[data-testid="painel-compendio-linha"] .rv-pn-linha-nome').first().textContent()) ?? "";
    slugAberto = (await narrador.locator('[data-testid="painel-compendio-linha"]').first().getAttribute("data-slug")) ?? "";
    registrar("6b2 (abrir uma categoria busca as linhas daquela categoria)", listou && !!slugAberto, `primeiro="${primeiroNome.trim()}", slug=${slugAberto}`);

    await narrador.locator('[data-testid="painel-compendio-busca"]').fill(primeiroNome.trim().slice(0, 4));
    await narrador.waitForTimeout(700);
    const filtrou = await narrador.locator('[data-testid="painel-compendio-linha"]').count();
    registrar("6b3 (busca real filtra dentro da categoria)", filtrou >= 1, `resultados=${filtrou}`);
    await narrador.locator('[data-testid="painel-compendio-busca"]').fill("");
    await narrador.waitForTimeout(700);
  }
  {
    const itensAntes = await admin.from("campaign_inventory_items").select("id").eq("campaign_id", campaignId);
    await narrador.locator(`[data-testid="painel-compendio-linha"][data-slug="${slugAberto}"]`).first().click();
    const abriu = await narrador
      .waitForSelector('[data-testid="painel-compendio-detalhe"] .rv-pn-detalhe-titulo', { timeout: 30000 })
      .then(() => true)
      .catch(() => false);
    const detalhe = (await narrador.locator('[data-testid="painel-compendio-detalhe"]').textContent()) ?? "";
    registrar(
      "6c (detalhe abre o documento completo, sem JSON cru na tela)",
      abriu && detalhe.length > 20 && !detalhe.includes('{"'),
      detalhe.replace(/\s+/g, " ").slice(0, 100),
    );

    await narrador.locator('[data-testid="painel-compendio-enviar-chat"]').click();
    const enviou = await esperarAte(async () => {
      const { data } = await admin
        .from("table_logs")
        .select("payload")
        .eq("campaign_id", campaignId)
        .eq("type", "compendio_compartilhado")
        .limit(1);
      return (data?.length ?? 0) > 0;
    }, 12000);
    const { data: cartao } = await admin
      .from("table_logs")
      .select("payload, visibility")
      .eq("campaign_id", campaignId)
      .eq("type", "compendio_compartilhado")
      .limit(1);
    const cp = (cartao?.[0]?.payload ?? {}) as Record<string, unknown>;
    registrar(
      "6d ('Enviar ao Chat' persiste um EVENTO estruturado, com nome/categoria/procedência do servidor)",
      enviou && cp.slug === slugAberto && typeof cp.nome === "string" && typeof cp.origemRotulo === "string",
      `slug=${String(cp.slug)}, origem=${String(cp.origemRotulo)}`,
    );

    const itensDepois = await admin.from("campaign_inventory_items").select("id").eq("campaign_id", campaignId);
    registrar(
      "6e (só VISUALIZAR/compartilhar não cria instância de item nenhuma)",
      (itensDepois.data?.length ?? 0) === (itensAntes.data?.length ?? 0),
      `antes=${itensAntes.data?.length ?? 0}, depois=${itensDepois.data?.length ?? 0}`,
    );

    await irParaAba(narrador, "chat");
    const noChat = await esperarAte(async () => {
      const t = (await narrador.locator('[data-testid="painel-chat-scroll"]').textContent()) ?? "";
      return t.includes(String(cp.nome ?? "«»"));
    }, 12000);
    registrar("6d2 (o cartão do Compêndio aparece no Chat como texto legível)", noChat, `nome=${String(cp.nome)}`);
  }

  // ═══════════════ 8. INVARIANTES DE UX ═══════════════
  //
  // O bloco que prova que o painel não tira ninguém do VTT. Todos os
  // critérios medem GEOMETRIA e ESTADO REAL — achar um seletor no DOM
  // não prova que a UX funciona.
  await abrirMesa(narrador);
  await irParaAba(narrador, "chat");
  {
    // Composer inteiramente dentro do viewport, com o feed acima dele.
    const composer = await narrador.locator('[data-testid="painel-composer"]').boundingBox();
    const campo = await narrador.locator('[data-testid="painel-chat-input"]').boundingBox();
    const enviar = await narrador.locator('[data-testid="painel-chat-enviar"]').boundingBox();
    const vp = narrador.viewportSize()!;
    const dentro = (b: { y: number; height: number } | null) => !!b && b.y >= 0 && b.y + b.height <= vp.height + 1;
    registrar(
      "8a (composer inteiramente visível dentro do viewport, com campo e botão de envio)",
      dentro(composer) && dentro(campo) && dentro(enviar) && (enviar?.width ?? 0) > 20,
      `composer=${JSON.stringify(composer && { y: Math.round(composer.y), h: Math.round(composer.height) })}, vp=${vp.height}`,
    );
  }
  {
    // Nenhum overflow horizontal dentro do painel.
    const overflow = await narrador.evaluate(() => {
      const painel = document.querySelector('[data-testid="painel-vtt"]');
      if (!painel) return -1;
      return painel.scrollWidth - painel.clientWidth;
    });
    const overflowDoc = await narrador.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    registrar("8b (sem overflow horizontal no painel nem no documento)", overflow <= 1 && overflowDoc <= 1, `painel=${overflow}, doc=${overflowDoc}`);
  }
  {
    // Segundo clique na aba ATIVA é inerte: não recolhe, não perde nada.
    await irParaAba(narrador, "chat");
    const rascunho = `Rascunho preservado ${Date.now()}`;
    await narrador.locator('[data-testid="painel-chat-input"]').fill(rascunho);
    await narrador.locator('[data-testid="painel-aba-chat"]').click();
    await narrador.waitForTimeout(350);
    const aberto = await narrador.locator('[data-testid="painel-vtt"]').getAttribute("data-aberto");
    const aindaVisivel = (await narrador.locator('[data-testid="painel-tabpanel-chat"]').getAttribute("hidden")) === null;
    const textoPreservado = await narrador.locator('[data-testid="painel-chat-input"]').inputValue();
    registrar(
      "8c (segundo clique na aba ativa é INERTE — não recolhe e preserva o rascunho)",
      aberto === "true" && aindaVisivel && textoPreservado === rascunho,
      `aberto=${aberto}, visivel=${aindaVisivel}, rascunho=${textoPreservado === rascunho}`,
    );
  }
  {
    // Trocar de aba e voltar preserva o rascunho do Chat.
    await irParaAba(narrador, "bando");
    await irParaAba(narrador, "chat");
    const aindaLa = (await narrador.locator('[data-testid="painel-chat-input"]').inputValue()).startsWith("Rascunho preservado");
    registrar("8d (trocar de aba e voltar preserva o rascunho do composer)", aindaLa, `preservado=${aindaLa}`);
    await narrador.locator('[data-testid="painel-chat-input"]').fill("");
  }
  {
    // Recolher só pelos controles próprios: Esc com foco no painel.
    await narrador.locator('[data-testid="painel-recolher"]').click();
    await esperarAte(async () => (await narrador.locator('[data-testid="painel-vtt"]').getAttribute("data-aberto")) === "false", 3000);
    const recolheu = (await narrador.locator('[data-testid="painel-vtt"]').getAttribute("data-aberto")) === "false";
    await narrador.locator('[data-testid="painel-aba-chat"]').click();
    await esperarAte(async () => (await narrador.locator('[data-testid="painel-vtt"]').getAttribute("data-aberto")) === "true", 3000);
    registrar(
      "8e (recolher acontece pelo botão próprio, e a aba reabre o painel)",
      recolheu && (await narrador.locator('[data-testid="painel-vtt"]').getAttribute("data-aberto")) === "true",
      `recolheu=${recolheu}`,
    );
  }
  {
    // O CONSOLE abre DENTRO do VTT: URL, mapa e câmera intactos.
    await irParaAba(narrador, "personagens");
    await narrador.waitForSelector('[data-testid="painel-personagens-linha"]', { timeout: 10000 });
    const urlAntes = narrador.url();
    const cameraAntes = await narrador.locator("svg.rv-mapa > g").getAttribute("transform");
    const scrollAntes = await narrador.evaluate(() => window.scrollY);

    await narrador.locator('[data-testid="painel-personagens-linha"]').first().click();
    const shell = await narrador
      .waitForSelector('[data-testid="painel-console-shell"], [data-testid="painel-console"]', { timeout: 8000 })
      .then(() => true)
      .catch(() => false);
    registrar("8f (clique no personagem abre o Console com SHELL imediato, sem tela branca)", shell, `shell=${shell}`);

    const consolePronto = await narrador.waitForSelector(".rc-window", { timeout: 60000 }).then(() => true).catch(() => false);
    const mapaVivo = (await narrador.locator("svg.rv-mapa").count()) === 1;
    const cameraDepois = await narrador.locator("svg.rv-mapa > g").getAttribute("transform");
    registrar(
      "8g (Console abre DENTRO do VTT: URL, mapa e câmera intactos)",
      consolePronto && narrador.url() === urlAntes && mapaVivo && cameraDepois === cameraAntes && (await narrador.evaluate(() => window.scrollY)) === scrollAntes,
      `pronto=${consolePronto}, urlIgual=${narrador.url() === urlAntes}, mapa=${mapaVivo}, cameraIgual=${cameraDepois === cameraAntes}`,
    );

    if (consolePronto) {
      const t0 = Date.now();
      await narrador.locator(".rc-winbtn--close").first().click().catch(() => {});
      await narrador.waitForTimeout(400);
      // Reabrir o MESMO personagem reaproveita catálogos e bundle.
      await narrador.locator('[data-testid="painel-personagens-linha"]').first().click();
      const reabriu = await narrador.waitForSelector(".rc-window", { timeout: 30000 }).then(() => true).catch(() => false);
      const ms = Date.now() - t0;
      registrar("8h (reabrir o mesmo personagem reaproveita o cache — volta rápido)", reabriu && ms < 20000, `reabriu=${reabriu}, ${ms}ms`);
      await narrador.locator(".rc-winbtn--close").first().click().catch(() => {});
      await narrador.waitForTimeout(300);
    }
    registrar("8i (o VTT continua montado depois de fechar o Console)", (await narrador.locator('[data-testid="painel-vtt"]').count()) === 1, "painel presente");
  }
  {
    // "Jogadores e convites" e "Configurar acesso" não navegam.
    await irParaAba(narrador, "participantes");
    const urlAntes = narrador.url();
    await narrador.locator('[data-testid="painel-participantes-admin"]').click();
    const abriu = await narrador.waitForSelector('[data-testid="painel-janela-convites"]', { timeout: 10000 }).then(() => true).catch(() => false);
    registrar("8j ('Jogadores e convites' abre janela interna e não navega)", abriu && narrador.url() === urlAntes, `janela=${abriu}, urlIgual=${narrador.url() === urlAntes}`);
    if (abriu) {
      await narrador.locator('[data-testid="painel-janela-convites"] [data-testid="painel-janela-fechar"]').click();
      await narrador.waitForTimeout(250);
    }
  }
  {
    // Eventos técnicos NÃO aparecem no feed, mesmo estando no log.
    await admin.from("table_logs").insert([
      { campaign_id: campaignId, type: "character_state_change", visibility: "public", payload: { characterNome: "Mara Venn", action: "damage", resource: "pv", before: 20, after: 3 } },
      { campaign_id: campaignId, type: "inventory_transfer", visibility: "public", payload: { itemName: "Balas 9mm", direction: "crew_to_character" } },
      { campaign_id: campaignId, type: "tipo_que_nao_existe_no_feed", visibility: "public", payload: { qualquer: "coisa" } },
    ]);
    await irParaAba(narrador, "chat");
    await narrador.waitForTimeout(2500);
    const texto = (await narrador.locator('[data-testid="painel-chat-scroll"]').textContent()) ?? "";
    const { data: noLog } = await admin
      .from("table_logs")
      .select("id")
      .eq("campaign_id", campaignId)
      .eq("type", "character_state_change");
    registrar(
      "9a (evento técnico está no LOG mas NÃO no feed — a auditoria continua íntegra)",
      (noLog?.length ?? 0) >= 1 && !texto.includes("Balas 9mm") && !texto.includes("tipo_que_nao_existe") && !texto.includes("{"),
      `noLog=${noLog?.length ?? 0}, noFeed=${texto.includes("Balas 9mm")}`,
    );
  }
  {
    // Cada evento usa o CARD certo, com o resultado visível.
    await admin.from("table_logs").insert([
      {
        campaign_id: campaignId,
        type: "rolagem_pericia",
        visibility: "public",
        payload: { characterNome: "Mara Venn", atributo: "Mente", atributoValor: 6, pericia: "Percepção", periciaValor: 3, modificador: 0, dificuldade: 10, total: 8, sucesso: false, dados: [7, 3, 6] },
      },
      {
        campaign_id: campaignId,
        type: "combate_vtt",
        visibility: "public",
        payload: { evento: "rodada_avancou", rodada: 3, janela: "rapidos", janelaRotulo: "Turnos rápidos", source: "vtt_trilha" },
      },
    ]);
    await narrador.waitForTimeout(2500);
    const temRolagem = (await narrador.locator('[data-testid="painel-feed-rolagem"]').count()) >= 1;
    const temDivisor = (await narrador.locator('[data-testid="painel-feed-divisor"]').count()) >= 1;
    const resultado = (await narrador.locator('[data-testid="painel-feed-resultado"]').first().textContent()) ?? "";
    const modulos = await narrador.locator('[data-testid="painel-feed-rolagem"] .pn-modulo-rotulo').allTextContents();
    registrar(
      "9b (rolagem usa RollCard com módulos e faixa de resultado)",
      temRolagem && resultado.includes("8") && resultado.toLowerCase().includes("falha") && modulos.length >= 3,
      `resultado="${resultado.replace(/\s+/g, " ").trim()}", modulos=${modulos.join(",")}`,
    );
    registrar("9c (evento de combate usa DIVISOR compacto)", temDivisor, `divisores=${await narrador.locator('[data-testid="painel-feed-divisor"]').count()}`);
    // O divisor precisa ser MENOR que um card — é ritmo, não evento.
    const alturaDivisor = (await narrador.locator('[data-testid="painel-feed-divisor"]').first().boundingBox())?.height ?? 999;
    const alturaCard = (await narrador.locator('[data-testid="painel-feed-rolagem"]').first().boundingBox())?.height ?? 0;
    registrar("9d (o divisor é compacto — bem menor que um card)", alturaDivisor < alturaCard / 2, `divisor=${Math.round(alturaDivisor)}px, card=${Math.round(alturaCard)}px`);
  }
  {
    // ATAQUE: percorre estados e aplica dano UMA vez, mesmo com dois cliques.
    const { data: alvo } = await admin.from("characters").select("id, payload").eq("id", personagemDoJogador).single();
    const pvInicial = 20;
    await admin
      .from("characters")
      .update({ payload: { ...(alvo!.payload as Record<string, unknown>), recursos_atuais: { pv: pvInicial, pe: 10, mana: 5 } } })
      .eq("id", personagemDoJogador);
    await admin.from("table_logs").insert({
      campaign_id: campaignId,
      type: "attack_resolved",
      visibility: "public",
      payload: {
        workflowId: "wf-check",
        armaNome: "Shortbow",
        atacanteNome: "Corvo do Jammer",
        paGasto: 2,
        totalAtaque: 14,
        totalDefesa: 6,
        alvoNome: "Mara Venn",
        alvoCharacterId: personagemDoJogador,
        acertou: true,
        margem: 6,
        dano: 5,
        danoTipo: "perfurante",
      },
    });
    // Espera o CARD chegar, não um relógio: o ataque viaja pelo
    // Realtime e 2,5s fixos ora bastavam, ora não — a contagem era lida
    // antes do card existir e o critério reprovava com estado e botão
    // corretos, sem dizer por quê.
    const card = narrador.locator('[data-testid="painel-feed-ataque"]').first();
    await esperarAte(async () => (await card.count()) === 1, 15000);
    const temCard = (await card.count()) === 1;
    const estadoAntes = await card.getAttribute("data-estado");
    const botao = card.locator('[data-testid="painel-feed-aplicar-dano"]');
    const temBotao = (await botao.count()) === 1;
    registrar(
      "10a (ataque vira AttackWorkflowCard com estado e ação primária evidente)",
      temCard && estadoAntes === "aguardando_aplicacao" && temBotao,
      // `cards=` explícito: quando este critério quebra por CONTAGEM (o
      // feed trouxe zero ou dois cards), estado e botão aparecem certos
      // e a linha não dizia o que estava errado.
      `cards=${await card.count()}, estado=${estadoAntes}, botão=${temBotao}`,
    );

    if (temBotao) {
      // DOIS cliques rápidos — a trava é a PK de `campaign_workflow_steps`.
      await botao.click();
      await botao.click({ force: true }).catch(() => {});
      const resolveu = await esperarAte(async () => (await card.getAttribute("data-estado")) === "resolvido", 30000);
      const { data: passos } = await admin
        .from("campaign_workflow_steps")
        .select("workflow_id, step")
        .eq("campaign_id", campaignId)
        .eq("workflow_id", "wf-check");
      const { data: depois } = await admin.from("characters").select("payload").eq("id", personagemDoJogador).single();
      const pvFinal = ((depois!.payload as Record<string, unknown>).recursos_atuais as Record<string, number> | undefined)?.pv;
      registrar(
        "10b (aplicar dano é idempotente: dois cliques → UMA aplicação, PV cai uma vez só)",
        resolveu && (passos?.length ?? 0) === 1 && pvFinal === pvInicial - 5,
        `passos=${passos?.length ?? 0}, pv=${pvInicial} → ${pvFinal}`,
      );
      const resolvido = (await card.locator('[data-testid="painel-feed-ataque-resolvido"]').textContent()) ?? "";
      registrar("10c (o card resolvido mostra PV anterior → PV atual)", resolvido.includes(String(pvInicial)) && resolvido.includes(String(pvInicial - 5)), resolvido.replace(/\s+/g, " ").trim());
    }
  }
  {
    // MAGIA: conjurar não rola ataque nem dano.
    await admin.from("table_logs").insert({
      campaign_id: campaignId,
      type: "spell_cast",
      visibility: "public",
      payload: { spellNome: "Compressão", characterNome: "Mara Venn", vertente: "Cognitivo", nivel: 2, paGasto: 3, manaGasta: 2, exigeAtaque: true },
    });
    await narrador.waitForTimeout(2500);
    const card = narrador.locator('[data-testid="painel-feed-magia"]').first();
    const estado = await card.getAttribute("data-estado");
    // `textContent` devolve o texto ORIGINAL — o caixa-alta dos rótulos
    // é `text-transform` do CSS. Comparar minúsculo é o que casa os dois.
    const texto = ((await card.textContent()) ?? "").toLocaleLowerCase("pt-BR");
    registrar(
      "11a (conjurar NÃO rola ataque nem dano — o card fica aguardando ataque, com PA e Mana)",
      estado === "aguardando_ataque" && texto.includes("pa") && texto.includes("mana") && !texto.includes("dano"),
      `estado=${estado}, temPa=${texto.includes("pa")}, temMana=${texto.includes("mana")}, semDano=${!texto.includes("dano")}`,
    );
  }
  {
    // Teclado: setas navegam as abas e o foco NÃO rola a página.
    await irParaAba(narrador, "chat");
    const scrollAntes = await narrador.evaluate(() => window.scrollY);
    await narrador.locator('[data-testid="painel-aba-chat"]').focus();
    await narrador.keyboard.press("ArrowRight");
    await narrador.waitForTimeout(200);
    const foco = await narrador.evaluate(() => document.activeElement?.getAttribute("data-testid") ?? "");
    const scrollDepois = await narrador.evaluate(() => window.scrollY);
    registrar(
      "12a (setas navegam as abas e o foco não provoca scroll externo)",
      foco === "painel-aba-personagens" && scrollAntes === scrollDepois,
      `foco=${foco}, scroll=${scrollAntes}→${scrollDepois}`,
    );
  }
  {
    // Drawer estreito: composer continua visível e o mapa clicável.
    await narrador.setViewportSize({ width: 900, height: 700 });
    await narrador.waitForTimeout(500);
    await irParaAba(narrador, "chat");
    const campo = await narrador.locator('[data-testid="painel-chat-input"]').boundingBox();
    const vp = narrador.viewportSize()!;
    const dentro = !!campo && campo.y >= 0 && campo.y + campo.height <= vp.height + 1;
    const overflow = await narrador.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    registrar("13a (no drawer o composer continua inteiramente visível, sem overflow horizontal)", dentro && overflow <= 1, `campoDentro=${dentro}, overflow=${overflow}`);
    await narrador.setViewportSize({ width: 1440, height: 950 });
    await narrador.waitForTimeout(400);
  }

  registrar("7a (console do narrador limpo)", errosNarrador.length === 0, errosNarrador.slice(0, 2).join(" || ") || "sem erros");

  await fecharNarrador();
  await limpar();

  console.log(`\n${passou} ok, ${falhou} falha(s).`);
  if (falhou > 0) process.exit(1);
}

main().catch(async (e) => {
  console.error("check-vtt-painel FALHOU:", e instanceof Error ? e.stack : e);
  await limpar().catch(() => {});
  process.exit(1);
});
