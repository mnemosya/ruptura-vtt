/**
 * A CENA AO VIVO — o que o narrador põe no mapa chega a quem está na
 * mesa, sem reload.
 *
 * Quarto da família iniciada por `check-mesa-ao-vivo.ts`, e escrito
 * para uma lacuna muito específica: as camadas que o narrador MONTA
 * (imagem, objeto, marca, régua fixa) não tinham nenhuma verificação ao
 * vivo. A suíte confere que elas chegam ao BANCO e que aparecem para
 * quem as criou — nunca que a outra pessoa passa a vê-las.
 *
 * ── Por que justo estas quatro ──────────────────────────────────────
 * Porque são as que RT-01 derrubou e ninguém percebeu. Uma única
 * assinatura recusada (`vtt_scene_images`, "invalid column for filter")
 * matava o canal `campaign:<id>:vtt` INTEIRO, e com ele terreno,
 * marcas, medições, áreas, objetos e cenas. O terreno ganhou guarda ao
 * vivo em `check-mesa-ao-vivo`; estas quatro ficaram sem.
 *
 * A imagem merece nome próprio: é a tabela cuja ligação causou o RT-01.
 * Se ela voltar a ser recusada, o critério 2 é quem vai dizer.
 *
 * ── E uma que não é de entrega, é de VAZAMENTO ──────────────────────
 * O critério 6 pergunta o contrário dos outros: uma imagem marcada como
 * NÃO VISÍVEL não pode chegar ao jogador. Num VTT, a pessoa ver o que o
 * narrador ainda não revelou é pior que não ver o que já foi revelado —
 * o segundo é um incômodo, o primeiro estraga a cena. E o modo de falha
 * é silencioso dos dois lados: o narrador acha que escondeu.
 *
 * ── Regras do arquivo ───────────────────────────────────────────────
 *   · NENHUM reload depois que as duas sessões abrem. Recarregar mede
 *     persistência por SSR, não entrega ao vivo — foi exatamente assim
 *     que um canal morto passou por verde durante meses.
 *   · toda espera é por CONDIÇÃO, com o relógio como teto e não como
 *     medida.
 *   · o primeiro critério é sempre "o canal assinou": sem isso, todo o
 *     resto falha por consequência, e saber disso primeiro é a
 *     diferença entre um diagnóstico e quatro sintomas soltos.
 *
 * Uso: npx tsx scripts/dev/check-cena-ao-vivo.ts
 */

import { createHash, randomUUID } from "node:crypto";
import { config as loadDotenv } from "dotenv";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { chromium, type Browser, type Page } from "playwright";
import { BASE_URL } from "./authSession";
import { recolherPainelDaSessao } from "./painelDaSessao";

loadDotenv({ path: ".env.local" });

function exigirEnv(nome: string): string {
  const v = process.env[nome];
  if (!v) throw new Error(`${nome} ausente no .env.local`);
  return v;
}

