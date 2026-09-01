import type { Character, DerivedStats } from "../character";

export type HudResourceId = "pv" | "pe" | "mana";

export interface HudResourceValue {
  atual: number;
  max: number;
}

/** DTO já sanitizado pelo banco; campos administrativos só existem para controladores. */
export interface SelectedTokenHudData {
  tokenId: string;
  sceneId: string;
  campaignId: string;
  name: string;
  initials: string;
  imageUrl: string | null;
  canControl: boolean;
  characterId?: string;
  character?: Character;
  characterUpdatedAt?: string;
  derived?: DerivedStats;
  resources: Partial<Record<HudResourceId, HudResourceValue>>;
  visibility?: Record<HudResourceId, boolean>;
  tokenConditions?: string[];
  tokenRevision: number;
}

export type HudMutationInput =
  | { type: "resource"; resource: HudResourceId; value: number }
  | { type: "pa"; delta: number }
  | { type: "reactions"; delta: number }
  | { type: "defense" }
  | { type: "condition_add"; condition: { slug: string; name: string; description?: string } }
  | { type: "condition_remove"; conditionId: string; tokenConditionSlug?: string };

export interface HudMutationMeta {
  usedReaction?: boolean;
  defenseWithoutReaction?: boolean;
  reactionPenalty?: number;
  defensesWithoutReaction?: number;
}
