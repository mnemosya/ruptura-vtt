/**
 * Mesa persistida do Ruptura. A autorização da campanha é resolvida no
 * servidor; cena e tokens são projetados pelas leituras restritas do
 * VTT, e as regras do Console são entregues ao HUD compartilhado.
 */

import { resolveCampaignAccess } from "../../../../lib/campaign/access";
import { listTalentsEffective } from "../../../../lib/campaignContent";
import {
  normalizeReactionRules,
  normalizeTalentContent,
  type CharacterRulesPayload,
} from "../../../../lib/character";
import { getCharacterRules, getCombatFlow, listConditions } from "../../../../lib/content";
import { VttClient } from "./VttClient";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ campaignId: string }>;
}

export default async function VttPage({ params }: PageProps) {
  const { campaignId } = await params;
  const acesso = await resolveCampaignAccess(campaignId);
  if (acesso.kind !== "ok") return null; // o layout da campanha já resolve login/não encontrada/sem acesso

  const [rulesDocument, combatFlow, conditionDocuments, talentDocuments] = await Promise.all([
    getCharacterRules().catch(() => null),
    getCombatFlow().catch(() => null),
    listConditions().catch(() => []),
    listTalentsEffective(campaignId).catch(() => []),
  ]);
  const rules = (rulesDocument?.payload as CharacterRulesPayload | undefined) ?? null;

  return (
    <VttClient
      campaignId={campaignId}
      campanhaNome={acesso.campaign.name}
      papel={acesso.role}
      hudRules={rules}
      hudReactionRules={normalizeReactionRules(combatFlow?.payload)}
      hudTalents={talentDocuments.map((document) => normalizeTalentContent(document.payload as Record<string, unknown>))}
      hudConditions={conditionDocuments.map((document) => {
        const payload = document.payload as { descricao_curta?: string } | null;
        return { slug: document.slug, name: document.nome ?? document.slug, description: payload?.descricao_curta };
      })}
    />
  );
}
