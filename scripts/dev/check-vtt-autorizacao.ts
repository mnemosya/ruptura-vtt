/**
 * Autorização do estado da cena do VTT — contra o banco REAL.
 *
 * Este é o teste que sustenta a afirmação "as permissões são aplicadas
 * no servidor e no banco, não só na interface". Ele NÃO passa pela UI
 * nem pelas Server Actions: fala direto com o Supabase usando clientes
 * autenticados como cada pessoa (`signInWithPassword`), que é
 * exatamente o cenário que o pedido manda cobrir — "jogadores não podem
 * alterar terreno, mesmo por chamadas diretas ao servidor ou ao banco".
 *
 * Se a autorização estivesse só no React, todo critério negativo aqui
 * passaria (o React nem está rodando) e o teste ficaria verde por
 * vacuidade. Como ela está em RLS (migration 0065), a recusa vem do
 * Postgres.
 *
 * Fixtures são criadas com service role e removidas no fim; a limpeza
 * é um critério, não um `catch` silencioso — órfão de fixture já
 * atrapalhou execuções anteriores neste projeto.
 *
 * Uso: npx tsx scripts/dev/check-vtt-autorizacao.ts
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

const SUPABASE_URL = requireEnv("SUPABASE_URL");
const ANON = requireEnv("SUPABASE_ANON_KEY");
import { limparCampanhasDeTeste } from "./limparCampanhaDeTeste";

const admin = createClient(SUPABASE_URL, requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false, autoRefreshToken: false },
});

let passou = 0;
let falhou = 0;
function ok(criterio: string, cond: boolean, detalhe: string) {
  if (cond) { passou++; console.log(`ok - ${criterio}: ${detalhe}`); }
  else { falhou++; console.error(`FALHA - ${criterio}: ${detalhe}`); }
}

const criados = {
  usuarios: [] as string[],
  campanhas: [] as string[],
  personagens: [] as string[],
};

async function criarUsuario(nome: string): Promise<{ id: string; email: string; senha: string }> {
  const email = `check-vtt-${nome}-${Date.now()}-${Math.floor(Math.random() * 1e4)}@ruptura.dev`;
  const senha = randomUUID();
  const { data, error } = await admin.auth.admin.createUser({
    email, password: senha, email_confirm: true, user_metadata: { display_name: `VTT ${nome}` },
  });
  if (error) throw new Error(`Falha ao criar usuário ${nome}: ${error.message}`);
  criados.usuarios.push(data.user.id);
  return { id: data.user.id, email, senha };
}

async function clienteDe(email: string, senha: string): Promise<SupabaseClient> {
  const c = createClient(SUPABASE_URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await c.auth.signInWithPassword({ email, password: senha });
  if (error) throw new Error(`Falha ao logar ${email}: ${error.message}`);
  return c;
}

async function main() {
  // ── Fixtures ───────────────────────────────────────────────────
  const narrador = await criarUsuario("narrador");
  const jogador = await criarUsuario("jogador");
  const estranho = await criarUsuario("estranho"); // membro de OUTRA campanha

  const campanhaId = randomUUID();
  const { error: e1 } = await admin.from("campaigns").insert({ id: campanhaId, name: "VTT Auth", owner_id: narrador.id });
  if (e1) throw new Error(`Falha ao criar campanha: ${e1.message}`);
  criados.campanhas.push(campanhaId);

  const outraCampanhaId = randomUUID();
  const { error: e2 } = await admin.from("campaigns").insert({ id: outraCampanhaId, name: "VTT Outra", owner_id: estranho.id });
  if (e2) throw new Error(`Falha ao criar 2ª campanha: ${e2.message}`);
  criados.campanhas.push(outraCampanhaId);

  await admin.from("campaign_members").insert({
    campaign_id: campanhaId, user_id: jogador.id, role: "player", status: "active", origem: "check_vtt",
  });

  // Personagem do jogador + controle
  const personagemId = randomUUID();
  await admin.from("characters").insert({
    id: personagemId, name: "PJ do teste", status: "draft", payload: {},
    campaign_id: campanhaId, owner_id: jogador.id,
  });
  criados.personagens.push(personagemId);
  await admin.from("character_controllers").insert({ character_id: personagemId, campaign_id: campanhaId, user_id: jogador.id });

  // Cena + tokens
  const { data: cena, error: e3 } = await admin.from("vtt_scenes")
    .insert({ campaign_id: campanhaId, nome: "Cena de teste", largura: 20, altura: 20 })
    .select("id").single();
  if (e3) throw new Error(`Falha ao criar cena: ${e3.message}`);
  const sceneId = cena.id as string;

  // O palco. Desde 0111 — e explicitamente desde 0118, em que
  // `vtt_cena_do_jogador` é `coalesce(atribuição, palco)` — o jogador
  // não está numa cena "ativa": está na cena que a MESA aponta. Sem
  // linha de palco ele não está em cena nenhuma, e a RLS o recusa com
  // razão. A fixture é de quando a visibilidade vinha de
  // `vtt_scenes.ativa` e nunca acompanhou o schema.
  await admin.from("vtt_campaign_stage")
    .insert({ campaign_id: campanhaId, presented_scene_id: sceneId, updated_by: narrador.id });


  const { data: tokenPj } = await admin.from("vtt_tokens")
    .insert({ scene_id: sceneId, campaign_id: campanhaId, character_id: personagemId, nome: "Token PJ", sigla: "PJ", lado: "pj", q: 1, r: 1 })
    .select("id, revision").single();
  const { data: tokenPn } = await admin.from("vtt_tokens")
    .insert({ scene_id: sceneId, campaign_id: campanhaId, character_id: null, nome: "Token PN", sigla: "PN", lado: "pn", q: 5, r: 5 })
    .select("id, revision").single();

  const cliNarrador = await clienteDe(narrador.email, narrador.senha);
  const cliJogador = await clienteDe(jogador.email, jogador.senha);
  const cliEstranho = await clienteDe(estranho.email, estranho.senha);

  // ── Terreno ────────────────────────────────────────────────────
  {
    const { error } = await cliNarrador.from("vtt_terrain")
      .upsert({ scene_id: sceneId, campaign_id: campanhaId, q: 2, r: 2, tipo: "dificil" }, { onConflict: "scene_id,q,r" });
    const { data } = await cliNarrador.from("vtt_terrain").select("tipo").eq("scene_id", sceneId).eq("q", 2).eq("r", 2).maybeSingle();
    ok("1 (narrador PINTA terreno)", !error && data?.tipo === "dificil", error ? `erro=${error.message}` : `tipo=${data?.tipo}`);
  }
  {
    const { error } = await cliJogador.from("vtt_terrain")
      .upsert({ scene_id: sceneId, campaign_id: campanhaId, q: 3, r: 3, tipo: "bloqueado" }, { onConflict: "scene_id,q,r" });
    const { data } = await admin.from("vtt_terrain").select("tipo").eq("scene_id", sceneId).eq("q", 3).eq("r", 3).maybeSingle();
    ok(
      "2 (jogador NÃO pinta terreno — recusa vem do banco)",
      !!error || !data,
      error ? `recusado: ${error.message.slice(0, 70)}` : `nenhuma linha criada (data=${JSON.stringify(data)})`,
    );
  }
  {
    const { error } = await cliJogador.from("vtt_terrain").delete().eq("scene_id", sceneId).eq("q", 2).eq("r", 2);
    const { data } = await admin.from("vtt_terrain").select("tipo").eq("scene_id", sceneId).eq("q", 2).eq("r", 2).maybeSingle();
    ok("3 (jogador NÃO apaga terreno)", !!data, error ? `recusado: ${error.message.slice(0, 60)}` : "linha do narrador continua no banco");
  }

  // ── Movimento de token — via RPC move_vtt_token (migration 0066) ──
  // UPDATE direto na tabela foi REVOGADO. Isto é o próprio critério 4a.
  {
    const { data, error } = await cliJogador.from("vtt_tokens").update({ q: 1, r: 1 }).eq("id", tokenPj!.id).select("id");
    ok(
      "4a (UPDATE direto em vtt_tokens é recusado pro papel authenticated — até pro dono)",
      !!error && (data ?? []).length === 0,
      error ? `recusado: ${error.message.slice(0, 70)}` : "passou sem erro (FALHA GRAVE)",
    );
  }
  {
    const { data, error } = await cliJogador.rpc("move_vtt_token", {
      p_token_id: tokenPj!.id,
      p_rota: [{ q: 1, r: 1 }, { q: 2, r: 1 }],
      p_expected_revision: tokenPj!.revision,
    });
    const linha = Array.isArray(data) ? data[0] : data;
    ok("4b (jogador MOVE token que controla, via RPC)", !error && linha?.q === 2, error ? error.message : `q=${linha?.q}`);
  }
  {
    const { data: atual } = await admin.from("vtt_tokens").select("revision").eq("id", tokenPn!.id).single();
    if (!atual) throw new Error("token PN sumiu");
    const { data, error } = await cliJogador.rpc("move_vtt_token", {
      p_token_id: tokenPn!.id,
      p_rota: [{ q: 5, r: 5 }, { q: 9, r: 9 }],
      p_expected_revision: atual.revision,
    });
    const { data: real } = await admin.from("vtt_tokens").select("q, r").eq("id", tokenPn!.id).single();
    if (!real) throw new Error("token PN sumiu do banco");
    ok(
      "5 (jogador NÃO move token que não controla, via RPC)",
      !!error && !data && real.q === 5 && real.r === 5,
      `${error ? "recusado: " + error.message.slice(0, 60) : "PASSOU (FALHA)"}; posição real segue (${real.q},${real.r})`,
    );
  }
  {
    const { data, error } = await cliNarrador.rpc("move_vtt_token", {
      // Caminho contíguo de verdade (5,5)→(7,7), cada par consecutivo
      // hexagonalmente vizinho — desde a 0069 a RPC exige isto; um
      // salto direto (5,5)→(7,7) é exatamente o "teleporte" que os
      // critérios 19/20 provam rejeitado.
      p_token_id: tokenPn!.id,
      p_rota: [{ q: 5, r: 5 }, { q: 6, r: 5 }, { q: 6, r: 6 }, { q: 7, r: 6 }, { q: 7, r: 7 }],
      p_expected_revision: 1,
    });
    const linha = Array.isArray(data) ? data[0] : data;
    ok("6 (narrador move qualquer token, via RPC)", !error && linha?.q === 7, error ? error.message : `q=${linha?.q}`);
  }
  {
    // Concorrência: revisão velha não casa — a RPC lança exceção em vez de casar 0 linhas.
    const { data: atual } = await admin.from("vtt_tokens").select("revision").eq("id", tokenPj!.id).single();
    if (!atual) throw new Error("token PJ sumiu do banco");
    const revVelha = (atual.revision as number) - 1;
    const { data, error } = await cliJogador.rpc("move_vtt_token", {
      p_token_id: tokenPj!.id, p_rota: [{ q: 2, r: 1 }, { q: 3, r: 1 }], p_expected_revision: revVelha,
    });
    // Checa a MENSAGEM, não só "deu erro": um timeout de rede também
    // faria `!!error` ser verdadeiro e "provaria" a regra por acidente
    // — foi exatamente o que aconteceu numa execução anterior deste
    // script ("upstream request timeout" passando como se fosse a
    // exceção de revisão). Sem checar o texto, o critério vira teste
    // de conectividade, não de concorrência.
    const mensagemCorreta = !!error && /revis(ã|a)o desatualizada/i.test(error.message);
    ok(
      "7 (revisão desatualizada NÃO sobrescreve, via RPC — mensagem específica, não erro genérico)",
      mensagemCorreta && !data,
      error ? `"${error.message.slice(0, 70)}"` : "PASSOU (FALHA)",
    );
  }
  {
    await admin.from("vtt_tokens").update({ bloqueado: true }).eq("id", tokenPj!.id);
    const { data: atual } = await admin.from("vtt_tokens").select("revision, q, r").eq("id", tokenPj!.id).single();
    if (!atual) throw new Error("token PJ sumiu");
    const { data, error } = await cliJogador.rpc("move_vtt_token", {
      p_token_id: tokenPj!.id, p_rota: [{ q: atual.q, r: atual.r }, { q: atual.q + 1, r: atual.r }], p_expected_revision: atual.revision,
    });
    ok("8 (token travado bloqueia até o dono, via RPC)", !!error && !data, error ? "recusado" : "PASSOU (FALHA)");
    await admin.from("vtt_tokens").update({ bloqueado: false }).eq("id", tokenPj!.id);
  }
  {
    // Movimento pra FORA do mapa (cena é 20x20) — revalidado no SERVIDOR,
    // não só na UI. É o núcleo do achado #2 da auditoria.
    const { data: atual } = await admin.from("vtt_tokens").select("revision, q, r").eq("id", tokenPj!.id).single();
    if (!atual) throw new Error("token PJ sumiu");
    const { data, error } = await cliJogador.rpc("move_vtt_token", {
      p_token_id: tokenPj!.id, p_rota: [{ q: atual.q, r: atual.r }, { q: 500, r: 500 }], p_expected_revision: atual.revision,
    });
    ok(
      "8b (RPC rejeita destino fora do mapa — validado no servidor, não só na UI)",
      !!error && !data,
      error ? `recusado: ${error.message.slice(0, 60)}` : "PASSOU (FALHA GRAVE — moveu pra fora da grade)",
    );
  }
  {
    // Rota que ATRAVESSA célula bloqueada — mesmo achado #2, mas pro
    // meio do caminho, não só o destino final.
    await admin.from("vtt_terrain").upsert({ scene_id: sceneId, campaign_id: campanhaId, q: 10, r: 10, tipo: "bloqueado" });
    const { data: atual } = await admin.from("vtt_tokens").select("revision, q, r").eq("id", tokenPj!.id).single();
    if (!atual) throw new Error("token PJ sumiu");
    const { data, error } = await cliJogador.rpc("move_vtt_token", {
      p_token_id: tokenPj!.id, p_rota: [{ q: atual.q, r: atual.r }, { q: 10, r: 10 }, { q: 11, r: 10 }], p_expected_revision: atual.revision,
    });
    ok(
      "8c (RPC rejeita rota que atravessa célula bloqueada, mesmo não sendo o destino final)",
      !!error && !data,
      error ? `recusado: ${error.message.slice(0, 60)}` : "PASSOU (FALHA GRAVE — atravessou bloqueio)",
    );
    await admin.from("vtt_terrain").delete().eq("scene_id", sceneId).eq("q", 10).eq("r", 10);
  }
  {
    // set_vtt_token_flags — narrador-only, migration 0066.
    const { data, error } = await cliJogador.rpc("set_vtt_token_flags", { p_token_id: tokenPj!.id, p_bloqueado: true, p_visivel: false });
    ok("8d (jogador NÃO chama set_vtt_token_flags — narrador-only)", !!error && !data, error ? "recusado" : "PASSOU (FALHA)");
    const { data: n, error: en } = await cliNarrador.rpc("set_vtt_token_flags", { p_token_id: tokenPj!.id, p_bloqueado: false, p_visivel: true });
    const linhaN = Array.isArray(n) ? n[0] : n;
    ok("8e (narrador chama set_vtt_token_flags)", !en && linhaN?.bloqueado === false, en ? en.message : `bloqueado=${linhaN?.bloqueado}`);
  }

  // ── Marcações ──────────────────────────────────────────────────
  let marcaDoJogador = "";
  {
    const { data, error } = await cliJogador.from("vtt_marks").insert({
      scene_id: sceneId, campaign_id: campanhaId, autor_id: jogador.id,
      tipo: "linha", pontos: [{ q: 1, r: 1 }, { q: 3, r: 1 }], cor: "ciano", espessura: 2, opacidade: 0.9, privada: false,
    }).select("id").maybeSingle();
    marcaDoJogador = (data?.id as string) ?? "";
    ok("9 (jogador cria a própria marcação)", !!data, error ? `erro=${error.message}` : `id=${marcaDoJogador.slice(0, 8)}`);
  }
  {
    // Forjar autoria: inserir como se fosse o narrador.
    const { data, error } = await cliJogador.from("vtt_marks").insert({
      scene_id: sceneId, campaign_id: campanhaId, autor_id: narrador.id,
      tipo: "linha", pontos: [{ q: 0, r: 0 }], cor: "ambar", espessura: 2, opacidade: 0.9, privada: false,
    }).select("id").maybeSingle();
    ok("10 (jogador NÃO forja autoria de marcação)", !data, error ? `recusado: ${error.message.slice(0, 60)}` : "nenhuma linha criada");
  }
  let marcaDoNarrador = "";
  {
    const { data } = await cliNarrador.from("vtt_marks").insert({
      scene_id: sceneId, campaign_id: campanhaId, autor_id: narrador.id,
      tipo: "seta", pontos: [{ q: 4, r: 4 }, { q: 6, r: 4 }], cor: "ambar", espessura: 3, opacidade: 0.9, privada: false,
    }).select("id").maybeSingle();
    marcaDoNarrador = (data?.id as string) ?? "";
  }
  {
    const { data } = await cliJogador.from("vtt_marks").delete().eq("id", marcaDoNarrador).select("id").maybeSingle();
    const { data: aindaExiste } = await admin.from("vtt_marks").select("id").eq("id", marcaDoNarrador).maybeSingle();
    ok("11 (jogador NÃO apaga marcação alheia)", !data && !!aindaExiste, `casou ${data ? 1 : 0}; marca do narrador ainda existe=${!!aindaExiste}`);
  }
  {
    const { data } = await cliNarrador.from("vtt_marks").delete().eq("id", marcaDoJogador).select("id").maybeSingle();
    ok("12 (narrador apaga marcação de qualquer um)", !!data, `casou ${data ? 1 : 0} linha(s)`);
  }

  // ── Integridade relacional (FK composta, migration 0066) ────────
  // Achado #3 da auditoria: sem FK composta, era estruturalmente
  // possível gravar scene_id de uma campanha com campaign_id de outra.
  {
    const { error } = await admin.from("vtt_tokens").insert({
      scene_id: sceneId, campaign_id: outraCampanhaId, // cena é da 1ª campanha, campaign_id aponta pra 2ª
      nome: "Token cruzado", sigla: "XX", lado: "pn", q: 0, r: 0,
    });
    ok(
      "17 (FK composta rejeita token com scene_id/campaign_id de campanhas diferentes)",
      !!error && /foreign key|violat/i.test(error.message),
      error ? `rejeitado: ${error.message.slice(0, 90)}` : "PASSOU (FALHA GRAVE — integridade quebrada)",
    );
  }
  // Achado #4: personagem vinculado a token de OUTRA campanha.
  {
    const personagemDaOutra = randomUUID();
    await admin.from("characters").insert({
      id: personagemDaOutra, name: "PJ de outra campanha", status: "draft", payload: {},
      campaign_id: outraCampanhaId, owner_id: estranho.id,
    });
    criados.personagens.push(personagemDaOutra);

    const { error } = await admin.from("vtt_tokens").insert({
      scene_id: sceneId, campaign_id: campanhaId, // token é desta campanha
      character_id: personagemDaOutra, // mas o personagem é da OUTRA
      nome: "Token com PJ errado", sigla: "XX", lado: "pj", q: 0, r: 0,
    });
    ok(
      "18 (FK composta rejeita token cujo personagem é de outra campanha)",
      !!error && /foreign key|violat/i.test(error.message),
      error ? `rejeitado: ${error.message.slice(0, 90)}` : "PASSOU (FALHA GRAVE)",
    );
  }

  // ── Continuidade da rota (migration 0069) ───────────────────────
  // Achado de auditoria pós-0068: `move_vtt_token` validava cada
  // célula ISOLADAMENTE (limites, bloqueio), mas nunca conferia que a
  // rota começa onde o token JÁ ESTÁ, nem que células consecutivas são
  // vizinhas — uma chamada direta podia "teleportar" entre duas
  // células válidas e distantes. Os dois critérios abaixo provam a
  // rejeição, não só leem o código-fonte da correção.
  {
    // Origem forjada: o token está numa posição real, mas a rota
    // alega começar em outro lugar qualquer.
    const { data: atual } = await admin.from("vtt_tokens").select("revision, q, r").eq("id", tokenPj!.id).single();
    if (!atual) throw new Error("token PJ sumiu");
    const { data, error } = await cliJogador.rpc("move_vtt_token", {
      p_token_id: tokenPj!.id,
      p_rota: [{ q: atual.q + 3, r: atual.r + 3 }, { q: atual.q + 4, r: atual.r + 3 }],
      p_expected_revision: atual.revision,
    });
    ok(
      "19 (RPC rejeita rota com ORIGEM forjada — não é a posição atual do token)",
      !!error && !data && /posição atual/i.test(error.message),
      error ? `recusado: ${error.message.slice(0, 90)}` : "PASSOU (FALHA GRAVE — aceitou origem forjada)",
    );
    const { data: real } = await admin.from("vtt_tokens").select("q, r").eq("id", tokenPj!.id).single();
    ok("19b (posição real do token não mudou)", real?.q === atual.q && real?.r === atual.r, `continua em (${real?.q},${real?.r})`);
  }
  {
    // Origem correta, mas o segundo ponto NÃO é vizinho do primeiro —
    // o "teleporte" que a auditoria descreveu literalmente: duas
    // células dentro do mapa, sem bloqueio isolado em nenhuma das
    // duas, mas distantes uma da outra.
    const { data: atual } = await admin.from("vtt_tokens").select("revision, q, r").eq("id", tokenPj!.id).single();
    if (!atual) throw new Error("token PJ sumiu");
    const { data, error } = await cliJogador.rpc("move_vtt_token", {
      p_token_id: tokenPj!.id,
      p_rota: [{ q: atual.q, r: atual.r }, { q: atual.q + 8, r: atual.r }],
      p_expected_revision: atual.revision,
    });
    ok(
      "20 (RPC rejeita salto entre células NÃO adjacentes — sem isto seria teleporte)",
      !!error && !data && /não é contínua|nao e continua/i.test(error.message),
      error ? `recusado: ${error.message.slice(0, 90)}` : "PASSOU (FALHA GRAVE — teleportou)",
    );
    const { data: real } = await admin.from("vtt_tokens").select("q, r").eq("id", tokenPj!.id).single();
    ok("20b (posição real do token não mudou)", real?.q === atual.q && real?.r === atual.r, `continua em (${real?.q},${real?.r})`);
  }

  // ── Exclusão de personagem vinculado a token (FK, migration 0069) ─
  // Achado de auditoria: `on delete set null` numa FK COMPOSTA sem
  // lista de colunas tenta zerar as DUAS colunas — incluindo
  // `campaign_id`, que é `not null` em `vtt_tokens`. Sem a correção,
  // apagar este personagem falharia com violação de not-null em vez
  // de só soltar o vínculo do token.
  {
    const personagemDescartavel = randomUUID();
    await admin.from("characters").insert({
      id: personagemDescartavel, name: "PJ descartável", status: "draft", payload: {},
      campaign_id: campanhaId, owner_id: jogador.id,
    });
    const { data: tokenLigado } = await admin.from("vtt_tokens")
      .insert({ scene_id: sceneId, campaign_id: campanhaId, character_id: personagemDescartavel, nome: "Token descartável", sigla: "DZ", lado: "pj", q: 0, r: 19 })
      .select("id").single();

    const { error: erroDelete } = await admin.from("characters").delete().eq("id", personagemDescartavel);
    const { data: tokenApos } = await admin.from("vtt_tokens").select("id, character_id").eq("id", tokenLigado!.id).maybeSingle();
    ok(
      "21 (apagar personagem vinculado NÃO falha por FK, e o token só perde o vínculo)",
      !erroDelete && !!tokenApos && tokenApos.character_id === null,
      erroDelete ? `FALHA: ${erroDelete.message}` : `token continua existindo, character_id=${tokenApos?.character_id}`,
    );
    await admin.from("vtt_tokens").delete().eq("id", tokenLigado!.id);
  }

  // ── Semeadura vincula tokens PJ a personagens reais (migration 0069) ─
  // Achado de auditoria: `seed_vtt_tokens` criava TODO token com
  // `character_id = null` — pela regra de autorização, token sem
  // personagem só o narrador move, então NENHUM jogador conseguiria
  // mover NENHUM token vindo da semente real. `seed_vtt_scene` devolve
  // a cena ATIVA existente da campanha (idempotência por campanha, não
  // por nome) — `campanhaId` já tem `sceneId`, então estes testes
  // usam uma campanha PRÓPRIA, sem cena nenhuma ainda, pra de fato
  // exercitar a criação (senão `seed_vtt_scene`/`seed_vtt_tokens`
  // silenciosamente devolvem o que já existe, e o teste "passaria" sem
  // testar nada — armadilha real, pega numa execução anterior deste
  // script).
  const campanhaSeedId = randomUUID();
  {
    const { error } = await admin.from("campaigns").insert({ id: campanhaSeedId, name: "VTT Seed", owner_id: narrador.id });
    if (error) throw new Error(`Falha ao criar campanha de semeadura: ${error.message}`);
    criados.campanhas.push(campanhaSeedId);
    await admin.from("campaign_members").insert({
      campaign_id: campanhaSeedId, user_id: jogador.id, role: "player", status: "active", origem: "check_vtt_seed",
    });
    // Mesmo personagem/controlador do jogador, mas vinculado a ESTA
    // campanha — `character_controllers` tem FK composta pra
    // `characters(id, campaign_id)`, então precisa ser um personagem
    // novo, não reaproveitar `personagemId` (que é de `campanhaId`).
  }
  const personagemSeedId = randomUUID();
  {
    await admin.from("characters").insert({
      id: personagemSeedId, name: "PJ da campanha de semeadura", status: "draft", payload: {},
      campaign_id: campanhaSeedId, owner_id: jogador.id,
    });
    criados.personagens.push(personagemSeedId);
    await admin.from("character_controllers").insert({ character_id: personagemSeedId, campaign_id: campanhaSeedId, user_id: jogador.id });
  }
  {
    const { data: cena2, error: erroCena2 } = await cliNarrador.rpc("seed_vtt_scene", {
      p_campaign_id: campanhaSeedId, p_nome: "Cena de semeadura", p_local: null, p_resumo: null, p_largura: 10, p_altura: 10,
    }).single();
    if (erroCena2 || !cena2) throw new Error(`Falha ao criar cena de semeadura via RPC: ${erroCena2?.message}`);
    const sceneId2 = (cena2 as { id: string }).id;

    const { data: tokensSemeados, error: erroSeed } = await cliNarrador.rpc("seed_vtt_tokens", {
      p_scene_id: sceneId2,
      p_campaign_id: campanhaSeedId,
      p_tokens: [
        { nome: "Herói de teste", sigla: "HT", lado: "pj", vertente: "nenhuma", q: 1, r: 1, tamanho: "medio" },
        { nome: "Inimigo de teste", sigla: "IT", lado: "pn", vertente: "nenhuma", q: 5, r: 5, tamanho: "medio" },
      ],
    });
    const tokenPjSemeado = (tokensSemeados ?? []).find((t: { lado: string }) => t.lado === "pj");
    ok(
      "22 (semente vincula token PJ a personagem REAL já controlado pelo jogador)",
      !erroSeed && tokenPjSemeado?.character_id === personagemSeedId,
      erroSeed ? `erro=${erroSeed.message}` : `character_id=${tokenPjSemeado?.character_id} (esperado ${personagemSeedId})`,
    );

    // Fecha o loop de ponta a ponta: o jogador de fato consegue mover
    // ESTE token, vindo da semente de verdade — não um fixture montado
    // à mão só pra este teste.
    const { data: movResultado, error: erroMov } = await cliJogador.rpc("move_vtt_token", {
      p_token_id: tokenPjSemeado!.id,
      p_rota: [{ q: 1, r: 1 }, { q: 2, r: 1 }],
      p_expected_revision: tokenPjSemeado!.revision,
    });
    const linhaMov = Array.isArray(movResultado) ? movResultado[0] : movResultado;
    ok(
      "22b (jogador MOVE de verdade o token semeado que ele controla)",
      !erroMov && linhaMov?.q === 2,
      erroMov ? erroMov.message : `q=${linhaMov?.q}`,
    );
  }
  {
    // Bounds no seed: campanha e cena PRÓPRIAS de novo (mesmo motivo
    // acima) — grade 5×5, célula (50,50) certamente fora.
    const campanhaBoundsId = randomUUID();
    const { error: erroCampanha } = await admin.from("campaigns").insert({ id: campanhaBoundsId, name: "VTT Seed Bounds", owner_id: narrador.id });
    if (erroCampanha) throw new Error(`Falha ao criar campanha de bounds: ${erroCampanha.message}`);
    criados.campanhas.push(campanhaBoundsId);

    const cliNarradorBounds = cliNarrador; // mesmo narrador, dono das duas campanhas
    const { data: cenaFake, error: erroCenaFake } = await cliNarradorBounds.rpc("seed_vtt_scene", {
      p_campaign_id: campanhaBoundsId, p_nome: "Cena pra estourar limite", p_local: null, p_resumo: null, p_largura: 5, p_altura: 5,
    }).single();
    if (erroCenaFake || !cenaFake) throw new Error(`Falha ao criar cena de bounds via RPC: ${erroCenaFake?.message}`);
    const sceneId3 = (cenaFake as { id: string }).id;
    const { data, error } = await cliNarradorBounds.rpc("seed_vtt_tokens", {
      p_scene_id: sceneId3, p_campaign_id: campanhaBoundsId,
      p_tokens: [{ nome: "Fora do mapa", sigla: "FM", lado: "pn", vertente: "nenhuma", q: 50, r: 50, tamanho: "medio" }],
    });
    ok(
      "23 (seed rejeita token fora dos limites da cena)",
      !!error && !data,
      error ? `recusado: ${error.message.slice(0, 80)}` : "PASSOU (FALHA GRAVE)",
    );
  }

  // ── Isolamento entre campanhas ─────────────────────────────────
  {
    const { data } = await cliEstranho.from("vtt_tokens").select("id").eq("campaign_id", campanhaId);
    ok("13 (membro de outra campanha NÃO enxerga tokens desta)", (data ?? []).length === 0, `${(data ?? []).length} token(s) visíveis`);
  }
  {
    const { data } = await cliEstranho.from("vtt_scenes").select("id").eq("campaign_id", campanhaId);
    ok("13b (nem a cena)", (data ?? []).length === 0, `${(data ?? []).length} cena(s) visíveis`);
  }
  {
    const { data: atual } = await admin.from("vtt_tokens").select("revision").eq("id", tokenPj!.id).single();
    if (!atual) throw new Error("token PJ sumiu");
    const { data } = await cliEstranho.from("vtt_tokens")
      .update({ q: 19, r: 19, revision: (atual.revision as number) + 1 })
      .eq("id", tokenPj!.id).select("id").maybeSingle();
    ok("14 (nem move token de outra campanha)", !data, `casou ${data ? 1 : 0} linha(s)`);
  }

  // ── Visibilidade de token ──────────────────────────────────────
  {
    await admin.from("vtt_tokens").update({ visivel: false }).eq("id", tokenPn!.id);
    const { data: vistoJogador } = await cliJogador.from("vtt_tokens").select("id").eq("id", tokenPn!.id).maybeSingle();
    const { data: vistoNarrador } = await cliNarrador.from("vtt_tokens").select("id").eq("id", tokenPn!.id).maybeSingle();
    ok("15 (token oculto some pro jogador e continua pro narrador)", !vistoJogador && !!vistoNarrador, `jogador vê=${!!vistoJogador}, narrador vê=${!!vistoNarrador}`);
  }

  // ── Marcação privada ───────────────────────────────────────────
  {
    const { data: priv } = await cliJogador.from("vtt_marks").insert({
      scene_id: sceneId, campaign_id: campanhaId, autor_id: jogador.id,
      tipo: "texto", pontos: [{ q: 8, r: 8 }], texto: "só eu e o narrador", cor: "verde", espessura: 2, opacidade: 0.9, privada: true,
    }).select("id").maybeSingle();
    const outroJogador = await criarUsuario("jogador2");
    await admin.from("campaign_members").insert({
      campaign_id: campanhaId, user_id: outroJogador.id, role: "player", status: "active", origem: "check_vtt",
    });
    const cliOutro = await clienteDe(outroJogador.email, outroJogador.senha);
    const { data: veOutro } = await cliOutro.from("vtt_marks").select("id").eq("id", priv!.id).maybeSingle();
    const { data: veNarrador } = await cliNarrador.from("vtt_marks").select("id").eq("id", priv!.id).maybeSingle();
    ok("16 (marcação privada: outro jogador não vê, narrador vê)", !veOutro && !!veNarrador, `outro vê=${!!veOutro}, narrador vê=${!!veNarrador}`);
  }

}

/**
 * A limpeza roda num `.finally()`, não no fim do `main`: no fim do
 * `main` ela só acontece quando tudo dá certo, que é exatamente quando
 * ela menos importa. Uma asserção que lançasse deixava a campanha viva
 * em produção.
 *
 * Ordem canônica e compartilhada — ver `limparCampanhaDeTeste.ts`. As
 * ordens escritas à mão ignoravam o erro de cada `delete`, e duas FKs
 * (palco e colocação de imagem) RECUSAM a exclusão em vez de cascatear.
 */
async function limparTudo(): Promise<void> {
  // Personagens soltos não são alcançados pela ordem por campanha.
  for (const id of criados.personagens) {
    await admin.from("character_controllers").delete().eq("character_id", id);
    await admin.from("characters").delete().eq("id", id);
  }
  const { restos } = await limparCampanhasDeTeste(admin, {
    campanhas: criados.campanhas, usuarios: criados.usuarios,
  });
  ok("L (limpeza de fixtures)", restos.length === 0,
    restos.length ? `PENDENTE: ${restos.join("; ")}`
      : `${criados.usuarios.length} usuário(s) e ${criados.campanhas.length} campanha(s) removidos`);
  console.log(`\n${passou} ok, ${falhou} falha(s).`);
}

main()
  .catch((e) => { console.error(e); falhou++; })
  .finally(async () => {
    await limparTudo();
    if (falhou > 0) process.exit(1);
  });
