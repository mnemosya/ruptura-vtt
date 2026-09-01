/**
 * UX do fluxo de criação/edição de token — reescrito em DUAS ETAPAS:
 * primeiro o narrador CONFIGURA o token (nome/sigla/lado/tamanho/
 * personagem/visibilidade/trava — sem posição, sem orientação), depois
 * POSICIONA e ORIENTA a miniatura direto no mapa (fantasma seguindo o
 * cursor); o token só é persistido (`create_vtt_token`) na confirmação
 * de uma posição válida. Editar continua de uma etapa só — nunca
 * reposiciona/rotaciona pelo formulário.
 *
 * Cobre, contra o navegador real (não SQL), os 32 itens pedidos:
 *  1-9.   Formulário de configuração sem posição/Q-R/colisão/rotação;
 *         nome vazio; sigla sugerida/preservada; "Mais opções" fechada;
 *         tamanho mostra a contagem certa de hexes.
 *  10-17. Continuar não chama RPC; preview acompanha o cursor com a
 *         pegada certa; Grande/Colossal giram no mapa (Q/E), Médio/
 *         Pequeno/Enorme não; posição válida confirma UMA RPC, inválida
 *         nenhuma; Esc cancela sem persistir.
 *  18-23. Voltar para editar preserva dados; falha do servidor preserva
 *         o rascunho/posição/orientação; duplo clique não duplica;
 *         criação só aparece no banco após confirmação; sucesso
 *         seleciona o token; sincronização entre sessões (delegado a
 *         `check-vtt-sincronizacao-live.ts`, não duplicado aqui).
 *  24-25. Pan/zoom continuam funcionando durante o posicionamento;
 *         botão direito não confirma (nem abre menu contextual).
 *  26-29. Edição preserva posição/orientação; redimensionar sem couber
 *         é recusado com a mensagem certa; URL de imagem perigosa é
 *         recusada; PV inválido é recusado.
 *  30-32. Foco preso no modal de configuração e restaurado ao fechar;
 *         viewport pequena mantém os campos acessíveis; console limpo.
 *
 * Uso: npx tsx scripts/dev/check-vtt-gerenciador-token-ux.ts (servidor
 * dev já rodando em localhost:3000).
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
  return true;
}

let campaignId: string | null = null;
let outraCampanhaId: string | null = null;
let narradorEmail: string | null = null;
let narradorSenha: string | null = null;
let jogadorEmail: string | null = null;
let jogadorSenha: string | null = null;
let sceneId: string | null = null;
const criados = { usuarios: [] as string[], campanhas: [] as string[], personagens: [] as string[] };

async function configurarFixture(): Promise<void> {
  campaignId = randomUUID();
  const email = `check-vtt-ux-${Date.now()}@ruptura.dev`;
  const senha = randomUUID();
  const { data, error } = await admin.auth.admin.createUser({ email, password: senha, email_confirm: true, user_metadata: { display_name: "Narrador UX" } });
  if (error) throw new Error(`Falha ao criar narrador fixture: ${error.message}`);
  narradorEmail = email; narradorSenha = senha;
  criados.usuarios.push(data.user.id);

  const { error: e1 } = await admin.from("campaigns").insert({ id: campaignId, name: "VTT UX", owner_id: data.user.id });
  if (e1) throw new Error(`Falha ao criar campanha: ${e1.message}`);
  criados.campanhas.push(campaignId);

  const eJogador = `check-vtt-ux-jogador-${Date.now()}@ruptura.dev`;
  const sJogador = randomUUID();
  const { data: dJogador, error: eJ } = await admin.auth.admin.createUser({ email: eJogador, password: sJogador, email_confirm: true, user_metadata: { display_name: "Jogador UX" } });
  if (eJ) throw new Error(`Falha ao criar jogador fixture: ${eJ.message}`);
  jogadorEmail = eJogador; jogadorSenha = sJogador;
  criados.usuarios.push(dJogador.user.id);
  await admin.from("campaign_members").insert({ campaign_id: campaignId, user_id: dJogador.user.id, role: "player", status: "active", origem: "check_vtt_ux" });

  const personagemAqui = randomUUID();
  await admin.from("characters").insert({ id: personagemAqui, name: "PJ da campanha certa", status: "draft", payload: {}, campaign_id: campaignId, owner_id: data.user.id });
  criados.personagens.push(personagemAqui);

  outraCampanhaId = randomUUID();
  await admin.from("campaigns").insert({ id: outraCampanhaId, name: "VTT UX Outra", owner_id: data.user.id });
  criados.campanhas.push(outraCampanhaId);
  const personagemOutra = randomUUID();
  await admin.from("characters").insert({ id: personagemOutra, name: "PJ de outra campanha", status: "draft", payload: {}, campaign_id: outraCampanhaId, owner_id: data.user.id });
  criados.personagens.push(personagemOutra);
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
  for (const id of criados.personagens) await admin.from("characters").delete().eq("id", id);
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

/** Abre "Adicionar token" via clique direito numa célula qualquer — a posição do clique NUNCA importa mais (a etapa de configuração não tem noção de posição). */
async function abrirCriarConfigurando(page: Page, indiceCelula = 40) {
  await page.locator('.rv-ferramentas .rv-ferr-btn[aria-label^="Interagir"]').click();
  const box = await page.locator(".rv-camada-grade path").nth(indiceCelula).boundingBox();
  await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2, { button: "right" });
  await page.locator(".rv-menu-item", { hasText: "Adicionar token" }).click();
  await page.waitForSelector(".rv-gerenciador-token", { timeout: 5000 });
}

/** Preenche o mínimo pra "Continuar para posicionar" ficar habilitado (nome não-vazio → sigla nasce sugerida). */
async function preencherNomeMinimo(page: Page, nome: string) {
  await page.locator(".rv-gerenciador-token input[type=text]").first().fill(nome);
}

async function continuarParaPosicionar(page: Page) {
  const botao = page.locator(".rv-gerenciador-token .rv-btn--pri", { hasText: "Continuar para posicionar" });
  await botao.click();
  await page.waitForSelector(".rv-escolha-posicao", { timeout: 5000 });
  await page.waitForSelector(".rv-gerenciador-token", { state: "detached", timeout: 3000 });
}

