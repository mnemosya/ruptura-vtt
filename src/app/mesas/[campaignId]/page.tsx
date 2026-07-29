/**
 * Mesa — rota `/mesas/[campaignId]` (aditivo §5.1, "rotas como /mesas
 * podem permanecer"). Fase 3: acesso e papel já resolvidos pelo layout
 * (`resolveCampaignAccess`) — esta página só decide QUANTO buscar
 * conforme o papel (o jogador não precisa das listas usadas só por
 * "Resolver Ataque", ferramenta exclusiva do narrador).
 */
import { resolveCampaignAccess } from "../../../lib/campaign/access";
import { listLogsForViewer } from "../../../lib/table/storage";
import { listCharactersForNarratorCampaign } from "../../../lib/character/storage";
import {
  getCharacterRules,
  getCombatField,
  getCombatFlow,
  listProperties,
  normalizeTechnicalContentItem,
  type TechnicalContentItem,
} from "../../../lib/content";
import { listItemsEffective, listRunesEffective } from "../../../lib/campaignContent";
import {
  normalizeAttackCriticalRules,
  normalizeItemContent,
  normalizeReactionRules,
  type AttackCriticalRules,
  type CharacterRecord,
  type CharacterRulesPayload,
  type ItemContent,
  type ReactionRules,
} from "../../../lib/character";
import type { TableLogEntry } from "../../../lib/table";
import MesaClient from "./MesaClient";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ campaignId: string }>;
}

export default async function MesaPage({ params }: PageProps) {
  const { campaignId } = await params;
  const access = await resolveCampaignAccess(campaignId);
  if (access.kind !== "ok") return null; // layout já mostra o estado certo (login/não encontrada/sem acesso)

  const isNarrator = access.role === "narrator";

  let logs: TableLogEntry[] = [];
  try {
    logs = await listLogsForViewer(campaignId, {});
  } catch {
    // UI lida com log vazio.
  }

  let personagensAtivos: CharacterRecord[] = [];
  let regras: CharacterRulesPayload | null = null;
  let criticalRules: AttackCriticalRules = normalizeAttackCriticalRules(null);
  let items: ItemContent[] = [];
  let properties: TechnicalContentItem[] = [];
  let runes: TechnicalContentItem[] = [];
  let reactionRules: ReactionRules = normalizeReactionRules(null);

  if (isNarrator) {
    // Só o narrador usa "Resolver Ataque" — o jogador não precisa
    // destas listas (evita busca e payload desnecessários).
    try {
      const all = await listCharactersForNarratorCampaign(campaignId);
      personagensAtivos = all.filter((c) => !c.archived_at);
    } catch {
      personagensAtivos = [];
    }
    try {
      const doc = await getCharacterRules();
      regras = (doc?.payload as CharacterRulesPayload | undefined) ?? null;
    } catch {
      // "Resolver Ataque" segue sem avanço automático de Colapso.
    }
    try {
      const combatFlow = await getCombatField();
      criticalRules = normalizeAttackCriticalRules(combatFlow?.payload);
    } catch {
      // Sugestões críticas indisponíveis; ataque básico continua funcional.
    }
    try {
      const [itemDocs, propertyDocs, runeDocs] = await Promise.all([
        listItemsEffective(campaignId),
        listProperties(),
        listRunesEffective(campaignId),
      ]);
      items = itemDocs.map((doc) => normalizeItemContent(doc.payload as Record<string, unknown>));
      properties = propertyDocs.map((doc) => normalizeTechnicalContentItem(doc.payload as Record<string, unknown>));
      runes = runeDocs.map((doc) => normalizeTechnicalContentItem(doc.payload as Record<string, unknown>));
    } catch {
      // Sugestões críticas indisponíveis; ataque básico continua funcional.
    }
    try {
      const combatFlow = await getCombatFlow();
      reactionRules = normalizeReactionRules(combatFlow?.payload);
    } catch {
      // Fail-closed — Reação segue disponível pelo custo normal.
    }
  }

  return (
    <MesaClient
      campaign={access.campaign}
      isNarrator={isNarrator}
      logsIniciais={logs}
      personagensAtivosIniciais={personagensAtivos}
      regras={regras}
      criticalRules={criticalRules}
      items={items}
      properties={properties}
      runes={runes}
      reactionRules={reactionRules}
    />
  );
}
