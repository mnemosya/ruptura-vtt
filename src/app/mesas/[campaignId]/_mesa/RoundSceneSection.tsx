"use client";

/**
 * Rodada e cena — fonte canônica da campanha (Fase 3, divisão do
 * antigo MesaDetailClient.tsx monolítico). "Encerrar Rodada"/"Encerrar
 * Cena" são ferramentas privilegiadas do narrador (PRD §1.1) — o
 * jogador vê o contador em modo leitura, sem os botões. A autorização
 * real está no servidor (`campaigns_owner_update`, RLS): mesmo que
 * alguém chame a Server Action diretamente, sem ser dono da campanha a
 * escrita em `campaigns.current_round`/`current_scene` é rejeitada —
 * esta tela só evita mostrar um controle que falharia.
 */
import { useState } from "react";
import { endCampaignRound } from "../../../../lib/table/endRound";
import { buildCampaignEndRoundSummary } from "../../../../lib/table/endRoundSummary";
import { endCampaignScene } from "../../../../lib/table/endScene";
import { buildCampaignEndSceneSummary } from "../../../../lib/table/endSceneSummary";
import type { Campaign } from "../../../../lib/table";

export function RoundSceneSection({
  campaign,
  isNarrator,
  onCampaignChange,
  onAfterEnd,
}: {
  campaign: Campaign;
  isNarrator: boolean;
  onCampaignChange: (next: Campaign) => void;
  /** Recarrega logs/personagens após "Encerrar Rodada"/"Encerrar Cena" processarem efeitos. */
  onAfterEnd: () => unknown;
}) {
  const [error, setError] = useState<string | null>(null);
  const [endRoundProcessing, setEndRoundProcessing] = useState(false);
  const [endRoundSummary, setEndRoundSummary] = useState<string[] | null>(null);
  const [endSceneProcessing, setEndSceneProcessing] = useState(false);
  const [endSceneSummary, setEndSceneSummary] = useState<string[] | null>(null);

  async function handleEndRound() {
    setError(null);
    setEndRoundSummary(null);
    setEndRoundProcessing(true);
    try {
      const result = await endCampaignRound({ campaignId: campaign.id, expectedRound: campaign.current_round });
      onCampaignChange({ ...campaign, current_round: result.nextRound });
      setEndRoundSummary(buildCampaignEndRoundSummary(result));
      await onAfterEnd();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao encerrar rodada.");
    } finally {
      setEndRoundProcessing(false);
    }
  }

  async function handleEndScene() {
    setError(null);
    setEndSceneSummary(null);
    setEndSceneProcessing(true);
    try {
      const result = await endCampaignScene({ campaignId: campaign.id, expectedScene: campaign.current_scene });
      onCampaignChange({ ...campaign, current_scene: result.nextScene });
      setEndSceneSummary(buildCampaignEndSceneSummary(result));
      await onAfterEnd();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao encerrar cena.");
    } finally {
      setEndSceneProcessing(false);
    }
  }

  return (
    <section aria-labelledby="mesa-rodada-heading" style={{ marginBottom: 32 }}>
      <h2 id="mesa-rodada-heading" className="rm-section-title">Rodada e cena</h2>
      {isNarrator && (
        <p className="rm-faint" style={{ marginBottom: 12 }}>
          &quot;Encerrar Rodada&quot; processa todos os personagens vinculados (dano/testes de condição, renovação de
          PA/Reações). &quot;Encerrar Cena&quot; resolve Ruptura pendente, Integridade e Mana máxima de todos.
        </p>
      )}
      {error && <p role="alert" className="rm-erro" style={{ marginBottom: 12 }}>Erro: {error}</p>}
      <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
        <span data-testid="det-rodada-atual" style={{ fontSize: 13 }}>
          Rodada <strong>{campaign.current_round}</strong>
        </span>
        {isNarrator && (
          <button
            data-testid="det-encerrar-rodada"
            onClick={handleEndRound}
            disabled={endRoundProcessing}
            className="rm-btn rm-btn-primary rv-focusable"
          >
            {endRoundProcessing ? "Processando…" : "Encerrar Rodada"}
          </button>
        )}
        <span data-testid="det-cena-atual" style={{ fontSize: 13 }}>
          Cena <strong>{campaign.current_scene}</strong>
        </span>
        {isNarrator && (
          <button
            data-testid="det-encerrar-cena"
            onClick={handleEndScene}
            disabled={endSceneProcessing}
            className="rm-btn rm-btn-primary rv-focusable"
          >
            {endSceneProcessing ? "Processando…" : "Encerrar Cena"}
          </button>
        )}
      </div>
      {endRoundProcessing && (
        <p data-testid="det-encerrar-rodada-processando" style={{ fontSize: 12, opacity: 0.7, marginTop: 10 }}>
          Processando efeitos de fim de rodada…
        </p>
      )}
      {endRoundSummary && !endRoundProcessing && (
        <div data-testid="det-encerrar-rodada-resumo" style={{ fontSize: 12, marginTop: 10, display: "flex", flexDirection: "column", gap: 4 }}>
          {endRoundSummary.map((line, i) => <p key={i} style={{ opacity: 0.8, margin: 0 }}>{line}</p>)}
        </div>
      )}
      {endSceneProcessing && (
        <p data-testid="det-encerrar-cena-processando" style={{ fontSize: 12, opacity: 0.7, marginTop: 10 }}>
          Processando fim de cena…
        </p>
      )}
      {endSceneSummary && !endSceneProcessing && (
        <div data-testid="det-encerrar-cena-resumo" style={{ fontSize: 12, marginTop: 10, display: "flex", flexDirection: "column", gap: 4 }}>
          {endSceneSummary.map((line, i) => <p key={i} style={{ opacity: 0.8, margin: 0 }}>{line}</p>)}
        </div>
      )}
    </section>
  );
}
