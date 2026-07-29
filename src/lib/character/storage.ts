"use server";

/**
 * Persistência de personagem (tabela `characters`, migration
 * 0002_characters.sql; `campaign_id`/`owner_id` desde a migration 0011;
 * `archived_at` desde a migration 0012).
 *
 * ---------------------------------------------------------------------
 * Fase 1 do plano de contas/campanhas/convites/personagens (revisão 4 —
 * docs/relatorios/AUDITORIA_REFATORACAO_CONTAS_CAMPANHAS_CONVITES_
 * PERSONAGENS.md, seção 13): `characters.profile_id` e todo o mecanismo
 * de "perfil"/sessão de perfil foram removidos do banco (migrations
 * 0051-0058). Autorização de personagem passa a ser:
 *
 *   - Narrador: dono da campanha (`campaigns.owner_id = auth.uid()`) —
 *     acessa qualquer personagem da própria campanha, sem precisar ser
 *     controlador.
 *   - Jogador: precisa SIMULTANEAMENTE (a) linha em
 *     `character_controllers` para o personagem E (b) participação
 *     ATIVA em `campaign_members` para a campanha do personagem — as
 *     duas condições revalidadas dentro de `can_read_character`/
 *     `can_manage_character` (migration 0052) a cada leitura/escrita.
 *   - `characters.owner_id` só autoriza quando `campaign_id IS NULL`
 *     (personagem solto, sem campanha) — nunca contorna o controle em
 *     personagem de campanha, mesmo com valor residual de dados antigos.
 *
 * Escrita do jogador controlador é SEMPRE via `updateCharacterSheetPayload`
 * (RPC `update_character_sheet_payload`, só toca a coluna `payload`) —
 * nunca `updateCharacter` (RLS de UPDATE direta na tabela só autoriza o
 * narrador/dono de personagem solto desde a migration 0052).
 * ---------------------------------------------------------------------
 */

import { getScopedTableClient } from "../auth/scopedClient";
import { getCurrentUser } from "../auth/session";
import { CharacterStorageError } from "./storage.errors";
import { validateCreationBudget } from "./createCharacterValidation";
import type { Character, CharacterRecord, CharacterRulesPayload } from "./types";
import { getCharacterRules } from "../content";
import { parseDraftPayload, type DraftPayload } from "./draftValidation";

const CHARACTER_CREATION_DRAFTS_TABLE = "character_creation_drafts";
const CHARACTER_CONTROLLERS_TABLE = "character_controllers";

export type LoadDraftResult =
  | { kind: "none" }
  | { kind: "found"; payload: DraftPayload; creationRequestId: string; revision: number }
  | { kind: "network_error"; message: string }
  | { kind: "invalid"; message: string };

export type SaveDraftResult = { revision: number } | { conflict: true };

const TABLE = "characters";

/**
 * Id do usuário logado, ou null. Best effort: getCurrentUser lê o
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
  /** Mesa a que o personagem pertence (migration 0011). */
  campaignId?: string | null;
}

/**
 * Monta o payload final gravado no banco: garante nome não-vazio e
 * carimba metadados.schema_version/atualizado_em (e criado_em, na
 * primeira gravação). Não é exportada — arquivos "use server" só
 * podem exportar funções assíncronas, e esta é síncrona/interna.
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
  options: { campaignId?: string | null; ownerLabel?: string } = {},
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
// SEÇÃO 1 — PRODUTO / NARRADOR
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

/**
 * Lista personagens legados/globais (sem mesa) disponíveis para o
 * narrador vincular a uma mesa.
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
 * Cria um personagem mínimo já nascendo vinculado a uma mesa (dashboard
 * do narrador — "Criar personagem novo", personagem solto/PNJ, sem
 * controlador). `owner_id` é carimbado com o narrador logado quando há
 * sessão. Para dar controle a um jogador depois, usar
 * `grantCharacterControl`.
 */
