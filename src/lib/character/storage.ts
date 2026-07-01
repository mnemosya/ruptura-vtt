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
import { getCurrentUser } from "../auth/session";
import { CharacterStorageError } from "./storage.errors";
import type { Character, CharacterRecord } from "./types";

const TABLE = "characters";

/**
 * Id do narrador logado, ou null. Best effort: getCurrentUser lê o
 * cookie httpOnly via next/headers, que só existe num contexto de
 * request (Server Action/RSC); fora disso (scripts node) cai no catch
 * e retorna null, sem quebrar. Mesmo padrão de currentOwnerId em
 * src/lib/table/storage.ts.
 */
async function currentOwnerId(): Promise<string | null> {
  try {
    const user = await getCurrentUser();
    return user?.id ?? null;
  } catch {
    return null;
  }
}

export interface SaveCharacterOptions {
  ownerLabel?: string;
  status?: string;
  /** Mesa a que o personagem pertence (migration 0011, checkpoint v0.23). */
  campaignId?: string | null;
  /** Perfil a que o personagem pertence dentro da mesa (migration 0011). */
  profileId?: string | null;
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

/**
 * Cria um novo registro de personagem. payload guarda o Character inteiro.
 * `campaignId`/`profileId` (checkpoint v0.23) são opcionais — omitidos,
 * o personagem nasce "legado" (sem mesa), mesmo comportamento de antes.
 * `owner_id` é carimbado com o narrador logado quando há sessão
 * (best-effort, nunca bloqueia a criação se não houver).
 */
export async function createCharacter(
  character: Character,
  options: SaveCharacterOptions = {},
): Promise<CharacterRecord> {
  const payload = buildPayloadForSave(character);
  const client = getContentClient();
  const ownerId = await currentOwnerId();
  const { data, error } = await client
    .from(TABLE)
    .insert({
      name: payload.nome,
      owner_label: options.ownerLabel ?? null,
      status: options.status ?? "draft",
      payload,
      campaign_id: options.campaignId ?? null,
      profile_id: options.profileId ?? null,
      owner_id: ownerId,
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
 * com o payload). `campaignId`/`profileId` só são tocados quando
 * explicitamente passados em options — omitir preserva o vínculo atual.
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
  if (options.campaignId !== undefined) update.campaign_id = options.campaignId;
  if (options.profileId !== undefined) update.profile_id = options.profileId;

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

// =====================================================================
// Vínculo a mesa/perfil (checkpoint v0.23) — ver migration 0011
// =====================================================================

/** Lista os personagens ligados a uma mesa (campaign_id), mais recentemente atualizados primeiro. */
export async function listCharactersForCampaign(campaignId: string): Promise<CharacterRecord[]> {
  const client = getContentClient();
  const { data, error } = await client
    .from(TABLE)
    .select()
    .eq("campaign_id", campaignId)
    .order("updated_at", { ascending: false });

  if (error) {
    throw new CharacterStorageError(`Falha ao listar personagens da mesa "${campaignId}": ${error.message}`, error);
  }
  return (data as CharacterRecord[]) ?? [];
}

/** Lista os personagens ligados a um perfil (profile_id), mais recentemente atualizados primeiro. */
export async function listCharactersForProfile(profileId: string): Promise<CharacterRecord[]> {
  const client = getContentClient();
  const { data, error } = await client
    .from(TABLE)
    .select()
    .eq("profile_id", profileId)
    .order("updated_at", { ascending: false });

  if (error) {
    throw new CharacterStorageError(`Falha ao listar personagens do perfil "${profileId}": ${error.message}`, error);
  }
  return (data as CharacterRecord[]) ?? [];
}

/**
 * Vincula um personagem a uma mesa (ou remove o vínculo com
 * `campaignId: null`). Não mexe em `profile_id` — desvincular da mesa
 * não desvincula automaticamente do perfil (pode ficar inconsistente
 * intencionalmente; quem chama decide se também limpa o perfil).
 */
export async function assignCharacterToCampaign(characterId: string, campaignId: string | null): Promise<CharacterRecord> {
  const client = getContentClient();
  const { data, error } = await client
    .from(TABLE)
    .update({ campaign_id: campaignId })
    .eq("id", characterId)
    .select()
    .single();

  if (error) {
    throw new CharacterStorageError(`Falha ao vincular personagem "${characterId}" à mesa: ${error.message}`, error);
  }
  return data as CharacterRecord;
}

/** Vincula um personagem a um perfil (ou remove o vínculo com `profileId: null`). */
export async function assignCharacterToProfile(characterId: string, profileId: string | null): Promise<CharacterRecord> {
  const client = getContentClient();
  const { data, error } = await client
    .from(TABLE)
    .update({ profile_id: profileId })
    .eq("id", characterId)
    .select()
    .single();

  if (error) {
    throw new CharacterStorageError(`Falha ao vincular personagem "${characterId}" ao perfil: ${error.message}`, error);
  }
  return data as CharacterRecord;
}
