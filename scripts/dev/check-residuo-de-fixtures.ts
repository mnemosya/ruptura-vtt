/**
 * O que os testes deixaram para trás.
 *
 * ── Por que isto existe ──────────────────────────────────────────────
 *
 * Um inventário do banco encontrou 28 campanhas de teste acumuladas em
 * produção. A causa era uma limpeza que falhava em silêncio: os
 * `delete` não conferiam erro, e o script anunciava "limpeza concluída"
 * sem ter apagado nada. Ninguém percebeu porque ninguém olhava.
 *
 * Este check é o olhar. Ele não conserta nada — só responde "sobrou
 * alguma coisa?", e responde rápido o bastante para rodar depois de
 * qualquer leva de testes.
 *
 * ── O que ele considera resíduo ──────────────────────────────────────
 *
 * Só o que tem MARCA DE FIXTURE: nomes e e-mails que os próprios
 * scripts usam. Não sai adivinhando o que é descartável — apagar dado
 * de produção por heurística seria pior que o problema.
 *
 * E ele DISTINGUE recente de antigo. Resíduo das últimas horas é de uma
 * leva que acabou de rodar, e é acionável agora. Resíduo de meses atrás
 * é arqueologia: fica reportado à parte, sem virar falha, porque
 * ninguém sabe hoje se aquela "Mesa Teste v0.58" ainda serve a alguém.
 *
 * Uso: npx tsx scripts/dev/check-residuo-de-fixtures.ts
 */

import { config as loadDotenv } from "dotenv";
import { Client } from "pg";

loadDotenv({ path: ".env.local" });

/** Marcas que os scripts de teste deste repositório usam. */
const MARCA_CAMPANHA = "(teste|__probe|__TESTE|Catálogo de cenas|Dividir|Ciclo da cena|Imagens|Pastas|Arquivo e duplicação|Apresentar cena|Sem palco|Outra|Probe)";
const MARCA_EMAIL = "(check-|teste-|probe|validate-|validation-|shot2-|cascade-|verifica-|manual-gesto|demo-equipped)";
const RECENTE_HORAS = 12;

async function main() {
  const url = process.env.SUPABASE_DB_URL;
  if (!url) { console.error("SUPABASE_DB_URL ausente."); process.exit(1); }
  const db = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await db.connect();

  const q = async (sql: string, args: unknown[] = []) => (await db.query(sql, args)).rows;

  const campanhas = await q(
    `select id, name, created_at,
            created_at > now() - ($1 || ' hours')::interval as recente
       from campaigns where name ~* $2 order by created_at desc`,
    [String(RECENTE_HORAS), MARCA_CAMPANHA],
  );
  const contas = await q(
    `select id, email, created_at,
            created_at > now() - ($1 || ' hours')::interval as recente
       from auth.users where email ~* $2 order by created_at desc`,
    [String(RECENTE_HORAS), MARCA_EMAIL],
  );
  // Cena órfã: a campanha sumiu e ela ficou. Não deveria acontecer (há
  // cascade), mas é barato conferir e caro descobrir tarde.
  const cenasOrfas = await q(
    `select count(*)::int n from vtt_scenes s
      where not exists (select 1 from campaigns c where c.id = s.campaign_id)`,
  );
  const palcosOrfos = await q(
    `select count(*)::int n from vtt_campaign_stage st
      where not exists (select 1 from campaigns c where c.id = st.campaign_id)`,
  );

  await db.end();

  const recentes = {
    campanhas: campanhas.filter((c) => c.recente),
    contas: contas.filter((c) => c.recente),
  };
  const antigos = {
    campanhas: campanhas.filter((c) => !c.recente),
    contas: contas.filter((c) => !c.recente),
  };

  console.log("=== resíduo de fixtures ===\n");
  console.log(`RECENTE (últimas ${RECENTE_HORAS}h) — acionável agora`);
  console.log(`  campanhas: ${recentes.campanhas.length}`);
  for (const c of recentes.campanhas) console.log(`    • ${c.name}  ${c.id}`);
  console.log(`  contas:    ${recentes.contas.length}`);
  for (const c of recentes.contas) console.log(`    • ${c.email}`);

  console.log(`\nANTIGO — arqueologia, não falha`);
  console.log(`  campanhas: ${antigos.campanhas.length}`);
  for (const c of antigos.campanhas.slice(0, 8)) console.log(`    • ${c.name}  (${c.created_at.toISOString().slice(0, 10)})`);
  if (antigos.campanhas.length > 8) console.log(`    … e mais ${antigos.campanhas.length - 8}`);
  console.log(`  contas:    ${antigos.contas.length}`);

  console.log(`\nÓRFÃOS ESTRUTURAIS`);
  console.log(`  cenas sem campanha: ${cenasOrfas[0].n}`);
  console.log(`  palcos sem campanha: ${palcosOrfos[0].n}`);

  const falhou =
    recentes.campanhas.length > 0 || recentes.contas.length > 0 ||
    cenasOrfas[0].n > 0 || palcosOrfos[0].n > 0;

  console.log(falhou
    ? "\nFALHA — há resíduo recente ou órfão estrutural."
    : "\nok — nenhum resíduo recente, nenhum órfão estrutural.");
  process.exit(falhou ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
