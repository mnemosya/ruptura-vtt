/**
 * Mesa de fixture para os checks que exercitam `/dev/table` — criada
 * pelo próprio check, não presumida.
 *
 * ── O que isto substitui ────────────────────────────────────────────
 * `check-admin-effect-builder.ts` dependia de uma campanha chamada
 * "Mesa CP7 Bando" e de um personagem de UUID FIXO no código
 * (`0b377e78-…`). Nem a campanha nem o personagem eram criados por
 * script nenhum: foram feitos à mão no banco de desenvolvimento em
 * algum momento, e quando sumiram o check passou a falhar com
 * "Mesa de fixtures deveria existir".
 *
 * A fragilidade era anterior ao sumiço: um check que depende de estado
 * criado à mão nunca passaria num banco novo — nem no de outra pessoa,
 * nem em CI. O UUID literal é o sintoma mais visível disso: ele só
 * significa alguma coisa em UM banco no mundo.
 *
 * ── Por que SQL direto, e não pela interface ────────────────────────
 * A fixture é premissa do teste, não o que ele testa. Montá-la clicando
 * (criar campanha, criar personagem, esperar cada navegação) acrescenta
 * uma dúzia de pontos de falha que não têm nada a ver com o efeito que
 * o check quer verificar — e quando um deles quebrar, o erro vai
 * apontar para o lugar errado. O que o check testa continua sendo
 * exercitado pela interface.
 *
 * ── Reconhecível como resíduo ───────────────────────────────────────
 * O nome leva o prefixo `zz_e2e_`, o mesmo de `residuoDeConteudo.ts`:
 * se a execução morrer no meio, a mesa é identificável e removível sem
 * ambiguidade, em vez de virar mais uma linha órfã no banco — que é
 * exatamente como o projeto chegou às 25 contas e 9 campanhas órfãs
 * encontradas na varredura de 2026-09-20.
 */

import { readFileSync } from "node:fs";
import { config as loadDotenv } from "dotenv";
import { Client } from "pg";
import { SESSION_FILE } from "./authSession";
import { createInitialCharacter } from "../../src/lib/character/createCharacter";

loadDotenv({ path: ".env.local" });

export const PREFIXO_MESA_FIXTURE = "zz_e2e_mesa_";
export const NOME_MESA_FIXTURE = `${PREFIXO_MESA_FIXTURE}efeitos`;
export const NOME_PERSONAGEM_FIXTURE = "Personagem A (fixture)";

export interface MesaDeFixture {
  campanhaId: string;
  personagemId: string;
}

/** Dono da mesa: a MESMA conta da sessão salva, senão `/dev/table` não a lista (RLS). */
function idDaContaDaSessao(): string {
  const estado = JSON.parse(readFileSync(SESSION_FILE, "utf8")) as {
    cookies?: { name: string; value: string }[];
  };
  const cookie = estado.cookies?.find((c) => c.name === "ruptura_auth");
  if (!cookie) throw new Error("Sessão salva não tem o cookie `ruptura_auth` — rode npm run auth:save-session.");
  // O valor vem percent-encoded do storageState do Playwright.
  const bruto = cookie.value.startsWith("%") ? decodeURIComponent(cookie.value) : cookie.value;
  const { access_token: token } = JSON.parse(bruto) as { access_token: string };
  const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64").toString("utf8")) as { sub?: string };
  if (!payload.sub) throw new Error("Token da sessão salva não traz `sub`.");
  return payload.sub;
}

function conectar(): Client {
  const url = process.env.SUPABASE_DB_URL;
  if (!url) throw new Error("SUPABASE_DB_URL ausente — a fixture de mesa precisa de acesso direto ao banco.");
  return new Client({ connectionString: url, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 15000 });
}

/**
 * Garante mesa e personagem de fixture e devolve os ids REAIS. Sempre
 * recria do zero: uma sobra de execução anterior poderia trazer
 * condições já aplicadas, e o check começa afirmando que o personagem
 * não tem nenhuma.
 */
export async function garantirMesaDeFixture(): Promise<MesaDeFixture> {
  const dono = idDaContaDaSessao();
  const db = conectar();
  await db.connect();
  try {
    await removerPor(db);
    const campanha = await db.query<{ id: string }>(
      "insert into campaigns (name, owner_id) values ($1, $2) returning id",
      [NOME_MESA_FIXTURE, dono],
    );
    const campanhaId = campanha.rows[0].id;
    const personagem = await db.query<{ id: string }>(
      `insert into characters (name, campaign_id, owner_id, payload)
       values ($1, $2, $3, $4::jsonb) returning id`,
      // Payload pela fábrica canônica do produto, não inventado aqui: a
      // primeira versão passava `{ atributos: {} }` e o painel nem
      // renderizava — o console dizia "Fórmula referencia o atributo
      // \"corpo\", que não existe no personagem". `createInitialCharacter`
      // com `regras: null` cai nos padrões do PRD, que é exatamente o
      // personagem mínimo válido que a fixture quer ser.
      [NOME_PERSONAGEM_FIXTURE, campanhaId, dono, JSON.stringify(createInitialCharacter(null, NOME_PERSONAGEM_FIXTURE))],
    );
    return { campanhaId, personagemId: personagem.rows[0].id };
  } finally {
    await db.end();
  }
}

async function removerPor(db: Client): Promise<number> {
  const r = await db.query("delete from campaigns where name like $1", [`${PREFIXO_MESA_FIXTURE}%`]);
  return r.rowCount ?? 0;
}

/** Remove a mesa de fixture (personagens saem junto, por cascade da campanha). */
export async function removerMesaDeFixture(): Promise<number> {
  if (!process.env.SUPABASE_DB_URL) return 0;
  const db = conectar();
  await db.connect();
  try {
    return await removerPor(db);
  } finally {
    await db.end();
  }
}
