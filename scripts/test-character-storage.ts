/**
 * Teste de CRUD da camada de persistência de personagem
 * (src/lib/character/storage.ts).
 *
 * Reusa diretamente as Server Actions de storage.ts (mesma camada
 * usada pela UI) — não duplica a regra de acesso ao Supabase. Mesmo
 * sendo "use server" (pensado para o bundler do Next.js), as funções
 * são TypeScript comum e importam normalmente sob tsx/Node.
 *
 * Usa exclusivamente SUPABASE_URL + SUPABASE_ANON_KEY (via
 * getContentClient(), chamado internamente por storage.ts) — nunca
 * SUPABASE_SERVICE_ROLE_KEY. Nenhum valor de env é impresso.
 *
 * Cria e apaga SOMENTE personagens com o nome exato
 * TEST_CHARACTER_NAME, para nunca arriscar apagar um personagem real.
 */

import "dotenv/config";
import { config as loadDotenv } from "dotenv";
import {
  createCharacter,
  updateCharacter,
  getCharacter,
  listCharacters,
  deleteCharacter,
} from "../src/lib/character/storage";
import { createInitialCharacter } from "../src/lib/character";

loadDotenv({ path: ".env.local" });

const TEST_CHARACTER_NAME = "__TESTE_STORAGE_RUPTURA__";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Falha de asserção: ${message}`);
}

async function cleanupLeftovers(): Promise<void> {
  const all = await listCharacters();
  const leftovers = all.filter((c) => c.name === TEST_CHARACTER_NAME);
  for (const c of leftovers) {
    await deleteCharacter(c.id);
  }
  if (leftovers.length > 0) {
    console.log(`Limpeza prévia: ${leftovers.length} registro(s) de teste residual(is) removido(s).`);
  }
}

async function main(): Promise<void> {
  console.log("=== test-character-storage ===\n");

  await cleanupLeftovers();

  // 1. Criar personagem de teste.
  const base = createInitialCharacter(null, TEST_CHARACTER_NAME);
  const created = await createCharacter(base);
  assert(created.name === TEST_CHARACTER_NAME, "nome do registro criado deve ser o nome de teste");
  assert(created.payload.metadados?.schema_version === 1, "schema_version deve ser 1 num personagem novo");
  console.log(`1. Criado: id=${created.id}, schema_version=${created.payload.metadados?.schema_version}`);

  // 2. Carregar por id.
  const loaded = await getCharacter(created.id);
  assert(loaded != null, "getCharacter deve retornar o registro recém-criado");
  assert(loaded.payload.nome === TEST_CHARACTER_NAME, "nome carregado deve bater com o criado");
  console.log(`2. Carregado por id: nome="${loaded.payload.nome}"`);

  // 3. Atualizar nome e atributo.
  const updatedPayload = {
    ...loaded.payload,
    nome: `${TEST_CHARACTER_NAME}_editado`,
    atributos: { ...loaded.payload.atributos, corpo: 4 },
  };
  const updated = await updateCharacter(created.id, updatedPayload);
  assert(updated.payload.nome === `${TEST_CHARACTER_NAME}_editado`, "nome deve refletir a edição");
  assert(updated.payload.atributos.corpo === 4, "corpo deve refletir a edição");
  assert(
    updated.payload.metadados?.atualizado_em !== created.payload.metadados?.atualizado_em,
    "atualizado_em deve mudar após update",
  );
  console.log(
    `3. Atualizado: nome="${updated.payload.nome}", corpo=${updated.payload.atributos.corpo}`,
  );

  // 4. Listar e confirmar presença (pelo id, já que o nome mudou no passo 3).
  const afterUpdateList = await listCharacters();
  const foundInList = afterUpdateList.find((c) => c.id === created.id);
  assert(foundInList != null, "personagem de teste deve aparecer na listagem");
  console.log(`4. Encontrado na listagem (${afterUpdateList.length} personagens no total).`);

  // 5. Apagar.
  await deleteCharacter(created.id);
  const afterDelete = await getCharacter(created.id);
  assert(afterDelete === null, "getCharacter deve retornar null após apagar");
  console.log("5. Apagado e confirmado ausente via getCharacter.");

  // 6. Confirmar que não sobrou nenhum registro de teste.
  const finalList = await listCharacters();
  const residual = finalList.filter((c) => c.name.startsWith(TEST_CHARACTER_NAME));
  assert(residual.length === 0, "não deve sobrar nenhum registro de teste");
  console.log("6. Confirmado: nenhum registro de teste residual.\n");

  console.log("=== test-character-storage: TODOS OS PASSOS PASSARAM ===");
}

main().catch((err) => {
  console.error("\ntest-character-storage FALHOU:", err instanceof Error ? err.message : err);
  process.exit(1);
});
