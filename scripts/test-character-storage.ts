/**
 * Teste de CRUD da camada de persistência de personagem
 * (src/lib/character/storage.ts), sob as policies REAIS.
 *
 * ── O que mudou, e por quê ───────────────────────────────────────────
 *
 * A versão anterior rodava SEM LOGIN e dependia das policies
 * `characters_dev_transition_*`, que permitiam CRUD irrestrito a `anon`.
 * Essas policies não existem mais — foram substituídas pelas
 * `characters_authenticated_*`, e `anon` sequer tem GRANT na tabela. O
 * teste passou anos apontando para uma porta que foi fechada, e falhava
 * com "permission denied for table characters".
 *
 * Agora ele AUTENTICA. E autentica de verdade: cria uma conta
 * descartável com service role, faz `signInWithPassword` de verdade, e
 * injeta os tokens resultantes onde o app leria o cookie de sessão.
 * O que é simulado é só o TRANSPORTE do token (cookie de request →
 * variável de ambiente lida por um stub de `next/headers`), porque
 * `cookies()` do Next vive num AsyncLocalStorage de request e um script
 * não tem request. A sessão, o JWT e a RLS são reais — é o mesmo
 * princípio de `scripts/dev/authSession.ts`, que injeta o cookie real
 * num navegador do Playwright.
 *
 * Por isso este teste roda com um loader:
 *   tsx --import ./scripts/dev/stub-next-headers/register.mjs …
 * (já embutido em `npm run test:character-storage`).
 *
 * ── O que ele passou a cobrir ────────────────────────────────────────
 *
 * Além do CRUD, as próprias policies — inclusive duas coisas que só
 * aparecem quando se exercita a tabela com uma conta real.
 *
 * PRIMEIRA: a assimetria de DELETE.
 *
 *   INSERT/UPDATE: (campanha E você é o narrador dela)
 *                  OU (sem campanha E o personagem é seu)
 *   DELETE:        SÓ (campanha E você é o narrador dela)
 *
 * Um personagem SOLTO pode ser criado e editado pelo dono e NÃO pode
 * ser apagado por ninguém através da policy. Isso é pendência de
 * PRODUTO, não bug a consertar aqui — ver
 * `docs/relatorios/PENDENCIA_CICLO_DE_VIDA_PERSONAGEM_SOLTO.md`.
 *
 * SEGUNDA: `INSERT … RETURNING` é recusado nesta tabela para qualquer
 * conta real. A policy de SELECT é `can_read_character(id)`, uma função
 * STABLE que RECONSULTA `characters`; no RETURNING ela roda com o
 * snapshot da consulta e não enxerga a linha sendo inserida, devolve
 * falso, e o Postgres reporta como violação de RLS.
 *
 * O contorno é `insertCharacterScoped` (id gerado no cliente, SELECT
 * como comando separado). Quando este teste passou a autenticar, ele
 * revelou que o `createCharacter` LEGADO tinha ficado de fora desse
 * contorno e quebrava para qualquer usuário autenticado. Já foi
 * corrigido — e o critério 8 agora guarda a correção: ele afirma que os
 * DOIS caminhos de criação funcionam, então uma regressão que devolva o
 * `.insert().select()` falha aqui.
 *
 * Cria e apaga SOMENTE dados marcados com TEST_CHARACTER_NAME e uma
 * campanha descartável. A limpeza final usa service role — não porque o
 * caminho autenticado falhe, mas porque o personagem solto é, por
 * policy, indeletável por ele.
 */

import "dotenv/config";
import { config as loadDotenv } from "dotenv";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

loadDotenv({ path: ".env.local" });

const TEST_CHARACTER_NAME = "__TESTE_STORAGE_RUPTURA__";
const COOKIE_ENV = "RUPTURA_TEST_AUTH_COOKIE";

function requireEnv(nome: string): string {
  const v = process.env[nome];
  if (!v) {
    console.error(`Variável de ambiente ausente: ${nome}`);
    process.exit(1);
  }
  return v;
}

