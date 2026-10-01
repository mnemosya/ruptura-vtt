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

import { randomUUID } from "node:crypto";
import { getScopedTableClient } from "../auth/scopedClient";
import { getCurrentUser } from "../auth/session";
import { CharacterStorageError } from "./storage.errors";
import type { Character, CharacterRecord, CharacterRulesPayload } from "./types";
import { getCharacterRules } from "../content";
import { resolveEffectiveList } from "../campaignContent/resolveEffectiveContent";
import {
  buildCharacterV2,
  parseDraftV12,
  VERTENTES_V12,
  type DraftV12,
  type BackgroundContentV12,
  type ClassContentV12,
  type ComplicationContentV12,
  type CreationChoicesV12,
  type CreationItemV12,
  type QualityContentV12,
} from "../rulesetV12";

const CHARACTER_CREATION_DRAFTS_TABLE = "character_creation_drafts";
const CHARACTER_CONTROLLERS_TABLE = "character_controllers";

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

/**
 * Insere um personagem via um client já resolvido (interno —
 * compartilhado entre criação/duplicação de narrador).
 *
 * `insert(...).select()` (INSERT ... RETURNING) faz o Postgres
 * reavaliar a policy de SELECT (`characters_authenticated_select` →
 * `can_read_character`, migration 0052) sobre a linha recém-criada
 * ANTES do fim do comando. `can_read_character` é `STABLE` e resolve
 * por uma subconsulta própria (`select 1 from characters where id =
 * ...`) — `STABLE` congela o snapshot no início do comando, então essa
 * subconsulta nunca enxerga uma linha inserida pelo PRÓPRIO comando
 * ainda em andamento, mesmo sendo o dono da campanha. Resultado: todo
 * INSERT com `.select()` nesta tabela falhava com "new row violates
 * row-level security policy" para qualquer conta real (não
 * service role) — bug pré-existente à Fase 3/4, nunca exercitado
 * antes por um narrador autenticado real (o caminho já testado de
 * criação, o assistente, usa `complete_character_creation`, uma RPC,
 * não um INSERT direto).
 *
 * Correção mínima, sem tocar em RLS/migration: gera o id no cliente
 * (a coluna já tem `default gen_random_uuid()`, aceita valor
 * explícito) e faz o SELECT de confirmação como um comando SEPARADO
 * — nesse ponto a linha já está commitada dentro da transação e
 * plenamente visível.
 */
