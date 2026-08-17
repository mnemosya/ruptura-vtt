"use client";

/**
 * Painel de sessão — abas Log/Participantes, montado dentro da
 * superfície única `PainelSessao` (`CampaignShell.tsx`). Lê tudo do
 * `CampaignRealtimeProvider` via Context (`logs`, `roster`,
 * `reloadMembers`), nunca de props — mesma razão dos outros painéis
 * persistentes: é irmão de `{children}`, não descendente da página.
 *
 * "Log sempre visível" (Fase −1) foi interpretado como PERSISTENTE
 * ENTRE ROTAS, não necessariamente simultâneo ao roster — daí abas em
 * vez de duas colunas. O log nunca desaparece por causa de navegação,
 * só fica atrás da aba Participantes quando o usuário escolhe vê-la.
 *
 * Reaproveita `formatTableLogEntry` (já usado pela Ficha) — não duplica
 * a lógica de formatação por tipo de evento.
 */

import { useEffect, useRef, useState } from "react";
import { formatTableLogEntry } from "../../../dev/character-sheet/components/MesaTab";
import { useCampaignSession } from "./CampaignRealtimeProvider";
import { usePainelSessaoVisivel, usePainelSessaoBadge } from "./CampaignShell";

type Aba = "log" | "participantes";

