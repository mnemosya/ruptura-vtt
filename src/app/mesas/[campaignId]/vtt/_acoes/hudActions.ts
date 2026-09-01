"use server";

import "server-only";

import { resolveCampaignAccess } from "../../../../../lib/campaign/access";
import { listTalentsEffective } from "../../../../../lib/campaignContent";
import {
  applyConsoleMutation,
  computeDerivedStats,
  normalizeCharacter,
  normalizeReactionRules,
  normalizeTalentContent,
  type CharacterRulesPayload,
  type ConsoleMutation,
  type ConsoleMutationContext,
} from "../../../../../lib/character";
import { getCharacterRules, getCombatFlow, listConditions } from "../../../../../lib/content";
import {
  mutateUnlinkedSelectedTokenHud,
  readSelectedTokenHud,
  setSelectedTokenHudVisibility,
  updateLinkedSelectedTokenCharacter,
  type RawSelectedTokenHud,
} from "../../../../../lib/vtt/hudStorage";
import type {
  HudMutationInput,
  HudMutationMeta,
  HudResourceId,
  SelectedTokenHudData,
} from "../../../../../lib/vtt/hudTypes";

interface HudActionResult {
  ok: boolean;
  error?: string;
  data?: SelectedTokenHudData;
  meta?: HudMutationMeta;
}

async function hasCampaignAccess(campaignId: string): Promise<boolean> {
  return (await resolveCampaignAccess(campaignId)).kind === "ok";
}

function asFiniteInt(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.trunc(value) : 0;
}

function projectHud(raw: RawSelectedTokenHud, rules: CharacterRulesPayload | null): SelectedTokenHudData {
  const publicResources = Object.fromEntries(
    Object.entries(raw.resources ?? {})
      .filter(([id, value]) => (id === "pv" || id === "pe" || id === "mana") && value && typeof value === "object")
      .map(([id, value]) => [id, { atual: asFiniteInt(value.atual), max: Math.max(0, asFiniteInt(value.max)) }]),
  ) as SelectedTokenHudData["resources"];

  const base: SelectedTokenHudData = {
    tokenId: String(raw.tokenId),
    sceneId: String(raw.sceneId),
    campaignId: String(raw.campaignId),
    name: String(raw.name ?? "Token"),
    initials: String(raw.initials ?? "?").slice(0, 4),
    imageUrl: typeof raw.imageUrl === "string" && raw.imageUrl.trim() ? raw.imageUrl : null,
    canControl: raw.canControl === true,
    resources: publicResources,
    tokenRevision: asFiniteInt(raw.tokenRevision),
  };

  if (!base.canControl) return base;
  if (raw.visibility) base.visibility = { ...raw.visibility };
  if (Array.isArray(raw.tokenConditions)) base.tokenConditions = raw.tokenConditions.filter((v): v is string => typeof v === "string");
  if (typeof raw.characterId === "string" && raw.character) {
    const normalized = normalizeCharacter(raw.character);
    const derived = computeDerivedStats(normalized.atributos, rules, normalized.mana_bonus_ruptura ?? 0);
    const character = normalizeCharacter(normalized, derived);
    base.characterId = raw.characterId;
    base.character = character;
    base.characterUpdatedAt = typeof raw.characterUpdatedAt === "string" ? raw.characterUpdatedAt : undefined;
    base.derived = derived;
    base.resources = {
      pv: { atual: character.recursos_atuais?.pv ?? derived.pv_max, max: derived.pv_max },
      pe: { atual: character.recursos_atuais?.pe ?? derived.pe_max, max: derived.pe_max },
      mana: { atual: character.recursos_atuais?.mana ?? derived.mana_max, max: derived.mana_max },
    };
  }
  return base;
}

async function loadRules(): Promise<CharacterRulesPayload | null> {
  const document = await getCharacterRules().catch(() => null);
  return (document?.payload as CharacterRulesPayload | undefined) ?? null;
}

async function loadAndValidate(campaignId: string, tokenId: string, rules?: CharacterRulesPayload | null) {
  if (!(await hasCampaignAccess(campaignId))) return null;
  const raw = await readSelectedTokenHud(tokenId).catch(() => null);
  if (!raw || String(raw.campaignId) !== campaignId) return null;
  return { raw, data: projectHud(raw, rules === undefined ? await loadRules() : rules) };
}

export async function readSelectedTokenHudAction(params: {
  campaignId: string;
  tokenId: string;
}): Promise<HudActionResult> {
  const loaded = await loadAndValidate(params.campaignId, params.tokenId);
  if (!loaded) return { ok: false, error: "Token indisponível." };
  return { ok: true, data: loaded.data };
}

export async function setSelectedTokenHudVisibilityAction(params: {
  campaignId: string;
  tokenId: string;
  resource: HudResourceId;
  public: boolean;
}): Promise<HudActionResult> {
  const before = await loadAndValidate(params.campaignId, params.tokenId);
  if (!before?.data.canControl) return { ok: false, error: "Alteração não autorizada." };
  try {
    await setSelectedTokenHudVisibility({ tokenId: params.tokenId, resource: params.resource, public: params.public });
    const after = await loadAndValidate(params.campaignId, params.tokenId);
    return after ? { ok: true, data: after.data } : { ok: false, error: "Token indisponível." };
  } catch {
    return { ok: false, error: "Não foi possível alterar a visibilidade." };
  }
}