const supabaseUrl = requireEnv("SUPABASE_URL");
const anonKey = requireEnv("SUPABASE_ANON_KEY");
const admin = createClient(supabaseUrl, requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false, autoRefreshToken: false },
});

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Falha de asserção: ${message}`);
}

/**
 * Põe (ou tira) a sessão que o stub de `next/headers` devolve.
 *
 * Trocar de sessão é só trocar o valor: o stub lê a variável no momento
 * da chamada, e `getScopedTableClient` monta um client novo a cada
 * operação — nunca há sessão em cache para vazar de um passo pro outro.
 */
function usarSessao(tokens: { access_token: string; refresh_token: string } | null): void {
  if (tokens) process.env[COOKIE_ENV] = JSON.stringify(tokens);
  else delete process.env[COOKIE_ENV];
}

async function main(): Promise<void> {
  console.log("=== test-character-storage ===\n");

  // Sem o stub, `cookies()` lança e TODA operação cairia no caminho
  // anônimo — o teste falharia lá na frente parecendo bug de policy.
  // Conferir aqui troca esse enigma por uma instrução.
  const stubAtivo = await import("next/headers")
    .then(({ cookies }) => cookies())
    .then(() => true)
    .catch(() => false);
  assert(stubAtivo, "rode via `npm run test:character-storage` — o stub de next/headers não está registrado");

  // ── Camada sob teste, importada depois do ambiente estar pronto ─────
  const storage = await import("../src/lib/character/storage");
  const { createInitialCharacter } = await import("../src/lib/character");

  // ── Cenário descartável ────────────────────────────────────────────
  const marca = Date.now();
  const senha = randomUUID();
  const emailDono = `teste-storage-dono-${marca}@ruptura.dev`;
  const emailOutro = `teste-storage-outro-${marca}@ruptura.dev`;

  const { data: uDono } = await admin.auth.admin.createUser({
    email: emailDono, password: senha, email_confirm: true,
    user_metadata: { display_name: "Dona do teste" },
  });
  const { data: uOutro } = await admin.auth.admin.createUser({
    email: emailOutro, password: senha, email_confirm: true,
    user_metadata: { display_name: "Estranho" },
  });
  const donoId = uDono!.user!.id;
  const outroId = uOutro!.user!.id;

  const campaignId = randomUUID();
  await admin.from("campaigns").insert({
    id: campaignId, name: `__TESTE_STORAGE_MESA_${marca}__`, owner_id: donoId,
  });

  const anon = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: sDono } = await anon.auth.signInWithPassword({ email: emailDono, password: senha });
  const { data: sOutro } = await anon.auth.signInWithPassword({ email: emailOutro, password: senha });
  const tokensDono = {
    access_token: sDono!.session!.access_token,
    refresh_token: sDono!.session!.refresh_token,
  };
  const tokensOutro = {
    access_token: sOutro!.session!.access_token,
    refresh_token: sOutro!.session!.refresh_token,
  };

  let soltoId: string | null = null;
  let daMesaId: string | null = null;

  try {
    // ── 1. Sem sessão, a porta está fechada ──────────────────────────
    usarSessao(null);
    // A recusa vem do GRANT, não da RLS: `anon` não tem privilégio
    // nenhum em `characters`, então a requisição morre antes de
    // qualquer policy ser avaliada. Por isso o esperado é uma EXCEÇÃO
    // ("permission denied for table characters"), e não uma lista
    // vazia — uma lista vazia significaria que anon alcança a tabela e
    // a RLS é que filtra, que é uma postura mais frouxa do que a atual.
    const recusa = async (o: () => Promise<unknown>): Promise<string | null> => {
      try { await o(); return null; } catch (e) { return e instanceof Error ? e.message : String(e); }
    };
    const erroListar = await recusa(() => storage.listCharacters());
    assert(erroListar?.includes("permission denied"), `sem sessão, listar tem que ser recusado — veio: ${erroListar}`);
    const erroCriar = await recusa(() =>
      storage.createCharacter(createInitialCharacter(null, TEST_CHARACTER_NAME)));
    assert(erroCriar?.includes("permission denied"), `sem sessão, criar tem que ser recusado — veio: ${erroCriar}`);
    console.log("1. Sem sessão: listar e criar recusados pelo GRANT, antes mesmo da RLS.");

    // ── 2. O caminho REAL do produto: personagem de mesa ─────────────
    // `createCharacterForCampaign` → `insertCharacterScoped`, que é a
    // função que contorna o defeito do RETURNING. É este o caminho que
    // o narrador usa de verdade.
    usarSessao(tokensDono);
    const daMesa = await storage.createCharacterForCampaign(
      campaignId,
      createInitialCharacter(null, TEST_CHARACTER_NAME),
    );
    daMesaId = daMesa.id;
    assert(daMesa.name === TEST_CHARACTER_NAME, "nome do registro criado deve ser o nome de teste");
    assert(daMesa.campaign_id === campaignId, "o personagem deve nascer ligado à mesa");
    assert(daMesa.payload.metadados?.schema_version === 1, "schema_version deve ser 1 num personagem novo");
    console.log(`2. Criado na mesa: id=${daMesa.id}`);

    const lido = await storage.getCharacter(daMesa.id);
    assert(lido != null, "getCharacter deve devolver o recém-criado");
    assert(lido.payload.nome === TEST_CHARACTER_NAME, "nome carregado deve bater com o criado");
    console.log(`3. Carregado por id: nome="${lido.payload.nome}"`);

    const editado = await storage.updateCharacter(daMesa.id, {
      ...lido.payload,
      nome: `${TEST_CHARACTER_NAME}_editado`,
      atributos: { ...lido.payload.atributos, corpo: 4 },
    });
    assert(editado.payload.nome === `${TEST_CHARACTER_NAME}_editado`, "nome deve refletir a edição");
    assert(editado.payload.atributos.corpo === 4, "corpo deve refletir a edição");
    assert(
      editado.payload.metadados?.atualizado_em !== daMesa.payload.metadados?.atualizado_em,
      "atualizado_em deve mudar após update",
    );
    console.log(`4. Atualizado: nome="${editado.payload.nome}", corpo=${editado.payload.atributos.corpo}`);

    const listaDona = await storage.listCharacters();
    assert(listaDona.some((c) => c.id === daMesa.id), "o personagem deve aparecer na listagem da dona");
    console.log(`5. Presente na listagem (${listaDona.length} visível(is) para a dona).`);

    // ── 3. Quem não é da mesa não enxerga ────────────────────────────
    usarSessao(tokensOutro);
    const doEstranho = await storage.getCharacter(daMesa.id);
    assert(doEstranho === null, "quem não é da mesa não pode ler o personagem");
    const listaEstranho = await storage.listCharacters();
    assert(
      !listaEstranho.some((c) => c.id === daMesa.id),
      "o personagem não pode aparecer na listagem de quem não é da mesa",
    );
    console.log("6. Outra conta não enxerga o personagem da mesa.");

    // ── 4. Apagar, como narradora da mesa ────────────────────────────
    usarSessao(tokensDono);
    await storage.deleteCharacter(daMesa.id);
    assert(await storage.getCharacter(daMesa.id) === null, "getCharacter deve devolver null após apagar");
    daMesaId = null;
    console.log("7. Apagado pela narradora e confirmado ausente.");

    // ── 5. O caminho LEGADO, agora que ele também passa pelo contorno ─
    // `createCharacter` fazia `.insert().select()` e esbarrava no
    // RETURNING; hoje delega a `insertCharacterScoped` como os demais.
    // Este critério guarda a correção: uma regressão que devolva o
    // `.insert().select()` volta a falhar aqui.
    const solto = await storage.createCharacter(createInitialCharacter(null, TEST_CHARACTER_NAME));
    soltoId = solto.id;
    assert(solto.owner_id === donoId, "o legado deve carimbar a dona em `owner_id`");
    assert(solto.status === "draft", "sem `status` explícito, o legado continua criando como rascunho");
    console.log(`8. \`createCharacter\` legado funciona e devolve a linha: id=${solto.id}`);

    // ── 6. A assimetria do personagem SOLTO ──────────────────────────
    // O recém-criado acima é solto (sem mesa) — serve de sujeito.
    assert(solto.campaign_id === null, "o personagem solto não deve ter mesa");

    const soltoEditado = await storage.updateCharacter(solto.id, {
      ...solto.payload,
      nome: `${TEST_CHARACTER_NAME}_solto`,
    });
    assert(soltoEditado.payload.nome === `${TEST_CHARACTER_NAME}_solto`, "a dona deve conseguir editar o solto");

    // `deleteCharacter` NÃO lança aqui: a RLS não gera erro, ela
    // simplesmente não deixa o DELETE acertar linha nenhuma. O que se
    // afirma é o EFEITO, não a exceção.
    await storage.deleteCharacter(solto.id);
    const aindaLa = await storage.getCharacter(solto.id);
    assert(aindaLa !== null, "personagem SEM mesa não é apagável pela policy atual — ver PENDENCIA_CICLO_DE_VIDA_PERSONAGEM_SOLTO.md");
    console.log("9. Personagem solto: editável pela dona e NÃO apagável (policy de DELETE exige mesa).");

    console.log("\n=== test-character-storage: TODOS OS PASSOS PASSARAM ===");
  } finally {
    usarSessao(null);
    // Service role na limpeza: o solto é indeletável pelo caminho
    // autenticado, por policy. Isto é higiene de teste, não parte do
    // que está sob verificação.
    for (const id of [soltoId, daMesaId]) {
      if (id) await admin.from("characters").delete().eq("id", id);
    }
    await admin.from("characters").delete().eq("campaign_id", campaignId);
    await admin.from("campaigns").delete().eq("id", campaignId);
    await admin.auth.admin.deleteUser(donoId);
    await admin.auth.admin.deleteUser(outroId);
  }
}

main().catch((err) => {
  console.error("\ntest-character-storage FALHOU:", err instanceof Error ? err.message : err);
  process.exit(1);
});
