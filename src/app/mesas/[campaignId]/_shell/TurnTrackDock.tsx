"use client";

/**
 * Dock do rastreador de turno — vive na casca da campanha
 * (`CampaignShell`), visível em QUALQUER rota, não só na Mesa.
 *
 * Passou a ler a trilha REAL do combate (`vtt_turn_tracks`, via
 * `ProvedorTrilhaDaMesa`) no lugar de `campaigns.turn_track`. Eram dois
 * sistemas: o VTT rodava o combate num, o dock mostrava o outro, e dava
 * pra ver os dois discordando na mesma tela — "Rodada 1 · sem janela
 * ativa" aqui enquanto os trilhos do mapa mostravam Rápidos na rodada 3.
 *
 * O QUE ELE FAZ E O QUE NÃO FAZ mudou junto, e de propósito:
 *
 *   · MOSTRA rodada, janela, quem age agora, quem o motor sugere como
 *     próximo, e destaca quando a vez é sua.
 *   · ENCERRA o seu turno — a única ação que não precisa do mapa.
 *   · NÃO monta combate. Escolher elenco, lado e modo exige os tokens
 *     da cena; isso mora na ferramenta Rodadas, no VTT. O dock leva
 *     você até lá em vez de oferecer um "Iniciar rodada" que teria que
 *     inventar um elenco.
 *   · NÃO avança o turno dos outros. Quem faz isso é o narrador, na
 *     ferramenta, olhando o tabuleiro.
 *
 * "É a minha vez" é decidido pelo SERVIDOR (`pode_controlar` na
 * projeção dos tokens), não por uma lista de ids no cliente.
 */

import Link from "next/link";
import { ROTULO_LADO } from "../vtt/_turnos/modelo";
import { useTrilhaDaMesa } from "./TrilhaDaMesa";
import { useCampaignSession } from "./CampaignRealtimeProvider";

export function TurnTrackDock() {
  const { campaign, isNarrator } = useCampaignSession();
  const trilha = useTrilhaDaMesa();

  // Enquanto a primeira leitura não volta, o dock não afirma nada — dizer
  // "sem combate" e se corrigir meio segundo depois é pior que esperar.
  if (!trilha || !trilha.carregada) return null;

  const { resumo, meuNaVez, ocupada, erro, temCena } = trilha;

  return (
    <div className="rm-turndock" data-testid="turndock-compacto">
      {erro && (
        <p className="rm-erro" role="alert">
          {erro}
        </p>
      )}

      {!resumo ? (
        <span className="rm-turndock-status" data-testid="turndock-status">
          Sem combate em andamento
        </span>
      ) : (
        <>
          <span className="rm-turndock-status" data-testid="turndock-status">
            Rodada {resumo.rodada} · {resumo.janela}
          </span>
          {resumo.agindo ? (
            <span className="rm-turndock-atual" data-testid="turndock-atual" data-sua-vez={meuNaVez !== null}>
              {meuNaVez ? "Sua vez — " : "Agora: "}
              <strong>{resumo.agindo.nome}</strong>
            </span>
          ) : (
            resumo.ladoDaVez && (
              <span className="rm-turndock-atual" data-testid="turndock-atual">
                Vez de <strong>{ROTULO_LADO[resumo.ladoDaVez]}</strong>
              </span>
            )
          )}
          {resumo.proximo && (
            <span className="rm-turndock-proximo" data-testid="turndock-proximo">
              Próximo: {resumo.proximo.nome}
            </span>
          )}
        </>
      )}

      {meuNaVez && (
        <button
          type="button"
          className="rm-turndock-acao"
          disabled={ocupada}
          onClick={() => void trilha.encerrarMeuTurno()}
          data-testid="turndock-encerrar-meu-turno"
        >
          Encerrar meu turno
        </button>
      )}

      {/* A ferramenta Rodadas é onde o combate se monta e se conduz.
          Pro narrador sem combate, este é o convite; com combate, é o
          caminho para conduzir. Jogador só vê quando há o que ver. */}
      {temCena && (isNarrator || resumo) && (
        <Link
          href={`/mesas/${campaign.id}/vtt`}
          className="rm-turndock-expandir"
          data-testid="turndock-abrir-rodadas"
        >
          {resumo ? "Ver no mapa" : "Montar combate"}
        </Link>
      )}
    </div>
  );
}
