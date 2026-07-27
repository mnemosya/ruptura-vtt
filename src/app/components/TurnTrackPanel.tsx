"use client";

/**
 * Painel da trilha de turnos (checkpoint pós-v0.94, PRD 6.2) —
 * componente compartilhado entre a mesa (visão completa + controles de
 * narrador) e a ficha (visão do próprio personagem + "Encerrar turno").
 * Renderiza só a partir do `Campaign.turn_track` já carregado pelo
 * chamador (Realtime de `campaigns` já propaga mudanças, ver
 * tableRealtime.ts) — nenhuma leitura própria.
 */

import { useState } from "react";
import type { Campaign } from "../../lib/table/types";
import { isParticipantTurnNow, type TurnParticipant } from "../../lib/table/turnTrack";
import {
  advanceTurnWindowToLenta,
  endOwnTurn,
  narratorAdvanceTurn,
  narratorOverrideTurn,
  startTurnRound,
} from "../../lib/table/turnTrackActions";

interface TurnTrackPanelProps {
  campaign: Campaign;
  onCampaignChange: (next: Campaign) => void;
  /** true = mostra os controles de narrador (iniciar rodada, avançar janela, avançar turno, override). */
  isNarrator: boolean;
  /** Personagem do jogador vendo este painel (ficha) — habilita "Encerrar turno" quando for a vez dele. Omitir na mesa. */
  viewerCharacterId?: string | null;
}

const sideLabel: Record<TurnParticipant["side"], string> = { pj: "PJ", pnj: "PNJ" };

export default function TurnTrackPanel({ campaign, onCampaignChange, isNarrator, viewerCharacterId }: TurnTrackPanelProps) {
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const turnTrack = campaign.turn_track;

  async function run(action: () => Promise<Campaign>) {
    setProcessing(true);
    setError(null);
    try {
      const next = await action();
      onCampaignChange(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao atualizar a trilha de turnos.");
    } finally {
      setProcessing(false);
    }
  }

  const currentCharacterId = turnTrack.window && turnTrack.currentIndex >= 0 ? turnTrack.order[turnTrack.currentIndex] : null;
  const currentParticipant = currentCharacterId ? turnTrack.participants.find((p) => p.characterId === currentCharacterId) : null;
  const viewerIsCurrent = viewerCharacterId ? isParticipantTurnNow(turnTrack, viewerCharacterId) : false;

  return (
    <section data-testid="turn-track-panel" style={{ marginBottom: 32, border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, padding: 16 }}>
      <h2 style={{ fontSize: 16, marginBottom: 8 }}>Trilha de turnos</h2>
      <p style={{ fontSize: 11, opacity: 0.5, marginBottom: 12 }}>
        Rodada {turnTrack.round} — janela {turnTrack.window === "rapida" ? "Rápidos (até 2 PA)" : turnTrack.window === "lenta" ? "Lentos (3+ PA)" : "não iniciada"}.
      </p>

      {error && <p style={{ color: "#ff6b6b", fontSize: 13, marginBottom: 8 }}>Erro: {error}</p>}

      {turnTrack.window && turnTrack.order.length > 0 && (
        <div data-testid="turn-track-order" style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
          {turnTrack.order.map((characterId) => {
            const participant = turnTrack.participants.find((p) => p.characterId === characterId);
            if (!participant) return null;
            const actedFlag = turnTrack.window === "rapida" ? participant.actedRapida : participant.actedLenta;
            const isCurrent = characterId === currentCharacterId;
            return (
              <span
                key={characterId}
                data-testid={`turn-track-participant-${characterId}`}
                style={{
                  fontSize: 12,
                  padding: "4px 8px",
                  borderRadius: 6,
                  border: isCurrent ? "2px solid #4caf50" : "1px solid rgba(255,255,255,0.2)",
                  opacity: actedFlag ? 0.5 : 1,
                  background: isCurrent ? "rgba(76,175,80,0.15)" : "transparent",
                }}
              >
                {participant.characterNome} ({sideLabel[participant.side]}){actedFlag ? " ✓" : ""}
              </span>
            );
          })}
        </div>
      )}

      {!turnTrack.window && <p style={{ fontSize: 13, opacity: 0.7 }}>Nenhuma rodada de turnos em andamento.</p>}

      {currentParticipant && (
        <p data-testid="turn-track-current" style={{ fontSize: 13, marginBottom: 12 }}>
          Turno atual: <strong>{currentParticipant.characterNome}</strong> ({sideLabel[currentParticipant.side]})
        </p>
      )}

      {viewerCharacterId && (
        <button
          data-testid="turn-track-end-own-turn"
          disabled={!viewerIsCurrent || processing}
          onClick={() => run(() => endOwnTurn(campaign.id, viewerCharacterId))}
          style={{
            padding: "6px 12px",
            borderRadius: 6,
            border: "1px solid rgba(255,255,255,0.3)",
            background: viewerIsCurrent ? "#4caf50" : "transparent",
            color: viewerIsCurrent ? "#0a0a0a" : "inherit",
            opacity: !viewerIsCurrent || processing ? 0.5 : 1,
            cursor: !viewerIsCurrent || processing ? "not-allowed" : "pointer",
          }}
        >
          Encerrar meu turno
        </button>
      )}

      {isNarrator && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: viewerCharacterId ? 12 : 0 }}>
          <button
            data-testid="turn-track-start-round"
            disabled={processing}
            onClick={() => run(() => startTurnRound(campaign.id))}
            style={{ padding: "6px 12px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.3)", opacity: processing ? 0.6 : 1 }}
          >
            Iniciar rodada (Rápidos)
          </button>
          <button
            data-testid="turn-track-advance-lenta"
            disabled={processing || turnTrack.window !== "rapida"}
            onClick={() => run(() => advanceTurnWindowToLenta(campaign.id))}
            style={{ padding: "6px 12px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.3)", opacity: processing || turnTrack.window !== "rapida" ? 0.6 : 1 }}
          >
            Avançar para Lentos
          </button>
          <button
            data-testid="turn-track-narrator-advance"
            disabled={processing || !turnTrack.window}
            onClick={() => run(() => narratorAdvanceTurn(campaign.id))}
            style={{ padding: "6px 12px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.3)", opacity: processing || !turnTrack.window ? 0.6 : 1 }}
            title="Avança o turno sem exigir que o personagem atual tenha agido."
          >
            Avançar turno (override)
          </button>
          {turnTrack.window && (
            <select
              data-testid="turn-track-override-select"
              disabled={processing}
              value=""
              onChange={(e) => {
                if (e.target.value) run(() => narratorOverrideTurn(campaign.id, e.target.value));
              }}
              style={{ padding: "6px 8px", borderRadius: 6 }}
            >
              <option value="">Devolver turno a…</option>
              {turnTrack.order.map((characterId) => {
                const participant = turnTrack.participants.find((p) => p.characterId === characterId);
                return participant ? (
                  <option key={characterId} value={characterId}>
                    {participant.characterNome}
                  </option>
                ) : null;
              })}
            </select>
          )}
        </div>
      )}
    </section>
  );
}
