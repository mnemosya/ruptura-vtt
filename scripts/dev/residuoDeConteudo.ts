/**
 * Limpeza de resíduo dos checks de conteúdo da Biblioteca, feita no
 * INÍCIO da execução.
 *
 * ── O problema que isto resolve ─────────────────────────────────────
 * Estes checks criam rascunhos com slug fixo (`zz_e2e_*`) e os apagam
 * pela interface no fim, num `finally` best-effort. Isso funciona no
 * caminho feliz e falha exatamente quando mais importa: se o script
 * morre no meio — assert quebrado, timeout, Ctrl+C —, a limpeza não
 * roda. O slug sobrevive, e a execução SEGUINTE tenta criar o mesmo
 * slug, a criação é recusada, a navegação nunca acontece e o script
 * morre num `waitForURL` que nunca chega.
 *
 * O sintoma não se parece nada com a causa: o erro é "Timeout 10000ms
 * exceeded / waiting for navigation", que sugere lentidão ou seletor
 * errado. Na triagem de 2026-09-20, SETE checks `check-admin-*`
 * apareciam como quebrados por esse motivo — todos os sete estavam
 * apenas tropeçando no lixo que eles mesmos tinham deixado.
 *
 * ── Por que no início, e não no fim ─────────────────────────────────
 * Limpar no início torna irrelevante COMO a execução anterior
 * terminou. É a única posição que não depende do script ter chegado ao
 * fim — e é justamente o script que não chega ao fim que suja o banco.
 *
 * ── Por que o prefixo inteiro, e não o slug de cada check ───────────
 * Cada check limpa `zz_e2e_` por completo, não só os próprios slugs.
 * Os checks rodam em série (`triar-checks.mjs`), então não há
 * concorrência a respeitar, e assim a queda de QUALQUER um deles é
 * consertada pelo próximo a rodar, em vez de ficar esperando aquele
 * mesmo script ser executado de novo.
 *
 * O domínio reservado é o mesmo raciocínio de `varrer-residuo-de-teste.ts`
 * para contas e campanhas: resíduo de teste precisa ser reconhecível
 * por uma marca que produto nenhum usa.
 */

import { config as loadDotenv } from "dotenv";
import { Client } from "pg";

loadDotenv({ path: ".env.local" });

/** Marca que nenhum conteúdo de produto usa. */
export const PREFIXO_DE_TESTE = "zz_e2e_";

/**
 * Apaga todo conteúdo de Biblioteca com o prefixo de teste. Devolve
 * quantas linhas saíram, ou 0 quando não há `SUPABASE_DB_URL` (o check
 * segue: sem banco direto, resta o caminho pela interface).
 */
export async function limparConteudoDeTeste(prefixo = PREFIXO_DE_TESTE): Promise<number> {
  const url = process.env.SUPABASE_DB_URL;
  if (!url) return 0;

  const db = new Client({
    connectionString: url,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 15000,
  });
  await db.connect();
  try {
    let total = 0;
    // O changelog sai PRIMEIRO, e por `document_id` (`<tipo>:<slug>`):
    // ele não tem coluna `slug`, e por isso ficava de fora de toda
    // limpeza — sobrevivia a tudo e derrubava a publicação seguinte.
    try {
      const r = await db.query("delete from content_changelog where document_id like $1", [`%${prefixo}%`]);
      total += r.rowCount ?? 0;
    } catch { /* tabela pode não existir nesta versão do schema */ }
    for (const tabela of ["content_documents", "content_drafts"]) {
      try {
        const r = await db.query(`delete from ${tabela} where slug like $1`, [`${prefixo}%`]);
        total += r.rowCount ?? 0;
      } catch { /* idem */ }
    }
    return total;
  } finally {
    await db.end();
  }
}

/** Limpa e anuncia, no formato de passo "0." que os checks já usam. */
export async function limparEAnunciar(): Promise<void> {
  const n = await limparConteudoDeTeste();
  if (n > 0) console.log(`0. Resíduo de execução anterior removido (${n} linha(s))`);
}