export async function createCharacterForCampaign(
  campaignId: string,
  character: Character,
  options: { ownerLabel?: string } = {},
): Promise<CharacterRecord> {
  const client = await getScopedTableClient();
  return insertCharacterScoped(client, character, { ...options, campaignId });
}

/**
 * Criação PELO PRÓPRIO USUÁRIO via assistente (wizard) — valida o
 * orçamento de criação (atributos/perícias/vertentes) server-side ANTES
 * de persistir, contra as regras REAIS (nunca as que o cliente enviar —
 * buscadas de novo aqui via `getCharacterRules`, mesma fonte confiável
 * de sempre).
 *
 * Fase 1 (revisão 4): não recebe mais `profileId`. Exige só que o
 * chamador seja participante ATIVO da campanha (`campaign_members`,
 * checado dentro da RPC `complete_character_creation`, migration 0054)
 * — vale tanto para o narrador quanto para um jogador. A conta que cria
 * o personagem recebe controle automaticamente (`character_controllers`,
 * inserido dentro da mesma transação da RPC) — aditivo §11 "jogador
 * recebe controle automaticamente". `options.creationRequestId`, quando
 * informado, torna a conclusão idempotente: retry após sucesso ou duplo
 * clique devolvem o MESMO personagem, nunca duplicam.
 *
 * Diferente da versão anterior a esta fase: não há mais limite de "um
 * personagem por perfil por campanha" (o índice único que impunha isso
 * dependia de `profile_id`, removido) — uma conta pode criar mais de um
 * personagem na mesma campanha ao longo do tempo, alinhado ao modelo
 * N:N de `character_controllers` que o aditivo pede. Quantos
 * personagens um jogador pode criar livremente continua uma decisão de
 * produto pendente (ver §12 do relatório) — não bloqueada por esta
 * função.
 */
export async function createCharacterFromWizard(
  campaignId: string,
  character: Character,
  regras: CharacterRulesPayload,
  options: { ownerLabel?: string; creationRequestId?: string } = {},
): Promise<CharacterRecord> {
  // `regras` do argumento nunca é confiável (pode ter chegado inflado de
  // um chamador hostil) — sempre revalidado contra a Biblioteca
  // publicada real antes de checar o orçamento.
  const doc = await getCharacterRules();
  const regrasReais = doc?.payload as CharacterRulesPayload | undefined;
  if (!regrasReais) {
    throw new CharacterStorageError("Regras de criação indisponíveis no servidor.");
  }

  const validation = validateCreationBudget(character, regrasReais);
  if (!validation.ok) {
    throw new CharacterStorageError(validation.reason ?? "Orçamento de criação inválido.");
  }
  void regras; // mantido no parâmetro por compatibilidade de assinatura com o chamador (UI); nunca usado para validar.

  const payload = buildPayloadForSave(character);
  if (options.creationRequestId) {
    payload.metadados = { ...payload.metadados, schema_version: payload.metadados!.schema_version, creationRequestId: options.creationRequestId };
  }

  const client = await getScopedTableClient();
  const { data, error } = await client.rpc("complete_character_creation", {
    p_campaign_id: campaignId,
    p_character_payload: payload,
    p_owner_label: options.ownerLabel ?? null,
    p_creation_request_id: options.creationRequestId ?? null,
  });
  if (error) {
    throw new CharacterStorageError(`Falha ao concluir a criação do personagem: ${error.message}`, error);
  }
  const result = data as { character: CharacterRecord; idempotentReplay: boolean };
  return result.character;
}

/**
 * Draft persistente do wizard de criação de personagem — só fluxo de
 * quem já é participante ativo da campanha (`auth.uid()` conhecido).
 * `select`/`delete` são protegidos por RLS (owner_id + membership
 * ativa); a gravação passa inteira pela RPC
 * `save_character_creation_draft` — nunca um insert/update direto
 * nesta tabela.
 *
 * Fase 1 (revisão 4): chave de unicidade passou de (campaign_id,
 * profile_id) para (campaign_id, owner_id) — um rascunho em andamento
 * por campanha por CONTA, não mais por perfil.
 */
