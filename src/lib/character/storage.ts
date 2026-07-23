"use server";

/**
 * Persistência de personagem (tabela `characters`, migration
 * 0002_characters.sql; `campaign_id`/`profile_id`/`owner_id` desde a
 * migration 0011, checkpoint v0.23; `archived_at` desde a migration
 * 0012, checkpoint v0.25).
 *
 * Checkpoint v0.28 — refactor de escopo (SEM mudança de RLS ainda):
 * `characters` continua com policies `characters_dev_transition_*`
 * totalmente abertas (anon+authenticated) — ver auditoria do
 * checkpoint v0.27. O bloqueio identificado lá era que TODA função
 * deste arquivo usava `getContentClient()` (client anon puro, nunca
 * anexa o JWT do narrador logado), então mesmo com `owner_id`
 * preenchido desde v0.23, nenhuma policy `owner_id = auth.uid()`
 * poderia funcionar — a requisição nunca chegava como
 * `authenticated`.
 *
 * Este checkpoint prepara o terreno SEM endurecer RLS ainda: separa
 * as funções por quem realmente as chama, usando o client certo para
 * cada consumidor:
 *
 *   - PRODUTO/NARRADOR (seção 1): `getScopedTableClient()` — o MESMO
 *     helper já usado por `table/storage.ts` desde o checkpoint v0.16
 *     (reutilizado aqui, não duplicado). Anexa o JWT do narrador
 *     logado quando existe sessão; cai para anon puro se não houver
 *     (mesmo comportamento de sempre, só que agora PRONTO para uma
 *     policy `owner_id = auth.uid()` funcionar no dia em que a RLS for
 *     endurecida). Usadas só por `/mesas/[campaignId]` (dashboard,
 *     sempre autenticado).
 *   - PRODUTO/JOGADOR POR SESSÃO (seção 2): também usam
 *     `getScopedTableClient()`, mas a "identidade" de quem pode ler/
 *     escrever não vem de `auth.uid()` (jogador não tem login real
 *     ainda) — vem de `validateProfileSessionToken()` (table/
 *     storage.ts, checkpoint v0.30), que exige um TOKEN REAL de sessão
 *     (profileSessionId + rawSessionToken, hash comparado em
 *     profile_sessions) ANTES de tocar no personagem. Usadas só por
 *     `/ficha` (modo product).
 *   - DEV/DIAGNÓSTICO (seção 3): `getContentClient()` (anon puro,
 *     como sempre foi) — usadas só por `/dev/character-sheet`,
 *     `/dev/table`, `/dev/join/[campaignId]`. Mostram a lista global
 *     de propósito (é a razão de existir dessas rotas).
 *   - LEGADO/COMPATIBILIDADE (seção 4): `createCharacter`,
 *     `updateCharacter`, `getCharacter`, `listCharacters`,
 *     `deleteCharacter` — mantidas com o MESMO nome e client anon de
 *     sempre porque `scripts/test-character-storage.ts` e o modo dev
 *     de `/dev/character-sheet` dependem exatamente desse
 *     comportamento. Não usar em rota de produto nova — usar as
 *     seções 1/2 acima.
 *
 * Checkpoint v0.29 — RLS controlada (parcial, não final):
 *
 *   - Adiciona policies `characters_owner_*` (authenticated,
 *     owner_id = auth.uid()) — aditivas, coexistem com
 *     `characters_dev_transition_*` sem mudar nada hoje (ver migration
 *     0014). Preparam a base real para narrador autenticado.
 *   - A SEÇÃO 2 (produto/jogador por sessão) deixa de acessar a tabela
 *     `characters` diretamente: `getCharacterForProfileSession`/
 *     `saveCharacterForProfileSession` agora chamam as funções SQL
 *     `get_character_for_profile_session`/
 *     `save_character_for_profile_session` (security definer,
 *     migration 0014), que revalidam a sessão DENTRO do banco e
 *     ignoram RLS — a operação mais sensível desta tabela (jogador
 *     anônimo lendo/escrevendo um personagem) não depende mais de
 *     `characters_dev_transition_select/update` continuarem abertas.
 *   - `characters_dev_transition_*` continuam abertas mesmo assim —
 *     removê-las quebraria `/dev/character-sheet` (edita QUALQUER
 *     personagem da lista global, incluindo já vinculados a mesa/
 *     perfil, por design de diagnóstico) e
 *     `scripts/test-character-storage.ts` (roda sem login). Ver
 *     comentário em cada policy (migration 0014) e blockers/relatório
 *     do checkpoint v0.29 para a condição exata de remoção futura.
 *
 * Etapa 12 (correção 6) — os parágrafos acima ("DEV/DIAGNÓSTICO" e
 * "LEGADO/COMPATIBILIDADE" usando `getContentClient()`/anon) estão
 * DESATUALIZADOS e preservados aqui só como histórico: a auditoria
 * desta correção encontrou que `updateCharacter` e
 * `listCharactersForCampaign` são usadas por rota de PRODUTO real
 * (`MesaDetailClient.tsx`, `table/endRound.ts`, `table/endScene.ts`,
 * `/join/[token]/page.tsx`), não só por dev/scripts — e que "função de
 * desenvolvimento não justifica policy anon aberta em produção" (não
 * há mais policy `anon` nenhuma depois da migration 0031). Todas as
 * funções das seções 3 e 4 agora usam `getScopedTableClient()`; ver
 * nota completa no início da SEÇÃO 3, abaixo.
 */