async function insertCharacterScoped(
  client: Awaited<ReturnType<typeof getScopedTableClient>>,
  character: Character,
  options: SaveCharacterOptions = {},
): Promise<CharacterRecord> {
  const payload = buildPayloadForSave(character);
  const ownerId = await currentOwnerId();
  const id = randomUUID();
  const { error: insertError } = await client.from(TABLE).insert({
    id,
    name: payload.nome,
    owner_label: options.ownerLabel ?? null,
    // `status` passou a ser respeitado quando `createCharacter` (seção
    // 5) passou a usar esta função: ele sempre aceitou a opção, e
    // fixá-la em "draft" aqui teria mudado o comportamento dele
    // silenciosamente. O padrão continua "draft" para quem não pede
    // nada — que é o caso de todos os chamadores de hoje.
    status: options.status ?? "draft",
    payload,
    campaign_id: options.campaignId ?? null,
    owner_id: ownerId,
  });

  if (insertError) {
    throw new CharacterStorageError(`Falha ao criar personagem: ${insertError.message}`, insertError);
  }

  const { data, error: selectError } = await client.from(TABLE).select().eq("id", id).single();
  if (selectError) {
    throw new CharacterStorageError(`Personagem criado, mas falhou ao reler "${id}": ${selectError.message}`, selectError);
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
 * Criação RUPTURA v1.2 (schema_version 2) no Ranking F.
 *
 * Recebe só as ESCOLHAS do jogador; Classe, catálogo de perícias e
 * preços vêm dos documentos publicados, buscados aqui. O payload é
 * montado no servidor (`buildCharacterV2`) e a RPC
 * `complete_character_creation_v2` revalida tudo no banco.
 */
export async function createCharacterV2(
  campaignId: string,
  choices: CreationChoicesV12,
  /** `characterId`: completa um personagem criado só com o nome em vez de criar outro. */
  options: { ownerLabel?: string; creationRequestId?: string; characterId?: string } = {},
): Promise<CharacterRecord> {
  // Conteúdo EFETIVO da campanha (override > homebrew > oficial), a mesma
  // resolução que a RPC usa — preços com override e opções de Trajetória
  // próprias da campanha valem igual nos dois lados.
  const [regrasDoc, classes, antecedentes, qualidades, complicacoes, itensEfetivos] = await Promise.all([
    getCharacterRules(),
    resolveEffectiveList(campaignId, "class"),
    resolveEffectiveList(campaignId, "background"),
    resolveEffectiveList(campaignId, "quality"),
    resolveEffectiveList(campaignId, "complication"),
    resolveEffectiveList(campaignId, "item"),
  ]);
  const classe = classes.find((c) => c.slug === choices.classe_id)?.payload as ClassContentV12 | undefined;
  if (!classe) throw new CharacterStorageError(`Classe "${choices.classe_id}" não está publicada.`);
  const regras = regrasDoc?.payload as CharacterRulesPayload | undefined;
  if (!regras) throw new CharacterStorageError("Regras de criação indisponíveis no servidor.");

  const itens = new Map<string, CreationItemV12>();
  for (const efetivo of itensEfetivos) {
    const item = efetivo.payload as { nome?: string; categoria?: string; preco?: number; estatisticas?: { subtipo?: string } };
    itens.set(efetivo.slug, {
      slug: efetivo.slug,
      nome: item.nome ?? efetivo.slug,
      categoria: item.categoria ?? "",
      subtipo: item.estatisticas?.subtipo,
      preco: item.preco ?? 0,
    });
  }
  const porSlug = <T,>(lista: { slug: string; payload: unknown }[]) => new Map(lista.map((d) => [d.slug, d.payload as T]));

  const built = buildCharacterV2(choices, {
    classe,
    pericias: regras.pericias.map((p) => p.id),
    vertentes: [...VERTENTES_V12],
    itens,
    trajetoria: {
      antecedentes: porSlug<BackgroundContentV12>(antecedentes),
      qualidades: porSlug<QualityContentV12>(qualidades),
      complicacoes: porSlug<ComplicationContentV12>(complicacoes),
    },
  });
  if (!built.ok) throw new CharacterStorageError(built.errors.join(" "));

  const payload = {
    ...built.character,
    metadados: {
      ...built.character.metadados,
      atualizado_em: new Date().toISOString(),
      ...(options.creationRequestId ? { creationRequestId: options.creationRequestId } : {}),
    },
  };

  const client = await getScopedTableClient();
  const { data, error } = await client.rpc("complete_character_creation_v2", {
    p_campaign_id: campaignId,
    p_character_payload: payload,
    p_owner_label: options.ownerLabel ?? null,
    p_creation_request_id: options.creationRequestId ?? null,
    p_character_id: options.characterId ?? null,
  });
  if (error) {
    throw new CharacterStorageError(`Falha ao concluir a criação do personagem: ${error.message}`, error);
  }
  return (data as { character: CharacterRecord }).character;
}

/**
 * "+ Personagem" (narrador e jogador): personagem RUPTURA v1.2 só com o
 * nome (`criacao_pendente: true`), completado depois pelo assistente.
 * A RPC `create_pending_character_v2` exige participante ativo, deixa PN
 * só para o narrador e dá o controle ao jogador que criou.
 */
export async function createPendingCharacterV2(campaignId: string, nome: string, pn = false): Promise<CharacterRecord> {
  const client = await getScopedTableClient();
  const { data, error } = await client.rpc("create_pending_character_v2", {
    p_campaign_id: campaignId,
    p_nome: nome,
    p_pn: pn,
  });
  if (error) {
    throw new CharacterStorageError(`Falha ao criar o personagem: ${error.message}`, error);
  }
  return data as CharacterRecord;
}

export type LoadDraftV12Result =
  | { kind: "none" }
  | { kind: "found"; payload: DraftV12; creationRequestId: string; revision: number }
  | { kind: "network_error"; message: string }
  | { kind: "invalid"; message: string };

/**
 * Rascunho da criação v1.2 — mesma linha por (campanha, conta) e mesma
 * RPC do rascunho anterior; só o formato (`schema_version: 2`) muda.
 * Um rascunho do assistente anterior volta como `invalid`.
 */
export async function loadCharacterCreationDraftV12(campaignId: string): Promise<LoadDraftV12Result> {
  const client = await getScopedTableClient();
  const { data, error } = await client
    .from(CHARACTER_CREATION_DRAFTS_TABLE)
    .select("payload, creation_request_id, revision")
    .eq("campaign_id", campaignId)
    .maybeSingle();
  if (error) return { kind: "network_error", message: error.message };
  if (!data) return { kind: "none" };
  const payload = parseDraftV12(data.payload);
  if (!payload) {
    return { kind: "invalid", message: "Existe um rascunho salvo em outro formato (possivelmente do assistente anterior)." };
  }
  return { kind: "found", payload, creationRequestId: data.creation_request_id as string, revision: data.revision as number };
}

export async function saveCharacterCreationDraftV12(
  campaignId: string,
  payload: DraftV12,
  creationRequestId: string,
  expectedRevision: number,
): Promise<SaveDraftResult> {
  if (!parseDraftV12(payload)) {
    throw new CharacterStorageError("Payload de rascunho v1.2 em formato inválido — não gravado.");
  }
  const client = await getScopedTableClient();
  const { data, error } = await client.rpc("save_character_creation_draft", {
    p_campaign_id: campaignId,
    p_creation_request_id: creationRequestId,
    p_payload: payload,
    p_expected_revision: expectedRevision,
  });
  if (error) {
    if (error.message?.includes("revision_conflict")) return { conflict: true };
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
export async function grantCharacterControl(
  characterId: string,
  userId: string,
  permissao: PermissaoPersonagem = "editar",
): Promise<void> {
  const client = await getScopedTableClient();
  // Conceder de novo a quem já tem acesso só TROCA a permissão (a RPC
  // faz upsert — migration 0151).
  const { error } = await client.rpc("grant_character_control", {
    p_character_id: characterId,
    p_user_id: userId,
    p_permissao: permissao,
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

/**
 * `visualizar`: vê o personagem e abre a ficha. `editar`: controla de
 * fato (ficha, token, turno). Migration 0151.
 */
export type PermissaoPersonagem = "visualizar" | "editar";

export interface CharacterController {
  character_id: string;
  campaign_id: string;
  user_id: string;
  granted_by: string | null;
  granted_at: string;
  permissao: PermissaoPersonagem;
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

/**
 * Lista os personagens que a CONTA LOGADA controla numa campanha — base da área "Personagens" do jogador.
 *
 * Por padrão inclui as duas permissões (quem só VISUALIZA também vê o
 * personagem e abre a ficha). `somenteEditar` restringe a quem pode
 * AGIR com ele — mover o token, rolar, falar como ele.
 */
export async function listControlledCharacters(
  campaignId: string,
  opcoes: { somenteEditar?: boolean } = {},
): Promise<CharacterRecord[]> {
  const client = await getScopedTableClient();
  const userId = await currentOwnerId();
  if (!userId) return [];

  const { data: controllerRows, error: controllerError } = await client
    .from(CHARACTER_CONTROLLERS_TABLE)
    .select("character_id")
    .eq("campaign_id", campaignId)
    .eq("user_id", userId)
    .in("permissao", opcoes.somenteEditar ? ["editar"] : ["visualizar", "editar"]);
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
/**
 * Avanço de Ranking v1.2 (RPC `advance_character_ranking_v2`): o banco
 * confere que é exatamente um Ranking acima do persistido e grava só os
 * campos de progressão. A RPC de ficha preserva esses campos para o
 * jogador, então este é o único caminho que muda o Ranking.
 */
export async function advanceCharacterRankingV2(characterId: string, character: Character): Promise<CharacterRecord> {
  const client = await getScopedTableClient();
  const { data, error } = await client.rpc("advance_character_ranking_v2", {
    p_character_id: characterId,
    p_payload: character,
  });
  if (error) {
    throw new CharacterStorageError(`Falha ao avançar o Ranking de "${characterId}": ${error.message}`, error);
  }
  return data as CharacterRecord;
}

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
  // Passa por `insertCharacterScoped` como todo o resto da criação.
  // Antes fazia `.insert().select()` na mão, e `INSERT … RETURNING`
  // nesta tabela é recusado para qualquer conta que não seja service
  // role: a policy de SELECT é `can_read_character(id)`, função STABLE
  // que reconsulta `characters` e, no RETURNING, roda com o snapshot da
  // consulta — não enxerga a linha sendo inserida e devolve falso. O
  // Postgres reporta isso como violação de RLS.
  //
  // O contorno já existia (ver o cabeçalho de `insertCharacterScoped`);
  // esta função é que tinha ficado de fora dele, e quebrava para
  // qualquer usuário autenticado — `/dev/character-sheet` inclusive.
  const client = await getScopedTableClient();
  return insertCharacterScoped(client, character, options);
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
