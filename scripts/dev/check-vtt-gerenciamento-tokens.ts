/**
 * Gerenciamento de tokens + ping + camadas (Fases 2-4 do pacote "próximo
 * funcional do VTT") — contra o banco REAL, mesmo padrão de
 * `check-vtt-autorizacao.ts`: fala direto com o Postgres/Supabase via
 * clientes autenticados como cada pessoa, não passa pela UI. Cobre as
 * categorias de segurança/dados do pedido original (fonte canônica,
 * CRUD narrador-only, visibilidade/controle, ping, tolerância de
 * localStorage das camadas) com critérios NUMERADOS POR CATEGORIA — não
 * reproduz a numeração literal 1-57 do pedido original (não preservada
 * verbatim nesta sessão), mas cobre a SUBSTÂNCIA de cada faixa
 * (fonte canônica, criação/edição, duplicação/remoção, visibilidade/
 * controle, ping, camadas).
 *
 * Regressão das 4 suítes VTT existentes fica FORA deste arquivo — rodar
 * `check-vtt-autorizacao.ts`, `check-vtt-pegada-reparo.ts`,
 * `check-vtt-integracao.ts`, `check-vtt-animacao-movimento.ts`
 * separadamente (documentado no relatório de entrega).
 *
 * Uso: npx tsx scripts/dev/check-vtt-gerenciamento-tokens.ts
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
const admin = createClient(SUPABASE_URL, requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false, autoRefreshToken: false },
});

let passou = 0;
let falhou = 0;
function ok(criterio: string, cond: boolean, detalhe: string) {
  if (cond) { passou++; console.log(`ok - ${criterio}: ${detalhe}`); }
  else { falhou++; console.error(`FALHA - ${criterio}: ${detalhe}`); }
}

const criados = { usuarios: [] as string[], campanhas: [] as string[], personagens: [] as string[] };

async function criarUsuario(nome: string): Promise<{ id: string; email: string; senha: string }> {
  const email = `check-vtt-tok-${nome}-${Date.now()}-${Math.floor(Math.random() * 1e4)}@ruptura.dev`;
  const senha = randomUUID();
  const { data, error } = await admin.auth.admin.createUser({
    email, password: senha, email_confirm: true, user_metadata: { display_name: `Tok ${nome}` },
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
  const jogador2 = await criarUsuario("jogador2");
  const estranho = await criarUsuario("estranho");

  const campanhaId = randomUUID();
  await admin.from("campaigns").insert({ id: campanhaId, name: "VTT Gerenciamento", owner_id: narrador.id });
  criados.campanhas.push(campanhaId);
  const outraCampanhaId = randomUUID();
  await admin.from("campaigns").insert({ id: outraCampanhaId, name: "VTT Outra", owner_id: estranho.id });
  criados.campanhas.push(outraCampanhaId);

  await admin.from("campaign_members").insert([
    { campaign_id: campanhaId, user_id: jogador.id, role: "player", status: "active", origem: "check_vtt_tok" },
    { campaign_id: campanhaId, user_id: jogador2.id, role: "player", status: "active", origem: "check_vtt_tok" },
  ]);

  const personagemId = randomUUID();
  await admin.from("characters").insert({
    id: personagemId, name: "PJ do teste", status: "draft", payload: {}, campaign_id: campanhaId, owner_id: jogador.id,
  });
  criados.personagens.push(personagemId);
  await admin.from("character_controllers").insert({ character_id: personagemId, campaign_id: campanhaId, user_id: jogador.id });

  const { data: cena } = await admin.from("vtt_scenes")
    .insert({ campaign_id: campanhaId, nome: "Cena de teste", largura: 20, altura: 20 })
    .select("id").single();
  const sceneId = cena!.id as string;
  const { data: outraCena } = await admin.from("vtt_scenes")
    .insert({ campaign_id: outraCampanhaId, nome: "Cena de outra campanha", largura: 20, altura: 20 })
    .select("id").single();
  const outraSceneId = outraCena!.id as string;

  const cliNarrador = await clienteDe(narrador.email, narrador.senha);
  const cliJogador = await clienteDe(jogador.email, jogador.senha);
  const cliJogador2 = await clienteDe(jogador2.email, jogador2.senha);
  const cliEstranho = await clienteDe(estranho.email, estranho.senha);
  const anonSemSessao = createClient(SUPABASE_URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });

  // ═══════════════════════════════════════════════════════════════
  // FONTE CANÔNICA
  // ═══════════════════════════════════════════════════════════════
  let tokenNovoId = "";
  {
    const { data, error } = await cliNarrador.rpc("create_vtt_token", {
      p_scene_id: sceneId, p_campaign_id: campanhaId, p_nome: "Recém-criado", p_sigla: "ZZ",
      p_lado: "pn", p_vertente: "nenhuma", p_tamanho: "medio", p_orientacao: 0, p_pegada_personalizada: null,
      p_q: 0, p_r: 0, p_character_id: null, p_visivel: true, p_bloqueado: false,
      p_retrato_url: null, p_pv_atual: null, p_pv_max: null, p_condicoes: [],
    }).single();
    tokenNovoId = (data as { id: string } | null)?.id ?? "";
    ok(
      "canonico-1 (token criado pela UI existe SEM precisar de sigla/id demonstrativos — 'ZZ' não existe em nenhum elenco fixo)",
      !error && !!tokenNovoId, error ? error.message : `id=${tokenNovoId.slice(0, 8)}`,
    );
  }
  {
    const { data: atual0 } = await admin.from("vtt_tokens").select("revision").eq("id", tokenNovoId).single();
    const { data, error } = await cliNarrador.rpc("update_vtt_token", {
      p_token_id: tokenNovoId, p_nome: "Nome trocado", p_sigla: "ZZ", p_lado: "pn", p_vertente: "nenhuma",
      p_character_id: null, p_retrato_url: null, p_pv_atual: null, p_pv_max: null, p_condicoes: [],
      p_expected_revision: atual0!.revision,
    }).single();
    const linha = data as { id: string; nome: string } | null;
    ok(
      "canonico-2 (renomear preserva o id — nunca troca de identidade)",
      !error && linha?.id === tokenNovoId && linha?.nome === "Nome trocado",
      error ? error.message : `id=${linha?.id === tokenNovoId}, nome=${linha?.nome}`,
    );
  }
  {
    const cwd = process.cwd();
    const { stdout } = await import("node:child_process").then((cp) => new Promise<{ stdout: string }>((resolve) => {
      cp.exec(
        `grep -rn "CENA_DEMO\\.tokens\\|demoIdPorPersistidoId\\|persistidoPorSigla\\|tokenIdDemo" "src/app/mesas/[campaignId]/vtt/VttClient.tsx" "src/app/mesas/[campaignId]/vtt/_mapa/MapaHex.tsx" "src/app/mesas/[campaignId]/vtt/_dominio/tokenApresentacao.ts"`,
        { cwd },
        (_err, out) => resolve({ stdout: out }),
      );
    }));
    // `demoIdPorPersistidoId`/`persistidoPorSigla`/`tokenIdDemo` não
    // podem aparecer NEM em comentário (não devem existir mais em
    // lugar nenhum); `CENA_DEMO.tokens` pode aparecer só dentro de um
    // comentário que DOCUMENTA a ausência de uso (ex.: "nunca é lida")
    // — é exatamente esse tipo de linha que prova a garantia, não a viola.
    const linhasRuins = stdout.split("\n").filter((l) => l.trim().length > 0).filter((l) => {
      if (/demoIdPorPersistidoId|persistidoPorSigla|tokenIdDemo/.test(l)) return true;
      if (/CENA_DEMO\.tokens/.test(l)) {
        const conteudo = l.slice(l.indexOf(":", l.indexOf(":") + 1) + 1);
        const ehComentario = /^\s*(\/\/|\*|\/\*)/.test(conteudo);
        return !ehComentario;
      }
      return false;
    });
    ok(
      "canonico-3 (nenhum consumidor de MapaHex/VttClient/tokenApresentacao usa CENA_DEMO.tokens/demoIdPorPersistidoId/persistidoPorSigla/tokenIdDemo em código real)",
      linhasRuins.length === 0, linhasRuins.length === 0 ? "grep limpo (fora de comentários explicativos)" : `achados: ${linhasRuins.join(" | ").slice(0, 300)}`,
    );
  }

  // ═══════════════════════════════════════════════════════════════
  // CRIAÇÃO / EDIÇÃO — narrador-only, validação de pegada
  // ═══════════════════════════════════════════════════════════════
  {
    const { data, error } = await cliJogador.rpc("create_vtt_token", {
      p_scene_id: sceneId, p_campaign_id: campanhaId, p_nome: "Não devia existir", p_sigla: "XX",
      p_lado: "pn", p_vertente: "nenhuma", p_tamanho: "medio", p_orientacao: 0, p_pegada_personalizada: null,
      p_q: 1, p_r: 1, p_character_id: null, p_visivel: true, p_bloqueado: false,
      p_retrato_url: null, p_pv_atual: null, p_pv_max: null, p_condicoes: [],
    });
    ok("criar-1 (jogador NÃO cria token — narrador-only)", !!error && !data, error ? "recusado" : "PASSOU (FALHA)");
  }
  {
    const { data, error } = await cliNarrador.rpc("create_vtt_token", {
      p_scene_id: sceneId, p_campaign_id: campanhaId, p_nome: "Fora do mapa", p_sigla: "FM",
      p_lado: "pn", p_vertente: "nenhuma", p_tamanho: "medio", p_orientacao: 0, p_pegada_personalizada: null,
      p_q: 500, p_r: 500, p_character_id: null, p_visivel: true, p_bloqueado: false,
      p_retrato_url: null, p_pv_atual: null, p_pv_max: null, p_condicoes: [],
    });
    ok("criar-2 (RPC rejeita criação fora dos limites do mapa)", !!error && !data, error ? `recusado: ${error.message.slice(0, 60)}` : "PASSOU (FALHA)");
  }
  {
    await admin.from("vtt_terrain").upsert({ scene_id: sceneId, campaign_id: campanhaId, q: 5, r: 5, tipo: "bloqueado" });
    const { data, error } = await cliNarrador.rpc("create_vtt_token", {
      p_scene_id: sceneId, p_campaign_id: campanhaId, p_nome: "Sobre bloqueio", p_sigla: "SB",
      p_lado: "pn", p_vertente: "nenhuma", p_tamanho: "medio", p_orientacao: 0, p_pegada_personalizada: null,
      p_q: 5, p_r: 5, p_character_id: null, p_visivel: true, p_bloqueado: false,
      p_retrato_url: null, p_pv_atual: null, p_pv_max: null, p_condicoes: [],
    });
    ok("criar-3 (RPC rejeita criação sobre terreno bloqueado)", !!error && !data, error ? `recusado: ${error.message.slice(0, 70)}` : "PASSOU (FALHA)");
    await admin.from("vtt_terrain").delete().eq("scene_id", sceneId).eq("q", 5).eq("r", 5);
  }
  {
    const { data, error } = await cliNarrador.rpc("create_vtt_token", {
      p_scene_id: sceneId, p_campaign_id: campanhaId, p_nome: "Sobrepõe", p_sigla: "SO",
      p_lado: "pn", p_vertente: "nenhuma", p_tamanho: "medio", p_orientacao: 0, p_pegada_personalizada: null,
      p_q: 0, p_r: 0, p_character_id: null, p_visivel: true, p_bloqueado: false, // mesma célula do "ZZ" criado acima
      p_retrato_url: null, p_pv_atual: null, p_pv_max: null, p_condicoes: [],
    });
    ok("criar-4 (RPC rejeita criação sobrepondo outro token)", !!error && !data, error ? `recusado: ${error.message.slice(0, 70)}` : "PASSOU (FALHA)");
  }
  {
    const { data, error } = await cliJogador.rpc("update_vtt_token", {
      p_token_id: tokenNovoId, p_nome: "Hack", p_sigla: "ZZ", p_lado: "pn", p_vertente: "nenhuma",
      p_character_id: null, p_retrato_url: null, p_pv_atual: null, p_pv_max: null, p_condicoes: [],
      p_expected_revision: 1,
    });
    ok("editar-1 (jogador NÃO edita token — narrador-only)", !!error && !data, error ? "recusado" : "PASSOU (FALHA)");
  }
  {
    const { data: atual1 } = await admin.from("vtt_tokens").select("revision").eq("id", tokenNovoId).single();
    const { data, error } = await cliNarrador.rpc("update_vtt_token", {
      p_token_id: tokenNovoId, p_nome: "X", p_sigla: "ZZ", p_lado: "pn", p_vertente: "nenhuma",
      p_character_id: null, p_retrato_url: null, p_pv_atual: null, p_pv_max: null, p_condicoes: [],
      p_expected_revision: atual1!.revision - 1, // deliberadamente velha
    });
    ok("editar-2 (revisão desatualizada é recusada, sem sobrescrever)", !!error && !data, error ? `recusado: ${error.message.slice(0, 60)}` : "PASSOU (FALHA)");
  }
  {
    const { data: antes } = await admin.from("vtt_tokens").select("q, r, tamanho, revision").eq("id", tokenNovoId).single();
    await cliNarrador.rpc("update_vtt_token", {
      p_token_id: tokenNovoId, p_nome: "Só nome muda", p_sigla: "ZZ", p_lado: "pn", p_vertente: "nenhuma",
      p_character_id: null, p_retrato_url: null, p_pv_atual: null, p_pv_max: null, p_condicoes: [],
      p_expected_revision: antes!.revision,
    });
    const { data: depois } = await admin.from("vtt_tokens").select("q, r, tamanho").eq("id", tokenNovoId).single();
    ok(
      "editar-3 (update_vtt_token nunca move nem redimensiona — só campos de apresentação)",
      antes?.q === depois?.q && antes?.r === depois?.r && antes?.tamanho === depois?.tamanho,
      `antes=${JSON.stringify(antes)}, depois=${JSON.stringify(depois)}`,
    );
  }
  {
    const { data: atual } = await admin.from("vtt_tokens").select("revision, q, r").eq("id", tokenNovoId).single();
    const { data, error } = await cliJogador.rpc("resize_vtt_token", {
      p_token_id: tokenNovoId, p_tamanho: "grande", p_orientacao: 0, p_pegada_personalizada: null,
      p_expected_revision: atual!.revision,
    });
    ok("resize-1 (jogador NÃO redimensiona token — narrador-only)", !!error && !data, error ? "recusado" : "PASSOU (FALHA)");
  }
  {
    const { data: antes } = await admin.from("vtt_tokens").select("revision, q, r").eq("id", tokenNovoId).single();
    const { data, error } = await cliNarrador.rpc("resize_vtt_token", {
      p_token_id: tokenNovoId, p_tamanho: "grande", p_orientacao: 0, p_pegada_personalizada: null,
      p_expected_revision: antes!.revision,
    }).single();
    const linha = data as { q: number; r: number; tamanho: string } | null;
    ok(
      "resize-2 (redimensionar preserva a âncora q,r — nunca move o token sozinho)",
      !error && linha?.tamanho === "grande" && linha?.q === antes?.q && linha?.r === antes?.r,
      error ? error.message : `tamanho=${linha?.tamanho}, âncora antes=(${antes?.q},${antes?.r}) depois=(${linha?.q},${linha?.r})`,
    );
  }
  {
    // Redimensionar pra Colossal (12 células) na mesma âncora, perto da
    // borda — deve estourar limites e ser recusado, sem persistir.
    const { data: antes } = await admin.from("vtt_tokens").select("revision, tamanho").eq("id", tokenNovoId).single();
    const { data, error } = await cliNarrador.rpc("resize_vtt_token", {
      p_token_id: tokenNovoId, p_tamanho: "colossal", p_orientacao: 0, p_pegada_personalizada: null,
      p_expected_revision: antes!.revision,
    });
    const { data: depois } = await admin.from("vtt_tokens").select("tamanho, revision").eq("id", tokenNovoId).single();
    ok(
      "resize-3 (redimensionar que não CABE na âncora é recusado — pegada não persiste parcial)",
      !!error && !data && depois?.tamanho === antes?.tamanho && depois?.revision === antes?.revision,
      error ? `recusado: ${error.message.slice(0, 70)}` : "PASSOU (FALHA)",
    );
  }

  // ═══════════════════════════════════════════════════════════════
  // EDIÇÃO ATÔMICA (`edit_vtt_token`, migration 0076) — nome+tamanho
  // numa RPC só; falha no tamanho não pode deixar o nome (nem nenhum
  // outro campo) meio-salvo.
  // ═══════════════════════════════════════════════════════════════
  {
    // tokenNovoId está em "grande", âncora (0,0) — Colossal (12
    // células) na mesma âncora estoura os limites do mapa (mesmo
    // cenário já comprovado recusado em "resize-3").
    const { data: antes } = await admin.from("vtt_tokens").select("nome, tamanho, revision, q, r").eq("id", tokenNovoId).single();
    const { data, error } = await cliNarrador.rpc("edit_vtt_token", {
      p_token_id: tokenNovoId, p_nome: "NÃO DEVE FICAR SALVO", p_sigla: "ZZ", p_lado: "pn", p_vertente: "nenhuma",
      p_character_id: null, p_retrato_url: null, p_pv_atual: null, p_pv_max: null, p_condicoes: [],
      p_tamanho: "colossal", p_expected_revision: antes!.revision,
    });
    const { data: depois } = await admin.from("vtt_tokens").select("nome, tamanho, revision, q, r").eq("id", tokenNovoId).single();
    ok(
      "editar-atomico-1 (nome+tamanho pra pegada inválida: NADA fica salvo — nem o nome, nem o tamanho, nem a revisão sobe)",
      !!error && !data
        && depois?.nome === antes?.nome && depois?.tamanho === antes?.tamanho
        && depois?.revision === antes?.revision && depois?.q === antes?.q && depois?.r === antes?.r,
      error
        ? `recusado: ${error.message.slice(0, 70)} | antes=${JSON.stringify(antes)} depois=${JSON.stringify(depois)}`
        : "PASSOU (FALHA) — deveria ter sido recusado",
    );
  }
  {
    const { data: antes } = await admin.from("vtt_tokens").select("nome, tamanho, revision").eq("id", tokenNovoId).single();
    const { data, error } = await cliNarrador.rpc("edit_vtt_token", {
      p_token_id: tokenNovoId, p_nome: "Editado Atômico", p_sigla: "ZZ", p_lado: "pn", p_vertente: "nenhuma",
      p_character_id: null, p_retrato_url: null, p_pv_atual: null, p_pv_max: null, p_condicoes: [],
      p_tamanho: "medio", p_expected_revision: antes!.revision,
    }).single();
    const linha = data as { nome: string; tamanho: string; revision: number } | null;
    ok(
      "editar-atomico-2 (nome+tamanho pra pegada válida: os DOIS são aplicados, revisão sobe exatamente 1)",
      !error && linha?.nome === "Editado Atômico" && linha?.tamanho === "medio" && linha?.revision === antes!.revision + 1,
      error ? error.message : `antes=${JSON.stringify(antes)}, depois=${JSON.stringify(linha)}`,
    );
  }
  {
    // Só o nome muda (tamanho igual ao já persistido) — mesma RPC, ainda uma revisão só.
    const { data: antes } = await admin.from("vtt_tokens").select("nome, tamanho, revision").eq("id", tokenNovoId).single();
    const { data, error } = await cliNarrador.rpc("edit_vtt_token", {
      p_token_id: tokenNovoId, p_nome: "Só nome de novo", p_sigla: "ZZ", p_lado: "pn", p_vertente: "nenhuma",
      p_character_id: null, p_retrato_url: null, p_pv_atual: null, p_pv_max: null, p_condicoes: [],
      p_tamanho: antes!.tamanho, p_expected_revision: antes!.revision,
    }).single();
    const linha = data as { nome: string; tamanho: string; revision: number } | null;
    ok(
      "editar-atomico-3 (tamanho igual ao atual: mesma RPC, revisão ainda sobe só 1 — sem chamada de resize à toa)",
      !error && linha?.nome === "Só nome de novo" && linha?.tamanho === antes?.tamanho && linha?.revision === antes!.revision + 1,
      error ? error.message : `depois=${JSON.stringify(linha)}`,
    );
  }
  {
    const { data, error } = await cliJogador.rpc("edit_vtt_token", {
      p_token_id: tokenNovoId, p_nome: "Hack Atômico", p_sigla: "ZZ", p_lado: "pn", p_vertente: "nenhuma",
      p_character_id: null, p_retrato_url: null, p_pv_atual: null, p_pv_max: null, p_condicoes: [],
      p_tamanho: "medio", p_expected_revision: 999,
    });
    ok("editar-atomico-4 (jogador NÃO chama edit_vtt_token — narrador-only)", !!error && !data, error ? "recusado" : "PASSOU (FALHA)");
  }

  // ═══════════════════════════════════════════════════════════════
  // EDIÇÃO ATÔMICA × PEGADA PERSONALIZADA (migration 0077) — trocar
  // de categoria pelo formulário comum precisa LIMPAR uma pegada
  // personalizada antiga (o preset da categoria nova é quem manda);
  // não trocar de categoria precisa PRESERVAR uma pegada irregular
  // já existente; a validação, ao trocar, nunca pode usar a forma
  // ANTIGA.
  // ═══════════════════════════════════════════════════════════════
  let tokenPegadaId = "";
  {
    // Linha reta de 6 células (âncora + 5 à direita) — bem longe de
    // qualquer outro token/terreno já criado neste arquivo, isolada
    // numa região vazia da cena de 20×20.
    const pegada6x1 = [{ q: 0, r: 0 }, { q: 1, r: 0 }, { q: 2, r: 0 }, { q: 3, r: 0 }, { q: 4, r: 0 }, { q: 5, r: 0 }];
    const { data, error } = await cliNarrador.rpc("create_vtt_token", {
      p_scene_id: sceneId, p_campaign_id: campanhaId, p_nome: "Pegada Personalizada", p_sigla: "PP",
      p_lado: "pn", p_vertente: "nenhuma", p_tamanho: "grande", p_orientacao: 0, p_pegada_personalizada: pegada6x1,
      p_q: 9, p_r: 10, p_character_id: null, p_visivel: true, p_bloqueado: false,
      p_retrato_url: null, p_pv_atual: null, p_pv_max: null, p_condicoes: [],
    }).single();
    tokenPegadaId = (data as { id: string } | null)?.id ?? "";
    ok("pegada-0 (fixture: token com pegada personalizada 6×1 criado)", !error && !!tokenPegadaId, error ? error.message : `id=${tokenPegadaId.slice(0, 8)}`);
  }
  {
    // 1) Editar SÓ o nome (mesma categoria "grande") — a pegada
    // personalizada precisa sobreviver EXATAMENTE igual.
    const { data: antes } = await admin.from("vtt_tokens").select("pegada_personalizada, tamanho, revision, q, r, orientacao").eq("id", tokenPegadaId).single();
    const { data, error } = await cliNarrador.rpc("edit_vtt_token", {
      p_token_id: tokenPegadaId, p_nome: "Pegada Personalizada — Nome Só", p_sigla: "PP", p_lado: "pn", p_vertente: "nenhuma",
      p_character_id: null, p_retrato_url: null, p_pv_atual: null, p_pv_max: null, p_condicoes: [],
      p_tamanho: "grande", p_expected_revision: antes!.revision, // mesma categoria — nada de tamanho muda
    }).single();
    const linha = data as { nome: string; pegada_personalizada: unknown; revision: number } | null;
    ok(
      "pegada-1 (editar só o nome preserva a pegada personalizada exatamente, revisão sobe 1)",
      !error && linha?.nome === "Pegada Personalizada — Nome Só"
        && JSON.stringify(linha?.pegada_personalizada) === JSON.stringify(antes?.pegada_personalizada)
        && linha?.revision === antes!.revision + 1,
      error ? error.message : `antes=${JSON.stringify(antes?.pegada_personalizada)}, depois=${JSON.stringify(linha?.pegada_personalizada)}, revisão ${antes?.revision}→${linha?.revision}`,
    );
  }
  {
    // 2) Trocar categoria pra Médio — pegada vira o PRESET (1 célula),
    // `pegada_personalizada` vira null, q/r/orientação preservados.
    const { data: antes } = await admin.from("vtt_tokens").select("q, r, orientacao, revision").eq("id", tokenPegadaId).single();
    const { data, error } = await cliNarrador.rpc("edit_vtt_token", {
      p_token_id: tokenPegadaId, p_nome: "Pegada Virou Médio", p_sigla: "PP", p_lado: "pn", p_vertente: "nenhuma",
      p_character_id: null, p_retrato_url: null, p_pv_atual: null, p_pv_max: null, p_condicoes: [],
      p_tamanho: "medio", p_expected_revision: antes!.revision,
    }).single();
    const linha = data as { nome: string; tamanho: string; pegada_personalizada: unknown; q: number; r: number; orientacao: number; revision: number } | null;
    ok(
      "pegada-2 (trocar pra Médio: pegada_personalizada vira null, preset de 1 hex vale, q/r/orientação preservados, revisão sobe 1)",
      !error && linha?.tamanho === "medio" && linha?.pegada_personalizada === null
        && linha?.q === antes?.q && linha?.r === antes?.r && linha?.orientacao === antes?.orientacao
        && linha?.revision === antes!.revision + 1,
      error ? error.message : `depois=${JSON.stringify(linha)}`,
    );
  }
  {
    // 3) A pegada ANTIGA (6×1) colidiria com um bloqueio numa célula
    // que só ela tocava — mas o preset NOVO (Médio, 1 célula na
    // âncora) não passa nem perto. Se a validação usasse a forma
    // antiga por engano, isto seria recusado; a correção prova que
    // usa o preset novo.
    const pegada6x1 = [{ q: 0, r: 0 }, { q: 1, r: 0 }, { q: 2, r: 0 }, { q: 3, r: 0 }, { q: 4, r: 0 }, { q: 5, r: 0 }];
    const { data: criado } = await cliNarrador.rpc("create_vtt_token", {
      p_scene_id: sceneId, p_campaign_id: campanhaId, p_nome: "Pegada Antiga Colide", p_sigla: "PC",
      p_lado: "pn", p_vertente: "nenhuma", p_tamanho: "grande", p_orientacao: 0, p_pegada_personalizada: pegada6x1,
      p_q: 8, p_r: 12, p_character_id: null, p_visivel: true, p_bloqueado: false,
      p_retrato_url: null, p_pv_atual: null, p_pv_max: null, p_condicoes: [],
    }).single();
    const idColide = (criado as { id: string }).id;
    // Bloqueia a célula (11,12) — pertence à pegada ANTIGA (offset
    // {3,0}), mas fica longe da âncora (8,12) sozinha, fora do
    // preset Médio (só a própria âncora).
    await admin.from("vtt_terrain").upsert({ scene_id: sceneId, campaign_id: campanhaId, q: 11, r: 12, tipo: "bloqueado" });
    const { data: antes } = await admin.from("vtt_tokens").select("revision").eq("id", idColide).single();
    const { data, error } = await cliNarrador.rpc("edit_vtt_token", {
      p_token_id: idColide, p_nome: "Pegada Antiga Colide", p_sigla: "PC", p_lado: "pn", p_vertente: "nenhuma",
      p_character_id: null, p_retrato_url: null, p_pv_atual: null, p_pv_max: null, p_condicoes: [],
      p_tamanho: "medio", p_expected_revision: antes!.revision,
    }).single();
    const linha = data as { tamanho: string; pegada_personalizada: unknown } | null;
    ok(
      "pegada-3 (pegada antiga colidiria, preset novo cabe: edição ACEITA — prova que a validação não usou a forma antiga)",
      !error && linha?.tamanho === "medio" && linha?.pegada_personalizada === null,
      error ? `recusado por engano: ${error.message}` : `aceito, tamanho=${linha?.tamanho}`,
    );
    await admin.from("vtt_terrain").delete().eq("scene_id", sceneId).eq("q", 11).eq("r", 12);
  }
  {
    // 4) A pegada ANTIGA (2 células, cabe folgada perto da borda) —
    // mas o preset NOVO escolhido (Colossal, 12 células) não cabe
    // ali. A edição INTEIRA precisa ser recusada, sem tocar nome/
    // tamanho/pegada/revisão.
    const { data: criado } = await cliNarrador.rpc("create_vtt_token", {
      p_scene_id: sceneId, p_campaign_id: campanhaId, p_nome: "Cabe Mas Colossal Não", p_sigla: "CM",
      p_lado: "pn", p_vertente: "nenhuma", p_tamanho: "pequeno", p_orientacao: 0,
      p_pegada_personalizada: [{ q: 0, r: 0 }, { q: -1, r: 0 }], // âncora + vizinho à esquerda — cabe fácil na borda direita
      p_q: 19, p_r: 0, p_character_id: null, p_visivel: true, p_bloqueado: false,
      p_retrato_url: null, p_pv_atual: null, p_pv_max: null, p_condicoes: [],
    }).single();
    const idBorda = (criado as { id: string } | null)?.id ?? "";
    const { data: antes } = await admin.from("vtt_tokens").select("nome, tamanho, pegada_personalizada, revision").eq("id", idBorda).single();
    const { data, error } = await cliNarrador.rpc("edit_vtt_token", {
      p_token_id: idBorda, p_nome: "NÃO DEVE FICAR SALVO", p_sigla: "CM", p_lado: "pn", p_vertente: "nenhuma",
      p_character_id: null, p_retrato_url: null, p_pv_atual: null, p_pv_max: null, p_condicoes: [],
      p_tamanho: "colossal", p_expected_revision: antes!.revision,
    });
    const { data: depois } = await admin.from("vtt_tokens").select("nome, tamanho, pegada_personalizada, revision").eq("id", idBorda).single();
    ok(
      "pegada-4 (preset novo não cabe: edição INTEIRA recusada — nome, tamanho, pegada e revisão intocados)",
      !!error && !data
        && depois?.nome === antes?.nome && depois?.tamanho === antes?.tamanho
        && JSON.stringify(depois?.pegada_personalizada) === JSON.stringify(antes?.pegada_personalizada)
        && depois?.revision === antes?.revision,
      error ? `recusado: ${error.message.slice(0, 70)}` : "PASSOU (FALHA) — deveria ter sido recusado",
    );
  }

  // ═══════════════════════════════════════════════════════════════
  // NOMES AUTOMÁTICOS (`vtt_alocar_nome_automatico`, migration 0078)
  // — cada cenário usa uma cena ISOLADA nova, pra nunca depender da
  // ordem/estado deixado por outro teste deste arquivo.
  // ═══════════════════════════════════════════════════════════════
  async function novaCenaIsolada(nome: string): Promise<string> {
    const { data } = await admin.from("vtt_scenes").insert({ campaign_id: campanhaId, nome, largura: 20, altura: 20 }).select("id").single();
    return data!.id as string;
  }
  async function criarComNome(cena: string, nome: string, sigla: string, q: number, r: number) {
    return cliNarrador.rpc("create_vtt_token", {
      p_scene_id: cena, p_campaign_id: campanhaId, p_nome: nome, p_sigla: sigla,
      p_lado: "pn", p_vertente: "nenhuma", p_tamanho: "medio", p_orientacao: 0, p_pegada_personalizada: null,
      p_q: q, p_r: r, p_character_id: null, p_visivel: true, p_bloqueado: false,
      p_retrato_url: null, p_pv_atual: null, p_pv_max: null, p_condicoes: [],
    }).single();
  }

  {
    const cenaNomes = await novaCenaIsolada("Nomes — sequência");

    // nome-1: nome manual permanece intacto.
    const { data: manual, error: eManual } = await criarComNome(cenaNomes, "Sentinela Manual", "SM", 0, 0);
    const lManual = manual as { nome: string; sigla: string } | null;
    ok("nome-1 (nome manual permanece intacto, sigla manual também)", !eManual && lManual?.nome === "Sentinela Manual" && lManual?.sigla === "SM", eManual ? eManual.message : `nome="${lManual?.nome}", sigla="${lManual?.sigla}"`);

    // nome-2: vazio vira #1 (nome E sigla vazios — sigla derivada do número).
    const { data: auto1, error: eAuto1 } = await criarComNome(cenaNomes, "", "", 1, 0);
    const lAuto1 = auto1 as { nome: string; sigla: string } | null;
    ok("nome-2 (nome vazio vira #1, sigla derivada '1' — RPC devolve os dois definitivos)", !eAuto1 && lAuto1?.nome === "#1" && lAuto1?.sigla === "1", eAuto1 ? eAuto1.message : `nome="${lAuto1?.nome}", sigla="${lAuto1?.sigla}"`);

    // nome-3: sequência #1, #2, #3.
    const { data: auto2 } = await criarComNome(cenaNomes, "", "", 2, 0);
    const { data: auto3 } = await criarComNome(cenaNomes, "", "", 3, 0);
    const l2 = auto2 as { nome: string } | null; const l3 = auto3 as { nome: string } | null;
    ok("nome-3 (sequência #1, #2, #3)", l2?.nome === "#2" && l3?.nome === "#3", `#2="${l2?.nome}", #3="${l3?.nome}"`);

    // nome-4: lacuna escolhe o menor disponível — apaga #2, cria de novo, espera #2 (não #4).
    await admin.from("vtt_tokens").delete().eq("scene_id", cenaNomes).eq("nome", "#2");
    const { data: preencheLacuna } = await criarComNome(cenaNomes, "", "", 4, 0);
    const lLacuna = preencheLacuna as { nome: string } | null;
    ok("nome-4 (lacuna: com #1 e #3 ocupados, o próximo automático é #2, não #4)", lLacuna?.nome === "#2", `nome="${lLacuna?.nome}"`);
  }

  {
    // nome-5: "Goblin #1" (nome manual que só PARECE um automático) nunca ocupa #1 de verdade.
    const cenaGoblin = await novaCenaIsolada("Nomes — Goblin #1");
    await criarComNome(cenaGoblin, "Goblin #1", "GB", 0, 0);
    const { data: apesarDoGoblin } = await criarComNome(cenaGoblin, "", "", 1, 0);
    const lGoblin = apesarDoGoblin as { nome: string } | null;
    ok("nome-5 ('Goblin #1' não ocupa #1 — o automático ainda é #1)", lGoblin?.nome === "#1", `nome="${lGoblin?.nome}"`);
  }

  {
    // nome-6: espaços em branco contam como vazio.
    const cenaEspacos = await novaCenaIsolada("Nomes — espaços");
    const { data: comEspacos } = await criarComNome(cenaEspacos, "   ", "  ", 0, 0);
    const lEspacos = comEspacos as { nome: string; sigla: string } | null;
    ok("nome-6 (nome só de espaços conta como vazio: vira #1, sigla derivada)", lEspacos?.nome === "#1" && lEspacos?.sigla === "1", `nome="${lEspacos?.nome}", sigla="${lEspacos?.sigla}"`);
  }

  {
    // nome-7: duas criações CONCORRENTES na MESMA cena recebem números diferentes — prova a trava, não uma corrida "sortuda".
    const cenaConcorrencia = await novaCenaIsolada("Nomes — concorrência");
    const [ra, rb] = await Promise.all([
      criarComNome(cenaConcorrencia, "", "", 0, 0),
      criarComNome(cenaConcorrencia, "", "", 1, 0),
    ]);
    const nomeA = (ra.data as { nome: string } | null)?.nome;
    const nomeB = (rb.data as { nome: string } | null)?.nome;
    const doisNomes = new Set([nomeA, nomeB]);
    ok(
      "nome-7 (duas criações concorrentes na mesma cena recebem números DIFERENTES)",
      !ra.error && !rb.error && doisNomes.size === 2 && doisNomes.has("#1") && doisNomes.has("#2"),
      `nomeA="${nomeA}", nomeB="${nomeB}"`,
    );
  }

  {
    // nome-8: cenas diferentes (inclusive em CAMPANHAS diferentes) têm sequências independentes.
    const cenaIndependente = await novaCenaIsolada("Nomes — independente 1");
    await criarComNome(cenaIndependente, "", "", 0, 0);
    await criarComNome(cenaIndependente, "", "", 1, 0); // essa cena já tem #1 e #2
    const { data: outraCenaMesmaCampanha } = await criarComNome(await novaCenaIsolada("Nomes — independente 2"), "", "", 0, 0);
    const lOutraMesmaCampanha = outraCenaMesmaCampanha as { nome: string } | null;
    ok("nome-8a (outra cena, MESMA campanha, começa em #1 de novo)", lOutraMesmaCampanha?.nome === "#1", `nome="${lOutraMesmaCampanha?.nome}"`);

    // outraSceneId pertence a `outraCampanhaId` (dono: estranho) — usa o client dele.
    const { data: cenaDeOutraCampanha, error: eOutraCampanha } = await cliEstranho.rpc("create_vtt_token", {
      p_scene_id: outraSceneId, p_campaign_id: outraCampanhaId, p_nome: "", p_sigla: "",
      p_lado: "pn", p_vertente: "nenhuma", p_tamanho: "medio", p_orientacao: 0, p_pegada_personalizada: null,
      p_q: 0, p_r: 0, p_character_id: null, p_visivel: true, p_bloqueado: false,
      p_retrato_url: null, p_pv_atual: null, p_pv_max: null, p_condicoes: [],
    }).single();
    const lOutraCampanha = cenaDeOutraCampanha as { nome: string } | null;
    ok("nome-8b (cena de OUTRA campanha começa em #1 também — numeração é por cena, nunca por campanha)", !eOutraCampanha && lOutraCampanha?.nome === "#1", eOutraCampanha ? eOutraCampanha.message : `nome="${lOutraCampanha?.nome}"`);
    await admin.from("vtt_tokens").delete().eq("scene_id", outraSceneId);
  }

  {
    // nome-9: criação RECUSADA (pegada fora do mapa) não consome permanentemente um número — a alocação e o insert estão na MESMA transação, então uma falha reverte os dois juntos.
    const cenaRecusa = await novaCenaIsolada("Nomes — recusa não consome");
    const { data: falhou, error: eFalhou } = await criarComNome(cenaRecusa, "", "", 500, 500); // fora do mapa
    ok("nome-9a (tentativa com posição inválida é recusada de verdade)", !!eFalhou && !falhou, eFalhou ? "recusado" : "PASSOU (FALHA)");
    const { data: depoisDaFalha } = await criarComNome(cenaRecusa, "", "", 0, 0);
    const lDepoisDaFalha = depoisDaFalha as { nome: string } | null;
    ok("nome-9b (depois da falha, a próxima criação automática ainda é #1 — nenhum número foi 'queimado')", lDepoisDaFalha?.nome === "#1", `nome="${lDepoisDaFalha?.nome}"`);
  }

  {
    // nome-10: edição também gera automático (mesma regra) e exclui o próprio token da checagem de "#N ocupado".
    const cenaEdicao = await novaCenaIsolada("Nomes — edição");
    const { data: criadoParaEditar } = await criarComNome(cenaEdicao, "Editável", "ED", 0, 0);
    const lCriado = criadoParaEditar as { id: string; revision: number } | null;
    const { data: editado, error: eEditado } = await cliNarrador.rpc("edit_vtt_token", {
      p_token_id: lCriado!.id, p_nome: "", p_sigla: "", p_lado: "pn", p_vertente: "nenhuma",
      p_character_id: null, p_retrato_url: null, p_pv_atual: null, p_pv_max: null, p_condicoes: [],
      p_tamanho: "medio", p_expected_revision: lCriado!.revision,
    }).single();
    const lEditado = editado as { nome: string; sigla: string; revision: number } | null;
    ok("nome-10a (edição com nome vazio também gera automático — mesma regra)", !eEditado && lEditado?.nome === "#1" && lEditado?.sigla === "1", eEditado ? eEditado.message : `nome="${lEditado?.nome}", sigla="${lEditado?.sigla}"`);

    // Limpa o nome de novo (já é "#1") — deveria RECLAMAR "#1" pra si mesmo, não pular pra "#2".
    const { data: editadoDeNovo, error: eDeNovo } = await cliNarrador.rpc("edit_vtt_token", {
      p_token_id: lCriado!.id, p_nome: "", p_sigla: "", p_lado: "pn", p_vertente: "nenhuma",
      p_character_id: null, p_retrato_url: null, p_pv_atual: null, p_pv_max: null, p_condicoes: [],
      p_tamanho: "medio", p_expected_revision: lEditado!.revision,
    }).single();
    const lDeNovo = editadoDeNovo as { nome: string } | null;
    ok("nome-10b (token que já é '#1' reclama '#1' de novo ao ter o nome limpo — nunca pula por causa de si mesmo)", !eDeNovo && lDeNovo?.nome === "#1", eDeNovo ? eDeNovo.message : `nome="${lDeNovo?.nome}"`);
  }

  // ═══════════════════════════════════════════════════════════════
  // vtt_alocar_nome_automatico É PRIVADO (migration 0079) — helper
  // interno de `create_vtt_token`/`edit_vtt_token`, nunca chamável
  // diretamente por um cliente autenticado. Prova as duas pontas:
  // (a) chamada direta é recusada pra QUALQUER papel (narrador E
  // jogador — não é uma questão de autorização de conteúdo, é
  // ausência total de `grant execute`); (b) criação/edição continuam
  // gerando nomes automáticos normalmente por dentro (já provado pelos
  // testes nome-1..10b acima, mas confirmado aqui de novo lado a lado
  // com a recusa, pra deixar claro que uma coisa não quebrou a outra).
  // ═══════════════════════════════════════════════════════════════
  {
    const cenaParaHelper = await novaCenaIsolada("Helper Privado");

    const { error: eNarrador } = await cliNarrador.rpc("vtt_alocar_nome_automatico", { p_scene_id: cenaParaHelper, p_excluir_token_id: null });
    ok(
      "helper-1 (narrador não consegue chamar vtt_alocar_nome_automatico diretamente — sem grant execute nenhum)",
      !!eNarrador && /permission denied|function .* does not exist/i.test(eNarrador.message),
      eNarrador ? eNarrador.message : "chamada foi aceita — deveria ter sido recusada",
    );

    const { error: eJogador } = await cliJogador.rpc("vtt_alocar_nome_automatico", { p_scene_id: cenaParaHelper, p_excluir_token_id: null });
    ok(
      "helper-2 (jogador também não consegue chamar vtt_alocar_nome_automatico diretamente)",
      !!eJogador && /permission denied|function .* does not exist/i.test(eJogador.message),
      eJogador ? eJogador.message : "chamada foi aceita — deveria ter sido recusada",
    );

    // Mesmo com o helper inacessível diretamente, criar/editar continuam gerando "#N" normalmente — a chamada INTERNA (função→função, mesmo dono) não depende do grant que acabou de ser revogado dos papéis de cliente.
    const { data: criado, error: eCriado } = await cliNarrador.rpc("create_vtt_token", {
      p_scene_id: cenaParaHelper, p_campaign_id: campanhaId, p_nome: "", p_sigla: "",
      p_lado: "pn", p_vertente: "nenhuma", p_tamanho: "medio", p_orientacao: 0, p_pegada_personalizada: null,
      p_q: 3, p_r: 3, p_character_id: null, p_visivel: true, p_bloqueado: false,
      p_retrato_url: null, p_pv_atual: null, p_pv_max: null, p_condicoes: [],
    }).single();
    const lCriadoHelper = criado as { nome: string; sigla: string } | null;
    ok(
      "helper-3 (criação continua gerando nome automático '#1' normalmente — a chamada INTERNA não foi afetada pela revogação)",
      !eCriado && lCriadoHelper?.nome === "#1" && lCriadoHelper?.sigla === "1",
      eCriado ? eCriado.message : `nome="${lCriadoHelper?.nome}", sigla="${lCriadoHelper?.sigla}"`,
    );
  }

  // ═══════════════════════════════════════════════════════════════
  // DUPLICAÇÃO / REMOÇÃO
  // ═══════════════════════════════════════════════════════════════
  {
    const { data, error } = await cliJogador.rpc("duplicate_vtt_token", { p_token_id: tokenNovoId, p_q: 2, p_r: 2 });
    ok("duplicar-1 (jogador NÃO duplica token — narrador-only)", !!error && !data, error ? "recusado" : "PASSOU (FALHA)");
  }
  let tokenDuplicadoId = "";
  {
    await admin.from("vtt_tokens").update({ character_id: null, bloqueado: true }).eq("id", tokenNovoId);
    const { data, error } = await cliNarrador.rpc("duplicate_vtt_token", { p_token_id: tokenNovoId, p_q: 3, p_r: 3 }).single();
    const linha = data as { id: string; character_id: string | null; bloqueado: boolean } | null;
    tokenDuplicadoId = linha?.id ?? "";
    ok(
      "duplicar-2 (id novo, nunca copia character_id, nunca nasce travado — mesmo se a origem estava travada)",
      !error && !!linha && linha.id !== tokenNovoId && linha.character_id === null && linha.bloqueado === false,
      error ? error.message : `id novo=${linha?.id !== tokenNovoId}, character_id=${linha?.character_id}, bloqueado=${linha?.bloqueado}`,
    );
  }
  {
    const { data, error } = await cliNarrador.rpc("duplicate_vtt_token", { p_token_id: tokenNovoId, p_q: 3, p_r: 3 });
    ok("duplicar-3 (duplicar numa posição já ocupada — pela própria cópia anterior — é recusado)", !!error && !data, error ? `recusado: ${error.message.slice(0, 60)}` : "PASSOU (FALHA)");
  }
  {
    const { data, error } = await cliJogador.rpc("delete_vtt_token", { p_token_id: tokenDuplicadoId });
    ok("remover-1 (jogador NÃO remove token — narrador-only)", !!error, error ? "recusado" : "PASSOU (FALHA)");
  }
  {
    const { error } = await cliNarrador.rpc("delete_vtt_token", { p_token_id: tokenDuplicadoId });
    const { data: aindaExiste } = await admin.from("vtt_tokens").select("id").eq("id", tokenDuplicadoId).maybeSingle();
    ok("remover-2 (narrador remove — linha desaparece de verdade, sem exclusão lógica)", !error && !aindaExiste, error ? error.message : `ainda existe=${!!aindaExiste}`);
  }

  // ═══════════════════════════════════════════════════════════════
  // VISIBILIDADE / CONTROLE
  // ═══════════════════════════════════════════════════════════════
  {
    const { data, error } = await cliJogador.rpc("set_vtt_token_flags", { p_token_id: tokenNovoId, p_visivel: false, p_bloqueado: false });
    const { data: vistoJogador } = await cliJogador.from("vtt_tokens").select("id").eq("id", tokenNovoId).maybeSingle();
    const { data: vistoNarrador } = await cliNarrador.from("vtt_tokens").select("id").eq("id", tokenNovoId).maybeSingle();
    ok(
      "visibilidade-1 (jogador NÃO chama set_vtt_token_flags; narrador precisa ocultar pra confirmar o efeito)",
      !!error, error ? "recusado" : "PASSOU (FALHA)",
    );
    await cliNarrador.rpc("set_vtt_token_flags", { p_token_id: tokenNovoId, p_visivel: false, p_bloqueado: false });
    const { data: vistoJogador2 } = await cliJogador.from("vtt_tokens").select("id, nome").eq("id", tokenNovoId).maybeSingle();
    const { data: vistoNarrador2 } = await cliNarrador.from("vtt_tokens").select("id").eq("id", tokenNovoId).maybeSingle();
    ok(
      "visibilidade-2 (token oculto: RLS remove a linha inteira pro jogador — não é filtro de UI)",
      !vistoJogador2 && !!vistoNarrador2,
      `jogador vê=${!!vistoJogador2}, narrador vê=${!!vistoNarrador2}`,
    );
    void vistoJogador; void vistoNarrador;
  }
  {
    // Vincula o token oculto ao personagem do jogador2 (sem controle) e
    // testa: mesmo tendo characterId setado, sem `character_controllers`
    // ele não controla — prova que o modelo NUNCA é só `characterId!==null`.
    const personagem2Id = randomUUID();
    await admin.from("characters").insert({ id: personagem2Id, name: "PJ2 sem controle", status: "draft", payload: {}, campaign_id: campanhaId, owner_id: jogador2.id });
    criados.personagens.push(personagem2Id);
    await admin.from("vtt_tokens").update({ character_id: personagem2Id }).eq("id", tokenNovoId);
    const { data: atual } = await admin.from("vtt_tokens").select("revision, q, r, visivel").eq("id", tokenNovoId).single();
    await admin.from("vtt_tokens").update({ visivel: true }).eq("id", tokenNovoId); // revela de novo pra poder tentar mover
    const { data, error } = await cliJogador2.rpc("move_vtt_token", {
      p_token_id: tokenNovoId, p_rota: [{ q: atual!.q, r: atual!.r }, { q: atual!.q + 1, r: atual!.r }], p_expected_revision: atual!.revision + 1,
    });
    ok(
      "controle-1 (character_id setado SEM character_controllers NÃO dá controle — jogador2 não move)",
      !!error && !data, error ? "recusado" : "PASSOU (FALHA GRAVE — controle inferido só por characterId)",
    );
  }
  {
    // Agora concede controle de verdade e confirma que passa a mover.
    await admin.from("character_controllers").insert({ character_id: personagemId, campaign_id: campanhaId, user_id: jogador2.id }).select();
    // (jogador2 ganha controle do MESMO personagem que já pertence ao jogador1 — cenário de "reatribuir controle")
    await admin.from("vtt_tokens").update({ character_id: personagemId }).eq("id", tokenNovoId);
    const { data: atual } = await admin.from("vtt_tokens").select("revision, q, r").eq("id", tokenNovoId).single();
    const { data, error } = await cliJogador2.rpc("move_vtt_token", {
      p_token_id: tokenNovoId, p_rota: [{ q: atual!.q, r: atual!.r }, { q: atual!.q + 1, r: atual!.r }], p_expected_revision: atual!.revision,
    });
    const linha = Array.isArray(data) ? data[0] : data;
    ok("controle-2 (com character_controllers de verdade, jogador2 move o token)", !error && linha?.q === atual!.q + 1, error ? error.message : `q=${linha?.q}`);
  }
  {
    // Move sobre uma célula ocupada por um token OCULTO — mensagem
    // genérica, nunca revela o que está lá. Posiciona o espião ADJACENTE
    // à posição atual do token do jogador2 (rota de 1 passo, sempre
    // vizinha — migration 0069 exige adjacência estrita entre pontos
    // consecutivos, senão o erro seria de continuidade, não de colisão).
    const { data: atual } = await admin.from("vtt_tokens").select("revision, q, r").eq("id", tokenNovoId).single();
    const alvo = { q: atual!.q + 1, r: atual!.r };
    const { data: tokenOculto } = await admin.from("vtt_tokens")
      .insert({ scene_id: sceneId, campaign_id: campanhaId, nome: "Espião oculto", sigla: "ES", lado: "pn", q: alvo.q, r: alvo.r, visivel: false })
      .select("id").single();
    const { error } = await cliJogador2.rpc("move_vtt_token", {
      p_token_id: tokenNovoId, p_rota: [{ q: atual!.q, r: atual!.r }, alvo], p_expected_revision: atual!.revision,
    });
    const mensagemGenerica = !!error && /posição indisponível/i.test(error.message) && !error.message.toLowerCase().includes("espião") && !error.message.toLowerCase().includes("oculto");
    ok(
      "controle-3 (bloqueio por token OCULTO usa mensagem genérica — nunca vaza nome/identidade)",
      mensagemGenerica, error ? `"${error.message}"` : "PASSOU (FALHA — moveu sobre token oculto)",
    );
    await admin.from("vtt_tokens").delete().eq("id", tokenOculto!.id);
  }
  {
    const { error } = await admin.from("vtt_tokens").update({ condicoes: ["condicao_inventada"] }).eq("id", tokenNovoId);
    ok("dados-1 (CHECK rejeita slug de condição fora da lista conhecida)", !!error && /check constraint/i.test(error.message), error ? "rejeitado" : "PASSOU (FALHA)");
  }
  {
    const { error } = await admin.from("vtt_tokens").update({ pv_atual: 50, pv_max: 10 }).eq("id", tokenNovoId);
    ok("dados-2 (CHECK rejeita pv_atual > pv_max)", !!error && /check constraint/i.test(error.message), error ? "rejeitado" : "PASSOU (FALHA)");
  }

  // ═══════════════════════════════════════════════════════════════
  // PING
  // ═══════════════════════════════════════════════════════════════
  {
    const { data, error } = await cliEstranho.rpc("vtt_ping", { p_campaign_id: campanhaId, p_scene_id: sceneId, p_q: 1, p_r: 1 });
    ok("ping-1 (não-membro NÃO envia ping)", !!error && data !== true, error ? "recusado" : "PASSOU (FALHA)");
  }
  {
    const { data, error } = await anonSemSessao.rpc("vtt_ping", { p_campaign_id: campanhaId, p_scene_id: sceneId, p_q: 1, p_r: 1 });
    ok("ping-2 (sem sessão / anon NÃO envia ping)", !!error && data !== true, error ? "recusado" : "PASSOU (FALHA)");
  }
  {
    const { data, error } = await cliNarrador.rpc("vtt_ping", { p_campaign_id: campanhaId, p_scene_id: outraSceneId, p_q: 1, p_r: 1 });
    ok("ping-3 (cena de OUTRA campanha é recusada, mesmo o narrador sendo dono das duas)", !!error && data !== true, error ? `recusado: ${error.message.slice(0, 60)}` : "PASSOU (FALHA)");
  }
  {
    const { data, error } = await cliNarrador.rpc("vtt_ping", { p_campaign_id: campanhaId, p_scene_id: sceneId, p_q: 500, p_r: 500 });
    ok("ping-4 (hex fora dos limites da cena é recusado)", !!error && data !== true, error ? `recusado: ${error.message.slice(0, 60)}` : "PASSOU (FALHA)");
  }
  {
    const { data: dNarrador, error: eNarrador } = await cliNarrador.rpc("vtt_ping", { p_campaign_id: campanhaId, p_scene_id: sceneId, p_q: 2, p_r: 2 });
    const { data: dJogador, error: eJogador } = await cliJogador.rpc("vtt_ping", { p_campaign_id: campanhaId, p_scene_id: sceneId, p_q: 3, p_r: 3 });
    ok("ping-5 (narrador E jogador podem enviar ping — ferramenta dos dois papéis)", dNarrador === true && dJogador === true && !eNarrador && !eJogador, `narrador=${dNarrador}, jogador=${dJogador}`);
  }
  {
    const { count: antes } = await admin.from("vtt_marks").select("id", { count: "exact", head: true }).eq("scene_id", sceneId);
    await cliNarrador.rpc("vtt_ping", { p_campaign_id: campanhaId, p_scene_id: sceneId, p_q: 4, p_r: 4 });
    const { count: depois } = await admin.from("vtt_marks").select("id", { count: "exact", head: true }).eq("scene_id", sceneId);
    ok("ping-6 (ping nunca cria uma marca persistida)", antes === depois, `antes=${antes}, depois=${depois}`);
  }
  {
    // Rate limit: janela de 3s, máx 5 — a 6ª chamada em sequência rápida devolve `false`, não erro.
    const resultados: (boolean | null)[] = [];
    for (let i = 0; i < 6; i++) {
      const { data, error } = await cliJogador2.rpc("vtt_ping", { p_campaign_id: campanhaId, p_scene_id: sceneId, p_q: 5, p_r: 5 });
      resultados.push(error ? null : (data as boolean));
    }
    const seisChamadas = resultados.every((r) => r !== null); // nenhuma virou ERRO
    const ultimaFalsa = resultados[5] === false;
    ok(
      "ping-7 (rate limit: 6ª chamada em <3s devolve `false`, nunca lança erro — nunca revela limite via exceção)",
      seisChamadas && ultimaFalsa, `resultados=${JSON.stringify(resultados)}`,
    );
  }
  {
    // Confirma que a tabela de throttle não tem grant nenhum pra authenticated — só a RPC (security definer) toca.
    const { error } = await cliNarrador.from("vtt_ping_throttle").select("*").limit(1);
    ok("ping-8 (vtt_ping_throttle sem SELECT direto pra authenticated — só a RPC toca)", !!error, error ? "recusado" : "PASSOU (FALHA — leitura direta permitida)");
  }

  // ═══════════════════════════════════════════════════════════════
  // CAMADAS — tolerância de localStorage (função pura, sem rede)
  // ═══════════════════════════════════════════════════════════════
  {
    const armazenamento = new Map<string, string>();
    (globalThis as unknown as { window: unknown }).window = {
      localStorage: {
        getItem: (k: string) => armazenamento.get(k) ?? null,
        setItem: (k: string, v: string) => { armazenamento.set(k, v); },
      },
    };
    const mod = await import("../../src/app/mesas/[campaignId]/vtt/_shell/PainelCamadas");
    const chave = mod.chaveCamadas("user-1", "camp-1", "scene-1");

    const semNada = mod.carregarPreferenciaCamadas(chave);
    ok("camadas-1 (chave ausente → padrão, tudo visível/destravado)", JSON.stringify(semNada) === JSON.stringify(mod.CAMADAS_PADRAO), JSON.stringify(semNada));

    armazenamento.set(chave, "{ isto não é json");
    const corrompido = mod.carregarPreferenciaCamadas(chave);
    ok("camadas-2 (JSON corrompido → padrão, nunca lança)", JSON.stringify(corrompido) === JSON.stringify(mod.CAMADAS_PADRAO), "ok, sem exceção");

    armazenamento.set(chave, JSON.stringify({ tokens: { visivel: false, bloqueada: true } })); // schema velho, faltando camadas novas
    const parcial = mod.carregarPreferenciaCamadas(chave);
    ok(
      "camadas-3 (schema velho: camada presente é respeitada, camadas ausentes caem no padrão)",
      parcial.tokens.visivel === false && parcial.tokens.bloqueada === true && parcial.pings.visivel === true,
      JSON.stringify(parcial),
    );

    armazenamento.set(chave, JSON.stringify({ tokens: "não é um objeto válido", grade: { visivel: false, bloqueada: false }, camadaQueNaoExisteMais: { visivel: false, bloqueada: true } }));
    const invalido = mod.carregarPreferenciaCamadas(chave);
    ok(
      "camadas-4 (valor inválido numa camada não contamina as outras; camada removida do código é ignorada)",
      invalido.tokens.visivel === true && invalido.grade.visivel === false,
      JSON.stringify(invalido),
    );

    mod.salvarPreferenciaCamadas(chave, { ...mod.CAMADAS_PADRAO, marcas: { visivel: false, bloqueada: true } });
    const relido = mod.carregarPreferenciaCamadas(chave);
    ok("camadas-5 (salvar → reler devolve exatamente o que foi salvo)", relido.marcas.visivel === false && relido.marcas.bloqueada === true, JSON.stringify(relido.marcas));

    ok(
      "camadas-6 (chave versionada inclui usuário, campanha e cena — nunca vaza entre cenas/usuários diferentes)",
      chave.includes("user-1") && chave.includes("camp-1") && chave.includes("scene-1") && chave.startsWith("rv-camadas:v"),
      chave,
    );

    const comBloqueio = mod.CAMADAS_DEFINICAO.filter((d) => d.temBloqueio).map((d) => d.id).sort();
    ok(
      "camadas-7 (só terrenoFuncional/marcas/tokens têm bloqueio de interação — as demais só visibilidade)",
      JSON.stringify(comBloqueio) === JSON.stringify(["marcas", "terrenoFuncional", "tokens"]),
      JSON.stringify(comBloqueio),
    );
  }

  // ── Limpeza ────────────────────────────────────────────────────
  const restos: string[] = [];
  await admin.from("vtt_tokens").delete().eq("campaign_id", campanhaId);
  await admin.from("vtt_tokens").delete().eq("campaign_id", outraCampanhaId);
  await admin.from("vtt_terrain").delete().eq("campaign_id", campanhaId);
  await admin.from("vtt_scenes").delete().eq("campaign_id", campanhaId);
  await admin.from("vtt_scenes").delete().eq("campaign_id", outraCampanhaId);
  for (const id of criados.personagens) {
    await admin.from("character_controllers").delete().eq("character_id", id);
    const { error } = await admin.from("characters").delete().eq("id", id);
    if (error) restos.push(`personagem ${id}: ${error.message}`);
  }
  for (const id of criados.campanhas) {
    const { error } = await admin.from("campaigns").delete().eq("id", id);
    if (error) restos.push(`campanha ${id}: ${error.message}`);
  }
  for (const id of criados.usuarios) {
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) restos.push(`usuário ${id}: ${error.message}`);
  }
  ok("L (limpeza de fixtures)", restos.length === 0, restos.length ? `PENDENTE: ${restos.join("; ")}` : `${criados.usuarios.length} usuário(s) e ${criados.campanhas.length} campanha(s) removidos`);

  console.log(`\n${passou} ok, ${falhou} falha(s).`);
  if (falhou > 0) process.exit(1);
}

main().catch((e) => { console.error("Erro fatal:", e); process.exit(1); });
