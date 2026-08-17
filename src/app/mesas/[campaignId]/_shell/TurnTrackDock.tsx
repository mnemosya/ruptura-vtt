"use client";

/**
 * Dock persistente do rastreador de turno — vive na casca da campanha
 * (`CampaignShell`), visível em QUALQUER rota, não só na Mesa. Lê
 * `campaign`/`viewer`/`isNarrator` do `CampaignRealtimeProvider` via
 * Context, não de props — é irmão de `{children}`, não descendente da
 * página roteada, então não tem como receber isso por props de uma
 * página.
 *
 * Dois estados:
 *   - COMPACTO (padrão): rodada/janela, participante atual, próximo,
 *     indicação "sua vez" e UMA ação principal contextual.
 *   - EXPANDIDO: o `TurnTrackPanel` de sempre (`src/app/components/
 *     TurnTrackPanel.tsx`), SEM NENHUMA MUDANÇA — o mesmo componente
 *     que a Ficha usa, reaproveitado aqui como a apresentação "ver
 *     tudo". Nenhuma lógica de turno é duplicada: as ações vêm de
 *     `turnTrackActions.ts`, o cálculo de "é a minha vez" vem de
 *     `isParticipantTurnNow` — os mesmos que `TurnTrackPanel` já usa
 *     internamente.
 *
 * "É a minha vez" olha TODOS os personagens que o viewer controla
 * (`viewer.controlledCharacterIds`), não um id fixo — quem controla
 * vários pode ter qualquer um deles na vez. Só um pode estar "atual" a
 * qualquer momento, então não há ambiguidade real de "qual dos meus".
 */

import { useState } from "react";
import TurnTrackPanel from "../../../components/TurnTrackPanel";
import { isParticipantTurnNow, type TurnParticipant } from "../../../../lib/table/turnTrack";
import { endOwnTurn, narratorAdvanceTurn, startTurnRound } from "../../../../lib/table/turnTrackActions";
import type { Campaign } from "../../../../lib/table/types";
import { useCampaignSession } from "./CampaignRealtimeProvider";

export function TurnTrackDock() {
  const { campaign, setCampaign, isNarrator, viewer } = useCampaignSession();
  const [expandido, setExpandido] = useState(false);
  const [processando, setProcessando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const turnTrack = campaign.turn_track;
  const currentCharacterId = turnTrack.window && turnTrack.currentIndex >= 0 ? turnTrack.order[turnTrack.currentIndex] : null;
  const currentParticipant: TurnParticipant | null = currentCharacterId
    ? (turnTrack.participants.find((p) => p.characterId === currentCharacterId) ?? null)
    : null;
  const nextCharacterId =
    turnTrack.window && turnTrack.currentIndex >= 0 && turnTrack.order.length > 0
      ? turnTrack.order[(turnTrack.currentIndex + 1) % turnTrack.order.length]
      : null;
  const nextParticipant: TurnParticipant | null =
    nextCharacterId && nextCharacterId !== currentCharacterId
      ? (turnTrack.participants.find((p) => p.characterId === nextCharacterId) ?? null)
      : null;

  const meuPersonagemNaVez = currentCharacterId && viewer.controlledCharacterIds.includes(currentCharacterId) ? currentCharacterId : null;
  const souEuAgora = meuPersonagemNaVez ? isParticipantTurnNow(turnTrack, meuPersonagemNaVez) : false;

  async function run(action: () => Promise<Campaign>) {
    setProcessando(true);
    setErro(null);
    try {
      setCampaign(await action());
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao atualizar a trilha de turnos.");
    } finally {
      setProcessando(false);
    }
  }

  if (expandido) {
    return (
      <div className="rm-turndock rm-turndock--expandido" data-testid="turndock-expandido">
        <TurnTrackPanel campaign={campaign} onCampaignChange={setCampaign} isNarrator={isNarrator} viewerCharacterId={meuPersonagemNaVez} />
        <button type="button" className="rm-turndock-recolher" onClick={() => setExpandido(false)} data-testid="turndock-recolher">
          Recolher
        </button>
      </div>
    );
  }

  return (
    <div className="rm-turndock" data-testid="turndock-compacto">
      {erro && (
        <p className="rm-erro" role="alert">
          {erro}
        </p>
      )}

      {!turnTrack.window ? (
        <span className="rm-turndock-status" data-testid="turndock-status">
          Rodada {turnTrack.round} · sem janela ativa
        </span>
      ) : (
        <>
          <span className="rm-turndock-status" data-testid="turndock-status">
            Rodada {turnTrack.round} · {turnTrack.window === "rapida" ? "Rápidos" : "Lentos"}
          </span>
          {currentParticipant && (
            <span className="rm-turndock-atual" data-testid="turndock-atual" data-sua-vez={souEuAgora}>
              {souEuAgora ? "Sua vez — " : "Agora: "}
              <strong>{currentParticipant.characterNome}</strong>
            </span>
          )}
          {nextParticipant && (
            <span className="rm-turndock-proximo" data-testid="turndock-proximo">
              Próximo: {nextParticipant.characterNome}
            </span>
          )}
        </>
      )}

      {souEuAgora && meuPersonagemNaVez ? (
        <button
          type="button"
          className="rm-turndock-acao"
          disabled={processando}
          onClick={() => run(() => endOwnTurn(campaign.id, meuPersonagemNaVez))}
          data-testid="turndock-encerrar-meu-turno"
        >
          Encerrar meu turno
        </button>
      ) : isNarrator && !turnTrack.window ? (
        <button
          type="button"
          className="rm-turndock-acao"
          disabled={processando}
          onClick={() => run(() => startTurnRound(campaign.id))}
          data-testid="turndock-iniciar-rodada"
        >
          Iniciar rodada
        </button>
      ) : isNarrator && turnTrack.window ? (
        <button
          type="button"
          className="rm-turndock-acao"
          disabled={processando}
          onClick={() => run(() => narratorAdvanceTurn(campaign.id))}
          data-testid="turndock-avancar-turno"
        >
          Avançar turno
        </button>
      ) : null}

      <button type="button" className="rm-turndock-expandir" onClick={() => setExpandido(true)} data-testid="turndock-expandir">
        Expandir
      </button>
    </div>
  );
}