function horaCurta(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

export function SessionPanel() {
  const { logs, roster, isNarrator, reloadLogs, reloadMembers, sessionError, sessionMountId, onlineUserIds, presenceSyncStatus } =
    useCampaignSession();
  // Só decora com online/offline quando o canal de fato sincronizou —
  // um `onlineUserIds` vazio por "ainda conectando"/"falhou" não pode
  // virar "todo mundo offline" na tela (Fase 3b, "nenhum estado
  // enganoso").
  const presencaDisponivel = presenceSyncStatus === "subscribed";
  const [aba, setAba] = useState<Aba>("log");
  const [naoLidos, setNaoLidos] = useState(0);
  const [temNovas, setTemNovas] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const ultimaContagemRef = useRef(logs.length);
  const noFimRef = useRef(true);

  // Visível de verdade — não só "aba selecionada é Log". No breakpoint
  // intermediário o drawer pode estar FECHADO com a aba interna ainda
  // em "log" (é o padrão), e nesse caso ninguém está vendo o log de
  // verdade: uma entrada nova precisa contar como não lida mesmo assim.
  const painelVisivel = usePainelSessaoVisivel();
  const estaVendoLog = aba === "log" && painelVisivel;

  // O badge de não lidos (abaixo, na aba) vive DENTRO da superfície que
  // fica `display: none` quando o drawer está fechado — sem isto, o
  // número certo existia mas nunca aparecia pra quem mais precisava
  // dele (achado de auditoria). Reporta pro botão "Sessão", que é
  // IRMÃO do painel e continua visível com o drawer fechado.
  const reportarBadge = usePainelSessaoBadge();
  useEffect(() => {
    reportarBadge(naoLidos);
  }, [naoLidos, reportarBadge]);

  // Autoscroll CONDICIONAL: só ancora no fim se o usuário já estava lá.
  // Se ele rolou pra cima pra ler algo, uma entrada nova não arranca o
  // scroll — em vez disso mostra "novas mensagens" (ver abaixo).
  useEffect(() => {
    // QUANTAS entraram, não "se entrou". Uma releitura de `logs` traz a
    // lista inteira de uma vez, então um refetch disparado depois de
    // várias mensagens (Realtime com debounce de 200ms agrupa; voltar
    // pra aba depois de um tempo traz um bloco) cresce em N, não em 1 —
    // somar `1` fixo subcontava tudo que não fosse mensagem isolada.
    const novas = logs.length - ultimaContagemRef.current;
    ultimaContagemRef.current = logs.length;
    if (novas <= 0) return;

    if (estaVendoLog && noFimRef.current) {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
    } else {
      setTemNovas(true);
    }

    // Contador de não lidos: só conta quando o log não está sendo olhado
    // de verdade (painel fechado, mesmo com a aba interna em "log", ou
    // aba diferente) — quem já está vendo não precisa contar de novo.
    if (!estaVendoLog) {
      setNaoLidos((n) => n + novas);
    }
  }, [logs.length, estaVendoLog]);

  // Zera não lidos quando o log passa a estar realmente visível — troca
  // de aba OU abertura do drawer com a aba já em "log" (o cenário que a
  // checagem antiga, presa a `aba === "log"`, não cobria).
  useEffect(() => {
    if (estaVendoLog) setNaoLidos(0);
  }, [estaVendoLog]);

  // Troca de aba é o gatilho "abrir a aba Participantes" da correção
  // #3 (recarregar roster) — dispara nas duas direções porque também é
  // barato e mantém o roster fresco mesmo se o usuário nunca sair do
  // Log. Ver a `reloadMembers` no efeito de foco da janela, no
  // provider, pro outro gatilho.
  useEffect(() => {
    reloadMembers();
  }, [aba, reloadMembers]);

  function aoRolar() {
    const el = scrollRef.current;
    if (!el) return;
    const distanciaDoFim = el.scrollHeight - el.scrollTop - el.clientHeight;
    noFimRef.current = distanciaDoFim < 24;
    if (noFimRef.current) setTemNovas(false);
  }

  function irParaOFim() {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    setTemNovas(false);
  }

  return (
    <div className="rm-session">
      {/* Marcador de "instância única" do provider (prova pedida pela
          auditoria da Fase 1) — invisível, só pra um browser check ler
          `data-mount-id` antes/depois de navegar entre rotas reais da
          campanha. Se esse valor mudar, o `CampaignRealtimeProvider`
          remontou silenciosamente. */}
      <span hidden data-testid="campshell-session-mount-id" data-mount-id={sessionMountId} />

      <div className="rm-session-tabs" role="tablist" aria-label="Painel de sessão">
        <button
          type="button"
          role="tab"
          aria-selected={aba === "log"}
          className="rm-session-tab"
          onClick={() => setAba("log")}
          data-testid="session-tab-log"
        >
          Log
          {naoLidos > 0 && (
            <span className="rm-session-tab-badge" data-testid="session-log-nao-lidos">
              {naoLidos}
            </span>
          )}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={aba === "participantes"}
          className="rm-session-tab"
          onClick={() => setAba("participantes")}
          data-testid="session-tab-participantes"
        >
          Participantes
        </button>
      </div>

      {sessionError && (
        <p className="rm-erro" role="alert">
          {sessionError}{" "}
          <button
            type="button"
            className="rm-session-tentar-de-novo"
            // `sessionError` é compartilhado (campanha/log/roster/viewer
            // podem gerá-lo) — tentar de novo recarrega os dois que este
            // painel mostra, não só o da aba ativa.
            onClick={() => {
              reloadLogs();
              reloadMembers();
            }}
            data-testid="session-tentar-de-novo"
          >
            Tentar de novo
          </button>
        </p>
      )}

      {aba === "log" ? (
        <div className="rm-session-body">
          <div className="rm-session-log" ref={scrollRef} onScroll={aoRolar} data-testid="session-log-scroll">
            {logs.length === 0 ? (
              <p className="rm-vazio">Nenhum evento nesta campanha ainda.</p>
            ) : (
              logs.map((entry) => (
                <div key={entry.id} className="rm-session-log-entry" data-visibility={entry.visibility} data-testid="session-log-entry">
                  <span className="rm-session-log-hora">{horaCurta(entry.created_at)}</span>
                  <span className="rm-session-log-texto">{formatTableLogEntry(entry)}</span>
                </div>
              ))
            )}
          </div>
          {temNovas && (
            <button type="button" className="rm-session-log-novas" onClick={irParaOFim} data-testid="session-log-novas-mensagens">
              ↓ Novas mensagens
            </button>
          )}
        </div>
      ) : (
        <div className="rm-session-body">
          <div className="rm-session-roster-head">
            <span className="rm-vazio">{isNarrator ? "Como narrador, você vê tudo (público, privado e de narrador)." : "Você vê os eventos públicos e os seus próprios."}</span>
            <button type="button" className="rm-session-roster-atualizar" onClick={() => reloadMembers()} data-testid="session-roster-atualizar">
              Atualizar
            </button>
          </div>
          {roster.length === 0 ? (
            <p className="rm-vazio">Nenhum participante encontrado.</p>
          ) : (
            <ul className="rm-session-roster" data-testid="session-roster-lista">
              {roster.map((p) => {
                const online = presencaDisponivel && onlineUserIds.has(p.userId);
                return (
                  <li
                    key={p.userId}
                    className="rm-session-roster-item"
                    data-role={p.role}
                    data-testid="session-roster-item"
                    // Sem atributo nenhum enquanto a presença não está
                    // disponível — `data-online="false"` afirmaria
                    // "offline" sem saber; ausência do atributo é o
                    // "não sei" honesto (nunca um `data-online="unknown"`
                    // decorado como se fosse um terceiro estado visual).
                    {...(presencaDisponivel ? { "data-online": online } : {})}
                  >
                    <span className="rm-session-roster-info">
                      {presencaDisponivel && (
                        <span className="rm-session-roster-dot" data-testid="session-roster-online-dot" aria-hidden="true" />
                      )}
                      <span className="rm-session-roster-nome">
                        {p.displayName}
                        {presencaDisponivel && <span className="rm-sr-only">{online ? " (online)" : " (offline)"}</span>}
                      </span>
                    </span>
                    <span className="rm-session-roster-papel">{p.role === "narrator" ? "Narrador" : "Jogador"}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
