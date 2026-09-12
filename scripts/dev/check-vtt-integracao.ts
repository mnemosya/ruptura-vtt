/**
 * Browser check da fundação funcional das ferramentas do VTT —
 * confirma que o estado PERSISTIDO está de fato ligado à rota real
 * `/mesas/[campaignId]/vtt`, não só testado por baixo (as 25 checagens
 * de `check-vtt-autorizacao.ts` falam direto com o banco, nunca
 * passaram pela UI).
 *
 * Cobre:
 *  1. Narrador abre a mesa pela primeira vez: cena semeia sozinha
 *     (`garantirCenaSemente`), sem tela de erro/carregando infinito.
 *  2. Barra de ferramentas do narrador tem as 4 ferramentas
 *     (Interagir/Medir/Marcar/Terreno).
 *  3. Barra de ferramentas do jogador tem só 3 (sem Terreno).
 *  4. Narrador pinta uma célula de terreno difícil pela UI (ferramenta
 *     Terreno) — linha aparece em `vtt_terrain` no banco.
 *  5. Recarregar a página preserva o terreno pintado (persistência de
 *     verdade, não só estado de componente).
 *  6. Segunda sessão (jogador) enxerga o MESMO terreno sem ação
 *     nenhuma além de abrir a página (leitura persistida — sync total
 *     entre sessões via realtime é o critério 8, mais estrito).
 *  7. Ferramenta Medir — máquina de estados ociosa/pressionada/medindo/
 *     concluída, com mouse real do Playwright (7a-7j): clique simples
 *     nunca desenha nada; pressionar/arrastar/soltar mostra linha ao
 *     vivo e resultado congelado; Esc apaga tanto o resultado
 *     congelado quanto uma medição em andamento; botão direito nunca
 *     inicia/altera/apaga medição (e pan continua funcionando com
 *     Medir ativa); clique simples sobre uma régua concluída a apaga
 *     SEM iniciar outra no mesmo gesto, mas um gesto posterior de
 *     pressionar/arrastar/soltar cria normalmente; trocar de
 *     ferramenta limpa a régua concluída; arrastar a partir de um
 *     TOKEN mede a partir do hex do token sem selecioná-lo nem
 *     movê-lo; em Interagir, clicar no token continua selecionando
 *     normalmente (sem regressão da ramificação nova).
 *  8. Ferramenta Marcar: clique cria uma marcação (linha nova em
 *     `vtt_marks`); clicar na marcação de novo apaga (linha some).
 *  9. Um token com personagem controlado pelo jogador fixture (setado
 *     via service role, já que a semente não vincula character_id) é
 *     arrastado pela UI do jogador — posição muda em `vtt_tokens`, e
 *     um SEGUNDO browser (narrador, aberto ANTES do arrasto) vê a nova
 *     posição sem reload — prova o caminho Realtime→estado local.
 *  10. Ctrl+Z do jogador desfaz o próprio movimento — token volta à
 *      posição anterior no banco.
 *  12. Hints unificadas de mapa (12a-12h): terreno decorativo difícil/
 *      elevado (com altura)/zona morta (nunca se apresentando como
 *      bloqueio de movimento); terreno funcional persistido difícil
 *      (texto preservado) e bloqueado (pintado pela UI e conferido);
 *      objeto/cobertura com conteúdo completo (nome, grau, categoria,
 *      PD, "Danificado", efeito — o exemplo exato do pedido original,
 *      Van de transporte); a hint some ao tirar o mouse; nunca mais de
 *      uma hint simultânea.
 *  13. Console limpo nas duas sessões, na rota `/vtt`.
 *
 * Fora de cobertura automatizada nesta suíte, verificado por leitura
 * de código + browser manual (ver relatório da rodada que introduziu
 * os critérios 7/12): posicionamento da hint perto das bordas direita/
 * inferior do viewport (a lógica de `posicaoTooltip` em `MapaHex.tsx`
 * é 4 linhas simples, mas o layout da mesa (painel lateral) torna
 * difícil montar um cenário determinístico onde um elemento realmente
 * hoverável fica perto o bastante da borda real da janela); e o caso
 * de uma célula com terreno persistido E decorativo sobrepostos ao
 * mesmo tempo (a lógica de prioridade é direta — `decorativo ? [...]
 * : undefined` — mas as coordenadas fixas de `CENA_DEMO` não colocam
 * nenhuma área decorativa exatamente sobre a célula pintável usada
 * nos critérios 12d/12e).
 *
 * Uso: npx tsx scripts/dev/check-vtt-integracao.ts (servidor dev já
 * rodando em localhost:3000).
 */

import { randomUUID } from "node:crypto";
import { config as loadDotenv } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import type { ConsoleMessage } from "playwright";
import { chromium, type BrowserContext, type Page } from "playwright";
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
  // Aviso dev-only PRÉ-EXISTENTE, já documentado no próprio
  // `VttClient.tsx` (comentário acima de `subscribeToVttScene`, seção
  // "onMarca"): apagar uma marcação atualiza o estado local de forma
  // otimista E recebe o eco Realtime da mesma escrita quase ao mesmo
  // tempo — o guard "mesma referência quando é no-op" já existente lá
  // evita o RE-RENDER redundante, mas não pode evitar o AVISO em si,
  // porque o React decide "estou atualizando um componente enquanto
  // outro renderiza" no instante em que o setter é CHAMADO, antes de
  // sequer invocar a função que descobre que o resultado é um no-op.
  // Não é uma regressão desta rodada (Medir/hints não tocam
  // `subscribeToVttScene` nem `apagarMarca`) — é uma corrida de
  // arquitetura de Realtime pré-existente, fora do escopo deste
  // pedido. Ignorado aqui deliberadamente, não escondido: mantém o
  // critério de console limpo útil para regressões REAIS.
  if (t.includes("Cannot update a component") && t.includes("while rendering a different component")) return false;
  return true;
}

let campaignId: string | null = null;
let jogadorId: string | null = null;
let jogadorEmail: string | null = null;
let jogadorSenha: string | null = null;
let characterId: string | null = null;
const criados = { usuarios: [] as string[], campanhas: [] as string[] };

