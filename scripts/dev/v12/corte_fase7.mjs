#!/usr/bin/env node
/**
 * Corte de dados da migração RUPTURA v1.2 — Fase 7 (personagens).
 *
 * Remove do banco os personagens v1 (payload sem `schema_version: 2`), os
 * tokens de mapa ligados a eles e os rascunhos de criação v1. Conteúdo
 * canônico (Talentos, magias antigas etc.) NÃO é tocado aqui.
 *
 * Decisões registradas no plano (01/10/2026):
 *   · personagens e rascunhos v1 são apagados no corte;
 *   · os tokens ligados a esses personagens são removidos (não desvinculados).
 *
 * Ordem (FKs conferidas no remoto em 01/10/2026):
 *   1. vtt_tokens dos personagens v1 — a FK é ON DELETE SET NULL, então
 *      sem este passo os tokens ficariam órfãos no mapa. Cascata: vtt_areas,
 *      vtt_targets, vtt_image_upload_reservations. O painel de rodadas já
 *      trata token sumido ("token removido do mapa").
 *   2. characters v1 — cascata: character_controllers,
 *      campaign_character_placements, vtt_image_upload_reservations;
 *      table_logs e campaign_narrative_entries mantêm o histórico com
 *      character_id nulo.
 *   3. character_creation_drafts v1.
 *
 * Modos:
 *   (padrão)            só conta, em transação desfeita.
 *   --testar            apaga dentro de uma transação, confere e DESFAZ.
 *   --executar --snapshot=<referência>
 *                       apaga e confirma. Exige a referência do snapshot
 *                       (regra de segurança 1 do plano: nada destrutivo
 *                       antes de um snapshot recuperável).
 *
 * Conexão: SUPABASE_DB_URL do .env.local (papel de manutenção; o gatilho
 * de cena arquivada deixa passar escritas sem sessão de usuário).
 * Imagens de avatar no Storage não são removidas por este script.
 */
import fs from "node:fs";
import pg from "pg";

const args = process.argv.slice(2);
const executar = args.includes("--executar");
const testar = args.includes("--testar");
const snapshot = args.find((a) => a.startsWith("--snapshot="))?.slice("--snapshot=".length);

if (executar && testar) {
  console.error("Use --executar ou --testar, não os dois.");
  process.exit(2);
}
if (executar && !snapshot) {
  console.error("--executar exige --snapshot=<referência do snapshot recuperável>.");
  process.exit(2);
}

function lerEnv() {
  const env = { ...process.env };
  if (fs.existsSync(".env.local")) {
    for (const linha of fs.readFileSync(".env.local", "utf8").split("\n")) {
      const i = linha.indexOf("=");
      if (i > 0 && !linha.trimStart().startsWith("#")) env[linha.slice(0, i).trim()] ??= linha.slice(i + 1).trim().replace(/^"|"$/g, "");
    }
  }
  return env;
}

const V1 = "coalesce(payload->>'schema_version', '1') <> '2'";

async function contar(c) {
  const q = async (sql) => Number((await c.query(sql)).rows[0].n);
  return {
    personagens_v1: await q(`select count(*) n from characters where ${V1}`),
    personagens_v2: await q(`select count(*) n from characters where not (${V1})`),
    tokens_de_v1: await q(`select count(*) n from vtt_tokens t join characters ch on ch.id = t.character_id where ${V1.replaceAll("payload", "ch.payload")}`),
    controladores_de_v1: await q(`select count(*) n from character_controllers cc join characters ch on ch.id = cc.character_id where ${V1.replaceAll("payload", "ch.payload")}`),
    rascunhos_v1: await q(`select count(*) n from character_creation_drafts where ${V1}`),
    rascunhos_v2: await q(`select count(*) n from character_creation_drafts where not (${V1})`),
  };
}

async function cortar(c) {
  const ids = (await c.query(`select id from characters where ${V1} for update`)).rows.map((r) => r.id);
  const tokens = await c.query(`delete from vtt_tokens where character_id = any($1::uuid[])`, [ids]);
  const personagens = await c.query(`delete from characters where id = any($1::uuid[])`, [ids]);
  const rascunhos = await c.query(`delete from character_creation_drafts where ${V1}`);
  return { tokens_removidos: tokens.rowCount, personagens_removidos: personagens.rowCount, rascunhos_removidos: rascunhos.rowCount };
}

const env = lerEnv();
if (!env.SUPABASE_DB_URL) {
  console.error("SUPABASE_DB_URL ausente.");
  process.exit(2);
}
const c = new pg.Client({ connectionString: env.SUPABASE_DB_URL });
await c.connect();
try {
  await c.query("begin");
  const antes = await contar(c);
  console.log("Antes:", antes);
  if (!executar && !testar) {
    await c.query("rollback");
    console.log("Somente contagem (nada alterado). Use --testar para ensaiar ou --executar --snapshot=<ref> para aplicar.");
  } else {
    const removidos = await cortar(c);
    const depois = await contar(c);
    console.log("Removidos:", removidos);
    console.log("Depois:", depois);
    const ok =
      depois.personagens_v1 === 0 && depois.tokens_de_v1 === 0 && depois.rascunhos_v1 === 0
      && depois.personagens_v2 === antes.personagens_v2 && depois.rascunhos_v2 === antes.rascunhos_v2
      && removidos.personagens_removidos === antes.personagens_v1 && removidos.tokens_removidos === antes.tokens_de_v1;
    if (!ok) {
      await c.query("rollback");
      console.error("Verificação pós-corte falhou — transação desfeita.");
      process.exit(1);
    }
    if (testar) {
      await c.query("rollback");
      console.log("Ensaio concluído e DESFEITO. Verificações pós-corte OK.");
    } else {
      await c.query("commit");
      console.log(`Corte aplicado (snapshot: ${snapshot}). Registre as contagens no plano.`);
    }
  }
} catch (e) {
  await c.query("rollback").catch(() => {});
  console.error(e);
  process.exit(1);
} finally {
  await c.end();
}
