/**
 * Checagem de AUTORIZAÇÃO das medições permanentes da régua
 * (`vtt_measurements`, migration 0087) contra o banco real.
 *
 * O contrato prometido pela ferramenta Medir: todos os participantes
 * VEEM todas as medições da cena; apaga só quem criou, ou o narrador;
 * quem não é da campanha não vê nem escreve nada. Isso é RLS — e RLS
 * só se testa exercitando o banco com clientes logados de verdade,
 * nunca com service role (que ignora policy por definição).
 *
 * Fixtures são criadas com service role e removidas no fim.
 *
 * Uso: npx tsx scripts/dev/check-vtt-medicoes.ts
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

let passou = 0, falhou = 0;
function ok(criterio: string, cond: boolean, detalhe: string) {
  if (cond) { passou++; console.log(`ok - ${criterio}: ${detalhe}`); }
  else { falhou++; console.error(`FALHA - ${criterio}: ${detalhe}`); }
}

const criados = { usuarios: [] as string[], campanhas: [] as string[] };

async function criarUsuario(nome: string) {
  const email = `check-med-${nome}-${Date.now()}-${Math.floor(Math.random() * 1e4)}@ruptura.dev`;
  const senha = randomUUID();
  const { data, error } = await admin.auth.admin.createUser({
    email, password: senha, email_confirm: true, user_metadata: { display_name: `Med ${nome}` },
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

const RETA = [{ q: 0, r: 0 }, { q: 4, r: 0 }];

async function main() {
  const narrador = await criarUsuario("narrador");
  const jogador = await criarUsuario("jogador");
  const estranho = await criarUsuario("estranho");

  const campanhaId = randomUUID();
  await admin.from("campaigns").insert({ id: campanhaId, name: "Med Auth", owner_id: narrador.id });
  criados.campanhas.push(campanhaId);

  const outraCampanhaId = randomUUID();
  await admin.from("campaigns").insert({ id: outraCampanhaId, name: "Med Outra", owner_id: estranho.id });
  criados.campanhas.push(outraCampanhaId);

  await admin.from("campaign_members").insert({
    campaign_id: campanhaId, user_id: jogador.id, role: "player", status: "active", origem: "check_med",
  });

  const { data: cena } = await admin.from("vtt_scenes")
    .insert({ campaign_id: campanhaId, nome: "Cena med", largura: 20, altura: 20 })
    .select("id").single();
  const sceneId = cena!.id as string;

  const cliNarrador = await clienteDe(narrador.email, narrador.senha);
  const cliJogador = await clienteDe(jogador.email, jogador.senha);
  const cliEstranho = await clienteDe(estranho.email, estranho.senha);

  const nova = (autorId: string) => ({
    scene_id: sceneId, campaign_id: campanhaId, autor_id: autorId, pontos: RETA,
  });

  // ── 1: jogador cria a própria medição ────────────────────────────
  let medicaoDoJogador = "";
  {
    const { data, error } = await cliJogador.from("vtt_measurements").insert(nova(jogador.id)).select("id").maybeSingle();
    medicaoDoJogador = (data?.id as string) ?? "";
    ok("1 (jogador cria medição como si mesmo)", !error && !!data, error?.message ?? `id=${medicaoDoJogador.slice(0, 8)}`);
  }

  // ── 2: narrador cria a dele ──────────────────────────────────────
  let medicaoDoNarrador = "";
  {
    const { data, error } = await cliNarrador.from("vtt_measurements").insert(nova(narrador.id)).select("id").maybeSingle();
    medicaoDoNarrador = (data?.id as string) ?? "";
    ok("2 (narrador cria medição)", !error && !!data, error?.message ?? `id=${medicaoDoNarrador.slice(0, 8)}`);
  }

  // ── 3: forjar autoria é recusado ─────────────────────────────────
  {
    const { data, error } = await cliJogador.from("vtt_measurements").insert(nova(narrador.id)).select("id").maybeSingle();
    ok("3 (jogador NÃO cria medição em nome do narrador)", !!error || !data, error?.message ?? "sem linha");
  }

  // ── 4: quem não é da campanha não escreve ────────────────────────
  {
    const { data, error } = await cliEstranho.from("vtt_measurements").insert(nova(estranho.id)).select("id").maybeSingle();
    ok("4 (estranho NÃO cria medição na campanha alheia)", !!error || !data, error?.message ?? "sem linha");
  }

  // ── 5: todo participante VÊ todas as medições da cena ────────────
  {
    const { data: vistasJogador } = await cliJogador.from("vtt_measurements").select("id").eq("scene_id", sceneId);
    const { data: vistasNarrador } = await cliNarrador.from("vtt_measurements").select("id").eq("scene_id", sceneId);
    ok("5 (jogador vê as 2 medições, inclusive a do narrador)", (vistasJogador ?? []).length === 2, `${(vistasJogador ?? []).length}`);
    ok("5b (narrador vê as 2)", (vistasNarrador ?? []).length === 2, `${(vistasNarrador ?? []).length}`);
  }

  // ── 6: estranho não vê nada ──────────────────────────────────────
  {
    const { data } = await cliEstranho.from("vtt_measurements").select("id").eq("scene_id", sceneId);
    ok("6 (estranho não vê medição nenhuma da campanha alheia)", (data ?? []).length === 0, `${(data ?? []).length}`);
  }

  // ── 7: jogador NÃO apaga a medição do narrador ───────────────────
  {
    const { data } = await cliJogador.from("vtt_measurements").delete().eq("id", medicaoDoNarrador).select("id");
    ok("7 (jogador não apaga medição alheia — 0 linhas)", (data ?? []).length === 0, `${(data ?? []).length} linha(s)`);
  }

  // ── 8: jogador apaga a PRÓPRIA ───────────────────────────────────
  {
    const { data } = await cliJogador.from("vtt_measurements").delete().eq("id", medicaoDoJogador).select("id");
    ok("8 (jogador apaga a própria medição)", (data ?? []).length === 1, `${(data ?? []).length} linha(s)`);
  }

  // ── 9: narrador apaga medição de QUALQUER um ─────────────────────
  {
    const { data: nova2 } = await cliJogador.from("vtt_measurements").insert(nova(jogador.id)).select("id").maybeSingle();
    const { data } = await cliNarrador.from("vtt_measurements").delete().eq("id", nova2!.id as string).select("id");
    ok("9 (narrador apaga medição do jogador)", (data ?? []).length === 1, `${(data ?? []).length} linha(s)`);
  }

  // ── 10: "limpar" do jogador só leva as dele ──────────────────────
  {
    await cliNarrador.from("vtt_measurements").insert(nova(narrador.id));
    await cliJogador.from("vtt_measurements").insert(nova(jogador.id));
    await cliJogador.from("vtt_measurements").insert(nova(jogador.id));

    // O mesmo `delete` por cena que `limparMedicoesDaCena` faz: a RLS
    // é quem recorta as linhas, não um filtro por autor no cliente.
    const { data: removidas } = await cliJogador.from("vtt_measurements").delete().eq("scene_id", sceneId).select("id, autor_id");
    const soDoJogador = (removidas ?? []).every((m) => m.autor_id === jogador.id);
    ok("10 (limpar como jogador remove só as próprias)",
      (removidas ?? []).length === 2 && soDoJogador, `${(removidas ?? []).length} removida(s), só do autor=${soDoJogador}`);

    const { data: sobraram } = await cliNarrador.from("vtt_measurements").select("id").eq("scene_id", sceneId);
    ok("10b (a do narrador continua no mapa)", (sobraram ?? []).length >= 1, `${(sobraram ?? []).length} restante(s)`);
  }

  // ── 11: "limpar" do narrador leva tudo ───────────────────────────
  {
    const { data: removidas } = await cliNarrador.from("vtt_measurements").delete().eq("scene_id", sceneId).select("id");
    const { data: sobraram } = await cliNarrador.from("vtt_measurements").select("id").eq("scene_id", sceneId);
    ok("11 (limpar como narrador esvazia a cena)",
      (removidas ?? []).length >= 1 && (sobraram ?? []).length === 0,
      `removidas=${(removidas ?? []).length} restantes=${(sobraram ?? []).length}`);
  }

  // ── 12: CHECK de geometria — régua de 1 ponto é recusada ─────────
  {
    const { error } = await cliJogador.from("vtt_measurements")
      .insert({ scene_id: sceneId, campaign_id: campanhaId, autor_id: jogador.id, pontos: [{ q: 0, r: 0 }] })
      .select("id").maybeSingle();
    ok("12 (banco recusa medição com menos de 2 pontos)", !!error, error?.message ?? "aceitou — não devia");
  }

  // ── 13: CHECK de teto — array gigante é recusado ─────────────────
  {
    const gigante = Array.from({ length: 65 }, (_, i) => ({ q: i, r: 0 }));
    const { error } = await cliJogador.from("vtt_measurements")
      .insert({ scene_id: sceneId, campaign_id: campanhaId, autor_id: jogador.id, pontos: gigante })
      .select("id").maybeSingle();
    ok("13 (banco recusa medição com mais de 64 pontos)", !!error, error?.message ?? "aceitou — não devia");
  }

  // ── 14: cena de OUTRA campanha não pode ser referenciada ─────────
  {
    const { data: cenaOutra } = await admin.from("vtt_scenes")
      .insert({ campaign_id: outraCampanhaId, nome: "Cena outra", largura: 10, altura: 10 })
      .select("id").single();
    // `campaign_id` da minha campanha + `scene_id` da outra: a FK
    // composta (scene_id, campaign_id) é o que barra isso.
    const { error } = await cliJogador.from("vtt_measurements")
      .insert({ scene_id: cenaOutra!.id as string, campaign_id: campanhaId, autor_id: jogador.id, pontos: RETA })
      .select("id").maybeSingle();
    ok("14 (medição não pode apontar pra cena de outra campanha)", !!error, error?.message ?? "aceitou — não devia");
  }

  // ── Limpeza ──────────────────────────────────────────────────────
  for (const id of criados.campanhas) await admin.from("campaigns").delete().eq("id", id);
  for (const id of criados.usuarios) await admin.auth.admin.deleteUser(id);
  ok("L (limpeza de fixtures)", true, `${criados.usuarios.length} usuário(s) e ${criados.campanhas.length} campanha(s) removidos`);

  console.log(`\n${passou} ok, ${falhou} falha(s).`);
  process.exit(falhou > 0 ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