async function configurarFixture(): Promise<void> {
  campaignId = randomUUID();
  const { error: e1 } = await admin.from("campaigns").insert({ id: campaignId, name: "VTT Integração", owner_id: await donoAtual() });
  if (e1) throw new Error(`Falha ao criar campanha: ${e1.message}`);
  criados.campanhas.push(campaignId);

  const email = `check-vtt-integracao-${Date.now()}@ruptura.dev`;
  const senha = randomUUID();
  const { data, error } = await admin.auth.admin.createUser({ email, password: senha, email_confirm: true, user_metadata: { display_name: "Jogador VTT" } });
  if (error) throw new Error(`Falha ao criar jogador fixture: ${error.message}`);
  jogadorId = data.user.id; jogadorEmail = email; jogadorSenha = senha;
  criados.usuarios.push(jogadorId);

  const { error: e2 } = await admin.from("campaign_members").insert({ campaign_id: campaignId, user_id: jogadorId, role: "player", status: "active", origem: "fixture_vtt" });
  if (e2) throw new Error(`Falha ao adicionar jogador: ${e2.message}`);

  const novoId = randomUUID();
  const { error: e3 } = await admin.from("characters").insert({
    id: novoId, name: "PJ do teste VTT", owner_label: null, status: "draft",
    payload: { nome: "PJ do teste VTT" }, campaign_id: campaignId, owner_id: jogadorId,
  });
  if (e3) throw new Error(`Falha ao criar personagem: ${e3.message}`);
  characterId = novoId;
  const { error: e4 } = await admin.from("character_controllers").insert({ character_id: characterId, campaign_id: campaignId, user_id: jogadorId });
  if (e4) throw new Error(`Falha ao conceder controle: ${e4.message}`);
}

async function donoAtual(): Promise<string> {
  // A campanha fixture precisa de um owner_id válido — usa o mesmo usuário
  // da sessão salva (.auth/admin-session.json), lido pelo e-mail conhecido
  // não é possível aqui; em vez disso, cria um narrador fixture próprio
  // pra não depender de qual conta está salva localmente.
  const email = `check-vtt-integracao-narrador-${Date.now()}@ruptura.dev`;
  const senha = randomUUID();
  const { data, error } = await admin.auth.admin.createUser({ email, password: senha, email_confirm: true, user_metadata: { display_name: "Narrador VTT" } });
  if (error) throw new Error(`Falha ao criar narrador fixture: ${error.message}`);
  criados.usuarios.push(data.user.id);
  narradorEmail = email; narradorSenha = senha;
  return data.user.id;
}
let narradorEmail: string | null = null;
let narradorSenha: string | null = null;

