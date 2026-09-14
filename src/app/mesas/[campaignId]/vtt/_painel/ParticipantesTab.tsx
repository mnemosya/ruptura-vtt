"use client";

/**
 * Participantes — quem está na mesa, com dado REAL: `roster`,
 * `onlineUserIds` e `presenceSyncStatus` do
 * `CampaignRealtimeProvider`, mais os personagens controlados lidos de
 * `character_controllers` (`acoes/participantesPainel.ts`).
 *
 * A regra dura desta aba: presença tem QUATRO estados
 * (online/offline/conectando/indisponível), nunca um booleano. Um
 * `onlineUserIds` vazio porque o canal ainda não subiu não pode
 * aparecer como "todo mundo offline" — ver `participantesModelo.ts` e
 * o comentário do campo no provider.
 *
 * As operações administrativas (convidar, remover, atribuir controle)
 * continuam na área dedicada — aqui o atalho abre a MESMA gestão numa
 * JANELA INTERNA (`janelas/JanelasAdmin.tsx`), sem navegar: a página
 * `/mesas/[id]/jogadores-e-convites` segue existindo para o trabalho
 * fora de sessão.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ExternalLink, RefreshCw, Settings2, UserRound } from "lucide-react";
import { useCampaignSession } from "../../_shell/CampaignRealtimeProvider";
import { BotaoAba, LinhaDiretorio, RodapeAcoes } from "./Diretorio";
import { EstadoErro, EstadoIndisponivel, EstadoVazio } from "./Estados";
import { SecaoDossie } from "./ui/primitivas";
import {
  ROTULO_PRESENCA,
  contarOnline,
  montarLinhasParticipantes,
  presencaDisponivel,
  type ParticipanteLinha,
} from "./participantesModelo";
import { lerControlesParticipantesAction, type ControlesDeParticipantes } from "./acoes/participantesPainel";
import { iniciaisDe } from "./chatModelo";

export function ParticipantesTab({
  campaignId,
  visivel,
  ehNarrador,
  onAbrirConvites,
  onAbrirConsole,
  onAbrirJanela,
  fixtureVisual,
}: {
  campaignId: string;
  visivel: boolean;
  ehNarrador: boolean;
  /** Abre "Jogadores e convites" em janela interna — nunca navega. */
  onAbrirConvites: () => void;
  /** Abre a ficha de um personagem controlado, dentro do VTT. */
  onAbrirConsole?: (characterId: string) => void;
  /** Abre Participantes completo em JANELA INTERNA. `undefined` quando ESTA instância já é a janela. */
  onAbrirJanela?: () => void;
  /**
   * Controles prontos, só para a galeria visual em `/dev/estilos` —
   * nunca usado pela mesa real. Mesmo padrão do `dadosFixos` do
   * `CartaoTokenHover`: o roster e a presença vêm do contexto de
   * sessão, mas quem controla qual personagem vem do servidor, e sem
   * isso a aba mostraria só o erro de autorização.
   */
  fixtureVisual?: ControlesDeParticipantes;
}) {
  const { roster, onlineUserIds, presenceSyncStatus, reloadMembers, sessionError } = useCampaignSession();
  const [controles, setControles] = useState<ControlesDeParticipantes | null>(null);
  const [erroControles, setErroControles] = useState<string | null>(null);
  const jaCarregouRef = useRef(false);

  const carregarControles = useCallback(async () => {
    if (fixtureVisual) { setControles(fixtureVisual); setErroControles(null); return; }
    const r = await lerControlesParticipantesAction(campaignId);
    if (r.ok && r.dados) {
      setControles(r.dados);
      setErroControles(null);
    } else {
      setErroControles(r.erro ?? "Falha ao carregar os personagens dos participantes.");
    }
  }, [campaignId, fixtureVisual]);

  // Ao ABRIR a aba: relê roster (sem Realtime em `campaign_members`) e
  // os controles. Depois disso, o foco da janela é o outro gatilho —
  // os mesmos dois que o provider já usa.
  useEffect(() => {
    if (!visivel) return;
    jaCarregouRef.current = true;
    reloadMembers();
    carregarControles();
  }, [visivel, reloadMembers, carregarControles]);

  useEffect(() => {
    if (!visivel) return;
    function aoFocar() {
      reloadMembers();
      carregarControles();
    }
    window.addEventListener("focus", aoFocar);
    return () => window.removeEventListener("focus", aoFocar);
  }, [visivel, reloadMembers, carregarControles]);

  const linhas = useMemo(
    () =>
      montarLinhasParticipantes({
        roster,
        status: presenceSyncStatus,
        onlineUserIds,
        controlesPorUsuario: new Map(Object.entries(controles?.porUsuario ?? {})),
      }),
    [roster, presenceSyncStatus, onlineUserIds, controles],
  );

  const online = useMemo(() => contarOnline(roster, presenceSyncStatus, onlineUserIds), [roster, presenceSyncStatus, onlineUserIds]);

  // O contador da aba representa QUEM ESTÁ ONLINE — e só existe quando
  // a presença é confiável. Sem presença, a aba não mostra número

  const temPresenca = presencaDisponivel(presenceSyncStatus);

  const [selecionadoId, setSelecionadoId] = useState<string | null>(null);
  const selecionado = useMemo(() => linhas.find((p) => p.userId === selecionadoId) ?? null, [linhas, selecionadoId]);
  // Participante saiu da lista (roster mudou) — a seleção não pode
  // apontar pra ninguém.
  useEffect(() => {
    if (selecionadoId && !linhas.some((p) => p.userId === selecionadoId)) setSelecionadoId(null);
  }, [linhas, selecionadoId]);

  return (
    <div className="rv-pn-aba">
      {!temPresenca && (
        <EstadoIndisponivel testId="painel-participantes-presenca-indisponivel">
          {presenceSyncStatus === "connecting"
            ? "Conectando ao canal de presença — ainda não dá pra dizer quem está online."
            : "Presença indisponível agora. A lista de participantes continua correta."}
        </EstadoIndisponivel>
      )}
      {sessionError && (
        <EstadoErro mensagem={sessionError} onTentarDeNovo={() => reloadMembers()} testId="painel-participantes-erro-sessao" />
      )}
      {erroControles && (
        <EstadoErro mensagem={erroControles} onTentarDeNovo={carregarControles} testId="painel-participantes-erro-controles" />
      )}

      <div className="rv-pn-dossie" data-detalhe={selecionado ? "true" : undefined}>
        <div className="rv-pn-dossie-lista">
          {temPresenca && linhas.length > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "8px 10px", marginBottom: 8, borderRadius: 2, background: "#0c1420", border: "1px solid #16233a" }}>
              {(
                [
                  ["online", "Online", "var(--rv-ok)"],
                  ["conectando", "Conectando", "var(--rv-am)"],
                  ["indisponivel", "Indisponível", "var(--rv-am)"],
                  ["offline", "Offline", "#2a3b58"],
                ] as const
              )
                .filter(([estado]) => linhas.some((p) => p.presenca === estado))
                .map(([estado, rotulo, cor]) => (
                  <div key={estado} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: cor }} />
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em", color: cor }}>
                      {linhas.filter((p) => p.presenca === estado).length} {rotulo}
                    </span>
                  </div>
                ))}
            </div>
          )}
          <div className="rv-fg-lista-corpo" data-testid="painel-participantes-scroll" style={{ padding: 0 }}>
            {linhas.length === 0 ? (
              <EstadoVazio testId="painel-participantes-vazio">Nenhum participante encontrado nesta campanha.</EstadoVazio>
            ) : (
              <ul className="rv-pn-lista">
                {linhas.map((p) => (
                  <LinhaDiretorio
                    key={p.userId}
                    face={iniciaisDe(p.displayName)}
                    nome={p.displayName}
                    acento={p.role === "narrator" ? "var(--rv-am)" : "var(--rv-cy)"}
                    subtitulo={
                      <>
                        <span>{p.role === "narrator" ? "Narrador" : "Jogador"}</span>
                        {p.personagens.length > 0 && (
                          <span className="rv-pn-personagens" data-testid="painel-participantes-personagens">
                            {p.personagens.map((c) => c.nome).join(", ")}
                          </span>
                        )}
                      </>
                    }
                    marca={
                      temPresenca ? (
                        <span className="rv-pn-presenca" data-estado={p.presenca} title={ROTULO_PRESENCA[p.presenca]}>
                          <span className="rv-dot" data-on={p.presenca === "online"} aria-hidden="true" />
                          <span className="rv-sr-only">{ROTULO_PRESENCA[p.presenca]}</span>
                        </span>
                      ) : undefined
                    }
                    selecionado={selecionadoId === p.userId}
                    onAbrir={() => setSelecionadoId(p.userId)}
                    testId="painel-participantes-linha"
                    atributos={{ "data-papel": p.role, "data-presenca": p.presenca }}
                  />
                ))}
              </ul>
            )}
          </div>

          <RodapeAcoes>
            {onAbrirJanela && (
              <BotaoAba onClick={onAbrirJanela} testId="painel-participantes-abrir">
                <ExternalLink size={13} /> Abrir Participantes
              </BotaoAba>
            )}
            {ehNarrador && (
              <BotaoAba onClick={onAbrirConvites} testId="painel-participantes-admin">
                <Settings2 size={13} /> Jogadores e convites
              </BotaoAba>
            )}
            <BotaoAba
              onClick={() => {
                reloadMembers();
                carregarControles();
              }}
              testId="painel-participantes-atualizar"
            >
              <RefreshCw size={13} /> Atualizar
            </BotaoAba>
          </RodapeAcoes>
        </div>

        <div className="rv-pn-dossie-detalhe">
          {!selecionado && (
            <div className="rv-pn-dossie-vazio">
              <UserRound size={22} aria-hidden="true" style={{ opacity: 0.4 }} />
              <strong>Selecione um participante</strong>
              <span>Escolha alguém da lista para ver os detalhes.</span>
            </div>
          )}
          {selecionado && (() => {
            const acento = selecionado.role === "narrator" ? "var(--rv-am)" : "var(--rv-cy)";
            return (
              <div className="rv-fg-card" data-testid="painel-participantes-detalhe" style={{ "--fg-a": acento } as React.CSSProperties}>
                <div className="rv-fg-brackets" aria-hidden="true">
                  <span className="rv-fg-bk-tl" /><span className="rv-fg-bk-tr" /><span className="rv-fg-bk-bl" /><span className="rv-fg-bk-br" />
                </div>
                <div className="rv-fg-espinha">
                  <span className="rv-fg-espinha-topo">{iniciaisDe(selecionado.displayName)}</span>
                  <span className="rv-fg-espinha-rotulo">Player</span>
                  <span className="rv-fg-espinha-ponto" />
                </div>
                <div className="rv-fg-corpo">
                  <div className="rv-fg-cab">
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <button type="button" className="rv-pn-voltar" onClick={() => setSelecionadoId(null)} data-testid="painel-participantes-voltar" style={{ marginBottom: 8 }}>
                        <ArrowLeft size={13} /> Participantes
                      </button>
                      <h3 className="rv-pn-detalhe-titulo">{selecionado.displayName}</h3>
                      <div className="rv-pn-detalhe-sub"><i />{selecionado.role === "narrator" ? "Narrador" : "Jogador"}</div>
                    </div>
                    {selecionado.role === "narrator" && <span className="rv-fg-cab-selo">Narrador</span>}
                  </div>

                  <div className="rv-fg-scroll">
                    {temPresenca && (
                      <SecaoDossie n="01" titulo="Conexão">
                        <div className="rv-fg-statgrid" style={{ "--rv-fg-cols": 1 } as React.CSSProperties}>
                          <div className="rv-fg-statcell"><b>{ROTULO_PRESENCA[selecionado.presenca]}</b><span>Presença</span></div>
                        </div>
                      </SecaoDossie>
                    )}

                    <SecaoDossie n={temPresenca ? "02" : "01"} titulo="Personagens controlados">
                      {selecionado.personagens.length === 0 ? (
                        <EstadoVazio>Não controla nenhum personagem nesta campanha.</EstadoVazio>
                      ) : (
                        <ul className="rv-pn-lista">
                          {selecionado.personagens.map((c) => (
                            <LinhaDiretorio
                              key={c.id}
                              face={iniciaisDe(c.nome)}
                              nome={c.nome}
                              acento={acento}
                              onAbrir={onAbrirConsole ? () => onAbrirConsole(c.id) : undefined}
                              testId="painel-participantes-personagem-linha"
                              atributos={{ "data-character-id": c.id }}
                            />
                          ))}
                        </ul>
                      )}
                    </SecaoDossie>
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
      </div>
    </div>
  );
}