function toConsoleMutation(input: HudMutationInput, nowIso: string): ConsoleMutation {
  if (input.type === "resource") return { ...input, nowIso };
  if (input.type === "condition_add") {
    return {
      type: "condition_add",
      condition: {
        id: crypto.randomUUID(),
        conditionId: input.condition.slug,
        nome: input.condition.name,
        descricao: input.condition.description,
        aplicadaEm: nowIso,
        removidaEm: null,
        ativa: true,
      },
    };
  }
  if (input.type === "condition_remove") return { type: "condition_remove", conditionId: input.conditionId, nowIso };
  return input;
}

async function validateAndCanonicalizeMutation(input: HudMutationInput): Promise<HudMutationInput | null> {
  if (!input || typeof input !== "object") return null;
  if (input.type === "resource") {
    if (!(input.resource === "pv" || input.resource === "pe" || input.resource === "mana")) return null;
    if (typeof input.value !== "number" || !Number.isFinite(input.value)) return null;
    return { ...input, value: Math.trunc(input.value) };
  }
  if (input.type === "pa" || input.type === "reactions") {
    if (typeof input.delta !== "number" || !Number.isFinite(input.delta)) return null;
    return { ...input, delta: Math.trunc(input.delta) };
  }
  if (input.type === "defense") return input;
  if (input.type === "condition_remove") {
    if (typeof input.conditionId !== "string" || !input.conditionId.trim()) return null;
    if (input.tokenConditionSlug !== undefined && (typeof input.tokenConditionSlug !== "string" || !input.tokenConditionSlug.trim())) return null;
    return input;
  }
  if (input.type === "condition_add") {
    if (typeof input.condition?.slug !== "string" || !input.condition.slug.trim()) return null;
    const document = (await listConditions().catch(() => [])).find((candidate) => candidate.slug === input.condition.slug);
    if (!document) return null;
    const payload = document.payload as { descricao_curta?: unknown } | null;
    return {
      type: "condition_add",
      condition: {
        slug: document.slug,
        name: document.nome ?? document.slug,
        description: typeof payload?.descricao_curta === "string" ? payload.descricao_curta : undefined,
      },
    };
  }
  return null;
}

async function loadMutationContext(campaignId: string, character: ReturnType<typeof normalizeCharacter>, rules: CharacterRulesPayload | null): Promise<ConsoleMutationContext> {
  const [combatFlow, talentDocs] = await Promise.all([
    getCombatFlow().catch(() => null),
    listTalentsEffective(campaignId).catch(() => []),
  ]);
  return {
    derived: computeDerivedStats(character.atributos, rules, character.mana_bonus_ruptura ?? 0),
    rules,
    reactionRules: normalizeReactionRules(combatFlow?.payload),
    talents: talentDocs.map((doc) => normalizeTalentContent(doc.payload as Record<string, unknown>)),
  };
}

export async function mutateSelectedTokenHudAction(params: {
  campaignId: string;
  tokenId: string;
  mutation: HudMutationInput;
}): Promise<HudActionResult> {
  const mutation = await validateAndCanonicalizeMutation(params.mutation);
  if (!mutation) return { ok: false, error: "Alteração inválida." };
  const rules = await loadRules();
  const loaded = await loadAndValidate(params.campaignId, params.tokenId, rules);
  if (!loaded?.data.canControl) return { ok: false, error: "Alteração não autorizada." };

  try {
    if (!loaded.data.characterId || !loaded.data.character || !loaded.data.characterUpdatedAt) {
      if (mutation.type === "resource" && mutation.resource === "pv") {
        await mutateUnlinkedSelectedTokenHud({
          tokenId: params.tokenId,
          kind: "pv",
          value: mutation.value,
          expectedRevision: loaded.data.tokenRevision,
        });
      } else if (mutation.type === "condition_add") {
        await mutateUnlinkedSelectedTokenHud({
          tokenId: params.tokenId,
          kind: "condition_add",
          value: mutation.condition.slug,
          expectedRevision: loaded.data.tokenRevision,
        });
      } else if (mutation.type === "condition_remove" && mutation.tokenConditionSlug) {
        await mutateUnlinkedSelectedTokenHud({
          tokenId: params.tokenId,
          kind: "condition_remove",
          value: mutation.tokenConditionSlug,
          expectedRevision: loaded.data.tokenRevision,
        });
      } else {
        return { ok: false, error: "Este token não possui esse recurso." };
      }
      const afterUnlinked = await loadAndValidate(params.campaignId, params.tokenId, rules);
      return afterUnlinked ? { ok: true, data: afterUnlinked.data } : { ok: false, error: "Token indisponível." };
    }

    const context = await loadMutationContext(params.campaignId, loaded.data.character, rules);
    const boundedMutation: HudMutationInput = mutation.type === "resource"
      ? {
          ...mutation,
          value: Math.min(
            mutation.value,
            mutation.resource === "pv"
              ? context.derived.pv_max
              : mutation.resource === "pe"
                ? context.derived.pe_max
                : context.derived.mana_max,
          ),
        }
      : mutation;
    const result = applyConsoleMutation(loaded.data.character, toConsoleMutation(boundedMutation, new Date().toISOString()), context);
    const normalized = normalizeCharacter(result.character, context.derived);
    await updateLinkedSelectedTokenCharacter({
      tokenId: params.tokenId,
      expectedUpdatedAt: loaded.data.characterUpdatedAt,
      payload: normalized,
    });
    const after = await loadAndValidate(params.campaignId, params.tokenId, rules);
    return after ? { ok: true, data: after.data, meta: result.meta } : { ok: false, error: "Token indisponível." };
  } catch {
    return { ok: false, error: "A ficha mudou em outra sessão. O HUD foi atualizado; tente novamente." };
  }
}