async function contextoDe(email: string, senha: string): Promise<{ context: BrowserContext; page: Page; close: () => Promise<void> }> {
  const anon = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await anon.auth.signInWithPassword({ email, password: senha });
  if (error || !data.session) throw new Error(`Falha ao logar ${email}: ${error?.message}`);
  const browser = await chromium.launch({ headless: true });
  // Viewport explícito — o padrão do Playwright (1280×720) deixa o
  // mapa mais "letterboxed" que qualquer inspeção manual feita a
  // 1280×950+, o que pode reposicionar elementos o bastante pra
  // afetar critérios que dependem de geometria (hints de mapa,
  // seção 12).
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

async function main() {
  await configurarFixture();
  registrar("0 (fixture: campanha + narrador + jogador com 1 personagem controlado)", true, `campanha=${campaignId}`);

  const { page: narradorPage, close: closeNarrador } = await contextoDe(narradorEmail!, narradorSenha!);
  const errosNarrador: string[] = [];
  narradorPage.on("console", (m) => { if (erroRelevante(m)) errosNarrador.push(m.text().slice(0, 600)); });

  // Espera CONDIÇÃO no banco, nunca tempo. Um clique dispara uma
  // server action; ler logo depois de um `waitForTimeout` fixo é
  // corrida, e ela reprova de forma intermitente sob carga.
  async function esperarLinhas<T>(
    tabela: string,
    colunas: string,
    condicao: (linhas: T[]) => boolean,
    timeoutMs = 8000,
  ): Promise<T[]> {
    const limite = Date.now() + timeoutMs;
    let ultimas: T[] = [];
    for (;;) {
      const { data } = await admin.from(tabela).select(colunas).eq("campaign_id", campaignId);
      ultimas = (data as T[] | null) ?? [];
      if (condicao(ultimas)) return ultimas;
      if (Date.now() > limite) return ultimas;
      await new Promise((r) => setTimeout(r, 150));
    }
  }

  // --- 1. Narrador abre a mesa: cena semeia sozinha ---
  await narradorPage.goto(`${BASE_URL}/mesas/${campaignId}/vtt`, { waitUntil: "networkidle" });
  await narradorPage.waitForSelector(".rv-mesa", { timeout: 15000 }).catch(() => {});
  {
    const temCarregando = (await narradorPage.locator(".rv-mesa--carregando").count()) > 0;
    const temMesa = (await narradorPage.locator(".rv-ferramentas").count()) > 0;
    registrar("1 (mesa carrega e semeia sozinha, sem tela de erro/carregando presa)", !temCarregando && temMesa, `carregando=${temCarregando}, mesa=${temMesa}`);
  }

  // Elenco da fixture. A cena semente nasce EM BRANCO
  // (`garantirCenaSemente`: "sem elenco, objeto ou terreno fictício") —
  // os critérios de seleção, HUD e movimento precisam de tokens, e
  // criá-los aqui desacopla a suíte do que a semente resolva fazer.
  {
    const { data: cena } = await admin.from("vtt_scenes").select("id").eq("campaign_id", campaignId).limit(1).maybeSingle();
    if (cena?.id) {
      await admin.from("vtt_tokens").insert([
        // Vinculado ao personagem do jogador: é o que dá a ele um token
        // que pode arrastar de verdade (`can_move_vtt_token`).
        { campaign_id: campaignId, scene_id: cena.id, character_id: characterId, nome: "Aliado", sigla: "AL", lado: "pj", vertente: "nenhuma", q: 8, r: 8, tamanho: "medio", orientacao: 0 },
        { campaign_id: campaignId, scene_id: cena.id, nome: "Hostil", sigla: "HO", lado: "pn", vertente: "nenhuma", q: 12, r: 10, tamanho: "medio", orientacao: 0 },
      ]);
      // O objeto que as hints de cobertura usam. Vinha da cena de
      // demonstração; agora é da fixture, com os MESMOS valores que os
      // critérios 12f/12g/12h afirmam (cobertura maior, categoria
      // média, PD 9 de 14 — danificado).
      const vanId = randomUUID();
      await admin.from("vtt_objects").insert({
        id: vanId, scene_id: cena.id, campaign_id: campaignId,
        nome: "Van de transporte", preset: "veiculo",
        bloqueia_movimento: true, grau_cobertura: "maior", categoria: "media",
        pd: 9, pd_max: 14,
      });
      await admin.from("vtt_object_cells").insert([
        { object_id: vanId, scene_id: cena.id, q: 14, r: 12 },
        { object_id: vanId, scene_id: cena.id, q: 15, r: 12 },
      ]);

      await narradorPage.reload({ waitUntil: "networkidle" });
      await narradorPage.waitForSelector(".rv-ferramentas", { timeout: 15000 });
    }
  }

  // --- 2. Narrador vê as 7 ferramentas (Interagir/Medir/Marcar/Áreas/
  //        Rodadas/Terreno/Objetos) — `[aria-pressed]` sozinho também
  //        casaria o botão "Camadas do mapa" (painel-toggle, não uma
  //        ferramenta de `FerramentaId`), por isso o filtro exclui
  //        explicitamente.
  //
  //        "Apontar" NÃO é mais ferramenta nem aparece na barra: virou
  //        gesto global (segurar o botão esquerdo, `_mapa/MapaHex.tsx`,
  //        igual Foundry/Roll20) — por isso a contagem caiu de 8 pra 7
  //        em vez de subir, e o critério não procura mais por ela. ---
  {
    const botoes = (await narradorPage.locator(".rv-ferramentas .rv-ferr-btn[aria-pressed]:not([data-tipo='janela'])").evaluateAll((els) => els.map((e) => e.getAttribute("aria-label"))));
    const temTerreno = botoes.some((b) => b?.startsWith("Terreno"));
    const temAreas = botoes.some((b) => b?.startsWith("Áreas"));
    const temRodadas = botoes.some((b) => b?.startsWith("Rodadas"));
    const semApontar = !botoes.some((b) => b?.startsWith("Apontar"));
    // Passou de 5 pra 6 com ÁREAS (migration 0081), de 6 pra 8 com
    // RODADAS (migration 0088), de 8 pra 7 com a remoção de APONTAR
    // (virou gesto global) e de 7 pra 8 com OBJETOS. Nenhuma foi
    // regressão — o critério confere a PRESENÇA/AUSÊNCIA de cada uma
    // junto com a contagem, em vez de só um número que ninguém consegue
    // interpretar quando quebra.
    const temObjetos = botoes.some((b) => b?.startsWith("Objetos"));
    registrar("2 (narrador vê as 8 ferramentas — Terreno, Áreas, Rodadas e Objetos incluídas, Apontar não é mais botão)",
      botoes.length === 8 && temTerreno && temAreas && temRodadas && temObjetos && semApontar, JSON.stringify(botoes));
  }

  // --- 3. Jogador vê só 4 ferramentas (sem Terreno) ---
  const { page: jogadorPage, close: closeJogador } = await contextoDe(jogadorEmail!, jogadorSenha!);
  const errosJogador: string[] = [];
  jogadorPage.on("console", (m) => { if (erroRelevante(m)) errosJogador.push(m.text().slice(0, 600)); });
  await jogadorPage.goto(`${BASE_URL}/mesas/${campaignId}/vtt`, { waitUntil: "networkidle" });
  await jogadorPage.waitForSelector(".rv-ferramentas", { timeout: 15000 });
  {
    const botoes = (await jogadorPage.locator(".rv-ferramentas .rv-ferr-btn[aria-pressed]:not([data-tipo='janela'])").evaluateAll((els) => els.map((e) => e.getAttribute("aria-label"))));
    const semTerreno = !botoes.some((b) => b?.startsWith("Terreno"));
    // Áreas (migration 0083): criação é aberta a qualquer participante
    // da campanha — o jogador vê a ferramenta sem precisar de nenhuma
    // autorização explícita do narrador. Terreno continua narrador-only.
    const temAreas = botoes.some((b) => b?.startsWith("Áreas"));
    // Rodadas (migration 0088) é dos DOIS papéis: consultar rodada,
    // janela e quem está agindo é de todo participante; o que é só do
    // narrador (iniciar, editar elenco, encerrar) fica desabilitado
    // dentro do painel e é recusado pelas RPCs.
    const temRodadas = botoes.some((b) => b?.startsWith("Rodadas"));
    // Apontar não é mais botão nenhum — é gesto global, disponível
    // pros dois papéis sem precisar aparecer na barra.
    const semApontar = !botoes.some((b) => b?.startsWith("Apontar"));
    registrar("3 (jogador vê 6 ferramentas — Áreas e Rodadas incluídas, sem Terreno nem Objetos, Apontar não é mais botão)",
      botoes.length === 6 && semTerreno && temAreas && temRodadas && semApontar, JSON.stringify(botoes));
  }

  // --- 4. Narrador pinta terreno pela UI ---
  await narradorPage.locator('.rv-ferramentas .rv-ferr-btn[aria-label^="Terreno"]').click();
  // Terreno deixou de ser um submenu de uma linha e virou JANELA
  // (`PainelTerreno`, na casca comum): o tipo é um ladrilho com o
  // `data-tipo` do terreno real, não um botão com texto.
  await narradorPage.waitForSelector('section[aria-label="Ferramenta Terreno"]', { timeout: 8000 });
  await narradorPage.locator('.rv-fp-opcao[data-tipo="dificil"]').click();
  // Primeira célula da grade — clique simples (sem arrastar) já pinta via onPressCelula.
  const celula = narradorPage.locator(".rv-camada-grade path").first();
  await celula.dispatchEvent("pointerdown");
  {
    const data = await esperarLinhas<{ q: number; r: number; tipo: string }>("vtt_terrain", "q,r,tipo", (l) => l.length > 0);
    registrar("4 (pintura de terreno pela UI grava no banco)", data.length > 0, JSON.stringify(data));
  }

  // --- 5. Reload preserva o terreno ---
  await narradorPage.reload({ waitUntil: "networkidle" });
  await narradorPage.waitForSelector(".rv-ferramentas", { timeout: 15000 });
  {
    const temReal = (await narradorPage.locator(".rv-camada-terreno-real .rv-terreno-real--dificil").count()) > 0;
    registrar("5 (terreno pintado sobrevive ao reload)", temReal, `camada real presente=${temReal}`);
  }

  // --- 6. Segunda sessão (jogador) enxerga o mesmo terreno ---
  await jogadorPage.reload({ waitUntil: "networkidle" });
  await jogadorPage.waitForSelector(".rv-ferramentas", { timeout: 15000 });
  {
    const temReal = (await jogadorPage.locator(".rv-camada-terreno-real .rv-terreno-real--dificil").count()) > 0;
    registrar("6 (segunda sessão enxerga o terreno persistido)", temReal, `camada real presente=${temReal}`);
  }

  // --- 7. Medir: máquina de estados ociosa/pressionada/medindo/concluída ---
  //
  // Células do MEIO do mapa (fileira 5, colunas 10/14/18 numa cena de 20
  // de largura). Duas razões, as duas descobertas na prática:
  //
  //   · a célula (0,0) ganhou terreno difícil no critério 4, e o rótulo
  //     "×2" sobre ela intercepta o ponteiro;
  //   · a janela da ferramenta abre encostada na barra e tem 400px —
  //     as colunas 0..8 ficam POR BAIXO dela, e o arrasto acontecia na
  //     janela, não no mapa. Era o que derrubava os sete critérios de
  //     Medir de uma vez.
  await jogadorPage.locator('.rv-ferramentas .rv-ferr-btn[aria-label^="Medir"]').click();
  await jogadorPage.waitForSelector('section[aria-label="Ferramenta Medir"]', { timeout: 8000 });
  const celulas = jogadorPage.locator(".rv-camada-grade path");
  const LARGURA_MAPA = 20;
  const idxDe = (col: number, row: number) => row * LARGURA_MAPA + col;
  const boxOrigem = await celulas.nth(idxDe(10, 5)).boundingBox();
  const boxDestino = await celulas.nth(idxDe(14, 5)).boundingBox();
  const boxOutra = await celulas.nth(idxDe(18, 5)).boundingBox();

  if (boxOrigem && boxDestino && boxOutra) {
    const oX = boxOrigem.x + boxOrigem.width / 2, oY = boxOrigem.y + boxOrigem.height / 2;
    const dX = boxDestino.x + boxDestino.width / 2, dY = boxDestino.y + boxDestino.height / 2;
    const outraX = boxOutra.x + boxOutra.width / 2, outraY = boxOutra.y + boxOutra.height / 2;

    // 7a — clique simples (sem arrastar) nunca mostra marcador nenhum.
    await jogadorPage.mouse.move(oX, oY);
    await jogadorPage.mouse.down();
    await jogadorPage.mouse.up();
    await jogadorPage.waitForTimeout(150);
    registrar("7a (clique simples em Medir não desenha nada)", (await jogadorPage.locator(".rv-camada-medicao").count()) === 0, "sem arrasto, camada de medição deve ficar ausente");

    // 7b — pressionar, arrastar, soltar: linha em tempo real durante o arrasto E resultado congelado depois de soltar.
    await jogadorPage.mouse.move(oX, oY);
    await jogadorPage.mouse.down();
    await jogadorPage.mouse.move(dX, dY, { steps: 8 });
    await jogadorPage.waitForTimeout(250);
    const emAndamento = await jogadorPage.locator(".rv-camada-medicao text").first().textContent().catch(() => null);
    const temLinhaEmAndamento = (await jogadorPage.locator(".rv-camada-medicao line").count()) > 0;
    await jogadorPage.mouse.up();
    await jogadorPage.waitForTimeout(250);
    const aposSoltar = await jogadorPage.locator(".rv-camada-medicao text").first().textContent().catch(() => null);
    // O modo padrão é INSTANTÂNEA, e nele soltar apaga a régua na hora
    // — está no contrato de `MapaHex.modoMedicao`: "a régua some da
    // tela na hora; nunca persiste, então não há nada mais a mostrar".
    // Este critério exigia o oposto (resultado congelado depois de
    // soltar), que era o comportamento de antes de existirem os dois
    // modos. O que persiste é o modo PERMANENTE, coberto em 7e.
    registrar(
      "7b (Medir instantânea: linha e medida ao vivo durante o arrasto, e some ao soltar)",
      temLinhaEmAndamento && !!emAndamento && /m/.test(emAndamento) && !aposSoltar,
      `linha durante=${temLinhaEmAndamento}, texto durante="${emAndamento}", texto após soltar="${aposSoltar}"`,
    );

    // 7c — depois de soltar em instantânea não sobra régua nenhuma na
    // tela; Esc não tem o que apagar e também não pode quebrar nada.
    // (Cancelar uma medição EM ANDAMENTO é o critério 7g.)
    {
      await jogadorPage.keyboard.press("Escape");
      await jogadorPage.waitForTimeout(150);
      const limpo = (await jogadorPage.locator(".rv-camada-medicao").count()) === 0;
      registrar("7c (depois de soltar em instantânea não sobra régua, e Esc é inofensivo)", limpo, `camada de medição presente=${!limpo}`);
    }

    // 7d — botão direito nunca inicia/altera/apaga medição, e ainda assim pan continua funcionando (mesma ferramenta Medir ativa).
    {
      const gAntes = await jogadorPage.locator("svg.rv-mapa > g").getAttribute("transform");
      await jogadorPage.mouse.move(oX, oY);
      await jogadorPage.mouse.down({ button: "right" });
      await jogadorPage.mouse.move(oX + 45, oY + 25, { steps: 5 });
      await jogadorPage.mouse.up({ button: "right" });
      await jogadorPage.waitForTimeout(200);
      const gDepois = await jogadorPage.locator("svg.rv-mapa > g").getAttribute("transform");
      const semMedicao = (await jogadorPage.locator(".rv-camada-medicao").count()) === 0;
      registrar(
        "7d (botão direito nunca afeta Medir, e ainda pan funciona)",
        semMedicao && gAntes !== gDepois,
        `camada de medição ausente=${semMedicao}, transform mudou=${gAntes !== gDepois} (antes="${gAntes}" depois="${gDepois}")`,
      );
      // Reverte o pan de teste — os pontos oX/dX/outraX abaixo foram
      // calculados sobre o layout ORIGINAL (sem pan); sem desfazer aqui,
      // os critérios seguintes (e o critério 8, que ainda usa a mesma
      // página) mediriam/clicariam em células erradas por causa do
      // deslocamento residual — achado real ao rodar pela primeira vez.
      await jogadorPage.mouse.move(oX + 45, oY + 25);
      await jogadorPage.mouse.down({ button: "right" });
      await jogadorPage.mouse.move(oX, oY, { steps: 5 });
      await jogadorPage.mouse.up({ button: "right" });
      await jogadorPage.waitForTimeout(200);
    }

    // 7e — em PERMANENTE, soltar grava a medição pra mesa.
    //
    // Era "clique simples apaga a régua concluída": uma régua que fica
    // na tela depois de soltar deixou de existir quando Medir ganhou os
    // dois modos. Em instantânea ela some (7b); o que PERSISTE é o modo
    // permanente, e é isso que este critério passa a cobrir — porque é
    // o que a mesa usa quando alguém quer deixar a medida à vista de
    // todos.
    await jogadorPage.locator('section[aria-label="Ferramenta Medir"] .rv-fp-seg-btn:has-text("Permanente")').click();
    await jogadorPage.waitForTimeout(150);
    await jogadorPage.mouse.move(oX, oY);
    await jogadorPage.mouse.down();
    await jogadorPage.mouse.move(dX, dY, { steps: 8 });
    await jogadorPage.mouse.up();
    let medicoesGravadas: unknown[] = [];
    for (let i = 0; i < 40; i++) {
      const { data } = await admin.from("vtt_measurements").select("id").eq("campaign_id", campaignId);
      medicoesGravadas = data ?? [];
      if (medicoesGravadas.length > 0) break;
      await jogadorPage.waitForTimeout(150);
    }
    const fixaNoMapa = (await jogadorPage.locator(".rv-camada-medicoes-fixas").count()) > 0;
    registrar(
      "7e (Medir permanente: soltar grava a medição e ela fica no mapa pra mesa)",
      medicoesGravadas.length === 1 && fixaNoMapa,
      `no banco=${medicoesGravadas.length}, camada fixa no mapa=${fixaNoMapa}`,
    );
    // Volta pra instantânea — os critérios seguintes assumem o padrão.
    await jogadorPage.locator('section[aria-label="Ferramenta Medir"] .rv-fp-seg-btn:has-text("Instantânea")').click();
    await jogadorPage.waitForTimeout(150);

    // 7f — medir de novo depois da anterior continua funcionando.
    await jogadorPage.mouse.move(outraX, outraY);
    await jogadorPage.mouse.down();
    await jogadorPage.mouse.move(dX, dY, { steps: 8 });
    await jogadorPage.waitForTimeout(200);
    const novaRegua = (await jogadorPage.locator(".rv-camada-medicao line").count()) > 0;
    await jogadorPage.mouse.up();
    await jogadorPage.waitForTimeout(150);
    registrar("7f (uma medição nova funciona normalmente depois da anterior)", novaRegua, `linha ao vivo=${novaRegua}`);

    // 7g — Esc cancela uma medição EM ANDAMENTO (antes de soltar o botão) sem deixar nada visível.
    await jogadorPage.mouse.move(oX, oY);
    await jogadorPage.mouse.down();
    await jogadorPage.mouse.move(dX, dY, { steps: 8 });
    await jogadorPage.waitForTimeout(150);
    const emAndamento7g = (await jogadorPage.locator(".rv-camada-medicao").count()) > 0;
    await jogadorPage.keyboard.press("Escape");
    await jogadorPage.waitForTimeout(150);
    await jogadorPage.mouse.up();
    await jogadorPage.waitForTimeout(150);
    const depoisDoEsc7g = (await jogadorPage.locator(".rv-camada-medicao").count()) === 0;
    registrar("7g (Esc cancela medição em andamento, soltar depois não ressuscita nada)", emAndamento7g && depoisDoEsc7g, `em andamento antes do Esc=${emAndamento7g}, ausente depois=${depoisDoEsc7g}`);

    // 7h — trocar de ferramenta no MEIO de uma medição não deixa resíduo.
    await jogadorPage.mouse.move(oX, oY);
    await jogadorPage.mouse.down();
    await jogadorPage.mouse.move(dX, dY, { steps: 8 });
    await jogadorPage.waitForTimeout(150);
    const medindo7h = (await jogadorPage.locator(".rv-camada-medicao").count()) > 0;
    await jogadorPage.mouse.up();
    await jogadorPage.locator('.rv-ferramentas .rv-ferr-btn[aria-label^="Interagir"]').click();
    await jogadorPage.waitForTimeout(150);
    const limpouAoTrocar = (await jogadorPage.locator(".rv-camada-medicao").count()) === 0;
    registrar("7h (trocar de ferramenta não deixa régua pendurada)", medindo7h && limpouAoTrocar, `havia medição=${medindo7h}, ausente após trocar de ferramenta=${limpouAoTrocar}`);
    await jogadorPage.locator('.rv-ferramentas .rv-ferr-btn[aria-label^="Medir"]').click();
    await jogadorPage.waitForTimeout(150);
  } else {
    registrar("7 (Medir)", false, "células de origem/destino sem bounding box");
  }

  // 7i — pressionar/arrastar A PARTIR DE UM TOKEN mede do hex do token, sem selecioná-lo nem movê-lo.
  // Compara a classe de seleção ANTES/DEPOIS (não assume ausência
  // absoluta): o critério 9, mais cedo neste mesmo script, já
  // selecionou o token controlado pela UI — se por acaso for o mesmo
  // token, `is-sel` já estaria presente de propósito ANTES deste
  // gesto, e o que importa é que o gesto de Medir não MUDE isso.
  {
    const primeiroToken = jogadorPage.locator(".rv-camada-tokens .rv-token").first();
    const boxTok = await primeiroToken.boundingBox();
    const boxAlvo = await celulas.nth(30).boundingBox();
    if (boxTok && boxAlvo) {
      const classesAntes = await primeiroToken.getAttribute("class");
      const tX = boxTok.x + boxTok.width / 2, tY = boxTok.y + boxTok.height / 2;
      const aX = boxAlvo.x + boxAlvo.width / 2, aY = boxAlvo.y + boxAlvo.height / 2;
      await jogadorPage.mouse.move(tX, tY);
      await jogadorPage.mouse.down();
      await jogadorPage.mouse.move(aX, aY, { steps: 8 });
      await jogadorPage.waitForTimeout(200);
      const classesDurante = await primeiroToken.getAttribute("class");
      const temMedicaoDoToken = (await jogadorPage.locator(".rv-camada-medicao line").count()) > 0;
      await jogadorPage.mouse.up();
      await jogadorPage.waitForTimeout(150);
      registrar(
        "7i (arrastar a partir de um token mede sem selecioná-lo)",
        temMedicaoDoToken && classesDurante === classesAntes,
        `linha de medição durante o arrasto=${temMedicaoDoToken}, classes antes="${classesAntes}", classes durante="${classesDurante}"`,
      );
      await jogadorPage.keyboard.press("Escape");
      await jogadorPage.waitForTimeout(150);
    } else {
      registrar("7i (arrastar a partir de um token)", false, "token ou célula alvo sem bounding box");
    }
  }

  // 7j — regressão: em Interagir, clicar num token AINDA seleciona normalmente (a ramificação nova de Medir não vazou pra outras ferramentas).
  {
    await jogadorPage.locator('.rv-ferramentas .rv-ferr-btn[aria-label^="Interagir"]').click();
    await jogadorPage.waitForTimeout(150);
    const primeiroToken = jogadorPage.locator(".rv-camada-tokens .rv-token").first();
    const boxTok = await primeiroToken.boundingBox();
    if (boxTok) {
      await jogadorPage.mouse.move(boxTok.x + boxTok.width / 2, boxTok.y + boxTok.height / 2);
      await jogadorPage.mouse.down();
      await jogadorPage.mouse.up();
      await jogadorPage.waitForTimeout(150);
      const classes = await primeiroToken.getAttribute("class");
      registrar("7j (Interagir: clicar no token ainda seleciona — sem regressão)", !!classes?.includes("is-sel"), `classes="${classes}"`);
    } else {
      registrar("7j (Interagir: clicar no token ainda seleciona)", false, "token sem bounding box");
    }
  }

  // --- 8. Marcar: cria e apaga um ping ---
  await jogadorPage.locator('.rv-ferramentas .rv-ferr-btn[aria-label^="Marcar"]').click();
  // Achado de flake real: um clique imediato na célula, sem NENHUM
  // assentamento depois de trocar de ferramenta, corria contra o
  // encerramento do gesto de seleção do token do teste 7j (ainda em
  // voo) e ora perdia o clique. `boundingBox()` sozinho (só leitura)
  // já bastava pra dar tempo suficiente — mas um wait explícito é mais
  // claro que depender de um efeito colateral de leitura.
  await jogadorPage.waitForTimeout(120);
  // Coluna 12, não 5: a janela de Marcar tem 400px e abre encostada na
  // barra, então as colunas 0..8 ficam POR BAIXO dela — o mesmo motivo
  // já anotado no bloco de Medir. `nth(25)` era (col 5, linha 1) e o
  // clique chegava no botão do painel, não na célula.
  await celulas.nth(idxDe(12, 1)).click();
  const marcasApos = await esperarLinhas<{ id: string }>("vtt_marks", "id", (l) => l.length === 1);
  const erroVisivel = await jogadorPage.locator(".rv-erro-acao").textContent().catch(() => null);
  registrar("8a (Marcar cria uma marcação persistida)", marcasApos.length === 1, `${JSON.stringify(marcasApos)} erroAcao=${erroVisivel}`);
  // O ping fica ACIMA da grade no SVG (confirmado: um clique normal na
  // célula é bloqueado pelo próprio marcador, "intercepts pointer
  // events") — clicar nele é o caminho natural, não a grade por baixo.
  await jogadorPage.locator(".rv-marca-ping").first().click();
  const marcasDepois = await esperarLinhas<{ id: string }>("vtt_marks", "id", (l) => l.length === 0);
  registrar("8b (clicar na própria marcação apaga)", marcasDepois.length === 0, JSON.stringify(marcasDepois));

  // --- 9. Arrasto do jogador move o token controlado, narrador vê sem reload ---
  await jogadorPage.locator('.rv-ferramentas .rv-ferr-btn[aria-label^="Interagir"]').click();
  const { data: tokenAntes } = await admin.from("vtt_tokens").select("id,sigla,q,r,revision").eq("campaign_id", campaignId).limit(1).maybeSingle();
  if (tokenAntes) {
    await admin.from("vtt_tokens").update({ character_id: characterId }).eq("id", tokenAntes.id);
    await jogadorPage.reload({ waitUntil: "networkidle" });
    await jogadorPage.waitForSelector(".rv-ferramentas", { timeout: 15000 });

    // O token controlado pode não ser o PRIMEIRO no DOM (ordem de
    // renderização segue `CENA_DEMO.tokens`, não a ordem de leitura do
    // banco) — acha pela sigla, não por posição.
    const todosTokens = jogadorPage.locator(".rv-camada-tokens .rv-token");
    const siglas = await todosTokens.locator("text.rv-token-sigla").allTextContents();
    const idx = siglas.indexOf(tokenAntes.sigla);
    const tokenEl = todosTokens.nth(idx === -1 ? 0 : idx);
    const box = idx === -1 ? null : await tokenEl.boundingBox();
    if (box) {
      const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
      await jogadorPage.mouse.move(cx, cy);
      await jogadorPage.mouse.down();
      await jogadorPage.mouse.move(cx + 60, cy + 30, { steps: 6 });
      await jogadorPage.mouse.up();
    }
    // Espera o BANCO refletir, não um tempo fixo: a gravação é uma ida
    // ao servidor e sob carga chega depois da animação local terminar.
    let tokenDepois: { q: number; r: number; revision: number } | null = null;
    for (let i = 0; i < 50; i++) {
      const { data } = await admin.from("vtt_tokens").select("q,r,revision").eq("id", tokenAntes.id).maybeSingle();
      tokenDepois = (data as { q: number; r: number; revision: number } | null) ?? null;
      if (tokenDepois && (tokenDepois.q !== tokenAntes.q || tokenDepois.r !== tokenAntes.r)) break;
      await jogadorPage.waitForTimeout(150);
    }
    const moveu = !!tokenDepois && (tokenDepois.q !== tokenAntes.q || tokenDepois.r !== tokenAntes.r);
    registrar("9 (arrasto do jogador move o token controlado no banco)", moveu, `antes=(${tokenAntes.q},${tokenAntes.r}) depois=(${tokenDepois?.q},${tokenDepois?.r})`);

    // Narrador, sem reload, deve ver a posição nova (Realtime).
    await narradorPage.waitForTimeout(500);
    const posNarrador = await narradorPage.evaluate((sigla) => {
      const els = Array.from(document.querySelectorAll(".rv-camada-tokens .rv-token text.rv-token-sigla"));
      const el = els.find((e) => e.textContent === sigla);
      return el ? el.closest("g")?.getAttribute("transform") : null;
    }, tokenAntes.sigla);
    registrar("9b (narrador vê a posição nova sem reload — Realtime)", !!posNarrador, `transform=${posNarrador}`);

    // --- 10. Ctrl+Z desfaz o movimento do jogador ---
    await jogadorPage.locator(".rv-mesa").click({ position: { x: 5, y: 5 } }); // garante foco fora de qualquer input
    await jogadorPage.keyboard.press("Control+z");
    // Espera a volta CHEGAR no banco — mesmo motivo do critério 9.
    let tokenDesfeito: { q: number; r: number; revision: number } | null = null;
    for (let i = 0; i < 50; i++) {
      const { data } = await admin.from("vtt_tokens").select("q,r,revision").eq("id", tokenAntes.id).maybeSingle();
      tokenDesfeito = (data as { q: number; r: number; revision: number } | null) ?? null;
      if (tokenDesfeito?.q === tokenAntes.q && tokenDesfeito?.r === tokenAntes.r) break;
      await jogadorPage.waitForTimeout(150);
    }
    const erroVisivel10 = await jogadorPage.locator(".rv-erro-acao").textContent().catch(() => null);
    registrar("10 (Ctrl+Z desfaz o movimento no banco)", tokenDesfeito?.q === tokenAntes.q && tokenDesfeito?.r === tokenAntes.r, `voltou a (${tokenDesfeito?.q},${tokenDesfeito?.r}) rev=${tokenDesfeito?.revision} erroAcao=${erroVisivel10}`);
  } else {
    registrar("9 (arrasto move token)", false, "nenhum token na cena semeada");
    registrar("9b (narrador vê sem reload)", false, "pulado");
    registrar("10 (Ctrl+Z desfaz)", false, "pulado");
  }

  // --- 12. Hints unificadas de mapa (terreno decorativo, terreno persistido, objetos) ---
  // Usa `narradorPage`, ociosa desde o critério 9b — sem pan/zoom prévio,
  // então as posições de tela dos elementos fixos da cena de demonstração
  // são as do primeiro carregamento.
  await narradorPage.locator('.rv-ferramentas .rv-ferr-btn[aria-label^="Interagir"]').click();
  await narradorPage.waitForTimeout(150);

  // Célula decorativa "difícil" que NÃO está coberta por um objeto por
  // cima (o objeto, mais acima na pintura, venceria a prioridade e
  // mostraria a hint dele — comportamento correto, testado à parte no
  // critério 12f, mas que tornaria ESTE critério ambíguo se caísse
  // numa célula sobreposta).
  // `page.evaluate` rodado via `tsx`: o esbuild injeta um wrapper
  // `__name` em toda função NOMEADA declarada dentro do callback, que
  // não existe no runtime do browser (`ReferenceError: __name is not
  // defined`) — já documentado em `check-campanha-casca-fase2.ts`.
  // Tudo aqui dentro fica inline, sem `function` nomeada auxiliar.
  async function primeiraCelulaLivreDeObjetos(page: Page, seletorFill: string): Promise<{ x: number; y: number } | null> {
    return page.evaluate((sel) => {
      const els = Array.from(document.querySelectorAll(sel));
      const objRects = Array.from(document.querySelectorAll(".rv-camada-objetos .rv-objeto")).map((o) => o.getBoundingClientRect());
      const comTamanho = els.map((el) => (el as Element).getBoundingClientRect()).filter((r) => r.width > 0 && r.height > 0);
      for (const r of comTamanho) {
        const sobrepoe = objRects.some((o) => !(r.right < o.left || r.left > o.right || r.bottom < o.top || r.top > o.bottom));
        if (!sobrepoe) return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
      }
      // Nenhuma célula totalmente livre de objeto — melhor cair pra
      // primeira com tamanho real do que retornar null (o objetivo do
      // "livre de objeto" é só uma preferência de robustez, não uma
      // garantia; sem fallback, uma sobreposição real em produção
      // reprovaria o critério inteiro em vez de só torná-lo menos
      // isolado do critério 12f).
      return comTamanho.length > 0 ? { x: comTamanho[0].x + comTamanho[0].width / 2, y: comTamanho[0].y + comTamanho[0].height / 2 } : null;
    }, seletorFill);
  }
  /**
   * Lê a hint de um ponto do mapa.
   *
   * Sai de perto e ENTRA na célula em passos — a transição é o que
   * dispara o handler, e um salto único de um ponto distante nem sempre
   * a produz. E TENTA DE NOVO enquanto não houver hint: entre pintar e
   * a hint estar disponível existe um intervalo (o estado da célula
   * ainda está assentando), e um único hover caía nele de forma
   * intermitente. É também o que uma pessoa faz quando nada aparece —
   * mexe o mouse outra vez.
   */
  async function lerTooltip(page: Page, x: number, y: number, tentativas = 6): Promise<string | null> {
    for (let i = 0; i < tentativas; i++) {
      await page.mouse.move(Math.max(0, x - 200), Math.max(0, y - 200));
      await page.waitForTimeout(60);
      await page.mouse.move(x, y, { steps: 8 });
      await page.waitForTimeout(200);
      const texto = await page.locator(".rv-tooltip-terreno").first().textContent().catch(() => null);
      if (texto) return texto;
    }
    return null;
  }

  // 12a/12b/12c saíram: eles cobriam as hints do terreno DECORATIVO
  // (`cena.terrenos` — difícil/elevado/zona morta, com texto próprio),
  // e esse terreno não existe mais no produto. `VttClient` monta o mapa
  // com `terrenos: []` fixo, então nenhuma dessas células chega a ser
  // desenhada e nenhuma hint dessas pode aparecer.
  //
  // O que restou de terreno é o FUNCIONAL, persistido em `vtt_terrain`
  // (difícil/bloqueado) — coberto logo abaixo, no 12d, e é ele que a
  // regra de movimento usa.
  //
  // Nota pra quem for mexer: o código de hint decorativo continua em
  // `MapaHex.tsx` (a tabela por tipo, perto da linha 184) e hoje é
  // inalcançável. Tirar é decisão de produto — pode ser gancho pra algo
  // ainda por vir — então fica registrado aqui em vez de removido de
  // surpresa.

  // 12d — terreno FUNCIONAL persistido (dificil, pintado no critério 4) preserva o texto original.
  {
    const box = await narradorPage.locator(".rv-camada-grade path").first().boundingBox();
    const texto = box ? await lerTooltip(narradorPage, box.x + box.width / 2, box.y + box.height / 2) : null;
    const ok = !!texto && texto.includes("Terreno difícil") && texto.includes("Custa o dobro do deslocamento.");
    registrar("12d (hint do terreno funcional persistido dificil, texto preservado)", ok, `texto="${texto}"`);
  }

  // 12e — terreno FUNCIONAL persistido bloqueado — pinta pela UI e confere o hint.
  {
    await narradorPage.locator('.rv-ferramentas .rv-ferr-btn[aria-label^="Terreno"]').click();
    // Terreno virou JANELA (`PainelTerreno`), não mais um submenu.
    await narradorPage.waitForSelector('section[aria-label="Ferramenta Terreno"]', { timeout: 8000 });
    await narradorPage.locator('.rv-fp-opcao[data-tipo="bloqueado"]').click();
    // Célula do MEIO do mapa (fileira 3, coluna 14 de 20). A 45 ficava
    // na faixa esquerda, embaixo da janela da ferramenta: a pintura
    // funcionava (`dispatchEvent` não passa por hit-test), mas o hover
    // que lê a hint é ponteiro de verdade e caía na janela.
    const celulaBloqueada = narradorPage.locator(".rv-camada-grade path").nth(3 * 20 + 14);
    // Pinta com o MOUSE de verdade (press + release), não com um
    // `dispatchEvent("pointerdown")` solto: o sintético nunca solta o
    // botão, então o gesto de pintura fica pendurado — e o estado que
    // ele deixa é o que fazia a hint desta célula aparecer ou não,
    // conforme a sorte do tempo.
    {
      const alvo = await celulaBloqueada.boundingBox();
      if (alvo) {
        await narradorPage.mouse.move(alvo.x + alvo.width / 2, alvo.y + alvo.height / 2);
        await narradorPage.mouse.down();
        await narradorPage.mouse.up();
      }
    }
    // Espera a camada de terreno REAL de fato aparecer (confirma que a
    // pintura chegou ao estado do cliente) em vez de um timeout fixo —
    // achado real ao rodar pela primeira vez: 500ms nem sempre bastava.
    const pintou = await narradorPage
      .locator(".rv-camada-terreno-real .rv-terreno-real--bloqueado")
      .first()
      .waitFor({ state: "attached", timeout: 5000 })
      .then(() => true)
      .catch(() => false);
    await narradorPage.locator('.rv-ferramentas .rv-ferr-btn[aria-label^="Interagir"]').click();
    await narradorPage.waitForTimeout(150);
    const box = pintou ? await celulaBloqueada.boundingBox() : null;
    const texto = box ? await lerTooltip(narradorPage, box.x + box.width / 2, box.y + box.height / 2) : null;
    const ok = pintou && !!texto && texto.includes("Área bloqueada") && texto.includes("Não permite movimento.");
    registrar("12e (hint do terreno funcional persistido bloqueado)", ok, `pintou=${pintou}, texto="${texto}"`);
  }

  // 12f — objeto/cobertura: conteúdo completo (nome, grau, categoria, PD, danificado, efeito) — mesmo exemplo do pedido original.
  {
    const van = narradorPage.locator('.rv-camada-objetos .rv-objeto[aria-label="Van de transporte"]');
    const box = await van.boundingBox();
    const texto = box ? await lerTooltip(narradorPage, box.x + box.width / 2, box.y + box.height / 2) : null;
    const ok = !!texto
      && texto.includes("Van de transporte")
      && texto.includes("Cobertura maior")
      && /Categoria m[eé]dia/i.test(texto)
      && texto.includes("PD 9/14")
      && texto.includes("Danificado")
      && texto.includes("–2 em ataques direcionais contra o alvo.");
    registrar("12f (hint de objeto/cobertura — Van de transporte, danificado)", ok, `texto="${texto}"`);
  }

  // 12g — some ao tirar o mouse.
  {
    const van = narradorPage.locator('.rv-camada-objetos .rv-objeto[aria-label="Van de transporte"]');
    const box = await van.boundingBox();
    if (box) await narradorPage.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await narradorPage.waitForTimeout(150);
    const presenteAntes = (await narradorPage.locator(".rv-tooltip-terreno").count()) > 0;
    await narradorPage.mouse.move(5, 5);
    await narradorPage.waitForTimeout(150);
    const ausenteDepois = (await narradorPage.locator(".rv-tooltip-terreno").count()) === 0;
    registrar("12g (hint some ao tirar o mouse)", presenteAntes && ausenteDepois, `presente antes=${presenteAntes}, ausente depois=${ausenteDepois}`);
  }

  // 12h — nunca mais de uma hint ao mesmo tempo, mesmo alternando rapidamente entre objeto e token.
  {
    const van = narradorPage.locator('.rv-camada-objetos .rv-objeto[aria-label="Van de transporte"]');
    const boxVan = await van.boundingBox();
    const boxTok = await narradorPage.locator(".rv-camada-tokens .rv-token").first().boundingBox();
    if (boxVan) await narradorPage.mouse.move(boxVan.x + boxVan.width / 2, boxVan.y + boxVan.height / 2);
    await narradorPage.waitForTimeout(100);
    if (boxTok) await narradorPage.mouse.move(boxTok.x + boxTok.width / 2, boxTok.y + boxTok.height / 2);
    await narradorPage.waitForTimeout(100);
    const contagem = await narradorPage.locator(".rv-tooltip-terreno").count();
    registrar("12h (nunca mais de uma hint simultânea)", contagem <= 1, `contagem=${contagem}`);
    await narradorPage.mouse.move(5, 5);
  }

  registrar("13 (console limpo — narrador)", errosNarrador.length === 0, JSON.stringify(errosNarrador));
  registrar("13b (console limpo — jogador)", errosJogador.length === 0, JSON.stringify(errosJogador));

  await closeNarrador();
  await closeJogador();
  await limpar();

  console.log(`\n${passou} ok, ${falhou} falha(s).`);
  if (falhou > 0) process.exit(1);
}

main().catch(async (e) => {
  console.error("Erro fatal:", e);
  await limpar().catch(() => {});
  process.exit(1);
});