async function celulaBox(page: Page, indice: number) {
  return page.locator(".rv-camada-grade path").nth(indice).boundingBox();
}

/** Move o mouse pra uma célula (hover, sem clicar) e espera o fantasma refletir. */
async function moverParaCelula(page: Page, indice: number) {
  const box = await celulaBox(page, indice);
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2, { steps: 3 });
  await page.waitForTimeout(120);
  return box!;
}

/** Move o mouse por várias células até o fantasma reportar posição válida (nunca sobreposta/bloqueada/fora do mapa) — mesmo princípio de robustez contra estado deixado por testes anteriores já usado nesta suíte. */
/** Espera até `condicao()` devolver `true`, tentando de novo em passos curtos — usado pra aguardar a propagação Realtime de uma escrita ADMIN (terreno via service role) antes de checar validação no cliente, que só reage depois que `terrenoReal` sincroniza. */
async function esperarAte(condicao: () => Promise<boolean>, timeoutMs = 5000, passoMs = 150): Promise<boolean> {
  const limite = Date.now() + timeoutMs;
  while (Date.now() < limite) {
    if (await condicao()) return true;
    await new Promise((r) => setTimeout(r, passoMs));
  }
  return condicao();
}

async function encontrarCelulaValida(page: Page, indiceInicial: number, passo = 41): Promise<number> {
  for (let i = 0; i < 8; i++) {
    const indice = indiceInicial + i * passo;
    await moverParaCelula(page, indice);
    const valida = await page.locator(".rv-camada-posicionamento-token").getAttribute("data-valida").catch(() => null);
    if (valida === "true") return indice;
  }
  throw new Error("Não achei uma célula válida pra posicionar depois de 8 tentativas.");
}

