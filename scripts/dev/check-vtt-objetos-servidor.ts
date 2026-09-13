/**
 * Fiscalização de OBJETOS TÁTICOS no SERVIDOR (migration 0085).
 *
 * O ponto central: um objeto que bloqueia precisa produzir exatamente o
 * MESMO fato mecânico que uma célula pintada de "bloqueado" — nem mais,
 * nem menos. Concretamente:
 *   • criação/edição/posicionamento (`vtt_validar_pegada_em`) recusam;
 *   • `rotacionar_vtt_token` recusa;
 *   • `move_vtt_token` NÃO recusa — deslocar token já existente segue
 *     CONSULTIVO, como a 0080 estabeleceu de propósito. Este é o teste
 *     que impede alguém "consertar" isso por engano no futuro.
 *   • objeto OCULTO bloqueia igual (D6);
 *   • objeto que não bloqueia (entulho) não bloqueia.
 *
 * Roda contra o banco real, como usuário AUTENTICADO de verdade (as RPCs
 * são `security definer` e checam participação na campanha).
 *
 * Uso: npx tsx scripts/dev/check-vtt-objetos-servidor.ts
 */

import { randomUUID } from "node:crypto";
import { config as loadDotenv } from "dotenv";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

loadDotenv({ path: ".env.local" });
function req(n: string): string {
  const v = process.env[n];
  if (!v) { console.error(`Variável ausente: ${n}`); process.exit(1); }
  return v;
}
import { limparCampanhasDeTeste } from "./limparCampanhaDeTeste";

const admin = createClient(req("SUPABASE_URL"), req("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false, autoRefreshToken: false },
});

let passou = 0, falhou = 0;
function ok(criterio: string, cond: boolean, detalhe: string) {
  if (cond) { passou++; console.log(`ok - ${criterio}: ${detalhe}`); }
  else { falhou++; console.error(`FALHA - ${criterio}: ${detalhe}`); }
}

/** Executa e devolve a mensagem de erro (ou null se passou). */
async function erroDe(p: PromiseLike<{ error: { message: string } | null }>): Promise<string | null> {
  const { error } = await p;
  return error ? error.message : null;
}

const criados = { usuarios: [] as string[], campanhas: [] as string[] };

