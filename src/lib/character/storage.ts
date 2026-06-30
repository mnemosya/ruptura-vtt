"use server";

/**
 * Persistência mínima de personagem (tabela `characters`, migration
 * 0002_characters.sql).
 *
 * Server Actions ("use server"): chamadas diretamente do Client
 * Component (CharacterSheetClient) mas executadas no servidor — assim
 * SUPABASE_URL/SUPABASE_ANON_KEY (variáveis sem prefixo NEXT_PUBLIC_)
 * nunca chegam ao bundle do navegador, mesmo sendo a anon key (que já
 * é uma chave pública por design, protegida pela RLS — não a service
 * role key, que nunca é usada aqui nem em nenhum outro lugar do
 * frontend).
 *
 * Isso só funciona porque a migration 0002_characters.sql cria
 * policies de RLS TEMPORÁRIAS que liberam CRUD completo para
 * `anon`/`authenticated` — uma política de DESENVOLVIMENTO, válida
 * apenas enquanto não há autenticação. Ver o aviso completo no topo
 * daquela migration antes de usar isto em produção.
 */

import { getContentClient } from "../content";
import { CharacterStorageError } from "./storage.errors";
import type { Character, CharacterRecord } from "./types";

const TABLE = "characters";

export interface SaveCharacterOptions {
  ownerLabel?: string;
  status?: string;
}

/**
 * Monta o payload final gravado no banco: garante nome não-vazio e
 * carimba metadados.schema_version/atualizado_em (e criado_em, na
 * primeira gravação). Não é exportada — arquivos "use server" só
 * podem exportar funções assíncronas, e esta é síncrona/interna.
 *
 * recursos_atuais e demais campos do Character chegam aqui já
 * resolvidos por quem chama (ex.: normalizeCharacter() na UI, que
 * sabe os derivados calculados) — esta função não inventa valores de
 * jogo, só carimba metadados de persistência.
 */
function buildPayloadForSave(character: Character): Character {
  const now = new Date().toISOString();
  return {
    ...character,
    nome: character.nome?.trim() ? character.nome : "Personagem sem nome",
    metadados: {
      ...character.metadados,
      schema_version:
        typeof character.metadados?.schema_version === "number" ? character.metadados.schema_version : 1,
      criado_em: character.metadados?.criado_em ?? now,
      atualizado_em: now,
    },
  };
}

/** Cria um novo registro de personagem. payload guarda o Character inteiro. */
export async function createCharacter(
  character: Character,
  options: SaveCharacterOptions = {},
): Promise<CharacterRecord> {
  const payload = buildPayloadForSave(character);
  const client = getContentClient();
  const { data, error } = await client
    .from(TABLE)
    .insert({
      name: payload.nome,
      owner_label: options.ownerLabel ?? null,
      status: options.status ?? "draft",
      payload,
    })
    .select()
    .single();

  if (error) {
    throw new CharacterStorageError(`Falha ao criar personagem: ${error.message}`, error);
  }
  return data as CharacterRecord;
}

/**
 * Atualiza um personagem existente. Sobrescreve payload e name (que é
 * sempre projetado de character.nome, para a coluna ficar consistente
 * com o payload).
 */
export async function updateCharacter(
  id: string,
  character: Character,
  options: SaveCharacterOptions = {},
): Promise<CharacterRecord> {
  const payload = buildPayloadForSave(character);
  const client = getContentClient();
  const update: Record<string, unknown> = {
    name: payload.nome,
    payload,
  };
  if (options.ownerLabel !== undefined) update.owner_label = options.ownerLabel;
  if (options.status !== undefined) update.status = options.status;

  const { data, error } = await client
    .from(TABLE)
    .update(update)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    throw new CharacterStorageError(`Falha ao atualizar personagem "${id}": ${error.message}`, error);
  }
  return data as CharacterRecord;
}

/** Busca um personagem por id. Retorna null se não existir. */
export async function getCharacter(id: string): Promise<CharacterRecord | null> {
  const client = getContentClient();
  const { data, error } = await client.from(TABLE).select().eq("id", id).maybeSingle();

  if (error) {
    throw new CharacterStorageError(`Falha ao buscar personagem "${id}": ${error.message}`, error);
  }
  return (data as CharacterRecord | null) ?? null;
}

/** Lista personagens, mais recentemente atualizados primeiro. */
export async function listCharacters(): Promise<CharacterRecord[]> {
  const client = getContentClient();
  const { data, error } = await client.from(TABLE).select().order("updated_at", { ascending: false });

  if (error) {
    throw new CharacterStorageError(`Falha ao listar personagens: ${error.message}`, error);
  }
  return (data as CharacterRecord[]) ?? [];
}

/** Apaga um personagem por id. */
export async function deleteCharacter(id: string): Promise<void> {
  const client = getContentClient();
  const { error } = await client.from(TABLE).delete().eq("id", id);

  if (error) {
    throw new CharacterStorageError(`Falha ao apagar personagem "${id}": ${error.message}`, error);
  }
}
