"use client";

/**
 * A EVOLUÇÃO de um personagem já criado: a Forja de evolução em tela
 * cheia, por cima da ficha. Abre a partir do seletor de Ranking da ficha
 * com o Ranking alvo já escolhido; carrega os catálogos (Classe,
 * Subclasses, Perícias) e o ponto de partida (Ranking e valores atuais).
 */

import { useEffect, useRef, useState } from "react";
import { useCamada } from "../../../../../_design/camadas";
import { createPortal } from "react-dom";
import type { RankingV12 } from "../../../../../../lib/rulesetV12";
import { ForjaEvolucao } from "../../_forja/ForjaEvolucao";
import { VeuForja } from "../../_forja/VeuForja";
import { oxanium } from "../../../../../_design/oxanium";
import { lerCatalogosCriacaoV12Action, type CatalogosCriacaoV12 } from "../../_acoes/criacaoV12Actions";
import { lerPartidaEvolucaoV12Action, type PartidaEvolucaoV12 } from "../../_acoes/evolucaoV12Actions";
import "../../_forja/forja.css";

export function JanelaEvolucao({ campaignId, characterId, alvo, onFechar }: {
  /** Nulo: personagem sem campanha. */
  campaignId: string | null;
  characterId: string;
  alvo: RankingV12;
  onFechar: () => void;
}) {
  const [dados, setDados] = useState<{ catalogos: CatalogosCriacaoV12; partida: PartidaEvolucaoV12 } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [montado, setMontado] = useState(false);
  const raizRef = useRef<HTMLDivElement>(null);
  useEffect(() => { setMontado(true); }, []);

  useEffect(() => {
    let vivo = true;
    void Promise.all([lerCatalogosCriacaoV12Action(campaignId), lerPartidaEvolucaoV12Action(campaignId, characterId)]).then(([c, p]) => {
      if (!vivo) return;
      if (!c.ok || !c.dados) { setErro(c.erro ?? "Falha ao preparar a Forja."); return; }
      if (!p.ok || !p.dados) { setErro(p.erro ?? "Falha ao ler o personagem."); return; }
      setDados({ catalogos: c.dados, partida: p.dados });
    });
    return () => { vivo = false; };
  }, [campaignId, characterId]);

  // Esc fecha só enquanto carrega; com a Forja montada, o Esc segue
  // para ela (`undefined`). Tab contido na janela o tempo todo.
  useCamada({ aberta: montado, fechar: dados ? undefined : onFechar, raiz: raizRef, modal: true });

  if (!montado) return null;
  return createPortal(
    <div ref={raizRef} className="fj-janela" role="dialog" aria-modal="true" aria-label={`Evoluir até o Ranking ${alvo}`}>
      {dados ? (
        <ForjaEvolucao
          catalogos={dados.catalogos}
          campaignId={campaignId}
          characterId={characterId}
          nome={dados.partida.nome}
          classeSlug={dados.partida.classeSlug}
          partida={dados.partida.partida}
          alvo={alvo}
          onSair={onFechar}
          onConcluir={onFechar}
        />
      ) : erro ? (
        <div className={`fj-root ${oxanium.variable} fj-janela__carregando`}>
          <p role="alert">{erro} <button type="button" onClick={onFechar}>Voltar à ficha</button></p>
        </div>
      ) : null}
      {!erro && <VeuForja pronto={!!dados} />}
    </div>,
    document.body,
  );
}