export async function loadCharacterCreationDraft(campaignId: string): Promise<LoadDraftResult> {
  const client = await getScopedTableClient();
  const { data, error } = await client
    .from(CHARACTER_CREATION_DRAFTS_TABLE)
    .select("payload, creation_request_id, revision")
    .eq("campaign_id", campaignId)
    .maybeSingle();

  if (error) {
    return { kind: "network_error", message: error.message };
  }
  if (!data) {
    return { kind: "none" };
  }

  const payload = parseDraftPayload(data.payload);
  if (!payload) {
    return { kind: "invalid", message: "O rascunho salvo está num formato que esta versão não reconhece." };
  }

  return { kind: "found", payload, creationRequestId: data.creation_request_id as string, revision: data.revision as number };
}

/**
 * Grava o draft via RPC atômica `save_character_creation_draft` — a RPC
 * valida participação ativa na campanha, rejeita se já existir um
 * personagem desta conta com o mesmo `creationRequestId` (conclusão já
 * aconteceu), e faz compare-and-swap por `expectedRevision`. Conflito de
 * revisão é resultado ESPERADO, não falha — devolvido como
 * `{ conflict: true }`, nunca lançado.
 */
export async function saveCharacterCreationDraft(
  campaignId: string,
  payload: DraftPayload,
  creationRequestId: string,
  expectedRevision: number,
): Promise<SaveDraftResult> {
  if (!parseDraftPayload(payload)) {
    throw new CharacterStorageError("Payload de rascunho em formato inválido — não gravado.");
  }

  const client = await getScopedTableClient();
  const { data, error } = await client.rpc("save_character_creation_draft", {
    p_campaign_id: campaignId,
    p_creation_request_id: creationRequestId,
    p_payload: payload,
    p_expected_revision: expectedRevision,
  });

  if (error) {
    if (error.message?.includes("revision_conflict")) {
      return { conflict: true };
    }
    throw new CharacterStorageError(`Falha ao salvar rascunho de criação: ${error.message}`, error);
  }

  const row = Array.isArray(data) ? data[0] : data;
  return { revision: row.revision as number };
}

/**
 * Apaga o draft — usado pelo botão "Cancelar criação" e como reforço
 * best-effort redundante pós-conclusão (a exclusão AUTORITATIVA
 * acontece dentro da própria transação de `complete_character_creation`).
 */
export async function deleteCharacterCreationDraft(campaignId: string): Promise<void> {
  const client = await getScopedTableClient();
  const { error } = await client
    .from(CHARACTER_CREATION_DRAFTS_TABLE)
    .delete()
    .eq("campaign_id", campaignId);
  if (error) {
    throw new CharacterStorageError(`Falha ao apagar rascunho de criação: ${error.message}`, error);
  }
}

/**
 * Vincula um personagem a uma mesa (ou remove o vínculo com
 * `campaignId: null`).
 *
 * `character_controllers` tem FK composta contra `characters(id,
 * campaign_id)` (migration 0051, seção 13.1 do relatório de auditoria)
 * — mudar `campaign_id` enquanto existem controladores para este
 * personagem violaria essa FK (o Postgres rejeitaria o UPDATE). Controle
 * é sempre escopado à campanha atual (um controlador precisa ser
 * participante ativo DAQUELA campanha) — mover/desvincular o personagem
 * invalida essa premissa, então os controladores são revogados aqui
 * ANTES de trocar `campaign_id`, via a mesma RPC `revoke_character_control`
 * que o narrador já usa manualmente (só o dono da campanha ATUAL pode
 * revogar, o que já é verdade neste ponto, antes da troca).
 */
