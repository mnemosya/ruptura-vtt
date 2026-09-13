/**
 * Dividir o grupo (0118), no banco — e sobretudo na AUTORIZAÇÃO.
 *
 * Esta é a primeira fase desde a 0112 a mexer em `vtt_pode_ver_cena` e
 * `vtt_pode_interagir_cena`. O risco não é "a atribuição não funciona":
 * é a atribuição funcionar e, de quebra, abrir ou fechar acesso onde
 * não devia. Por isso os critérios de acesso são testados pelo uso
 * REAL das tabelas (a RLS decidindo de verdade), não chamando os
 * predicados direto — chamar a função confirma que a função responde o
 * que ela responde, o que não é a pergunta.
 *
 * Uso: npx tsx scripts/dev/check-vtt-dividir-grupo.ts
 */

import { randomUUID } from "node:crypto";
import { config as loadDotenv } from "dotenv";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { exigirRpc } from "./rpcObrigatoria";
import { limparCampanhasDeTeste } from "./limparCampanhaDeTeste";

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

async function recusa(nome: string, chamada: PromiseLike<{ error: { message: string } | null }>, trecho: string) {
  const { error } = await chamada;
  if (!error) { criterio(nome, false, "ACEITOU"); return; }
  criterio(nome, error.message.includes(trecho), `mensagem foi "${error.message}"`);
}

/** Quantos tokens desta cena ESTE cliente enxerga — a RLS respondendo. */
async function tokensVisiveis(cliente: SupabaseClient, sceneId: string): Promise<number> {
  const { data } = await cliente.from("vtt_tokens").select("id").eq("scene_id", sceneId);
  return (data ?? []).length;
}

