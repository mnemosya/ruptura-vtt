/**
 * Detalhe de mesa no dashboard do narrador. Exige login E que o
 * narrador seja o dono da mesa. Reúne participantes, convites,
 * controles de personagem, personagens e log (visão de narrador = tudo)
 * da mesa.
 *
 * Fase 1 do plano de contas/campanhas/convites/personagens (revisão 4):
 * "perfis"/"sessões de perfil" (campaign_profiles/profile_sessions)
 * foram removidos por completo — substituídos por `campaign_members`
 * (participação) e `character_controllers` (controle de personagem).
 */

import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "../../../lib/auth/session";
import {
  getCampaign,
  listCampaignMembers,
  listCampaignInvites,
  listLogsForViewer,
} from "../../../lib/table/storage";
import {
  listCharactersForNarratorCampaign,
  listUnassignedCharactersForNarrator,
  listCharacterControllers,
  type CharacterController,
} from "../../../lib/character/storage";
import {
  getCharacterRules,
  getCombatField,
  getCombatFlow,
  listProperties,
  normalizeTechnicalContentItem,
  type TechnicalContentItem,
} from "../../../lib/content";
import { listItemsEffective, listRunesEffective } from "../../../lib/campaignContent";
import type { Campaign, CampaignMember, CampaignInvite, TableLogEntry } from "../../../lib/table";
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
import MesaDetailClient from "./MesaDetailClient";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ campaignId: string }>;
}

export default async function MesaDetailPage({ params }: PageProps) {
  const { campaignId } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  let campaign: Campaign | null = null;
  try {
    campaign = await getCampaign(campaignId);
  } catch {
    campaign = null;
  }

  if (!campaign) {
    return (
      <main style={{ maxWidth: 640, margin: "60px auto", padding: "0 20px" }}>
        <h1 style={{ fontSize: 20 }}>Mesa não encontrada</h1>
        <Link href="/mesas" style={{ color: "#5ec8ff", fontSize: 13 }}>← Minhas mesas</Link>
      </main>
    );
  }

  // Área de produto: só o dono acessa. Mesas legadas (owner_id null) não
  // pertencem a ninguém no dashboard — bloqueadas aqui (use /dev/table).
  if (campaign.owner_id !== user.id) {
    return (
      <main style={{ maxWidth: 640, margin: "60px auto", padding: "0 20px" }}>
        <h1 style={{ fontSize: 20 }}>Acesso negado</h1>
        <p style={{ fontSize: 13, opacity: 0.8 }}>Esta mesa não pertence à sua conta.</p>
        <Link href="/mesas" style={{ color: "#5ec8ff", fontSize: 13 }}>← Minhas mesas</Link>
      </main>
    );
  }

  let membros: CampaignMember[] = [];
  let convites: CampaignInvite[] = [];
  let controles: CharacterController[] = [];
  let logs: TableLogEntry[] = [];
  let personagensDaMesa: CharacterRecord[] = [];
  let personagensDisponiveis: CharacterRecord[] = [];
  // Regra canônica (checkpoint v0.52) — só usada para `colapso` no
  // "Resolver Ataque" (avanço por dano adicional da mesma dimensão);
  // falha aqui não deve travar o dashboard (ataque cai em fallback sem
  // avanço automático, ver `applyAttackDamage`).
  let regras: CharacterRulesPayload | null = null;
  let criticalRules: AttackCriticalRules = normalizeAttackCriticalRules(null);
  let items: ItemContent[] = [];
  let properties: TechnicalContentItem[] = [];
  let runes: TechnicalContentItem[] = [];
  // Regra de Reações (`combat_flow`, PRD 6.4) — mesma fonte usada por
  // `/dev/table` e pela ficha (`CharacterSheetView.tsx`). Fail-closed:
  // sem `combat_flow` válido, `normalizeReactionRules(null)` já
  // devolve `valid: false` e a defesa sem Reação fica indisponível,
  // sem travar o "Resolver Ataque" (a reação normal continua).
  let reactionRules: ReactionRules = normalizeReactionRules(null);
  try {
    const doc = await getCharacterRules();
    regras = (doc?.payload as CharacterRulesPayload | undefined) ?? null;
  } catch {
    // Segue sem regra — "Resolver Ataque" continua funcional, só sem avanço automático de Colapso.
  }
  try {
    const combatFlow = await getCombatFlow();
    reactionRules = normalizeReactionRules(combatFlow?.payload);
  } catch {
    // Fail-closed — Reação segue disponível pelo custo normal, só sem "defesa sem Reação".
  }
  try {
    const [combatFieldDoc, itemDocs, propertyDocs, runeDocs] = await Promise.all([
      getCombatField(),
      listItemsEffective(campaignId),
      listProperties(),
      listRunesEffective(campaignId),
    ]);
    criticalRules = normalizeAttackCriticalRules(combatFieldDoc?.payload);
    items = itemDocs.map((doc) => normalizeItemContent(doc.payload as Record<string, unknown>));
    properties = propertyDocs.map((doc) => normalizeTechnicalContentItem(doc.payload as Record<string, unknown>));
    runes = runeDocs.map((doc) => normalizeTechnicalContentItem(doc.payload as Record<string, unknown>));
  } catch {
    // Sugestões críticas ficam indisponíveis; o ataque básico continua funcional.
  }
  try {
    membros = await listCampaignMembers(campaignId);
    convites = await listCampaignInvites(campaignId);
    controles = await listCharacterControllers(campaignId);
    logs = await listLogsForViewer(campaignId, {}); // narrador dono → vê tudo
    personagensDaMesa = await listCharactersForNarratorCampaign(campaignId);
    // "Disponíveis para vincular": personagens legados/globais, sem mesa
    // ainda (checkpoint v0.23 — não trata characters como lista global
    // solta; só oferece linkar os que ainda não têm campaign_id).
    // v0.28: via client escopado do narrador, não mais a lista global dev.
    personagensDisponiveis = await listUnassignedCharactersForNarrator();
  } catch {
    // parcial: a UI lida com listas vazias
  }

  return (
    <div>
      <p style={{ maxWidth: 1180, margin: "12px auto 0", padding: "0 20px" }}>
        <Link href={`/mesas/${campaignId}/biblioteca`} style={{ color: "#5ec8ff", fontSize: 13 }}>
          Biblioteca da campanha (homebrew e overrides) →
        </Link>
      </p>
      <MesaDetailClient
        campaign={campaign}
        membrosIniciais={membros}
        convitesIniciais={convites}
        controlesIniciais={controles}
        logsIniciais={logs}
        personagensDaMesaIniciais={personagensDaMesa}
        personagensDisponiveisIniciais={personagensDisponiveis}
        regras={regras}
        criticalRules={criticalRules}
        items={items}
        properties={properties}
        runes={runes}
        reactionRules={reactionRules}
      />
    </div>
  );
}
