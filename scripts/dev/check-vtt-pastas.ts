/**
 * As pastas do catálogo (0117), no banco.
 *
 * O que está sob teste aqui é o que a interface não consegue mostrar
 * errado de forma visível: ciclo, profundidade e o que acontece com o
 * conteúdo quando a pasta some. São regras de grafo, e grafo se testa
 * construindo o caso ruim de propósito.
 *
 * Roda como NARRADOR de verdade (sessão real): as RPCs são
 * `security definer` e a regra está no `auth.uid()` que elas leem.
 *
 * Uso: npx tsx scripts/dev/check-vtt-pastas.ts
 */

import { randomUUID } from "node:crypto";
import { config as loadDotenv } from "dotenv";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

loadDotenv({ path: ".env.local" });

function requireEnv(nome: string): string {
  const v = process.env[nome];
  if (!v) { console.error(`Variável de ambiente ausente: ${nome}`); process.exit(1); }
  return v;
}
const supabaseUrl = requireEnv("SUPABASE_URL");
const anonKey = requireEnv("SUPABASE_ANON_KEY");
const admin = createClient(supabaseUrl, requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false, autoRefreshToken: false },
});

let passou = 0;
let falhou = 0;
function criterio(nome: string, ok: boolean, detalhe = "") {
  if (ok) { passou++; console.log(`  ok   ${nome}`); }
  else { falhou++; console.log(`  FALHA ${nome}${detalhe ? ` — ${detalhe}` : ""}`); }
}

// `PromiseLike`: os builders do supabase-js são thenables, não promises.
async function recusa(nome: string, chamada: PromiseLike<{ error: { message: string } | null }>, trecho: string) {
  const { error } = await chamada;
  if (!error) { criterio(nome, false, "a RPC ACEITOU"); return; }
  criterio(nome, error.message.includes(trecho), `mensagem foi "${error.message}"`);
}