async function main() {
  const marca = Date.now();
  const senha = randomUUID();
  const contas: Record<string, string> = {};
  for (const papel of ["n", "a", "b"]) {
    const { data } = await admin.auth.admin.createUser({
      email: `check-dividir-${papel}-${marca}@ruptura.dev`, password: senha, email_confirm: true,
      user_metadata: { display_name: papel === "n" ? "Narradora" : papel === "a" ? "Alma" : "Bruno" },
    });
    contas[papel] = data!.user!.id;
  }
  const narradorId = contas.n, almaId = contas.a, brunoId = contas.b;

  const campaignId = randomUUID();
  await admin.from("campaigns").insert({ id: campaignId, name: "Dividir", owner_id: narradorId });
  await admin.from("campaign_members").insert([
    { campaign_id: campaignId, user_id: almaId, role: "player" },
    { campaign_id: campaignId, user_id: brunoId, role: "player" },
  ]);

  const { data: cenas } = await admin.from("vtt_scenes").insert([
    { campaign_id: campaignId, nome: "Praça", largura: 20, altura: 16, ordem: 0, ativa: true },
    { campaign_id: campaignId, nome: "Catacumbas", largura: 20, altura: 16, ordem: 1, ativa: false },
    { campaign_id: campaignId, nome: "Torre", largura: 20, altura: 16, ordem: 2, ativa: false },
  ]).select("id, nome");
  const praca = cenas!.find((c) => c.nome === "Praça")!.id as string;
  const catacumbas = cenas!.find((c) => c.nome === "Catacumbas")!.id as string;
  const torre = cenas!.find((c) => c.nome === "Torre")!.id as string;
  await admin.from("vtt_campaign_stage")
    .insert({ campaign_id: campaignId, presented_scene_id: praca, updated_by: narradorId });

  // Um token visível em cada cena, para a RLS ter o que revelar ou não.
  await admin.from("vtt_tokens").insert([
    { scene_id: praca, campaign_id: campaignId, nome: "Feirante", sigla: "FE", lado: "pn", tamanho: "medio", orientacao: 0, q: 2, r: 2, visivel: true },
    { scene_id: catacumbas, campaign_id: campaignId, nome: "Ossada", sigla: "OS", lado: "pn", tamanho: "medio", orientacao: 0, q: 3, r: 3, visivel: true },
    { scene_id: torre, campaign_id: campaignId, nome: "Sineiro", sigla: "SI", lado: "pn", tamanho: "medio", orientacao: 0, q: 4, r: 4, visivel: true },
  ]);

  const anon = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const comoSessao = async (papel: string) => {
    const { data } = await anon.auth.signInWithPassword({
      email: `check-dividir-${papel}-${marca}@ruptura.dev`, password: senha,
    });
    return createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${data!.session!.access_token}` } },
    });
  };
  const narrador = await comoSessao("n");
  const alma = await comoSessao("a");
  const bruno = await comoSessao("b");

  try {
    console.log("\n— O padrão: todo mundo no palco —");
    criterio("Alma vê a Praça", await tokensVisiveis(alma, praca) === 1);
    criterio("Alma NÃO vê as Catacumbas", await tokensVisiveis(alma, catacumbas) === 0);
    const { data: minhaAntes } = await alma.rpc("vtt_minha_cena", { p_campaign_id: campaignId });
    criterio("`vtt_minha_cena` devolve o palco", minhaAntes === praca);

    console.log("\n— Mandar a Alma para as Catacumbas —");
    const { data: movidos, error: eMover } = await narrador.rpc("move_players_to_scene", {
      p_campaign_id: campaignId, p_user_ids: [almaId], p_scene_id: catacumbas,
    });
    criterio("a RPC aceita", !eMover, eMover?.message ?? "");
    criterio("e conta uma atribuição", movidos === 1, `veio ${movidos}`);

    const { data: minhaDepois } = await alma.rpc("vtt_minha_cena", { p_campaign_id: campaignId });
    criterio("a cena dela passou a ser as Catacumbas", minhaDepois === catacumbas);
    criterio("Alma passa a VER as Catacumbas", await tokensVisiveis(alma, catacumbas) === 1);
    // O ponto de segurança da fase: sair do palco é PERDER o palco.
    criterio("e DEIXA de ver a Praça", await tokensVisiveis(alma, praca) === 0,
      "ela continuou enxergando a cena da mesa");
    criterio("o Bruno, sem atribuição, segue no palco",
      await tokensVisiveis(bruno, praca) === 1 && await tokensVisiveis(bruno, catacumbas) === 0);

    console.log("\n— Escrever só onde se está —");
    await recusa("Alma não cria marcação na Praça",
      alma.from("vtt_marks").insert({
        scene_id: praca, campaign_id: campaignId, autor_id: almaId,
        tipo: "texto", pontos: [{ q: 1, r: 1 }], texto: "oi", cor: "ambar", duracao: "persistente",
      }),
      "row-level security");
    const { error: eEscreve } = await alma.from("vtt_marks").insert({
      scene_id: catacumbas, campaign_id: campaignId, autor_id: almaId,
      tipo: "texto", pontos: [{ q: 1, r: 1 }], texto: "aqui", cor: "ambar", duracao: "persistente",
    });
    criterio("mas cria nas Catacumbas", !eEscreve, eEscreve?.message ?? "");

    console.log("\n— Apresentar não arrasta quem foi separado —");
    await exigirRpc("levar a mesa para a Torre", narrador.rpc("present_vtt_scene", {
      p_campaign_id: campaignId, p_scene_id: torre, p_expected_revision: null,
    }));
    const { data: almaAposPalco } = await alma.rpc("vtt_minha_cena", { p_campaign_id: campaignId });
    criterio("Alma continua nas Catacumbas", almaAposPalco === catacumbas);
    const { data: brunoAposPalco } = await bruno.rpc("vtt_minha_cena", { p_campaign_id: campaignId });
    criterio("Bruno acompanhou a mesa até a Torre", brunoAposPalco === torre);

    console.log("\n— O palco ALCANÇANDO quem foi separado (0119) —");
    // A invariante: uma linha de atribuição significa "esta pessoa não
    // está onde a mesa está". Levar a mesa até a cena dela torna a
    // frase falsa, e a linha tem que sumir — senão ela ficaria para
    // trás na PRÓXIMA apresentação, por uma decisão tomada antes, para
    // outra situação. Foi o caso que o check de interface montou sem
    // querer e que a 0118 deixava passar.
    await exigirRpc("levar a mesa até a cena da Alma", narrador.rpc("present_vtt_scene", {
      p_campaign_id: campaignId, p_scene_id: catacumbas, p_expected_revision: null,
    }));
    const { data: aposAlcance } = await admin.from("vtt_player_scene_assignments")
      .select("user_id").eq("campaign_id", campaignId);
    criterio("apresentar a cena de quem estava separado apaga a atribuição",
      (aposAlcance ?? []).length === 0, JSON.stringify(aposAlcance));
    await exigirRpc("devolver a mesa à Praça", narrador.rpc("present_vtt_scene", {
      p_campaign_id: campaignId, p_scene_id: praca, p_expected_revision: null,
    }));
    criterio("e a partir daí ela acompanha a mesa de novo",
      await tokensVisiveis(alma, praca) === 1);

    console.log("\n— Mandar para a cena do palco é reagrupar —");
    // Uma atribuição apontando para o palco pareceria inofensiva, e
    // prenderia a pessoa ali na próxima apresentação.
    //
    // O bloco não assume o estado que sobrou do anterior: separa a Alma
    // de novo e só então a manda para o palco, que neste ponto é a
    // Praça. Depender do que ficou de trás é como um critério passa a
    // testar a ordem dos blocos em vez da regra.
    await exigirRpc("separar a Alma", narrador.rpc("move_players_to_scene", {
      p_campaign_id: campaignId, p_user_ids: [almaId], p_scene_id: catacumbas,
    }));
    await exigirRpc("mandar a Alma para a cena do palco", narrador.rpc("move_players_to_scene", {
      p_campaign_id: campaignId, p_user_ids: [almaId], p_scene_id: praca,
    }));
    const { data: atribuicoes } = await admin.from("vtt_player_scene_assignments")
      .select("user_id").eq("campaign_id", campaignId);
    criterio("a atribuição foi REMOVIDA, não gravada",
      (atribuicoes ?? []).length === 0, JSON.stringify(atribuicoes));
    await exigirRpc("levar a mesa para a Torre", narrador.rpc("present_vtt_scene", {
      p_campaign_id: campaignId, p_scene_id: torre, p_expected_revision: null,
    }));
    const { data: almaLivre } = await alma.rpc("vtt_minha_cena", { p_campaign_id: campaignId });
    criterio("e ela volta a acompanhar a mesa", almaLivre === torre);
    await exigirRpc("devolver a mesa à Praça antes de reagrupar", narrador.rpc("present_vtt_scene", {
      p_campaign_id: campaignId, p_scene_id: praca, p_expected_revision: null,
    }));

    console.log("\n— Reagrupar —");
    await exigirRpc("separar os dois antes de reagrupar", narrador.rpc("move_players_to_scene", {
      p_campaign_id: campaignId, p_user_ids: [almaId, brunoId], p_scene_id: catacumbas,
    }));
    const { data: antesReagrupar } = await admin.from("vtt_player_scene_assignments")
      .select("user_id").eq("campaign_id", campaignId);
    criterio("os dois foram separados", (antesReagrupar ?? []).length === 2);
    const { data: reagrupados } = await narrador.rpc("regroup_vtt_players", { p_campaign_id: campaignId });
    criterio("reagrupar devolve a contagem", reagrupados === 2, `veio ${reagrupados}`);
    criterio("Alma voltou ao palco", await tokensVisiveis(alma, praca) === 1);
    criterio("Bruno também", await tokensVisiveis(bruno, praca) === 1);

    console.log("\n— Arquivar devolve quem estava lá —");
    await exigirRpc("separar a Alma antes de arquivar", narrador.rpc("move_players_to_scene", {
      p_campaign_id: campaignId, p_user_ids: [almaId], p_scene_id: catacumbas,
    }));
    await exigirRpc("arquivar as Catacumbas", narrador.rpc("archive_vtt_scene", { p_scene_id: catacumbas }));
    const { data: almaAposArquivo } = await alma.rpc("vtt_minha_cena", { p_campaign_id: campaignId });
    criterio("Alma não ficou presa na cena arquivada", almaAposArquivo === praca,
      `ficou em ${almaAposArquivo}`);
    await exigirRpc("restaurar as Catacumbas", narrador.rpc("restore_vtt_scene", { p_scene_id: catacumbas }));

    console.log("\n— Excluir a cena devolve por cascata —");
    await exigirRpc("separar a Alma antes de excluir", narrador.rpc("move_players_to_scene", {
      p_campaign_id: campaignId, p_user_ids: [almaId], p_scene_id: catacumbas,
    }));
    await exigirRpc("excluir as Catacumbas", narrador.rpc("delete_vtt_scene", {
      p_scene_id: catacumbas, p_nome_confirmacao: "Catacumbas",
    }));
    const { data: aposExcluir } = await admin.from("vtt_player_scene_assignments")
      .select("user_id").eq("campaign_id", campaignId);
    criterio("a atribuição saiu junto", (aposExcluir ?? []).length === 0);
    const { data: almaAposExcluir } = await alma.rpc("vtt_minha_cena", { p_campaign_id: campaignId });
    criterio("e Alma voltou ao palco", almaAposExcluir === praca);

    console.log("\n— Quem pode mandar —");
    await recusa("jogador não move ninguém",
      alma.rpc("move_players_to_scene", {
        p_campaign_id: campaignId, p_user_ids: [brunoId], p_scene_id: torre,
      }),
      "Só o narrador");
    await recusa("nem reagrupa",
      alma.rpc("regroup_vtt_players", { p_campaign_id: campaignId }),
      "Só o narrador");
    await recusa("narrador não manda quem não é da campanha",
      narrador.rpc("move_players_to_scene", {
        p_campaign_id: campaignId, p_user_ids: [randomUUID()], p_scene_id: torre,
      }),
      "não participa desta campanha");
    await recusa("nem para cena arquivada",
      (async () => {
        // A Torre PRECISA estar arquivada para a recusa significar o que
        // o caso diz. Se o arquivamento falhasse, a recusa viria por
        // outro motivo — ou não viria, e o caso reportaria "ACEITOU"
        // culpando a regra errada.
        await exigirRpc("arquivar a Torre", narrador.rpc("archive_vtt_scene", { p_scene_id: torre }));
        return narrador.rpc("move_players_to_scene", {
          p_campaign_id: campaignId, p_user_ids: [almaId], p_scene_id: torre,
        });
      })(),
      "cena arquivada");
    await exigirRpc("restaurar a Torre", narrador.rpc("restore_vtt_scene", { p_scene_id: torre }));

    console.log("\n— O que cada um enxerga das atribuições —");
    await exigirRpc("separar o Bruno", narrador.rpc("move_players_to_scene", {
      p_campaign_id: campaignId, p_user_ids: [brunoId], p_scene_id: torre,
    }));
    const { data: almaVeAtribuicoes } = await alma.from("vtt_player_scene_assignments")
      .select("user_id").eq("campaign_id", campaignId);
    criterio("Alma NÃO vê a atribuição do Bruno",
      (almaVeAtribuicoes ?? []).length === 0, JSON.stringify(almaVeAtribuicoes));
    const { data: brunoVeASua } = await bruno.from("vtt_player_scene_assignments")
      .select("user_id").eq("campaign_id", campaignId);
    criterio("Bruno vê a PRÓPRIA", (brunoVeASua ?? []).length === 1);

    const { data: posicoes } = await narrador.rpc("list_vtt_player_placements", { p_campaign_id: campaignId });
    const lista = posicoes as Record<string, unknown>[];
    criterio("o narrador vê os dois jogadores", lista.length === 2, JSON.stringify(lista));
    const doBruno = lista.find((x) => x.user_id === brunoId);
    const daAlma = lista.find((x) => x.user_id === almaId);
    criterio("com nome de verdade", doBruno?.nome === "Bruno", `veio "${doBruno?.nome}"`);
    criterio("Bruno aparece na Torre e marcado como atribuído",
      doBruno?.scene_id === torre && doBruno?.atribuido === true, JSON.stringify(doBruno));
    criterio("Alma aparece no palco e NÃO atribuída",
      daAlma?.scene_id === praca && daAlma?.atribuido === false, JSON.stringify(daAlma));
    const { data: listaJogador } = await alma.rpc("list_vtt_player_placements", { p_campaign_id: campaignId });
    criterio("o jogador recebe lista vazia",
      Array.isArray(listaJogador) && listaJogador.length === 0);

  } finally {
    // Ordem canônica e compartilhada — ver `limparCampanhaDeTeste.ts`.
    // Cada limpeza escrita à mão tinha uma ordem própria, e o schema
    // mudou por baixo de todas: FKs de palco e de imagem RECUSAM a
    // exclusão em vez de cascatear, e o erro sumia sem ninguém olhar.
    const { restos } = await limparCampanhasDeTeste(admin, {
      campanhas: [campaignId], usuarios: Object.values(contas),
    });
    criterio("Z (limpeza de fixtures)", restos.length === 0, restos.join("; "));
    // O resumo sai DEPOIS da limpeza: antes, ele afirmava "0 falhas"
    // sem saber o que a limpeza ia encontrar.
    console.log(`\n${passou} critérios ok, ${falhou} falhas`);
  }
  if (falhou > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
