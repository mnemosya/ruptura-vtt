#!/usr/bin/env node
/**
 * Fixture de demonstração — personagem sintético com TODOS os slots de
 * equipamento preenchidos (armadura completa, arma primária/secundária,
 * escudo, os dois acessos rápidos), para revisão visual do design.
 *
 * Ao contrário de scripts anteriores desta sessão, este NÃO se
 * autolimpa — o usuário pediu para manter a fixture viva para explorar
 * por conta própria. Limpar manualmente quando não precisar mais:
 *   npx tsx scripts/dev/demo-equipped.mjs --cleanup <userId> <campaignId>
 */
import { config as loadDotenv } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { randomUUID, randomBytes } from "node:crypto";

loadDotenv({ path: ".env.local" });

function requireEnv(name) {
  const v = process.env[name];
  if (!v) { console.error(`Variável obrigatória ausente: ${name}`); process.exit(1); }
  return v;
}
const admin = createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  const email = `demo-equipped-${randomUUID()}@ruptura.dev`;
  const password = randomBytes(18).toString("base64url");
  const { data: userData, error: userErr } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (userErr) throw new Error(userErr.message);
  const userId = userData.user.id;

  const { data: campaign, error: campErr } = await admin
    .from("campaigns")
    .insert({ name: "DEMO equipamentos", owner_id: userId })
    .select("id")
    .single();
  if (campErr) throw new Error(campErr.message);

  const now = new Date(0).toISOString();
  function inst(id, slug, nome, estado, extra = {}) {
    return { id, itemSlug: slug, itemNome: nome, categoria: extra.categoria ?? "", quantidade: 1, estado, adquiridoEm: now, ...extra };
  }

  const inventario = [
    inst("i-cabeca", "gorro_reforcado", "Gorro reforçado", "equipado", { mitAtual: 2 }),
    inst("i-tronco", "jaqueta_couro_reforcada", "Jaqueta de couro reforçada", "equipado", { mitAtual: 3 }),
    inst("i-bracos", "cotoveleiras", "Cotoveleiras", "equipado", { mitAtual: 1 }),
    inst("i-pernas", "calca_acolchoada", "Calça acolchoada", "equipado", { mitAtual: 2 }),
    inst("i-escudo", "escudo_compacto", "Escudo compacto", "mochila", { equipadoDefensivo: true, equipamentoSlot: "escudo", pdAtual: 4 }),
    inst("i-arma1", "faca", "Faca", "empunhado"),
    inst("i-arma2", "adaga", "Adaga", "empunhado"),
    inst("i-rapido1", "kit_estabilizacao_pv", "Kit de estabilização (PV)", "acesso_rapido"),
    inst("i-rapido2", "granada_fumaca", "Granada de fumaça", "acesso_rapido"),
  ];

  const payload = {
    atributos: { corpo: 3, mente: 2, animo: 2 },
    recursos_atuais: { pv: 13, pe: 9, mana: 8, integridade: 12 },
    estado_jogo: { pa_gastos: 1, reacoes_usadas: 0, defesas_sem_reacao: 0 },
    pericias: { luta: 2, precisao: 1, biologia: 1 },
    inventario,
    condicoes_ativas: [],
    metadados: { criado_em: now, atualizado_em: now, schema_version: 1 },
  };

  const { data: character, error: charErr } = await admin
    .from("characters")
    .insert({ campaign_id: campaign.id, name: "Demo Equipado", payload })
    .select("id")
    .single();
  if (charErr) throw new Error(charErr.message);

  await admin.from("character_controllers").insert({ character_id: character.id, user_id: userId }).select();

  console.log("=== Fixture criada (fica no ar até você limpar manualmente) ===");
  console.log(`URL Personagens: http://localhost:3000/mesas/personagens`);
  console.log(`URL direta: http://localhost:3000/ficha?campaignId=${campaign.id}&characterId=${character.id}`);
  console.log(`Login: ${email}`);
  console.log(`Senha: ${password}`);
  console.log(`\nPara remover quando terminar: npx tsx scripts/dev/demo-equipped.mjs --cleanup ${userId} ${campaign.id}`);
}

async function cleanup(userId, campaignId) {
  await admin.from("campaigns").delete().eq("id", campaignId);
  await admin.auth.admin.deleteUser(userId);
  console.log("Fixture removida.");
}

const args = process.argv.slice(2);
if (args[0] === "--cleanup") {
  cleanup(args[1], args[2]).catch((e) => { console.error(e); process.exit(1); });
} else {
  main().catch((e) => { console.error("FALHOU:", e instanceof Error ? e.message : e); process.exit(1); });
}
