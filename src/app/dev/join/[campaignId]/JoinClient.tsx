"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { listCampaignProfiles, enterCampaignProfile } from "../../../../lib/table/storage";
import { getOrCreateBrowserSessionId } from "../../../../lib/table/browserSession";
import { computeProfileStatus } from "../../../../lib/table/profileStatus";
import type { Campaign, CampaignProfile } from "../../../../lib/table";
import type { CharacterRecord } from "../../../../lib/character";

const buttonStyle: React.CSSProperties = {
  background: "#1d1e24",
  color: "inherit",
  border: "1px solid #333",
  borderRadius: 6,
  padding: "8px 14px",
  fontSize: 13,
  cursor: "pointer",
};

const STATUS_COLORS: Record<string, string> = {
  Livre: "#7fd99a",
  "Em uso por esta aba": "#5ec8ff",
  Expirado: "#ffb84f",
  "Em uso": "#ff6b6b",
};

interface Props {
  campaign: Campaign;
  perfisIniciais: CampaignProfile[];
  personagens: CharacterRecord[];
  /** "dev" = /dev/join/[campaignId] (id cru, inseguro); "invite" = /join/[token] (convite real). */
  variant?: "dev" | "invite";
  /** Id do convite (quando entrou por /join/[token]) — vincula a sessão de perfil ao convite. */
  inviteId?: string | null;
}

export default function JoinClient({ campaign, perfisIniciais, personagens, variant = "dev", inviteId = null }: Props) {
  const [perfis, setPerfis] = useState<CampaignProfile[]>(perfisIniciais);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [enteredProfileId, setEnteredProfileId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [nowTick, setNowTick] = useState(() => Date.now());

  useEffect(() => {
    setSessionId(getOrCreateBrowserSessionId());
  }, []);

  // Tick local (5s) só para recalcular "Expirado" comparando
  // last_seen_at com o relógio do navegador — não busca nada novo.
  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 5000);
    return () => clearInterval(id);
  }, []);

  // Se um perfil já está bloqueado por ESTA sessão (ex.: voltou a este
  // link depois de já ter entrado), reconhece automaticamente — não
  // precisa clicar "Entrar" de novo para liberar o botão "Abrir ficha".
  useEffect(() => {
    if (!sessionId || enteredProfileId) return;
    const meu = perfis.find((p) => p.lock_session_id === sessionId);
    if (meu) setEnteredProfileId(meu.id);
  }, [perfis, sessionId, enteredProfileId]);

  async function refreshPerfis() {
    try {
      setPerfis(await listCampaignProfiles(campaign.id));
    } catch {
      // Falha ao atualizar não deve esconder o resultado da ação atual.
    }
  }

  async function handleEnter(profileId: string) {
    if (!sessionId) return;
    setErrorMessage(null);
    try {
      const updated = await enterCampaignProfile(profileId, sessionId, inviteId);
      setPerfis((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
      setEnteredProfileId(updated.id);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Erro desconhecido ao entrar no perfil.");
    }
  }

  return (
    <main style={{ maxWidth: 640, margin: "0 auto", padding: "32px 20px 80px" }}>
      {variant === "dev" ? (
        <>
          <p style={{ opacity: 0.6, fontSize: 13, marginBottom: 4 }}>
            /dev/join/{campaign.id} — entrada DEV por link de mesa (id cru).
          </p>
          <p style={{ opacity: 0.5, fontSize: 11, marginBottom: 16 }}>
            Este link NÃO é um convite seguro: é literalmente o id da mesa em texto puro, sem token,
            sem expiração, sem revogação, sem autenticação. Prefira um convite real
            (/join/&lt;token&gt;, checkpoint v0.18). Além disso, a RLS está em modo de transição
            (policies dev_transition abertas), então nada aqui é protegido no banco ainda.
          </p>
        </>
      ) : (
        <>
          <p style={{ opacity: 0.6, fontSize: 13, marginBottom: 4 }}>Convite de mesa</p>
          <p style={{ opacity: 0.5, fontSize: 11, marginBottom: 16 }}>
            Você entrou por um link de convite com token (revogável). A RLS ainda está em modo de
            transição — a validação do token é feita server-side, mas o banco ainda tem policies
            dev abertas (ver checkpoint v0.17/v0.18).
          </p>
        </>
      )}

      <h1 style={{ fontSize: 22, marginBottom: 4 }}>{campaign.name}</h1>
      <p style={{ opacity: 0.5, fontSize: 11, marginBottom: 24, fontFamily: "monospace" }}>{campaign.id}</p>

      {errorMessage && (
        <p style={{ color: "#ff6b6b", fontSize: 13, marginBottom: 16 }}>Erro: {errorMessage}</p>
      )}

      <h2 style={{ fontSize: 14, textTransform: "uppercase", letterSpacing: 1, opacity: 0.6, marginBottom: 12 }}>
        Perfis ({perfis.length})
      </h2>
      {perfis.length === 0 && (
        <p style={{ fontSize: 13, opacity: 0.6 }}>
          Nenhum perfil criado ainda nesta mesa — peça ao narrador para criar um em /dev/table.
        </p>
      )}
      <div data-testid="join-perfis-lista" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {perfis.map((perfil) => {
          const status = computeProfileStatus(perfil, sessionId, nowTick);
          const personagemAtivo = personagens.find((p) => p.id === perfil.active_character_id);
          const jaEntrei = enteredProfileId === perfil.id;
          const podeEntrar = status === "Livre" || status === "Expirado" || status === "Em uso por esta aba";

          return (
            <div
              key={perfil.id}
              data-testid="join-perfil-entry"
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 8,
                background: "#1d1e24",
                borderRadius: 8,
                padding: "10px 14px",
                fontSize: 13,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                <div>
                  <span style={{ fontWeight: 600 }}>{perfil.nickname}</span>
                  <span
                    data-testid="join-perfil-status"
                    style={{ marginLeft: 10, fontSize: 11, color: STATUS_COLORS[status] ?? "inherit" }}
                  >
                    {status}
                  </span>
                </div>
                {!jaEntrei && (
                  <button
                    data-testid={`join-entrar-${perfil.id}`}
                    onClick={() => handleEnter(perfil.id)}
                    disabled={!podeEntrar || !sessionId}
                    style={{ ...buttonStyle, opacity: podeEntrar ? 1 : 0.5 }}
                  >
                    Entrar como perfil
                  </button>
                )}
              </div>
              <span style={{ fontSize: 11, opacity: 0.7 }}>
                Personagem ativo: {personagemAtivo ? personagemAtivo.name : "nenhum"}
              </span>
              {jaEntrei && (
                <Link
                  href={`/dev/character-sheet?campaignId=${campaign.id}&profileId=${perfil.id}`}
                  data-testid={`join-abrir-ficha-${perfil.id}`}
                  style={{ ...buttonStyle, textDecoration: "none", display: "inline-block", width: "fit-content" }}
                >
                  Abrir ficha
                </Link>
              )}
            </div>
          );
        })}
      </div>

      <button onClick={refreshPerfis} style={{ ...buttonStyle, marginTop: 16 }}>
        Atualizar perfis
      </button>
    </main>
  );
}
