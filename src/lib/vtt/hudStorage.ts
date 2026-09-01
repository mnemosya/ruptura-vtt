import "server-only";

import { getScopedTableClient } from "../auth/scopedClient";
import type { HudResourceId } from "./hudTypes";

export interface RawSelectedTokenHud {
  tokenId: string;
  sceneId: string;
  campaignId: string;
  name: string;
  initials: string;
  imageUrl?: string | null;
  canControl: boolean;
  characterId?: string;
  character?: unknown;
  characterUpdatedAt?: string;
  resources?: Record<string, { atual: number; max: number }>;
  visibility?: Record<HudResourceId, boolean>;
  tokenConditions?: string[];
  tokenRevision: number;
}

export async function readSelectedTokenHud(tokenId: string): Promise<RawSelectedTokenHud | null> {
  const client = await getScopedTableClient();
  const { data, error } = await client.rpc("read_vtt_token_hud", { p_token_id: tokenId });
  if (error) throw new Error(error.message);
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  return data as unknown as RawSelectedTokenHud;
}

export async function setSelectedTokenHudVisibility(params: {
  tokenId: string;
  resource: HudResourceId;
  public: boolean;
}): Promise<void> {
  const client = await getScopedTableClient();
  const { error } = await client.rpc("set_vtt_token_resource_visibility", {
    p_token_id: params.tokenId,
    p_resource: params.resource,
    p_public: params.public,
  });
  if (error) throw new Error(error.message);
}

export async function mutateUnlinkedSelectedTokenHud(params: {
  tokenId: string;
  kind: "pv" | "condition_add" | "condition_remove";
  value: number | string;
  expectedRevision: number;
}): Promise<void> {
  const client = await getScopedTableClient();
  const { error } = await client.rpc("mutate_unlinked_vtt_token_hud", {
    p_token_id: params.tokenId,
    p_kind: params.kind,
    p_value: params.value,
    p_expected_revision: params.expectedRevision,
  });
  if (error) throw new Error(error.message);
}

export async function updateLinkedSelectedTokenCharacter(params: {
  tokenId: string;
  expectedUpdatedAt: string;
  payload: unknown;
}): Promise<void> {
  const client = await getScopedTableClient();
  const { error } = await client.rpc("update_linked_vtt_hud_character", {
    p_token_id: params.tokenId,
    p_expected_updated_at: params.expectedUpdatedAt,
    p_payload: params.payload,
  });
  if (error) throw new Error(error.message);
}
