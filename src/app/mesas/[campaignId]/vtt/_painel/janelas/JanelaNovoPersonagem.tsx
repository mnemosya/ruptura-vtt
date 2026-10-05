"use client";

/**
 * A CRIAÇÃO DE PERSONAGEM da mesa: a Forja de Refratário em tela cheia,
 * por cima do mapa.
 *
 * Substitui o assistente anterior (AssistenteV12): mesmas regras v1.2,
 * mesmo rascunho salvo na mesa, mesma conclusão no servidor. Selar abre
 * a ficha por cima e "Voltar à mesa" fecha.
 *
 * Diferente do "+ Personagem" da aba, que cria um personagem só com o
 * nome: aquilo é atalho de narrador montando a cena; isto é a criação
 * completa, de quem vai jogar com ele (ou o "completar" daquele atalho).
 */

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Forja } from "../../_forja/Forja";
import { oxanium } from "../../../../../_design/oxanium";
import { lerCatalogosCriacaoV12Action, type CatalogosCriacaoV12 } from "../../_acoes/criacaoV12Actions";
import type { PersonagemACompletar } from "../../_shell/JanelasDaMesa";
import "../../_forja/forja.css";
// A janela de recorte do avatar é a mesma da ficha, estilizada no Console.
import "../../../../../_design/console.css";

export function JanelaNovoPersonagem({
  campaignId,
  completar = null,
  onAbrirFicha,
  onFechar,
}: {
  /** Nulo: personagem sem campanha (página Personagens da conta). */
  campaignId: string | null;
  completar?: PersonagemACompletar | null;
  onAbrirFicha: (characterId: string) => void;
  onFechar: () => void;
}) {
  const [catalogos, setCatalogos] = useState<CatalogosCriacaoV12 | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [montado, setMontado] = useState(false);
  useEffect(() => { setMontado(true); }, []);

  useEffect(() => {
    let vivo = true;
    setErro(null);
    void lerCatalogosCriacaoV12Action(campaignId).then((r) => {
      if (!vivo) return;
      if (!r.ok || !r.dados) { setErro(r.erro ?? "Falha ao preparar a Forja."); return; }
      setCatalogos(r.dados);
    });
    return () => { vivo = false; };
  }, [campaignId]);

  // Esc fecha só enquanto a Forja ainda carrega; dentro dela, Esc é dos Códex.
  useEffect(() => {
    if (catalogos) return;
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onFechar(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [catalogos, onFechar]);

  if (!montado) return null;
  return createPortal(
    <div className="fj-janela" role="dialog" aria-modal="true" aria-label={completar ? `Completar ${completar.nome}` : "Forja de Refratário"} data-testid="painel-janela-novo-personagem">
      {catalogos ? (
        <Forja
          catalogos={catalogos}
          campaignId={campaignId ?? undefined}
          semCampanha={!campaignId}
          nomeMesa={catalogos.nomeMesa ?? (campaignId ? "Mesa" : "Sem campanha")}
          regiaoCampanha={catalogos.regiaoMesa ?? undefined}
          rankingInicial={catalogos.rankingMesa}
          completar={completar}
          onSair={onFechar}
          onConcluir={(id) => { onFechar(); onAbrirFicha(id); }}
        />
      ) : (
        <div className={`fj-root ${oxanium.variable} fj-janela__carregando`}>
          {erro ? <p role="alert">{erro} <button type="button" onClick={onFechar}>{campaignId ? "Voltar à mesa" : "Voltar"}</button></p> : <p>Preparando a Forja…</p>}
        </div>
      )}
    </div>,
    document.body,
  );
}