async function main() {
  // ── Fixture ──────────────────────────────────────────────────────
  const email = `check-objetos-${Date.now()}@ruptura.dev`;
  const senha = randomUUID();
  const { data: u, error: eU } = await admin.auth.admin.createUser({ email, password: senha, email_confirm: true });
  if (eU) throw new Error(eU.message);
  criados.usuarios.push(u.user.id);

  const campaignId = randomUUID();
  await admin.from("campaigns").insert({ id: campaignId, name: "Objetos Táticos", owner_id: u.user.id });
  criados.campanhas.push(campaignId);
  const { data: cena } = await admin.from("vtt_scenes")
    .insert({ campaign_id: campaignId, nome: "Cena Objetos", largura: 24, altura: 20 })
    .select("id").single();
  const sceneId = cena!.id as string;

  const anon = createClient(req("SUPABASE_URL"), req("SUPABASE_ANON_KEY"), { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: sess, error: eS } = await anon.auth.signInWithPassword({ email, password: senha });
  if (eS) throw new Error(eS.message);
  const cli: SupabaseClient = createClient(req("SUPABASE_URL"), req("SUPABASE_ANON_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${sess.session!.access_token}` } },
  });

  async function criarObjeto(params: {
    nome: string; celulas: { q: number; r: number }[]; bloqueia: boolean;
    visivel?: boolean; terrenoProjetado?: "dificil" | null;
  }) {
    const { data, error } = await admin.from("vtt_objects").insert({
      scene_id: sceneId, campaign_id: campaignId, nome: params.nome, preset: "personalizado",
      bloqueia_movimento: params.bloqueia, terreno_projetado: params.terrenoProjetado ?? null,
      visivel: params.visivel ?? true, criador_id: u.user!.id,
    }).select("id").single();
    if (error) throw new Error(`criarObjeto(${params.nome}): ${error.message}`);
    const objectId = data!.id as string;
    const { error: eC } = await admin.from("vtt_object_cells")
      .insert(params.celulas.map((c) => ({ object_id: objectId, scene_id: sceneId, q: c.q, r: c.r })));
    if (eC) throw new Error(`células(${params.nome}): ${eC.message}`);
    return objectId;
  }

  /** Argumentos completos de `create_vtt_token` — assinatura real (18 params). */
  function novoToken(p: { nome: string; sigla: string; q: number; r: number; tamanho?: string }) {
    return {
      p_scene_id: sceneId, p_campaign_id: campaignId, p_nome: p.nome, p_sigla: p.sigla,
      p_lado: "pn", p_vertente: "ferro", p_tamanho: p.tamanho ?? "medio", p_orientacao: 0,
      p_pegada_personalizada: null, p_q: p.q, p_r: p.r, p_character_id: null,
      p_visivel: true, p_bloqueado: false, p_retrato_url: null,
      p_pv_atual: null, p_pv_max: null, p_condicoes: [],
    };
  }

  // ── 1. Helper de precedência ─────────────────────────────────────
  await criarObjeto({ nome: "Muro", celulas: [{ q: 5, r: 5 }, { q: 6, r: 5 }], bloqueia: true });
  {
    const { data } = await admin.rpc("vtt_celula_bloqueada", { p_scene_id: sceneId, p_q: 5, p_r: 5 });
    ok("1 (objeto bloqueador marca a célula como bloqueada)", data === true, `${data}`);
    const { data: livre } = await admin.rpc("vtt_celula_bloqueada", { p_scene_id: sceneId, p_q: 9, p_r: 9 });
    ok("2 (célula sem objeto nem terreno continua livre)", livre === false, `${livre}`);
  }

  // ── 2. Entulho: não bloqueia ─────────────────────────────────────
  await criarObjeto({ nome: "Entulho", celulas: [{ q: 8, r: 5 }], bloqueia: false, terrenoProjetado: "dificil" });
  {
    const { data } = await admin.rpc("vtt_celula_bloqueada", { p_scene_id: sceneId, p_q: 8, p_r: 5 });
    ok("3 (objeto que NÃO bloqueia não marca a célula)", data === false, `${data}`);
  }

  // ── 3. Objeto oculto bloqueia igual (D6) ─────────────────────────
  await criarObjeto({ nome: "Parede secreta", celulas: [{ q: 12, r: 7 }], bloqueia: true, visivel: false });
  {
    const { data } = await admin.rpc("vtt_celula_bloqueada", { p_scene_id: sceneId, p_q: 12, p_r: 7 });
    ok("4 (objeto OCULTO continua bloqueando — esconder não é licença pra atravessar)", data === true, `${data}`);
  }

  // ── 4. Criação de token recusada pelo SERVIDOR ───────────────────
  {
    const msg = await erroDe(cli.rpc("create_vtt_token", novoToken({ nome: "Intruso", sigla: "IN", q: 5, r: 5 })) as PromiseLike<{ error: { message: string } | null }>);
    ok("5 (criar token EM CIMA de objeto bloqueador é recusado pelo servidor)",
      msg !== null && /bloquead/i.test(msg), msg ?? "aceitou (FALHA)");
  }
  {
    const msg = await erroDe(cli.rpc("create_vtt_token", novoToken({ nome: "Sobre entulho", sigla: "SE", q: 8, r: 5 })) as PromiseLike<{ error: { message: string } | null }>);
    ok("6 (criar token sobre ENTULHO é permitido — não bloqueia)", msg === null, msg ?? "aceito");
  }
  {
    const msg = await erroDe(cli.rpc("create_vtt_token", novoToken({ nome: "Oculto", sigla: "OC", q: 12, r: 7 })) as PromiseLike<{ error: { message: string } | null }>);
    ok("7 (objeto oculto também recusa criação, sem revelar que é objeto)",
      msg !== null && /bloquead/i.test(msg), msg ?? "aceitou (FALHA)");
  }

  // ── 5. Movimento continua CONSULTIVO (correção do plano) ─────────
  const { data: tok } = await admin.from("vtt_tokens").insert({
    scene_id: sceneId, campaign_id: campaignId, character_id: null, nome: "Andarilho",
    sigla: "AN", lado: "pn", tamanho: "medio", orientacao: 0, q: 3, r: 5, visivel: true,
  }).select("id, revision").single();
  {
    // Rota 3,5 → 4,5 → 5,5 : a última célula tem o muro.
    const msg = await erroDe(cli.rpc("move_vtt_token", {
      p_token_id: tok!.id, p_rota: [{ q: 3, r: 5 }, { q: 4, r: 5 }, { q: 5, r: 5 }],
      p_expected_revision: tok!.revision,
    }) as PromiseLike<{ error: { message: string } | null }>);
    ok("8 (mover token ATRAVÉS de objeto bloqueador NÃO é recusado — segue consultivo, como a 0080 decidiu)",
      msg === null, msg ?? "permitido");
  }

  // ── 6. Rotação recusada ──────────────────────────────────────────
  {
    // Token Grande na origem, com objeto numa célula que a rotação alcança.
    const { data: grande } = await admin.from("vtt_tokens").insert({
      scene_id: sceneId, campaign_id: campaignId, character_id: null, nome: "Girador",
      sigla: "GI", lado: "pn", tamanho: "grande", orientacao: 0, q: 15, r: 10, visivel: true,
    }).select("id, revision").single();

    // Descobre empiricamente uma orientação cujas células incluam uma
    // vizinha livre; põe objeto lá e tenta girar pra ela.
    const { data: celulas } = await cli.rpc("vtt_pegada_celulas", {
      p_tamanho: "grande", p_orientacao: 2, p_pegada_personalizada: null, p_ancora_q: 15, p_ancora_r: 10,
    });
    const alvo = (celulas as { q: number; r: number }[]).find((c) => !(c.q === 15 && c.r === 10));
    await criarObjeto({ nome: "Coluna", celulas: [alvo!], bloqueia: true });

    const msg = await erroDe(cli.rpc("rotacionar_vtt_token", {
      p_token_id: grande!.id, p_orientacao: 2, p_expected_revision: grande!.revision,
    }) as PromiseLike<{ error: { message: string } | null }>);
    ok("9 (rotacionar PARA CIMA de objeto bloqueador é recusado pelo servidor)",
      msg !== null && /indispon/i.test(msg), msg ?? "aceitou (FALHA)");

    const { data: depois } = await admin.from("vtt_tokens").select("orientacao").eq("id", grande!.id).single();
    ok("10 (a orientação persistida não mudou após a recusa)", depois!.orientacao === 0, `${depois!.orientacao}`);
  }

  // ── 7. Leitura projetada ─────────────────────────────────────────
  {
    const { data, error } = await cli.rpc("read_vtt_scene_objects", { p_scene_id: sceneId });
    ok("11 (narrador lê os objetos da cena com as células agregadas)",
      !error && Array.isArray(data) && data.length >= 4, error?.message ?? `${(data as unknown[])?.length} objetos`);
    const muro = (data as { nome: string; celulas: unknown[] }[])?.find((o) => o.nome === "Muro");
    ok("12 (o objeto traz as células que ocupa)", muro?.celulas?.length === 2, `${muro?.celulas?.length}`);
    const oculto = (data as { nome: string }[])?.find((o) => o.nome === "Parede secreta");
    ok("13 (narrador enxerga também o objeto oculto)", !!oculto, oculto ? "sim" : "não");
  }


  // ══════════════════════════════════════════════════════════════
  // ESCRITA (migration 0086) — RPCs estreitas, narrador-only
  // ══════════════════════════════════════════════════════════════

  // Jogador da mesma campanha, pra provar a autorização de verdade.
  const emailJog = `check-objetos-jog-${Date.now()}@ruptura.dev`;
  const senhaJog = randomUUID();
  const { data: uj } = await admin.auth.admin.createUser({ email: emailJog, password: senhaJog, email_confirm: true });
  criados.usuarios.push(uj!.user!.id);
  await admin.from("campaign_members").insert({
    campaign_id: campaignId, user_id: uj!.user!.id, role: "player", status: "active", origem: "check_objetos",
  });
  const { data: sj } = await anon.auth.signInWithPassword({ email: emailJog, password: senhaJog });
  const cliJog: SupabaseClient = createClient(req("SUPABASE_URL"), req("SUPABASE_ANON_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${sj!.session!.access_token}` } },
  });

  type ObjJson = { id: string; revision: number; celulas: { q: number; r: number }[]; pd: number | null; travado: boolean; nome: string };
  let criado: ObjJson | null = null;

  {
    const { data, error } = await cli.rpc("create_vtt_object", {
      p_scene_id: sceneId, p_campaign_id: campaignId, p_nome: "Barricada", p_preset: "barricada",
      p_celulas: [{ q: 2, r: 2 }, { q: 3, r: 2 }], p_bloqueia_movimento: true,
      p_terreno_projetado: null, p_grau_cobertura: "parcial", p_categoria: "media",
      p_pd: 8, p_pd_max: 8, p_visivel: true,
    });
    criado = data as ObjJson;
    ok("14 (narrador cria objeto pela RPC, com células)",
      !error && criado?.celulas?.length === 2, error?.message ?? `${criado?.celulas?.length} células`);
    const { data: bloq } = await admin.rpc("vtt_celula_bloqueada", { p_scene_id: sceneId, p_q: 2, p_r: 2 });
    ok("15 (o objeto recém-criado já bloqueia)", bloq === true, `${bloq}`);
  }

  {
    const msg = await erroDe(cliJog.rpc("create_vtt_object", {
      p_scene_id: sceneId, p_campaign_id: campaignId, p_nome: "Intruso", p_preset: "caixa",
      p_celulas: [{ q: 18, r: 3 }], p_bloqueia_movimento: true,
      p_terreno_projetado: null, p_grau_cobertura: null, p_categoria: null,
      p_pd: null, p_pd_max: null, p_visivel: true,
    }) as PromiseLike<{ error: { message: string } | null }>);
    ok("16 (JOGADOR não cria objeto — só narrador)", msg !== null && /narrador/i.test(msg), msg ?? "criou (FALHA)");
  }

  {
    const msg = await erroDe(cliJog.rpc("update_vtt_object", {
      p_object_id: criado!.id, p_expected_revision: criado!.revision, p_nome: "Sequestrado",
      p_bloqueia_movimento: false, p_terreno_projetado: null, p_grau_cobertura: null,
      p_categoria: null, p_pd: null, p_pd_max: null, p_visivel: true, p_travado: false,
    }) as PromiseLike<{ error: { message: string } | null }>);
    ok("17 (JOGADOR não altera objeto)", msg !== null && /narrador/i.test(msg), msg ?? "alterou (FALHA)");
  }

  {
    const msg = await erroDe(cli.rpc("move_vtt_object", {
      p_object_id: criado!.id, p_expected_revision: criado!.revision + 99, p_celulas: [{ q: 4, r: 4 }],
    }) as PromiseLike<{ error: { message: string } | null }>);
    ok("18 (revisão desatualizada é recusada)", msg !== null && /Revis/i.test(msg), msg ?? "aceitou (FALHA)");
  }

  {
    const { data, error } = await cli.rpc("move_vtt_object", {
      p_object_id: criado!.id, p_expected_revision: criado!.revision, p_celulas: [{ q: 10, r: 3 }],
    });
    const movido = data as ObjJson;
    const { data: antigaLivre } = await admin.rpc("vtt_celula_bloqueada", { p_scene_id: sceneId, p_q: 2, p_r: 2 });
    const { data: novaBloq } = await admin.rpc("vtt_celula_bloqueada", { p_scene_id: sceneId, p_q: 10, p_r: 3 });
    ok("19 (mover objeto leva o BLOQUEIO junto: célula antiga libera, nova bloqueia)",
      !error && antigaLivre === false && novaBloq === true, `${error?.message ?? ""} antiga=${antigaLivre} nova=${novaBloq}`);
    criado = movido;
  }

  {
    const msg = await erroDe(cli.rpc("move_vtt_object", {
      p_object_id: criado!.id, p_expected_revision: criado!.revision, p_celulas: [{ q: 999, r: 999 }],
    }) as PromiseLike<{ error: { message: string } | null }>);
    ok("20 (objeto fora dos limites do mapa é recusado)", msg !== null && /limites/i.test(msg), msg ?? "aceitou (FALHA)");
  }

  {
    const { data } = await cli.rpc("update_vtt_object", {
      p_object_id: criado!.id, p_expected_revision: criado!.revision, p_nome: "Barricada travada",
      p_bloqueia_movimento: true, p_terreno_projetado: null, p_grau_cobertura: "parcial",
      p_categoria: "media", p_pd: 8, p_pd_max: 8, p_visivel: true, p_travado: true,
    });
    criado = data as ObjJson;
    const msg = await erroDe(cli.rpc("move_vtt_object", {
      p_object_id: criado!.id, p_expected_revision: criado!.revision, p_celulas: [{ q: 11, r: 3 }],
    }) as PromiseLike<{ error: { message: string } | null }>);
    ok("21 (objeto TRAVADO não pode ser movido)", msg !== null && /travado/i.test(msg), msg ?? "moveu (FALHA)");

    const { data: destravado } = await cli.rpc("update_vtt_object", {
      p_object_id: criado!.id, p_expected_revision: criado!.revision, p_nome: criado!.nome,
      p_bloqueia_movimento: true, p_terreno_projetado: null, p_grau_cobertura: "parcial",
      p_categoria: "media", p_pd: 8, p_pd_max: 8, p_visivel: true, p_travado: false,
    });
    criado = destravado as ObjJson;
    ok("22 (update destrava — travar é cinto de segurança, não autorização)", criado!.travado === false, `${criado!.travado}`);
  }

  {
    const { data: d1 } = await cli.rpc("damage_vtt_object", { p_object_id: criado!.id, p_expected_revision: criado!.revision, p_delta: -5 });
    let atual = d1 as ObjJson;
    ok("23 (dano reduz PD)", atual.pd === 3, `${atual.pd}`);
    const { data: d2 } = await cli.rpc("damage_vtt_object", { p_object_id: atual.id, p_expected_revision: atual.revision, p_delta: -99 });
    atual = d2 as ObjJson;
    ok("24 (PD nunca fica negativo)", atual.pd === 0, `${atual.pd}`);
    const { data: d3 } = await cli.rpc("damage_vtt_object", { p_object_id: atual.id, p_expected_revision: atual.revision, p_delta: 99 });
    atual = d3 as ObjJson;
    ok("25 (reparo não passa do PD máximo)", atual.pd === 8, `${atual.pd}`);
    const { data: aindaBloqueia } = await admin.rpc("vtt_celula_bloqueada", { p_scene_id: sceneId, p_q: 10, p_r: 3 });
    ok("26 (PD zerado NÃO remove o objeto sozinho — destruição é decisão de cena)", aindaBloqueia === true, `${aindaBloqueia}`);
    criado = atual;
  }

  {
    const msg = await erroDe(cliJog.rpc("delete_vtt_object", { p_object_id: criado!.id }) as PromiseLike<{ error: { message: string } | null }>);
    ok("27 (JOGADOR não exclui objeto)", msg !== null && /narrador/i.test(msg), msg ?? "excluiu (FALHA)");

    const erroDel = await erroDe(cli.rpc("delete_vtt_object", { p_object_id: criado!.id }) as PromiseLike<{ error: { message: string } | null }>);
    const { count } = await admin.from("vtt_object_cells").select("*", { count: "exact", head: true }).eq("object_id", criado!.id);
    const { data: livre } = await admin.rpc("vtt_celula_bloqueada", { p_scene_id: sceneId, p_q: 10, p_r: 3 });
    ok("28 (narrador exclui; células caem por cascade e a célula libera)",
      erroDel === null && (count ?? 0) === 0 && livre === false, `${erroDel ?? ""} células=${count} bloqueada=${livre}`);
  }

}

main()
  .catch((e) => { console.error(e); falhou++; })
  .finally(async () => {
    // Ordem canônica e compartilhada — ver `limparCampanhaDeTeste.ts`.
    // A ordem escrita aqui ignorava o erro de cada `delete` e só
    // alcançava a PRIMEIRA cena de cada campanha (`maybeSingle`), o que
    // deixava células de objeto de qualquer cena seguinte.
    const { restos } = await limparCampanhasDeTeste(admin, {
      campanhas: criados.campanhas, usuarios: criados.usuarios,
    });
    ok("L (limpeza de fixtures)", restos.length === 0, restos.join("; "));
    console.log(`\n${passou} ok, ${falhou} falha(s).`);
    if (falhou > 0) process.exit(1);
  });