export async function assignCharacterToCampaign(characterId: string, campaignId: string | null): Promise<CharacterRecord> {
  const client = await getScopedTableClient();

  const { data: existing, error: fetchError } = await client.from(TABLE).select("campaign_id").eq("id", characterId).maybeSingle();
  if (fetchError) {
    throw new CharacterStorageError(`Falha ao buscar personagem "${characterId}" antes de vincular à mesa: ${fetchError.message}`, fetchError);
  }
  const currentCampaignId = (existing as { campaign_id: string | null } | null)?.campaign_id ?? null;

  if (currentCampaignId && currentCampaignId !== campaignId) {
    const controllers = await listCharacterControllers(currentCampaignId);
    const toRevoke = controllers.filter((c) => c.character_id === characterId);
    for (const controller of toRevoke) {
      await revokeCharacterControl(characterId, controller.user_id);
    }
  }

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

/** Arquiva um personagem (`archived_at = agora`). Não desvincula mesa — só marca como inativo. */
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
 * mantém a mesma mesa (campaign_id). O duplicado nasce SEM controlador
 * (character_controllers não é copiado) — atribuir depois via
 * `grantCharacterControl`. owner_id é carimbado com o narrador logado,
 * igual createCharacterForCampaign.
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
  });
}

// =====================================================================
// SEÇÃO 2 — Controle de personagem (character_controllers)
// =====================================================================

/** Concede controle de um personagem a uma conta — só o narrador dono da campanha (RPC `grant_character_control`, migration 0051). Exige que a conta-alvo já seja participante ativo da campanha. */
export async function grantCharacterControl(characterId: string, userId: string): Promise<void> {
  const client = await getScopedTableClient();
  const { error } = await client.rpc("grant_character_control", {
    p_character_id: characterId,
    p_user_id: userId,
  });
  if (error) {
    throw new CharacterStorageError(`Falha ao conceder controle do personagem "${characterId}": ${error.message}`, error);
  }
}

/** Remove controle de um personagem de uma conta — só o narrador dono da campanha (RPC `revoke_character_control`). Não apaga o personagem. */
export async function revokeCharacterControl(characterId: string, userId: string): Promise<void> {
  const client = await getScopedTableClient();
  const { error } = await client.rpc("revoke_character_control", {
    p_character_id: characterId,
    p_user_id: userId,
  });
  if (error) {
    throw new CharacterStorageError(`Falha ao remover controle do personagem "${characterId}": ${error.message}`, error);
  }
}

export interface CharacterController {
  character_id: string;
  campaign_id: string;
  user_id: string;
  granted_by: string | null;
  granted_at: string;
}

/** Lista as linhas de character_controllers de uma campanha (RLS: narrador dono vê todas; jogador só as próprias). */
export async function listCharacterControllers(campaignId: string): Promise<CharacterController[]> {
  const client = await getScopedTableClient();
  const { data, error } = await client.from(CHARACTER_CONTROLLERS_TABLE).select().eq("campaign_id", campaignId);
  if (error) {
    throw new CharacterStorageError(`Falha ao listar controles de personagem da campanha "${campaignId}": ${error.message}`, error);
  }
  return (data as CharacterController[]) ?? [];
}

/** Lista os personagens que a CONTA LOGADA controla numa campanha — base da área "Personagens" do jogador. */
export async function listControlledCharacters(campaignId: string): Promise<CharacterRecord[]> {
  const client = await getScopedTableClient();
  const userId = await currentOwnerId();
  if (!userId) return [];

  const { data: controllerRows, error: controllerError } = await client
    .from(CHARACTER_CONTROLLERS_TABLE)
    .select("character_id")
    .eq("campaign_id", campaignId)
    .eq("user_id", userId);
  if (controllerError) {
    throw new CharacterStorageError(`Falha ao listar controles do usuário na campanha "${campaignId}": ${controllerError.message}`, controllerError);
  }
  const ids = ((controllerRows as { character_id: string }[] | null) ?? []).map((r) => r.character_id);
  if (ids.length === 0) return [];

  const { data: chars, error: charsError } = await client
    .from(TABLE)
    .select()
    .in("id", ids)
    .order("updated_at", { ascending: false });
  if (charsError) {
    throw new CharacterStorageError(`Falha ao buscar personagens controlados: ${charsError.message}`, charsError);
  }
  return (chars as CharacterRecord[]) ?? [];
}