import { getScopedTableClient } from "../auth/scopedClient";
import { getCurrentUser } from "../auth/session";
import { validateProfileSessionToken } from "../table/storage";
import type { Campaign, CampaignProfile } from "../table";
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

/** Insere um personagem via um client já resolvido (interno — compartilhado entre criação/duplicação de narrador). */
async function insertCharacterScoped(
  client: Awaited<ReturnType<typeof getScopedTableClient>>,
  character: Character,
  options: { campaignId?: string | null; profileId?: string | null; ownerLabel?: string } = {},
): Promise<CharacterRecord> {
  const payload = buildPayloadForSave(character);
  const ownerId = await currentOwnerId();
  const { data, error } = await client
    .from(TABLE)
    .insert({
      name: payload.nome,
      owner_label: options.ownerLabel ?? null,
      status: "draft",
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

// =====================================================================
// SEÇÃO 1 — PRODUTO / NARRADOR (checkpoint v0.28)
//
// Usam getScopedTableClient() (anexa o JWT do narrador logado, cai
// para anon se não houver sessão — mesmo helper de table/storage.ts,
// reutilizado aqui, não duplicado). Chamadas só por
// /mesas/[campaignId] (dashboard, sempre atrás de login desde v0.21).
// =====================================================================

/** Lista os personagens ligados a uma mesa (campaign_id), visão do narrador dono. Mais recentemente atualizados primeiro. */
export async function listCharactersForNarratorCampaign(campaignId: string): Promise<CharacterRecord[]> {
  const client = await getScopedTableClient();
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

/** Lista os personagens ligados a um perfil (profile_id), visão do narrador dono. */
export async function listCharactersForNarratorProfile(profileId: string): Promise<CharacterRecord[]> {
  const client = await getScopedTableClient();
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
 * Lista personagens legados/globais (sem mesa) disponíveis para o
 * narrador vincular a uma mesa — substitui o padrão antigo de
 * `listCharacters()` + filtro em memória no dashboard (checkpoint
 * v0.23/v0.25). Continua sem filtrar por owner_id (a tabela ainda não
 * tem RLS restritiva — ver blockers no final do arquivo), mas já usa
 * o client escopado, pronto para quando isso mudar.
 */
export async function listUnassignedCharactersForNarrator(): Promise<CharacterRecord[]> {
  const client = await getScopedTableClient();
  const { data, error } = await client
    .from(TABLE)
    .select()
    .is("campaign_id", null)
    .order("updated_at", { ascending: false });

  if (error) {
    throw new CharacterStorageError(`Falha ao listar personagens sem mesa: ${error.message}`, error);
  }
  return (data as CharacterRecord[]) ?? [];
}

/** Lista os personagens arquivados de uma mesa, visão do narrador dono. */
export async function listArchivedCharactersForNarratorCampaign(campaignId: string): Promise<CharacterRecord[]> {
  const client = await getScopedTableClient();
  const { data, error } = await client
    .from(TABLE)
    .select()
    .eq("campaign_id", campaignId)
    .not("archived_at", "is", null)
    .order("updated_at", { ascending: false });

  if (error) {
    throw new CharacterStorageError(`Falha ao listar personagens arquivados da mesa "${campaignId}": ${error.message}`, error);
  }
  return (data as CharacterRecord[]) ?? [];
}

/**
 * Cria um personagem mínimo já nascendo vinculado a uma mesa
 * (dashboard do narrador, checkpoint v0.25 — agora via client
 * escopado). `owner_id` é carimbado com o narrador logado quando há
 * sessão.
 */
export async function createCharacterForCampaign(
  campaignId: string,
  character: Character,
  options: { profileId?: string | null; ownerLabel?: string } = {},
): Promise<CharacterRecord> {
  const client = await getScopedTableClient();
  return insertCharacterScoped(client, character, { ...options, campaignId });
}

/**
 * Vincula um personagem a uma mesa (ou remove o vínculo com
 * `campaignId: null`). Não mexe em `profile_id` — desvincular da mesa
 * não desvincula automaticamente do perfil (pode ficar inconsistente
 * intencionalmente; quem chama decide se também limpa o perfil).
 */
export async function assignCharacterToCampaign(characterId: string, campaignId: string | null): Promise<CharacterRecord> {
  const client = await getScopedTableClient();
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
  const client = await getScopedTableClient();
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

/** Renomeia um personagem — atualiza a coluna `name` E `payload.nome` juntos (mesmo invariante de buildPayloadForSave). */
export async function renameCharacter(id: string, newName: string): Promise<CharacterRecord> {
  const client = await getScopedTableClient();
  const { data: current, error: fetchError } = await client.from(TABLE).select().eq("id", id).maybeSingle();
  if (fetchError) {
    throw new CharacterStorageError(`Falha ao buscar personagem "${id}" para renomear: ${fetchError.message}`, fetchError);
  }
  if (!current) {
    throw new CharacterStorageError(`Personagem "${id}" não encontrado para renomear.`);
  }
  const currentRecord = current as CharacterRecord;
  const finalName = newName.trim() ? newName.trim() : currentRecord.name;
  const { data, error } = await client
    .from(TABLE)
    .update({ name: finalName, payload: { ...currentRecord.payload, nome: finalName } })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    throw new CharacterStorageError(`Falha ao renomear personagem "${id}": ${error.message}`, error);
  }
  return data as CharacterRecord;
}

/** Arquiva um personagem (`archived_at = agora`). Não desvincula mesa/perfil — só marca como inativo. */
export async function archiveCharacter(id: string): Promise<CharacterRecord> {
  const client = await getScopedTableClient();
  const { data, error } = await client
    .from(TABLE)
    .update({ archived_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    throw new CharacterStorageError(`Falha ao arquivar personagem "${id}": ${error.message}`, error);
  }
  return data as CharacterRecord;
}

/** Restaura um personagem arquivado (`archived_at = null`). */
export async function restoreCharacter(id: string): Promise<CharacterRecord> {
  const client = await getScopedTableClient();
  const { data, error } = await client
    .from(TABLE)
    .update({ archived_at: null })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    throw new CharacterStorageError(`Falha ao restaurar personagem "${id}": ${error.message}`, error);
  }
  return data as CharacterRecord;
}

/**
 * Duplica um personagem: clona o payload (nome com sufixo " (cópia)"),
 * mantém a mesma mesa (campaign_id) mas NUNCA copia o profile_id — o
 * duplicado nasce sem perfil, para nunca ficar ambíguo qual dos dois é
 * "o" personagem daquele perfil (só active_character_id do perfil
 * decide isso, e essa cópia não mexe nele). owner_id é carimbado com o
 * narrador logado, igual createCharacterForCampaign.
 */
export async function duplicateCharacter(id: string): Promise<CharacterRecord> {
  const client = await getScopedTableClient();
  const { data: source, error: fetchError } = await client.from(TABLE).select().eq("id", id).maybeSingle();
  if (fetchError) {
    throw new CharacterStorageError(`Falha ao buscar personagem "${id}" para duplicar: ${fetchError.message}`, fetchError);
  }
  if (!source) {
    throw new CharacterStorageError(`Personagem "${id}" não encontrado para duplicar.`);
  }
  const sourceRecord = source as CharacterRecord;
  const clonedPayload: Character = {
    ...sourceRecord.payload,
    nome: `${sourceRecord.payload.nome} (cópia)`,
  };
  return insertCharacterScoped(client, clonedPayload, {
    ownerLabel: sourceRecord.owner_label ?? undefined,
    campaignId: sourceRecord.campaign_id,
    profileId: null,
  });
}

// =====================================================================
// SEÇÃO 2 — PRODUTO / JOGADOR POR SESSÃO (checkpoint v0.28/v0.30, /ficha)
//
// Não há login real de jogador ainda — a "identidade" vem de um TOKEN
// REAL de sessão (checkpoint v0.30): `profileSessionId` +
// `rawSessionToken`, gerados por `enterCampaignProfile`
// (table/storage.ts) e guardados no localStorage do navegador (ver
// browserSession.ts). `validateProfileSessionToken` faz o hard check
// (hash bate, status='active', perfil ainda bloqueado) — sem
// fallback para o sessionId antigo. Nunca expõem lista global nem
// aceitam um characterId arbitrário — só o personagem ATIVO do perfil
// da sessão validada.
// =====================================================================

export interface CharacterForProfileSessionResult {
  ok: boolean;
  reason?: "invalid_session" | "no_character";
  campaign?: Campaign;
  profile?: CampaignProfile;
  character?: CharacterRecord;
}

/**
 * Busca o personagem ativo do perfil de uma sessão real e válida.
 *
 * Checkpoint v0.30: a validação da sessão (`validateProfileSessionToken`,
 * table/storage.ts) e a leitura do personagem (RPC
 * `get_character_for_profile_session`, security definer, migration
 * 0016) exigem `profileSessionId`+`rawSessionToken` reais — hard check
 * contra `profile_sessions.session_token_hash`/`status`, sem fallback
 * para o sessionId de navegador antigo.
 */
export async function getCharacterForProfileSession(
  campaignId: string,
  profileId: string,
  profileSessionId: string,
  rawSessionToken: string,
): Promise<CharacterForProfileSessionResult> {
  const validation = await validateProfileSessionToken(campaignId, profileId, profileSessionId, rawSessionToken);
  if (!validation.ok || !validation.profile) {
    return { ok: false, reason: "invalid_session" };
  }
  if (!validation.profile.active_character_id) {
    return { ok: false, reason: "no_character", campaign: validation.campaign, profile: validation.profile };
  }

  const client = await getScopedTableClient();
  const { data, error } = await client.rpc("get_character_for_profile_session", {
    p_campaign_id: campaignId,
    p_profile_id: profileId,
    p_profile_session_id: profileSessionId,
    p_raw_session_token: rawSessionToken,
  });

  if (error) {
    throw new CharacterStorageError(`Falha ao buscar personagem da sessão de perfil: ${error.message}`, error);
  }
  const record = ((data as CharacterRecord[] | null) ?? [])[0];
  if (!record) {
    return { ok: false, reason: "no_character", campaign: validation.campaign, profile: validation.profile };
  }
  return { ok: true, campaign: validation.campaign, profile: validation.profile, character: record };
}

/**
 * Salva (update) o personagem ativo de uma sessão real e válida.
 *
 * Checkpoint v0.30: a escrita vai via a função SQL
 * `save_character_for_profile_session` (security definer, migration
 * 0016) — ela mesma faz o hard check do token (hash bate,
 * status='active', perfil bloqueado) E confere que `characterId`
 * ainda é o ativo do perfil, DENTRO do banco, atomicamente. A checagem
 * em TypeScript abaixo (via `validateProfileSessionToken`) fica como
 * defesa em profundidade extra (falha cedo, com uma mensagem mais
 * específica, antes de gastar a chamada da RPC) — mas quem realmente
 * impede um token/id trocado é a função SQL.
 */
export async function saveCharacterForProfileSession(
  campaignId: string,
  profileId: string,
  profileSessionId: string,
  rawSessionToken: string,
  characterId: string,
  character: Character,
): Promise<CharacterRecord> {
  const validation = await validateProfileSessionToken(campaignId, profileId, profileSessionId, rawSessionToken);
  if (!validation.ok || !validation.profile) {
    throw new CharacterStorageError("Sessão de perfil inválida — não é possível salvar o personagem.");
  }
  if (validation.profile.active_character_id !== characterId) {
    throw new CharacterStorageError(
      `Personagem "${characterId}" não é mais o ativo desta sessão de perfil — recarregue a ficha.`,
    );
  }

  const payload = buildPayloadForSave(character);
  const client = await getScopedTableClient();
  const { data, error } = await client.rpc("save_character_for_profile_session", {
    p_campaign_id: campaignId,
    p_profile_id: profileId,
    p_profile_session_id: profileSessionId,
    p_raw_session_token: rawSessionToken,
    p_character_id: characterId,
    p_name: payload.nome,
    p_payload: payload,
  });

  if (error) {
    throw new CharacterStorageError(`Falha ao salvar personagem "${characterId}" da sessão de perfil: ${error.message}`, error);
  }
  const record = ((data as CharacterRecord[] | null) ?? [])[0];
  if (!record) {
    throw new CharacterStorageError(`Falha ao salvar personagem "${characterId}": nenhuma linha retornada.`);
  }
  return record;
}

// =====================================================================
// SEÇÃO 3 — DEV / DIAGNÓSTICO
//
// Etapa 12 (correção 6): a auditoria desta correção reabriu a
// premissa "usadas só por dev/scripts" função a função (não por
// nome) e encontrou uma exceção real: `updateCharacter` (seção 4
// abaixo) também é chamada por `MesaDetailClient.tsx`,
// `table/endRound.ts` e `table/endScene.ts` — fluxo de PRODUTO real
// (dashboard do narrador, "Encerrar Rodada"/"Encerrar Cena"), e
// `listCharactersForCampaign` também é chamada por
// `/join/[token]/page.tsx` — fluxo de produto real (pós-login,
// pós-aceite de convite). Preservar `getContentClient()` (anon puro)
// nessas duas para "não quebrar dev" deixaria de fazer sentido no
// momento em que a RLS de `anon` é removida por completo (ver
// migration 0031): função de desenvolvimento não justifica policy
// aberta, mas função de PRODUTO também não pode depender de client
// anon. Por isso todas as funções desta seção e da seção 4 abaixo
// foram migradas para `getScopedTableClient()` (mesmo helper das
// seções 1/2) — anexam o JWT de quem estiver logado (narrador ou
// jogador com sessão real) e, sem sessão, se comportam como anon sem
// nenhuma policy — ou seja, dev/diagnóstico sem login passa a ver
// listas vazias / falhar por RLS, em vez de acessar a tabela sem
// restrição. Consequência aceita e documentada (não é regressão de
// produto): `scripts/test-character-storage.ts`,
// `scripts/test-campaign-end-scene.ts` e
// `scripts/test-campaign-end-round.ts` (rodam sem login, fora de um
// contexto de request) deixam de funcionar sem uma sessão real — nunca
// fizeram parte da verificação executável automatizada
// (`validate-campaign-homebrew.mjs`) e já exigiam um Supabase real
// para rodar.
// =====================================================================

/** Lista TODOS os personagens (global, sem filtro de mesa/dono) — só para telas dev/diagnóstico. Requer sessão (narrador logado) desde a correção 6; sem sessão, RLS devolve lista vazia. */
export async function listLegacyCharactersDev(): Promise<CharacterRecord[]> {
  return listCharacters();
}

// =====================================================================
// SEÇÃO 4 — LEGADO / COMPATIBILIDADE
//
// Mantidas com o MESMO nome (compatibilidade de assinatura com
// scripts/dev existentes), mas migradas de `getContentClient()` para
// `getScopedTableClient()` na correção 6 — ver nota da seção 3 acima.
// `updateCharacter` e `listCharactersForCampaign`, especificamente,
// SÃO usadas por rota de produto real (auditado nesta correção) — não
// são apenas legado.
// =====================================================================

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
  const client = await getScopedTableClient();
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
  const client = await getScopedTableClient();
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
  const client = await getScopedTableClient();
  const { data, error } = await client.from(TABLE).select().eq("id", id).maybeSingle();

  if (error) {
    throw new CharacterStorageError(`Falha ao buscar personagem "${id}": ${error.message}`, error);
  }
  return (data as CharacterRecord | null) ?? null;
}

/** Lista personagens, mais recentemente atualizados primeiro. */
export async function listCharacters(): Promise<CharacterRecord[]> {
  const client = await getScopedTableClient();
  const { data, error } = await client.from(TABLE).select().order("updated_at", { ascending: false });

  if (error) {
    throw new CharacterStorageError(`Falha ao listar personagens: ${error.message}`, error);
  }
  return (data as CharacterRecord[]) ?? [];
}

/** Apaga um personagem por id. */
export async function deleteCharacter(id: string): Promise<void> {
  const client = await getScopedTableClient();
  const { error } = await client.from(TABLE).delete().eq("id", id);

  if (error) {
    throw new CharacterStorageError(`Falha ao apagar personagem "${id}": ${error.message}`, error);
  }
}

// =====================================================================
// Compat direta (checkpoint v0.23) — mantida com o nome antigo, mas
// migrada para `getScopedTableClient()` na correção 6: a auditoria
// confirmou que `/join/[token]/page.tsx` chama esta função DEPOIS de
// exigir `getCurrentUser()` e aceitar o convite (`campaign_members`
// ativo) — nunca antes de login, ao contrário do que este comentário
// afirmava. Não é mais "acesso anônimo real", é produto autenticado.
// =====================================================================

/** Lista os personagens ligados a uma mesa (campaign_id), mais recentemente atualizados primeiro. Uso: /join/[token] (pós-login, campanha-escopado, nunca global). */
export async function listCharactersForCampaign(campaignId: string): Promise<CharacterRecord[]> {
  const client = await getScopedTableClient();
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
