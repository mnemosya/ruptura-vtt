/**
 * As quatro operações de ciclo de vida da cena (0116), no banco.
 *
 * Sem navegador: o que está sob teste aqui é a TRANSAÇÃO — o
 * remapeamento de ids, o que a duplicação se recusa a copiar, e as
 * recusas que impedem a campanha de ficar quebrada. Nada disso tem
 * tela, e uma verificação por clique só conseguiria olhar o resultado
 * de fora.
 *
 * Roda como o NARRADOR (sessão real, RPC pelo PostgREST), nunca com
 * service role: as RPCs são `security definer` e quase toda a regra
 * está no `auth.uid()` que elas leem. Testá-las com service role
 * testaria o corpo da função com a única checagem que importa
 * desativada.
 *
 * Uso: npx tsx scripts/dev/check-vtt-ciclo-cena.ts
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

/** Espera que a RPC RECUSE, e pela razão certa. */
async function recusa(nome: string, chamada: Promise<{ error: { message: string } | null }>, trecho: string) {
  const { error } = await chamada;
  if (!error) { criterio(nome, false, "a RPC ACEITOU"); return; }
  criterio(nome, error.message.includes(trecho), `mensagem foi "${error.message}"`);
}

async function main() {
  const email = `check-ciclo-${Date.now()}@ruptura.dev`;
  const senha = randomUUID();
  const { data: u } = await admin.auth.admin.createUser({
    email, password: senha, email_confirm: true, user_metadata: { display_name: "Narradora" },
  });
  const narradorId = u!.user!.id;
  const campaignId = randomUUID();
  await admin.from("campaigns").insert({ id: campaignId, name: "Ciclo da cena", owner_id: narradorId });

  const { data: cenas } = await admin.from("vtt_scenes").insert([
    { campaign_id: campaignId, nome: "Doca Norte", largura: 20, altura: 16, ordem: 0, ativa: true },
    { campaign_id: campaignId, nome: "Casa de Máquinas", largura: 24, altura: 18, ordem: 1, ativa: false },
  ]).select("id, nome");
  const doca = cenas!.find((c) => c.nome === "Doca Norte")!.id as string;
  const origem = cenas!.find((c) => c.nome === "Casa de Máquinas")!.id as string;
  await admin.from("vtt_campaign_stage")
    .insert({ campaign_id: campaignId, presented_scene_id: doca, updated_by: narradorId });

  // ── Conteúdo na cena de origem ──────────────────────────────────────
  const { data: tokens } = await admin.from("vtt_tokens").insert([
    { scene_id: origem, campaign_id: campaignId, nome: "Mara Venn", sigla: "MV", lado: "pj", tamanho: "medio", orientacao: 0, q: 3, r: 4, visivel: true },
    { scene_id: origem, campaign_id: campaignId, nome: "Sentinela", sigla: "#2", lado: "pn", tamanho: "medio", orientacao: 0, q: 6, r: 5, visivel: true },
  ]).select("id, nome");
  const tokenMara = tokens!.find((t) => t.nome === "Mara Venn")!.id as string;

  await admin.from("vtt_terrain").insert([
    { scene_id: origem, campaign_id: campaignId, q: 1, r: 1, tipo: "dificil" },
    { scene_id: origem, campaign_id: campaignId, q: 2, r: 1, tipo: "bloqueado" },
  ]);

  // Uma aura PRESA ao token: é o caso que o remapeamento existe pra
  // resolver, e o único em que copiar sem pensar cria duas cenas
  // dividindo estado.
  await admin.from("vtt_areas").insert([
    { scene_id: origem, campaign_id: campaignId, tipo: "aura", origem_q: 3, origem_r: 4, raio_m: 3, token_id: tokenMara, cor: "ciano", opacidade: 0.3, visivel: true, criador_id: narradorId },
    { scene_id: origem, campaign_id: campaignId, tipo: "esfera", origem_q: 8, origem_r: 8, raio_m: 4, cor: "roxo", opacidade: 0.3, visivel: true, criador_id: narradorId },
  ]);

  const { data: objetos, error: eObj } = await admin.from("vtt_objects").insert([
    { scene_id: origem, campaign_id: campaignId, nome: "Caixote", preset: "caixa", categoria: "media", pd: 10, pd_max: 10, visivel: true, criador_id: narradorId },
  ]).select("id");
  // O seed falha ALTO: um insert recusado em silêncio vira um critério
  // verde que não testou nada.
  if (eObj || !objetos?.length) throw new Error(`seed objetos: ${eObj?.message ?? "sem retorno"}`);
  await admin.from("vtt_object_cells").insert([
    { object_id: objetos![0].id, scene_id: origem, q: 10, r: 10 },
    { object_id: objetos![0].id, scene_id: origem, q: 11, r: 10 },
  ]);

  await admin.from("vtt_marks").insert([
    { scene_id: origem, campaign_id: campaignId, autor_id: narradorId, tipo: "texto", pontos: [{ q: 1, r: 2 }], texto: "fica", cor: "ambar", duracao: "persistente" },
    { scene_id: origem, campaign_id: campaignId, autor_id: narradorId, tipo: "texto", pontos: [{ q: 2, r: 2 }], texto: "some", cor: "ambar", duracao: "combate" },
  ]);
  await admin.from("vtt_measurements").insert([
    { scene_id: origem, campaign_id: campaignId, autor_id: narradorId, pontos: [{ q: 0, r: 0 }, { q: 3, r: 3 }], cor: "ciano" },
  ]);
  await admin.from("vtt_turn_tracks").insert([
    { scene_id: origem, campaign_id: campaignId, estado: { rodada: 3 }, updated_by: narradorId },
  ]);

  const anon = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: sessao } = await anon.auth.signInWithPassword({ email, password: senha });
  const narrador: SupabaseClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${sessao!.session!.access_token}` } },
  });

  try {
    console.log("\n— Duplicar (completa) —");
    const { data: copiaRaw, error: eDup } = await narrador.rpc("duplicate_vtt_scene", {
      p_scene_id: origem, p_nome: null, p_modo: "completa",
    });
    if (eDup) throw new Error(`duplicar: ${eDup.message}`);
    const copia = (Array.isArray(copiaRaw) ? copiaRaw[0] : copiaRaw) as Record<string, unknown>;
    const copiaId = copia.id as string;
    criterio("a cópia nasce com nome derivado", copia.nome === "Casa de Máquinas (cópia)", `veio "${copia.nome}"`);
    criterio("guarda de quem veio", copia.duplicated_from_id === origem);
    criterio("não nasce apresentada", copia.ativa === false);
    criterio("herda as dimensões", copia.largura === 24 && copia.altura === 18);
    criterio("entra no fim do catálogo", (copia.ordem as number) === 2);

    const contar = async (tabela: string, sceneId: string) =>
      (await admin.from(tabela).select("*", { count: "exact", head: true }).eq("scene_id", sceneId)).count ?? 0;

    criterio("copiou os tokens", await contar("vtt_tokens", copiaId) === 2);
    criterio("copiou o terreno", await contar("vtt_terrain", copiaId) === 2);
    criterio("copiou as áreas", await contar("vtt_areas", copiaId) === 2);
    criterio("copiou os objetos", await contar("vtt_objects", copiaId) === 1);
    criterio("copiou as células do objeto", await contar("vtt_object_cells", copiaId) === 2);

    console.log("\n— O que a duplicação RECUSA copiar —");
    criterio("a trilha de turnos NÃO veio", await contar("vtt_turn_tracks", copiaId) === 0);
    criterio("as medições NÃO vieram", await contar("vtt_measurements", copiaId) === 0);
    const { data: marcasCopia } = await admin.from("vtt_marks").select("texto, duracao").eq("scene_id", copiaId);
    criterio("só a marcação persistente veio",
      marcasCopia?.length === 1 && marcasCopia[0].texto === "fica",
      JSON.stringify(marcasCopia));

    console.log("\n— O remapeamento —");
    const { data: tokensCopia } = await admin.from("vtt_tokens").select("id, nome").eq("scene_id", copiaId);
    const idsOrigem = new Set(tokens!.map((t) => t.id as string));
    criterio("os tokens da cópia têm ids NOVOS",
      (tokensCopia ?? []).every((t) => !idsOrigem.has(t.id as string)));

    const maraCopia = tokensCopia!.find((t) => t.nome === "Mara Venn")!.id as string;
    const { data: aurasCopia } = await admin.from("vtt_areas")
      .select("tipo, token_id").eq("scene_id", copiaId).eq("tipo", "aura");
    criterio("a aura aponta para o token DA CÓPIA, não o do original",
      aurasCopia?.[0]?.token_id === maraCopia,
      `apontou ${aurasCopia?.[0]?.token_id}, esperado ${maraCopia} (original era ${tokenMara})`);

    const { data: objCopia } = await admin.from("vtt_objects").select("id").eq("scene_id", copiaId);
    const { data: celulasCopia } = await admin.from("vtt_object_cells").select("object_id").eq("scene_id", copiaId);
    criterio("as células apontam para o objeto DA CÓPIA",
      (celulasCopia ?? []).every((c) => c.object_id === objCopia![0].id));

    console.log("\n— O original fica intacto —");
    criterio("o original manteve seus tokens", await contar("vtt_tokens", origem) === 2);
    const { data: auraOriginal } = await admin.from("vtt_areas")
      .select("token_id").eq("scene_id", origem).eq("tipo", "aura");
    criterio("a aura do original continua no token do original",
      auraOriginal?.[0]?.token_id === tokenMara);
    criterio("o original manteve a trilha", await contar("vtt_turn_tracks", origem) === 1);

    console.log("\n— Duplicar (só mapa) —");
    const { data: soMapaRaw } = await narrador.rpc("duplicate_vtt_scene", {
      p_scene_id: origem, p_nome: "Só o cenário", p_modo: "mapa",
    });
    const soMapa = (Array.isArray(soMapaRaw) ? soMapaRaw[0] : soMapaRaw) as Record<string, unknown>;
    const soMapaId = soMapa.id as string;
    criterio("aceita nome explícito", soMapa.nome === "Só o cenário");
    criterio("levou o terreno", await contar("vtt_terrain", soMapaId) === 2);
    criterio("NÃO levou tokens", await contar("vtt_tokens", soMapaId) === 0);
    criterio("NÃO levou áreas", await contar("vtt_areas", soMapaId) === 0);
    criterio("NÃO levou objetos", await contar("vtt_objects", soMapaId) === 0);

    await recusa("modo desconhecido é recusado",
      narrador.rpc("duplicate_vtt_scene", { p_scene_id: origem, p_nome: null, p_modo: "tudo" }),
      "Modo de duplicação desconhecido");

    console.log("\n— Arquivar —");
    await recusa("não arquiva a cena apresentada",
      narrador.rpc("archive_vtt_scene", { p_scene_id: doca }),
      "apresentada aos jogadores");

    const { error: eArq } = await narrador.rpc("archive_vtt_scene", { p_scene_id: soMapaId });
    criterio("arquiva uma cena comum", !eArq, eArq?.message ?? "");
    const { data: arquivada } = await admin.from("vtt_scenes").select("archived_at").eq("id", soMapaId).single();
    criterio("gravou archived_at", arquivada?.archived_at !== null);

    // O congelamento é da 0115, não desta migration — mas é ele que dá
    // sentido a arquivar, então vale confirmar que os dois se encontram.
    await recusa("cena arquivada não aceita escrita",
      narrador.from("vtt_terrain").insert({ scene_id: soMapaId, campaign_id: campaignId, q: 5, r: 5, tipo: "dificil" }),
      "arquivada");

    const { error: eRes } = await narrador.rpc("restore_vtt_scene", { p_scene_id: soMapaId });
    criterio("restaura", !eRes, eRes?.message ?? "");
    const { data: restaurada } = await admin.from("vtt_scenes").select("archived_at").eq("id", soMapaId).single();
    criterio("limpou archived_at", restaurada?.archived_at === null);

    console.log("\n— Excluir —");
    await recusa("recusa confirmação errada",
      narrador.rpc("delete_vtt_scene", { p_scene_id: soMapaId, p_nome_confirmacao: "nome errado" }),
      "confirmação não corresponde");
    await recusa("não exclui a cena apresentada",
      narrador.rpc("delete_vtt_scene", { p_scene_id: doca, p_nome_confirmacao: "Doca Norte" }),
      "apresentada aos jogadores");

    const { error: eDel } = await narrador.rpc("delete_vtt_scene", {
      p_scene_id: soMapaId, p_nome_confirmacao: "Só o cenário",
    });
    criterio("exclui com o nome certo", !eDel, eDel?.message ?? "");
    criterio("a cena sumiu",
      (await admin.from("vtt_scenes").select("id").eq("id", soMapaId).maybeSingle()).data === null);
    criterio("o conteúdo dela saiu em cascata", await contar("vtt_terrain", soMapaId) === 0);

    await narrador.rpc("delete_vtt_scene", { p_scene_id: copiaId, p_nome_confirmacao: "Casa de Máquinas (cópia)" });
    await narrador.rpc("delete_vtt_scene", { p_scene_id: origem, p_nome_confirmacao: "Casa de Máquinas" });

    console.log("\n— A última cena utilizável —");
    // Esta guarda precisa de uma campanha SEM palco pra ser alcançada, e
    // isso não é detalhe de teste: é uma propriedade do desenho. A cena
    // apresentada não pode ser arquivada, logo ela conta sempre como
    // utilizável, logo excluir qualquer OUTRA sempre deixa pelo menos
    // ela. Numa campanha com palco, a guarda da última é inalcançável —
    // a da apresentada dispara antes, sempre.
    //
    // A primeira versão deste critério apontava para a cena apresentada
    // e conferia a mensagem da OUTRA guarda: verde sem ter testado nada.
    const campanhaSemPalco = randomUUID();
    await admin.from("campaigns")
      .insert({ id: campanhaSemPalco, name: "Sem palco", owner_id: narradorId });
    const { data: unica } = await admin.from("vtt_scenes").insert({
      campaign_id: campanhaSemPalco, nome: "Única", largura: 10, altura: 10, ordem: 0, ativa: false,
    }).select("id").single();
    try {
      await recusa("não exclui a última cena utilizável",
        narrador.rpc("delete_vtt_scene", { p_scene_id: unica!.id, p_nome_confirmacao: "Única" }),
        "última cena utilizável");

      // E com uma segunda cena, a mesma exclusão passa — a guarda é
      // sobre ser a última, não sobre a cena em si.
      await admin.from("vtt_scenes").insert({
        campaign_id: campanhaSemPalco, nome: "Companhia", largura: 10, altura: 10, ordem: 1, ativa: false,
      });
      const { error: eAgora } = await narrador.rpc("delete_vtt_scene", {
        p_scene_id: unica!.id, p_nome_confirmacao: "Única",
      });
      criterio("com uma segunda cena, a mesma exclusão passa", !eAgora, eAgora?.message ?? "");
    } finally {
      await admin.from("vtt_scenes").delete().eq("campaign_id", campanhaSemPalco);
      await admin.from("campaigns").delete().eq("id", campanhaSemPalco);
    }

    console.log(`\n${passou} critérios ok, ${falhou} falhas`);
  } finally {
    await admin.from("table_logs").delete().eq("campaign_id", campaignId);
    await admin.from("vtt_campaign_stage").delete().eq("campaign_id", campaignId);
    await admin.from("vtt_scenes").delete().eq("campaign_id", campaignId);
    await admin.from("campaigns").delete().eq("id", campaignId);
    await admin.auth.admin.deleteUser(narradorId);
    console.log("limpeza ok");
  }
  if (falhou > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