// =====================================================================
// SEÇÃO 3 — Ficha (/ficha) — caminho mínimo (Fase 1, revisão 4 §13.5)
//
// Sem UX completa (seletor de personagem, retorno à campanha, entrada
// pela lista) — isso é Fase 5. Aqui só o essencial para a ficha não
// ficar quebrada: resolver um personagem por campaignId+characterId, e
// salvar através do caminho restrito por coluna.
// =====================================================================

/**
 * Busca um personagem por campanha+id. Autorização inteiramente pela
 * RLS de `characters` (dono da campanha OU controlador com participação
 * ativa — `can_read_character`, migration 0052). Devolve `null` tanto
 * para "não encontrado" quanto para "sem autorização" — a RLS filtra a
 * linha antes de chegar aqui, e a resposta não deve distinguir os dois
 * casos (mesmo princípio de não vazamento já usado em outras partes do
 * código).
 */
export async function getCharacterForCampaign(campaignId: string, characterId: string): Promise<CharacterRecord | null> {
  const client = await getScopedTableClient();
  const { data, error } = await client
    .from(TABLE)
    .select()
    .eq("id", characterId)
    .eq("campaign_id", campaignId)
    .maybeSingle();

  if (error) {
    throw new CharacterStorageError(`Falha ao buscar personagem "${characterId}" na campanha "${campaignId}": ${error.message}`, error);
  }
  return (data as CharacterRecord | null) ?? null;
}

/**
 * Único caminho de escrita do jogador controlador (lacuna 3, revisão 4
 * §13.4) — chama a RPC `update_character_sheet_payload`, que só toca a
 * coluna `payload` e revalida controle+participação ativa internamente,
 * nunca confiando em nada além de `characterId`/`payload`. Nunca usar
 * `updateCharacter` (seção 5) para o caminho do jogador — a RLS de
 * UPDATE direta na tabela não autoriza controlador desde a migration
 * 0052, só narrador/dono de personagem solto.
 */
export async function updateCharacterSheetPayload(characterId: string, character: Character): Promise<CharacterRecord> {
  const payload = buildPayloadForSave(character);
  const client = await getScopedTableClient();
  const { data, error } = await client.rpc("update_character_sheet_payload", {
    p_character_id: characterId,
    p_payload: payload,
  });
  if (error) {
    throw new CharacterStorageError(`Falha ao salvar ficha do personagem "${characterId}": ${error.message}`, error);
  }
  return data as CharacterRecord;
}

// =====================================================================
// SEÇÃO 4 — DEV / DIAGNÓSTICO
// =====================================================================

/** Lista TODOS os personagens (global, sem filtro de mesa/dono) — só para telas dev/diagnóstico. Requer sessão (usuário logado); sem sessão, RLS devolve lista vazia. */
export async function listLegacyCharactersDev(): Promise<CharacterRecord[]> {
  return listCharacters();
}

// =====================================================================
// SEÇÃO 5 — LEGADO / COMPATIBILIDADE (client escopado; RLS de UPDATE
// direta só autoriza narrador dono da campanha ou dono de personagem
// solto — nunca usar `updateCharacter` para escrita de jogador
// controlador, ver `updateCharacterSheetPayload` na seção 3)
// =====================================================================

/**
 * Cria um novo registro de personagem. payload guarda o Character
 * inteiro. `campaignId` (opcional) — omitido, o personagem nasce
 * "legado" (sem mesa). `owner_id` é carimbado com o usuário logado
 * quando há sessão (best-effort, nunca bloqueia a criação se não houver).
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
 * Atualiza um personagem existente — caminho ADMINISTRATIVO (narrador
 * dono da campanha, ou dono de personagem solto). RLS de UPDATE em
 * `characters` (migration 0052) não autoriza controlador aqui — o
 * jogador usa `updateCharacterSheetPayload` (seção 3).
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