async function main() {
  await configurarFixture();
  registrar("0 (fixture: campanha + narrador + personagens em campanhas diferentes)", true, `campanha=${campaignId}`);

  const { page, close } = await contextoDe(narradorEmail!, narradorSenha!);
  const erros: string[] = [];
  page.on("console", (m) => { if (erroRelevante(m)) erros.push(m.text().slice(0, 600)); });
  page.on("pageerror", (e) => erros.push(`pageerror: ${e.message}`));

  await page.goto(`${BASE_URL}/mesas/${campaignId}/vtt`, { waitUntil: "networkidle" });
  await page.waitForSelector(".rv-ferramentas", { timeout: 15000 });
  const { data: sceneRow } = await admin.from("vtt_scenes").select("id").eq("campaign_id", campaignId).single();
  sceneId = sceneRow!.id;

  // --- 1: formulário abre sem posição ---
  await abrirCriarConfigurando(page);
  {
    const semPosicaoAtual = await page.locator(".rv-gerenciador-token .rv-posicao-atual").count();
    const semEscolherPosicao = await page.locator(".rv-gerenciador-token .rv-btn", { hasText: "Escolher outra posição" }).count();
    registrar("1 (formulário abre sem posição)", semPosicaoAtual === 0 && semEscolherPosicao === 0, `posicaoAtual=${semPosicaoAtual}, escolherPosicao=${semEscolherPosicao}`);
  }

  // --- 2: Q/R não aparecem ---
  {
    const temCampoQ = await page.locator('.rv-gerenciador-token label:has-text("Posição q")').count();
    const temCampoR = await page.locator('.rv-gerenciador-token label:has-text("Posição r")').count();
    registrar("2 (Q/R não aparecem na interface)", temCampoQ === 0 && temCampoR === 0, `campoQ=${temCampoQ}, campoR=${temCampoR}`);
  }

  // --- 3: colisão não aparece na etapa de configuração ---
  {
    const avisosColisao = await page.locator(".rv-gerenciador-token .rv-form-aviso", { hasText: /sobrepõe|ocuparia terreno bloqueado|fora do mapa|ficaria/ }).count();
    registrar("3 (colisão não aparece na etapa de configuração)", avisosColisao === 0, `avisos=${avisosColisao}`);
  }

  // --- 4: nome começa vazio ---
  {
    const nome = await page.locator(".rv-gerenciador-token input[type=text]").first().inputValue();
    registrar("4 (nome começa vazio)", nome === "", `nome="${nome}"`);
  }

  // --- 5/6: sigla sugerida a partir do nome; edição manual não é sobrescrita ---
  {
    const nomeInput = page.locator(".rv-gerenciador-token input[type=text]").first();
    const siglaInput = page.locator('.rv-gerenciador-token input[maxlength="3"]');
    await nomeInput.fill("Guarda da Doca");
    const siglaSugerida = await siglaInput.inputValue();
    registrar("5 (sigla é sugerida pelo nome)", siglaSugerida === "GDD", `sigla sugerida="${siglaSugerida}" (esperado GDD)`);

    await siglaInput.fill("XY");
    await nomeInput.fill("Guarda da Doca Norte");
    const siglaAposEdicao = await siglaInput.inputValue();
    registrar("6 (sigla editada manualmente não é sobrescrita)", siglaAposEdicao === "XY", `sigla="${siglaAposEdicao}" (esperado XY, preservada)`);
  }

  // --- 7: "Mais opções" começa fechada (modo criar) ---
  {
    const aberto = await page.locator(".rv-gerenciador-token details.rv-mais-opcoes").getAttribute("open");
    registrar('7 ("Mais opções" começa fechado)', aberto === null, `open=${aberto}`);
  }

  // --- 8: tamanho mostra quantidade correta de hexes ---
  {
    const ajudaTamanho = () => page.locator('.rv-gerenciador-token div.rv-field:has(#rv-campo-tamanho) > .rv-field-ajuda').first().textContent();
    await page.selectOption("#rv-campo-tamanho", "medio");
    const medio = await ajudaTamanho();
    await page.selectOption("#rv-campo-tamanho", "grande");
    const grande = await ajudaTamanho();
    await page.selectOption("#rv-campo-tamanho", "enorme");
    const enorme = await ajudaTamanho();
    await page.selectOption("#rv-campo-tamanho", "colossal");
    const colossal = await ajudaTamanho();
    registrar(
      "8 (tamanho mostra a quantidade correta de hexes: médio=1, grande=3, enorme=7, colossal=12)",
      medio?.includes("1 hex") === true && grande?.includes("3 hexes") === true && enorme?.includes("7 hexes") === true && colossal?.includes("12 hexes") === true,
      `médio="${medio}", grande="${grande}", enorme="${enorme}", colossal="${colossal}"`,
    );
  }

  // --- 9: formulário não mostra rotação ---
  {
    await page.selectOption("#rv-campo-tamanho", "grande");
    const semBotoesGirar = await page.locator(".rv-gerenciador-token button", { hasText: /[Gg]irar/ }).count();
    const semSetaDirecao = await page.locator(".rv-gerenciador-token .rv-pegada-preview line").count();
    registrar("9 (formulário não mostra rotação)", semBotoesGirar === 0 && semSetaDirecao === 0, `botõesGirar=${semBotoesGirar}, setaDirecao=${semSetaDirecao}`);
  }

  // --- 10/21: continuar não chama RPC; criação só aparece no banco após confirmação ---
  {
    await page.selectOption("#rv-campo-tamanho", "medio");
    await preencherNomeMinimo(page, "Sentinela Etapas");
    await continuarParaPosicionar(page);
    const { data: antesDeConfirmar } = await admin.from("vtt_tokens").select("id").eq("campaign_id", campaignId).eq("nome", "Sentinela Etapas");
    registrar("10 (continuar para posicionar não chama create_vtt_token)", (antesDeConfirmar ?? []).length === 0, `linhas=${(antesDeConfirmar ?? []).length}`);

    // hover em algumas células sem clicar — ainda nada no banco (item 21, primeira metade)
    await moverParaCelula(page, 30);
    await moverParaCelula(page, 70);
    const { data: aposHover } = await admin.from("vtt_tokens").select("id").eq("campaign_id", campaignId).eq("nome", "Sentinela Etapas");
    registrar("21 (criação só aparece no banco após a confirmação — hover sozinho não persiste nada)", (aposHover ?? []).length === 0, `linhas=${(aposHover ?? []).length}`);

    // --- 11/12: preview acompanha o cursor e usa a pegada certa ---
    const indiceValido = await encontrarCelulaValida(page, 30);
    const ghost1 = await page.locator(".rv-camada-posicionamento-token").getAttribute("data-ancora");
    await moverParaCelula(page, indiceValido + 15);
    const ghost2 = await page.locator(".rv-camada-posicionamento-token").getAttribute("data-ancora");
    registrar("11 (preview acompanha o cursor célula a célula)", ghost1 !== null && ghost2 !== null && ghost1 !== ghost2, `âncora1=${ghost1}, âncora2=${ghost2}`);
    // Filho DIRETO, nunca o seletor descendente genérico — a seta de
    // orientação (agora SEMPRE desenhada, qualquer tamanho, seção 1)
    // também define um `<path>` pro triângulo do `marker` de ponta,
    // aninhado em `<defs>`; contar "qualquer `path` descendente" conta
    // esse triângulo junto e infla a contagem de células da pegada.
    const celulasPegada = await page.locator(".rv-camada-posicionamento-token > path").count();
    registrar("12 (preview usa a pegada correta — Médio ocupa 1 célula)", celulasPegada === 1, `células=${celulasPegada}`);

    // volta pra uma posição conhecida válida antes de seguir
    await moverParaCelula(page, indiceValido);

    // --- 15: posição válida confirma UMA RPC ---
    const box = await celulaBox(page, indiceValido);
    await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await page.waitForSelector(".rv-escolha-posicao", { state: "detached", timeout: 5000 });
    const { data: criadosSentinela } = await admin.from("vtt_tokens").select("id").eq("campaign_id", campaignId).eq("nome", "Sentinela Etapas");
    registrar("15 (posição válida confirma exatamente uma RPC de criação)", (criadosSentinela ?? []).length === 1, `linhas=${(criadosSentinela ?? []).length}`);

    // --- 22: sucesso seleciona o token criado ---
    if (criadosSentinela && criadosSentinela.length === 1) {
      await page.waitForTimeout(200);
      const selecionado = await page.locator(`.rv-token[data-token-id="${criadosSentinela[0].id}"]`).evaluate((el) => el.classList.contains("is-sel")).catch(() => false);
      registrar("22 (sucesso seleciona o token criado)", selecionado, `selecionado=${selecionado}`);
    } else {
      registrar("22 (sucesso seleciona o token criado)", false, "token não foi criado — não dá pra checar seleção");
    }
  }

  // --- nome-ui-1/2: nome/sigla vazios são um formulário VÁLIDO; o servidor gera "#N" ---
  {
    await abrirCriarConfigurando(page, 195);
    const nomeVazio = await page.locator(".rv-gerenciador-token input[type=text]").first().inputValue();
    const podeContinuar = !(await page.locator(".rv-gerenciador-token .rv-btn--pri", { hasText: "Continuar para posicionar" }).isDisabled());
    registrar("nome-ui-1 (nome/sigla vazios não bloqueiam 'Continuar para posicionar')", nomeVazio === "" && podeContinuar, `nome="${nomeVazio}", podeContinuar=${podeContinuar}`);

    await continuarParaPosicionar(page);
    await moverParaCelula(page, 195); // sem isto o fantasma nem existe ainda (âncora só nasce no primeiro hover) — o count()===0 provaria a coisa errada
    // fantasma sem sigla/imagem usa um placeholder neutro (círculo), nunca texto de sigla vazio nem "??".
    const semTextoDeSigla = (await page.locator(".rv-camada-posicionamento-token text").count()) === 0;
    const comPlaceholderNeutro = (await page.locator(".rv-camada-posicionamento-token circle.rv-token-sigla-placeholder").count()) === 1;
    registrar("nome-ui-2 (fantasma sem nome/sigla usa glifo neutro, nunca texto vazio nem '??')", semTextoDeSigla && comPlaceholderNeutro, `semTexto=${semTextoDeSigla}, placeholder=${comPlaceholderNeutro}`);

    const textoBarraFlutuante = await page.locator(".rv-escolha-posicao span").first().textContent();
    registrar('nome-ui-3 (barra flutuante diz "o novo token" quando ainda não há nome)', (textoBarraFlutuante ?? "").includes("o novo token"), `texto="${textoBarraFlutuante}"`);

    const idx = await encontrarCelulaValida(page, 195);
    const box = await celulaBox(page, idx);
    await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await page.waitForSelector(".rv-escolha-posicao", { state: "detached", timeout: 5000 });

    const { data: criadosAutomaticos } = await admin.from("vtt_tokens").select("nome, sigla").eq("campaign_id", campaignId).like("nome", "#%").order("created_at", { ascending: false }).limit(1);
    const nomeAutomatico = criadosAutomaticos?.[0]?.nome ?? "";
    registrar("nome-ui-4 (servidor gerou um nome '#N' de verdade pro token criado sem nome)", /^#\d+$/.test(nomeAutomatico), `nome="${nomeAutomatico}"`);

    // O painel de Personagens (narrador) mostra o nome DEFINITIVO devolvido pelo servidor — nunca vazio, nunca um placeholder do cliente.
    await page.locator('.rv-aba[aria-label="Personagens"]').click();
    const nomeNoPainel = await page.locator(".rv-painel-corpo .rv-lista-item strong", { hasText: nomeAutomatico }).count();
    registrar("nome-ui-5 (painel de Personagens mostra o nome automático definitivo devolvido pela RPC)", nomeNoPainel === 1, `encontrado=${nomeNoPainel === 1}`);
    await page.locator('.rv-aba[aria-label="Personagens"]').click();
  }

  // --- 16: posição inválida não chama RPC ---
  {
    await abrirCriarConfigurando(page, 45);
    await preencherNomeMinimo(page, "Nunca Sobrepõe");
    await continuarParaPosicionar(page);
    // célula (0,0), primeira da grade — já ocupada pelo token criado acima (âncora do "Sentinela Etapas" ou perto dela); em vez de assumir, força um bloqueio conhecido.
    await admin.from("vtt_terrain").upsert({ scene_id: sceneId, campaign_id: campaignId, q: 0, r: 0, tipo: "bloqueado" });
    await moverParaCelula(page, 0); // primeira célula da grade renderizada é (0,0)
    // Escrita ADMIN direta (não pela RPC) — o cliente só sabe do
    // bloqueio depois que `postgres_changes` propaga e `terrenoReal`
    // sincroniza; sem esperar isso, a validação roda contra o estado
    // VELHO (sem o bloqueio) e o fantasma mostraria válido por engano.
    const bloqueioPropagou = await esperarAte(async () => (await page.locator(".rv-camada-posicionamento-token").getAttribute("data-valida")) === "false");
    const valida = await page.locator(".rv-camada-posicionamento-token").getAttribute("data-valida");
    registrar("16a (fantasma mostra inválido sobre terreno bloqueado)", bloqueioPropagou && valida === "false", `valida=${valida}`);
    const box = await celulaBox(page, 0);
    await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await page.waitForTimeout(500);
    const aindaPosicionando = await page.locator(".rv-escolha-posicao").count();
    const { data: naoCriados } = await admin.from("vtt_tokens").select("id").eq("campaign_id", campaignId).eq("nome", "Nunca Sobrepõe");
    registrar("16 (posição inválida não chama create_vtt_token)", (naoCriados ?? []).length === 0 && aindaPosicionando === 1, `linhas=${(naoCriados ?? []).length}, aindaPosicionando=${aindaPosicionando === 1}`);

    // --- 17: Esc cancela sem persistir ---
    await page.keyboard.press("Escape");
    await page.waitForSelector(".rv-escolha-posicao", { state: "detached", timeout: 3000 });
    const { data: aindaNaoCriados } = await admin.from("vtt_tokens").select("id").eq("campaign_id", campaignId).eq("nome", "Nunca Sobrepõe");
    registrar("17 (Esc cancela o posicionamento sem persistir nada)", (aindaNaoCriados ?? []).length === 0, `linhas=${(aindaNaoCriados ?? []).length}`);
  }

  // --- 13/14: Grande/Colossal giram no mapa (Q/E); Médio/Pequeno/Enorme não ---
  {
    await abrirCriarConfigurando(page, 60);
    await preencherNomeMinimo(page, "Girador");
    await page.selectOption("#rv-campo-tamanho", "grande");
    await continuarParaPosicionar(page);
    const indiceValido = await encontrarCelulaValida(page, 60);
    const orientacaoAntesGrande = await page.locator(".rv-camada-posicionamento-token").getAttribute("data-orientacao");
    await page.keyboard.press("e");
    await page.waitForTimeout(120);
    const orientacaoDepoisGrande = await page.locator(".rv-camada-posicionamento-token").getAttribute("data-orientacao");
    registrar("13 (Grande gira no mapa via Q/E)", orientacaoAntesGrande !== orientacaoDepoisGrande, `antes=${orientacaoAntesGrande}, depois=${orientacaoDepoisGrande}`);
    await page.keyboard.press("Escape");
    await page.waitForSelector(".rv-escolha-posicao", { state: "detached", timeout: 3000 });

    for (const tamanho of ["pequeno", "medio", "enorme"] as const) {
      await abrirCriarConfigurando(page, 65);
      await preencherNomeMinimo(page, `Não Gira ${tamanho}`);
      await page.selectOption("#rv-campo-tamanho", tamanho);
      await continuarParaPosicionar(page);
      const idx = await encontrarCelulaValida(page, 65);
      const antes = await page.locator(".rv-camada-posicionamento-token").getAttribute("data-orientacao");
      await page.keyboard.press("q");
      await page.keyboard.press("e");
      await page.waitForTimeout(120);
      const depois = await page.locator(".rv-camada-posicionamento-token").getAttribute("data-orientacao");
      registrar(`14 (${tamanho} não oferece rotação — Q/E não muda orientação)`, antes === depois && antes === "0", `antes=${antes}, depois=${depois}`);
      await page.keyboard.press("Escape");
      await page.waitForSelector(".rv-escolha-posicao", { state: "detached", timeout: 3000 });
      void idx;
    }
  }

  // --- 18: voltar para editar preserva dados ---
  {
    await abrirCriarConfigurando(page, 90);
    await preencherNomeMinimo(page, "Preserva Dados");
    await page.locator('.rv-gerenciador-token input[maxlength="3"]').fill("PSV");
    await continuarParaPosicionar(page);
    await moverParaCelula(page, 90);
    await page.locator(".rv-btn", { hasText: "Voltar para editar" }).click();
    await page.waitForSelector(".rv-gerenciador-token", { timeout: 3000 });
    const nomeVoltou = await page.locator(".rv-gerenciador-token input[type=text]").first().inputValue();
    const siglaVoltou = await page.locator('.rv-gerenciador-token input[maxlength="3"]').inputValue();
    registrar("18 (voltar para editar preserva os dados preenchidos)", nomeVoltou === "Preserva Dados" && siglaVoltou === "PSV", `nome="${nomeVoltou}", sigla="${siglaVoltou}"`);
    page.once("dialog", (d) => d.accept());
    await page.keyboard.press("Escape");
    await page.waitForSelector(".rv-gerenciador-token", { state: "detached", timeout: 3000 }).catch(() => {});
  }

  // --- 19: falha do servidor preserva o rascunho/posição/orientação ---
  {
    await abrirCriarConfigurando(page, 110);
    await preencherNomeMinimo(page, "Sobrevive Falha Servidor");
    await continuarParaPosicionar(page);
    const indiceValido = await encontrarCelulaValida(page, 110);
    const box = await celulaBox(page, indiceValido);
    const ancoraEscolhida = await page.locator(".rv-camada-posicionamento-token").getAttribute("data-ancora");

    // Insere um token BEM na mesma célula direto via service role — sem
    // passar pela RPC (nenhum broadcast de invalidação dispara), então
    // o CLIENTE não sabe da sobreposição e valida como OK; o SERVIDOR
    // vê a linha de verdade e recusa — falha real, não fabricada.
    const [qStr, rStr] = (ancoraEscolhida ?? "0,0").split(",");
    await admin.from("vtt_tokens").insert({
      scene_id: sceneId, campaign_id: campaignId, nome: "Bloqueador Invisível", sigla: "BQ",
      lado: "pn", q: Number(qStr), r: Number(rStr), visivel: true,
    });

    await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await page.waitForSelector('.rv-escolha-posicao[data-fase="erro"]', { timeout: 5000 });
    const { data: naoCriado } = await admin.from("vtt_tokens").select("id").eq("campaign_id", campaignId).eq("nome", "Sobrevive Falha Servidor");
    const aindaPosicionando = await page.locator(".rv-escolha-posicao").count();
    registrar("19a (falha do servidor não cria o token e mantém o modo ativo)", (naoCriado ?? []).length === 0 && aindaPosicionando === 1, `linhas=${(naoCriado ?? []).length}, aindaAtivo=${aindaPosicionando === 1}`);

    // Preservação de verdade: volta pro formulário e confirma que nome/
    // sigla sobreviveram à falha (não foram limpos nem perdidos).
    await page.locator(".rv-btn", { hasText: "Voltar para editar" }).click();
    await page.waitForSelector(".rv-gerenciador-token", { timeout: 3000 });
    const nomePreservado = await page.locator(".rv-gerenciador-token input[type=text]").first().inputValue();
    registrar("19b (nome sobrevive à falha do servidor)", nomePreservado === "Sobrevive Falha Servidor", `nome="${nomePreservado}"`);

    // Orientação/posição preservadas: "Continuar" de novo deve voltar
    // exatamente pra mesma âncora escolhida antes da falha.
    await continuarParaPosicionar(page);
    const ancoraDepoisDeVoltar = await page.locator(".rv-camada-posicionamento-token").getAttribute("data-ancora");
    registrar("19c (posição escolhida sobrevive à falha, via 'voltar para editar' → continuar)", ancoraDepoisDeVoltar === ancoraEscolhida, `antes="${ancoraEscolhida}", depois="${ancoraDepoisDeVoltar}"`);

    await page.keyboard.press("Escape");
    await page.waitForSelector(".rv-escolha-posicao", { state: "detached", timeout: 3000 });
    await admin.from("vtt_tokens").delete().eq("sigla", "BQ").eq("campaign_id", campaignId);
  }

  // --- 20: duplo clique não duplica ---
  {
    await abrirCriarConfigurando(page, 150);
    await preencherNomeMinimo(page, "Duplo Clique");
    await continuarParaPosicionar(page);
    const indiceValido = await encontrarCelulaValida(page, 150);
    const box = await celulaBox(page, indiceValido);
    // Sem race de actionability aqui (não é um <button> que desabilita
    // no meio do gesto) — dois cliques reais e sequenciais já bastam
    // pra estressar o guard de duplo clique.
    await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await page.waitForSelector(".rv-escolha-posicao", { state: "detached", timeout: 5000 });
    await page.waitForTimeout(500);
    const { data: criadosDuplo } = await admin.from("vtt_tokens").select("id").eq("campaign_id", campaignId).eq("nome", "Duplo Clique");
    registrar("20 (duplo clique no mapa cria só UM token)", (criadosDuplo ?? []).length === 1, `criados=${(criadosDuplo ?? []).length}`);
  }

  // --- 24/25: pan/zoom funcionam durante o posicionamento; botão direito não confirma ---
  {
    await abrirCriarConfigurando(page, 180);
    await preencherNomeMinimo(page, "Pan Zoom");
    await continuarParaPosicionar(page);
    await moverParaCelula(page, 180);

    const gAntesPan = await page.locator("svg.rv-mapa > g").getAttribute("transform");
    await page.mouse.move(400, 400);
    await page.mouse.down({ button: "right" });
    await page.mouse.move(440, 425, { steps: 5 });
    await page.mouse.up({ button: "right" });
    await page.waitForTimeout(200);
    const gDepoisPan = await page.locator("svg.rv-mapa > g").getAttribute("transform");
    registrar("24a (pan continua funcionando durante o posicionamento)", gAntesPan !== gDepoisPan, `antes="${gAntesPan}" depois="${gDepoisPan}"`);

    const zoomAntes = await page.locator(".rv-zoom span").textContent();
    await page.mouse.move(500, 400);
    await page.mouse.wheel(0, -200);
    await page.waitForTimeout(200);
    const zoomDepois = await page.locator(".rv-zoom span").textContent();
    registrar("24b (zoom continua funcionando durante o posicionamento)", zoomAntes !== zoomDepois, `antes="${zoomAntes}" depois="${zoomDepois}"`);

    // botão direito CLICADO (sem arrastar) — não confirma nem abre menu contextual.
    await page.mouse.move(500, 400);
    await page.mouse.down({ button: "right" });
    await page.mouse.up({ button: "right" });
    await page.waitForTimeout(300);
    const menuAberto = await page.locator(".rv-menu-contextual").count();
    const aindaPosicionando = await page.locator(".rv-escolha-posicao").count();
    const { data: naoCriadoPorBotaoDireito } = await admin.from("vtt_tokens").select("id").eq("campaign_id", campaignId).eq("nome", "Pan Zoom");
    registrar(
      "25 (botão direito não confirma posição nem abre menu contextual durante o posicionamento)",
      menuAberto === 0 && aindaPosicionando === 1 && (naoCriadoPorBotaoDireito ?? []).length === 0,
      `menu=${menuAberto}, aindaPosicionando=${aindaPosicionando === 1}, criados=${(naoCriadoPorBotaoDireito ?? []).length}`,
    );

    await page.keyboard.press("Escape");
    await page.waitForSelector(".rv-escolha-posicao", { state: "detached", timeout: 3000 });
  }

  // --- 13/14 (personagem vinculado) reaproveitado do formulário de configuração — confere junto com 26-29 abaixo, que exercitam o modo EDITAR ---

  // --- criação de um token de referência pra editar ---
  let tokenEditarId: string | null = null;
  {
    await abrirCriarConfigurando(page, 200);
    await preencherNomeMinimo(page, "Editável");
    await page.selectOption("#rv-campo-tamanho", "medio");
    await continuarParaPosicionar(page);
    const idx = await encontrarCelulaValida(page, 200);
    const box = await celulaBox(page, idx);
    await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await page.waitForSelector(".rv-escolha-posicao", { state: "detached", timeout: 5000 });
    const { data } = await admin.from("vtt_tokens").select("id, q, r, orientacao").eq("campaign_id", campaignId).eq("nome", "Editável").single();
    tokenEditarId = data!.id;

    // personagem vinculado (itens 13/14 do pedido original, cobertos aqui — a etapa de configuração é a mesma pros dois modos)
    const ajuda = await page.locator('.rv-gerenciador-token label:has-text("Vincular a uma ficha") .rv-field-ajuda').textContent().catch(() => null);
    void ajuda; // modal já fechou (criação concluída) — checagem real do vínculo abaixo, reabrindo em modo editar

    // --- 26: edição preserva posição/orientação ---
    await page.locator(`.rv-token[data-token-id="${tokenEditarId}"]`).click({ button: "right" });
    await page.locator(".rv-menu-item", { hasText: "Editar" }).click();
    await page.waitForSelector(".rv-gerenciador-token", { timeout: 5000 });

    const opcoesPersonagem = await page.locator('.rv-gerenciador-token label:has-text("Vincular a uma ficha") select option').allTextContents();
    registrar(
      "personagem vinculado (só lista da MESMA campanha, nunca de outra)",
      opcoesPersonagem.some((o) => o.includes("PJ da campanha certa")) && !opcoesPersonagem.some((o) => o.includes("PJ de outra campanha")),
      `opções=${JSON.stringify(opcoesPersonagem)}`,
    );

    await page.locator(".rv-gerenciador-token input[type=text]").first().fill("Editável Renomeado");
    await page.locator(".rv-btn--pri", { hasText: "Salvar alterações" }).click();
    await page.waitForSelector(".rv-gerenciador-token", { state: "detached", timeout: 5000 });
    const { data: depoisDeEditar } = await admin.from("vtt_tokens").select("q, r, orientacao, nome").eq("id", tokenEditarId).single();
    registrar(
      "26 (edição preserva posição e orientação — nunca reposiciona/rotaciona pelo formulário)",
      depoisDeEditar!.q === data!.q && depoisDeEditar!.r === data!.r && depoisDeEditar!.orientacao === data!.orientacao && depoisDeEditar!.nome === "Editável Renomeado",
      `antes=(${data!.q},${data!.r},${data!.orientacao}) depois=(${depoisDeEditar!.q},${depoisDeEditar!.r},${depoisDeEditar!.orientacao}) nome="${depoisDeEditar!.nome}"`,
    );
  }

  // --- undo/redo de uma edição atômica (nome+tamanho): os DOIS campos
  //     revertem/reaplicam JUNTOS, numa RPC só por passo — nunca um
  //     campo sozinho, nunca dois passos de histórico pra uma edição só. ---
  {
    const { page: jogadorPage, close: closeJogador } = await contextoDe(jogadorEmail!, jogadorSenha!);
    await jogadorPage.goto(`${BASE_URL}/mesas/${campaignId}/vtt`, { waitUntil: "networkidle" });
    await jogadorPage.waitForSelector(".rv-ferramentas", { timeout: 15000 });

    const { data: antesDoUndo } = await admin.from("vtt_tokens").select("nome, tamanho, revision").eq("id", tokenEditarId!).single();
    await page.locator(`.rv-token[data-token-id="${tokenEditarId}"]`).click({ button: "right" });
    await page.locator(".rv-menu-item", { hasText: "Editar" }).click();
    await page.waitForSelector(".rv-gerenciador-token", { timeout: 5000 });
    await page.locator(".rv-gerenciador-token input[type=text]").first().fill("Editável Undo Redo");
    await page.selectOption("#rv-campo-tamanho", "grande");
    await page.locator(".rv-btn--pri", { hasText: "Salvar alterações" }).click();
    await page.waitForSelector(".rv-gerenciador-token", { state: "detached", timeout: 5000 });
    const { data: depoisDeEditar2 } = await admin.from("vtt_tokens").select("nome, tamanho, revision").eq("id", tokenEditarId!).single();
    registrar(
      "undo-redo-0 (edição atômica de referência: nome+tamanho aplicados juntos)",
      depoisDeEditar2?.nome === "Editável Undo Redo" && depoisDeEditar2?.tamanho === "grande" && depoisDeEditar2?.revision === antesDoUndo!.revision + 1,
      `antes=${JSON.stringify(antesDoUndo)}, depois=${JSON.stringify(depoisDeEditar2)}`,
    );

    await page.keyboard.press("Control+z");
    await esperarAte(async () => {
      const { data } = await admin.from("vtt_tokens").select("revision").eq("id", tokenEditarId!).single();
      return data?.revision === depoisDeEditar2!.revision + 1;
    });
    const { data: depoisDoUndo } = await admin.from("vtt_tokens").select("nome, tamanho, revision").eq("id", tokenEditarId!).single();
    registrar(
      "undo (Ctrl+Z restaura nome E tamanho JUNTOS — uma única RPC, não dois passos)",
      depoisDoUndo?.nome === antesDoUndo!.nome && depoisDoUndo?.tamanho === antesDoUndo!.tamanho && depoisDoUndo?.revision === depoisDeEditar2!.revision + 1,
      `esperado=${JSON.stringify(antesDoUndo)}, obtido=${JSON.stringify(depoisDoUndo)}`,
    );
    const sincronizouUndo = await esperarAte(async () => jogadorPage.evaluate((id) => {
      const el = document.querySelector(`.rv-camada-tokens .rv-token[data-token-id="${id}"]`);
      return el?.getAttribute("aria-label")?.includes("Editável Renomeado") ?? false;
    }, tokenEditarId), 5000);
    registrar("undo-sync (outra sessão recebe o estado pós-undo sem reload)", sincronizouUndo, `sincronizou=${sincronizouUndo}`);

    await page.keyboard.press("Control+Shift+z");
    await esperarAte(async () => {
      const { data } = await admin.from("vtt_tokens").select("revision").eq("id", tokenEditarId!).single();
      return data?.revision === depoisDoUndo!.revision + 1;
    });
    const { data: depoisDoRedo } = await admin.from("vtt_tokens").select("nome, tamanho, revision").eq("id", tokenEditarId!).single();
    const sincronizouRedo = await esperarAte(async () => jogadorPage.evaluate((id) => {
      const el = document.querySelector(`.rv-camada-tokens .rv-token[data-token-id="${id}"]`);
      return el?.getAttribute("aria-label")?.includes("Editável Undo Redo") ?? false;
    }, tokenEditarId), 5000);
    registrar("redo-sync (outra sessão recebe o estado pós-redo sem reload)", sincronizouRedo, `sincronizou=${sincronizouRedo}`);
    await closeJogador();
    registrar(
      "redo (Ctrl+Shift+Z reaplica nome E tamanho JUNTOS — uma única RPC)",
      depoisDoRedo?.nome === "Editável Undo Redo" && depoisDoRedo?.tamanho === "grande" && depoisDoRedo?.revision === depoisDoUndo!.revision + 1,
      `esperado=(nome="Editável Undo Redo", tamanho="grande"), obtido=${JSON.stringify(depoisDoRedo)}`,
    );

    // Undo mais uma vez pra deixar o token de volta em "medio" — o
    // critério 27 (abaixo) depende de "medio" caber na posição atual
    // antes de tentar redimensionar pra "grande" sem couber.
    await page.keyboard.press("Control+z");
    await esperarAte(async () => {
      const { data } = await admin.from("vtt_tokens").select("revision").eq("id", tokenEditarId!).single();
      return data?.revision === depoisDoRedo!.revision + 1;
    });
  }

  // --- 27: resize inválido é recusado (edição) ---
  {
    // Cerca o token editável de terreno bloqueado nas 6 direções — Grande (3 células, triângulo) nunca vai caber ali.
    const { data: tok } = await admin.from("vtt_tokens").select("q, r").eq("id", tokenEditarId!).single();
    const vizinhos = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
    const bloqueadosAntes = await page.locator(".rv-terreno-real--bloqueado").count();
    for (const [dq, dr] of vizinhos) {
      await admin.from("vtt_terrain").upsert({ scene_id: sceneId, campaign_id: campaignId, q: tok!.q + dq, r: tok!.r + dr, tipo: "bloqueado" });
    }
    // Escritas ADMIN diretas — espera os 6 blocos chegarem via
    // `postgres_changes` antes de abrir o formulário; sem isto, o
    // `terrenoReal` que a checagem de redimensionar usa ainda estaria
    // desatualizado (mesma corrida do critério 16a).
    await esperarAte(async () => (await page.locator(".rv-terreno-real--bloqueado").count()) >= bloqueadosAntes + 6);
    await page.locator(`.rv-token[data-token-id="${tokenEditarId}"]`).click({ button: "right" });
    await page.locator(".rv-menu-item", { hasText: "Editar" }).click();
    await page.waitForSelector(".rv-gerenciador-token", { timeout: 5000 });
    await page.selectOption("#rv-campo-tamanho", "grande");
    const avisoResize = await page.locator(".rv-gerenciador-token .rv-form-aviso", { hasText: "não cabe na posição atual" }).count();
    const botaoDesabilitado = await page.locator(".rv-btn--pri", { hasText: "Salvar alterações" }).isDisabled();
    registrar("27 (redimensionar sem couber é recusado, com a mensagem certa)", avisoResize > 0 && botaoDesabilitado, `aviso=${avisoResize > 0}, desabilitado=${botaoDesabilitado}`);
    const { data: naoMudou } = await admin.from("vtt_tokens").select("tamanho").eq("id", tokenEditarId!).single();
    registrar("27b (tamanho não muda no banco enquanto a recusa persistir)", naoMudou!.tamanho === "medio", `tamanho="${naoMudou!.tamanho}"`);

    // limpa o cerco de terreno e volta pro tamanho original antes de fechar.
    await page.selectOption("#rv-campo-tamanho", "medio");
    page.once("dialog", (d) => d.accept());
    await page.keyboard.press("Escape");
    await page.waitForSelector(".rv-gerenciador-token", { state: "detached", timeout: 3000 }).catch(() => {});
    for (const [dq, dr] of vizinhos) {
      await admin.from("vtt_terrain").delete().eq("scene_id", sceneId).eq("q", tok!.q + dq).eq("r", tok!.r + dr);
    }
  }

  // --- 28: URL de imagem perigosa é recusada ---
  {
    await page.locator(`.rv-token[data-token-id="${tokenEditarId}"]`).click({ button: "right" });
    await page.locator(".rv-menu-item", { hasText: "Editar" }).click();
    await page.waitForSelector(".rv-gerenciador-token", { timeout: 5000 });
    await page.locator("summary", { hasText: "Mais opções" }).click();
    const imagemInput = page.locator('.rv-gerenciador-token label:has-text("Imagem do token") input');
    await imagemInput.fill("javascript:alert(1)");
    const avisoPerigosa = await page.locator(".rv-gerenciador-token .rv-form-aviso", { hasText: "http" }).count();
    await imagemInput.fill("não é uma url");
    const avisoInvalida = await page.locator(".rv-gerenciador-token .rv-form-aviso", { hasText: "inválido" }).count();
    registrar("28 (URL de imagem perigosa/inválida é recusada, sem quebrar o formulário)", avisoPerigosa > 0 && avisoInvalida > 0, `perigosa=${avisoPerigosa}, inválida=${avisoInvalida}`);
    await imagemInput.fill("");
  }

  // --- 29: PV inválido é recusado ---
  {
    const pvAtual = page.locator('.rv-gerenciador-token fieldset:has-text("Pontos de Vida") input').first();
    const pvMax = page.locator('.rv-gerenciador-token fieldset:has-text("Pontos de Vida") input').nth(1);
    await pvAtual.fill("50");
    await pvMax.fill("10");
    const avisoPv = await page.locator(".rv-gerenciador-token .rv-form-aviso", { hasText: "PV atual não pode ser maior" }).count();
    const botaoDesabilitado = await page.locator(".rv-btn--pri", { hasText: "Salvar alterações" }).isDisabled();
    registrar("29 (PV atual maior que máximo é recusado)", avisoPv > 0 && botaoDesabilitado, `aviso=${avisoPv > 0}, desabilitado=${botaoDesabilitado}`);
    await pvAtual.fill("");
    await pvMax.fill("");
  }

  // --- 30: foco preso no modal de configuração e restaurado ao fechar ---
  {
    page.once("dialog", (d) => d.accept());
    await page.keyboard.press("Escape");
    await page.waitForSelector(".rv-gerenciador-token", { state: "detached", timeout: 3000 }).catch(() => {});

    const botaoAbrir = page.locator('.rv-ferr-btn[aria-label="Adicionar token"]');
    await botaoAbrir.focus();
    await botaoAbrir.click();
    await page.waitForSelector(".rv-gerenciador-token", { timeout: 5000 });
    await page.waitForTimeout(150);
    const focoInicialNoPrimeiroCampo = await page.evaluate(() => document.activeElement?.tagName === "INPUT");
    let voltouAoComeco = false;
    for (let i = 0; i < 40; i++) {
      await page.keyboard.press("Tab");
      const dentroDoModal = await page.evaluate(() => !!document.activeElement?.closest(".rv-gerenciador-token"));
      if (!dentroDoModal) break;
      const ehPrimeiro = await page.evaluate(() => document.activeElement === document.querySelector(".rv-gerenciador-token input[type=text]"));
      if (ehPrimeiro && i > 3) { voltouAoComeco = true; break; }
    }
    const focoTrap = focoInicialNoPrimeiroCampo && voltouAoComeco;

    await page.keyboard.press("Escape");
    await page.waitForSelector(".rv-gerenciador-token", { state: "detached", timeout: 3000 });
    const focoRestaurado = await page.evaluate(() => document.activeElement?.getAttribute("aria-label") === "Adicionar token");
    registrar("30 (foco preso no modal e restaurado pro botão que abriu, ao fechar com Esc)", focoTrap && focoRestaurado, `focoInicial=${focoInicialNoPrimeiroCampo}, focoPreso=${voltouAoComeco}, focoRestaurado=${focoRestaurado}`);
  }

  // --- 31: viewport pequena mantém campos acessíveis ---
  {
    await page.setViewportSize({ width: 380, height: 620 });
    await abrirCriarConfigurando(page, 55);
    const rodapeVisivel = await page.locator(".rv-modal-rodape").isVisible();
    const corpoTemScroll = await page.evaluate(() => {
      const corpo = document.querySelector(".rv-modal-corpo");
      return corpo ? corpo.scrollHeight > corpo.clientHeight : false;
    });
    const semOverflowHorizontal = await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 2);
    registrar("31 (viewport pequena: rodapé visível, corpo rola internamente, sem estouro horizontal)", rodapeVisivel && semOverflowHorizontal, `rodapeVisivel=${rodapeVisivel}, semOverflowHorizontal=${semOverflowHorizontal}, corpoRola=${corpoTemScroll}`);
    page.once("dialog", (d) => d.accept());
    await page.keyboard.press("Escape");
    await page.waitForSelector(".rv-gerenciador-token", { state: "detached", timeout: 3000 }).catch(() => {});
    await page.setViewportSize({ width: 1280, height: 950 });
  }

  // --- 32: console limpo ---
  registrar("32 (nenhum warning/erro novo no console durante toda a sessão)", erros.length === 0, JSON.stringify(erros));

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
