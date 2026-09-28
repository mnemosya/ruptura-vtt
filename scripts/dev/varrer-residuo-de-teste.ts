/**
 * Varre RESÍDUO de fixtures de teste no Supabase — contas e campanhas
 * que ficaram para trás quando um script morreu antes de limpar.
 *
 * ── Por que isto existe ──────────────────────────────────────────────
 *
 * Triar a suíte de verificação em lote (TEST-01) exige teto de tempo
 * por script, porque os checks defasados TRAVAM em vez de falhar. Mas
 * matar um script no meio é exatamente o que produz o resíduo que
 * `limparCampanhaDeTeste.ts` documenta ter chegado a dezenas de
 * campanhas vivas em produção.
 *
 * Então a triagem só é segura com a varredura ao lado. Esta é a
 * varredura.
 *
 * ── O que conta como fixture ─────────────────────────────────────────
 *
 * Só o que os próprios scripts criam: contas cujo e-mail termina em
 * `@ruptura.dev`, que é o domínio reservado dos fixtures e não existe.
 * Campanhas entram por serem de uma dessas contas — nunca por nome,
 * porque "Mesa de teste" é um nome que uma pessoa de verdade pode usar.
 *
 * Sem `--apply` apenas LISTA. Nada é apagado por engano ao rodar isto
 * para olhar.
 *
 * Uso:
 *   npx tsx scripts/dev/varrer-residuo-de-teste.ts            # lista
 *   npx tsx scripts/dev/varrer-residuo-de-teste.ts --apply    # apaga
 *   npx tsx scripts/dev/varrer-residuo-de-teste.ts --apply --min-idade-min 30
 */

import { config as loadDotenv } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { limparCampanhasDeTeste } from "./limparCampanhaDeTeste";

loadDotenv({ path: ".env.local" });
function req(n: string): string {
  const v = process.env[n];
  if (!v) { console.error(`Variável ausente: ${n}`); process.exit(1); }
  return v;
}
const admin = createClient(req("SUPABASE_URL"), req("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false, autoRefreshToken: false },
});

/** Domínio reservado dos fixtures — não é um domínio real. */
const DOMINIO_FIXTURE = "@ruptura.dev";

const aplicar = process.argv.includes("--apply");
const idxIdade = process.argv.indexOf("--min-idade-min");
/**
 * Idade mínima, em minutos. Protege execuções EM ANDAMENTO: uma
 * varredura disparada no meio de um check apagaria a campanha que ele
 * está usando, e o teste falharia por um motivo inventado.
 */
const minIdadeMin = idxIdade >= 0 ? Number(process.argv[idxIdade + 1]) : 20;

async function main() {
  const limite = Date.now() - minIdadeMin * 60_000;

  const contas: { id: string; email: string; criadoEm: string }[] = [];
  for (let pagina = 1; ; pagina++) {
    const { data, error } = await admin.auth.admin.listUsers({ page: pagina, perPage: 200 });
    if (error) throw new Error(`listUsers: ${error.message}`);
    if (!data.users.length) break;
    for (const u of data.users) {
      if (!u.email?.endsWith(DOMINIO_FIXTURE)) continue;
      if (new Date(u.created_at).getTime() > limite) continue;
      contas.push({ id: u.id, email: u.email, criadoEm: u.created_at });
    }
    if (data.users.length < 200) break;
  }

  const { data: campanhas, error } = contas.length
    ? await admin.from("campaigns").select("id,name,owner_id,created_at").in("owner_id", contas.map((c) => c.id))
    : { data: [], error: null };
  if (error) throw new Error(`campaigns: ${error.message}`);

  console.log(`contas de fixture com mais de ${minIdadeMin} min: ${contas.length}`);
  console.log(`campanhas dessas contas: ${campanhas?.length ?? 0}`);
  if (!contas.length) { console.log("\nNada a varrer."); return; }

  for (const c of contas.slice(0, 12)) console.log(`  ${c.email}  (${c.criadoEm.slice(0, 16)})`);
  if (contas.length > 12) console.log(`  … e mais ${contas.length - 12}`);

  if (!aplicar) {
    console.log("\nNada foi apagado. Repita com --apply para varrer.");
    return;
  }

  const r = await limparCampanhasDeTeste(admin, {
    campanhas: (campanhas ?? []).map((c) => c.id),
    usuarios: contas.map((c) => c.id),
  });
  console.log(`\nremovidas: ${r.campanhas} campanha(s), ${r.contas} conta(s)`);
  if (r.restos.length) {
    console.log("restos (não saíram):");
    for (const x of r.restos.slice(0, 20)) console.log(`  ${x}`);
    process.exitCode = 1;
  } else {
    console.log("sem restos.");
  }
}

await main();