async function main() {
  const email = `check-pastas-${Date.now()}@ruptura.dev`;
  const senha = randomUUID();
  const { data: u } = await admin.auth.admin.createUser({
    email, password: senha, email_confirm: true, user_metadata: { display_name: "Narradora" },
  });
  const narradorId = u!.user!.id;
  const campaignId = randomUUID();
  await admin.from("campaigns").insert({ id: campaignId, name: "Pastas", owner_id: narradorId });

  const { data: cenas } = await admin.from("vtt_scenes").insert([
    { campaign_id: campaignId, nome: "Doca Norte", largura: 20, altura: 16, ordem: 0, ativa: true },
    { campaign_id: campaignId, nome: "Casa de Máquinas", largura: 20, altura: 16, ordem: 1, ativa: false },
  ]).select("id, nome");
  const doca = cenas!.find((c) => c.nome === "Doca Norte")!.id as string;
  const maquinas = cenas!.find((c) => c.nome === "Casa de Máquinas")!.id as string;
  await admin.from("vtt_campaign_stage")
    .insert({ campaign_id: campaignId, presented_scene_id: doca, updated_by: narradorId });

  const anon = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: sessao } = await anon.auth.signInWithPassword({ email, password: senha });
  const narrador: SupabaseClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${sessao!.session!.access_token}` } },
  });

  const criarPasta = async (nome: string, pai: string | null = null) => {
    const { data, error } = await narrador.rpc("create_vtt_scene_folder", {
      p_campaign_id: campaignId, p_nome: nome, p_parent_id: pai,
    });
    if (error) throw new Error(`criar pasta "${nome}": ${error.message}`);
    return ((Array.isArray(data) ? data[0] : data) as Record<string, unknown>).id as string;
  };

  try {
    console.log("\n— Criar —");
    const n1 = await criarPasta("Ato I");
    criterio("cria pasta na raiz", typeof n1 === "string");
    const n2 = await criarPasta("Porto", n1);
    const n3 = await criarPasta("Subterrâneo", n2);
    criterio("cria até o terceiro nível", typeof n3 === "string");
    const n4 = await criarPasta("Esgotos", n3);
    criterio("e o quarto", typeof n4 === "string");

    await recusa("recusa o QUINTO nível",
      narrador.rpc("create_vtt_scene_folder", {
        p_campaign_id: campaignId, p_nome: "Fundo do poço", p_parent_id: n4,
      }),
      "quatro níveis");

    await recusa("recusa nome em branco",
      narrador.rpc("create_vtt_scene_folder", {
        p_campaign_id: campaignId, p_nome: "   ", p_parent_id: null,
      }),
      "precisa de um nome");

    console.log("\n— Ciclo —");
    await recusa("uma pasta não pode ser mãe de si mesma",
      narrador.rpc("move_vtt_scene_folder", { p_folder_id: n1, p_novo_parent_id: n1 }),
      "mãe de si mesma");
    await recusa("nem entrar na própria descendente",
      narrador.rpc("move_vtt_scene_folder", { p_folder_id: n1, p_novo_parent_id: n3 }),
      "dentro dela mesma");

    console.log("\n— Profundidade da SUBÁRVORE —");
    // `Ato I` tem altura 4 (Ato I > Porto > Subterrâneo > Esgotos).
    // Movê-la para dentro de qualquer pasta empurraria os netos pro
    // quinto nível. Conferir só o pai deixaria passar — é o caso que o
    // gatilho existe pra pegar.
    const outraRaiz = await criarPasta("Ato II");
    await recusa("mover uma pasta ALTA para dentro de outra é recusado",
      narrador.rpc("move_vtt_scene_folder", { p_folder_id: n1, p_novo_parent_id: outraRaiz }),
      "quatro níveis");

    // A folha, por outro lado, cabe: altura 1 + pai nível 1 = 2.
    const { error: eFolha } = await narrador.rpc("move_vtt_scene_folder", {
      p_folder_id: n4, p_novo_parent_id: outraRaiz,
    });
    criterio("mover uma FOLHA para o mesmo lugar é aceito", !eFolha, eFolha?.message ?? "");

    console.log("\n— Cenas dentro de pastas —");
    const { error: eMover } = await narrador.rpc("move_vtt_scene_to_folder", {
      p_scene_id: maquinas, p_folder_id: n2,
    });
    criterio("move a cena para a pasta", !eMover, eMover?.message ?? "");
    const { data: cenaNaPasta } = await admin.from("vtt_scenes").select("folder_id").eq("id", maquinas).single();
    criterio("o banco registrou a pasta", cenaNaPasta?.folder_id === n2);

    const { data: catalogo } = await narrador.rpc("list_vtt_scenes", {
      p_campaign_id: campaignId, p_incluir_arquivadas: false,
    });
    const daLista = (catalogo as Record<string, unknown>[]).find((c) => c.id === maquinas);
    criterio("o catálogo devolve a pasta de cada cena", daLista?.pasta_id === n2, JSON.stringify(daLista?.pasta_id));

    console.log("\n— O caminho montado —");
    const { data: pastas } = await narrador.rpc("list_vtt_scene_folders", { p_campaign_id: campaignId });
    const lista = pastas as Record<string, unknown>[];
    const sub = lista.find((f) => f.id === n3);
    criterio("o caminho vem pronto do banco",
      sub?.caminho === "Ato I / Porto / Subterrâneo", `veio "${sub?.caminho}"`);
    criterio("com o nível junto", sub?.nivel === 3, `veio ${sub?.nivel}`);

    console.log("\n— Apagar pasta não apaga cena —");
    // `Porto` tem a Casa de Máquinas dentro e `Subterrâneo` como filha.
    const { error: eDel } = await narrador.rpc("delete_vtt_scene_folder", { p_folder_id: n2 });
    criterio("apaga a pasta", !eDel, eDel?.message ?? "");
    const { data: cenaSobreviveu } = await admin.from("vtt_scenes")
      .select("id, folder_id").eq("id", maquinas).maybeSingle();
    criterio("a CENA sobreviveu", cenaSobreviveu !== null);
    criterio("e subiu para a pasta-mãe", cenaSobreviveu?.folder_id === n1,
      `ficou em ${cenaSobreviveu?.folder_id}, esperado ${n1}`);
    const { data: subpasta } = await admin.from("vtt_scene_folders")
      .select("parent_id").eq("id", n3).maybeSingle();
    criterio("a subpasta também subiu", subpasta?.parent_id === n1);

    console.log("\n— Quem não é narrador —");
    const emailJog = `check-pastas-jog-${Date.now()}@ruptura.dev`;
    const { data: uJ } = await admin.auth.admin.createUser({
      email: emailJog, password: senha, email_confirm: true, user_metadata: { display_name: "Jogador" },
    });
    await admin.from("campaign_members")
      .insert({ campaign_id: campaignId, user_id: uJ!.user!.id, role: "player" });
    const { data: sJ } = await anon.auth.signInWithPassword({ email: emailJog, password: senha });
    const jogador = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${sJ!.session!.access_token}` } },
    });

    const { data: pastasJog } = await jogador.rpc("list_vtt_scene_folders", { p_campaign_id: campaignId });
    criterio("o jogador recebe lista VAZIA, não erro",
      Array.isArray(pastasJog) && pastasJog.length === 0, JSON.stringify(pastasJog));
    const { data: pastasDiretas } = await jogador.from("vtt_scene_folders").select("id").eq("campaign_id", campaignId);
    criterio("e a RLS também não deixa ler direto",
      (pastasDiretas ?? []).length === 0, JSON.stringify(pastasDiretas));
    await recusa("nem criar pasta",
      jogador.rpc("create_vtt_scene_folder", {
        p_campaign_id: campaignId, p_nome: "Minha pasta", p_parent_id: null,
      }),
      "Só o narrador");

    console.log(`\n${passou} critérios ok, ${falhou} falhas`);
  } finally {
    await admin.from("table_logs").delete().eq("campaign_id", campaignId);
    await admin.from("vtt_campaign_stage").delete().eq("campaign_id", campaignId);
    await admin.from("vtt_scenes").delete().eq("campaign_id", campaignId);
    await admin.from("vtt_scene_folders").delete().eq("campaign_id", campaignId);
    await admin.from("campaign_members").delete().eq("campaign_id", campaignId);
    await admin.from("campaigns").delete().eq("id", campaignId);
    const { data: sobras } = await admin.auth.admin.listUsers();
    for (const usr of sobras?.users ?? []) {
      if (usr.email?.startsWith("check-pastas-")) await admin.auth.admin.deleteUser(usr.id);
    }
    console.log("limpeza ok");
  }
  if (falhou > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
