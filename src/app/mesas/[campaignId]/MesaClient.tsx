"use client";

/**
 * Mesa — área de entrada da sessão e do estado compartilhado da
 * campanha (aditivo §5.1). Fase 3: sucessora do antigo
 * MesaDetailClient.tsx monolítico (~1180 linhas, tela única
 * narrador-only) — dividida em seções coerentes (Rodada e cena,
 * Resolver Ataque, Log) e reutilizável por jogador E narrador. Gestão
 * de personagens/participantes/convites SAIU daqui: mora agora em
 * Personagens (`/mesas/[campaignId]/personagens`) e Jogadores e
 * convites (`/mesas/[campaignId]/jogadores-e-convites`) — nenhuma
 * função foi reimplementada, só reorganizada em áreas próprias.
 */
import { useState } from "react";
import { getCampaign, listLogsForViewer } from "../../../lib/table/storage";
import { listCharactersForNarratorCampaign } from "../../../lib/character/storage";
import { useCampaignRealtime } from "../../../lib/realtime/useCampaignRealtime";
import { describeRealtimeStatus, type RealtimeStatus } from "../../../lib/realtime/tableRealtime";
import type { Campaign, TableLogEntry } from "../../../lib/table";
import type { AttackCriticalRules, CharacterRecord, CharacterRulesPayload, ItemContent, ReactionRules } from "../../../lib/character";
import type { TechnicalContentItem } from "../../../lib/content";
import TurnTrackPanel from "../../components/TurnTrackPanel";
import { RoundSceneSection } from "./_mesa/RoundSceneSection";
import { AttackResolutionSection } from "./_mesa/AttackResolutionSection";
import { TableLogSection } from "./_mesa/TableLogSection";
import { btnGhost, text } from "./_shell/theme";

interface Props {
  campaign: Campaign;
  isNarrator: boolean;
  logsIniciais: TableLogEntry[];
  personagensAtivosIniciais: CharacterRecord[];
  regras: CharacterRulesPayload | null;
  criticalRules: AttackCriticalRules;
  items: ItemContent[];
  properties: TechnicalContentItem[];
  runes: TechnicalContentItem[];
  reactionRules: ReactionRules;
}

export default function MesaClient({
  campaign,
  isNarrator,
  logsIniciais,
  personagensAtivosIniciais,
  regras,
  criticalRules,
  items,
  properties,
  runes,
  reactionRules,
}: Props) {
  const [campaignState, setCampaignState] = useState(campaign);
  const [logs, setLogs] = useState(logsIniciais);
  const [personagensAtivos, setPersonagensAtivos] = useState(personagensAtivosIniciais);
  const [error, setError] = useState<string | null>(null);

  async function reloadLogs() {
    try {
      setLogs(await listLogsForViewer(campaign.id, {}));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao recarregar log.");
    }
  }

  async function reloadPersonagens() {
    if (!isNarrator) return;
    try {
      const all = await listCharactersForNarratorCampaign(campaign.id);
      setPersonagensAtivos(all.filter((c) => !c.archived_at));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao recarregar personagens.");
    }
  }

  async function reloadCampaign() {
    try {
      const updated = await getCampaign(campaign.id);
      if (updated) setCampaignState(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao recarregar mesa.");
    }
  }

  async function reloadAll() {
    await Promise.all([reloadCampaign(), reloadLogs(), reloadPersonagens()]);
  }

  const syncStatus: RealtimeStatus = useCampaignRealtime(campaign.id, {
    onCampaignChange: reloadCampaign,
    onCharactersChange: reloadPersonagens,
    onTableLogsChange: reloadLogs,
  });

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 24 }}>
        <span data-testid="mesa-sync-status" style={{ fontSize: 11, color: describeRealtimeStatus(syncStatus, "mesa").cor }}>
          ● {describeRealtimeStatus(syncStatus, "mesa").texto}
        </span>
        <button data-testid="mesa-recarregar" onClick={reloadAll} className="rv-btn rv-focusable" style={btnGhost}>
          Recarregar mesa
        </button>
      </div>

      {error && <p role="alert" style={{ color: "#ff6b6b", fontSize: 13, marginBottom: 16 }}>Erro: {error}</p>}

      <RoundSceneSection
        campaign={campaignState}
        isNarrator={isNarrator}
        onCampaignChange={setCampaignState}
        onAfterEnd={() => Promise.all([reloadLogs(), reloadPersonagens()])}
      />

      <div style={{ marginBottom: 32 }}>
        <h2 style={{ ...text.h2, marginBottom: 10 }}>Turnos</h2>
        <TurnTrackPanel campaign={campaignState} onCampaignChange={setCampaignState} isNarrator={isNarrator} />
      </div>

      {isNarrator && (
        <AttackResolutionSection
          campaignId={campaign.id}
          personagensAtivos={personagensAtivos}
          regras={regras}
          criticalRules={criticalRules}
          items={items}
          properties={properties}
          runes={runes}
          reactionRules={reactionRules}
          onAfterResolve={() => Promise.all([reloadPersonagens(), reloadLogs()])}
        />
      )}

      <TableLogSection logs={logs} isNarrator={isNarrator} onReload={reloadLogs} />
    </div>
  );
}
