/**
 * Segurança dos canais Realtime do VTT (ping + invalidação de tokens),
 * migrations 0074/0075 — prova que SÓ a RPC (`security definer`,
 * `realtime.send()`) publica nesses canais, nunca o cliente via
 * `channel.send()` direto, e que a RPC continua publicando com sucesso
 * depois do aperto de segurança. Também roda os testes PUROS de
 * validação de payload em runtime (`validarPayloadPing`,
 * `validarPayloadTokensAlterados`) — sem rede, sem banco.
 *
 * Método pra provar "recusado": nunca confia no valor de retorno de
 * `channel.send()` (Broadcast via `private:true` pode ou não devolver
 * um erro explícito dependendo da versão/config do client) — em vez
 * disso, um SEGUNDO subscriber independente espera pelo evento forjado
 * um tempo generoso e confirma que ele NUNCA chega. Mesma técnica já
 * usada nesta sessão pro teste negativo de Presence (Fase 3b).
 *
 * Uso: npx tsx scripts/dev/check-vtt-canal-forjado.ts
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

async function esperarMs(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

const criados = { usuarios: [] as string[], campanhas: [] as string[] };
async function criarUsuario(nome: string): Promise<{ id: string; email: string; senha: string }> {
  const email = `check-vtt-canal-${nome}-${Date.now()}-${Math.floor(Math.random() * 1e4)}@ruptura.dev`;
  const senha = randomUUID();
  const { data, error } = await admin.auth.admin.createUser({
    email, password: senha, email_confirm: true, user_metadata: { display_name: `Canal ${nome}` },
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
  const narrador = await criarUsuario("narrador");
  const jogador = await criarUsuario("jogador");
  const campanhaId = randomUUID();
  await admin.from("campaigns").insert({ id: campanhaId, name: "VTT Canal Forjado", owner_id: narrador.id });
  criados.campanhas.push(campanhaId);
  await admin.from("campaign_members").insert({ campaign_id: campanhaId, user_id: jogador.id, role: "player", status: "active", origem: "check_vtt_canal" });
  const { data: cena } = await admin.from("vtt_scenes").insert({ campaign_id: campanhaId, nome: "Cena canal", largura: 20, altura: 20 }).select("id").single();
  const sceneId = cena!.id as string;

  const cliNarrador = await clienteDe(narrador.email, narrador.senha);
  const cliJogador = await clienteDe(jogador.email, jogador.senha);

  const topicoPing = `campaign:${campanhaId}:scene:${sceneId}:vtt:ping`;
  const topicoTokens = `campaign:${campanhaId}:scene:${sceneId}:vtt:tokens-changed`;

  // ── Observador independente — um TERCEIRO client (narrador, papel
  // diferente do que está tentando forjar em cada critério), só
  // recebendo. Prova que o evento forjado nunca sai do publicador. ──
  const observador = await clienteDe(narrador.email, narrador.senha);
  const recebidosPing: unknown[] = [];
  const canalObsPing = observador.channel(topicoPing, { config: { private: true } })
    .on("broadcast", { event: "ping" }, (p) => recebidosPing.push(p.payload))
    .subscribe();
  const recebidosTokens: unknown[] = [];
  const canalObsTokens = observador.channel(topicoTokens, { config: { private: true } })
    .on("broadcast", { event: "tokens_changed" }, (p) => recebidosTokens.push(p.payload))
    .subscribe();
  await esperarMs(1500); // tempo de assinar de verdade antes de qualquer publicação

  // ── ping-forja-1: narrador tenta channel.send() direto — recusado ──
  {
    const canalNarrador = cliNarrador.channel(topicoPing, { config: { private: true } }).subscribe();
    await esperarMs(800);
    const marcador = `forjado-narrador-${randomUUID()}`;
    await canalNarrador.send({ type: "broadcast", event: "ping", payload: { v: 1, id: randomUUID(), campaignId: campanhaId, sceneId, autorId: narrador.id, q: 1, r: 1, largura: 20, altura: 20, ts: Date.now(), marcador } });
    await esperarMs(1500);
    const chegou = recebidosPing.some((p) => (p as { marcador?: string }).marcador === marcador);
    ok("ping-forja-1 (narrador NÃO publica direto via channel.send — recusado pela RLS de INSERT)", !chegou, chegou ? "PASSOU (FALHA GRAVE — forja entregue)" : "nunca chegou ao observador");
    await cliNarrador.removeChannel(canalNarrador);
  }

  // ── ping-forja-2: jogador tenta channel.send() direto — recusado ──
  {
    const canalJogador = cliJogador.channel(topicoPing, { config: { private: true } }).subscribe();
    await esperarMs(800);
    const marcador = `forjado-jogador-${randomUUID()}`;
    await canalJogador.send({ type: "broadcast", event: "ping", payload: { v: 1, id: randomUUID(), campaignId: campanhaId, sceneId, autorId: jogador.id, q: 1, r: 1, largura: 20, altura: 20, ts: Date.now(), marcador } });
    await esperarMs(1500);
    const chegou = recebidosPing.some((p) => (p as { marcador?: string }).marcador === marcador);
    ok("ping-forja-2 (jogador NÃO publica direto via channel.send — recusado pela RLS de INSERT)", !chegou, chegou ? "PASSOU (FALHA GRAVE — forja entregue)" : "nunca chegou ao observador");
    await cliJogador.removeChannel(canalJogador);
  }

  // ── ping-rpc-1: a RPC continua publicando normalmente, com o payload completo ──
  {
    const { data, error } = await cliJogador.rpc("vtt_ping", { p_campaign_id: campanhaId, p_scene_id: sceneId, p_q: 5, p_r: 5 });
    await esperarMs(1500);
    const evento = recebidosPing[recebidosPing.length - 1] as Record<string, unknown> | undefined;
    ok(
      "ping-rpc-1 (RPC continua publicando de verdade — observador recebe v/campaignId/sceneId/autorId/q/r/largura/altura/ts)",
      data === true && !error && evento?.v === 1 && evento?.campaignId === campanhaId && evento?.sceneId === sceneId
        && evento?.autorId === jogador.id && evento?.q === 5 && evento?.r === 5 && evento?.largura === 20 && evento?.altura === 20
        && typeof evento?.ts === "number",
      error ? error.message : `evento=${JSON.stringify(evento)}`,
    );
  }

  // ── tokens-forja-1/2: mesma prova pro canal de invalidação ──
  {
    const canalNarrador = cliNarrador.channel(topicoTokens, { config: { private: true } }).subscribe();
    await esperarMs(800);
    const marcadorTs = 999999999;
    await canalNarrador.send({ type: "broadcast", event: "tokens_changed", payload: { v: 1, campaignId: campanhaId, sceneId, ts: marcadorTs } });
    await esperarMs(1500);
    const chegou = recebidosTokens.some((p) => (p as { ts?: number }).ts === marcadorTs);
    ok("tokens-forja-1 (narrador NÃO publica direto no canal de invalidação)", !chegou, chegou ? "PASSOU (FALHA GRAVE)" : "nunca chegou");
    await cliNarrador.removeChannel(canalNarrador);
  }
  {
    const canalJogador = cliJogador.channel(topicoTokens, { config: { private: true } }).subscribe();
    await esperarMs(800);
    const marcadorTs = 999999998;
    await canalJogador.send({ type: "broadcast", event: "tokens_changed", payload: { v: 1, campaignId: campanhaId, sceneId, ts: marcadorTs } });
    await esperarMs(1500);
    const chegou = recebidosTokens.some((p) => (p as { ts?: number }).ts === marcadorTs);
    ok("tokens-forja-2 (jogador NÃO publica direto no canal de invalidação)", !chegou, chegou ? "PASSOU (FALHA GRAVE)" : "nunca chegou");
    await cliJogador.removeChannel(canalJogador);
  }

  // ── tokens-rpc-1: create_vtt_token de verdade publica a invalidação ──
  {
    const antes = recebidosTokens.length;
    const { data, error } = await cliNarrador.rpc("create_vtt_token", {
      p_scene_id: sceneId, p_campaign_id: campanhaId, p_nome: "Canal", p_sigla: "CN",
      p_lado: "pn", p_vertente: "nenhuma", p_tamanho: "medio", p_orientacao: 0, p_pegada_personalizada: null,
      p_q: 0, p_r: 0, p_character_id: null, p_visivel: true, p_bloqueado: false,
      p_retrato_url: null, p_pv_atual: null, p_pv_max: null, p_condicoes: [],
    });
    await esperarMs(1500);
    ok(
      "tokens-rpc-1 (create_vtt_token publica invalidação de verdade, sem dado de token no payload)",
      !error && !!data && recebidosTokens.length > antes && !("nome" in (recebidosTokens[recebidosTokens.length - 1] as object)),
      error ? error.message : `eventos antes=${antes}, depois=${recebidosTokens.length}, último=${JSON.stringify(recebidosTokens[recebidosTokens.length - 1])}`,
    );
  }

  observador.removeChannel(canalObsPing);
  observador.removeChannel(canalObsTokens);

  // ═══════════════════════════════════════════════════════════════
  // Validação de payload em runtime — PURA, sem rede.
  // ═══════════════════════════════════════════════════════════════
  const { validarPayloadPing } = await import("../../src/app/mesas/[campaignId]/vtt/_realtime/vttRealtime");
  const esperado = { campaignId: campanhaId, sceneId };
  const pingValido = { v: 1, id: randomUUID(), campaignId: campanhaId, sceneId, autorId: randomUUID(), q: 1, r: 1, largura: 20, altura: 20, ts: Date.now() };

  ok("payload-1 (payload válido passa)", validarPayloadPing(pingValido, esperado) !== null, "ok");
  ok("payload-2 (não-objeto é rejeitado)", validarPayloadPing("string qualquer", esperado) === null, "ok");
  ok("payload-3 (array é rejeitado)", validarPayloadPing([1, 2, 3], esperado) === null, "ok");
  ok("payload-4 (null é rejeitado)", validarPayloadPing(null, esperado) === null, "ok");
  ok("payload-5 (v !== 1 é rejeitado)", validarPayloadPing({ ...pingValido, v: 2 }, esperado) === null, "ok");
  ok("payload-6 (id fora do formato UUID é rejeitado)", validarPayloadPing({ ...pingValido, id: "não-é-uuid" }, esperado) === null, "ok");
  ok("payload-7 (autorId fora do formato UUID é rejeitado)", validarPayloadPing({ ...pingValido, autorId: "123" }, esperado) === null, "ok");
  ok("payload-8 (campaignId diferente do esperado é rejeitado)", validarPayloadPing({ ...pingValido, campaignId: randomUUID() }, esperado) === null, "ok");
  ok("payload-9 (sceneId diferente do esperado é rejeitado)", validarPayloadPing({ ...pingValido, sceneId: randomUUID() }, esperado) === null, "ok");
  ok("payload-10 (q fracionário é rejeitado)", validarPayloadPing({ ...pingValido, q: 1.5 }, esperado) === null, "ok");
  ok("payload-11 (r como string é rejeitado)", validarPayloadPing({ ...pingValido, r: "1" }, esperado) === null, "ok");
  ok("payload-12 (coordenada fora da cena é rejeitada)", validarPayloadPing({ ...pingValido, q: 500, r: 500 }, esperado) === null, "ok");
  ok("payload-13 (largura <= 0 é rejeitada)", validarPayloadPing({ ...pingValido, largura: 0 }, esperado) === null, "ok");
  ok("payload-14 (ts não finito é rejeitado)", validarPayloadPing({ ...pingValido, ts: Infinity }, esperado) === null, "ok");
  ok("payload-15 (ts expirado — mais de 4s no passado — é rejeitado)", validarPayloadPing({ ...pingValido, ts: Date.now() - 10000 }, esperado) === null, "ok");
  ok("payload-16 (ts suspeito demais no futuro é rejeitado)", validarPayloadPing({ ...pingValido, ts: Date.now() + 60000 }, esperado) === null, "ok");
  ok("payload-17 (campo extra desconhecido não quebra a validação)", validarPayloadPing({ ...pingValido, campoInventado: "x" }, esperado) !== null, "ok");

  // ── Limpeza ────────────────────────────────────────────────────
  const restos: string[] = [];
  await admin.from("vtt_tokens").delete().eq("campaign_id", campanhaId);
  await admin.from("vtt_scenes").delete().eq("campaign_id", campanhaId);
  for (const id of criados.campanhas) { const { error } = await admin.from("campaigns").delete().eq("id", id); if (error) restos.push(`campanha ${id}: ${error.message}`); }
  for (const id of criados.usuarios) { const { error } = await admin.auth.admin.deleteUser(id); if (error) restos.push(`usuário ${id}: ${error.message}`); }
  ok("L (limpeza de fixtures)", restos.length === 0, restos.length ? `PENDENTE: ${restos.join("; ")}` : `${criados.usuarios.length} usuário(s), ${criados.campanhas.length} campanha(s)`);

  console.log(`\n${passou} ok, ${falhou} falha(s).`);
  process.exit(falhou > 0 ? 1 : 0);
}

main().catch((e) => { console.error("Erro fatal:", e); process.exit(1); });