const admin = createClient(exigirEnv("SUPABASE_URL"), exigirEnv("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
const anon = createClient(exigirEnv("SUPABASE_URL"), exigirEnv("SUPABASE_ANON_KEY"), { auth: { persistSession: false, autoRefreshToken: false } });
const SENHA = "Fixture#12345";
/** Prefixo reconhecível — `varrer-residuo-de-teste.ts` limpa por ele. */
const PREFIXO = "zz_e2e_ao_vivo";
const sha = (s: string) => createHash("sha256").update(s).digest("hex");

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

/** Cliente Supabase autenticado COMO a pessoa — as RPCs leem `auth.uid()`. */
async function clienteDe(email: string): Promise<SupabaseClient> {
  const { data, error } = await anon.auth.signInWithPassword({ email, password: SENHA });
  if (error || !data.session) throw new Error(`Falha ao logar ${email}: ${error?.message}`);
  return createClient(exigirEnv("SUPABASE_URL"), exigirEnv("SUPABASE_ANON_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${data.session.access_token}` } },
  });
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

  /* A recusa de assinatura só existe nos frames do WebSocket: o
     servidor responde `system` com `status: error`, o cliente não lança
     nada, e a página segue com cara de saudável. Foi assim que um canal
     morto sobreviveu meses. O payload pode vir como Buffer. */
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

async function limpar(): Promise<void> {
  for (const id of criados.campanhas) await admin.from("campaigns").delete().eq("id", id);
  for (const id of criados.usuarios) await admin.auth.admin.deleteUser(id).catch(() => {});
}

async function main(): Promise<void> {
  const narrador = await criarConta("narrador");
  const jogador = await criarConta("jogador");
  const campaignId = randomUUID();
  await admin.from("campaigns").insert({ id: campaignId, name: `${PREFIXO}_cena`, owner_id: narrador.id });
  criados.campanhas.push(campaignId);
  await admin.from("campaign_members").insert({
    campaign_id: campaignId, user_id: jogador.id, role: "player", status: "active",
  });
  const { data: cena } = await admin.from("vtt_scenes")
    .insert({ campaign_id: campaignId, nome: "Cena ao vivo", largura: 16, altura: 16 })
    .select("id").single();
  const sceneId = cena!.id as string;
  await admin.from("vtt_scene_presentation")
    .insert({ campaign_id: campaignId, presented_scene_id: sceneId, updated_by: narrador.id });

  const narradorApi = await clienteDe(narrador.email);

  const browser = await chromium.launch({ headless: true });
  let sessaoN: Sessao | null = null;
  let sessaoJ: Sessao | null = null;
  try {
    sessaoN = await abrirSessao(browser, narrador.email, campaignId);
    sessaoJ = await abrirSessao(browser, jogador.email, campaignId);
    registrar("0 (as duas sessões abrem na mesma mesa)", true, `campanha=${campaignId}`);

    await new Promise((r) => setTimeout(r, 4000)); // janela para o servidor responder às assinaturas
    registrar("1a (o narrador assina os canais sem recusa do servidor)",
      sessaoN.errosDeCanal.length === 0, sessaoN.errosDeCanal[0] ?? "nenhuma recusa");
    registrar("1b (o jogador assina os canais sem recusa do servidor)",
      sessaoJ.errosDeCanal.length === 0, sessaoJ.errosDeCanal[0] ?? "nenhuma recusa");

    await recolherPainelDaSessao(sessaoN.page);
    await recolherPainelDaSessao(sessaoJ.page);

    // ── 2. IMAGEM — a tabela do RT-01 ────────────────────────────
    // Pelo caminho real do servidor (reserva + finalização), que é o
    // que a interface chama depois de o arquivo subir. Um `insert`
    // direto pularia a RPC e provaria menos.
    {
      const { data: r, error: eRes } = await narradorApi.rpc("reservar_upload_vtt_imagem", {
        p_campaign_id: campaignId, p_sha256: sha(`fundo-${campaignId}`), p_intencao: "fundo", p_token_id: null,
      });
      if (eRes) throw new Error(`reserva de upload falhou: ${eRes.message}`);
      const reservaId = (r as { reserva_id: string } | null)?.reserva_id ?? null;
      const { error: eFim } = await narradorApi.rpc("finalizar_upload_e_criar_imagem_cena", {
        p_reserva_id: reservaId, p_bytes_reais: 50_000, p_width_px: 1024, p_height_px: 1024,
        p_scene_id: sceneId, p_papel: "fundo", p_centro_q: 6, p_centro_r: 6, p_largura_m: 8,
        p_altura_m: null, p_rotacao_graus: 0, p_opacidade: 1, p_camada: "abaixo_grade",
      });
      if (eFim) throw new Error(`finalizar upload falhou: ${eFim.message}`);

      const ms = await esperarAte(async () => (await sessaoJ!.page.locator(".rv-imagem-cena").count()) > 0);
      // ESTE CRITÉRIO REPROVOU NA PRIMEIRA EXECUÇÃO, e o defeito era de
      // produto: RT-03, corrigido pela migration 0147.
      //
      // `vtt_scene_images` tinha RLS ligada, ZERO políticas e nenhum
      // grant de select. O app lê a tabela por RPC `security definer`,
      // então o fechamento total nunca incomodou ninguém no caminho
      // normal — mas o Realtime entrega uma linha só se o assinante
      // puder SELECIONÁ-la sob RLS. Sem política, nenhuma linha era
      // entregue, nunca.
      //
      // O sintoma era mudo em todos os níveis: a assinatura era ACEITA
      // (`status: ok`), nenhum payload chegava, e depois de um reload a
      // imagem aparecia. Se voltar a falhar aqui, é por onde começar.
      registrar("2 (imagem colocada pelo narrador aparece para o jogador, sem reload)",
        ms !== null, ms !== null ? `${ms}ms` : "não chegou em 10s — conferir a política de SELECT de vtt_scene_images (RT-03)");
    }

    // ── 3. OBJETO ────────────────────────────────────────────────
    {
      // As células do objeto moram em TABELA PRÓPRIA (`vtt_object_cells`),
      // não numa coluna do objeto — um objeto ocupa quantas quiser.
      const { data: obj, error } = await admin.from("vtt_objects").insert({
        scene_id: sceneId, campaign_id: campaignId, nome: "Caixa ao vivo",
        preset: "personalizado", bloqueia_movimento: false, visivel: true, criador_id: narrador.id,
      }).select("id").single();
      if (error) throw new Error(`insert de objeto falhou: ${error.message}`);
      const { error: eCel } = await admin.from("vtt_object_cells")
        .insert([{ object_id: obj!.id, scene_id: sceneId, q: 3, r: 3 }]);
      if (eCel) throw new Error(`células do objeto falharam: ${eCel.message}`);
      const ms = await esperarAte(async () =>
        (await sessaoJ!.page.locator('.rv-camada-objetos .rv-objeto[aria-label="Caixa ao vivo"]').count()) > 0);
      registrar("3 (objeto criado pelo narrador aparece para o jogador, sem reload)",
        ms !== null, ms !== null ? `${ms}ms` : "não chegou em 10s");
    }

    // ── 4. MARCA ─────────────────────────────────────────────────
    {
      // A célula da marca vai em `pontos` — não há colunas q/r —, e o
      // texto vai em `sinal`.
      const { error } = await admin.from("vtt_marks").insert({
        id: randomUUID(), scene_id: sceneId, campaign_id: campaignId,
        tipo: "texto", sinal: "alvo", cor: "branco",
        pontos: [{ q: 5, r: 2 }], privada: false, autor_id: narrador.id,
      });
      if (error) throw new Error(`insert de marca falhou: ${error.message}`);
      const ms = await esperarAte(async () =>
        (await sessaoJ!.page.locator(".rv-camada-marcas .rv-marca-ping").count()) > 0);
      registrar("4 (marca do narrador aparece para o jogador, sem reload)",
        ms !== null, ms !== null ? `${ms}ms` : "não chegou em 10s");
    }

    // ── 5. RÉGUA FIXA ────────────────────────────────────────────
    // A régua permanente é a única das quatro que o jogador também
    // pode criar — aqui interessa o sentido narrador → jogador, que é
    // o de "medi isto para a mesa ver".
    {
      const { error } = await admin.from("vtt_measurements").insert({
        scene_id: sceneId, campaign_id: campaignId,
        pontos: [{ q: 1, r: 1 }, { q: 4, r: 1 }], privada: false, autor_id: narrador.id,
      });
      if (error) throw new Error(`insert de medição falhou: ${error.message}`);
      const ms = await esperarAte(async () =>
        (await sessaoJ!.page.locator(".rv-camada-medicoes-fixas .rv-medicao-fixa").count()) > 0);
      registrar("5 (régua fixa do narrador aparece para o jogador, sem reload)",
        ms !== null, ms !== null ? `${ms}ms` : "não chegou em 10s");
    }

    // ── 6. O CONTRÁRIO: o que está oculto NÃO pode chegar ─────────
    //
    // Os cinco critérios acima perguntam "chegou?". Este pergunta
    // "ficou onde devia?" — e é o mais caro de errar. O narrador
    // prepara a cena com coisas que a mesa ainda não pode ver; se elas
    // vazarem, ninguém percebe pelos dois lados: ele acha que escondeu,
    // e a pessoa já viu.
    //
    // A espera aqui é INVERTIDA: dar tempo de sobra e confirmar que
    // NADA apareceu. Esperar pouco passaria por verde sozinho.
    {
      const antes = await sessaoJ.page.locator(".rv-imagem-cena").count();
      const { error } = await admin.from("vtt_scene_images").insert({
        scene_id: sceneId, campaign_id: campaignId,
        image_id: (await admin.from("vtt_scene_images").select("image_id").eq("scene_id", sceneId).limit(1).single()).data!.image_id,
        papel: "tile", centro_q: 12, centro_r: 12, largura_m: 4, altura_m: 4,
        rotacao_graus: 0, opacidade: 1, camada: "acima_grade", z: 1,
        visivel: false, travado: false, criador_id: narrador.id,
      });
      if (error) throw new Error(`insert de imagem oculta falhou: ${error.message}`);

      // O narrador PRECISA vê-la — senão o critério passaria mesmo com
      // a imagem não tendo sido criada, e provaria nada.
      const chegouNoNarrador = await esperarAte(async () =>
        (await sessaoN!.page.locator(".rv-imagem-cena").count()) > antes);
      await new Promise((r) => setTimeout(r, 4000)); // folga generosa para um vazamento aparecer
      const depoisJogador = await sessaoJ.page.locator(".rv-imagem-cena").count();
      // As duas metades importam, e a primeira é que segura a segunda
      // honesta: enquanto o RT-03 estava de pé, "o jogador não viu" era
      // verdade por um motivo errado — ele não veria uma visível
      // tampouco. Exigir que o NARRADOR veja impede esse falso verde.
      registrar(
        "6 (imagem OCULTA chega ao narrador e NÃO vaza para o jogador)",
        chegouNoNarrador !== null && depoisJogador === antes,
        `narrador passou a ver=${chegouNoNarrador !== null}, jogador antes=${antes} depois=${depoisJogador}`,
      );
    }

    // ── 7. Nenhuma recusa durante a sessão inteira ───────────────
    const todasRecusas = [...sessaoN.errosDeCanal, ...sessaoJ.errosDeCanal];
    registrar("7 (nenhuma recusa de assinatura durante a sessão inteira)",
      todasRecusas.length === 0, todasRecusas[0] ?? "nenhuma");
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
  console.error("\ncheck-cena-ao-vivo FALHOU:\n", e instanceof Error ? e.message : e);
  await limpar().catch(() => {});
  process.exit(1);
});
